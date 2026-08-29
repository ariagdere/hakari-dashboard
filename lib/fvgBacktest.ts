// lib/fvgBacktest.ts
// detectFVGs() sonuclarindan ozet backtest istatistikleri (equity curve,
// max drawdown, win rate) uretir. fvgEngine.ts'in "tek FVG degerlendirme"
// sorumlulugundan ayri tutuluyor -- bu dosya "toplu sonuc raporlama".
import { Fvg, Candle } from './fvgEngine';

export interface SimTrade {
  fvgType: string;
  direction: string;
  formedAt: number;
  filledAt: number;
  sweepPass: boolean | null;
  bosPass: boolean | null;
  displacementPass: boolean | null;
  entry: number;
  sl: number;
  tp: number;
  rr: number | null;
  result: string;
  rMultiple: number;
  closedAt: number | null;
}

export interface EquityPoint { t: number; cumR: number; }
export interface EquityCurve {
  raw: EquityPoint[];
  daily: EquityPoint[];
  weekly: EquityPoint[];
  monthly: EquityPoint[];
}

export interface SimMetrics {
  totalTrades: number;
  winRate: number;
  totalR: number;
  maxDD: number;
  wins: number; losses: number; expired: number;
}

export function extractTrades(fvgs: Fvg[], candles: Candle[]): SimTrade[] {
  return fvgs
    .filter(f => f.tradeSetup?.valid && f.outcome != null)
    .map(f => ({
      fvgType: f.type,
      direction: f.tradeSetup!.direction as string,
      formedAt: candles[f.formedIdx].time,
      filledAt: candles[f.filledIdx as number].time,
      sweepPass: f.ifvgScore?.sweep ?? null,
      bosPass: f.ifvgScore?.bosApplicable ? f.ifvgScore.bos : null,
      displacementPass: f.ifvgScore?.displacement ?? null,
      entry: f.tradeSetup!.entry as number,
      sl: f.tradeSetup!.sl as number,
      tp: f.tradeSetup!.tp as number,
      rr: f.tradeSetup!.rr ?? null,
      result: f.outcome!.result,
      rMultiple: f.outcome!.rMultiple,
      closedAt: f.outcome!.closeTime,
    }));
}

export function computeMetrics(trades: SimTrade[]): SimMetrics {
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.result === 'TP_HIT').length;
  const losses = trades.filter(t => t.result === 'SL_HIT').length;
  const expired = trades.filter(t => t.result === 'EXPIRED').length;
  const decided = wins + losses; // win rate expired'lari HARIC tutar (naif_sim konvansiyonuyla tutarli)
  const winRate = decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0;
  const totalR = Math.round(trades.reduce((s, t) => s + t.rMultiple, 0) * 100) / 100;

  // Max drawdown: zaman sirali kumulatif R serisinin running-peak'ten en buyuk dususu
  const sorted = [...trades].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
  let cum = 0, peak = 0, maxDD = 0;
  for (const t of sorted) {
    cum += t.rMultiple;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }

  return { totalTrades, winRate, totalR, maxDD: Math.round(maxDD * 100) / 100, wins, losses, expired };
}

function bucketKey(ms: number, granularity: 'daily' | 'weekly' | 'monthly'): number {
  const d = new Date(ms);
  if (granularity === 'daily') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (granularity === 'monthly') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  // weekly -- Pazartesi baslangicli hafta
  const day = d.getUTCDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
  return monday.getTime();
}

function aggregateBucketed(sortedTrades: SimTrade[], granularity: 'daily' | 'weekly' | 'monthly'): EquityPoint[] {
  const buckets = new Map<number, number>(); // bucketKey -> o donemin SONUNDAKI kumulatif R
  let cum = 0;
  for (const t of sortedTrades) {
    cum += t.rMultiple;
    const key = bucketKey(t.closedAt ?? 0, granularity);
    buckets.set(key, cum); // her zaman en son deger kalir (donem icindeki son islem)
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([t, cumR]) => ({ t, cumR }));
}

export function computeEquityCurve(trades: SimTrade[]): EquityCurve {
  const sorted = [...trades].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
  let cum = 0;
  const raw: EquityPoint[] = sorted.map(t => {
    cum += t.rMultiple;
    return { t: t.closedAt ?? 0, cumR: Math.round(cum * 100) / 100 };
  });
  return {
    raw,
    daily: aggregateBucketed(sorted, 'daily'),
    weekly: aggregateBucketed(sorted, 'weekly'),
    monthly: aggregateBucketed(sorted, 'monthly'),
  };
}
