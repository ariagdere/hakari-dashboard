import { NextRequest } from 'next/server'
import { isBasicAuthConfigured, AUTH_NOT_CONFIGURED_MESSAGE } from '@/lib/authConfig'
import { ensureMarketStream, getAccountSnapshot, getMarketStream, getStreamStatus, Quote, StreamCandle } from '@/lib/metaapiStream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Canli Axi market data akisi (Server-Sent Events).
//
// Olaylar:
//   hello   -> baglanti acilinca bir kez: stream durumu + son quote + son mumlar + hesap
//   quote   -> {bid, ask, time, brokerTime}
//   candle  -> {timeframe, time, open, high, low, close, tickVolume} (olusan mum dahil)
//   account -> 2 sn'de bir {balance, equity, margin, freeMargin, ...}
//   status  -> baglanti henuz hazir degilse ya da hata varsa 5 sn'de bir
// Railway/proxy bosta baglantiyi kesmesin diye 15 sn'de bir yorum satiri (ping) gider.
//
// MetaApi tarafinda istemci basina ek maliyet yok: tum istemciler tek streaming
// baglantisini paylasir (lib/metaapiStream.ts).
export async function GET(req: NextRequest) {
  if (!isBasicAuthConfigured()) {
    return new Response(AUTH_NOT_CONFIGURED_MESSAGE, { status: 503 })
  }

  // Tembel baslatma; hata olursa istemciye 'status' olayiyla bildirilir, istek dusmez.
  ensureMarketStream().catch(() => {})
  const s = getMarketStream()
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      const lastCandles = Object.fromEntries(Object.entries(s.candles).map(([tf, c]) => [tf, c.last]))
      send('hello', { stream: getStreamStatus(), lastQuote: s.lastQuote, lastCandles, account: getAccountSnapshot() })

      const onQuote = (q: Quote) => send('quote', q)
      const onCandle = (c: StreamCandle) => send('candle', c)
      s.emitter.on('quote', onQuote)
      s.emitter.on('candle', onCandle)

      const accountTimer = setInterval(() => {
        const account = getAccountSnapshot()
        if (account) send('account', account)
      }, 2000)
      const statusTimer = setInterval(() => {
        if (s.status !== 'ready') send('status', getStreamStatus())
      }, 5000)
      const pingTimer = setInterval(() => write(': ping\n\n'), 15000)

      cleanup = () => {
        if (closed) return
        closed = true
        s.emitter.off('quote', onQuote)
        s.emitter.off('candle', onCandle)
        clearInterval(accountTimer)
        clearInterval(statusTimer)
        clearInterval(pingTimer)
        try {
          controller.close()
        } catch {
          // zaten kapali
        }
      }
      req.signal.addEventListener('abort', () => cleanup())
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform: Next'in gzip'i ve ara proxy'ler akisi tamponlamasin.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
