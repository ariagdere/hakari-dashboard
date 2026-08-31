// lib/htfZlema.ts
// 5 dakikalik mumlardan 1H/4H toplulastirma + ZLEMA (Zero-Lag EMA) hesabi.
// TAMAMEN BAGIMSIZ bir modul -- canli sisteme (orchestrator/Make) HICBIR
// SEKILDE dokunmaz, sadece bu FVG lab araci icin. fvgEngine.ts'ten import
// ALMAZ (tek yonlu bagimlilik, dongusel import riski olmasin diye) --
// urettigi ZlemaZoneLookup, fvgEngine.ts'in kendi tanimladigi arayuze
// YAPISAL olarak uyar.
import { Candle } from './fvgEngine';

export type HtfTimeframe = '1h' | '4h';
export type ZoneDirection = 'bullish' | 'bearish' | 'no_trade' | null; // null = veri yok/yetersiz warmup; 'no_trade' = ZLEMA hesaplandi ama net yon YOK

const TF_MS: Record<HtfTimeframe, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
};
const TF_CANDLE_COUNT: Record<HtfTimeframe, number> = {
  '1h': 12, // 60dk / 5dk
  '4h': 48, // 240dk / 5dk
};

// 5dk mumlardan verilen zaman dilimine gore SADECE TAM (eksiksiz) bucket'lari
// uretir -- son bucket, henuz TUM 5dk mumlarini icermiyorsa (dizinin
// ortasinda kesiliyorsa) DAHIL EDILMEZ. Bucket sinirlari SAAT DUVARINA
// (epoch'un tam katlarina) hizalanir, dizinin BASLADIGI noktaya DEGIL --
// aksi halde veri nereden baslarsa baslasin farkli saatlere hizalanir.
export function aggregateCandles(candles: Candle[], tf: HtfTimeframe): Candle[] {
  const bucketMs = TF_MS[tf];
  const expectedCount = TF_CANDLE_COUNT[tf];
  const buckets = new Map<number, Candle[]>();

  for (const c of candles) {
    const bucketStart = Math.floor(c.time / bucketMs) * bucketMs;
    if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
    buckets.get(bucketStart)!.push(c);
  }

  const result: Candle[] = [];
  const sortedStarts = Array.from(buckets.keys()).sort((a, b) => a - b);
  for (const start of sortedStarts) {
    const group = buckets.get(start)!;
    if (group.length !== expectedCount) continue; // eksik bucket -- guvenilmez, atla
    group.sort((a, b) => a.time - b.time);
    result.push({
      time: start,
      open: group[0].open,
      high: Math.max(...group.map(g => g.high)),
      low: Math.min(...group.map(g => g.low)),
      close: group[group.length - 1].close,
    });
  }
  return result;
}

// Kalman filtresi (orchestrator'dan birebir port, JS/Python capraz
// dogrulandi) -- ZLEMA'nin girdisi HAM HLC3 degil, bu filtreden gecmis
// seri olmali (Kalman-once -> ZLEMA-sonra sirasi -- daha once "sonraya
// birakildi" diye planlanmis, simdi uygulaniyor).
function trueRange(candles: Candle[]): number[] {
  const tr = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return tr;
}
function kalmanFilter(src: number[], candles: Candle[]): number[] {
  const n = src.length;
  const tr = trueRange(candles);
  let value1 = 0, value2 = 0, value3 = 0;
  const out: number[] = [];
  let prevSrc: number | null = null;
  for (let i = 0; i < n; i++) {
    const d = prevSrc === null ? 0 : (src[i] - prevSrc);
    value1 = 0.2 * d + 0.8 * value1;
    value2 = 0.1 * tr[i] + 0.8 * value2;
    const lam = value2 !== 0 ? Math.abs(value1 / value2) : 0;
    const inner = Math.pow(lam, 4) + 16 * Math.pow(lam, 2);
    const alpha = inner >= 0 ? (-Math.pow(lam, 2) + Math.sqrt(inner)) / 8 : 0;
    value3 = alpha * src[i] + (1 - alpha) * value3;
    out.push(value3);
    prevSrc = src[i];
  }
  return out;
}

