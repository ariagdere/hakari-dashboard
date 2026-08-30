// lib/fvgEngine.ts
// FVG/IFVG tespit + skorlama + trade setup + sonuc simulasyonu motoru.
// Standalone fvg_test.html aracindaki, uzun sure test edilip kalibre edilmis
// JS mantiginin TypeScript portu -- davranis BIREBIR korunacak sekilde,
// yeniden tasarlanmadan cevrildi. Tek yeni ekleme: trade SONUCU simulasyonu
// (simulateTradeOutcome) -- standalone aracta hic yoktu, gercek backtest
// (win rate / equity curve / Max DD) icin zorunlu.

export interface Candle {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SwingPoint {
  idx: number;
  type: 'high' | 'low';
  price: number;
  // Bu adayi ILK GECERSIZ kilan (esit ya da daha yuksek/dusuk) ileri
  // yondeki mumun indeksi. null = lookback penceresi icinde hicbir mum
  // gecersiz kilmadi (KALICI olarak onaylanmis). Herhangi bir "asOfIdx"
  // icin gecerlilik: invalidatedAtIdx===null || asOfIdx < invalidatedAtIdx.
  invalidatedAtIdx: number | null;
}

export interface SelectedSwing extends SwingPoint {
  distance: number;
}

export type SwingSelectMode = 'nearest' | 'extreme';
export type SlMode = 'swept_swing' | 'fvg_edge';
export type TpFallbackMode = 'no_trade' | '1R' | '2R' | '3R';
export type TradeConditionMode = 'all' | 'any' | 'always';
export type TpPlacementMode = 'exact' | 'percentage' | 'dynamic_zone';

export interface FvgParams {
  swingLookback: number;
  swingSearchWindow: number;
  swingSelectMode: SwingSelectMode;
  sweepProximityPct: number;
  wickBodyRatioMin: number;
  bodyRatioThreshold: number;
  avgRangeLookback: number;
  rangeMultiplier: number;
  fvgMaxAgeCandles: number;
  useSweepCriterion: boolean;
  useBosCriterion: boolean;
  useDisplacementCriterion: boolean;
  slMode: SlMode;
  tpSwingSearchWindow: number;
  tpFallbackMode: TpFallbackMode;
  tradeConditionMode: TradeConditionMode;
  slBufferPct: number;
  tpPlacementMode: TpPlacementMode;
  tpTargetPct: number;
  tpZonePct: number;
  maxTradeDurationCandles: number; // yeni -- outcome simulasyonu icin ust sinir
  sequentialTradesOnly: boolean; // aciksa, bir trade aktifken zaman olarak cakisan sonraki trade'ler iptal edilir
}

export const DEFAULT_PARAMS: FvgParams = {
  swingLookback: 18,
  swingSearchWindow: 36,
  swingSelectMode: 'extreme',
  sweepProximityPct: 0.90,
  wickBodyRatioMin: 1.0,
  bodyRatioThreshold: 0.6,
  avgRangeLookback: 14,
  rangeMultiplier: 1.2,
  fvgMaxAgeCandles: 6,
  useSweepCriterion: true,
  useBosCriterion: false,
  useDisplacementCriterion: false,
  slMode: 'swept_swing',
  tpSwingSearchWindow: 36,
  tpFallbackMode: '3R',
  tradeConditionMode: 'all',
  slBufferPct: 1.0,
  tpPlacementMode: 'exact',
  tpTargetPct: 0.75,
  tpZonePct: 0.70,
  maxTradeDurationCandles: 2880, // 5dk mumda 10 gun
  sequentialTradesOnly: false,
};

export type FvgStatus = 'open' | 'filled' | 'expired';
export type FvgType = 'bullish' | 'bearish';

export interface SweepTraceEntry {
  idx: number | null;
  swingPrice?: number;
  swingDistance?: number;
  proximity?: number;
  wickRatio?: number;
  reason: string;
}

export interface IfvgScore {
  sweep: boolean;
  sweepDistance: number | null;
  sweepSwingIdx: number | null;
  sweepSwingPrice: number | null;
  sweepTrace: SweepTraceEntry[];
  bos: boolean;
  bosDistance: number | null;
  bosSwingIdx: number | null;
  bosSwingPrice: number | null;
  bosApplicable: boolean;
  displacement: boolean | null;
  displacementApplicable: boolean;
  total: number;
  maxScore: number;
}

export interface TradeSetup {
  valid: boolean;
  reason?: string;
  direction?: 'LONG' | 'SHORT';
  entry?: number;
  sl?: number;
  tp?: number;
  rr?: number;
  riskDist?: number;
  rewardDist?: number;
  tpSwingIdx?: number | null;
  tpFallbackUsed?: boolean;
  tpZoneTouchCount?: number | null;
}

export type OutcomeResult = 'TP_HIT' | 'SL_HIT' | 'EXPIRED';

export interface TradeOutcome {
  result: OutcomeResult;
  rMultiple: number;
  durationMins: number;
  closePrice: number | null;
  closeTime: number | null;
}

export interface Fvg {
  type: FvgType;
  top: number;
  bottom: number;
  formedIdx: number;
  filledIdx: number | null;
  status: FvgStatus;
  expiredAtIdx?: number;
  ifvgScore?: IfvgScore;
  tradeSetup?: TradeSetup | null;
  outcome?: TradeOutcome | null;
}

// ── Swing tespiti ────────────────────────────────────────────────────────
// ONEMLI: forward (ileri yon) kontrolu ARTIK "tam lookback ZORUNLU" degil.
// Bir aday, backward (geriye yon) kontrolunu HER ZAMAN tam lookback ile
// gecmelidir (bu guvenlidir -- gecmis veri, asla "henuz gorulmemis" degildir).
// Ileri yonde ise, adayi GECERSIZ kilan ILK mumun indeksi (varsa) kaydedilir
// -- boylece herhangi bir degerlendirme anina (asOfIdx) gore "o an hala
// gecerli miydi" sorusu, TUM veriyi kullanan (ileriye-bakis sizintili) bir
// "evet/hayir" yerine, DOGRU sekilde nokta-zamanli olarak cevaplanabilir.
export function findSwingPoints(candles: Candle[], lookback: number): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = lookback; i < candles.length; i++) {
    let backwardHighOk = true, backwardLowOk = true;
    for (let k = 1; k <= lookback; k++) {
      if (candles[i].high <= candles[i - k].high) backwardHighOk = false;
      if (candles[i].low >= candles[i - k].low) backwardLowOk = false;
    }

    if (backwardHighOk) {
      let invalidatedAtIdx: number | null = null;
      for (let k = 1; k <= lookback && i + k < candles.length; k++) {
        if (candles[i].high <= candles[i + k].high) { invalidatedAtIdx = i + k; break; }
      }
      swings.push({ idx: i, type: 'high', price: candles[i].high, invalidatedAtIdx });
    }
    if (backwardLowOk) {
      let invalidatedAtIdx: number | null = null;
      for (let k = 1; k <= lookback && i + k < candles.length; k++) {
        if (candles[i].low >= candles[i + k].low) { invalidatedAtIdx = i + k; break; }
      }
      swings.push({ idx: i, type: 'low', price: candles[i].low, invalidatedAtIdx });
    }
  }
  return swings;
}

