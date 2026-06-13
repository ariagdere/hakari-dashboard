import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id, o.analysis_id, o.mt5_order_id, o.mt5_position_id, o.magic, o.strategy_label,
        o.symbol, o.direction, o.volume, o.entry_price, o.fill_price, o.sl, o.tp, o.rr,
        o.status, o.created_at, o.opened_at,
        a.position_size_btc, a.win_probability_v6, a.analyzed_at, a.rr AS analysis_rr
      FROM orders o
      LEFT JOIN btc_analysis a ON a.id = o.analysis_id
      WHERE o.status IN ('PENDING', 'OPEN')
      ORDER BY o.created_at DESC
    `);
    const numericFields = [
      'volume', 'entry_price', 'fill_price', 'sl', 'tp', 'rr', 'position_size_btc', 'win_probability_v6',
    ] as const;

    const result = rows.map((row) => {
      const converted: Record<string, unknown> = { ...row };
      for (const field of numericFields) {
        const value = row[field];
        converted[field] = value === null || value === undefined ? null : Number(value);
      }
      return converted;
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('orders-live error:', err);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
