import { readGlb } from './glb.mjs'
import { split } from '../../src/slice.js'
const loaf = readGlb('public/scene.glb').castella
const r = split(loaf, [1, 0, 0], 0.1)
const m = r.front
const key = (i) => `${m.pos[i * 3]},${m.pos[i * 3 + 1]},${m.pos[i * 3 + 2]}`
const id = new Map(); const w = new Int32Array(m.skin.length)
for (let i = 0; i < w.length; i++) { const k = key(i); if (!id.has(k)) id.set(k, id.size); w[i] = id.get(k) }
const e = new Map()
for (let t = 0; t < m.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = w[m.idx[t + k]], b = w[m.idx[t + (k + 1) % 3]]; const kk = a + ',' + b; if (!e.has(kk)) e.set(kk, []); e.get(kk).push(t / 3) }
const P = [...id.keys()]
for (const [k, tris] of e) { const [a, b] = k.split(','); if (!e.has(b + ',' + a) || tris.length > 1) console.log(tris.length > 1 ? 'DUP' : 'OPEN', P[a], '->', P[b], 'tris', tris.join(' '), tris.map((t) => [m.idx[t * 3], m.idx[t * 3 + 1], m.idx[t * 3 + 2]].map((i) => m.skin[i].toFixed(1) + '/' + m.nrm[i * 3].toFixed(2)).join(' ')).join(' | ')) }
