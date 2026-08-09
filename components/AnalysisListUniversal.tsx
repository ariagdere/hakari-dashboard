'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export interface UniversalAnalysisRow {
  id: number; analyzed_at: string
  direction: string; entry: number; tp: number; sl: number; rr: string
  rsi_4h: number | null; rsi_30m: number | null
  sim_result: string; sim_pnl_usd: number; sim_r_multiple: number
  win_probability_v6: number | null; win_probability_v6_reverse: number | null
  win_probability_c75: number | null; win_probability_c75_reverse: number | null
  zlema_zone_4h: string | null
  cluster_liq_ratio: number | null
  cluster_up_hit: boolean | null; cluster_dn_hit: boolean | null
  cluster_up_reach_pct: number | null; cluster_dn_reach_pct: number | null
  naive_direction: string | null; naive_entry: number | null
  naive_tp: number | null; naive_sl: number | null; naive_rr: number | null
  naive_dist_ratio: number | null; naive_pos_size: number | null
  naive_duration_mins: number | null
  sim_result_naive: string | null; naive_sim_r_multiple: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────
const fmtDate = (s: string) => { const d = new Date(s); d.setUTCHours(d.getUTCHours() + 3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` }
const fmt   = (v: number | null) => v == null ? '—' : Math.round(v).toLocaleString('en-US')
const fmtR  = (r: number | null, result: string | null) => { if (r == null || !result) return '—'; const v = result === 'SL_HIT' ? -1 : Number(r); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` }
const pnlClass = (v: number) => v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero'
const wpColor  = (v: number | null | undefined) => !v ? 'var(--text-3)' : v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)'
const dirBadge = (d: string | null) => d ? <span className={`badge ${d === 'LONG' ? 'badge-long' : 'badge-short'}`}>{d}</span> : <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>—</span>
const resultBadge = (r: string | null) => {
  if (!r) return <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>—</span>
  const map: Record<string, string> = { TP_HIT: 'badge-tp', SL_HIT: 'badge-sl', EXPIRED: 'badge-exp', NO_ENTRY: 'badge-ne', PENDING: 'badge-pend' }
  const lbl: Record<string, string> = { TP_HIT: 'TP', SL_HIT: 'SL', EXPIRED: 'EXP', NO_ENTRY: 'N/E', PENDING: '...' }
  return <span className={`badge ${map[r] || ''}`}>{lbl[r] || r}</span>
}
const zlemaBadge = (z: string | null) => {
  if (!z) return <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>—</span>
  const color = z === 'LONG' ? 'var(--green)' : z === 'SHORT' ? 'var(--red)' : 'var(--text-3)'
  return <span className="mono" style={{ fontSize: 9, color, border: `1px solid ${color}`, borderRadius: 3, padding: '1px 5px' }}>{z === 'NO_TRADE' ? 'N/T' : z}</span>
}
const wpCell = (wp: number | null) => <span className="mono" style={{ fontSize: 11, color: wpColor(wp) }}>{wp != null ? `%${Number(wp).toFixed(0)}` : '—'}</span>
const priceCell = (v: number | null, color?: string) => <span className="mono" style={{ fontSize: 11, color: color ?? 'var(--text-2)' }}>{v != null ? `$${fmt(v)}` : '—'}</span>
const numCell = (v: number | null, digits = 2, suffix = '') => <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{v != null ? `${Number(v).toFixed(digits)}${suffix}` : '—'}</span>
const boolCell = (v: boolean | null) => <span className="mono" style={{ fontSize: 11, color: v ? 'var(--green)' : 'var(--text-3)' }}>{v != null ? (v ? '✓' : '—') : '—'}</span>

// ── Kolon Kayıt Defteri ──────────────────────────────────────────────────
interface ColumnDef {
  id: string
  label: string
  group: 'shared' | 'ai' | 'naive'
  width: string       // CSS grid track boyutu
  default: boolean     // varsayılan olarak açık mı
  render: (a: UniversalAnalysisRow) => React.ReactNode
}

