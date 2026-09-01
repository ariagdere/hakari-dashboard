/**
 * Parametre Arama Motoru -- Rastgele Arama (Random Search) + In-Sample/
 * Out-of-Sample Dogrulama
 * ============================================================================
 * FvgParams'in TUM alanlari (30+ parametre: swing tespiti, sweep/displacement
 * esikleri, SL/TP modu, TUM kriter kombinasyonlari, ZLEMA periyotlari, trade
 * yonetimi) icin AYNI ANDA rastgele bir deger cizilir -- tam grid (3^30 gibi
 * bir sayi) hesaplama olarak imkansiz oldugu icin, yuksek boyutlu uzaylarda
 * grid search'e denk (cogu zaman DAHA IYI) sonuc veren, kabul gormus bir
 * yontem kullanilir.
 *
 * IS/OOS: mevcut TUM mum verisi kronolojik olarak %70 IS (optimizasyon) /
 * %30 OOS (dogrulama) bolunur. En iyi N deneme IS Risk-Ayarli Skora (Toplam
 * R / |Max DD|) gore siralanir, TOP-K'nin performansi AYRICA OOS uzerinde
 * (optimizasyonun HIC gormedigi veri) olculur -- IS'te iyi ama OOS'ta cok
 * dusen setler ASIRI UYUM (overfitting) isaretidir.
 *
 * MEVCUT, test edilmis motor (lib/fvgEngine.ts, lib/fvgBacktest.ts,
 * lib/htfZlema.ts, lib/liquidityCluster.ts) DOGRUDAN import edilir --
 * Python'a yeniden portlamak GEREKSIZ capraz-dil sapma riski tasir.
 *
 * CALISTIRMA: npx tsx scripts/paramSearch.ts [--n-trials 300] [--top-k 15] [--min-trades 30]
 * (Bu dosyayi hakari-dashboard reposunun KOKUNE, scripts/ altina koyun --
 * ../lib/* importlari boyle calisir.)
 */
import { Pool } from 'pg'
import {
  detectFVGs, FvgParams, Candle, SwingSelectMode, SlMode, TpFallbackMode,
  TradeConditionMode, TpPlacementMode,
} from '../lib/fvgEngine'
import { extractTrades, computeMetrics, SimMetrics } from '../lib/fvgBacktest'
import { buildZlemaLookup } from '../lib/htfZlema'
import { computeClusters, extractRefPrice, buildLiquidityClusterLookup, ClusterSnapshotData } from '../lib/liquidityCluster'

const DB_CONFIG = {
  host: 'gondola.proxy.rlwy.net', port: 33006, database: 'railway',
  user: 'postgres', password: 'URnrlvTeASTpwmaTsKRStddstfPnhfab',
}
const pool = new Pool(DB_CONFIG)

const ZLEMA_WARMUP_MS = 15 * 24 * 3600 * 1000
const IS_RATIO = 0.70
const MIN_LIQ_USD_UNUSED = 0 // (referans amacli, kullanilmiyor)

// ─── CLI argumanlari ────────────────────────────────────────────────────────
function getArg(name: string, def: number): number {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1 || idx + 1 >= process.argv.length) return def
  const v = Number(process.argv[idx + 1])
  return isNaN(v) ? def : v
}
const N_TRIALS = getArg('n-trials', 300)
const TOP_K = getArg('top-k', 15)
const MIN_TRADES = getArg('min-trades', 30)

