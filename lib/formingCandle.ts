// /live grafiginde olusan mumu quote'lardan gunceller (MT5 mumlari bid'den olusur).
//
// Gecmis mumlar REST'ten gelir (lib/axiCandles.ts); aradaki canli hareketi bu fonksiyon
// uygular, dakikalik REST tazelemesi de aradaki tick'lerin kacirdigi high/low'u duzeltir.
// Zamanlar grafigin kullandigi birimde (saniye) olmali; son mum ile quote ayni zaman
// ofsetinde oldugu surece hesap dogru kalir. 4h/1d mumlari broker saatine hizali acilir,
// yeni mumun acilisi son mumun acilisina adim eklenerek bulundugu icin bu hizalama korunur.
export interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
}

// Donus: guncellenmis ya da yeni acilan mum; quote son mumdan eskiyse ya da gecersizse null.
export function applyQuoteToBar(last: Bar, price: number, quoteTime: number, stepSec: number): Bar | null {
  if (typeof price !== 'number' || isNaN(price) || !Number.isFinite(quoteTime) || !(stepSec > 0)) return null
  if (quoteTime < last.time) return null
  if (quoteTime >= last.time + stepSec) {
    const periods = Math.floor((quoteTime - last.time) / stepSec)
    return { time: last.time + periods * stepSec, open: price, high: price, low: price, close: price }
  }
  return {
    time: last.time,
    open: last.open,
    high: Math.max(last.high, price),
    low: Math.min(last.low, price),
    close: price,
  }
}
