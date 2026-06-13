import { NextResponse } from 'next/server';

// Bybit public kline — auth gerektirmez, Railway/veri merkezi IP'lerinden calisir.
// Binance bazi bolge/IP'lerden 451 dondurdugu icin Bybit tercih edildi.
// interval=15 (dakika), category=linear (USDT perpetual), symbol=BTCUSDT
export async function GET() {
  try {
    const url =
      'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=15&limit=200';

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text();
      console.error('Bybit fetch failed:', res.status, body.slice(0, 300));
      return NextResponse.json(
        { error: 'Bybit fetch failed', status: res.status, detail: body.slice(0, 300) },
        { status: 502 }
      );
    }

    const json = await res.json();
    // Bybit format: result.list = [ [start_ms, open, high, low, close, volume, turnover], ... ]
    // Liste en yeniden eskiye siralidir -> reverse + eskiden yeniye
    const list: any[] = json?.result?.list ?? [];
    if (list.length === 0) {
      console.error('Bybit empty list:', JSON.stringify(json).slice(0, 300));
      return NextResponse.json({ error: 'No candle data', detail: json }, { status: 502 });
    }

    const candles = list
      .map((k) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }))
      .sort((a, b) => a.time - b.time); // lightweight-charts artan zaman bekler

    return NextResponse.json(candles);
  } catch (err: any) {
    console.error('candles error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to fetch candles', detail: String(err?.message || err) }, { status: 500 });
  }
}