// ─── Rastgele parametre uzayi -- DEFAULT_PARAMS etrafinda MAKUL araliklar ──
const SPACE = {
  swingLookback: [10, 14, 18, 24, 30, 40],
  swingSearchWindow: [18, 24, 36, 48, 60, 72],
  swingSelectMode: ['nearest', 'extreme'] as SwingSelectMode[],
  sweepProximityPct: [0.80, 0.85, 0.90, 0.95, 1.0],
  wickBodyRatioMin: [0.5, 0.75, 1.0, 1.5, 2.0],
  bodyRatioThreshold: [0.4, 0.5, 0.6, 0.7, 0.8],
  avgRangeLookback: [7, 10, 14, 21, 28],
  rangeMultiplier: [0.8, 1.0, 1.2, 1.5, 2.0],
  fvgMaxAgeCandles: [3, 6, 9, 12, 18, 24],
  zlemaFastCandidates: [5, 8, 13, 21],
  zlemaSlowCandidates: [21, 34, 55, 89],
  slMode: ['swept_swing', 'fvg_edge'] as SlMode[],
  tpFallbackMode: ['no_trade', '1R', '2R', '3R'] as TpFallbackMode[],
  tradeConditionMode: ['all', 'any', 'always'] as TradeConditionMode[],
  slBufferPct: [0.5, 0.75, 1.0, 1.25, 1.5],
  tpPlacementMode: ['exact', 'percentage', 'dynamic_zone'] as TpPlacementMode[],
  tpTargetPct: [0.5, 0.6, 0.7, 0.75, 0.85, 1.0],
  tpZonePct: [0.5, 0.6, 0.7, 0.8, 0.9],
  maxTradeDurationCandles: [720, 1440, 2160, 2880, 4320, 5760],
  maxConcurrentTrades: [null, 1, 2, 3, 5, 10] as (number | null)[],
  minRR: [0, 0.5, 1.0, 1.5, 2.0],
  minFvgGapUsd: [10, 25, 50, 75, 100, 150],
  volatilityShortWindow: [10, 15, 20, 30, 40],
  volatilityBaselineWindow: [100, 150, 200, 300, 400],
  minVolatilityRatio: [0.4, 0.5, 0.6, 0.7, 0.8, 1.0],
}
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function sampleRandomParams(): FvgParams {
  const zlemaFastPeriod = pick(SPACE.zlemaFastCandidates)
  const validSlow = SPACE.zlemaSlowCandidates.filter(s => s > zlemaFastPeriod)
  const zlemaSlowPeriod = validSlow.length > 0 ? pick(validSlow) : zlemaFastPeriod * 2

  return {
    swingLookback: pick(SPACE.swingLookback),
    swingSearchWindow: pick(SPACE.swingSearchWindow),
    swingSelectMode: pick(SPACE.swingSelectMode),
    sweepProximityPct: pick(SPACE.sweepProximityPct),
    wickBodyRatioMin: pick(SPACE.wickBodyRatioMin),
    bodyRatioThreshold: pick(SPACE.bodyRatioThreshold),
    avgRangeLookback: pick(SPACE.avgRangeLookback),
    rangeMultiplier: pick(SPACE.rangeMultiplier),
    fvgMaxAgeCandles: pick(SPACE.fvgMaxAgeCandles),
    useSweepCriterion: Math.random() < 0.5,
    useBosCriterion: Math.random() < 0.5,
    useDisplacementCriterion: Math.random() < 0.5,
    useZlema1hCriterion: Math.random() < 0.5,
    useZlema4hCriterion: Math.random() < 0.5,
    useZlema1hReverseCriterion: Math.random() < 0.5,
    useZlema1hNoTradeCriterion: Math.random() < 0.5,
    useZlema4hReverseCriterion: Math.random() < 0.5,
    useZlema4hNoTradeCriterion: Math.random() < 0.5,
    useLiqClusterNearCriterion: Math.random() < 0.5,
    useLiqClusterFarCriterion: Math.random() < 0.5,
    useMinGapSizeCriterion: Math.random() < 0.5,
    minFvgGapUsd: pick(SPACE.minFvgGapUsd),
    useVolatilityFilterCriterion: Math.random() < 0.5,
    volatilityShortWindow: pick(SPACE.volatilityShortWindow),
    volatilityBaselineWindow: pick(SPACE.volatilityBaselineWindow),
    minVolatilityRatio: pick(SPACE.minVolatilityRatio),
    zlemaFastPeriod, zlemaSlowPeriod,
    slMode: pick(SPACE.slMode),
    tpSwingSearchWindow: pick(SPACE.swingSearchWindow),
    tpFallbackMode: pick(SPACE.tpFallbackMode),
    tradeConditionMode: pick(SPACE.tradeConditionMode),
    slBufferPct: pick(SPACE.slBufferPct),
    tpPlacementMode: pick(SPACE.tpPlacementMode),
    tpTargetPct: pick(SPACE.tpTargetPct),
    tpZonePct: pick(SPACE.tpZonePct),
    maxTradeDurationCandles: pick(SPACE.maxTradeDurationCandles),
    sequentialTradesOnly: Math.random() < 0.5,
    maxConcurrentTrades: pick(SPACE.maxConcurrentTrades),
    minRR: pick(SPACE.minRR),
  }
}

// ─── Bir donem (IS ya da OOS) icin TUM hazir veriyi (candles, ZLEMA lookup,
// likidite kumesi lookup) BIR KEZ hazirlayan yapi -- N deneme boyunca
// TEKRAR TEKRAR ayni DB sorgularini calistirmamak icin. ────────────────────
interface PeriodData {
  candles: Candle[]
  warmupCandles: Candle[] // ZLEMA icin -- periyot deneme-basi degistigi icin zlemaLookup burada DEGIL, runTrial icinde kurulur
  liquidityLookup: ReturnType<typeof buildLiquidityClusterLookup>
}

