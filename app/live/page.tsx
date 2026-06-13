'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle } from 'lightweight-charts'

interface Order {
  id: number
  analysis_id: number | null
  mt5_order_id: string
  mt5_position_id: string | null
  magic: number
  strategy_label: string
  symbol: string
  direction: string
  volume: number
  entry_price: number
  fill_price: number | null
  sl: number
  tp: number
  rr: number | null
  status: 'PENDING' | 'OPEN' | 'CLOSED' | 'CANCELED'
  created_at: string
  opened_at: string | null
  closed_at?: string | null
  close_price?: number | null
  realized_pnl?: number | null
  exit_reason?: string | null
  is_manual?: boolean
  normalized_pnl?: number | null
  display_volume?: number | null
  position_size_btc: number | null
  win_probability_v6: number | null
  analyzed_at: string | null
  analysis_rr: string | null
}

interface Price { bid: number; ask: number; time: string }
interface Stats {
  total_orders: number; pending: number; open: number; expired: number
  win_rate: number; tp_count: number; sl_count: number
  avg_win_r: number | null; total_r: number; total_pnl: number
}
interface Candle { time: number; open: number; high: number; low: number; close: number }

const POLL_INTERVAL_MS = 5000
const SIZE_MULTIPLIER = 2.5

function getDisplayVolume(order: Order): number {
  if (order.position_size_btc == null) return order.volume
  return Math.round(order.position_size_btc * SIZE_MULTIPLIER * 100) / 100
}
function isLong(direction: string): boolean {
  return direction === 'BUY' || direction === 'LONG'
}

function calcPnL(order: Order, bid: number, ask: number, volume: number): number {
  const entry = order.fill_price ?? order.entry_price
  // LONG/BUY: bid'den kapanir; SHORT/SELL: ask'tan kapanir
  if (isLong(order.direction)) {
    return (bid - entry) * volume
  }
  return (entry - ask) * volume
}
const pnlClass = (v: number) => (v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero')
const dirBadge = (d: string) => {
  if (d === 'SELL' || d === 'SHORT') return <span className="badge badge-short">{d}</span>
  if (d === 'BUY' || d === 'LONG') return <span className="badge badge-long">{d}</span>
  return <span className="badge badge-wait">{d}</span>
}
const statusBadge = (s: string) => {
  if (s === 'OPEN') return <span className="badge badge-tp">OPEN</span>
  return <span className="badge badge-pend">PENDING</span>
}
const exitBadge = (o: Order) => {
  if (o.status === 'CANCELED') {
    if (o.exit_reason === 'EXPIRED') return <span className="badge badge-exp">EXPIRED</span>
    return <span className="badge badge-pend">CANCELED</span>
  }
  const manual = o.is_manual ? ' ✋' : ''
  if (o.exit_reason === 'TP') return <span className="badge badge-tp">TP{manual}</span>
  if (o.exit_reason === 'SL') return <span className="badge badge-sl">SL{manual}</span>
  return <span className="badge badge-ne">CLOSED</span>
}
const wpColor = (v: number | null) => {
  if (v == null) return 'var(--text-3)'
  const n = Number(v)
  if (n >= 60) return 'var(--green)'
  if (n >= 50) return 'var(--amber)'
  return 'var(--red)'
}
const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—'
  return new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
// Fiyat: tam sayiya yuvarla, decimal gosterme
const fmtPrice = (v: number | null | undefined) => {
  if (v == null) return '—'
  return Math.round(Number(v)).toString()
}

function ScoreCard({ label, value, color, sub, subColor }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode; subColor?: string }) {
  return (
    <div className="stat-card">
      <div className="col-label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
      {sub != null && <div className="mono" style={{ fontSize: 10, marginTop: 4, color: subColor ?? 'var(--text-3)' }}>{sub}</div>}
    </div>
  )
}

