import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  const result = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
      COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
      COUNT(*) FILTER (WHERE sim_result = 'EXPIRED') AS expired_count,
      COUNT(*) FILTER (WHERE sim_result = 'NO_ENTRY') AS no_entry_count,
      COUNT(*) FILTER (WHERE sim_result IS NULL) AS pending_count,
      ROUND(AVG(sim_pnl_usd) FILTER (WHERE sim_result IS NOT NULL AND sim_result != 'NO_ENTRY'), 2) AS avg_pnl,
      ROUND(SUM(sim_pnl_usd) FILTER (WHERE sim_result IS NOT NULL), 2) AS total_pnl,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0)
      , 1) AS win_rate,
      COUNT(*) FILTER (WHERE direction = 'SHORT') AS short_count,
      COUNT(*) FILTER (WHERE direction = 'LONG') AS long_count,
      ROUND(AVG(confidence_value), 1) AS avg_confidence,
      ROUND(AVG(market_score_value), 1) AS avg_score
    FROM btc_analysis
  `)
  return NextResponse.json(result.rows[0])
}
