import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import {
  detectFVGs, FvgParams, Candle, SwingSelectMode, SlMode, TpFallbackMode,
  TradeConditionMode, TpPlacementMode,
} from '@/lib/fvgEngine'
import { extractTrades, computeMetrics, SimMetrics } from '@/lib/fvgBacktest'
import { buildZlemaLookup } from '@/lib/htfZlema'
import { computeClusters, extractRefPrice, buildLiquidityClusterLookup, ClusterSnapshotData } from '@/lib/liquidityCluster'

export const dynamic = 'force-dynamic'

const ZLEMA_WARMUP_MS = 15 * 24 * 3600 * 1000
const IS_RATIO = 0.70

// ─── Arama durumu -- SUNUCU BELLEĞINDE, sureç boyunca tek kopya (hakari-
// trigger-orchestrator'daki session desenIyle AYNI). Sayfa yenilense bile
// arama arka planda devam eder, GET durumu her an okuyabilir. ─────────────
interface SearchResultItem {
  rank: number
  params: FvgParams
  isMetrics: SimMetrics
  isScore: number
  oosMetrics: SimMetrics
  oosScore: number
  overfitWarning: boolean
  insufficientOosData: boolean
}
interface SearchState {
  status: 'idle' | 'running' | 'done' | 'error'
  startedAt: number | null
  finishedAt: number | null
  progress: { completed: number; total: number; phase: 'preparing' | 'is' | 'oos' | null }
  results: SearchResultItem[] | null
  error: string | null
  periodInfo: { globalMin: number; globalMax: number; isEndTime: number; oosStartTime: number } | null
}
let searchState: SearchState = {
  status: 'idle', startedAt: null, finishedAt: null,
  progress: { completed: 0, total: 0, phase: null }, results: null, error: null, periodInfo: null,
}

// ─── Rastgele parametre uzayi (scripts/paramSearch.ts ile BIREBIR ayni) ────
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
}
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function sampleRandomParams(): FvgParams {
  const zlemaFastPeriod = pick(SPACE.zlemaFastCandidates)
  const validSlow = SPACE.zlemaSlowCandidates.filter(s => s > zlemaFastPeriod)
  const zlemaSlowPeriod = validSlow.length > 0 ? pick(validSlow) : zlemaFastPeriod * 2
  const tradeConditionMode = pick(SPACE.tradeConditionMode)
  // tradeConditionMode='always' iken checkTradeCondition HICBIR kriteri
  // kontrol etmeden pass=true doner (fvgEngine.ts'in kendi kurali) -- yani
  // use*Criterion toggle'lari bu modda TAMAMEN ETKISIZ. Rastgele orneklemeye
  // devam edersek, sonuc parametre dokumu "ZLEMA aligned VE reverse AYNI ANDA
  // acik" gibi OKUNUŞTA celiskili ama aslinda ZARARSIZ (hic uygulanmamis)
  // degerler gosterir -- kafa karistirmamak icin bu modda hepsini durustce
  // false birakiyoruz.
  const useCriteria = tradeConditionMode !== 'always'
  return {
    swingLookback: pick(SPACE.swingLookback), swingSearchWindow: pick(SPACE.swingSearchWindow),
    swingSelectMode: pick(SPACE.swingSelectMode), sweepProximityPct: pick(SPACE.sweepProximityPct),
    wickBodyRatioMin: pick(SPACE.wickBodyRatioMin), bodyRatioThreshold: pick(SPACE.bodyRatioThreshold),
    avgRangeLookback: pick(SPACE.avgRangeLookback), rangeMultiplier: pick(SPACE.rangeMultiplier),
    fvgMaxAgeCandles: pick(SPACE.fvgMaxAgeCandles),
    useSweepCriterion: useCriteria && Math.random() < 0.5, useBosCriterion: useCriteria && Math.random() < 0.5,
    useDisplacementCriterion: useCriteria && Math.random() < 0.5, useZlema1hCriterion: useCriteria && Math.random() < 0.5,
    useZlema4hCriterion: useCriteria && Math.random() < 0.5, useZlema1hReverseCriterion: useCriteria && Math.random() < 0.5,
    useZlema1hNoTradeCriterion: useCriteria && Math.random() < 0.5, useZlema4hReverseCriterion: useCriteria && Math.random() < 0.5,
    useZlema4hNoTradeCriterion: useCriteria && Math.random() < 0.5, useLiqClusterNearCriterion: useCriteria && Math.random() < 0.5,
    useLiqClusterFarCriterion: useCriteria && Math.random() < 0.5,
    useMinGapSizeCriterion: useCriteria && Math.random() < 0.5,
    minFvgGapUsd: pick(SPACE.minFvgGapUsd),
    zlemaFastPeriod, zlemaSlowPeriod, slMode: pick(SPACE.slMode),
    tpSwingSearchWindow: pick(SPACE.swingSearchWindow), tpFallbackMode: pick(SPACE.tpFallbackMode),
    tradeConditionMode, slBufferPct: pick(SPACE.slBufferPct),
    tpPlacementMode: pick(SPACE.tpPlacementMode), tpTargetPct: pick(SPACE.tpTargetPct),
    tpZonePct: pick(SPACE.tpZonePct), maxTradeDurationCandles: pick(SPACE.maxTradeDurationCandles),
    sequentialTradesOnly: Math.random() < 0.5, maxConcurrentTrades: pick(SPACE.maxConcurrentTrades),
    minRR: pick(SPACE.minRR),
  }
}