// Bir swing adayinin, verilen degerlendirme anina (asOfIdx) gore HALA
// gecerli olup olmadigini kontrol eder -- invalidation TAM asOfIdx'te
// olsa bile (o mumun kendi verisi ARTIK bilindigi icin) gecersiz sayilir.
export function isSwingValidAsOf(sw: SwingPoint, asOfIdx: number): boolean {
  return sw.invalidatedAtIdx === null || sw.invalidatedAtIdx > asOfIdx;
}


export function selectRelevantSwing(
  swings: SwingPoint[], beforeIdx: number, type: 'high' | 'low',
  mode: SwingSelectMode, window: number
): SelectedSwing | null {
  const windowStart = Math.max(0, beforeIdx - window);
  const candidates = swings.filter(s =>
    s.type === type && s.idx >= windowStart && s.idx < beforeIdx && isSwingValidAsOf(s, beforeIdx)
  );
  if (candidates.length === 0) return null;
  let chosen: SwingPoint;
  if (mode === 'extreme') {
    chosen = type === 'high'
      ? candidates.reduce((a, b) => (b.price > a.price ? b : a))
      : candidates.reduce((a, b) => (b.price < a.price ? b : a));
  } else {
    chosen = candidates[candidates.length - 1];
  }
  return { ...chosen, distance: beforeIdx - chosen.idx };
}

