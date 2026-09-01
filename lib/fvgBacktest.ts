// lib/fvgBacktest.ts
// detectFVGs() sonuclarindan ozet backtest istatistikleri (equity curve,
// max drawdown, win rate) uretir. fvgEngine.ts'in "tek FVG degerlendirme"
// sorumlulugundan ayri tutuluyor -- bu dosya "toplu sonuc raporlama".
import { Fvg, Candle, ZoneDirection } from './fvgEngine';
import { ClusterSnapshotData, LiquidityContext, computeLiquidityContext } from './liquidityCluster';

// candle_analysis_match uzerinden btc_analysis'a eslesen piyasa/likidasyon
// baglami -- SADECE goruntuleme/analiz icindir, FVG motorunun skorlama/kapi
// mantigina HICBIR SEKILDE dahil edilmez (motor tamamen bagimsiz kalir).
export interface MarketContext {
  sentSynthesisMtf: string | null;
  sentSynthesisH1: string | null;
  sentSynthesisM5: string | null;
  sentLiquidity: string | null;
  rsi4h: number | null;
  h1LsRatioStart: number | null; h1LsRatioCurrent: number | null;
  h1TtPositionsStart: number | null; h1TtPositionsCurrent: number | null;
  h1TtAccountsStart: number | null; h1TtAccountsCurrent: number | null;
  h1OiStart: number | null; h1OiCurrent: number | null;
  h1OiMcapStart: number | null; h1OiMcapCurrent: number | null;
  m5LsRatioStart: number | null; m5LsRatioCurrent: number | null;
  m5TtPositionsStart: number | null; m5TtPositionsCurrent: number | null;
  m5TtAccountsStart: number | null; m5TtAccountsCurrent: number | null;
  m5OiStart: number | null; m5OiCurrent: number | null;
  m5OiMcapStart: number | null; m5OiMcapCurrent: number | null;
  matchedAnalysisId: number | null;
  matchedDiffSeconds: number | null;
}

export interface SimTrade {
  fvgIndex: number; // fvgs[] dizisindeki orijinal indeks -- tablo tiklamasini grafik secimine baglamak icin
  fvgType: string;
  direction: string;
  formedAt: number;
  filledAt: number;
  sweepPass: boolean | null;
  bosPass: boolean | null;
  displacementPass: boolean | null;
  displacementBodyRatio: number | null;
  displacementBodyRatioPass: boolean | null;
  displacementRange: number | null;
  displacementAvgRange: number | null;
  displacementRangePass: boolean | null;
  zlema1hPass: boolean | null;
  zlema4hPass: boolean | null;
  zlema1hReversePass: boolean | null;
  zlema1hNoTradePass: boolean | null;
  zlema4hReversePass: boolean | null;
  zlema4hNoTradePass: boolean | null;
  minGapSizePass: boolean;
  gapSize: number;
  efficiencyPass: boolean | null;
  efficiencyRatio: number | null;
  liqClusterNearPass: boolean | null;
  liqClusterFarPass: boolean | null;
  zlema1hZone: ZoneDirection; // pass/fail'den FARKLI -- trade yonune BAKMADAN, o andaki HAM zone degeri (dogrulama/inceleme icin)
  zlema4hZone: ZoneDirection;
  marketContext: MarketContext | null;
  liquidityContext: LiquidityContext | null;
  entry: number;
  sl: number;
  tp: number;
  rr: number | null;
  result: string;
  rMultiple: number;
  closedAt: number | null;
}

export interface EquityPoint { t: number; cumR: number; tradeCount: number; periodR: number; }
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
  maxConsecutiveWins: number;
  maxConcurrentTrades: number;
}

