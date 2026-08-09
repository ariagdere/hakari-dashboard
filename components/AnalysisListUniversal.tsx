'use client'
import React from 'react'
import { useRouter } from 'next/navigation'

export interface UniversalAnalysisRow {
  id: number; analyzed_at: string
  direction: string; entry: number; tp: number; sl: number; rr: string
  rsi_4h: number | null
  sim_result: string; sim_pnl_usd: number; sim_r_multiple: number
  win_probability_v6: number | null; win_probability_v6_reverse: number | null
  win_probability_c75: number | null; win_probability_c75_reverse: number | null
  zlema_zone_4h: string | null
  naive_direction: string | null; naive_entry: number | null
  naive_tp: number | null; naive_sl: number | null; naive_rr: number | null
  naive_dist_ratio: number | null
  sim_result_naive: string | null; naive_sim_r_multiple: number | null
}

const fmtDate = (s: string) => { const d = new Date(s); d.setUTCHours(d.getUTCHours() + 3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` }
const fmt   = (v: number) => Math.round(v).toLocaleString('en-US')
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
const wpCell = (wp: number | null) => (
  <span className="mono" style={{ fontSize: 10, color: wpColor(wp) }}>{wp != null ? `%${Number(wp).toFixed(0)}` : '—'}</span>
)

export default function AnalysisListUniversal({ analyses }: { analyses: UniversalAnalysisRow[] }) {
  const router = useRouter()

  if (analyses.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }} className="mono">no records found</div>
  }

  return (
    <div className="card">
      <div className="analysis-row-uni-header">
        <span className="col-label">Date</span>
        <span className="col-label">Dir</span>
        <span className="col-label">Entry</span>
        <span className="col-label">TP</span>
        <span className="col-label">SL</span>
        <span className="col-label">R/R</span>
        <span className="col-label">RSI</span>
        <span className="col-label">V6</span>
        <span className="col-label">V6r</span>
        <span className="col-label">C75</span>
        <span className="col-label">C75r</span>
        <span className="col-label">ZLEMA</span>
        <span className="col-label">PnL</span>
        <span className="col-label">R</span>
        <span className="col-label">Result</span>
      </div>

      {analyses.map(a => (
        <div key={a.id} className="analysis-row-uni" onClick={() => router.push(`/dashboard/${a.id}`)}>
          <div className="analysis-row-uni-line">
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmtDate(a.analyzed_at)}</span>
            <span>{dirBadge(a.direction)}</span>
            <span className="price" style={{ fontSize: 12 }}>${fmt(a.entry)}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--green)' }}>${fmt(a.tp)}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--red)' }}>${fmt(a.sl)}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rr}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rsi_4h != null ? Number(a.rsi_4h).toFixed(1) : '—'}</span>
            {wpCell(a.win_probability_v6)}
            {wpCell(a.win_probability_v6_reverse)}
            {wpCell(a.win_probability_c75)}
            {wpCell(a.win_probability_c75_reverse)}
            <span>{zlemaBadge(a.zlema_zone_4h)}</span>
            <span className={`mono ${pnlClass(Number(a.sim_pnl_usd))}`} style={{ fontSize: 11 }}>
              {a.sim_pnl_usd != null ? `${Number(a.sim_pnl_usd) > 0 ? '+' : ''}$${Math.abs(Number(a.sim_pnl_usd)).toFixed(2)}` : '—'}
            </span>
            <span className={`mono ${pnlClass(a.sim_result === 'SL_HIT' ? -1 : Number(a.sim_r_multiple))}`} style={{ fontSize: 11 }}>
              {fmtR(a.sim_r_multiple, a.sim_result)}
            </span>
            <span>{resultBadge(a.sim_result)}</span>
          </div>

          <div className="analysis-row-uni-line naive-line">
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>NAIF</span>
            <span>{dirBadge(a.naive_direction)}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.naive_entry != null ? `$${fmt(a.naive_entry)}` : '—'}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>{a.naive_tp != null ? `$${fmt(a.naive_tp)}` : '—'}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--red)' }}>{a.naive_sl != null ? `$${fmt(a.naive_sl)}` : '—'}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{a.naive_rr != null ? Number(a.naive_rr).toFixed(2) : '—'}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{a.naive_dist_ratio != null ? `${Number(a.naive_dist_ratio).toFixed(1)}x` : '—'}</span>
            <span /><span /><span /><span /><span />
            <span />
            <span className={`mono ${a.naive_sim_r_multiple != null ? pnlClass(a.sim_result_naive === 'SL_HIT' ? -1 : Number(a.naive_sim_r_multiple)) : 'pnl-zero'}`} style={{ fontSize: 10 }}>
              {fmtR(a.naive_sim_r_multiple, a.sim_result_naive)}
            </span>
            <span>{resultBadge(a.sim_result_naive)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
