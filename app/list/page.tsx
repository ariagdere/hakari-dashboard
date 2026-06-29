'use client'
import { Filters, Preset, DEFAULT_FILTERS, filtersToParams, activeFilterCount, loadFilters, saveFilters, clearFilters, PRESETS_STORAGE_KEY } from '@/lib/filters'
import { FilterPanel } from '@/components/FilterPanel'
import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Chart as ChartJS, Tooltip, LineElement, PointElement,
  LinearScale, CategoryScale, BarElement, Filler,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Filler)

// ── Types ──────────────────────────────────────────────────────────────────

interface Overview {
  total: number; total_all: number; tp_count: number; sl_count: number
  expired_count: number; no_entry_count: number; pending_count: number
  win_rate: number; avg_r_win: number; avg_r_loss: number
  avg_duration_mins: number; total_pnl: number
  long_total: number; long_win_rate: number; long_tp: number; long_sl: number
  short_total: number; short_win_rate: number; short_tp: number; short_sl: number
  long_total_pnl: number | null; short_total_pnl: number | null
}
interface CumRPoint { day: string; cumulative_r: number; daily_r: number; daily_pnl: number | null; trade_count: number }
interface CumRPeriod { series: CumRPoint[]; max_drawdown: number; final_r: number }
interface CumRData { daily: CumRPeriod; weekly: CumRPeriod; monthly: CumRPeriod }
interface AnalysisSummary {
  id: number; analyzed_at: string; direction: string
  entry: number; tp: number; sl: number; rr: string
  sim_result: string; sim_pnl_usd: number; sim_r_multiple: number
  sim_direction: string | null
  rsi_4h: number | null; rsi_30m: number | null
  win_probability_v6: number | null
  win_probability_v6_reverse: number | null
  cluster_liq_ratio: number | null
  cluster_up_hit: boolean | null; cluster_dn_hit: boolean | null
  cluster_up_reach_pct: number | null; cluster_dn_reach_pct: number | null
  cluster_up_dist_pct: number | null; cluster_dn_dist_pct: number | null
  cluster_first_closer: string | null
}

