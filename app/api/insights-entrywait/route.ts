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
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 15  THEN '0-15dk'
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 30  THEN '15-30dk'
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 60  THEN '30-60dk'
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 120 THEN '1-2sa'
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 240 THEN '2-4sa'
        ELSE '4sa+'
      END AS bucket,
      CASE
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 15  THEN 1
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 30  THEN 2
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 60  THEN 3
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 120 THEN 4
        WHEN EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60 < 240 THEN 5
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
      ROUND(AVG(EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60), 0) AS avg_wait_mins
    FROM btc_analysis
    ${base} sim_entry_triggered_at IS NOT NULL
      AND analyzed_at IS NOT NULL
      AND sim_result IN ('TP_HIT','SL_HIT')
    GROUP BY bucket, sort_order
    ORDER BY sort_order
  `, params)

  return NextResponse.json({ buckets: rows })
}
