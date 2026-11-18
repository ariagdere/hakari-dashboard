// /live grafiginin 3m dilimi: paralel sistemin Axi 1m mumlarindan (axi_candles; collector dakikada bir yazar) 3 dakikalik
// mumlar. Resmi son dakikadan sonraki dakikalar paralel core'un fiyat akisindan (sdl_bars, dakika sinirinda kapanir).
// SDL v3 elle zon stratejisi de kararini bu mumlarla veriyor; grafik onun gordugu mumu gosterir. Eski sistemin mum
// bakicisina (MetaApi'den 5m-1d) yeni dilim eklenmez, MetaApi'ye ek istek gitmez.
// Donus formati /api/axi-candles ile ayni (time = acilis, UTC saniye), son 1000 mum (olusan mum dahil); grafik geriye
// kaydirilinca daha eskileri sayfa sayfa (getOlder3mCandles).
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

// Geriye kaydirma: `before`dan (bir 3m mumun acilisi, UTC saniye; haric) onceki ~limit adet 3m mum, eskiden yeniye;
// yalniz resmi 1m mumlardan. Alt sinir 3*limit'inci onceki 1m mumun dilim basi: bosluklu araliklarda da her istek
// geriye ilerler ve ilk mum eksik kalmaz. more: daha eski 1m mum var mi. null: PARALEL_DATABASE_URL tanimli degil.
export async function getOlder3mCandles(before: number, limit: number): Promise<{ candles: Candle3m[]; more: boolean } | null> {
  const db = paralelDb()
  if (!db) return null
  const { rows } = await db.query<{ t: string; o: number; h: number; l: number; c: number; more: boolean }>(
    `WITH lim AS (
       SELECT open_time FROM axi_candles
        WHERE symbol = $1 AND timeframe = '1m' AND open_time < to_timestamp($2)
        ORDER BY open_time DESC OFFSET $3 LIMIT 1
     ),
     lo AS (
       SELECT COALESCE((SELECT to_timestamp(floor(extract(epoch FROM open_time) / ${STEP_SEC}) * ${STEP_SEC}) FROM lim),
                       '-infinity') AS t
     ),
     b AS (
       SELECT (floor(extract(epoch FROM a.open_time) / ${STEP_SEC}) * ${STEP_SEC})::bigint AS t,
              (array_agg(a.open ORDER BY a.open_time))[1] AS o, max(a.high) AS h, min(a.low) AS l,
              (array_agg(a.close ORDER BY a.open_time DESC))[1] AS c
         FROM axi_candles a, lo
        WHERE a.symbol = $1 AND a.timeframe = '1m' AND a.open_time < to_timestamp($2) AND a.open_time >= lo.t
        GROUP BY 1
     )
     SELECT b.t::text AS t, b.o, b.h, b.l, b.c,
            EXISTS (SELECT 1 FROM axi_candles x, lo
                     WHERE x.symbol = $1 AND x.timeframe = '1m' AND x.open_time < lo.t) AS more
       FROM b ORDER BY b.t`,
    [AXI_SYMBOL, before, limit * 3 - 1],
  )
  return {
    candles: rows.map((r) => ({ time: Number(r.t), open: Number(r.o), high: Number(r.h), low: Number(r.l), close: Number(r.c) })),
    more: rows.length > 0 && rows[0].more,
  }
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
