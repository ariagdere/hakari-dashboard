import type {
  ISeriesPrimitive,
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

type Target = Parameters<ISeriesPrimitivePaneRenderer['draw']>[0]

export interface ElleZone {
  id: number
  lo: number
  hi: number
  createdAt: number // UTC ms
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export class ElleZoneLayer implements ISeriesPrimitive<Time> {
  color = '#27b0c4'
  text = '#ffffff'
  bg = '#080808'
  font = 'DM Mono, monospace'
  private p: SeriesAttachedParameter<Time> | null = null
  private zones: ElleZone[] = []
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

  setZones(zones: ElleZone[]) {
    this.zones = zones
    this.p?.requestUpdate()
  }
  setVisible(on: boolean) {
    this.on = on
    this.p?.requestUpdate()
  }

  private geometry(z: ElleZone, H: number, vr: number) {
    const yt = this.p!.series.priceToCoordinate(z.hi)
    const yb = this.p!.series.priceToCoordinate(z.lo)
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
      for (const z of this.zones) {
        const g = this.geometry(z, H, vr)
        if (!g) continue
        ctx.fillStyle = rgba(this.color, 0.14)
        ctx.fillRect(g.x0, g.y0, W - g.x0, Math.max(1, g.y1 - g.y0))
        ctx.strokeStyle = rgba(this.color, 0.75)
        ctx.lineWidth = Math.max(1, hr)
        ctx.beginPath()
        ctx.moveTo(g.x0, Math.round(g.y0) + 0.5)
        ctx.lineTo(W, Math.round(g.y0) + 0.5)
        ctx.moveTo(g.x0, Math.round(g.y1) + 0.5)
        ctx.lineTo(W, Math.round(g.y1) + 0.5)
        ctx.stroke()
      }
    })
  }

  private drawLabels(target: Target) {
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const H = bitmapSize.height
      ctx.font = `600 ${11 * vr}px ${this.font}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      for (const z of this.zones) {
        const g = this.geometry(z, H, vr)
        if (!g) continue
        // bandin gorunen kisminin ortasi
        const ym = (Math.max(0, g.y0) + Math.min(H, g.y1)) / 2
        const label = `#${z.id}`
        const w = ctx.measureText(label).width
        // sol alt kosedeki TradingView logosunun ustune binmesin
        const x = g.x0 + (g.x0 < 50 * hr && ym > H - 40 * vr ? 50 : 6) * hr
        ctx.fillStyle = rgba(this.bg, 0.75)
        ctx.fillRect(x - 3 * hr, ym - 7 * vr, w + 6 * hr, 14 * vr)
        ctx.fillStyle = rgba(this.text, 0.92)
        ctx.fillText(label, x, ym)
      }
    })
  }
}
