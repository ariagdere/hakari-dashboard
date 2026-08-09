import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page  = parseInt(searchParams.get('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit
  const { where, params } = buildInsightsWhere(request)
  const w = where || 'WHERE 1=1'
  const dataParams = [...params, limit, offset]
  const i = params.length + 1
  const query = `
    SELECT
      id, analyzed_at, naive_direction AS direction,
      naive_entry AS entry, naive_tp AS tp, naive_sl AS sl, naive_rr AS rr,
      rsi_4h, rsi_30m,
      sim_result_naive AS sim_result,
      naive_sim_r_multiple AS sim_r_multiple,
      naive_duration_mins AS sim_entry_to_result_minutes,
      naive_dist_ratio, naive_pos_size,
      win_probability_v6,
      win_probability_v6_reverse,
      cluster_liq_ratio,
      cluster_up_hit, cluster_dn_hit,
      cluster_up_reach_pct, cluster_dn_reach_pct,
      cluster_up_dist_pct, cluster_dn_dist_pct,
      cluster_first_closer
    FROM btc_analysis
    ${w}
    AND naive_direction IS NOT NULL
    ORDER BY analyzed_at DESC
    LIMIT $${i} OFFSET $${i + 1}
  `
  const countQuery = `SELECT COUNT(*) FROM btc_analysis ${w} AND naive_direction IS NOT NULL`
  const [rows, countResult] = await Promise.all([
    pool.query(query, dataParams),
    pool.query(countQuery, params),
  ])
  return NextResponse.json({
    analyses:   rows.rows,
    total:      parseInt(countResult.rows[0].count),
    page,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
  })
}
