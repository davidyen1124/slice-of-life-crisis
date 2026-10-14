import { readGlb } from './glb.mjs'
import { weldedOpen } from './weld.mjs'
import { split, meshVolume } from '../../src/slice.js'
const loaf = readGlb('public/scene.glb').castella
const show = (tag, h) => console.log(tag, 'tris', h.idx.length / 3, JSON.stringify(weldedOpen(h)), 'vol', (meshVolume(h) * 1e6).toFixed(2))
show('loaf', loaf)
const r = split(loaf, [1, 0, 0], 0.1); show('x front', r.front); show('x back', r.back)
const n = [Math.cos(0.4), 0.0, Math.sin(0.4)]
const r2 = split(r.back, n, -0.02); show('obl front', r2.front); show('obl back', r2.back)
const n3 = [0.3, 0.9, 0.2]; const l3 = Math.hypot(...n3); n3.forEach((v, i) => (n3[i] = v / l3))
const r3 = split(r2.front, n3, 0.02); show('tilt front', r3.front); show('tilt back', r3.back)
const r4 = split(loaf, n3, 0.03); show('tilt2 front', r4.front); show('tilt2 back', r4.back)
