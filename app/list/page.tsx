'use client'
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

interface Filters {
  direction: string; sim_result: string
  date_from: string; date_to: string
  days: number[]
  rsi_min: number; rsi_max: number
  rsi30_min: number; rsi30_max: number
  wp6_min: number; wp6_max: number
  wp6_rev_min: number; wp6_rev_max: number
  liq_ratio_min: number; liq_ratio_max: number
  cluster_up_hit: string; cluster_dn_hit: string
  h1_ls_delta_min: number; h1_ls_delta_max: number
  h1_tt_positions_delta_min: number; h1_tt_positions_delta_max: number
  h1_tt_accounts_delta_min: number; h1_tt_accounts_delta_max: number
  h1_oi_delta_min: number; h1_oi_delta_max: number
  h1_oi_mcap_delta_min: number; h1_oi_mcap_delta_max: number
  m5_ls_delta_min: number; m5_ls_delta_max: number
  m5_tt_positions_delta_min: number; m5_tt_positions_delta_max: number
  m5_tt_accounts_delta_min: number; m5_tt_accounts_delta_max: number
  m5_oi_delta_min: number; m5_oi_delta_max: number
  m5_oi_mcap_delta_min: number; m5_oi_mcap_delta_max: number
  sent_synthesis_mtf: string; sent_synthesis_h1: string; sent_synthesis_m5: string
  sent_liquidity: string
  wait_min: number; wait_max: number
  trade_dur_min: number; trade_dur_max: number
  r_min: number; r_max: number
}

interface Preset { name: string; filters: Filters }

const DEFAULT_FILTERS: Filters = {
  direction: '', sim_result: '',
  date_from: '', date_to: '',
  days: [0,1,2,3,4,5,6],
  rsi_min: 0, rsi_max: 100,
  rsi30_min: 0, rsi30_max: 100,
  wp6_min: 0, wp6_max: 100,
  wp6_rev_min: 0, wp6_rev_max: 100,
  liq_ratio_min: 0, liq_ratio_max: 10,
  cluster_up_hit: '', cluster_dn_hit: '',
  h1_ls_delta_min: -3, h1_ls_delta_max: 3,
  h1_tt_positions_delta_min: -1, h1_tt_positions_delta_max: 1,
  h1_tt_accounts_delta_min: -1, h1_tt_accounts_delta_max: 1,
  h1_oi_delta_min: -20000, h1_oi_delta_max: 20000,
  h1_oi_mcap_delta_min: -0.05, h1_oi_mcap_delta_max: 0.05,
  m5_ls_delta_min: -3, m5_ls_delta_max: 3,
  m5_tt_positions_delta_min: -1, m5_tt_positions_delta_max: 1,
  m5_tt_accounts_delta_min: -1, m5_tt_accounts_delta_max: 1,
  m5_oi_delta_min: -20000, m5_oi_delta_max: 20000,
  m5_oi_mcap_delta_min: -0.05, m5_oi_mcap_delta_max: 0.05,
  sent_synthesis_mtf: '', sent_synthesis_h1: '', sent_synthesis_m5: '',
  sent_liquidity: '',
  wait_min: 0, wait_max: 4320,
  trade_dur_min: 0, trade_dur_max: 4320,
  r_min: 0, r_max: 10,
}

