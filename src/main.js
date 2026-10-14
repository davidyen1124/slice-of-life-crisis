// 長崎カステラ: a loaf of castella on a hinoki board, to be sliced with a finger.
import * as THREE from 'three'
import { Stage, PAPER_Y, TABLE_Y } from './stage.js'
import { Physics, STEP } from './physics.js'
import { Piece, LOAF, MIN_PIECE, LOAF_BOX } from './castella.js'
import { Knife, pose, BLADE } from './knife.js'
import { Crumbs } from './crumbs.js'
import { Sound } from './sound.js'
import { Input } from './input.js'

const params = new URLSearchParams(location.search)
const QA = params.has('qa')
const quality = params.get('q') || detectQuality()
const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)

const $ = (id) => document.getElementById(id)
const canvas = $('scene')
const stage = new Stage(canvas, { quality, qa: QA })
const physics = new Physics()
const sound = new Sound()
const raycaster = new THREE.Raycaster()

let pieces = []
let knife = null
let crumbs = null
let job = null
const queue = []
let grab = null
let poke = null
let cuts = 0
let ready = false
let lastFrame = performance.now()
const view = { az: 0, el: 0, zoom: 1 }
const perf = { t: 0, n: 0, scale: 1 }

boot().catch((e) => {
  console.error(e)
  fail('This page needs WebGL 2.')
})

async function boot() {
  if (!canvas.getContext('webgl2')) throw new Error('no webgl2')
  const bar = $('bar')
  await Promise.all([physics.init(), stage.load((p) => (bar.style.transform = `scaleX(${p})`))])
  knife = new Knife(stage.meshes, stage.tex)
  stage.scene.add(knife.object)
  crumbs = new Crumbs(stage.scene)
  stage.resize()
  newLoaf(false)
  // compile every shader now, so the first cut does not stutter
  await stage.renderer.compileAsync(stage.scene, stage.camera)
  // the mincho must be in before the page shows, but a slow font server should not hold it up for long
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))])
  for (let i = 0; i < 3; i++) frame(performance.now(), true)
  setupUI()
  new Input(canvas, gestures)
  // debugging switches
  if (params.has('nodof')) stage.finish.uniforms.uTaps.value = 0
  if (params.has('noshadow')) stage.renderer.shadowMap.enabled = false
  if (params.has('nocake')) pieces.forEach((p) => (p.object.visible = false))
  // fit the picture whenever the window, the visible viewport (a phone's toolbars) or the canvas itself changes
  let pending = 0
  const refit = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => stage.resize()) }
  window.addEventListener('resize', refit)
  window.visualViewport?.addEventListener('resize', refit)
  new ResizeObserver(refit).observe(canvas)
  ready = true
  requestAnimationFrame(() => document.body.classList.add('ready'))
  lastFrame = performance.now()
  requestAnimationFrame(loop)
}

function fail(msg) {
  const p = document.createElement('p')
  p.className = 'nogl'
  p.textContent = msg
  document.body.appendChild(p)
  $('loader').style.display = 'none'
}

function detectQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches
  const mem = navigator.deviceMemory || 8
  const cores = navigator.hardwareConcurrency || 8
  if (coarse && (mem <= 3 || cores <= 4)) return 'low'
  return coarse ? 'mid' : 'high'
}

// ------------------------------------------------------------------------------------------------- the loaf
function newLoaf(drop) {
  for (const p of [...pieces]) removePiece(p)
  crumbs?.clear()
  queue.length = 0
  if (job) endJob(true)
  const g = stage.meshes.castella.geometry
  const n = g.attributes.position.count
  const col = g.attributes.color
  const mesh = {
    pos: new Float32Array(g.attributes.position.array),
    nrm: new Float32Array(g.attributes.normal.array),
    skin: Float32Array.from({ length: n }, (_, i) => (col ? col.getX(i) : 0)),
    idx: Uint32Array.from(g.index.array),
  }
  const piece = new Piece(mesh, LOAF_BOX, stage.tex)
  addPiece(piece, new THREE.Vector3(0, PAPER_Y + (drop ? 0.045 : 0.00005), 0), new THREE.Quaternion())
  cuts = 0
  updateCount()
}

