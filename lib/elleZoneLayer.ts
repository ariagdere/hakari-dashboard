import type {
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  SeriesAttachedParameter,
  SeriesPrimitivePaneViewZOrder,
  Time,
} from 'lightweight-charts'

// /live grafiginde elle zonlar (lightweight-charts eklentisi): gecerli zonlarin hepsi, grafik boyunca yatay bant
// (gecerliligin basladigi andan degil; Ari, 18 Kasim); bantlar mumlarin altinda, numaralar (#7) bandin solunda mumlarin
// ustunde. Fiyat eksenini zorlamaz: uzaktaki zonlar grafigi kaydirinca ya da yakinlastirinca gorunur.
// Renk turkuaz: paralel Piyasa grafiginde otomatik destek/direncin morundan ayrilsin diye ayni renk.
// Zon eklenirken ya da duzenlenirken (lib/zoneEditor.ts): taslak kesik kenarli acik bant, kenarlarinda tutamac ve fiyat
// ekseninde iki etiket; cizimde ilk secilen kenar kesik cizgi; duzenlenen zonun kendisi gizli; cakisan zonlar turuncu.

type Target = Parameters<ISeriesPrimitivePaneRenderer['draw']>[0]

export interface ElleZone {
  id: number
  lo: number
  hi: number
  createdAt: number // UTC ms
  breaksFrom?: number // kirilma takibinin baslangici (UTC ms)
  replaces?: number[] | null
}

