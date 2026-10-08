import pool from '@/lib/db';
import { PANEL_MAGIC, clientKeyOf } from '@/lib/panelOrder';
import { getMetaApiRestConfig } from '@/lib/metaapiRest';
import { earliestMs } from '@/lib/orderAngles';

// mt5_order_monitor.js'teki STRATEGY_MAP ile BIREBIR AYNI -- orada bir
// strateji eklenirse burada da eklenmeli. Tek kaynak orasi; burasi sadece
// MT5'in kendi gecmisinden order yeniden insa etmek/duzeltmek icin.
export const STRATEGY_MAP: Record<number, string> = {
  6130450: 'V6_Latest 50+',
  6310560: 'V6 60+',
  6310570: 'V6 70+',
  68040: 'V6 80+ 40-',
  65050: 'V6 50- 50+',
  7575: 'NAIF + ZLEMA',
};
export function resolveStrategyLabel(magic: number): string | null {
  return STRATEGY_MAP[Number(magic)] || null;
}

// Panelden acilan emirler (magic 9100) strateji etiketini order_intents'ten alir --
// mt5_order_monitor.js'teki getPanelIntent ile ayni eslestirme (clientId'nin ilk iki parcasi).
// Tablo yoksa ya da eslesme yoksa null: cagiran taraf eski kurallarla devam eder.
export async function resolveIntentLabel(clientId: string | null | undefined): Promise<string | null> {
  const key = clientKeyOf(clientId);
  if (!key) return null;
  try {
    const { rows } = await pool.query('SELECT strategy_label FROM order_intents WHERE client_key = $1', [key]);
    return rows[0]?.strategy_label ?? null;
  } catch {
    return null;
  }
}
export function parseCommentField(comment: string | null | undefined): { analysisId: number | null; apifyRunId: string | null } {
  if (comment == null) return { analysisId: null, apifyRunId: null };
  const s = String(comment).trim();
  if (!s) return { analysisId: null, apifyRunId: null };
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && String(n) === s) return { analysisId: n, apifyRunId: null };
  return { analysisId: null, apifyRunId: s };
}

// Acilis deal'inin kaynagi -- mt5_order_monitor.js'teki resolveOrigin ile AYNI kurallar.
// Panel emri: etiket order_intents'ten; analiz/apify bagi yok (MetaApi clientId'yi MT5'in
// comment alaninda sakladigi icin comment okunmaz, yoksa apify_run_id'ye cop yazilirdi).
// Diger emirler: eski kurallar (comment + magic).
export async function resolveDealOrigin(deal: { clientId?: string; magic?: number; comment?: string; brokerComment?: string }) {
  const intentLabel = await resolveIntentLabel(deal.clientId);
  const isPanel = intentLabel != null || clientKeyOf(deal.clientId) != null || Number(deal.magic) === PANEL_MAGIC;
  const { analysisId, apifyRunId } = isPanel
    ? { analysisId: null, apifyRunId: null }
    : parseCommentField(deal.comment ?? deal.brokerComment);
  const strategyLabel = intentLabel ?? resolveStrategyLabel(Number(deal.magic ?? 0));
  const isSystem = analysisId != null || apifyRunId != null || strategyLabel != null;
  return { isPanel, analysisId, apifyRunId, strategyLabel, isSystem };
}
function priceTolerance(price: number): number {
  return price * 0.0005; // mt5_order_monitor.js'teki priceTolerance ile BIREBIR ayni
}
export function classifyClose(reason: string | undefined, closePrice: number, sl: number | null, tp: number | null, profit: number): { exitReason: 'TP' | 'SL'; isManual: boolean } {
  if (reason === 'DEAL_REASON_SL') return { exitReason: 'SL', isManual: false };
  if (reason === 'DEAL_REASON_TP') return { exitReason: 'TP', isManual: false };
  const tolerance = priceTolerance(closePrice);
  const nearSl = sl != null && Math.abs(closePrice - sl) <= tolerance;
  const nearTp = tp != null && Math.abs(closePrice - tp) <= tolerance;
  if (nearTp) return { exitReason: 'TP', isManual: false };
  if (nearSl) return { exitReason: 'SL', isManual: false };
  return { exitReason: profit >= 0 ? 'TP' : 'SL', isManual: true };
}
export function calculateRR(entry: number | null, sl: number | null, tp: number | null): number | null {
  if (!entry || !sl || !tp) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return null;
  return Number((reward / risk).toFixed(2));
}