function addPiece(piece, pos, rot, v, w) {
  piece.object.position.copy(pos)
  piece.object.quaternion.copy(rot)
  piece.object.updateMatrixWorld()
  stage.scene.add(piece.object)
  physics.addPiece(piece, pos, rot, v, w)
  pieces.push(piece)
}

function removePiece(piece) {
  stage.scene.remove(piece.object)
  physics.removePiece(piece)
  piece.dispose()
  pieces = pieces.filter((p) => p !== piece)
  if (grab?.piece === piece) grab = null
  if (poke?.piece === piece) poke = null
}

// ---------------------------------------------------------------------------------------------- the loop
let paused = false
function loop(now) {
  if (!paused) frame(now)
  requestAnimationFrame(loop)
}

const prof = params.has('prof') ? { t0: performance.now(), n: 0, worst: 0 } : null
function frame(now, warm = false) {
  if (prof && !warm) {
    prof.n++
    prof.worst = Math.max(prof.worst, now - lastFrame)
    if (now - prof.t0 > 2000) {
      console.log(`[prof] ${((now - prof.t0) / prof.n).toFixed(1)} ms/frame, worst ${prof.worst.toFixed(0)} ms, ${stage.rt.width}x${stage.rt.height}`)
      prof.t0 = now; prof.n = 0; prof.worst = 0
    }
  }
  let dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
  lastFrame = now
  if (QA || warm) dt = 1 / 60
  // the knife moves first, then the world catches up with it
  if (job) runJob(dt)
  else if (queue.length) beginJob(queue.shift())
  stepPhysics(dt)
  syncPieces(dt)
  crumbs.update(dt)
  easeView(dt)
  stage.updateCamera()
  stage.render(dt)
  if (!QA && !warm) adapt(dt)
}

let acc = 0
function stepPhysics(dt) {
  acc += dt
  let n = 0
  const kp = knife.object.position, kq = knife.object.quaternion
  physics.knifeBody.setNextKinematicTranslation({ x: kp.x, y: kp.y, z: kp.z })
  physics.knifeBody.setNextKinematicRotation({ x: kq.x, y: kq.y, z: kq.z, w: kq.w })
  while (acc >= STEP && n < 6) {
    if (grab) pull()
    physics.step(onImpact)
    acc -= STEP
    n++
  }
  if (n === 6) acc = 0
}

function syncPieces(dt) {
  for (const p of pieces) {
    const t = p.body.translation(), r = p.body.rotation()
    p.object.position.set(t.x, t.y, t.z)
    p.object.quaternion.set(r.x, r.y, r.z, r.w)
    p.object.updateMatrixWorld()
    p.updateGive(dt, DOWN)
    // a piece that falls off the table altogether is gone
    if (p.body.worldCom().y < -0.3) removePiece(p)
  }
}

/** a landing: squash the sponge along the force, and let it be heard */
const _a = new THREE.Vector3(), _qi = new THREE.Quaternion()
function onImpact(piece, force, dir) {
  const dv = (force * STEP) / piece.mass
  if (dv < 0.06) return
  const s = piece.squash
  _a.set(dir.x, dir.y, dir.z).applyQuaternion(_qi.copy(piece.object.quaternion).invert()).normalize()
  const [lo, hi] = piece.extent(_a)
  const L = Math.max(0.01, hi - lo)
  // the contact is on the side the force pushes away from
  s.axis.copy(_a)
  const c = piece.centroid
  const cd = c[0] * _a.x + c[1] * _a.y + c[2] * _a.z
  s.origin.set(c[0], c[1], c[2]).addScaledVector(_a, lo - cd)
  s.v += Math.min(4, (dv / L) * 0.16)
  const now = performance.now()
  if (dv > 0.14 && now - (piece.lastThud || 0) > 180) {
    piece.lastThud = now
    sound.thud(Math.min(1, dv / 0.6) * Math.min(1, piece.mass / 0.03 + 0.3))
  }
}

