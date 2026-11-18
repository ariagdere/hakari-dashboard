import type {
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  SeriesAttachedParameter,
  SeriesPrimitivePaneViewZOrder,
  Time,
} from 'lightweight-charts'

// /live grafiginde elle zonlar (lightweight-charts eklentisi): gecerli zonlarin hepsi, gecerli oldugu andan (created_at)
// sag kenara yatay bant; bantlar mumlarin altinda, numaralar (#7) bandin solunda mumlarin ustunde. Fiyat eksenini
// zorlamaz: uzaktaki zonlar grafigi kaydirinca ya da yakinlastirinca gorunur.
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
  private bars: number[] = [] // grafikteki mumlarin zamani (grafik saniyesi), artan
  private on = true
  private readonly views: ISeriesPrimitivePaneView[]

  // shiftSec: grafik zamani = UTC saniye + shiftSec (sayfa eksene yerel saati yaziyor)
  constructor(private readonly shiftSec: number) {
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
  setBars(times: number[]) {
    this.bars = times
    this.p?.requestUpdate()
  }
  setVisible(on: boolean) {
    this.on = on
    this.p?.requestUpdate()
  }

  // Bandin basladigi x (medya pikseli): zonun gecerli oldugu andan sonraki ilk mumun sol kenari; zon grafikteki ilk
  // mumdan once gecerliyse 0; son mumdan sonraysa null (cizilmez).
  private startX(z: ElleZone): number | null {
    const bars = this.bars
    if (bars.length === 0) return 0
    const t = Math.floor(z.createdAt / 1000) + this.shiftSec
    if (t <= bars[0]) return 0
    let lo = 0
    let hi = bars.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (bars[mid] < t) lo = mid + 1
      else hi = mid
    }
    if (bars[lo] < t) return null
    const ts = this.p!.chart.timeScale()
    const x = ts.timeToCoordinate(bars[lo] as Time)
    if (x === null) return 0
    return x - ts.options().barSpacing / 2
  }

  private geometry(z: ElleZone, W: number, H: number, hr: number, vr: number) {
    const yt = this.p!.series.priceToCoordinate(z.hi)
    const yb = this.p!.series.priceToCoordinate(z.lo)
    if (yt === null || yb === null) return null
    const sx = this.startX(z)
    if (sx === null) return null
    const x0 = Math.max(0, sx * hr)
    const y0 = yt * vr
    const y1 = yb * vr
    if (x0 >= W || y1 < 0 || y0 > H) return null
    return { x0, y0, y1 }
  }

  private drawBands(target: Target) {
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const W = bitmapSize.width
      const H = bitmapSize.height
      for (const z of this.zones) {
        const g = this.geometry(z, W, H, hr, vr)
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
      const W = bitmapSize.width
      const H = bitmapSize.height
      ctx.font = `600 ${11 * vr}px ${this.font}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      for (const z of this.zones) {
        const g = this.geometry(z, W, H, hr, vr)
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