// MT5'te 0 = SL/TP tanimli degil (mt5_order_monitor.js'teki positiveOrNull ile AYNI).
export function positiveOrNull(x: unknown): number | null {
  const n = Number(x);
  return x != null && Number.isFinite(n) && n > 0 ? n : null;
}

// mt5_order_monitor.js'teki calculateRTargetRisk ile BIREBIR AYNI: analysis'in orijinal entry/sl'inden
// sizing risk mesafesi; analysis'siz order'da rTarget null, rRisk 1.
export async function calculateRTargetRisk(
  analysisId: number | null, entryPrice: number, sl: number | null, tp: number | null,
): Promise<{ rTarget: number | null; rRisk: number }> {
  if (analysisId == null) return { rTarget: null, rRisk: 1 };
  const { rows } = await pool.query(`SELECT entry, sl FROM btc_analysis WHERE id = $1`, [analysisId]);
  const a = rows[0];
  if (!a || a.entry == null || a.sl == null) return { rTarget: null, rRisk: 1 };
  const sizingRiskDistance = Math.abs(Number(a.entry) - Number(a.sl));
  if (sizingRiskDistance === 0) return { rTarget: null, rRisk: 1 };
  const rTarget = tp != null ? Number((Math.abs(tp - entryPrice) / sizingRiskDistance).toFixed(4)) : null;
  const rRisk = sl != null ? Number((Math.abs(sl - entryPrice) / sizingRiskDistance).toFixed(4)) : 1;
  return { rTarget, rRisk };
}

export type SlTpSource = 'close' | 'open' | 'order';
const CLOSING_ENTRIES = new Set(['DEAL_ENTRY_OUT', 'DEAL_ENTRY_OUT_BY']);
export const isClosingDeal = (d: { entryType?: string }) => CLOSING_ENTRIES.has(d.entryType ?? '');
export const VOLUME_EPS = 0.001; // mt5_order_monitor.js ile AYNI lot toleransi

// Pozisyonun MT5 deal gecmisinden acilan / kapanan hacim (kismi kapanislar dahil). Tamamen kapanmis:
// kapanan >= acilan (acilis deal'i yoksa order'daki hacim). mt5_order_monitor.js closeStateFromDeals ile AYNI.
export function positionVolumes(deals: MetatraderDeal[], fallbackOpenVolume: number) {
  const outs = deals.filter(isClosingDeal).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  const inVolume = deals.filter((d) => d.entryType === 'DEAL_ENTRY_IN').reduce((s, d) => s + Number(d.volume ?? 0), 0);
  const openVolume = inVolume > 0 ? inVolume : fallbackOpenVolume;
  const closedVolume = outs.reduce((s, d) => s + Number(d.volume ?? 0), 0);
  return {
    outs,
    openVolume,
    closedVolume,
    lastOut: outs.length > 0 ? outs[outs.length - 1] : null,
    fullyClosed: outs.length > 0 && closedVolume >= openVolume - VOLUME_EPS,
  };
}
const newestFirst = (a: string | undefined, b: string | undefined) => ((a ?? '') < (b ?? '') ? 1 : (a ?? '') > (b ?? '') ? -1 : 0);

