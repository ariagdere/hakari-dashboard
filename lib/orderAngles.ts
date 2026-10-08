import pool from '@/lib/db'
import { LsrSeries } from '@/lib/lsrAngle'
import type { LsrReason } from '@/lib/lsrAngle'

// Order'lara yazilan 4 LSR acisi. metaapi-webhook/mt5_order_monitor.js'teki computeLsrAngles ile
// AYNI hesap: hakari-lsr-refresher'in doldurdugu lsr_series tablosu, lag=1 (kesin kapanmis son
// periyot), look-ahead yok (referans yalnizca o ana kadarki pencerelerden), 2 ondalik.
// Monitor her yeni order'a kendisi yazar; burasi mutabakatla eklenen order'lar ve acisi bos
// kalmis order'lar icin.

export const ORDER_ANGLE_COMBOS = [
  { metric: 'global', period: '1h', column: 'h1_ls_angle' },
  { metric: 'global', period: '5m', column: 'm5_ls_angle' },
  { metric: 'top_position', period: '1h', column: 'h1_tt_pos_angle' },
  { metric: 'top_position', period: '5m', column: 'm5_tt_pos_angle' },
] as const

export type AngleColumn = (typeof ORDER_ANGLE_COMBOS)[number]['column']
export type OrderAngles = Record<AngleColumn, number | null>
export const ANGLE_COLUMNS: AngleColumn[] = ORDER_ANGLE_COMBOS.map((c) => c.column)

const emptyAngles = (): OrderAngles => ({ h1_ls_angle: null, m5_ls_angle: null, h1_tt_pos_angle: null, m5_tt_pos_angle: null })

export function toMs(x: unknown): number | null {
  if (x == null || x === '') return null
  const t = x instanceof Date ? x.getTime() : new Date(x as string | number).getTime()
  return Number.isFinite(t) ? t : null
}

// Gecerli olanlarin en erkeni (ms); hicbiri gecerli degilse null.
export function earliestMs(...xs: unknown[]): number | null {
  const ts = xs.map(toMs).filter((t): t is number => t != null)
  return ts.length > 0 ? Math.min(...ts) : null
}

// Verilen anlar (ms) icin acilar. Her seri DB'den BIR KEZ okunur (gereken en gec ana kadar) -- cok
// sayida order icin de seri basina tek sorgu; sonuc her an icin ayri ayri o ana kadar olan veriyle
// hesaplanmisla aynidir (statsAt kesim anindan sonraki satirlara bakmaz).
// wanted[i]: i. an icin hesaplanacak kolonlar (verilmezse hepsi); hicbir anin istemedigi seri okunmaz.
// Monitor'deki gibi ASLA throw etmez: bir seri okunamazsa o aci null kalir, hata errors'a yazilir.
// reasons: hesaplanamayan acilarin nedenleri (seri_oncesi / seri_sonrasi / bosluk / referans_yetersiz).
export async function computeOrderAngles(timesMs: Array<number | null>, wanted?: AngleColumn[][]) {
  const angles = timesMs.map(() => emptyAngles())
  const errors: string[] = []
  const reasons: Partial<Record<LsrReason | 'veri_yok', number>> = {}
  const countReason = (r: LsrReason | 'veri_yok', n = 1) => { reasons[r] = (reasons[r] ?? 0) + n }
  for (const { metric, period, column } of ORDER_ANGLE_COMBOS) {
    const idx = timesMs.flatMap((t, i) => (t != null && Number.isFinite(t) && (!wanted || wanted[i]?.includes(column)) ? [i] : []))
    if (idx.length === 0) continue
    const maxT = Math.floor(Math.max(...idx.map((i) => timesMs[i] as number)))
    try {
      const { rows } = await pool.query(
        `SELECT open_time, long_short_ratio FROM lsr_series
          WHERE metric = $1 AND period = $2 AND open_time <= $3
          ORDER BY open_time ASC`,
        [metric, period, maxT],
      )
      // Pencere icin yetersiz veri (monitor'de de ayni esik)
      if (rows.length < 30) { countReason('veri_yok', idx.length); continue }
      const series = new LsrSeries(rows.map((r) => ({ t: Number(r.open_time), v: Number(r.long_short_ratio) })), period)
      for (const i of idx) {
        const { result, reason } = series.statsAt(timesMs[i] as number, 1)
        if (result) angles[i][column] = Number(result.angle.toFixed(2))
        else countReason(reason)
      }
    } catch (err: any) {
      const msg = `${metric}/${period}: ${err?.message ?? String(err)}`
      console.error('LSR açı hesabı hatası', msg)
      errors.push(msg)
    }
  }
  return { angles, errors, reasons }
}