// ── Filters (same as main page) ────────────────────────────────────────────
// (copied from insightsFilter / main page)

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ListPage() {
  const router = useRouter()
  const [overview,  setOverview]  = useState<Overview | null>(null)
  const [cumR,      setCumR]      = useState<CumRData | null>(null)
  const [cumRPeriod, setCumRPeriod] = useState<'daily'|'weekly'|'monthly'>('daily')
  const [analyses,  setAnalyses]  = useState<AnalysisSummary[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilters,   setDraftFilters]   = useState<Filters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [presets,   setPresets]   = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (saved) setPresets(JSON.parse(saved))
    } catch {}
    const f = loadFilters()
    setDraftFilters(f)
    setAppliedFilters(f)
    fetchAll(f)
  }, [])

  const savePreset = () => {
    if (!presetName.trim()) return
    const newPreset: Preset = { name: presetName.trim(), filters: { ...appliedFilters } }
    const updated = [...presets.filter(p => p.name !== newPreset.name), newPreset]
    setPresets(updated)
    try { localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated)) } catch {}
    setPresetName('')
    setSavingPreset(false)
  }

  const deletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name)
    setPresets(updated)
    try { localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated)) } catch {}
  }

  const applyPreset = (p: Preset) => {
    setDraftFilters(p.filters)
    setAppliedFilters(p.filters)
    fetchAll(p.filters)
  }

  const fetchAll = useCallback((f: Filters, pg = 1) => {
    setLoading(true)
    const p = filtersToParams(f)
    const qs = p.toString() ? `?${p}` : ''
    Promise.all([
      fetch(`/api/insights-overview${qs}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-cumr${qs}`,     { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/analyses?${p}&page=${pg}`, { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ov, cr, an]) => {
      setOverview(ov)
      setCumR(cr)
      setAnalyses(an.analyses)
      setTotalPages(an.totalPages)
      setTotal(an.total)
      setLoading(false)
    })
  }, [])

  const handleApply = () => {
    setAppliedFilters(draftFilters)
    saveFilters(draftFilters)
    setFilterOpen(false)
    setPage(1)
    fetchAll(draftFilters, 1)
  }

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
    clearFilters()
    setPage(1)
    fetchAll(DEFAULT_FILTERS, 1)
  }

  const handlePage = (pg: number) => {
    setPage(pg)
    fetchAll(appliedFilters, pg)
  }

  // fetchAll on mount handled in presets effect above
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchAll(appliedFilters, page) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchAll, appliedFilters, page])

  const activeCount = activeFilterCount(appliedFilters)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64 }}>
      <div className="container" style={{ paddingTop: 24 }}>

        {/* ── PRESET BAR ─────────────────────────────────────────────────── */}
        {presets.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="col-label" style={{ fontSize: 9 }}>PRESET</span>
            {presets.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button className="filter-btn" style={{ fontSize: 10, padding: '2px 10px', borderRadius: '4px 0 0 4px' }} onClick={() => applyPreset(p)}>{p.name}</button>
                <button onClick={() => deletePreset(p.name)} style={{ padding: '2px 6px', fontSize: 10, fontFamily: 'DM Mono, monospace', background: 'transparent', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 4px 4px 0', color: 'var(--text-3)', cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* ── FILTER PANEL ───────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 16, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="filter-btn" style={{ fontSize: 11 }} onClick={() => setFilterOpen(o => !o)}>
                {filterOpen ? '▲ Close' : '▼ Filter'}
              </button>
              {activeCount > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>{activeCount} active</span>}
              {activeCount > 0 && <button className="filter-btn" style={{ fontSize: 10, padding: '2px 10px' }} onClick={handleReset}>Reset</button>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>loading...</span>}
              {savingPreset ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={presetName} onChange={e => setPresetName(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePreset()}
                    placeholder="preset name..." style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 8px', fontFamily: 'DM Mono, monospace', width: 120 }} autoFocus />
                  <button className="filter-btn active" style={{ fontSize: 10, padding: '2px 10px' }} onClick={savePreset}>Save</button>
                  <button className="filter-btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => { setSavingPreset(false); setPresetName('') }}>Cancel</button>
                </div>
              ) : (
                activeCount > 0 && <button className="filter-btn" style={{ fontSize: 10, padding: '2px 10px' }} onClick={() => setSavingPreset(true)}>+ Save preset</button>
              )}
            </div>
          </div>

          {filterOpen && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
              <FilterPanel filters={draftFilters} onChange={setDraftFilters} />
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14, display: 'flex', gap: 8 }}>
                <button className="filter-btn active" style={{ fontSize: 11, padding: '5px 20px' }} onClick={handleApply}>Apply</button>
                <button className="filter-btn" style={{ fontSize: 11, padding: '5px 14px', color: 'var(--text-3)' }} onClick={() => { setDraftFilters(appliedFilters); setFilterOpen(false) }}>Cancel</button>
              </div>
            </>
          )}
        </div>

        {!loading && overview && (
          <>
            {/* ── SUMMARY SCORE CARDS ──────────────────────────────────────── */}
            <div className="stat-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(9, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>TOTAL</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{overview.total_all}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:{overview.long_total}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:{overview.short_total}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>SIMULATED</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{overview.total}</div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>WIN RATE</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: winColor(Number(overview.win_rate)) }}>%{Number(overview.win_rate).toFixed(1)}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:%{Number(overview.long_win_rate).toFixed(1)}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:%{Number(overview.short_win_rate).toFixed(1)}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>AVG WIN R</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>
                  {overview.avg_r_win != null ? `+${Number(overview.avg_r_win).toFixed(2)}R` : '—'}
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>TOTAL PNL</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: Number(overview.total_pnl) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {overview.total_pnl != null ? `${Number(overview.total_pnl) > 0 ? '+' : ''}$${Math.abs(Number(overview.total_pnl)).toFixed(0)}` : '—'}
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>TP HIT</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{overview.tp_count}</div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>SL HIT</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--red)' }}>{overview.sl_count}</div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>EXPIRED</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--amber)' }}>{overview.expired_count}</div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>NO ENTRY</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-2)' }}>{overview.no_entry_count}</div>
              </div>
            </div>

            {/* ── CUMULATIVE R ─────────────────────────────────────────────── */}
            {cumR && cumR[cumRPeriod].series.length > 0 && (() => {
              const activePeriod = cumR[cumRPeriod]
              const lineColor = activePeriod.final_r >= 0 ? '#4ade80' : '#f87171'
              const periodLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
              return (
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="col-label">Cumulative R</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['daily','weekly','monthly'] as const).map(period => (
                          <button key={period} className={`filter-btn${cumRPeriod === period ? ' active' : ''}`} style={{ fontSize: 9, padding: '2px 8px' }} onClick={() => setCumRPeriod(period)}>
                            {periodLabel[period]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--red)' }}>Max DD: {activePeriod.max_drawdown.toFixed(2)}R</span>
                      <span className="mono" style={{ fontSize: 11, color: lineColor, fontWeight: 600 }}>{activePeriod.final_r >= 0 ? '+' : ''}{activePeriod.final_r.toFixed(2)}R</span>
                    </div>
                  </div>
                  <div style={{ height: 160 }}>
                    <Chart type="line" data={{
                      labels: activePeriod.series.map(p => {
                        const d = new Date(p.day)
                        if (cumRPeriod === 'monthly') return d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })
                        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
                      }),
                      datasets: [
                        { type: 'line' as const, data: activePeriod.series.map(p => p.cumulative_r), borderColor: lineColor, borderWidth: 1.5, pointRadius: 0, pointHitRadius: 20, fill: true, backgroundColor: activePeriod.final_r >= 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', tension: 0.3, yAxisID: 'yR' },
                        { type: 'bar' as const, data: activePeriod.series.map(p => p.trade_count ?? 0), backgroundColor: 'rgba(96,165,250,0.25)', borderColor: 'rgba(96,165,250,0.5)', borderWidth: 1, yAxisID: 'yCount' },
                      ],
                    }} options={{
                      responsive: true, maintainAspectRatio: false,
                      interaction: { mode: 'index', intersect: false },
                      plugins: {
                        legend: { display: false },
                        tooltip: { displayColors: false, callbacks: { label: (ctx: any) => {
                          const p = activePeriod.series[ctx.dataIndex]
                          if (ctx.datasetIndex === 0) return [
                            `Cum: ${p.cumulative_r >= 0 ? '+' : ''}${p.cumulative_r.toFixed(2)}R`,
                            `Period R: ${p.daily_r >= 0 ? '+' : ''}${p.daily_r.toFixed(2)}R`,
                            p.daily_pnl != null ? `PnL: ${p.daily_pnl >= 0 ? '+' : '-'}$${Math.abs(p.daily_pnl).toFixed(0)}` : '',
                          ].filter(Boolean)
                          return `Trades: ${p.trade_count ?? 0}`
                        }}},
                      },
                      scales: {
                        x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxTicksLimit: 12 } },
                        yR: { ...axisStyle, position: 'left', ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}R` } },
                        yCount: { ...axisStyle, position: 'right', grid: { drawOnChartArea: false }, ticks: { ...axisStyle.ticks, stepSize: 1 } },
                      },
                    } as any} />
                  </div>
                </div>
              )
            })()}

            {/* ── ANALYSIS LIST ───────────────────────────────────────────── */}
            <div style={{ marginBottom: 12 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                ANALYSIS LIST
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <button className="filter-btn" style={{ fontSize: 10, padding: '3px 12px' }} onClick={() => {
                  const p = filtersToParams(appliedFilters)
                  const qs = p.toString() ? `?${p}` : ''
                  window.location.href = `/api/analyses-export${qs}`
                }}>↓ CSV</button>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{total} records</span>
              </div>
            </div>

            <div className="card">
              <div className="analysis-row" style={{ cursor: 'default' }}>
                <span className="col-label">Date</span>
                <span className="col-label">Dir</span>
                <span className="col-label">Entry</span>
                <span className="col-label">TP</span>
                <span className="col-label">SL</span>
                <span className="col-label">R/R</span>
                <span className="col-label">RSI</span>
                {['V6','V6 (Rev)'].map(h => <span key={h} className="col-label">{h}</span>)}
                {['Liq Ratio','Up Hit','Dn Hit','Up Reach','Dn Reach'].map(h => <span key={h} className="col-label">{h}</span>)}
                <span className="col-label">PnL</span>
                <span className="col-label">R</span>
                <span className="col-label">Result</span>
              </div>

              {analyses.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }} className="mono">no records found</div>
              )}

              {analyses.map(a => (
                <div key={a.id} className="analysis-row" onClick={() => router.push(`/dashboard/${a.id}`)}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmtDate(a.analyzed_at)}</span>
                  <span>{dirBadge(a.direction)}</span>
                  <span className="price" style={{ fontSize: 12 }}>${Math.round(a.entry).toLocaleString('en-US')}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--green)' }}>${Math.round(a.tp).toLocaleString('en-US')}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--red)' }}>${Math.round(a.sl).toLocaleString('en-US')}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rr}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rsi_4h != null ? Number(a.rsi_4h).toFixed(1) : '—'}</span>
                  {[a.win_probability_v6, a.win_probability_v6_reverse].map((wp, i) => (
                    <span key={i} className="mono" style={{ fontSize: 11, color: wpColor(wp) }}>
                      {wp != null ? `%${Number(wp).toFixed(0)}` : '—'}
                    </span>
                  ))}
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.cluster_liq_ratio != null ? Number(a.cluster_liq_ratio).toFixed(2) : '—'}</span>
                  <span className="mono" style={{ fontSize: 11, color: a.cluster_up_hit ? 'var(--green)' : 'var(--text-3)' }}>{a.cluster_up_hit != null ? (a.cluster_up_hit ? '✓' : '—') : '—'}</span>
                  <span className="mono" style={{ fontSize: 11, color: a.cluster_dn_hit ? 'var(--green)' : 'var(--text-3)' }}>{a.cluster_dn_hit != null ? (a.cluster_dn_hit ? '✓' : '—') : '—'}</span>
                  <span className="mono" style={{ fontSize: 11, color: a.cluster_up_reach_pct != null && Number(a.cluster_up_reach_pct) >= 75 ? 'var(--green)' : 'var(--text-2)' }}>{a.cluster_up_reach_pct != null ? `%${Number(a.cluster_up_reach_pct).toFixed(0)}` : '—'}</span>
                  <span className="mono" style={{ fontSize: 11, color: a.cluster_dn_reach_pct != null && Number(a.cluster_dn_reach_pct) >= 75 ? 'var(--green)' : 'var(--text-2)' }}>{a.cluster_dn_reach_pct != null ? `%${Number(a.cluster_dn_reach_pct).toFixed(0)}` : '—'}</span>
                  <span className={`mono ${a.sim_pnl_usd != null ? pnlClass(Number(a.sim_pnl_usd)) : 'pnl-zero'}`} style={{ fontSize: 11 }}>
                    {a.sim_pnl_usd != null ? `${Number(a.sim_pnl_usd) > 0 ? '+' : ''}$${Math.abs(Number(a.sim_pnl_usd)).toFixed(2)}` : '—'}
                  </span>
                  <span className={`mono ${a.sim_r_multiple != null ? pnlClass(a.sim_result === 'SL_HIT' ? -1 : Number(a.sim_r_multiple)) : 'pnl-zero'}`} style={{ fontSize: 11 }}>
                    {fmtR(a.sim_r_multiple, a.sim_result)}
                  </span>
                  <span>{resultBadge(a.sim_result)}</span>
                </div>
              ))}

              {analyses.map(a => (
                <div key={`m-${a.id}`} className="mobile-card" onClick={() => router.push(`/dashboard/${a.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{dirBadge(a.direction)}{resultBadge(a.sim_result)}</div>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{fmtDate(a.analyzed_at)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div><div className="col-label" style={{ marginBottom: 2 }}>Entry</div><span className="price" style={{ fontSize: 13 }}>${fmt(a.entry)}</span></div>
                    <div><div className="col-label" style={{ marginBottom: 2 }}>TP</div><span className="mono" style={{ fontSize: 13, color: 'var(--green)' }}>${fmt(a.tp)}</span></div>
                    <div><div className="col-label" style={{ marginBottom: 2 }}>SL</div><span className="mono" style={{ fontSize: 13, color: 'var(--red)' }}>${fmt(a.sl)}</span></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div><span className="col-label">R/R </span><span className="mono" style={{ fontSize: 12 }}>{a.rr}</span></div>
                    <div><span className="col-label">RSI </span><span className="mono" style={{ fontSize: 12 }}>{a.rsi_4h != null ? Number(a.rsi_4h).toFixed(1) : '—'}</span></div>
                    <div><span className="col-label">V6 </span><span className="mono" style={{ fontSize: 12, color: wpColor(a.win_probability_v6) }}>{a.win_probability_v6 != null ? `%${Number(a.win_probability_v6).toFixed(0)}` : '—'}</span></div>
                  </div>
                  {a.sim_pnl_usd != null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`mono ${pnlClass(Number(a.sim_pnl_usd))}`} style={{ fontSize: 13, fontWeight: 500 }}>
                        {Number(a.sim_pnl_usd) > 0 ? '+' : ''}${Math.abs(Number(a.sim_pnl_usd)).toFixed(2)}
                      </span>
                      <span className={`mono ${pnlClass(a.sim_result === 'SL_HIT' ? -1 : Number(a.sim_r_multiple))}`} style={{ fontSize: 11 }}>
                        {fmtR(a.sim_r_multiple, a.sim_result)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button className="filter-btn" onClick={() => handlePage(Math.max(1, page - 1))} disabled={page === 1}>← Prev</button>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 12px' }}>{page} / {totalPages}</span>
                <button className="filter-btn" onClick={() => handlePage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next →</button>
              </div>
            )}
          </>
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>loading...</span>
          </div>
        )}
      </div>
    </div>
  )
}
