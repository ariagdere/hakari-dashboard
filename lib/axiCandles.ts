// /live grafigi icin Axi BTCUSD mumlari -- sunucu tarafi mum deposu.
//
// NEDEN DEPO: Her istekte MetaApi'den 1000 mum cekmek yavas ve kirilgan: buyuk zaman
// dilimlerinde (4h/1d) terminalin derin gecmisi yuklemesi uzun surebiliyor ve istek zaman
// asimina dusuyordu; ustelik hesap basina ayni anda en fazla 5 historical istek var. Bu yuzden:
//   - Her zaman dilimi icin 1000 mum BIR KEZ yuklenir (istenen ilk; digerleri arka planda sirayla).
//   - Sonrasinda sadece son birkac mum (limit=3, hizli ve ucuz) cekilip depoya islenir.
//   - Istekler depodan doner; tazeleme arka planda ya da en fazla ~2.5 sn beklenerek yapilir.
//   - 1000'lik yukleme basarisiz olursa 300'luk yedek yukleme; tam yukleme arada tekrar denenir.
//   - Bosluk tespit edilirse (servis uykusu vb.) ve 30 dk'da bir tam yeniden yukleme yapilir.
// Donus formati /api/candles ile ayni (time = UTC saniye), grafik kodu degismeden kullanir.
import { AXI_SYMBOL, TIMEFRAMES, TIMEFRAME_MS, Timeframe } from './axiMarket'
import { getMetaApiRestConfig } from './metaapiRest'

export interface ChartCandle {
  time: number // acilis zamani, UTC saniye
  open: number
  high: number
  low: number
  close: number
}

const FULL_LIMIT = 1000
const FALLBACK_LIMIT = 300
const TAIL_LIMIT = 3
const TAIL_REFRESH_MS = 15_000 // bu kadar eskiyse istek geldiginde kuyruk tazelenir
const TAIL_WAIT_MS = 2_500 // istek, kuyruk tazelemesini en fazla bu kadar bekler
const FULL_RELOAD_MS = 30 * 60_000
const PARTIAL_RETRY_MS = 5 * 60_000 // sadece yedek (300) yuklendiyse 1000 tekrar denenir
const FAILED_RETRY_MS = 15_000 // hic veri yokken basarisiz denemeden sonra bekleme
const FULL_TIMEOUT_MS = 60_000
const TAIL_TIMEOUT_MS = 15_000
const MAX_CONCURRENT = 3 // MetaApi: hesap basina ayni anda en fazla 5 historical istek; pay birakiyoruz

interface TfStore {
  candles: ChartCandle[]
  complete: boolean // 1000'lik tam yukleme basarili mi
  fullAt: number // son basarili tam/yedek yukleme
  tailAt: number // son basarili kuyruk tazeleme
  attemptAt: number // son tam yukleme denemesi
  needsFull: boolean // bosluk tespit edildi
  loading: Promise<void> | null
  tailing: Promise<void> | null
  lastError: string | null
  lastFullMs: number | null
}

interface Globals {
  stores: Map<Timeframe, TfStore>
  active: number
  queue: Array<() => void>
  warmedUp: boolean
}

const g = globalThis as typeof globalThis & { __hakariAxiCandles?: Globals }

function globals(): Globals {
  if (!g.__hakariAxiCandles) g.__hakariAxiCandles = { stores: new Map(), active: 0, queue: [], warmedUp: false }
  return g.__hakariAxiCandles
}

function store(tf: Timeframe): TfStore {
  const G = globals()
  let s = G.stores.get(tf)
  if (!s) {
    s = { candles: [], complete: false, fullAt: 0, tailAt: 0, attemptAt: 0, needsFull: false, loading: null, tailing: null, lastError: null, lastFullMs: null }
    G.stores.set(tf, s)
  }
  return s
}

