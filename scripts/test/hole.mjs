import { readGlb } from './glb.mjs'
import { split, meshVolume } from '../../src/slice.js'
const loaf = readGlb('public/scene.glb').castella
let pieces = [loaf]
let rng = 12345; const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648)
for (let k = 0; k < 40; k++) {
  const i = Math.floor(rand() * pieces.length)
  const p = pieces[i]
  const a = rand() * Math.PI
  const tilt = k % 5 === 4 ? 0.6 * (rand() - 0.5) : 0
  const n = [Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)]
  const j = Math.floor(rand() * p.skin.length)
  const c = [p.pos[j * 3] * 0.6, p.pos[j * 3 + 1], p.pos[j * 3 + 2] * 0.6]
  const w = n[0] * c[0] + n[1] * c[1] + n[2] * c[2]
  const r = split(p, n, w)
  if (!r) continue
  if (k === 30 || k === 33) {
    for (const h of [r.front, r.back]) {
      const key = (q) => `${h.pos[q * 3]},${h.pos[q * 3 + 1]},${h.pos[q * 3 + 2]}`
      const id = new Map(); const wv = []
      for (let q = 0; q < h.skin.length; q++) { const kk = key(q); if (!id.has(kk)) id.set(kk, id.size); wv.push(id.get(kk)) }
      const P = [...id.keys()].map((s) => s.split(',').map(Number))
      const e = new Set()
      for (let t = 0; t < h.idx.length; t += 3) for (let m = 0; m < 3; m++) e.add(wv[h.idx[t + m]] + ',' + wv[h.idx[t + (m + 1) % 3]])
      const open = [...e].filter((s) => { const [x, y] = s.split(','); return !e.has(y + ',' + x) })
      if (!open.length) continue
      console.log('cut', k, 'vol cm3', (meshVolume(h) * 1e6).toFixed(3), 'plane', n.map((v) => v.toFixed(3)), w.toFixed(4))
      for (const s of open) { const [x, y] = s.split(',').map(Number); console.log('  open', P[x].map((v) => v.toFixed(5)).join(','), '->', P[y].map((v) => v.toFixed(5)).join(','), 'len mm', (Math.hypot(P[x][0] - P[y][0], P[x][1] - P[y][1], P[x][2] - P[y][2]) * 1000).toFixed(4)) }
    }
  }
  pieces.splice(i, 1, r.front, r.back)
}
