// Small sounds, synthesised: the crust giving way, the soft rasp of the blade through the sponge, the edge
// meeting the hinoki board, and the hush of a slice laid down. No samples: noise and a few struck partials.
export class Sound {
  constructor() {
    this.ctx = null
    this.on = true
  }

  /** browsers only let audio start from a gesture */
  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = (this.ctx = new AC())
    this.out = ctx.createGain()
    this.out.gain.value = this.on ? 0.9 : 0
    this.out.connect(ctx.destination)
    const n = ctx.sampleRate * 1.5
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    // a soft, slightly pink noise
    let b = 0
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1
      b = 0.97 * b + 0.03 * w
      d[i] = w * 0.6 + b * 2.2
    }
    this.noise = buf
  }

  setOn(on) {
    this.on = on
    if (this.out) this.out.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05)
  }

  noiseBurst({ t0 = 0, dur, f, q = 1, gain, attack = 0.004, type = 'bandpass', rate = 1 }) {
    const ctx = this.ctx
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    s.playbackRate.value = rate
    const flt = ctx.createBiquadFilter()
    flt.type = type
    flt.frequency.value = f
    flt.Q.value = q
    const g = ctx.createGain()
    const t = ctx.currentTime + t0
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(flt).connect(g).connect(this.out)
    s.start(t, Math.random() * 1.2)
    s.stop(t + dur + 0.05)
    return { flt, g, t }
  }

  /** the knife breaks the crust: a few tiny crackles */
  crunch(k = 1) {
    if (!this.ready()) return
    for (let i = 0; i < 4; i++) this.noiseBurst({ t0: i * 0.022 + Math.random() * 0.012, dur: 0.05 + Math.random() * 0.03, f: 2600 + Math.random() * 2200, q: 1.4, gain: 0.07 * k })
    this.noiseBurst({ dur: 0.14, f: 900, q: 0.7, gain: 0.05 * k })
  }

  /** the blade drawn through the sponge */
  saw(dur = 0.4, k = 1) {
    if (!this.ready()) return
    const { flt, t } = this.noiseBurst({ dur, f: 1400, q: 0.6, gain: 0.045 * k, attack: 0.06 })
    flt.frequency.setValueAtTime(1000, t)
    flt.frequency.linearRampToValueAtTime(1900, t + dur * 0.5)
    flt.frequency.linearRampToValueAtTime(1100, t + dur)
  }

  /** the edge meets the hinoki board: a short, dry, woody knock */
  tok(k = 1) {
    if (!this.ready()) return
    const ctx = this.ctx
    const t = ctx.currentTime
    for (const [f, a, d] of [[612, 0.22, 0.055], [1390, 0.1, 0.035], [2710, 0.05, 0.02], [190, 0.12, 0.05]]) {
      const o = ctx.createOscillator()
      o.frequency.value = f * (0.97 + Math.random() * 0.06)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(a * k, t + 0.002)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      o.connect(g).connect(this.out)
      o.start(t)
      o.stop(t + d + 0.02)
    }
    this.noiseBurst({ dur: 0.03, f: 3500, q: 0.8, gain: 0.06 * k, attack: 0.001 })
  }

  /** a slice laid down on paper: a soft, low hush */
  thud(k = 1) {
    if (!this.ready()) return
    this.noiseBurst({ dur: 0.09 + 0.05 * k, f: 260, q: 0.6, gain: Math.min(0.16, 0.06 + 0.12 * k), attack: 0.003, type: 'lowpass' })
    this.noiseBurst({ dur: 0.05, f: 1200, q: 0.8, gain: 0.02 * k, attack: 0.002 })
  }

  ready() { return this.ctx && this.on && this.ctx.state === 'running' }
}
