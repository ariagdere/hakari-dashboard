import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const w = where || 'WHERE 1=1'

  const q = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE sim_result IS NOT NULL AND sim_result != 'NO_ENTRY') AS total,
      COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT','EXPIRED')) AS total_all,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
      COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
      COUNT(*) FILTER (WHERE sim_result = 'EXPIRED') AS expired_count,
      COUNT(*) FILTER (WHERE sim_result = 'NO_ENTRY') AS no_entry_count,
      COUNT(*) FILTER (WHERE sim_result IS NULL) AS pending_count,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate,
      ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS avg_r_win,
      ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result = 'SL_HIT'), 2) AS avg_r_loss,
      ROUND(AVG(sim_entry_to_result_minutes) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0) AS avg_duration_mins,
      ROUND(SUM(sim_pnl_usd) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_pnl,
      COUNT(*) FILTER (WHERE sequential_trade = 'TRADE' AND sim_result IN ('TP_HIT','SL_HIT')) AS seq_total,
      ROUND(
        COUNT(*) FILTER (WHERE sequential_trade = 'TRADE' AND sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sequential_trade = 'TRADE' AND sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS seq_win_rate,
      COUNT(*) FILTER (WHERE direction = 'LONG' AND sim_result IN ('TP_HIT','SL_HIT')) AS long_total,
      ROUND(
        COUNT(*) FILTER (WHERE direction = 'LONG' AND sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE direction = 'LONG' AND sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS long_win_rate,
      COUNT(*) FILTER (WHERE direction = 'SHORT' AND sim_result IN ('TP_HIT','SL_HIT')) AS short_total,
      ROUND(
        COUNT(*) FILTER (WHERE direction = 'SHORT' AND sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE direction = 'SHORT' AND sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS short_win_rate
    FROM btc_analysis
    ${w}
  `, params)

  return NextResponse.json(q.rows[0])
}
