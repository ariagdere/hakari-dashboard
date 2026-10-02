// /live grafigi icin Axi BTCUSD mumlari -- sunucu tarafi mum deposu + DB gecmisi.
//
// NEDEN: MetaApi'den 1000 mum cekmek yavas (4h/1d'de 30-60 sn) ve depo yalnizca bellekte
// oldugu icin her deploy/restart'ta bastan yuklemek gerekiyordu. Ustelik her grafik istegi
// son mumlarin MetaApi'den gelmesini birkac saniye bekliyordu. Simdi:
//   - Mumlar `candles` tablosunda, symbol 'AXI:BTCUSD'. Binance satirlari ('BTCUSDT') ayni
//     tabloda durur, onlara dokunulmaz (FVG Lab / analizler Binance verisini kullanir).
//   - Bos depo once DB'den dolar (milisaniyeler); MetaApi'den yalnizca eksik mumlar (son
//     kayittan bu yana) cekilir.
//   - DB'de hic yoksa (ilk calisma) 1000 mum MetaApi'den BIR KEZ yuklenir ve yazilir;
//     1000 basarisiz olursa 300'luk yedek, 1000 sonra arka planda tekrar denenir.
//   - Istekler MetaApi'yi beklemez: depodaki veriyle hemen doner. Sunucu acik oldugu surece
//     arka plandaki bakici (instrumentation.ts ile acilista baslar) son mumlari taze tutar ve
//     yeni / degisen mumlari DB'ye yazar -- DB kesintisiz bir Axi gecmisi olur.
//   - Veri geride kalmissa (orn. restart sonrasi ilk saniyeler) yanit 'stale' isaretli doner;
//     istemci birkac saniye sonra tekrar sorar.
//   - DB'ye erisilemezse (tablo yok vb.) yalnizca bellek + MetaApi ile calisir (eski davranis).
// Donus formati /api/candles ile ayni (time = UTC saniye).
import pool from './db'
import { AXI_SYMBOL, TIMEFRAMES, TIMEFRAME_MS, Timeframe } from './axiMarket'
import { getMetaApiRestConfig } from './metaapiRest'

export interface ChartCandle {
  time: number // acilis zamani, UTC saniye
  open: number
  high: number
  low: number
  close: number
}

interface StoredCandle extends ChartCandle {
  volume: number | null // MetaApi tickVolume
}

export const AXI_DB_SYMBOL = 'AXI:BTCUSD'

const FULL_LIMIT = 1000
const FALLBACK_LIMIT = 300
const TAIL_MIN = 3
const FULL_TIMEOUT_MS = 60_000
const TAIL_TIMEOUT_MS = 20_000
const PARTIAL_RETRY_MS = 5 * 60_000 // sadece yedek (300) varsa 1000 tekrar denenir
const FAILED_RETRY_MS = 15_000 // hic veri yokken basarisiz denemeden sonra bekleme
const DB_RETRY_MS = 60_000 // DB hatasindan sonra bu sure DB denenmez
const KEEPER_TICK_MS = 10_000
// Bakici son mumlari bu araliklarla tazeler. Olusan mum istemcide canli fiyattan da
// guncelleniyor; bu tazeleme broker'in kesin OHLC'sini ve kapanan mumlari getirir.
const KEEP_FRESH_MS: Record<Timeframe, number> = { '5m': 20_000, '15m': 30_000, '1h': 60_000, '4h': 60_000, '1d': 60_000 }
const MAX_CONCURRENT = 3 // MetaApi: hesap basina ayni anda en fazla 5 historical istek; pay birakiyoruz

interface TfStore {
  candles: StoredCandle[]
  complete: boolean // 1000'lik yukleme basarili ya da DB'de >= 1000 mum
  source: 'db' | 'metaapi' | null // depo ilk nereden doldu (tanilama)
  dbChecked: boolean // DB'den yukleme denendi ve DB yanit verdi
  dbLoading: Promise<void> | null
  loading: Promise<void> | null
  tailing: Promise<void> | null
  attemptAt: number // son tam yukleme denemesi
  tailAt: number // son basarili tazeleme
  lastError: string | null
  lastFullMs: number | null
  gapWarnedAt: number
}

interface Globals {
  stores: Map<Timeframe, TfStore>
  active: number
  queue: Array<() => void>
  keeper: ReturnType<typeof setInterval> | null
  dbDisabledUntil: number
  dbError: string | null
  dbWrites: number
}

const g = globalThis as typeof globalThis & { __hakariAxiCandles?: Globals }

function globals(): Globals {
  if (!g.__hakariAxiCandles) {
    g.__hakariAxiCandles = { stores: new Map(), active: 0, queue: [], keeper: null, dbDisabledUntil: 0, dbError: null, dbWrites: 0 }
  }
  return g.__hakariAxiCandles
}

