import { NextResponse } from 'next/server'
import { isBasicAuthConfigured, AUTH_NOT_CONFIGURED_MESSAGE } from '@/lib/authConfig'
import { ensureMarketStream, getAccountSnapshot, getMarketStream } from '@/lib/metaapiStream'
import { getFreshQuote, getSymbolSpecWithSource } from '@/lib/metaapiTrade'
import { getTradingConfig } from '@/lib/tradingConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Emir paneli acilirken cagrilir (sembol bilgisi alinamazsa panel kendisi tekrar dener): emir
// ayarlari, BTCUSD sembol bilgisi, hesap ozeti ve o anki fiyat. Canli fiyat sonrasinda sayfanin
// SSE akisindan gelir.
export async function GET() {
  if (!isBasicAuthConfigured()) return new Response(AUTH_NOT_CONFIGURED_MESSAGE, { status: 503 })
  ensureMarketStream().catch(() => {})

  const trading = getTradingConfig()
  // Sembol bilgisi ve fiyat paralel; fiyat olmamasi engel degil (panel sayfanin canli fiyatini kullanir)
  const [specRes, quoteRes] = await Promise.allSettled([getSymbolSpecWithSource(), getFreshQuote()])
  const spec = specRes.status === 'fulfilled' ? specRes.value.spec : null
  const specSource = specRes.status === 'fulfilled' ? specRes.value.source : null
  const specError = specRes.status === 'rejected' ? String(specRes.reason?.message ?? specRes.reason) : null
  const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null
  const s = getMarketStream()

  return NextResponse.json(
    {
      trading,
      spec,
      specSource,
      specError,
      account: getAccountSnapshot(),
      quote,
      stream: { status: s.status, lastQuoteAgeMs: s.lastQuoteAt != null ? Date.now() - s.lastQuoteAt : null },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