interface PeriodData {
  candles: Candle[]
  warmupCandles: Candle[]
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
    time: Number(r.open_time), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
  }))
  const neededSnapshotIds = Array.from(new Set(
    rows.map((r) => r.matched_snapshot_id).filter((id: any) => id != null).map((id: any) => Number(id))
  ))
  const clusterBySnapshotId = new Map<number, { clusters: ReturnType<typeof computeClusters>; refPrice: number | null }>()
  if (neededSnapshotIds.length > 0) {
    console.log(`[paramSearch]   ${neededSnapshotIds.length} distinct heatmap snapshot cekiliyor (bu adim en yavas olan olabilir)...`)
    const t0 = Date.now()
    const { rows: snapshotRows } = await pool.query(
      `SELECT id, heatmap_json FROM apify_heatmap_snapshots WHERE id = ANY($1::bigint[])`,
      [neededSnapshotIds]
    )
    console.log(`[paramSearch]   ${snapshotRows.length} snapshot cekildi (${((Date.now() - t0) / 1000).toFixed(1)}sn).`)
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
    `SELECT open_time, open, high, low, close FROM btcusdt_5m_candles WHERE open_time BETWEEN $1 AND $2 ORDER BY open_time ASC`,
    [startMs - ZLEMA_WARMUP_MS, endMs]
  )
  const warmupCandles: Candle[] = warmupRows.map((r) => ({
    time: Number(r.open_time), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
  }))
  return { candles, warmupCandles, liquidityLookup: buildLiquidityClusterLookup(clusterSnapshotByTime) }
}

function riskAdjustedScore(m: SimMetrics, minTrades: number): number {
  if (m.totalTrades < minTrades) return -Infinity
  if (m.maxDD === 0) return m.totalR > 0 ? m.totalR * 1000 : -Infinity
  return m.totalR / Math.abs(m.maxDD)
}

function runTrial(params: FvgParams, candles: Candle[], warmupCandles: Candle[], liquidityLookup: ReturnType<typeof buildLiquidityClusterLookup>): SimMetrics {
  const zlemaLookup = buildZlemaLookup(warmupCandles, params.zlemaFastPeriod, params.zlemaSlowPeriod)
  const fvgs = detectFVGs(candles, params, zlemaLookup, liquidityLookup)
  const trades = extractTrades(fvgs, candles)
  return computeMetrics(trades)
}