function store(tf: Timeframe): TfStore {
  const G = globals()
  let s = G.stores.get(tf)
  if (!s) {
    s = {
      candles: [], complete: false, source: null, dbChecked: false, dbLoading: null, loading: null, tailing: null,
      attemptAt: 0, tailAt: 0, lastError: null, lastFullMs: null, gapWarnedAt: 0,
    }
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

function isNum(x: unknown): x is number {
  return typeof x === 'number' && !isNaN(x)
}

// MetaApi mum dizisini depo formatina cevirir: gecersiz satirlari atar, zamana gore siralar,
// ayni acilis zamani iki kez gelirse sonuncuyu tutar (lightweight-charts artan ve tekil zaman ister).
export function toChartCandles(raw: unknown): StoredCandle[] {
  if (!Array.isArray(raw)) throw new Error('MetaApi historical candles: beklenmeyen yanıt')
  const rows: StoredCandle[] = []
  for (const c of raw) {
    const t = Date.parse(c?.time)
    if (!Number.isFinite(t) || ![c?.open, c?.high, c?.low, c?.close].every(isNum)) continue
    const volume = isNum(c?.tickVolume) ? c.tickVolume : isNum(c?.volume) ? c.volume : null
    rows.push({ time: Math.floor(t / 1000), open: c.open, high: c.high, low: c.low, close: c.close, volume })
  }
  rows.sort((a, b) => a.time - b.time)
  const out: StoredCandle[] = []
  for (const r of rows) {
    if (out.length > 0 && out[out.length - 1].time === r.time) out[out.length - 1] = r
    else out.push(r)
  }
  return out
}

// Yeni mumlari depoya isler: yenilerin ilk mumundan itibaren depodakileri degistirir, yenileri
// ekler, en fazla `max` mum tutar. Yeniler, depodaki son mumdan bir periyottan fazla ileride
// basliyorsa arada eksik mum var demektir (gap).
export function mergeTail<T extends ChartCandle>(existing: T[], tail: T[], max: number, stepSec: number): { candles: T[]; gap: boolean } {
  if (tail.length === 0) return { candles: existing, gap: false }
  if (existing.length === 0) return { candles: tail.slice(-max), gap: false }
  const firstTail = tail[0].time
  const gap = firstTail > existing[existing.length - 1].time + stepSec
  let cut = existing.length
  while (cut > 0 && existing[cut - 1].time >= firstTail) cut--
  const merged = existing.slice(0, cut).concat(tail)
  return { candles: merged.length > max ? merged.slice(merged.length - max) : merged, gap }
}

async function fetchCandles(tf: Timeframe, limit: number, timeoutMs: number): Promise<StoredCandle[]> {
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
    if (limit > TAIL_MIN) console.log(`[axiCandles] ${tf} limit=${limit} -> ${candles.length} mum, ${Date.now() - started} ms`)
    return candles
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError' ? `${Math.round(timeoutMs / 1000)} sn'de yanıt gelmedi` : String(err?.message ?? err)
    console.error(`[axiCandles] ${tf} limit=${limit} hata (${Date.now() - started} ms): ${msg}`)
    throw new Error(`${tf} limit=${limit}: ${msg}`)
  }
}

// -------------------- DB --------------------

function dbAvailable(): boolean {
  return Date.now() >= globals().dbDisabledUntil
}

function dbFailed(err: any) {
  const G = globals()
  G.dbDisabledUntil = Date.now() + DB_RETRY_MS
  const msg = String(err?.message ?? err)
  if (G.dbError !== msg) {
    const hint = /relation "candles" does not exist/.test(msg) ? ' (candles tablosu yok -- db/002_candles_multi_tf.sql)' : ''
    console.error(`[axiCandles] DB kullanilamiyor, ${DB_RETRY_MS / 1000} sn yalnizca bellek + MetaApi: ${msg}${hint}`)
  }
  G.dbError = msg
}

// Son FULL_LIMIT mum. null: DB kullanilamadi.
async function dbLoad(tf: Timeframe): Promise<StoredCandle[] | null> {
  if (!dbAvailable()) return null
  try {
    const { rows } = await pool.query(
      `SELECT open_time, open, high, low, close, volume FROM candles
        WHERE symbol = $1 AND interval = $2
        ORDER BY open_time DESC
        LIMIT $3`,
      [AXI_DB_SYMBOL, tf, FULL_LIMIT],
    )
    globals().dbError = null
    return rows.reverse().map((r) => ({
      time: Math.floor(Number(r.open_time) / 1000),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: r.volume != null ? Number(r.volume) : null,
    }))
  } catch (err) {
    dbFailed(err)
    return null
  }
}

// Tek sorguda toplu upsert; yalnizca degisen satirlar yazilir.
async function dbSave(tf: Timeframe, candles: StoredCandle[]): Promise<void> {
  if (candles.length === 0 || !dbAvailable()) return
  try {
    await pool.query(
      `INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume, updated_at)
       SELECT $1, $2, t.open_time, t.open, t.high, t.low, t.close, t.volume, now()
         FROM unnest($3::bigint[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[])
              AS t(open_time, open, high, low, close, volume)
       ON CONFLICT (symbol, interval, open_time) DO UPDATE SET
         open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close,
         volume = EXCLUDED.volume, updated_at = now()
       WHERE (candles.open, candles.high, candles.low, candles.close, candles.volume)
             IS DISTINCT FROM (EXCLUDED.open, EXCLUDED.high, EXCLUDED.low, EXCLUDED.close, EXCLUDED.volume)`,
      [
        AXI_DB_SYMBOL,
        tf,
        candles.map((c) => c.time * 1000),
        candles.map((c) => c.open),
        candles.map((c) => c.high),
        candles.map((c) => c.low),
        candles.map((c) => c.close),
        candles.map((c) => c.volume),
      ],
    )
    globals().dbWrites++
  } catch (err) {
    dbFailed(err)
  }
}

// -------------------- Depo --------------------

// Bos depoyu DB'den doldurur (hizli). Hic reject etmez.
function loadFromDb(tf: Timeframe): Promise<void> {
  const s = store(tf)
  if (s.dbChecked || s.candles.length > 0 || !dbAvailable()) return Promise.resolve()
  if (s.dbLoading) return s.dbLoading
  s.dbLoading = (async () => {
    const rows = await dbLoad(tf)
    if (rows === null) return // DB yok: MetaApi yolu
    s.dbChecked = true
    if (rows.length === 0 || s.candles.length > 0) return
    s.candles = rows
    s.source = 'db'
    s.complete = rows.length >= FULL_LIMIT
    s.tailAt = 0 // tazeligi bilinmiyor: bakici hemen eksikleri ceker
    if (!s.complete) s.attemptAt = 0 // 1000'e tamamlamayi hemen dene (arka planda)
  })().finally(() => {
    s.dbLoading = null
  })
  return s.dbLoading
}

// Tam yukleme (1000; basarisiz olursa ve depo bossa 300). Hic reject etmez; sonuc depoda ve DB'de.
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
      s.source = s.source ?? 'metaapi'
      s.tailAt = Date.now()
      s.lastError = null
      s.lastFullMs = Date.now() - started
      void dbSave(tf, candles)
      return
    } catch (err: any) {
      s.lastError = String(err?.message ?? err)
    }
    if (s.candles.length > 0) return // eldeki veriyle devam; tam yukleme sonra tekrar denenir
    try {
      const candles = await withSlot(() => fetchCandles(tf, FALLBACK_LIMIT, FULL_TIMEOUT_MS))
      s.candles = candles
      s.complete = false
      s.source = s.source ?? 'metaapi'
      s.tailAt = Date.now()
      void dbSave(tf, candles)
    } catch (err: any) {
      s.lastError = `${s.lastError} | ${String(err?.message ?? err)}`
    }
  })().finally(() => {
    s.loading = null
  })
  return s.loading
}

// Eksik mumlari ceker (+2: son kayitli mumu tamamlamak ve olusan mum icin), depoya isler,
// DB'ye yazar. Hic reject etmez. Eksik sayisi son basarili tazelemeden bu yana gecen sureden
// hesaplanir (tazeleme yoksa, orn. DB'den yeni yuklendiyse, depodaki son mumdan): boylece piyasa
// kapaliyken (yeni mum olusmazken) istekler buyumez, hep birkac mumluk kalir.
function refreshTail(tf: Timeframe): Promise<void> {
  const s = store(tf)
  if (s.tailing) return s.tailing
  s.tailing = (async () => {
    try {
      const newest = s.candles[s.candles.length - 1]
      const stepSec = TIMEFRAME_MS[tf] / 1000
      const nowSec = Date.now() / 1000
      const since = !newest ? nowSec - FULL_LIMIT * stepSec : s.tailAt > 0 ? Math.max(newest.time, s.tailAt / 1000 - stepSec) : newest.time
      const periods = Math.floor((nowSec - since) / stepSec)
      const limit = Math.min(FULL_LIMIT, Math.max(TAIL_MIN, periods + 2))
      const tail = await withSlot(() => fetchCandles(tf, limit, limit > 50 ? FULL_TIMEOUT_MS : TAIL_TIMEOUT_MS))
      const { candles, gap } = mergeTail(s.candles, tail, FULL_LIMIT, stepSec)
      s.candles = candles
      s.tailAt = Date.now()
      if (gap && Date.now() - s.gapWarnedAt > 60 * 60_000) {
        s.gapWarnedAt = Date.now()
        console.warn(`[axiCandles] ${tf}: son mumla yeni mumlar arasinda bosluk var (piyasa kapali kalmis ya da sunucu ${FULL_LIMIT} mumdan uzun sure kapali kalmis)`)
      }
      void dbSave(tf, tail)
    } catch (err: any) {
      s.lastError = String(err?.message ?? err)
    }
  })().finally(() => {
    s.tailing = null
  })
  return s.tailing
}

// Arada en az bir kapanmis mum eksik mi (en yeni mum bir onceki periyottan da eski)
function isBehind(s: TfStore, tf: Timeframe): boolean {
  const newest = s.candles[s.candles.length - 1]
  if (!newest) return true
  return newest.time + (2 * TIMEFRAME_MS[tf]) / 1000 <= Date.now() / 1000
}

// Bir zaman diliminin bakimi: bossa DB'den / MetaApi'den doldur, eksikse 1000'e tamamla,
// eskiyse son mumlari tazele. Hic reject etmez.
async function maintain(tf: Timeframe): Promise<void> {
  const s = store(tf)
  const now = Date.now()
  if (s.candles.length === 0) {
    await loadFromDb(tf)
    if (s.candles.length === 0) {
      if (!s.loading && now - s.attemptAt > FAILED_RETRY_MS) void ensureFullLoad(tf)
      return
    }
  }
  if (!s.complete && !s.loading && now - s.attemptAt > PARTIAL_RETRY_MS) void ensureFullLoad(tf)
  if (!s.loading && now - s.tailAt > KEEP_FRESH_MS[tf]) void refreshTail(tf)
}

// Arka plan bakicisi: sunucu acik oldugu surece tum dilimleri taze tutar ve DB'ye yazar.
// instrumentation.ts acilista baslatir; ilk grafik istegi de baslatir (ikisi ayni bakici).
export function startAxiCandleKeeper(): void {
  const G = globals()
  if (G.keeper) return
  if (!getMetaApiRestConfig()) return // MetaApi ayarlari yoksa (orn. yerel gelistirme) calistirma
  const tick = () => {
    for (const tf of TIMEFRAMES) void maintain(tf)
  }
  G.keeper = setInterval(tick, KEEPER_TICK_MS)
  if (typeof G.keeper.unref === 'function') G.keeper.unref()
  tick()
}

const toChart = (c: StoredCandle): ChartCandle => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })

export async function getAxiCandles(tf: Timeframe): Promise<{ candles: ChartCandle[]; stale: boolean }> {
  startAxiCandleKeeper()
  const s = store(tf)

  if (s.candles.length === 0) await loadFromDb(tf)

  if (s.candles.length === 0) {
    // DB'de de yok (ilk calisma ya da DB kullanilamiyor): MetaApi'den tam yukleme -- bekleyen tek yol.
    const now = Date.now()
    if (!s.loading && s.attemptAt > 0 && now - s.attemptAt < FAILED_RETRY_MS) {
      throw new Error(s.lastError ?? 'Axi mumları yüklenemedi')
    }
    await ensureFullLoad(tf)
    if (s.candles.length === 0) throw new Error(s.lastError ?? 'Axi mumları yüklenemedi')
    return { candles: s.candles.map(toChart), stale: false }
  }

  // Eldeki veriyle hemen don; gerekiyorsa tazeleme arka planda (bakicinin bir sonraki turunu beklemeden)
  void maintain(tf)
  const stale = isBehind(s, tf) && (s.tailing != null || Date.now() - s.tailAt > KEEP_FRESH_MS[tf])
  return { candles: s.candles.map(toChart), stale }
}

export function getAxiCandleStoreStatus() {
  const G = globals()
  const now = Date.now()
  const out: Record<string, unknown> = {
    db: {
      symbol: AXI_DB_SYMBOL,
      available: dbAvailable(),
      lastError: G.dbError,
      writes: G.dbWrites,
    },
    keeper: G.keeper != null,
  }
  for (const tf of TIMEFRAMES) {
    const s = G.stores.get(tf)
    if (!s) {
      out[tf] = { candles: 0, loaded: false }
      continue
    }
    const newest = s.candles[s.candles.length - 1]
    out[tf] = {
      candles: s.candles.length,
      complete: s.complete,
      source: s.source,
      loading: s.loading != null,
      newestOpenTime: newest ? new Date(newest.time * 1000).toISOString() : null,
      behind: s.candles.length > 0 ? isBehind(s, tf) : null,
      tailAgeSec: s.tailAt ? Math.round((now - s.tailAt) / 1000) : null,
      lastFullLoadMs: s.lastFullMs,
      lastError: s.lastError,
    }
  }
  return out
}
