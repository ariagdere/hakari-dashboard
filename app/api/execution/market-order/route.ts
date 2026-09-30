import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { isBasicAuthConfigured, AUTH_NOT_CONFIGURED_MESSAGE } from '@/lib/authConfig'
import { isJsonRequest, isSameOrigin } from '@/lib/requestGuards'
import { getTradingConfig } from '@/lib/tradingConfig'
import { computeSizing, Direction, Sizing } from '@/lib/orderMath'
import { CLIENT_ID_RE, PANEL_MAGIC, clientKeyOf } from '@/lib/panelOrder'
import {
  SUBMITTING_STALE_SECONDS, UNRESOLVED_WINDOW_MINUTES, getIntentByKey, intentView, updateIntentSafe,
} from '@/lib/orderIntents'
import {
  FreshQuote, OpenPosition, PanelOrderRef, SymbolSpec,
  findPanelEntryDeal, findPanelPosition, getFreshQuote, getPosition, getSymbolSpec, sendMarketOrder, tradeErrorMessage,
} from '@/lib/metaapiTrade'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Panelden market emir.
//
// Sira: guvenlik -> govde -> ayni clientId daha once geldiyse DUR -> taze fiyatla sunucuda
// yeniden boyutlandir -> lot ekrandakiyle ayni degilse DUR (requote) -> kilit altinda: sonucu
// belirsiz baska emir varsa DUR (kullanici onaylamadiysa) + niyet kaydi (emirden ONCE) ->
// emir (mutlak SL/TP, tek istek) -> dolum detaylari.
// Belirsiz sonucta (zaman asimi / 5xx / tanimadigimiz kod) emir ASLA tekrar gonderilmez; pozisyon aranir.
//
// Emir GONDERILMEDEN donen her cevapta notSent: true var -- panel bunu gormedigi her cevabi
// (orn. Railway 502) "emir gitmis olabilir" diye ele alir.

const QUOTE_MAX_AGE_MS = 30_000
// Ayni anda iki emir islenmesin (iki sekme, cift tik): kontrol + niyet kaydi bu kilit altinda.
const PANEL_ORDER_LOCK = 91_000_001

function isPos(x: unknown): x is number {
  return typeof x === 'number' && !isNaN(x) && isFinite(x) && x > 0
}
const round2 = (x: number) => Math.round(x * 100) / 100
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const notSent = (status: number, body: Record<string, unknown>) => json(status, { ...body, notSent: true })
const hasDecimals = (x: number, digits: number) => Math.abs(x - Number(x.toFixed(digits))) > 1e-9

