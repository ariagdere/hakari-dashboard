import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

// insights-cumr'nin naif paraleli — sim_result_naive / naive_sim_r_multiple bazlı.
// naive_sim_r_multiple $ değil R multiple olduğu için daily_pnl null döner.

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req, 'naive')
  const base = where ? `${where} AND` : 'WHERE'

  const dailyQ = `
    SELECT
      DATE(analyzed_at AT TIME ZONE 'Europe/Istanbul') AS day,
      SUM(naive_sim_r_multiple) AS daily_r,
      COUNT(*) AS trade_count
    FROM btc_analysis
    ${base} sim_result_naive IN ('TP_HIT','SL_HIT')
      AND naive_sim_r_multiple IS NOT NULL
      AND analyzed_at IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `
  const weeklyQ = `
    SELECT
      DATE_TRUNC('week', analyzed_at AT TIME ZONE 'Europe/Istanbul') AS day,
      SUM(naive_sim_r_multiple) AS daily_r,
      COUNT(*) AS trade_count
    FROM btc_analysis
    ${base} sim_result_naive IN ('TP_HIT','SL_HIT')
      AND naive_sim_r_multiple IS NOT NULL
      AND analyzed_at IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `
  const monthlyQ = `
    SELECT
      DATE_TRUNC('month', analyzed_at AT TIME ZONE 'Europe/Istanbul') AS day,
      SUM(naive_sim_r_multiple) AS daily_r,
      COUNT(*) AS trade_count
    FROM btc_analysis
    ${base} sim_result_naive IN ('TP_HIT','SL_HIT')
      AND naive_sim_r_multiple IS NOT NULL
      AND analyzed_at IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `

  const [dailyRows, weeklyRows, monthlyRows] = await Promise.all([
    pool.query(dailyQ, params),
    pool.query(weeklyQ, params),
    pool.query(monthlyQ, params),
  ])

  function buildSeries(rows: any[]) {
    let cumulative = 0
    let peak = 0
    let maxDrawdown = 0
    const series = rows.map(row => {
      cumulative += parseFloat(row.daily_r)
      if (cumulative > peak) peak = cumulative
      const drawdown = cumulative - peak
      if (drawdown < maxDrawdown) maxDrawdown = drawdown
      return {
        day:          row.day,
        cumulative_r: parseFloat(cumulative.toFixed(2)),
        daily_r:      parseFloat(parseFloat(row.daily_r).toFixed(2)),
        daily_pnl:    null,
        trade_count:  parseInt(row.trade_count),
      }
    })
    return { series, max_drawdown: parseFloat(maxDrawdown.toFixed(2)), final_r: parseFloat(cumulative.toFixed(2)) }
  }

  return NextResponse.json({
    daily:   buildSeries(dailyRows.rows),
    weekly:  buildSeries(weeklyRows.rows),
    monthly: buildSeries(monthlyRows.rows),
  })
}