// ----------------------------------------------------------------------------------------------- cutting
/**
 * A cut: the plane through the stroke, straight down. The knife comes over, touches the crust and presses it in,
 * breaks through, saws down to the board, knocks it, flicks the slice away and lifts.
 */
function planCut(p0, p1) {
  const dir = new THREE.Vector3().subVectors(p1, p0).setY(0)
  if (dir.length() < 0.012) return null
  dir.normalize()
  const n = new THREE.Vector3(dir.z, 0, -dir.x)
  const w = n.dot(p0)
  const t0 = dir.dot(p0), t1 = dir.dot(p1)
  const hit = []
  let tMin = Infinity, tMax = -Infinity, top = -Infinity, bottom = Infinity
  for (const p of pieces) {
    if (grab?.piece === p) continue
    const q = p.object.quaternion, T = p.object.position
    const qi = _qi.copy(q).invert()
    const nl = n.clone().applyQuaternion(qi)
    const [lo, hi] = p.extent(nl)
    const wl = w - n.dot(T)
    if (!(lo < wl - 0.0005 && hi > wl + 0.0005)) continue
    const dl = dir.clone().applyQuaternion(qi)
    const [a, b] = p.extent(dl)
    const off = dir.dot(T)
    if (b + off < Math.min(t0, t1) - 0.02 || a + off > Math.max(t0, t1) + 0.02) continue
    const ul = UP.clone().applyQuaternion(qi)
    const [ylo, yhi] = p.extent(ul)
    hit.push(p)
    tMin = Math.min(tMin, a + off)
    tMax = Math.max(tMax, b + off)
    top = Math.max(top, yhi + T.y)
    bottom = Math.min(bottom, ylo + T.y)
  }
  if (!hit.length) return null
  return { n, w, dir, tMin, tMax, top, bottom: Math.max(TABLE_Y, bottom), pieces: hit, t: 0, phase: 'travel' }
}

function beginJob(j) {
  // re-check against the pieces as they are now (an earlier cut may have moved them)
  const fresh = planCut(j.p0, j.p1)
  if (!fresh) return
  job = Object.assign(fresh, { p0: j.p0, p1: j.p1 })
  // which way round to hold the knife: from the far side, so the handle never stands between us and the cut
  const heelA = job.dir.clone().multiplyScalar(job.tMin - 0.05)
  const heelB = job.dir.clone().multiplyScalar(job.tMax + 0.05)
  const base = job.n.clone().multiplyScalar(job.w)
  heelA.add(base); heelB.add(base)
  const sa = heelA.clone().setY(job.top).project(stage.camera), sb = heelB.clone().setY(job.top).project(stage.camera)
  const scoreA = sa.y + 0.4 * sa.x, scoreB = sb.y + 0.4 * sb.x
  job.along = scoreA >= scoreB ? job.dir.clone() : job.dir.clone().negate()
  job.heel = scoreA >= scoreB ? heelA : heelB
  job.heel.y = 0
  job.from = { p: knife.object.position.clone(), q: knife.object.quaternion.clone() }
  job.speed = queue.length ? 1.5 : 1
  job.lean = 0
  job.dent = 0
}

const PRESS = 0.0046 // how far the crust gives before the edge breaks through it
const PH = { travel: 0.36, descend: 0.11, press: 0.2, slice: 0.46, flick: 0.22, hold: 0.08, lift: 0.26, home: 0.42 }
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = (x) => 1 - Math.pow(1 - x, 3)
const _pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() }
const _lean = new THREE.Quaternion()
const _o = new THREE.Vector3()

function knifeAt(edgeY, saw = 0, lean = 0) {
  _o.copy(job.heel).addScaledVector(job.along, saw)
  _o.y = edgeY
  pose(_o, job.along, UP, _pose)
  _lean.setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean)
  _pose.q.multiply(_lean)
  return _pose
}

