// A candle flame as a streakline: the flame is the gas that left the wick in the last few tens of milliseconds.
// A parcel of age τ has risen ½·a·τ² on its own buoyancy and has been carried sideways by the air it met on
// the way up, so a gust starts at the root and travels up to the tip, the way it does in slow-motion footage.
//
// Blow-out is a blow-off: past a critical speed at the flame base the reaction can't keep up with the strain,
// the base lifts off the wick and the flame loses heat faster than it makes it. The loss rate grows with how far
// past the limit the airflow is, so a stronger breath puts the flame out sooner, and a gentle one only bends it.
import * as THREE from 'three'
import { sceneDepth, depthGLSL } from './occlusion.js'

export const FLAME = {
  length: 0.019, // m, still-air flame height of a slim birthday candle
  accel: 14, // m/s², buoyant acceleration of the hot gas
  rise0: 0.25, // m/s, the vapour already rising as it leaves the wick
  couple: 0.5, // how much of the cross-flow the hot gas takes up (it has its own momentum)
  width: 0.0029, // m, half-width at the widest point (references: ~1:3.5 width to height)
  blowoff: 1.9, // m/s, airflow at the base the flame can't hold
  lossRate: 6, // 1/s at twice the blow-off speed
  recover: 1.6, // 1/s, how fast a strained flame regains heat below the limit
}

const N = 18 // parcels along the flame
const HIST = 96 // wind samples kept (at the 480 Hz physics step, 200 ms)
const STEP = 1 / 480

// ------------------------------------------------------------------ shaders

// The flame is drawn as a field, not a mesh: one camera-facing quad, and for each pixel the distance to the
// flame's (bent) axis, projected into the flame's plane. A ribbon of rows folds over itself when the flame bends
// toward or away from the camera; a distance field can't.
const M = N * 2 // axis samples (Catmull-Rom through the parcels)

const flameVert = /* glsl */ `
  uniform vec2 uQuadMin;
  uniform vec2 uQuadMax;
  uniform float uQuadZ;
  attribute vec2 aCorner;
  varying vec2 vQ;
  void main() {
    vQ = mix(uQuadMin, uQuadMax, aCorner);
    gl_Position = projectionMatrix * vec4(vQ, uQuadZ, 1.0);
  }
`

