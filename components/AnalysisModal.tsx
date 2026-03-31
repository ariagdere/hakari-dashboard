'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const CandleChart = dynamic(() => import('./CandleChart'), { ssr: false })

interface Analysis {
  id: number
  analyzed_at: string
  direction: string
  order_type: string
  entry: number
  tp: number
  sl: number
  rr: string
  risk_usd: number
  position_size_btc: number
  market_score_value: number
  confidence_value: number
  rsi_4h: number
  sim_result: string
  sim_pnl_usd: number
  sim_entry_to_result_minutes: number
  sim_entry_triggered_at: string
  sim_result_at: string
  sim_max_favorable_move: number
  sim_max_adverse_move: number
  synthesis_h1: string
  synthesis_m5: string
  synthesis_mtf: string
  h1_global_ls_ratio_comment: string
  h1_global_ls_ratio_is_critical: boolean
  h1_top_trader_accounts_comment: string
  h1_top_trader_accounts_is_critical: boolean
  h1_top_trader_positions_comment: string
  h1_top_trader_positions_is_critical: boolean
  h1_open_interest_comment: string
  h1_open_interest_is_critical: boolean
  h1_oi_marketcap_ratio_comment: string
  h1_oi_marketcap_ratio_is_critical: boolean
  m5_global_ls_ratio_comment: string
  m5_global_ls_ratio_is_critical: boolean
  m5_top_trader_accounts_comment: string
  m5_top_trader_accounts_is_critical: boolean
  m5_top_trader_positions_comment: string
  m5_top_trader_positions_is_critical: boolean
  m5_open_interest_comment: string
  m5_open_interest_is_critical: boolean
  m5_oi_marketcap_ratio_comment: string
  m5_oi_marketcap_ratio_is_critical: boolean
  market_score_reason_1: string
  market_score_reason_2: string
  market_score_reason_3: string
  market_score_reason_4: string
  confidence_reason_1: string
  confidence_reason_2: string
  confidence_reason_3: string
  confidence_reason_4: string
  upside_zone_1: string
  upside_comment_1: string
  upside_zone_2: string
  upside_comment_2: string
  downside_zone_1: string
  downside_comment_1: string
  downside_zone_2: string
  downside_comment_2: string
  liquidity_summary_note: string
  entry_reason: string
  tp_reason: string
  sl_reason: string
  spot_pct: number
  leverage_pct: number
  market_power_comment: string
  candles_json: any[]
}

function dirBadge(d: string) {
  if (d === 'SHORT') return <span className="badge badge-short">SHORT</span>
  if (d === 'LONG') return <span className="badge badge-long">LONG</span>
  return <span className="badge badge-wait">WAIT</span>
}

function resultBadge(r: string) {
  if (!r) return <span className="badge badge-pend">—</span>
  if (r === 'TP_HIT') return <span className="badge badge-tp">TP HIT</span>
  if (r === 'SL_HIT') return <span className="badge badge-sl">SL HIT</span>
  if (r === 'EXPIRED') return <span className="badge badge-exp">EXPIRED</span>
  return <span className="badge badge-ne">NO ENTRY</span>
}

function pnlColor(v: number) {
  if (v > 0) return 'pnl-pos'
  if (v < 0) return 'pnl-neg'
  return 'pnl-zero'
}