// ── Kriter 1: Likidite Alimi ────────────────────────────────────────────
export function getSweepRange(fvg: Fvg, candlesLength: number, p: FvgParams): { rangeStart: number; rangeEnd: number } {
  const rangeStart = fvg.formedIdx - 1;
  let rangeEnd: number;
  if (fvg.status === 'filled') rangeEnd = fvg.filledIdx as number;
  else if (fvg.status === 'expired') rangeEnd = fvg.expiredAtIdx as number;
  else rangeEnd = Math.min(rangeStart + p.fvgMaxAgeCandles, candlesLength - 1);
  return { rangeStart, rangeEnd };
}

interface SweepResult {
  pass: boolean;
  swingDistance: number | null;
  swingIdx?: number | null;
  swingPrice?: number | null;
  trace: SweepTraceEntry[];
}

export function checkLiquiditySweepOrigin(candles: Candle[], fvg: Fvg, swings: SwingPoint[], p: FvgParams): SweepResult {
  const { rangeStart, rangeEnd } = getSweepRange(fvg, candles.length, p);
  const anchor = rangeEnd;
  const swingType: 'high' | 'low' = fvg.type === 'bullish' ? 'high' : 'low';
  const trace: SweepTraceEntry[] = [];

  const sw = selectRelevantSwing(swings, anchor, swingType, p.swingSelectMode, p.swingSearchWindow);
  if (!sw) {
    trace.push({ idx: anchor, reason: `Mum #${anchor}'e göre son ${p.swingSearchWindow} mum içinde hiç swing ${swingType} bulunamadı` });
    return { pass: false, swingDistance: null, trace };
  }

  const fvgEdge = fvg.type === 'bullish' ? fvg.top : fvg.bottom;
  const totalDist = Math.abs(sw.price - fvgEdge);

  for (let idx = rangeStart; idx <= rangeEnd; idx++) {
    const c = candles[idx];
    if (!c) continue;

    const wickTip = swingType === 'high' ? c.high : c.low;
    const achievedDist = swingType === 'high' ? (wickTip - fvgEdge) : (fvgEdge - wickTip);
    const proximity = totalDist > 0 ? (achievedDist / totalDist) : (achievedDist >= 0 ? 1 : 0);

    if (proximity < p.sweepProximityPct) {
      trace.push({
        idx, swingPrice: sw.price, swingDistance: sw.distance, proximity,
        reason: `yaklaşım %${(proximity * 100).toFixed(0)} — eşik %${(p.sweepProximityPct * 100).toFixed(0)}'ın altında (swing=${sw.price.toFixed(1)})`,
      });
      continue;
    }

    const body = Math.abs(c.close - c.open);
    const wick = swingType === 'high' ? (c.high - Math.max(c.open, c.close)) : (Math.min(c.open, c.close) - c.low);
    const wickRatio = body > 0 ? wick / body : (wick > 0 ? Infinity : 0);

    if (wickRatio < p.wickBodyRatioMin) {
      trace.push({
        idx, swingPrice: sw.price, swingDistance: sw.distance, proximity, wickRatio,
        reason: `yaklaşım %${(proximity * 100).toFixed(0)} yeterli ama iğne/gövde oranı ${wickRatio.toFixed(2)} — eşik ${p.wickBodyRatioMin}'in altında`,
      });
      continue;
    }

    trace.push({ idx, swingPrice: sw.price, swingDistance: sw.distance, proximity, wickRatio, reason: 'GEÇTİ' });
    return { pass: true, swingDistance: sw.distance, swingIdx: sw.idx, swingPrice: sw.price, trace };
  }
  return { pass: false, swingDistance: sw.distance, swingIdx: sw.idx, swingPrice: sw.price, trace };
}

