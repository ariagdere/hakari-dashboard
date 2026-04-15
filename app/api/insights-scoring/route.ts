import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [scoreRows, confRows, rsiRows] = await Promise.all([
    pool.query(`
      SELECT
        market_score_value AS score,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS win_rate
      FROM btc_analysis
      WHERE market_score_value IS NOT NULL
      GROUP BY market_score_value
      ORDER BY market_score_value
    `),
    pool.query(`
      SELECT
        confidence_value AS score,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS win_rate
      FROM btc_analysis
      WHERE confidence_value IS NOT NULL
      GROUP BY confidence_value
      ORDER BY confidence_value
    `),
    pool.query(`
      SELECT
        CASE
          WHEN rsi_4h < 30 THEN 'Aşırı Satım (<30)'
          WHEN rsi_4h BETWEEN 30 AND 45 THEN 'Zayıf (30-45)'
          WHEN rsi_4h BETWEEN 45 AND 55 THEN 'Nötr (45-55)'
          WHEN rsi_4h BETWEEN 55 AND 70 THEN 'Güçlü (55-70)'
          WHEN rsi_4h > 70 THEN 'Aşırı Alım (>70)'
        END AS rsi_zone,
        CASE
          WHEN rsi_4h < 30 THEN 1
          WHEN rsi_4h BETWEEN 30 AND 45 THEN 2
          WHEN rsi_4h BETWEEN 45 AND 55 THEN 3
          WHEN rsi_4h BETWEEN 55 AND 70 THEN 4
          WHEN rsi_4h > 70 THEN 5
        END AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS win_rate,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT') AND direction = 'SHORT') AS total_short,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT' AND direction = 'SHORT') AS wins_short,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT' AND direction = 'SHORT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT') AND direction = 'SHORT'), 0), 1
        ) AS win_rate_short,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT') AND direction = 'LONG') AS total_long,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT' AND direction = 'LONG') AS wins_long,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT' AND direction = 'LONG') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT') AND direction = 'LONG'), 0), 1
        ) AS win_rate_long
      FROM btc_analysis
      WHERE rsi_4h IS NOT NULL
      GROUP BY rsi_zone, sort_order
      ORDER BY sort_order
    `),
  ])

  return NextResponse.json({
    by_score: scoreRows.rows,
    by_confidence: confRows.rows,
    by_rsi: rsiRows.rows,
  })
}
