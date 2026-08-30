'use client'
import type { Fvg, Candle } from '@/lib/fvgEngine'

interface OpenFvgRow { fvgIndex: number; fvg: Fvg }
interface Props {
  fvgs: Fvg[]
  candles: Candle[]
  selectedIdx: number | null
  onSelect: (fvgIndex: number) => void
}

function fmtTime(ms: number) {
  const d = new Date(ms + 3 * 3600 * 1000) // UTC+3 -- proje konvansiyonu
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// Henuz dolmamis (status='open') FVG'ler -- backtest penceresinin sonunda
// hala "acik" kalan, hicbir trade'e donusmemis bosluklar. Trade tablosunda
// gorunmezler (orada sadece tradeSetup.valid olanlar var), bu yuzden ayri
// bir listede -- tikla, grafikte sec.
export default function FvgLabOpenList({ fvgs, candles, selectedIdx, onSelect }: Props) {
  const openRows: OpenFvgRow[] = fvgs
    .map((fvg, fvgIndex) => ({ fvgIndex, fvg }))
    .filter(r => r.fvg.status === 'open')

  if (openRows.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Açık FVG yok -- bu aralıktaki tüm boşluklar ya doldu ya da süresi doldu.</div>
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Tip', 'Oluşma', 'Top', 'Bottom', 'Likidite', 'BOS', 'Displ.'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-3)', fontWeight: 400, fontSize: 10, letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {openRows.slice().reverse().map(({ fvgIndex, fvg }) => {
            const isSelected = selectedIdx === fvgIndex
            const s = fvg.ifvgScore
            return (
              <tr key={fvgIndex} onClick={() => onSelect(fvgIndex)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--bg-3)',
                  background: isSelected ? 'rgba(251,191,36,0.08)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid transparent',
                }}>
                <td style={{ padding: '7px 10px', color: fvg.type === 'bullish' ? 'var(--green)' : 'var(--red)' }}>
                  {fvg.type === 'bullish' ? 'Bullish' : 'Bearish'}
                </td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{fmtTime(candles[fvg.formedIdx].time)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{fvg.top.toFixed(1)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{fvg.bottom.toFixed(1)}</td>
                <td style={{ padding: '7px 10px' }}>{s?.sweep ? '●' : '○'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>N/A</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>N/A</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
