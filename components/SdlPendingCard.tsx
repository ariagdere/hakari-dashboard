'use client'

// /live "OPEN & PENDING TRADES" bolumunun sag karti: paralel SDL stratejisinde sirada bekleyen kurulumlar (paralelin SDL
// sayfasindaki "Sırada bekleyen kurulumlar" ile ayni veri ve metinler; /api/sdl-pending, lib/sdlPending.ts). Liste her 3m
// kapanisinda yenilenir; burada 15 sn'de bir sorulur. Satira tiklayinca kurulum /live grafiginde gosterilir (tetik, SL ≈, TP).
import { useEffect, useState } from 'react'
import type { SdlMode, SdlPendingResult, SdlPendingRow } from '@/lib/sdlPending'

export type SdlPendingState = {
  data: (SdlPendingResult & { configured: true }) | null
  configured: boolean | null // null: henuz cevap yok
  error: string | null
}

const POLL_MS = 15_000

export function useSdlPending(): SdlPendingState {
  const [state, setState] = useState<SdlPendingState>({ data: null, configured: null, error: null })
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/api/sdl-pending', { cache: 'no-store' })
        const body = await res.json().catch(() => ({}))
        if (!active) return
        if (!res.ok) {
          setState((prev) => ({ ...prev, error: body.detail ?? body.error ?? `HTTP ${res.status}` }))
        } else if (body.configured === false) {
          setState({ data: null, configured: false, error: null })
        } else {
          setState({ data: body, configured: true, error: null })
        }
      } catch {
        if (active) setState((prev) => ({ ...prev, error: 'Bağlantı hatası' }))
      }
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  return state
}

// ─── Bicim (saatler Istanbul) ───────────────────────────────────────────────────────────────────────────────────
const TZ = 'Europe/Istanbul'
const hm = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' })
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

// Bugunse "09:30", dunse "dün 21:00", yarinsa "yarın 00:00", degilse "15 Eki 21:00" (paralel lib/time.ts clock)
export function clock(t: number, now: number): string {
  const d = new Date(t)
  const day = dayKey.format(d)
  if (day === dayKey.format(new Date(now))) return hm.format(d)
  if (day === dayKey.format(new Date(now - 86_400_000))) return `dün ${hm.format(d)}`
  if (day === dayKey.format(new Date(now + 86_400_000))) return `yarın ${hm.format(d)}`
  return `${dayMonth.format(d)} ${hm.format(d)}`
}
export const hhmm = (t: number) => hm.format(new Date(t))
const px = (v: number) => Math.round(v).toString()

const PENDING_EMPTY: Record<string, string> = {
  hafta_sonu: 'Hafta sonu: işlem yok.',
  kapali: "Pencere 20:00'de kapandı; yeni liste yarın bias geldikten sonra (06:45).",
  bias_yok: "Günün bias raporu henüz gelmedi (rutin 06:45'te çalışıyor).",
  notr: "Günün bias'ı LONG ya da SHORT değil: kurulum aranmıyor.",
  zon_yok: 'Geçerli elle zon yok.',
  gun_mumu_yok: 'Önceki günün günlük mumu yok: gün taranmıyor.',
}

const MODE: Record<SdlMode, { text: string; color: string; title: string }> = {
  acik: { text: 'emir açık', color: 'var(--green)', title: 'Railway anahtarı ve NO TRADE düğmesi açık: kurallardan geçen kurulumda emir gider.' },
  golge: { text: 'gölge mod', color: 'var(--amber)', title: 'SDL_TRADING_ENABLED kapalı: kararlar yazılıyor, emir gitmiyor.' },
  notrade: { text: 'NO TRADE', color: 'var(--red)', title: 'Paralel SDL sayfasındaki düğme kapalı: yeni işlem açılmıyor.' },
  yok: { text: 'core henüz yazmadı', color: 'var(--text-3)', title: 'Paralel core SDL durumunu henüz yazmadı.' },
}

function newsText(h: { from: number; to: number; at: number[] }, now: number): string {
  const at = h.at.map((t) => clock(t, now))
  const ev = at.length > 1 ? `${at.slice(0, -1).join(', ')} ve ${at.at(-1)} haberleri` : `${at[0]} haberi`
  return now >= h.from
    ? ` Haber engeli sürüyor, bitişi ${clock(h.to, now)} (${ev}): bu arada bir dönüş işlem açmaz ve kurulumu düşürür.`
    : ` Haber engeli ${clock(h.from, now)}–${clock(h.to, now)} (${ev}): o aralıkta bir dönüş işlem açmaz ve kurulumu düşürür.`
}

