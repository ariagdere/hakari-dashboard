import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import { getOpenPositionVolumes } from '@/lib/metaapiStream';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // pc: acik order'in kismi kapanislari (monitor'un PARTIAL_CLOSE olaylari; ayni deal iki kez
    // yazildiysa bir kez sayilir). closed_volume -> kalan hacim, partial_pnl -> gerceklesen kar/zarar.
    const { rows } = await pool.query(`
      SELECT
        o.id, o.analysis_id, o.mt5_order_id, o.mt5_position_id, o.magic, o.strategy_label,
        o.symbol, o.direction, o.volume, o.entry_price, o.fill_price, o.sl, o.tp, o.rr,
        o.r_target, o.r_risk,
        o.status, o.created_at, o.opened_at,
        o.h1_ls_angle, o.m5_ls_angle, o.h1_tt_pos_angle, o.m5_tt_pos_angle,
        o.red_folder_same_day, o.red_folder_event_name, o.red_folder_hours_diff,
        a.position_size_btc, a.win_probability_v6, a.win_probability_v6_reverse,
        a.analyzed_at, a.rr AS analysis_rr,
        pc.closed_volume, pc.partial_pnl, COALESCE(pc.partial_count, 0)::int AS partial_count
      FROM orders o
      LEFT JOIN btc_analysis a ON a.id = o.analysis_id
      LEFT JOIN LATERAL (
        SELECT sum(x.volume) AS closed_volume, sum(x.profit) AS partial_pnl, count(*) AS partial_count
          FROM (
            SELECT DISTINCT ON (COALESCE(e.raw_payload->>'id', e.id::text)) e.new_value AS volume, e.profit
              FROM order_events e
             WHERE e.order_id = o.id AND e.event_type = 'PARTIAL_CLOSE'
             ORDER BY COALESCE(e.raw_payload->>'id', e.id::text), e.id
          ) x
      ) pc ON o.status = 'OPEN'
      WHERE o.status IN ('PENDING', 'OPEN')
      ORDER BY o.created_at DESC
    `);
    const numericFields = [
      'volume', 'entry_price', 'fill_price', 'sl', 'tp', 'rr', 'r_target', 'r_risk',
      'h1_ls_angle', 'm5_ls_angle', 'h1_tt_pos_angle', 'm5_tt_pos_angle', 'red_folder_hours_diff',
      'position_size_btc', 'win_probability_v6', 'win_probability_v6_reverse',
      'closed_volume', 'partial_pnl',
    ] as const;

    // Kalan hacmin kesin kaynagi MT5'teki pozisyon (akis hazirsa); yoksa istemci volume - closed_volume kullanir.
    const mt5Volumes = getOpenPositionVolumes();
    const result = rows.map((row) => {
      const converted: Record<string, unknown> = { ...row };
      for (const field of numericFields) {
        const value = row[field];
        converted[field] = value === null || value === undefined ? null : Number(value);
      }
      converted.remaining_volume =
        row.status === 'OPEN' && row.mt5_position_id != null ? mt5Volumes?.get(String(row.mt5_position_id)) ?? null : null;
      return converted;
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('orders-live error:', err);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
