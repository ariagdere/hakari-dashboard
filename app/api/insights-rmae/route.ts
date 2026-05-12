import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const [histRows, scatterRows, mfeRows, targetRRows] = await Promise.all([
    pool.query(`
      SELECT
        sim_result,
        ROUND(sim_r_multiple::numeric, 1) AS r_bucket,
        COUNT(*) AS count
      FROM btc_analysis
      ${base} sim_r_multiple IS NOT NULL AND sim_result = 'TP_HIT'
      GROUP BY sim_result, r_bucket ORDER BY r_bucket
    `, params),

    pool.query(`
      SELECT
        id, sim_result,
        ROUND(sim_max_favorable_move::numeric, 2) AS mfe,
        ROUND(sim_max_adverse_move::numeric, 2) AS mae,
        ROUND(sim_r_multiple::numeric, 2) AS r_multiple,
        market_score_value AS score,
        ROUND(risk_usd::numeric, 2) AS risk_usd
      FROM btc_analysis
      ${base} sim_max_favorable_move IS NOT NULL
        AND sim_max_adverse_move IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      ORDER BY analyzed_at DESC LIMIT 200
    `, params),

    pool.query(`
      SELECT
        CASE
          WHEN sim_max_favorable_move < 0.5 THEN '<0.5R'
          WHEN sim_max_favorable_move BETWEEN 0.5 AND 1 THEN '0.5-1R'
          WHEN sim_max_favorable_move BETWEEN 1 AND 2 THEN '1-2R'
          WHEN sim_max_favorable_move BETWEEN 2 AND 3 THEN '2-3R'
          ELSE '>3R'
        END AS mfe_bucket,
        CASE
          WHEN sim_max_favorable_move < 0.5 THEN 1
          WHEN sim_max_favorable_move BETWEEN 0.5 AND 1 THEN 2
          WHEN sim_max_favorable_move BETWEEN 1 AND 2 THEN 3
          WHEN sim_max_favorable_move BETWEEN 2 AND 3 THEN 4
          ELSE 5
        END AS sort_order,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS tp_count,
        ROUND(AVG(sim_entry_to_result_minutes), 0) AS avg_mins
      FROM btc_analysis
      ${base} sim_max_favorable_move IS NOT NULL AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY mfe_bucket, sort_order ORDER BY sort_order
    `, params),

    // Hedef R aralığına göre
    pool.query(`
      SELECT
        CASE
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 1.5  THEN '<1.5R'
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 2.0  THEN '1.5-2R'
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 2.5  THEN '2-2.5R'
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 3.0  THEN '2.5-3R'
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 4.0  THEN '3-4R'
          ELSE '4R+'
        END AS bucket,
        CASE
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 1.5  THEN 1
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 2.0  THEN 2
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 2.5  THEN 3
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 3.0  THEN 4
          WHEN SPLIT_PART(rr, ':', 2)::numeric < 4.0  THEN 5
          ELSE 6
        END AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate,
        ROUND(SUM(sim_r_multiple) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 2) AS total_r,
        ROUND(AVG(SPLIT_PART(rr, ':', 2)::numeric), 2) AS avg_target_r
      FROM btc_analysis
      ${base} rr IS NOT NULL AND rr LIKE '%:%'
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY bucket, sort_order ORDER BY sort_order
    `, params),
  ])

  return NextResponse.json({
    r_histogram: histRows.rows,
    scatter: scatterRows.rows,
    mfe_distribution: mfeRows.rows,
    target_r_distribution: targetRRows.rows,
  })
}
