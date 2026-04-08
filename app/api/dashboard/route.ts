import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [statsResult, rSeriesResult, activeTradesResult] = await Promise.all([
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
        ROUND(AVG(market_score_value), 1) AS avg_score,
        ROUND(AVG(rsi_4h), 1) AS avg_rsi_4h,
        ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS avg_r_tp,
        ROUND(MAX(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS max_r_tp,
        ROUND(MIN(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS min_r_tp,
        ROUND(AVG(rsi_4h) FILTER (WHERE sim_result = 'TP_HIT'), 1) AS avg_rsi_tp,
        ROUND(AVG(confidence_value) FILTER (WHERE sim_result = 'TP_HIT'), 1) AS avg_conf_tp,
        ROUND(AVG(market_score_value) FILTER (WHERE sim_result = 'TP_HIT'), 1) AS avg_score_tp,
        ROUND(AVG(sim_entry_to_result_minutes) FILTER (WHERE sim_result = 'TP_HIT'), 0) AS avg_mins_tp,
        ROUND(AVG(CAST(SPLIT_PART(rr, ':', 2) AS NUMERIC)) FILTER (WHERE sim_result = 'SL_HIT'), 2) AS avg_r_sl,
        ROUND(MAX(CAST(SPLIT_PART(rr, ':', 2) AS NUMERIC)) FILTER (WHERE sim_result = 'SL_HIT'), 2) AS max_r_sl,
        ROUND(MIN(CAST(SPLIT_PART(rr, ':', 2) AS NUMERIC)) FILTER (WHERE sim_result = 'SL_HIT'), 2) AS min_r_sl,
        ROUND(AVG(rsi_4h) FILTER (WHERE sim_result = 'SL_HIT'), 1) AS avg_rsi_sl,
        ROUND(AVG(confidence_value) FILTER (WHERE sim_result = 'SL_HIT'), 1) AS avg_conf_sl,
        ROUND(AVG(market_score_value) FILTER (WHERE sim_result = 'SL_HIT'), 1) AS avg_score_sl,
        ROUND(AVG(sim_entry_to_result_minutes) FILTER (WHERE sim_result = 'SL_HIT'), 0) AS avg_mins_sl
      FROM btc_analysis
    `),
    pool.query(`
      SELECT analyzed_at, sim_r_multiple, sim_result
      FROM btc_analysis
      WHERE sim_result IN ('TP_HIT', 'SL_HIT')
        AND sim_r_multiple IS NOT NULL
      ORDER BY analyzed_at ASC
    `),
    pool.query(`
      SELECT sim_entry_triggered_at, sim_result_at
      FROM btc_analysis
      WHERE sim_entry_triggered_at IS NOT NULL
        AND sim_result IN ('TP_HIT', 'SL_HIT')
        AND sim_result_at IS NOT NULL
      ORDER BY sim_entry_triggered_at ASC
    `),
  ])

  const stats = statsResult.rows[0]

  const rSeries = rSeriesResult.rows.map((r: any) => ({
    date: r.analyzed_at,
    r: r.sim_result === 'SL_HIT' ? -Math.abs(parseFloat(r.sim_r_multiple)) : Math.abs(parseFloat(r.sim_r_multiple)),
  }))

  // Günlük aktif trade: her trade entry→result aralığındaki tüm günlere +1
  const dayCountMap: Record<string, number> = {}

  for (const row of activeTradesResult.rows) {
    const cur = new Date(row.sim_entry_triggered_at)
    cur.setHours(0, 0, 0, 0)
    const endDay = new Date(row.sim_result_at)
    endDay.setHours(0, 0, 0, 0)

    while (cur <= endDay) {
      const key = cur.toISOString().slice(0, 10)
      dayCountMap[key] = (dayCountMap[key] || 0) + 1
      cur.setDate(cur.getDate() + 1)
    }
  }

  const activeTradeSeries = Object.entries(dayCountMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return NextResponse.json({ ...stats, r_series: rSeries, active_trade_series: activeTradeSeries })
}