function Dot({ selected }: { selected: boolean }) {
  return (
    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '1px solid var(--border-3)', background: selected ? 'var(--blue)' : 'transparent' }} />
  )
}

const sideBadge = (s: 'LONG' | 'SHORT') => <span className={`badge ${s === 'SHORT' ? 'badge-short' : 'badge-long'}`}>{s}</span>

function triggerNote(p: SdlPendingRow): string | null {
  const S = p.side === 'SHORT'
  if (p.status === 'derin') return `derin kapanış: FVG'nin kenarı ${px(S ? p.fvgLo : p.fvgHi)}; arada kapanırsa kurulum düşer`
  if (p.status === 'zon') return `önce fiyat giriş zonuna (#${p.zoneId}) ulaşmalı`
  return null
}

export default function SdlPendingCard({ state, bid, selected, onToggle }: {
  state: SdlPendingState
  bid: number | null // canli fiyat (Axi mumlari bid): uzaklik buna gore, yoksa son kapanisa
  selected: Set<string>
  onToggle: (key: string) => void
}) {
  const d = state.data
  const now = Date.now()
  const info = d?.info ?? null
  const asOf = d?.asOf ?? null
  const close = info?.durum === 'liste' ? info.close : null
  const ref = bid ?? close
  // Fiyata en yakin tetik basta
  const rows = d ? [...d.rows].sort((a, b) => (ref !== null ? Math.abs(a.trigger - ref) - Math.abs(b.trigger - ref) : 0)) : []
  const mode = d ? MODE[d.mode] : null
  const coreStale = d?.coreUpdatedAt != null && now - d.coreUpdatedAt > 10 * 60_000

  return (
    <div className="card" style={{ padding: 16, minWidth: 0 }} data-testid="sdl-pending">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div className="col-label">BEKLEYEN KURULUMLAR · SDL_v3{rows.length > 0 ? ` · ${rows.length}` : ''}</div>
        {mode && (
          <span className="mono" style={{ fontSize: 10, color: coreStale ? 'var(--red)' : mode.color }} title={mode.title}>
            {coreStale ? 'core 10 dakikadır yazmıyor' : mode.text}
          </span>
        )}
      </div>

      <p className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: rows.length ? 10 : 0 }}>
        {state.configured === null && !state.error && 'yükleniyor…'}
        {state.configured === false && "Paralel veritabanı tanımlı değil (Railway'de PARALEL_DATABASE_URL)."}
        {state.error && <span style={{ color: 'var(--red)' }}>Bekleyen kurulumlar okunamadı: {state.error}. </span>}
        {d && (!asOf || !info) && 'Henüz liste yok; paralel core her 3m kapanışında yazar.'}
        {d && asOf && info && (
          <>
            {clock(asOf, now)} kapanışına göre{info.bias ? `, bias ${info.bias}` : ''}
            {close !== null ? `, son kapanış ${px(close)}` : ''}.{' '}
            {info.durum !== 'liste'
              ? (PENDING_EMPTY[info.durum] ?? info.durum)
              : rows.length === 0
                ? "Bekleyen yok: bias yönünde dönmemiş, en az 50 $'lık bir FVG yok."
                : `${rows.length} FVG dönüş bekliyor: bir 3m kapanışı tetiği geçerse giriş.`}
            {info.durum === 'liste' && !info.pencere && " Pencere 07:00'de açılır: o saatten önceki bir dönüş işlem açmaz ve kurulumu düşürür."}
            {info.durum === 'liste' && info.haber && newsText(info.haber, now)}
            {now - asOf > 10 * 60_000 && <span style={{ color: 'var(--red)' }}> Liste 10 dakikadır güncellenmedi.</span>}
          </>
        )}
      </p>

      {rows.length > 0 && (
        <>
          <div className="live-table-wrap">
            <table className="op-table">
              <thead>
                <tr>
                  <th style={{ width: 18 }} />
                  <th>FVG</th>
                  <th>Yön</th>
                  <th title="Bir 3m kapanışı bu seviyeyi geçerse giriş">Tetik</th>
                  <th className="r" title={bid !== null ? 'Canlı fiyata' : 'Son kapanışa'}>Uzaklık</th>
                  <th>Zon</th>
                  <th className="r">SL ≈</th>
                  <th className="r">TP</th>
                  <th className="r">R:R ≈</th>
                  <th className="r">Lot · risk</th>
                  <th>En geç</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const sel = selected.has(p.key)
                  const note = triggerNote(p)
                  return (
                    <tr key={p.key} className={`op-row${sel ? ' selected' : ''}`} onClick={() => onToggle(p.key)} data-testid="sdl-pending-row">
                      <td><Dot selected={sel} /></td>
                      <td>
                        {clock(p.fvgA, now)}
                        <span className="op-sub">boşluk ${px(p.gap)}</span>
                      </td>
                      <td>{sideBadge(p.side)}</td>
                      <td style={{ whiteSpace: 'normal' }}>
                        <span style={{ color: 'var(--amber)' }}>{p.side === 'SHORT' ? '<' : '>'} {px(p.trigger)}</span>
                        {note && <span className="op-sub">{note}</span>}
                      </td>
                      <td className="r" style={{ color: 'var(--text-2)' }}>{ref !== null ? `$${px(Math.abs(ref - p.trigger))}` : '—'}</td>
                      <td style={{ color: 'var(--text-2)' }}>#{p.zoneId} → #{p.tpZoneId}</td>
                      <td className="r" style={{ color: 'var(--red)' }}>{px(p.sl)}</td>
                      <td className="r" style={{ color: 'var(--green)' }}>{px(p.tp)}</td>
                      <td className="r" style={{ color: 'var(--text-2)' }}>1:{p.rr.toFixed(2)}</td>
                      <td className="r" style={{ color: 'var(--text-2)' }}>
                        {p.volume !== null ? `${p.volume.toFixed(2)} · $${(p.riskUsd ?? 0).toFixed(2)}` : <span style={{ color: 'var(--red)' }}>işlem yok: {p.lotError}</span>}
                      </td>
                      <td style={{ color: 'var(--text-3)' }}>{clock(p.expiresAt, now)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="live-mobile-cards">
            {rows.map((p) => {
              const sel = selected.has(p.key)
              const note = triggerNote(p)
              return (
                <div key={p.key} className={`live-mcard${sel ? ' selected' : ''}`} onClick={() => onToggle(p.key)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Dot selected={sel} />
                      {sideBadge(p.side)}
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>FVG {clock(p.fvgA, now)}</span>
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--amber)' }}>{p.side === 'SHORT' ? '<' : '>'} {px(p.trigger)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                    <div><span className="col-label">Uzaklık </span><span style={{ color: 'var(--text-2)' }}>{ref !== null ? `$${px(Math.abs(ref - p.trigger))}` : '—'}</span></div>
                    <div><span className="col-label">Zon </span><span style={{ color: 'var(--text-2)' }}>#{p.zoneId} → #{p.tpZoneId}</span></div>
                    <div><span className="col-label">Boşluk </span><span style={{ color: 'var(--text-2)' }}>${px(p.gap)}</span></div>
                    <div><span className="col-label">SL ≈ </span><span style={{ color: 'var(--red)' }}>{px(p.sl)}</span></div>
                    <div><span className="col-label">TP </span><span style={{ color: 'var(--green)' }}>{px(p.tp)}</span></div>
                    <div><span className="col-label">R:R ≈ </span><span style={{ color: 'var(--text-2)' }}>1:{p.rr.toFixed(2)}</span></div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span className="col-label">Lot · risk </span>
                      {p.volume !== null ? <span style={{ color: 'var(--text-2)' }}>{p.volume.toFixed(2)} · ${(p.riskUsd ?? 0).toFixed(2)}</span> : <span style={{ color: 'var(--red)' }}>işlem yok: {p.lotError}</span>}
                    </div>
                    <div><span className="col-label">En geç </span><span style={{ color: 'var(--text-3)' }}>{clock(p.expiresAt, now)}</span></div>
                  </div>
                  {note && <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>{note}</div>}
                </div>
              )
            })}
          </div>

          <p className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, marginTop: 10 }}>
            Değerler girişin tetikte olacağı varsayımıyla: SL şimdiye kadarki iğneden (fiyat ilerlerse SL, R:R ve lot değişir), TP o girişin ötesindeki ilk zondan.
            Satıra tıklayınca grafikte tetik, SL ≈ ve TP; FVG'nin ilk mumunda işaret.
          </p>
        </>
      )}
    </div>
  )
}
