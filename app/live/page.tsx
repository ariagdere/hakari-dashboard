'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle } from 'lightweight-charts'
import {
  Chart as ChartJS, Tooltip, LineElement, PointElement,
  LinearScale, Filler, Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, Filler, Legend)

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
  r_target: number | null
  r_risk: number | null
  status: 'PENDING' | 'OPEN' | 'CLOSED' | 'CANCELED'
  created_at: string
  opened_at: string | null
  closed_at?: string | null
  close_price?: number | null
  realized_pnl?: number | null
  exit_reason?: string | null
  is_manual?: boolean
  position_size_btc: number | null
  win_probability_v6: number | null
  analyzed_at: string | null
  analysis_rr: string | null
  sim_result: string | null
}

interface Price { bid: number; ask: number; time: string }
interface Stats {
  total_orders: number; pending: number; open: number; expired: number
  win_rate: number; tp_count: number; sl_count: number
  avg_win_r: number | null; total_r: number; total_pnl: number
  max_drawdown: number; max_consecutive_wins: number
}
interface Candle { time: number; open: number; high: number; low: number; close: number }

interface StrategyRow {
  magic: number
  strategy_label: string
  total: number
  open: number
  pending: number
  expired: number
  closed: number
  tp_count: number
  sl_count: number
  win_rate: number | null
  avg_win_r: number | null
  total_r: number
  total_pnl: number
  avg_duration_min: number | null
  max_drawdown_r: number
  avg_wp_v6: number | null
  calibration_gap: number | null
}

const POLL_INTERVAL_MS = 5000

function getDisplayVolume(order: Order): number {
  return order.volume
}
function isLong(direction: string): boolean {
  return direction === 'BUY' || direction === 'LONG'
}