function LiveChart({ candles, selectedOrders }: { candles: Candle[]; selectedOrders: Order[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<any[]>([])
  const didInitialZoom = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#a0a0a0', fontFamily: 'DM Mono, monospace', fontSize: 10 },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
      timeScale: { borderColor: '#242424', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#242424' },
      crosshair: { mode: 0 },
      width: container.clientWidth || 600,
      height: isMobile ? 240 : 420,
    })
    const series = chart.addCandlestickSeries({
      upColor: '#4ade80', downColor: '#f87171',
      borderUpColor: '#4ade80', borderDownColor: '#f87171',
      wickUpColor: '#4ade80', wickDownColor: '#f87171',
      priceFormat: { type: 'custom', minMove: 1, formatter: (p: number) => Math.round(p).toString() },
    })
    chartRef.current = chart
    seriesRef.current = series

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)
    requestAnimationFrame(handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (seriesRef.current && candles.length > 0) {
      seriesRef.current.setData(candles as any)
      if (!didInitialZoom.current) {
        const visibleCount = typeof window !== 'undefined' && window.innerWidth <= 768 ? 80 : 150
        const total = candles.length
        chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - visibleCount), to: total })
        didInitialZoom.current = true
      }
    }
  }, [candles])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    priceLinesRef.current.forEach((pl) => series.removePriceLine(pl))
    priceLinesRef.current = []

    selectedOrders.forEach((o) => {
      const tag = isLong(o.direction) ? 'B' : 'S'
      const lines = [
        { price: o.entry_price, color: '#60a5fa', title: `Entry ${tag} #${o.id}`, style: o.status === 'PENDING' ? LineStyle.Dashed : LineStyle.Solid },
        { price: o.tp, color: '#4ade80', title: `TP ${tag} #${o.id}`, style: LineStyle.Dotted },
        { price: o.sl, color: '#f87171', title: `SL ${tag} #${o.id}`, style: LineStyle.Dotted },
      ]
      lines.forEach((l) => {
        const pl = series.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style, axisLabelVisible: true, title: l.title })
        priceLinesRef.current.push(pl)
      })
    })

    const CANDLE_SEC = 15 * 60
    const roundToCandle = (iso: string) => {
      const ts = Math.floor(new Date(iso).getTime() / 1000)
      return Math.floor(ts / CANDLE_SEC) * CANDLE_SEC
    }
    const markers: any[] = []
    selectedOrders.forEach((o) => {
      const isBuy = isLong(o.direction)
      if (o.opened_at) {
        markers.push({ time: roundToCandle(o.opened_at), position: isBuy ? 'belowBar' : 'aboveBar', color: '#60a5fa', shape: isBuy ? 'arrowUp' : 'arrowDown', text: `In #${o.id}` })
      }
      if (o.status === 'CLOSED' && o.closed_at) {
        const exitColor = o.exit_reason === 'TP' ? '#4ade80' : o.exit_reason === 'SL' ? '#f87171' : '#a0a0a0'
        markers.push({ time: roundToCandle(o.closed_at), position: isBuy ? 'aboveBar' : 'belowBar', color: exitColor, shape: 'circle', text: `Out #${o.id} ${o.exit_reason ?? ''}` })
      }
    })
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    series.setMarkers(markers)
  }, [selectedOrders, candles])

  return <div ref={containerRef} style={{ width: '100%' }} />
}

function SelectDot({ selected }: { selected: boolean }) {
  return (
    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '1px solid var(--border-3)', background: selected ? 'var(--blue)' : 'transparent' }} />
  )
}

