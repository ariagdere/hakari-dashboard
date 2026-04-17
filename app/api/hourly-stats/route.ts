import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const [entryRows, analysisRows] = await Promise.all([
    pool.query(`
      SELECT
        EXTRACT(HOUR FROM sim_entry_triggered_at AT TIME ZONE 'Europe/Istanbul') AS hour,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
        COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT', 'SL_HIT')), 0), 1) AS win_rate,
        ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS avg_r_tp
      FROM btc_analysis
      ${base} sim_entry_triggered_at IS NOT NULL
        AND sim_result IN ('TP_HIT', 'SL_HIT')
      GROUP BY hour ORDER BY hour ASC
    `, params),
    pool.query(`
      SELECT
        EXTRACT(HOUR FROM analyzed_at AT TIME ZONE 'Europe/Istanbul') AS hour,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
        COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT', 'SL_HIT')), 0), 1) AS win_rate,
        ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS avg_r_tp
      FROM btc_analysis
      ${base} analyzed_at IS NOT NULL
        AND sim_result IN ('TP_HIT', 'SL_HIT')
      GROUP BY hour ORDER BY hour ASC
    `, params),
  ])

  const toSeries = (rows: any[]) => {
    const map: Record<number, any> = {}
    for (const row of rows) map[parseInt(row.hour)] = row
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      total:    parseInt(map[h]?.total    ?? 0),
      tp_count: parseInt(map[h]?.tp_count ?? 0),
      sl_count: parseInt(map[h]?.sl_count ?? 0),
      win_rate: parseFloat(map[h]?.win_rate ?? 0),
      avg_r_tp: map[h]?.avg_r_tp != null ? parseFloat(map[h].avg_r_tp) : null,
    }))
  }

  return NextResponse.json({
    by_entry:    toSeries(entryRows.rows),
    by_analysis: toSeries(analysisRows.rows),
  })
}
