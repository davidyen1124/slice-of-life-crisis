// Cutting a piece of castella with a plane, exactly.
//
// A piece is a closed triangle mesh in *loaf space*: the coordinates of the whole, uncut loaf (metres, the loaf's
// bottom at y = 0). Every piece of one loaf keeps those coordinates, so the solid texture of the sponge, which the
// shader reads from the position, lines up from slice to slice like the real thing.
//
// split() clips the mesh by the plane n·p = w: triangles on either side are kept, straddling triangles are split
// at shared edge points (so both halves stay watertight), and the hole each half is left with is closed with a new
// face of cut crumb (skin = 0), triangulated on a fine grid so it can bend when the sponge is pressed.
import Delaunator from 'delaunator'
import Constrainautor from '@kninnug/constrainautor'

export const CAP_STEP = 0.005 // spacing of the grid that fills a fresh cut face

/** @typedef {{ pos: Float32Array, nrm: Float32Array, skin: Float32Array, idx: Uint32Array }} Mesh */

export function meshVolume(m) {
  const { pos, idx } = m
  let v = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])
  }
  return v / 6
}

/** centre of mass of the solid enclosed by the mesh (uniform density) */
export function meshCentroid(m) {
  const { pos, idx } = m
  let vol = 0, cx = 0, cy = 0, cz = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const v = (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6
    vol += v
    cx += v * (pos[a] + pos[b] + pos[c]) / 4
    cy += v * (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 4
    cz += v * (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 4
  }
  return vol > 0 ? [cx / vol, cy / vol, cz / vol] : [0, 0, 0]
}

/** growable typed-array builder for one side of the cut */
class Builder {
  constructor(cap) {
    this.pos = new Float32Array(cap * 3)
    this.nrm = new Float32Array(cap * 3)
    this.skin = new Float32Array(cap)
    this.idx = new Uint32Array(cap * 3)
    this.nv = 0
    this.ni = 0
  }
  vert(px, py, pz, nx, ny, nz, s) {
    if (this.nv >= this.skin.length) this.growV()
    const i = this.nv++, k = i * 3
    this.pos[k] = px; this.pos[k + 1] = py; this.pos[k + 2] = pz
    this.nrm[k] = nx; this.nrm[k + 1] = ny; this.nrm[k + 2] = nz
    this.skin[i] = s
    return i
  }
  tri(a, b, c) {
    if (this.ni + 3 > this.idx.length) {
      const n = new Uint32Array(this.idx.length * 2)
      n.set(this.idx)
      this.idx = n
    }
    this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c
  }
  growV() {
    const cap = this.skin.length * 2
    for (const [key, w] of [['pos', 3], ['nrm', 3], ['skin', 1]]) {
      const n = new Float32Array(cap * w)
      n.set(this[key])
      this[key] = n
    }
  }
  done() {
    return { pos: this.pos.slice(0, this.nv * 3), nrm: this.nrm.slice(0, this.nv * 3), skin: this.skin.slice(0, this.nv), idx: this.idx.slice(0, this.ni) }
  }
}

/**
 * Split a closed mesh by the plane n·p = w (n unit length).
 * Returns { front, back } (front: n·p >= w) or null if the plane misses the mesh.
 */
export function split(m, n, w) {
  const { pos, nrm, skin, idx } = m
  const nv = skin.length
  const [nx, ny, nz] = n
  const d = new Float32Array(nv)
  let hasPos = false, hasNeg = false
  const EPS = 1e-7
  for (let i = 0; i < nv; i++) {
    let s = pos[i * 3] * nx + pos[i * 3 + 1] * ny + pos[i * 3 + 2] * nz - w
    if (Math.abs(s) < EPS) s = s < 0 ? -EPS : EPS // nothing sits exactly on the plane
    d[i] = s
    if (s > 0) hasPos = true
    else hasNeg = true
  }
  if (!hasPos || !hasNeg) return null

  const sides = [new Builder(nv), new Builder(nv)] // 0: front (d > 0), 1: back
  const remap = [new Int32Array(nv).fill(-1), new Int32Array(nv).fill(-1)]
  const keep = (side, i) => {
    let j = remap[side][i]
    if (j < 0) {
      const k = i * 3
      j = remap[side][i] = sides[side].vert(pos[k], pos[k + 1], pos[k + 2], nrm[k], nrm[k + 1], nrm[k + 2], skin[i])
    }
    return j
  }
  // Vertices that share a position (a hard edge: the rim of an earlier cut face) are one point of the outline,
  // so the outline is chained by position; each side still gets its own vertex per edge, with that edge's normal.
  const canon = new Int32Array(nv)
  {
    const at = new Map()
    for (let i = 0; i < nv; i++) {
      const key = `${pos[i * 3]},${pos[i * 3 + 1]},${pos[i * 3 + 2]}`
      const j = at.get(key)
      if (j === undefined) { at.set(key, i); canon[i] = i } else canon[i] = j
    }
  }
  const geoIds = new Map() // canonical edge -> outline point id
  const vertIds = new Map() // actual edge -> [front vertex, back vertex]
  const loopPts = [] // [x, y, z] of each outline point
  const crossing = (a, b) => {
    const ca = canon[a], cb = canon[b]
    const gkey = ca < cb ? ca * nv + cb : cb * nv + ca
    const vkey = a < b ? a * nv + b : b * nv + a
    // compute from the canonical ends, in a fixed order, so every instance of this edge lands on the same point
    const [p, q] = ca < cb ? [ca, cb] : [cb, ca]
    const t = d[p] / (d[p] - d[q])
    let id = geoIds.get(gkey)
    if (id === undefined) {
      const kp = p * 3, kq = q * 3
      id = loopPts.length
      geoIds.set(gkey, id)
      loopPts.push([pos[kp] + (pos[kq] - pos[kp]) * t, pos[kp + 1] + (pos[kq + 1] - pos[kp + 1]) * t, pos[kp + 2] + (pos[kq + 2] - pos[kp + 2]) * t])
    }
    let v = vertIds.get(vkey)
    if (v === undefined) {
      // this instance's attributes, interpolated along its own ends (matching p, q by position)
      const [ia, ib] = canon[a] === p ? [a, b] : [b, a]
      const ka = ia * 3, kb = ib * 3
      let mx = nrm[ka] + (nrm[kb] - nrm[ka]) * t
      let my = nrm[ka + 1] + (nrm[kb + 1] - nrm[ka + 1]) * t
      let mz = nrm[ka + 2] + (nrm[kb + 2] - nrm[ka + 2]) * t
      const ml = Math.hypot(mx, my, mz) || 1
      mx /= ml; my /= ml; mz /= ml
      const sk = skin[ia] + (skin[ib] - skin[ia]) * t
      const P = loopPts[id]
      v = [sides[0].vert(P[0], P[1], P[2], mx, my, mz, sk), sides[1].vert(P[0], P[1], P[2], mx, my, mz, sk)]
      vertIds.set(vkey, v)
    }
    return { id, f: v[0], b: v[1] }
  }
  const segs = [] // pairs of crossing ids, oriented along the front side's boundary

  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]]
    const pz = [d[v[0]] > 0, d[v[1]] > 0, d[v[2]] > 0]
    const count = pz[0] + pz[1] + pz[2]
    if (count === 3) { sides[0].tri(keep(0, v[0]), keep(0, v[1]), keep(0, v[2])); continue }
    if (count === 0) { sides[1].tri(keep(1, v[0]), keep(1, v[1]), keep(1, v[2])); continue }
    // rotate so that v[0] is the lone vertex
    const lone = count === 1 ? pz.indexOf(true) : pz.indexOf(false)
    const a = v[lone], b = v[(lone + 1) % 3], c = v[(lone + 2) % 3]
    const ab = crossing(a, b), ca = crossing(c, a)
    const loneSide = count === 1 ? 0 : 1
    const other = 1 - loneSide
    const X = loneSide === 0 ? 'f' : 'b'
    const Y = loneSide === 0 ? 'b' : 'f'
    // the lone corner keeps one triangle, the other side a quad (two triangles); winding is preserved
    sides[loneSide].tri(keep(loneSide, a), ab[X], ca[X])
    sides[other].tri(ab[Y], keep(other, b), keep(other, c))
    sides[other].tri(ab[Y], keep(other, c), ca[Y])
    // boundary segment of the front side's hole, going the way the front side's triangles wind
    if (ab.id === ca.id) continue
    if (loneSide === 0) segs.push([ab.id, ca.id])
    else segs.push([ca.id, ab.id])
  }

  const front = sides[0], back = sides[1]
  capHole(front, back, loopPts, segs, n, w)
  return { front: front.done(), back: back.done() }
}

