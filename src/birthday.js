// The birthday: a candle you put on the cake wherever you like, which lights itself while the room goes dark, and which
// you blow out through your microphone. Then the lights come up, and it says Happy Birthday.
//
// The candle is part of the cake's physics: pushed into a piece, it is carried, tipped and propped up with it; a knife
// that comes down on it knocks it over. Its flame is the gas that left the wick in the last few tens of milliseconds
// (flame.js), bent by your breath and by the candle's own movement through the air; its smoke is warm air rising
// (smoke.js); your breath is read from the microphone as air speed (breath.js).
import * as THREE from 'three'
import { Candle, CANDLE, ghostCandle } from './candle.js'
import { Flame } from './flame.js'
import { Smoke } from './smoke.js'
import { Breath, Air } from './breath.js'
import { generator, aside } from './random.js'

const $ = (s) => document.querySelector(s)
const body = document.body
const UP = new THREE.Vector3(0, 1, 0)
const LIGHTS = { down: 1.6, up: 2.6 } // seconds for the room to go dark, and to come back
const MARGIN = CANDLE.R + 0.0015 // a candle goes in at least this far from a piece's sides
const INSERT = 0.3 // seconds to push it in
const smooth = (x) => x * x * (3 - 2 * x)
// the page's ink, in the morning and with the lights down (the morning's are the stylesheet's own)
const INK = {
  '--ink': [[43, 36, 32, 1], [244, 236, 223, 1]],
  '--ink-soft': [[43, 36, 32, 0.62], [244, 236, 223, 0.66]],
  '--hair': [[43, 36, 32, 0.28], [244, 236, 223, 0.26]],
  '--tool-bg': [[244, 239, 231, 0.55], [24, 30, 40, 0.58]],
  '--tool-hover': [[250, 246, 240, 0.85], [24, 30, 40, 0.76]],
  '--tool-edge-hover': [[43, 36, 32, 0.45], [244, 236, 223, 0.42]],
  '--trail': [[43, 36, 32, 0.55], [244, 236, 223, 0.6]],
  '--shade': [[10, 14, 22, 0], [10, 14, 22, 0.35]],
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion()

export class Birthday {
  /** ctx: { stage, physics, sound, qa, pick(x, y), pieces() } */
  constructor(ctx) {
    this.ctx = ctx
    this.rnd = generator(ctx.qa ? 0x0b1e55ed : undefined)
    this.name = (new URLSearchParams(location.search).get('name') || '').trim().slice(0, 40)
    this.time = 0
    this.timers = []
    this.story = 0 // a new candle, a new story: timers from an old one do nothing
    this.candle = null // made, with its flame and smoke, the first time a candle is wanted
    this.breath = new Breath()
    this.air = new Air()
    this.placing = false
    this.insert = null
    this.lightsAt = { v: 0, from: 0, to: 0, t: 1, dur: 1 }
    this.root = new THREE.Vector3()
    this.tip = new THREE.Vector3()
    this.last = new THREE.Vector3()
    this.vel = new THREE.Vector3() // the wick's own speed through the air (m/s)
    this.jumped = true
    this.outAt = -1e9
    this.ui()
  }

  /** the candle button shows once the cake is cut (and from the start on a birthday link, ?name=) */
  get named() { return !!this.name }

  // ---------------------------------------------------------------------------------------------- the page
  ui() {
    this.button = $('.blow')
    this.label = $('.label')
    this.sheet = $('.sheet')
    this.toastEl = $('.toast')
    this.relightButton = $('.relight')
    this.candleButton = $('#candle')
    if (this.name) $('.hb-name').textContent = this.name

    this.candleButton.addEventListener('click', () => {
      this.ctx.sound.wake()
      if (this.placing) this.stopPlacing()
      else this.startPlacing()
    })
    $('.allow').addEventListener('click', () => this.allowMic())
    $('.later').addEventListener('click', () => {
      this.closeSheet()
      this.breath.fallback = true
      body.classList.add('mic')
      this.refreshLabel()
    })
    this.sheet.addEventListener('click', (e) => {
      if (e.target === this.sheet) this.closeSheet()
    })
    const b = this.button
    b.addEventListener('pointerdown', (e) => {
      if (!this.canBlow()) return
      e.preventDefault()
      try { b.setPointerCapture?.(e.pointerId) } catch { /* not capturable */ }
      this.startHold(e)
    })
    b.addEventListener('pointerup', () => this.endHold())
    b.addEventListener('pointercancel', () => this.endHold())
    b.addEventListener('lostpointercapture', () => this.endHold())
    b.addEventListener('click', () => {
      if (!this.canBlow()) this.openSheet()
    })
    b.addEventListener('contextmenu', (e) => e.preventDefault())
    b.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && this.canBlow()) {
        e.preventDefault()
        this.startHold(e)
      }
    })
    b.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') this.endHold()
    })
    this.relightButton.addEventListener('click', () => {
      if (this.candle?.state !== 'planted') return
      if (this.candle.up(_v).y < 0.2) {
        this.toast('Stand the candle up first.')
        return
      }
      this.light()
      if (document.activeElement === this.relightButton) this.button.focus({ preventScroll: true })
    })
    window.addEventListener('resize', () => requestAnimationFrame(() => this.layout()))
    this.refreshLabel()
  }

  setLabel(text) {
    if (this.label.textContent !== text) this.label.textContent = text
  }

  refreshLabel() {
    const b = this.breath
    if (b.holding) this.setLabel(b.status === 'granted' ? 'Blow' : 'Blowing')
    else if (b.status === 'granted') this.setLabel('Hold & blow')
    else if (b.fallback) this.setLabel('Hold to blow')
    else this.setLabel('Enable mic')
    this.button.setAttribute('aria-label', b.status === 'granted' || b.fallback ? 'Hold to blow out the candle' : 'Enable microphone to blow out the candle')
  }

  toast(text, ms = 3200) {
    this.toastEl.textContent = text
    this.toastEl.hidden = false
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => (this.toastEl.hidden = true), ms)
  }

  openSheet() {
    this.sheet.hidden = false
    requestAnimationFrame(() => this.sheet.classList.add('open'))
    $('.allow').focus({ preventScroll: true })
  }

  closeSheet() {
    this.sheet.classList.remove('open')
    setTimeout(() => (this.sheet.hidden = true), 350)
  }

  async allowMic() {
    this.closeSheet()
    try {
      await this.breath.request()
    } catch {
      this.breath.fallback = true
      this.toast(this.breath.status === 'unsupported' ? 'No microphone here. Hold to blow instead.' : 'Microphone blocked. Hold to blow instead.')
    }
    body.classList.add('mic')
    this.refreshLabel()
  }

  canBlow() {
    return this.breath.status === 'granted' || this.breath.fallback
  }

  startHold(e) {
    if (!this.flame?.lit) return
    if (!this.canBlow()) {
      if (e?.type === 'pointerdown') return // the click that follows opens the sheet
      this.openSheet()
      return
    }
    this.breath.resume()
    this.breath.holding = true
    this.button.classList.add('holding')
    this.refreshLabel()
  }

  endHold() {
    if (!this.breath.holding) return
    this.breath.holding = false
    this.button.classList.remove('holding')
    this.refreshLabel()
  }

  /** keys: Escape closes the sheet or stops placing; Enter or space, while placing, puts the candle on the biggest piece */
  key(e) {
    if (e.key === 'Escape') {
      if (!this.sheet.hidden) { this.closeSheet(); return true }
      if (this.placing) { this.stopPlacing(); return true }
      return false
    }
    if (this.placing && (e.key === ' ' || e.key === 'Enter') && !e.target.closest?.('button')) {
      e.preventDefault()
      const pieces = this.ctx.pieces()
      if (!pieces.length) return true
      const p = pieces.reduce((a, b) => (b.volume > a.volume ? b : a))
      const spot = this.spotOn(p, new THREE.Vector3(...p.centroid).applyMatrix4(p.object.matrixWorld))
      if (spot?.ok) this.plant(spot)
      return true
    }
    return false
  }

  /**
   * The cover line, set on the wall in the free space above the cake: below the masthead, left of the vertical title
   * and of the candle's smoke, above every piece and the board. Sized to the largest type that fits there.
   */
  layout() {
    const W = innerWidth, H = innerHeight
    const { stage } = this.ctx
    const headline = $('.headline'), wish = $('.wish'), jp = $('.jp-sub')
    const mast = $('.masthead').getBoundingClientRect()
    const title = $('.title').getBoundingClientRect()
    const gutter = mast.left
    const top = mast.bottom + Math.max(14, H * 0.035)
    const gap = Math.max(30, W * 0.06)
    const screen = (v) => {
      const p = _v.copy(v).project(stage.camera)
      return { x: (p.x * 0.5 + 0.5) * W, y: (1 - (p.y * 0.5 + 0.5)) * H }
    }
    // the outlines of everything on the table: every edge of every piece's box, and of the board
    const edges = []
    const box = (min, max, m) => {
      const c = []
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)
        c.push(screen(m ? v.applyMatrix4(m) : v))
      }
      for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) edges.push([c[i], c[i | bit]])
    }
    for (const p of this.ctx.pieces()) box(p.geometry.boundingBox.min, p.geometry.boundingBox.max, p.object.matrixWorld)
    box(new THREE.Vector3(-0.21, -0.018, -0.1), new THREE.Vector3(0.21, 0, 0.1))
    const flame = this.candle && this.candle.state !== 'none' ? screen(this.root.clone().add(new THREE.Vector3(0, 0.024, 0))) : null
    // how low the type may go in a column from the gutter to `right`: above whatever stands under it (the cake may stand
    // beside the column, leaving the wall above the table free), and above the flame if the flame is in it
    const floor = (right) => {
      const lo = gutter - 8, hi = right + 8
      let bottom = H * 0.62
      for (const [a, b] of edges) {
        if ((a.x < lo && b.x < lo) || (a.x > hi && b.x > hi)) continue
        const at = (x) => (a.x === b.x ? Math.min(a.y, b.y) : a.y + ((b.y - a.y) * (Math.min(hi, Math.max(lo, x)) - a.x)) / (b.x - a.x))
        bottom = Math.min(bottom, at(a.x), at(b.x))
      }
      if (flame && flame.x > lo && flame.x < hi) bottom = Math.min(bottom, flame.y)
      return bottom - Math.max(10, H * 0.02)
    }
    // the Japanese line is set wide (0.5em tracking); tighten it if the column is narrower than that
    const track = (availW) => {
      jp.style.letterSpacing = ''
      const chars = jp.textContent.length
      const tracked = jp.scrollWidth
      if (tracked > availW) {
        const em = parseFloat(getComputedStyle(jp).fontSize)
        const bare = tracked - chars * em * 0.5
        jp.style.letterSpacing = `${Math.max(0.05 * em, (availW - bare - 0.1 * em - 4) / chars).toFixed(2)}px`
      }
      return jp.offsetHeight + 16
    }
    const nameLines = this.name ? 0.64 : 0
    // measure the words at 100px
    headline.style.setProperty('--hb-size', '100px')
    headline.classList.remove('stacked')
    const l1 = headline.querySelector('.l1').offsetWidth, l2 = headline.querySelector('.l2').offsetWidth
    // the largest type for a column: on one line, or stacked
    const setting = (right) => {
      const availW = right - gutter, bottom = floor(right), jpH = track(availW)
      const fit = (w, lines) => Math.min((100 * availW) / w, (bottom - top - jpH) / (0.92 * lines + nameLines) || 0)
      const oneSize = fit(l1 + l2 + 25, 1), twoSize = fit(Math.max(l1, l2), 2)
      const stacked = twoSize > oneSize * 1.08
      return { right, availW, bottom, jpH, stacked, size: Math.max(30, Math.min(W > 900 ? 128 : 84, stacked ? twoSize : oneSize)) }
    }
    // two places it could go: across the wall left of the title, or (with a candle) left of the flame and its smoke
    const wide = setting(title.left - Math.max(24, W * 0.03))
    const beside = flame && flame.x - gap > gutter + 120 ? setting(flame.x - gap) : null
    const best = beside && beside.size >= wide.size ? beside : wide
    const jpH = track(best.availW)
    headline.classList.toggle('stacked', best.stacked)
    headline.style.setProperty('--hb-size', `${best.size.toFixed(1)}px`)
    wish.style.setProperty('--wish-left', `${gutter}px`)
    wish.style.setProperty('--wish-w', `${Math.max(120, best.availW)}px`)
    // sit the block on the cake's side of the free space, so it reads with the cake
    const blockH = headline.offsetHeight + jpH
    const y = Math.max(top, Math.min(best.bottom - blockH, top + (best.bottom - top - blockH) * 0.75))
    wish.style.setProperty('--wish-top', `${y}px`)
  }


  // ------------------------------------------------------------------------------------------- the candle
  /** the candle, its flame and its smoke, and the flame's light: made the first time a candle is wanted */
  ensure() {
    if (this.candle) return
    const { stage } = this.ctx
    aside(() => {
      this.candle = new Candle(stage.tex.wax)
      this.ghost = ghostCandle(this.candle)
      stage.scene.add(this.ghost)
      this.flame = new Flame(stage.effects, this.rnd)
      this.smoke = new Smoke(stage.effects, this.rnd)
      stage.addCandleLight()
    })
    this.flame.onExtinguish = (cause) => this.extinguished(cause)
  }

  startPlacing() {
    this.ensure()
    this.placing = true
    body.classList.add('placing')
    this.candleButton.setAttribute('aria-pressed', 'true')
  }

  stopPlacing() {
    this.placing = false
    body.classList.remove('placing')
    this.candleButton.setAttribute('aria-pressed', 'false')
    if (this.ghost) this.ghost.visible = false
  }

  /** where a candle would go, for a point on the screen */
  spotAt(x, y) {
    const hit = this.ctx.pick(x, y)
    return hit ? this.spotOn(hit.piece, hit.point) : null
  }

  /**
   * Where a candle goes into a piece, near a point on it: straight down into the top of the piece, clear of its
   * sides, as deep as the piece allows. Pieces are convex (a box cut by planes), so this is a matter of the planes.
   */
  spotOn(piece, point) {
    const up = UP.clone().applyQuaternion(_q.copy(piece.object.quaternion).invert()) // world up, in the piece's space
    const a = piece.object.worldToLocal(point.clone())
    const planes = piece.planes
    for (let k = 0; k < 4; k++) {
      for (const [x, y, z, b] of planes) {
        const nu = _n.set(x, y, z).dot(up)
        if (Math.abs(nu) > 0.7) continue // a top or a bottom
        const d = _n.dot(a) - b
        if (d >= MARGIN) continue
        const across = _n.addScaledVector(up, -nu)
        const l2 = across.lengthSq()
        if (l2 > 1e-6) a.addScaledVector(across, (MARGIN - d) / l2)
      }
    }
    // the vertical through it: where it enters the piece at the top, and where it leaves at the bottom
    let lo = -Infinity, hi = Infinity, cap = null
    for (const [x, y, z, b] of planes) {
      const nu = _n.set(x, y, z).dot(up)
      const d = _n.dot(a) - b
      if (Math.abs(nu) < 1e-6) {
        if (d < -1e-5) return { ok: false, reason: 'narrow' }
        continue
      }
      const t = -d / nu
      if (nu > 0) lo = Math.max(lo, t)
      else if (t < hi) { hi = t; cap = -nu }
    }
    if (!(hi > lo) || cap === null) return { ok: false, reason: 'narrow' }
    const top = a.clone().addScaledVector(up, hi)
    if (cap < 0.5) return { ok: false, reason: 'side' } // the face above is too steep to stand a candle in
    for (const [x, y, z, b] of planes) {
      const nu = _n.set(x, y, z).dot(up)
      if (Math.abs(nu) <= 0.7 && _n.dot(top) - b < CANDLE.R) return { ok: false, reason: 'narrow' }
    }
    const sink = Math.min(CANDLE.SINK, hi - lo - 0.004)
    if (sink < 0.006) return { ok: false, reason: 'thin' }
    return { ok: true, piece, top, axis: up, sink }
  }

  hover(x, y) {
    if (!this.placing || !this.ghost) return
    const spot = this.spotAt(x, y)
    const g = this.ghost
    g.visible = !!spot?.ok
    if (!g.visible) return
    const p = spot.piece.object
    g.quaternion.copy(p.quaternion).multiply(_q.setFromUnitVectors(UP, spot.axis))
    g.position.copy(spot.top).addScaledVector(spot.axis, -spot.sink).applyMatrix4(p.matrixWorld)
  }

  /** a tap: while placing, the candle goes there. Returns whether the tap was used */
  tap(x, y) {
    if (!this.placing) return false
    const spot = this.spotAt(x, y)
    if (!spot) return true
    if (!spot.ok) {
      this.toast(spot.reason === 'side' ? 'A candle goes in the top of a piece.' : 'That piece is too thin for a candle.')
      return true
    }
    this.plant(spot)
    return true
  }

  /** push the candle into a piece (from wherever it was), then light it */
  plant(spot) {
    this.ensure()
    this.stopPlacing()
    this.unplant()
    const c = this.candle
    const { piece, top, axis, sink } = spot
    // stood up straight (to within a degree, as a hand does it), and turned any way about its length
    const tilt = new THREE.Euler((this.rnd() - 0.5) * 0.04, this.rnd() * Math.PI * 2, (this.rnd() - 0.5) * 0.04)
    c.object.quaternion.setFromUnitVectors(UP, axis).multiply(_q.setFromEuler(tilt))
    c.axis.set(0, 1, 0).applyQuaternion(c.object.quaternion)
    c.top.copy(top)
    c.sink = sink
    c.piece = piece
    c.state = 'planted'
    piece.object.add(c.object)
    this.insert = { t: 0, tucked: false }
    this.place(0)
    this.story++
    this.timers.length = 0
    this.jumped = true
    this.flame.clear()
    this.smoke.clear()
    body.classList.add('candle-on')
    body.classList.remove('wished', 'relightable', 'lit')
    this.seal('祝')
    this.layout()
  }

  /** the title's seal: 切 (cut) for the cake, 祝 (celebrate) while a candle stands in it */
  seal(c) {
    const el = $('.title .seal')
    if (el.textContent !== c) el.textContent = c
  }

  /** where the candle is while it is pushed in: k = 0 above the cake, 1 all the way in */
  place(k) {
    const c = this.candle
    const e = k * k
    const h = 0.02 * (1 - e) - c.sink * e // the foot, above (+) or in (-) the sponge
    c.object.position.copy(c.top).addScaledVector(c.axis, h)
  }

  /** the candle is in: its wax joins the piece's body */
  seat() {
    const c = this.candle
    this.place(1)
    const half = (CANDLE.L - c.sink) / 2
    const mid = c.top.clone().addScaledVector(c.axis, half)
    c.collider = this.ctx.physics.attachCandle(c.piece, mid, c.object.quaternion, half)
  }

  /** take the candle out of wherever it is (it stays made, for the next place) */
  unplant() {
    const c = this.candle
    if (!c) return
    if (c.state === 'planted') this.ctx.physics.detachCandle(c.collider)
    if (c.state === 'loose') this.ctx.physics.removeBody(c.rigid)
    c.collider = null
    c.rigid = null
    c.piece = null
    c.orphan = false
    c.state = 'none'
    c.object.removeFromParent()
    this.insert = null
    this.seal('切')
  }

  /** the flame catches, and the lights go down */
  light() {
    const f = this.flame
    f.forget()
    f.relight()
    this.ctx.sound.ignite()
    this.story++
    this.timers.length = 0
    body.classList.add('lit')
    body.classList.remove('wished', 'relightable')
    this.lights(1, LIGHTS.down)
    this.refreshLabel()
  }

  extinguished(cause) {
    this.smoke.puff()
    // blown out by a breath is a wish; carried too fast, tipped over or knocked off is only out
    const wish = cause === 'wind' && this.breath.holding
    this.endHold()
    body.classList.remove('lit')
    if (wish) {
      this.layout()
      body.classList.add('wished')
    }
    this.outAt = this.time
    this.later(wish ? 2.2 : 1.0, () => this.lights(0, LIGHTS.up))
    this.later(wish ? 3.2 : 1.4, () => {
      if (this.candle.state !== 'planted' || this.flame.lit) return
      body.classList.add('relightable')
      // keyboard users were on the hold button, which is gone now
      if (document.activeElement === this.button) this.relightButton.focus({ preventScroll: true })
    })
  }

  /** the knife is coming down: if its blade meets the candle, the candle is knocked out of the cake */
  knock(job) {
    const c = this.candle
    if (!c || c.state !== 'planted' || !job.pieces.includes(c.piece)) return
    const at = c.object.localToWorld(_v.set(0, c.sink, 0))
    const d = job.n.dot(at) - job.w
    const along = job.dir.dot(at)
    if (Math.abs(d) > CANDLE.R + 0.002 || along < job.tMin - 0.004 || along > job.tMax + 0.004) return
    this.loosen(job.n.clone().multiplyScalar(Math.sign(d) || 1))
  }

  /** out of the sponge and over, away from the blade (side: which way, horizontally) */
  loosen(side) {
    const c = this.candle
    if (this.insert) this.place(1)
    this.insert = null
    c.object.updateWorldMatrix(true, false)
    const up = c.up(new THREE.Vector3())
    const q = c.object.getWorldQuaternion(new THREE.Quaternion())
    const foot = c.object.getWorldPosition(new THREE.Vector3())
    this.ctx.physics.detachCandle(c.collider)
    c.collider = null
    this.ctx.stage.scene.attach(c.object)
    // it comes out of the sponge, its foot at the surface
    const mid = foot.addScaledVector(up, c.sink + 0.001 + CANDLE.L / 2)
    const v = side.clone().multiplyScalar(0.22).addScaledVector(UP, 0.1)
    const w = new THREE.Vector3().crossVectors(up, side).multiplyScalar(9)
    c.rigid = this.ctx.physics.addCandle(mid, q, v, w)
    c.state = 'loose'
    c.piece = null
    this.seal('切')
    body.classList.remove('candle-on', 'relightable')
    this.flame.extinguish('knocked')
    if (!this.flame.lit) body.classList.remove('lit')
  }

  /** a piece is going (cut in two, or gone): a candle in it waits to be put into the piece that has its place */
  pieceRemoved(piece) {
    const c = this.candle
    if (!c || c.state !== 'planted' || c.piece !== piece) return
    if (this.insert) {
      this.insert = null
      this.place(1)
    }
    c.collider = null // went with the piece's body
    c.orphan = true
  }

  /** after a cut: the piece that now holds the candle's place takes it */
  piecesMade(made) {
    const c = this.candle
    if (!c?.orphan) return
    c.orphan = false
    const at = c.top.clone().addScaledVector(c.axis, -0.003)
    const home = made.find((p) => p.planes.every(([x, y, z, b]) => x * at.x + y * at.y + z * at.z - b > -1e-6))
    if (!home) {
      // its place went with a shaving: it falls
      c.object.updateWorldMatrix(true, false)
      this.ctx.stage.scene.attach(c.object)
      this.loosen(new THREE.Vector3(1, 0, 0))
      return
    }
    c.piece = home
    home.object.add(c.object) // the same place in the same loaf space
    this.seat()
  }

  /** a new loaf: the candle goes away, and the morning comes back */
  newLoaf() {
    if (!this.candle) return
    this.unplant()
    this.flame.clear()
    this.smoke.clear()
    this.endHold()
    this.stopPlacing()
    this.story++
    this.timers.length = 0
    body.classList.remove('candle-on', 'lit', 'wished', 'relightable')
    this.lights(0, 0.8)
  }

  // --------------------------------------------------------------------------------------------- time
  later(seconds, fn) {
    this.timers.push({ at: this.time + seconds, fn, story: this.story })
  }

  /** the room's lights, to dusk (1) or to the morning (0), over some seconds; the page's ink follows */
  lights(to, dur) {
    const L = this.lightsAt
    Object.assign(L, { from: L.v, to, t: 0, dur })
    body.classList.toggle('dusk', to > 0.5)
  }

  /** the page's ink for a room this dark (0 morning, 1 dusk) */
  ink(d) {
    for (const [name, [a, b]] of Object.entries(INK)) {
      const c = a.map((v, i) => v + (b[i] - v) * d)
      if (d === 0) body.style.removeProperty(name)
      else body.style.setProperty(name, `rgba(${c[0].toFixed(1)}, ${c[1].toFixed(1)}, ${c[2].toFixed(1)}, ${c[3].toFixed(3)})`)
    }
  }

  /** after the physics: the candle follows its piece, the flame and smoke move on */
  update(dt) {
    this.time += dt
    for (const t of this.timers.filter((t) => t.at <= this.time)) {
      this.timers.splice(this.timers.indexOf(t), 1)
      if (t.story === this.story) t.fn()
    }
    const L = this.lightsAt
    if (L.t < 1) {
      L.t = Math.min(1, L.t + dt / L.dur)
      L.v = L.from + (L.to - L.from) * smooth(L.t)
      this.ctx.stage.setDusk(L.v)
      this.ink(L.v)
    }
    const c = this.candle
    if (!c) return
    const { stage } = this.ctx
    if (this.insert) {
      const k = (this.insert.t = Math.min(1, this.insert.t + dt / INSERT))
      this.place(k)
      // the sponge gives around it as it goes in, and springs back once it is in
      const pierced = 0.02 * (1 - k * k) < 0
      c.piece.poke.point.copy(c.top)
      c.piece.poke.target = pierced && k < 1 ? 0.0016 : 0
      if (pierced && !this.insert.tucked) {
        this.insert.tucked = true
        this.ctx.sound.tuck()
      }
      if (k >= 1) {
        this.insert = null
        this.seat()
        this.later(0.25, () => this.light())
      }
    }
    if (c.state === 'planted' && (c.orphan || !c.piece.body)) {
      // its piece fell off the table (not cut: a cut finds it a new one at once), and took the candle with it
      this.unplant()
      this.flame.clear()
      body.classList.remove('candle-on', 'lit', 'relightable')
      this.lights(0, LIGHTS.up)
    }
    if (c.state === 'loose') {
      const t = c.rigid.translation(), r = c.rigid.rotation()
      c.object.quaternion.set(r.x, r.y, r.z, r.w)
      c.object.position.set(t.x, t.y, t.z).addScaledVector(_v.set(0, 1, 0).applyQuaternion(c.object.quaternion), -CANDLE.L / 2)
      c.object.updateMatrixWorld()
      if (t.y < -0.3) this.unplant()
    }
    if (c.state !== 'none') {
      c.root(this.root)
      c.tip(this.tip)
      // the wick moving through still air is a wind the other way across the flame
      if (this.jumped) {
        this.vel.set(0, 0, 0)
        this.flame.forget()
        this.smoke.last = null
        this.jumped = false
      } else if (dt > 0) {
        _v.subVectors(this.root, this.last).divideScalar(dt)
        this.vel.lerp(_v, 1 - Math.exp(-dt / 0.03))
      }
      this.last.copy(this.root)
      this.flame.place(this.root, this.tip)
      this.smoke.source.copy(this.tip)
      // turned over, the flame is smothered
      if (this.flame.lit && c.up(_v).y < -0.2) this.flame.extinguish('snuff')
    }
    this.breath.update(dt)
    this.air.aim(stage.camera.position, this.root)
    this.air.update(dt, this.flame.lit ? this.breath.source : 0)
    const vel = this.vel
    this.flame.update(dt, (t) => this.air.at(t).sub(vel))
    this.smoke.update(dt, this.flame.lit ? 0 : this.flame.ember, (t) => this.air.at(t))
    stage.fxOn = this.flame.lit || this.flame.ember > 0.01 || this.smoke.active
    stage.setCandleLight(this.flame.middle, this.flame.light)
    c.uniforms.uGlow.value = this.flame.light
    c.uniforms.uEmber.value = this.flame.lit ? 0.35 : this.flame.ember
    this.button.style.setProperty('--level', this.breath.holding ? this.breath.level.toFixed(3) : '0')
  }

  /** after the camera has moved, before the picture is drawn */
  beforeRender() {
    if (!this.candle) return
    const { stage } = this.ctx
    this.flame.project(stage.camera)
    this.smoke.setCamera(stage.camera.position)
    this.smoke.setViewport(stage.size.h * stage.size.dpr, stage.camera.fov)
  }

  /** where the lens should focus: on the candle, while it burns and while its smoke rises */
  focus() {
    const c = this.candle
    if (!c || c.state !== 'planted') return null
    return this.flame.lit || this.time - this.outAt < 6 ? this.root : null
  }
}
