import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

const INDICATOR_COLS = [
  { col: 'sent_h1_ls_ratio',     label: 'H1 L/S Ratio' },
  { col: 'sent_h1_tt_accounts',  label: 'H1 TT Accounts' },
  { col: 'sent_h1_tt_positions', label: 'H1 TT Positions' },
  { col: 'sent_h1_oi',           label: 'H1 OI' },
  { col: 'sent_h1_oi_mcap',      label: 'H1 OI/MCap' },
  { col: 'sent_m5_ls_ratio',     label: 'M5 L/S Ratio' },
  { col: 'sent_m5_tt_accounts',  label: 'M5 TT Accounts' },
  { col: 'sent_m5_tt_positions', label: 'M5 TT Positions' },
  { col: 'sent_m5_oi',           label: 'M5 OI' },
  { col: 'sent_m5_oi_mcap',      label: 'M5 OI/MCap' },
]

function indicatorQuery(col: string, label: string, base: string, params: any[], direction?: string) {
  const dirFilter = direction ? `AND direction = '${direction}'` : ''
  return pool.query(`
    SELECT
      '${label}' AS indicator,
      ${col} AS sentiment,
      COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
    FROM btc_analysis
    ${base} ${col} IS NOT NULL ${dirFilter}
    GROUP BY ${col}
  `, params)
}

function mtfQuery(base: string, params: any[], direction?: string) {
  const dirFilter = direction ? `AND direction = '${direction}'` : ''
  return pool.query(`
    SELECT
      sent_synthesis_h1  AS h1,
      sent_synthesis_m5  AS m5,
      sent_synthesis_mtf AS mtf,
      COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
      COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
      ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
    FROM btc_analysis
    ${base} sent_synthesis_h1 IS NOT NULL
      AND sent_synthesis_m5 IS NOT NULL
      AND sent_synthesis_mtf IS NOT NULL
      ${dirFilter}
    GROUP BY sent_synthesis_h1, sent_synthesis_m5, sent_synthesis_mtf
    ORDER BY total DESC LIMIT 10
  `, params)
}

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  const [
    indicatorResults,
    indicatorLongResults,
    indicatorShortResults,
    mtfResult,
    mtfLongResult,
    mtfShortResult,
    liqResult,
  ] = await Promise.all([
    Promise.all(INDICATOR_COLS.map(({ col, label }) => indicatorQuery(col, label, base, params))),
    Promise.all(INDICATOR_COLS.map(({ col, label }) => indicatorQuery(col, label, base, params, 'LONG'))),
    Promise.all(INDICATOR_COLS.map(({ col, label }) => indicatorQuery(col, label, base, params, 'SHORT'))),
    mtfQuery(base, params),
    mtfQuery(base, params, 'LONG'),
    mtfQuery(base, params, 'SHORT'),
    pool.query(`
      SELECT
        sent_liquidity    AS liquidity,
        sent_market_power AS market_power,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1) AS win_rate
      FROM btc_analysis
      ${base} sent_liquidity IS NOT NULL AND sent_market_power IS NOT NULL
      GROUP BY sent_liquidity, sent_market_power
      ORDER BY total DESC
    `, params),
  ])

  return NextResponse.json({
    indicators:        indicatorResults.flatMap(r => r.rows),
    indicators_long:   indicatorLongResults.flatMap(r => r.rows),
    indicators_short:  indicatorShortResults.flatMap(r => r.rows),
    mtf_confluence:    mtfResult.rows,
    mtf_confluence_long:  mtfLongResult.rows,
    mtf_confluence_short: mtfShortResult.rows,
    liquidity_cross:   liqResult.rows,
  })
}