const flameFrag = /* glsl */ `
  uniform float uTime;
  uniform float uLum;      // luminous (soot) zone strength
  uniform float uBlue;     // how blue the flame has gone under strain
  uniform float uAlpha;
  uniform float uSeed;
  uniform vec2 uAxis[${M + 1}];   // the flame's axis in its own plane (view space, metres), root first
  uniform vec2 uRootDir;          // axis direction at the root, for the rounded bottom below it
  uniform float uWidth;
  varying vec2 vQ;
  ${depthGLSL}

  float profile(float v) {
    // teardrop: round at the root, widest about a third of the way up, pointed tip
    float c = 0.1;
    float f = pow(max(v + c, 0.0), 0.7) * pow(max(1.0 - v, 0.0), 0.9);
    return f / 0.389;
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  // soot glowing at flame temperatures: deep orange when thin/cool, through yellow, to a pale white-yellow core
  vec3 ramp(float i) {
    vec3 a = vec3(1.0, 0.30, 0.04);
    vec3 b = vec3(1.0, 0.6, 0.15);
    vec3 c = vec3(1.0, 0.90, 0.68);
    return i < 0.5 ? mix(a, b, i * 2.0) : mix(b, c, min(1.0, (i - 0.5) * 2.0));
  }

  void main() {
    // nearest point on the axis: v along it (0 root, 1 tip), d across
    float best = 1e9;
    float v = 0.0;
    float side = 1.0;
    // below the root, the round bottom: the axis carried on backwards for a tenth of its length
    float seg = length(uAxis[1] - uAxis[0]) * float(${M}) * 0.1;
    vec2 a0 = uAxis[0] - uRootDir * seg;
    {
      vec2 d = uAxis[0] - a0;
      float t = clamp(dot(vQ - a0, d) / max(dot(d, d), 1e-12), 0.0, 1.0);
      best = length(vQ - (a0 + d * t));
      v = -0.1 + 0.1 * t;
    }
    for (int k = 0; k < ${M}; k++) {
      vec2 a = uAxis[k];
      vec2 d = uAxis[k + 1] - a;
      float t = clamp(dot(vQ - a, d) / max(dot(d, d), 1e-12), 0.0, 1.0);
      vec2 e = vQ - (a + d * t);
      float dist = length(e);
      if (dist < best) {
        best = dist;
        v = (float(k) + t) / float(${M});
        side = sign(d.x * e.y - d.y * e.x);
      }
    }
    float w = uWidth * max(profile(v), 1e-4);
    // across, 1.0 at the flame's own edge
    float x = best / w;
    if (x > 1.3) discard;
    // shimmer: the outline breathes, most at the tip
    float n = noise(vec2(side * x * 2.5 + uSeed, v * 5.0 - uTime * 8.0));
    x *= 1.0 + (n - 0.5) * 0.35 * smoothstep(0.25, 1.0, v);

    // the flame is round in cross-section: light builds up through its thickness
    float thick = pow(max(0.0, 1.0 - x * x), 0.75);
    float edge = 1.0 - smoothstep(0.78, 1.0, x);

    // the luminous soot zone starts a little above the wick and burns out at the tip
    float along = smoothstep(0.03, 0.26, v) * (1.0 - smoothstep(0.62, 1.0, v));
    // fuel-rich dark cone round the wick
    float dark = (1.0 - smoothstep(0.05, 0.33, v)) * (1.0 - smoothstep(0.15, 0.7, x));
    float heat = thick * along * (1.0 - 0.85 * dark);
    heat *= 0.55 + 0.45 * smoothstep(0.1, 0.45, v);       // hottest in the middle third
    float i = clamp(heat * (0.35 + 0.65 * uLum), 0.0, 1.0);
    vec3 c = ramp(i) * pow(i, 1.5) * 2.1 * uLum;

    // blue: a thin shell where fuel meets air, brightest round the root
    float shell = exp(-pow((x - 0.82) / 0.2, 2.0)) + 0.35 * thick;
    float low = 1.0 - smoothstep(-0.05, 0.4, v);
    vec3 blue = vec3(0.2, 0.36, 1.0) * shell * low * (0.55 + 1.2 * uBlue);
    // under strain the whole flame goes to a dim blue-violet
    blue += vec3(0.25, 0.3, 1.0) * uBlue * thick * (1.0 - smoothstep(0.3, 1.0, v)) * 0.8;
    c += blue;

    c *= edge * smoothstep(-0.1, -0.02, v) * (1.0 - smoothstep(0.92, 1.0, v)) * uAlpha;
    // behind a piece of cake, the flame is hidden (its own candle and wick, within a few mm of it, are not in front)
    c *= unhidden(gl_FragCoord.xy / uDepthRes, gl_FragCoord.z, 0.004);
    gl_FragColor = vec4(c, 1.0);
  }
`

const glowVert = /* glsl */ `
  attribute vec2 aCorner;
  uniform vec3 uCenter;
  uniform float uSize;
  varying vec2 vC;
  varying float vSeen;
  uniform float uStretch;
  ${depthGLSL}
  void main() {
    vC = aCorner;
    vec4 mv = viewMatrix * vec4(uCenter, 1.0);
    // a glow is light from the flame: where the flame is hidden behind the cake, so is its glow. Five looks at the
    // scene's depth over the flame's middle, a few millimetres apart
    vec4 c = projectionMatrix * mv;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    float z = c.z / c.w * 0.5 + 0.5;
    vec2 px = vec2(0.0025, 0.005) * vec2(projectionMatrix[0][0], projectionMatrix[1][1]) / -mv.z * 0.5;
    vSeen = (unhidden(uv, z, 0.004) + unhidden(uv + vec2(px.x, 0.0), z, 0.004) + unhidden(uv - vec2(px.x, 0.0), z, 0.004)
      + unhidden(uv + vec2(0.0, px.y), z, 0.004) + unhidden(uv - vec2(0.0, px.y), z, 0.004)) / 5.0;
    mv.xy += aCorner * uSize * vec2(1.0, uStretch);
    gl_Position = projectionMatrix * mv;
  }
`