export type ZoneEditMarks = {
  hideId: number | null
  marks: Map<number, 'kesisiyor' | 'yakin'>
  draft: { lo: number; hi: number } | null
  first: number | null
  label: string // taslagin numara yerindeki yazisi
}
const NO_EDIT: ZoneEditMarks = { hideId: null, marks: new Map(), draft: null, first: null, label: '' }
const HANDLE_X = 0.5 // tutamaclar grafigin ortasinda

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export class ElleZoneLayer implements ISeriesPrimitive<Time> {
  color = '#27b0c4'
  text = '#ffffff'
  bg = '#080808'
  warn = '#fbbf24'
  font = 'DM Mono, monospace'
  private p: SeriesAttachedParameter<Time> | null = null
  private zones: ElleZone[] = []
  private edit: ZoneEditMarks = NO_EDIT
  private labels: Array<{ id: number; x0: number; y0: number; x1: number; y1: number }> = [] // medya pikseli
  private axisViews: ISeriesPrimitiveAxisView[] = []
  private on = true
  private readonly views: ISeriesPrimitivePaneView[]

  constructor() {
    const bands: ISeriesPrimitivePaneRenderer = { draw: (t) => this.p && this.on && this.drawBands(t) }
    const labels: ISeriesPrimitivePaneRenderer = { draw: (t) => this.p && this.on && this.drawLabels(t) }
    this.views = [
      { zOrder: (): SeriesPrimitivePaneViewZOrder => 'bottom', renderer: () => bands },
      { zOrder: (): SeriesPrimitivePaneViewZOrder => 'top', renderer: () => labels },
    ]
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.p = p
  }
  detached() {
    this.p = null
  }
  paneViews() {
    return this.views
  }
  priceAxisViews() {
    return this.axisViews
  }

  setZones(zones: ElleZone[]) {
    this.zones = zones
    this.p?.requestUpdate()
  }
  setVisible(on: boolean) {
    this.on = on
    this.p?.requestUpdate()
  }
  setEdit(edit: ZoneEditMarks | null) {
    const had = this.edit.draft !== null || this.edit.first !== null
    this.edit = edit ?? NO_EDIT
    const has = this.edit.draft !== null || this.edit.first !== null
    if (had !== has) this.axisViews = has ? this.makeAxisViews() : []
    this.p?.requestUpdate()
  }

  // Tiklanan yerdeki zon numarasi (medya pikseli; son cizimdeki etiket kutulari).
  labelAt(x: number, y: number): number | null {
    if (!this.on) return null
    for (const r of this.labels) if (x >= r.x0 - 3 && x <= r.x1 + 3 && y >= r.y0 - 3 && y <= r.y1 + 3) return r.id
    return null
  }

  private y(price: number): number | null {
    return this.p?.series.priceToCoordinate(price) ?? null
  }

  private makeAxisViews(): ISeriesPrimitiveAxisView[] {
    const price = (k: 'hi' | 'lo') => {
      const e = this.edit
      return e.draft ? e.draft[k] : k === 'hi' ? e.first : null
    }
    const view = (k: 'hi' | 'lo'): ISeriesPrimitiveAxisView => ({
      coordinate: () => {
        const p = price(k)
        return p === null ? -100 : (this.y(p) ?? -100)
      },
      text: () => {
        const p = price(k)
        return p === null ? '' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(p)
      },
      textColor: () => this.bg,
      backColor: () => this.text,
      visible: () => this.on && price(k) !== null,
      tickVisible: () => true,
    })
    return [view('hi'), view('lo')]
  }

  private geometry(lo: number, hi: number, H: number, vr: number) {
    const yt = this.y(hi)
    const yb = this.y(lo)
    if (yt === null || yb === null) return null
    const y0 = yt * vr
    const y1 = yb * vr
    if (y1 < 0 || y0 > H) return null
    return { x0: 0, y0, y1 }
  }

  private drawBands(target: Target) {
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const W = bitmapSize.width
      const H = bitmapSize.height
      const e = this.edit
      ctx.lineWidth = Math.max(1, hr)
      for (const z of this.zones) {
        if (z.id === e.hideId) continue
        const g = this.geometry(z.lo, z.hi, H, vr)
        if (!g) continue
        const c = e.marks.has(z.id) ? this.warn : this.color
        ctx.fillStyle = rgba(c, e.marks.has(z.id) ? 0.2 : 0.14)
        ctx.fillRect(g.x0, g.y0, W - g.x0, Math.max(1, g.y1 - g.y0))
        ctx.strokeStyle = rgba(c, 0.75)
        ctx.beginPath()
        ctx.moveTo(g.x0, Math.round(g.y0) + 0.5)
        ctx.lineTo(W, Math.round(g.y0) + 0.5)
        ctx.moveTo(g.x0, Math.round(g.y1) + 0.5)
        ctx.lineTo(W, Math.round(g.y1) + 0.5)
        ctx.stroke()
      }
      ctx.setLineDash([6 * hr, 4 * hr])
      ctx.strokeStyle = rgba(this.text, 0.9)
      if (e.draft) {
        const g = this.geometry(e.draft.lo, e.draft.hi, H, vr)
        if (g) {
          ctx.fillStyle = rgba(this.text, 0.08)
          ctx.fillRect(0, g.y0, W, Math.max(1, g.y1 - g.y0))
          ctx.beginPath()
          ctx.moveTo(0, Math.round(g.y0) + 0.5)
          ctx.lineTo(W, Math.round(g.y0) + 0.5)
          ctx.moveTo(0, Math.round(g.y1) + 0.5)
          ctx.lineTo(W, Math.round(g.y1) + 0.5)
          ctx.stroke()
        }
      } else if (e.first !== null) {
        const y = this.y(e.first)
        if (y !== null) {
          ctx.beginPath()
          ctx.moveTo(0, Math.round(y * vr) + 0.5)
          ctx.lineTo(W, Math.round(y * vr) + 0.5)
          ctx.stroke()
        }
      }
      ctx.setLineDash([])
    })
  }

  private drawLabels(target: Target) {
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const W = bitmapSize.width
      const H = bitmapSize.height
      const e = this.edit
      ctx.font = `600 ${11 * vr}px ${this.font}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const tag = (lo: number, hi: number, label: string, color: string) => {
        const g = this.geometry(lo, hi, H, vr)
        if (!g) return null
        // bandin gorunen kisminin ortasi
        const ym = (Math.max(0, g.y0) + Math.min(H, g.y1)) / 2
        const w = ctx.measureText(label).width
        // sol alt kosedeki TradingView logosunun ustune binmesin
        const x = g.x0 + (g.x0 < 50 * hr && ym > H - 40 * vr ? 50 : 6) * hr
        ctx.fillStyle = rgba(this.bg, 0.75)
        ctx.fillRect(x - 3 * hr, ym - 7 * vr, w + 6 * hr, 14 * vr)
        ctx.fillStyle = rgba(color, 0.92)
        ctx.fillText(label, x, ym)
        return { x0: (x - 3 * hr) / hr, y0: (ym - 7 * vr) / vr, x1: (x + w + 3 * hr) / hr, y1: (ym + 7 * vr) / vr }
      }
      const rects: typeof this.labels = []
      for (const z of this.zones) {
        if (z.id === e.hideId) continue
        const r = tag(z.lo, z.hi, `#${z.id}`, e.marks.has(z.id) ? this.warn : this.text)
        if (r) rects.push({ id: z.id, ...r })
      }
      this.labels = rects
      if (e.draft) {
        tag(e.draft.lo, e.draft.hi, e.label, this.text)
        const hw = 7 * hr
        const hh = 5 * vr
        const cx = Math.round(W * HANDLE_X)
        for (const p of [e.draft.hi, e.draft.lo]) {
          const y = this.y(p)
          if (y === null) continue
          const cy = Math.round(y * vr)
          if (cy < -hh || cy > H + hh) continue
          ctx.fillStyle = this.text
          ctx.strokeStyle = this.bg
          ctx.lineWidth = Math.max(1, hr)
          ctx.fillRect(cx - hw, cy - hh, 2 * hw, 2 * hh)
          ctx.strokeRect(cx - hw + 0.5, cy - hh + 0.5, 2 * hw - 1, 2 * hh - 1)
        }
      }
    })
  }
}
