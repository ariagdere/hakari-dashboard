// lib/liquidityCluster.ts
// hakari-trigger-orchestrator'daki computeClusters + computeNaiveSetup
// fonksiyonlarinin BIREBIR portu -- kendi yorumumu KATMADAN, kanitlanmis
// mevcut mantigi aynen kullaniyorum.
const CLUSTER_MERGE_DIST = 300;
const MIN_LIQ_USD = 1_000_000;
const TP_PCT = 75, SL_PCT = 75;

export interface ClusterResult {
  cluster_up_btc: number | null; // ISIM YANILTICI -- ASLINDA FIYAT SEVIYESI (mid), BTC miktari DEGIL
  cluster_up_usd: number | null; // likidasyon buyuklugu (USD)
  cluster_dn_btc: number | null;
  cluster_dn_usd: number | null;
}

export function computeClusters(heatmap: any): ClusterResult {
  const yAxis: number[] = heatmap?.y_axis;
  const lld: number[][] = heatmap?.liquidation_leverage_data;
  const candles: any[] = heatmap?.price_candlesticks;

  const empty: ClusterResult = { cluster_up_btc: null, cluster_up_usd: null, cluster_dn_btc: null, cluster_dn_usd: null };
  if (!yAxis?.length || !lld?.length || !candles?.length) return empty;

  const refPrice = parseFloat(candles[candles.length - 1][4]);
  if (!refPrice || refPrice <= 0) return empty;

  const liqByYi = new Map<number, number>();
  for (const [, yi, usd] of lld) {
    liqByYi.set(yi, (liqByYi.get(yi) || 0) + usd);
  }

  const up: Array<[number, number]> = [];
  const dn: Array<[number, number]> = [];
  for (const [yi, usd] of Array.from(liqByYi.entries())) {
    if (usd < MIN_LIQ_USD) continue;
    const price = yAxis[yi];
    if (price === undefined) continue;
    if (price > refPrice) up.push([price, usd]);
    else if (price < refPrice) dn.push([price, usd]);
  }

  function dominantCluster(items: Array<[number, number]>) {
    if (!items.length) return null;
    let peakPrice = items[0][0];
    let peakUsd = items[0][1];
    for (const [price, usd] of items) {
      if (usd > peakUsd) { peakUsd = usd; peakPrice = price; }
    }
    let total = 0, weightedSum = 0;
    for (const [price, usd] of items) {
      if (Math.abs(price - peakPrice) <= CLUSTER_MERGE_DIST) {
        total += usd;
        weightedSum += price * usd;
      }
    }
    return { mid: weightedSum / total, usd: total };
  }

  const upC = dominantCluster(up);
  const dnC = dominantCluster(dn);

  return {
    cluster_up_btc: upC ? Math.round(upC.mid * 100) / 100 : null,
    cluster_up_usd: upC ? Math.round(upC.usd * 100) / 100 : null,
    cluster_dn_btc: dnC ? Math.round(dnC.mid * 100) / 100 : null,
    cluster_dn_usd: dnC ? Math.round(dnC.usd * 100) / 100 : null,
  };
}

export function extractRefPrice(heatmap: any): number | null {
  const candles: any[] = heatmap?.price_candlesticks;
  if (!candles?.length) return null;
  const refPrice = parseFloat(candles[candles.length - 1][4]);
  return (!refPrice || refPrice <= 0) ? null : refPrice;
}

// Bir snapshot'in TUM zaman-bagimli verisi -- kume seviyeleri + heatmap'in
// KENDI referans fiyati + eslesme bilgisi. Bu, candle zamanina gore TEK
// SEFERDE hesaplanir (fiyattan BAGIMSIZ), sonra HER trade kendi entry
// fiyatiyla BIRLESTIRIR (computeLiquidityContext).
export interface ClusterSnapshotData {
  clusters: ClusterResult;
  refPrice: number | null;
  matchedSnapshotId: number | null;
  matchedDiffSeconds: number | null;
}

export interface LiquidityContext {
  clusterUpPrice: number | null;
  clusterUpUsd: number | null;
  clusterDnPrice: number | null;
  clusterDnUsd: number | null;
  distanceToUp: number | null;
  distanceToDn: number | null;
  nearestCluster: 'up' | 'dn' | null;
  naiveDirection: string | null; // heatmap'in KENDI refPrice'iyla hesaplanir, FVG entry'siyle DEGIL
  matchedSnapshotId: number | null;
  matchedDiffSeconds: number | null;
}

