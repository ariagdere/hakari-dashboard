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
  entryTriggeredAt?: number | null
  resultAt?: number | null
  simResult?: string | null
}

export default function CandleChart({ candles, entry, tp, sl, direction, entryTriggeredAt, resultAt, simResult }: Props) {
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
          textColor: '#666666',
        },
        grid: {
          vertLines: { color: '#1a1a1a' },
          horzLines: { color: '#1a1a1a' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: '#222222',
          textColor: '#666666',
        },
        timeScale: {
          borderColor: '#222222',
          timeVisible: true,
          secondsVisible: false,
        },
      })

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#16a34a',
        wickDownColor: '#dc2626',
      })

      const formatted = candles.map(c => ({
        time: Math.floor(c.time / 1000) as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      candleSeries.setData(formatted)

      // Entry line
      const entryLine = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        title: `Entry ${entry.toLocaleString()}`,
      })
      entryLine.setData(formatted.map(d => ({ time: d.time, value: entry })))

      // TP line
      const tpLine = chart.addLineSeries({
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        title: `TP ${tp.toLocaleString()}`,
      })
      tpLine.setData(formatted.map(d => ({ time: d.time, value: tp })))

      // SL line
      const slLine = chart.addLineSeries({
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        title: `SL ${sl.toLocaleString()}`,
      })
      slLine.setData(formatted.map(d => ({ time: d.time, value: sl })))

      // Entry triggered marker
      if (entryTriggeredAt) {
        const entryTs = Math.floor(entryTriggeredAt / 1000)
        candleSeries.setMarkers([
          {
            time: entryTs as any,
            position: direction === 'SHORT' ? 'aboveBar' : 'belowBar',
            color: '#f59e0b',
            shape: direction === 'SHORT' ? 'arrowDown' : 'arrowUp',
            text: 'Entry',
          },
          ...(resultAt ? [{
            time: Math.floor(resultAt / 1000) as any,
            position: simResult === 'TP_HIT'
              ? (direction === 'SHORT' ? 'belowBar' : 'aboveBar')
              : 'aboveBar',
            color: simResult === 'TP_HIT' ? '#22c55e' : '#ef4444',
            shape: 'circle' as any,
            text: simResult === 'TP_HIT' ? 'TP' : 'SL',
          }] : []),
        ])
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
  }, [candles, entry, tp, sl, direction, entryTriggeredAt, resultAt, simResult])

  return <div ref={chartRef} style={{ width: '100%', borderRadius: '6px', overflow: 'hidden', border: '1px solid #222' }} />
}
