import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const andOrWhere = where ? `${where} AND` : 'WHERE'

  const byDayQ = `
    SELECT
      EXTRACT(DOW FROM analyzed_at AT TIME ZONE 'UTC')::int AS dow,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 / NULLIF(COUNT(*), 0), 1) AS win_rate,
      ROUND(SUM(sim_r_multiple)::numeric, 2) AS total_r
    FROM btc_analysis
    ${where}
      ${andOrWhere} sim_result IN ('TP_HIT','SL_HIT')
    GROUP BY 1
    ORDER BY 1
  `

  const byTypeQ = `
    SELECT
      CASE WHEN EXTRACT(DOW FROM analyzed_at AT TIME ZONE 'UTC') IN (0,6)
           THEN 'Weekend' ELSE 'Weekdays' END AS label,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 / NULLIF(COUNT(*), 0), 1) AS win_rate,
      ROUND(SUM(sim_r_multiple)::numeric, 2) AS total_r
    FROM btc_analysis
    ${where}
      ${andOrWhere} sim_result IN ('TP_HIT','SL_HIT')
    GROUP BY 1
    ORDER BY 1
  `

  const [byDay, byType] = await Promise.all([
    pool.query(byDayQ, params),
    pool.query(byTypeQ, params),
  ])

  const DAY_LABELS: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }
  const DAY_ORDER: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }

  return NextResponse.json({
    by_day:  byDay.rows.map(r => ({ ...r, label: DAY_LABELS[Number(r.dow)] ?? String(r.dow) }))
                       .sort((a, b) => DAY_ORDER[Number(a.dow)] - DAY_ORDER[Number(b.dow)]),
    by_type: byType.rows,
  })
}
