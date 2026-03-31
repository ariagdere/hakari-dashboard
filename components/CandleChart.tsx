'use client'
import { useEffect, useRef } from 'react'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Props {
  candles: Candle[]
  entry: number
  tp: number
  sl: number
  direction: string
  analyzedAt?: number | null
  entryTriggeredAt?: number | null
  resultAt?: number | null
  simResult?: string | null
}

export default function CandleChart({ candles, entry, tp, sl, direction, analyzedAt, entryTriggeredAt, resultAt, simResult }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current || !candles?.length) return

    let chart: any
    let cleanup = false

    import('lightweight-charts').then(({ createChart, LineStyle, CrosshairMode }) => {
      if (cleanup || !chartRef.current) return

      chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 380,
        layout: {
          background: { color: '#111111' },
          textColor: '#555555',
        },
        grid: {
          vertLines: { color: '#1a1a1a' },
          horzLines: { color: '#1a1a1a' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: '#242424',
          textColor: '#555555',
        },
        timeScale: {
          borderColor: '#242424',
          timeVisible: true,
          secondsVisible: false,
        },
      })

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#4ade80',
        downColor: '#f87171',
        borderUpColor: '#4ade80',
        borderDownColor: '#f87171',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })

      const formatted = candles.map(c => ({
        time: Math.floor(c.time / 1000) as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      candleSeries.setData(formatted)

      const entryLine = chart.addLineSeries({
        color: '#fbbf24',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        title: `Entry ${entry.toLocaleString()}`,
      })
      entryLine.setData(formatted.map((d: any) => ({ time: d.time, value: entry })))

      const tpLine = chart.addLineSeries({
        color: '#4ade80',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        title: `TP ${tp.toLocaleString()}`,
      })
      tpLine.setData(formatted.map((d: any) => ({ time: d.time, value: tp })))

      const slLine = chart.addLineSeries({
        color: '#f87171',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        title: `SL ${sl.toLocaleString()}`,
      })
      slLine.setData(formatted.map((d: any) => ({ time: d.time, value: sl })))

      const markers: any[] = []

      if (analyzedAt) {
        markers.push({
          time: Math.floor(analyzedAt / 1000) as any,
          position: 'aboveBar',
          color: '#6366f1',
          shape: 'arrowDown',
          text: 'Analiz',
        })
      }

      if (entryTriggeredAt) {
        markers.push({
          time: Math.floor(entryTriggeredAt / 1000) as any,
          position: direction === 'SHORT' ? 'aboveBar' : 'belowBar',
          color: '#fbbf24',
          shape: direction === 'SHORT' ? 'arrowDown' : 'arrowUp',
          text: 'Entry',
        })
      }

      if (resultAt) {
        markers.push({
          time: Math.floor(resultAt / 1000) as any,
          position: simResult === 'TP_HIT' ? (direction === 'SHORT' ? 'belowBar' : 'aboveBar') : 'aboveBar',
          color: simResult === 'TP_HIT' ? '#4ade80' : '#f87171',
          shape: 'circle' as any,
          text: simResult === 'TP_HIT' ? 'TP' : 'SL',
        })
      }

      if (markers.length > 0) {
        candleSeries.setMarkers(markers)
      }

      chart.timeScale().fitContent()

      const ro = new ResizeObserver(() => {
        if (chartRef.current) chart.resize(chartRef.current.clientWidth, 380)
      })
      ro.observe(chartRef.current)

      return () => ro.disconnect()
    })

    return () => {
      cleanup = true
      if (chart) chart.remove()
    }
  }, [candles, entry, tp, sl, direction, analyzedAt, entryTriggeredAt, resultAt, simResult])

  return (
    <div
      ref={chartRef}
      style={{ width: '100%', borderRadius: '6px', overflow: 'hidden', border: '1px solid #242424' }}
    />
  )
}
