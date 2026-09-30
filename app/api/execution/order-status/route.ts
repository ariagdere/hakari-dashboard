import { NextRequest, NextResponse } from 'next/server'
import { isBasicAuthConfigured, AUTH_NOT_CONFIGURED_MESSAGE } from '@/lib/authConfig'
import { isJsonRequest, isSameOrigin } from '@/lib/requestGuards'
import { CLIENT_ID_RE, PANEL_MAGIC, clientKeyOf } from '@/lib/panelOrder'
import { PanelOrderRef, findPanelEntryDeal, findPanelPosition } from '@/lib/metaapiTrade'
import { SUBMITTING_STALE_SECONDS, getIntentByKey, intentView, updateIntentSafe } from '@/lib/orderIntents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Sonucu belirsiz kalan panel emrinin (UNKNOWN / SUBMITTING) durumunu MT5'ten bulur: once acik
// pozisyonlar, yoksa islem gecmisi (pozisyon hemen kapanmis olabilir). Eslesme clientId ile;
// broker clientId'yi kaybettirdiyse yon + lot + zaman ile (tek aday varsa).
// Emir GONDERMEZ; yalnizca order_intents'i gunceller.

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  if (!isBasicAuthConfigured()) return new Response(AUTH_NOT_CONFIGURED_MESSAGE, { status: 503 })
  const origin = isSameOrigin(req)
  if (!origin.ok) return json(403, { error: `İstek dashboard dışından geldi (origin=${origin.origin ?? 'yok'}, host=${origin.host ?? 'yok'})` })
  if (!isJsonRequest(req)) return json(415, { error: 'Content-Type application/json olmalı' })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Geçersiz JSON' })
  }
  const clientId = body?.clientId
  if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) return json(400, { error: 'Geçersiz clientId' })
  const clientKey = clientKeyOf(clientId) as string

  let row: any
  try {
    row = await getIntentByKey(clientKey)
  } catch (err: any) {
    return json(500, { error: `Kayıt okunamadı: ${String(err?.message ?? err)}` })
  }
  // Kayit yoksa emir GONDERILMEDI (emir her zaman kayittan sonra gider). Istek hala yolda olabilir;
  // ayni clientId ile tekrar gondermek yine de guvenli (ikinci kez acilmaz).
  if (!row) return json(404, { notFound: true, error: 'Bu emir için sunucuda kayıt yok — gönderilmedi.' })
  if (row.status === 'FILLED' || row.status === 'REJECTED') return json(200, { intent: intentView(row), stopsAttached: null })

  const ref: PanelOrderRef = {
    clientKey,
    direction: row.direction,
    volume: Number(row.volume),
    magic: PANEL_MAGIC,
    since: new Date(row.submitted_at ?? row.created_at),
  }
  let found: { positionId: string; price: number; stopsAttached: boolean | null; matchedBy: 'clientId' | 'fallback' } | null = null
  try {
    const hit = await findPanelPosition(ref)
    if (hit) {
      found = {
        positionId: hit.position.id,
        price: hit.position.openPrice,
        stopsAttached: hit.position.stopLoss != null && hit.position.takeProfit != null,
        matchedBy: hit.matchedBy,
      }
    } else {
      const deal = await findPanelEntryDeal(ref)
      if (deal) found = { positionId: deal.positionId, price: deal.price, stopsAttached: null, matchedBy: deal.matchedBy }
    }
  } catch (err: any) {
    return json(502, { error: `MT5 okunamadı: ${String(err?.message ?? err)}` })
  }

  if (found) {
    await updateIntentSafe(
      `UPDATE order_intents SET status='FILLED', mt5_position_id=$1, fill_price=$2, completed_at=now(), updated_at=now()
        WHERE id=$3 AND status IN ('SUBMITTING','UNKNOWN')`,
      [found.positionId, found.price, row.id],
    )
    const refreshed = await getIntentByKey(clientKey).catch(() => null)
    const view = intentView(refreshed ?? { ...row, status: 'FILLED', mt5_position_id: found.positionId, fill_price: found.price })
    return json(200, { intent: view, stopsAttached: found.stopsAttached, matchedBy: found.matchedBy })
  }

  if (row.status === 'SUBMITTING') {
    const age = Date.now() - new Date(row.submitted_at ?? row.created_at).getTime()
    if (age > SUBMITTING_STALE_SECONDS * 1000) {
      await updateIntentSafe(
        `UPDATE order_intents SET status='UNKNOWN', error=COALESCE(error, $1), updated_at=now() WHERE id=$2 AND status='SUBMITTING'`,
        ['Emir sonucu kaydedilemedi (sunucu yarıda kaldı)', row.id],
      )
      row = { ...row, status: 'UNKNOWN' }
    }
  }
  return json(200, { intent: intentView(row), stopsAttached: null, positionFound: false })
}