/** close both halves' holes with one shared, finely triangulated face lying on the plane */
function capHole(front, back, loopPts, segs, n, w) {
  if (!segs.length) return
  // a basis on the plane
  const [nx, ny, nz] = n
  const ref = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let ux = ref[1] * nz - ref[2] * ny, uy = ref[2] * nx - ref[0] * nz, uz = ref[0] * ny - ref[1] * nx
  const ul = Math.hypot(ux, uy, uz)
  ux /= ul; uy /= ul; uz /= ul
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux
  const to2 = (p) => [p[0] * ux + p[1] * uy + p[2] * uz, p[0] * vx + p[1] * vy + p[2] * vz]

  // chain the segments into closed loops (a piece of a convex loaf has one; be tolerant of more)
  const next = new Map()
  for (const [a, b] of segs) next.set(a, b)
  const seen = new Set()
  const loops = []
  for (const [start] of segs) {
    if (seen.has(start)) continue
    const loop = []
    let cur = start
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur)
      loop.push(cur)
      cur = next.get(cur)
    }
    if (loop.length >= 3 && cur === start) loops.push(loop)
  }

  for (const loop of loops) {
    // 2D points: the loop itself (minus points that coincide), then a grid inside it
    const pts = []
    const ids = []
    for (const id of loop) {
      const p = to2(loopPts[id])
      const q = pts[pts.length - 1]
      if (q && Math.abs(p[0] - q[0]) < 1e-7 && Math.abs(p[1] - q[1]) < 1e-7) continue
      pts.push(p)
      ids.push(id)
    }
    if (pts.length > 3) {
      const [a, b] = [pts[0], pts[pts.length - 1]]
      if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) { pts.pop(); ids.pop() }
    }
    if (pts.length < 3) continue
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const [u, v] of pts) {
      minU = Math.min(minU, u); maxU = Math.max(maxU, u)
      minV = Math.min(minV, v); maxV = Math.max(maxV, v)
    }
    const inside = (u, v) => {
      let c = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ui, vi] = pts[i], [uj, vj] = pts[j]
        if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c
      }
      return c
    }
    // distance from a point to the loop, so grid points too close to the edge are dropped
    const edgeDist = (u, v) => {
      let best = Infinity
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [bx, by] = pts[i]
        const ex = bx - ax, ey = by - ay
        const t = Math.max(0, Math.min(1, ((u - ax) * ex + (v - ay) * ey) / (ex * ex + ey * ey || 1)))
        best = Math.min(best, Math.hypot(u - ax - ex * t, v - ay - ey * t))
      }
      return best
    }
    const nLoop = pts.length
    const all = pts.slice()
    const offU = ((minU % CAP_STEP) + CAP_STEP) % CAP_STEP, offV = ((minV % CAP_STEP) + CAP_STEP) % CAP_STEP
    for (let u = minU - offU + CAP_STEP; u < maxU; u += CAP_STEP) {
      for (let v = minV - offV + CAP_STEP; v < maxV; v += CAP_STEP) {
        if (inside(u, v) && edgeDist(u, v) > CAP_STEP * 0.45) all.push([u, v])
      }
    }
    const flat = new Float64Array(all.length * 2)
    all.forEach(([u, v], i) => { flat[i * 2] = u; flat[i * 2 + 1] = v })
    const del = new Delaunator(flat)
    // make every edge of the loop an edge of the triangulation, so the face meets the walls exactly
    // (an edge through a third, collinear outline point cannot be constrained; it is already straight, so skip it)
    let con = null
    try { con = new Constrainautor(del) } catch (e) { /* degenerate: keep the plain triangulation, trimmed below */ }
    if (con) for (let i = 0; i < nLoop; i++) try { con.constrainOne(i, (i + 1) % nLoop) } catch (e) { /* collinear */ }

    // vertices on both sides: loop points reuse the crossings' positions; grid points are new
    const fIds = new Array(all.length), bIds = new Array(all.length)
    for (let i = 0; i < all.length; i++) {
      let p
      if (i < nLoop) p = loopPts[ids[i]]
      else {
        const [u, v] = all[i]
        p = [nx * w + ux * u + vx * v, ny * w + uy * u + vy * v, nz * w + uz * u + vz * v]
      }
      fIds[i] = front.vert(p[0], p[1], p[2], -nx, -ny, -nz, 0)
      bIds[i] = back.vert(p[0], p[1], p[2], nx, ny, nz, 0)
    }
    // keep the triangles inside the loop (the hull of a nearly convex loop bulges past it in places).
    // A triangle made only of outline points is inside exactly when, taken in outline order, it turns the same
    // way as the outline; one with a grid point is judged by its centroid, which is never near the edge.
    let area2 = 0
    for (let i = 0, j = nLoop - 1; i < nLoop; j = i++) area2 += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
    const turn = (i, j, k) => (all[j][0] - all[i][0]) * (all[k][1] - all[i][1]) - (all[j][1] - all[i][1]) * (all[k][0] - all[i][0])
    const T = del.triangles
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t], b = T[t + 1], c = T[t + 2]
      if (a < nLoop && b < nLoop && c < nLoop) {
        const [i, j, k] = [a, b, c].sort((x, y) => x - y)
        const tr = turn(i, j, k)
        if (tr === 0 || Math.sign(tr) !== Math.sign(area2)) continue
      } else {
        const cu = (all[a][0] + all[b][0] + all[c][0]) / 3, cv = (all[a][1] + all[b][1] + all[c][1]) / 3
        if (!inside(cu, cv)) continue
      }
      // Delaunator's triangles turn clockwise in (u, v), and u × v = n: reversed, they face +n, the back side's cap
      back.tri(bIds[a], bIds[c], bIds[b])
      front.tri(fIds[a], fIds[b], fIds[c])
    }
  }
}

