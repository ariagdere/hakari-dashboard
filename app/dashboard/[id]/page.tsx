'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const CandleChart = dynamic(() => import('@/components/CandleChart'), { ssr: false })

interface Analysis {
  id: number; analyzed_at: string; direction: string; order_type: string
  entry: number; tp: number; sl: number; rr: string
  risk_usd: number; position_size_btc: number
  market_score_value: number; confidence_value: number; rsi_4h: number; win_probability: number | null
  win_probability_v6: number | null; win_probability_v6_reverse: number | null
  win_probability_c75: number | null; win_probability_c75_reverse: number | null
  zlema_zone_4h: string | null
  sim_result: string; sim_pnl_usd: number; sim_r_multiple: number
  sim_entry_to_result_minutes: number
  sim_entry_triggered_at: string; sim_result_at: string
  sim_max_favorable_move: number; sim_max_adverse_move: number
  // Naif
  naive_direction: string | null; naive_entry: number | null
  naive_tp: number | null; naive_sl: number | null; naive_rr: number | null
  naive_dist_ratio: number | null; naive_pos_size: number | null
  naive_duration_mins: number | null
  sim_result_naive: string | null; naive_sim_r_multiple: number | null
  synthesis_h1: string; synthesis_m5: string; synthesis_mtf: string
  upside_zone_1: string; upside_zone_2: string
  downside_zone_1: string; downside_zone_2: string
  liquidity_summary_note: string
  entry_reason: string; tp_reason: string; sl_reason: string
  candles_json: any[]
  notes: string
  screenshot_01_url: string; screenshot_02_url: string; screenshot_03_url: string
  screenshot_04_url: string; screenshot_05_url: string; screenshot_06_url: string
  screenshot_07_url: string; screenshot_08_url: string; screenshot_09_url: string
  screenshot_10_url: string; screenshot_11_url: string; screenshot_12_url: string
}

const dirBadge = (d: string) => {
  if (d === 'SHORT') return <span className="badge badge-short">SHORT</span>
  if (d === 'LONG') return <span className="badge badge-long">LONG</span>
  return <span className="badge badge-wait">WAIT</span>
}

const resultBadge = (r: string) => {
  if (!r) return <span className="badge badge-pend">—</span>
  if (r === 'TP_HIT') return <span className="badge badge-tp">TP HIT</span>
  if (r === 'SL_HIT') return <span className="badge badge-sl">SL HIT</span>
  if (r === 'EXPIRED') return <span className="badge badge-exp">EXPIRED</span>
  return <span className="badge badge-ne">NO ENTRY</span>
}

const pnlClass = (v: number) => v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero'
const wpColor = (v: number | null | undefined) => !v ? 'var(--text-3)' : v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)'
const zlemaBadge = (z: string | null) => {
  if (!z) return <span className="mono" style={{ fontSize: 14, color: 'var(--text-3)' }}>—</span>
  const color = z === 'LONG' ? 'var(--green)' : z === 'SHORT' ? 'var(--red)' : 'var(--text-3)'
  return <span className="mono" style={{ fontSize: 14, fontWeight: 500, color }}>{z === 'NO_TRADE' ? 'NO TRADE' : z}</span>
}
const fmt = (n: number) => n?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—'
const fmtDate = (s: string) => new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtMins = (m: number | null) => { if (!m) return '—'; const total = Math.round(m); const h = Math.floor(total / 60); const min = total % 60; return h > 0 ? `${h}s ${min}dk` : `${min}dk` }
const fmtR = (v: number | null, result?: string) => {
  if (v == null) return '—'
  const n = parseFloat(String(v))
  if (isNaN(n)) return '—'
  const signed = result === 'SL_HIT' ? -Math.abs(n) : result === 'TP_HIT' ? Math.abs(n) : n
  return (signed > 0 ? '+' : '') + signed.toFixed(2) + 'R'
}
const safeNum = (v: any): number | null => { const n = parseFloat(String(v)); return isNaN(n) ? null : n }

