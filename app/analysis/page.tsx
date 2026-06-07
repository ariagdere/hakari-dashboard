'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Chart as ChartJS, Tooltip, LineElement, PointElement,
  LinearScale, CategoryScale, BarElement, Filler, ArcElement,
} from 'chart.js'
import { Bar, Line, Chart } from 'react-chartjs-2'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Filler, ArcElement)

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
interface ScoringData {
  by_rsi: any[]; by_rsi_long: any[]; by_rsi_short: any[]
  by_rsi30: any[]; by_rsi30_long: any[]; by_rsi30_short: any[]
}
interface DeltaBucket { bucket: string; sort_order: number; total: number; wins: number; win_rate: number; avg_r: number | null; total_r: number | null; avg_delta: number; label: string }
interface DeltaData { [key: string]: DeltaBucket[] }
interface CumRPoint { day: string; cumulative_r: number; daily_r: number }
interface CumRData { series: CumRPoint[]; max_drawdown: number; final_r: number }
interface WpBucket { bucket: string; sort_order: number; avg_predicted: number; total: number; wins: number; win_rate: number; total_r: number | null }
interface WpAllData { [key: string]: WpBucket[] }
interface AnalysisSummary {
  id: number; analyzed_at: string; direction: string
  entry: number; tp: number; sl: number; rr: string
  sim_result: string; sim_pnl_usd: number; sim_r_multiple: number
  rsi_4h: number | null; rsi_30m: number | null
  win_probability_v4: number | null; win_probability_v5: number | null
  win_probability_v4_1304: number | null; win_probability_v5_1304: number | null
  win_probability_v4_reverse: number | null; win_probability_v5_reverse: number | null
}

// ── Filters ────────────────────────────────────────────────────────────────

interface Filters {
  direction: string; sim_result: string
  date_from: string; date_to: string
  include_weekdays: boolean; include_weekends: boolean
  rsi_min: number; rsi_max: number
  rsi30_min: number; rsi30_max: number
  wp4_min: number; wp4_max: number
  wp4_1304_min: number; wp4_1304_max: number
  wp4_rev_min: number; wp4_rev_max: number
  wp4_1304_rev_min: number; wp4_1304_rev_max: number
  wp5_min: number; wp5_max: number
  wp5_1304_min: number; wp5_1304_max: number
  wp5_rev_min: number; wp5_rev_max: number
  wp5_1304_rev_min: number; wp5_1304_rev_max: number
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
}

interface Preset { name: string; filters: Filters }

const DEFAULT_FILTERS: Filters = {
  direction: '', sim_result: '',
  date_from: '', date_to: '',
  include_weekdays: true, include_weekends: true,
  rsi_min: 0, rsi_max: 100,
  rsi30_min: 0, rsi30_max: 100,
  wp4_min: 0, wp4_max: 100,
  wp4_1304_min: 0, wp4_1304_max: 100,
  wp4_rev_min: 0, wp4_rev_max: 100,
  wp4_1304_rev_min: 0, wp4_1304_rev_max: 100,
  wp5_min: 0, wp5_max: 100,
  wp5_1304_min: 0, wp5_1304_max: 100,
  wp5_rev_min: 0, wp5_rev_max: 100,
  wp5_1304_rev_min: 0, wp5_1304_rev_max: 100,
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
}

function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.direction)   p.set('direction',  f.direction)
  if (f.sim_result)  p.set('sim_result', f.sim_result)
  if (f.date_from)   p.set('date_from',  f.date_from)
  if (f.date_to)     p.set('date_to',    f.date_to)
  if (!f.include_weekdays) p.set('exclude_weekdays', '1')
  if (!f.include_weekends) p.set('exclude_weekends', '1')
  p.set('rsi_min', String(f.rsi_min));   p.set('rsi_max', String(f.rsi_max))
  p.set('rsi30_min', String(f.rsi30_min)); p.set('rsi30_max', String(f.rsi30_max))
  p.set('wp4_min', String(f.wp4_min));         p.set('wp4_max', String(f.wp4_max))
  p.set('wp4_1304_min', String(f.wp4_1304_min)); p.set('wp4_1304_max', String(f.wp4_1304_max))
  p.set('wp4_rev_min', String(f.wp4_rev_min));   p.set('wp4_rev_max', String(f.wp4_rev_max))
  p.set('wp4_1304_rev_min', String(f.wp4_1304_rev_min)); p.set('wp4_1304_rev_max', String(f.wp4_1304_rev_max))
  p.set('wp5_min', String(f.wp5_min));         p.set('wp5_max', String(f.wp5_max))
  p.set('wp5_1304_min', String(f.wp5_1304_min)); p.set('wp5_1304_max', String(f.wp5_1304_max))
  p.set('wp5_rev_min', String(f.wp5_rev_min));   p.set('wp5_rev_max', String(f.wp5_rev_max))
  p.set('wp5_1304_rev_min', String(f.wp5_1304_rev_min)); p.set('wp5_1304_rev_max', String(f.wp5_1304_rev_max))
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
  return p
}