// Standart Zero-Lag EMA (Ehlers). lag = round((period-1)/2) -- orchestrator'in
// KENDI konvansiyonuyla (Math.round) BIREBIR ayni, floor DEGIL. i-lag < 0
// olan (dizinin basindaki) noktalarda da orchestrator gibi closes[0]'i
// referans alir (atlayip null BIRAKMAZ) -- EMA'nin "hafizasi" oldugu icin
// SEED noktasinin farkli olmasi TUM seriyi degistirir, bu yuzden bu detay
// orchestrator'la BIREBIR ayni olmali.
export function computeZLEMA(closes: number[], period: number): (number | null)[] {
  const lag = Math.round((period - 1) / 2);
  const alpha = 2 / (period + 1);
  const result: (number | null)[] = new Array(closes.length).fill(null);
  let prevZlema: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    const lagged = (i - lag >= 0) ? closes[i - lag] : closes[0];
    const deLagPrice = 2 * closes[i] - lagged;
    if (prevZlema == null) {
      prevZlema = deLagPrice; // seed
    } else {
      prevZlema = alpha * deLagPrice + (1 - alpha) * prevZlema;
    }
    result[i] = prevZlema;
  }
  return result;
}

export interface ZlemaZoneSeries {
  htfCandles: Candle[];
  fast: (number | null)[];
  slow: (number | null)[];
  // Canli sistemin KENDI kurali: fast>slow VE fast son 3 mumda ARDISIK
  // artiyorsa bullish; fast<slow VE ARDISIK azaliyorsa bearish; aksi halde
  // (orchestrator'daki NO_TRADE durumu dahil) null.
  zone: ZoneDirection[];
}

// Kalman-filtreli HLC3 serisi uzerinde ZLEMA(fast/slow) hesaplar, SONRA
// canli orchestrator'in KENDI zone kuralini (3-mum ardisik yon + fast/slow
// karsilastirmasi) uygular -- SADECE fast>slow YETERLI DEGIL, fast'in
// KENDISI de son 3 mumda ayni yonde ilerliyor olmali. LONG/SHORT ->
// bullish/bearish; orchestrator'in NO_TRADE'i -> acik 'no_trade' degeri
// (null DEGIL -- null SADECE veri yok/yetersiz warmup anlamina gelir).
export function buildZlemaZoneSeries(candles5m: Candle[], tf: HtfTimeframe, fastPeriod: number, slowPeriod: number): ZlemaZoneSeries {
  const htfCandles = aggregateCandles(candles5m, tf);
  const hlc3 = htfCandles.map(c => (c.high + c.low + c.close) / 3);
  const kalman = kalmanFilter(hlc3, htfCandles);
  const fast = computeZLEMA(kalman, fastPeriod);
  const slow = computeZLEMA(kalman, slowPeriod);
  const zone: ZoneDirection[] = htfCandles.map((_, i) => {
    if (i < 2 || fast[i] == null || slow[i] == null || fast[i - 1] == null || fast[i - 2] == null) return null;
    const f0 = fast[i] as number, f1 = fast[i - 1] as number, f2 = fast[i - 2] as number;
    const s0 = slow[i] as number;
    const inc = f0 > f1 && f1 > f2;
    const dec = f0 < f1 && f1 < f2;
    if (f0 > s0 && inc) return 'bullish';
    if (f0 < s0 && dec) return 'bearish';
    return 'no_trade';
  });
  return { htfCandles, fast, slow, zone };
}

// Verilen bir ANIN (timeMs) icin, o ana kadar KESINLIKLE TAMAMEN KAPANMIS
// olan en son HTF mumunun zone yonunu dondurur -- ILERIYE BAKIS SIZINTISI
// OLMAMASI icin: bucket'in KENDI KAPANIS zamani (bucketStart+bucketMs)
// timeMs'e esit ya da ONCESINDE olmali. Ikili arama ile O(log n).
export function zoneAsOf(series: ZlemaZoneSeries, tf: HtfTimeframe, timeMs: number): ZoneDirection {
  const bucketMs = TF_MS[tf];
  const { htfCandles, zone } = series;
  let lo = 0, hi = htfCandles.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bucketCloseTime = htfCandles[mid].time + bucketMs;
    if (bucketCloseTime <= timeMs) { ans = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  return ans === -1 ? null : zone[ans];
}

// fvgEngine.ts'in ZlemaZoneLookup arayuzune YAPISAL olarak uyan bir nesne
// uretir (import ETMEDEN -- dongusel bagimlilik riskinden kacinmak icin).
export function buildZlemaLookup(candles5m: Candle[], fastPeriod: number, slowPeriod: number) {
  const series1h = buildZlemaZoneSeries(candles5m, '1h', fastPeriod, slowPeriod);
  const series4h = buildZlemaZoneSeries(candles5m, '4h', fastPeriod, slowPeriod);
  return {
    zoneAsOf: (timeMs: number) => ({
      h1: zoneAsOf(series1h, '1h', timeMs),
      h4: zoneAsOf(series4h, '4h', timeMs),
    }),
  };
}
