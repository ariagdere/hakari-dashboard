'use client'

import { useEffect, useState } from 'react'

// /live ekraninda skorkartlarin altindaki satirin 2/3'luk sol kismi.
// /api/daily-bias'tan en son makro bias calismasini gosterir; tiklaninca tum detaylar modalda.
// Veri: btc_daily_bias (Claude routine -> bias-data branch -> GitHub Action -> Postgres).

type Impact = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'

// Varlik guc siralamasi (prompt v4+). Ingest puana gore siralar ve rank'i kendisi verir.
type AssetCode = 'BTC' | 'DXY' | 'XAUUSD' | 'VIX' | 'NASDAQ' | 'SPX' | 'BRENT'
type Strength = {
  rank: number
  asset: AssetCode
  score: number // 0..10, 5 = yatay
  reason: string
  chg_24h_pct: number | null
  chg_7d_pct: number | null
}

type BiasRun = {
  id: number
  run_date: string
  generated_at: string
  net_direction: string
  net_direction_level: number
  sentiment_score: number
  change_24h: 'IMPROVED' | 'UNCHANGED' | 'WORSENED'
  drivers: string[]
  developments: { item: string; impact: Impact }[] | null
  key_development: string | null
  divergence: 'RELATIVE_STRENGTH' | 'RELATIVE_WEAKNESS' | 'ALIGNED'
  divergence_note: string | null
  liquidity_regime: 'TIGHTENING' | 'NEUTRAL' | 'EASING' | 'STRONG_EXPANSION'
  risk_regime: 'RISK_ON' | 'CAUTIOUS_RISK_ON' | 'NEUTRAL' | 'CAUTIOUS_RISK_OFF' | 'RISK_OFF'
  conclusion: string | null
  bias: 'LONG' | 'NEUTRAL' | 'SHORT'
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  raw_text: string
  asset_strength: Strength[] | null
  model: string | null
  prompt_version: string | null
  source_file: string
}

type RecentRun = Pick<BiasRun, 'id' | 'generated_at' | 'bias' | 'confidence' | 'sentiment_score' | 'net_direction'>

type BiasResponse = {
  latest: BiasRun | null
  previous: { generated_at: string; sentiment_score: number; bias: string } | null
  recent: RecentRun[]
}

// ─── Etiketler ve renkler ─────────────────────────────────────────────────────
const GREEN = 'var(--green)'
const RED = 'var(--red)'
const AMBER = 'var(--amber)'
const MUTED = 'var(--text-3)'
const PLAIN = 'var(--text)'

const CONFIDENCE: Record<BiasRun['confidence'], string> = { LOW: 'Düşük', MEDIUM: 'Orta', HIGH: 'Yüksek' }
const CHANGE: Record<BiasRun['change_24h'], [string, string]> = {
  IMPROVED: ['İyileşti', GREEN], UNCHANGED: ['Değişmedi', PLAIN], WORSENED: ['Kötüleşti', RED],
}
const DIVERGENCE: Record<BiasRun['divergence'], [string, string]> = {
  RELATIVE_STRENGTH: ['Relative strength', GREEN], RELATIVE_WEAKNESS: ['Relative weakness', RED], ALIGNED: ['Uyumlu', PLAIN],
}
const LIQUIDITY: Record<BiasRun['liquidity_regime'], [string, string]> = {
  TIGHTENING: ['Sıkılaşıyor', RED], NEUTRAL: ['Nötr', PLAIN], EASING: ['Gevşiyor', GREEN], STRONG_EXPANSION: ['Güçlü genişleme', GREEN],
}
const RISK: Record<BiasRun['risk_regime'], [string, string]> = {
  RISK_ON: ['Risk-on', GREEN], CAUTIOUS_RISK_ON: ['Temkinli risk-on', GREEN], NEUTRAL: ['Nötr', PLAIN],
  CAUTIOUS_RISK_OFF: ['Temkinli risk-off', AMBER], RISK_OFF: ['Risk-off', RED],
}
const IMPACT: Record<Impact, [string, string]> = {
  POSITIVE: ['Pozitif', GREEN], NEUTRAL: ['Nötr', MUTED], NEGATIVE: ['Negatif', RED],
}

const scoreColor = (s: number) => (s >= 15 ? GREEN : s <= -15 ? RED : PLAIN)
const fmtScore = (s: number) => `${s > 0 ? '+' : ''}${s}`
const pick = <T extends string>(map: Record<T, [string, string]>, k: T): [string, string] => map[k] ?? [String(k), PLAIN]

