// MetaApi: BTCUSD sembol bilgisi, taze fiyat, emir gonderimi (REST), pozisyon okuma (REST).
import { AXI_SYMBOL } from './axiMarket'
import { getMetaApiRestConfig } from './metaapiRest'
import { getMarketStream } from './metaapiStream'
import { clientKeyOf } from './panelOrder'
import type { Direction, SizingSpec } from './orderMath'

export interface SymbolSpec extends SizingSpec {
  tickSize: number
  digits: number
  tradeMode: string | null
  swapMode: string | null
  swapLong: number | null
  swapShort: number | null
}

export interface FreshQuote {
  bid: number
  ask: number
  time: string // ISO
  source: 'stream' | 'rest'
}

export type SpecSource = 'stream' | 'rest' | 'cache'

const SPEC_TTL_MS = 60 * 60_000
const SPEC_REST_ATTEMPTS = 3
const SPEC_REST_TIMEOUT_MS = 8_000
const g = globalThis as typeof globalThis & {
  __hakariSymbolSpec?: { at: number; spec: SymbolSpec; source: 'stream' | 'rest' }
  __hakariSpecInflight?: Promise<SymbolSpec> | null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function requireConfig() {
  const cfg = getMetaApiRestConfig()
  if (!cfg) throw new Error('METAAPI_TOKEN / METAAPI_ACCOUNT_ID tanımlı değil')
  return cfg
}

async function metaApiJson(url: string, token: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<{ status: number; ok: boolean; body: any }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'auth-token': token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text.slice(0, 400)
  }
  return { status: res.status, ok: res.ok, body }
}

function num(x: unknown): number | null {
  return typeof x === 'number' && !isNaN(x) ? x : null
}

function toSpec(b: any): SymbolSpec | null {
  if (!b || typeof b !== 'object') return null
  const spec: SymbolSpec = {
    contractSize: Number(b.contractSize),
    minVolume: Number(b.minVolume),
    maxVolume: Number(b.maxVolume),
    volumeStep: Number(b.volumeStep),
    stopsLevel: num(b.stopsLevel) ?? 0,
    point: num(b.point) ?? num(b.tickSize) ?? 0.01,
    tickSize: num(b.tickSize) ?? 0.01,
    digits: num(b.digits) ?? 2,
    tradeMode: typeof b.tradeMode === 'string' ? b.tradeMode : null,
    swapMode: typeof b.swapMode === 'string' ? b.swapMode : null,
    swapLong: num(b.swapLong),
    swapShort: num(b.swapShort),
  }
  // Boyutlandirmanin dayandigi alanlar eksikse bu kaynagi kullanma
  const ok = [spec.contractSize, spec.minVolume, spec.volumeStep].every((x) => isFinite(x) && x > 0)
  return ok ? spec : null
}

// Dashboard'un streaming baglantisi (fiyatlar da buradan geliyor): MetaApi senkronizasyonda
// terminaldeki sembol bilgilerini de gonderiyor ve degisince guncelliyor -- REST cagrisi yok.
export function specFromStream(): SymbolSpec | null {
  try {
    return toSpec(getMarketStream().connection?.terminalState?.specification?.(AXI_SYMBOL))
  } catch {
    return null // yeniden senkronizasyon sirasinda gecici olarak bos olabilir
  }
}

// REST /specification. MetaApi zaman zaman 504 donuyor (terminal zamaninda yanit vermedi):
// 5xx / 429 / zaman asiminda tekrar dene. 4xx (yetki, hesap yok) tekrar denemekle duzelmez.
async function specFromRest(): Promise<SymbolSpec> {
  const cfg = requireConfig()
  const url = `${cfg.clientApi}/users/current/accounts/${cfg.accountId}/symbols/${AXI_SYMBOL}/specification`
  let last = ''
  for (let attempt = 1; attempt <= SPEC_REST_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(attempt === 2 ? 700 : 2_000)
    try {
      const r = await metaApiJson(url, cfg.token, {}, SPEC_REST_TIMEOUT_MS)
      if (r.ok) {
        const spec = toSpec(r.body)
        if (spec) return spec
        last = 'eksik yanıt'
        continue
      }
      last = `HTTP ${r.status}`
      if (r.status < 500 && r.status !== 429) break
    } catch (err: any) {
      last = err?.name === 'TimeoutError' ? 'zaman aşımı' : String(err?.message ?? err)
    }
  }
  throw new Error(`Sembol bilgisi alınamadı (${last}, ${SPEC_REST_ATTEMPTS} deneme)`)
}

