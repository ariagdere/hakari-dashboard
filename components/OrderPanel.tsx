'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { computeSizing, estimateDailySwapUsd, Direction } from '@/lib/orderMath'
import { newClientId } from '@/lib/panelOrder'

// /live emir paneli (Faz 2): market emir, yon + strateji + SL/TP + risk, canli ozet.
// Boyutlandirma lib/orderMath.ts'te -- sunucudaki emir route'u AYNI hesabi taze fiyatla tekrar
// yapar; lot ekrandakinden farkliysa emri gondermez ve panel yeni hesabi gosterir (requote).
//
// Cift emre karsi:
// - clientId kesin bir sonuca (doldu / reddedildi) kadar ayni kalir: cift tik, baglanti hatasi ya da
//   belirsiz sonuctan sonra tekrar gonderim ayni emri ikinci kez ACMAZ (sunucu 409 duplicate doner).
// - Panel kapatilinca DOM'dan kalkmaz (sayfa gizler), yarim kalan istek ve durumu kaybolmaz.
// - Sayfa yenilense bile sunucu, sonucu belirsiz baska bir emir varken yeni emri kullanici
//   onaylamadan gondermez (409 unresolved).

interface Quote {
  bid: number
  ask: number
  time: string
}

export interface OrderDraft {
  direction: Direction | null
  sl: number | null
  tp: number | null
}

interface ExecutionContext {
  trading: { enabled: boolean; maxRiskUsd: number; maxVolume: number }
  spec: {
    contractSize: number
    minVolume: number
    maxVolume: number
    volumeStep: number
    stopsLevel: number
    point: number
    swapMode: string | null
    swapLong: number | null
    swapShort: number | null
  } | null
  specError: string | null
}

interface IntentView {
  status: 'SUBMITTING' | 'FILLED' | 'REJECTED' | 'UNKNOWN'
  clientId: string
  direction: 'LONG' | 'SHORT'
  volume: number
  sl: number
  tp: number
  positionId: string | null
  fillPrice: number | null
  tradeCode: string | null
  error: string | null
  createdAt: string | null
}

interface FilledResult {
  positionId: string | null
  volume: number
  fillPrice: number | null
  sl: number | null
  tp: number | null
  slippageAdverse: number | null
  actualRiskUsd: number | null
  stopsAttached: boolean | null
  matchedByFallback: boolean
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  // ambiguous: bu panelin emri gitmis olabilir -- "Durumu kontrol et" ve (onayla) "Yeni emir"
  | { kind: 'notice'; tone: 'warn' | 'error'; message: string; ambiguous: boolean }
  // sonucu belirsiz BASKA bir emir var (baska sekme / sayfa yenilendi): once o kontrol edilmeli
  | { kind: 'unresolved'; message: string; intents: IntentView[]; inFlight: boolean }
  | { kind: 'filled'; result: FilledResult }

const RISK_PRESETS = [3, 5, 10]
const QUOTE_STALE_MS = 15_000

// Fiyat / tutar girisi: en fazla 2 ondalik (BTCUSD digits=2), binlik ayirici YOK -- "115,000"
// gibi bir giris 115 diye okunmasin diye reddedilir. Ondalik ayirici nokta ya da virgul.
function parseAmount(text: string): { value: number | null; invalid: boolean } {
  const t = text.trim()
  if (t === '') return { value: null, invalid: false }
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(t)) return { value: null, invalid: true }
  const v = Number(t.replace(',', '.'))
  return isFinite(v) && v > 0 ? { value: v, invalid: false } : { value: null, invalid: true }
}

// Hata cevaplari bazen duz metin (orn. 503 auth ayari, Railway 502) -- ikisini de oku.
async function readBody(res: Response): Promise<any> {
  const text = await res.text().catch(() => '')
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { error: text.slice(0, 300) || undefined }
  }
}

function filledFromIntent(intent: IntentView, stopsAttached: boolean | null, matchedByFallback = false): FilledResult {
  return {
    positionId: intent.positionId ?? null,
    volume: Number(intent.volume),
    fillPrice: intent.fillPrice ?? null,
    sl: intent.sl ?? null,
    tp: intent.tp ?? null,
    slippageAdverse: null,
    actualRiskUsd: null,
    stopsAttached,
    matchedByFallback,
  }
}

