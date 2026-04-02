'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const CandleChart = dynamic(() => import('@/components/CandleChart'), { ssr: false })

interface Analysis {
  id: number; analyzed_at: string; direction: string; order_type: string
  entry: number; tp: number; sl: number; rr: string
  risk_usd: number; position_size_btc: number
  market_score_value: number; confidence_value: number; rsi_4h: number
  sim_result: string; sim_pnl_usd: number; sim_r_multiple: number
  sim_entry_to_result_minutes: number
  sim_entry_triggered_at: string; sim_result_at: string
  sim_max_favorable_move: number; sim_max_adverse_move: number
  synthesis_h1: string; synthesis_m5: string; synthesis_mtf: string
  h1_global_ls_ratio_comment: string; h1_global_ls_ratio_is_critical: boolean
  h1_top_trader_accounts_comment: string; h1_top_trader_accounts_is_critical: boolean
  h1_top_trader_positions_comment: string; h1_top_trader_positions_is_critical: boolean
  h1_open_interest_comment: string; h1_open_interest_is_critical: boolean
  h1_oi_marketcap_ratio_comment: string; h1_oi_marketcap_ratio_is_critical: boolean
  m5_global_ls_ratio_comment: string; m5_global_ls_ratio_is_critical: boolean
  m5_top_trader_accounts_comment: string; m5_top_trader_accounts_is_critical: boolean
  m5_top_trader_positions_comment: string; m5_top_trader_positions_is_critical: boolean
  m5_open_interest_comment: string; m5_open_interest_is_critical: boolean
  m5_oi_marketcap_ratio_comment: string; m5_oi_marketcap_ratio_is_critical: boolean
  market_score_reason_1: string; market_score_reason_2: string
  market_score_reason_3: string; market_score_reason_4: string
  confidence_reason_1: string; confidence_reason_2: string
  confidence_reason_3: string; confidence_reason_4: string
  upside_zone_1: string; upside_comment_1: string
  upside_zone_2: string; upside_comment_2: string
  downside_zone_1: string; downside_comment_1: string
  downside_zone_2: string; downside_comment_2: string
  liquidity_summary_note: string
  entry_reason: string; tp_reason: string; sl_reason: string
  spot_pct: number; leverage_pct: number; market_power_comment: string
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
const fmt = (n: number) => n?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? '—'
const fmtDate = (s: string) => new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtMins = (m: number) => { if (!m) return '—'; const h = Math.floor(m / 60); const min = m % 60; return h > 0 ? `${h}s ${min}dk` : `${min}dk` }
const fmtR = (v: number | null, result?: string) => {
  if (v == null) return '—'
  const signed = result === 'SL_HIT' ? -Math.abs(v) : result === 'TP_HIT' ? Math.abs(v) : v
  return (signed > 0 ? '+' : '') + signed.toFixed(2) + 'R'
}

function DataRow({ label, comment, critical }: { label: string; comment: string; critical: boolean }) {
  return (
    <div className={`data-item${critical ? ' critical' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span className="col-label">{label}</span>
        {critical && <span style={{ fontSize: 9, color: 'var(--amber)', fontFamily: 'DM Mono, monospace' }}>● KRİTİK</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.65 }}>{comment || '—'}</p>
    </div>
  )
}

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
            {/* Scorecard */}
            <div className="scorecard-grid">
              <ScoreCard label="Yön" value={data.direction} color={data.direction === 'SHORT' ? 'var(--red)' : 'var(--green)'} />
              <ScoreCard label="Güven" value={`%${data.confidence_value}`} />
              <ScoreCard label="Skor" value={`${data.market_score_value}/10`} />
              <ScoreCard label="4H RSI" value={data.rsi_4h ?? '—'} />
              <ScoreCard label="R/R" value={data.rr} />
              <ScoreCard label="Entry" value={`$${fmt(data.entry)}`} color="var(--amber)" sub={data.order_type?.replace('ORDER_TYPE_', '')} />
              <ScoreCard label="SL" value={`$${fmt(data.sl)}`} color="var(--red)" />
              <ScoreCard label="TP" value={`$${fmt(data.tp)}`} color="var(--green)" />
              <ScoreCard label="Size" value={`${data.position_size_btc} BTC`} sub={`$${data.risk_usd} risk`} />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              <button className={`tab-btn${tab === 'analysis' ? ' active' : ''}`} onClick={() => setTab('analysis')}>Analiz</button>
              <button className={`tab-btn${tab === 'simulation' ? ' active' : ''}`} onClick={() => setTab('simulation')}>Simülasyon</button>
            </div>

            {tab === 'analysis' && (
              <>
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
                  <div className="section-title">1H — Ham Veri</div>
                  <div className="data-grid">
                    <DataRow label="Global L/S" comment={data.h1_global_ls_ratio_comment} critical={data.h1_global_ls_ratio_is_critical} />
                    <DataRow label="TT Accounts" comment={data.h1_top_trader_accounts_comment} critical={data.h1_top_trader_accounts_is_critical} />
                    <DataRow label="TT Positions" comment={data.h1_top_trader_positions_comment} critical={data.h1_top_trader_positions_is_critical} />
                    <DataRow label="Open Interest" comment={data.h1_open_interest_comment} critical={data.h1_open_interest_is_critical} />
                    <DataRow label="OI/MCap" comment={data.h1_oi_marketcap_ratio_comment} critical={data.h1_oi_marketcap_ratio_is_critical} />
                  </div>
                </div>

                <div>
                  <div className="section-title">5M — Ham Veri</div>
                  <div className="data-grid">
                    <DataRow label="Global L/S" comment={data.m5_global_ls_ratio_comment} critical={data.m5_global_ls_ratio_is_critical} />
                    <DataRow label="TT Accounts" comment={data.m5_top_trader_accounts_comment} critical={data.m5_top_trader_accounts_is_critical} />
                    <DataRow label="TT Positions" comment={data.m5_top_trader_positions_comment} critical={data.m5_top_trader_positions_is_critical} />
                    <DataRow label="Open Interest" comment={data.m5_open_interest_comment} critical={data.m5_open_interest_is_critical} />
                    <DataRow label="OI/MCap" comment={data.m5_oi_marketcap_ratio_comment} critical={data.m5_oi_marketcap_ratio_is_critical} />
                  </div>
                </div>

                <div className="synthesis-2col">
                  <div>
                    <div className="section-title">Skor Gerekçeleri</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[data.market_score_reason_1, data.market_score_reason_2, data.market_score_reason_3, data.market_score_reason_4].map((r, i) => (
                        <div key={i} className="data-item"><p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{r}</p></div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="section-title">Güven Gerekçeleri</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[data.confidence_reason_1, data.confidence_reason_2, data.confidence_reason_3, data.confidence_reason_4].map((r, i) => (
                        <div key={i} className="data-item"><p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{r}</p></div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="section-title">Likidite Haritası</div>
                  <div className="synthesis-2col" style={{ marginBottom: 8 }}>
                    {[
                      { zone: data.upside_zone_1, comment: data.upside_comment_1, dir: 'up' },
                      { zone: data.upside_zone_2, comment: data.upside_comment_2, dir: 'up' },
                      { zone: data.downside_zone_1, comment: data.downside_comment_1, dir: 'down' },
                      { zone: data.downside_zone_2, comment: data.downside_comment_2, dir: 'down' },
                    ].map((l, i) => (
                      <div key={i} className="data-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: l.dir === 'up' ? 'var(--green)' : 'var(--red)' }}>{l.dir === 'up' ? '▲' : '▼'}</span>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{l.zone}</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{l.comment}</p>
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

                <div>
                  <div className="section-title">Not</div>
                  <textarea className="note-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Analize not ekle..." />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="save-btn" onClick={saveNote} disabled={saving}>
                      {saving ? 'kaydediliyor...' : saved ? '✓ kaydedildi' : 'kaydet'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {tab === 'simulation' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {[
                    { label: 'Sonuç', value: resultBadge(data.sim_result) },
                    { label: 'PnL', value: data.sim_pnl_usd != null ? `${data.sim_pnl_usd > 0 ? '+' : ''}$${Math.abs(data.sim_pnl_usd).toFixed(2)}` : '—', color: data.sim_pnl_usd > 0 ? 'var(--green)' : data.sim_pnl_usd < 0 ? 'var(--red)' : 'var(--text-3)' },
                    { label: 'R Multiple', value: fmtR(data.sim_r_multiple, data.sim_result), color: (data.sim_r_multiple ?? 0) > 0 && data.sim_result === 'TP_HIT' ? 'var(--green)' : data.sim_result === 'SL_HIT' ? 'var(--red)' : 'var(--text-3)' },
                    { label: 'Süre', value: fmtMins(data.sim_entry_to_result_minutes) },
                    { label: 'Max Kazanç', value: data.sim_max_favorable_move ? `$${fmt(data.sim_max_favorable_move * data.position_size_btc)}` : '—', color: 'var(--green)' },
                    { label: 'Max Kayıp', value: data.sim_max_adverse_move ? `$${fmt(data.sim_max_adverse_move * data.position_size_btc)}` : '—', color: 'var(--red)' },
                    { label: 'Spot / Lev', value: `%${data.spot_pct} / %${data.leverage_pct}` },
                  ].map((s, i) => (
                    <div key={i} className="stat-card">
                      <div className="col-label" style={{ marginBottom: 6 }}>{s.label}</div>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 500, color: (s as any).color || 'var(--text)' }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {data.sim_entry_triggered_at && (
                  <div className="data-item">
                    <div className="section-title" style={{ marginBottom: 10 }}>Zaman Çizelgesi</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { label: 'Analiz', val: fmtDate(data.analyzed_at), color: 'var(--text-2)' },
                        { label: 'Entry tetiklendi', val: fmtDate(data.sim_entry_triggered_at), color: 'var(--amber)' },
                        ...(data.sim_result_at ? [{ label: data.sim_result === 'TP_HIT' ? 'TP vuruldu' : 'SL vuruldu', val: fmtDate(data.sim_result_at), color: data.sim_result === 'TP_HIT' ? 'var(--green)' : 'var(--red)' }] : []),
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
                    <CandleChart
                      candles={data.candles_json}
                      entry={data.entry} tp={data.tp} sl={data.sl}
                      direction={data.direction}
                      analyzedAt={new Date(data.analyzed_at).getTime()}
                      entryTriggeredAt={data.sim_entry_triggered_at ? new Date(data.sim_entry_triggered_at).getTime() : null}
                      resultAt={data.sim_result_at ? new Date(data.sim_result_at).getTime() : null}
                      simResult={data.sim_result}
                    />
                  ) : (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-3)', borderRadius: 6 }} className="mono">candle verisi yok</div>
                  )}
                </div>

                {data.market_power_comment && (
                  <div>
                    <div className="section-title">Market Power</div>
                    <div className="synthesis-block">{data.market_power_comment}</div>
                  </div>
                )}

                <div className="reasons-3col">
                  {[{ label: 'Entry', val: data.entry_reason }, { label: 'TP', val: data.tp_reason }, { label: 'SL', val: data.sl_reason }].map((x, i) => (
                    <div key={i} className="data-item">
                      <div className="col-label" style={{ marginBottom: 5 }}>{x.label}</div>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{x.val}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="section-title">Not</div>
                  <textarea className="note-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Analize not ekle..." />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="save-btn" onClick={saveNote} disabled={saving}>
                      {saving ? 'kaydediliyor...' : saved ? '✓ kaydedildi' : 'kaydet'}
                    </button>
                  </div>
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