// ─── Arka planda calisan asil arama -- await EDILMEDEN cagrilir, searchState'i
// ilerledikce gunceller. HER asamada console.log basar -- Railway loglarindan
// "hala mi calisiyor yoksa gercekten mi durdu" ayirt edilebilsin diye. ──────
async function runSearch(nTrials: number, topK: number, minTrades: number) {
  console.log(`[paramSearch] Baslatildi: nTrials=${nTrials} topK=${topK} minTrades=${minTrades}`)
  searchState.progress = { completed: 0, total: nTrials, phase: 'preparing' }

  const { rows: rangeRows } = await pool.query(`SELECT MIN(open_time) AS min_t, MAX(open_time) AS max_t, COUNT(*) AS cnt FROM btcusdt_5m_candles`)
  const globalMin = Number(rangeRows[0].min_t)
  const globalMax = Number(rangeRows[0].max_t)
  const totalCandleCount = Number(rangeRows[0].cnt)
  console.log(`[paramSearch] Mum araligi: ${totalCandleCount} mum, ${new Date(globalMin).toISOString()} -> ${new Date(globalMax).toISOString()}`)

  // TUM open_time'lari Node'a cekmek yerine (buyuk tablolarda yavas), split
  // noktasini Postgres'in kendisine OFFSET/LIMIT ile buldurur -- iki sinir
  // degeri (isEndTime, oosStartTime) TEK sorguda, ardisik satirlar olarak.
  const splitIdx = Math.floor(totalCandleCount * IS_RATIO)
  const { rows: splitRows } = await pool.query(
    `SELECT open_time FROM btcusdt_5m_candles ORDER BY open_time ASC OFFSET $1 LIMIT 2`,
    [splitIdx - 1]
  )
  const isEndTime = Number(splitRows[0].open_time)
  const oosStartTime = Number(splitRows[1].open_time)
  searchState.periodInfo = { globalMin, globalMax, isEndTime, oosStartTime }
  console.log(`[paramSearch] IS: ...->${new Date(isEndTime).toISOString()} (%${(IS_RATIO * 100).toFixed(0)}), OOS: ${new Date(oosStartTime).toISOString()}->...`)

  console.log('[paramSearch] IS verisi hazirlaniyor (mumlar + likidite kumesi eslesmeleri)...')
  const isData = await preparePeriodData(globalMin, isEndTime)
  console.log(`[paramSearch] IS verisi hazir: ${isData.candles.length} mum, ${isData.warmupCandles.length} warmup mum.`)

  const results: { params: FvgParams; isMetrics: SimMetrics; score: number }[] = []
  searchState.progress = { completed: 0, total: nTrials, phase: 'is' }
  for (let i = 0; i < nTrials; i++) {
    const params = sampleRandomParams()
    try {
      const isMetrics = runTrial(params, isData.candles, isData.warmupCandles, isData.liquidityLookup)
      const score = riskAdjustedScore(isMetrics, minTrades)
      if (score > -Infinity) results.push({ params, isMetrics, score })
    } catch (err) {
      // Gecersiz/celiskili parametre kombinasyonu -- bu denemeyi atla.
    }
    searchState.progress = { completed: i + 1, total: nTrials, phase: 'is' }
    if ((i + 1) % 25 === 0) console.log(`[paramSearch] IS: ${i + 1}/${nTrials} tamamlandi (${results.length} gecerli).`)
  }
  console.log(`[paramSearch] IS taramasi bitti: ${results.length}/${nTrials} deneme yeterli trade sayisina ulasti.`)

  results.sort((a, b) => b.score - a.score)
  const top = results.slice(0, topK)

  console.log(`[paramSearch] Top-${top.length} icin OOS verisi hazirlaniyor...`)
  searchState.progress = { completed: 0, total: top.length, phase: 'preparing' }
  const oosData = await preparePeriodData(oosStartTime, globalMax)
  console.log(`[paramSearch] OOS verisi hazir: ${oosData.candles.length} mum, ${oosData.warmupCandles.length} warmup mum.`)

  searchState.progress = { completed: 0, total: top.length, phase: 'oos' }
  const finalResults: SearchResultItem[] = []
  for (let i = 0; i < top.length; i++) {
    const { params, isMetrics, score } = top[i]
    const oosMetrics = runTrial(params, oosData.candles, oosData.warmupCandles, oosData.liquidityLookup)
    const oosScore = riskAdjustedScore(oosMetrics, minTrades)
    finalResults.push({
      rank: i + 1, params, isMetrics, isScore: score, oosMetrics, oosScore,
      insufficientOosData: oosMetrics.totalTrades < minTrades,
      overfitWarning: oosMetrics.totalTrades >= minTrades && oosScore < score * 0.3,
    })
    searchState.progress = { completed: i + 1, total: top.length, phase: 'oos' }
    console.log(`[paramSearch] OOS: ${i + 1}/${top.length} tamamlandi.`)
  }

  searchState.results = finalResults
  console.log(`[paramSearch] Tamamlandi. ${finalResults.length} sonuc.`)
  searchState.status = 'done'
  searchState.finishedAt = Date.now()
}

export async function POST(req: NextRequest) {
  if (searchState.status === 'running') {
    return NextResponse.json({ ok: false, reason: 'already_running' }, { status: 409 })
  }
  const body = await req.json().catch(() => ({}))
  const nTrials = Math.max(10, Math.min(2000, Number(body.nTrials) || 300))
  const topK = Math.max(1, Math.min(50, Number(body.topK) || 15))
  const minTrades = Math.max(5, Number(body.minTrades) || 30)

  searchState = {
    status: 'running', startedAt: Date.now(), finishedAt: null,
    progress: { completed: 0, total: nTrials, phase: 'is' }, results: null, error: null, periodInfo: null,
  }
  runSearch(nTrials, topK, minTrades).catch((err) => {
    searchState = { ...searchState, status: 'error', error: String(err?.message || err), finishedAt: Date.now() }
  })
  return NextResponse.json({ ok: true, started: true })
}

export async function GET() {
  return NextResponse.json(searchState)
}
