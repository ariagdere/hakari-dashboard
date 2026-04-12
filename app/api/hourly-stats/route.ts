import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { rows } = await pool.query(`
    SELECT
      EXTRACT(HOUR FROM sim_entry_triggered_at AT TIME ZONE 'Europe/Istanbul') AS hour,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
      COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT', 'SL_HIT')), 0)
      , 1) AS win_rate
    FROM btc_analysis
    WHERE sim_entry_triggered_at IS NOT NULL
      AND sim_result IN ('TP_HIT', 'SL_HIT')
    GROUP BY hour
    ORDER BY hour ASC
  `)

  const hourMap: Record<number, any> = {}
  for (const row of rows) {
    hourMap[parseInt(row.hour)] = row
  }

  const result = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    total: parseInt(hourMap[h]?.total ?? 0),
    tp_count: parseInt(hourMap[h]?.tp_count ?? 0),
    sl_count: parseInt(hourMap[h]?.sl_count ?? 0),
    win_rate: parseFloat(hourMap[h]?.win_rate ?? 0),
  }))

  return NextResponse.json(result)
}
