// Axi BTCUSD sabitleri -- SDK'ya bagimli olmayan ortak kaynak
// (grafik route'u MetaApi SDK'sini yuklemeden bunlari kullanabilsin diye ayri dosyada).
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

export function isTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value)
}
