// Wick smoke after the flame goes out: a vapour puff, then a thin laminar thread from the cooling char that breaks
// into curls a few centimetres up (the transition seen in every blow-out reference).
//
// Physics: each particle is a parcel of warm air. Buoyancy lifts it while it is warmer than the room (fading as it
// mixes), drag couples it to the surrounding air, and the surrounding air is a divergence-free curl field whose
// strength grows with height above the wick, plus whatever is left of the breath.
//
// Rendering: the thread is drawn as a streakline, a soft ribbon through its parcels in the order they left the
// wick, so it stays one continuous wisp however the flow stretches and folds it. The puff is soft points.
import * as THREE from 'three'
import { sceneDepth, depthGLSL } from './occlusion.js'

const LIFT = 1.35 // m/s², buoyancy of fresh smoke
const LIFT_FADE = 2.2 // s: a wick plume keeps rising for seconds (a point-source plume slows only as z^-1/3)
const DRAG = 1 / 0.16 // 1/s, coupling to the surrounding air
const SMOKE = new THREE.Color(0.6, 0.64, 0.7) // lit by the room, slightly blue against the warm light
const ZERO = new THREE.Vector3()

class Pool {
  constructor(max) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.age = new Float32Array(max).fill(1e9)
    this.life = new Float32Array(max).fill(1)
    this.size0 = new Float32Array(max)
    this.alpha0 = new Float32Array(max)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.next = 0
    this.count = 0 // how many were ever emitted (caps at max), for the ribbon order
  }

  alive(i) {
    return this.age[i] < this.life[i]
  }

  clear() {
    this.age.fill(1e9)
    this.alpha.fill(0)
    this.count = 0
  }
}

// ------------------------------------------------------------------ shaders

const pointVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = viewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha * smoothstep(0.6, 2.2, gl_PointSize);
    gl_PointSize = max(gl_PointSize, 1.0);
  }
`

const pointFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  ${depthGLSL}
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    // smoke is a volume: it thins out softly where it meets the cake rather than being cut by it
    float a = exp(-r2 * 3.2) * vAlpha * unhidden(gl_FragCoord.xy / uDepthRes, gl_FragCoord.z, 0.006);
    gl_FragColor = vec4(uColor * a, a);
  }
`

const ribbonVert = /* glsl */ `
  attribute vec3 aEdge;        // unit vector across the ribbon, kept continuous along it on the CPU
  attribute float aSide;
  attribute float aSize;
  attribute float aAlpha;
  uniform vec3 uCam;
  uniform float uPx;          // metres per pixel at 1 m, so the thread never gets thinner than ~1.5 px
  varying float vSide;
  varying float vAlpha;
  void main() {
    vec3 side = aEdge;
    float dist = length(uCam - position);
    float w = max(aSize * 0.5, uPx * dist * 0.9);
    // a thinner ribbon than its nominal width carries the same smoke: fade it rather than shrink it
    vAlpha = aAlpha * min(1.0, aSize * 0.5 / w);
    vSide = aSide;
    gl_Position = projectionMatrix * viewMatrix * vec4(position + side * aSide * w, 1.0);
  }
`

const ribbonFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vSide;
  varying float vAlpha;
  ${depthGLSL}
  void main() {
    float a = exp(-vSide * vSide * 2.6) * vAlpha * unhidden(gl_FragCoord.xy / uDepthRes, gl_FragCoord.z, 0.006);
    gl_FragColor = vec4(uColor * a, a);
  }
