import { NextRequest, NextResponse } from 'next/server'
import { isBasicAuthConfigured, AUTH_NOT_CONFIGURED_MESSAGE } from '@/lib/authConfig'
import { AXI_SYMBOL, TIMEFRAMES, TIMEFRAME_MS, ensureMarketStream, getStreamStatus } from '@/lib/metaapiStream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Faz 0 tanilama -- tarayicida ac: /api/diagnostics/metaapi  (istege bagli ?wait=40)
//
// Kontroller:
//   1. Hesap tipi (DEMO/REAL), sunucu, para birimi, kaldirac          -- REST, 50 kredi
//   2. BTCUSD spec: contractSize, min/max lot, lot adimi, stopsLevel  -- REST, 50 kredi
//   3. Historical market data host'u (london) her TF icin + 15m'de limit=1000 -- ~1 kredi
//   4. CPU kredi kullanimi (perAccount/perUser/perServer)
//   5. Streaming: baglanti, quote akisi, OLUSAN mumun stream'de gelip gelmedigi
// clientId burada test EDILMEZ (emir acmayi gerektirir) -- Faz 2'nin ilk demo emrinde.
// Yanit hicbir gizli bilgi icermez (token, login, isim yok).

interface RestResult {
  ok: boolean
  status: number
  ms: number
  body: any
}

async function metaGet(base: string, path: string, token: string): Promise<RestResult> {
  const started = Date.now()
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { 'auth-token': token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    let body: any
    try {
      body = JSON.parse(text)
    } catch {
      body = text.slice(0, 400)
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, body }
  } catch (err: any) {
    return { ok: false, status: 0, ms: Date.now() - started, body: String(err?.cause?.code ?? err?.message ?? err) }
  }
}

function errorText(r: RestResult): string {
  const b = typeof r.body === 'string' ? r.body : JSON.stringify(r.body)
  return `HTTP ${r.status || 'ağ hatası'}: ${String(b).slice(0, 300)}`
}

function pick<T extends Record<string, any>>(obj: T | null | undefined, keys: string[]) {
  if (!obj || typeof obj !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const k of keys) if (k in obj) out[k] = obj[k]
  return out
}

function summarizeCandles(r: RestResult, tf: keyof typeof TIMEFRAME_MS) {
  if (!r.ok || !Array.isArray(r.body)) return { ok: false, ms: r.ms, error: errorText(r) }
  const arr = r.body as any[]
  if (arr.length === 0) return { ok: true, ms: r.ms, count: 0 }
  const byTime = [...arr].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const newest = byTime[byTime.length - 1]
  const oldest = byTime[0]
  return {
    ok: true,
    ms: r.ms,
    count: arr.length,
    returnedOrder: Date.parse(arr[0].time) <= Date.parse(arr[arr.length - 1].time) ? 'eski→yeni' : 'yeni→eski',
    oldest: { time: oldest.time, brokerTime: oldest.brokerTime },
    newest: { time: newest.time, brokerTime: newest.brokerTime, close: newest.close },
    // Son mumun kapanis anı henuz gelmediyse, REST olusan mumu da donduruyor demektir.
    newestIsForming: Date.parse(newest.time) + TIMEFRAME_MS[tf] > Date.now(),
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} ${Math.round(ms / 1000)} sn'de tamamlanmadı`)), ms)),
  ])
}

