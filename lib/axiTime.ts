// Axi'nin sunucu saati New York + 7 saat: ABD yaz saatinde UTC+3, kisin UTC+2; gecis New York'la ayni anda (or. 1 Kasim
// 2026 06:00 UTC). MetaApi mumlarin ve quote'larin UTC zamanini (time) bu hesap icin sabit +3 saatle hesapliyor; kisin
// bir saat erken cikiyor. Sunucu saati (brokerTime) dogru. paralel sistemin packages/db/src/axitime.ts'inden.
// Eski mum bakicisinin mumlari (lib/axiCandles.ts) MetaApi'nin time'ini kullaniyor; paralel sistemin mumlari (3m)
// sunucu saatinden hesaplaniyor.

const H = 3_600_000
let ny: Intl.DateTimeFormat | null = null
const cache = new Map<number, number>()

// t aninda (UTC, ms) Axi sunucu saatinin UTC'den farki (ms): yazin 3, kisin 2 saat.
export function axiOffsetMs(t: number): number {
  const hour = Math.floor(t / H) // gecisler saat basinda: saat icinde fark degismez
  let off = cache.get(hour)
  if (off === undefined) {
    ny ??= new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    const name = ny.formatToParts(new Date(hour * H)).find((p) => p.type === 'timeZoneName')?.value ?? ''
    const m = /^GMT([+-]\d+)$/.exec(name)
    if (!m) throw new Error(`New York saat farkı okunamadı (${name || 'boş'})`)
    off = (Number(m[1]) + 7) * H
    if (cache.size > 10_000) cache.clear()
    cache.set(hour, off)
  }
  return off
}

// Axi sunucu saatindeki bir an (duvar saati, UTC gibi okunmus ms) gercek UTC'ye. Kisa donuste sunucu saatinin iki kez
// yasadigi saat icin near'a (verilmisse) yakin yorum, yoksa kis saati.
export function axiToUtc(local: number, near?: number): number {
  const winter = local - 2 * H
  const summer = local - 3 * H
  const w = axiOffsetMs(winter) === 2 * H
  const s = axiOffsetMs(summer) === 3 * H
  if (w && s) return near !== undefined && Math.abs(near - summer) < Math.abs(near - winter) ? summer : winter
  return w ? winter : summer
}

// Quote'un gercek ani (UTC ms): sunucu saatinden (brokerTime, 'YYYY-MM-DD HH:mm:ss.SSS'). brokerTime yoksa ya da
// okunamazsa (tarayici New York saatini bilmiyorsa da) MetaApi'nin time'i.
export function quoteUtcMs(time: string, brokerTime?: string | null): number {
  const t = Date.parse(time)
  const local = typeof brokerTime === 'string' ? Date.parse(`${brokerTime.replace(' ', 'T')}Z`) : NaN
  if (Number.isFinite(local) && (!Number.isFinite(t) || Math.abs(local - t) <= 12 * H)) {
    try {
      return axiToUtc(local, Date.now())
    } catch {
      // yok say
    }
  }
  return t
}