`

// premultiplied "over": smoke both scatters light and hides what is behind it
const over = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  side: THREE.DoubleSide,
}

function points(pool, scale, alpha = pool.alpha) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('aSize', new THREE.BufferAttribute(pool.size, 1).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage))
  const p = new THREE.Points(
    g,
    new THREE.ShaderMaterial({ vertexShader: pointVert, fragmentShader: pointFrag, uniforms: { uScale: scale, uColor: { value: SMOKE }, ...sceneDepth }, ...over }),
  )
  p.frustumCulled = false
  return p
}

// ------------------------------------------------------------------ smoke

export class Smoke {
  constructor(effects, rnd = Math.random) {
    this.source = new THREE.Vector3() // the wick's tip, where the candle is now
    this.last = null // ...and where it was at the last update (null: it was just put there)
    this._a = new THREE.Vector3()
    this._b = new THREE.Vector3()
    this.rnd = rnd
    this.thread = new Pool(4200)
    this.puffs = new Pool(900)
    this.carry = 0
    this.t = 0
    this.quiet = 1e9 // seconds since the last parcel left the wick: past every parcel's life, there is no smoke
    this._sw = new THREE.Vector3()

    const scale = { value: 800 }
    this.scale = scale
    // older thread turns diffuse: drawn as soft overlapping puffs instead of a crisp ribbon
    this.cloudAlpha = new Float32Array(this.thread.max)
    this.threadPoints = points(this.thread, scale, this.cloudAlpha)
    this.puffPoints = points(this.puffs, scale)

    // ribbon through the thread, two vertices per parcel
    const M = this.thread.max
    this.rPos = new Float32Array(M * 6)
    this.rTan = new Float32Array(M * 6)
    this.rSize = new Float32Array(M * 2)
    this.rAlpha = new Float32Array(M * 2)
    const side = new Float32Array(M * 2)
    for (let i = 0; i < M; i++) {
      side[i * 2] = -1
      side[i * 2 + 1] = 1
    }
    this.rIndex = new Uint32Array(M * 6)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.rPos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aEdge', new THREE.BufferAttribute(this.rTan, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(this.rSize, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.rAlpha, 1).setUsage(THREE.DynamicDrawUsage))
    g.setIndex(new THREE.BufferAttribute(this.rIndex, 1).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    this.ribbonGeometry = g
    this.ribbon = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        vertexShader: ribbonVert,
        fragmentShader: ribbonFrag,
        uniforms: { uCam: { value: new THREE.Vector3() }, uPx: { value: 0.001 }, uColor: { value: SMOKE }, ...sceneDepth },
        ...over,
      }),
    )
    this.ribbon.frustumCulled = false

    this.puffPoints.renderOrder = 1
    this.threadPoints.renderOrder = 1
    this.ribbon.renderOrder = 1
    effects.add(this.puffPoints, this.threadPoints, this.ribbon)
  }

  // dt: how long ago, within this frame, each new parcel left the wick. Each is integrated from that moment with
  // the same physics as the rest (wind included), so consecutive frames' parcels join up into one thread.
  // from, to: where the wick was at the start and at the end of that time (it may be moving: each parcel leaves from
  // where the wick was when it left, so a candle carried or knocked over still trails one continuous thread)
  emit(pool, n, opts = {}, dt = 0, w = null, from = this.source, to = this.source) {
    // fresh smoke leaves at the speed where its buoyancy balances drag (~0.2 m/s)
    // the thread is laminar where it leaves the wick: no scatter, its spreading is the ribbon's widening
    const { spread = 0, up = LIFT / DRAG, jitter = 0, kick = 0, size = 0.0024, alpha = 0.05, life = 4.2 } = opts
    const rnd = this.rnd
    if (n > 0) this.quiet = 0
    for (let k = 0; k < n; k++) {
      const i = pool.next
      pool.next = (pool.next + 1) % pool.max
      pool.count = Math.min(pool.max, pool.count + 1)
      const j = i * 3
      // newest last: parcel k = n-1 left the wick just now
      const born = dt * ((n - 1 - k + rnd() * 0.5) / Math.max(1, n))
      const vy = up * (1 + (rnd() - 0.5) * 2 * jitter)
      const f = dt > 0 ? 1 - born / dt : 1
      pool.pos[j] = from.x + (to.x - from.x) * f + (rnd() - 0.5) * spread
      pool.pos[j + 1] = from.y + (to.y - from.y) * f
      pool.pos[j + 2] = from.z + (to.z - from.z) * f + (rnd() - 0.5) * spread
      pool.vel[j] = (rnd() - 0.5) * kick
      pool.vel[j + 1] = vy
      pool.vel[j + 2] = (rnd() - 0.5) * kick
      pool.age[i] = 0
      pool.life[i] = life * (0.85 + rnd() * 0.3)
      pool.size0[i] = size * (0.85 + rnd() * 0.3)
      pool.alpha0[i] = alpha * (0.8 + rnd() * 0.4)
      const steps = Math.ceil(born / 0.004)
      for (let s = 0; s < steps; s++) this.advance(pool, i, born / steps, w || ZERO)
      this.look(pool, i)
    }
  }

  // size and opacity for a parcel's age: it spreads by diffusion and thins out as it mixes
  look(pool, i) {
    const a = pool.age[i]
    const k = Math.min(1, a / pool.life[i])
    pool.size[i] = pool.size0[i] + 0.009 * Math.sqrt(a) + 0.004 * a
    pool.alpha[i] = (pool.alpha0[i] * THREE.MathUtils.smoothstep(a, 0, 0.06) * Math.pow(1 - k, 1.5)) / (1 + a * 0.8)
  }

  // divergence-free swirl: the analytic curl of ψ = (ψx(y,z), ψy(z,x), ψz(x,y)), each a travelling sine product
  // scaled by 1/k so every term contributes velocities of order one
  curl(x, y, z, t, out) {
    const k1 = 38, k2 = 61, k3 = 24
    const p1 = k1 * y + 1.7 * t, p2 = k1 * 0.8 * z + 0.4 * t
    const p3 = k2 * z + 2.3 * t + 1.3, p4 = k2 * 0.9 * x - 0.7 * t
    const p5 = k3 * x - 1.1 * t + 2.1, p6 = k3 * 1.1 * y + 0.9 * t
    const dZdy = -1.1 * Math.sin(p5) * Math.sin(p6)
    const dYdz = Math.cos(p3) * Math.cos(p4)
    const dXdz = -0.8 * Math.sin(p1) * Math.sin(p2)
    const dZdx = Math.cos(p5) * Math.cos(p6)
    const dYdx = -0.9 * Math.sin(p3) * Math.sin(p4)
    const dXdy = Math.cos(p1) * Math.cos(p2)
    out.x = dZdy - dYdz
    out.y = dXdz - dZdx
    out.z = dYdx - dXdy
    return out
  }

  // one parcel, one step: buoyancy, drag toward the local air (curl swirl + breath), then move
  advance(pool, i, dt, w) {
    const j = i * 3
    const a = pool.age[i]
    const x = pool.pos[j], y = pool.pos[j + 1], z = pool.pos[j + 2]
    const hgt = Math.max(0, y - this.source.y)
    // laminar for the first few centimetres, then increasingly turbulent
    const turb = 0.003 + 0.06 * THREE.MathUtils.smoothstep(hgt, 0.035, 0.16)
    const sw = this.curl(x, y, z, this.t, this._sw)
    const airX = w.x * 0.8 + sw.x * turb
    const airY = w.y * 0.8 + sw.y * turb * 0.6
    const airZ = w.z * 0.8 + sw.z * turb
    const lift = LIFT * Math.exp(-a / LIFT_FADE)
    pool.vel[j] += (airX - pool.vel[j]) * DRAG * dt
    pool.vel[j + 1] += (lift + (airY - pool.vel[j + 1]) * DRAG) * dt
    pool.vel[j + 2] += (airZ - pool.vel[j + 2]) * DRAG * dt
    pool.pos[j] += pool.vel[j] * dt
    pool.pos[j + 1] += pool.vel[j + 1] * dt
    pool.pos[j + 2] += pool.vel[j + 2] * dt
    pool.age[i] = a + dt
  }

  step(pool, dt, w) {
    for (let i = 0; i < pool.max; i++) {
      if (pool.age[i] > pool.life[i]) {
        if (pool.alpha[i]) pool.alpha[i] = 0
        continue
      }
      this.advance(pool, i, dt, w)
      this.look(pool, i)
    }
  }

  /**
   * @param dt seconds
   * @param ember 0..1, the char's heat (drives how much smoke it gives off)
   * @param wind function(t) -> Vector3, residual breath at the wick
   */
  /** is any smoke in the air */
  get active() {
    return this.quiet < 5.2
  }

  update(dt, ember, wind) {
    dt = Math.min(dt, 1 / 30)
    if (!this.active && ember <= 0.04) {
      this.last = (this.last || new THREE.Vector3()).copy(this.source)
      return
    }
    this.quiet += dt
    // sub-steps of 8 ms or less: the breath's eddies (~14 Hz) must be sampled finely, or every frame's batch of
    // smoke kinks against the last
    const steps = Math.ceil(dt / 0.008)
    const h = dt / steps
    // the cooling wick gives off a thin stream while it's hot
    const rate = 1100 * Math.pow(Math.max(0, ember - 0.04), 1.3)
    const start = this.last || this.source
    for (let s = 0; s < steps; s++) {
      this.t += h
      const w = wind(this.t)
      this.step(this.thread, h, w)
      this.step(this.puffs, h, w)
      // new parcels are placed after the step by how long ago in it they left, so the thread is continuous
      this.carry += rate * h
      const n = Math.floor(this.carry)
      this.carry -= n
      if (n) this.emit(this.thread, n, {}, h, w, this._a.lerpVectors(start, this.source, s / steps), this._b.lerpVectors(start, this.source, (s + 1) / steps))
    }
    this.last = (this.last || new THREE.Vector3()).copy(this.source)
    this.buildRibbon()
    for (const p of [this.threadPoints, this.puffPoints]) {
      const a = p.geometry.attributes
      a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true
    }
  }

  buildRibbon() {
    const P = this.thread
    const M = P.max
    const { rPos, rTan, rSize, rAlpha, rIndex } = this
    // parcels in the order they left the wick: oldest first
    const start = P.count < M ? 0 : P.next
    let n = 0
    let prev = -1
    const cam = this.ribbon.material.uniforms.uCam.value
    let ex = 1, ey = 0, ez = 0 // previous edge, to keep the ribbon from flipping into bow-ties
    for (let k = 0; k < P.count; k++) {
      const i = (start + k) % M
      const live = P.alive(i)
      const j = i * 3
      // tangent from the neighbours in emission order, a few parcels either side
      const a = (start + Math.max(0, k - 3)) % M
      const b = (start + Math.min(P.count - 1, k + 3)) % M
      const tx = P.pos[b * 3] - P.pos[a * 3]
      const ty = P.pos[b * 3 + 1] - P.pos[a * 3 + 1] + 1e-7
      const tz = P.pos[b * 3 + 2] - P.pos[a * 3 + 2]
      // a second or so after leaving the wick the thread has mixed into a diffuse curl
      const diffuse = THREE.MathUtils.smoothstep(P.age[i], 0.5, 1.25)
      this.cloudAlpha[i] = live ? P.alpha[i] * diffuse * 0.5 : 0
      // spacing to the neighbours in emission order: ~0.3-0.6 mm when the thread is laminar
      const stretch = Math.hypot(tx, ty, tz) / Math.max(1, Math.min(k, 3) + Math.min(P.count - 1 - k, 3))
      // edge = tangent × view, flipped if needed to stay on the same side as the previous parcel's
      const vx = cam.x - P.pos[j], vy = cam.y - P.pos[j + 1], vz = cam.z - P.pos[j + 2]
      let cx = ty * vz - tz * vy, cy = tz * vx - tx * vz, cz = tx * vy - ty * vx
      const cl = Math.hypot(cx, cy, cz) || 1
      cx /= cl
      cy /= cl
      cz /= cl
      if (cx * ex + cy * ey + cz * ez < 0) {
        cx = -cx
        cy = -cy
        cz = -cz
      }
      // where the thread folds sharply it is a diffuse curl, not a crisp ribbon: fade, rather than pinch
      const twist = k === 0 ? 1 : THREE.MathUtils.smoothstep(cx * ex + cy * ey + cz * ez, 0.55, 0.92)
      ex = cx
      ey = cy
      ez = cz
      for (let s = 0; s < 2; s++) {
        const v = i * 2 + s
        rPos[v * 3] = P.pos[j]
        rPos[v * 3 + 1] = P.pos[j + 1]
        rPos[v * 3 + 2] = P.pos[j + 2]
        rTan[v * 3] = cx
        rTan[v * 3 + 1] = cy
        rTan[v * 3 + 2] = cz
        rSize[v] = P.size[i]
        // a ribbon covers its width once, where overlapping dots stacked up: carry more opacity per vertex.
        // Stretched thread is thinner smoke (the same parcel of smoke spread over a longer filament): fade it
        rAlpha[v] = live ? P.alpha[i] * 2.4 * Math.min(1, Math.pow(0.003 / (stretch + 1e-6), 0.6)) * twist * (1 - diffuse) : 0
      }
      if (prev >= 0 && live && P.alive(prev)) {
        const dx = P.pos[j] - P.pos[prev * 3]
        const dy = P.pos[j + 1] - P.pos[prev * 3 + 1]
        const dz = P.pos[j + 2] - P.pos[prev * 3 + 2]
        // don't bridge a real break in the thread
        if (dx * dx + dy * dy + dz * dz < 0.01 * 0.01) {
          const p0 = prev * 2
          const p1 = i * 2
          rIndex[n++] = p0
          rIndex[n++] = p0 + 1
          rIndex[n++] = p1
          rIndex[n++] = p1
          rIndex[n++] = p0 + 1
          rIndex[n++] = p1 + 1
        }
      }
      prev = i
    }
    const g = this.ribbonGeometry
    g.setDrawRange(0, n)
    for (const k of ['position', 'aEdge', 'aSize', 'aAlpha']) g.attributes[k].needsUpdate = true
    g.index.needsUpdate = true
  }

  // the moment the flame dies: a puff of the vapour that was feeding it
  puff() {
    this.emit(this.puffs, 420, { spread: 0.008, jitter: 0.35, kick: 0.04, size: 0.007, alpha: 0.01, life: 2.4 }, 0.07)
  }

  clear() {
    this.thread.clear()
    this.puffs.clear()
    this.carry = 0
    this.quiet = 1e9
    this.buildRibbon()
  }

  setViewport(heightPx, fovDeg) {
    // gl_PointSize = worldSize * uScale / depth
    const f = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2))
    this.scale.value = f
    this.ribbon.material.uniforms.uPx.value = 1.5 / f
  }

  setCamera(pos) {
    this.ribbon.material.uniforms.uCam.value.copy(pos)
  }
}