function runJob(dt) {
  const j = job
  j.t += (dt * j.speed) / PH[j.phase]
  const k = Math.min(1, j.t)
  const above = j.top + 0.035
  let P
  switch (j.phase) {
    case 'travel': {
      const e = ease(k)
      const to = knifeAt(above)
      P = { p: j.from.p.clone().lerp(to.p, e), q: j.from.q.clone().slerp(to.q, e) }
      P.p.y += Math.sin(Math.PI * e) * 0.06
      break
    }
    case 'descend':
      P = knifeAt(above + (j.top - above) * easeOut(k))
      break
    case 'press': {
      const y = j.top - PRESS * k * k
      P = knifeAt(y, 0.004 * Math.sin(k * Math.PI))
      setDent(j.pieces, j.top - y)
      break
    }
    case 'slice': {
      const y0 = j.top - PRESS
      const y = y0 + (j.bottom - y0) * ease(k)
      P = knifeAt(y, 0.012 * Math.sin(k * Math.PI * 2))
      // the crust springs back once broken, but the blade still drags the sponge a little
      setDent(j.pieces, Math.max(0.0007, PRESS * Math.exp(-j.t * 6)) * (1 - k * 0.6))
      if (Math.random() < 0.55) dropCrumbs(1)
      break
    }
    case 'flick':
      P = knifeAt(j.bottom + 0.012 * easeOut(k), 0, j.lean * ease(k))
      setDent(j.pieces, 0)
      break
    case 'hold':
      P = knifeAt(j.bottom + 0.012, 0, j.lean)
      break
    case 'lift': {
      const e = ease(k)
      P = knifeAt(j.bottom + 0.012 + (j.top + 0.06 - j.bottom - 0.012) * e, 0, j.lean * (1 - e))
      if (P.p.y > j.top + 0.004) physics.knifeCollider.setEnabled(false)
      break
    }
    case 'home': {
      const e = ease(k)
      P = { p: j.from.p.clone().lerp(knife.rest.p, e), q: j.from.q.clone().slerp(knife.rest.q, e) }
      P.p.y += Math.sin(Math.PI * e) * 0.04
      break
    }
  }
  knife.set(P.p, P.q)
  if (j.t < 1) return
  // the next phase
  j.t = 0
  switch (j.phase) {
    case 'travel': j.phase = 'descend'; break
    case 'descend': j.phase = 'press'; break
    case 'press':
      pierce(j)
      j.phase = 'slice'
      sound.saw(PH.slice / j.speed)
      break
    case 'slice':
      sound.tok(0.9)
      if (navigator.vibrate && !QA) navigator.vibrate(6)
      j.phase = 'flick'
      break
    case 'flick': j.phase = 'hold'; break
    case 'hold': j.phase = 'lift'; break
    case 'lift':
      physics.knifeCollider.setEnabled(false)
      if (queue.length) { endJob(); break }
      j.phase = 'home'
      j.from = { p: knife.object.position.clone(), q: knife.object.quaternion.clone() }
      break
    case 'home':
      endJob()
      break
  }
}

function endJob(abort = false) {
  if (abort) {
    knife.set(knife.rest.p, knife.rest.q)
    if (job) setDent(job.pieces, 0)
  }
  physics.knifeCollider.setEnabled(false)
  job = null
}

function setDent(list, d) {
  for (const p of list) {
    if (!p.body) continue
    const qi = _qi.copy(p.object.quaternion).invert()
    const nl = job.n.clone().applyQuaternion(qi)
    const wl = job.w - job.n.dot(p.object.position)
    p.uniforms.uKnife.value.set(nl.x, nl.y, nl.z, wl)
    p.knifeDent = d
  }
}

