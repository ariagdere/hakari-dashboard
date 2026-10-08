// LSR / TT-Position "slope açısı" hesabı. metaapi-webhook/lsrAngle.js ve
// hakari-lsr-refresher/lsrAngle.js ile BİREBİR aynı matematiğin TS portu
// (kaynak: lsr_order_report.py, Node porta karşı sayısal olarak doğrulandı).
// Kullanım: chart panelindeki "şu anki açı" okuması (/api/lsr-series) ve mutabakatla
// eklenen / açısı boş kalmış order'ların açıları (lib/orderAngles.ts). Yeni order'ların
// açılarını metaapi-webhook (mt5_order_monitor.js) kendisi yazar -- aynı hesap.

export const WINDOW = 30
export const MIN_REF_WINDOWS = 100
export const STEP_MS: Record<'5m' | '1h', number> = { '5m': 300_000, '1h': 3_600_000 }

export interface WindowStatsResult {
  slope: number
  r2: number
}

export function windowStats(y: number[]): WindowStatsResult {
  const n = y.length
  const mean = y.reduce((a, b) => a + b, 0) / n
  const yn = y.map((v) => v / mean - 1)
  const ynMean = yn.reduce((a, b) => a + b, 0) / n
  const yc = yn.map((v) => v - ynMean)
  const xc = new Array(n)
  for (let i = 0; i < n; i++) xc[i] = n === 1 ? 0 : i / (n - 1)
  const xcMean = xc.reduce((a: number, b: number) => a + b, 0) / n
  for (let i = 0; i < n; i++) xc[i] -= xcMean
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += xc[i] * xc[i]
    syy += yc[i] * yc[i]
    sxy += xc[i] * yc[i]
  }
  const slope = sxx > 0 ? sxy / sxx : 0
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0
  return { slope, r2 }
}

export function percentile90(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const idx = 0.9 * (s.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (idx - lo)
}

function searchRight(arr: number[], x: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= x) lo = mid + 1
    else hi = mid
  }
  return lo
}

export interface LsrPoint { t: number; v: number }
export interface LsrStatsResult {
  slope: number
  r2: number
  ref: number
  nRef: number
  refEnd: number
  angle: number
}
export type LsrReason = 'ok' | 'seri_oncesi' | 'seri_sonrasi' | 'bosluk' | 'referans_yetersiz'

export class LsrSeries {
  period: '5m' | '1h'
  step: number
  n: number
  minRef: number
  lookbackMs: number | null
  ts: number[]
  v: number[]
  private slope: (number | null)[]
  private r2: (number | null)[]
  private viTs: number[]
  private viAbs: number[]

  constructor(rows: LsrPoint[], period: '5m' | '1h', opts: { window?: number; minRef?: number; lookbackMs?: number | null } = {}) {
    this.period = period
    this.step = STEP_MS[period]
    this.n = opts.window || WINDOW
    this.minRef = opts.minRef ?? MIN_REF_WINDOWS
    this.lookbackMs = opts.lookbackMs ?? null
    this.ts = rows.map((r) => r.t)
    this.v = rows.map((r) => r.v)
    const m = this.ts.length
    this.slope = new Array(m).fill(null)
    this.r2 = new Array(m).fill(null)
    for (let i = this.n - 1; i < m; i++) {
      if (this.ts[i] - this.ts[i - this.n + 1] === (this.n - 1) * this.step) {
        const { slope, r2 } = windowStats(this.v.slice(i - this.n + 1, i + 1))
        this.slope[i] = slope
        this.r2[i] = r2
      }
    }
    this.viTs = []
    this.viAbs = []
    for (let i = 0; i < m; i++) {
      if (this.slope[i] !== null) {
        this.viTs.push(this.ts[i])
        this.viAbs.push(Math.abs(this.slope[i] as number))
      }
    }
  }

  statsAt(tMs: number, lag = 1): { result: LsrStatsResult | null; reason: LsrReason } {
    const cutoff = tMs - lag * this.step
    const idx = searchRight(this.ts, cutoff) - 1
    if (idx < this.n - 1) return { result: null, reason: 'seri_oncesi' }
    if (cutoff - this.ts[idx] >= 2 * this.step) return { result: null, reason: 'seri_sonrasi' }
    const slopeAtIdx = this.slope[idx]
    if (slopeAtIdx === null) return { result: null, reason: 'bosluk' }
    const hi = searchRight(this.viTs, cutoff)
    const lo = this.lookbackMs != null ? searchRight(this.viTs, cutoff - this.lookbackMs) : 0
    const refVals = this.viAbs.slice(lo, hi)
    if (refVals.length < this.minRef) return { result: null, reason: 'referans_yetersiz' }
    const ref = percentile90(refVals)
    if (!(ref > 0)) return { result: null, reason: 'referans_yetersiz' }
    return {
      result: {
        slope: slopeAtIdx,
        r2: this.r2[idx] as number,
        ref,
        nRef: refVals.length,
        refEnd: this.viTs[hi - 1],
        angle: (Math.atan(slopeAtIdx / ref) * 180) / Math.PI,
      },
      reason: 'ok',
    }
  }
}
