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
  direction: string // 'BUY' | 'SELL'
  volume: number
  entry_price: number
  fill_price: number | null
  sl: number
  tp: number
  rr: number | null
  status: 'PENDING' | 'OPEN'
  created_at: string
  opened_at: string | null
  position_size_btc: number | null
  win_probability_v6: number | null
  analyzed_at: string | null
  analysis_rr: string | null
}

interface Price { bid: number; ask: number; time: string }

interface Stats {
  total_orders: number
  pending: number
  open: number
  expired: number
  win_rate: number
  tp_count: number
  sl_count: number
  avg_win_r: number | null
  total_r: number
  total_pnl: number
}

interface Candle { time: number; open: number; high: number; low: number; close: number }

const POLL_INTERVAL_MS = 5000
const SIZE_MULTIPLIER = 2.5

function getDisplayVolume(order: Order): number {
  if (order.position_size_btc == null) return order.volume
  return Math.round(order.position_size_btc * SIZE_MULTIPLIER * 100) / 100
}

function calcPnL(order: Order, midPrice: number, volume: number): number {
  const diff = order.direction === 'BUY' ? midPrice - order.entry_price : order.entry_price - midPrice
  return diff * volume
}

const pnlClass = (v: number) => (v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero')
const dirBadge = (d: string) => {
  if (d === 'SELL') return <span className="badge badge-short">SELL</span>
  if (d === 'BUY') return <span className="badge badge-long">BUY</span>
  return <span className="badge badge-wait">{d}</span>
}
const statusBadge = (s: string) => {
  if (s === 'OPEN') return <span className="badge badge-tp">OPEN</span>
  return <span className="badge badge-pend">PENDING</span>
}
const wpColor = (v: number | null) => {
  if (v == null) return 'var(--text-3)'
  const n = Number(v)
  if (n >= 60) return 'var(--green)'
  if (n >= 50) return 'var(--amber)'
  return 'var(--red)'
}
const fmtDate = (s: string | null) => {
  if (!s) return '—'
  return new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Score card ───────────────────────────────────────────────────────────
function ScoreCard({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode }) {
  return (
    <div className="stat-card">
      <div className="col-label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Chart ────────────────────────────────────────────────────────────────
// Sadece selectedOrders'in cizgileri gosterilir.
function LiveChart({ candles, selectedOrders }: { candles: Candle[]; selectedOrders: Order[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<any[]>([])

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#a0a0a0', fontFamily: 'DM Mono, monospace', fontSize: 10 },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
      timeScale: { borderColor: '#242424', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#242424' },
      crosshair: { mode: 0 },
      width: container.clientWidth || 600,
      height: 320,
    })
    const series = chart.addCandlestickSeries({
      upColor: '#4ade80', downColor: '#f87171',
      borderUpColor: '#4ade80', borderDownColor: '#f87171',
      wickUpColor: '#4ade80', wickDownColor: '#f87171',
    })
    chartRef.current = chart
    seriesRef.current = series

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)
    // İlk ölçümün doğru olması için bir sonraki frame'de tekrar boyutla
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
      // Tum mumlari sigdirmak yerine son ~150 mumu goster; kullanici geriye kaydirabilir
      const visibleCount = 150
      const total = candles.length
      chartRef.current?.timeScale().setVisibleLogicalRange({
        from: Math.max(0, total - visibleCount),
        to: total,
      })
    }
  }, [candles])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    priceLinesRef.current.forEach((pl) => series.removePriceLine(pl))
    priceLinesRef.current = []

    selectedOrders.forEach((o) => {
      const tag = o.direction === 'SELL' ? 'S' : 'B'
      const lines = [
        { price: o.entry_price, color: '#60a5fa', title: `Entry ${tag} #${o.id}`, style: o.status === 'PENDING' ? LineStyle.Dashed : LineStyle.Solid },
        { price: o.tp, color: '#4ade80', title: `TP ${tag} #${o.id}`, style: LineStyle.Dotted },
        { price: o.sl, color: '#f87171', title: `SL ${tag} #${o.id}`, style: LineStyle.Dotted },
      ]
      lines.forEach((l) => {
        const pl = series.createPriceLine({
          price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style,
          axisLabelVisible: true, title: l.title,
        })
        priceLinesRef.current.push(pl)
      })
    })
  }, [selectedOrders, candles])

  return <div ref={containerRef} style={{ width: '100%', height: 320 }} />
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function LivePositionsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [price, setPrice] = useState<Price | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    let active = true
    async function fetchData() {
      try {
        const [ordersRes, priceRes, statsRes] = await Promise.all([
          fetch('/api/orders-live', { cache: 'no-store' }),
          fetch('/api/live-price', { cache: 'no-store' }),
          fetch('/api/orders-stats', { cache: 'no-store' }),
        ])
        if (!ordersRes.ok || !priceRes.ok) throw new Error('fetch failed')
        const ordersData: Order[] = await ordersRes.json()
        const priceData: Price = await priceRes.json()
        const statsData: Stats = statsRes.ok ? await statsRes.json() : null
        if (active) {
          setOrders(ordersData); setPrice(priceData); setStats(statsData)
          // Artik mevcut olmayan order'lari secimden dusur
          setSelectedIds((prev) => {
            const liveIds = new Set(ordersData.map((o) => o.id))
            const next = new Set<number>()
            prev.forEach((id) => { if (liveIds.has(id)) next.add(id) })
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
  const selectedOrders = orders.filter((o) => selectedIds.has(o.id))

  const fmtMoney = (v: number) => `${v > 0 ? '+' : ''}$${Math.abs(v).toFixed(0)}`
  const moneyColor = (v: number) => (v >= 0 ? 'var(--green)' : 'var(--red)')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64 }}>
      <div className="container" style={{ paddingTop: 24 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          LIVE POSITIONS
        </div>

        {/* Score cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
            <ScoreCard label="TOTAL" value={stats.total_orders} />
            <ScoreCard label="PENDING" value={stats.pending} color="var(--amber)" />
            <ScoreCard label="OPEN" value={stats.open} color="var(--green)" />
            <ScoreCard label="EXPIRED" value={stats.expired} color="var(--text-2)" />
            <ScoreCard label="WIN RATE" value={`%${stats.win_rate.toFixed(1)}`} color={wpColor(stats.win_rate)} />
            <ScoreCard label="TP HIT" value={stats.tp_count} color="var(--green)" />
            <ScoreCard label="SL HIT" value={stats.sl_count} color="var(--red)" />
            <ScoreCard label="AVG WIN R" value={stats.avg_win_r != null ? `+${stats.avg_win_r.toFixed(2)}R` : '—'} color="var(--green)" />
            <ScoreCard label="TOTAL R" value={`${stats.total_r >= 0 ? '+' : ''}${stats.total_r.toFixed(2)}R`} color={moneyColor(stats.total_r)} />
            <ScoreCard label="TOTAL P&L" value={fmtMoney(stats.total_pnl)} color={moneyColor(stats.total_pnl)} />
          </div>
        )}

        {error && <div className="mono" style={{ color: 'var(--red)', fontSize: 11, marginBottom: 12 }}>{error}</div>}

        {/* Chart */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="col-label">
              BTCUSDT — 15m
              {selectedOrders.length > 0 && (
                <span style={{ color: 'var(--blue)', marginLeft: 8 }}>· {selectedOrders.length} selected</span>
              )}
            </div>
            {price && <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{((price.bid + price.ask) / 2).toFixed(2)}</span>}
          </div>
          <LiveChart candles={candles} selectedOrders={selectedOrders} />
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
            Select a position from the table below to view its zones
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          {loading && <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>loading...</div>}
          {!loading && orders.length === 0 && <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>no open or pending positions</div>}

          {orders.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 28, paddingBottom: 8 }} />
                  {['Analysis Date', 'Strategy', 'Status', 'Dir', 'Volume (Norm 50$)', 'Entry', 'SL', 'TP', 'RR', 'WP V6', 'PnL ($)'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 || i === 1 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const displayVolume = getDisplayVolume(order)
                  const pnl = order.status === 'OPEN' && midPrice !== null ? calcPnL(order, midPrice, displayVolume) : null
                  const selected = selectedIds.has(order.id)
                  return (
                    <tr
                      key={order.id}
                      onClick={() => toggleSelect(order.id)}
                      style={{
                        borderTop: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: selected ? 'var(--bg-3)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '6px 0', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                            border: '1px solid var(--border-3)',
                            background: selected ? 'var(--blue)' : 'transparent',
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px 0', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(order.analyzed_at)}</td>
                      <td style={{ padding: '6px 0', color: 'var(--text-2)' }}>{order.strategy_label}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{statusBadge(order.status)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{dirBadge(order.direction)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{displayVolume}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{order.entry_price.toFixed(2)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--red)' }}>{order.sl.toFixed(2)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--green)' }}>{order.tp.toFixed(2)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{order.analysis_rr ?? order.rr ?? '—'}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: wpColor(order.win_probability_v6) }}>{order.win_probability_v6 != null ? `%${Number(order.win_probability_v6).toFixed(0)}` : '—'}</td>
                      <td className={`mono ${pnl !== null ? pnlClass(pnl) : 'pnl-zero'}`} style={{ padding: '6px 0', textAlign: 'right' }}>{pnl !== null ? `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, textAlign: 'right' }}>
          updates every {POLL_INTERVAL_MS / 1000}s
        </div>
      </div>
    </div>
  )
}
