import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SYMBOL = 'BTCUSDT';
const VALID_INTERVALS = ['5m', '15m', '1h', '4h', '1d'] as const;
type Interval = (typeof VALID_INTERVALS)[number];
const DEFAULT_LIMIT = 1500;

// candles tablosu (symbol+interval+open_time) hakari-candle-refresher tarafından
// güncelleniyor -- bkz. db/002_candles_multi_tf.sql, db/candles_backfill.py.
// DB'de bu (symbol, interval) için hiç veri yoksa (migrasyon/backfill henüz
// çalıştırılmadıysa) Binance'e CANLI fallback yapılır -- grafik hiçbir zaman
// tamamen boş kalmaz, ama bu fallback DB'ye YAZMAZ (o, refresher'ın işi).
async function fetchFromBinanceFallback(interval: Interval): Promise<any[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${interval}&limit=1000`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const raw: any[] = await res.json();
  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

export async function GET(req: NextRequest) {
  const intervalParam = req.nextUrl.searchParams.get('interval') || '15m';
  if (!VALID_INTERVALS.includes(intervalParam as Interval)) {
    return NextResponse.json(
      { error: `interval must be one of: ${VALID_INTERVALS.join(', ')}` },
      { status: 400 }
    );
  }
  const interval = intervalParam as Interval;
  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : DEFAULT_LIMIT;

  try {
    const { rows } = await pool.query(
      `SELECT open_time, open, high, low, close FROM (
         SELECT open_time, open, high, low, close
         FROM candles
         WHERE symbol = $1 AND interval = $2
         ORDER BY open_time DESC
         LIMIT $3
       ) t
       ORDER BY open_time ASC`,
      [SYMBOL, interval, limit]
    );

    if (rows.length === 0) {
      // Migrasyon/backfill henüz yapılmadıysa (ya da bu interval için veri birikmediyse)
      // canlı Binance'ten göster -- eski davranışla aynı fallback.
      const fallback = await fetchFromBinanceFallback(interval);
      return NextResponse.json(fallback);
    }

    const candles = rows.map((r) => ({
      time: Math.floor(Number(r.open_time) / 1000),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    }));
    return NextResponse.json(candles);
  } catch (err: any) {
    console.error('candles error, Binance fallback deneniyor:', err?.message || err);
    try {
      const fallback = await fetchFromBinanceFallback(interval);
      return NextResponse.json(fallback);
    } catch (err2: any) {
      return NextResponse.json({ error: 'Failed to fetch candles', detail: String(err2?.message || err2) }, { status: 500 });
    }
  }
}
