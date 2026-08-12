'use client'
import { Filters, Preset, DEFAULT_FILTERS, filtersToParams, activeFilterCount, loadFilters, saveFilters, clearFilters, PRESETS_STORAGE_KEY } from '@/lib/filters'
import { FilterPanel } from '@/components/FilterPanel'
import AnalysisListUniversal, { UniversalAnalysisRow } from '@/components/AnalysisListUniversal'
import React, { useEffect, useState, useCallback } from 'react'
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
  total_pnl: number
  long_total: number; long_win_rate: number
  short_total: number; short_win_rate: number
}
interface NaiveOverview {
  total_all: number; total: number; tp_count: number; sl_count: number
  expired_count: number
  win_rate: number; avg_r_win: number; total_r: number
  long_total: number; long_win_rate: number
  short_total: number; short_win_rate: number
}
interface PullbackOverview {
  total_all: number; total: number; tp_count: number; sl_count: number
  expired_count: number; no_entry_count: number; pending_count: number
  win_rate: number; avg_r_win: number; total_r: number; avg_wait_mins: number
  long_total: number; long_win_rate: number
  short_total: number; short_win_rate: number
}
interface CumRPoint { day: string; cumulative_r: number; daily_r: number; daily_pnl: number | null; trade_count: number }
interface CumRPeriod { series: CumRPoint[]; max_drawdown: number; final_r: number }
interface CumRData { daily: CumRPeriod; weekly: CumRPeriod; monthly: CumRPeriod }

