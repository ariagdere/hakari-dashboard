'use client'
import React, { useEffect, useState, useCallback } from 'react'
import {
  Chart as ChartJS,
  Tooltip, LineElement, PointElement,
  LinearScale, CategoryScale, BarElement, Filler,
} from 'chart.js'
import { Bar, Scatter, Line } from 'react-chartjs-2'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Filler)

interface Overview {
  total: number; total_all: number; tp_count: number; sl_count: number
  expired_count: number; no_entry_count: number; pending_count: number
  win_rate: number; avg_r_win: number; avg_r_loss: number
  avg_duration_mins: number; total_pnl: number
  seq_total: number; seq_win_rate: number
  long_total: number; long_win_rate: number
  short_total: number; short_win_rate: number
}
interface ScoringRow  { score: number; total: number; wins: number; win_rate: number }
interface RsiRow      { rsi_zone: string; total: number; wins: number; win_rate: number }
interface ScoringData { by_score: ScoringRow[]; by_confidence: ScoringRow[]; by_rsi: RsiRow[]; by_rsi_long: RsiRow[]; by_rsi_short: RsiRow[] }
interface IndicatorRow { indicator: string; sentiment: string; total: number; wins: number; win_rate: number }
interface MtfRow       { h1: string; m5: string; mtf: string; total: number; wins: number; win_rate: number }
interface LiqRow       { liquidity: string; market_power: string; total: number; wins: number; win_rate: number }
interface SentimentData {
  indicators: IndicatorRow[]; indicators_long: IndicatorRow[]; indicators_short: IndicatorRow[]
  mtf_confluence: MtfRow[]; mtf_confluence_long: MtfRow[]; mtf_confluence_short: MtfRow[]
  liquidity_cross: LiqRow[]
}
interface DirSentRow   { direction: string; mtf_strength: string; total: number; wins: number; win_rate: number }
interface ScoreSentRow { score_bucket: string; mtf_strength: string; total: number; wins: number; win_rate: number }
interface CombRow      { pair_name?: string; trio_name?: string; combination: string; total: number; wins: number; win_rate: number }
interface PairsData    { direction_x_sentiment: DirSentRow[]; score_x_sentiment: ScoreSentRow[]; long_pairs: CombRow[]; short_pairs: CombRow[]; long_trios: CombRow[]; short_trios: CombRow[] }
interface RHistRow   { sim_result: string; r_bucket: number; count: number }
interface ScatterRow { id: number; sim_result: string; mfe: number; mae: number; r_multiple: number; score: number; risk_usd: number }
interface MfeRow     { mfe_bucket: string; total: number; tp_count: number; avg_mins: number }
interface RmaeData   { r_histogram: RHistRow[]; scatter: ScatterRow[]; mfe_distribution: MfeRow[] }
interface HourlyRow  { hour: number; total: number; tp_count: number; sl_count: number; win_rate: number; avg_r_tp: number | null }
interface HourlyData { by_analysis: HourlyRow[] }
interface DailyRow   { day: string; total: number; tp_count: number; sl_count: number; win_rate: number }
interface DailyData  { daily: DailyRow[] }
interface SweepPoint { r: number; pnl: number; wins: number; losses: number; win_rate: number }
interface OptimalRData {
  sweep: SweepPoint[]
  optimal_r: number | null
  optimal_pnl: number
  optimal_wins: number
  optimal_losses: number
  optimal_win_rate: number
  current_avg_r: number | null
  total_trades: number
}
interface WinProbBucket  { bucket: string; sort_order: number; avg_predicted: number; total: number; wins: number; actual_win_rate: number; total_r: number | null; avg_r: number | null }
interface WinProbDir     { direction: string; avg_probability: number; total: number; actual_win_rate: number }
interface WinProbScatter { predicted: number; actual_win_rate: number; total: number }
interface WinProbData    { buckets: WinProbBucket[]; by_dir: WinProbDir[]; scatter: WinProbScatter[] }
interface CumRPoint     { day: string; cumulative_r: number; daily_r: number }
interface CumRData      { series: CumRPoint[]; max_drawdown: number; final_r: number }
interface EntryWaitBucket { bucket: string; sort_order: number; total: number; wins: number; win_rate: number; avg_r: number | null; total_r: number | null; avg_wait_mins: number }
interface EntryWaitData   { buckets: EntryWaitBucket[] }

