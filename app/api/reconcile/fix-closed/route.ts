import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { classifyClose, fetchDealsByPosition, summarizeCloseDeals } from '@/lib/reconcileHelpers';

export const dynamic = 'force-dynamic';

// SHOULD_BE_CLOSED_BUT_ISNT icin: order ZATEN orders tablosunda var (sl/tp
// dahil), sadece status/close alanlarini MT5'in GERCEK kapanis verisiyle
// GUNCELLIYORUZ -- yeni bir satir INSERT etmiyoruz, mevcut sl/tp'ye de
// DOKUNMUYORUZ (onlar zaten dogru, kullanicinin EditableSlTp ile duzelttigi
// deger buysa onu KORUYORUZ).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = body?.orderId as number;
    const positionId = body?.positionId as string;
    if (!orderId || !positionId) return NextResponse.json({ error: 'orderId ve positionId zorunlu' }, { status: 400 });

    const { rows: existingRows } = await pool.query(`SELECT id, status, sl, tp, entry_price, fill_price FROM orders WHERE id = $1`, [orderId]);
    const existing = existingRows[0];
    if (!existing) return NextResponse.json({ error: 'Order bulunamadı' }, { status: 404 });
    if (existing.status === 'CLOSED') {
      return NextResponse.json({ error: 'Order zaten CLOSED' }, { status: 409 });
    }

    const deals = await fetchDealsByPosition(positionId);
    const outDeals = deals.filter((d) => d.entryType === 'DEAL_ENTRY_OUT');
    if (outDeals.length === 0) return NextResponse.json({ error: 'Kapanış deal\'i bulunamadı' }, { status: 400 });

    const { totalPnl, avgClosePrice, lastOutDeal } = summarizeCloseDeals(outDeals);
    const sl = existing.sl != null ? Number(existing.sl) : null;
    const tp = existing.tp != null ? Number(existing.tp) : null;
    const { exitReason, isManual } = classifyClose(lastOutDeal.reason, avgClosePrice, sl, tp, totalPnl);

    await pool.query(
      `UPDATE orders SET status='CLOSED', close_price=$1, realized_pnl=$2, closed_at=$3, exit_reason=$4, is_manual=$5, updated_at=now() WHERE id=$6`,
      [avgClosePrice, totalPnl, lastOutDeal.time, exitReason, isManual, orderId]
    );

    // BILEREK: order_events'e HICBIR SEY yazilmiyor.
    return NextResponse.json({ ok: true, orderId });
  } catch (err: any) {
    console.error('fix-closed error:', err);
    return NextResponse.json({ error: err.message || 'Order güncellenemedi' }, { status: 500 });
  }
}
