import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

// insights-tradedur'un naif paraleli — naive_duration_mins / sim_result_naive /
// naive_rr bazlı (naive_rr zaten numeric, AI'daki gibi SPLIT_PART gerekmiyor).

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req, 'naive')
  const base = where ? `${where} AND` : 'WHERE'

  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN naive_duration_mins < 60   THEN '0-1sa'
        WHEN naive_duration_mins < 240  THEN '1-4sa'
        WHEN naive_duration_mins < 720  THEN '4-12sa'
        WHEN naive_duration_mins < 1440 THEN '12-24sa'
        WHEN naive_duration_mins < 2880 THEN '24-48sa'
        WHEN naive_duration_mins < 4320 THEN '48-72sa'
        ELSE '72sa+'
      END AS bucket,
      CASE
        WHEN naive_duration_mins < 60   THEN 1
        WHEN naive_duration_mins < 240  THEN 2
        WHEN naive_duration_mins < 720  THEN 3
        WHEN naive_duration_mins < 1440 THEN 4
        WHEN naive_duration_mins < 2880 THEN 5
        WHEN naive_duration_mins < 4320 THEN 6
        ELSE 7
      END AS sort_order,
      COUNT(*) FILTER (WHERE sim_result_naive IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result_naive = 'TP_HIT') AS wins,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result_naive = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result_naive IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate,
      ROUND(AVG(naive_rr), 2) AS avg_r,
      ROUND(SUM(naive_sim_r_multiple) FILTER (WHERE sim_result_naive IN ('TP_HIT','SL_HIT')), 2) AS total_r,
      ROUND(AVG(naive_duration_mins), 0) AS avg_dur_mins
    FROM btc_analysis
    ${base} naive_duration_mins IS NOT NULL
      AND sim_result_naive IN ('TP_HIT','SL_HIT')
    GROUP BY bucket, sort_order
    ORDER BY sort_order
  `, params)

  return NextResponse.json({ buckets: rows })
}