// fvgEntryPrice: trade'in KENDI entry fiyati -- "hangi kumeye yakin" sorusu
// BUNA gore cevaplanir. snapshotData: o anin eslesmis kume verisi.
export function computeLiquidityContext(fvgEntryPrice: number, snapshotData: ClusterSnapshotData | undefined): LiquidityContext {
  const empty: LiquidityContext = {
    clusterUpPrice: null, clusterUpUsd: null, clusterDnPrice: null, clusterDnUsd: null,
    distanceToUp: null, distanceToDn: null, nearestCluster: null, naiveDirection: null,
    matchedSnapshotId: snapshotData?.matchedSnapshotId ?? null,
    matchedDiffSeconds: snapshotData?.matchedDiffSeconds ?? null,
  };
  if (!snapshotData) return empty;
  const { clusters, refPrice } = snapshotData;

  const distanceToUp = clusters.cluster_up_btc != null ? Math.abs(fvgEntryPrice - clusters.cluster_up_btc) : null;
  const distanceToDn = clusters.cluster_dn_btc != null ? Math.abs(fvgEntryPrice - clusters.cluster_dn_btc) : null;
  let nearestCluster: 'up' | 'dn' | null = null;
  if (distanceToUp != null && distanceToDn != null) nearestCluster = distanceToUp <= distanceToDn ? 'up' : 'dn';
  else if (distanceToUp != null) nearestCluster = 'up';
  else if (distanceToDn != null) nearestCluster = 'dn';

  const naive = (refPrice != null && clusters.cluster_up_btc != null && clusters.cluster_dn_btc != null)
    ? computeNaiveSetup(refPrice, clusters.cluster_up_btc, clusters.cluster_dn_btc)
    : null;

  return {
    clusterUpPrice: clusters.cluster_up_btc, clusterUpUsd: clusters.cluster_up_usd,
    clusterDnPrice: clusters.cluster_dn_btc, clusterDnUsd: clusters.cluster_dn_usd,
    distanceToUp, distanceToDn, nearestCluster,
    naiveDirection: naive?.naive_direction ?? null,
    matchedSnapshotId: snapshotData.matchedSnapshotId, matchedDiffSeconds: snapshotData.matchedDiffSeconds,
  };
}

export interface NaiveSetup {
  naive_direction: string | null;
  naive_entry: number | null;
  naive_tp: number | null;
  naive_sl: number | null;
  naive_rr: number | null;
  naive_dist_ratio: number | null;
}

export function computeNaiveSetup(refPrice: number, upBtc: number, dnBtc: number): NaiveSetup {
  const empty: NaiveSetup = { naive_direction: null, naive_entry: null, naive_tp: null, naive_sl: null, naive_rr: null, naive_dist_ratio: null };
  if (!(upBtc > refPrice && dnBtc < refPrice)) return empty;

  const rawUpDist = upBtc - refPrice;
  const rawDnDist = refPrice - dnBtc;
  const naiveDir = rawUpDist < rawDnDist ? 'LONG' : 'SHORT';

  let tpDist: number, slDist: number, tpPrice: number, slPrice: number;
  if (naiveDir === 'LONG') {
    tpDist = TP_PCT / 100 * rawUpDist;
    slDist = SL_PCT / 100 * rawDnDist;
    tpPrice = refPrice + tpDist;
    slPrice = refPrice - slDist;
  } else {
    tpDist = TP_PCT / 100 * rawDnDist;
    slDist = SL_PCT / 100 * rawUpDist;
    tpPrice = refPrice - tpDist;
    slPrice = refPrice + slDist;
  }
  if (tpDist <= 0 || slDist <= 0) return empty;

  const rr = tpDist / slDist;
  const distRatio = Math.min(rawUpDist, rawDnDist) > 0
    ? Math.max(rawUpDist, rawDnDist) / Math.min(rawUpDist, rawDnDist)
    : null;

  return {
    naive_direction: naiveDir,
    naive_entry: Math.round(refPrice * 100) / 100,
    naive_tp: Math.round(tpPrice * 100) / 100,
    naive_sl: Math.round(slPrice * 100) / 100,
    naive_rr: Math.round(rr * 1000) / 1000,
    naive_dist_ratio: distRatio !== null ? Math.round(distRatio * 1000) / 1000 : null,
  };
}
