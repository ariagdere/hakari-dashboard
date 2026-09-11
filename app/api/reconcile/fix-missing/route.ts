import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  parseCommentField, resolveStrategyLabel, classifyClose, calculateRR,
  fetchDealsByPosition, fetchHistoryOrdersByPosition, summarizeCloseDeals,
} from '@/lib/reconcileHelpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const positionId = body?.positionId as string;
    if (!positionId) return NextResponse.json({ error: 'positionId zorunlu' }, { status: 400 });

    // Ayni pozisyon icin zaten bir order VARSA -- tekrar INSERT ETME.
    const { rows: existingRows } = await pool.query(`SELECT id FROM orders WHERE mt5_position_id = $1`, [positionId]);
    if (existingRows.length > 0) {
      return NextResponse.json({ error: 'Bu position için order zaten var', orderId: existingRows[0].id }, { status: 409 });
    }

    const deals = await fetchDealsByPosition(positionId);
    const orders = await fetchHistoryOrdersByPosition(positionId);

    const inDeal = deals.find((d) => d.entryType === 'DEAL_ENTRY_IN');
    const outDeals = deals.filter((d) => d.entryType === 'DEAL_ENTRY_OUT');
    if (!inDeal) return NextResponse.json({ error: 'Açılış deal\'i (DEAL_ENTRY_IN) bulunamadı' }, { status: 404 });
    if (outDeals.length === 0) return NextResponse.json({ error: 'Kapanış deal\'i bulunamadı -- pozisyon henüz açık olabilir' }, { status: 400 });

    const { totalPnl, avgClosePrice, lastOutDeal } = summarizeCloseDeals(outDeals);

    // SL/TP: bu position'a ait TUM history order kayitlarindan, EN SON
    // (zaman olarak en gec) olanin stopLoss/takeProfit'i.
    let sl: number | null = null, tp: number | null = null;
    if (orders.length > 0) {
      const lastOrder = orders.reduce((a, b) => {
        const at = a.doneTime || a.time, bt = b.doneTime || b.time;
        return at > bt ? a : b;
      });
      sl = lastOrder.stopLoss ?? null;
      tp = lastOrder.takeProfit ?? null;
    }

    const { exitReason, isManual } = classifyClose(lastOutDeal.reason, avgClosePrice, sl, tp, totalPnl);

    const entryPrice = Number(inDeal.price ?? 0);
    const volume = Number(inDeal.volume ?? 0);
    const magic = Number(inDeal.magic ?? 0);
    const { analysisId, apifyRunId } = parseCommentField(inDeal.comment ?? inDeal.brokerComment);
    const strategyLabel = resolveStrategyLabel(magic);
    const isSystem = analysisId != null || apifyRunId != null || strategyLabel != null;
    const direction = inDeal.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL';

    const { rows } = await pool.query(
      `INSERT INTO orders
         (analysis_id, apify_run_id, mt5_order_id, mt5_position_id, magic, strategy_label, symbol, direction,
          volume, entry_price, fill_price, sl, tp, rr, status, opened_at,
          close_price, realized_pnl, closed_at, exit_reason, is_manual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'CLOSED',$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [
        isSystem ? analysisId : null,
        isSystem ? apifyRunId : null,
        inDeal.orderId ?? inDeal.id,
        positionId,
        magic,
        isSystem ? (strategyLabel ?? `MAGIC_${magic}`) : 'MANUAL',
        inDeal.symbol,
        direction,
        volume,
        entryPrice,
        entryPrice,
        sl, tp,
        calculateRR(entryPrice, sl, tp),
        inDeal.time,
        avgClosePrice, totalPnl, lastOutDeal.time, exitReason, isManual,
      ]
    );

    // BILEREK: order_events'e HICBIR SEY yazilmiyor -- kullanicinin acik istegi.
    return NextResponse.json({ ok: true, orderId: rows[0].id });
  } catch (err: any) {
    console.error('fix-missing error:', err);
    return NextResponse.json({ error: err.message || 'Order oluşturulamadı' }, { status: 500 });
  }
}