export const COLUMNS: ColumnDef[] = [
  { id: 'date',      label: 'Date',      group: 'shared', width: '112px',             default: true,  render: a => <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmtDate(a.analyzed_at)}</span> },
  { id: 'rsi4h',     label: 'RSI 4H',    group: 'shared', width: 'minmax(48px,0.6fr)', default: true,  render: a => numCell(a.rsi_4h, 1) },
  { id: 'rsi30',     label: 'RSI 30M',   group: 'shared', width: 'minmax(48px,0.6fr)', default: false, render: a => numCell(a.rsi_30m, 1) },
  { id: 'zlema',     label: 'ZLEMA',     group: 'shared', width: '68px',               default: true,  render: a => zlemaBadge(a.zlema_zone_4h) },
  { id: 'liqratio',  label: 'Liq Ratio', group: 'shared', width: 'minmax(56px,0.6fr)', default: false, render: a => numCell(a.cluster_liq_ratio, 2) },
  { id: 'uphit',     label: 'Up Hit',    group: 'shared', width: '56px',               default: false, render: a => boolCell(a.cluster_up_hit) },
  { id: 'dnhit',     label: 'Dn Hit',    group: 'shared', width: '56px',               default: false, render: a => boolCell(a.cluster_dn_hit) },
  { id: 'upreach',   label: 'Up Reach',  group: 'shared', width: 'minmax(56px,0.6fr)', default: false, render: a => <span className="mono" style={{ fontSize: 11, color: a.cluster_up_reach_pct != null && Number(a.cluster_up_reach_pct) >= 75 ? 'var(--green)' : 'var(--text-2)' }}>{a.cluster_up_reach_pct != null ? `%${Number(a.cluster_up_reach_pct).toFixed(0)}` : '—'}</span> },
  { id: 'dnreach',   label: 'Dn Reach',  group: 'shared', width: 'minmax(56px,0.6fr)', default: false, render: a => <span className="mono" style={{ fontSize: 11, color: a.cluster_dn_reach_pct != null && Number(a.cluster_dn_reach_pct) >= 75 ? 'var(--green)' : 'var(--text-2)' }}>{a.cluster_dn_reach_pct != null ? `%${Number(a.cluster_dn_reach_pct).toFixed(0)}` : '—'}</span> },

  { id: 'ai_dir',    label: 'AI Dir',    group: 'ai', width: '64px',               default: true,  render: a => dirBadge(a.direction) },
  { id: 'ai_entry',  label: 'AI Entry',  group: 'ai', width: 'minmax(76px,1fr)',   default: true,  render: a => priceCell(a.entry) },
  { id: 'ai_tp',     label: 'AI TP',     group: 'ai', width: 'minmax(76px,1fr)',   default: true,  render: a => priceCell(a.tp, 'var(--green)') },
  { id: 'ai_sl',     label: 'AI SL',     group: 'ai', width: 'minmax(76px,1fr)',   default: true,  render: a => priceCell(a.sl, 'var(--red)') },
  { id: 'ai_rr',     label: 'AI R/R',    group: 'ai', width: 'minmax(50px,0.6fr)', default: true,  render: a => <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rr ?? '—'}</span> },
  { id: 'v6',        label: 'V6',        group: 'ai', width: 'minmax(44px,0.5fr)', default: true,  render: a => wpCell(a.win_probability_v6) },
  { id: 'v6rev',     label: 'V6 Rev',    group: 'ai', width: 'minmax(44px,0.5fr)', default: true,  render: a => wpCell(a.win_probability_v6_reverse) },
  { id: 'c75',       label: 'C75',       group: 'ai', width: 'minmax(44px,0.5fr)', default: false, render: a => wpCell(a.win_probability_c75) },
  { id: 'c75rev',    label: 'C75 Rev',   group: 'ai', width: 'minmax(44px,0.5fr)', default: false, render: a => wpCell(a.win_probability_c75_reverse) },
  { id: 'ai_pnl',    label: 'AI PnL',    group: 'ai', width: 'minmax(72px,1fr)',   default: false, render: a => <span className={`mono ${pnlClass(Number(a.sim_pnl_usd))}`} style={{ fontSize: 11 }}>{a.sim_pnl_usd != null ? `${Number(a.sim_pnl_usd) > 0 ? '+' : ''}$${Math.abs(Number(a.sim_pnl_usd)).toFixed(2)}` : '—'}</span> },
  { id: 'ai_r',      label: 'AI R',      group: 'ai', width: 'minmax(60px,0.7fr)', default: true,  render: a => <span className={`mono ${pnlClass(a.sim_result === 'SL_HIT' ? -1 : Number(a.sim_r_multiple))}`} style={{ fontSize: 11 }}>{fmtR(a.sim_r_multiple, a.sim_result)}</span> },
  { id: 'ai_result', label: 'AI Result', group: 'ai', width: '64px',               default: true,  render: a => resultBadge(a.sim_result) },

  { id: 'nv_dir',    label: 'Nv Dir',    group: 'naive', width: '64px',               default: true,  render: a => dirBadge(a.naive_direction) },
  { id: 'nv_entry',  label: 'Nv Entry',  group: 'naive', width: 'minmax(76px,1fr)',   default: false, render: a => priceCell(a.naive_entry) },
  { id: 'nv_tp',     label: 'Nv TP',     group: 'naive', width: 'minmax(76px,1fr)',   default: false, render: a => priceCell(a.naive_tp, 'var(--green)') },
  { id: 'nv_sl',     label: 'Nv SL',     group: 'naive', width: 'minmax(76px,1fr)',   default: false, render: a => priceCell(a.naive_sl, 'var(--red)') },
  { id: 'nv_rr',     label: 'Nv R/R',    group: 'naive', width: 'minmax(50px,0.6fr)', default: false, render: a => numCell(a.naive_rr, 2) },
  { id: 'nv_dist',   label: 'Dist Ratio',group: 'naive', width: 'minmax(60px,0.7fr)', default: false, render: a => numCell(a.naive_dist_ratio, 2, 'x') },
  { id: 'nv_pos',    label: 'Pos Size',  group: 'naive', width: 'minmax(64px,0.8fr)', default: false, render: a => numCell(a.naive_pos_size, 4) },
  { id: 'nv_dur',    label: 'Nv Dur',    group: 'naive', width: 'minmax(60px,0.7fr)', default: false, render: a => a.naive_duration_mins != null ? <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{Math.round(Number(a.naive_duration_mins)/60)}sa</span> : <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span> },
  { id: 'nv_r',      label: 'Nv R',      group: 'naive', width: 'minmax(60px,0.7fr)', default: true,  render: a => <span className={`mono ${a.naive_sim_r_multiple != null ? pnlClass(a.sim_result_naive === 'SL_HIT' ? -1 : Number(a.naive_sim_r_multiple)) : 'pnl-zero'}`} style={{ fontSize: 11 }}>{fmtR(a.naive_sim_r_multiple, a.sim_result_naive)}</span> },
  { id: 'nv_result', label: 'Nv Result', group: 'naive', width: '64px',               default: true,  render: a => resultBadge(a.sim_result_naive) },
]