export async function POST(req: NextRequest) {
  // 1) Guvenlik
  if (!isBasicAuthConfigured()) return new Response(AUTH_NOT_CONFIGURED_MESSAGE, { status: 503 })
  const origin = isSameOrigin(req)
  if (!origin.ok) return notSent(403, { error: `İstek dashboard dışından geldi (origin=${origin.origin ?? 'yok'}, host=${origin.host ?? 'yok'})` })
  if (!isJsonRequest(req)) return notSent(415, { error: 'Content-Type application/json olmalı' })
  const trading = getTradingConfig()
  if (!trading.enabled) return notSent(403, { error: 'Emir gönderimi kapalı (Railway: TRADING_ENABLED=true)' })

  // 2) Govde
  let body: any
  try {
    body = await req.json()
  } catch {
    return notSent(400, { error: 'Geçersiz JSON' })
  }
  const clientId = body?.clientId
  const direction = body?.direction as Direction
  const strategyLabel = typeof body?.strategyLabel === 'string' ? body.strategyLabel.trim() : ''
  const sl = body?.sl
  const tp = body?.tp
  const riskUsd = body?.riskUsd
  const expectedVolume = body?.expectedVolume
  // Kullanicinin MT5'te kontrol edip "pozisyon yok" dedigi, sonucu belirsiz onceki emirler
  const acknowledge: string[] = Array.isArray(body?.acknowledgeClientIds)
    ? body.acknowledgeClientIds.filter((x: unknown) => typeof x === 'string' && CLIENT_ID_RE.test(x)).slice(0, 20)
    : []
  if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) return notSent(400, { error: 'Geçersiz clientId' })
  if (direction !== 'LONG' && direction !== 'SHORT') return notSent(400, { error: 'Yön LONG ya da SHORT olmalı' })
  if (!strategyLabel || strategyLabel.length > 64) return notSent(400, { error: 'Strateji etiketi gerekli (en fazla 64 karakter)' })
  if (![sl, tp, riskUsd, expectedVolume].every(isPos)) return notSent(400, { error: 'SL, TP, risk ve lot pozitif sayı olmalı' })
  if (riskUsd > trading.maxRiskUsd) return notSent(400, { error: `Risk üst sınırı $${trading.maxRiskUsd} (TRADING_MAX_RISK_USD)` })
  const clientKey = clientKeyOf(clientId) as string

  let quote: FreshQuote
  let spec: SymbolSpec
  let sizing: Sizing
  let intentId: number
  let submittedAt: Date
  try {
    // 3) Ayni emir daha once geldiyse (cift tik / tekrar deneme) ikinci kez GONDERME
    const existing = await getIntentByKey(clientKey)
    if (existing) return notSent(409, { duplicate: true, intent: intentView(existing) })

    // 4) Taze fiyat ve sembol bilgisiyle sunucuda yeniden boyutlandir
    try {
      ;[quote, spec] = await Promise.all([getFreshQuote(), getSymbolSpec()])
    } catch (err: any) {
      return notSent(502, { error: `Emir gönderilmedi: ${String(err?.message ?? err)}` })
    }
    if (hasDecimals(sl, spec.digits) || hasDecimals(tp, spec.digits)) {
      return notSent(400, { error: `SL/TP en fazla ${spec.digits} ondalık olabilir` })
    }
    const quoteAge = Date.now() - Date.parse(quote.time)
    if (!(quoteAge < QUOTE_MAX_AGE_MS)) {
      return notSent(409, { stale: true, error: `Fiyat ${Math.round(quoteAge / 1000)} sn eski — piyasa kapalı olabilir. Emir gönderilmedi.` })
    }
    sizing = computeSizing({ direction, bid: quote.bid, ask: quote.ask, sl, tp, riskUsd, spec, maxVolume: trading.maxVolume })
    if (!sizing.ok) return notSent(400, { error: `${sizing.error} — emir gönderilmedi`, sizing, quote })
    // Ekranda onaylanan lot degistiyse gonderme -- panel yeni hesabi gosterip tekrar onay ister.
    // Lot ayniysa asagi yuvarlama sayesinde gercek risk hedefi asmaz.
    if (sizing.volume !== expectedVolume) return notSent(409, { requote: true, sizing, quote })

    // 5) Kilit altinda: tekrar kontrolu, sonucu belirsiz baska emir, niyet kaydi (emir GONDERILMEDEN once;
    //    monitor strateji etiketini buradan okur).
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [PANEL_ORDER_LOCK])
      const dup = await client.query('SELECT * FROM order_intents WHERE client_key = $1', [clientKey])
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK')
        return notSent(409, { duplicate: true, intent: intentView(dup.rows[0]) })
      }
      const { rows: unresolved } = await client.query(
        `SELECT *, (status = 'SUBMITTING' AND COALESCE(submitted_at, created_at) > now() - make_interval(secs => $1)) AS in_flight
           FROM order_intents
          WHERE status IN ('SUBMITTING', 'UNKNOWN') AND acknowledged_at IS NULL
            AND created_at > now() - make_interval(mins => $2)
          ORDER BY created_at DESC`,
        [SUBMITTING_STALE_SECONDS, UNRESOLVED_WINDOW_MINUTES],
      )
      if (unresolved.length > 0) {
        const inFlight = unresolved.some((r) => r.in_flight)
        const acked = new Set(acknowledge)
        if (inFlight || !unresolved.every((r) => acked.has(r.client_id))) {
          await client.query('ROLLBACK')
          return notSent(409, { unresolved: true, inFlight, intents: unresolved.map(intentView) })
        }
        await client.query(
          `UPDATE order_intents SET acknowledged_at = now(), updated_at = now() WHERE id = ANY($1::bigint[])`,
          [unresolved.map((r) => r.id)],
        )
      }
      const ins = await client.query(
        `INSERT INTO order_intents
           (client_id, client_key, status, direction, strategy_label, risk_usd, volume, sl, tp, bid, ask,
            ref_price, expected_risk_usd, expected_reward_usd, submitted_at)
         VALUES ($1,$2,'SUBMITTING',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
         ON CONFLICT DO NOTHING
         RETURNING id, submitted_at`,
        [clientId, clientKey, direction, strategyLabel, riskUsd, sizing.volume, sl, tp, quote.bid, quote.ask,
          sizing.refPrice, sizing.riskUsd, sizing.rewardUsd],
      )
      if (ins.rows.length === 0) {
        await client.query('ROLLBACK')
        return notSent(409, { duplicate: true, intent: intentView(await getIntentByKey(clientKey)) })
      }
      await client.query('COMMIT')
      intentId = Number(ins.rows[0].id)
      submittedAt = new Date(ins.rows[0].submitted_at)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } catch (err: any) {
    // Buraya kadar emir GONDERILMEDI.
    const msg = String(err?.message ?? err)
    const hint = /order_intents|acknowledged_at/.test(msg) && /does not exist/.test(msg) ? ' — db/003_order_intents.sql çalıştırılmamış' : ''
    console.error('[market-order] emir oncesi hata:', msg)
    return notSent(500, { error: `Emir gönderilmedi: ${msg}${hint}` })
  }

  // 6) Emir -- mutlak SL/TP, tek istek
  const ref: PanelOrderRef = { clientKey, direction, volume: sizing.volume, magic: PANEL_MAGIC, since: new Date(Math.min(submittedAt.getTime(), Date.now())) }
  let outcome = await sendMarketOrder({ direction, volume: sizing.volume, sl, tp, clientId, magic: PANEL_MAGIC })
  console.log(`[market-order] ${clientId} ${direction} ${sizing.volume} lot SL=${sl} TP=${tp} -> ${outcome.kind}${'code' in outcome ? ` ${outcome.code}` : ''}`)

  let position: OpenPosition | null = null

  if (outcome.kind === 'rejected' && outcome.source === 'mt5') {
    // Kesin ret koduna ragmen son bir kontrol: pozisyon aciksa ret SAYMA (yanlis siniflandirmaya karsi).
    await sleep(800)
    try {
      const found = await findPanelPosition(ref)
      if (found) {
        console.error(`[market-order] ${clientId}: ${outcome.code} dondu ama pozisyon acik (#${found.position.id}) -- FILLED sayiliyor`)
        position = found.position
        outcome = { kind: 'executed', code: outcome.code, message: outcome.message, orderId: null, positionId: found.position.id, placedOnly: false }
      }
    } catch {
      // okunamadiysa ret koduna guven
    }
  }

  if (outcome.kind === 'rejected') {
    const msg = tradeErrorMessage(outcome.code, outcome.message)
    await updateIntentSafe(
      `UPDATE order_intents SET status='REJECTED', trade_code=$1, trade_message=$2, error=$3, completed_at=now(), updated_at=now() WHERE id=$4`,
      [outcome.code.slice(0, 40), outcome.message, msg, intentId],
    )
    return json(422, { status: 'REJECTED', error: `Emir reddedildi: ${msg}`, code: outcome.code })
  }

  let positionId = outcome.kind === 'executed' ? outcome.positionId : null
  const orderId = outcome.kind === 'executed' ? outcome.orderId : null
  const tradeCode = outcome.kind === 'executed' ? outcome.code : null
  let fillFromDeal: number | null = null

  // Belirsiz sonuc ya da "PLACED"/pozisyon kimligi olmayan basari: pozisyonu ara, emri ASLA tekrar gonderme.
  const mustLocate = outcome.kind === 'unknown' || (outcome.kind === 'executed' && (outcome.placedOnly || !outcome.positionId))
  if (mustLocate && !position) {
    for (const waitMs of [outcome.kind === 'unknown' ? 2000 : 500, 2000, 2500]) {
      await sleep(waitMs)
      try {
        const found = await findPanelPosition(ref)
        if (found) position = found.position
      } catch {
        // bir sonraki denemede
      }
      if (position) break
    }
    if (!position) {
      // Acilip hemen kapanmis olabilir (SL cok yakin): islem gecmisine bak
      try {
        const deal = await findPanelEntryDeal(ref)
        if (deal) {
          positionId = deal.positionId
          fillFromDeal = deal.price
        }
      } catch {
        // gecmis okunamadi
      }
    } else {
      positionId = position.id
    }
    if (!position && fillFromDeal == null && !(outcome.kind === 'executed' && !outcome.placedOnly)) {
      const why = outcome.kind === 'unknown' ? outcome.message : `${outcome.code}: emir kabul edildi ama pozisyon görünmüyor`
      await updateIntentSafe(
        `UPDATE order_intents SET status='UNKNOWN', trade_code=$1, error=$2, updated_at=now() WHERE id=$3 AND status='SUBMITTING'`,
        [tradeCode, why, intentId],
      )
      return json(202, {
        status: 'UNKNOWN',
        error: `${why}. Emir gitmiş olabilir — "Durumu kontrol et" ile bak ya da MT5'te kontrol et; aynı emri yeniden oluşturma.`,
      })
    }
  }

  // 7) Dolum detaylari -- pozisyon birkac yuz ms gec gorunebilir (en iyi caba)
  if (!position && positionId && fillFromDeal == null) {
    for (const waitMs of [0, 500, 1000]) {
      if (waitMs) await sleep(waitMs)
      try {
        position = await getPosition(positionId)
      } catch {
        // bir sonraki denemede
      }
      if (position) break
    }
  }
  const fillPrice = position?.openPrice ?? fillFromDeal
  const volume = position?.volume && position.volume > 0 ? position.volume : sizing.volume
  await updateIntentSafe(
    `UPDATE order_intents SET status='FILLED', mt5_order_id=$1, mt5_position_id=$2, fill_price=$3, trade_code=$4,
            completed_at=now(), updated_at=now()
      WHERE id=$5`,
    [orderId, positionId, fillPrice, tradeCode, intentId],
  )

  const finalSl = position ? position.stopLoss : sl
  const finalTp = position ? position.takeProfit : tp
  return json(200, {
    status: 'FILLED',
    positionId,
    orderId,
    volume,
    fillPrice,
    sl: finalSl,
    tp: finalTp,
    // Pozisyon okunabildiyse SL/TP gercekten bagli mi? (null = pozisyon okunamadi)
    stopsAttached: position ? position.stopLoss != null && position.takeProfit != null : null,
    refPrice: sizing.refPrice,
    // pozitif = aleyhe (LONG'da daha pahali, SHORT'ta daha ucuz dolum)
    slippageAdverse: fillPrice != null ? round2(direction === 'LONG' ? fillPrice - sizing.refPrice : sizing.refPrice - fillPrice) : null,
    expectedRiskUsd: sizing.riskUsd,
    actualRiskUsd: fillPrice != null && finalSl != null ? round2(Math.abs(fillPrice - finalSl) * volume * spec.contractSize) : null,
  })
}
