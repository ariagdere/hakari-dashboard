import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  resolveDealOrigin, classifyClose, calculateRR, calculateRTargetRisk, resolveMt5SlTp,
  fetchDealsByPosition, fetchHistoryOrdersByPosition, mt5OrderTimeMs, positionVolumes, summarizeCloseDeals,
} from '@/lib/reconcileHelpers';
import { computeOrderAngles } from '@/lib/orderAngles';

export const dynamic = 'force-dynamic';

// ORDER_MISSING: MT5'te kapanmis, sistemde hic kaydi olmayan pozisyon icin CLOSED order ekler.
// Monitor'un yazacagi gibi: created_at = order'in MT5'te olustugu an (mutabakat ani degil),
// 4 LSR acisi o ana gore (bkz. lib/orderAngles.ts).
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
    if (!inDeal) return NextResponse.json({ error: 'Açılış deal\'i (DEAL_ENTRY_IN) bulunamadı' }, { status: 404 });
    // Kismi kapanislar dahil TUM kapanis deal'leri; pozisyon tamamen kapanmadiysa CLOSED eklenmez
    const volumes = positionVolumes(deals, Number(inDeal.volume ?? 0));
    const outDeals = volumes.outs;
    if (outDeals.length === 0) return NextResponse.json({ error: 'Kapanış deal\'i bulunamadı -- pozisyon henüz açık olabilir' }, { status: 400 });
    if (!volumes.fullyClosed) {
      return NextResponse.json(
        { error: `Pozisyon MT5'te henüz tamamen kapanmamış (kapanan ${volumes.closedVolume.toFixed(2)} / ${volumes.openVolume} lot) -- açık pozisyon olarak senkronize edin` },
        { status: 409 },
      );
    }

    const { totalPnl, avgClosePrice, lastOutDeal } = summarizeCloseDeals(outDeals);

    // SL/TP: MT5'te tanimli deger -- once kapanis deal'i (pozisyonun son SL/TP'si, MT5 gecmisinde
    // gorunen), yoksa acilis deal'i, o da yoksa SL/TP tasiyan en son history order (bkz. resolveMt5SlTp).
    // (Eskiden yalnizca en son history order'a bakiliyordu; o genelde kapanis emridir ve SL/TP
    // tasimayabilir -- SL/TP bos kalabiliyordu.)
    const { sl, tp } = resolveMt5SlTp(deals, orders);

    const { exitReason, isManual } = classifyClose(lastOutDeal.reason, avgClosePrice, sl, tp, totalPnl);

    const entryPrice = Number(inDeal.price ?? 0);
    const volume = volumes.openVolume; // acilis deal(ler)inin toplami
    const magic = Number(inDeal.magic ?? 0);
    // Panel emri ise etiket order_intents'ten, analiz/apify bagi yok (bkz. resolveDealOrigin).
    const { analysisId, apifyRunId, strategyLabel, isSystem } = await resolveDealOrigin({ ...inDeal, magic });
    const direction = inDeal.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL';
    const { rTarget, rRisk } = await calculateRTargetRisk(isSystem ? analysisId : null, entryPrice, sl, tp);
    const createdMs = mt5OrderTimeMs(inDeal, orders);
    const { angles } = await computeOrderAngles([createdMs]);
    const a = angles[0];

    const { rows } = await pool.query(
      `INSERT INTO orders
         (analysis_id, apify_run_id, mt5_order_id, mt5_position_id, magic, strategy_label, symbol, direction,
          volume, entry_price, fill_price, sl, tp, rr, r_target, r_risk, status, opened_at,
          close_price, realized_pnl, closed_at, exit_reason, is_manual,
          h1_ls_angle, m5_ls_angle, h1_tt_pos_angle, m5_tt_pos_angle, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'CLOSED',$17,$18,$19,$20,$21,$22,
               $23,$24,$25,$26,COALESCE($27::timestamptz, now()))
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
        rTarget, rRisk,
        inDeal.time,
        avgClosePrice, totalPnl, lastOutDeal.time, exitReason, isManual,
        a.h1_ls_angle, a.m5_ls_angle, a.h1_tt_pos_angle, a.m5_tt_pos_angle,
        createdMs != null ? new Date(createdMs).toISOString() : null,
      ]
    );

    // BILEREK: order_events'e HICBIR SEY yazilmiyor -- kullanicinin acik istegi.
    return NextResponse.json({ ok: true, orderId: rows[0].id, angles: a });
  } catch (err: any) {
    console.error('fix-missing error:', err);
    return NextResponse.json({ error: err.message || 'Order oluşturulamadı' }, { status: 500 });
  }
}
