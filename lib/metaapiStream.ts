// Dashboard'un MetaApi market data baglantisi (Faz 0).
//
// NEDEN STREAMING: REST current-price / account-information istekleri 50'ser CPU
// kredisi, uygulama kotasi (tek hesap) saatte 18k. Streaming bu kotayi HIC
// kullanmiyor (market data'nin kendi, cok daha genis kotasi var). Canli Axi
// fiyati, mumlar ve hesap bilgisi bu yuzden tek bir uzun omurlu baglantidan gelir.
//
// TEK BAGLANTI: Railway'de `next start` tek bir uzun omurlu Node sureci. Baglanti
// globalThis uzerinde singleton (route bundle'lari arasinda tekrar olusmasin diye)
// ve ilk istekte TEMBEL baslar -- build sirasinda asla baglanmaz.
//
// HESAP DEPLOY'U: Dashboard hesabi ASLA deploy/undeploy etmez (her baslatma en az
// 6 saat faturalaniyor; hesabin yasam dongusu monitor servisinde). Hesap deploy'lu
// degilse hata verir, 30 sn sonra gelen ilk istekte tekrar dener.
//
// mt5_order_monitor.js kendi baglantisiyla aynen devam eder. Hesap basina 10
// streaming aboneligi siniri var; bu baglanti ikincisi.
//
// SDK'nin paket kokundeki "import" kosulu tarayici (esm-web) build'ine gidiyor ve
// Node'da calismiyor -- bu yuzden acikca CJS node build'i ('/node') kullaniliyor.
import MetaApi from 'metaapi.cloud-sdk/node'
import { EventEmitter } from 'events'

export const AXI_SYMBOL = 'BTCUSD'
export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
}
const TIMEFRAME_SET = new Set<string>(TIMEFRAMES)

export interface Quote {
  bid: number
  ask: number
  time: string // ISO (UTC)
  brokerTime: string
}

export interface StreamCandle {
  timeframe: Timeframe
  time: string // acilis zamani, ISO (UTC)
  brokerTime: string
  open: number
  high: number
  low: number
  close: number
  tickVolume: number
}

export interface AccountSnapshot {
  balance: number
  equity: number
  margin: number
  freeMargin: number
  marginLevel: number | null
  currency: string
  leverage: number
  type: string // ACCOUNT_TRADE_MODE_DEMO | ACCOUNT_TRADE_MODE_REAL | ...
  server: string
  tradeAllowed: boolean
}

type Status = 'idle' | 'connecting' | 'synchronizing' | 'subscribing' | 'ready' | 'error'

interface CandleStats {
  count: number
  last: StreamCandle | null
  lastAt: number | null
  // Ayni acilis zamanli mumun degisen OHLC ile tekrar gelmesi = olusan (kapanmamis)
  // mum stream'de akiyor demek. Faz 0 dogrulamasinin asil sorusu bu.
  sameBarUpdates: number
}

interface MarketStreamState {
  status: Status
  error: string | null
  errorAt: number | null
  startedAt: number | null
  readyAt: number | null
  quoteCount: number
  lastQuote: Quote | null
  lastQuoteAt: number | null
  candles: Record<Timeframe, CandleStats>
  downgrades: string[]
  emitter: EventEmitter
  api: any | null
  connection: any | null
  initPromise: Promise<void> | null
}

const RETRY_AFTER_ERROR_MS = 30_000

const g = globalThis as typeof globalThis & { __hakariMarketStream?: MarketStreamState }

function freshState(): MarketStreamState {
  const emitter = new EventEmitter()
  emitter.setMaxListeners(200) // her SSE istemcisi 2 dinleyici ekler
  const candles = {} as Record<Timeframe, CandleStats>
  for (const tf of TIMEFRAMES) candles[tf] = { count: 0, last: null, lastAt: null, sameBarUpdates: 0 }
  return {
    status: 'idle',
    error: null,
    errorAt: null,
    startedAt: null,
    readyAt: null,
    quoteCount: 0,
    lastQuote: null,
    lastQuoteAt: null,
    candles,
    downgrades: [],
    emitter,
    api: null,
    connection: null,
    initPromise: null,
  }
}

