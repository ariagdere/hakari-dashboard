// Emir boyutlandirma -- panel (canli ozet) ve emir route'u (yetkili hesap) AYNI kodu kullanir.
//
// Risk tanimi Hakari'nin R tanimiyla ayni: 1R = |giris - SL| * lot * contractSize (dolar).
//   LONG : giris = ask (alis), SL/TP bid ile tetiklenir -> SL bid'in, TP bid'in karsi tarafinda
//   SHORT: giris = bid (satis), SL/TP ask ile tetiklenir
// Lot, hedef riski ASLA asmayacak sekilde lot adimina ASAGI yuvarlanir; bu yuzden ayni lot
// daha uzak bir girisle hesaplandiginda bile risk hedefin altinda kalir (emir route'unun
// "lot degismediyse gonder" kurali bu ozellige dayanir).
export type Direction = 'LONG' | 'SHORT'

export interface SizingSpec {
  contractSize: number
  minVolume: number
  maxVolume: number
  volumeStep: number
  stopsLevel: number // point cinsinden
  point: number
}

export interface SizingInput {
  direction: Direction
  bid: number
  ask: number
  sl: number
  tp: number
  riskUsd: number
  spec: SizingSpec
  maxVolume?: number // sunucu tarafi guvenlik siniri (TRADING_MAX_VOLUME)
}

export interface Sizing {
  ok: boolean
  error: string | null
  refPrice: number // LONG: ask, SHORT: bid
  slDistance: number // fiyat farki
  tpDistance: number
  volume: number // lot
  riskUsd: number // gercek risk (yuvarlanmis lotla)
  rewardUsd: number
  rr: number // tpDistance / slDistance
  minRiskUsd: number // min lotta bu SL mesafesinin riski
  spreadUsd: number
}

function isPos(x: unknown): x is number {
  return typeof x === 'number' && !isNaN(x) && isFinite(x) && x > 0
}

// Kayan nokta gurultusunu temizler (0.030000000000000002 -> 0.03).
function clean(x: number): number {
  return Number(x.toFixed(10))
}

export function computeSizing(inp: SizingInput): Sizing {
  const { direction, bid, ask, sl, tp, riskUsd, spec } = inp
  const refPrice = direction === 'LONG' ? ask : bid
  const empty: Sizing = {
    ok: false, error: null, refPrice, slDistance: 0, tpDistance: 0, volume: 0,
    riskUsd: 0, rewardUsd: 0, rr: 0, minRiskUsd: 0, spreadUsd: 0,
  }
  const fail = (error: string, partial: Partial<Sizing> = {}): Sizing => ({ ...empty, ...partial, error })

  if (direction !== 'LONG' && direction !== 'SHORT') return fail('Yön seçilmedi')
  if (!isPos(bid) || !isPos(ask) || ask < bid) return fail('Geçerli fiyat yok')
  if (!isPos(spec?.contractSize) || !isPos(spec?.minVolume) || !isPos(spec?.volumeStep)) return fail('Sembol bilgisi eksik')
  if (!isPos(sl)) return fail('SL girilmedi')
  if (!isPos(tp)) return fail('TP girilmedi')
  if (!isPos(riskUsd)) return fail('Risk girilmedi')

  // MT5 kurali: SL/TP, pozisyonun kapanacagi fiyattan en az stopsLevel uzakta olmali.
  const minGap = (typeof spec.stopsLevel === 'number' && spec.stopsLevel > 0 ? spec.stopsLevel : 0) * (spec.point > 0 ? spec.point : 0)
  if (direction === 'LONG') {
    if (!(sl < bid - minGap)) return fail("Long'da SL mevcut fiyatın altında olmalı")
    if (!(tp > bid + minGap)) return fail("Long'da TP mevcut fiyatın üstünde olmalı")
  } else {
    if (!(sl > ask + minGap)) return fail("Short'ta SL mevcut fiyatın üstünde olmalı")
    if (!(tp < ask - minGap)) return fail("Short'ta TP mevcut fiyatın altında olmalı")
  }

  const slDistance = clean(direction === 'LONG' ? ask - sl : sl - bid)
  const tpDistance = clean(direction === 'LONG' ? tp - ask : bid - tp)
  if (!(tpDistance > 0)) return fail('TP spread içinde kalıyor', { slDistance, tpDistance })

  const perLot = slDistance * spec.contractSize
  const minRiskUsd = clean(spec.minVolume * perLot)
  const spreadPerLot = (ask - bid) * spec.contractSize
  const base = { slDistance, tpDistance, minRiskUsd, rr: clean(tpDistance / slDistance) }

  // Adim cinsinden tam sayiya asagi yuvarla; 1e-9 kayan nokta payi (0.03/0.01 = 2.9999...).
  const steps = Math.floor(riskUsd / perLot / spec.volumeStep + 1e-9)
  const volume = clean(steps * spec.volumeStep)
  if (volume < spec.minVolume) {
    return fail(`Bu SL mesafesinde en küçük lot (${spec.minVolume}) $${minRiskUsd.toFixed(2)} risk ediyor; hedef risk yetmiyor`, base)
  }
  const maxVolume = Math.min(isPos(spec.maxVolume) ? spec.maxVolume : Infinity, isPos(inp.maxVolume) ? inp.maxVolume : Infinity)
  if (volume > maxVolume) {
    return fail(`Lot üst sınırı (${maxVolume}) aşılıyor`, { ...base, volume })
  }

  return {
    ok: true,
    error: null,
    refPrice,
    ...base,
    volume,
    riskUsd: clean(volume * perLot),
    rewardUsd: clean(volume * tpDistance * spec.contractSize),
    spreadUsd: clean(volume * spreadPerLot),
  }
}

// Gunluk swap tahmini (SYMBOL_SWAP_MODE_INTEREST_CURRENT: yillik %, 360 gunluk banka yili).
// Diger modlar icin null -- panel gostermez.
export function estimateDailySwapUsd(
  direction: Direction,
  price: number,
  volume: number,
  spec: { contractSize: number; swapMode?: string; swapLong?: number; swapShort?: number },
): number | null {
  if (spec.swapMode !== 'SYMBOL_SWAP_MODE_INTEREST_CURRENT') return null
  const rate = direction === 'LONG' ? spec.swapLong : spec.swapShort
  if (typeof rate !== 'number' || isNaN(rate) || !isPos(price) || !isPos(volume)) return null
  return clean((price * volume * spec.contractSize * rate) / 100 / 360)
}
