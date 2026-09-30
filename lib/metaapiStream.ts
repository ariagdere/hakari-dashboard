// Dashboard'un MetaApi market data baglantisi.
//
// NEDEN STREAMING: canli Axi fiyati ve hesap bilgisi REST poll'u yerine tek bir uzun
// omurlu baglantidan anlik gelir; streaming REST/RPC CPU kredisi de tuketmez.
//
// SADECE QUOTE: Faz 0 tanilamasinda mum aboneligi 20 sn'de hic veri getirmedi (SDK'nin
// subscribeToMarketData tip tanimi da abonelik tiplerinin sunucu tarafinda tam
// desteklenmedigini not ediyor). Bu yuzden sadece quote'lara abone olunuyor; /live
// grafiginde olusan mum quote'lardan guncelleniyor, gecmis mumlar REST'ten geliyor
// (lib/axiCandles.ts).
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
import { AXI_SYMBOL } from './axiMarket'

export interface Quote {
  bid: number
  ask: number
  time: string // ISO (UTC)
  brokerTime: string
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

interface MarketStreamState {
  status: Status
  error: string | null
  errorAt: number | null
  subscribeWarning: string | null
  startedAt: number | null
  readyAt: number | null
  quoteCount: number
  lastQuote: Quote | null
  lastQuoteAt: number | null
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
  emitter.setMaxListeners(200) // her SSE istemcisi bir dinleyici ekler
  return {
    status: 'idle',
    error: null,
    errorAt: null,
    subscribeWarning: null,
    startedAt: null,
    readyAt: null,
    quoteCount: 0,
    lastQuote: null,
    lastQuoteAt: null,
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
  s.subscribeWarning = null
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
    await connection.subscribeToMarketData(AXI_SYMBOL, [{ type: 'quotes' }])
  } catch (err: any) {
    // Axi'nin kisa gunluk/Cumartesi arasinda ilk quote beklenirken zaman asimi olabilir;
    // abonelik SDK tarafinda kayitli kalir, quote'lar piyasa acilinca akmaya baslar.
    s.subscribeWarning = String(err?.message ?? err)
    console.warn('[metaapiStream] subscribeToMarketData uyarisi:', s.subscribeWarning)
  }

  s.status = 'ready'
  s.readyAt = Date.now()
  console.log('[metaapiStream] hazir:', AXI_SYMBOL, 'quote akisi')
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
  return {
    status: s.status,
    error: s.error,
    subscribeWarning: s.subscribeWarning,
    connectingForMs: s.startedAt != null && s.readyAt == null ? now - s.startedAt : null,
    readyAt: s.readyAt != null ? new Date(s.readyAt).toISOString() : null,
    quoteCount: s.quoteCount,
    lastQuote: s.lastQuote,
    lastQuoteAgeMs: s.lastQuoteAt != null ? now - s.lastQuoteAt : null,
    downgrades: s.downgrades,
  }
}