function activeFilterCount(f: Filters): number {
  let n = 0
  if (f.direction) n++; if (f.sim_result) n++
  if (f.date_from || f.date_to) n++
  if (!f.include_weekdays || !f.include_weekends) n++
  if (f.rsi_min > 0 || f.rsi_max < 100) n++
  if (f.rsi30_min > 0 || f.rsi30_max < 100) n++
  if (f.wp4_min > 0 || f.wp4_max < 100) n++
  if (f.wp4_1304_min > 0 || f.wp4_1304_max < 100) n++
  if (f.wp4_rev_min > 0 || f.wp4_rev_max < 100) n++
  if (f.wp4_1304_rev_min > 0 || f.wp4_1304_rev_max < 100) n++
  if (f.wp5_min > 0 || f.wp5_max < 100) n++
  if (f.wp5_1304_min > 0 || f.wp5_1304_max < 100) n++
  if (f.wp5_rev_min > 0 || f.wp5_rev_max < 100) n++
  if (f.wp5_1304_rev_min > 0 || f.wp5_1304_rev_max < 100) n++
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
  return n
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CHART_DEFAULTS = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
const axisStyle = { grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } }, border: { color: '#242424' } }

const winColor = (v: number | null) => {
  if (v == null) return 'var(--text-3)'
  if (v >= 50) return 'var(--green)'
  if (v >= 40) return 'var(--amber)'
  return 'var(--red)'
}
const wpColor = (v: number | null) => {
  if (v == null) return 'var(--text-3)'
  const n = Number(v)
  if (n >= 60) return 'var(--green)'
  if (n >= 50) return 'var(--amber)'
  return 'var(--red)'
}
const pnlClass = (v: number) => v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero'
const fmt = (n: number) => n?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? '—'
const fmtDate = (s: string) => new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtMins = (m: any) => { if (!m) return '—'; const h = Math.floor(Number(m) / 60); const min = Math.round(Number(m) % 60); return h > 0 ? `${h}s ${min}dk` : `${min}dk` }
const fmtR = (v: number | null, result?: string) => {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  const signed = result === 'SL_HIT' ? -Math.abs(n) : result === 'TP_HIT' ? Math.abs(n) : n
  return (signed > 0 ? '+' : '') + signed.toFixed(2) + 'R'
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

const dirBadge = (d: string) => {
  if (d === 'SHORT') return <span className="badge badge-short">SHORT</span>
  if (d === 'LONG')  return <span className="badge badge-long">LONG</span>
  return <span className="badge badge-wait">WAIT</span>
}
const resultBadge = (r: string) => {
  if (!r)              return <span className="badge badge-pend">BEKL.</span>
  if (r === 'TP_HIT')  return <span className="badge badge-tp">TP</span>
  if (r === 'SL_HIT')  return <span className="badge badge-sl">SL</span>
  if (r === 'EXPIRED') return <span className="badge badge-exp">EXP</span>
  return <span className="badge badge-ne">N/E</span>
}

// ── Filter Panel ───────────────────────────────────────────────────────────

function RangeRow({ label, minKey, maxKey, min, max, step = 1, filters, onChange }: {
  label: string; minKey: keyof Filters; maxKey: keyof Filters
  min: number; max: number; step?: number
  filters: Filters; onChange: (f: Filters) => void
}) {
  const [localMin, setLocalMin] = React.useState<number>(filters[minKey] as number)
  const [localMax, setLocalMax] = React.useState<number>(filters[maxKey] as number)
  React.useEffect(() => { setLocalMin(filters[minKey] as number) }, [filters[minKey]])
  React.useEffect(() => { setLocalMax(filters[maxKey] as number) }, [filters[maxKey]])
  const set = (k: keyof Filters, v: any) => onChange({ ...filters, [k]: v })
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="col-label" style={{ fontSize: 10 }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text)' }}>{localMin} – {localMax}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', width: 20 }}>min</span>
        <input type="range" min={min} max={max} step={step} value={localMin}
          onChange={e => setLocalMin(Number(e.target.value))}
          onMouseUp={e => set(minKey, Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => set(minKey, Number((e.target as HTMLInputElement).value))}
          style={{ flex: 1, cursor: 'pointer' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', width: 32, textAlign: 'right' }}>{localMin}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', width: 20 }}>max</span>
        <input type="range" min={min} max={max} step={step} value={localMax}
          onChange={e => setLocalMax(Number(e.target.value))}
          onMouseUp={e => set(maxKey, Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => set(maxKey, Number((e.target as HTMLInputElement).value))}
          style={{ flex: 1, cursor: 'pointer' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', width: 32, textAlign: 'right' }}>{localMax}</span>
      </div>
    </div>
  )
}

function ToggleGroup({ label, field, options, filters, onChange, nowrap }: {
  label: string; field: keyof Filters; options: string[]
  filters: Filters; onChange: (f: Filters) => void
  nowrap?: boolean
}) {
  const set = (k: keyof Filters, v: any) => onChange({ ...filters, [k]: v })
  return (
    <div>
      <div className="col-label" style={{ marginBottom: 5, fontSize: 10 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: nowrap ? 'nowrap' : 'wrap' }}>
        <button className={`filter-btn${!filters[field] ? ' active' : ''}`} style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => set(field, '')}>TÜM</button>
        {options.map(o => (
          <button key={o} className={`filter-btn${filters[field] === o ? ' active' : ''}`}
            style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={() => set(field, filters[field] === o ? '' : o)}>
            {o.replace('_pressure', '').replace('_HIT', '').replace('NO_ENTRY', 'N/E')}
          </button>
        ))}
      </div>
    </div>
  )
}

function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const sep = <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
  const GL = ({ c }: { c: string }) => (
    <div className="col-label" style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 8 }}>{c}</div>
  )
  const so = { str: ['strong', 'mixed', 'weak'], pres: ['buying_pressure', 'selling_pressure', 'neutral'] }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 600 }}>
      <GL c="Temel Filtreler" />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 14 }}>
        <ToggleGroup label="Direction" field="direction" options={['LONG','SHORT','WAIT']} filters={filters} onChange={onChange} />
        <ToggleGroup label="Sonuç" field="sim_result" options={['TP_HIT','SL_HIT','EXPIRED','NO_ENTRY']} filters={filters} onChange={onChange} nowrap />
        <div>
          <div className="col-label" style={{ marginBottom: 5, fontSize: 10 }}>Tarih aralığı</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={filters.date_from} onChange={e => onChange({ ...filters, date_from: e.target.value })}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>–</span>
            <input type="date" value={filters.date_to} onChange={e => onChange({ ...filters, date_to: e.target.value })}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }} />
            {([
              { key: 'include_weekdays' as const, label: 'Weekdays' },
              { key: 'include_weekends' as const, label: 'Weekend' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                className={`filter-btn${filters[key] ? ' active' : ''}`}
                style={{ fontSize: 10, padding: '2px 10px', flexShrink: 0 }}
                onClick={() => {
                  const next = { ...filters, [key]: !filters[key] }
                  if (!next.include_weekdays && !next.include_weekends) return
                  onChange(next)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sep}
      <GL c="Win Probability" />
      {([
        { label: 'V4', keys: ['wp4', 'wp4_1304', 'wp4_rev', 'wp4_1304_rev'] as const },
        { label: 'V5', keys: ['wp5', 'wp5_1304', 'wp5_rev', 'wp5_1304_rev'] as const },
      ] as const).map(model => (
        <div key={model.label} style={{ marginBottom: 14 }}>
          <div className="col-label" style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 8 }}>{model.label}</div>
          <div className="wp-model-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {(['Latest', '1304', 'Latest Rev', '1304 Rev'] as const).map((suffix, i) => {
              const base = model.keys[i]
              const minKey = `${base}_min` as keyof Filters
              const maxKey = `${base}_max` as keyof Filters
              return (
                <RangeRow
                  key={suffix}
                  label={`${model.label} ${suffix}`}
                  minKey={minKey}
                  maxKey={maxKey}
                  min={0} max={100} step={5}
                  filters={filters}
                  onChange={onChange}
                />
              )
            })}
          </div>
        </div>
      ))}

      {sep}
      <GL c="RSI" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        <RangeRow label="RSI 4H" minKey="rsi_min" maxKey="rsi_max" min={0} max={100} filters={filters} onChange={onChange} />
        <RangeRow label="RSI 30M" minKey="rsi30_min" maxKey="rsi30_max" min={0} max={100} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Delta — H1" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <RangeRow label="LS delta" minKey="h1_ls_delta_min" maxKey="h1_ls_delta_max" min={-3} max={3} step={0.1} filters={filters} onChange={onChange} />
        <RangeRow label="TT Positions delta" minKey="h1_tt_positions_delta_min" maxKey="h1_tt_positions_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="TT Accounts delta" minKey="h1_tt_accounts_delta_min" maxKey="h1_tt_accounts_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="OI delta (BTC)" minKey="h1_oi_delta_min" maxKey="h1_oi_delta_max" min={-20000} max={20000} step={500} filters={filters} onChange={onChange} />
        <RangeRow label="OI/MCap delta" minKey="h1_oi_mcap_delta_min" maxKey="h1_oi_mcap_delta_max" min={-0.05} max={0.05} step={0.005} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Delta — M5" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <RangeRow label="LS delta" minKey="m5_ls_delta_min" maxKey="m5_ls_delta_max" min={-3} max={3} step={0.1} filters={filters} onChange={onChange} />
        <RangeRow label="TT Positions delta" minKey="m5_tt_positions_delta_min" maxKey="m5_tt_positions_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="TT Accounts delta" minKey="m5_tt_accounts_delta_min" maxKey="m5_tt_accounts_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="OI delta (BTC)" minKey="m5_oi_delta_min" maxKey="m5_oi_delta_max" min={-20000} max={20000} step={500} filters={filters} onChange={onChange} />
        <RangeRow label="OI/MCap delta" minKey="m5_oi_mcap_delta_min" maxKey="m5_oi_mcap_delta_max" min={-0.05} max={0.05} step={0.005} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Zamanlama" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        <RangeRow label="Giris Bekleme (dk)" minKey="wait_min" maxKey="wait_max" min={0} max={4320} step={30} filters={filters} onChange={onChange} />
        <RangeRow label="Trade Suresi (dk)" minKey="trade_dur_min" maxKey="trade_dur_max" min={0} max={4320} step={30} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Sentez" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <ToggleGroup label="MTF Synthesis" field="sent_synthesis_mtf" options={so.str} filters={filters} onChange={onChange} nowrap />
        <ToggleGroup label="H1 Synthesis"  field="sent_synthesis_h1"  options={so.str} filters={filters} onChange={onChange} nowrap />
        <ToggleGroup label="M5 Synthesis"  field="sent_synthesis_m5"  options={so.str} filters={filters} onChange={onChange} nowrap />
        <ToggleGroup label="Liquidity"     field="sent_liquidity"     options={so.pres} filters={filters} onChange={onChange} nowrap />
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const router = useRouter()
  const [overview,  setOverview]  = useState<Overview | null>(null)
  const [scoring,   setScoring]   = useState<ScoringData | null>(null)
  const [deltaData, setDeltaData] = useState<DeltaData | null>(null)
  const [cumR,      setCumR]      = useState<CumRData | null>(null)
  const [wpAll,     setWpAll]     = useState<WpAllData | null>(null)
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

  // Load presets from localStorage
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
      fetch(`/api/insights-overview${qs}`,      { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-scoring${qs}`,       { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-delta${qs}`,         { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-cumr${qs}`,          { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/insights-winprob-all${qs}`,   { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/analyses?${p}&page=${pg}`,    { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ov, sc, delta, cr, wpa, an]) => {
      setOverview(ov)
      setScoring(sc)
      setDeltaData(delta)
      setCumR(cr)
      setWpAll(wpa)
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
                <button
                  className="filter-btn"
                  style={{ fontSize: 10, padding: '2px 10px', borderRadius: '4px 0 0 4px' }}
                  onClick={() => applyPreset(p)}
                >{p.name}</button>
                <button
                  onClick={() => deletePreset(p.name)}
                  style={{ padding: '2px 6px', fontSize: 10, fontFamily: 'DM Mono, monospace', background: 'transparent', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 4px 4px 0', color: 'var(--text-3)', cursor: 'pointer' }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* ── FİLTRE PANEL ───────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 16, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="filter-btn" style={{ fontSize: 11 }} onClick={() => setFilterOpen(o => !o)}>
                {filterOpen ? '▲ Kapat' : '▼ Filtrele'}
              </button>
              {activeCount > 0 && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>{activeCount} aktif</span>
              )}
              {activeCount > 0 && (
                <button className="filter-btn" style={{ fontSize: 10, padding: '2px 10px' }} onClick={handleReset}>Sıfırla</button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>yükleniyor...</span>}
              {savingPreset ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && savePreset()}
                    placeholder="preset adı..."
                    style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 8px', fontFamily: 'DM Mono, monospace', width: 120 }}
                    autoFocus
                  />
                  <button className="filter-btn active" style={{ fontSize: 10, padding: '2px 10px' }} onClick={savePreset}>Kaydet</button>
                  <button className="filter-btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => { setSavingPreset(false); setPresetName('') }}>İptal</button>
                </div>
              ) : (
                activeCount > 0 && (
                  <button className="filter-btn" style={{ fontSize: 10, padding: '2px 10px' }} onClick={() => setSavingPreset(true)}>
                    + Preset Kaydet
                  </button>
                )
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
                <button className="filter-btn active" style={{ fontSize: 11, padding: '5px 20px' }} onClick={handleApply}>Uygula</button>
                <button className="filter-btn" style={{ fontSize: 11, padding: '5px 14px', color: 'var(--text-3)' }} onClick={() => { setDraftFilters(appliedFilters); setFilterOpen(false) }}>Iptal</button>
              </div>
            </>
          )}
        </div>

        {!loading && overview && (
          <>
            {/* ── SUMMARY SCORE CARDS ──────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>Toplam Analiz</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{overview.total_all}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:{overview.long_total}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:{overview.short_total}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>Sim Edilen</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{overview.total}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:{overview.long_total}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:{overview.short_total}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>Win Rate</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: winColor(Number(overview.win_rate)) }}>%{Number(overview.win_rate).toFixed(1)}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>L:%{Number(overview.long_win_rate).toFixed(1)}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>S:%{Number(overview.short_win_rate).toFixed(1)}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>Toplam R</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: Number(overview.total_pnl) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {overview.total_pnl != null ? `${Number(overview.total_pnl) > 0 ? '+' : ''}$${Math.abs(Number(overview.total_pnl)).toFixed(0)}` : '—'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--green)' }}>
                    L:<span style={{ color: Number(overview.long_total_pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {overview.long_total_pnl != null ? `${Number(overview.long_total_pnl) > 0 ? '+' : ''}$${Math.abs(Number(overview.long_total_pnl)).toFixed(0)}` : '—'}
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>
                    S:<span style={{ color: Number(overview.short_total_pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {overview.short_total_pnl != null ? `${Number(overview.short_total_pnl) > 0 ? '+' : ''}$${Math.abs(Number(overview.short_total_pnl)).toFixed(0)}` : '—'}
                    </span>
                  </span>
                </div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>TP Hit</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{overview.tp_count}</div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>SL Hit</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--red)' }}>{overview.sl_count}</div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>Expired</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--amber)' }}>{overview.expired_count}</div>
              </div>
              <div className="stat-card">
                <div className="col-label" style={{ marginBottom: 4 }}>No Entry</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-2)' }}>{overview.no_entry_count}</div>
              </div>
            </div>

            {/* ── KÜMÜLATİF R + GÜNLÜK TRADE ─────────────────────────────── */}
            {cumR && cumR.series.length > 0 && (() => {
              const lineColor = cumR.final_r >= 0 ? '#4ade80' : '#f87171'
              return (
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div className="col-label">Kümülatif R</div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--red)' }}>Max DD: {cumR.max_drawdown.toFixed(2)}R</span>
                      <span className="mono" style={{ fontSize: 11, color: lineColor, fontWeight: 600 }}>{cumR.final_r >= 0 ? '+' : ''}{cumR.final_r.toFixed(2)}R</span>
                    </div>
                  </div>
                  <div style={{ height: 160 }}>
                    <Chart
                      type="line"
                      data={{
                        labels: cumR.series.map(p => new Date(p.day).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })),
                        datasets: [
                          {
                            type: 'line' as const,
                            data: cumR.series.map(p => p.cumulative_r),
                            borderColor: lineColor,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: true,
                            backgroundColor: cumR.final_r >= 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
                            tension: 0.3,
                            yAxisID: 'yR',
                          },
                          {
                            type: 'bar' as const,
                            data: cumR.series.map(p => (p as any).trade_count ?? 0),
                            backgroundColor: 'rgba(96,165,250,0.25)',
                            borderColor: 'rgba(96,165,250,0.5)',
                            borderWidth: 1,
                            yAxisID: 'yCount',
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { displayColors: false, callbacks: { label: (ctx: any) => {
                            const p = cumR.series[ctx.dataIndex]
                            return ctx.datasetIndex === 0
                              ? `Küm: ${p.cumulative_r >= 0 ? '+' : ''}${p.cumulative_r.toFixed(2)}R`
                              : `Trade: ${(p as any).trade_count ?? 0}`
                          }}},
                        },
                        scales: {
                          x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxTicksLimit: 12 } },
                          yR: { ...axisStyle, position: 'left', ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}R` } },
                          yCount: { ...axisStyle, position: 'right', grid: { drawOnChartArea: false }, ticks: { ...axisStyle.ticks, stepSize: 1, callback: (v: any) => `${v}` } },
                        },
                      } as any}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'flex-end' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 12, height: 2, background: lineColor, display: 'inline-block', borderRadius: 1 }} />
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>Kümülatif R</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 12, height: 8, background: 'rgba(96,165,250,0.4)', display: 'inline-block', borderRadius: 1 }} />
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>Günlük Trade</span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── RSI WIN RATE TABLOLARI ───────────────────────────────────── */}
            {scoring && (
              <div className="rsi-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
                  <div className="col-label" style={{ marginBottom: 12 }}>RSI 4H Zonu → Win Rate</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 6, marginBottom: 6 }}>
                    <div />
                    <span className="mono" style={{ fontSize: 9, color: 'var(--green)', textAlign: 'center' }}>LONG</span>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--red)', textAlign: 'center' }}>SHORT</span>
                  </div>
                  {scoring.by_rsi.map(row => {
                    const long  = scoring.by_rsi_long.find((r: any) => r.rsi_zone === row.rsi_zone)
                    const short = scoring.by_rsi_short.find((r: any) => r.rsi_zone === row.rsi_zone)
                    return (
                      <div key={row.rsi_zone} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)' }}>{row.rsi_zone}</span>
                        <WinBar rate={long ? Number(long.win_rate) : null} total={long ? Number(long.total) : 0} />
                        <WinBar rate={short ? Number(short.win_rate) : null} total={short ? Number(short.total) : 0} />
                      </div>
                    )
                  })}
                </div>
                {scoring.by_rsi30?.length > 0 && (
                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 12 }}>RSI 30M Zonu → Win Rate</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 6, marginBottom: 6 }}>
                      <div />
                      <span className="mono" style={{ fontSize: 9, color: 'var(--green)', textAlign: 'center' }}>LONG</span>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--red)', textAlign: 'center' }}>SHORT</span>
                    </div>
                    {scoring.by_rsi30.map((row: any) => {
                      const long  = scoring.by_rsi30_long?.find((r: any) => r.rsi_zone === row.rsi_zone)
                      const short = scoring.by_rsi30_short?.find((r: any) => r.rsi_zone === row.rsi_zone)
                      return (
                        <div key={row.rsi_zone} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)' }}>{row.rsi_zone}</span>
                          <WinBar rate={long ? Number(long.win_rate) : null} total={long ? Number(long.total) : 0} />
                          <WinBar rate={short ? Number(short.win_rate) : null} total={short ? Number(short.total) : 0} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── WIN PROBABILITY KALİBRASYON TABLOSU ─────────────────────── */}
            {wpAll && (
              <div style={{ marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  WIN PROBABILITY KALİBRASYONU
                </div>
                {(['v4','v5'] as const).map(v => {
                  const VERSIONS = [
                    { key: `${v}`,          label: 'Latest' },
                    { key: `${v}_1304`,     label: '1304' },
                    { key: `${v}_rev`,      label: 'Latest Rev' },
                    { key: `${v}_1304_rev`, label: '1304 Rev' },
                  ]
                  const buckets = ['0-20%','20-30%','30-40%','40-50%','50-60%','60-70%','70%+']
                  const hasData = VERSIONS.some(ver => (wpAll[ver.key] ?? []).length > 0)
                  if (!hasData) return null
                  return (
                    <div key={v} className="card" style={{ padding: 16, marginBottom: 10, overflowX: 'auto' }}>
                      <div className="col-label" style={{ marginBottom: 10 }}>{v.toUpperCase()}</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'DM Mono, monospace', minWidth: 600 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400, width: 70 }}>Dilim</th>
                            {VERSIONS.map(ver => (
                              <th key={ver.key} colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400, borderLeft: '1px solid var(--border)' }}>
                                {ver.label}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            <th style={{ paddingBottom: 8 }} />
                            {VERSIONS.map(ver => (
                              <React.Fragment key={ver.key}>
                                <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400, borderLeft: '1px solid var(--border)', paddingLeft: 6 }}>Win%</th>
                                <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400 }}>n</th>
                                <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400, paddingRight: 8 }}>Tot.R</th>
                              </React.Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {buckets.map(bucket => (
                            <tr key={bucket} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '5px 0', color: 'var(--text-2)' }}>{bucket}</td>
                              {VERSIONS.map(ver => {
                                const row = (wpAll[ver.key] ?? []).find((r: WpBucket) => r.bucket === bucket)
                                return (
                                  <React.Fragment key={ver.key}>
                                    <td style={{ padding: '5px 0 5px 6px', textAlign: 'right', borderLeft: '1px solid var(--border)', color: row ? winColor(Number(row.win_rate)) : 'var(--text-3)' }}>
                                      {row ? `%${Number(row.win_rate).toFixed(1)}` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 4px', textAlign: 'right', color: 'var(--text-3)' }}>
                                      {row ? row.total : '—'}
                                    </td>
                                    <td style={{ padding: '5px 8px 5px 0', textAlign: 'right', color: row?.total_r != null ? (Number(row.total_r) >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-3)' }}>
                                      {row?.total_r != null ? `${Number(row.total_r) >= 0 ? '+' : ''}${Number(row.total_r).toFixed(1)}` : '—'}
                                    </td>
                                  </React.Fragment>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── DELTA ANALİZİ ────────────────────────────────────────────── */}
            {deltaData && Object.keys(deltaData).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  DELTA ANALİZİ (BAŞLANGIÇ → ANLIK DEĞİŞİM)
                </div>
                <div className="delta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12 }}>
                  {Object.entries(deltaData).map(([key, rows]) => {
                    if (!rows || rows.length === 0) return null
                    const label = rows[0]?.label || key
                    return (
                      <div key={key} className="card" style={{ padding: 16 }}>
                        <div className="col-label" style={{ marginBottom: 10 }}>{label} delta → win rate</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'DM Mono, monospace' }}>
                          <thead>
                            <tr>
                              {['Delta', 'Win%', 'Ort. R', 'Toplam R', 'n'].map((h, i) => (
                                <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '4px 0', color: 'var(--text-2)' }}>{r.bucket}</td>
                                <td style={{ padding: '4px 0', textAlign: 'right', color: winColor(Number(r.win_rate)) }}>%{Number(r.win_rate).toFixed(1)}</td>
                                <td style={{ padding: '4px 0', textAlign: 'right', color: Number(r.avg_r ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {r.avg_r != null ? `${Number(r.avg_r) >= 0 ? '+' : ''}${Number(r.avg_r).toFixed(2)}R` : '—'}
                                </td>
                                <td style={{ padding: '4px 0', textAlign: 'right', color: Number(r.total_r ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {r.total_r != null ? `${Number(r.total_r) >= 0 ? '+' : ''}${Number(r.total_r).toFixed(2)}R` : '—'}
                                </td>
                                <td style={{ padding: '4px 0', textAlign: 'right', color: 'var(--text-3)' }}>{r.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── ANALİZ LİSTESİ ───────────────────────────────────────────── */}
            <div style={{ marginBottom: 12 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                ANALİZ LİSTESİ
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{total} kayıt</span>
              </div>
            </div>

            <div className="card">
              <div className="analysis-row" style={{ cursor: 'default' }}>
                <span className="col-label">Tarih</span>
                <span className="col-label">Yon</span>
                <span className="col-label">Giris</span>
                <span className="col-label">TP</span>
                <span className="col-label">SL</span>
                <span className="col-label">R/R</span>
                <span className="col-label">RSI</span>
                {['V4 1304','V5 1304'].map(h => (
                  <span key={h} className="col-label">{h}</span>
                ))}
                {['V4 (Rev)','V5 (Rev)'].map(h => (
                  <span key={h} className="col-label">{h}</span>
                ))}
                <span className="col-label">PnL</span>
                <span className="col-label">R</span>
                <span className="col-label">Sonuc</span>
              </div>

              {analyses.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }} className="mono">kayıt bulunamadı</div>
              )}

              {analyses.map(a => (
                <div key={a.id} className="analysis-row" onClick={() => router.push(`/dashboard/${a.id}`)}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmtDate(a.analyzed_at)}</span>
                  <span>{dirBadge(a.direction)}</span>
                  <span className="price" style={{ fontSize: 12 }}>${fmt(a.entry)}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--green)' }}>${fmt(a.tp)}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--red)' }}>${fmt(a.sl)}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rr}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rsi_4h != null ? Number(a.rsi_4h).toFixed(1) : '—'}</span>
                  {([
                    { wp: a.win_probability_v4_1304, rev: null },
                    { wp: a.win_probability_v5_1304, rev: null },
                    { wp: a.win_probability_v4,      rev: a.win_probability_v4_reverse },
                    { wp: a.win_probability_v5,      rev: a.win_probability_v5_reverse },
                  ]).map(({ wp, rev }, i) => (
                    <span key={i} className="mono" style={{ fontSize: 11, color: wpColor(wp) }}>
                      {wp != null ? `%${Number(wp).toFixed(0)}` : '—'}
                      {rev != null && (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 2 }}>
                          ({`%${Number(rev).toFixed(0)}`})
                        </span>
                      )}
                    </span>
                  ))}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {dirBadge(a.direction)}
                      {resultBadge(a.sim_result)}
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{fmtDate(a.analyzed_at)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div className="col-label" style={{ marginBottom: 2 }}>Giris</div>
                      <span className="price" style={{ fontSize: 13 }}>${fmt(a.entry)}</span>
                    </div>
                    <div>
                      <div className="col-label" style={{ marginBottom: 2 }}>TP</div>
                      <span className="mono" style={{ fontSize: 13, color: 'var(--green)' }}>${fmt(a.tp)}</span>
                    </div>
                    <div>
                      <div className="col-label" style={{ marginBottom: 2 }}>SL</div>
                      <span className="mono" style={{ fontSize: 13, color: 'var(--red)' }}>${fmt(a.sl)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div><span className="col-label">R/R </span><span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.rr}</span></div>
                    <div><span className="col-label">RSI4H </span><span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.rsi_4h != null ? Number(a.rsi_4h).toFixed(1) : '—'}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    {([
                      { wp: a.win_probability_v4, rev: a.win_probability_v4_reverse, label: 'V4' },
                      { wp: a.win_probability_v5, rev: a.win_probability_v5_reverse, label: 'V5' },
                    ]).map(({ wp, rev, label }) => (
                      <div key={label}>
                        <span className="col-label">{label} </span>
                        <span className="mono" style={{ fontSize: 12, color: wpColor(wp) }}>
                          {wp != null ? `%${Number(wp).toFixed(0)}` : '—'}
                        </span>
                        {rev != null && (
                          <span className="mono" style={{ fontSize: 10, color: wpColor(rev), marginLeft: 2 }}>
                            /{Number(rev).toFixed(0)}
                          </span>
                        )}
                      </div>
                    ))}
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
                <button className="filter-btn" onClick={() => handlePage(Math.max(1, page - 1))} disabled={page === 1}>← Önceki</button>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 12px' }}>{page} / {totalPages}</span>
                <button className="filter-btn" onClick={() => handlePage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Sonraki →</button>
              </div>
            )}
          </>
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>yükleniyor...</span>
          </div>
        )}
      </div>
    </div>
  )
}