/** the edge breaks through: every piece under the blade becomes two, exactly along the plane */
function pierce(j) {
  sound.crunch(1)
  const made = []
  let small = null
  for (const p of j.pieces) {
    if (!p.body) continue
    const qi = _qi.copy(p.object.quaternion).invert()
    const nl = j.n.clone().applyQuaternion(qi)
    const wl = j.w - j.n.dot(p.object.position)
    const r = p.cut(nl, wl)
    if (!r) continue
    const T = p.object.position.clone(), Q = p.object.quaternion.clone()
    const v = p.body.linvel(), w = p.body.angvel()
    const com = p.body.worldCom()
    const spin = new THREE.Vector3(w.x, w.y, w.z)
    const pieceVel = (piece) => {
      const c = new THREE.Vector3(...piece.centroid).applyQuaternion(Q).add(T)
      const rel = c.sub(new THREE.Vector3(com.x, com.y, com.z))
      return new THREE.Vector3(v.x, v.y, v.z).add(spin.clone().cross(rel))
    }
    if (r.vf < MIN_PIECE || r.vb < MIN_PIECE) {
      // a shaving: the thin side crumbles away and the piece goes on without it
      const front = r.vf >= r.vb
      const keep = front ? r.front : r.back
      const lost = Math.min(r.vf, r.vb)
      removePiece(p)
      const np = new Piece(keep, [...p.planes, front ? [nl.x, nl.y, nl.z, wl] : [-nl.x, -nl.y, -nl.z, -wl]], stage.tex)
      addPiece(np, T, Q, pieceVel(np), spin)
      made.push(np)
      shave(j, lost)
      continue
    }
    removePiece(p)
    for (const [mesh, plane] of [[r.front, [nl.x, nl.y, nl.z, wl]], [r.back, [-nl.x, -nl.y, -nl.z, -wl]]]) {
      const np = new Piece(mesh, [...p.planes, plane], stage.tex)
      addPiece(np, T, Q, pieceVel(np), spin)
      made.push(np)
      if (!small || np.volume < small.volume) small = np
    }
    cuts++
  }
  j.pieces = made
  setDent(made, PRESS)
  physics.knifeCollider.setEnabled(true)
  // flick the smaller piece away; a thin slice goes over onto its side, a thick one only parts a little
  if (small) {
    const c = new THREE.Vector3(...small.centroid).applyQuaternion(small.object.quaternion).add(small.object.position)
    const side = Math.sign(j.n.dot(c) - j.w) || 1
    const nl = j.n.clone().applyQuaternion(_qi.copy(small.object.quaternion).invert())
    const [lo, hi] = small.extent(nl)
    const thick = hi - lo
    const Z = new THREE.Vector3().crossVectors(j.along, UP)
    const sign = Math.sign(Z.dot(j.n) * side) || 1
    j.lean = sign * THREE.MathUtils.degToRad(thick < 0.031 ? 32 : 6)
    j.thin = thick < 0.031
  }
  crustFlakes(j, made)
  updateCount()
}

// --------------------------------------------------------------------------------------------- crumbs
function crustFlakes(j, made) {
  // flakes of the top crust, knocked loose along the cut, settle on either side of it
  const n = 6 + Math.floor(Math.random() * 5)
  for (let i = 0; i < n; i++) {
    const t = j.tMin + Math.random() * (j.tMax - j.tMin)
    const side = Math.random() < 0.5 ? -1 : 1
    const p = j.n.clone().multiplyScalar(j.w + side * (0.0012 + Math.random() * 0.004)).addScaledVector(j.dir, t)
    // find the piece on that side and the top of it there
    raycaster.set(new THREE.Vector3(p.x, j.top + 0.05, p.z), DOWN)
    const hit = raycaster.intersectObjects(made.map((m) => m.object), false)[0]
    if (!hit || hit.point.y < j.top - 0.012) continue
    const piece = hit.object.userData.piece
    const local = piece.object.worldToLocal(hit.point.clone().addScaledVector(UP, 0.0003))
    crumbs.add(hit.point, new THREE.Vector3(), 'crust', 0.0005 + Math.random() * 0.0009, { piece, local })
  }
}

