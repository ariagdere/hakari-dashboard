import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const viewParam = req.nextUrl.searchParams.get('view')
  const view = viewParam === 'naive' ? 'naive' : viewParam === 'pullback' ? 'pullback' : 'ai'
  const { where, params } = buildInsightsWhere(req, view)
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
      win_probability_c75,
      win_probability_c75_reverse,
      win_probability_v6_3105, win_probability_v6_3105_reverse,
      win_probability_v6_jul, win_probability_v6_jul_reverse,
      win_probability_c75_3105, win_probability_c75_3105_reverse,
      win_probability_c75_jul, win_probability_c75_jul_reverse,
      zlema_zone_4h,
      cluster_liq_ratio,
      cluster_up_hit,
      cluster_dn_hit,
      cluster_up_reach_pct,
      cluster_dn_reach_pct,
      cluster_up_dist_pct,
      cluster_dn_dist_pct,
      cluster_first_closer,
      naive_direction,
      naive_entry,
      naive_tp,
      naive_sl,
      naive_rr,
      naive_dist_ratio,
      naive_pos_size,
      naive_duration_mins,
      sim_result_naive,
      naive_sim_r_multiple,
      pullback_direction,
      pullback_entry_target,
      pullback_tp,
      pullback_sl,
      pullback_rr,
      pullback_atr_5m,
      pullback_pos_size,
      pullback_wait_mins,
      pullback_duration_mins,
      pullback_entry_triggered_at,
      sim_result_pullback,
      pullback_sim_r_multiple,
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
    'wp_v6', 'wp_v6_rev', 'wp_c75', 'wp_c75_rev',
    'wp_v6_3105', 'wp_v6_3105_rev', 'wp_v6_jul', 'wp_v6_jul_rev',
    'wp_c75_3105', 'wp_c75_3105_rev', 'wp_c75_jul', 'wp_c75_jul_rev',
    'zlema_zone_4h',
    'cluster_liq_ratio',
    'cluster_up_hit', 'cluster_dn_hit',
    'cluster_up_reach_pct', 'cluster_dn_reach_pct',
    'cluster_up_dist_pct', 'cluster_dn_dist_pct',
    'cluster_first_closer',
    'naive_direction', 'naive_entry', 'naive_tp', 'naive_sl', 'naive_rr',
    'naive_dist_ratio', 'naive_pos_size', 'naive_duration_mins',
    'sim_result_naive', 'naive_sim_r',
    'pullback_direction', 'pullback_entry_target', 'pullback_tp', 'pullback_sl', 'pullback_rr',
    'pullback_atr_5m', 'pullback_pos_size', 'pullback_wait_mins', 'pullback_duration_mins',
    'pullback_entry_triggered_at', 'sim_result_pullback', 'pullback_sim_r',
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
      r.win_probability_c75, r.win_probability_c75_reverse,
      r.win_probability_v6_3105, r.win_probability_v6_3105_reverse,
      r.win_probability_v6_jul, r.win_probability_v6_jul_reverse,
      r.win_probability_c75_3105, r.win_probability_c75_3105_reverse,
      r.win_probability_c75_jul, r.win_probability_c75_jul_reverse,
      r.zlema_zone_4h,
      r.cluster_liq_ratio,
      r.cluster_up_hit, r.cluster_dn_hit,
      r.cluster_up_reach_pct, r.cluster_dn_reach_pct,
      r.cluster_up_dist_pct, r.cluster_dn_dist_pct,
      r.cluster_first_closer,
      r.naive_direction, r.naive_entry, r.naive_tp, r.naive_sl, r.naive_rr,
      r.naive_dist_ratio, r.naive_pos_size, r.naive_duration_mins,
      r.sim_result_naive, r.naive_sim_r_multiple,
      r.pullback_direction, r.pullback_entry_target, r.pullback_tp, r.pullback_sl, r.pullback_rr,
      r.pullback_atr_5m, r.pullback_pos_size, r.pullback_wait_mins, r.pullback_duration_mins,
      toTR(r.pullback_entry_triggered_at), r.sim_result_pullback, r.pullback_sim_r_multiple,
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
