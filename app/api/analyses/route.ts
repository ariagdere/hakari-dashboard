import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const direction = searchParams.get('direction')
  const result = searchParams.get('result')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit

  let where = 'WHERE 1=1'
  const params: (string | number)[] = []
  let i = 1

  if (direction && direction !== 'ALL') {
    where += ` AND direction = $${i++}`
    params.push(direction)
  }
  if (result && result !== 'ALL') {
    where += ` AND sim_result = $${i++}`
    params.push(result)
  }

  const query = `
    SELECT
      id, analyzed_at, direction, order_type,
      entry, tp, sl, rr,
      market_score_value, confidence_value,
      sim_result, sim_pnl_usd, sim_entry_to_result_minutes,
      risk_usd, position_size_btc
    FROM btc_analysis
    ${where}
    ORDER BY analyzed_at DESC
    LIMIT $${i++} OFFSET $${i++}
  `
  params.push(limit, offset)

  const countQuery = `SELECT COUNT(*) FROM btc_analysis ${where}`
  const countParams = params.slice(0, params.length - 2)

  const [rows, countResult] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, countParams),
  ])

  return NextResponse.json({
    analyses: rows.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
  })
}