// BTCUSD sembol bilgisi (lot adimi, en kucuk lot, kontrat buyuklugu, stop mesafesi), bu sirayla:
//   1) streaming baglantisi -- her zaman guncel, ek istek yok
//   2) son 1 saatte alinmis deger
//   3) REST (tekrar denemeli; ayni anda gelen istekler tek REST cagrisini paylasir)
//   4) REST de basarisizsa son basarili deger (eski de olsa): sembol bilgisi neredeyse hic
//      degismez; degismisse MT5 emri reddeder (lot/stop hatasi), zarar dogmaz.
export async function getSymbolSpecWithSource(): Promise<{ spec: SymbolSpec; source: SpecSource }> {
  const live = specFromStream()
  if (live) {
    g.__hakariSymbolSpec = { at: Date.now(), spec: live, source: 'stream' }
    return { spec: live, source: 'stream' }
  }
  const hit = g.__hakariSymbolSpec
  if (hit && Date.now() - hit.at < SPEC_TTL_MS) return { spec: hit.spec, source: 'cache' }
  try {
    if (!g.__hakariSpecInflight) {
      g.__hakariSpecInflight = specFromRest().finally(() => {
        g.__hakariSpecInflight = null
      })
    }
    const spec = await g.__hakariSpecInflight
    g.__hakariSymbolSpec = { at: Date.now(), spec, source: 'rest' }
    return { spec, source: 'rest' }
  } catch (err: any) {
    if (hit) {
      console.warn(`[metaapiTrade] ${String(err?.message ?? err)} -- ${Math.round((Date.now() - hit.at) / 60_000)} dk onceki sembol bilgisi kullaniliyor`)
      return { spec: hit.spec, source: 'cache' }
    }
    throw err
  }
}

export async function getSymbolSpec(): Promise<SymbolSpec> {
  return (await getSymbolSpecWithSource()).spec
}

// Emir aninda kullanilacak taze fiyat: once dashboard'un streaming baglantisi (ek maliyet yok),
// son 10 sn'de quote gelmediyse REST current-price.
export async function getFreshQuote(): Promise<FreshQuote> {
  const s = getMarketStream()
  if (s.status === 'ready' && s.lastQuote && s.lastQuoteAt != null && Date.now() - s.lastQuoteAt < 10_000) {
    return { bid: s.lastQuote.bid, ask: s.lastQuote.ask, time: s.lastQuote.time, source: 'stream' }
  }
  // REST yedegi: 5xx / zaman asiminda bir kez daha dene
  const cfg = requireConfig()
  const url = `${cfg.clientApi}/users/current/accounts/${cfg.accountId}/symbols/${AXI_SYMBOL}/current-price`
  let last = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) await sleep(500)
    try {
      const r = await metaApiJson(url, cfg.token, {}, 6_000)
      const bid = num(r.body?.bid)
      const ask = num(r.body?.ask)
      if (r.ok && bid != null && ask != null) {
        const time = typeof r.body.time === 'string' ? r.body.time : new Date().toISOString()
        return { bid, ask, time, source: 'rest' }
      }
      last = `HTTP ${r.status}`
      if (r.ok || (r.status < 500 && r.status !== 429)) break
    } catch (err: any) {
      last = err?.name === 'TimeoutError' ? 'zaman aşımı' : String(err?.message ?? err)
    }
  }
  throw new Error(`Güncel fiyat alınamadı (${last})`)
}

export type TradeOutcome =
  // placedOnly: TRADE_RETCODE_PLACED -- emir kabul edildi ama dolum henuz kesin degil
  | { kind: 'executed'; code: string; message: string; orderId: string | null; positionId: string | null; placedOnly: boolean }
  // source 'mt5': islem sunucusunun kesin ret kodu; 'metaapi': istek MT5'e hic iletilmedi (4xx)
  | { kind: 'rejected'; code: string; message: string; source: 'mt5' | 'metaapi' }
  | { kind: 'unknown'; message: string } // zaman asimi / ag hatasi / 5xx / tanimadigimiz kod: emir gitmis de olabilir