async function preparePeriodData(startMs: number, endMs: number): Promise<PeriodData> {
  const { rows } = await pool.query(
    `SELECT c.open_time, c.open, c.high, c.low, c.close, chm.matched_snapshot_id, chm.matched_diff_seconds
     FROM btcusdt_5m_candles c
     LEFT JOIN candle_heatmap_match chm ON chm.open_time = c.open_time
     WHERE c.open_time BETWEEN $1 AND $2 ORDER BY c.open_time ASC`,
    [startMs, endMs]
  )
  const candles: Candle[] = rows.map((r) => ({
    time: Number(r.open_time), open: Number(r.open), high: Number(r.high),
    low: Number(r.low), close: Number(r.close),
  }))

  const neededSnapshotIds = Array.from(new Set(
    rows.map((r) => r.matched_snapshot_id).filter((id: any) => id != null).map((id: any) => Number(id))
  ))
  const clusterBySnapshotId = new Map<number, { clusters: ReturnType<typeof computeClusters>; refPrice: number | null }>()
  if (neededSnapshotIds.length > 0) {
    const { rows: snapshotRows } = await pool.query(
      `SELECT id, heatmap_json FROM apify_heatmap_snapshots WHERE id = ANY($1::bigint[])`,
      [neededSnapshotIds]
    )
    for (const sr of snapshotRows) {
      clusterBySnapshotId.set(Number(sr.id), { clusters: computeClusters(sr.heatmap_json), refPrice: extractRefPrice(sr.heatmap_json) })
    }
  }
  const clusterSnapshotByTime = new Map<number, ClusterSnapshotData>()
  for (const r of rows) {
    const snapId = r.matched_snapshot_id != null ? Number(r.matched_snapshot_id) : null
    const cached = snapId != null ? clusterBySnapshotId.get(snapId) : undefined
    clusterSnapshotByTime.set(Number(r.open_time), {
      clusters: cached?.clusters ?? { cluster_up_btc: null, cluster_up_usd: null, cluster_dn_btc: null, cluster_dn_usd: null },
      refPrice: cached?.refPrice ?? null,
      matchedSnapshotId: snapId,
      matchedDiffSeconds: r.matched_diff_seconds != null ? Number(r.matched_diff_seconds) : null,
    })
  }

  const { rows: warmupRows } = await pool.query(
    `SELECT open_time, open, high, low, close FROM btcusdt_5m_candles
     WHERE open_time BETWEEN $1 AND $2 ORDER BY open_time ASC`,
    [startMs - ZLEMA_WARMUP_MS, endMs]
  )
  const warmupCandles: Candle[] = warmupRows.map((r) => ({
    time: Number(r.open_time), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
  }))

  return { candles, warmupCandles, liquidityLookup: buildLiquidityClusterLookup(clusterSnapshotByTime) }
}

// ─── Risk-Ayarli Skor: Toplam R / |Max DD|. maxDD=0 (kayip YOK) durumunda
// (cok az trade'te olasi bir durum), bolme-sifira dusmemek icin ozel deger. ─
function riskAdjustedScore(m: SimMetrics): number {
  if (m.totalTrades < MIN_TRADES) return -Infinity
  if (m.maxDD === 0) return m.totalR > 0 ? m.totalR * 1000 : -Infinity // kayip yok + kazanc VAR -- cok nadir, yuksek skor
  return m.totalR / Math.abs(m.maxDD)
}

function runTrial(params: FvgParams, candles: Candle[], warmupCandles: Candle[], liquidityLookup: ReturnType<typeof buildLiquidityClusterLookup>): SimMetrics {
  const zlemaLookup = buildZlemaLookup(warmupCandles, params.zlemaFastPeriod, params.zlemaSlowPeriod)
  const fvgs = detectFVGs(candles, params, zlemaLookup, liquidityLookup)
  const trades = extractTrades(fvgs, candles)
  return computeMetrics(trades)
}

function fmtParams(p: FvgParams): string {
  return JSON.stringify(p)
}

