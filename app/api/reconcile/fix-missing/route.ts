import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const METAAPI_TOKEN = process.env.METAAPI_TOKEN!;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID!;
const METAAPI_REGION = process.env.METAAPI_REGION || 'london';

// mt5_order_monitor.js'teki STRATEGY_MAP ile BIREBIR AYNI -- orada bir
// strateji eklenirse burada da eklenmeli. Tek kaynak orasi; burasi sadece
// eksik order'lari MT5'in kendi gecmisinden yeniden insa etmek icin.
const STRATEGY_MAP: Record<number, string> = {
  6130450: 'V6_Latest 50+',
  6310560: 'V6 60+',
  6310570: 'V6 70+',
  68040: 'V6 80+ 40-',
  65050: 'V6 50- 50+',
  7575: 'NAIF + ZLEMA',
};
function resolveStrategyLabel(magic: number): string | null {
  return STRATEGY_MAP[Number(magic)] || null;
}
function parseCommentField(comment: string | null | undefined): { analysisId: number | null; apifyRunId: string | null } {
  if (comment == null) return { analysisId: null, apifyRunId: null };
  const s = String(comment).trim();
  if (!s) return { analysisId: null, apifyRunId: null };
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && String(n) === s) return { analysisId: n, apifyRunId: null };
  return { analysisId: null, apifyRunId: s };
}
function priceTolerance(price: number): number {
  return price * 0.0005; // mt5_order_monitor.js'teki priceTolerance ile BIREBIR ayni
}
function classifyClose(reason: string | undefined, closePrice: number, sl: number | null, tp: number | null, profit: number): { exitReason: 'TP' | 'SL'; isManual: boolean } {
  if (reason === 'DEAL_REASON_SL') return { exitReason: 'SL', isManual: false };
  if (reason === 'DEAL_REASON_TP') return { exitReason: 'TP', isManual: false };
  const tolerance = priceTolerance(closePrice);
  const nearSl = sl != null && Math.abs(closePrice - sl) <= tolerance;
  const nearTp = tp != null && Math.abs(closePrice - tp) <= tolerance;
  if (nearTp) return { exitReason: 'TP', isManual: false };
  if (nearSl) return { exitReason: 'SL', isManual: false };
  return { exitReason: profit >= 0 ? 'TP' : 'SL', isManual: true };
}
function calculateRR(entry: number | null, sl: number | null, tp: number | null): number | null {
  if (!entry || !sl || !tp) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return null;
  return Number((reward / risk).toFixed(2));
}

interface MetatraderDeal {
  id: string; entryType: string; positionId?: string; orderId?: string;
  volume?: number; price?: number; profit?: number; time: string;
  symbol?: string; magic?: number; type?: string; comment?: string; brokerComment?: string; reason?: string;
}
interface MetatraderOrder {
  id: string; positionId?: string; stopLoss?: number; takeProfit?: number;
  time: string; doneTime?: string; magic?: number;
}

async function fetchJson(path: string) {
  const url = `https://mt-client-api-v1.${METAAPI_REGION}.agiliumtrade.ai${path}`;
  const res = await fetch(url, { headers: { 'auth-token': METAAPI_TOKEN, Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`MetaApi isteği başarısız (${path}): HTTP ${res.status}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const positionId = body?.positionId as string;
    if (!positionId) return NextResponse.json({ error: 'positionId zorunlu' }, { status: 400 });

    // Ayni pozisyon icin zaten bir order VARSA (baska bir istekle
    // olusturulmus olabilir) -- tekrar INSERT ETME.
    const { rows: existingRows } = await pool.query(`SELECT id FROM orders WHERE mt5_position_id = $1`, [positionId]);
    if (existingRows.length > 0) {
      return NextResponse.json({ error: 'Bu position için order zaten var', orderId: existingRows[0].id }, { status: 409 });
    }

    const deals: MetatraderDeal[] = await fetchJson(`/users/current/accounts/${METAAPI_ACCOUNT_ID}/history-deals/position/${positionId}`);
    const orders: MetatraderOrder[] = await fetchJson(`/users/current/accounts/${METAAPI_ACCOUNT_ID}/history-orders/position/${positionId}`);

    const inDeal = deals.find((d) => d.entryType === 'DEAL_ENTRY_IN');
    const outDeals = deals.filter((d) => d.entryType === 'DEAL_ENTRY_OUT');
    if (!inDeal) return NextResponse.json({ error: 'Açılış deal\'i (DEAL_ENTRY_IN) bulunamadı' }, { status: 404 });
    if (outDeals.length === 0) return NextResponse.json({ error: 'Kapanış deal\'i bulunamadı -- pozisyon henüz açık olabilir' }, { status: 400 });

    // Hacim-agirlikli ortalama kapanis fiyati + toplam kar -- mt5_order_monitor.js'in
    // handleDealOut'undaki BIREBIR AYNI mantik.
    let totalPnl = 0, weightedPriceSum = 0, totalVolume = 0;
    for (const d of outDeals) {
      const vol = Number(d.volume ?? 0);
      totalPnl += Number(d.profit ?? 0);
      weightedPriceSum += Number(d.price ?? 0) * vol;
      totalVolume += vol;
    }
    const avgClosePrice = totalVolume > 0 ? weightedPriceSum / totalVolume : Number(outDeals[outDeals.length - 1].price ?? 0);
    const lastOutDeal = outDeals.reduce((a, b) => (a.time > b.time ? a : b));

    // SL/TP: bu position'a ait TUM history order kayitlarindan, EN SON
    // (zaman olarak en gec) olanin stopLoss/takeProfit'i -- kapanis anindaki
    // GUNCEL degeri yansitir (mt5_order_monitor.js'te de her degisiklik
    // orders.sl/tp'yi GUNCEL tutuyordu, ayni mantik).
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
