import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { detectFVGs, FvgParams, Candle } from '@/lib/fvgEngine'
import { extractTrades, computeMetrics, computeEquityCurve } from '@/lib/fvgBacktest'
import { buildZlemaLookup } from '@/lib/htfZlema'

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

    const { rows } = await pool.query(
      `SELECT open_time, open, high, low, close FROM btcusdt_5m_candles
       WHERE open_time BETWEEN $1 AND $2 ORDER BY open_time ASC`,
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
    const trades = extractTrades(fvgs, candles)
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
