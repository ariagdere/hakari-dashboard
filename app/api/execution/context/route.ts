import { NextResponse } from 'next/server'
import { isBasicAuthConfigured, AUTH_NOT_CONFIGURED_MESSAGE } from '@/lib/authConfig'
import { ensureMarketStream, getAccountSnapshot, getMarketStream } from '@/lib/metaapiStream'
import { getFreshQuote, getSymbolSpec } from '@/lib/metaapiTrade'
import { getTradingConfig } from '@/lib/tradingConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Emir paneli acilirken bir kez cagrilir: emir ayarlari, BTCUSD sembol bilgisi,
// hesap ozeti ve o anki fiyat. Canli fiyat sonrasinda sayfanin SSE akisindan gelir.
export async function GET() {
  if (!isBasicAuthConfigured()) return new Response(AUTH_NOT_CONFIGURED_MESSAGE, { status: 503 })
  ensureMarketStream().catch(() => {})

  const trading = getTradingConfig()
  let spec = null
  let specError: string | null = null
  try {
    spec = await getSymbolSpec()
  } catch (err: any) {
    specError = String(err?.message ?? err)
  }
  let quote = null
  try {
    quote = await getFreshQuote()
  } catch {
    // panel sayfanin canli fiyatini kullanir; burada fiyat olmamasi engel degil
  }
  const s = getMarketStream()

  return NextResponse.json(
    {
      trading,
      spec,
      specError,
      account: getAccountSnapshot(),
      quote,
      stream: { status: s.status, lastQuoteAgeMs: s.lastQuoteAt != null ? Date.now() - s.lastQuoteAt : null },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
