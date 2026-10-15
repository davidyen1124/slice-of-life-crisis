// Rigid-body physics with Rapier, in real units: metres, kilograms, seconds, g = 9.81 m/s².
// Each piece is a convex hull of its exact cut shape with the castella's density; the board and the table hold
// them up; the knife's blade is a kinematic body that pushes slices apart and over.
import RAPIER from '@dimforge/rapier3d-compat'
import { BOARD, TABLE_Y, PAPER_Y } from './stage.js'
import { DENSITY } from './castella.js'

export const STEP = 1 / 120

// collision groups: (membership << 16) | filter
const G_STATIC = 0x0001, G_PIECE = 0x0002, G_KNIFE = 0x0004
const groups = (member, filter) => (member << 16) | filter
const ZERO = { x: 0, y: 0, z: 0 }
const SMALL = 0.008 // kg: under this a piece is a crumb or a chunk, not a slice

export class Physics {
  async init() {
    // this Rapier build's loader still calls its WASM initialiser the old way and says so; that note is not ours
    const warn = console.warn
    console.warn = (...a) => { if (!String(a[0]).includes('deprecated parameters for the initialization function')) warn(...a) }
    try { await RAPIER.init() } finally { console.warn = warn }
    this.R = RAPIER
    const world = (this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }))
    world.timestep = STEP
    const ip = world.integrationParameters
    // most things here are a few centimetres across: tighten the tolerances to suit
    ip.lengthUnit = 0.04
    ip.numSolverIterations = 6
    // Rapier's contacts are springs whose stiffness goes with the lighter body's mass: at the default 30 Hz a crumb
    // with a slice resting on it sinks millimetres into the board, and the spring rocks it. Twice as stiff, it holds
    ip.contact_natural_frequency = 60
    this.events = new RAPIER.EventQueue(true)
    this.byCollider = new Map() // collider handle -> piece
    this.hit = new Map() // piece -> the strongest contact it felt this step

    // the board (its top carries the washi), and the table it stands on
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(BOARD.L / 2, BOARD.T / 2, BOARD.W / 2)
        .setTranslation(0, PAPER_Y - BOARD.T / 2, 0)
        .setFriction(0.7)
        .setCollisionGroups(groups(G_STATIC, G_PIECE))
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(3, 0.02, 3)
        .setTranslation(0, TABLE_Y - 0.02, 0)
        .setFriction(0.8)
        .setCollisionGroups(groups(G_STATIC, G_PIECE))
    )

    // the knife's blade, a thin slab in the knife's own frame (edge along +x at y = 0, spine at y = 3.4 cm)
    this.knifeBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0))
    this.knifeCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.135, 0.017, 0.0008)
        .setTranslation(0.135, 0.017, 0)
        .setFriction(0.25),
      this.knifeBody
    )
    this.setKnife(false)
  }

  /** the blade touches the cake only while it cuts. Not with setEnabled: a disabled collider on a kinematic body
   *  still makes contacts here, so the resting knife held whatever fell onto it awake, jostling, for good */
  setKnife(on) {
    if (this.knifeOn === on) return
    this.knifeOn = on
    this.knifeCollider.setCollisionGroups(groups(G_KNIFE, on ? G_PIECE : 0))
  }

  /** a dynamic body for a piece, at the pose of the loaf frame it was cut in */
  addPiece(piece, pos, rot, linvel, angvel) {
    const R = this.R
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .setLinearDamping(0.05)
        .setAngularDamping(0.35)
        .setCanSleep(true)
        // a crumb of a gram or two wedged among pieces fifty times heavier never settles at the solver's usual
        // effort: it rocks and pops, and keeps the whole pile awake. Its island gets more iterations
        .setAdditionalSolverIterations(piece.mass < SMALL ? 10 : 0)
    )
    // its exact faces, each begun at the corner from which Rapier rests the most of it on things (see polytopeMesh);
    // a hull of its corners begins them anywhere
    const shape = piece.shape()
    let desc = (shape && R.ColliderDesc.convexMesh(shape.pos, shape.idx)) || R.ColliderDesc.convexHull(piece.hull())
    if (!desc) {
      const b = piece.geometry.boundingBox
      desc = R.ColliderDesc.cuboid((b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2)
        .setTranslation((b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2)
    }
    desc
      .setDensity(DENSITY)
      .setFriction(0.78)
      .setRestitution(0.0)
      .setCollisionGroups(groups(G_PIECE, G_STATIC | G_PIECE | G_KNIFE))
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(Math.max(0.02, piece.mass * 9.81 * 2.2))
    const collider = this.world.createCollider(desc, body)
    this.byCollider.set(collider.handle, piece)
    if (linvel) body.setLinvel(linvel, true)
    if (angvel) body.setAngvel(angvel, true)
    piece.body = body
    piece.collider = collider
    // how far its surface lies from its middle, to turn a change of spin into a speed
    const b = piece.geometry.boundingBox
    piece.reach = b.max.distanceTo(b.min) / 2
    return body
  }

  removePiece(piece) {
    if (piece.collider) this.byCollider.delete(piece.collider.handle)
    if (piece.body) this.world.removeRigidBody(piece.body)
    piece.body = null
    piece.collider = null
  }

  /**
   * step the world; a piece jolted by a contact is passed to onImpact with how much the step changed its motion (m/s).
   * That change, not the contact force, is what a landing is: a crumb with a loaf resting on it bears a large force
   * every step, yet nothing happens to it
   */
  step(onImpact) {
    for (const piece of this.byCollider.values()) {
      const b = piece.body
      if (b.isSleeping()) { piece.v0 = ZERO; piece.w0 = ZERO }
      else { piece.v0 = b.linvel(); piece.w0 = b.angvel() }
    }
    this.world.step(this.events)
    const hit = this.hit
    hit.clear()
    this.events.drainContactForceEvents((e) => {
      const f = e.totalForceMagnitude()
      for (const [h, sign] of [[e.collider1(), 1], [e.collider2(), -1]]) {
        const piece = this.byCollider.get(h)
        if (!piece || !piece.body) continue
        const was = hit.get(piece)
        if (was && was.f >= f) continue
        const dir = e.maxForceDirection()
        hit.set(piece, { f, dir: { x: dir.x * sign, y: dir.y * sign, z: dir.z * sign } })
      }
    })
    for (const [piece, { dir }] of hit) {
      const v = piece.body.linvel(), w = piece.body.angvel(), v0 = piece.v0, w0 = piece.w0
      const dv = Math.hypot(v.x - v0.x, v.y - v0.y, v.z - v0.z) + Math.hypot(w.x - w0.x, w.y - w0.y, w.z - w0.z) * piece.reach
      onImpact(piece, dv, dir)
    }
  }
}
