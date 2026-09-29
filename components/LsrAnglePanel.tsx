'use client'
import { useEffect, useRef, useState } from 'react'

type Period = '5m' | '1h'
type Metric = 'global' | 'top_position'

interface LsrCandle {
  time: number
  longAccount: number
  shortAccount: number
  ratio: number
}
interface LsrCurrent {
  angle: number
  r2: number
  ref: number
  nRef: number
}
interface LsrResponse {
  candles: LsrCandle[]
  current: LsrCurrent | null
  reason: string
}

const METRIC_LABEL: Record<Metric, string> = {
  global: 'Global L/S Ratio',
  top_position: 'Top Traders L/S Position',
}

function angleColor(angle: number | undefined): string {
  if (angle == null) return 'var(--text-3)'
  if (angle > 5) return '#4ade80'
  if (angle < -5) return '#f87171'
  return 'var(--text-2)'
}

function MiniLineChart({ candles }: { candles: LsrCandle[] }) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current || !candles?.length) return
    let chart: any
    let cleanup = false

    import('lightweight-charts').then(({ createChart, LineStyle }) => {
      if (cleanup || !chartRef.current) return
      chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 160,
        layout: { background: { color: '#111111' }, textColor: '#555555' },
        grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
        rightPriceScale: { borderColor: '#242424', textColor: '#555555' },
        timeScale: {
          borderColor: '#242424',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: false,
        handleScale: false,
        localization: {
          timeFormatter: (timestamp: number) => {
            const d = new Date((timestamp + 3 * 3600) * 1000)
            const pad = (n: number) => String(n).padStart(2, '0')
            return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
          },
        },
      })

      const mean = candles.reduce((s, c) => s + c.ratio, 0) / candles.length
      const series = chart.addLineSeries({
        color: '#6366f1',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      })
      series.setData(candles.map((c) => ({ time: Math.floor(c.time / 1000) as any, value: c.ratio })))
      series.createPriceLine({ price: mean, color: '#3a3a3a', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })

      chart.timeScale().fitContent()

      const ro = new ResizeObserver(() => {
        if (chartRef.current) chart.resize(chartRef.current.clientWidth, 160)
      })
      ro.observe(chartRef.current)
      return () => ro.disconnect()
    })

    return () => {
      cleanup = true
      if (chart) chart.remove()
    }
  }, [candles])

  return <div ref={chartRef} style={{ width: '100%', borderRadius: '6px', overflow: 'hidden', border: '1px solid #242424' }} />
}

function MetricPanel({ metric, period }: { metric: Metric; period: Period }) {
  const [data, setData] = useState<LsrResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`/api/lsr-series?metric=${metric}&period=${period}`, { cache: 'no-store' })
        if (res.ok && active) setData(await res.json())
      } catch {
        // sessizce gec -- panel bos/eski veriyle kalir, sayfanin geri kalanini etkilemez
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { active = false; clearInterval(interval) }
  }, [metric, period])

  const current = data?.current

  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="col-label">{METRIC_LABEL[metric]} — {period}</div>
        {current ? (
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: angleColor(current.angle) }}>
            {current.angle > 0 ? '+' : ''}{current.angle.toFixed(1)}°
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
              R²={current.r2.toFixed(2)}
            </span>
          </span>
        ) : (
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {loading ? '...' : 'açı hesaplanamadı'}
          </span>
        )}
      </div>
      {data?.candles?.length ? (
        <MiniLineChart candles={data.candles} />
      ) : (
        <div style={{ height: 160, border: '1px solid #242424', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{loading ? 'yükleniyor...' : 'veri yok'}</span>
        </div>
      )}
    </div>
  )
}

// Live sayfada fiyat grafiğinin altına konur: Global L/S ve Top Traders L/S Position,
// son 30 mum, ortak 5m/1h switch. Kendi verisini kendi çeker (30sn'de bir) -- sayfanın
// ana state'ine bağımlı değil.
export default function LsrAnglePanel() {
  const [period, setPeriod] = useState<Period>('5m')

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="col-label">LSR AÇI (son 30 mum)</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['5m', '1h'] as const).map((p) => (
            <button
              key={p}
              className={`filter-btn${period === p ? ' active' : ''}`}
              style={{ fontSize: 9, padding: '2px 8px' }}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <MetricPanel metric="global" period={period} />
        <MetricPanel metric="top_position" period={period} />
      </div>
    </div>
  )
}
