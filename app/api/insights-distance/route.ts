import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const [tpRows, slRows] = await Promise.all([
    // TP mesafe bucket'ları
    pool.query(`
      SELECT
        CASE
          WHEN ABS(tp - entry) < 500  THEN '0-500$'
          WHEN ABS(tp - entry) < 1000 THEN '500-1000$'
          WHEN ABS(tp - entry) < 1500 THEN '1000-1500$'
          WHEN ABS(tp - entry) < 2000 THEN '1500-2000$'
          WHEN ABS(tp - entry) < 3000 THEN '2000-3000$'
          ELSE '3000$+'
        END AS bucket,
        CASE
          WHEN ABS(tp - entry) < 500  THEN 1
          WHEN ABS(tp - entry) < 1000 THEN 2
          WHEN ABS(tp - entry) < 1500 THEN 3
          WHEN ABS(tp - entry) < 2000 THEN 4
          WHEN ABS(tp - entry) < 3000 THEN 5
          ELSE 6
        END AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate,
        ROUND(AVG(SPLIT_PART(rr, ':', 2)::numeric), 2) AS avg_r,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
        ROUND(AVG(ABS(tp - entry)), 0) AS avg_dist
      FROM btc_analysis
      ${base} entry IS NOT NULL AND tp IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `, params),

    // SL mesafe bucket'ları
    pool.query(`
      SELECT
        CASE
          WHEN ABS(sl - entry) < 300  THEN '0-300$'
          WHEN ABS(sl - entry) < 500  THEN '300-500$'
          WHEN ABS(sl - entry) < 700  THEN '500-700$'
          WHEN ABS(sl - entry) < 1000 THEN '700-1000$'
          ELSE '1000$+'
        END AS bucket,
        CASE
          WHEN ABS(sl - entry) < 300  THEN 1
          WHEN ABS(sl - entry) < 500  THEN 2
          WHEN ABS(sl - entry) < 700  THEN 3
          WHEN ABS(sl - entry) < 1000 THEN 4
          ELSE 5
        END AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate,
        ROUND(AVG(SPLIT_PART(rr, ':', 2)::numeric), 2) AS avg_r,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
        ROUND(AVG(ABS(sl - entry)), 0) AS avg_dist
      FROM btc_analysis
      ${base} entry IS NOT NULL AND sl IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `, params),
  ])

  return NextResponse.json({ tp_buckets: tpRows.rows, sl_buckets: slRows.rows })
}
