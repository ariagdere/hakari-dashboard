'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Candle, Fvg } from '@/lib/fvgEngine'

interface Props {
  candles: Candle[]
  fvgs: Fvg[]
  selectedIdx: number | null
  onSelectFvg: (idx: number | null) => void
}

// FVG'nin gorsel bant araligi -- olustugu andan, dolmus/gecersiz/acik
// durumuna gore bitis noktasina kadar.
function fvgBandRange(fvg: Fvg, lastIdx: number): { startIdx: number; endIdx: number } {
  const startIdx = Math.max(0, fvg.formedIdx - 1)
  let endIdx: number
  if (fvg.status === 'filled' && fvg.filledIdx != null) endIdx = fvg.filledIdx
  else if (fvg.status === 'expired' && fvg.expiredAtIdx != null) endIdx = fvg.expiredAtIdx
  else endIdx = lastIdx
  return { startIdx, endIdx }
}

export default function FvgLabChart({ candles, fvgs, selectedIdx, onSelectFvg }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const priceLinesRef = useRef<any[]>([])
  const lwChartsModRef = useRef<any>(null)
  const [, forceRedraw] = useState(0)

  const candlesRef = useRef(candles)
  const fvgsRef = useRef(fvgs)
  const selectedIdxRef = useRef(selectedIdx)
  candlesRef.current = candles
  fvgsRef.current = fvgs
  selectedIdxRef.current = selectedIdx

  const redrawOverlay = useCallback(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    const overlay = overlayRef.current
    if (!chart || !series || !overlay) return

    const ts = chart.timeScale()
    const displayFvgs = selectedIdxRef.current == null ? fvgsRef.current : [fvgsRef.current[selectedIdxRef.current]]
    const lastIdx = candlesRef.current.length - 1

    let svg = ''
    for (const fvg of displayFvgs) {
      if (!fvg) continue
      const { startIdx, endIdx } = fvgBandRange(fvg, lastIdx)
      const startTime = Math.floor(candlesRef.current[startIdx].time / 1000)
      const endTime = Math.floor(candlesRef.current[endIdx].time / 1000)
      const x1 = ts.timeToCoordinate(startTime as any)
      const x2 = ts.timeToCoordinate(endTime as any)
      const yTop = series.priceToCoordinate(fvg.top)
      const yBot = series.priceToCoordinate(fvg.bottom)
      if (x1 == null || x2 == null || yTop == null || yBot == null) continue

      const isBull = fvg.type === 'bullish'
      const fill = isBull ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)'
      const stroke = isBull ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)'
      const dash = fvg.status === 'filled' ? '4,3' : fvg.status === 'expired' ? '1,4' : 'none'
      const w = Math.max(1, x2 - x1)
      const h = Math.max(1, Math.abs(yBot - yTop))
      const yr = Math.min(yTop, yBot)
      svg += `<rect x="${x1}" y="${yr}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-dasharray="${dash}"/>`

      // Dolmus FVG icin ters-rol (IFVG) bandi -- fill noktasindan grafigin sag ucuna
      if (fvg.status === 'filled' && fvg.tradeSetup?.valid) {
        const chartW = containerRef.current?.clientWidth ?? 0
        const flipFill = isBull ? 'rgba(248,113,113,0.10)' : 'rgba(74,222,128,0.10)'
        const flipStroke = isBull ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.4)'
        svg += `<rect x="${x2}" y="${yr}" width="${Math.max(0, chartW - x2)}" height="${h}" fill="${flipFill}" stroke="${flipStroke}" stroke-width="1"/>`
      }
    }
    overlay.innerHTML = `<svg width="100%" height="100%" style="position:absolute;top:0;left:0;pointer-events:none">${svg}</svg>`
  }, [])

  const updatePriceLines = useCallback(() => {
    const series = seriesRef.current
    const mod = lwChartsModRef.current
    if (!series || !mod) return

    priceLinesRef.current.forEach((l: any) => series.removePriceLine(l))
    priceLinesRef.current = []

    const idx = selectedIdxRef.current
    const fvg = idx != null ? fvgsRef.current[idx] : null
    if (fvg?.tradeSetup?.valid) {
      const t = fvg.tradeSetup
      const entryLine = series.createPriceLine({ price: t.entry, color: '#e8e8ea', lineWidth: 1, lineStyle: mod.LineStyle.Dashed, axisLabelVisible: true, title: `Entry ${t.entry!.toFixed(0)}` })
      const slLine = series.createPriceLine({ price: t.sl, color: '#f87171', lineWidth: 1, lineStyle: mod.LineStyle.Dashed, axisLabelVisible: true, title: `SL ${t.sl!.toFixed(0)}` })
      const tpLine = series.createPriceLine({ price: t.tp, color: '#4ade80', lineWidth: 1, lineStyle: mod.LineStyle.Dashed, axisLabelVisible: true, title: `TP ${t.tp!.toFixed(0)}` })
      priceLinesRef.current = [entryLine, slLine, tpLine]
    }
  }, [])

  // FVG hedef bul: verilen (zaman-saniye, fiyat) noktasini iceren bir FVG bandi var mi
  const findFvgAtPoint = useCallback((timeSec: number, price: number): number | null => {
    const lastIdx = candlesRef.current.length - 1
    for (let i = fvgsRef.current.length - 1; i >= 0; i--) {
      const fvg = fvgsRef.current[i]
      const { startIdx, endIdx } = fvgBandRange(fvg, lastIdx)
      const startTime = Math.floor(candlesRef.current[startIdx].time / 1000)
      const endTime = Math.floor(candlesRef.current[endIdx].time / 1000)
      if (timeSec < startTime || timeSec > endTime) continue
      const top = Math.max(fvg.top, fvg.bottom)
      const bot = Math.min(fvg.top, fvg.bottom)
      if (price <= top && price >= bot) return i
    }
    return null
  }, [])

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return
    let chart: any
    let disposed = false

    import('lightweight-charts').then(({ createChart, LineStyle, CrosshairMode }) => {
      if (disposed || !containerRef.current) return
      lwChartsModRef.current = { createChart, LineStyle, CrosshairMode }

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 460,
        layout: { background: { color: '#0f0f0f' }, textColor: '#a0a0a0' },
        grid: { vertLines: { color: '#242424' }, horzLines: { color: '#242424' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#242424' },
        timeScale: { borderColor: '#242424', timeVisible: true, secondsVisible: false },
      })
      chartRef.current = chart

      const series = chart.addCandlestickSeries({
        upColor: '#4ade80', downColor: '#f87171',
        borderUpColor: '#4ade80', borderDownColor: '#f87171',
        wickUpColor: '#4ade80', wickDownColor: '#f87171',
        priceLineVisible: false, lastValueVisible: false,
      })
      seriesRef.current = series

      series.setData(candles.map(c => ({
        time: Math.floor(c.time / 1000) as any,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })))

      chart.timeScale().fitContent()
      redrawOverlay()
      updatePriceLines()

      chart.timeScale().subscribeVisibleTimeRangeChange(() => redrawOverlay())
      chart.subscribeClick((param: any) => {
        if (!param.point || !param.time) { onSelectFvg(null); return }
        const price = series.coordinateToPrice(param.point.y)
        if (price == null) return
        const hit = findFvgAtPoint(param.time as number, price)
        onSelectFvg(hit)
      })

      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.resize(containerRef.current.clientWidth, 460)
          redrawOverlay()
        }
      })
      ro.observe(containerRef.current)
      return () => ro.disconnect()
    })

    return () => {
      disposed = true
      if (chart) chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles])

  // FVG listesi veya secim degistiginde overlay'i (chart'i yeniden kurmadan) guncelle
  useEffect(() => {
    redrawOverlay()
  }, [fvgs, selectedIdx, redrawOverlay])

  // Secili FVG veya fvg listesi degistiginde SL/TP/Entry cizgilerini guncelle
  useEffect(() => {
    updatePriceLines()
  }, [selectedIdx, fvgs, updatePriceLines])

  return (
    <div style={{ position: 'relative', border: '1px solid #242424', borderRadius: 8, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%' }} />
      <div ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  )
}