const ASSET_SHORT: Record<AssetCode, string> = { BTC: 'BTC', DXY: 'DXY', XAUUSD: 'XAU', VIX: 'VIX', NASDAQ: 'NDX', SPX: 'SPX', BRENT: 'BRENT' }
const ASSET_LONG: Record<AssetCode, string> = {
  BTC: 'Bitcoin', DXY: 'Dolar endeksi', XAUUSD: 'Altın', VIX: 'VIX', NASDAQ: 'Nasdaq 100', SPX: 'S&P 500', BRENT: 'Brent',
}
// Guc puani rengi: >=6.5 guclu (yesil), <=3.5 zayif (kirmizi). VIX'te ters: yuksek puan = korku artiyor.
function strengthColor(asset: AssetCode, score: number): string {
  const s = asset === 'VIX' ? 10 - score : score
  return s >= 6.5 ? GREEN : s <= 3.5 ? RED : PLAIN
}
const fmtStrength = (s: number) => s.toFixed(1)
const fmtPct = (v: number | null) => {
  if (v == null) return '—'
  const r = Math.round(v * 10) / 10
  return r === 0 ? '0.0%' : `${r > 0 ? '+' : ''}${r.toFixed(1)}%` // sifira yuvarlanan degerde +0.0% / -0.0% yazmasin
}