// ── Kriter 2: BOS Ortusmesi (fitil/wick bazli -- kapanis DEGIL) ─────────
interface BosResult {
  pass: boolean;
  swingDistance: number | null;
  swingPrice: number | null;
  swingIdx: number | null;
}

export function checkBOSAtFill(candles: Candle[], fvg: Fvg, swings: SwingPoint[], p: FvgParams): BosResult {
  if (fvg.filledIdx == null) return { pass: false, swingDistance: null, swingPrice: null, swingIdx: null };
  const c = candles[fvg.filledIdx];
  if (fvg.type === 'bullish') {
    const sw = selectRelevantSwing(swings, fvg.filledIdx, 'low', p.swingSelectMode, p.swingSearchWindow);
    const pass = sw ? c.low < sw.price : false;
    return { pass, swingDistance: sw ? sw.distance : null, swingPrice: sw ? sw.price : null, swingIdx: sw ? sw.idx : null };
  } else {
    const sw = selectRelevantSwing(swings, fvg.filledIdx, 'high', p.swingSelectMode, p.swingSearchWindow);
    const pass = sw ? c.high > sw.price : false;
    return { pass, swingDistance: sw ? sw.distance : null, swingPrice: sw ? sw.price : null, swingIdx: sw ? sw.idx : null };
  }
}

// ── Kriter 3: Displacement ───────────────────────────────────────────────
export function checkDisplacementQuality(candles: Candle[], fvg: Fvg, p: FvgParams): boolean {
  if (fvg.filledIdx == null) return false;
  const c = candles[fvg.filledIdx];
  const range = c.high - c.low;
  if (range <= 0) return false;
  const bodyRatio = Math.abs(c.close - c.open) / range;
  const lookback = candles.slice(Math.max(0, fvg.filledIdx - p.avgRangeLookback), fvg.filledIdx);
  const avgRange = lookback.reduce((s, x) => s + (x.high - x.low), 0) / (lookback.length || 1);
  return bodyRatio > p.bodyRatioThreshold && range > p.rangeMultiplier * avgRange;
}

// ── Skor birlestirme ──────────────────────────────────────────────────────
export function scoreIFVG(candles: Candle[], fvg: Fvg, swings: SwingPoint[], p: FvgParams): IfvgScore {
  const sweep = checkLiquiditySweepOrigin(candles, fvg, swings, p);
  const isFilled = fvg.status === 'filled';
  const bos = isFilled ? checkBOSAtFill(candles, fvg, swings, p) : { pass: false, swingDistance: null, swingIdx: null, swingPrice: null };
  const displacement: boolean | null = isFilled ? checkDisplacementQuality(candles, fvg, p) : null;

  const countedChecks: boolean[] = [];
  if (p.useSweepCriterion) countedChecks.push(sweep.pass);
  if (isFilled) {
    if (p.useBosCriterion) countedChecks.push(bos.pass);
    if (p.useDisplacementCriterion) countedChecks.push(!!displacement);
  }

  return {
    sweep: sweep.pass, sweepDistance: sweep.swingDistance, sweepSwingIdx: sweep.swingIdx ?? null, sweepSwingPrice: sweep.swingPrice ?? null, sweepTrace: sweep.trace,
    bos: bos.pass, bosDistance: bos.swingDistance, bosSwingIdx: bos.swingIdx, bosSwingPrice: bos.swingPrice, bosApplicable: isFilled,
    displacement, displacementApplicable: isFilled,
    total: countedChecks.filter(Boolean).length,
    maxScore: countedChecks.length,
  };
}