export interface AngleFillTarget {
  id: number
  created_at: unknown
  opened_at: unknown
  h1_ls_angle: unknown
  m5_ls_angle: unknown
  h1_tt_pos_angle: unknown
  m5_tt_pos_angle: unknown
}

// Order'larin BOS aci kolonlarini doldurur; dolu aciya ASLA dokunmaz (kendi aninda o anki veriyle
// yazilmis olabilir). An: order'in bilinen en erken ani, LEAST(created_at, opened_at) -- monitor
// order'i MT5'te gordugu anda yazar (created_at; bekleyen emirde emrin verildigi an), mutabakatin
// eski surumu ise created_at'e mutabakat anini yaziyordu, o order'larda acilis ani daha erkendir.
export async function fillBlankAngles(orders: AngleFillTarget[]) {
  const targets = orders.filter((o) => ANGLE_COLUMNS.some((c) => o[c] == null))
  const filled: Array<{ orderId: number; angles: Partial<OrderAngles> }> = []
  if (targets.length === 0) return { checked: 0, filled, blank: 0, errors: [] as string[], reasons: {} }
  // Yalnizca bos kolonlar hesaplanir (dolu olanlarin serisi bosuna okunmaz)
  const { angles, errors, reasons } = await computeOrderAngles(
    targets.map((o) => earliestMs(o.created_at, o.opened_at)),
    targets.map((o) => ANGLE_COLUMNS.filter((c) => o[c] == null)),
  )
  let blank = 0 // hesaplanamayan acisi kalan order sayisi
  for (let i = 0; i < targets.length; i++) {
    const o = targets[i]
    const a = angles[i]
    if (ANGLE_COLUMNS.some((c) => o[c] == null && a[c] == null)) blank++
    const cols = ANGLE_COLUMNS.filter((c) => o[c] == null && a[c] != null)
    if (cols.length === 0) continue
    // COALESCE: okuma ile yazma arasinda yazilmis bir degeri ezmez
    const { rows } = await pool.query(
      `UPDATE orders
          SET h1_ls_angle = COALESCE(h1_ls_angle, $2), m5_ls_angle = COALESCE(m5_ls_angle, $3),
              h1_tt_pos_angle = COALESCE(h1_tt_pos_angle, $4), m5_tt_pos_angle = COALESCE(m5_tt_pos_angle, $5),
              updated_at = now()
        WHERE id = $1 AND (h1_ls_angle IS NULL OR m5_ls_angle IS NULL OR h1_tt_pos_angle IS NULL OR m5_tt_pos_angle IS NULL)
        RETURNING h1_ls_angle, m5_ls_angle, h1_tt_pos_angle, m5_tt_pos_angle`,
      [o.id, a.h1_ls_angle, a.m5_ls_angle, a.h1_tt_pos_angle, a.m5_tt_pos_angle],
    )
    if (rows.length === 0) continue
    filled.push({ orderId: o.id, angles: Object.fromEntries(cols.map((c) => [c, rows[0][c] == null ? null : Number(rows[0][c])])) })
  }
  return { checked: targets.length, filled, blank, errors, reasons }
}
