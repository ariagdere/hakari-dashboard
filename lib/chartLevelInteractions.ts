// /live grafiginde yeni emrin SL/TP seviyelerini grafikten secme ve surukleme.
//
// - Panelde SL ya da TP secili iken grafige tiklamak / dokunmak o fiyati secili alana yazar.
// - SL/TP cizgisi tut-surukle ile yukari asagi tasinir (fare ve dokunma).
//
// lightweight-charts fare ve dokunma olaylarini kendi ic elemanlarinda dinliyor. Cizgiden baslayan
// bir basista olaylar grafik kutusunda CAPTURE asamasinda durdurulur: grafik kaymaz, sayfa
// kaydirilmaz. Diger her sey (grafigi kaydirma, yakinlastirma, sayfa kaydirma) eskisi gibi.
import type { IChartApi, IPriceLine, ISeriesApi } from 'lightweight-charts'

export type LevelTarget = 'sl' | 'tp'
export type PickKind = 'tap' | 'drag'

export interface LevelState {
  sl: number | null
  tp: number | null
  pickTarget: LevelTarget | null // tiklama / dokunma bu alana yazar
  interactive: boolean // gonderilirken ve doldu kartinda kapali
}

export interface LevelInteractionDeps {
  container: HTMLElement
  getChart: () => IChartApi | null
  getSeries: () => ISeriesApi<'Candlestick'> | null
  getState: () => LevelState | null
  getLine: (target: LevelTarget) => IPriceLine | null
  onPick: (target: LevelTarget, price: number, kind: PickKind, final: boolean) => void
}

const HIT_MOUSE_PX = 7
const HIT_TOUCH_PX = 22 // parmak icin genis tutma alani
const TAP_SLOP_PX = 8
const TAP_MAX_MS = 700
const DRAG_EMIT_MS = 60 // surukleme sirasinda panele en fazla ~16 guncelleme/sn

