import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const [bucketRows, dirRows] = await Promise.all([
    pool.query(`
      SELECT
        CASE
          WHEN win_probability_v4 < 20 THEN '0-20%'
          WHEN win_probability_v4 < 30 THEN '20-30%'
          WHEN win_probability_v4 < 40 THEN '30-40%'
          WHEN win_probability_v4 < 50 THEN '40-50%'
          WHEN win_probability_v4 < 60 THEN '50-60%'
          WHEN win_probability_v4 < 70 THEN '60-70%'
          ELSE '70%+'
        END AS bucket,
        CASE
          WHEN win_probability_v4 < 20 THEN 1
          WHEN win_probability_v4 < 30 THEN 2
          WHEN win_probability_v4 < 40 THEN 3
          WHEN win_probability_v4 < 50 THEN 4
          WHEN win_probability_v4 < 60 THEN 5
          WHEN win_probability_v4 < 70 THEN 6
          ELSE 7
        END AS sort_order,
        ROUND(AVG(win_probability_v4), 1) AS avg_predicted,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS actual_win_rate,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
        ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS avg_r
      FROM btc_analysis
      ${base} win_probability_v4 IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `, params),

    pool.query(`
      SELECT direction,
        ROUND(AVG(win_probability_v4), 1) AS avg_probability,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS actual_win_rate
      FROM btc_analysis
      ${base} win_probability_v4 IS NOT NULL
        AND direction IN ('LONG','SHORT')
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY direction
    `, params),
  ])

  return NextResponse.json({ buckets: bucketRows.rows, by_dir: dirRows.rows })
}
