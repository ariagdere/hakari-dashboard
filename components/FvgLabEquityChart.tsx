'use client'
import { useState } from 'react'
import { Chart as ChartJS, Tooltip, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Filler } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { EquityCurve, EquityPoint } from '@/lib/fvgBacktest'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Filler)

// /list ve /analysis sayfalarindaki "Cumulative R" grafigiyle BIREBIR AYNI
// format (axisStyle, tooltip, iki eksenli line+bar) -- dashboard genelinde
// tutarlilik icin, kendi ozel stilim DEGIL.
const axisStyle = { grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } }, border: { color: '#242424' } }

interface Props { equityCurve: EquityCurve }
type Granularity = 'daily' | 'weekly' | 'monthly'
const periodLabel: Record<Granularity, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

export default function FvgLabEquityChart({ equityCurve }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const series: EquityPoint[] = equityCurve[granularity]

  if (series.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Equity curve için yeterli veri yok.</div>
  }

  const finalR = series[series.length - 1].cumR
  const maxDD = (() => {
    let peak = -Infinity, dd = 0
    for (const p of series) { if (p.cumR > peak) peak = p.cumR; dd = Math.max(dd, peak - p.cumR) }
    return dd
  })()
  const lineColor = finalR >= 0 ? '#4ade80' : '#f87171'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="col-label">Cumulative R</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['daily', 'weekly', 'monthly'] as Granularity[]).map(g => (
              <button key={g} className={`filter-btn${granularity === g ? ' active' : ''}`} style={{ fontSize: 9, padding: '2px 8px' }} onClick={() => setGranularity(g)}>
                {periodLabel[g]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--red)' }}>Max DD: {maxDD.toFixed(2)}R</span>
          <span className="mono" style={{ fontSize: 11, color: lineColor, fontWeight: 600 }}>{finalR >= 0 ? '+' : ''}{finalR.toFixed(2)}R</span>
        </div>
      </div>
      <div style={{ height: 160 }}>
        <Chart type="line" data={{
          labels: series.map(p => {
            const d = new Date(p.t)
            if (granularity === 'monthly') return d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
            return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
          }),
          datasets: [
            { type: 'line' as const, data: series.map(p => p.cumR), borderColor: lineColor, borderWidth: 1.5, pointRadius: 0, pointHitRadius: 20, fill: true, backgroundColor: finalR >= 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', tension: 0.3, yAxisID: 'yR' },
            { type: 'bar' as const, data: series.map(p => p.tradeCount), backgroundColor: 'rgba(96,165,250,0.25)', borderColor: 'rgba(96,165,250,0.5)', borderWidth: 1, yAxisID: 'yCount' },
          ],
        }} options={{
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              displayColors: false, callbacks: {
                label: (ctx: any) => {
                  const p = series[ctx.dataIndex]
                  if (ctx.datasetIndex === 0) return [
                    `Cum: ${p.cumR >= 0 ? '+' : ''}${p.cumR.toFixed(2)}R`,
                    `Period R: ${p.periodR >= 0 ? '+' : ''}${p.periodR.toFixed(2)}R`,
                  ]
                  return `Trades: ${p.tradeCount}`
                },
              },
            },
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
}