// ── Helpers ────────────────────────────────────────────────────────────────
const axisStyle = { grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } }, border: { color: '#242424' } }
const winColor  = (v: number | null | undefined) => !v ? 'var(--text-3)' : v >= 50 ? 'var(--green)' : 'var(--red)'

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ListPage() {
  const [mode, setMode] = useState<'ai' | 'naive' | 'pullback'>('ai')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [naiveOverview, setNaiveOverview] = useState<NaiveOverview | null>(null)
  const [pullbackOverview, setPullbackOverview] = useState<PullbackOverview | null>(null)
  const [cumR, setCumR] = useState<CumRData | null>(null)
  const [naiveCumR, setNaiveCumR] = useState<CumRData | null>(null)
  const [pullbackCumR, setPullbackCumR] = useState<CumRData | null>(null)
  const [cumRPeriod, setCumRPeriod] = useState<'daily'|'weekly'|'monthly'>('daily')
  const [analyses, setAnalyses] = useState<UniversalAnalysisRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [presets, setPresets] = useState<Preset[]>([])
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
    fetchAll(f, 1, mode)
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
    fetchAll(p.filters, 1, mode)
  }

  // Sadece 3 komponent için gereken veri: overview, cumR, analiz listesi.
  // Diğer 8+ endpoint (RSI, delta, WP calibration, vb.) burada YOK — bu sayfa
  // bilinçli olarak minimal. Liste render'ı AnalysisListUniversal'dan geliyor,
  // bu sayfa onu asla kendi başına render etmiyor.
  const fetchAll = useCallback((f: Filters, pg = 1, m: 'ai' | 'naive' | 'pullback' = 'ai') => {
    setLoading(true)
    const p = filtersToParams(f)
    const pView = new URLSearchParams(p)
    pView.set('view', m)

    if (m === 'ai') {
      Promise.all([
        fetch(`/api/insights-overview?${p}`,        { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/insights-cumr?${p}`,             { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/analyses?${pView}&page=${pg}`,   { cache: 'no-store' }).then(r => r.json()),
      ]).then(([ov, cr, an]) => {
        setOverview(ov)
        setCumR(cr)
        setAnalyses(an.analyses)
        setTotalPages(an.totalPages)
        setTotal(an.total)
        setLoading(false)
      })
    } else if (m === 'naive') {
      Promise.all([
        fetch(`/api/insights-overview-naive?${p}`,   { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/insights-cumr-naive?${p}`,       { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/analyses?${pView}&page=${pg}`,   { cache: 'no-store' }).then(r => r.json()),
      ]).then(([nov, ncr, an]) => {
        setNaiveOverview(nov)
        setNaiveCumR(ncr)
        setAnalyses(an.analyses)
        setTotalPages(an.totalPages)
        setTotal(an.total)
        setLoading(false)
      })
    } else {
      Promise.all([
        fetch(`/api/insights-overview-pullback?${p}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/insights-cumr-pullback?${p}`,     { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/analyses?${pView}&page=${pg}`,    { cache: 'no-store' }).then(r => r.json()),
      ]).then(([pov, pcr, an]) => {
        setPullbackOverview(pov)
        setPullbackCumR(pcr)
        setAnalyses(an.analyses)
        setTotalPages(an.totalPages)
        setTotal(an.total)
        setLoading(false)
      })
    }
  }, [])

  const handleApply = () => {
    setAppliedFilters(draftFilters)
    saveFilters(draftFilters)
    setFilterOpen(false)
    setPage(1)
    fetchAll(draftFilters, 1, mode)
  }

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
    clearFilters()
    setPage(1)
    fetchAll(DEFAULT_FILTERS, 1, mode)
  }

  const handlePage = (pg: number) => {
    setPage(pg)
    fetchAll(appliedFilters, pg, mode)
  }

  const handleModeChange = (m: 'ai' | 'naive' | 'pullback') => {
    if (m === mode) return
    setMode(m)
    setPage(1)
    fetchAll(appliedFilters, 1, m)
  }

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchAll(appliedFilters, page, mode) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchAll, appliedFilters, page, mode])

  const activeCount = activeFilterCount(appliedFilters)
  const activeOverview = mode === 'ai' ? overview : null
  const activeCumR = mode === 'ai' ? cumR : mode === 'naive' ? naiveCumR : pullbackCumR

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64 }}>
      <div className="container" style={{ paddingTop: 24 }}>

        {/* ── MODE TOGGLE ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button className={`filter-btn${mode === 'ai' ? ' active' : ''}`} style={{ fontSize: 12, padding: '6px 18px' }} onClick={() => handleModeChange('ai')}>AI</button>
          <button className={`filter-btn${mode === 'naive' ? ' active' : ''}`} style={{ fontSize: 12, padding: '6px 18px' }} onClick={() => handleModeChange('naive')}>NAIF</button>
          <button className={`filter-btn${mode === 'pullback' ? ' active' : ''}`} style={{ fontSize: 12, padding: '6px 18px' }} onClick={() => handleModeChange('pullback')}>PULLBACK</button>
        </div>

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
              <button className="filter-btn" style={{ fontSize: 11 }} onClick={() => setFilterOpen(o => !o)}>{filterOpen ? '▲ Close' : '▼ Filter'}</button>
              {activeCount > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>{activeCount} active</span>}
              {activeCount > 0 && <button className="filter-btn" style={{ fontSize: 10, padding: '2px 10px' }} onClick={handleReset}>Reset</button>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>loading...</span>}
              {savingPreset ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={presetName} onChange={e => setPresetName(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePreset()} placeholder="preset name..."
                    style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 8px', fontFamily: 'DM Mono, monospace', width: 120 }} autoFocus />
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
              <div style={{ overflowX: 'auto' }}>
                <FilterPanel filters={draftFilters} onChange={setDraftFilters} />
              </div>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14, display: 'flex', gap: 8 }}>
                <button className="filter-btn active" style={{ fontSize: 11, padding: '5px 20px' }} onClick={handleApply}>Apply</button>
                <button className="filter-btn" style={{ fontSize: 11, padding: '5px 14px', color: 'var(--text-3)' }} onClick={() => { setDraftFilters(appliedFilters); setFilterOpen(false) }}>Cancel</button>
              </div>
            </>
          )}
        </div>

        {!loading && (mode === 'ai' ? overview : mode === 'naive' ? naiveOverview : pullbackOverview) && (
          <>
            {/* ── SUMMARY CARDS ─────────────────────────────────────────── */}
            {mode === 'ai' && overview && (
              <div className="stat-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>TOTAL</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{overview.total_all}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:{overview.long_total}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:{overview.short_total}</span>
                  </div>
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
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{overview.avg_r_win != null ? `+${Number(overview.avg_r_win).toFixed(2)}R` : '—'}</div>
                </div>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>TOTAL PNL</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: Number(overview.total_pnl) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {overview.total_pnl != null ? `${Number(overview.total_pnl) > 0 ? '+' : ''}$${Math.abs(Number(overview.total_pnl)).toFixed(0)}` : '—'}
                  </div>
                </div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>TP HIT</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{overview.tp_count}</div></div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>SL HIT</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--red)' }}>{overview.sl_count}</div></div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>EXPIRED</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--amber)' }}>{overview.expired_count}</div></div>
              </div>
            )}

            {mode === 'naive' && naiveOverview && (
              <div className="stat-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>TOTAL</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{naiveOverview.total_all}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:{naiveOverview.long_total}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:{naiveOverview.short_total}</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>WIN RATE</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: winColor(Number(naiveOverview.win_rate)) }}>%{Number(naiveOverview.win_rate).toFixed(1)}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:%{Number(naiveOverview.long_win_rate).toFixed(1)}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:%{Number(naiveOverview.short_win_rate).toFixed(1)}</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>AVG WIN R</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{naiveOverview.avg_r_win != null ? `+${Number(naiveOverview.avg_r_win).toFixed(2)}R` : '—'}</div>
                </div>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>TOTAL R</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: Number(naiveOverview.total_r) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {naiveOverview.total_r != null ? `${Number(naiveOverview.total_r) > 0 ? '+' : ''}${Number(naiveOverview.total_r).toFixed(2)}R` : '—'}
                  </div>
                </div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>TP HIT</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{naiveOverview.tp_count}</div></div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>SL HIT</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--red)' }}>{naiveOverview.sl_count}</div></div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>EXPIRED</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--amber)' }}>{naiveOverview.expired_count}</div></div>
              </div>
            )}

            {mode === 'pullback' && pullbackOverview && (
              <div className="stat-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>TOTAL</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{pullbackOverview.total_all}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:{pullbackOverview.long_total}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:{pullbackOverview.short_total}</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>WIN RATE</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: winColor(Number(pullbackOverview.win_rate)) }}>%{Number(pullbackOverview.win_rate).toFixed(1)}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:%{Number(pullbackOverview.long_win_rate).toFixed(1)}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:%{Number(pullbackOverview.short_win_rate).toFixed(1)}</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>AVG WIN R</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{pullbackOverview.avg_r_win != null ? `+${Number(pullbackOverview.avg_r_win).toFixed(2)}R` : '—'}</div>
                </div>
                <div className="stat-card">
                  <div className="col-label" style={{ marginBottom: 4 }}>TOTAL R</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: Number(pullbackOverview.total_r) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {pullbackOverview.total_r != null ? `${Number(pullbackOverview.total_r) > 0 ? '+' : ''}${Number(pullbackOverview.total_r).toFixed(2)}R` : '—'}
                  </div>
                </div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>TP HIT</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{pullbackOverview.tp_count}</div></div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>SL HIT</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--red)' }}>{pullbackOverview.sl_count}</div></div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>EXPIRED</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--amber)' }}>{pullbackOverview.expired_count}</div></div>
                <div className="stat-card"><div className="col-label" style={{ marginBottom: 4 }}>NO ENTRY</div><div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-3)' }}>{pullbackOverview.no_entry_count}</div></div>
              </div>
            )}

            {/* ── CUMULATIVE R ──────────────────────────────────────────── */}
            {activeCumR && activeCumR[cumRPeriod].series.length > 0 && (() => {
              const activePeriod = activeCumR[cumRPeriod]
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
                        if (cumRPeriod === 'monthly') return d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
                        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
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

            {/* ── ANALYSIS LIST ─────────────────────────────────────────── */}
            <div style={{ marginBottom: 12 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                ANALYSIS LIST
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <button className="filter-btn" style={{ fontSize: 10, padding: '3px 12px' }} onClick={() => {
                  const p = filtersToParams(appliedFilters)
                  p.set('view', mode)
                  window.location.href = `/api/analyses-export?${p}`
                }}>↓ CSV</button>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{total} records</span>
              </div>
            </div>

            <AnalysisListUniversal analyses={analyses} />

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
