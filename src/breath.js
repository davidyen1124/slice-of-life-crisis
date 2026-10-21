// From the microphone to air moving past the wick.
//
// Blowing on a microphone is wind noise: turbulent pressure fluctuations on the capsule, p' ∝ ½ρU².
// So the air speed goes as the square root of the signal's amplitude above the room's noise floor.
// We listen below ~1.6 kHz, where breath noise lives, with the browser's voice processing turned off
// (noise suppression would remove exactly the sound we want). A voice is loud but moves little air: it is
// harmonic, while breath is noise. Spectral flatness tells them apart, and a voice only counts for part of its level.
import * as THREE from 'three'

export const BREATH = {
  uRef: 3.0, // m/s at the flame for...
  pRef: 0.06, // ...this RMS amplitude above the floor (about -24 dBFS)
  maxU: 7.5, // a hard puff from close up
  rise: 0.06, // s, the breath reaching the flame
  fall: 0.35, // s, the puff's momentum carrying on after you stop
  yaw: -0.6, // rad, the breath's angle off the line of sight (from the viewer's left)
}
const UP = new THREE.Vector3(0, 1, 0)

export class Breath {
  constructor() {
    this.status = 'idle' // idle | asking | granted | denied | unsupported
    this.fallback = false // no microphone: holding the button blows gently
    this.holding = false
    this.source = 0 // air speed the breath implies at the flame, m/s
    this.level = 0 // 0..1, for the meter
    this.rms = 0
    this.flat = 0.3
    this.floor = 0.003
    this.heldFor = 0
    this.forced = null // QA: a fixed breath speed
  }

  get supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  }

  async request() {
    if (!this.supported) {
      this.status = 'unsupported'
      throw new Error('getUserMedia unavailable')
    }
    this.status = 'asking'
    // made inside the tap, before any await: iOS only lets an AudioContext start during a user gesture
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = this.ctx || new Ctx()
    this.ctx = ctx
    ctx.resume?.()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      })
      if (ctx.state === 'suspended') ctx.resume()
      const src = ctx.createMediaStreamSource(stream)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 35
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1600
      const an = ctx.createAnalyser()
      an.fftSize = 1024
      an.smoothingTimeConstant = 0
      src.connect(hp)
      hp.connect(lp)
      lp.connect(an)
      this.stream = stream
      this.analyser = an
      this.buf = new Float32Array(an.fftSize)
      this.spec = new Float32Array(an.frequencyBinCount)
      this.bins = [Math.max(1, Math.round(50 / (ctx.sampleRate / an.fftSize))), Math.round(1500 / (ctx.sampleRate / an.fftSize))]
      this.status = 'granted'
      this.fallback = false
    } catch (e) {
      this.status = 'denied'
      throw e
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  }

  measure() {
    if (!this.analyser) return 0
    this.analyser.getFloatTimeDomainData(this.buf)
    let s = 0
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i]
    return Math.sqrt(s / this.buf.length)
  }

  // 0 for a pure tone or a sung vowel, towards 1 for white noise
  flatness() {
    this.analyser.getFloatFrequencyData(this.spec)
    const [a, b] = this.bins
    let logSum = 0
    let sum = 0
    for (let i = a; i <= b; i++) {
      const p = Math.pow(10, Math.max(-160, this.spec[i]) / 10) + 1e-20
      logSum += Math.log(p)
      sum += p
    }
    const n = b - a + 1
    return Math.exp(logSum / n) / (sum / n)
  }

  update(dt) {
    let u = 0
    if (this.status === 'granted') {
      const rms = this.measure()
      this.rms = rms
      const flat = this.flatness()
      this.flat += (flat - this.flat) * Math.min(1, dt * 10)
      const noisiness = 0.3 + 0.7 * smoothstep(0.05, 0.2, this.flat)
      // room noise floor: follows quiet moments quickly, loud ones only slowly (and never while you blow)
      if (rms < this.floor) this.floor += (rms - this.floor) * Math.min(1, dt * 4)
      else if (!this.holding) this.floor += (rms - this.floor) * Math.min(1, dt * 0.15)
      this.floor = Math.max(this.floor, 0.0004)
      const p = Math.max(0, rms - 1.8 * this.floor) * noisiness
      u = Math.min(BREATH.maxU, BREATH.uRef * Math.sqrt(p / BREATH.pRef))
    }
    if (this.holding) this.heldFor += dt
    else this.heldFor = 0
    if (this.fallback && this.holding) {
      // a steady gentle-to-firm breath while the button is held
      u = 3.3 * (1 - Math.exp(-this.heldFor / 0.5))
    }
    if (this.forced !== null) u = this.forced
    this.source = this.holding || this.forced !== null ? u : 0
    const shown = Math.min(1, this.source / 3.6)
    this.level += (shown - this.level) * Math.min(1, dt * 18)
  }
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// smooth value noise
function noise1(seed) {
  const r = (i) => {
    const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  return (t) => {
    const i = Math.floor(t)
    const f = t - i
    const u = f * f * (3 - 2 * f)
    return (r(i) * (1 - u) + r(i + 1) * u) * 2 - 1
  }
}

// The breath as air at the candle: it arrives with a short lag, carries on briefly after you stop,
// and is turbulent (about a quarter of its speed in eddies), coming from where you are: the camera.
export class Air {
  constructor() {
    this.U = 0
    this.from = new THREE.Vector3(0, 0, 1) // unit vector pointing from the candle toward the viewer (horizontal)
    this.n = [1, 2, 3, 4].map(noise1)
    this._v = new THREE.Vector3()
  }

  // the breath comes from the viewer, a little from the left (people rarely blow dead-on): the flame leans back
  // and to the right where the eye can read it, and the smoke drifts the same way, away from the headline
  aim(cameraPos, candlePos) {
    this.from.set(cameraPos.x - candlePos.x, 0, cameraPos.z - candlePos.z).normalize()
    this.from.applyAxisAngle(UP, BREATH.yaw)
  }

  update(dt, source) {
    const tau = source > this.U ? BREATH.rise : BREATH.fall
    this.U += (source - this.U) * (1 - Math.exp(-dt / tau))
    if (this.U < 1e-4) this.U = 0
  }

  // airflow at the flame at time t (m/s), pointing away from the viewer
  at(t) {
    const U = this.U
    const v = this._v
    if (U === 0) return v.set(0, 0, 0)
    const [a, b, c, d] = this.n
    // the jet wanders a little in direction (±14°) and fluctuates in strength
    const yaw = 0.24 * a(t * 1.3)
    const along = U * (1 + 0.28 * b(t * 14))
    const across = U * 0.22 * c(t * 11)
    const up = U * 0.1 * d(t * 9)
    const fx = -this.from.x
    const fz = -this.from.z
    const cx = fx * Math.cos(yaw) - fz * Math.sin(yaw)
    const cz = fx * Math.sin(yaw) + fz * Math.cos(yaw)
    return v.set(cx * along - cz * across, up, cz * along + cx * across)
  }
}
