import type {
  AutoscaleInfo,
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  SeriesPrimitivePaneViewZOrder,
  Time,
} from 'lightweight-charts'

// /live grafiginde secili islemler TradingView'daki pozisyon araci gibi (paralel SDL sayfasindaki ve arastirma
// sayfasindaki kurulum grafiginin aynisi):
// - Girisinden cikisina (acik islemde sag kenara) kutu: giris-hedef arasi yesil, giris-stop arasi kirmizi, icinde giris
//   cizgisi. Dolmamis emir (bekleyen, iptal, suresi dolan) soluk ve kesik kenarli, emrin verildigi andan.
// - Giristen cikisa kesik cizgi; giris noktasi ve sonucun renginde cikis noktasi (acik islemde son fiyat).
// - Kutunun basinda hedef ve stop etiketi ($ ve R:R), giris cizgisinin ustunde emir numarasi; sonunda sonuc (R).
// - Fiyat ekseni gorunen araliga giren secili islemlerin SL ve TP'sini kapsar (kutu yarim kalmasin; ekranin disindaki bir
//   islem ekseni genisletip mumlari ezmesin).
// Zamanlar grafik saniyesi (sayfanin yerel saat kaydirmasiyla); mumlar arasindaki an mumun icinde orantili.

type Target = Parameters<ISeriesPrimitivePaneRenderer['draw']>[0]
type Tone = 'tp' | 'sl' | 'neutral'