const glowFrag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vC;
  varying float vSeen;
  void main() {
    float r = length(vC);
    float g = exp(-r * r * 5.0) * 0.6 + exp(-r * 9.0) * 0.4;
    gl_FragColor = vec4(uColor * g * (1.0 - smoothstep(0.85, 1.0, r)) * vSeen, 1.0);
  }
`

function quad01() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3))
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
}

function quad() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3))
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
}

// light is added to the layer's colour and leaves its coverage alone (that is the smoke's, which hides what is behind it)
const additive = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
  side: THREE.DoubleSide,
}

// smooth value noise in time, for drifts and turbulence
function makeNoise(seed) {
  const r = (i) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  return (t) => {
    const i = Math.floor(t)
    const f = t - i
    const u = f * f * (3 - 2 * f)
    return r(i) * (1 - u) + r(i + 1) * u - 0.5
  }
}

// ------------------------------------------------------------------ flame

export class Flame {
  constructor(effects, rnd = Math.random) {
    // the flame sits on the wick: its root is just above the candle's melt pool (the candle says where, see place())
    this.root = new THREE.Vector3()
    this.wickTip = new THREE.Vector3()

    this.lit = false
    this.vitality = 0 // heat balance of the flame base, 0..1
    this.growth = 0 // 0..1 while a new flame takes hold of the wick
    this.ember = 0 // the wick char's glow: dull while burning, bright just after, then cools
    this.out = 0 // seconds since extinction
    this.light = 1
    this.t = 0
    this.acc = 0
    this.speed = 0 // airflow magnitude at the flame (m/s), for readouts
    this.windHist = Array.from({ length: HIST }, () => new THREE.Vector3())
    this.histHead = 0
    this.spine = Array.from({ length: N + 1 }, () => this.root.clone())
    this.middle = this.spine[Math.round(N * 0.42)] // the middle of the luminous zone: where its light comes from
    this.noise = [0, 1, 2, 3, 4, 5].map((s) => makeNoise(s + 1))
    this.onExtinguish = null

    this.axis = Array.from({ length: M + 1 }, () => new THREE.Vector2())
    this.ribbon = new THREE.Mesh(
      quad01(),
      new THREE.ShaderMaterial({
        vertexShader: flameVert,
        fragmentShader: flameFrag,
        uniforms: {
          uAxis: { value: this.axis },
          uRootDir: { value: new THREE.Vector2(0, 1) },
          uQuadMin: { value: new THREE.Vector2() },
          uQuadMax: { value: new THREE.Vector2() },
          uQuadZ: { value: -1 },
          uWidth: { value: FLAME.width },
          uTime: { value: 0 },
          uLum: { value: 1 },
          uBlue: { value: 0 },
          uAlpha: { value: 1 },
          uSeed: { value: rnd() * 10 },
          ...sceneDepth,
        },
        ...additive,
      }),
    )
    this.ribbon.frustumCulled = false
    this.ribbon.renderOrder = 3

    const glow = (size, color, stretch) => {
      const m = new THREE.Mesh(
        quad(),
        new THREE.ShaderMaterial({
          vertexShader: glowVert,
          fragmentShader: glowFrag,
          uniforms: { uCenter: { value: new THREE.Vector3() }, uSize: { value: size }, uColor: { value: new THREE.Color(...color) }, uStretch: { value: stretch }, ...sceneDepth },
          ...additive,
        }),
      )
      m.frustumCulled = false
      m.renderOrder = 2
      return m
    }
    this.halo = glow(0.07, [0.42, 0.2, 0.07], 1.0)
    this.bloom = glow(0.022, [1.1, 0.62, 0.26], 1.6)
    this.emberGlow = glow(0.006, [1.0, 0.25, 0.05], 1.0)
    effects.add(this.halo, this.bloom, this.ribbon, this.emberGlow)
    this.updateVisuals()
  }

  /** where the wick is now (world space): the candle moves with the piece it stands in */
  place(root, wickTip) {
    this.root.copy(root)
    this.wickTip.copy(wickTip)
  }

  /** the candle was put somewhere else: the gas that left the wick a moment ago did not come along */
  forget() {
    for (const w of this.windHist) w.set(0, 0, 0)
  }

  // airflow at the flame (m/s, world space) for the current instant
  ambientDrift(t) {
    // a still room is never quite still: slow drafts of a few cm/s, and the flame's own slight waver
    const [a, b, c] = this.noise
    return new THREE.Vector3(a(t * 0.6) * 0.07 + c(t * 3.1) * 0.02, 0, b(t * 0.5) * 0.07 + a(t * 2.7 + 9) * 0.02)
  }

  /**
   * @param dt seconds since the last frame
   * @param wind function(t) -> THREE.Vector3, the breath's airflow at the flame
   */
  update(dt, wind) {
    this.acc += Math.min(dt, 0.1)
    while (this.acc >= STEP) {
      this.acc -= STEP
      this.step(STEP, wind)
    }
    this.updateVisuals()
  }

  step(dt, wind) {
    this.t += dt
    const w = wind(this.t).add(this.ambientDrift(this.t))
    this.histHead = (this.histHead + 1) % HIST
    this.windHist[this.histHead].copy(w)
    this.speed = Math.hypot(w.x, w.z)

    if (this.lit) {
      // heat balance at the base
      const over = this.speed / FLAME.blowoff - 1
      if (over > 0) this.vitality -= FLAME.lossRate * over ** 1.5 * dt
      else this.vitality += FLAME.recover * (1 - this.vitality) * dt
      this.growth = Math.min(1, this.growth + dt * 1.4)
      this.ember += (0.55 - this.ember) * dt * 2
      if (this.vitality <= 0) this.extinguish('wind')
    } else {
      this.out += dt
      // the char cools: bright for a moment, then a fading red for a few seconds
      this.ember *= Math.exp(-dt / (this.ember > 0.4 ? 0.7 : 1.5))
    }
  }

  /** cause: 'wind' (blown out: by a breath, or by being carried too fast), 'snuff' (tipped over), 'knocked' (knocked off) */
  extinguish(cause = 'snuff') {
    if (!this.lit) return
    this.lit = false
    this.vitality = 0
    this.out = 0
    this.ember = 1
    this.onExtinguish?.(cause)
  }

  relight() {
    this.lit = true
    this.vitality = 0.55
    this.growth = 0.05
    this.out = 0
  }

  /** put out without a trace (the candle is taken away) */
  clear() {
    this.lit = false
    this.vitality = 0
    this.ember = 0
    this.out = 10
    this.updateVisuals()
  }

  // windIntegral(τ): sideways distance the air moved over the last τ seconds
  drift(age, out) {
    out.set(0, 0, 0)
    const n = Math.min(HIST - 1, Math.round(age / STEP))
    for (let k = 0; k < n; k++) {
      const s = this.windHist[(this.histHead - k + HIST) % HIST]
      out.x += s.x
      out.z += s.z
    }
    return out.multiplyScalar(STEP)
  }

  updateVisuals() {
    const V = Math.max(0, this.vitality)
    const g = this.growth
    const U = this.speed
    // a strained flame is shorter, thinner and bluer: less time for soot to form and glow
    // time for gas to rise one flame length: L = v0·t + ½·a·t²
    const tf = (-FLAME.rise0 + Math.sqrt(FLAME.rise0 ** 2 + 2 * FLAME.accel * FLAME.length)) / FLAME.accel
    // strain mixes it faster, so a flame in a cross-wind is shorter as well as bent
    const life = (tf * (0.4 + 0.6 * V) * (0.25 + 0.75 * g)) / (1 + 0.5 * U)
    const lift = (1 - V) * 0.3 * life // the base lifts off the wick as it weakens
    const puff = 1 + 0.035 * Math.sin(this.t * 2 * Math.PI * 11.3) * (0.3 + Math.min(1, U)) // ~11 Hz flicker
    const d = new THREE.Vector3()
    for (let i = 0; i <= N; i++) {
      const age = lift + (life - lift) * (i / N)
      const h = (FLAME.rise0 * age + 0.5 * FLAME.accel * age * age) * puff
      this.drift(age, d)
      // the candle and wick shield the root; the gas couples to the cross-flow as it rises
      const couple = 0.35 + 0.65 * Math.min(1, h / 0.01)
      this.spine[i].set(this.root.x + d.x * couple * FLAME.couple, this.root.y + h, this.root.z + d.z * couple * FLAME.couple)
    }
    const u = this.ribbon.material.uniforms
    u.uTime.value = this.t
    const lum = Math.pow(V, 1.5) / (1 + 0.3 * U * U)
    u.uLum.value = this.lit ? lum : 0
    u.uBlue.value = this.lit ? Math.min(1, (1 - V) * 0.9 + Math.max(0, U - 1) * 0.25) : 0
    u.uWidth.value = FLAME.width * (0.55 + 0.45 * g) * Math.pow(V, 0.35) / (1 + 0.1 * U)
    u.uAlpha.value = this.lit ? Math.min(1, g * 1.5) : 0
    this.ribbon.visible = this.lit

    // light the flame throws onto the cake: tracks its luminous zone, with a flicker
    const flick = 1 + 0.04 * this.noise[3](this.t * 9) + 0.025 * Math.sin(this.t * 71)
    this.light = this.lit ? (0.25 + 0.75 * lum) * Math.pow(V, 0.5) * g * flick : 0

    const mid = this.spine[Math.round(N * 0.42)]
    this.halo.material.uniforms.uCenter.value.copy(mid)
    this.halo.material.uniforms.uColor.value.setRGB(0.42, 0.2, 0.07).multiplyScalar(this.light * 0.7)
    this.bloom.material.uniforms.uCenter.value.copy(mid)
    this.bloom.material.uniforms.uColor.value.setRGB(1.1, 0.62, 0.26).multiplyScalar(this.light * 0.32)
    this.halo.visible = this.bloom.visible = this.lit

    const e = this.lit ? 0 : this.ember
    this.emberGlow.material.uniforms.uCenter.value.copy(this.wickTip)
    this.emberGlow.material.uniforms.uColor.value.setRGB(1.0, 0.25 + 0.3 * e, 0.05).multiplyScalar(e * e * 1.6)
    this.emberGlow.visible = !this.lit && e > 0.01
  }

  // place the flame's axis in its own plane, facing the camera (call after the camera moves, before drawing)
  project(camera) {
    const u = this.ribbon.material.uniforms
    const vm = camera.matrixWorldInverse
    const view = this.spine.map((p) => p.clone().applyMatrix4(vm))
    const zq = view[Math.round(N * 0.4)].z
    const pts = view.map((p) => new THREE.Vector2(p.x * (zq / p.z), p.y * (zq / p.z)))
    // Catmull-Rom through the parcels, two samples per span
    const P = (i) => pts[Math.max(0, Math.min(N, i))]
    for (let k = 0; k <= M; k++) {
      const f = (k / M) * N
      const i = Math.min(N - 1, Math.floor(f))
      const t = f - i
      const p0 = i === 0 ? P(0).clone().multiplyScalar(2).sub(P(1)) : P(i - 1)
      const p1 = P(i), p2 = P(i + 1)
      const p3 = i >= N - 1 ? P(N).clone().multiplyScalar(2).sub(P(N - 1)) : P(i + 2)
      const t2 = t * t, t3 = t2 * t
      this.axis[k].set(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      )
    }
    // smooth the axis (two [1,2,1] passes, root and tip pinned): eddies in the breath leave small kinks in it,
    // and a kinked axis would facet the flame's outline
    const ax = this.axis
    const tmp = this._tmpAxis || (this._tmpAxis = ax.map((v) => v.clone()))
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k <= M; k++) tmp[k].copy(ax[k])
      for (let k = 1; k < M; k++) ax[k].set((tmp[k - 1].x + 2 * tmp[k].x + tmp[k + 1].x) / 4, (tmp[k - 1].y + 2 * tmp[k].y + tmp[k + 1].y) / 4)
    }
    u.uRootDir.value.copy(this.axis[1]).sub(this.axis[0]).normalize()
    // the quad: the axis's bounds plus the flame's width
    const pad = u.uWidth.value * 1.6 + 0.002
    const min = u.uQuadMin.value.set(Infinity, Infinity)
    const max = u.uQuadMax.value.set(-Infinity, -Infinity)
    for (const a of this.axis) {
      min.min(a)
      max.max(a)
    }
    min.subScalar(pad)
    max.addScalar(pad)
    u.uQuadZ.value = zq
  }
}
