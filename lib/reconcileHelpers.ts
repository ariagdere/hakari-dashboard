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
export function parseCommentField(comment: string | null | undefined): { analysisId: number | null; apifyRunId: string | null } {
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

export interface MetatraderDeal {
  id: string; entryType: string; positionId?: string; orderId?: string;
  volume?: number; price?: number; profit?: number; time: string;
  symbol?: string; magic?: number; type?: string; comment?: string; brokerComment?: string; reason?: string;
}
export interface MetatraderOrder {
  id: string; positionId?: string; stopLoss?: number; takeProfit?: number;
  time: string; doneTime?: string; magic?: number;
}

const METAAPI_TOKEN = process.env.METAAPI_TOKEN!;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID!;
const METAAPI_REGION = process.env.METAAPI_REGION || 'london';

export async function fetchMetaApi(path: string) {
  const url = `https://mt-client-api-v1.${METAAPI_REGION}.agiliumtrade.ai${path}`;
  const res = await fetch(url, { headers: { 'auth-token': METAAPI_TOKEN, Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`MetaApi isteği başarısız (${path}): HTTP ${res.status}`);
  return res.json();
}

export async function fetchDealsByPosition(positionId: string): Promise<MetatraderDeal[]> {
  return fetchMetaApi(`/users/current/accounts/${METAAPI_ACCOUNT_ID}/history-deals/position/${positionId}`);
}
export async function fetchHistoryOrdersByPosition(positionId: string): Promise<MetatraderOrder[]> {
  return fetchMetaApi(`/users/current/accounts/${METAAPI_ACCOUNT_ID}/history-orders/position/${positionId}`);
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
