// /live grafigindeki isaretleri (Order / In / Out) mumlara oturtma.

// barTimes: artan sirali mum acilis zamanlari (sn), eventSec: olay zamani (ayni saat kaydirmasiyla),
// stepSec: mum suresi. Olayi iceren mumun acilis zamanini dondurur. Olay hicbir mumun suresine
// dusmuyorsa -- veri boslugu (eksik mumlar), grafigin ilk mumundan once ya da son mumdan sonra --
// null: isaret alakasiz bir muma (orn. bosluktan onceki son muma) oturtulmaz.
// 1,5 kat tolerans: broker saatine hizali 4h/1d mumlar yaz/kis saati gecisinde bir saat kayabiliyor.
export function snapToBar(barTimes: number[], eventSec: number, stepSec: number): number | null {
  let lo = 0
  let hi = barTimes.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (barTimes[mid] <= eventSec) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found < 0) return null
  const bar = barTimes[found]
  return eventSec - bar < stepSec * 1.5 ? bar : null
}
