import { readGlb } from './glb.mjs'
import { weldedOpen } from './weld.mjs'
import { split, meshVolume } from '../../src/slice.js'
const loaf = readGlb('public/scene.glb').castella
let pieces = [loaf]
let rng = 12345; const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648)
let bad = 0, maxMs = 0, cuts = 0
const V0 = meshVolume(loaf)
for (let k = 0; k < 40; k++) {
  const i = Math.floor(rand() * pieces.length)
  const p = pieces[i]
  const a = rand() * Math.PI
  const tilt = k % 5 === 4 ? 0.6 * (rand() - 0.5) : 0
  const n = [Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)]
  // a plane through a random point of the piece
  const j = Math.floor(rand() * p.skin.length)
  const c = [p.pos[j * 3] * 0.6, p.pos[j * 3 + 1], p.pos[j * 3 + 2] * 0.6]
  const w = n[0] * c[0] + n[1] * c[1] + n[2] * c[2]
  const t0 = performance.now()
  const r = split(p, n, w)
  const ms = performance.now() - t0
  if (!r) continue
  cuts++
  maxMs = Math.max(maxMs, ms)
  for (const h of [r.front, r.back]) { const o = weldedOpen(h); if (o.open || o.dup || meshVolume(h) <= 0) { bad++; console.log('BAD cut', k, JSON.stringify(o), meshVolume(h)) } }
  pieces.splice(i, 1, r.front, r.back)
}
const sum = pieces.reduce((s, p) => s + meshVolume(p), 0)
const tris = pieces.reduce((s, p) => s + p.idx.length / 3, 0)
console.log('cuts', cuts, 'pieces', pieces.length, 'bad', bad, 'max ms', maxMs.toFixed(1), 'volume', (sum * 1e6).toFixed(3), 'vs', (V0 * 1e6).toFixed(3), 'total tris', tris)