// Bir pozisyonun MT5'te tanimli SL/TP'si, deal (ve istenirse history order) gecmisinden. Oncelik:
//   1) kapanis deal'i (en son SL/TP tasiyan) -- MetaApi'ye gore pozisyonun bilinen SON SL/TP'si;
//      MT5 gecmisinde gorunen deger budur
//   2) acilis deal'i -- pozisyonu acan emrin SL/TP'si (kapanis deal'leri SL/TP tasimiyorsa)
//   3) history order'lar (en son SL/TP tasiyan) -- yalnizca verilirse (deal'lerde hic yoksa)
// SL ya da TP'den birini tasiyan kaynak esas alinir: orn. kapanis deal'inde TP var SL yoksa SL kapanista
// tanimli degildi (kaldirilmisti) demektir; acilistaki SL'e dusulmez.
export function resolveMt5SlTp(
  deals: MetatraderDeal[], orders: MetatraderOrder[] = [],
): { sl: number | null; tp: number | null; source: SlTpSource | null } {
  const levels = (x: { stopLoss?: number; takeProfit?: number }) => {
    const sl = positiveOrNull(x.stopLoss);
    const tp = positiveOrNull(x.takeProfit);
    return sl != null || tp != null ? { sl, tp } : null;
  };
  const closes = deals.filter((d) => CLOSING_ENTRIES.has(d.entryType)).sort((a, b) => newestFirst(a.time, b.time));
  for (const d of closes) {
    const v = levels(d);
    if (v) return { ...v, source: 'close' };
  }
  const inDeal = deals.find((d) => d.entryType === 'DEAL_ENTRY_IN');
  const fromOpen = inDeal ? levels(inDeal) : null;
  if (fromOpen) return { ...fromOpen, source: 'open' };
  const byTime = [...orders].sort((a, b) => newestFirst(a.doneTime || a.time, b.doneTime || b.time));
  for (const o of byTime) {
    const v = levels(o);
    if (v) return { ...v, source: 'order' };
  }
  return { sl: null, tp: null, source: null };
}

export interface SlTpFillTarget {
  id: number;
  sl: unknown;
  tp: unknown;
  entry_price: unknown;
  fill_price: unknown;
  analysis_id: number | null;
}

// Order'in BOS olan SL/TP'sini MT5 degeriyle doldurur; dolu alana dokunmaz (EditableSlTp ile elle
// duzeltilmis olabilir). rr / r_target / r_risk monitor'deki fillMissingSlTp ile ayni formullerle
// yeniden hesaplanir. order_events'e yazilmaz. Doldurulacak bir sey yoksa null doner.
export async function fillBlankSlTp(order: SlTpFillTarget, mt5Sl: number | null, mt5Tp: number | null) {
  const curSl = order.sl != null ? Number(order.sl) : null;
  const curTp = order.tp != null ? Number(order.tp) : null;
  const filledSl = curSl == null && mt5Sl != null;
  const filledTp = curTp == null && mt5Tp != null;
  if (!filledSl && !filledTp) return null;
  const sl = curSl ?? mt5Sl;
  const tp = curTp ?? mt5Tp;
  const entry = Number(order.fill_price ?? order.entry_price);
  const rr = calculateRR(entry, sl, tp);
  const { rTarget, rRisk } = await calculateRTargetRisk(order.analysis_id, entry, sl, tp);
  // COALESCE + WHERE: okuma ile yazma arasinda elle girilen deger ezilmesin
  const { rowCount } = await pool.query(
    `UPDATE orders SET sl = COALESCE(sl, $1), tp = COALESCE(tp, $2), rr = $3, r_target = $4, r_risk = $5, updated_at = now()
      WHERE id = $6 AND (sl IS NULL OR tp IS NULL)`,
    [sl, tp, rr, rTarget, rRisk, order.id],
  );
  if (!rowCount) return null;
  return { sl, tp, rr, rTarget, rRisk, filledSl, filledTp };
}

// Order'in MT5'te olustugu an (ms): acilis deal'ini olusturan emrin verildigi an ile deal aninin
// erkeni. Monitor islemi canli gorseydi order'i bu anda yazardi -- bekleyen emirde emir verildiginde
// (pollOrders), piyasa emrinde acilis deal'i geldiginde (handleDealIn). Mutabakatla eklenen order'in
// created_at'i ve LSR acilari bu ana gore yazilir. Emir bulunamazsa deal ani.
export function mt5OrderTimeMs(
  inDeal: { time?: unknown; orderId?: unknown },
  orders: Array<{ id?: unknown; time?: unknown }> = [],
): number | null {
  const opening = inDeal.orderId != null ? orders.find((o) => String(o.id) === String(inDeal.orderId)) : undefined;
  return earliestMs(opening?.time, inDeal.time);
}

export interface MetatraderDeal {
  id: string; entryType: string; positionId?: string; orderId?: string;
  volume?: number; price?: number; profit?: number; time: string;
  symbol?: string; magic?: number; type?: string; comment?: string; brokerComment?: string; reason?: string;
  clientId?: string;
  // MetaApi: acilis deal'inde pozisyonu acan emrin SL/TP'si, kapanis deal'inde pozisyonun bilinen son SL/TP'si
  stopLoss?: number; takeProfit?: number;
}
export interface MetatraderOrder {
  id: string; positionId?: string; stopLoss?: number; takeProfit?: number;
  time: string; doneTime?: string; magic?: number;
}

