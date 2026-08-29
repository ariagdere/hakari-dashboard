'use client'
import { useState } from 'react'
import { Chart as ChartJS, Tooltip, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend } from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { EquityCurve, EquityPoint } from '@/lib/fvgBacktest'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend)

interface Props { equityCurve: EquityCurve }
type Granularity = 'daily' | 'weekly' | 'monthly'

function fmtLabel(ms: number, g: Granularity) {
  const d = new Date(ms)
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  if (g === 'monthly') return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

export default function FvgLabEquityChart({ equityCurve }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const points: EquityPoint[] = equityCurve[granularity]

  if (points.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Equity curve için yeterli veri yok.</div>
  }

  const data = {
    labels: points.map(p => fmtLabel(p.t, granularity)),
    datasets: [{
      label: 'Kümülatif R',
      data: points.map(p => p.cumR),
      borderColor: '#4ade80',
      backgroundColor: 'rgba(74,222,128,0.08)',
      fill: true,
      tension: 0.15,
      pointRadius: 2,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#a0a0a0', font: { size: 10 } }, grid: { color: '#242424' } },
      y: { ticks: { color: '#a0a0a0', font: { size: 10 } }, grid: { color: '#242424' } },
    },
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['daily', 'weekly', 'monthly'] as Granularity[]).map(g => (
          <button key={g} onClick={() => setGranularity(g)}
            className={`filter-btn${granularity === g ? ' active' : ''}`}
            style={{ fontSize: 10, padding: '4px 10px' }}>
            {g === 'daily' ? 'Günlük' : g === 'weekly' ? 'Haftalık' : 'Aylık'}
          </button>
        ))}
      </div>
      <div style={{ height: 240 }}>
        <Line data={data} options={options as any} />
      </div>
    </div>
  )
}