export function getMarketStream(): MarketStreamState {
  if (!g.__hakariMarketStream) g.__hakariMarketStream = freshState()
  return g.__hakariMarketStream
}

function toIso(t: unknown): string {
  if (t instanceof Date) return t.toISOString()
  return new Date(t as string).toISOString()
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && !isNaN(x)
}

// SDK her olayi tum listener metodlarinda arar; olmayanlar icin sessiz no-op doner
// (mt5_order_monitor.js'teki createSafeListener ile ayni desen). 'then' ve symbol
// anahtarlari icin undefined -- nesne yanlislikla thenable gibi gorunmesin.
function createListener(s: MarketStreamState) {
  const handlers: Record<string, (...args: any[]) => Promise<void>> = {
    async onSymbolPriceUpdated(_instanceIndex: string, price: any) {
      if (!price || price.symbol !== AXI_SYMBOL || !isNum(price.bid) || !isNum(price.ask)) return
      const time = toIso(price.time)
      const last = s.lastQuote
      // High reliability'de iki replika ayni quote'u gonderebilir: eskiyi ve kopyayi at.
      if (last && (time < last.time || (time === last.time && last.bid === price.bid && last.ask === price.ask))) return
      const q: Quote = { bid: price.bid, ask: price.ask, time, brokerTime: price.brokerTime }
      s.lastQuote = q
      s.lastQuoteAt = Date.now()
      s.quoteCount++
      s.emitter.emit('quote', q)
    },

    async onCandlesUpdated(_instanceIndex: string, candles: any[]) {
      for (const c of candles ?? []) {
        if (!c || c.symbol !== AXI_SYMBOL || !TIMEFRAME_SET.has(c.timeframe)) continue
        if (![c.open, c.high, c.low, c.close].every(isNum)) continue
        const tf = c.timeframe as Timeframe
        const candle: StreamCandle = {
          timeframe: tf,
          time: toIso(c.time),
          brokerTime: c.brokerTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          tickVolume: isNum(c.tickVolume) ? c.tickVolume : 0,
        }
        const stats = s.candles[tf]
        const prev = stats.last
        if (prev && candle.time < prev.time) continue // eski replika paketi
        if (prev && prev.time === candle.time) {
          if (prev.open === candle.open && prev.high === candle.high && prev.low === candle.low && prev.close === candle.close) continue // kopya
          stats.sameBarUpdates++
        }
        stats.last = candle
        stats.lastAt = Date.now()
        stats.count++
        s.emitter.emit('candle', candle)
      }
    },

    async onSubscriptionDowngraded(_instanceIndex: string, symbol: string, updates: unknown, unsubscriptions: unknown) {
      const msg = `${new Date().toISOString()} ${symbol} ${JSON.stringify({ updates, unsubscriptions })}`
      s.downgrades = [...s.downgrades.slice(-9), msg]
      console.warn('[metaapiStream] market data aboneligi dusuruldu:', msg)
    },
  }

  return new Proxy(handlers, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      if (prop in target) return target[prop]
      return async () => {}
    },
  })
}

