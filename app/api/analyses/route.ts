import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

// Evrensel analiz listesi — hem AI hem Naif alanlarını tek satırda döner.
// Hem /analysis (AI sekmesi) hem /analysis/naive (Naif sekmesi) bu route'u
// paylaşır — liste ikisinde de aynı, sadece üst özet kartları farklı.
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
      id, analyzed_at,
      -- AI
      direction, entry, tp, sl, rr,
      rsi_4h, rsi_30m,
      sim_result, sim_pnl_usd, sim_r_multiple,
      win_probability_v6, win_probability_v6_reverse,
      win_probability_c75, win_probability_c75_reverse,
      zlema_zone_4h,
      -- NAİF
      naive_direction, naive_entry, naive_tp, naive_sl, naive_rr,
      naive_dist_ratio,
      sim_result_naive, naive_sim_r_multiple
    FROM btc_analysis
    ${w}
    ORDER BY analyzed_at DESC
    LIMIT $${i} OFFSET $${i + 1}
  `
  const countQuery = `SELECT COUNT(*) FROM btc_analysis ${w}`
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
