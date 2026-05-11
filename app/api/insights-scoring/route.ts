import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

const RSI_CASE = `
  CASE
    WHEN rsi_4h < 30 THEN 'Aşırı Satım (<30)'
    WHEN rsi_4h BETWEEN 30 AND 45 THEN 'Zayıf (30-45)'
    WHEN rsi_4h BETWEEN 45 AND 55 THEN 'Nötr (45-55)'
    WHEN rsi_4h BETWEEN 55 AND 70 THEN 'Güçlü (55-70)'
    WHEN rsi_4h > 70 THEN 'Aşırı Alım (>70)'
  END
`
const RSI_ORDER = `
  CASE
    WHEN rsi_4h < 30 THEN 1
    WHEN rsi_4h BETWEEN 30 AND 45 THEN 2
    WHEN rsi_4h BETWEEN 45 AND 55 THEN 3
    WHEN rsi_4h BETWEEN 55 AND 70 THEN 4
    WHEN rsi_4h > 70 THEN 5
  END
`

const RSI30_CASE = `
  CASE
    WHEN rsi_30m < 30 THEN 'Aşırı Satım (<30)'
    WHEN rsi_30m BETWEEN 30 AND 45 THEN 'Zayıf (30-45)'
    WHEN rsi_30m BETWEEN 45 AND 55 THEN 'Nötr (45-55)'
    WHEN rsi_30m BETWEEN 55 AND 70 THEN 'Güçlü (55-70)'
    WHEN rsi_30m > 70 THEN 'Aşırı Alım (>70)'
  END
`
const RSI30_ORDER = `
  CASE
    WHEN rsi_30m < 30 THEN 1
    WHEN rsi_30m BETWEEN 30 AND 45 THEN 2
    WHEN rsi_30m BETWEEN 45 AND 55 THEN 3
    WHEN rsi_30m BETWEEN 55 AND 70 THEN 4
    WHEN rsi_30m > 70 THEN 5
  END
`

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const [scoreRows, confRows, rsiRows, rsiLongRows, rsiShortRows, rsi30Rows, rsi30LongRows, rsi30ShortRows] = await Promise.all([
    pool.query(`
      SELECT
        market_score_value AS score,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} market_score_value IS NOT NULL
      GROUP BY market_score_value ORDER BY market_score_value
    `, params),

    pool.query(`
      SELECT
        confidence_value AS score,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} confidence_value IS NOT NULL
      GROUP BY confidence_value ORDER BY confidence_value
    `, params),

    pool.query(`
      SELECT ${RSI_CASE} AS rsi_zone, ${RSI_ORDER} AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} rsi_4h IS NOT NULL
      GROUP BY rsi_zone, sort_order ORDER BY sort_order
    `, params),

    pool.query(`
      SELECT ${RSI_CASE} AS rsi_zone, ${RSI_ORDER} AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} rsi_4h IS NOT NULL AND direction = 'LONG'
      GROUP BY rsi_zone, sort_order ORDER BY sort_order
    `, params),

    pool.query(`
      SELECT ${RSI_CASE} AS rsi_zone, ${RSI_ORDER} AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} rsi_4h IS NOT NULL AND direction = 'SHORT'
      GROUP BY rsi_zone, sort_order ORDER BY sort_order
    `, params),

    // RSI 30M overall
    pool.query(`
      SELECT ${RSI30_CASE} AS rsi_zone, ${RSI30_ORDER} AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} rsi_30m IS NOT NULL
      GROUP BY rsi_zone, sort_order ORDER BY sort_order
    `, params),

    // RSI 30M × LONG
    pool.query(`
      SELECT ${RSI30_CASE} AS rsi_zone, ${RSI30_ORDER} AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} rsi_30m IS NOT NULL AND direction = 'LONG'
      GROUP BY rsi_zone, sort_order ORDER BY sort_order
    `, params),

    // RSI 30M × SHORT
    pool.query(`
      SELECT ${RSI30_CASE} AS rsi_zone, ${RSI30_ORDER} AS sort_order,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} rsi_30m IS NOT NULL AND direction = 'SHORT'
      GROUP BY rsi_zone, sort_order ORDER BY sort_order
    `, params),
  ])

  return NextResponse.json({
    by_score:       scoreRows.rows,
    by_confidence:  confRows.rows,
    by_rsi:         rsiRows.rows,
    by_rsi_long:    rsiLongRows.rows,
    by_rsi_short:   rsiShortRows.rows,
    by_rsi30:       rsi30Rows.rows,
    by_rsi30_long:  rsi30LongRows.rows,
    by_rsi30_short: rsi30ShortRows.rows,
  })
}