// ── Trade alma kosulu (AND/OR/her zaman) ─────────────────────────────────
interface GateResult { pass: boolean; reason: string | null; }

function checkTradeCondition(fvg: Fvg, p: FvgParams): GateResult {
  if (p.tradeConditionMode === 'always') return { pass: true, reason: null };
  const s = fvg.ifvgScore;
  if (!s) return { pass: false, reason: 'Skor hesaplanamadı' };
  const relevant: { name: string; val: boolean }[] = [];
  if (p.useSweepCriterion) relevant.push({ name: 'Likidite', val: s.sweep });
  if (p.useBosCriterion) relevant.push({ name: 'BOS', val: s.bos });
  if (p.useDisplacementCriterion) relevant.push({ name: 'Displacement', val: !!s.displacement });
  if (relevant.length === 0) return { pass: true, reason: null };
  const pass = p.tradeConditionMode === 'all' ? relevant.every(r => r.val) : relevant.some(r => r.val);
  return {
    pass,
    reason: pass ? null : `Kriter kapısı geçilemedi (tradeConditionMode=${p.tradeConditionMode}, kriterler: ${relevant.map(r => r.name + (r.val ? '✓' : '✗')).join(' ')})`,
  };
}

// ── Dinamik bolge (max degindigi seviye) ─────────────────────────────────
const DYNAMIC_ZONE_BUCKETS = 20;
function findMaxTouchLevel(candles: Candle[], searchStart: number, searchEnd: number, zoneBottom: number, zoneTop: number): { level: number; touchCount: number } {
  if (zoneTop <= zoneBottom) return { level: (zoneTop + zoneBottom) / 2, touchCount: 0 };
  const bucketSize = (zoneTop - zoneBottom) / DYNAMIC_ZONE_BUCKETS;
  const touchCounts = new Array(DYNAMIC_ZONE_BUCKETS).fill(0);
  for (let idx = searchStart; idx <= searchEnd; idx++) {
    const c = candles[idx];
    if (!c) continue;
    for (let b = 0; b < DYNAMIC_ZONE_BUCKETS; b++) {
      const bLow = zoneBottom + b * bucketSize;
      const bHigh = bLow + bucketSize;
      if (c.high >= bLow && c.low <= bHigh) touchCounts[b]++;
    }
  }
  let maxB = 0;
  for (let b = 1; b < DYNAMIC_ZONE_BUCKETS; b++) if (touchCounts[b] > touchCounts[maxB]) maxB = b;
  return { level: zoneBottom + (maxB + 0.5) * bucketSize, touchCount: touchCounts[maxB] };
}