function dropCrumbs(n) {
  const j = job
  if (!j) return
  for (let i = 0; i < n; i++) {
    // where the blade comes out of the sponge, at either end of the cut, somewhere down its height
    const end = Math.random() < 0.5 ? j.tMin : j.tMax
    const out = end === j.tMin ? -1 : 1
    const y = j.bottom + 0.004 + Math.random() * Math.max(0.004, j.top - j.bottom - 0.006)
    const side = (Math.random() - 0.5) * 0.004
    const p = j.n.clone().multiplyScalar(j.w + side).addScaledVector(j.dir, end + out * 0.0015)
    p.y = y
    const v = j.dir.clone().multiplyScalar(out * (0.03 + Math.random() * 0.09)).addScaledVector(j.n, (Math.random() - 0.5) * 0.08)
    v.y = Math.random() * 0.05
    const kind = y > j.top - 0.004 ? 'crust' : y < j.bottom + 0.003 && Math.random() < 0.4 ? 'sugar' : 'crumb'
    crumbs.add(p, v, kind, 0.0004 + Math.random() * 0.0009)
  }
}

function shave(j, volume) {
  const n = Math.min(40, 6 + Math.round(volume * 2e7))
  for (let i = 0; i < n; i++) {
    const t = j.tMin + Math.random() * (j.tMax - j.tMin)
    const p = j.n.clone().multiplyScalar(j.w).addScaledVector(j.dir, t)
    p.y = j.bottom + 0.003 + Math.random() * (j.top - j.bottom - 0.004)
    const v = j.n.clone().multiplyScalar((Math.random() - 0.5) * 0.12)
    v.y = Math.random() * 0.04
    crumbs.add(p, v, Math.random() < 0.2 ? 'crust' : 'crumb', 0.0005 + Math.random() * 0.001)
  }
}

// ----------------------------------------------------------------------------------- lifting a piece
const _ap = new THREE.Vector3()
function pull() {
  const b = grab.piece.body
  if (!b) { grab = null; return }
  const t = b.translation(), r = b.rotation()
  _ap.copy(grab.local).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z))
  const v = b.linvel(), w = b.angvel(), c = b.worldCom()
  const rel = new THREE.Vector3(_ap.x - c.x, _ap.y - c.y, _ap.z - c.z)
  const vp = new THREE.Vector3(v.x, v.y, v.z).add(new THREE.Vector3(w.x, w.y, w.z).cross(rel))
  const m = b.mass()
  const om = 22, ze = 0.95
  const F = grab.target.clone().sub(_ap).multiplyScalar(om * om).addScaledVector(vp, -2 * ze * om).multiplyScalar(m)
  F.y += m * 9.81
  const fmax = m * 80
  if (F.length() > fmax) F.setLength(fmax)
  b.applyImpulseAtPoint({ x: F.x * STEP, y: F.y * STEP, z: F.z * STEP }, { x: _ap.x, y: _ap.y, z: _ap.z }, true)
}

function rayAt(x, y) {
  const { w, h } = stage.size
  raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), stage.camera)
  return raycaster.ray
}

function pick(x, y) {
  rayAt(x, y)
  const hit = raycaster.intersectObjects(pieces.map((p) => p.object), false)[0]
  if (!hit) return null
  return { piece: hit.object.userData.piece, point: hit.point.clone() }
}

function onPlane(x, y, h) {
  const ray = rayAt(x, y)
  if (Math.abs(ray.direction.y) < 1e-4) return null
  const t = (h - ray.origin.y) / ray.direction.y
  if (t < 0) return null
  return ray.origin.clone().addScaledVector(ray.direction, t)
}

