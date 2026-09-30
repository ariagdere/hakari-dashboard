// MetaApi REST yapilandirmasi -- yeni route'larin ortak kaynagi.
// (Mevcut live-price / account-info / reconcile route'lari kendi inline ayarlarini kullanmaya devam ediyor.)
export interface MetaApiRestConfig {
  token: string
  accountId: string
  region: string
  clientApi: string
  marketDataApi: string
}

export function getMetaApiRestConfig(): MetaApiRestConfig | null {
  const token = process.env.METAAPI_TOKEN
  const accountId = process.env.METAAPI_ACCOUNT_ID
  if (!token || !accountId) return null
  const region = process.env.METAAPI_REGION || 'london'
  return {
    token,
    accountId,
    region,
    clientApi: `https://mt-client-api-v1.${region}.agiliumtrade.ai`,
    // Historical market data ayri bir host'ta; london icin varsayilan Faz 0 tanilamasinda dogrulandi.
    marketDataApi: (process.env.METAAPI_MARKET_DATA_URL || `https://mt-market-data-client-api-v1.${region}.agiliumtrade.ai`).replace(/\/+$/, ''),
  }
}
