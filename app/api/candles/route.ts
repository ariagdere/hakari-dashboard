import { NextResponse } from 'next/server';

// Binance public klines — auth gerektirmez.
// 15m timeframe, son ~100 mum.
export async function GET() {
  try {
    const url =
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=100';

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text();
      console.error('Binance fetch failed:', res.status, body.slice(0, 300));
      return NextResponse.json(
        { error: 'Binance fetch failed', status: res.status, detail: body.slice(0, 300) },
        { status: 502 }
      );
    }

    const raw: any[] = await res.json();

    // lightweight-charts formati: { time (saniye), open, high, low, close }
    const candles = raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
    }));

    return NextResponse.json(candles);
  } catch (err: any) {
    console.error('candles error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to fetch candles', detail: String(err?.message || err) }, { status: 500 });
  }
}