// ----------------------------------------------------------------------------------------- gestures
const trail = makeTrail()
const gestures = {
  wake: () => sound.wake(),
  pick: (x, y) => pick(x, y),
  strokeStart(points) { trail.draw(points) },
  strokeMove(points) { trail.draw(points) },
  strokeCancel() { trail.fade() },
  strokeEnd(points) {
    const line = strokeToLine(points)
    if (!line) { trail.fade(); return }
    trail.snap(line)
    if (job || queue.length) { if (queue.length < 3) queue.push(line) }
    else beginJob(line)
  },
  pokeStart(hit) {
    const p = hit.piece
    poke = { piece: p }
    p.poke.point.copy(p.object.worldToLocal(hit.point.clone()))
    p.poke.target = 0.0042
  },
  pokeEnd() {
    if (poke?.piece) poke.piece.poke.target = 0
    poke = null
  },
  grabStart(hit, x, y) {
    const p = hit.piece
    if (job && job.pieces.includes(p)) return
    const local = p.object.worldToLocal(hit.point.clone())
    grab = { piece: p, local, height: Math.max(hit.point.y + 0.035, 0.07), target: hit.point.clone() }
    p.body.setAngularDamping(7)
    p.body.wakeUp()
    canvas.classList.add('grab')
    this.grabMove(x, y)
  },
  grabMove(x, y) {
    if (!grab) return
    const p = onPlane(x, y, grab.height)
    if (!p) return
    // keep it over the table and within reach
    const r = Math.hypot(p.x, p.z)
    if (r > 0.42) { p.x *= 0.42 / r; p.z *= 0.42 / r }
    grab.target.copy(p)
  },
  grabEnd() {
    if (grab?.piece.body) grab.piece.body.setAngularDamping(0.35)
    grab = null
    canvas.classList.remove('grab')
  },
  orbit(dx, dy) {
    view.az -= dx * 0.0065
    view.el = THREE.MathUtils.clamp(view.el + dy * 0.0045, -0.36, 0.55)
  },
  zoom(f) { view.zoom = THREE.MathUtils.clamp(view.zoom * f, 0.55, 1.6) },
  resetView() { view.az = 0; view.el = 0; view.zoom = 1 },
  hover(x, y) {
    if (grab) return
    canvas.classList.toggle('over', !!pick(x, y))
  },
}

const focus = { n: 0, at: new THREE.Vector3(), want: new THREE.Vector3() }
function easeView(dt) {
  const r = stage.rig
  const k = 1 - Math.exp(-10 * dt)
  r.userAz += (view.az - r.userAz) * k
  r.userEl += (view.el - r.userEl) * k
  r.userZoom += (view.zoom - r.userZoom) * k
  // the lens focuses on whatever of the cake lies at the centre of the picture
  if (focus.n++ % 4 === 0) {
    const c = stage.target.clone().project(stage.camera)
    raycaster.setFromCamera(new THREE.Vector2(c.x, c.y), stage.camera)
    const hit = raycaster.intersectObjects(pieces.map((p) => p.object), false)[0]
    focus.want.copy(hit ? hit.point : stage.target)
  }
  focus.at.lerp(focus.want, 1 - Math.exp(-6 * dt))
  r.focus.copy(focus.at)
  // closer in, a smaller aperture, as a photographer would stop down for a close-up
  stage.finish.uniforms.uBlur.value = 34 * Math.pow(THREE.MathUtils.clamp(r.userZoom, 0.5, 1.3), 1.6)
}

/** the stroke, read as a straight line on the cake: a best fit through it, at the height of what it crossed */
function strokeToLine(points) {
  if (points.length < 2) return null
  // how high the stroke ran: the top of whatever it crossed
  let h = []
  for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 12))) {
    const hit = pick(points[i].x, points[i].y)
    if (hit) h.push(hit.point.y)
  }
  const height = h.length ? h.sort((a, b) => a - b)[Math.floor(h.length / 2)] : LOAF.H * 0.6
  const pts = points.map((p) => onPlane(p.x, p.y, height)).filter(Boolean)
  if (pts.length < 2) return null
  // principal direction of the points on that plane
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length)
  let sxx = 0, sxz = 0, szz = 0
  for (const p of pts) {
    const dx = p.x - c.x, dz = p.z - c.z
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz
  }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz)
  const d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang))
  let lo = Infinity, hi = -Infinity
  for (const p of pts) {
    const t = d.dot(new THREE.Vector3(p.x - c.x, 0, p.z - c.z))
    lo = Math.min(lo, t); hi = Math.max(hi, t)
  }
  if (hi - lo < 0.015) return null
  const p0 = c.clone().addScaledVector(d, lo), p1 = c.clone().addScaledVector(d, hi)
  p0.y = p1.y = height
  if (!planCut(p0, p1)) return null
  return { p0, p1 }
}