// MetaApi SDK'sinin basari saydigi kodlarla ayni (metaApiWebsocket.client.js trade()).
const SUCCESS_CODES = new Set(['ERR_NO_ERROR', 'TRADE_RETCODE_PLACED', 'TRADE_RETCODE_DONE', 'TRADE_RETCODE_DONE_PARTIAL', 'TRADE_RETCODE_NO_CHANGES'])
const SUCCESS_NUMERIC = new Set([0, 10008, 10009, 10010, 10025])
// Emrin ISLENMEDIGI kesin MT5 kodlari. Bunlarin disindaki her kod (orn. TRADE_RETCODE_ERROR,
// TRADE_RETCODE_TIMEOUT ya da hic tanimadigimiz bir kod) "belirsiz" sayilir: emir tekrar
// gonderilmez, pozisyon aranir.
const REJECT_CODES = new Set([
  'TRADE_RETCODE_REQUOTE', 'TRADE_RETCODE_REJECT', 'TRADE_RETCODE_CANCEL', 'TRADE_RETCODE_INVALID',
  'TRADE_RETCODE_INVALID_VOLUME', 'TRADE_RETCODE_INVALID_PRICE', 'TRADE_RETCODE_INVALID_STOPS',
  'TRADE_RETCODE_TRADE_DISABLED', 'TRADE_RETCODE_MARKET_CLOSED', 'TRADE_RETCODE_NO_MONEY',
  'TRADE_RETCODE_PRICE_CHANGED', 'TRADE_RETCODE_PRICE_OFF', 'TRADE_RETCODE_INVALID_EXPIRATION',
  'TRADE_RETCODE_ORDER_CHANGED', 'TRADE_RETCODE_TOO_MANY_REQUESTS', 'TRADE_RETCODE_SERVER_DISABLES_AT',
  'TRADE_RETCODE_CLIENT_DISABLES_AT', 'TRADE_RETCODE_LOCKED', 'TRADE_RETCODE_FROZEN', 'TRADE_RETCODE_INVALID_FILL',
  'TRADE_RETCODE_CONNECTION', 'TRADE_RETCODE_ONLY_REAL', 'TRADE_RETCODE_LIMIT_ORDERS', 'TRADE_RETCODE_LIMIT_VOLUME',
  'TRADE_RETCODE_INVALID_ORDER', 'TRADE_RETCODE_POSITION_CLOSED', 'TRADE_RETCODE_INVALID_CLOSE_VOLUME',
  'TRADE_RETCODE_CLOSE_ORDER_EXIST', 'TRADE_RETCODE_LIMIT_POSITIONS', 'TRADE_RETCODE_REJECT_CANCEL',
  'TRADE_RETCODE_LONG_ONLY', 'TRADE_RETCODE_SHORT_ONLY', 'TRADE_RETCODE_CLOSE_ONLY', 'TRADE_RETCODE_FIFO_CLOSE',
  'TRADE_RETCODE_HEDGE_PROHIBITED',
])