export function extractTrades(
  fvgs: Fvg[], candles: Candle[],
  marketContextByTime?: Map<number, MarketContext>,
  clusterSnapshotByTime?: Map<number, ClusterSnapshotData>
): SimTrade[] {
  const trades: SimTrade[] = [];
  for (let i = 0; i < fvgs.length; i++) {
    const f = fvgs[i];
    if (!f.tradeSetup?.valid || f.outcome == null) continue;
    const filledTime = candles[f.filledIdx as number].time;
    const entryPrice = f.tradeSetup!.entry as number;
    trades.push({
      fvgIndex: i,
      fvgType: f.type,
      direction: f.tradeSetup!.direction as string,
      formedAt: candles[f.formedIdx].time,
      filledAt: filledTime,
      sweepPass: f.ifvgScore?.sweep ?? null,
      bosPass: f.ifvgScore?.bosApplicable ? f.ifvgScore.bos : null,
      displacementPass: f.ifvgScore?.displacement ?? null,
      displacementBodyRatio: f.ifvgScore?.displacementBodyRatio ?? null,
      displacementBodyRatioPass: f.ifvgScore?.displacementBodyRatioPass ?? null,
      displacementRange: f.ifvgScore?.displacementRange ?? null,
      displacementAvgRange: f.ifvgScore?.displacementAvgRange ?? null,
      displacementRangePass: f.ifvgScore?.displacementRangePass ?? null,
      zlema1hPass: f.ifvgScore?.zlemaApplicable ? f.ifvgScore.zlema1hAligned : null,
      zlema4hPass: f.ifvgScore?.zlemaApplicable ? f.ifvgScore.zlema4hAligned : null,
      zlema1hReversePass: f.ifvgScore?.zlemaApplicable ? f.ifvgScore.zlema1hReverse : null,
      zlema1hNoTradePass: f.ifvgScore?.zlemaApplicable ? f.ifvgScore.zlema1hNoTrade : null,
      zlema4hReversePass: f.ifvgScore?.zlemaApplicable ? f.ifvgScore.zlema4hReverse : null,
      zlema4hNoTradePass: f.ifvgScore?.zlemaApplicable ? f.ifvgScore.zlema4hNoTrade : null,
      minGapSizePass: f.ifvgScore?.minGapSizePass ?? false,
      gapSize: f.ifvgScore?.gapSize ?? 0,
      efficiencyPass: f.ifvgScore?.efficiencyPass ?? null,
      efficiencyRatio: f.ifvgScore?.efficiencyRatio ?? null,
      liqClusterNearPass: f.ifvgScore?.liqClusterApplicable ? f.ifvgScore.liqClusterNear : null,
      liqClusterFarPass: f.ifvgScore?.liqClusterApplicable ? f.ifvgScore.liqClusterFar : null,
      zlema1hZone: f.ifvgScore?.zlema1h ?? null,
      zlema4hZone: f.ifvgScore?.zlema4h ?? null,
      marketContext: marketContextByTime ? (marketContextByTime.get(filledTime) ?? null) : null,
      liquidityContext: clusterSnapshotByTime
        ? computeLiquidityContext(entryPrice, clusterSnapshotByTime.get(filledTime))
        : null,
      entry: entryPrice,
      sl: f.tradeSetup!.sl as number,
      tp: f.tradeSetup!.tp as number,
      rr: f.tradeSetup!.rr ?? null,
      result: f.outcome!.result,
      rMultiple: f.outcome!.rMultiple,
      closedAt: f.outcome!.closeTime,
    });
  }
  return trades;
}

// En uzun ARDISIK TP_HIT serisi -- SL_HIT veya EXPIRED seriyi sifirlar.
function computeMaxConsecutiveWins(sortedTrades: SimTrade[]): number {
  let maxStreak = 0, current = 0;
  for (const t of sortedTrades) {
    if (t.result === 'TP_HIT') {
      current += 1;
      if (current > maxStreak) maxStreak = current;
    } else {
      current = 0;
    }
  }
  return maxStreak;
}

