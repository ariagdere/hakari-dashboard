'use client'
import type { BreakdownBucket } from '@/lib/fvgBacktest'

interface Props {
  title: string
  buckets: BreakdownBucket[]
}

// Gun-of-week / saat-of-day kirilim tablosu. Bos (count=0) satirlar
// gosterilir ama soluklastirilir -- "bu saatte hic islem olmadi" bilgisi
// de kalibrasyon acisindan anlamli.
export default function FvgLabBreakdownTable({ title, buckets }: Props) {
  const maxAbsR = Math.max(1, ...buckets.map(b => Math.abs(b.totalR)))

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>{title}</div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['', 'İşlem', 'Win Rate', 'Toplam R', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i === 0 ? 'left' : i === 4 ? 'left' : 'right', padding: '6px 10px', color: 'var(--text-3)', fontWeight: 400, fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => {
              const isEmpty = b.count === 0
              const barWidth = isEmpty ? 0 : Math.min(100, (Math.abs(b.totalR) / maxAbsR) * 100)
              return (
                <tr key={i} style={{ borderBottom: i < buckets.length - 1 ? '1px solid var(--bg-3)' : 'none', opacity: isEmpty ? 0.35 : 1 }}>
                  <td style={{ padding: '5px 10px', color: 'var(--text-2)' }} className="mono">{b.label}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-3)' }} className="mono">{b.count}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-2)' }} className="mono">{isEmpty ? '—' : `%${b.winRate}`}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: isEmpty ? 'var(--text-3)' : b.totalR >= 0 ? 'var(--green)' : 'var(--red)' }} className="mono">
                    {isEmpty ? '—' : `${b.totalR >= 0 ? '+' : ''}${b.totalR}`}
                  </td>
                  <td style={{ padding: '5px 10px 5px 0', width: 80 }}>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, background: b.totalR >= 0 ? 'var(--green)' : 'var(--red)', opacity: 0.6 }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