// Istanbul sabit UTC+3 (sayfanin geri kalaniyla ayni varsayim)
function fmtIst(iso: string, withDate = true): string {
  const t = new Date(new Date(iso).getTime() + 3 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  const hm = `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
  return withDate ? `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)} ${hm}` : hm
}
function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m} dk önce`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} sa önce`
  return `${Math.round(h / 24)} gün önce`
}
const STALE_MS = 36 * 3600 * 1000

export function BiasBadge({ bias, large }: { bias: string; large?: boolean }) {
  const cls = bias === 'LONG' ? 'badge-long' : bias === 'SHORT' ? 'badge-short' : 'badge-wait'
  return (
    <span className={`badge ${cls}`} style={large ? { fontSize: 18, padding: '6px 14px', fontWeight: 600 } : undefined}>
      {bias}
    </span>
  )
}

// -100..+100 skoru icin yatay gosterge; ortada 0 cizgisi.
function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score + 100) / 2))
  const color = scoreColor(score)
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--bg-4)', margin: '10px 0 4px' }}>
      <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: 'var(--border-3)' }} />
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, borderRadius: 3, background: color, opacity: 0.85,
          left: `${Math.min(pct, 50)}%`, width: `${Math.abs(pct - 50)}%`,
        }}
      />
      <div
        style={{
          position: 'absolute', top: -4, width: 3, height: 14, borderRadius: 2, background: color,
          left: `calc(${pct}% - 1.5px)`,
        }}
      />
    </div>
  )
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="col-label" style={{ fontSize: 10, marginBottom: 3 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, color: color ?? PLAIN, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
    </div>
  )
}

// ─── Kart ─────────────────────────────────────────────────────────────────────
export default function MacroBiasCard() {
  const [data, setData] = useState<BiasResponse | null>(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    async function fetchBias() {
      try {
        const res = await fetch('/api/daily-bias', { cache: 'no-store' })
        if (res.ok && active) setData(await res.json())
      } catch {}
      if (active) setNow(Date.now())
    }
    fetchBias()
    const interval = setInterval(fetchBias, 5 * 60 * 1000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  const run = data?.latest ?? null

  if (!run) {
    return (
      <div className="stat-card macro-bias-card">
        <div className="col-label" style={{ fontSize: 11 }}>MACRO BIAS</div>
        <div className="mono" style={{ fontSize: 13, color: MUTED, marginTop: 14 }}>
          {data ? 'Henüz bias verisi yok.' : 'Yükleniyor…'}
        </div>
      </div>
    )
  }

  const stale = now - new Date(run.generated_at).getTime() > STALE_MS
  const delta = data?.previous ? run.sentiment_score - data.previous.sentiment_score : null
  const [chgLabel, chgColor] = pick(CHANGE, run.change_24h)
  const [liqLabel, liqColor] = pick(LIQUIDITY, run.liquidity_regime)
  const [riskLabel, riskColor] = pick(RISK, run.risk_regime)
  const [divLabel, divColor] = pick(DIVERGENCE, run.divergence)

  return (
    <>
      <div
        className="stat-card macro-bias-card"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
        title="Detaylar için tıkla"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <span className="col-label" style={{ fontSize: 11 }}>MACRO BIAS</span>
          <span className="mono" style={{ fontSize: 11, color: stale ? AMBER : MUTED, whiteSpace: 'nowrap' }}>
            {stale && '⚠ ESKİ · '}{fmtIst(run.generated_at)} · {ago(run.generated_at, now)}
            <span className="macro-bias-more"> · Detay →</span>
          </span>
        </div>

        <div className="macro-bias-main">
          <div className="macro-bias-headline">
            <BiasBadge bias={run.bias} large />
            <div className="mono" style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
              Güven: <span style={{ color: PLAIN }}>{CONFIDENCE[run.confidence] ?? run.confidence}</span>
            </div>
          </div>

          <div className="macro-bias-score">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 24, fontWeight: 500, color: scoreColor(run.sentiment_score), lineHeight: 1 }}>
                {fmtScore(run.sentiment_score)}
              </span>
              <span className="mono" style={{ fontSize: 12, color: PLAIN }}>{run.net_direction}</span>
              {delta != null && delta !== 0 && (
                <span className="mono" style={{ fontSize: 11, color: delta > 0 ? GREEN : RED }} title="Bir önceki çalışmaya göre">
                  {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                </span>
              )}
            </div>
            <ScoreGauge score={run.sentiment_score} />
            <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: MUTED }}>
              <span>-100</span><span>0</span><span>+100</span>
            </div>
          </div>

          <div className="macro-bias-fields">
            <Field label="24S DEĞİŞİM" value={chgLabel} color={chgColor} />
            <Field label="LİKİDİTE" value={liqLabel} color={liqColor} />
            <Field label="RİSK" value={riskLabel} color={riskColor} />
            <Field label="MAKRO UYUM" value={divLabel} color={divColor} />
          </div>
        </div>

        {run.asset_strength && run.asset_strength.length > 0 && (
          <div className="macro-strength-strip" title="Son 24 saat (ikincil: 7 gün) fiyat gücü, 0–10 · güçlüden zayıfa">
            <span className="col-label" style={{ fontSize: 10 }}>GÜÇ SIRALAMASI</span>
            {run.asset_strength.map((s) => (
              <span key={s.asset} className={`macro-strength-chip mono${s.asset === 'BTC' ? ' is-btc' : ''}`}>
                <span style={{ color: MUTED }}>{ASSET_SHORT[s.asset] ?? s.asset}</span>
                <span style={{ color: strengthColor(s.asset, s.score) }}>{fmtStrength(s.score)}</span>
              </span>
            ))}
          </div>
        )}

        {run.drivers?.length > 0 && (
          <ul className="macro-bias-drivers">
            {run.drivers.slice(0, 4).map((d, i) => (
              <li key={i} title={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>

      {open && data && <MacroBiasModal data={data} now={now} onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="col-label" style={{ fontSize: 11, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

const prose: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, color: PLAIN, margin: 0 }

function MacroBiasModal({ data, now, onClose }: { data: BiasResponse; now: number; onClose: () => void }) {
  const run = data.latest!

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [onClose])

  const [chgLabel, chgColor] = pick(CHANGE, run.change_24h)
  const [liqLabel, liqColor] = pick(LIQUIDITY, run.liquidity_regime)
  const [riskLabel, riskColor] = pick(RISK, run.risk_regime)
  const [divLabel, divColor] = pick(DIVERGENCE, run.divergence)

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="col-label" style={{ fontSize: 11 }}>BTC MAKRO BIAS</div>
            <div className="mono" style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              {fmtIst(run.generated_at)} (İstanbul) · {ago(run.generated_at, now)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        <div className="macro-modal-summary">
          <div>
            <div className="col-label" style={{ fontSize: 10, marginBottom: 6 }}>BIAS</div>
            <BiasBadge bias={run.bias} large />
          </div>
          <Field label="GÜVEN" value={CONFIDENCE[run.confidence] ?? run.confidence} />
          <div style={{ minWidth: 0 }}>
            <div className="col-label" style={{ fontSize: 10, marginBottom: 3 }}>SKOR</div>
            <div className="mono" style={{ fontSize: 20, color: scoreColor(run.sentiment_score), lineHeight: 1.1 }}>
              {fmtScore(run.sentiment_score)}
            </div>
          </div>
          <Field label="NET YÖN" value={run.net_direction} color={scoreColor(run.sentiment_score)} />
          <Field label="24S DEĞİŞİM" value={chgLabel} color={chgColor} />
          <Field label="LİKİDİTE" value={liqLabel} color={liqColor} />
          <Field label="RİSK" value={riskLabel} color={riskColor} />
          <Field label="MAKRO UYUM" value={divLabel} color={divColor} />
        </div>
        <ScoreGauge score={run.sentiment_score} />

        {run.conclusion && (
          <Section title="BTC İÇİN SONUÇ (24–72 SA)">
            <p style={prose}>{run.conclusion}</p>
          </Section>
        )}

        {run.asset_strength && run.asset_strength.length > 0 && (
          <Section title="VARLIK GÜÇ SIRALAMASI (24S · 7G İKİNCİL)">
            <div>
              {run.asset_strength.map((s) => {
                const color = strengthColor(s.asset, s.score)
                return (
                  <div key={s.asset} className={`macro-strength-row${s.asset === 'BTC' ? ' is-btc' : ''}`}>
                    <span className="mono" style={{ gridArea: 'rank', fontSize: 11, color: MUTED }}>{s.rank}</span>
                    <span className="mono" style={{ gridArea: 'asset', fontSize: 13, color: PLAIN, whiteSpace: 'nowrap' }}>
                      {ASSET_LONG[s.asset] ?? s.asset}
                    </span>
                    <span className="macro-strength-bar" style={{ gridArea: 'bar' }}>
                      <span style={{ width: `${Math.max(0, Math.min(10, s.score)) * 10}%`, background: color === PLAIN ? 'var(--text-3)' : color }} />
                    </span>
                    <span className="mono" style={{ gridArea: 'score', fontSize: 13, color, textAlign: 'right' }}>{fmtStrength(s.score)}</span>
                    <span className="mono" style={{ gridArea: 'chg', fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }} title="24 saat · 7 gün değişim">
                      {fmtPct(s.chg_24h_pct)} · {fmtPct(s.chg_7d_pct)}
                    </span>
                    <span style={{ gridArea: 'reason', fontSize: 13, lineHeight: 1.5, color: PLAIN }}>{s.reason}</span>
                  </div>
                )
              })}
            </div>
            <div className="mono" style={{ fontSize: 10, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
              Puan 0–10 (5 = yatay), güçlüden zayıfa. Değişim: 24s · 7g. VIX'te yüksek puan korkunun arttığını gösterir; rengi bu yüzden ters.
            </div>
          </Section>
        )}

        {run.drivers?.length > 0 && (
          <Section title="ANA SÜRÜCÜLER">
            <ul style={{ margin: 0, paddingLeft: 18, listStyleType: 'disc', ...prose }}>
              {run.drivers.map((d, i) => <li key={i} style={{ marginBottom: 4 }}>{d}</li>)}
            </ul>
          </Section>
        )}

        {run.key_development && (
          <Section title="EN ÖNEMLİ YENİ GELİŞME">
            <p style={prose}>{run.key_development}</p>
          </Section>
        )}

        {(run.divergence_note || run.divergence) && (
          <Section title="MAKRO UYUMSUZLUK KONTROLÜ">
            <p style={prose}>
              <span className="mono" style={{ color: divColor, marginRight: 8 }}>{divLabel}</span>
              {run.divergence_note}
            </p>
          </Section>
        )}

        {run.developments && run.developments.length > 0 && (
          <Section title={`SINIFLANDIRILAN GELİŞMELER (${run.developments.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {run.developments.map((d, i) => {
                const [label, color] = pick(IMPACT, d.impact)
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13, lineHeight: 1.5 }}>
                    <span className="mono" style={{ color, fontSize: 11, minWidth: 58, flexShrink: 0 }}>{label}</span>
                    <span style={{ color: PLAIN }}>{d.item}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {data.recent.length > 1 && (
          <Section title="SON ÇALIŞMALAR">
            <div style={{ overflowX: 'auto' }}>
              <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: MUTED, textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 400 }}>ZAMAN</th>
                    <th style={{ padding: '6px 8px', fontWeight: 400 }}>BIAS</th>
                    <th style={{ padding: '6px 8px', fontWeight: 400 }}>GÜVEN</th>
                    <th style={{ padding: '6px 8px', fontWeight: 400, textAlign: 'right' }}>SKOR</th>
                    <th style={{ padding: '6px 8px', fontWeight: 400 }}>NET YÖN</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)', background: r.id === run.id ? 'var(--bg-3)' : undefined }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtIst(r.generated_at)}</td>
                      <td style={{ padding: '6px 8px' }}><BiasBadge bias={r.bias} /></td>
                      <td style={{ padding: '6px 8px' }}>{CONFIDENCE[r.confidence] ?? r.confidence}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: scoreColor(r.sentiment_score) }}>{fmtScore(r.sentiment_score)}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.net_direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section title="HAM ÇIKTI">
          <details>
            <summary className="mono" style={{ fontSize: 12, color: MUTED, cursor: 'pointer' }}>Routine'in tam metin çıktısını göster</summary>
            <pre
              className="mono"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, color: PLAIN, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginTop: 8 }}
            >
              {run.raw_text}
            </pre>
          </details>
        </Section>

        <div className="mono" style={{ fontSize: 10, color: MUTED, marginTop: 20 }}>
          {[run.model, run.prompt_version && `prompt ${run.prompt_version}`, run.source_file].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  )
}
