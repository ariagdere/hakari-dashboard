import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const { rows } = await pool.query(`
    SELECT
      DATE(analyzed_at AT TIME ZONE 'UTC') AS day,
      SUM(sim_r_multiple) AS daily_r
    FROM btc_analysis
    ${base} sim_result IN ('TP_HIT','SL_HIT')
      AND sim_r_multiple IS NOT NULL
      AND analyzed_at IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `, params)

  // Kümülatif R ve max drawdown hesapla
  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0

  const series = rows.map(row => {
    cumulative += parseFloat(row.daily_r)
    if (cumulative > peak) peak = cumulative
    const drawdown = cumulative - peak
    if (drawdown < maxDrawdown) maxDrawdown = drawdown
    return {
      day: row.day,
      cumulative_r: parseFloat(cumulative.toFixed(2)),
      daily_r: parseFloat(parseFloat(row.daily_r).toFixed(2)),
    }
  })

  return NextResponse.json({
    series,
    max_drawdown: parseFloat(maxDrawdown.toFixed(2)),
    final_r: parseFloat(cumulative.toFixed(2)),
  })
}