async function main() {
  console.log(`Parametre Arama Motoru -- N=${N_TRIALS} deneme, Top-${TOP_K}, min ${MIN_TRADES} trade/deneme\n`)

  console.log('Mevcut mum araligi sorgulaniyor...')
  const { rows: rangeRows } = await pool.query(`SELECT MIN(open_time) AS min_t, MAX(open_time) AS max_t FROM btcusdt_5m_candles`)
  const globalMin = Number(rangeRows[0].min_t)
  const globalMax = Number(rangeRows[0].max_t)
  console.log(`Aralik: ${new Date(globalMin).toISOString()} -> ${new Date(globalMax).toISOString()}`)

  const { rows: timeRows } = await pool.query(`SELECT open_time FROM btcusdt_5m_candles ORDER BY open_time ASC`)
  const allTimes = timeRows.map((r) => Number(r.open_time))
  const splitIdx = Math.floor(allTimes.length * IS_RATIO)
  const isEndTime = allTimes[splitIdx - 1]
  const oosStartTime = allTimes[splitIdx]
  console.log(`IS: ${new Date(globalMin).toISOString()} -> ${new Date(isEndTime).toISOString()} (${splitIdx} mum, %${(IS_RATIO * 100).toFixed(0)})`)
  console.log(`OOS: ${new Date(oosStartTime).toISOString()} -> ${new Date(globalMax).toISOString()} (${allTimes.length - splitIdx} mum)\n`)

  console.log('IS verisi hazirlaniyor (mumlar + likidite kumesi eslesmeleri)...')
  const isData = await preparePeriodData(globalMin, isEndTime)

  console.log(`${N_TRIALS} deneme IS uzerinde calistiriliyor...`)
  const results: { params: FvgParams; isMetrics: SimMetrics; score: number }[] = []
  for (let i = 0; i < N_TRIALS; i++) {
    const params = sampleRandomParams()
    try {
      const isMetrics = runTrial(params, isData.candles, isData.warmupCandles, isData.liquidityLookup)
      const score = riskAdjustedScore(isMetrics)
      if (score > -Infinity) results.push({ params, isMetrics, score })
    } catch (err: any) {
      // Gecersiz/celiskili parametre kombinasyonu (orn ayni anda birbiriyle
      // celisen kriterler) -- bu denemeyi atla, arama devam etsin.
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${N_TRIALS} tamamlandi (${results.length} gecerli)`)
  }
  console.log(`\n${results.length}/${N_TRIALS} deneme yeterli trade sayisina ulasti (min ${MIN_TRADES}).`)

  results.sort((a, b) => b.score - a.score)
  const top = results.slice(0, TOP_K)

  console.log(`\nTop-${top.length} icin OOS verisi hazirlaniyor...`)
  const oosData = await preparePeriodData(oosStartTime, globalMax)

  console.log('\n' + '='.repeat(100))
  console.log('SONUCLAR -- IS (optimizasyon) vs OOS (dogrulama, hic gormedigi veri)')
  console.log('='.repeat(100))

  for (let i = 0; i < top.length; i++) {
    const { params, isMetrics, score } = top[i]
    const oosMetrics = runTrial(params, oosData.candles, oosData.warmupCandles, oosData.liquidityLookup)
    const oosScore = riskAdjustedScore(oosMetrics)

    console.log(`\n#${i + 1} -- IS Risk-Skor: ${score.toFixed(3)}`)
    console.log(`  IS : n=${isMetrics.totalTrades.toString().padEnd(4)} WR=%${(isMetrics.winRate * 100).toFixed(1).padEnd(6)} TotalR=${isMetrics.totalR.toFixed(2).padStart(8)} MaxDD=${isMetrics.maxDD.toFixed(2).padStart(8)}`)
    console.log(`  OOS: n=${oosMetrics.totalTrades.toString().padEnd(4)} WR=%${(oosMetrics.winRate * 100).toFixed(1).padEnd(6)} TotalR=${oosMetrics.totalR.toFixed(2).padStart(8)} MaxDD=${oosMetrics.maxDD.toFixed(2).padStart(8)} Risk-Skor=${oosScore === -Infinity ? 'N/A (yetersiz trade)' : oosScore.toFixed(3)}`)
    if (oosMetrics.totalTrades < MIN_TRADES) {
      console.log(`  UYARI: OOS'ta yeterli trade yok (${oosMetrics.totalTrades} < ${MIN_TRADES}) -- bu parametre setinin OOS'ta guvenilir bir degerlendirmesi YOK.`)
    } else if (oosScore < score * 0.3) {
      console.log(`  UYARI: OOS skoru IS skorunun %30'undan DUSUK -- olasi ASIRI UYUM (overfitting) isareti.`)
    }
    console.log(`  Params: ${fmtParams(params)}`)
  }

  await pool.end()
}

main().catch((err) => { console.error('Hata:', err); process.exit(1) })
