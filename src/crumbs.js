// Crumbs: what a knife knocks loose. Flakes of the top crust that stay where they fell on the cake, and bits of
// crumb and crust that tumble off the cut and come to rest on the washi or the board. Gravity, a little air drag,
// and a soft, grippy landing (sponge on paper does not bounce).
import * as THREE from 'three'
import { BOARD, TABLE_Y, PAPER_Y } from './stage.js'

const MAX = 900
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3()

export class Crumbs {
  constructor(scene) {
    const geo = new THREE.IcosahedronGeometry(1, 0)
    // knock the corners about so no two look the same at a glance
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + 0.5 * fract(Math.sin(i * 91.7) * 4375.5)
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k)
    }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, color: 0xffffff })
    const mesh = (this.mesh = new THREE.InstancedMesh(geo, mat, MAX))
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.setColorAt(0, new THREE.Color(1, 1, 1))
    scene.add(mesh)
    this.items = []
    this.next = 0
  }

  clear() {
    this.items.length = 0
    this.next = 0
    this.mesh.count = 0
  }

  /**
   * kind: 'crumb' (honey yellow) or 'crust' (brown flake). If `stick` is given ({ piece, local }), the crumb sits
   * on that piece and rides with it; otherwise it falls.
   */
  add(p, v, kind, size, stick = null) {
    const c = kind === 'crust'
      ? new THREE.Color().setRGB(0.3 + Math.random() * 0.1, 0.13 + Math.random() * 0.05, 0.05, THREE.SRGBColorSpace)
      : kind === 'sugar'
        ? new THREE.Color().setRGB(0.93, 0.9, 0.84, THREE.SRGBColorSpace)
        : new THREE.Color().setRGB(0.93, 0.76 + Math.random() * 0.06, 0.34 + Math.random() * 0.08, THREE.SRGBColorSpace)
    const item = {
      p: p.clone(), v: v.clone(),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40),
      size,
      flat: kind === 'crust',
      rest: false, stick,
    }
    if (this.items.length < MAX) this.items.push(item)
    else {
      this.items[this.next] = item
      this.next = (this.next + 1) % MAX
    }
    const i = this.items.indexOf(item)
    this.mesh.setColorAt(i, c)
    this.mesh.instanceColor.needsUpdate = true
  }

  /** the floor under a point: the washi/board top over the board, the table elsewhere */
  floor(x, z) {
    return Math.abs(x) < BOARD.L / 2 && Math.abs(z) < BOARD.W / 2 ? PAPER_Y : TABLE_Y
  }

  update(dt) {
    const items = this.items
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.stick) {
        const o = it.stick.piece.object
        if (!o.parent) { it.stick = null; it.rest = false; it.v.set(0, 0, 0) }
        else {
          _p.copy(it.stick.local).applyMatrix4(o.matrixWorld)
          it.p.copy(_p)
        }
      } else if (!it.rest) {
        it.v.y -= 9.81 * dt
        it.v.multiplyScalar(1 - 1.5 * dt)
        it.p.addScaledVector(it.v, dt)
        it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt
        const fl = this.floor(it.p.x, it.p.z) + it.size * 0.5
        if (it.p.y < fl) {
          it.p.y = fl
          if (Math.abs(it.v.y) < 0.25) {
            it.rest = true
            if (it.flat) it.r.set(0, it.r.y, 0)
          } else {
            it.v.y *= -0.18
            it.v.x *= 0.45
            it.v.z *= 0.45
            it.w.multiplyScalar(0.4)
          }
        }
      }
      const s = it.size
      _s.set(s, it.flat ? s * 0.45 : s, s)
      _q.setFromEuler(it.r)
      _m.compose(it.p, _q, _s)
      this.mesh.setMatrixAt(i, _m)
    }
    this.mesh.count = items.length
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

function fract(x) { return x - Math.floor(x) }
