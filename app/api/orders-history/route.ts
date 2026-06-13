import pool from '@/lib/db';
import { NextResponse } from 'next/server';

const SIZE_MULTIPLIER = 2.5;

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id, o.analysis_id, o.mt5_order_id, o.mt5_position_id, o.magic, o.strategy_label,
        o.symbol, o.direction, o.volume, o.entry_price, o.fill_price, o.sl, o.tp, o.rr,
        o.close_price, o.realized_pnl, o.status, o.exit_reason, o.is_manual,
        o.created_at, o.opened_at, o.closed_at,
        a.position_size_btc, a.win_probability_v6, a.analyzed_at, a.rr AS analysis_rr
      FROM orders o
      LEFT JOIN btc_analysis a ON a.id = o.analysis_id
      WHERE o.status IN ('CLOSED', 'CANCELED')
      ORDER BY o.closed_at DESC NULLS LAST
    `);

    const numericFields = [
      'volume', 'entry_price', 'fill_price', 'sl', 'tp', 'rr',
      'close_price', 'realized_pnl', 'position_size_btc', 'win_probability_v6',
    ] as const;

    const result = rows.map((row) => {
      const converted: Record<string, unknown> = { ...row };
      for (const field of numericFields) {
        const value = row[field];
        converted[field] = value === null || value === undefined ? null : Number(value);
      }

      // Normalize realized PnL to 50$ basis
      const realPnl = row.realized_pnl != null ? Number(row.realized_pnl) : null;
      const realVol = row.volume != null ? Number(row.volume) : null;
      const idealVol =
        row.position_size_btc != null
          ? Math.round(Number(row.position_size_btc) * SIZE_MULTIPLIER * 100) / 100
          : realVol;
      converted['display_volume'] = idealVol;
      converted['normalized_pnl'] =
        realPnl != null && realVol && realVol > 0 && idealVol != null
          ? Number((realPnl * (idealVol / realVol)).toFixed(2))
          : realPnl;

      return converted;
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('orders-history error:', err);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