export interface ChartPosition {
  id: number
  long: boolean
  entry: number
  sl: number
  tp: number
  start: number // dolum ani (dolmadiysa emrin verildigi an)
  end: number | null // kapanis ani; null: acik ya da hala bekliyor (sag kenara)
  filled: boolean
  exit: { price: number; tone: Tone } | null // kapanis ya da acik islemde son fiyat
  idLabel: string
  tpLabel: string
  slLabel: string
  result: { text: string; tone: Tone } | null
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export class PositionLayer implements ISeriesPrimitive<Time> {
  colors = { tp: '#4ade80', sl: '#f87171', entry: '#60a5fa', neutral: '#a0a0a0', text: '#ffffff', bg: '#080808' }
  font = 'DM Mono, monospace'
  private p: SeriesAttachedParameter<Time> | null = null
  private positions: ChartPosition[] = []
  private bars: number[] = []
  private step = 900
  private on = true
  private readonly views: ISeriesPrimitivePaneView[]

  constructor() {
    const boxes: ISeriesPrimitivePaneRenderer = { draw: (t) => this.p && this.on && this.drawBoxes(t) }
    const marks: ISeriesPrimitivePaneRenderer = { draw: (t) => this.p && this.on && this.drawMarks(t) }
    this.views = [
      { zOrder: (): SeriesPrimitivePaneViewZOrder => 'bottom', renderer: () => boxes },
      { zOrder: (): SeriesPrimitivePaneViewZOrder => 'top', renderer: () => marks },
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
  autoscaleInfo(from: Logical, to: Logical): AutoscaleInfo | null {
    if (!this.on || this.positions.length === 0) return null
    const ps: number[] = []
    for (const q of this.positions) {
      const a = this.logical(q.start)
      const b = q.end === null ? Infinity : this.logical(q.end)
      if (a === null || b === null || b < from || a > to) continue
      ps.push(q.sl, q.tp, q.entry)
    }
    if (ps.length === 0) return null
    return { priceRange: { minValue: Math.min(...ps), maxValue: Math.max(...ps) } }
  }

  // Grafik saniyesindeki anin mantiksal konumu (mum indeksi; kutunun x'iyle ayni: mumun sol kenarindan orantili, ilk
  // mumdan once ve son mumdan sonra dilimle uzatilir). Mum yoksa null.
  private logical(t: number): number | null {
    const bars = this.bars
    const n = bars.length
    if (n === 0) return null
    if (t < bars[0]) return (t - bars[0]) / this.step - 0.5
    if (t >= bars[n - 1]) return n - 1.5 + (t - bars[n - 1]) / this.step
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (bars[mid] <= t) lo = mid
      else hi = mid - 1
    }
    return lo - 0.5 + Math.min(1, (t - bars[lo]) / (bars[lo + 1] - bars[lo]))
  }

  setPositions(positions: ChartPosition[]) {
    this.positions = positions
    this.p?.requestUpdate()
  }
  setBars(times: number[], stepSec: number) {
    this.bars = times
    this.step = stepSec
    this.p?.requestUpdate()
  }
  setVisible(on: boolean) {
    this.on = on
    this.p?.requestUpdate()
  }

  // Grafik saniyesindeki anin x'i (medya pikseli). Mumun icinde orantili; ilk mumdan once ve son mumdan sonra dilimle
  // uzatilir. Mum yoksa null.
  private x(t: number): number | null {
    const bars = this.bars
    const n = bars.length
    if (n === 0) return null
    const ts = this.p!.chart.timeScale()
    const sp = ts.options().barSpacing
    let i = 0
    if (t >= bars[n - 1]) i = n - 1
    else if (t > bars[0]) {
      let lo = 0
      let hi = n - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (bars[mid] <= t) lo = mid
        else hi = mid - 1
      }
      i = lo
    }
    const cx = ts.timeToCoordinate(bars[i] as Time)
    if (cx === null) return null
    const len = i < n - 1 ? bars[i + 1] - bars[i] : this.step
    const frac = (t - bars[i]) / (len > 0 ? len : this.step)
    return cx - sp / 2 + (i === n - 1 || t < bars[0] ? frac : Math.min(1, frac)) * sp
  }

  private geometry(q: ChartPosition, W: number, hr: number, vr: number) {
    const s = this.p!.series
    const ye = s.priceToCoordinate(q.entry)
    const yt = s.priceToCoordinate(q.tp)
    const ys = s.priceToCoordinate(q.sl)
    const xs = this.x(q.start)
    if (ye === null || yt === null || ys === null || xs === null) return null
    const xe = q.end === null ? null : this.x(q.end)
    const x0 = Math.max(0, xs * hr)
    // kutu tumuyle gorunen araligin solunda ya da saginda: cizilmez (sol kenarda ince bir kutu ve etiketler kalmasin)
    if ((xe !== null && xe * hr <= 0) || x0 >= W) return null
    let x1 = xe === null ? W : Math.min(W, xe * hr)
    if (x1 - x0 < 6 * hr) x1 = Math.min(W, x0 + 6 * hr)
    return { x0, x1, xs: xs * hr, xe: xe === null ? null : xe * hr, ye: ye * vr, yt: yt * vr, ys: ys * vr }
  }

  private drawBoxes(target: Target) {
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const W = bitmapSize.width
      for (const q of this.positions) {
        const g = this.geometry(q, W, hr, vr)
        if (!g) continue
        const a = q.filled ? 0.2 : 0.1
        ctx.fillStyle = rgba(this.colors.tp, a)
        ctx.fillRect(g.x0, Math.min(g.ye, g.yt), g.x1 - g.x0, Math.abs(g.yt - g.ye))
        ctx.fillStyle = rgba(this.colors.sl, a)
        ctx.fillRect(g.x0, Math.min(g.ye, g.ys), g.x1 - g.x0, Math.abs(g.ys - g.ye))
        if (!q.filled) {
          ctx.lineWidth = Math.max(1, hr)
          ctx.setLineDash([4 * hr, 3 * hr])
          ctx.strokeStyle = rgba(this.colors.tp, 0.8)
          ctx.strokeRect(g.x0 + 0.5, Math.min(g.ye, g.yt) + 0.5, g.x1 - g.x0 - 1, Math.abs(g.yt - g.ye))
          ctx.strokeStyle = rgba(this.colors.sl, 0.8)
          ctx.strokeRect(g.x0 + 0.5, Math.min(g.ye, g.ys) + 0.5, g.x1 - g.x0 - 1, Math.abs(g.ys - g.ye))
          ctx.setLineDash([])
        }
        ctx.strokeStyle = rgba(this.colors.entry, 0.9)
        ctx.lineWidth = Math.max(1, 1.2 * hr)
        ctx.beginPath()
        ctx.moveTo(g.x0, Math.round(g.ye) + 0.5)
        ctx.lineTo(g.x1, Math.round(g.ye) + 0.5)
        ctx.stroke()
      }
    })
  }

  private drawMarks(target: Target) {
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const W = bitmapSize.width
      const H = bitmapSize.height
      const tone = (t: Tone) => this.colors[t]
      ctx.font = `600 ${10 * vr}px ${this.font}`
      ctx.textBaseline = 'middle'
      const tagH = 15 * vr
      // etiket; dönüş değeri kapladığı yatay aralık
      const tag = (x: number, yMid: number, text: string, fill: string, outline: boolean, align: 'left' | 'right'): [number, number] => {
        const w = ctx.measureText(text).width + 10 * hr
        let left = align === 'left' ? x : x - w
        left = Math.max(2 * hr, Math.min(W - w - 2 * hr, left))
        const top = Math.max(1, Math.min(H - tagH - 1, yMid - tagH / 2))
        if (outline) {
          ctx.fillStyle = rgba(this.colors.bg, 0.9)
          ctx.fillRect(left, top, w, tagH)
          ctx.strokeStyle = fill
          ctx.lineWidth = Math.max(1, hr)
          ctx.strokeRect(left + 0.5, top + 0.5, w - 1, tagH - 1)
          ctx.fillStyle = fill
        } else {
          ctx.fillStyle = fill
          ctx.fillRect(left, top, w, tagH)
          ctx.fillStyle = this.colors.bg
        }
        ctx.textAlign = 'left'
        ctx.fillText(text, left + 5 * hr, top + tagH / 2 + 0.5)
        return [left, left + w]
      }
      const dot = (x: number, y: number, fill: string) => {
        ctx.beginPath()
        ctx.arc(x, y, 4.5 * hr, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.lineWidth = Math.max(1, 1.5 * hr)
        ctx.strokeStyle = this.colors.bg
        ctx.stroke()
      }
      for (const q of this.positions) {
        const g = this.geometry(q, W, hr, vr)
        if (!g) continue
        // girişten çıkışa kesik çizgi ve noktalar
        if (q.filled && q.exit) {
          const yx = this.p!.series.priceToCoordinate(q.exit.price)
          if (yx !== null) {
            const xEnd = g.xe === null ? g.x1 - 8 * hr : g.xe
            ctx.strokeStyle = rgba(this.colors.text, 0.55)
            ctx.lineWidth = Math.max(1, 1.2 * hr)
            ctx.setLineDash([5 * hr, 4 * hr])
            ctx.beginPath()
            ctx.moveTo(g.xs, g.ye)
            ctx.lineTo(xEnd, yx * vr)
            ctx.stroke()
            ctx.setLineDash([])
            if (g.xs >= 0) dot(g.xs, g.ye, this.colors.text)
            if (g.xe !== null && g.xe <= W) dot(g.xe, yx * vr, tone(q.exit.tone))
          }
        }
        // hedef ve stop etiketleri kutunun başında, kutunun dışında; numara giriş çizgisinin üstünde
        const up = q.long // long'da hedef yukarıda
        const off = tagH / 2 + 2 * vr
        const tpY = q.long ? g.yt - off : g.yt + off
        const slY = q.long ? g.ys + off : g.ys - off
        const tpSpan = tag(g.x0 + 2 * hr, tpY, q.tpLabel, this.colors.tp, false, 'left')
        const slSpan = tag(g.x0 + 2 * hr, slY, q.slLabel, this.colors.sl, false, 'left')
        ctx.textAlign = 'left'
        ctx.fillStyle = rgba(this.colors.text, 0.85)
        ctx.fillText(q.idLabel, g.x0 + 5 * hr, g.ye + (up ? 8 : -8) * vr)
        // sonuç kutunun sonunda: hedef ya da stopla kapandıysa o kenarın dışında (baştaki etikete binerse bir sıra
        // dışarıda), değilse çıkış fiyatının üstünde
        if (q.result) {
          const t = q.result.tone
          const w = ctx.measureText(q.result.text).width + 10 * hr
          let y: number
          if (t === 'neutral' || !q.exit) {
            const yx = q.exit ? this.p!.series.priceToCoordinate(q.exit.price) : null
            y = (yx === null ? g.ye / vr : yx) * vr - off
          } else {
            const span = t === 'tp' ? tpSpan : slSpan
            const outward = (t === 'tp') === up ? -1 : 1
            const base = t === 'tp' ? tpY : slY
            const left = Math.max(2 * hr, Math.min(W - w - 2 * hr, g.x1 - 2 * hr - w))
            y = left < span[1] + 4 * hr ? base + outward * (tagH + 2 * vr) : base
          }
          tag(g.x1 - 2 * hr, y, q.result.text, tone(t), true, 'right')
        }
      }
    })
  }
}