const money = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`
const price2 = (v: number | null | undefined) => (v != null ? v.toFixed(2) : '—')
const intentLine = (i: IntentView) => {
  const mins = i.createdAt ? Math.max(0, Math.round((Date.now() - Date.parse(i.createdAt)) / 60000)) : null
  return `${i.direction} ${i.volume} lot · SL ${price2(i.sl)} / TP ${price2(i.tp)} · ${i.status}${mins != null ? ` · ${mins} dk önce` : ''}`
}

interface Props {
  quote: Quote | null
  labels: string[]
  hidden?: boolean
  onClose: () => void
  onDraftChange: (draft: OrderDraft) => void
}

export default function OrderPanel({ quote, labels, hidden, onClose, onDraftChange }: Props) {
  const [ctx, setCtx] = useState<ExecutionContext | null>(null)
  const [ctxError, setCtxError] = useState<string | null>(null)
  const [direction, setDirection] = useState<Direction | null>(null)
  const [label, setLabel] = useState('')
  const [slText, setSlText] = useState('')
  const [tpText, setTpText] = useState('')
  const [riskChoice, setRiskChoice] = useState<number | 'custom'>(5)
  const [customRisk, setCustomRisk] = useState('')
  const [clientId, setClientId] = useState(() => newClientId())
  // Kullanicinin MT5'te kontrol edip "pozisyon yok" diye onayladigi, sonucu belirsiz emirler.
  // Bir sonraki gonderimde sunucuya bildirilir; sunucu bunlari onaylandi olarak isaretler.
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' })
  // Fiyatin ne zaman GELDIGI (istemci saati) -- bayatlik kontrolu cihaz saatinin kaymasindan etkilenmesin.
  const [quoteReceivedAt, setQuoteReceivedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    fetch('/api/execution/context', { cache: 'no-store' })
      .then(async (res) => {
        const data = await readBody(res)
        if (!active) return
        if (!res.ok || !data?.trading) setCtxError(data?.error || `Emir ayarları alınamadı (HTTP ${res.status})`)
        else setCtx(data)
      })
      .catch(() => {
        if (active) setCtxError('Emir ayarları alınamadı')
      })
    return () => {
      active = false
    }
  }, [])

  // Bayatlik, fiyatin ZAMANI degistiginde sifirlanir: yedek REST yolu ayni (eski) fiyati tekrar
  // tekrar dondururse taze sayilmaz. Sunucu da emirden once fiyat yasini ayrica kontrol eder.
  const quoteTime = quote?.time ?? null
  useEffect(() => {
    if (quoteTime) setQuoteReceivedAt(Date.now())
  }, [quoteTime])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const slInput = parseAmount(slText)
  const tpInput = parseAmount(tpText)
  const riskInput = riskChoice === 'custom' ? parseAmount(customRisk) : { value: riskChoice, invalid: false }
  const sl = slInput.value
  const tp = tpInput.value
  const riskUsd = riskInput.value

  // Grafikteki SL/TP cizgileri
  useEffect(() => {
    onDraftChange({ direction, sl, tp })
  }, [direction, sl, tp, onDraftChange])
  useEffect(() => () => onDraftChange({ direction: null, sl: null, tp: null }), [onDraftChange])

  const sizing = useMemo(() => {
    if (!ctx?.spec || !quote || !direction) return null
    return computeSizing({
      direction,
      bid: quote.bid,
      ask: quote.ask,
      sl: sl ?? NaN,
      tp: tp ?? NaN,
      riskUsd: riskUsd ?? NaN,
      spec: ctx.spec,
      maxVolume: ctx.trading.maxVolume,
    })
  }, [ctx, quote, direction, sl, tp, riskUsd])

  const quoteStale = quoteReceivedAt == null || now - quoteReceivedAt > QUOTE_STALE_MS
  const riskOverLimit = ctx != null && riskUsd != null && riskUsd > ctx.trading.maxRiskUsd
  const swap =
    sizing?.ok && ctx?.spec && direction
      ? estimateDailySwapUsd(direction, sizing.refPrice, sizing.volume, {
          contractSize: ctx.spec.contractSize,
          swapMode: ctx.spec.swapMode ?? undefined,
          swapLong: ctx.spec.swapLong ?? undefined,
          swapShort: ctx.spec.swapShort ?? undefined,
        })
      : null
  const busy = submit.kind === 'busy'
  const locked = busy || submit.kind === 'filled'
  const canSubmit =
    !!ctx?.trading.enabled && !!sizing?.ok && label.trim().length > 0 && !quoteStale && !riskOverLimit && !locked

  // Gonderimi engelleyen ilk sebep (emir kapaliysa ayrica ustte uyari var; hesap yine gosterilir)
  let blocker: string | null = null
  if (ctxError) blocker = ctxError
  else if (!ctx) blocker = 'Emir ayarları yükleniyor…'
  else if (!ctx.spec) blocker = ctx.specError ?? 'Sembol bilgisi alınamadı'
  else if (!quote) blocker = 'Fiyat bekleniyor…'
  else if (quoteStale) blocker = 'Fiyat akışı durdu — piyasa kapalı olabilir'
  else if (slInput.invalid) blocker = 'SL geçersiz — örn. 114250.5 (binlik ayırıcı yok, en fazla 2 ondalık)'
  else if (tpInput.invalid) blocker = 'TP geçersiz — örn. 118400 (binlik ayırıcı yok, en fazla 2 ondalık)'
  else if (riskInput.invalid) blocker = 'Risk geçersiz — örn. 7.5'
  else if (riskOverLimit) blocker = `Risk üst sınırı $${ctx.trading.maxRiskUsd} (TRADING_MAX_RISK_USD)`
  else if (!direction) blocker = 'Yön seç'
  else if (sizing && !sizing.ok) blocker = sizing.error
  else if (!label.trim()) blocker = 'Strateji etiketi seç ya da yaz'

  function applyIntent(intent: IntentView | null, stopsAttached: boolean | null, matchedByFallback = false) {
    const status = intent?.status
    if (intent && status === 'FILLED') {
      setSubmit({ kind: 'filled', result: filledFromIntent(intent, stopsAttached, matchedByFallback) })
    } else if (status === 'REJECTED') {
      // Kesin sonuc: duzeltip tekrar gondermek icin yeni kimlik
      setClientId(newClientId())
      setSubmit({ kind: 'notice', tone: 'error', ambiguous: false, message: `Emir reddedilmişti: ${intent?.error ?? intent?.tradeCode ?? 'bilinmeyen sebep'}` })
    } else if (status === 'SUBMITTING') {
      setSubmit({ kind: 'notice', tone: 'warn', ambiguous: true, message: 'Emir hâlâ işleniyor — birkaç saniye sonra durumu tekrar kontrol et.' })
    } else {
      setSubmit({
        kind: 'notice',
        tone: 'warn',
        ambiguous: true,
        message: "Emrin sonucu belirsiz ve MT5'te bu emirle açılmış pozisyon bulunamadı. MT5'te de yoksa \"Yeni emir\" ile tekrar deneyebilirsin.",
      })
    }
  }

  async function submitOrder(extraAck: string[] = []) {
    if (!canSubmit || !sizing || !direction) return
    setSubmit({ kind: 'busy', label: 'Gönderiliyor…' })
    const ack = Array.from(new Set([...acknowledged, ...extraAck]))
    let res: Response
    try {
      res = await fetch('/api/execution/market-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, direction, strategyLabel: label.trim(), sl, tp, riskUsd, expectedVolume: sizing.volume, acknowledgeClientIds: ack,
        }),
      })
    } catch {
      setSubmit({
        kind: 'notice',
        tone: 'error',
        ambiguous: true,
        message: 'Bağlantı koptu — emir gitmiş olabilir. "Durumu kontrol et" ile bak. Tekrar göndermek de güvenli: aynı emir ikinci kez açılmaz.',
      })
      return
    }
    const data = await readBody(res)
    // Sunucu bu istegi islediyse onaylar kullanildi (ya da gecersiz); bir dahakine tekrar gonderme.
    if ([200, 202, 422].includes(res.status) || (res.status === 409 && data?.duplicate)) setAcknowledged([])

    if (res.status === 200 && data?.status === 'FILLED') {
      setSubmit({
        kind: 'filled',
        result: {
          positionId: data.positionId ?? null,
          volume: Number(data.volume),
          fillPrice: data.fillPrice ?? null,
          sl: data.sl ?? null,
          tp: data.tp ?? null,
          slippageAdverse: data.slippageAdverse ?? null,
          actualRiskUsd: data.actualRiskUsd ?? null,
          stopsAttached: typeof data.stopsAttached === 'boolean' ? data.stopsAttached : null,
          matchedByFallback: false,
        },
      })
      return
    }
    if (res.status === 409 && data?.duplicate) {
      applyIntent(data.intent ?? null, null)
      return
    }
    if (res.status === 409 && data?.unresolved) {
      const intents: IntentView[] = Array.isArray(data.intents) ? data.intents : []
      setSubmit({
        kind: 'unresolved',
        inFlight: !!data.inFlight,
        intents,
        message: data.inFlight
          ? 'Önceki bir emir hâlâ işleniyor — yeni emir gönderilmedi. Birkaç saniye sonra kontrol et.'
          : 'Sonucu belirsiz bir önceki emir var — iki pozisyon açılmasın diye yeni emir gönderilmedi. Önce onu kontrol et.',
      })
      return
    }
    if (res.status === 409 && data?.requote) {
      setSubmit({
        kind: 'notice',
        tone: 'warn',
        ambiguous: false,
        message: `Fiyat değişti, lot ${data.sizing?.volume ?? '?'} oldu — emir gönderilmedi. Özet güncellendi; kontrol edip tekrar gönder.`,
      })
      return
    }
    if (res.status === 202) {
      setSubmit({ kind: 'notice', tone: 'warn', ambiguous: true, message: data?.error || "Emrin sonucu belirsiz — MT5'te kontrol et." })
      return
    }
    if (res.status === 422) {
      setClientId(newClientId()) // reddedildi: kesin sonuc
      setSubmit({ kind: 'notice', tone: 'error', ambiguous: false, message: data?.error || 'Emir reddedildi' })
      return
    }
    if (data?.notSent) {
      setSubmit({ kind: 'notice', tone: 'error', ambiguous: false, message: data.error || `Emir gönderilmedi (HTTP ${res.status})` })
      return
    }
    // Tanimadigimiz cevap (orn. Railway 502): istek sunucuya ulasip emir gitmis olabilir.
    setSubmit({
      kind: 'notice',
      tone: 'error',
      ambiguous: true,
      message: `Beklenmeyen yanıt (HTTP ${res.status}${data?.error ? `: ${String(data.error).slice(0, 120)}` : ''}) — emir gitmiş olabilir. "Durumu kontrol et" ile bak.`,
    })
  }

  // Tek bir emrin durumu (sunucu MT5'te arar). null: istek basarisiz.
  async function fetchStatus(id: string): Promise<{ status: number; data: any } | null> {
    try {
      const res = await fetch('/api/execution/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
      })
      return { status: res.status, data: await readBody(res) }
    } catch {
      return null
    }
  }

  async function checkStatus() {
    setSubmit({ kind: 'busy', label: 'Kontrol ediliyor…' })
    const r = await fetchStatus(clientId)
    if (!r) {
      setSubmit({ kind: 'notice', tone: 'error', ambiguous: true, message: 'Bağlantı hatası — durum alınamadı.' })
    } else if (r.status === 404) {
      setSubmit({
        kind: 'notice',
        tone: 'warn',
        ambiguous: false,
        message: 'Bu emir için sunucuda kayıt yok — gönderilmedi. Tekrar göndermek güvenli: aynı emir ikinci kez açılmaz.',
      })
    } else if (r.status !== 200) {
      setSubmit({ kind: 'notice', tone: 'error', ambiguous: true, message: r.data?.error || `Durum alınamadı (HTTP ${r.status})` })
    } else {
      applyIntent(r.data.intent ?? null, typeof r.data.stopsAttached === 'boolean' ? r.data.stopsAttached : null, r.data.matchedBy === 'fallback')
    }
  }

  // Baska bir (sonucu belirsiz) emrin durumunu kontrol et
  async function checkUnresolved(intents: IntentView[]) {
    setSubmit({ kind: 'busy', label: 'Kontrol ediliyor…' })
    const remaining: IntentView[] = []
    const notes: string[] = []
    for (const it of intents) {
      const r = await fetchStatus(it.clientId)
      const view: IntentView | null = r && r.status === 200 ? r.data.intent : null
      if (view && view.status === 'FILLED') notes.push(`önceki emir DOLMUŞ — pozisyon #${view.positionId ?? '?'} açık`)
      else if (view && view.status === 'REJECTED') notes.push('önceki emir reddedilmiş')
      else remaining.push(view ?? it)
    }
    if (remaining.length === 0) {
      setSubmit({
        kind: 'notice',
        tone: 'warn',
        ambiguous: false,
        message: `Kontrol edildi: ${notes.join('; ')}. Yeni emir ayrı bir pozisyon açar; istiyorsan tekrar gönder.`,
      })
    } else {
      const inFlight = remaining.some((i) => i.status === 'SUBMITTING')
      setSubmit({
        kind: 'unresolved',
        inFlight,
        intents: remaining,
        message: inFlight
          ? 'Önceki emir hâlâ işleniyor — birkaç saniye sonra tekrar kontrol et.'
          : "Önceki emirle açılmış pozisyon MT5'te bulunamadı. MT5'te de yoksa \"Yine de gönder\" ile devam edebilirsin.",
      })
    }
  }

  function sendAnyway(intents: IntentView[]) {
    if (!window.confirm("MT5'te önceki emirle açılmış bir pozisyon olmadığını kontrol ettin mi? Emin değilsen İptal'e bas.")) return
    const ids = intents.map((i) => i.clientId)
    setAcknowledged((prev) => Array.from(new Set([...prev, ...ids])))
    submitOrder(ids)
  }

  function newOrder(afterAmbiguous: boolean) {
    if (afterAmbiguous) {
      if (!window.confirm("MT5'te bu emirle açılmış bir pozisyon olmadığını kontrol ettin mi? Yeni emir ayrı bir pozisyon açar.")) return
      const previous = clientId
      setAcknowledged((prev) => Array.from(new Set([...prev, previous])))
    }
    setClientId(newClientId())
    setSubmit({ kind: 'idle' })
    if (!afterAmbiguous) {
      setSlText('')
      setTpText('')
    }
  }

  const dirColor = direction === 'LONG' ? 'var(--green)' : direction === 'SHORT' ? 'var(--red)' : 'var(--text-3)'
  const row = (k: string, v: ReactNode, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
      <span style={{ color: 'var(--text-3)' }}>{k}</span>
      <span style={{ color: color ?? 'var(--text)', textAlign: 'right' }}>{v}</span>
    </div>
  )
  const inputStyle: CSSProperties = {
    width: '100%',
    background: 'var(--bg-3)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text)',
    fontSize: 12,
    padding: '5px 8px',
    fontFamily: "'DM Mono', monospace",
  }
  const sectionLabel = (text: string) => (
    <div className="col-label" style={{ fontSize: 10, margin: '12px 0 5px' }}>
      {text}
    </div>
  )
  const pct = (d: number, ref: number) => ((d / ref) * 100).toFixed(2)

  return (
    <div className="card mono" style={{ padding: 14, fontSize: 12, alignSelf: 'start', display: hidden ? 'none' : undefined }} data-testid="order-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, letterSpacing: '0.08em' }}>MARKET ORDER · BTCUSD</span>
        <button className="filter-btn" style={{ fontSize: 10, padding: '1px 7px' }} onClick={onClose} aria-label="Paneli kapat">
          ✕
        </button>
      </div>

      {ctx && !ctx.trading.enabled && (
        <div style={{ color: 'var(--amber)', fontSize: 11, marginTop: 8 }}>
          Emir gönderimi kapalı — hesap yine gösterilir. Açmak için Railway: TRADING_ENABLED=true
        </div>
      )}

      {sectionLabel('DIRECTION')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(['LONG', 'SHORT'] as const).map((d) => (
          <button
            key={d}
            className="filter-btn"
            disabled={locked}
            onClick={() => setDirection(d)}
            style={{
              fontSize: 12,
              padding: '5px 0',
              ...(direction === d
                ? d === 'LONG'
                  ? { color: 'var(--green)', borderColor: 'var(--green-border)', background: 'var(--green-dim)' }
                  : { color: 'var(--red)', borderColor: 'var(--red-border)', background: 'var(--red-dim)' }
                : {}),
            }}
          >
            {d === 'LONG' ? 'Long' : 'Short'}
          </button>
        ))}
      </div>

      {sectionLabel('STRATEJİ LABEL')}
      <input
        style={inputStyle}
        list="order-panel-labels"
        placeholder="Seç ya da yeni yaz"
        value={label}
        maxLength={64}
        disabled={locked}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Strateji etiketi"
      />
      <datalist id="order-panel-labels">
        {labels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      {sectionLabel('SL / TP')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <input
          style={{ ...inputStyle, borderColor: slInput.invalid ? 'var(--amber)' : 'var(--red-border)' }}
          inputMode="decimal"
          placeholder="SL fiyatı"
          value={slText}
          disabled={locked}
          onChange={(e) => setSlText(e.target.value)}
          aria-label="SL fiyatı"
        />
        <input
          style={{ ...inputStyle, borderColor: tpInput.invalid ? 'var(--amber)' : 'var(--green-border)' }}
          inputMode="decimal"
          placeholder="TP fiyatı"
          value={tpText}
          disabled={locked}
          onChange={(e) => setTpText(e.target.value)}
          aria-label="TP fiyatı"
        />
      </div>

      {sectionLabel('RİSK')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {RISK_PRESETS.map((r) => (
          <button key={r} className={`filter-btn${riskChoice === r ? ' active' : ''}`} style={{ fontSize: 12, padding: '4px 0' }} disabled={locked} onClick={() => setRiskChoice(r)}>
            ${r}
          </button>
        ))}
        <button className={`filter-btn${riskChoice === 'custom' ? ' active' : ''}`} style={{ fontSize: 12, padding: '4px 0' }} disabled={locked} onClick={() => setRiskChoice('custom')}>
          Özel
        </button>
      </div>
      {riskChoice === 'custom' && (
        <input
          style={{ ...inputStyle, marginTop: 6, borderColor: riskInput.invalid ? 'var(--amber)' : 'var(--border)' }}
          inputMode="decimal"
          placeholder="Risk ($)"
          value={customRisk}
          disabled={locked}
          onChange={(e) => setCustomRisk(e.target.value)}
          aria-label="Özel risk"
        />
      )}

      <div style={{ background: 'var(--bg-3)', borderRadius: 6, padding: '8px 10px', marginTop: 12 }} data-testid="order-summary">
        {row('Bid / Ask', quote ? `${price2(quote.bid)} / ${price2(quote.ask)}` : '—')}
        {quote && row('Spread', `$${(quote.ask - quote.bid).toFixed(2)}`)}
        {sizing && sizing.slDistance > 0 && row('Giriş (market)', price2(sizing.refPrice))}
        {sizing && sizing.slDistance > 0 && sl != null && row('SL', `${price2(sl)} · $${sizing.slDistance.toFixed(2)} · %${pct(sizing.slDistance, sizing.refPrice)}`, 'var(--red)')}
        {sizing && sizing.tpDistance > 0 && tp != null && row('TP', `${price2(tp)} · $${sizing.tpDistance.toFixed(2)} · %${pct(sizing.tpDistance, sizing.refPrice)}`, 'var(--green)')}
        {sizing?.ok && (
          <>
            {row('Pozisyon', `${sizing.volume} lot`)}
            {row('SL olursa', money(-sizing.riskUsd), 'var(--red)')}
            {row('TP olursa', money(sizing.rewardUsd), 'var(--green)')}
            {row('R:R', `1 : ${sizing.rr.toFixed(2)}`)}
            {riskUsd != null && Math.abs(riskUsd - sizing.riskUsd) >= 0.005 && row('Hedef risk', `$${riskUsd.toFixed(2)} → lot adımı yüzünden $${sizing.riskUsd.toFixed(2)}`, 'var(--amber)')}
            {row('Spread maliyeti', `$${sizing.spreadUsd.toFixed(2)}`)}
            {swap != null && row('Swap (günlük, tahmini)', money(swap), swap < 0 ? 'var(--red)' : 'var(--green)')}
          </>
        )}
      </div>

      {blocker && submit.kind !== 'filled' && (
        <div style={{ color: 'var(--amber)', fontSize: 11, marginTop: 8 }} data-testid="order-blocker">
          {blocker}
        </div>
      )}
      {submit.kind === 'notice' && (
        <div style={{ color: submit.tone === 'error' ? 'var(--red)' : 'var(--amber)', fontSize: 11, marginTop: 8 }} data-testid="order-notice">
          {submit.message}
          {submit.ambiguous && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="filter-btn" style={{ fontSize: 11, flex: 1 }} onClick={checkStatus}>
                Durumu kontrol et
              </button>
              <button className="filter-btn" style={{ fontSize: 11, flex: 1 }} onClick={() => newOrder(true)}>
                Yeni emir
              </button>
            </div>
          )}
        </div>
      )}
      {submit.kind === 'unresolved' && (
        <div style={{ color: 'var(--amber)', fontSize: 11, marginTop: 8 }} data-testid="order-unresolved">
          {submit.message}
          {submit.intents.map((i) => (
            <div key={i.clientId} style={{ color: 'var(--text-2)', marginTop: 4 }}>
              {intentLine(i)}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="filter-btn" style={{ fontSize: 11, flex: 1 }} onClick={() => checkUnresolved(submit.intents)}>
              Önceki emri kontrol et
            </button>
            {!submit.inFlight && (
              <button className="filter-btn" style={{ fontSize: 11, flex: 1 }} onClick={() => sendAnyway(submit.intents)} disabled={!canSubmit}>
                Yine de gönder
              </button>
            )}
          </div>
        </div>
      )}

      {submit.kind === 'filled' ? (
        <div style={{ border: '1px solid var(--green-border)', background: 'var(--green-dim)', borderRadius: 6, padding: '8px 10px', marginTop: 12 }} data-testid="order-filled">
          <div style={{ color: 'var(--green)', marginBottom: 4 }}>
            Emir doldu{submit.result.positionId ? ` · pozisyon #${submit.result.positionId}` : ''}
          </div>
          {submit.result.stopsAttached === false && (
            <div style={{ color: 'var(--red)', margin: '4px 0' }}>SL/TP pozisyona eklenmemiş görünüyor — MT5'te hemen kontrol et!</div>
          )}
          {submit.result.matchedByFallback && (
            <div style={{ color: 'var(--amber)', margin: '4px 0' }}>Pozisyon clientId ile değil yön/lot/zamanla eşleşti — MT5'te doğrula.</div>
          )}
          {row('Dolum', price2(submit.result.fillPrice))}
          {row('Lot', `${submit.result.volume}`)}
          {row('SL / TP', `${price2(submit.result.sl)} / ${price2(submit.result.tp)}`)}
          {submit.result.actualRiskUsd != null && row('Gerçek risk', money(-submit.result.actualRiskUsd), 'var(--red)')}
          {submit.result.slippageAdverse != null &&
            row('Kayma', submit.result.slippageAdverse === 0 ? '$0.00' : `${submit.result.slippageAdverse > 0 ? 'aleyhe' : 'lehe'} $${Math.abs(submit.result.slippageAdverse).toFixed(2)}`)}
          <div style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 4 }}>Pozisyon birkaç saniye içinde tabloda görünür.</div>
          <button className="filter-btn" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={() => newOrder(false)}>
            Yeni emir
          </button>
        </div>
      ) : (
        <button
          onClick={() => submitOrder()}
          disabled={!canSubmit}
          data-testid="order-submit"
          style={{
            width: '100%',
            marginTop: 12,
            padding: '8px 0',
            borderRadius: 4,
            fontSize: 13,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: "'DM Mono', monospace",
            border: `1px solid ${canSubmit ? dirColor : 'var(--border)'}`,
            background: canSubmit ? (direction === 'LONG' ? 'var(--green-dim)' : 'var(--red-dim)') : 'transparent',
            color: canSubmit ? dirColor : 'var(--text-3)',
          }}
        >
          {busy ? submit.label : sizing?.ok && direction ? `${direction === 'LONG' ? 'Long' : 'Short'} ${sizing.volume} lot · market` : 'Market emir'}
        </button>
      )}
    </div>
  )
}
