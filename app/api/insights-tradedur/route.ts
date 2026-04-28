import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN sim_entry_to_result_minutes < 60   THEN '0-1sa'
        WHEN sim_entry_to_result_minutes < 240  THEN '1-4sa'
        WHEN sim_entry_to_result_minutes < 720  THEN '4-12sa'
        WHEN sim_entry_to_result_minutes < 1440 THEN '12-24sa'
        WHEN sim_entry_to_result_minutes < 4320 THEN '1-3gün'
        ELSE '3gün+'
      END AS bucket,
      CASE
        WHEN sim_entry_to_result_minutes < 60   THEN 1
        WHEN sim_entry_to_result_minutes < 240  THEN 2
        WHEN sim_entry_to_result_minutes < 720  THEN 3
        WHEN sim_entry_to_result_minutes < 1440 THEN 4
        WHEN sim_entry_to_result_minutes < 4320 THEN 5
        ELSE 6
      END AS sort_order,
      COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate,
      ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS avg_r,
      ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
      ROUND(AVG(sim_entry_to_result_minutes), 0) AS avg_dur_mins
    FROM btc_analysis
    ${base} sim_entry_to_result_minutes IS NOT NULL
      AND sim_result IN ('TP_HIT','SL_HIT')
    GROUP BY bucket, sort_order
    ORDER BY sort_order
  `, params)

  return NextResponse.json({ buckets: rows })
}