// ── Trade setup: entry / SL / TP / RR ────────────────────────────────────
export function computeTradeSetup(candles: Candle[], fvg: Fvg, swings: SwingPoint[], p: FvgParams): TradeSetup | null {
  if (fvg.status !== 'filled' || fvg.filledIdx == null) return null;

  const isShort = fvg.type === 'bullish';
  const entry = candles[fvg.filledIdx].close;

  let sl: number;
  if (p.slMode === 'fvg_edge') {
    sl = isShort ? fvg.top : fvg.bottom;
  } else {
    const sweptPrice = fvg.ifvgScore?.sweepSwingPrice ?? null;
    if (sweptPrice == null) {
      return { valid: false, reason: 'Süpürülen swing bulunamadı, SL hesaplanamadı (slMode=swept_swing)' };
    }
    sl = entry + p.slBufferPct * (sweptPrice - entry);
  }

  const riskDist = Math.abs(entry - sl);
  if (riskDist <= 0) {
    return { valid: false, reason: 'SL mesafesi geçersiz (0 veya negatif)' };
  }

  const tpSwingType: 'high' | 'low' = isShort ? 'low' : 'high';
  const tpWindowStart = Math.max(0, fvg.filledIdx - p.tpSwingSearchWindow);
  const candidates = swings.filter(s =>
    s.type === tpSwingType && s.idx >= tpWindowStart && s.idx < (fvg.filledIdx as number) &&
    isSwingValidAsOf(s, fvg.filledIdx as number)
  );

  let tp: number, tpSwingIdx: number | null = null, tpFallbackUsed = false, tpZoneTouchCount: number | null = null;
  if (candidates.length > 0) {
    const nearest = candidates[candidates.length - 1];
    tpSwingIdx = nearest.idx;
    const swingPrice = nearest.price;
    if (p.tpPlacementMode === 'percentage') {
      tp = entry + p.tpTargetPct * (swingPrice - entry);
    } else if (p.tpPlacementMode === 'dynamic_zone') {
      const zoneNear = entry + p.tpZonePct * (swingPrice - entry);
      const zoneBottom = Math.min(zoneNear, swingPrice);
      const zoneTop = Math.max(zoneNear, swingPrice);
      const found = findMaxTouchLevel(candles, tpWindowStart, (fvg.filledIdx as number) - 1, zoneBottom, zoneTop);
      tp = found.level;
      tpZoneTouchCount = found.touchCount;
    } else {
      tp = swingPrice;
    }
  } else if (p.tpFallbackMode === 'no_trade') {
    return { valid: false, reason: `Mum #${tpWindowStart}-#${fvg.filledIdx} penceresinde uygun ters-yönlü swing bulunamadı (tpFallbackMode=no_trade)` };
  } else {
    const rMultiplier = { '1R': 1, '2R': 2, '3R': 3 }[p.tpFallbackMode];
    tp = isShort ? entry - rMultiplier * riskDist : entry + rMultiplier * riskDist;
    tpFallbackUsed = true;
  }

  const rewardDist = Math.abs(tp - entry);
  const rr = rewardDist / riskDist;

  const gate = checkTradeCondition(fvg, p);
  const base = {
    direction: (isShort ? 'SHORT' : 'LONG') as 'LONG' | 'SHORT',
    entry, sl, tp, rr: Math.round(rr * 100) / 100, riskDist, rewardDist, tpSwingIdx, tpFallbackUsed, tpZoneTouchCount,
  };
  if (!gate.pass) {
    return { valid: false, reason: gate.reason ?? undefined, ...base };
  }
  return { valid: true, ...base };
}

// ── Trade SONUCU simulasyonu (YENI -- standalone aractan farkli olarak
// GERCEK backtest icin eklendi). make_naive_pullback_sim_combined.js ve
// naif_sim/core.py'deki AYNI, kanitlanmis mantik: SL kontrolu TP'den ONCE,
// ayni mumda ikisi de tetiklenirse SL kazanir (konservatif varsayim). ────
export function simulateTradeOutcome(
  direction: 'LONG' | 'SHORT', entry: number, tp: number, sl: number,
  startIdx: number, candles: Candle[], maxDurationCandles: number
): TradeOutcome {
  const riskDist = Math.abs(entry - sl);
  const rewardDist = Math.abs(tp - entry);
  const rr = riskDist > 0 ? rewardDist / riskDist : 0;
  const startTime = candles[startIdx].time;
  const cutoffIdx = Math.min(candles.length - 1, startIdx + maxDurationCandles);

  for (let i = startIdx + 1; i <= cutoffIdx; i++) {
    const c = candles[i];
    const slHit = direction === 'LONG' ? c.low <= sl : c.high >= sl;
    const tpHit = direction === 'LONG' ? c.high >= tp : c.low <= tp;
    if (slHit) {
      return { result: 'SL_HIT', rMultiple: -1, durationMins: (c.time - startTime) / 60000, closePrice: sl, closeTime: c.time };
    }
    if (tpHit) {
      return { result: 'TP_HIT', rMultiple: Math.round(rr * 100) / 100, durationMins: (c.time - startTime) / 60000, closePrice: tp, closeTime: c.time };
    }
  }
  const lastC = candles[cutoffIdx];
  return { result: 'EXPIRED', rMultiple: 0, durationMins: (lastC.time - startTime) / 60000, closePrice: null, closeTime: lastC.time };
}

