import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  VOLUME_EPS, fetchDealsByPosition, fetchDealsByTimeRange, fetchOpenPositions, isClosingDeal, positionVolumes, positiveOrNull,
} from '@/lib/reconcileHelpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RECENT_CLOSE_MS = 10 * 60_000;

interface Discrepancy {
  type: 'ORDER_MISSING' | 'SHOULD_BE_CLOSED_BUT_ISNT' | 'OPEN_POSITION_MISSING' | 'SL_TP_BLANK';
  mt5PositionId: string;
  symbol: string | null;
  mt5TotalClosedVolume: number | null;
  orderId: number | null;
  orderStatus: string | null;
  orderVolume: number | null;
  lastDealTime: string;
  mt5Sl?: number | null;
  mt5Tp?: number | null;
}

// MT5'teki GERCEK durumu (hem KAPANIS gecmisi hem GUNCEL acik pozisyonlar)
// bizim orders tablomuzla karsilastirir. mt5_order_monitor.js'in
// streaming/resync mekanizmasina TAMAMEN BAGIMSIZ bir dogrulama katmani.
export async function GET(req: NextRequest) {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.nextUrl.searchParams.get('hours') ?? '24')));
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 3600 * 1000);

    const [deals, positions] = await Promise.all([fetchDealsByTimeRange(startTime, endTime), fetchOpenPositions()]);

    const discrepancies: Discrepancy[] = [];

    // ── 1) KAPANIS kontrolu -- sadece DEAL_ENTRY_OUT, positionId'ye gore
    // grupla, toplam kapatilan hacmi hesapla (mt5_order_monitor.js'teki
    // isFinalClose ile AYNI mantik). ──────────────────────────────────────
    const closesByPosition = new Map<string, { totalVolume: number; symbol: string | null; lastTime: string }>();
    for (const d of deals) {
      if (!isClosingDeal(d) || !d.positionId) continue;
      const existing = closesByPosition.get(d.positionId);
      const vol = Number(d.volume ?? 0);
      if (existing) {
        existing.totalVolume += vol;
        if (d.time > existing.lastTime) existing.lastTime = d.time;
      } else {
        closesByPosition.set(d.positionId, { totalVolume: vol, symbol: d.symbol ?? null, lastTime: d.time });
      }
    }

    // ── 2) ACIK POZISYON kontrolu -- MT5'te SU AN acik olan pozisyonlar,
    // bizim orders tablomuzda ya HIC yok ya da status='OPEN' DEGIL, ya da
    // sl/tp bizde bos ama MT5'te dolu. ────────────────────────────────────
    const allPositionIds = Array.from(new Set([
      ...Array.from(closesByPosition.keys()),
      ...positions.map((p) => p.id),
    ]));

    const orderByPositionId = new Map<string, any>();
    if (allPositionIds.length > 0) {
      const { rows: orderRows } = await pool.query(
        `SELECT id, mt5_position_id, status, volume, sl, tp FROM orders WHERE mt5_position_id = ANY($1::text[])`,
        [allPositionIds]
      );
      orderRows.forEach((r) => orderByPositionId.set(r.mt5_position_id, r));
    }

    // Kapanis tutarsizliklari. Hala acik pozisyonun (kismi kapanis) kaydi yoksa burada degil, asagida
    // OPEN_POSITION_MISSING olarak bildirilir -- yoksa "Olustur" acik pozisyonu kapali diye eklerdi.
    const openPositionIds = new Set(positions.map((p) => String(p.id)));
    Array.from(closesByPosition.entries()).forEach(([positionId, close]) => {
      const order = orderByPositionId.get(positionId);
      if (!order) {
        if (openPositionIds.has(String(positionId))) return;
        discrepancies.push({
          type: 'ORDER_MISSING', mt5PositionId: positionId, symbol: close.symbol,
          mt5TotalClosedVolume: close.totalVolume, orderId: null, orderStatus: null, orderVolume: null,
          lastDealTime: close.lastTime,
        });
        return;
      }
      const orderVolume = Number(order.volume);
      const fullyClosedInMt5 = close.totalVolume >= orderVolume - VOLUME_EPS;
      // Son 10 dk'da kapandiysa monitor kendisi kapatiyor olabilir (CLOSED olayi + Make bildirimiyle) -- bekle
      const recentlyClosed = Date.now() - new Date(close.lastTime).getTime() < RECENT_CLOSE_MS;
      if (fullyClosedInMt5 && order.status !== 'CLOSED' && !recentlyClosed) {
        discrepancies.push({
          type: 'SHOULD_BE_CLOSED_BUT_ISNT', mt5PositionId: positionId, symbol: close.symbol,
          mt5TotalClosedVolume: close.totalVolume, orderId: order.id, orderStatus: order.status, orderVolume,
          lastDealTime: close.lastTime,
        });
      }
    });

    // Acik pozisyon tutarsizliklari
    for (const p of positions) {
      const order = orderByPositionId.get(p.id);
      const sl = positiveOrNull(p.stopLoss), tp = positiveOrNull(p.takeProfit); // MT5'te 0 = tanimli degil
      if (!order || order.status !== 'OPEN') {
        discrepancies.push({
          type: 'OPEN_POSITION_MISSING', mt5PositionId: p.id, symbol: p.symbol ?? null,
          mt5TotalClosedVolume: null, orderId: order?.id ?? null, orderStatus: order?.status ?? null,
          orderVolume: order ? Number(order.volume) : null, lastDealTime: p.time,
          mt5Sl: sl, mt5Tp: tp,
        });
        continue;
      }
      // Order zaten var ve OPEN -- sl/tp bizde bos ama MT5'te doluysa bildir.
      const ourSl = order.sl != null ? Number(order.sl) : null;
      const ourTp = order.tp != null ? Number(order.tp) : null;
      if ((ourSl == null && sl != null) || (ourTp == null && tp != null)) {
        discrepancies.push({
          type: 'SL_TP_BLANK', mt5PositionId: p.id, symbol: p.symbol ?? null,
          mt5TotalClosedVolume: null, orderId: order.id, orderStatus: order.status, orderVolume: Number(order.volume),
          lastDealTime: p.time, mt5Sl: sl, mt5Tp: tp,
        });
      }
    }

    // ── 3) DB'de ACIK ama MT5'te acik olmayan pozisyonlar -- ZAMAN SINIRI YOK. Kismi kapanislarla
    // gunler icinde kapanan bir pozisyonun parcalari 1) numarali pencereye sigmayabilir. Karar MT5'in
    // pozisyon gecmisinden: kapanan hacim >= acilan hacim ise tam kapanmistir.
    const openInMt5 = openPositionIds;
    const alreadyFlagged = new Set(discrepancies.filter((d) => d.type === 'SHOULD_BE_CLOSED_BUT_ISNT').map((d) => d.mt5PositionId));
    const { rows: dbOpen } = await pool.query(
      `SELECT id, mt5_position_id, status, volume, symbol FROM orders WHERE status = 'OPEN' AND mt5_position_id IS NOT NULL ORDER BY id`
    );
    let staleChecked = 0;
    for (const o of dbOpen) {
      const positionId = String(o.mt5_position_id);
      if (openInMt5.has(positionId) || alreadyFlagged.has(positionId)) continue;
      staleChecked++;
      try {
        const v = positionVolumes(await fetchDealsByPosition(positionId), Number(o.volume));
        if (!v.fullyClosed || !v.lastOut) continue; // MT5'te kapanis gorunmuyor -- bildirme
        // Son 10 dk'da kapandiysa monitor kendisi kapatiyor olabilir (CLOSED olayi + Make bildirimiyle) -- bekle
        if (Date.now() - new Date(v.lastOut.time).getTime() < RECENT_CLOSE_MS) continue;
        discrepancies.push({
          type: 'SHOULD_BE_CLOSED_BUT_ISNT', mt5PositionId: positionId, symbol: o.symbol ?? null,
          mt5TotalClosedVolume: Number(v.closedVolume.toFixed(2)), orderId: o.id, orderStatus: o.status, orderVolume: Number(o.volume),
          lastDealTime: v.lastOut.time,
        });
      } catch (err: any) {
        console.error(`reconcile: pozisyon ${positionId} geçmişi alınamadı:`, err?.message ?? err);
      }
    }

    return NextResponse.json({ checkedHours: hours, dealCount: deals.length, positionCount: positions.length, staleChecked, discrepancies });
  } catch (err) {
    console.error('reconcile error:', err);
    return NextResponse.json({ error: 'Mutabakat kontrolü başarısız' }, { status: 500 });
  }
}