const DEFAULT_VISIBLE = COLUMNS.filter(c => c.default).map(c => c.id)
const STORAGE_KEY = 'hakari_analysis_columns'
const GROUP_LABELS: Record<string, string> = { shared: 'ORTAK', ai: 'AI', naive: 'NAİF' }
const GROUP_COLOR: Record<string, string> = { shared: 'var(--text-3)', ai: 'var(--green)', naive: 'var(--amber)' }

// ── Kolon Seçici Panel ───────────────────────────────────────────────────
function ColumnPicker({ visible, onChange }: { visible: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggle = (id: string) => {
    const next = visible.includes(id) ? visible.filter(v => v !== id) : [...visible, id]
    onChange(next)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="filter-btn" style={{ fontSize: 10, padding: '3px 12px' }} onClick={() => setOpen(o => !o)}>
        ⚙ Kolonlar ({visible.length})
      </button>
      {open && (
        <div className="card" style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 20, padding: 14,
          width: 260, maxHeight: 420, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {(['shared', 'ai', 'naive'] as const).map(group => (
            <div key={group} style={{ marginBottom: 12 }}>
              <div className="col-label" style={{ fontSize: 9, color: GROUP_COLOR[group], marginBottom: 6 }}>{GROUP_LABELS[group]}</div>
              {COLUMNS.filter(c => c.group === group).map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visible.includes(c.id)} onChange={() => toggle(c.id)} style={{ cursor: 'pointer' }} />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{c.label}</span>
                </label>
              ))}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', gap: 6 }}>
            <button className="filter-btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onChange(DEFAULT_VISIBLE)}>Varsayılan</button>
            <button className="filter-btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onChange(COLUMNS.map(c => c.id))}>Tümü</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function AnalysisListUniversal({ analyses }: { analyses: UniversalAnalysisRow[] }) {
  const router = useRouter()
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ dragging: boolean; startX: number; startScroll: number; moved: boolean }>({ dragging: false, startX: 0, startScroll: 0, moved: false })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) setVisible(parsed)
      }
    } catch {}
  }, [])

  const handleChange = (ids: string[]) => {
    setVisible(ids)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch {}
  }

  // Fare tekerleği ile yatay kaydırma — tablo üzerindeyken dikey tekerlek hareketi yatay kaydırmaya dönüşür
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollWidth <= el.clientWidth) return // taşma yoksa müdahale etme
    e.preventDefault()
    el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX
  }, [])

  // Tıkla-sürükle ile kaydırma
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el) return
    dragState.current = { dragging: true, startX: e.pageX, startScroll: el.scrollLeft, moved: false }
    el.style.cursor = 'grabbing'
  }, [])
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el || !dragState.current.dragging) return
    const dx = e.pageX - dragState.current.startX
    if (Math.abs(dx) > 4) dragState.current.moved = true
    el.scrollLeft = dragState.current.startScroll - dx
  }, [])
  const endDrag = useCallback(() => {
    const el = scrollRef.current
    if (el) el.style.cursor = 'grab'
    dragState.current.dragging = false
  }, [])

  const activeCols = COLUMNS.filter(c => visible.includes(c.id))
  const gridTemplate = activeCols.map(c => c.width).join(' ')

  const handleRowClick = (id: number) => {
    if (dragState.current.moved) return // sürüklemeyi tıklama sayma
    router.push(`/dashboard/${id}`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>↔ tekerlek veya sürükle ile kaydır</span>
        <ColumnPicker visible={visible} onChange={handleChange} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          ref={scrollRef}
          className="hscroll-fancy"
          style={{ overflowX: 'auto', overflowY: 'hidden', cursor: 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <div style={{ minWidth: 'fit-content' }}>
            <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 8, padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
              {activeCols.map((c, i) => (
                <span
                  key={c.id}
                  className={`col-label${i === 0 ? ' uni-sticky-header' : ''}`}
                  style={{ color: GROUP_COLOR[c.group] }}
                >
                  {c.label}
                </span>
              ))}
            </div>

            {analyses.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }} className="mono">no records found</div>
            )}

            {analyses.map(a => (
              <div
                key={a.id}
                className="uni-row"
                style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 8, padding: '7px 16px', borderBottom: '1px solid var(--border)' }}
                onClick={() => handleRowClick(a.id)}
              >
                {activeCols.map((c, i) => (
                  <div key={c.id} className={i === 0 ? 'uni-sticky-cell' : undefined}>
                    {c.render(a)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
