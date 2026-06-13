'use client'

import React, { useEffect, useState } from 'react'

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
}

interface Price {
  bid: number
  ask: number
  time: string
}

const POLL_INTERVAL_MS = 5000

// Demo hesap volumeStep=0.1 kisitlamasi nedeniyle gonderilen gercek volume sabit (0.1),
// arayuzde "ideal" boyutu (50$ risk hedefine gore) gosteriyoruz.
const SIZE_MULTIPLIER = 2.5

function getDisplayVolume(order: Order): number {
  if (order.position_size_btc == null) return order.volume
  return Math.round(order.position_size_btc * SIZE_MULTIPLIER * 100) / 100
}

function calcPnL(order: Order, midPrice: number, volume: number): number {
  const diff =
    order.direction === 'BUY'
      ? midPrice - order.entry_price
      : order.entry_price - midPrice // SELL
  return diff * volume // contractSize = 1 for BTCUSD
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

export default function LivePositionsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [price, setPrice] = useState<Price | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function fetchData() {
      try {
        const [ordersRes, priceRes] = await Promise.all([
          fetch('/api/orders-live', { cache: 'no-store' }),
          fetch('/api/live-price', { cache: 'no-store' }),
        ])

        if (!ordersRes.ok || !priceRes.ok) throw new Error('fetch failed')

        const ordersData: Order[] = await ordersRes.json()
        const priceData: Price = await priceRes.json()

        if (active) {
          setOrders(ordersData)
          setPrice(priceData)
          setError(null)
          setLoading(false)
        }
      } catch {
        if (active) {
          setError('Failed to load live data')
          setLoading(false)
        }
      }
    }

    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const midPrice = price ? (price.bid + price.ask) / 2 : null
  const openCount = orders.filter((o) => o.status === 'OPEN').length
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64 }}>
      <div className="container" style={{ paddingTop: 24 }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}
        >
          LIVE POSITIONS
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
          <div className="stat-card">
            <div className="col-label" style={{ marginBottom: 4 }}>BTCUSD BID</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
              {price ? price.bid.toFixed(2) : '—'}
            </div>
          </div>
          <div className="stat-card">
            <div className="col-label" style={{ marginBottom: 4 }}>BTCUSD ASK</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
              {price ? price.ask.toFixed(2) : '—'}
            </div>
          </div>
          <div className="stat-card">
            <div className="col-label" style={{ marginBottom: 4 }}>OPEN</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--green)' }}>
              {openCount}
            </div>
          </div>
          <div className="stat-card">
            <div className="col-label" style={{ marginBottom: 4 }}>PENDING</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--amber)' }}>
              {pendingCount}
            </div>
          </div>
        </div>

        {error && (
          <div className="mono" style={{ color: 'var(--red)', fontSize: 11, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Table */}
        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          {loading && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>
              loading...
            </div>
          )}

          {!loading && orders.length === 0 && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: 20, textAlign: 'center' }}>
              no open or pending positions
            </div>
          )}

          {orders.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace', minWidth: 720 }}>
              <thead>
                <tr>
                  {['Strategy', 'Status', 'Dir', 'Volume', 'Entry', 'SL', 'TP', 'RR', 'PnL ($)'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? 'left' : 'right',
                        color: 'var(--text-3)',
                        paddingBottom: 8,
                        fontWeight: 400,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const displayVolume = getDisplayVolume(order)
                  const pnl =
                    order.status === 'OPEN' && midPrice !== null
                      ? calcPnL(order, midPrice, displayVolume)
                      : null

                  return (
                    <tr key={order.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 0', color: 'var(--text-2)' }}>{order.strategy_label}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{statusBadge(order.status)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{dirBadge(order.direction)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>{displayVolume}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>
                        {order.entry_price.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--red)' }}>
                        {order.sl.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--green)' }}>
                        {order.tp.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-2)' }}>
                        {order.rr ?? '—'}
                      </td>
                      <td
                        className={`mono ${pnl !== null ? pnlClass(pnl) : 'pnl-zero'}`}
                        style={{ padding: '6px 0', textAlign: 'right' }}
                      >
                        {pnl !== null ? `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}` : '—'}
                      </td>
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