async function init(s: MarketStreamState): Promise<void> {
  const token = process.env.METAAPI_TOKEN
  const accountId = process.env.METAAPI_ACCOUNT_ID
  if (!token || !accountId) throw new Error('METAAPI_TOKEN / METAAPI_ACCOUNT_ID tanımlı değil')
  const region = process.env.METAAPI_REGION || 'london'

  s.status = 'connecting'
  s.error = null
  s.errorAt = null
  s.startedAt = Date.now()

  if (!s.api) s.api = new MetaApi(token, { region })
  const account = await s.api.metatraderAccountApi.getAccount(accountId)
  if (account.state !== 'DEPLOYED') {
    throw new Error(`MetaApi hesabı deploy'lu değil (state=${account.state}). Dashboard hesabı deploy etmez; monitor servisini kontrol et.`)
  }
  await account.waitConnected(120)

  // historyStartTime = simdi: gecmis deal/order senkronizasyonunu atla (bu baglantinin isi degil).
  const connection = account.getStreamingConnection(undefined, new Date())
  s.connection = connection
  connection.addSynchronizationListener(createListener(s))
  await connection.connect()

  s.status = 'synchronizing'
  await connection.waitSynchronized({ timeoutInSeconds: 180 })

  s.status = 'subscribing'
  try {
    await connection.subscribeToMarketData(AXI_SYMBOL, [
      { type: 'quotes' },
      ...TIMEFRAMES.map((timeframe) => ({ type: 'candles', timeframe })),
    ])
  } catch (err: any) {
    // Axi'nin kisa gunluk/Cumartesi arasinda ilk quote beklenirken zaman asimi olabilir;
    // abonelik SDK tarafinda kayitli kalir, quote'lar piyasa acilinca akmaya baslar.
    console.warn('[metaapiStream] subscribeToMarketData uyarisi:', err?.message ?? err)
  }

  s.status = 'ready'
  s.readyAt = Date.now()
  console.log('[metaapiStream] hazir:', AXI_SYMBOL, 'quotes +', TIMEFRAMES.join('/'), 'mumlari')
}

// Baglantiyi (gerekirse) baslatir; zaten baslamissa ayni promise'i doner.
// Hata sonrasi RETRY_AFTER_ERROR_MS gecince gelen ilk cagri yeniden dener.
export function ensureMarketStream(): Promise<void> {
  const s = getMarketStream()
  if (s.status === 'error' && s.errorAt != null && Date.now() - s.errorAt > RETRY_AFTER_ERROR_MS) {
    s.initPromise = null
  }
  if (!s.initPromise) {
    s.initPromise = init(s).catch(async (err: any) => {
      s.status = 'error'
      s.error = err?.message ?? String(err)
      s.errorAt = Date.now()
      console.error('[metaapiStream] baslatilamadi:', s.error)
      // Yarim kalan baglantiyi kapat -- hesap basina abonelik siniri var, sizinti olmasin.
      if (s.connection) {
        try {
          await s.connection.close()
        } catch {
          // yok say
        }
        s.connection = null
      }
      throw err
    })
  }
  return s.initPromise
}

export function getAccountSnapshot(): AccountSnapshot | null {
  const ai = getMarketStream().connection?.terminalState?.accountInformation
  if (!ai) return null
  return {
    balance: ai.balance,
    equity: ai.equity,
    margin: ai.margin,
    freeMargin: ai.freeMargin,
    marginLevel: isNum(ai.marginLevel) ? ai.marginLevel : null,
    currency: ai.currency,
    leverage: ai.leverage,
    type: ai.type,
    server: ai.server,
    tradeAllowed: ai.tradeAllowed,
  }
}

export function getStreamStatus() {
  const s = getMarketStream()
  const now = Date.now()
  const candles: Record<string, unknown> = {}
  for (const tf of TIMEFRAMES) {
    const c = s.candles[tf]
    candles[tf] = {
      updates: c.count,
      sameBarUpdates: c.sameBarUpdates,
      lastOpenTime: c.last?.time ?? null,
      lastClose: c.last?.close ?? null,
      lastIsForming: c.last ? Date.parse(c.last.time) + TIMEFRAME_MS[tf] > now : null,
      lastUpdateAgeMs: c.lastAt != null ? now - c.lastAt : null,
    }
  }
  return {
    status: s.status,
    error: s.error,
    connectingForMs: s.startedAt != null && s.readyAt == null ? now - s.startedAt : null,
    readyAt: s.readyAt != null ? new Date(s.readyAt).toISOString() : null,
    quoteCount: s.quoteCount,
    lastQuote: s.lastQuote,
    lastQuoteAgeMs: s.lastQuoteAt != null ? now - s.lastQuoteAt : null,
    candles,
    downgrades: s.downgrades,
  }
}
