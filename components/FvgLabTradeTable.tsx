'use client'
import type { SimTrade } from '@/lib/fvgBacktest'

interface Props {
  trades: SimTrade[]
  selectedIdx: number | null
  onSelect: (fvgIndex: number) => void
}

function fmtTime(ms: number) {
  const d = new Date(ms + 3 * 3600 * 1000) // UTC+3 gosterim, proje konvansiyonu
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function Dot({ v }: { v: boolean | null }) {
  if (v == null) return <span style={{ color: 'var(--text-3)', opacity: 0.4 }}>–</span>
  return <span style={{ color: v ? 'var(--green)' : 'var(--text-3)' }}>{v ? '●' : '○'}</span>
}

function ResultBadge({ result }: { result: string }) {
  const cls = result === 'TP_HIT' ? 'badge-tp' : result === 'SL_HIT' ? 'badge-sl' : 'badge-exp'
  const label = result === 'TP_HIT' ? 'TP' : result === 'SL_HIT' ? 'SL' : 'EXP'
  return <span className={`badge ${cls}`} style={{ fontSize: 10, padding: '2px 6px' }}>{label}</span>
}

export default function FvgLabTradeTable({ trades, selectedIdx, onSelect }: Props) {
  if (trades.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Bu aralıkta geçerli işlem bulunamadı.</div>
  }
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Yön', 'Kırılma', 'Likidite', 'BOS', 'Displ.', 'ZLEMA', 'Entry', 'SL', 'TP', 'RR', 'Sonuç', 'R'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-3)', fontWeight: 400, fontSize: 10, letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.slice().reverse().map((t) => {
            const isSelected = selectedIdx === t.fvgIndex
            return (
              <tr key={t.fvgIndex} onClick={() => onSelect(t.fvgIndex)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--bg-3)',
                  background: isSelected ? 'rgba(251,191,36,0.08)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid transparent',
                }}>
                <td style={{ padding: '7px 10px', color: t.direction === 'LONG' ? 'var(--green)' : 'var(--red)' }}>{t.direction}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{fmtTime(t.filledAt)}</td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.sweepPass} /></td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.bosPass} /></td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.displacementPass} /></td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.zlemaPass} /></td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.entry.toFixed(1)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.sl.toFixed(1)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.tp.toFixed(1)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.rr != null ? `1:${t.rr}` : '—'}</td>
                <td style={{ padding: '7px 10px' }}><ResultBadge result={t.result} /></td>
                <td style={{ padding: '7px 10px', color: t.rMultiple >= 0 ? 'var(--green)' : 'var(--red)' }} className="mono">
                  {t.rMultiple >= 0 ? '+' : ''}{t.rMultiple}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
