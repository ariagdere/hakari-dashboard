// /live "OPEN & PENDING TRADES": paralel sistemin SDL stratejisinde sirada bekleyen kurulumlar (dönüş bekleyen iFVG'ler).
// Paralel core her 3m kapanisindan ~1-2 sn sonra sdl_pending'i bastan yazar (paraleltrading migration 011); liste durumu
// sdl_status.pending_*'da, emir anahtarlari sdl_status.trading_enabled (Railway SDL_TRADING_ENABLED) ve trading_switch'te
// (SDL sayfasindaki NO TRADE dugmesi). Paralelin SDL sayfasiyla ayni veri; salt okunur (PARALEL_DATABASE_URL).
import { paralelDb } from './paralelDb'

export type SdlPendingRow = {
  key: string // `${side}-${fvgA}`: paralelin SDL sayfasindaki satir anahtariyla ayni
  side: 'LONG' | 'SHORT'
  status: 'tetik' | 'derin' | 'zon'
  fvgA: number // FVG'nin 1. mumunun acilisi (UTC ms)
  fvgI: number // FVG'nin 3. mumunun acilisi
  gap: number
  fvgLo: number
  fvgHi: number
  trigger: number // 3m kapanisi bunu gecerse giris (short: alti, long: ustu)
  ext: number // simdiye kadarki igne
  zoneId: number
  tpZoneId: number
  entry: number
  sl: number
  tp: number
  rr: number
  volume: number | null
  riskUsd: number | null
  lotError: string | null
  expiresAt: number // en son bu 3m kapanisinda donebilir
}

export type SdlPendingInfo = {
  durum: 'liste' | 'hafta_sonu' | 'kapali' | 'bias_yok' | 'notr' | 'zon_yok' | 'gun_mumu_yok' | string
  bias: string | null
  close: number | null
  pencere: boolean
  haber: { from: number; to: number; at: number[] } | null
}

// acik: emir gider; golge: Railway anahtari kapali (karar yazilir, emir gitmez); notrade: NO TRADE dugmesi; yok: core yazmadi
export type SdlMode = 'acik' | 'golge' | 'notrade' | 'yok'

export type SdlPendingResult = {
  now: number
  asOf: number | null
  info: SdlPendingInfo | null
  rows: SdlPendingRow[]
  mode: SdlMode
  coreUpdatedAt: number | null
}

const CACHE_MS = 5_000 // ayni anda acik birden cok /live sekmesi ayni sonucu paylasir
let cache: { at: number; result: SdlPendingResult } | null = null
let inflight: Promise<SdlPendingResult> | null = null

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : null)

async function load(): Promise<SdlPendingResult> {
  const db = paralelDb()!
  // Tek sorgu: liste, durumu ve anahtarlar ayni anda (liste her kapanista tek transaction'da yaziliyor)
  // json icindeki timestamptz'ler ISO 8601 (ofsetli) gelir; now epoch ms
  const { rows } = await db.query<{ now: string; st: any; switch_on: boolean | null; pending: any[] }>(
    `SELECT (extract(epoch FROM now()) * 1000)::bigint::text AS now,
            (SELECT json_build_object('pending_as_of', pending_as_of, 'pending_info', pending_info,
                                      'trading_enabled', trading_enabled, 'updated_at', updated_at)
               FROM sdl_status WHERE id = 1) AS st,
            (SELECT enabled FROM trading_switch WHERE strategy = 'sdl_elle') AS switch_on,
            (SELECT coalesce(json_agg(p ORDER BY p.fvg_a DESC), '[]'::json) FROM sdl_pending p) AS pending`,
  )
  const r = rows[0]!
  const st = r.st as { pending_as_of: string | null; pending_info: SdlPendingInfo | null; trading_enabled: boolean; updated_at: string } | null
  const mode: SdlMode = !st ? 'yok' : !st.trading_enabled ? 'golge' : r.switch_on === true ? 'acik' : 'notrade'
  return {
    now: Number(r.now),
    asOf: ms(st?.pending_as_of),
    info: st?.pending_info ?? null,
    mode,
    coreUpdatedAt: ms(st?.updated_at),
    rows: (r.pending ?? []).map((p: any) => {
      const fvgA = Date.parse(p.fvg_a)
      return {
        key: `${p.side}-${fvgA}`,
        side: p.side,
        status: p.status,
        fvgA,
        fvgI: Date.parse(p.fvg_i),
        gap: Number(p.gap),
        fvgLo: Number(p.fvg_lo),
        fvgHi: Number(p.fvg_hi),
        trigger: Number(p.trigger),
        ext: Number(p.ext),
        zoneId: Number(p.zone_id),
        tpZoneId: Number(p.tp_zone_id),
        entry: Number(p.entry),
        sl: Number(p.sl),
        tp: Number(p.tp),
        rr: Number(p.rr),
        volume: p.volume == null ? null : Number(p.volume),
        riskUsd: p.risk_usd == null ? null : Number(p.risk_usd),
        lotError: p.lot_error ?? null,
        expiresAt: Date.parse(p.expires_at),
      }
    }),
  }
}

// null: PARALEL_DATABASE_URL tanimli degil.
export async function getSdlPending(): Promise<SdlPendingResult | null> {
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
