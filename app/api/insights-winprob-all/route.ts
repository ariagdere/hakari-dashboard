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

const LIQ_BUCKET = `
  CASE
    WHEN cluster_liq_ratio < 0.3  THEN '1_dn_very_dominant'
    WHEN cluster_liq_ratio < 0.7  THEN '2_dn_dominant'
    WHEN cluster_liq_ratio < 0.9  THEN '3_dn_slight'
    WHEN cluster_liq_ratio < 1.1  THEN '4_neutral'
    WHEN cluster_liq_ratio < 1.5  THEN '5_up_slight'
    WHEN cluster_liq_ratio < 3.0  THEN '6_up_dominant'
    ELSE '7_up_very_dominant'
  END
`

const MODELS = [
  { key: 'v6',      col: 'win_probability_v6',         rev: false },
  { key: 'v6_rev',  col: 'win_probability_v6_reverse',  rev: true  },
]

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const results: Record<string, any[]> = {}

  function calcMaxDD(rValues: number[]): number {
    let cum = 0, peak = 0, maxDD = 0
    for (const r of rValues) {
      cum += r
      if (cum > peak) peak = cum
      const dd = cum - peak
      if (dd < maxDD) maxDD = dd
    }
    return parseFloat(maxDD.toFixed(2))
  }

  // WP kalibrasyon tablosu
  await Promise.all(MODELS.map(async ({ key, col, rev }) => {
    const dirCorrect = rev
      ? `COUNT(*) FILTER (WHERE sim_direction IS NOT NULL AND sim_direction != 'FLAT' AND sim_direction != direction)`
      : `COUNT(*) FILTER (WHERE sim_direction = direction)`

    // Bucket bazında aggregate
    const { rows } = await pool.query(`
      SELECT
        ${bucketLabel(col)} AS bucket,
        ${bucketCase(col)}  AS sort_order,
        ROUND(AVG(${col}), 1) AS avg_predicted,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS win_rate,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
        ROUND(
          ${dirCorrect} * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_direction IS NOT NULL), 0), 1
        ) AS dir_accuracy
      FROM btc_analysis
      ${base} ${col} IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `, params)

    // Her bucket için max DD hesapla
    const { rows: rRows } = await pool.query(`
      SELECT
        ${bucketLabel(col)} AS bucket,
        sim_r_multiple,
        analyzed_at
      FROM btc_analysis
      ${base} ${col} IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
        AND sim_r_multiple IS NOT NULL
      ORDER BY bucket, analyzed_at ASC
    `, params)

    const bucketRMap: Record<string, number[]> = {}
    for (const r of rRows) {
      if (!bucketRMap[r.bucket]) bucketRMap[r.bucket] = []
      bucketRMap[r.bucket].push(parseFloat(r.sim_r_multiple))
    }

    results[key] = rows.map((row: any) => ({
      ...row,
      max_dd: calcMaxDD(bucketRMap[row.bucket] ?? [])
    }))
  }))

  // Liq zone breakdown — genel, long, short
  const liqRows = await pool.query(`
    SELECT
      ${LIQ_BUCKET} AS liq_bucket,
      COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate,
      ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
      -- LONG
      COUNT(*) FILTER (WHERE direction='LONG' AND sim_result IN ('TP_HIT','SL_HIT')) AS long_total,
      COUNT(*) FILTER (WHERE direction='LONG' AND sim_result = 'TP_HIT') AS long_wins,
      ROUND(COUNT(*) FILTER (WHERE direction='LONG' AND sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE direction='LONG' AND sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS long_win_rate,
      ROUND(SUM(sim_r_multiple) FILTER (WHERE direction='LONG' AND sim_result IN ('TP_HIT','SL_HIT')), 2) AS long_total_r,
      -- SHORT
      COUNT(*) FILTER (WHERE direction='SHORT' AND sim_result IN ('TP_HIT','SL_HIT')) AS short_total,
      COUNT(*) FILTER (WHERE direction='SHORT' AND sim_result = 'TP_HIT') AS short_wins,
      ROUND(COUNT(*) FILTER (WHERE direction='SHORT' AND sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE direction='SHORT' AND sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS short_win_rate,
      ROUND(SUM(sim_r_multiple) FILTER (WHERE direction='SHORT' AND sim_result IN ('TP_HIT','SL_HIT')), 2) AS short_total_r,
      -- up_hit reach >=75 filtreli
      COUNT(*) FILTER (WHERE cluster_up_hit = true AND cluster_up_reach_pct >= 75 AND sim_result IN ('TP_HIT','SL_HIT')) AS up_hit_total,
      COUNT(*) FILTER (WHERE cluster_up_hit = true AND cluster_up_reach_pct >= 75 AND sim_result = 'TP_HIT') AS up_hit_wins,
      ROUND(COUNT(*) FILTER (WHERE cluster_up_hit = true AND cluster_up_reach_pct >= 75 AND sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE cluster_up_hit = true AND cluster_up_reach_pct >= 75 AND sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS up_hit_win_rate,
      -- dn_hit reach >=75 filtreli
      COUNT(*) FILTER (WHERE cluster_dn_hit = true AND cluster_dn_reach_pct >= 75 AND sim_result IN ('TP_HIT','SL_HIT')) AS dn_hit_total,
      COUNT(*) FILTER (WHERE cluster_dn_hit = true AND cluster_dn_reach_pct >= 75 AND sim_result = 'TP_HIT') AS dn_hit_wins,
      ROUND(COUNT(*) FILTER (WHERE cluster_dn_hit = true AND cluster_dn_reach_pct >= 75 AND sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE cluster_dn_hit = true AND cluster_dn_reach_pct >= 75 AND sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS dn_hit_win_rate
    FROM btc_analysis
    ${where || 'WHERE 1=1'} AND cluster_liq_ratio IS NOT NULL
      AND sim_result IN ('TP_HIT','SL_HIT')
    GROUP BY liq_bucket
    ORDER BY liq_bucket
  `, params)

  results['liq_zone'] = liqRows.rows

  return NextResponse.json(results)
}