export function attachLevelInteractions(deps: LevelInteractionDeps) {
  const { container } = deps
  let drag: { target: LevelTarget; pointerId: number; price: number | null; lastEmit: number } | null = null
  let tap: { pointerId: number; x: number; y: number; t: number } | null = null
  let frozenAutoScale: boolean | null = null

  const local = (e: { clientX: number; clientY: number }) => {
    const r = container.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const pane = () => {
    const chart = deps.getChart()
    if (!chart) return null
    return { w: chart.timeScale().width(), h: container.clientHeight - chart.timeScale().height() }
  }
  const priceAt = (y: number): number | null => {
    const p = deps.getSeries()?.coordinateToPrice(y)
    return p != null && isFinite(p) && p > 0 ? Math.round(p) : null
  }
  // Basilan noktaya en yakin SL/TP cizgisi (tolerans icinde). Esitlikte secili alan kazanir.
  const hitLine = (y: number, touch: boolean): LevelTarget | null => {
    const s = deps.getState()
    const series = deps.getSeries()
    if (!s || !s.interactive || !series) return null
    const tol = touch ? HIT_TOUCH_PX : HIT_MOUSE_PX
    let best: { target: LevelTarget; dist: number } | null = null
    for (const target of ['sl', 'tp'] as const) {
      const price = s[target]
      if (price == null) continue
      const ly = series.priceToCoordinate(price)
      if (ly == null) continue
      const dist = Math.abs(ly - y)
      if (dist > tol) continue
      if (!best || dist < best.dist || (dist === best.dist && target === s.pickTarget)) best = { target, dist }
    }
    return best?.target ?? null
  }
  // Surukleme sirasinda fiyat ekseni sabit: otomatik olcek cizgiyi parmagin altindan kaydirmasin.
  const freezeScale = () => {
    const ps = deps.getChart()?.priceScale('right')
    if (!ps) return
    frozenAutoScale = ps.options().autoScale
    ps.applyOptions({ autoScale: false })
  }
  const restoreScale = () => {
    const ps = deps.getChart()?.priceScale('right')
    if (ps && frozenAutoScale != null) ps.applyOptions({ autoScale: frozenAutoScale })
    frozenAutoScale = null
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const { x, y } = local(e)
    const box = pane()
    if (!box || y < 0 || y > box.h || x < 0 || x > container.clientWidth) return
    const target = hitLine(y, e.pointerType !== 'mouse')
    if (target) {
      drag = { target, pointerId: e.pointerId, price: null, lastEmit: 0 }
      e.preventDefault() // fare: uyumluluk mouse olaylari (grafigin kaydirmasi) uretilmez
      e.stopPropagation()
      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        // desteklenmiyorsa hareketler yine kutuya gelir
      }
      freezeScale()
      container.classList.add('lc-dragging')
      return
    }
    tap = { pointerId: e.pointerId, x, y, t: Date.now() }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) {
      if (e.pointerType === 'mouse' && !drag) {
        const { y } = local(e)
        container.classList.toggle('lc-line-hover', hitLine(y, false) != null)
      }
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const box = pane()
    if (!box) return
    const y = Math.max(0, Math.min(box.h, local(e).y))
    const price = priceAt(y)
    if (price == null || price === drag.price) return
    drag.price = price
    deps.getLine(drag.target)?.applyOptions({ price })
    const now = performance.now()
    if (now - drag.lastEmit >= DRAG_EMIT_MS) {
      drag.lastEmit = now
      deps.onPick(drag.target, price, 'drag', false)
    }
  }

  const finishDrag = (e: PointerEvent): boolean => {
    if (!drag || drag.pointerId !== e.pointerId) return false
    const done = drag
    drag = null
    try {
      container.releasePointerCapture(e.pointerId)
    } catch {
      // zaten birakilmis
    }
    container.classList.remove('lc-dragging')
    if (done.price != null) deps.onPick(done.target, done.price, 'drag', true)
    restoreScale()
    return true
  }

  const onPointerUp = (e: PointerEvent) => {
    if (finishDrag(e)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const t = tap
    tap = null
    if (!t || t.pointerId !== e.pointerId) return
    const s = deps.getState()
    if (!s || !s.interactive || !s.pickTarget) return
    const { x, y } = local(e)
    if (Math.hypot(x - t.x, y - t.y) > TAP_SLOP_PX || Date.now() - t.t > TAP_MAX_MS) return
    const box = pane()
    if (!box || x < 0 || x > box.w || y < 0 || y > box.h) return
    const price = priceAt(y)
    if (price != null) deps.onPick(s.pickTarget, price, 'tap', true)
  }

  const onPointerCancel = (e: PointerEvent) => {
    finishDrag(e)
    tap = null
  }

  // Cizgi surukleniyorken dokunma / fare olaylari grafige ulasmasin; dokunmada sayfa da kaymasin.
  const onTouch = (e: TouchEvent) => {
    if (drag) {
      if (e.cancelable) e.preventDefault()
      e.stopPropagation()
    }
  }
  const onMouse = (e: MouseEvent) => {
    if (drag) e.stopPropagation()
  }
  const onLeave = () => container.classList.remove('lc-line-hover')

  const opts = { capture: true }
  const touchOpts: AddEventListenerOptions = { capture: true, passive: false }
  container.addEventListener('pointerdown', onPointerDown, opts)
  container.addEventListener('pointermove', onPointerMove, opts)
  container.addEventListener('pointerup', onPointerUp, opts)
  container.addEventListener('pointercancel', onPointerCancel, opts)
  container.addEventListener('touchstart', onTouch, touchOpts)
  container.addEventListener('touchmove', onTouch, touchOpts)
  container.addEventListener('touchend', onTouch, touchOpts)
  container.addEventListener('mousedown', onMouse, opts)
  container.addEventListener('mousemove', onMouse, opts)
  container.addEventListener('mouseup', onMouse, opts)
  container.addEventListener('pointerleave', onLeave)

  return {
    draggingTarget: (): LevelTarget | null => drag?.target ?? null,
    detach: () => {
      container.removeEventListener('pointerdown', onPointerDown, opts)
      container.removeEventListener('pointermove', onPointerMove, opts)
      container.removeEventListener('pointerup', onPointerUp, opts)
      container.removeEventListener('pointercancel', onPointerCancel, opts)
      container.removeEventListener('touchstart', onTouch, touchOpts)
      container.removeEventListener('touchmove', onTouch, touchOpts)
      container.removeEventListener('touchend', onTouch, touchOpts)
      container.removeEventListener('mousedown', onMouse, opts)
      container.removeEventListener('mousemove', onMouse, opts)
      container.removeEventListener('mouseup', onMouse, opts)
      container.removeEventListener('pointerleave', onLeave)
      container.classList.remove('lc-dragging', 'lc-line-hover')
      if (frozenAutoScale != null) restoreScale()
    },
  }
}