export async function GET(req: NextRequest) {
  if (!isBasicAuthConfigured()) return new Response(AUTH_NOT_CONFIGURED_MESSAGE, { status: 503 })

  const token = process.env.METAAPI_TOKEN
  const accountId = process.env.METAAPI_ACCOUNT_ID
  if (!token || !accountId) {
    return NextResponse.json({ error: 'METAAPI_TOKEN / METAAPI_ACCOUNT_ID tanımlı değil' }, { status: 500 })
  }
  const region = process.env.METAAPI_REGION || 'london'
  const clientApi = `https://mt-client-api-v1.${region}.agiliumtrade.ai`
  const marketDataApi = (process.env.METAAPI_MARKET_DATA_URL || `https://mt-market-data-client-api-v1.${region}.agiliumtrade.ai`).replace(/\/+$/, '')
  const acc = `/users/current/accounts/${accountId}`
  const waitParam = Number(req.nextUrl.searchParams.get('wait') ?? '20')
  const waitSec = Math.min(40, Math.max(0, Number.isFinite(waitParam) ? Math.round(waitParam) : 20))

  // Streaming'i en basta tetikle -- REST kontrolleri calisirken baglanti kurulsun.
  const streamErrorPromise = withTimeout(ensureMarketStream(), 90_000, 'Streaming bağlantısı').then(
    () => null,
    (err: any) => String(err?.message ?? err),
  )

  // 1-2-4) Hesap, spec, kredi -- paralel
  const [accountRes, specRes, creditsRes] = await Promise.all([
    metaGet(clientApi, `${acc}/account-information`, token),
    metaGet(clientApi, `${acc}/symbols/${AXI_SYMBOL}/specification`, token),
    metaGet(clientApi, `${acc}/credits`, token),
  ])

  // 3) Historical candles -- SIRAYLA (hesap basina ayni anda en fazla 5 historical istek)
  const historical: Record<string, unknown> = {}
  for (const tf of TIMEFRAMES) {
    const r = await metaGet(marketDataApi, `${acc}/historical-market-data/symbols/${AXI_SYMBOL}/timeframes/${tf}/candles?limit=3`, token)
    historical[tf] = summarizeCandles(r, tf)
  }
  const full15m = await metaGet(marketDataApi, `${acc}/historical-market-data/symbols/${AXI_SYMBOL}/timeframes/15m/candles?limit=1000`, token)
  historical['15m_limit1000'] = summarizeCandles(full15m, '15m')

  // 5) Streaming -- hazir olunca waitSec boyunca ornekle
  const streamError = await streamErrorPromise
  const before = getStreamStatus()
  if (!streamError && waitSec > 0) await sleep(waitSec * 1000)
  const after = getStreamStatus()
  const perTf: Record<string, { updates: number; sameBarUpdates: number }> = {}
  for (const tf of TIMEFRAMES) {
    const b = before.candles[tf] as { updates: number; sameBarUpdates: number }
    const a = after.candles[tf] as { updates: number; sameBarUpdates: number }
    perTf[tf] = { updates: a.updates - b.updates, sameBarUpdates: a.sameBarUpdates - b.sameBarUpdates }
  }
  const quotesInWindow = after.quoteCount - before.quoteCount
  const sameBarTotal = Object.values(perTf).reduce((sum, x) => sum + x.sameBarUpdates, 0)
  const candleTotal = Object.values(perTf).reduce((sum, x) => sum + x.updates, 0)

  // Ozet satirlari
  const summary: string[] = []
  const account = accountRes.ok
    ? pick(accountRes.body, ['type', 'platform', 'broker', 'server', 'currency', 'leverage', 'balance', 'equity', 'freeMargin', 'marginMode', 'tradeAllowed'])
    : null
  if (account) {
    summary.push(`OK   Hesap: ${account.type} · ${account.server} · ${account.currency} · kaldıraç 1:${account.leverage} · tradeAllowed=${account.tradeAllowed}`)
  } else {
    summary.push(`FAIL Hesap bilgisi: ${errorText(accountRes)}`)
  }

  const spec = specRes.ok
    ? pick(specRes.body, [
        'symbol', 'description', 'contractSize', 'minVolume', 'maxVolume', 'volumeStep', 'tickSize', 'point', 'digits',
        'stopsLevel', 'freezeLevel', 'tradeMode', 'fillingModes', 'profitCurrency', 'marginCurrency', 'swapMode', 'swapLong', 'swapShort',
      ])
    : null
  if (spec) {
    const cs = Number(spec.contractSize)
    const minLot = Number(spec.minVolume)
    const stopsUsd = Number(spec.stopsLevel) * Number(spec.point)
    summary.push(
      `OK   ${AXI_SYMBOL}: contractSize ${spec.contractSize}, min lot ${spec.minVolume}, lot adımı ${spec.volumeStep}, max lot ${spec.maxVolume}, ` +
        `stopsLevel ${spec.stopsLevel} point (≈ $${isFinite(stopsUsd) ? stopsUsd : '?'}), tradeMode ${spec.tradeMode}`,
    )
    if (isFinite(cs) && isFinite(minLot)) {
      summary.push(`INFO Min lotta her $100'lık SL mesafesi ≈ $${(minLot * cs * 100).toFixed(2)} risk`)
    }
  } else {
    summary.push(`FAIL ${AXI_SYMBOL} spec: ${errorText(specRes)}`)
  }

  const histOk = TIMEFRAMES.filter((tf) => (historical[tf] as any)?.ok)
  const full = historical['15m_limit1000'] as any
  if (histOk.length === TIMEFRAMES.length && full?.ok) {
    summary.push(`OK   Historical host (${marketDataApi}): 5 TF'nin hepsi döndü; 15m limit=1000 → ${full.count} mum, ${full.ms} ms`)
    const formingTfs = TIMEFRAMES.filter((tf) => (historical[tf] as any)?.newestIsForming)
    summary.push(`INFO REST'te son mum oluşan mum mu: ${formingTfs.length ? formingTfs.join(', ') + ' evet' : 'hiçbirinde değil'}`)
  } else {
    const failed = TIMEFRAMES.filter((tf) => !(historical[tf] as any)?.ok)
    summary.push(
      `FAIL Historical host (${marketDataApi}) ${failed.join(', ') || '15m limit=1000'} için başarısız. ` +
        `MetaApi uygulamasındaki API access sayfasından london market data URL'sini alıp METAAPI_MARKET_DATA_URL olarak tanımla.`,
    )
  }

  if (streamError) {
    summary.push(`FAIL Streaming: ${streamError}`)
  } else {
    summary.push(`OK   Streaming hazır; ${waitSec} sn içinde ${quotesInWindow} quote, ${candleTotal} mum güncellemesi`)
    if (sameBarTotal > 0) {
      summary.push(`OK   Oluşan mum stream'de geliyor (aynı mum ${sameBarTotal} kez güncellendi)`)
    } else if (candleTotal > 0) {
      summary.push(`?    Mum güncellemesi var ama aynı mumun tekrar güncellendiği görülmedi — ?wait=40 ile tekrar dene`)
    } else {
      summary.push(`?    ${waitSec} sn içinde mum güncellemesi gelmedi — piyasa kısa arada olabilir, ?wait=40 ile tekrar dene`)
    }
  }
  summary.push(
    creditsRes.ok
      ? 'INFO Kredi durumu aşağıda "credits" alanında'
      : `FAIL Kredi durumu: ${errorText(creditsRes)}`,
  )
  summary.push("NOT  clientId deal'lerde görünüyor mu: Faz 2'nin ilk demo emrinde doğrulanacak")

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      summary,
      env: { region, clientApi, marketDataApi, streamSampleSeconds: waitSec },
      account,
      spec,
      historicalCandles: historical,
      credits: creditsRes.ok ? creditsRes.body : { error: errorText(creditsRes) },
      stream: { error: streamError, window: { seconds: waitSec, quotes: quotesInWindow, perTimeframe: perTf }, status: after },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