export interface MetatraderPosition {
  id: string; type: string; symbol: string; volume: number; openPrice: number;
  stopLoss?: number; takeProfit?: number; magic?: number; comment?: string; brokerComment?: string;
  time: string;
}

const METAAPI_TIMEOUT_MS = 30_000;

// Hesaba ait MetaApi REST yolu (orn. '/positions'). Ayarlar lib/metaapiRest.ts'ten (diger route'larla ayni).
export async function fetchMetaApi(accountPath: string, timeoutMs = METAAPI_TIMEOUT_MS) {
  const cfg = getMetaApiRestConfig();
  if (!cfg) throw new Error('METAAPI_TOKEN / METAAPI_ACCOUNT_ID tanımlı değil');
  let res: Response;
  try {
    res = await fetch(`${cfg.clientApi}/users/current/accounts/${cfg.accountId}${accountPath}`, {
      headers: { 'auth-token': cfg.token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError') throw new Error(`MetaApi ${timeoutMs / 1000} sn'de yanıt vermedi (${accountPath})`);
    throw err;
  }
  if (!res.ok) throw new Error(`MetaApi isteği başarısız (${accountPath}): HTTP ${res.status}`);
  return res.json();
}

const fmtTime = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z'); // MetaAPI ISO formati

export async function fetchOpenPositions(): Promise<MetatraderPosition[]> {
  return fetchMetaApi(`/positions`);
}
export async function fetchDealsByTimeRange(startTime: Date, endTime: Date): Promise<MetatraderDeal[]> {
  return fetchMetaApi(`/history-deals/time/${fmtTime(startTime)}/${fmtTime(endTime)}?limit=1000`);
}
// Uzun araliklar icin: 1000'lik sayfalarla hepsini ceker (en fazla maxPages sayfa).
const DEALS_PAGE = 1000;
export async function fetchAllDealsByTimeRange(startTime: Date, endTime: Date, maxPages = 20): Promise<MetatraderDeal[]> {
  const out: MetatraderDeal[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch: MetatraderDeal[] = await fetchMetaApi(
      `/history-deals/time/${fmtTime(startTime)}/${fmtTime(endTime)}?offset=${page * DEALS_PAGE}&limit=${DEALS_PAGE}`,
    );
    out.push(...batch);
    if (batch.length < DEALS_PAGE) return out;
  }
  console.warn(`fetchAllDealsByTimeRange: ${maxPages * DEALS_PAGE} deal sınırına ulaşıldı, kalanlar alınmadı`);
  return out;
}
export async function fetchDealsByPosition(positionId: string): Promise<MetatraderDeal[]> {
  return fetchMetaApi(`/history-deals/position/${positionId}`);
}
export async function fetchHistoryOrdersByPosition(positionId: string, timeoutMs?: number): Promise<MetatraderOrder[]> {
  return fetchMetaApi(`/history-orders/position/${positionId}`, timeoutMs);
}

// Bir pozisyonun TUM DEAL_ENTRY_OUT deal'lerinden hacim-agirlikli ortalama
// kapanis fiyati + toplam kar -- mt5_order_monitor.js'in handleDealOut'undaki
// BIREBIR AYNI mantik.
export function summarizeCloseDeals(outDeals: MetatraderDeal[]) {
  let totalPnl = 0, weightedPriceSum = 0, totalVolume = 0;
  for (const d of outDeals) {
    const vol = Number(d.volume ?? 0);
    totalPnl += Number(d.profit ?? 0);
    weightedPriceSum += Number(d.price ?? 0) * vol;
    totalVolume += vol;
  }
  const avgClosePrice = totalVolume > 0 ? weightedPriceSum / totalVolume : Number(outDeals[outDeals.length - 1].price ?? 0);
  const lastOutDeal = outDeals.reduce((a, b) => (a.time > b.time ? a : b));
  return { totalPnl, avgClosePrice, lastOutDeal, totalVolume };
}
