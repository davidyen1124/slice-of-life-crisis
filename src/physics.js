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

export class Physics {
  async init() {
    await RAPIER.init()
    this.R = RAPIER
    const world = (this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }))
    world.timestep = STEP
    const ip = world.integrationParameters
    // most things here are a few centimetres across: tighten the tolerances to suit
    ip.lengthUnit = 0.04
    ip.numSolverIterations = 6
    this.events = new RAPIER.EventQueue(true)
    this.byCollider = new Map() // collider handle -> piece

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
        .setFriction(0.25)
        .setCollisionGroups(groups(G_KNIFE, G_PIECE)),
      this.knifeBody
    )
    this.knifeCollider.setEnabled(false)
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
    )
    let desc = R.ColliderDesc.convexHull(piece.hull())
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
    return body
  }

  removePiece(piece) {
    if (piece.collider) this.byCollider.delete(piece.collider.handle)
    if (piece.body) this.world.removeRigidBody(piece.body)
    piece.body = null
    piece.collider = null
  }

  /** step the world; contact forces strong enough to squash the sponge are passed to onImpact */
  step(onImpact) {
    this.world.step(this.events)
    this.events.drainContactForceEvents((e) => {
      const f = e.totalForceMagnitude()
      const dir = e.maxForceDirection()
      for (const [h, sign] of [[e.collider1(), 1], [e.collider2(), -1]]) {
        const piece = this.byCollider.get(h)
        if (piece && piece.body) onImpact(piece, f, { x: dir.x * sign, y: dir.y * sign, z: dir.z * sign })
      }
    })
  }
}