function calcPnL(order: Order, bid: number, ask: number, volume: number): number {
  const entry = order.fill_price ?? order.entry_price
  if (isLong(order.direction)) {
    return (bid - entry) * volume
  }
  return (entry - ask) * volume
}
const pnlClass = (v: number) => (v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero')
const moneyColor = (v: number) => (v >= 0 ? 'var(--green)' : 'var(--red)')
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
const simBadge = (r: string | null) => {
  if (!r) return <span className="badge badge-pend">—</span>
  if (r === 'TP_HIT') return <span className="badge badge-tp">TP</span>
  if (r === 'SL_HIT') return <span className="badge badge-sl">SL</span>
  if (r === 'EXPIRED') return <span className="badge badge-exp">EXP</span>
  if (r === 'NO_ENTRY') return <span className="badge badge-ne">N/E</span>
  return <span className="badge badge-wait">{r}</span>
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
// Dakikayi "2s 15dk" formatina cevir
const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`
}
// RR gosterimi: r_risk:r_target oranini oldugu gibi gosterir
// (normal trade'de r_risk=1 oldugu icin otomatik "1:2.14" gibi cikar,
//  inverse trade'de r_risk=6, r_target=1 ise "6:1" cikar)
const fmtRR = (order: Order) => {
  const target = order.r_target
  const risk = order.r_risk ?? 1
  if (target == null) return '—'
  const fmtNum = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(2))
  return `${fmtNum(risk)}:${fmtNum(target)}`
}

// lightweight-charts UTC gosterir; tarayicinin yerel offsetini ekleyerek
// eksen ve markerlari yerel saate hizalariz (tablo tr-TR ile tutarli olur).
const TZ_OFFSET_SEC = -new Date().getTimezoneOffset() * 60 // İstanbul icin +10800
const toLocalTime = (unixSec: number) => unixSec + TZ_OFFSET_SEC

function ScoreCard({ label, value, color, sub, subColor }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode; subColor?: string }) {
  return (
    <div className="stat-card">
      <div className="col-label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
      {sub != null && <div className="mono" style={{ fontSize: 10, marginTop: 4, color: subColor ?? 'var(--text-3)', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}

// OPEN karti icin ozel duzen: sol = adet, sag = ust uste unrealized PnL + value at risk
function OpenScoreCard({ count, unrealized, valueAtRisk }: { count: number; unrealized: number | null; valueAtRisk: number | null }) {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div className="col-label" style={{ marginBottom: 4 }}>OPEN</div>
        <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>{count}</div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, alignSelf: 'flex-end' }}>
        <div
          className="mono"
          style={{ fontSize: 9, color: unrealized != null ? moneyColor(unrealized) : 'var(--text-3)' }}
        >
          PnL: {unrealized != null ? `${unrealized >= 0 ? '+' : ''}$${unrealized.toFixed(2)}` : '—'}
        </div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>
          VaR: {valueAtRisk != null ? `$${valueAtRisk.toFixed(2)}` : '—'}
        </div>
      </div>
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
      const localCandles = candles.map((c) => ({ ...c, time: toLocalTime(c.time) }))
      seriesRef.current.setData(localCandles as any)
      if (!didInitialZoom.current) {
        const visibleCount = typeof window !== 'undefined' && window.innerWidth <= 768 ? 80 : 150
        const total = localCandles.length
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
      const rounded = Math.floor(ts / CANDLE_SEC) * CANDLE_SEC
      return toLocalTime(rounded) // candle'lar local'e kaydirildi, markerlar da
    }
    const markers: any[] = []
    selectedOrders.forEach((o) => {
      const isBuy = isLong(o.direction)
      // Order olusturma (created_at = order'in gonderildigi/PENDING oldugu mum)
      if (o.created_at) {
        markers.push({ time: roundToCandle(o.created_at), position: 'aboveBar', color: '#fbbf24', shape: 'square', text: `Order #${o.id}` })
      }
      // Giris (opened_at = fill mumu)
      if (o.opened_at) {
        markers.push({ time: roundToCandle(o.opened_at), position: isBuy ? 'belowBar' : 'aboveBar', color: '#60a5fa', shape: isBuy ? 'arrowUp' : 'arrowDown', text: `In #${o.id}` })
      }
      // Cikis (closed_at)
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

// Bir strateji secimine gore (null = tum hesap), kapanan islemleri GUNLUK bucket'lara
// toplayip {x: gun (ms), y: o gunun sonundaki kumulatif R} dizisi doner — analiz sayfasindaki
// Cumulative R grafiginin gunluk moduyla ayni mantik (her trade degil, her gun tek nokta).
function buildEquitySeries(history: Order[], strategyLabels: string[] | null): Array<{ x: number; y: number }> {
  const closed = history.filter((o) => {
    if (o.status !== 'CLOSED') return false
    if (o.exit_reason !== 'TP' && o.exit_reason !== 'SL') return false
    if (!o.closed_at) return false
    if (strategyLabels && !strategyLabels.includes(o.strategy_label)) return false
    return true
  })

  // Gune gore grupla (yerel saat diliminde, 'sv-SE' formati guvenilir YYYY-MM-DD verir)
  const byDay = new Map<string, number>()
  for (const o of closed) {
    const rTarget = o.r_target
    const rRisk = o.r_risk ?? 1
    const r = o.exit_reason === 'TP' ? (rTarget ?? 0) : -rRisk
    const dayKey = new Date(o.closed_at as string).toLocaleDateString('sv-SE')
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + r)
  }

  const days = Array.from(byDay.keys()).sort()
  let cum = 0
  const points: Array<{ x: number; y: number }> = []
  for (const day of days) {
    cum += byDay.get(day) ?? 0
    points.push({ x: new Date(day + 'T00:00:00').getTime(), y: Number(cum.toFixed(4)) })
  }
  return points
}

const EQUITY_LINE_COLORS = ['#f59e0b', '#3b82f6', '#a78bfa', '#f472b6', '#fbbf24']