// Mutlak SL/TP ile market emir. Emir ASLA burada tekrar denenmez: belirsiz sonucta
// cagiran taraf pozisyonu arar (findPanelPosition).
export async function sendMarketOrder(p: { direction: Direction; volume: number; sl: number; tp: number; clientId: string; magic: number }): Promise<TradeOutcome> {
  const cfg = requireConfig()
  const body = {
    actionType: p.direction === 'LONG' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
    symbol: AXI_SYMBOL,
    volume: p.volume,
    stopLoss: p.sl,
    takeProfit: p.tp,
    magic: p.magic,
    clientId: p.clientId,
  }
  let r: { status: number; ok: boolean; body: any }
  try {
    r = await metaApiJson(`${cfg.clientApi}/users/current/accounts/${cfg.accountId}/trade`, cfg.token, { method: 'POST', body: JSON.stringify(body) }, 30_000)
  } catch (err: any) {
    const message = err?.name === 'TimeoutError' ? "MetaApi 30 sn'de yanıt vermedi" : String(err?.message ?? err)
    return { kind: 'unknown', message }
  }
  if (r.status >= 500) return { kind: 'unknown', message: `MetaApi HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}` }
  const b = r.body && typeof r.body === 'object' ? r.body : {}
  // SDK ile ayni normalizasyon: stringCode || description, numericCode ?? error (sayiysa)
  const stringCode: string | null = typeof b.stringCode === 'string' ? b.stringCode : typeof b.description === 'string' ? b.description : null
  const numericCode: number | null = typeof b.numericCode === 'number' ? b.numericCode : typeof b.error === 'number' ? b.error : null
  const message = String(b.message ?? '')
  if (r.ok) {
    if ((stringCode && SUCCESS_CODES.has(stringCode)) || (!stringCode && numericCode != null && SUCCESS_NUMERIC.has(numericCode))) {
      return {
        kind: 'executed',
        code: stringCode ?? String(numericCode),
        message,
        orderId: b.orderId != null ? String(b.orderId) : null,
        positionId: b.positionId != null ? String(b.positionId) : null,
        placedOnly: stringCode === 'TRADE_RETCODE_PLACED' || (!stringCode && numericCode === 10008),
      }
    }
    if (stringCode && REJECT_CODES.has(stringCode)) return { kind: 'rejected', code: stringCode, message, source: 'mt5' }
    return { kind: 'unknown', message: `MetaApi belirsiz yanıt: ${stringCode ?? numericCode ?? JSON.stringify(r.body).slice(0, 200)}${message ? ` (${message})` : ''}` }
  }
  // 4xx: istek MT5'e iletilmedi (dogrulama, yetki, hesap bagli degil, hiz siniri ...)
  return { kind: 'rejected', code: String(stringCode ?? (typeof b.error === 'string' ? b.error : null) ?? `HTTP_${r.status}`), message, source: 'metaapi' }
}

export interface OpenPosition {
  id: string
  type: string | null // POSITION_TYPE_BUY | POSITION_TYPE_SELL
  magic: number | null
  time: string | null
  openPrice: number
  stopLoss: number | null // 0 / yok -> null
  takeProfit: number | null
  volume: number
  clientId: string | null
}

function positive(x: unknown): number | null {
  return typeof x === 'number' && isFinite(x) && x > 0 ? x : null
}

function toPosition(p: any): OpenPosition | null {
  if (!p || p.id == null || num(p.openPrice) == null) return null
  return {
    id: String(p.id),
    type: typeof p.type === 'string' ? p.type : null,
    magic: num(p.magic),
    time: typeof p.time === 'string' ? p.time : null,
    openPrice: p.openPrice,
    stopLoss: positive(p.stopLoss),
    takeProfit: positive(p.takeProfit),
    volume: Number(p.volume),
    clientId: typeof p.clientId === 'string' ? p.clientId : null,
  }
}

export async function getPosition(positionId: string): Promise<OpenPosition | null> {
  const cfg = requireConfig()
  const r = await metaApiJson(`${cfg.clientApi}/users/current/accounts/${cfg.accountId}/positions/${encodeURIComponent(positionId)}`, cfg.token, {}, 10_000)
  return r.ok ? toPosition(r.body) : null
}

export interface PanelOrderRef {
  clientKey: string
  direction: Direction
  volume: number
  magic: number
  since: Date // emrin gonderildigi an
}

// clientId eslesmesi yoksa yedek eslesme: ayni magic + yon + lot, emir gonderildikten sonra acilmis
// ve kendi clientId'si olmayan TEK kayit (broker comment alanini ezip clientId'yi kaybettirirse).
function fallbackMatch<T>(items: T[], ref: PanelOrderRef, get: (x: T) => { clientId: unknown; magic: unknown; buy: boolean | null; volume: unknown; time: unknown }): T | null {
  const sinceMs = ref.since.getTime() - 5_000
  const candidates = items.filter((x) => {
    const v = get(x)
    const t = typeof v.time === 'string' ? Date.parse(v.time) : NaN
    return clientKeyOf(v.clientId as string) == null && Number(v.magic) === ref.magic && v.buy === (ref.direction === 'LONG') &&
      Math.abs(Number(v.volume) - ref.volume) < 1e-9 && t >= sinceMs
  })
  return candidates.length === 1 ? candidates[0] : null
}

