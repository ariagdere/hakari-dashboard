import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

// Naif sekmesi — Win Probability Calibration'ın yerini alır.
// naive_dist_ratio (uzak/yakın cluster mesafe oranı) bucket'larına göre
// gerçekleşen WR/Total R/Max DD — bugünkü araştırmada bulunan en güvenilir sinyal.

const DIST_RATIO_BUCKET = `
  CASE
    WHEN naive_dist_ratio < 1.5  THEN '1_1.0-1.5x'
    WHEN naive_dist_ratio < 2    THEN '2_1.5-2x'
    WHEN naive_dist_ratio < 3    THEN '3_2-3x'
    WHEN naive_dist_ratio < 5    THEN '4_3-5x'
    WHEN naive_dist_ratio < 10   THEN '5_5-10x'
    ELSE '6_10x+'
  END
`

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req, 'naive')
  const base = where ? `${where} AND` : 'WHERE'

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

  const { rows } = await pool.query(`
    SELECT
      ${DIST_RATIO_BUCKET} AS bucket,
      ROUND(AVG(naive_dist_ratio), 2) AS avg_dist_ratio,
      COUNT(*) FILTER (WHERE sim_result_naive IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result_naive = 'TP_HIT') AS wins,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result_naive = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result_naive IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate,
      ROUND(SUM(naive_sim_r_multiple) FILTER (WHERE sim_result_naive IN ('TP_HIT','SL_HIT')), 2) AS total_r
    FROM btc_analysis
    ${base} naive_dist_ratio IS NOT NULL
      AND sim_result_naive IN ('TP_HIT','SL_HIT')
    GROUP BY bucket
    ORDER BY bucket
  `, params)

  const { rows: rRows } = await pool.query(`
    SELECT
      ${DIST_RATIO_BUCKET} AS bucket,
      naive_sim_r_multiple,
      analyzed_at
    FROM btc_analysis
    ${base} naive_dist_ratio IS NOT NULL
      AND sim_result_naive IN ('TP_HIT','SL_HIT')
      AND naive_sim_r_multiple IS NOT NULL
    ORDER BY bucket, analyzed_at ASC
  `, params)

  const bucketRMap: Record<string, number[]> = {}
  for (const r of rRows) {
    if (!bucketRMap[r.bucket]) bucketRMap[r.bucket] = []
    bucketRMap[r.bucket].push(parseFloat(r.naive_sim_r_multiple))
  }

  const result = rows.map((row: any) => ({
    ...row,
    bucket: row.bucket.replace(/^\d_/, ''),
    max_dd: calcMaxDD(bucketRMap[row.bucket] ?? []),
  }))

  return NextResponse.json({ buckets: result })
}