export default function LivePositionsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [history, setHistory] = useState<Order[]>([])
  const [price, setPrice] = useState<Price | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'OPEN' | 'CLOSED' | 'CANCELED'>('ALL')

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    let active = true
    async function fetchData() {
      try {
        const [ordersRes, priceRes, statsRes, historyRes] = await Promise.all([
          fetch('/api/orders-live', { cache: 'no-store' }),
          fetch('/api/live-price', { cache: 'no-store' }),
          fetch('/api/orders-stats', { cache: 'no-store' }),
          fetch('/api/orders-history', { cache: 'no-store' }),
        ])
        if (!ordersRes.ok || !priceRes.ok) throw new Error('fetch failed')
        const ordersData: Order[] = await ordersRes.json()
        const priceData: Price = await priceRes.json()
        const statsData: Stats = statsRes.ok ? await statsRes.json() : null
        const historyData: Order[] = historyRes.ok ? await historyRes.json() : []
        if (active) {
          setOrders(ordersData); setPrice(priceData); setStats(statsData); setHistory(historyData)
          setSelectedIds((prev) => {
            const validIds = new Set([...ordersData, ...historyData].map((o) => o.id))
            const next = new Set<number>()
            prev.forEach((id) => { if (validIds.has(id)) next.add(id) })
            return next
          })
          setError(null); setLoading(false)
        }
      } catch {
        if (active) { setError('Failed to load live data'); setLoading(false) }
      }
    }
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => { active = false; clearInterval(interval) }
  }, [])

  useEffect(() => {
    let active = true
    async function fetchCandles() {
      try {
        const res = await fetch('/api/candles', { cache: 'no-store' })
        if (res.ok && active) setCandles(await res.json())
      } catch {}
    }
    fetchCandles()
    const interval = setInterval(fetchCandles, 30000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  const midPrice = price ? (price.bid + price.ask) / 2 : null
  const fmtMoney = (v: number) => `${v > 0 ? '+' : ''}$${Math.abs(v).toFixed(0)}`
  const moneyColor = (v: number) => (v >= 0 ? 'var(--green)' : 'var(--red)')

  // Acik pozisyonlarin toplam unrealized PnL'i (normalize 50$ volume ile)
  const totalUnrealized =
    price !== null
      ? orders
          .filter((o) => o.status === 'OPEN')
          .reduce((sum, o) => sum + calcPnL(o, price.bid, price.ask, getDisplayVolume(o)), 0)
      : null

  // Tek liste: open/pending + closed/canceled birlestir
  const allRows = [...orders, ...history]
  const selectedOrders = allRows.filter((o) => selectedIds.has(o.id))

  // Durum filtresi
  const filtered = allRows.filter((o) => {
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'CANCELED') return o.status === 'CANCELED'
    return o.status === statusFilter
  })

  // Siralama: aktif olanlar (PENDING/OPEN) once, sonra kapanma tarihine gore
  const sorted = [...filtered].sort((a, b) => {
    const aActive = a.status === 'OPEN' || a.status === 'PENDING'
    const bActive = b.status === 'OPEN' || b.status === 'PENDING'
    if (aActive !== bActive) return aActive ? -1 : 1
    const aT = a.closed_at ? new Date(a.closed_at).getTime() : new Date(a.created_at).getTime()
    const bT = b.closed_at ? new Date(b.closed_at).getTime() : new Date(b.created_at).getTime()
    return bT - aT
  })

  const FILTERS: Array<{ key: typeof statusFilter; label: string }> = [
    { key: 'ALL', label: 'ALL' },
    { key: 'PENDING', label: 'PENDING' },
    { key: 'OPEN', label: 'OPEN' },
    { key: 'CLOSED', label: 'CLOSED' },
    { key: 'CANCELED', label: 'CANCELED' },
  ]

  // Satirin durum/sonuc rozeti
  const rowBadge = (o: Order) => {
    if (o.status === 'OPEN') return <span className="badge badge-tp">OPEN</span>
    if (o.status === 'PENDING') return <span className="badge badge-pend">PENDING</span>
    return exitBadge(o)
  }

  // Satirin PnL gosterimi (acik -> anlik, kapali -> gerceklesmis normalize, pending/canceled -> —)
  const rowPnl = (o: Order): { text: string; cls: string } => {
    if (o.status === 'OPEN' && price !== null) {
      const v = calcPnL(o, price.bid, price.ask, getDisplayVolume(o))
      return { text: `${v > 0 ? '+' : ''}${v.toFixed(2)}`, cls: pnlClass(v) }
    }
    if (o.status === 'CLOSED' && o.normalized_pnl != null) {
      const v = o.normalized_pnl
      return { text: `${v > 0 ? '+' : ''}${v.toFixed(2)}`, cls: pnlClass(v) }
    }
    return { text: '—', cls: 'pnl-zero' }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64 }}>
      <style>{`
        .live-scorecards { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
        .live-section-title { font-size: 11px; color: var(--text-3); letter-spacing: 0.08em; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); font-family: 'DM Mono', monospace; }
        .live-table { width: 100%; border-collapse: collapse; font-size: 11px; font-family: 'DM Mono', monospace; }
        .live-table-wrap { overflow-x: auto; }
        .live-mobile-cards { display: none; }
        @media (max-width: 768px) {
          .live-scorecards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .live-table-wrap { display: none; }
          .live-mobile-cards { display: flex; flex-direction: column; gap: 6px; }
          .live-mcard { background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; cursor: pointer; }
          .live-mcard.selected { border-color: var(--blue); background: var(--bg-3); }
        }
      `}</style>

      <div className="container" style={{ paddingTop: 24 }}>
        <div className="live-section-title">LIVE POSITIONS</div>

        {/* Score cards */}
        {stats && (
          <div className="live-scorecards">
            <ScoreCard label="TOTAL" value={stats.total_orders} />
            <ScoreCard label="PENDING" value={stats.pending} color="var(--amber)" />
            <ScoreCard
              label="OPEN"
              value={stats.open}
              color="var(--green)"
              sub={totalUnrealized != null && stats.open > 0 ? `${totalUnrealized >= 0 ? '+' : ''}$${totalUnrealized.toFixed(2)}` : undefined}
              subColor={totalUnrealized != null ? moneyColor(totalUnrealized) : undefined}
            />
            <ScoreCard label="EXPIRED" value={stats.expired} color="var(--text-2)" />
            <ScoreCard label="WIN RATE" value={`%${stats.win_rate.toFixed(1)}`} color={wpColor(stats.win_rate)} />
            <ScoreCard label="TP HIT" value={stats.tp_count} color="var(--green)" />
            <ScoreCard label="SL HIT" value={stats.sl_count} color="var(--red)" />
            <ScoreCard label="AVG WIN R" value={stats.avg_win_r != null ? `+${stats.avg_win_r.toFixed(2)}R` : '—'} color="var(--green)" />
            <ScoreCard label="TOTAL R" value={`${stats.total_r >= 0 ? '+' : ''}${stats.total_r.toFixed(2)}R`} color={moneyColor(stats.total_r)} />
            <ScoreCard
              label="TOTAL P&L"
              value={fmtMoney(stats.total_pnl)}
              color={moneyColor(stats.total_pnl)}
              sub={
                totalUnrealized != null
                  ? `${(stats.total_pnl + totalUnrealized) >= 0 ? '+' : ''}$${(stats.total_pnl + totalUnrealized).toFixed(2)}`
                  : undefined
              }
              subColor={totalUnrealized != null ? moneyColor(stats.total_pnl + totalUnrealized) : undefined}
            />
          </div>
        )}

        {error && <div className="mono" style={{ color: 'var(--red)', fontSize: 11, marginBottom: 12 }}>{error}</div>}

        {/* Chart */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="col-label">
              BTCUSDT — 15m
              {selectedOrders.length > 0 && <span style={{ color: 'var(--blue)', marginLeft: 8 }}>· {selectedOrders.length} selected</span>}
            </div>
            {price && <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{Math.round((price.bid + price.ask) / 2)}</span>}
          </div>
          <LiveChart candles={candles} selectedOrders={selectedOrders} />
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
            Select a position from the table below to view its zones and entry/exit markers
          </div>
        </div>

        {/* Status filter toggles */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-btn${statusFilter === f.key ? ' active' : ''}`}
              style={{ fontSize: 11 }}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Unified table */}
        <div className="card" style={{ padding: 16 }}>
          {loading && <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>loading...</div>}
          {!loading && sorted.length === 0 && <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>no positions</div>}

          {sorted.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="live-table-wrap">
                <table className="live-table" style={{ minWidth: 1080 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 28, paddingBottom: 8 }} />
                      {['Order Date', 'Entry Date', 'Close Date', 'Strategy', 'Status', 'Dir', 'Volume (Norm 50$)', 'Entry', 'Exit', 'SL', 'TP', 'RR', 'WP V6', 'PnL ($)'].map((h, i) => (
                        <th key={h} style={{ textAlign: i <= 3 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((order) => {
                      const selected = selectedIds.has(order.id)
                      const displayVolume = order.display_volume ?? getDisplayVolume(order)
                      const pnl = rowPnl(order)
                      return (
                        <tr key={order.id} onClick={() => toggleSelect(order.id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: selected ? 'var(--bg-3)' : 'transparent' }}>
                          <td style={{ padding: '6px 0', textAlign: 'center' }}><SelectDot selected={selected} /></td>
                          <td style={{ padding: '6px 0', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(order.created_at)}</td>
                          <td style={{ padding: '6px 0', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(order.opened_at)}</td>
                          <td style={{ padding: '6px 0', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(order.closed_at)}</td>
                          <td style={{ padding: '6px 0', color: 'var(--text-2)' }}>{order.strategy_label}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{rowBadge(order)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{dirBadge(order.direction)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{displayVolume}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{fmtPrice(order.entry_price)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{fmtPrice(order.close_price)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--red)' }}>{fmtPrice(order.sl)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--green)' }}>{fmtPrice(order.tp)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{order.analysis_rr ?? order.rr ?? '—'}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: wpColor(order.win_probability_v6) }}>{order.win_probability_v6 != null ? `%${Number(order.win_probability_v6).toFixed(0)}` : '—'}</td>
                          <td className={`mono ${pnl.cls}`} style={{ padding: '6px 0', textAlign: 'right' }}>{pnl.text}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="live-mobile-cards">
                {sorted.map((order) => {
                  const selected = selectedIds.has(order.id)
                  const displayVolume = order.display_volume ?? getDisplayVolume(order)
                  const pnl = rowPnl(order)
                  return (
                    <div key={order.id} className={`live-mcard${selected ? ' selected' : ''}`} onClick={() => toggleSelect(order.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <SelectDot selected={selected} />
                          {dirBadge(order.direction)}
                          {rowBadge(order)}
                        </div>
                        <span className={`mono ${pnl.cls}`} style={{ fontSize: 13, fontWeight: 600 }}>
                          {pnl.text === '—' ? '—' : `${pnl.text.startsWith('-') ? '-' : '+'}$${pnl.text.replace(/^[+-]/, '')}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>{order.strategy_label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                        <div><span className="col-label">Entry </span><span style={{ color: 'var(--text-2)' }}>{fmtPrice(order.entry_price)}</span></div>
                        <div><span className="col-label">Exit </span><span style={{ color: 'var(--text-2)' }}>{fmtPrice(order.close_price)}</span></div>
                        <div><span className="col-label">Vol </span><span style={{ color: 'var(--text-2)' }}>{displayVolume}</span></div>
                        <div><span className="col-label">SL </span><span style={{ color: 'var(--red)' }}>{fmtPrice(order.sl)}</span></div>
                        <div><span className="col-label">TP </span><span style={{ color: 'var(--green)' }}>{fmtPrice(order.tp)}</span></div>
                        <div><span className="col-label">RR </span><span style={{ color: 'var(--text-2)' }}>{order.analysis_rr ?? order.rr ?? '—'}</span></div>
                        <div><span className="col-label">WP6 </span><span style={{ color: wpColor(order.win_probability_v6) }}>{order.win_probability_v6 != null ? `%${Number(order.win_probability_v6).toFixed(0)}` : '—'}</span></div>
                        <div><span className="col-label">Order D </span><span style={{ color: 'var(--text-3)' }}>{fmtDate(order.created_at)}</span></div>
                        <div><span className="col-label">Entry D </span><span style={{ color: 'var(--text-3)' }}>{fmtDate(order.opened_at)}</span></div>
                        <div><span className="col-label">Close D </span><span style={{ color: 'var(--text-3)' }}>{fmtDate(order.closed_at)}</span></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, textAlign: 'right' }}>
          updates every {POLL_INTERVAL_MS / 1000}s
        </div>
      </div>
    </div>
  )
}