function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.direction)   p.set('direction',  f.direction)
  if (f.sim_result)  p.set('sim_result', f.sim_result)
  if (f.date_from)   p.set('date_from',  f.date_from)
  if (f.date_to)     p.set('date_to',    f.date_to)
  if (f.days.length < 7) p.set('days', f.days.join(','))
  p.set('rsi_min', String(f.rsi_min));     p.set('rsi_max', String(f.rsi_max))
  p.set('rsi30_min', String(f.rsi30_min)); p.set('rsi30_max', String(f.rsi30_max))
  p.set('wp6_min', String(f.wp6_min));         p.set('wp6_max', String(f.wp6_max))
  p.set('wp6_rev_min', String(f.wp6_rev_min)); p.set('wp6_rev_max', String(f.wp6_rev_max))
  p.set('liq_ratio_min', String(f.liq_ratio_min)); p.set('liq_ratio_max', String(f.liq_ratio_max))
  if (f.cluster_up_hit) p.set('cluster_up_hit', f.cluster_up_hit)
  if (f.cluster_dn_hit) p.set('cluster_dn_hit', f.cluster_dn_hit)
  p.set('h1_ls_delta_min', String(f.h1_ls_delta_min)); p.set('h1_ls_delta_max', String(f.h1_ls_delta_max))
  p.set('h1_tt_positions_delta_min', String(f.h1_tt_positions_delta_min)); p.set('h1_tt_positions_delta_max', String(f.h1_tt_positions_delta_max))
  p.set('h1_tt_accounts_delta_min', String(f.h1_tt_accounts_delta_min)); p.set('h1_tt_accounts_delta_max', String(f.h1_tt_accounts_delta_max))
  p.set('h1_oi_delta_min', String(f.h1_oi_delta_min)); p.set('h1_oi_delta_max', String(f.h1_oi_delta_max))
  p.set('h1_oi_mcap_delta_min', String(f.h1_oi_mcap_delta_min)); p.set('h1_oi_mcap_delta_max', String(f.h1_oi_mcap_delta_max))
  p.set('m5_ls_delta_min', String(f.m5_ls_delta_min)); p.set('m5_ls_delta_max', String(f.m5_ls_delta_max))
  p.set('m5_tt_positions_delta_min', String(f.m5_tt_positions_delta_min)); p.set('m5_tt_positions_delta_max', String(f.m5_tt_positions_delta_max))
  p.set('m5_tt_accounts_delta_min', String(f.m5_tt_accounts_delta_min)); p.set('m5_tt_accounts_delta_max', String(f.m5_tt_accounts_delta_max))
  p.set('m5_oi_delta_min', String(f.m5_oi_delta_min)); p.set('m5_oi_delta_max', String(f.m5_oi_delta_max))
  p.set('m5_oi_mcap_delta_min', String(f.m5_oi_mcap_delta_min)); p.set('m5_oi_mcap_delta_max', String(f.m5_oi_mcap_delta_max))
  if (f.sent_synthesis_mtf) p.set('sent_synthesis_mtf', f.sent_synthesis_mtf)
  if (f.sent_synthesis_h1)  p.set('sent_synthesis_h1',  f.sent_synthesis_h1)
  if (f.sent_synthesis_m5)  p.set('sent_synthesis_m5',  f.sent_synthesis_m5)
  if (f.sent_liquidity)     p.set('sent_liquidity',     f.sent_liquidity)
  p.set('wait_min', String(f.wait_min));           p.set('wait_max', String(f.wait_max))
  p.set('trade_dur_min', String(f.trade_dur_min)); p.set('trade_dur_max', String(f.trade_dur_max))
  p.set('r_min', String(f.r_min));                 p.set('r_max', String(f.r_max))
  return p
}

function activeFilterCount(f: Filters): number {
  let n = 0
  if (f.direction) n++; if (f.sim_result) n++
  if (f.date_from || f.date_to) n++
  if (f.days.length < 7) n++
  if (f.rsi_min > 0 || f.rsi_max < 100) n++
  if (f.rsi30_min > 0 || f.rsi30_max < 100) n++
  if (f.wp6_min > 0 || f.wp6_max < 100) n++
  if (f.wp6_rev_min > 0 || f.wp6_rev_max < 100) n++
  if (f.liq_ratio_min > 0 || f.liq_ratio_max < 10) n++
  if (f.cluster_up_hit) n++
  if (f.cluster_dn_hit) n++
  if (f.h1_ls_delta_min > -3 || f.h1_ls_delta_max < 3) n++
  if (f.h1_tt_positions_delta_min > -1 || f.h1_tt_positions_delta_max < 1) n++
  if (f.h1_tt_accounts_delta_min > -1 || f.h1_tt_accounts_delta_max < 1) n++
  if (f.h1_oi_delta_min > -20000 || f.h1_oi_delta_max < 20000) n++
  if (f.h1_oi_mcap_delta_min > -0.05 || f.h1_oi_mcap_delta_max < 0.05) n++
  if (f.m5_ls_delta_min > -3 || f.m5_ls_delta_max < 3) n++
  if (f.m5_tt_positions_delta_min > -1 || f.m5_tt_positions_delta_max < 1) n++
  if (f.m5_tt_accounts_delta_min > -1 || f.m5_tt_accounts_delta_max < 1) n++
  if (f.m5_oi_delta_min > -20000 || f.m5_oi_delta_max < 20000) n++
  if (f.m5_oi_mcap_delta_min > -0.05 || f.m5_oi_mcap_delta_max < 0.05) n++
  if (f.sent_synthesis_mtf) n++; if (f.sent_synthesis_h1) n++
  if (f.sent_synthesis_m5) n++; if (f.sent_liquidity) n++
  if (f.wait_min > 0 || f.wait_max < 4320) n++
  if (f.trade_dur_min > 0 || f.trade_dur_max < 4320) n++
  if (f.r_min > 0 || f.r_max < 10) n++
  return n
}

// ── Helpers ────────────────────────────────────────────────────────────────

