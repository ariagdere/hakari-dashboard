import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const query = `
    SELECT
      analyzed_at,
      direction,
      entry,
      tp,
      sl,
      rr,
      ROUND(ABS(tp - entry)::numeric, 0)                                          AS tp_distance,
      ROUND(ABS(sl - entry)::numeric, 0)                                          AS sl_distance,
      rsi_4h,
      rsi_30m,
      sim_result,
      sim_direction,
      sim_r_multiple,
      sim_pnl_usd,
      sim_entry_to_result_minutes                                                  AS trade_duration_mins,
      ROUND(EXTRACT(EPOCH FROM (sim_entry_triggered_at - analyzed_at)) / 60)      AS entry_wait_mins,
      sim_entry_triggered_at                                                       AS trade_entry_at,
      sim_result_at                                                                AS trade_close_at,
      win_probability_v6,
      win_probability_v6_reverse,
      cluster_liq_ratio,
      cluster_up_hit,
      cluster_dn_hit,
      cluster_up_reach_pct,
      cluster_dn_reach_pct,
      cluster_up_dist_pct,
      cluster_dn_dist_pct,
      cluster_first_closer,
      ROUND((h1_ls_ratio_current    - h1_ls_ratio_start)::numeric, 4)             AS h1_ls_delta,
      ROUND((h1_tt_positions_current- h1_tt_positions_start)::numeric, 4)         AS h1_tt_positions_delta,
      ROUND((h1_tt_accounts_current - h1_tt_accounts_start)::numeric, 4)          AS h1_tt_accounts_delta,
      ROUND((h1_oi_current          - h1_oi_start)::numeric, 2)                   AS h1_oi_delta,
      ROUND((h1_oi_mcap_current     - h1_oi_mcap_start)::numeric, 6)              AS h1_oi_mcap_delta,
      ROUND((m5_ls_ratio_current    - m5_ls_ratio_start)::numeric, 4)             AS m5_ls_delta,
      ROUND((m5_tt_positions_current- m5_tt_positions_start)::numeric, 4)         AS m5_tt_positions_delta,
      ROUND((m5_tt_accounts_current - m5_tt_accounts_start)::numeric, 4)          AS m5_tt_accounts_delta,
      ROUND((m5_oi_current          - m5_oi_start)::numeric, 2)                   AS m5_oi_delta,
      ROUND((m5_oi_mcap_current     - m5_oi_mcap_start)::numeric, 6)              AS m5_oi_mcap_delta,
      sent_synthesis_mtf,
      sent_synthesis_h1,
      sent_synthesis_m5,
      sent_liquidity
    FROM btc_analysis
    ${where || ''}
    ORDER BY analyzed_at DESC
  `
  const { rows } = await pool.query(query, params)
  if (rows.length === 0) {
    return new NextResponse('No data', { status: 204 })
  }

  const headers = [
    'date', 'direction', 'entry', 'tp', 'sl', 'rr',
    'tp_distance', 'sl_distance',
    'rsi_4h', 'rsi_30m',
    'sim_result', 'sim_direction', 'sim_r', 'sim_pnl',
    'trade_duration_mins', 'entry_wait_mins',
    'trade_entry_at', 'trade_close_at',
    'wp_v6', 'wp_v6_rev',
    'cluster_liq_ratio',
    'cluster_up_hit', 'cluster_dn_hit',
    'cluster_up_reach_pct', 'cluster_dn_reach_pct',
    'cluster_up_dist_pct', 'cluster_dn_dist_pct',
    'cluster_first_closer',
    'h1_ls_delta', 'h1_tt_positions_delta', 'h1_tt_accounts_delta', 'h1_oi_delta', 'h1_oi_mcap_delta',
    'm5_ls_delta', 'm5_tt_positions_delta', 'm5_tt_accounts_delta', 'm5_oi_delta', 'm5_oi_mcap_delta',
    'sent_synthesis_mtf', 'sent_synthesis_h1', 'sent_synthesis_m5', 'sent_liquidity',
  ]

  const toTR = (v: any) => {
    if (!v) return ''
    const d = new Date(v)
    d.setHours(d.getHours() + 3)
    return d.toISOString().replace('T', ' ').slice(0, 19)
  }

  const escape = (v: any) => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.analyzed_at ? toTR(r.analyzed_at) : '',
      r.direction, r.entry, r.tp, r.sl, r.rr,
      r.tp_distance, r.sl_distance,
      r.rsi_4h, r.rsi_30m,
      r.sim_result, r.sim_direction, r.sim_r_multiple, r.sim_pnl_usd,
      r.trade_duration_mins, r.entry_wait_mins,
      toTR(r.trade_entry_at),
      toTR(r.trade_close_at),
      r.win_probability_v6, r.win_probability_v6_reverse,
      r.cluster_liq_ratio,
      r.cluster_up_hit, r.cluster_dn_hit,
      r.cluster_up_reach_pct, r.cluster_dn_reach_pct,
      r.cluster_up_dist_pct, r.cluster_dn_dist_pct,
      r.cluster_first_closer,
      r.h1_ls_delta, r.h1_tt_positions_delta, r.h1_tt_accounts_delta, r.h1_oi_delta, r.h1_oi_mcap_delta,
      r.m5_ls_delta, r.m5_tt_positions_delta, r.m5_tt_accounts_delta, r.m5_oi_delta, r.m5_oi_mcap_delta,
      r.sent_synthesis_mtf, r.sent_synthesis_h1, r.sent_synthesis_m5, r.sent_liquidity,
    ].map(escape).join(',')),
  ]

  const filename = `analyses_${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
