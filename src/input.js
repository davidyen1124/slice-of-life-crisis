// One finger or the mouse: swipe to cut; press and hold to press into the sponge, then move to lift and carry.
// Two fingers (or the right button, or shift-drag): turn and tilt the view; pinch or the wheel: come closer.
// A double tap on the table puts the view back.
const HOLD_MS = 240
const MOVE_PX = 9

export class Input {
  constructor(el, h) {
    this.el = el
    this.h = h
    this.pointers = new Map()
    this.mode = null
    this.points = []
    this.lastTap = 0
    el.addEventListener('pointerdown', (e) => this.down(e))
    el.addEventListener('pointermove', (e) => this.move(e))
    el.addEventListener('pointerup', (e) => this.up(e))
    el.addEventListener('pointercancel', (e) => this.up(e, true))
    el.addEventListener('lostpointercapture', (e) => this.pointers.has(e.pointerId) && this.up(e, true))
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.h.zoom(Math.exp(e.deltaY * 0.0012)) }, { passive: false })
    // Safari's own pinch gesture would zoom the page
    for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault())
  }

  xy(e) {
    const r = this.el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }
  }

  down(e) {
    this.h.wake?.()
    const p = this.xy(e)
    try { this.el.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
    this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y })
    if (this.pointers.size === 2) {
      // a second finger: whatever the first was doing becomes turning the view
      this.cancel()
      this.mode = 'orbit2'
      this.pinch = this.pair()
      return
    }
    if (this.pointers.size > 2) return
    if (e.button === 2 || e.button === 1 || e.shiftKey) {
      this.mode = 'orbit'
      this.last = p
      return
    }
    this.mode = 'pending'
    this.start = p
    this.points = [p]
    clearTimeout(this.holdTimer)
    this.holdTimer = setTimeout(() => {
      if (this.mode !== 'pending') return
      const hit = this.h.pick(this.start.x, this.start.y)
      if (hit) {
        this.mode = 'poke'
        this.hit = hit
        this.h.pokeStart(hit)
      }
    }, HOLD_MS)
  }

  move(e) {
    const p = this.xy(e)
    const ptr = this.pointers.get(e.pointerId)
    if (!ptr) {
      if (e.pointerType === 'mouse') this.h.hover?.(p.x, p.y)
      return
    }
    Object.assign(ptr, p)
    switch (this.mode) {
      case 'pending': {
        if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > MOVE_PX) {
          clearTimeout(this.holdTimer)
          this.mode = 'stroke'
          this.points.push(p)
          this.h.strokeStart(this.points)
        }
        break
      }
      case 'stroke':
        this.points.push(p)
        this.h.strokeMove(this.points)
        break
      case 'poke':
        if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > MOVE_PX * 0.7) {
          this.h.pokeEnd()
          this.mode = 'grab'
          this.h.grabStart(this.hit, p.x, p.y)
        }
        break
      case 'grab':
        this.h.grabMove(p.x, p.y)
        break
      case 'orbit':
        this.h.orbit(p.x - this.last.x, p.y - this.last.y)
        this.last = p
        break
      case 'orbit2': {
        const now = this.pair()
        if (!now || !this.pinch) break
        this.h.orbit(now.cx - this.pinch.cx, now.cy - this.pinch.cy)
        if (this.pinch.d > 0 && now.d > 0) this.h.zoom(this.pinch.d / now.d)
        this.pinch = now
        break
      }
    }
  }

  up(e, cancelled = false) {
    const p = this.xy(e)
    this.pointers.delete(e.pointerId)
    clearTimeout(this.holdTimer)
    if (this.mode === 'orbit2') {
      if (this.pointers.size < 2) this.mode = this.pointers.size ? 'idle' : null
      return
    }
    if (this.pointers.size) return
    switch (this.mode) {
      case 'stroke':
        this.points.push(p)
        if (cancelled) this.h.strokeCancel()
        else this.h.strokeEnd(this.points)
        break
      case 'poke':
        this.h.pokeEnd()
        break
      case 'grab':
        this.h.grabEnd()
        break
      case 'pending': {
        const now = performance.now()
        if (now - this.lastTap < 320 && !this.h.pick(p.x, p.y)) this.h.resetView()
        this.lastTap = now
        break
      }
    }
    this.mode = null
  }

  cancel() {
    clearTimeout(this.holdTimer)
    if (this.mode === 'stroke') this.h.strokeCancel()
    if (this.mode === 'poke') this.h.pokeEnd()
    if (this.mode === 'grab') this.h.grabEnd()
    this.mode = null
  }

  pair() {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return null
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }
  }
}