const winColor  = (v: number | null | undefined) => !v ? 'var(--text-3)' : v >= 50 ? 'var(--green)' : 'var(--red)'
const wpColor   = (v: number | null | undefined) => !v ? 'var(--text-3)' : v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)'
const pnlClass  = (v: number) => v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero'
const fmtDate   = (s: string) => { const d = new Date(s); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` }
const fmt       = (v: number) => Math.round(v).toLocaleString('en-US')
const fmtR      = (r: number | null, result: string) => { if (r == null) return '—'; const v = result === 'SL_HIT' ? -1 : Number(r); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` }
const dirBadge  = (d: string) => <span className={`badge ${d === 'LONG' ? 'badge-long' : 'badge-short'}`}>{d}</span>
const resultBadge = (r: string) => {
  const map: Record<string, string> = { TP_HIT: 'badge-tp', SL_HIT: 'badge-sl', EXPIRED: 'badge-exp', NO_ENTRY: 'badge-ne', PENDING: 'badge-pending' }
  const lbl: Record<string, string> = { TP_HIT: 'TP', SL_HIT: 'SL', EXPIRED: 'EXP', NO_ENTRY: 'N/E', PENDING: '...' }
  return <span className={`badge ${map[r] || ''}`}>{lbl[r] || r}</span>
}

const axisStyle = {
  grid: { color: 'rgba(255,255,255,0.04)' },
  ticks: { color: '#666', font: { family: 'DM Mono, monospace', size: 9 } },
  border: { color: 'rgba(255,255,255,0.06)' },
}

// ── Simple Filter Panel (direction, result, date, wp6, liq) ───────────────

function QuickFilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (key: keyof Filters, val: any) => onChange({ ...filters, [key]: val })
  const btnStyle = (active: boolean) => ({
    padding: '3px 10px', fontSize: 10, fontFamily: 'DM Mono, monospace',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#000' : 'var(--text-3)',
    border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
  })
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '4px 0' }}>
      {/* Direction */}
      <div>
        <div className="col-label" style={{ marginBottom: 6 }}>Direction</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['', 'LONG', 'SHORT'].map(v => (
            <button key={v} style={btnStyle(filters.direction === v)} onClick={() => set('direction', v)}>
              {v || 'All'}
            </button>
          ))}
        </div>
      </div>
      {/* Result */}
      <div>
        <div className="col-label" style={{ marginBottom: 6 }}>Result</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['', 'All'], ['TP_HIT', 'TP'], ['SL_HIT', 'SL'], ['EXPIRED', 'EXP'], ['NO_ENTRY', 'N/E']].map(([v, l]) => (
            <button key={v} style={btnStyle(filters.sim_result === v)} onClick={() => set('sim_result', v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {/* V6 WP */}
      <div>
        <div className="col-label" style={{ marginBottom: 6 }}>V6 min</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 50, 60, 70, 80].map(v => (
            <button key={v} style={btnStyle(filters.wp6_min === v)} onClick={() => set('wp6_min', v)}>
              {v === 0 ? 'All' : `${v}+`}
            </button>
          ))}
        </div>
      </div>
      {/* Date from/to */}
      <div>
        <div className="col-label" style={{ marginBottom: 6 }}>Date</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={filters.date_from} onChange={e => set('date_from', e.target.value)}
            style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }} />
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>→</span>
          <input type="date" value={filters.date_to} onChange={e => set('date_to', e.target.value)}
            style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }} />
        </div>
      </div>
    </div>
  )
}

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
      const saved = localStorage.getItem('analysis_presets')
      if (saved) setPresets(JSON.parse(saved))
    } catch {}
  }, [])

  const savePreset = () => {
    if (!presetName.trim()) return
    const newPreset: Preset = { name: presetName.trim(), filters: { ...appliedFilters } }
    const updated = [...presets.filter(p => p.name !== newPreset.name), newPreset]
    setPresets(updated)
    try { localStorage.setItem('analysis_presets', JSON.stringify(updated)) } catch {}
    setPresetName('')
    setSavingPreset(false)
  }

  const deletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name)
    setPresets(updated)
    try { localStorage.setItem('analysis_presets', JSON.stringify(updated)) } catch {}
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
    setFilterOpen(false)
    setPage(1)
    fetchAll(draftFilters, 1)
  }

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
    setPage(1)
    fetchAll(DEFAULT_FILTERS, 1)
  }

  const handlePage = (pg: number) => {
    setPage(pg)
    fetchAll(appliedFilters, pg)
  }

  useEffect(() => { fetchAll(DEFAULT_FILTERS) }, [fetchAll])
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
              <QuickFilterPanel filters={draftFilters} onChange={setDraftFilters} />
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
