import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const [bucketRows, dirRows, scatterRows] = await Promise.all([

    // Win probability buckets → gerçek win rate
    pool.query(`
      SELECT
        CASE
          WHEN win_probability < 20 THEN '0-20%'
          WHEN win_probability < 30 THEN '20-30%'
          WHEN win_probability < 40 THEN '30-40%'
          WHEN win_probability < 50 THEN '40-50%'
          WHEN win_probability < 60 THEN '50-60%'
          WHEN win_probability < 70 THEN '60-70%'
          ELSE '70%+'
        END AS bucket,
        CASE
          WHEN win_probability < 20 THEN 1
          WHEN win_probability < 30 THEN 2
          WHEN win_probability < 40 THEN 3
          WHEN win_probability < 50 THEN 4
          WHEN win_probability < 60 THEN 5
          WHEN win_probability < 70 THEN 6
          ELSE 7
        END AS sort_order,
        ROUND(AVG(win_probability), 1) AS avg_predicted,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS actual_win_rate,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r
      FROM btc_analysis
      ${base} win_probability IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `, params),

    // Direction bazında ortalama win probability
    pool.query(`
      SELECT
        direction,
        ROUND(AVG(win_probability), 1) AS avg_probability,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS actual_win_rate
      FROM btc_analysis
      ${base} win_probability IS NOT NULL
        AND direction IN ('LONG','SHORT')
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY direction
    `, params),

    // Scatter: predicted vs actual (1=win, 0=loss) — calibration plot için
    pool.query(`
      SELECT
        ROUND(win_probability) AS predicted,
        ROUND(
          AVG(CASE WHEN sim_result = 'TP_HIT' THEN 1.0 ELSE 0.0 END) * 100, 1
        ) AS actual_win_rate,
        COUNT(*) AS total
      FROM btc_analysis
      ${base} win_probability IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY ROUND(win_probability)
      HAVING COUNT(*) >= 3
      ORDER BY predicted
    `, params),

  ])

  return NextResponse.json({
    buckets:   bucketRows.rows,
    by_dir:    dirRows.rows,
    scatter:   scatterRows.rows,
  })
}
