import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [statsResult, rSeriesResult] = await Promise.all([
    pool.query(`
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
    `),
    pool.query(`
      SELECT analyzed_at, sim_r_multiple, sim_result
      FROM btc_analysis
      WHERE sim_result IN ('TP_HIT', 'SL_HIT')
        AND sim_r_multiple IS NOT NULL
      ORDER BY analyzed_at ASC
    `),
  ])

  const stats = statsResult.rows[0]
  const rSeries = rSeriesResult.rows.map(r => ({
    date: r.analyzed_at,
    r: r.sim_result === 'SL_HIT' ? -Math.abs(parseFloat(r.sim_r_multiple)) : Math.abs(parseFloat(r.sim_r_multiple)),
  }))

  return NextResponse.json({ ...stats, r_series: rSeries })
}