// Ayni anda en fazla MAX_CONCURRENT MetaApi historical istegi. Biten istek slotunu
// sirada bekleyene dogrudan devreder (arada baska bir cagri araya giremez).
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const G = globals()
  if (G.active < MAX_CONCURRENT) G.active++
  else await new Promise<void>((resolve) => G.queue.push(resolve))
  try {
    return await fn()
  } finally {
    const next = G.queue.shift()
    if (next) next()
    else G.active--
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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

// Son birkac mumu depoya isler: kuyrugun ilk mumundan itibaren depodakileri degistirir,
// yenileri ekler, en fazla `max` mum tutar. Kuyruk, depodaki son mumdan bir periyottan
// fazla ileride basliyorsa arada eksik mum var demektir (gap) -- tam yukleme gerekir.
// Axi'nin kisa gunluk/Cumartesi arasi da bosluk gibi gorunebilir; o durumda tam yukleme
// ayni veriyi getirir, zararsiz.
export function mergeTail(existing: ChartCandle[], tail: ChartCandle[], max: number, stepSec: number): { candles: ChartCandle[]; gap: boolean } {
  if (tail.length === 0) return { candles: existing, gap: false }
  if (existing.length === 0) return { candles: tail.slice(-max), gap: false }
  const firstTail = tail[0].time
  const gap = firstTail > existing[existing.length - 1].time + stepSec
  let cut = existing.length
  while (cut > 0 && existing[cut - 1].time >= firstTail) cut--
  const merged = existing.slice(0, cut).concat(tail)
  return { candles: merged.length > max ? merged.slice(merged.length - max) : merged, gap }
}

async function fetchCandles(tf: Timeframe, limit: number, timeoutMs: number): Promise<ChartCandle[]> {
  const cfg = getMetaApiRestConfig()
  if (!cfg) throw new Error('METAAPI_TOKEN / METAAPI_ACCOUNT_ID tanımlı değil')
  const url =
    `${cfg.marketDataApi}/users/current/accounts/${cfg.accountId}` +
    `/historical-market-data/symbols/${AXI_SYMBOL}/timeframes/${tf}/candles?limit=${limit}`
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'auth-token': cfg.token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const candles = toChartCandles(await res.json())
    if (limit > TAIL_LIMIT) console.log(`[axiCandles] ${tf} limit=${limit} -> ${candles.length} mum, ${Date.now() - started} ms`)
    return candles
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError' ? `${Math.round(timeoutMs / 1000)} sn'de yanıt gelmedi` : String(err?.message ?? err)
    console.error(`[axiCandles] ${tf} limit=${limit} hata (${Date.now() - started} ms): ${msg}`)
    throw new Error(`${tf} limit=${limit}: ${msg}`)
  }
}

// Tam yukleme (1000; basarisiz olursa ve depo bossa 300). Hic reject etmez; sonuc depoda.
function ensureFullLoad(tf: Timeframe): Promise<void> {
  const s = store(tf)
  if (s.loading) return s.loading
  s.loading = (async () => {
    s.attemptAt = Date.now()
    const started = Date.now()
    try {
      const candles = await withSlot(() => fetchCandles(tf, FULL_LIMIT, FULL_TIMEOUT_MS))
      s.candles = candles
      s.complete = true
      s.needsFull = false
      s.fullAt = s.tailAt = Date.now()
      s.lastError = null
      s.lastFullMs = Date.now() - started
      return
    } catch (err: any) {
      s.lastError = String(err?.message ?? err)
    }
    if (s.candles.length > 0) return // eldeki veriyle devam; tam yukleme sonra tekrar denenir
    try {
      const candles = await withSlot(() => fetchCandles(tf, FALLBACK_LIMIT, FULL_TIMEOUT_MS))
      s.candles = candles
      s.complete = false
      s.needsFull = false
      s.fullAt = s.tailAt = Date.now()
    } catch (err: any) {
      s.lastError = `${s.lastError} | ${String(err?.message ?? err)}`
    }
  })().finally(() => {
    s.loading = null
  })
  return s.loading
}

// Son birkac mumu ceker ve depoya isler. Hic reject etmez.
function refreshTail(tf: Timeframe): Promise<void> {
  const s = store(tf)
  if (s.tailing) return s.tailing
  s.tailing = (async () => {
    try {
      const tail = await withSlot(() => fetchCandles(tf, TAIL_LIMIT, TAIL_TIMEOUT_MS))
      const { candles, gap } = mergeTail(s.candles, tail, FULL_LIMIT, TIMEFRAME_MS[tf] / 1000)
      s.candles = candles
      s.tailAt = Date.now()
      if (gap) s.needsFull = true
    } catch (err: any) {
      s.lastError = String(err?.message ?? err)
    }
  })().finally(() => {
    s.tailing = null
  })
  return s.tailing
}

// Ilk istekte diger zaman dilimlerini arka planda yuklemeye baslar -- gecisler aninda olsun.
// Hepsi ayni anda baslatilir; es zamanlilik withSlot ile sinirli oldugu icin MetaApi'ye
// yuklenme olmaz ve yavas bir dilim (4h/1d) digerlerini bekletmez. Istenen dilimin yuklemesi
// bundan ONCE siraya girer (getAxiCandles).
function warmUp(first: Timeframe) {
  const G = globals()
  if (G.warmedUp) return
  G.warmedUp = true
  for (const tf of TIMEFRAMES) {
    if (tf !== first) void ensureFullLoad(tf)
  }
}

export async function getAxiCandles(tf: Timeframe): Promise<ChartCandle[]> {
  const s = store(tf)
  const now = Date.now()

  if (s.candles.length === 0) {
    // Az once basarisiz olduysa MetaApi'ye ust uste yuklenme; istemci birkac sn sonra tekrar dener.
    if (!s.loading && s.attemptAt > 0 && now - s.attemptAt < FAILED_RETRY_MS) {
      warmUp(tf)
      throw new Error(s.lastError ?? 'Axi mumları yüklenemedi')
    }
    const loading = ensureFullLoad(tf)
    warmUp(tf)
    await loading
    if (s.candles.length === 0) throw new Error(s.lastError ?? 'Axi mumları yüklenemedi')
    return s.candles
  }

  warmUp(tf)

  if (s.needsFull || (!s.complete && now - s.attemptAt > PARTIAL_RETRY_MS) || now - s.fullAt > FULL_RELOAD_MS) {
    void ensureFullLoad(tf) // arka planda; bu istek eldeki veriyle doner
  }
  if (now - s.tailAt > TAIL_REFRESH_MS) {
    await Promise.race([refreshTail(tf), sleep(TAIL_WAIT_MS)])
  }
  return s.candles
}

export function getAxiCandleStoreStatus() {
  const now = Date.now()
  const out: Record<string, unknown> = {}
  for (const tf of TIMEFRAMES) {
    const s = globals().stores.get(tf)
    if (!s) {
      out[tf] = { candles: 0, loaded: false }
      continue
    }
    const newest = s.candles[s.candles.length - 1]
    out[tf] = {
      candles: s.candles.length,
      complete: s.complete,
      loading: s.loading != null,
      newestOpenTime: newest ? new Date(newest.time * 1000).toISOString() : null,
      fullLoadAgeSec: s.fullAt ? Math.round((now - s.fullAt) / 1000) : null,
      tailAgeSec: s.tailAt ? Math.round((now - s.tailAt) / 1000) : null,
      lastFullLoadMs: s.lastFullMs,
      lastError: s.lastError,
    }
  }
  return out
}
