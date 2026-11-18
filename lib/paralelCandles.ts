// /live grafiginin 3m dilimi: paralel sistemin Axi 1m mumlarindan (axi_candles; collector dakikada bir yazar) 3 dakikalik
// mumlar. Resmi son dakikadan sonraki dakikalar paralel core'un fiyat akisindan (sdl_bars, dakika sinirinda kapanir).
// SDL v3 elle zon stratejisi de kararini bu mumlarla veriyor; grafik onun gordugu mumu gosterir. Eski sistemin mum
// bakicisina (MetaApi'den 5m-1d) yeni dilim eklenmez, MetaApi'ye ek istek gitmez.
// Donus formati /api/axi-candles ile ayni (time = acilis, UTC saniye), son 1000 mum (olusan mum dahil).
import { AXI_SYMBOL } from './axiMarket'
import { paralelDb } from './paralelDb'

export interface Candle3m {
  time: number
  open: number
  high: number
  low: number
  close: number
}

const LIMIT = 1000
const STEP_SEC = 180
const CACHE_MS = 10_000 // ayni anda acik birden cok /live sekmesi ayni sonucu paylasir

type Result = { candles: Candle3m[]; stale: boolean }
let cache: { at: number; result: Result } | null = null
let inflight: Promise<Result> | null = null

async function load(): Promise<Result> {
  const db = paralelDb()!
  const { rows } = await db.query<{ t: string; o: number; h: number; l: number; c: number }>(
    `WITH last AS (SELECT max(open_time) AS t FROM axi_candles WHERE symbol = $1 AND timeframe = '1m'),
     m AS (
       SELECT a.open_time, a.open, a.high, a.low, a.close FROM axi_candles a, last
        WHERE a.symbol = $1 AND a.timeframe = '1m' AND a.open_time > last.t - $2::interval
       UNION ALL
       -- resmi son dakikadan sonrasi akistan (resmi mum dakikadan ~5-15 sn sonra gelir)
       SELECT b.open_time, b.open, b.high, b.low, b.close FROM sdl_bars b, last
        WHERE b.open_time > last.t AND b.open_time > now() - interval '20 minutes'
     )
     SELECT (floor(extract(epoch FROM open_time) / ${STEP_SEC}) * ${STEP_SEC})::bigint::text AS t,
            (array_agg(open ORDER BY open_time))[1] AS o, max(high) AS h, min(low) AS l,
            (array_agg(close ORDER BY open_time DESC))[1] AS c
       FROM m GROUP BY 1 ORDER BY 1`,
    [AXI_SYMBOL, `${(LIMIT + 1) * 3} minutes`],
  )
  // Olusan mumu istemci canli fiyatla gunceller; dakikalik tazeleme yeter, 'stale' isareti kullanilmaz.
  return { candles: rows.slice(-LIMIT).map((r) => ({ time: Number(r.t), open: r.o, high: r.h, low: r.l, close: r.c })), stale: false }
}

// null: PARALEL_DATABASE_URL tanimli degil.
export async function get3mCandles(): Promise<Result | null> {
  if (!paralelDb()) return null
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result
  if (!inflight) {
    inflight = load()
      .then((result) => {
        cache = { at: Date.now(), result }
        return result
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}
