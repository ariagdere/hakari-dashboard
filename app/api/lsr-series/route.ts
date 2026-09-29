import pool from '@/lib/db'
import { LsrSeries } from '@/lib/lsrAngle'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Live sayfadaki LSR açı panelleri için: son 30 mumun ham değeri + o ana kadarki
// tam geçmişten hesaplanmış "şu anki açı" okuması (bkz. lib/lsrAngle.ts -- aynı
// look-ahead-safe matematik, order'lara yazılan değerlerle aynı yöntem).
export async function GET(req: NextRequest) {
  const metric = req.nextUrl.searchParams.get('metric')
  const period = req.nextUrl.searchParams.get('period')

  if (metric !== 'global' && metric !== 'top_position') {
    return NextResponse.json({ error: "metric must be 'global' or 'top_position'" }, { status: 400 })
  }
  if (period !== '5m' && period !== '1h') {
    return NextResponse.json({ error: "period must be '5m' or '1h'" }, { status: 400 })
  }

  try {
    const { rows } = await pool.query(
      `SELECT open_time, long_account, short_account, long_short_ratio
       FROM lsr_series
       WHERE metric = $1 AND period = $2
       ORDER BY open_time ASC`,
      [metric, period]
    )

    if (rows.length === 0) {
      return NextResponse.json({ candles: [], current: null, reason: 'no_data' })
    }

    const points = rows.map((r) => ({ t: Number(r.open_time), v: Number(r.long_short_ratio) }))
    const last30 = rows.slice(-30).map((r) => ({
      time: Number(r.open_time),
      longAccount: Number(r.long_account),
      shortAccount: Number(r.short_account),
      ratio: Number(r.long_short_ratio),
    }))

    let current: { angle: number; r2: number; ref: number; nRef: number } | null = null
    let reason = 'ok'
    if (points.length >= 30) {
      const series = new LsrSeries(points, period)
      const { result, reason: r } = series.statsAt(Date.now(), 1)
      reason = r
      if (result) {
        current = {
          angle: Math.round(result.angle * 100) / 100,
          r2: Math.round(result.r2 * 1000) / 1000,
          ref: result.ref,
          nRef: result.nRef,
        }
      }
    } else {
      reason = 'yetersiz_veri'
    }

    return NextResponse.json({ candles: last30, current, reason })
  } catch (err) {
    console.error('lsr-series error:', err)
    return NextResponse.json({ error: 'Failed to fetch lsr series' }, { status: 500 })
  }
}
