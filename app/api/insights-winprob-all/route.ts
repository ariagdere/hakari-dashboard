import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

const bucketCase = (col: string) => `
  CASE
    WHEN ${col} < 20 THEN 1
    WHEN ${col} < 30 THEN 2
    WHEN ${col} < 40 THEN 3
    WHEN ${col} < 50 THEN 4
    WHEN ${col} < 60 THEN 5
    WHEN ${col} < 70 THEN 6
    ELSE 7
  END
`
const bucketLabel = (col: string) => `
  CASE
    WHEN ${col} < 20 THEN '0-20%'
    WHEN ${col} < 30 THEN '20-30%'
    WHEN ${col} < 40 THEN '30-40%'
    WHEN ${col} < 50 THEN '40-50%'
    WHEN ${col} < 60 THEN '50-60%'
    WHEN ${col} < 70 THEN '60-70%'
    ELSE '70%+'
  END
`

const MODELS = [
  { key: 'v1',          col: 'win_probability' },
  { key: 'v1_1304',     col: 'win_probability_1304' },
  { key: 'v1_rev',      col: 'win_probability_reverse' },
  { key: 'v1_1304_rev', col: 'win_probability_1304_reverse' },
  { key: 'v3',          col: 'win_probability_v3' },
  { key: 'v3_1304',     col: 'win_probability_v3_1304' },
  { key: 'v3_rev',      col: 'win_probability_v3_reverse' },
  { key: 'v3_1304_rev', col: 'win_probability_v3_1304_reverse' },
  { key: 'v4',          col: 'win_probability_v4' },
  { key: 'v4_1304',     col: 'win_probability_v4_1304' },
  { key: 'v4_rev',      col: 'win_probability_v4_reverse' },
  { key: 'v4_1304_rev', col: 'win_probability_v4_1304_reverse' },
  { key: 'v5',          col: 'win_probability_v5' },
  { key: 'v5_1304',     col: 'win_probability_v5_1304' },
  { key: 'v5_rev',      col: 'win_probability_v5_reverse' },
  { key: 'v5_1304_rev', col: 'win_probability_v5_1304_reverse' },
]

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  // Her model için ayrı sorgu — bucket bazında win rate
  const results: Record<string, any[]> = {}

  await Promise.all(MODELS.map(async ({ key, col }) => {
    const { rows } = await pool.query(`
      SELECT
        ${bucketLabel(col)} AS bucket,
        ${bucketCase(col)} AS sort_order,
        ROUND(AVG(${col}), 1) AS avg_predicted,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS win_rate,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r
      FROM btc_analysis
      ${base} ${col} IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `, params)
    results[key] = rows
  }))

  return NextResponse.json(results)
}