const N = (v: any, d = 1) => v == null ? '—' : Number(v).toFixed(d)
const winColor = (v: number | null) => {
  if (v == null) return 'var(--text-3)'
  if (v >= 50) return 'var(--green)'
  if (v >= 40) return 'var(--amber)'
  return 'var(--red)'
}
const sentLabel = (s: string) => {
  if (!s) return { label: '—', color: 'var(--text-3)' }
  if (s === 'bullish')          return { label: 'bullish',  color: 'var(--green)' }
  if (s === 'bearish')          return { label: 'bearish',  color: 'var(--red)' }
  if (s === 'buying_pressure')  return { label: 'buying',   color: 'var(--green)' }
  if (s === 'selling_pressure') return { label: 'selling',  color: 'var(--red)' }
  if (s === 'strong')           return { label: 'strong',   color: 'var(--green)' }
  if (s === 'weak')             return { label: 'weak',     color: 'var(--red)' }
  return { label: s, color: 'var(--amber)' }
}
const CHART_DEFAULTS = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
const axisStyle = {
  grid: { color: '#1a1a1a' },
  ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } },
  border: { color: '#242424' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="stat-card">
      <div className="col-label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}

function WinBar({ rate, total }: { rate: number | null; total: number }) {
  const val = rate ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(val, 100)}%`, height: '100%', background: winColor(rate), borderRadius: 2 }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: winColor(rate), minWidth: 40, textAlign: 'right' }}>{val.toFixed(1)}%</span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', minWidth: 32, textAlign: 'right' }}>n={total}</span>
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="col-label" style={{ marginBottom: 12, fontSize: 11 }}>{children}</div>
}

function CombTable({ rows, nameKey }: { rows: any[]; nameKey: string }) {
  if (!rows?.length) return <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>veri yok</span>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
        <thead>
          <tr>{['#', 'Tip', 'Kombinasyon', 'n', 'Win%'].map((h, i) => (
            <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 0', color: 'var(--text-3)', width: 20 }}>{i + 1}</td>
              <td style={{ padding: '6px 0', color: 'var(--text-3)', fontSize: 10, minWidth: 80 }}>{row[nameKey]}</td>
              <td style={{ padding: '6px 0', color: 'var(--text-2)' }}>{row.combination}</td>
              <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)', width: 32 }}>{row.total}</td>
              <td style={{ padding: '6px 0', textAlign: 'right', color: winColor(Number(row.win_rate)), fontWeight: 500, width: 48 }}>{Number(row.win_rate).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 } as const

// ── filter types ──────────────────────────────────────────────────────────────

interface Filters {
  direction: string
  sim_result: string
  order_type: string
  sequential_trade: string
  date_from: string
  date_to: string
  score_min: number; score_max: number
  conf_min: number;  conf_max: number
  rsi_min: number;   rsi_max: number
  r_min: number;     r_max: number
  wp_min: number;    wp_max: number
  wait_min: number;  wait_max: number
  entry_wait_min: number; entry_wait_max: number
  sent_synthesis_mtf: string
  sent_synthesis_h1: string
  sent_synthesis_m5: string
  sent_h1_ls_ratio: string
  sent_h1_tt_accounts: string
  sent_h1_tt_positions: string
  sent_h1_oi: string
  sent_h1_oi_mcap: string
  sent_m5_ls_ratio: string
  sent_m5_tt_accounts: string
  sent_m5_tt_positions: string
  sent_m5_oi: string
  sent_m5_oi_mcap: string
  sent_liquidity: string
  sent_market_power: string
}

const DEFAULT_FILTERS: Filters = {
  direction: '', sim_result: '', order_type: '', sequential_trade: '',
  date_from: '', date_to: '',
  score_min: 1,  score_max: 10,
  conf_min: 0,   conf_max: 100,
  rsi_min: 0,    rsi_max: 100,
  r_min: -5,     r_max: 20,
  wp_min: 0,     wp_max: 100,
  wait_min: 0,   wait_max: 4320,
  entry_wait_min: 0, entry_wait_max: 360,
  sent_synthesis_mtf: '', sent_synthesis_h1: '', sent_synthesis_m5: '',
  sent_h1_ls_ratio: '', sent_h1_tt_accounts: '', sent_h1_tt_positions: '',
  sent_h1_oi: '', sent_h1_oi_mcap: '',
  sent_m5_ls_ratio: '', sent_m5_tt_accounts: '', sent_m5_tt_positions: '',
  sent_m5_oi: '', sent_m5_oi_mcap: '',
  sent_liquidity: '', sent_market_power: '',
}

function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.direction)         p.set('direction', f.direction)
  if (f.sim_result)        p.set('sim_result', f.sim_result)
  if (f.order_type)        p.set('order_type', f.order_type)
  if (f.sequential_trade)  p.set('sequential_trade', f.sequential_trade)
  if (f.date_from)         p.set('date_from', f.date_from)
  if (f.date_to)           p.set('date_to', f.date_to)
  p.set('score_min', String(f.score_min)); p.set('score_max', String(f.score_max))
  p.set('conf_min',  String(f.conf_min));  p.set('conf_max',  String(f.conf_max))
  p.set('rsi_min',   String(f.rsi_min));   p.set('rsi_max',   String(f.rsi_max))
  p.set('r_min',     String(f.r_min));     p.set('r_max',     String(f.r_max))
  p.set('wp_min',    String(f.wp_min));    p.set('wp_max',    String(f.wp_max))
  p.set('wait_min',  String(f.wait_min));  p.set('wait_max',  String(f.wait_max))
  p.set('entry_wait_min', String(f.entry_wait_min)); p.set('entry_wait_max', String(f.entry_wait_max))
  const sentFields = ['sent_synthesis_mtf','sent_synthesis_h1','sent_synthesis_m5',
    'sent_h1_ls_ratio','sent_h1_tt_accounts','sent_h1_tt_positions','sent_h1_oi','sent_h1_oi_mcap',
    'sent_m5_ls_ratio','sent_m5_tt_accounts','sent_m5_tt_positions','sent_m5_oi','sent_m5_oi_mcap',
    'sent_liquidity','sent_market_power'] as (keyof Filters)[]
  sentFields.forEach(k => { if (f[k]) p.set(k, f[k] as string) })
  return p
}

function activeFilterCount(f: Filters): number {
  let n = 0
  if (f.direction) n++; if (f.sim_result) n++; if (f.order_type) n++; if (f.sequential_trade) n++
  if (f.date_from) n++; if (f.date_to) n++
  if (f.score_min > 1 || f.score_max < 10) n++
  if (f.conf_min > 0  || f.conf_max < 100) n++
  if (f.rsi_min > 0   || f.rsi_max < 100)  n++
  if (f.r_min > -5    || f.r_max < 20)     n++
  if (f.wp_min > 0    || f.wp_max < 100)   n++
  if (f.wait_min > 0  || f.wait_max < 4320) n++
  if (f.entry_wait_min > 0 || f.entry_wait_max < 360) n++
  const sentFields = ['sent_synthesis_mtf','sent_synthesis_h1','sent_synthesis_m5',
    'sent_h1_ls_ratio','sent_h1_tt_accounts','sent_h1_tt_positions','sent_h1_oi','sent_h1_oi_mcap',
    'sent_m5_ls_ratio','sent_m5_tt_accounts','sent_m5_tt_positions','sent_m5_oi','sent_m5_oi_mcap',
    'sent_liquidity','sent_market_power'] as (keyof Filters)[]
  sentFields.forEach(k => { if (f[k]) n++ })
  return n
}

// ── filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (k: keyof Filters, v: any) => onChange({ ...filters, [k]: v })

  const ToggleGroup = ({ label, field, options }: { label: string; field: keyof Filters; options: string[] }) => (
    <div>
      <div className="col-label" style={{ marginBottom: 5, fontSize: 10 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className={`filter-btn${!filters[field] ? ' active' : ''}`} style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => set(field, '')}>TÜM</button>
        {options.map(o => (
          <button key={o} className={`filter-btn${filters[field] === o ? ' active' : ''}`} style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => set(field, filters[field] === o ? '' : o)}>
            {o.replace('_pressure', '')}
          </button>
        ))}
      </div>
    </div>
  )

  const RangeRow = ({ label, minKey, maxKey, min, max, step = 1 }: {
    label: string; minKey: keyof Filters; maxKey: keyof Filters
    min: number; max: number; step?: number
  }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="col-label" style={{ fontSize: 10 }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text)' }}>
          {filters[minKey]} – {filters[maxKey]}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', width: 20 }}>min</span>
        <input type="range" min={min} max={max} step={step}
          value={filters[minKey] as number}
          onChange={e => set(minKey, Number(e.target.value))}
          style={{ flex: 1, cursor: 'pointer' }}
        />
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', width: 28, textAlign: 'right' }}>{filters[minKey]}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', width: 20 }}>max</span>
        <input type="range" min={min} max={max} step={step}
          value={filters[maxKey] as number}
          onChange={e => set(maxKey, Number(e.target.value))}
          style={{ flex: 1, cursor: 'pointer' }}
        />
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', width: 28, textAlign: 'right' }}>{filters[maxKey]}</span>
      </div>
    </div>
  )

  const so = { dir: ['bullish','bearish','neutral'], str: ['strong','mixed','weak'], pres: ['buying_pressure','selling_pressure','neutral'] }

  const sep = <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Satır 1: Kategorik filtreler */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        <ToggleGroup label="Direction" field="direction" options={['LONG','SHORT','WAIT']} />
        <ToggleGroup label="Sonuç" field="sim_result" options={['TP_HIT','SL_HIT','EXPIRED','NO_ENTRY']} />
        <ToggleGroup label="Sequential" field="sequential_trade" options={['TRADE','WAIT']} />
        <ToggleGroup label="Order type" field="order_type" options={['LIMIT','MARKET']} />
        <div>
          <div className="col-label" style={{ marginBottom: 5, fontSize: 10 }}>Tarih aralığı</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="date"
              value={filters.date_from}
              onChange={e => set('date_from', e.target.value)}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }}
            />
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>–</span>
            <input
              type="date"
              value={filters.date_to}
              onChange={e => set('date_to', e.target.value)}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }}
            />
          </div>
        </div>
      </div>

      {sep}

      {/* Satır 2: Numeric sliderlar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        <RangeRow label="Market score" minKey="score_min" maxKey="score_max" min={1} max={10} />
        <RangeRow label="Confidence" minKey="conf_min" maxKey="conf_max" min={0} max={100} />
        <RangeRow label="RSI 4H" minKey="rsi_min" maxKey="rsi_max" min={0} max={100} />
        <RangeRow label="R multiple"       minKey="r_min"  maxKey="r_max"  min={-5} max={20}  step={0.5} />
        <RangeRow label="Win probability %" minKey="wp_min"   maxKey="wp_max"   min={0}  max={100} step={5} />
        <RangeRow label="Entry bekleme (dk)" minKey="wait_min" maxKey="wait_max" min={0}  max={4320} step={60} />
      </div>

      {sep}

      {/* Satır 3: Synthesis + liquidity/power */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        <ToggleGroup label="MTF synthesis" field="sent_synthesis_mtf" options={so.str} />
        <ToggleGroup label="H1 synthesis"  field="sent_synthesis_h1"  options={so.str} />
        <ToggleGroup label="M5 synthesis"  field="sent_synthesis_m5"  options={so.str} />
        <ToggleGroup label="Liquidity"     field="sent_liquidity"     options={so.pres} />
        <ToggleGroup label="Market power"  field="sent_market_power"  options={so.pres} />
      </div>

      {sep}

      {/* Satır 4: H1 + M5 indikatörler yan yana */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="col-label" style={{ fontSize: 10, gridColumn: '1/-1', marginBottom: -4 }}>H1 İndikatörler</div>
          <ToggleGroup label="L/S ratio"    field="sent_h1_ls_ratio"     options={so.dir} />
          <ToggleGroup label="TT accounts"  field="sent_h1_tt_accounts"  options={so.dir} />
          <ToggleGroup label="TT positions" field="sent_h1_tt_positions" options={so.dir} />
          <ToggleGroup label="OI"           field="sent_h1_oi"           options={so.dir} />
          <ToggleGroup label="OI/MCap"      field="sent_h1_oi_mcap"      options={so.dir} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="col-label" style={{ fontSize: 10, gridColumn: '1/-1', marginBottom: -4 }}>M5 İndikatörler</div>
          <ToggleGroup label="L/S ratio"    field="sent_m5_ls_ratio"     options={so.dir} />
          <ToggleGroup label="TT accounts"  field="sent_m5_tt_accounts"  options={so.dir} />
          <ToggleGroup label="TT positions" field="sent_m5_tt_positions" options={so.dir} />
          <ToggleGroup label="OI"           field="sent_m5_oi"           options={so.dir} />
          <ToggleGroup label="OI/MCap"      field="sent_m5_oi_mcap"      options={so.dir} />
        </div>
      </div>

    </div>
  )
}

export default function InsightsPage() {
  const [overview,  setOverview]  = useState<Overview | null>(null)
  const [scoring,   setScoring]   = useState<ScoringData | null>(null)
  const [sentiment, setSentiment] = useState<SentimentData | null>(null)
  const [pairs,     setPairs]     = useState<PairsData | null>(null)
  const [rmae,      setRmae]      = useState<RmaeData | null>(null)
  const [hourly,    setHourly]    = useState<HourlyData | null>(null)
  const [daily,     setDaily]     = useState<DailyData | null>(null)
  const [optimalR,  setOptimalR]  = useState<OptimalRData | null>(null)
  const [winProb,   setWinProb]   = useState<WinProbData | null>(null)
  const [cumR,      setCumR]      = useState<CumRData | null>(null)
  const [entryWait, setEntryWait] = useState<EntryWaitData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [filterOpen,   setFilterOpen]   = useState(false)
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS)

  const fetchAll = useCallback((f: Filters) => {
    setLoading(true)
    const p = filtersToParams(f)
    const qs = p.toString() ? `?${p}` : ''
    Promise.all([
      fetch(`/api/insights-overview${qs}`,  { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-scoring${qs}`,   { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-sentiment${qs}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-pairs${qs}`,     { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-rmae${qs}`,      { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/hourly-stats${qs}`,       { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-optimal-r${qs}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-daily${qs}`,     { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-win-prob${qs}`,  { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-cumr${qs}`,      { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-entrywait${qs}`, { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ov, sc, se, pa, rm, hr, or_, da, wp, cr, ew]) => {
      setOverview(ov); setScoring(sc); setSentiment(se); setPairs(pa); setRmae(rm)
      setHourly(hr); setOptimalR(or_); setDaily(da); setWinProb(wp); setCumR(cr); setEntryWait(ew)
      setLoading(false)
    })
  }, [])

  const handleApply = () => {
    setAppliedFilters(draftFilters)
    setFilterOpen(false)
    fetchAll(draftFilters)
  }

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
    fetchAll(DEFAULT_FILTERS)
  }

  useEffect(() => { fetchAll(DEFAULT_FILTERS) }, [fetchAll])
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchAll(appliedFilters) }
    const onFocus   = () => fetchAll(appliedFilters)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchAll, appliedFilters])

  const fmtDur = (mins: any) => {
    if (!mins) return '—'
    const h = Math.floor(Number(mins) / 60)
    const m = Math.round(Number(mins) % 60)
    return h > 0 ? `${h}s ${m}dk` : `${m}dk`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64 }}>
      <div className="container" style={{ paddingTop: 28 }}>

        {/* ── FİLTRE PANELİ ────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="filter-btn"
                style={{ fontSize: 11 }}
                onClick={() => setFilterOpen(o => !o)}
              >
                {filterOpen ? '▲ Filtreyi Kapat' : '▼ Filtrele'}
              </button>
              {activeFilterCount(appliedFilters) > 0 && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>
                  {activeFilterCount(appliedFilters)} filtre aktif
                </span>
              )}
              {activeFilterCount(appliedFilters) > 0 && (
                <button
                  className="filter-btn"
                  style={{ fontSize: 10, padding: '2px 10px', color: 'var(--text-3)' }}
                  onClick={handleReset}
                >Sıfırla</button>
              )}
            </div>
            {loading && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>yükleniyor...</span>}
          </div>

          {filterOpen && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
              <FilterPanel filters={draftFilters} onChange={setDraftFilters} />
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14, display: 'flex', gap: 8 }}>
                <button
                  className="filter-btn active"
                  style={{ fontSize: 11, padding: '5px 20px' }}
                  onClick={handleApply}
                >Uygula</button>
                <button
                  className="filter-btn"
                  style={{ fontSize: 11, padding: '5px 14px', color: 'var(--text-3)' }}
                  onClick={() => setDraftFilters(appliedFilters)}
                >İptal</button>
              </div>
            </>
          )}
        </div>

        {!loading && overview && (
          <>
            {/* ── 1. OVERVIEW ──────────────────────────────────────────────── */}
            <Section title="Genel Bakış">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
                <StatCard label="Toplam Trade" value={Number(overview.total_all)} />
                <StatCard label="Win Rate"   value={`%${Number(overview.win_rate).toFixed(1)}`} color={Number(overview.win_rate) >= 40 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Toplam PnL" value={overview.total_pnl != null ? `${Number(overview.total_pnl) > 0 ? '+' : ''}$${Math.abs(Number(overview.total_pnl)).toFixed(0)}` : '—'} color={Number(overview.total_pnl) > 0 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Ort. Win R"  value={overview.avg_r_win  != null ? `+${N(overview.avg_r_win)}R`  : '—'} color="var(--green)" />
                <StatCard label="Ort. Loss R" value={overview.avg_r_loss != null ? `${N(overview.avg_r_loss)}R` : '—'} color="var(--red)" />
                <StatCard label="Ort. Süre"  value={fmtDur(overview.avg_duration_mins)} />
                <StatCard label="TP Hit"     value={overview.tp_count}      color="var(--green)" />
                <StatCard label="SL Hit"     value={overview.sl_count}      color="var(--red)" />
                <StatCard label="Expired"    value={overview.expired_count} color="var(--amber)" />
              </div>

              {/* Kümülatif R grafiği */}
              {cumR && cumR.series.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 12, position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <CardTitle>Kümülatif R</CardTitle>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span className="mono" style={{ fontSize: 11, color: cumR.max_drawdown < 0 ? 'var(--red)' : 'var(--text-3)' }}>
                        Max DD: {cumR.max_drawdown.toFixed(2)}R
                      </span>
                      <span className="mono" style={{ fontSize: 11, color: cumR.final_r >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {cumR.final_r >= 0 ? '+' : ''}{cumR.final_r.toFixed(2)}R
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 160 }}>
                    <Line
                      data={{
                        labels: cumR.series.map(p => {
                          const d = new Date(p.day)
                          return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
                        }),
                        datasets: [{
                          data: cumR.series.map(p => p.cumulative_r),
                          borderColor: cumR.final_r >= 0 ? '#4ade80' : '#f87171',
                          borderWidth: 1.5,
                          pointRadius: 0,
                          fill: true,
                          backgroundColor: cumR.final_r >= 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
                          tension: 0.3,
                        }],
                      }}
                      options={{
                        ...CHART_DEFAULTS,
                        plugins: { legend: { display: false }, tooltip: {
                          displayColors: false,
                          callbacks: {
                            label: (ctx: any) => {
                              const p = cumR.series[ctx.dataIndex]
                              return [`Kümülatif: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}R`, `Günlük: ${p.daily_r >= 0 ? '+' : ''}${p.daily_r.toFixed(2)}R`]
                            }
                          }
                        }},
                        scales: {
                          x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxTicksLimit: 12 } },
                          y: { ...axisStyle, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}R` } },
                        },
                      }}
                    />
                  </div>
                </div>
              )}
              <div style={grid2}>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>Yön bazında win rate</CardTitle>
                  {[
                    { label: 'LONG',  rate: Number(overview.long_win_rate),  total: Number(overview.long_total),  color: 'var(--green)' },
                    { label: 'SHORT', rate: Number(overview.short_win_rate), total: Number(overview.short_total), color: 'var(--red)' },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: row.color, display: 'block', marginBottom: 5 }}>{row.label}</span>
                      <WinBar rate={row.rate} total={row.total} />
                    </div>
                  ))}
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>Sequential vs tüm tradeler</CardTitle>
                  {[
                    { label: 'Tüm tradeler', rate: Number(overview.win_rate),     total: Number(overview.tp_count) + Number(overview.sl_count) },
                    { label: 'Sequential',   rate: Number(overview.seq_win_rate), total: Number(overview.seq_total) },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{row.label}</span>
                      <WinBar rate={row.rate} total={row.total} />
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── 2. SCORING ───────────────────────────────────────────────── */}
            {scoring && (
              <Section title="Skor Analizi">
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Market score → win rate</CardTitle>
                    <div style={{ height: 160 }}>
                      <Bar
                        data={{
                          labels: scoring.by_score.map(r => `${r.score}`),
                          datasets: [{ data: scoring.by_score.map(r => Number(r.win_rate)), backgroundColor: scoring.by_score.map(r => Number(r.win_rate) >= 50 ? 'rgba(74,222,128,0.4)' : Number(r.win_rate) >= 40 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'), borderColor: scoring.by_score.map(r => Number(r.win_rate) >= 50 ? '#4ade80' : Number(r.win_rate) >= 40 ? '#fbbf24' : '#f87171'), borderWidth: 1 }],
                        }}
                        options={{ ...CHART_DEFAULTS, scales: { x: axisStyle, y: { ...axisStyle, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } } } }}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Confidence → win rate</CardTitle>
                    <div style={{ height: 160 }}>
                      <Bar
                        data={{
                          labels: scoring.by_confidence.map(r => `${r.score}`),
                          datasets: [{ data: scoring.by_confidence.map(r => Number(r.win_rate)), backgroundColor: scoring.by_confidence.map(r => Number(r.win_rate) >= 50 ? 'rgba(74,222,128,0.4)' : Number(r.win_rate) >= 40 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'), borderColor: scoring.by_confidence.map(r => Number(r.win_rate) >= 50 ? '#4ade80' : Number(r.win_rate) >= 40 ? '#fbbf24' : '#f87171'), borderWidth: 1 }],
                        }}
                        options={{ ...CHART_DEFAULTS, scales: { x: axisStyle, y: { ...axisStyle, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } } } }}
                      />
                    </div>
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>RSI 4H zonu → win rate</CardTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <div />
                    <span className="mono" style={{ fontSize: 10, color: 'var(--green)', textAlign: 'center' }}>LONG</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--red)', textAlign: 'center' }}>SHORT</span>
                  </div>
                  {scoring.by_rsi.map(row => {
                    const long  = scoring.by_rsi_long.find(r => r.rsi_zone === row.rsi_zone)
                    const short = scoring.by_rsi_short.find(r => r.rsi_zone === row.rsi_zone)
                    return (
                      <div key={row.rsi_zone} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)' }}>{row.rsi_zone}</span>
                        <WinBar rate={long ? Number(long.win_rate) : null} total={long ? Number(long.total) : 0} />
                        <WinBar rate={short ? Number(short.win_rate) : null} total={short ? Number(short.total) : 0} />
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* ── 3. SENTIMENT ─────────────────────────────────────────────── */}
            {sentiment && (
              <Section title="Sentiment Analizi">
                <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <CardTitle>İndikatör × sentiment → win rate</CardTitle>
                  {(() => {
                    const groupedAll:   Record<string, IndicatorRow[]> = {}
                    const groupedLong:  Record<string, IndicatorRow[]> = {}
                    const groupedShort: Record<string, IndicatorRow[]> = {}
                    sentiment.indicators.forEach(r => { if (!groupedAll[r.indicator]) groupedAll[r.indicator] = []; groupedAll[r.indicator].push(r) })
                    sentiment.indicators_long.forEach(r => { if (!groupedLong[r.indicator]) groupedLong[r.indicator] = []; groupedLong[r.indicator].push(r) })
                    sentiment.indicators_short.forEach(r => { if (!groupedShort[r.indicator]) groupedShort[r.indicator] = []; groupedShort[r.indicator].push(r) })
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                        {Object.keys(groupedAll).map(indicator => (
                          <div key={indicator}>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>{indicator}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '10px 1fr 1fr', gap: 4, marginBottom: 4 }}>
                              <div />
                              <span className="mono" style={{ fontSize: 9, color: 'var(--green)', textAlign: 'center' }}>LONG</span>
                              <span className="mono" style={{ fontSize: 9, color: 'var(--red)', textAlign: 'center' }}>SHORT</span>
                            </div>
                            {(groupedAll[indicator] || []).filter(r => r.sentiment).map(row => {
                              const sl    = sentLabel(row.sentiment)
                              const long  = (groupedLong[indicator]  || []).find(r => r.sentiment === row.sentiment)
                              const short = (groupedShort[indicator] || []).find(r => r.sentiment === row.sentiment)
                              return (
                                <div key={row.sentiment} style={{ display: 'grid', gridTemplateColumns: '10px 1fr 1fr', gap: 4, alignItems: 'center', marginBottom: 5 }}>
                                  <span className="mono" style={{ fontSize: 9, color: sl.color, writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 40, lineHeight: 1 }}>{sl.label}</span>
                                  <WinBar rate={long ? Number(long.win_rate) : null} total={long ? Number(long.total) : 0} />
                                  <WinBar rate={short ? Number(short.win_rate) : null} total={short ? Number(short.total) : 0} />
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>MTF synthesis kombinasyonları — LONG</CardTitle>
                    {sentiment.mtf_confluence_long.slice(0, 8).map((row, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>H1:{row.h1} M5:{row.m5} MTF:{row.mtf}</span>
                        <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                      </div>
                    ))}
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>MTF synthesis kombinasyonları — SHORT</CardTitle>
                    {sentiment.mtf_confluence_short.slice(0, 8).map((row, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>H1:{row.h1} M5:{row.m5} MTF:{row.mtf}</span>
                        <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>Liquidity × market power</CardTitle>
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                    <thead>
                      <tr>{['Liquidity', 'Mkt Power', 'n', 'Win%'].map((h, i) => <th key={h} style={{ textAlign: i >= 2 ? 'right' : 'left', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400 }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sentiment.liquidity_cross.map((row, i) => {
                        const liq = sentLabel(row.liquidity)
                        const mkt = sentLabel(row.market_power)
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 0', color: liq.color }}>{liq.label}</td>
                            <td style={{ padding: '6px 0', color: mkt.color }}>{mkt.label}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)' }}>{row.total}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right', color: winColor(Number(row.win_rate)), fontWeight: 500 }}>{Number(row.win_rate).toFixed(1)}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </Section>
            )}

            {/* ── 4. PAIRS ─────────────────────────────────────────────────── */}
            {pairs && (
              <Section title="Değişken Çiftleri">
                {/* Direction × MTF + Score × MTF overview */}
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Direction × MTF synthesis</CardTitle>
                    {(['LONG', 'SHORT'] as const).map(dir => (
                      <div key={dir} style={{ marginBottom: 14 }}>
                        <span className="mono" style={{ fontSize: 11, color: dir === 'LONG' ? 'var(--green)' : 'var(--red)', display: 'block', marginBottom: 6 }}>{dir}</span>
                        {pairs.direction_x_sentiment.filter(r => r.direction === dir).map(row => {
                          const sl = sentLabel(row.mtf_strength)
                          return (
                            <div key={row.mtf_strength} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span className="mono" style={{ fontSize: 10, color: sl.color, minWidth: 48, flexShrink: 0 }}>{sl.label}</span>
                              <div style={{ flex: 1 }}><WinBar rate={Number(row.win_rate)} total={Number(row.total)} /></div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Score bucket × MTF synthesis</CardTitle>
                    {['Yüksek (8-10)', 'Orta (5-7)', 'Düşük (1-4)'].map(bucket => (
                      <div key={bucket} style={{ marginBottom: 14 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>{bucket}</span>
                        {pairs.score_x_sentiment.filter(r => r.score_bucket === bucket).length === 0
                          ? <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>veri yok</span>
                          : pairs.score_x_sentiment.filter(r => r.score_bucket === bucket).map(row => {
                              const sl = sentLabel(row.mtf_strength)
                              return (
                                <div key={row.mtf_strength} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <span className="mono" style={{ fontSize: 10, color: sl.color, minWidth: 48, flexShrink: 0 }}>{sl.label}</span>
                                  <div style={{ flex: 1 }}><WinBar rate={Number(row.win_rate)} total={Number(row.total)} /></div>
                                </div>
                              )
                            })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* LONG pairs + trios */}
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>LONG</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi ikili kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.long_total}</span>}
                    </div>
                    <CombTable rows={pairs.long_pairs} nameKey="pair_name" />
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>LONG</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi üçlü kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.long_total}</span>}
                    </div>
                    {pairs.long_trios.length === 0
                      ? <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>min 5 trade eşiğini geçen üçlü yok</span>
                      : <CombTable rows={pairs.long_trios} nameKey="trio_name" />}
                  </div>
                </div>

                {/* SHORT pairs + trios */}
                <div style={grid2}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--red)', flexShrink: 0 }}>SHORT</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi ikili kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.short_total}</span>}
                    </div>
                    <CombTable rows={pairs.short_pairs} nameKey="pair_name" />
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--red)', flexShrink: 0 }}>SHORT</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi üçlü kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.short_total}</span>}
                    </div>
                    {pairs.short_trios.length === 0
                      ? <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>min 5 trade eşiğini geçen üçlü yok</span>
                      : <CombTable rows={pairs.short_trios} nameKey="trio_name" />}
                  </div>
                </div>
              </Section>
            )}


            {/* ── 5. R MULTIPLE & MFE/MAE ──────────────────────────────────── */}
            {rmae && (
              <Section title="R Multiple & MFE/MAE">
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>R multiple dağılımı</CardTitle>
                    <div style={{ height: 180 }}>
                      {(() => {
                        const buckets = Array.from(new Set(rmae.r_histogram.map(r => r.r_bucket))).sort((a, b) => a - b)
                        const tpData  = buckets.map(b => rmae.r_histogram.find(r => r.r_bucket === b)?.count ?? 0)
                        return (
                          <Bar
                            data={{
                              labels: buckets.map(b => `+${b}R`),
                              datasets: [
                                { label: 'TP', data: tpData, backgroundColor: 'rgba(74,222,128,0.4)', borderColor: '#4ade80', borderWidth: 1 },
                              ],
                            }}
                            options={{ ...CHART_DEFAULTS, plugins: { legend: { display: true, labels: { color: '#555', font: { family: 'DM Mono', size: 10 } } } }, scales: { x: axisStyle, y: { ...axisStyle, ticks: { ...axisStyle.ticks, stepSize: 1 } } } }}
                          />
                        )
                      })()}
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>MFE vs MAE — TP tradeler ($) — x=y üstü: kazanç &gt; drawdown</CardTitle>
                    <div style={{ height: 220 }}>
                      {(() => {
                        const tpScatter = rmae.scatter.filter(r => r.sim_result === 'TP_HIT')
                        const maxMfe = Math.ceil(Math.max(...tpScatter.map(r => +Number(r.mfe))) * 1.1)
                        const xMax = 25
                        const yMax = maxMfe
                        return (
                          <Scatter
                            data={{
                              datasets: [
                                {
                                  label: 'TP',
                                  data: tpScatter.map(r => ({ x: +Number(r.mae).toFixed(2), y: +Number(r.mfe).toFixed(2) })),
                                  backgroundColor: 'rgba(74,222,128,0.7)',
                                  pointRadius: 5,
                                },
                                {
                                  label: 'x=y',
                                  data: Array.from({ length: 21 }, (_, i) => ({ x: i * xMax / 20, y: i * xMax / 20 })),
                                  backgroundColor: 'rgba(255,255,255,0.0)',
                                  borderColor: 'rgba(255,255,255,0.2)',
                                  pointRadius: 1,
                                  showLine: true,
                                  borderDash: [4, 4],
                                } as any,
                              ],
                            }}
                            options={{
                              ...CHART_DEFAULTS,
                              plugins: {
                                legend: { display: true, labels: { color: '#555', font: { family: 'DM Mono', size: 10 }, filter: (item: any) => item.text !== 'x=y' } },
                                tooltip: {
                                  displayColors: false,
                                  callbacks: {
                                    label: (ctx: any) => ctx.dataset.label === 'x=y' ? '' : `MAE: $${ctx.parsed.x} / MFE: $${ctx.parsed.y}`,
                                  },
                                },
                              },
                              scales: {
                                x: { ...axisStyle, min: 0, max: xMax, title: { display: true, text: 'MAE ($)', color: '#555', font: { family: 'DM Mono', size: 10 } } },
                                y: { ...axisStyle, min: 0, max: yMax, title: { display: true, text: 'MFE ($)', color: '#555', font: { family: 'DM Mono', size: 10 } } },
                              },
                            } as any}
                          />
                        )
                      })()}
                    </div>
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>MFE dağılımı — ne kadar hareket görüldü?</CardTitle>
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                    <thead>
                      <tr>{['MFE Zonu', 'Toplam', 'TP Hit', 'TP%', 'Ort. Süre'].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400 }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rmae.mfe_distribution.map((row, i) => {
                        const tpRate = row.total > 0 ? (Number(row.tp_count) / Number(row.total)) * 100 : 0
                        const mins   = Number(row.avg_mins)
                        const dur    = mins ? `${Math.floor(mins / 60)}s ${Math.round(mins % 60)}dk` : '—'
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '7px 0', color: 'var(--text-2)' }}>{row.mfe_bucket}</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--text-3)' }}>{row.total}</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--green)' }}>{row.tp_count}</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: winColor(tpRate) }}>{tpRate.toFixed(1)}%</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--text-3)' }}>{dur}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </Section>
            )}
            {/* ── 6. WIN PROBABILITY KALİBRASYONU ─────────────────────────── */}
            {winProb && winProb.buckets?.length > 0 && (
              <Section title="Win Probability Kalibrasyonu">
                <div style={{ ...grid2, marginBottom: 12 }}>
                  {/* Calibration bar chart */}
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Tahmin edilen vs gerçekleşen win rate</CardTitle>
                    <div style={{ height: 200 }}>
                      <Bar
                        data={{
                          labels: winProb.buckets.map(b => b.bucket),
                          datasets: [
                            {
                              label: 'Tahmin edilen %',
                              data: winProb.buckets.map(b => Number(b.avg_predicted)),
                              backgroundColor: 'rgba(96,165,250,0.3)',
                              borderColor: '#60a5fa',
                              borderWidth: 1,
                            },
                            {
                              label: 'Gerçek win %',
                              data: winProb.buckets.map(b => Number(b.actual_win_rate)),
                              backgroundColor: winProb.buckets.map(b =>
                                Number(b.actual_win_rate) >= 40 ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)'
                              ),
                              borderColor: winProb.buckets.map(b =>
                                Number(b.actual_win_rate) >= 40 ? '#4ade80' : '#f87171'
                              ),
                              borderWidth: 1,
                            },
                          ],
                        }}
                        options={{
                          ...CHART_DEFAULTS,
                          plugins: {
                            legend: { display: true, labels: { color: '#555', font: { family: 'DM Mono', size: 10 } } },
                            tooltip: {
                              displayColors: false,
                              callbacks: {
                                afterBody: (items: any) => {
                                  const b = winProb.buckets[items[0].dataIndex]
                                  if (!b) return []
                                  return [
                                    `n=${b.total}  TP=${b.wins}`,
                                    b.total_r != null ? `Toplam R: ${Number(b.total_r) > 0 ? '+' : ''}${Number(b.total_r).toFixed(2)}R` : '',
                                    b.avg_r != null ? `Ort. R: ${Number(b.avg_r) > 0 ? '+' : ''}${Number(b.avg_r).toFixed(2)}R` : '',
                                  ].filter(Boolean)
                                },
                              },
                            },
                          },
                          scales: {
                            x: axisStyle,
                            y: { ...axisStyle, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } },
                          },
                        }}
                      />
                    </div>
                  </div>

                  {/* Direction breakdown + table */}
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Yöne göre ortalama win probability</CardTitle>
                    <div style={{ marginBottom: 16 }}>
                      {winProb.by_dir.map(row => (
                        <div key={row.direction} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span className="mono" style={{ fontSize: 11, color: row.direction === 'LONG' ? 'var(--green)' : 'var(--red)' }}>{row.direction}</span>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                              tahmin: %{Number(row.avg_probability).toFixed(1)} → gerçek: %{Number(row.actual_win_rate).toFixed(1)}
                            </span>
                          </div>
                          <WinBar rate={Number(row.actual_win_rate)} total={Number(row.total)} />
                        </div>
                      ))}
                    </div>

                    <div className="col-label" style={{ marginBottom: 8 }}>Bucket detayı</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                        <thead>
                          <tr>{['Bucket', 'Ort. Tahmin', 'Gerçek Win%', 'Toplam R', 'Ort. R', 'n'].map((h, i) => (
                            <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {winProb.buckets.map((b, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '5px 0', color: 'var(--text-2)' }}>{b.bucket}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--blue)' }}>%{Number(b.avg_predicted).toFixed(1)}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: winColor(Number(b.actual_win_rate)) }}>{b.actual_win_rate != null ? `%${Number(b.actual_win_rate).toFixed(1)}` : '—'}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: b.total_r != null ? (Number(b.total_r) >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-3)' }}>
                                {b.total_r != null ? `${Number(b.total_r) > 0 ? '+' : ''}${Number(b.total_r).toFixed(2)}R` : '—'}
                              </td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: b.avg_r != null ? (Number(b.avg_r) >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-3)' }}>
                                {b.avg_r != null ? `${Number(b.avg_r) > 0 ? '+' : ''}${Number(b.avg_r).toFixed(2)}R` : '—'}
                              </td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)' }}>{b.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* ── 7. OPTİMAL R ─────────────────────────────────────────────── */}
            {optimalR && optimalR.sweep.length > 0 && (
              <Section title="Optimal R Analizi">
                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Optimal R', value: optimalR.optimal_r != null ? `${optimalR.optimal_r}R` : '—', color: 'var(--amber)', highlight: true },
                    { label: 'Mevcut R', value: optimalR.current_avg_r != null ? `${optimalR.current_avg_r}R` : '—', color: optimalR.current_avg_r != null && optimalR.optimal_r != null && optimalR.current_avg_r >= optimalR.optimal_r ? 'var(--green)' : 'var(--red)' },
                    { label: 'P/L', value: `${optimalR.optimal_pnl > 0 ? '+' : ''}$${Math.abs(optimalR.optimal_pnl).toFixed(0)}`, color: optimalR.optimal_pnl > 0 ? 'var(--green)' : 'var(--red)' },
                    { label: 'Win%', value: `%${optimalR.optimal_win_rate}`, color: winColor(optimalR.optimal_win_rate) },
                    { label: 'Win', value: optimalR.optimal_wins, color: 'var(--green)' },
                    { label: 'Loss', value: optimalR.optimal_losses, color: 'var(--red)' },
                    { label: 'Toplam', value: optimalR.total_trades, color: 'var(--text)' },
                  ].map((card, i) => (
                    <div key={i} className="stat-card" style={{ borderColor: card.highlight ? 'var(--amber-border)' : undefined }}>
                      <div className="col-label" style={{ marginBottom: 6 }}>{card.label}</div>
                      <div className="mono" style={{ fontSize: 20, fontWeight: 500, color: card.color }}>{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* Sweep chart */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <CardTitle>R sweep — her TP hedefinde toplam P/L</CardTitle>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {optimalR.optimal_r != null && (
                        <span className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>
                          peak: {optimalR.optimal_r}R → ${optimalR.optimal_pnl > 0 ? '+' : ''}{optimalR.optimal_pnl.toFixed(0)}
                        </span>
                      )}
                      {optimalR.current_avg_r != null && (
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                          mevcut ort: {optimalR.current_avg_r}R
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ height: 200 }}>
                    <Bar
                      data={{
                        labels: optimalR.sweep.map(p => `${p.r}R`),
                        datasets: [{
                          label: 'P/L ($)',
                          data: optimalR.sweep.map(p => p.pnl),
                          backgroundColor: optimalR.sweep.map(p =>
                            p.r === optimalR.optimal_r
                              ? 'rgba(251,191,36,0.7)'
                              : p.pnl > 0 ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'
                          ),
                          borderColor: optimalR.sweep.map(p =>
                            p.r === optimalR.optimal_r ? '#fbbf24' : p.pnl > 0 ? '#4ade80' : '#f87171'
                          ),
                          borderWidth: 1,
                        }],
                      }}
                      options={{
                        ...CHART_DEFAULTS,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            displayColors: false,
                            callbacks: {
                              title: (items: any) => `TP hedefi: ${items[0].label}`,
                              afterBody: (items: any) => {
                                const p = optimalR.sweep[items[0].dataIndex]
                                return [`P/L: ${p.pnl > 0 ? '+' : ''}$${p.pnl.toFixed(0)}`, `Win: ${p.wins} / Loss: ${p.losses}`, `Win rate: %${p.win_rate}`]
                              },
                            },
                          },
                        },
                        scales: {
                          x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxTicksLimit: 12 } },
                          y: { ...axisStyle, ticks: { ...axisStyle.ticks, callback: (v: any) => `$${v}` } },
                        },
                      }}
                    />
                  </div>
                  {optimalR.current_avg_r != null && optimalR.optimal_r != null && (
                    <div style={{ marginTop: 10, fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-3)' }}>
                      {optimalR.current_avg_r < optimalR.optimal_r
                        ? `Mevcut ort. TP (${optimalR.current_avg_r}R), optimal R'dan (${optimalR.optimal_r}R) düşük — TP hedefini yükseltmek P/L'i artırabilir.`
                        : optimalR.current_avg_r > optimalR.optimal_r
                        ? `Mevcut ort. TP (${optimalR.current_avg_r}R), optimal R'dan (${optimalR.optimal_r}R) yüksek — TP hedefini düşürmek daha fazla trade kapatabilir.`
                        : `Mevcut ort. TP, optimal R ile örtüşüyor.`}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* ── 7. GÜNLÜK DAĞILIM ────────────────────────────────────────── */}
            {daily && daily.daily?.length > 0 && (
              <Section title="Günlük Dağılım">
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <CardTitle>Günlük trade dağılımı (TP / SL)</CardTitle>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[{ label: 'TP', color: 'var(--green)' }, { label: 'SL', color: 'var(--red)' }].map(x => (
                        <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: x.color }} />
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{x.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 200 }}>
                    <Bar
                      data={{
                        labels: daily.daily.map(d => {
                          const date = new Date(d.day)
                          return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
                        }),
                        datasets: [
                          {
                            label: 'TP',
                            data: daily.daily.map(d => Number(d.tp_count)),
                            backgroundColor: 'rgba(74,222,128,0.7)',
                            borderColor: '#4ade80',
                            borderWidth: 1,
                            borderRadius: 2,
                            stack: 'stack',
                          },
                          {
                            label: 'SL',
                            data: daily.daily.map(d => Number(d.sl_count)),
                            backgroundColor: 'rgba(248,113,113,0.7)',
                            borderColor: '#f87171',
                            borderWidth: 1,
                            borderRadius: 2,
                            stack: 'stack',
                          },
                        ],
                      }}
                      options={{
                        ...CHART_DEFAULTS,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            displayColors: false,
                            callbacks: {
                              title: (items: any) => daily.daily[items[0].dataIndex]
                                ? new Date(daily.daily[items[0].dataIndex].day).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                : '',
                              afterBody: (items: any) => {
                                const d = daily.daily[items[0].dataIndex]
                                if (!d) return []
                                return [
                                  `Toplam: ${d.total}`,
                                  `TP: ${d.tp_count} / SL: ${d.sl_count}`,
                                  d.win_rate != null ? `Win rate: %${d.win_rate}` : '',
                                ].filter(Boolean)
                              },
                            },
                          },
                        },
                        scales: {
                          x: { ...axisStyle, stacked: true, ticks: { ...axisStyle.ticks, maxTicksLimit: 20 } },
                          y: { ...axisStyle, stacked: true, ticks: { ...axisStyle.ticks, stepSize: 1 } },
                        },
                      }}
                    />
                  </div>
                </div>
              </Section>
            )}

            {/* ── 8. ENTRY BEKLEME SÜRESİ ─────────────────────────────────── */}
            {entryWait && entryWait.buckets?.length > 0 && (
              <Section title="Entry Bekleme Süresi">
                <div style={grid2}>
                  {/* Win Rate Chart */}
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Bekleme süresi → win rate & ort. R</CardTitle>
                    <div style={{ height: 200 }}>
                      <Bar
                        data={{
                          labels: entryWait.buckets.map(b => b.bucket),
                          datasets: [
                            {
                              label: 'Win %',
                              data: entryWait.buckets.map(b => Number(b.win_rate)),
                              backgroundColor: entryWait.buckets.map(b =>
                                Number(b.win_rate) >= 40 ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)'
                              ),
                              borderColor: entryWait.buckets.map(b =>
                                Number(b.win_rate) >= 40 ? '#4ade80' : '#f87171'
                              ),
                              borderWidth: 1,
                              borderRadius: 3,
                            },
                          ],
                        }}
                        options={{
                          ...CHART_DEFAULTS,
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              displayColors: false,
                              callbacks: {
                                afterBody: (items: any) => {
                                  const b = entryWait.buckets[items[0].dataIndex]
                                  return [
                                    `n=${b.total}  TP=${b.wins}`,
                                    b.avg_r != null ? `Ort. R: ${Number(b.avg_r) >= 0 ? '+' : ''}${Number(b.avg_r).toFixed(2)}R` : '',
                                    `Ort. bekleme: ${Math.round(Number(b.avg_wait_mins))}dk`,
                                  ].filter(Boolean)
                                },
                              },
                            },
                          },
                          scales: {
                            x: axisStyle,
                            y: { ...axisStyle, min: 0, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } },
                          },
                        }}
                      />
                    </div>
                  </div>

                  {/* Tablo */}
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Bekleme süresi detayı</CardTitle>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                        <thead>
                          <tr>{['Süre', 'n', 'Win%', 'Ort. R', 'Toplam R', 'Ort. Bekleme'].map((h, i) => (
                            <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {entryWait.buckets.map((b, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '5px 0', color: 'var(--text-2)' }}>{b.bucket}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)' }}>{b.total}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: winColor(Number(b.win_rate)) }}>{Number(b.win_rate).toFixed(1)}%</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: Number(b.avg_r) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {Number(b.avg_r) > 0 ? '+' : ''}{Number(b.avg_r).toFixed(2)}R
                              </td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: Number(b.total_r) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {Number(b.total_r) > 0 ? '+' : ''}{Number(b.total_r).toFixed(2)}R
                              </td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)' }}>
                                {Number(b.avg_wait_mins).toFixed(0)}dk
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* ── 9. ZAMANLAMA ─────────────────────────────────────────────── */}
            {hourly && hourly.by_analysis?.length > 0 && (() => {
              const series = hourly.by_analysis
              const best = series.filter(h => h.total >= 2).sort((a, b) => Number(b.win_rate) - Number(a.win_rate))[0]
              const barData = {
                labels: series.map(h => `${String(h.hour).padStart(2, '0')}:00`),
                datasets: [
                  { label: 'TP', data: series.map(h => h.tp_count), backgroundColor: 'rgba(74,222,128,0.7)', borderColor: 'rgba(74,222,128,0.9)', borderWidth: 1, borderRadius: 3 },
                  { label: 'SL', data: series.map(h => h.sl_count), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: 'rgba(248,113,113,0.9)', borderWidth: 1, borderRadius: 3 },
                ],
              }
              const barOpts: any = {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    displayColors: false, padding: 10,
                    callbacks: {
                      title: (items: any) => `Saat ${items[0].label}`,
                      afterBody: (items: any) => {
                        const h = series[items[0].dataIndex]
                        if (!h.total) return ['Veri yok']
                        const lines = [`Win Rate: %${h.win_rate}`, `Toplam: ${h.total} (TP: ${h.tp_count} / SL: ${h.sl_count})`]
                        if (h.avg_r_tp != null) lines.push(`Ort. Win R: +${Number(h.avg_r_tp).toFixed(2)}R`)
                        return lines
                      },
                    },
                  },
                },
                scales: {
                  x: { stacked: true, grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'DM Mono', size: 9 } }, border: { color: '#242424' } },
                  y: { stacked: true, grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'DM Mono', size: 10 }, stepSize: 1 }, border: { color: '#242424' }, min: 0 },
                },
              }
              return (
                <Section title="Zamanlama">
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <CardTitle>Analiz saati → TP/SL dağılımı</CardTitle>
                        <div style={{ display: 'flex', gap: 10, marginTop: -12 }}>
                          {[{ label: 'TP', color: 'var(--green)' }, { label: 'SL', color: 'var(--red)' }].map(x => (
                            <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: x.color }} />
                              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{x.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {best && (
                        <span className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>
                          En iyi: {String(best.hour).padStart(2, '0')}:00 (%{best.win_rate})
                        </span>
                      )}
                    </div>
                    <div style={{ height: 180 }}>
                      <Bar data={barData} options={barOpts} />
                    </div>
                  </div>
                </Section>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
