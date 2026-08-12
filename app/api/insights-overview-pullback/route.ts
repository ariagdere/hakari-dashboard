import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req, 'pullback')
  const w = where || 'WHERE 1=1'
  const q = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE pullback_direction IS NOT NULL) AS total_all,
      COUNT(*) FILTER (WHERE sim_result_pullback IN ('TP_HIT','SL_HIT','EXPIRED','NO_ENTRY')) AS total,
      COUNT(*) FILTER (WHERE sim_result_pullback = 'TP_HIT') AS tp_count,
      COUNT(*) FILTER (WHERE sim_result_pullback = 'SL_HIT') AS sl_count,
      COUNT(*) FILTER (WHERE sim_result_pullback = 'EXPIRED') AS expired_count,
      COUNT(*) FILTER (WHERE sim_result_pullback = 'NO_ENTRY') AS no_entry_count,
      COUNT(*) FILTER (WHERE pullback_direction IS NOT NULL AND sim_result_pullback IS NULL) AS pending_count,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result_pullback = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result_pullback IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate,
      ROUND(AVG(pullback_sim_r_multiple) FILTER (WHERE sim_result_pullback = 'TP_HIT'), 2) AS avg_r_win,
      ROUND(AVG(pullback_sim_r_multiple) FILTER (WHERE sim_result_pullback = 'SL_HIT'), 2) AS avg_r_loss,
      ROUND(AVG(pullback_duration_mins) FILTER (WHERE sim_result_pullback IN ('TP_HIT','SL_HIT')), 0) AS avg_duration_mins,
      ROUND(AVG(pullback_wait_mins) FILTER (WHERE sim_result_pullback IN ('TP_HIT','SL_HIT','EXPIRED')), 0) AS avg_wait_mins,
      ROUND(SUM(pullback_sim_r_multiple) FILTER (WHERE sim_result_pullback IN ('TP_HIT','SL_HIT')), 2) AS total_r,
      COUNT(*) FILTER (WHERE pullback_direction = 'LONG') AS long_total,
      ROUND(
        COUNT(*) FILTER (WHERE pullback_direction = 'LONG' AND sim_result_pullback = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE pullback_direction = 'LONG' AND sim_result_pullback IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS long_win_rate,
      COUNT(*) FILTER (WHERE pullback_direction = 'LONG' AND sim_result_pullback = 'TP_HIT') AS long_tp,
      COUNT(*) FILTER (WHERE pullback_direction = 'LONG' AND sim_result_pullback = 'SL_HIT') AS long_sl,
      ROUND(SUM(pullback_sim_r_multiple) FILTER (WHERE pullback_direction = 'LONG' AND sim_result_pullback IN ('TP_HIT','SL_HIT')), 2) AS long_total_r,
      COUNT(*) FILTER (WHERE pullback_direction = 'SHORT') AS short_total,
      ROUND(
        COUNT(*) FILTER (WHERE pullback_direction = 'SHORT' AND sim_result_pullback = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE pullback_direction = 'SHORT' AND sim_result_pullback IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS short_win_rate,
      COUNT(*) FILTER (WHERE pullback_direction = 'SHORT' AND sim_result_pullback = 'TP_HIT') AS short_tp,
      COUNT(*) FILTER (WHERE pullback_direction = 'SHORT' AND sim_result_pullback = 'SL_HIT') AS short_sl,
      ROUND(SUM(pullback_sim_r_multiple) FILTER (WHERE pullback_direction = 'SHORT' AND sim_result_pullback IN ('TP_HIT','SL_HIT')), 2) AS short_total_r
    FROM btc_analysis
    ${w}
  `, params)
  return NextResponse.json(q.rows[0])
}