// --------------------------------------------------------------------------------------- the stroke trail
function makeTrail() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'trail')
  Object.assign(svg.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' })
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  Object.assign(path.style, { fill: 'none', stroke: 'rgba(43,36,32,0.55)', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round', transition: 'opacity 0.5s ease' })
  svg.appendChild(path)
  document.getElementById('page').before(svg)
  let fadeT = 0
  return {
    draw(points) {
      clearTimeout(fadeT)
      path.style.transition = 'none'
      path.style.opacity = '1'
      path.setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(''))
    },
    snap(line) {
      // the cut line as the knife will take it
      const a = line.p0.clone().project(stage.camera), b = line.p1.clone().project(stage.camera)
      const { w, h } = stage.size
      const s = (v) => `${(((v.x + 1) / 2) * w).toFixed(1)},${(((1 - v.y) / 2) * h).toFixed(1)}`
      path.setAttribute('d', `M${s(a)}L${s(b)}`)
      path.style.transition = 'opacity 0.6s ease 0.25s'
      requestAnimationFrame(() => (path.style.opacity = '0'))
    },
    fade() {
      path.style.transition = 'opacity 0.3s ease'
      path.style.opacity = '0'
    },
  }
}

// -------------------------------------------------------------------------------------------- the page
const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
function kanji(n) {
  if (n < 10) return KANJI[n]
  if (n < 100) return (n >= 20 ? KANJI[Math.floor(n / 10)] : '') + '十' + KANJI[n % 10]
  return String(n)
}

function updateCount() {
  const el = $('count')
  const n = pieces.length
  const text = cuts === 0 && n === 1 ? '一棹' : `${kanji(n)}切れ`
  if (el.textContent !== text) {
    el.classList.add('bump')
    setTimeout(() => {
      el.textContent = text
      el.classList.remove('bump')
    }, 160)
  }
  $('again').hidden = cuts === 0
  if (cuts > 0) setTimeout(() => $('hint').classList.add('gone'), 2600)
}

function setupUI() {
  $('again').addEventListener('click', () => {
    sound.wake()
    newLoaf(true)
    $('hint').classList.remove('gone')
  })
  const sb = $('sound')
  sb.addEventListener('click', () => {
    sound.wake()
    const on = !sound.on
    sound.setOn(on)
    sb.setAttribute('aria-pressed', String(on))
    sb.setAttribute('aria-label', on ? 'Sound on' : 'Sound off')
  })
}

/** if the frames run long, draw fewer pixels */
function adapt(dt) {
  perf.t += dt
  perf.n++
  if (perf.t < 2.5) return
  const avg = perf.t / perf.n
  perf.t = 0
  perf.n = 0
  if (avg > 0.026 && perf.scale > 0.6) {
    perf.scale *= 0.85
    stage.dprScale = perf.scale
    stage.rtReady = false
    stage.resize()
  }
}

// ------------------------------------------------------------------------------------------------ for QA
window.__castella = {
  get ready() { return ready },
  get pieces() { return pieces.length },
  get busy() { return !!job || queue.length > 0 },
  get asleep() { return pieces.every((p) => p.body.isSleeping()) },
  get cuts() { return cuts },
  stage,
  /** screen position of a point in the scene */
  screen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(stage.camera)
    return { x: ((v.x + 1) / 2) * stage.size.w, y: ((1 - v.y) / 2) * stage.size.h }
  },
  /** cut along a world-space line on the cake (for scripted tests) */
  cutWorld(x0, z0, x1, z1) {
    const line = { p0: new THREE.Vector3(x0, LOAF.H, z0), p1: new THREE.Vector3(x1, LOAF.H, z1) }
    if (job || queue.length) queue.push(line)
    else beginJob(line)
  },
  newLoaf: () => newLoaf(true),
  /** stop the clock, and advance it by whole frames (QA only: frames are 1/60 s there) */
  pause(on = true) { paused = on },
  step(n = 1) { for (let i = 0; i < n; i++) frame(performance.now()) },
  view,
  info() {
    return pieces.map((p) => {
      const t = p.body.translation()
      return { vol: +(p.volume * 1e6).toFixed(2), y: +t.y.toFixed(4), sleeping: p.body.isSleeping() }
    })
  },
  BLADE,
}