function fmt(n: number) {
  return n?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function fmtDate(s: string) {
  const d = new Date(s)
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtMins(m: number) {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}s ${min}dk` : `${min}dk`
}

function DataRow({ label, comment, critical }: { label: string; comment: string; critical: boolean }) {
  return (
    <div className={`data-item${critical ? ' critical' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span className="col-label">{label}</span>
        {critical && <span style={{ fontSize: 9, color: '#f59e0b', fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em' }}>● KRİTİK</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{comment || '—'}</p>
    </div>
  )
}

export default function AnalysisModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [data, setData] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'chart' | 'data' | 'sim'>('chart')

  useEffect(() => {
    fetch(`/api/analysis/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [id])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>#{id}</span>
            {data && dirBadge(data.direction)}
            {data && resultBadge(data.sim_result)}
            {data && <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtDate(data.analyzed_at)}</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }} className="mono">yükleniyor...</div>}

        {data && !loading && (
          <>
            {/* Key metrics */}
            <div className="metric-row" style={{ marginBottom: 20 }}>
              <div className="metric-cell">
                <div className="col-label" style={{ marginBottom: 4 }}>Giriş</div>
                <div className="price" style={{ fontSize: 20, color: '#f59e0b' }}>${fmt(data.entry)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{data.order_type?.replace('ORDER_TYPE_', '')}</div>
              </div>
              <div className="metric-cell">
                <div className="col-label" style={{ marginBottom: 4 }}>Take Profit</div>
                <div className="price" style={{ fontSize: 20, color: 'var(--green)' }}>${fmt(data.tp)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{data.rr}</div>
              </div>
              <div className="metric-cell">
                <div className="col-label" style={{ marginBottom: 4 }}>Stop Loss</div>
                <div className="price" style={{ fontSize: 20, color: 'var(--red)' }}>${fmt(data.sl)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Risk ${data.risk_usd}</div>
              </div>
              <div className="metric-cell">
                <div className="col-label" style={{ marginBottom: 4 }}>Skor / Güven</div>
                <div style={{ fontSize: 20, fontWeight: 500 }}>{data.market_score_value}<span style={{ fontSize: 13, color: 'var(--text-3)' }}>/10</span></div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>%{data.confidence_value} güven</div>
              </div>
              <div className="metric-cell">
                <div className="col-label" style={{ marginBottom: 4 }}>Pozisyon</div>
                <div className="price" style={{ fontSize: 20 }}>{data.position_size_btc} BTC</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>RSI 4H: {data.rsi_4h ?? '—'}</div>
              </div>
              <div className="metric-cell">
                <div className="col-label" style={{ marginBottom: 4 }}>Sonuç PnL</div>
                <div className={`price ${pnlColor(data.sim_pnl_usd)}`} style={{ fontSize: 20 }}>
                  {data.sim_pnl_usd != null ? `${data.sim_pnl_usd > 0 ? '+' : ''}$${Math.abs(data.sim_pnl_usd).toFixed(2)}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fmtMins(data.sim_entry_to_result_minutes)}</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
              {(['chart', 'data', 'sim'] as const).map(t => (
                <button key={t} className={`filter-btn${tab === t ? ' active' : ''}`}
                  style={{ borderBottom: tab === t ? '1px solid var(--text)' : '1px solid transparent', borderRadius: '4px 4px 0 0', marginBottom: -1 }}
                  onClick={() => setTab(t)}>
                  {t === 'chart' ? 'Grafik' : t === 'data' ? 'Ham Veri' : 'Simülasyon'}
                </button>
              ))}
            </div>

            {/* Chart tab */}
            {tab === 'chart' && (
              <div>
                {data.candles_json?.length ? (
                  <CandleChart
                    candles={data.candles_json}
                    entry={data.entry}
                    tp={data.tp}
                    sl={data.sl}
                    direction={data.direction}
                    entryTriggeredAt={data.sim_entry_triggered_at ? new Date(data.sim_entry_triggered_at).getTime() : null}
                    resultAt={data.sim_result_at ? new Date(data.sim_result_at).getTime() : null}
                    simResult={data.sim_result}
                  />
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }} className="mono">candle verisi yok</div>
                )}

                {/* Sentez */}
                <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
                  <div>
                    <div className="section-title">MTF Sentez</div>
                    <div className="synthesis-block">{data.synthesis_mtf}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div className="section-title">1H Sentez</div>
                      <div className="synthesis-block">{data.synthesis_h1}</div>
                    </div>
                    <div>
                      <div className="section-title">5M Sentez</div>
                      <div className="synthesis-block">{data.synthesis_m5}</div>
                    </div>
                  </div>
                </div>

                {/* Likidite */}
                <div style={{ marginTop: 24 }}>
                  <div className="section-title">Likidite Haritası</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                  {data.liquidity_summary_note && (
                    <div className="synthesis-block" style={{ marginTop: 8, fontSize: 12 }}>{data.liquidity_summary_note}</div>
                  )}
                </div>
              </div>
            )}

            {/* Data tab */}
            {tab === 'data' && (
              <div style={{ display: 'grid', gap: 20 }}>
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
                <div>
                  <div className="section-title">Skor Gerekçeleri</div>
                  <div className="data-grid">
                    {[data.market_score_reason_1, data.market_score_reason_2, data.market_score_reason_3, data.market_score_reason_4].map((r, i) => (
                      <div key={i} className="data-item">
                        <span className="col-label" style={{ marginBottom: 4, display: 'block' }}>Skor {i + 1}</span>
                        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="section-title">Güven Gerekçeleri</div>
                  <div className="data-grid">
                    {[data.confidence_reason_1, data.confidence_reason_2, data.confidence_reason_3, data.confidence_reason_4].map((r, i) => (
                      <div key={i} className="data-item">
                        <span className="col-label" style={{ marginBottom: 4, display: 'block' }}>Güven {i + 1}</span>
                        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Simulation tab */}
            {tab === 'sim' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="metric-row">
                  <div className="metric-cell">
                    <div className="col-label" style={{ marginBottom: 4 }}>Sonuç</div>
                    <div style={{ marginTop: 4 }}>{resultBadge(data.sim_result)}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="col-label" style={{ marginBottom: 4 }}>PnL</div>
                    <div className={`price ${pnlColor(data.sim_pnl_usd)}`} style={{ fontSize: 20 }}>
                      {data.sim_pnl_usd != null ? `${data.sim_pnl_usd > 0 ? '+' : ''}$${Math.abs(data.sim_pnl_usd).toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div className="metric-cell">
                    <div className="col-label" style={{ marginBottom: 4 }}>Süre</div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>{fmtMins(data.sim_entry_to_result_minutes)}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="col-label" style={{ marginBottom: 4 }}>Max Kazanç</div>
                    <div className="price pnl-pos" style={{ fontSize: 18 }}>{data.sim_max_favorable_move ? `$${fmt(data.sim_max_favorable_move)}` : '—'}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="col-label" style={{ marginBottom: 4 }}>Max Kayıp</div>
                    <div className="price pnl-neg" style={{ fontSize: 18 }}>{data.sim_max_adverse_move ? `$${fmt(data.sim_max_adverse_move)}` : '—'}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="col-label" style={{ marginBottom: 4 }}>Spot / Lev</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>%{data.spot_pct} / %{data.leverage_pct}</div>
                  </div>
                </div>

                {data.sim_entry_triggered_at && (
                  <div className="data-item">
                    <div className="col-label" style={{ marginBottom: 6 }}>Zaman Çizelgesi</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-3)' }}>Analiz</span>
                        <span className="mono">{fmtDate(data.analyzed_at)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#f59e0b' }}>Entry tetiklendi</span>
                        <span className="mono">{fmtDate(data.sim_entry_triggered_at)}</span>
                      </div>
                      {data.sim_result_at && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: data.sim_result === 'TP_HIT' ? 'var(--green)' : 'var(--red)' }}>
                            {data.sim_result === 'TP_HIT' ? 'TP vuruldu' : 'SL vuruldu'}
                          </span>
                          <span className="mono">{fmtDate(data.sim_result_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {data.market_power_comment && (
                  <div>
                    <div className="section-title">Market Power</div>
                    <div className="synthesis-block">{data.market_power_comment}</div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Entry Gerekçe', val: data.entry_reason },
                    { label: 'TP Gerekçe', val: data.tp_reason },
                    { label: 'SL Gerekçe', val: data.sl_reason },
                  ].map((x, i) => (
                    <div key={i} className="data-item">
                      <div className="col-label" style={{ marginBottom: 6 }}>{x.label}</div>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{x.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