/** bounding box of a mesh's positions */
export function bounds(m) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], m.pos[i + k])
      hi[k] = Math.max(hi[k], m.pos[i + k])
    }
  }
  return { lo, hi }
}

/** a reduced point set for the physics hull: the mesh's points, thinned on a grid */
export function hullPoints(m, cell = 0.004) {
  const seen = new Map()
  const out = []
  const { pos } = m
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${Math.round(pos[i] / cell)},${Math.round(pos[i + 1] / cell)},${Math.round(pos[i + 2] / cell)}`
    if (seen.has(key)) continue
    seen.set(key, 1)
    out.push(pos[i], pos[i + 1], pos[i + 2])
  }
  return new Float32Array(out)
}

/**
 * The vertices of a convex polytope given as half-spaces a·p >= b (each [ax, ay, az, b]): every point where three
 * planes meet that lies inside all the others. A piece's collider is this shape: the loaf's box cut by every plane
 * the knife has taken through it, which gives the physics a few clean faces rather than thousands of small ones.
 */
export function polytope(planes) {
  const out = []
  const n = planes.length
  const inside = (x, y, z) => planes.every(([a, b, c, d]) => a * x + b * y + c * z >= d - 1e-7)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const [a1, b1, c1, d1] = planes[i], [a2, b2, c2, d2] = planes[j], [a3, b3, c3, d3] = planes[k]
        const det = a1 * (b2 * c3 - c2 * b3) - b1 * (a2 * c3 - c2 * a3) + c1 * (a2 * b3 - b2 * a3)
        if (Math.abs(det) < 1e-9) continue
        const x = (d1 * (b2 * c3 - c2 * b3) - b1 * (d2 * c3 - c2 * d3) + c1 * (d2 * b3 - b2 * d3)) / det
        const y = (a1 * (d2 * c3 - c2 * d3) - d1 * (a2 * c3 - c2 * a3) + c1 * (a2 * d3 - d2 * a3)) / det
        const z = (a1 * (b2 * d3 - d2 * b3) - b1 * (a2 * d3 - d2 * a3) + d1 * (a2 * b3 - b2 * a3)) / det
        if (!inside(x, y, z)) continue
        if (out.some((p) => Math.abs(p[0] - x) + Math.abs(p[1] - y) + Math.abs(p[2] - z) < 1e-6)) continue
        out.push([x, y, z])
      }
    }
  }
  return out.length >= 4 ? new Float32Array(out.flat()) : null
}