function ScoreCard({ label, value, color, sub }: { label: string; value: any; color?: string; sub?: string }) {
  return (
    <div className="scorecard-cell">
      <div className="col-label" style={{ marginBottom: 5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 500, color: color || 'var(--text)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function AnalysisPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const [data, setData] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'analysis' | 'simulation'>('analysis')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/analysis/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setNotes(d.notes || ''); setLoading(false) })
  }, [id])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (lightbox) setLightbox(null) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [lightbox])

  const saveNote = async () => {
    setSaving(true)
    await fetch(`/api/analysis/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const screenshots = data ? [
    data.screenshot_01_url, data.screenshot_02_url, data.screenshot_03_url,
    data.screenshot_04_url, data.screenshot_05_url, data.screenshot_06_url,
    data.screenshot_07_url, data.screenshot_08_url, data.screenshot_09_url,
    data.screenshot_10_url, data.screenshot_11_url, data.screenshot_12_url,
  ].filter(Boolean) : []

  const NotesBlock = (
    <div>
      <div className="section-title">Not</div>
      <textarea className="note-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Analize not ekle..." />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="save-btn" onClick={saveNote} disabled={saving}>
          {saving ? 'kaydediliyor...' : saved ? '✓ kaydedildi' : 'kaydet'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 48 }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div className="container" style={{ height: 48, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer', padding: '4px 10px', fontSize: 12, fontFamily: 'DM Mono, monospace', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-3)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            ← Geri
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>HAKARI</span>
          {data && (
            <>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>#{id}</span>
              {dirBadge(data.direction)}
              {resultBadge(data.sim_result)}
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{fmtDate(data.analyzed_at)}</span>
            </>
          )}
        </div>
      </div>

      <div className="container" style={{ paddingTop: 24 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-3)' }} className="mono">yükleniyor...</div>
        )}

        {data && !loading && (
          <div style={{ display: 'grid', gap: 20 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              <button className={`tab-btn${tab === 'analysis' ? ' active' : ''}`} onClick={() => setTab('analysis')}>Analiz</button>
              <button className={`tab-btn${tab === 'simulation' ? ' active' : ''}`} onClick={() => setTab('simulation')}>Simülasyon</button>
            </div>

            {tab === 'analysis' && (
              <>
                {/* ── AI & NAİF SETUP ─────────────────────────────────────── */}
                <div>
                  <div className="section-title">AI & Naif Setup</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                    <div className="stat-card">
                      <div className="col-label" style={{ marginBottom: 6 }}>V6 / Rev</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: wpColor(data.win_probability_v6) }}>{data.win_probability_v6 != null ? `%${Number(data.win_probability_v6).toFixed(0)}` : '—'}</span>
                        <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: wpColor(data.win_probability_v6_reverse) }}>{data.win_probability_v6_reverse != null ? `%${Number(data.win_probability_v6_reverse).toFixed(0)}` : '—'}</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="col-label" style={{ marginBottom: 6 }}>C75 / Rev</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: wpColor(data.win_probability_c75) }}>{data.win_probability_c75 != null ? `%${Number(data.win_probability_c75).toFixed(0)}` : '—'}</span>
                        <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: wpColor(data.win_probability_c75_reverse) }}>{data.win_probability_c75_reverse != null ? `%${Number(data.win_probability_c75_reverse).toFixed(0)}` : '—'}</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="col-label" style={{ marginBottom: 6 }}>ZLEMA (4H)</div>
                      {zlemaBadge(data.zlema_zone_4h)}
                    </div>
                    <div className="stat-card">
                      <div className="col-label" style={{ marginBottom: 6 }}>4H RSI</div>
                      <div className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{data.rsi_4h ?? '—'}</div>
                    </div>
                  </div>

                  {!data.naive_direction ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-3)', borderRadius: 6 }} className="mono">
                      Naif setup hesaplanmamış (cluster verisi eksik olabilir)
                    </div>
                  ) : (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontFamily: 'DM Mono, monospace' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-3)' }}>
                            <th style={{ textAlign: 'left', color: 'var(--text-3)', padding: '12px 18px', fontWeight: 400, fontSize: 11, letterSpacing: '0.05em' }}></th>
                            <th style={{ textAlign: 'right', color: 'var(--text-2)', padding: '12px 18px', fontWeight: 600, fontSize: 12, letterSpacing: '0.05em' }}>AI</th>
                            <th style={{ textAlign: 'right', color: 'var(--text-2)', padding: '12px 18px', fontWeight: 600, fontSize: 12, letterSpacing: '0.05em' }}>NAİF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: 'Yön', ai: dirBadge(data.direction), nv: dirBadge(data.naive_direction) },
                            { label: 'Entry', ai: `$${fmt(data.entry)}`, nv: data.naive_entry != null ? `$${fmt(data.naive_entry)}` : '—' },
                            { label: 'TP', ai: `$${fmt(data.tp)}`, nv: data.naive_tp != null ? `$${fmt(data.naive_tp)}` : '—' },
                            { label: 'SL', ai: `$${fmt(data.sl)}`, nv: data.naive_sl != null ? `$${fmt(data.naive_sl)}` : '—' },
                            { label: 'R/R', ai: data.rr, nv: data.naive_rr != null ? Number(data.naive_rr).toFixed(2) : '—' },
                            { label: 'Dist Ratio', ai: '—', nv: data.naive_dist_ratio != null ? `${Number(data.naive_dist_ratio).toFixed(2)}x` : '—' },
                            { label: 'Pos. Size', ai: `${data.position_size_btc} BTC`, nv: data.naive_pos_size != null ? `${Number(data.naive_pos_size).toFixed(4)} BTC` : '—' },
                          ].map((row, i) => (
                            <tr key={i} style={{ borderBottom: i < 6 ? '1px solid var(--border)' : 'none' }}>
                              <td style={{ padding: '13px 18px', color: 'var(--text-2)', fontSize: 13 }}>{row.label}</td>
                              <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 15 }}>{row.ai}</td>
                              <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 15 }}>{row.nv}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── GENEL GİRDİ VE ANALİZ ÇIKTILARI ────────────────────── */}
                <div>
                  <div className="section-title">Genel Girdi ve Analiz Çıktıları</div>
                </div>

                <div>
                  <div className="section-title">MTF Sentez</div>
                  <div className="synthesis-block">{data.synthesis_mtf}</div>
                </div>

                <div className="synthesis-2col">
                  <div>
                    <div className="section-title">1H Sentez</div>
                    <div className="synthesis-block">{data.synthesis_h1}</div>
                  </div>
                  <div>
                    <div className="section-title">5M Sentez</div>
                    <div className="synthesis-block">{data.synthesis_m5}</div>
                  </div>
                </div>

                <div>
                  <div className="section-title">Likidite Haritası</div>
                  <div className="synthesis-2col" style={{ marginBottom: 8 }}>
                    {[
                      { zone: data.upside_zone_1, dir: 'up' },
                      { zone: data.upside_zone_2, dir: 'up' },
                      { zone: data.downside_zone_1, dir: 'down' },
                      { zone: data.downside_zone_2, dir: 'down' },
                    ].map((l, i) => (
                      <div key={i} className="data-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: l.dir === 'up' ? 'var(--green)' : 'var(--red)' }}>{l.dir === 'up' ? '▲' : '▼'}</span>
                        <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{l.zone}</span>
                      </div>
                    ))}
                  </div>
                  {data.liquidity_summary_note && <div className="synthesis-block" style={{ fontSize: 12 }}>{data.liquidity_summary_note}</div>}
                </div>

                {screenshots.length > 0 && (
                  <div>
                    <div className="section-title">Ekran Görüntüleri</div>
                    <div className="screenshot-grid">
                      {screenshots.map((url, i) => (
                        <div key={i} className="screenshot-thumb" onClick={() => setLightbox(url)}>
                          <img src={url} alt={`ss-${i + 1}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {NotesBlock}
              </>
            )}

            {tab === 'simulation' && (
              <>
                <div>
                  <div className="section-title">AI Sonucu</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {[
                      { label: 'Sonuç', value: resultBadge(data.sim_result) },
                      { label: 'PnL', value: safeNum(data.sim_pnl_usd) != null ? `${safeNum(data.sim_pnl_usd)! > 0 ? '+' : ''}$${Math.abs(safeNum(data.sim_pnl_usd)!).toFixed(2)}` : '—', color: safeNum(data.sim_pnl_usd)! > 0 ? 'var(--green)' : safeNum(data.sim_pnl_usd)! < 0 ? 'var(--red)' : 'var(--text-3)' },
                      { label: 'R Multiple', value: fmtR(safeNum(data.sim_r_multiple), data.sim_result), color: safeNum(data.sim_r_multiple) != null && data.sim_result === 'TP_HIT' ? 'var(--green)' : data.sim_result === 'SL_HIT' ? 'var(--red)' : 'var(--text-3)' },
                      { label: 'Süre', value: fmtMins(data.sim_entry_to_result_minutes) },
                      { label: 'Max Kazanç', value: safeNum(data.sim_max_favorable_move) != null ? `$${fmt(safeNum(data.sim_max_favorable_move)!)}` : '—', color: 'var(--green)' },
                      { label: 'Max Kayıp', value: safeNum(data.sim_max_adverse_move) != null ? `$${fmt(safeNum(data.sim_max_adverse_move)!)}` : '—', color: 'var(--red)' },
                    ].map((s, i) => (
                      <div key={i} className="stat-card">
                        <div className="col-label" style={{ marginBottom: 6 }}>{s.label}</div>
                        <div className="mono" style={{ fontSize: 14, fontWeight: 500, color: (s as any).color || 'var(--text)' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {data.naive_direction && (
                  <div>
                    <div className="section-title">Naif Sonucu</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                      {[
                        { label: 'Sonuç', value: resultBadge(data.sim_result_naive || '') },
                        {
                          label: 'PnL', color: safeNum(data.naive_sim_r_multiple) == null ? 'var(--text-3)' : safeNum(data.naive_sim_r_multiple)! > 0 ? 'var(--green)' : safeNum(data.naive_sim_r_multiple)! < 0 ? 'var(--red)' : 'var(--text-3)',
                          value: safeNum(data.naive_sim_r_multiple) != null
                            ? `${safeNum(data.naive_sim_r_multiple)! * 20 > 0 ? '+' : ''}$${Math.abs(safeNum(data.naive_sim_r_multiple)! * 20).toFixed(2)}`
                            : '—',
                        },
                        { label: 'R Multiple', value: fmtR(safeNum(data.naive_sim_r_multiple), data.sim_result_naive || undefined), color: data.sim_result_naive === 'TP_HIT' ? 'var(--green)' : data.sim_result_naive === 'SL_HIT' ? 'var(--red)' : 'var(--text-3)' },
                        { label: 'Süre', value: fmtMins(data.naive_duration_mins) },
                      ].map((s, i) => (
                        <div key={i} className="stat-card">
                          <div className="col-label" style={{ marginBottom: 6 }}>{s.label}</div>
                          <div className="mono" style={{ fontSize: 14, fontWeight: 500, color: (s as any).color || 'var(--text)' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 6 }}>PnL, sabit $20 risk baz alınarak R × $20 şeklinde hesaplanır.</div>
                  </div>
                )}

                {data.sim_entry_triggered_at && (
                  <div className="data-item">
                    <div className="section-title" style={{ marginBottom: 10 }}>Zaman Çizelgesi</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { label: 'Analiz', val: fmtDate(data.analyzed_at), color: 'var(--text-2)' },
                        { label: 'Entry tetiklendi', val: fmtDate(data.sim_entry_triggered_at), color: 'var(--amber)' },
                        ...(data.sim_result_at ? [{ label: data.sim_result === 'TP_HIT' ? 'TP vuruldu' : 'SL vuruldu', val: fmtDate(data.sim_result_at), color: data.sim_result === 'TP_HIT' ? 'var(--green)' : 'var(--red)' }] : []),
                        ...(data.naive_duration_mins != null && (data.sim_result_naive === 'TP_HIT' || data.sim_result_naive === 'SL_HIT')
                          ? [{
                              label: `Naif ${data.sim_result_naive === 'TP_HIT' ? 'TP' : 'SL'} vuruldu`,
                              val: fmtDate(new Date(new Date(data.analyzed_at).getTime() + data.naive_duration_mins * 60000).toISOString()),
                              color: data.sim_result_naive === 'TP_HIT' ? 'var(--green)' : 'var(--red)',
                            }]
                          : []),
                      ].map((x, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: x.color }}>{x.label}</span>
                          <span className="mono" style={{ color: 'var(--text-2)' }}>{x.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="section-title">Grafik</div>
                  {data.candles_json?.length ? (
                    <>
                      <CandleChart
                        candles={data.candles_json}
                        entry={data.entry} tp={data.tp} sl={data.sl}
                        direction={data.direction}
                        analyzedAt={new Date(data.analyzed_at).getTime()}
                        entryTriggeredAt={data.sim_entry_triggered_at ? new Date(data.sim_entry_triggered_at).getTime() : null}
                        resultAt={data.sim_result_at ? new Date(data.sim_result_at).getTime() : null}
                        simResult={data.sim_result}
                        naiveTp={data.naive_tp}
                        naiveSl={data.naive_sl}
                        naiveDirection={data.naive_direction}
                      />
                      {(data.naive_tp != null || data.naive_sl != null) && (
                        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10 }} className="mono">
                          <span style={{ color: 'var(--text-3)' }}>┄┄ AI (kesikli)</span>
                          <span style={{ color: 'var(--text-3)' }}>┈┈ Naif (noktalı)</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-3)', borderRadius: 6 }} className="mono">candle verisi yok</div>
                  )}
                </div>

                <div className="reasons-3col">
                  {[{ label: 'Entry', val: data.entry_reason }, { label: 'TP', val: data.tp_reason }, { label: 'SL', val: data.sl_reason }].map((x, i) => (
                    <div key={i} className="data-item">
                      <div className="col-label" style={{ marginBottom: 5 }}>{x.label}</div>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{x.val}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="screenshot" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}
