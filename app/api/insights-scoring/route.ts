import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const rsiQ = (direction?: string) => `
    SELECT
      rsi_zone,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 / NULLIF(COUNT(*), 0), 1) AS win_rate,
      ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r
    FROM btc_analysis
    ${base} rsi_zone IS NOT NULL
      AND sim_result IN ('TP_HIT','SL_HIT')
      ${direction ? `AND direction = '${direction}'` : ''}
    GROUP BY rsi_zone
    ORDER BY MIN(rsi_4h)
  `

  const rsi30Q = (direction?: string) => `
    SELECT
      CASE
        WHEN rsi_30m < 30 THEN 'oversold'
        WHEN rsi_30m < 45 THEN 'lower_neutral'
        WHEN rsi_30m < 55 THEN 'neutral'
        WHEN rsi_30m < 70 THEN 'upper_neutral'
        ELSE 'overbought'
      END AS rsi_zone,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 / NULLIF(COUNT(*), 0), 1) AS win_rate,
      ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r
    FROM btc_analysis
    ${base} rsi_30m IS NOT NULL
      AND sim_result IN ('TP_HIT','SL_HIT')
      ${direction ? `AND direction = '${direction}'` : ''}
    GROUP BY 1
    ORDER BY MIN(rsi_30m)
  `

  const [rsiAll, rsiLong, rsiShort, rsi30All, rsi30Long, rsi30Short] = await Promise.all([
    pool.query(rsiQ(),        params),
    pool.query(rsiQ('LONG'),  params),
    pool.query(rsiQ('SHORT'), params),
    pool.query(rsi30Q(),        params),
    pool.query(rsi30Q('LONG'),  params),
    pool.query(rsi30Q('SHORT'), params),
  ])

  return NextResponse.json({
    by_rsi:        rsiAll.rows,
    by_rsi_long:   rsiLong.rows,
    by_rsi_short:  rsiShort.rows,
    by_rsi30:      rsi30All.rows,
    by_rsi30_long:  rsi30Long.rows,
    by_rsi30_short: rsi30Short.rows,
  })
}