// Ayni anda ACIK olan (entry'den close'a kadar) en fazla trade sayisi.
// AYNI ANDA bir kapanis + bir acilis varsa, KAPANIS ONCE islenir --
// sequential filtrenin kendi siniriyla (entryTime < openUntilTime) TUTARLI:
// bir trade tam o an kapanan bir baskasinin yerine "cakismadan" girebilir.
function computeMaxConcurrentTrades(trades: SimTrade[]): number {
  const events: { time: number; delta: number; isClose: boolean }[] = [];
  for (const t of trades) {
    events.push({ time: t.filledAt, delta: 1, isClose: false });
    events.push({ time: t.closedAt ?? t.filledAt, delta: -1, isClose: true });
  }
  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.isClose === b.isClose) return 0;
    return a.isClose ? -1 : 1; // kapanis (-1) once
  });
  let current = 0, max = 0;
  for (const e of events) {
    current += e.delta;
    if (current > max) max = current;
  }
  return max;
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

  return {
    totalTrades, winRate, totalR, maxDD: Math.round(maxDD * 100) / 100, wins, losses, expired,
    maxConsecutiveWins: computeMaxConsecutiveWins(sorted),
    maxConcurrentTrades: computeMaxConcurrentTrades(trades),
  };
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
  const buckets = new Map<number, { cumR: number; tradeCount: number; periodR: number }>();
  let cum = 0;
  for (const t of sortedTrades) {
    cum += t.rMultiple;
    const key = bucketKey(t.closedAt ?? 0, granularity);
    const existing = buckets.get(key);
    if (existing) {
      existing.cumR = cum; // donem icindeki EN SON kumulatif deger
      existing.tradeCount += 1;
      existing.periodR += t.rMultiple;
    } else {
      buckets.set(key, { cumR: cum, tradeCount: 1, periodR: t.rMultiple });
    }
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({
      t, cumR: Math.round(v.cumR * 100) / 100,
      tradeCount: v.tradeCount, periodR: Math.round(v.periodR * 100) / 100,
    }));
}

export function computeEquityCurve(trades: SimTrade[]): EquityCurve {
  const sorted = [...trades].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
  let cum = 0;
  const raw: EquityPoint[] = sorted.map(t => {
    cum += t.rMultiple;
    return { t: t.closedAt ?? 0, cumR: Math.round(cum * 100) / 100, tradeCount: 1, periodR: Math.round(t.rMultiple * 100) / 100 };
  });
  return {
    raw,
    daily: aggregateBucketed(sorted, 'daily'),
    weekly: aggregateBucketed(sorted, 'weekly'),
    monthly: aggregateBucketed(sorted, 'monthly'),
  };
}

// ── Gun/saat kirilim tablolari (UTC+3 / Istanbul -- proje konvansiyonu) ───
export interface BreakdownBucket {
  label: string;
  count: number;
  winRate: number;
  totalR: number;
}

const DAY_NAMES_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

function makeBreakdown(trades: SimTrade[], bucketCount: number, getBucketIdx: (d: Date) => number, labelFor: (i: number) => string): BreakdownBucket[] {
  const buckets = Array.from({ length: bucketCount }, () => ({ count: 0, wins: 0, losses: 0, totalR: 0 }));
  for (const t of trades) {
    const d = new Date(t.filledAt + 3 * 3600 * 1000); // UTC+3 (Istanbul) -- proje konvansiyonu (bkz. FvgLabTradeTable.fmtTime)
    const b = buckets[getBucketIdx(d)];
    b.count += 1;
    b.totalR += t.rMultiple;
    if (t.result === 'TP_HIT') b.wins += 1;
    else if (t.result === 'SL_HIT') b.losses += 1;
  }
  return buckets.map((b, i) => ({
    label: labelFor(i),
    count: b.count,
    winRate: (b.wins + b.losses) > 0 ? Math.round((b.wins / (b.wins + b.losses)) * 1000) / 10 : 0,
    totalR: Math.round(b.totalR * 100) / 100,
  }));
}

export function computeDayOfWeekBreakdown(trades: SimTrade[]): BreakdownBucket[] {
  return makeBreakdown(
    trades, 7,
    d => { const jsDay = d.getUTCDay(); return jsDay === 0 ? 6 : jsDay - 1; }, // Pazartesi=0 ... Pazar=6'ya cevir
    i => DAY_NAMES_TR[i]
  );
}

export function computeHourOfDayBreakdown(trades: SimTrade[]): BreakdownBucket[] {
  return makeBreakdown(
    trades, 24,
    d => d.getUTCHours(),
    i => `${String(i).padStart(2, '0')}:00`
  );
}