// Analiz sayfasindaki Cumulative R grafigiyle ayni tasarim dili (Chart.js, dolgulu alan,
// DM Mono eksen fontu, koyu grid) — TradingView/lightweight-charts kullanilmiyor.
// Varsayilan: tum hesabin solid cizgisi. Secim yapilinca uzerine ince dotted (secilenler)
// + kalin dotted (kombine, 2+ secilirse) eklenir.
function EquityCurveChart({ history, selectedStrategies }: { history: Order[]; selectedStrategies: string[] }) {
  const total = buildEquitySeries(history, null)
  const totalFinal = total.length > 0 ? total[total.length - 1].y : 0
  const totalColor = totalFinal >= 0 ? '#4ade80' : '#f87171'

  const perStrategy = selectedStrategies.map((label, i) => ({
    label,
    color: EQUITY_LINE_COLORS[i % EQUITY_LINE_COLORS.length],
    points: buildEquitySeries(history, [label]),
  })).filter((s) => s.points.length > 0)

  const combined = selectedStrategies.length >= 2 ? buildEquitySeries(history, selectedStrategies) : null

  if (total.length === 0 && perStrategy.length === 0) {
    return (
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', padding: '40px 0', textAlign: 'center' }}>
        No closed trades yet
      </div>
    )
  }

  const datasets: any[] = [
    {
      label: 'Total Account',
      data: total,
      borderColor: totalColor,
      backgroundColor: totalColor === '#4ade80' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
      borderWidth: 1.5,
      pointRadius: 0,
      pointHitRadius: 12,
      fill: true,
      tension: 0.25,
    },
    ...perStrategy.map((s) => ({
      label: s.label,
      data: s.points,
      borderColor: s.color,
      borderWidth: 1.2,
      borderDash: [3, 3],
      pointRadius: 0,
      pointHitRadius: 12,
      fill: false,
      tension: 0.25,
    })),
  ]

  if (combined) {
    datasets.push({
      label: 'Combined (selected)',
      data: combined,
      borderColor: '#ffffff',
      borderWidth: 2.5,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHitRadius: 12,
      fill: false,
      tension: 0.25,
    })
  }

  return (
    <div style={{ height: 220 }}>
      <Line
        data={{ datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          parsing: false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: {
              display: true, position: 'top', align: 'end',
              labels: { color: '#a0a0a0', font: { family: 'DM Mono', size: 9 }, boxWidth: 12, padding: 8, usePointStyle: false },
            },
            tooltip: {
              displayColors: true,
              callbacks: {
                title: (items: any) => new Date(items[0].parsed.x).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}R`,
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              grid: { color: '#1a1a1a' },
              ticks: {
                color: '#555', font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 8,
                callback: (v: any) => new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
              },
              border: { color: '#242424' },
            },
            y: {
              grid: { color: '#1a1a1a' },
              ticks: { color: '#555', font: { family: 'DM Mono', size: 9 }, callback: (v: any) => `${v}R` },
              border: { color: '#242424' },
            },
          },
        } as any}
      />
    </div>
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
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL')
  const [equityStrategies, setEquityStrategies] = useState<Set<string>>(new Set())

  const toggleEquityStrategy = (label: string) => {
    setEquityStrategies((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }
  const [comparison, setComparison] = useState<StrategyRow[]>([])

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
        const statsUrl = strategyFilter && strategyFilter !== 'ALL'
          ? `/api/orders-stats?strategy=${encodeURIComponent(strategyFilter)}`
          : '/api/orders-stats'
        const [ordersRes, priceRes, statsRes, historyRes, compRes] = await Promise.all([
          fetch('/api/orders-live', { cache: 'no-store' }),
          fetch('/api/live-price', { cache: 'no-store' }),
          fetch(statsUrl, { cache: 'no-store' }),
          fetch('/api/orders-history', { cache: 'no-store' }),
          fetch('/api/strategy-comparison', { cache: 'no-store' }),
        ])
        if (!ordersRes.ok || !priceRes.ok) throw new Error('fetch failed')
        const ordersData: Order[] = await ordersRes.json()
        const priceData: Price = await priceRes.json()
        const statsData: Stats = statsRes.ok ? await statsRes.json() : null
        const historyData: Order[] = historyRes.ok ? await historyRes.json() : []
        const compData: StrategyRow[] = compRes.ok ? await compRes.json() : []
        if (active) {
          setOrders(ordersData); setPrice(priceData); setStats(statsData); setHistory(historyData); setComparison(compData)
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
  }, [strategyFilter])

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

  // Acik pozisyonlarin toplam unrealized PnL'i (strateji filtresine uyar)
  const totalUnrealized =
    price !== null
      ? orders
          .filter((o) => o.status === 'OPEN' && (strategyFilter === 'ALL' || o.strategy_label === strategyFilter))
          .reduce((sum, o) => sum + calcPnL(o, price.bid, price.ask, getDisplayVolume(o)), 0)
      : null

  // Acik pozisyonlarin toplam Value at Risk'i (SL'e giderse kaybedilecek toplam $ - strateji filtresine uyar)
  const totalValueAtRisk = orders
    .filter((o) => o.status === 'OPEN' && (strategyFilter === 'ALL' || o.strategy_label === strategyFilter))
    .reduce((sum, o) => {
      const entry = o.fill_price ?? o.entry_price
      return sum + Math.abs(entry - o.sl) * getDisplayVolume(o)
    }, 0)

  // Strateji filtresi once tum satirlara uygulanir (skorkart stats route'tan filtreli geliyor)
  const stratRows = [...orders, ...history].filter((o) =>
    strategyFilter === 'ALL' ? true : o.strategy_label === strategyFilter
  )
  const selectedOrders = stratRows.filter((o) => selectedIds.has(o.id))

  // Durum filtresi (strateji filtreli satirlar uzerinde)
  const filtered = stratRows.filter((o) => {
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

  // Pagination (filtre/siralama sonrasi 20'serli)
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

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
    if (o.status === 'CLOSED' && o.realized_pnl != null) {
      const v = o.realized_pnl
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

        {/* Strategy toggle bar */}
        {comparison.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="col-label" style={{ fontSize: 9, marginRight: 2 }}>STRATEGY</span>
            <button
              className={`filter-btn${strategyFilter === 'ALL' ? ' active' : ''}`}
              style={{ fontSize: 11 }}
              onClick={() => { setStrategyFilter('ALL'); setPage(1) }}
            >
              ALL
            </button>
            {comparison.map((s) => (
              <button
                key={s.strategy_label}
                className={`filter-btn${strategyFilter === s.strategy_label ? ' active' : ''}`}
                style={{ fontSize: 11 }}
                onClick={() => { setStrategyFilter(s.strategy_label); setPage(1) }}
              >
                {s.strategy_label}
              </button>
            ))}
          </div>
        )}

        {/* Score cards */}
        {stats && (
          <div className="live-scorecards">
            <ScoreCard label="TOTAL" value={stats.total_orders} />
            <ScoreCard label="PENDING" value={stats.pending} color="var(--amber)" />
            <OpenScoreCard
              count={stats.open}
              unrealized={stats.open > 0 ? totalUnrealized : null}
              valueAtRisk={stats.open > 0 ? totalValueAtRisk : null}
            />
            <ScoreCard label="EXPIRED" value={stats.expired} color="var(--text-2)" />
            <ScoreCard label="WIN RATE" value={`%${stats.win_rate.toFixed(1)}`} color={wpColor(stats.win_rate)} />
            <ScoreCard
              label="TP HIT"
              value={stats.tp_count}
              color="var(--green)"
              sub={`Max Cons: ${stats.max_consecutive_wins}`}
            />
            <ScoreCard
              label="SL HIT"
              value={stats.sl_count}
              color="var(--red)"
              sub={`Max DD: -${stats.max_drawdown.toFixed(2)}R`}
            />
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

        {/* Equity curve */}
        {comparison.length > 0 && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="col-label">EQUITY CURVE (R)</div>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>
                solid = total account{equityStrategies.size > 0 ? ' · dotted = selected' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {comparison.map((s) => (
                <button
                  key={s.strategy_label}
                  className={`filter-btn${equityStrategies.has(s.strategy_label) ? ' active' : ''}`}
                  style={{ fontSize: 11 }}
                  onClick={() => toggleEquityStrategy(s.strategy_label)}
                >
                  {s.strategy_label}
                </button>
              ))}
            </div>
            <EquityCurveChart history={history} selectedStrategies={Array.from(equityStrategies)} />
          </div>
        )}

        {/* Strategy comparison */}
        {comparison.length > 0 && (
          <>
            <div className="live-section-title">STRATEGY COMPARISON</div>
            <div className="card" style={{ padding: 16, marginBottom: 24, overflowX: 'auto' }}>
              <table className="live-table" style={{ minWidth: 1100 }}>
                <thead>
                  <tr>
                    {['Strategy', 'Total', 'Open', 'Pend', 'Exp', 'Closed', 'TP', 'SL', 'Win%', 'Avg Win R', 'Total R', 'Total P&L', 'Avg Dur', 'Max DD', 'WP V6', 'Calib'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((s) => {
                    const active = strategyFilter === s.strategy_label
                    return (
                      <tr
                        key={s.strategy_label}
                        onClick={() => { setStrategyFilter(active ? 'ALL' : s.strategy_label); setPage(1) }}
                        style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: active ? 'var(--bg-3)' : 'transparent' }}
                      >
                        <td style={{ padding: '6px 0', color: 'var(--text-2)' }}>{s.strategy_label}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{s.total}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--green)' }}>{s.open}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--amber)' }}>{s.pending}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)' }}>{s.expired}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{s.closed}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--green)' }}>{s.tp_count}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--red)' }}>{s.sl_count}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: wpColor(s.win_rate) }}>{s.win_rate != null ? `%${s.win_rate.toFixed(1)}` : '—'}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--green)' }}>{s.avg_win_r != null ? `+${s.avg_win_r.toFixed(2)}R` : '—'}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: moneyColor(s.total_r) }}>{`${s.total_r >= 0 ? '+' : ''}${s.total_r.toFixed(2)}R`}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: moneyColor(s.total_pnl) }}>{`${s.total_pnl >= 0 ? '+' : ''}$${Math.abs(s.total_pnl).toFixed(0)}`}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)' }}>{s.avg_duration_min != null ? fmtDuration(s.avg_duration_min) : '—'}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--red)' }}>{`-${s.max_drawdown_r.toFixed(2)}R`}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)' }}>{s.avg_wp_v6 != null ? `%${s.avg_wp_v6.toFixed(0)}` : '—'}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: s.calibration_gap == null ? 'var(--text-3)' : s.calibration_gap >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {s.calibration_gap != null ? `${s.calibration_gap >= 0 ? '+' : ''}${s.calibration_gap.toFixed(1)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
                Click a row to filter the whole page by that strategy · Calib = actual win rate − predicted WP
              </div>
            </div>
          </>
        )}

        {/* Status filter toggles */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-btn${statusFilter === f.key ? ' active' : ''}`}
              style={{ fontSize: 11 }}
              onClick={() => { setStatusFilter(f.key); setPage(1) }}
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
                      {['Order Date', 'Entry Date', 'Close Date', 'Strategy', 'Status', 'Dir', 'Sim', 'Volume', 'Entry', 'Fill', 'Exit', 'SL', 'TP', 'RR', 'WP V6', 'PnL ($)'].map((h, i) => (
                        <th key={h} style={{ textAlign: i <= 3 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((order) => {
                      const selected = selectedIds.has(order.id)
                      const displayVolume = getDisplayVolume(order)
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
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{simBadge(order.sim_result)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{displayVolume}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{fmtPrice(order.entry_price)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)' }}>{fmtPrice(order.fill_price)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{fmtPrice(order.close_price)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--red)' }}>{fmtPrice(order.sl)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--green)' }}>{fmtPrice(order.tp)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{fmtRR(order)}</td>
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
                {paged.map((order) => {
                  const selected = selectedIds.has(order.id)
                  const displayVolume = getDisplayVolume(order)
                  const pnl = rowPnl(order)
                  return (
                    <div key={order.id} className={`live-mcard${selected ? ' selected' : ''}`} onClick={() => toggleSelect(order.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <SelectDot selected={selected} />
                          {dirBadge(order.direction)}
                          {rowBadge(order)}
                          {simBadge(order.sim_result)}
                        </div>
                        <span className={`mono ${pnl.cls}`} style={{ fontSize: 13, fontWeight: 600 }}>
                          {pnl.text === '—' ? '—' : `${pnl.text.startsWith('-') ? '-' : '+'}$${pnl.text.replace(/^[+-]/, '')}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>{order.strategy_label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                        <div><span className="col-label">Entry </span><span style={{ color: 'var(--text-2)' }}>{fmtPrice(order.entry_price)}</span></div>
                        <div><span className="col-label">Fill </span><span style={{ color: 'var(--text-3)' }}>{fmtPrice(order.fill_price)}</span></div>
                        <div><span className="col-label">Exit </span><span style={{ color: 'var(--text-2)' }}>{fmtPrice(order.close_price)}</span></div>
                        <div><span className="col-label">Vol </span><span style={{ color: 'var(--text-2)' }}>{displayVolume}</span></div>
                        <div><span className="col-label">SL </span><span style={{ color: 'var(--red)' }}>{fmtPrice(order.sl)}</span></div>
                        <div><span className="col-label">TP </span><span style={{ color: 'var(--green)' }}>{fmtPrice(order.tp)}</span></div>
                        <div><span className="col-label">RR </span><span style={{ color: 'var(--text-2)' }}>{fmtRR(order)}</span></div>
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

        {/* Pagination */}
        {sorted.length > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <button
              className="filter-btn"
              style={{ fontSize: 11 }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ← Prev
            </button>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '0 8px' }}>
              {currentPage} / {totalPages}
              <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>({sorted.length} total)</span>
            </span>
            <button
              className="filter-btn"
              style={{ fontSize: 11 }}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        )}

        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, textAlign: 'right' }}>
          updates every {POLL_INTERVAL_MS / 1000}s
        </div>
      </div>
    </div>
  )
}
