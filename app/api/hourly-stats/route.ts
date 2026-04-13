import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [entryRows, analysisRows] = await Promise.all([
    pool.query(`
      SELECT
        EXTRACT(HOUR FROM sim_entry_triggered_at AT TIME ZONE 'Europe/Istanbul') AS hour,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
        COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT', 'SL_HIT')), 0), 1) AS win_rate,
        ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS avg_r_tp,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_result_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'TP_HIT'), 0) AS total_mins_tp,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'TP_HIT'), 0) AS entry_mins_tp,
        ROUND(AVG(sim_entry_to_result_minutes) FILTER (WHERE sim_result = 'TP_HIT'), 0) AS close_mins_tp,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_result_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'SL_HIT'), 0) AS total_mins_sl,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'SL_HIT'), 0) AS entry_mins_sl,
        ROUND(AVG(sim_entry_to_result_minutes) FILTER (WHERE sim_result = 'SL_HIT'), 0) AS close_mins_sl
      FROM btc_analysis
      WHERE sim_entry_triggered_at IS NOT NULL
        AND sim_result IN ('TP_HIT', 'SL_HIT')
      GROUP BY hour ORDER BY hour ASC
    `),
    pool.query(`
      SELECT
        EXTRACT(HOUR FROM analyzed_at AT TIME ZONE 'Europe/Istanbul') AS hour,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
        COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT', 'SL_HIT')), 0), 1) AS win_rate,
        ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result = 'TP_HIT'), 2) AS avg_r_tp,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_result_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'TP_HIT'), 0) AS total_mins_tp,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'TP_HIT'), 0) AS entry_mins_tp,
        ROUND(AVG(sim_entry_to_result_minutes) FILTER (WHERE sim_result = 'TP_HIT'), 0) AS close_mins_tp,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_result_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'SL_HIT'), 0) AS total_mins_sl,
        ROUND(AVG(EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60) FILTER (WHERE sim_result = 'SL_HIT'), 0) AS entry_mins_sl,
        ROUND(AVG(sim_entry_to_result_minutes) FILTER (WHERE sim_result = 'SL_HIT'), 0) AS close_mins_sl
      FROM btc_analysis
      WHERE analyzed_at IS NOT NULL
        AND sim_result IN ('TP_HIT', 'SL_HIT')
      GROUP BY hour ORDER BY hour ASC
    `),
  ])

  const fmtMins = (m: any): string | null => {
    if (m == null) return null
    const n = Math.round(parseFloat(m))
    if (!n) return null
    const h = Math.floor(n / 60), min = n % 60
    return h > 0 ? `${h}s ${min}dk` : `${min}dk`
  }

  const toSeries = (rows: any[]) => {
    const map: Record<number, any> = {}
    for (const row of rows) map[parseInt(row.hour)] = row
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      total: parseInt(map[h]?.total ?? 0),
      tp_count: parseInt(map[h]?.tp_count ?? 0),
      sl_count: parseInt(map[h]?.sl_count ?? 0),
      win_rate: parseFloat(map[h]?.win_rate ?? 0),
      avg_r_tp: map[h]?.avg_r_tp != null ? parseFloat(map[h].avg_r_tp) : null,
      total_mins_tp: fmtMins(map[h]?.total_mins_tp),
      entry_mins_tp: fmtMins(map[h]?.entry_mins_tp),
      close_mins_tp: fmtMins(map[h]?.close_mins_tp),
      total_mins_sl: fmtMins(map[h]?.total_mins_sl),
      entry_mins_sl: fmtMins(map[h]?.entry_mins_sl),
      close_mins_sl: fmtMins(map[h]?.close_mins_sl),
    }))
  }

  return NextResponse.json({
    by_entry: toSeries(entryRows.rows),
    by_analysis: toSeries(analysisRows.rows),
  })
}
