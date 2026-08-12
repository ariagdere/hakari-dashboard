import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

// ZLEMA Ribbon w/ Kalman — 4H zone kalibrasyon tablosu.
// ?view=ai (varsayılan) -> direction/sim_result/sim_r_multiple bazlı
// ?view=naive           -> naive_direction/sim_result_naive/naive_sim_r_multiple bazlı
// ?view=pullback        -> naive_direction (paylaşılan yön) / sim_result_pullback/pullback_sim_r_multiple bazlı

export async function GET(req: NextRequest) {
  const v = req.nextUrl.searchParams.get('view')
  const view = v === 'naive' ? 'naive' : v === 'pullback' ? 'pullback' : 'ai'
  const { where, params } = buildInsightsWhere(req, view)
  const base = where ? `${where} AND` : 'WHERE'

  const dirCol    = view === 'ai' ? 'direction' : 'naive_direction'
  const resultCol = view === 'ai' ? 'sim_result' : view === 'naive' ? 'sim_result_naive' : 'sim_result_pullback'
  const rCol      = view === 'ai' ? 'sim_r_multiple' : view === 'naive' ? 'naive_sim_r_multiple' : 'pullback_sim_r_multiple'

  const { rows } = await pool.query(`
    SELECT
      zlema_zone_4h AS zone,
      COUNT(*) FILTER (WHERE ${resultCol} IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE ${resultCol} = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE ${resultCol} = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE ${resultCol} IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate,
      ROUND(SUM(${rCol}) FILTER (WHERE ${resultCol} IN ('TP_HIT','SL_HIT')), 2) AS total_r,
      COUNT(*) FILTER (WHERE ${dirCol}='LONG' AND ${resultCol} IN ('TP_HIT','SL_HIT')) AS long_total,
      COUNT(*) FILTER (WHERE ${dirCol}='LONG' AND ${resultCol} = 'TP_HIT') AS long_wins,
      ROUND(COUNT(*) FILTER (WHERE ${dirCol}='LONG' AND ${resultCol} = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE ${dirCol}='LONG' AND ${resultCol} IN ('TP_HIT','SL_HIT')), 0), 1) AS long_win_rate,
      ROUND(SUM(${rCol}) FILTER (WHERE ${dirCol}='LONG' AND ${resultCol} IN ('TP_HIT','SL_HIT')), 2) AS long_total_r,
      COUNT(*) FILTER (WHERE ${dirCol}='SHORT' AND ${resultCol} IN ('TP_HIT','SL_HIT')) AS short_total,
      COUNT(*) FILTER (WHERE ${dirCol}='SHORT' AND ${resultCol} = 'TP_HIT') AS short_wins,
      ROUND(COUNT(*) FILTER (WHERE ${dirCol}='SHORT' AND ${resultCol} = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE ${dirCol}='SHORT' AND ${resultCol} IN ('TP_HIT','SL_HIT')), 0), 1) AS short_win_rate,
      ROUND(SUM(${rCol}) FILTER (WHERE ${dirCol}='SHORT' AND ${resultCol} IN ('TP_HIT','SL_HIT')), 2) AS short_total_r
    FROM btc_analysis
    ${base} zlema_zone_4h IS NOT NULL
      AND ${resultCol} IN ('TP_HIT','SL_HIT')
    GROUP BY zone
    ORDER BY zone
  `, params)

  return NextResponse.json({ zones: rows })
}
