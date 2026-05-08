import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

const DELTAS = [
  { key: 'h1_ls_ratio',  label: 'H1 L/S Ratio',  start: 'h1_ls_ratio_start',  current: 'h1_ls_ratio_current',  bins: [-1.5, -0.5, -0.2, 0, 0.2, 0.5, 1.5] },
  { key: 'h1_oi',        label: 'H1 OI (BTC)',    start: 'h1_oi_start',        current: 'h1_oi_current',        bins: [-10000, -3000, -1000, 0, 1000, 3000, 10000] },
  { key: 'h1_oi_mcap',   label: 'H1 OI/MCap',     start: 'h1_oi_mcap_start',   current: 'h1_oi_mcap_current',   bins: [-0.02, -0.01, -0.005, 0, 0.005, 0.01, 0.02] },
  { key: 'm5_ls_ratio',  label: 'M5 L/S Ratio',   start: 'm5_ls_ratio_start',  current: 'm5_ls_ratio_current',  bins: [-1.5, -0.5, -0.2, 0, 0.2, 0.5, 1.5] },
  { key: 'm5_oi',        label: 'M5 OI (BTC)',     start: 'm5_oi_start',        current: 'm5_oi_current',        bins: [-10000, -3000, -1000, 0, 1000, 3000, 10000] },
]

function buildBucketCase(delta_expr: string, bins: number[]): string {
  const cases = []
  for (let i = 0; i < bins.length - 1; i++) {
    const lo = bins[i]; const hi = bins[i + 1]
    const label = `${lo > 0 ? '+' : ''}${lo} ~ ${hi > 0 ? '+' : ''}${hi}`
    cases.push(`WHEN ${delta_expr} >= ${lo} AND ${delta_expr} < ${hi} THEN '${label}'`)
  }
  cases.push(`ELSE '${bins[bins.length-1] > 0 ? '+' : ''}${bins[bins.length-1]}+'`)
  const sortCases = []
  for (let i = 0; i < bins.length - 1; i++) {
    const lo = bins[i]; const hi = bins[i + 1]
    sortCases.push(`WHEN ${delta_expr} >= ${lo} AND ${delta_expr} < ${hi} THEN ${i + 1}`)
  }
  sortCases.push(`ELSE ${bins.length}`)
  return `CASE ${cases.join(' ')} END`
}

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const results: Record<string, any[]> = {}

  await Promise.all(DELTAS.map(async ({ key, label, start, current, bins }) => {
    const delta_expr = `(${current} - ${start})`
    const bucket_case = buildBucketCase(delta_expr, bins)
    const sort_cases = bins.map((b, i) => i < bins.length - 1
      ? `WHEN ${delta_expr} >= ${bins[i]} AND ${delta_expr} < ${bins[i+1]} THEN ${i+1}`
      : ''
    ).filter(Boolean).join(' ') + ` ELSE ${bins.length}`

    const { rows } = await pool.query(`
      SELECT
        ${bucket_case} AS bucket,
        CASE ${sort_cases} END AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate,
        ROUND(AVG(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS avg_r,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
        ROUND(AVG(${delta_expr}), 4) AS avg_delta
      FROM btc_analysis
      ${base} ${current} IS NOT NULL AND ${start} IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `, params)

    results[key] = rows.map(r => ({ ...r, label }))
  }))

  return NextResponse.json(results)
}