// ── Ana tespit dongusu ────────────────────────────────────────────────────
// ── Sequential trade filtresi ─────────────────────────────────────────────
// Aciksa: zaman sirasiyla gecilir, bir trade "acik" oldugu surece (entry'den
// outcome'un closeTime'ina kadar) o pencereye denk gelen SONRAKI trade'ler
// iptal edilir (tradeSetup.valid=false + aciklayici reason, outcome=null).
// ifvgScore KORUNUR -- kullanici "kriterleri gecmisti ama sequential mode
// yuzunden alinmadi" bilgisini hala gorebilsin diye.
function applySequentialFilter(fvgs: Fvg[], candles: Candle[]): void {
  const withSetup = fvgs
    .filter(f => f.tradeSetup?.valid && f.outcome != null && f.filledIdx != null)
    .sort((a, b) => candles[a.filledIdx as number].time - candles[b.filledIdx as number].time);

  let openUntilTime = -Infinity;

  for (const fvg of withSetup) {
    const entryTime = candles[fvg.filledIdx as number].time;
    if (entryTime < openUntilTime) {
      (fvg.tradeSetup as TradeSetup).valid = false;
      (fvg.tradeSetup as TradeSetup).reason = 'Sequential trade modu: bu noktada başka bir işlem zaten açıktı';
      fvg.outcome = null;
      continue;
    }
    openUntilTime = fvg.outcome?.closeTime ?? entryTime;
  }
}

export function detectFVGs(candles: Candle[], p: FvgParams): Fvg[] {
  const fvgs: Fvg[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const c0 = candles[i - 1], c2 = candles[i + 1];
    if (c0.high < c2.low) {
      fvgs.push({ type: 'bullish', top: c2.low, bottom: c0.high, formedIdx: i + 1, filledIdx: null, status: 'open' });
    } else if (c0.low > c2.high) {
      fvgs.push({ type: 'bearish', top: c0.low, bottom: c2.high, formedIdx: i + 1, filledIdx: null, status: 'open' });
    }
  }

  for (const fvg of fvgs) {
    const expiryIdx = fvg.formedIdx + p.fvgMaxAgeCandles;
    let found: number | null = null;
    for (let j = fvg.formedIdx + 1; j < candles.length && j <= expiryIdx; j++) {
      const c = candles[j];
      const brokenByClose = fvg.type === 'bullish' ? (c.close <= fvg.bottom) : (c.close >= fvg.top);
      if (brokenByClose) { found = j; break; }
    }
    if (found != null) {
      fvg.filledIdx = found;
      fvg.status = 'filled';
    } else if (expiryIdx < candles.length - 1) {
      fvg.status = 'expired';
      fvg.expiredAtIdx = expiryIdx;
    } else {
      fvg.status = 'open';
    }
  }

  const swings = findSwingPoints(candles, p.swingLookback);
  for (const fvg of fvgs) {
    fvg.ifvgScore = scoreIFVG(candles, fvg, swings, p);
    fvg.tradeSetup = computeTradeSetup(candles, fvg, swings, p);
    if (fvg.tradeSetup?.valid && fvg.filledIdx != null) {
      fvg.outcome = simulateTradeOutcome(
        fvg.tradeSetup.direction as 'LONG' | 'SHORT',
        fvg.tradeSetup.entry as number, fvg.tradeSetup.tp as number, fvg.tradeSetup.sl as number,
        fvg.filledIdx, candles, p.maxTradeDurationCandles
      );
    } else {
      fvg.outcome = null;
    }
  }

  if (p.sequentialTradesOnly) {
    applySequentialFilter(fvgs, candles);
  }

  return fvgs;
}
