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

  // direction ve result filtreleri hem analyses hem insightsFilter'da var
  // insightsFilter zaten bunları işliyor, tekrar eklemeye gerek yok

  const dataParams = [...params, limit, offset]
  const i = params.length + 1

  const query = `
    SELECT
      id, analyzed_at, direction, order_type,
      entry, tp, sl, rr,
      market_score_value, confidence_value, rsi_4h, rsi_30m,
      sim_result, sim_pnl_usd, sim_entry_to_result_minutes,
      sim_r_multiple,
      win_probability,
      win_probability_v3,
      win_probability_v4,
      win_probability_v5,
      win_probability_reverse,
      win_probability_v3_reverse,
      win_probability_v4_reverse,
      win_probability_v5_reverse,
      risk_usd, position_size_btc
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
