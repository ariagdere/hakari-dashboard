import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { detectFVGs, FvgParams, Candle } from '@/lib/fvgEngine'
import { extractTrades, computeMetrics, computeEquityCurve, MarketContext } from '@/lib/fvgBacktest'
import { buildZlemaLookup } from '@/lib/htfZlema'
import { computeClusters, extractRefPrice, ClusterSnapshotData } from '@/lib/liquidityCluster'

export const dynamic = 'force-dynamic'

// ZLEMA (ozellikle 4H, period=21 varsayilaniyla ~84 saat = 3.5 gun) icin
// ISINMA suresi gerekir -- kullanicinin sectigi araligin HEMEN basinda bile
// dogru zone degerleri olsun diye, bu kadar ONCESINE kadar EKSTRA mum
// cekilir. Bu ekstra veri SADECE ZLEMA hesabi icindir, FVG TESPITINE
// (detectFVGs'e giden candles) DAHIL EDILMEZ.
const ZLEMA_WARMUP_MS = 15 * 24 * 3600 * 1000 // 15 gun -- guvenli tampon

// Bu route SADECE hesaplar ve sonucu doner -- DB'ye HICBIR SEY YAZMAZ.
// Kaydetme, kullanicinin ayrica /api/fvg-lab/save-run'i cagirmasiyla,
// burada donen AYNI sonucu (yeniden hesaplamadan) gonderdiginde olur.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { params, dateRangeStart, dateRangeEnd } = body as {
      params: FvgParams
      dateRangeStart: string
      dateRangeEnd: string
    }

    if (!params || !dateRangeStart || !dateRangeEnd) {
      return NextResponse.json({ error: 'params, dateRangeStart, dateRangeEnd zorunlu' }, { status: 400 })
    }

    const startMs = new Date(dateRangeStart).getTime()
    const endMs = new Date(dateRangeEnd).getTime()
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      return NextResponse.json({ error: 'Gecersiz tarih araligi' }, { status: 400 })
    }

    // candle_analysis_match + btc_analysis LEFT JOIN -- eslesme yoksa (10
    // saat toleransi asildiysa ya da piyasa verisi henuz baslamamissa) tum
    // alanlar NULL doner, candles/detectFVGs akisini HICBIR SEKILDE etkilemez.
    // candle_heatmap_match'ten SADECE isaretci (matched_snapshot_id) cekilir
    // -- agir heatmap_json blob'u BURADA DEGIL, asagida SADECE ihtiyac duyulan
    // DISTINCT snapshot'lar icin AYRI bir sorguda cekilir.
    const { rows } = await pool.query(
      `SELECT c.open_time, c.open, c.high, c.low, c.close,
              cam.matched_analysis_id, cam.matched_diff_seconds,
              ba.sent_synthesis_mtf, ba.sent_synthesis_h1, ba.sent_synthesis_m5, ba.sent_liquidity, ba.rsi_4h,
              ba.h1_ls_ratio_start, ba.h1_ls_ratio_current,
              ba.h1_tt_positions_start, ba.h1_tt_positions_current,
              ba.h1_tt_accounts_start, ba.h1_tt_accounts_current,
              ba.h1_oi_start, ba.h1_oi_current,
              ba.h1_oi_mcap_start, ba.h1_oi_mcap_current,
              ba.m5_ls_ratio_start, ba.m5_ls_ratio_current,
              ba.m5_tt_positions_start, ba.m5_tt_positions_current,
              ba.m5_tt_accounts_start, ba.m5_tt_accounts_current,
              ba.m5_oi_start, ba.m5_oi_current,
              ba.m5_oi_mcap_start, ba.m5_oi_mcap_current,
              chm.matched_snapshot_id, chm.matched_diff_seconds AS heatmap_diff_seconds
       FROM btcusdt_5m_candles c
       LEFT JOIN candle_analysis_match cam ON cam.open_time = c.open_time
       LEFT JOIN btc_analysis ba ON ba.id = cam.matched_analysis_id
       LEFT JOIN candle_heatmap_match chm ON chm.open_time = c.open_time
       WHERE c.open_time BETWEEN $1 AND $2
       ORDER BY c.open_time ASC`,
      [startMs, endMs]
    )

    if (rows.length < 50) {
      return NextResponse.json(
        { error: `Seçilen aralıkta yeterli mum yok (${rows.length} mum bulundu, en az 50 gerekli)` },
        { status: 400 }
      )
    }

    const candles: Candle[] = rows.map((r) => ({
      time: Number(r.open_time),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    }))

    // Piyasa baglami, Candle[]'dan AYRI bir Map olarak tasinir -- motorun
    // saf OHLC kullanan ic mantigini (swing tespiti, FVG olusumu) HICBIR
    // SEKILDE etkilemez, sadece extractTrades'e SONRADAN baglanir.
    const marketContextByTime = new Map<number, MarketContext>()
    for (const r of rows) {
      marketContextByTime.set(Number(r.open_time), {
        sentSynthesisMtf: r.sent_synthesis_mtf ?? null,
        sentSynthesisH1: r.sent_synthesis_h1 ?? null,
        sentSynthesisM5: r.sent_synthesis_m5 ?? null,
        sentLiquidity: r.sent_liquidity ?? null,
        rsi4h: r.rsi_4h != null ? Number(r.rsi_4h) : null,
        h1LsRatioStart: r.h1_ls_ratio_start != null ? Number(r.h1_ls_ratio_start) : null,
        h1LsRatioCurrent: r.h1_ls_ratio_current != null ? Number(r.h1_ls_ratio_current) : null,
        h1TtPositionsStart: r.h1_tt_positions_start != null ? Number(r.h1_tt_positions_start) : null,
        h1TtPositionsCurrent: r.h1_tt_positions_current != null ? Number(r.h1_tt_positions_current) : null,
        h1TtAccountsStart: r.h1_tt_accounts_start != null ? Number(r.h1_tt_accounts_start) : null,
        h1TtAccountsCurrent: r.h1_tt_accounts_current != null ? Number(r.h1_tt_accounts_current) : null,
        h1OiStart: r.h1_oi_start != null ? Number(r.h1_oi_start) : null,
        h1OiCurrent: r.h1_oi_current != null ? Number(r.h1_oi_current) : null,
        h1OiMcapStart: r.h1_oi_mcap_start != null ? Number(r.h1_oi_mcap_start) : null,
        h1OiMcapCurrent: r.h1_oi_mcap_current != null ? Number(r.h1_oi_mcap_current) : null,
        m5LsRatioStart: r.m5_ls_ratio_start != null ? Number(r.m5_ls_ratio_start) : null,
        m5LsRatioCurrent: r.m5_ls_ratio_current != null ? Number(r.m5_ls_ratio_current) : null,
        m5TtPositionsStart: r.m5_tt_positions_start != null ? Number(r.m5_tt_positions_start) : null,
        m5TtPositionsCurrent: r.m5_tt_positions_current != null ? Number(r.m5_tt_positions_current) : null,
        m5TtAccountsStart: r.m5_tt_accounts_start != null ? Number(r.m5_tt_accounts_start) : null,
        m5TtAccountsCurrent: r.m5_tt_accounts_current != null ? Number(r.m5_tt_accounts_current) : null,
        m5OiStart: r.m5_oi_start != null ? Number(r.m5_oi_start) : null,
        m5OiCurrent: r.m5_oi_current != null ? Number(r.m5_oi_current) : null,
        m5OiMcapStart: r.m5_oi_mcap_start != null ? Number(r.m5_oi_mcap_start) : null,
        m5OiMcapCurrent: r.m5_oi_mcap_current != null ? Number(r.m5_oi_mcap_current) : null,
        matchedAnalysisId: r.matched_analysis_id != null ? Number(r.matched_analysis_id) : null,
        matchedDiffSeconds: r.matched_diff_seconds != null ? Number(r.matched_diff_seconds) : null,
      })
    }

    // Likidite kumesi baglami -- SADECE bu araliktaki mumlarin eslestigi
    // DISTINCT snapshot'lar icin agir heatmap_json blob'u cekilir, HER
    // snapshot icin computeClusters TEK SEFERDE calisir (binlerce mum,
    // sadece dusinelerce snapshot'a esler -- N mum icin N kez cekmek yerine).
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
        clusterBySnapshotId.set(Number(sr.id), {
          clusters: computeClusters(sr.heatmap_json),
          refPrice: extractRefPrice(sr.heatmap_json),
        })
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
        matchedDiffSeconds: r.heatmap_diff_seconds != null ? Number(r.heatmap_diff_seconds) : null,
      })
    }

    let zlemaLookup: ReturnType<typeof buildZlemaLookup> | undefined
    if (params.useZlema1hCriterion || params.useZlema4hCriterion) {
      const { rows: warmupRows } = await pool.query(
        `SELECT open_time, open, high, low, close FROM btcusdt_5m_candles
         WHERE open_time BETWEEN $1 AND $2 ORDER BY open_time ASC`,
        [startMs - ZLEMA_WARMUP_MS, endMs]
      )
      const warmupCandles: Candle[] = warmupRows.map((r) => ({
        time: Number(r.open_time),
        open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      }))
      zlemaLookup = buildZlemaLookup(warmupCandles, params.zlemaFastPeriod, params.zlemaSlowPeriod)
    }

    const fvgs = detectFVGs(candles, params, zlemaLookup)
    const trades = extractTrades(fvgs, candles, marketContextByTime, clusterSnapshotByTime)
    const metrics = computeMetrics(trades)
    const equityCurve = computeEquityCurve(trades)

    return NextResponse.json({
      candleCount: candles.length,
      dateRangeStart, dateRangeEnd,
      metrics, equityCurve, trades,
      // Grafik + detay paneli icin TAM veri -- candles ve fvgs (kriterler/
      // setup/outcome dahil TUM tespit edilenler, sadece gecerli trade'ler
      // degil, kullanici acik/gecersiz FVG'leri de gorebilsin diye).
      candles, fvgs,
      // Bu sonucu ureten TAM parametre seti -- grafigin swing katmani BUNU
      // kullanmali, kullanicinin panelde SONRADAN degistirdigi (henuz
      // "Calistir"a basilmamis) canli state'i DEGIL.
      params,
    })
  } catch (err: any) {
    console.error('simulate error:', err?.message || err)
    return NextResponse.json({ error: 'Simülasyon hatası', detail: String(err?.message || err) }, { status: 500 })
  }
}
