import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// mt5_order_monitor.js'teki calculateRR ile BIREBIR ayni formul -- tutarlilik icin.
function calculateRR(entry: number | null, sl: number | null, tp: number | null): number | null {
  if (!entry || !sl || !tp) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return null;
  return Number((reward / risk).toFixed(2));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const orderId = params.id;
  if (!/^\d+$/.test(orderId)) {
    return NextResponse.json({ error: 'Geçersiz order id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { sl, tp, strategy_label } = body as { sl?: number; tp?: number; strategy_label?: string };
    if (sl === undefined && tp === undefined && strategy_label === undefined) {
      return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 });
    }

    const { rows: existingRows } = await pool.query(
      `SELECT sl, tp, entry_price, fill_price, strategy_label FROM orders WHERE id = $1`,
      [orderId]
    );
    const existing = existingRows[0];
    if (!existing) {
      return NextResponse.json({ error: 'Order bulunamadı' }, { status: 404 });
    }

    const newSl = sl !== undefined ? sl : existing.sl != null ? Number(existing.sl) : null;
    const newTp = tp !== undefined ? tp : existing.tp != null ? Number(existing.tp) : null;
    const newLabel = strategy_label !== undefined ? strategy_label : existing.strategy_label;
    // mt5_order_monitor.js ile AYNI oncelik: pollPositions fill_price kullanir
    // (acik pozisyon), pollOrders/insertOrder entry_price kullanir (pending).
    const entryForRR = existing.fill_price != null ? Number(existing.fill_price) : existing.entry_price != null ? Number(existing.entry_price) : null;
    const newRR = calculateRR(entryForRR, newSl, newTp);

    await pool.query(
      `UPDATE orders SET sl = $1, tp = $2, rr = $3, strategy_label = $4, updated_at = now() WHERE id = $5`,
      [newSl, newTp, newRR, newLabel, orderId]
    );

    // Denetim izi: dashboard'dan yapilan duzeltmeyi de order_events'e kaydet --
    // streaming'den gelenlerle AYNI tabloda, ama source ile ayirt edilebilir.
    if (sl !== undefined && existing.sl != null && Math.abs(Number(existing.sl) - sl) > 0.0001) {
      await pool.query(
        `INSERT INTO order_events (order_id, event_type, is_manual, old_value, new_value, source, event_time)
         VALUES ($1, 'MODIFIED', true, $2, $3, 'dashboard_correction', now())`,
        [orderId, existing.sl, sl]
      );
    }
    if (tp !== undefined && existing.tp != null && Math.abs(Number(existing.tp) - tp) > 0.0001) {
      await pool.query(
        `INSERT INTO order_events (order_id, event_type, is_manual, old_value, new_value, source, event_time)
         VALUES ($1, 'MODIFIED', true, $2, $3, 'dashboard_correction', now())`,
        [orderId, existing.tp, tp]
      );
    }

    return NextResponse.json({ ok: true, sl: newSl, tp: newTp, rr: newRR, strategy_label: newLabel });
  } catch (err) {
    console.error('orders PATCH error:', err);
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 });
  }
}
