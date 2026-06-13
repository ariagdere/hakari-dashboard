'use client';

import { useEffect, useState } from 'react';

type Order = {
  id: number;
  analysis_id: number | null;
  mt5_order_id: string;
  mt5_position_id: string | null;
  magic: number;
  strategy_label: string;
  symbol: string;
  direction: string;
  volume: number;
  entry_price: number;
  fill_price: number | null;
  sl: number;
  tp: number;
  rr: number | null;
  status: 'PENDING' | 'OPEN';
  created_at: string;
  opened_at: string | null;
  position_size_btc: number | null;
};

type Price = {
  bid: number;
  ask: number;
  time: string;
};

const POLL_INTERVAL_MS = 5000;

// Demo hesap volumeStep=0.1 kısıtlaması nedeniyle gönderilen gerçek volume sabit (0.1),
// ancak arayüzde "ideal" boyutu (50$ risk hedefine göre) gösteriyoruz.
const SIZE_MULTIPLIER = 2.5;

function getDisplayVolume(order: Order): number {
  if (order.position_size_btc == null) return order.volume; // MANUAL veya eşleşme yok -> gerçek volume
  return Math.round(order.position_size_btc * SIZE_MULTIPLIER * 100) / 100;
}

function calcPnL(order: Order, midPrice: number, volume: number): number {
  const diff =
    order.direction === 'BUY'
      ? midPrice - order.entry_price
      : order.entry_price - midPrice; // SELL
  return diff * volume; // contractSize = 1 for BTCUSD
}

export default function LivePositionsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [price, setPrice] = useState<Price | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const [ordersRes, priceRes] = await Promise.all([
          fetch('/api/orders-live'),
          fetch('/api/live-price'),
        ]);

        if (!ordersRes.ok || !priceRes.ok) {
          throw new Error('Fetch failed');
        }

        const ordersData: Order[] = await ordersRes.json();
        const priceData: Price = await priceRes.json();

        if (active) {
          setOrders(ordersData);
          setPrice(priceData);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError('Failed to load live data');
          setLoading(false);
        }
      }
    }

    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const midPrice = price ? (price.bid + price.ask) / 2 : null;

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
        Live Positions
      </h1>

      {price && (
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
          BTCUSD — Bid: {price.bid.toFixed(2)} / Ask: {price.ask.toFixed(2)}
          {' '}(updated every {POLL_INTERVAL_MS / 1000}s)
        </p>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && <p>Loading...</p>}

      {!loading && orders.length === 0 && (
        <p style={{ color: '#666' }}>No open or pending positions.</p>
      )}

      {orders.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '8px' }}>Strategy</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px' }}>Direction</th>
              <th style={{ padding: '8px' }}>Volume</th>
              <th style={{ padding: '8px' }}>Entry</th>
              <th style={{ padding: '8px' }}>SL</th>
              <th style={{ padding: '8px' }}>TP</th>
              <th style={{ padding: '8px' }}>RR</th>
              <th style={{ padding: '8px' }}>PnL ($)</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const displayVolume = getDisplayVolume(order);
              const pnl =
                order.status === 'OPEN' && midPrice !== null
                  ? calcPnL(order, midPrice, displayVolume)
                  : null;

              return (
                <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{order.strategy_label}</td>
                  <td style={{ padding: '8px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: order.status === 'OPEN' ? '#dcfce7' : '#fef9c3',
                        color: order.status === 'OPEN' ? '#166534' : '#854d0e',
                      }}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>{order.direction}</td>
                  <td style={{ padding: '8px' }}>{displayVolume}</td>
                  <td style={{ padding: '8px' }}>{order.entry_price.toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>{order.sl.toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>{order.tp.toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>{order.rr ?? '-'}</td>
                  <td
                    style={{
                      padding: '8px',
                      fontWeight: 600,
                      color: pnl === null ? '#999' : pnl >= 0 ? '#16a34a' : '#dc2626',
                    }}
                  >
                    {pnl !== null ? pnl.toFixed(2) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
