// Emir gonderimi ayarlari (Railway degiskenleri).
//
//   TRADING_ENABLED=true        -> panelden emir gonderilebilir. Tanimli degilse ya da baska bir
//                                  degerse emir route'u 403 doner (acil durum kapatma anahtari).
//   TRADING_MAX_RISK_USD=20     -> tek emirde izin verilen en yuksek hedef risk ($)
//   TRADING_MAX_VOLUME=0.1      -> tek emirde izin verilen en yuksek lot
export interface TradingConfig {
  enabled: boolean
  maxRiskUsd: number
  maxVolume: number
}

function numEnv(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return typeof v === 'number' && !isNaN(v) && isFinite(v) && v > 0 ? v : fallback
}

export function getTradingConfig(): TradingConfig {
  return {
    enabled: process.env.TRADING_ENABLED === 'true',
    maxRiskUsd: numEnv('TRADING_MAX_RISK_USD', 20),
    maxVolume: numEnv('TRADING_MAX_VOLUME', 0.1),
  }
}