// Panel emrinin acik pozisyonu: once clientId (ilk iki parca), yoksa yedek eslesme.
export async function findPanelPosition(ref: PanelOrderRef): Promise<{ position: OpenPosition; matchedBy: 'clientId' | 'fallback' } | null> {
  const cfg = requireConfig()
  const r = await metaApiJson(`${cfg.clientApi}/users/current/accounts/${cfg.accountId}/positions`, cfg.token, {}, 10_000)
  if (!r.ok || !Array.isArray(r.body)) throw new Error(`Açık pozisyonlar okunamadı (HTTP ${r.status})`)
  const byId = r.body.find((raw: any) => clientKeyOf(raw?.clientId) === ref.clientKey)
  if (byId) {
    const position = toPosition(byId)
    return position ? { position, matchedBy: 'clientId' } : null
  }
  const fb = fallbackMatch(r.body, ref, (raw: any) => ({
    clientId: raw?.clientId, magic: raw?.magic, volume: raw?.volume, time: raw?.time,
    buy: raw?.type === 'POSITION_TYPE_BUY' ? true : raw?.type === 'POSITION_TYPE_SELL' ? false : null,
  }))
  const position = fb ? toPosition(fb) : null
  return position ? { position, matchedBy: 'fallback' } : null
}

// Pozisyon hemen kapanmis olabilir (orn. SL cok yakindi): acilis deal'ini gecmisten ara.
export async function findPanelEntryDeal(ref: PanelOrderRef): Promise<{ positionId: string; price: number; volume: number; matchedBy: 'clientId' | 'fallback' } | null> {
  const cfg = requireConfig()
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z')
  const start = new Date(ref.since.getTime() - 60_000)
  const end = new Date(Date.now() + 60_000)
  const r = await metaApiJson(
    `${cfg.clientApi}/users/current/accounts/${cfg.accountId}/history-deals/time/${fmt(start)}/${fmt(end)}?limit=1000`,
    cfg.token,
    {},
    10_000,
  )
  if (!r.ok || !Array.isArray(r.body)) throw new Error(`İşlem geçmişi okunamadı (HTTP ${r.status})`)
  const entries = r.body.filter((d: any) => d?.entryType === 'DEAL_ENTRY_IN' && d.positionId != null && num(d.price) != null)
  let deal = entries.find((d: any) => clientKeyOf(d?.clientId) === ref.clientKey)
  let matchedBy: 'clientId' | 'fallback' = 'clientId'
  if (!deal) {
    deal = fallbackMatch(entries, ref, (d: any) => ({
      clientId: d?.clientId, magic: d?.magic, volume: d?.volume, time: d?.time,
      buy: d?.type === 'DEAL_TYPE_BUY' ? true : d?.type === 'DEAL_TYPE_SELL' ? false : null,
    }))
    matchedBy = 'fallback'
  }
  return deal ? { positionId: String(deal.positionId), price: deal.price, volume: Number(deal.volume), matchedBy } : null
}

// MT5 hata kodlari icin kullaniciya gosterilecek Turkce mesaj.
export function tradeErrorMessage(code: string, message: string): string {
  const map: Record<string, string> = {
    TRADE_RETCODE_INVALID_STOPS: 'SL/TP geçersiz (fiyata çok yakın ya da yanlış tarafta)',
    TRADE_RETCODE_NO_MONEY: 'Yetersiz marjin',
    TRADE_RETCODE_MARKET_CLOSED: 'Piyasa kapalı',
    TRADE_RETCODE_INVALID_VOLUME: 'Geçersiz lot',
    TRADE_RETCODE_REQUOTE: 'Fiyat değişti, tekrar dene',
    TRADE_RETCODE_PRICE_OFF: 'Fiyat alınamadı, tekrar dene',
    TRADE_RETCODE_PRICE_CHANGED: 'Fiyat değişti, tekrar dene',
    TRADE_RETCODE_TRADE_DISABLED: 'Bu sembolde işlem kapalı',
    TRADE_RETCODE_REJECT: 'Broker emri reddetti',
    TRADE_RETCODE_TOO_MANY_REQUESTS: 'Çok fazla istek, biraz sonra tekrar dene',
    TRADE_RETCODE_CONNECTION: 'Broker bağlantısı yok',
  }
  const base = map[code] ?? code
  return message && !map[code] ? `${base}: ${message}` : base
}
