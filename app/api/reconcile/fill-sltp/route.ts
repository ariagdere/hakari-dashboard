import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  MetatraderDeal, SlTpSource, fetchAllDealsByTimeRange, fetchOpenPositions, fillBlankSlTp, positiveOrNull, resolveMt5SlTp,
} from '@/lib/reconcileHelpers';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

// Mutabakat: DB'de SL ya da TP'si BOS olan order'lari MT5'te tanimli degerle doldurur.
//   - Acik order'lar: MT5'teki acik pozisyonun guncel SL/TP'si.
//   - Son `days` gunde kapanmis order'lar: pozisyonun deal gecmisi -- once kapanis deal'i (MT5
//     gecmisinde gorunen, pozisyonun son SL/TP'si), o yoksa acilis deal'i (bkz. resolveMt5SlTp).
// Yalnizca bos alanlar doldurulur; dolu alana (elle duzeltilmis olabilir) dokunulmaz. rr / r_target /
// r_risk monitor'deki formullerle yeniden hesaplanir. order_events'e yazilmaz (diger fix route'lari gibi).
// Deal'ler tek tek degil, araligin tamami sayfali olarak cekilir (birkac istek).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(Number(body?.days)) || DEFAULT_DAYS));

    const { rows } = await pool.query(
      `SELECT id, mt5_position_id, status, sl, tp, entry_price, fill_price, analysis_id, opened_at, closed_at, created_at
         FROM orders
        WHERE mt5_position_id IS NOT NULL
          AND (sl IS NULL OR tp IS NULL)
          AND (status = 'OPEN'
               OR (status = 'CLOSED' AND COALESCE(closed_at, opened_at, created_at) >= now() - make_interval(days => $1::int)))
        ORDER BY id`,
      [days],
    );

    // order id -> MT5'teki SL/TP
    const mt5 = new Map<number, { sl: number | null; tp: number | null; source: SlTpSource | 'position' | null }>();
    let notFound = 0; // MT5'te bulunamadi (orn. acik sanilan pozisyon kapanmis -- mutabakat kontrolu ayrica gosterir)

    const open = rows.filter((o) => o.status === 'OPEN');
    if (open.length > 0) {
      const positions = await fetchOpenPositions();
      const byId = new Map(positions.map((p) => [String(p.id), p]));
      for (const o of open) {
        const p = byId.get(String(o.mt5_position_id));
        if (!p) { notFound++; continue; }
        mt5.set(o.id, { sl: positiveOrNull(p.stopLoss), tp: positiveOrNull(p.takeProfit), source: 'position' });
      }
    }

    const closed = rows.filter((o) => o.status === 'CLOSED');
    if (closed.length > 0) {
      // Acilis deal'leri de gelsin diye aralik en eski order'in acilisindan baslar
      const earliest = Math.min(...closed.map((o) => new Date(o.opened_at ?? o.closed_at ?? o.created_at).getTime()));
      const deals = await fetchAllDealsByTimeRange(new Date(earliest - 60_000), new Date(Date.now() + 60_000));
      const byPosition = new Map<string, MetatraderDeal[]>();
      for (const d of deals) {
        if (d.positionId == null) continue;
        const key = String(d.positionId);
        const list = byPosition.get(key);
        if (list) list.push(d);
        else byPosition.set(key, [d]);
      }
      for (const o of closed) {
        const list = byPosition.get(String(o.mt5_position_id));
        if (!list) { notFound++; continue; }
        mt5.set(o.id, resolveMt5SlTp(list));
      }
    }

    const filled: Array<Record<string, unknown>> = [];
    let notInMt5 = 0; // bos alan MT5'te de tanimli degil
    for (const o of rows) {
      const v = mt5.get(o.id);
      if (!v) continue;
      const r = await fillBlankSlTp(o, v.sl, v.tp);
      if (r) filled.push({ orderId: o.id, positionId: o.mt5_position_id, status: o.status, source: v.source, ...r });
      else notInMt5++;
    }
    if (filled.length > 0) {
      console.log(`reconcile fill-sltp: ${filled.length} order dolduruldu (${filled.map((f) => `#${f.orderId}`).join(', ')})`);
    }

    return NextResponse.json({ days, checked: rows.length, filled, notInMt5, notFound });
  } catch (err: any) {
    console.error('reconcile fill-sltp error:', err);
    return NextResponse.json({ error: err?.message || 'SL/TP doldurulamadı' }, { status: 500 });
  }
}
