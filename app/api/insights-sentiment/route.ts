import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

const INDICATOR_COLS = [
  { col: 'sent_h1_ls_ratio',    label: 'H1 L/S Ratio' },
  { col: 'sent_h1_tt_accounts', label: 'H1 TT Accounts' },
  { col: 'sent_h1_tt_positions',label: 'H1 TT Positions' },
  { col: 'sent_h1_oi',          label: 'H1 OI' },
  { col: 'sent_h1_oi_mcap',     label: 'H1 OI/MCap' },
  { col: 'sent_m5_ls_ratio',    label: 'M5 L/S Ratio' },
  { col: 'sent_m5_tt_accounts', label: 'M5 TT Accounts' },
  { col: 'sent_m5_tt_positions',label: 'M5 TT Positions' },
  { col: 'sent_m5_oi',          label: 'M5 OI' },
  { col: 'sent_m5_oi_mcap',     label: 'M5 OI/MCap' },
]

export async function GET() {
  // 1. Indicator win rates per sentiment value
  const indicatorQueries = INDICATOR_COLS.map(({ col, label }) =>
    pool.query(`
      SELECT
        '${label}' AS indicator,
        ${col} AS sentiment,
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
      WHERE ${col} IS NOT NULL
      GROUP BY ${col}
    `)
  )

  // 2. MTF confluence — all three synthesis strong
  const mtfQuery = pool.query(`
    SELECT
      sent_synthesis_h1  AS h1,
      sent_synthesis_m5  AS m5,
      sent_synthesis_mtf AS mtf,
      COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate
    FROM btc_analysis
    WHERE sent_synthesis_h1 IS NOT NULL
      AND sent_synthesis_m5 IS NOT NULL
      AND sent_synthesis_mtf IS NOT NULL
    GROUP BY sent_synthesis_h1, sent_synthesis_m5, sent_synthesis_mtf
    ORDER BY total DESC
    LIMIT 12
  `)

  // 3. Liquidity x market power cross
  const liqQuery = pool.query(`
    SELECT
      sent_liquidity    AS liquidity,
      sent_market_power AS market_power,
      COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
      ) AS win_rate
    FROM btc_analysis
    WHERE sent_liquidity IS NOT NULL AND sent_market_power IS NOT NULL
    GROUP BY sent_liquidity, sent_market_power
    ORDER BY total DESC
  `)

  const [indicatorResults, mtfResult, liqResult] = await Promise.all([
    Promise.all(indicatorQueries),
    mtfQuery,
    liqQuery,
  ])

  const indicators = indicatorResults.flatMap(r => r.rows)

  return NextResponse.json({
    indicators,
    mtf_confluence: mtfResult.rows,
    liquidity_cross: liqResult.rows,
  })
}
