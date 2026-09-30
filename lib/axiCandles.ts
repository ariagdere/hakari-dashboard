// /live grafigi icin Axi BTCUSD mumlari -- MetaApi historical market data REST.
//
// - Her zaman dilimi icin son 1000 mum (olusan mum dahil; Faz 0 tanilamasinda dogrulandi).
// - Sunucu tarafinda kisa sureli cache + ayni anda gelen istekleri tek istege birlestirme:
//   birden fazla sekme/istemci MetaApi'ye ayri ayri gitmez. Istek basina maliyet ~0.5 CPU
//   kredisi; hesap basina ayni anda en fazla 5 historical istek siniri var.
// - Donus formati /api/candles ile ayni (time = UTC saniye), grafik kodu degismeden kullanir.
import { AXI_SYMBOL, Timeframe } from './axiMarket'
import { getMetaApiRestConfig } from './metaapiRest'

export interface ChartCandle {
  time: number // acilis zamani, UTC saniye
  open: number
  high: number
  low: number
  close: number
}

const LIMIT = 1000
const CACHE_TTL_MS = 20_000

interface CacheEntry {
  at: number
  data: ChartCandle[]
}

const g = globalThis as typeof globalThis & {
  __hakariAxiCandleCache?: Map<Timeframe, CacheEntry>
  __hakariAxiCandleInflight?: Map<Timeframe, Promise<ChartCandle[]>>
}

function cache(): Map<Timeframe, CacheEntry> {
  if (!g.__hakariAxiCandleCache) g.__hakariAxiCandleCache = new Map()
  return g.__hakariAxiCandleCache
}

function inflight(): Map<Timeframe, Promise<ChartCandle[]>> {
  if (!g.__hakariAxiCandleInflight) g.__hakariAxiCandleInflight = new Map()
  return g.__hakariAxiCandleInflight
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && !isNaN(x)
}

// MetaApi mum dizisini grafik formatina cevirir: gecersiz satirlari atar, zamana gore
// siralar, ayni acilis zamani iki kez gelirse sonuncuyu tutar (lightweight-charts
// artan ve tekil zaman ister).
export function toChartCandles(raw: unknown): ChartCandle[] {
  if (!Array.isArray(raw)) throw new Error('MetaApi historical candles: beklenmeyen yanıt')
  const rows: ChartCandle[] = []
  for (const c of raw) {
    const t = Date.parse(c?.time)
    if (!Number.isFinite(t) || ![c?.open, c?.high, c?.low, c?.close].every(isNum)) continue
    rows.push({ time: Math.floor(t / 1000), open: c.open, high: c.high, low: c.low, close: c.close })
  }
  rows.sort((a, b) => a.time - b.time)
  const out: ChartCandle[] = []
  for (const r of rows) {
    if (out.length > 0 && out[out.length - 1].time === r.time) out[out.length - 1] = r
    else out.push(r)
  }
  return out
}

async function fetchAxiCandles(tf: Timeframe): Promise<ChartCandle[]> {
  const cfg = getMetaApiRestConfig()
  if (!cfg) throw new Error('METAAPI_TOKEN / METAAPI_ACCOUNT_ID tanımlı değil')
  const url =
    `${cfg.marketDataApi}/users/current/accounts/${cfg.accountId}` +
    `/historical-market-data/symbols/${AXI_SYMBOL}/timeframes/${tf}/candles?limit=${LIMIT}`
  const res = await fetch(url, {
    headers: { 'auth-token': cfg.token, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`MetaApi historical candles HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return toChartCandles(await res.json())
}

export async function getAxiCandles(tf: Timeframe): Promise<ChartCandle[]> {
  const hit = cache().get(tf)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data
  const pending = inflight().get(tf)
  if (pending) return pending
  const p = fetchAxiCandles(tf)
    .then((data) => {
      cache().set(tf, { at: Date.now(), data })
      return data
    })
    .finally(() => inflight().delete(tf))
  inflight().set(tf, p)
  return p
}
