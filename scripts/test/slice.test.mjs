import { readGlb } from './glb.mjs'
import { split, meshVolume, meshCentroid } from '../../src/slice.js'
const m = readGlb('public/scene.glb')
console.log(Object.keys(m))
const loaf = m.castella
const edges = (mm) => { const e = new Map(); for (let t = 0; t < mm.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = mm.idx[t + k], b = mm.idx[t + (k + 1) % 3]; const key = a + ',' + b; e.set(key, (e.get(key) || 0) + 1) } let open = 0; for (const [k] of e) { const [a, b] = k.split(','); if (!e.has(b + ',' + a)) open++ } return open }
console.log('loaf verts', loaf.skin.length, 'tris', loaf.idx.length / 3, 'open edges', edges(loaf), 'volume cm3', (meshVolume(loaf) * 1e6).toFixed(2), 'centroid', meshCentroid(loaf).map((v) => v.toFixed(4)), 'skin>0.5', loaf.skin.filter((s) => s > 0.5).length, 't', loaf.t)
let lo = [9, 9, 9], hi = [-9, -9, -9]; for (let i = 0; i < loaf.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], loaf.pos[i + k]); hi[k] = Math.max(hi[k], loaf.pos[i + k]) }
console.log('bounds', lo.map((v) => v.toFixed(4)), hi.map((v) => v.toFixed(4)))
let t0 = performance.now()
const r = split(loaf, [1, 0, 0], 0.1)
console.log('split ms', (performance.now() - t0).toFixed(1))
for (const [k, h] of Object.entries(r)) console.log(k, 'verts', h.skin.length, 'tris', h.idx.length / 3, 'open', edges(h), 'vol', (meshVolume(h) * 1e6).toFixed(2))
// oblique second cut on the big piece, then a cut on a rotated plane
const big = r.back
const n = [Math.cos(0.4), 0.0, Math.sin(0.4)]
const r2 = split(big, n, -0.02)
for (const [k, h] of Object.entries(r2)) console.log('oblique', k, 'tris', h.idx.length / 3, 'open', edges(h), 'vol', (meshVolume(h) * 1e6).toFixed(2))
const n3 = [0.3, 0.9, 0.2]; const l3 = Math.hypot(...n3); n3.forEach((v, i) => (n3[i] = v / l3))
const r3 = split(r2.front, n3, 0.02)
for (const [k, h] of Object.entries(r3 || {})) console.log('tilted', k, 'tris', h.idx.length / 3, 'open', edges(h), 'vol', (meshVolume(h) * 1e6).toFixed(2))
// many thin slices
let piece = loaf, total = 0; t0 = performance.now()
for (let x = 0.12; x > -0.13; x -= 0.018) { const s = split(piece, [1, 0, 0], x); if (!s) break; total += meshVolume(s.front); piece = s.back; if (edges(s.front) || edges(s.back)) console.log('OPEN at', x) }
total += meshVolume(piece)
console.log('14 slices ms', (performance.now() - t0).toFixed(1), 'volume sum', (total * 1e6).toFixed(2), 'vs', (meshVolume(loaf) * 1e6).toFixed(2))
