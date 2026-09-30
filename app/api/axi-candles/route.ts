import { NextRequest, NextResponse } from 'next/server'
import { TIMEFRAMES, isTimeframe } from '@/lib/axiMarket'
import { getAxiCandles } from '@/lib/axiCandles'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// /live grafigi: Axi BTCUSD'nin son 1000 mumu (olusan mum dahil). /api/candles ile ayni format.
// /api/candles (Binance, DB) ve hakari-candle-refresher olduklari gibi duruyor.
export async function GET(req: NextRequest) {
  const interval = req.nextUrl.searchParams.get('interval') || '15m'
  if (!isTimeframe(interval)) {
    return NextResponse.json({ error: `interval must be one of: ${TIMEFRAMES.join(', ')}` }, { status: 400 })
  }
  try {
    const candles = await getAxiCandles(interval)
    return NextResponse.json(candles, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    console.error('axi-candles error:', err?.message ?? err)
    return NextResponse.json({ error: 'Axi mumları alınamadı', detail: String(err?.message ?? err) }, { status: 502 })
  }
}
