import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const { rows } = await pool.query(`
    SELECT
      DATE(analyzed_at AT TIME ZONE 'UTC') AS day,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
      COUNT(*) FILTER (WHERE sim_result = 'SL_HIT') AS sl_count,
      COUNT(*) FILTER (WHERE sim_result = 'EXPIRED') AS expired_count,
      COUNT(*) FILTER (WHERE sim_result IS NULL OR sim_result = 'NO_ENTRY') AS other_count,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate
    FROM btc_analysis
    ${base} analyzed_at IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `, params)

  return NextResponse.json({ daily: rows })
}
