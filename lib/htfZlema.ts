// lib/htfZlema.ts
// 5 dakikalik mumlardan 1H/4H toplulastirma + ZLEMA (Zero-Lag EMA) hesabi.
// TAMAMEN BAGIMSIZ bir modul -- canli sisteme (orchestrator/Make) HICBIR
// SEKILDE dokunmaz, sadece bu FVG lab araci icin. fvgEngine.ts'ten import
// ALMAZ (tek yonlu bagimlilik, dongusel import riski olmasin diye) --
// urettigi ZlemaZoneLookup, fvgEngine.ts'in kendi tanimladigi arayuze
// YAPISAL olarak uyar.
import { Candle } from './fvgEngine';

export type HtfTimeframe = '1h' | '4h';
export type ZoneDirection = 'bullish' | 'bearish' | null;

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

// Standart Zero-Lag EMA (Ehlers). lag = floor((period-1)/2), de-lag edilmis
// fiyat = 2*price - price[i-lag], sonra bu seriye normal EMA smoothing
// uygulanir. Ilk `lag` nokta icin hesaplanamaz (null).
export function computeZLEMA(closes: number[], period: number): (number | null)[] {
  const lag = Math.floor((period - 1) / 2);
  const alpha = 2 / (period + 1);
  const result: (number | null)[] = new Array(closes.length).fill(null);
  let prevZlema: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    if (i < lag) continue;
    const deLagPrice = 2 * closes[i] - closes[i - lag];
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
  zone: ZoneDirection[]; // her HTF mumu icin: fast>slow -> bullish, fast<slow -> bearish, hesaplanamiyorsa null
}

export function buildZlemaZoneSeries(candles5m: Candle[], tf: HtfTimeframe, fastPeriod: number, slowPeriod: number): ZlemaZoneSeries {
  const htfCandles = aggregateCandles(candles5m, tf);
  const closes = htfCandles.map(c => c.close);
  const fast = computeZLEMA(closes, fastPeriod);
  const slow = computeZLEMA(closes, slowPeriod);
  const zone: ZoneDirection[] = htfCandles.map((_, i) => {
    if (fast[i] == null || slow[i] == null) return null;
    return (fast[i] as number) > (slow[i] as number) ? 'bullish' : 'bearish';
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
