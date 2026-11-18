import { NextRequest, NextResponse } from 'next/server'
import { TIMEFRAMES, isTimeframe } from '@/lib/axiMarket'
import { getAxiCandles, getOlderAxiCandles } from '@/lib/axiCandles'
import { get3mCandles, getOlder3mCandles } from '@/lib/paralelCandles'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const OLDER_MAX = 2000

// /live grafigi: Axi BTCUSD'nin son 1000 mumu (olusan mum dahil). /api/candles ile ayni format.
// Sunucudaki depodan (DB destekli, lib/axiCandles.ts) hemen doner; MetaApi'yi beklemez.
// Veri geride kalmissa (orn. restart sonrasi ilk saniyeler) X-Candles-Stale: 1 -- istemci
// birkac saniye sonra tekrar sorar. /api/candles (Binance) ve hakari-candle-refresher olduklari gibi.
// 3m: paralel sistemin 1m mumlarindan (lib/paralelCandles.ts; PARALEL_DATABASE_URL gerekir).
// Geriye kaydirma: ?before=<UTC saniye>&limit=<n> (varsayilan 1000) -> { candles, more }: o andan onceki en fazla
// n mum, eskiden yeniye. 3m paralelden, digerleri eski sistemin DB'deki Axi gecmisinden; MetaApi'ye istek gitmez.
export async function GET(req: NextRequest) {
  const interval = req.nextUrl.searchParams.get('interval') || '15m'
  if (interval !== '3m' && !isTimeframe(interval)) {
    return NextResponse.json({ error: `interval must be one of: 3m, ${TIMEFRAMES.join(', ')}` }, { status: 400 })
  }
  const before = req.nextUrl.searchParams.get('before')
  if (before !== null) return getOlder(interval, before, req.nextUrl.searchParams.get('limit'))
  if (interval === '3m') return get3m()
  try {
    const { candles, stale } = await getAxiCandles(interval)
    return NextResponse.json(candles, {
      headers: { 'Cache-Control': 'no-store', ...(stale ? { 'X-Candles-Stale': '1' } : {}) },
    })
  } catch (err: any) {
    console.error('axi-candles error:', err?.message ?? err)
    return NextResponse.json({ error: 'Axi mumları alınamadı', detail: String(err?.message ?? err) }, { status: 502 })
  }
}

async function get3m() {
  try {
    const r = await get3mCandles()
    if (!r) {
      return NextResponse.json(
        { error: '3m mumları paralel sistemden okunuyor; Railway\'de PARALEL_DATABASE_URL tanımlı değil' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return NextResponse.json(r.candles, { headers: { 'Cache-Control': 'no-store', ...(r.stale ? { 'X-Candles-Stale': '1' } : {}) } })
  } catch (err: any) {
    console.error('axi-candles 3m error:', err?.message ?? err)
    return NextResponse.json({ error: '3m mumları paralel veritabanından okunamadı', detail: String(err?.message ?? err) }, { status: 502 })
  }
}

async function getOlder(interval: string, beforeParam: string, limitParam: string | null) {
  const before = Number(beforeParam)
  const limit = limitParam === null ? 1000 : Number(limitParam)
  if (!Number.isInteger(before) || before <= 0 || !Number.isInteger(limit) || limit < 1 || limit > OLDER_MAX) {
    return NextResponse.json({ error: `before (UTC saniye) ve limit (1-${OLDER_MAX}) tam sayı olmalı` }, { status: 400 })
  }
  try {
    const r = interval === '3m' ? await getOlder3mCandles(before, limit) : isTimeframe(interval) ? await getOlderAxiCandles(interval, before, limit) : null
    if (!r) {
      const error = interval === '3m'
        ? '3m mumları paralel sistemden okunuyor; Railway\'de PARALEL_DATABASE_URL tanımlı değil'
        : 'Axi mum geçmişi veritabanından okunamıyor'
      return NextResponse.json({ error }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    console.error(`axi-candles ${interval} older error:`, err?.message ?? err)
    return NextResponse.json({ error: 'Eski mumlar okunamadı', detail: String(err?.message ?? err) }, { status: 502 })
  }
}
