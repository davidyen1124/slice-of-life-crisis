// The sujihiki: the model from Blender, its materials, and its poses.
// The knife's own frame: the edge runs along +x from the heel (x = 0) to the tip (x = 0.27), the spine is up (+y),
// the flats face ±z, the handle is at -x.
import * as THREE from 'three'
import { TABLE_Y } from './stage.js'

export const BLADE = { length: 0.27, height: 0.034 }

const _m = new THREE.Matrix4()
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3()

/** a pose: heel point on the edge, and the orientation from the blade's direction and its spine's direction */
export function pose(origin, along, spine, out = { p: new THREE.Vector3(), q: new THREE.Quaternion() }) {
  _x.copy(along).normalize()
  _z.crossVectors(_x, spine).normalize()
  _y.crossVectors(_z, _x).normalize()
  _m.makeBasis(_x, _y, _z)
  out.p.copy(origin)
  out.q.setFromRotationMatrix(_m)
  return out
}

export class Knife {
  constructor(meshes, tex) {
    const g = (this.object = new THREE.Group())
    const blade = meshes.knife_blade, ferrule = meshes.knife_ferrule, handle = meshes.knife_handle
    blade.material = new THREE.MeshPhysicalMaterial({ color: 0xbfc3c7, metalness: 1, roughness: 0.27, envMapIntensity: 1.8 })
    ferrule.material = new THREE.MeshPhysicalMaterial({ color: 0x110d0b, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 })
    // ho (magnolia) wood: the board's photograph, turned along the handle and tinted olive
    const wood = tex.board.clone()
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping
    wood.needsUpdate = true
    handleUV(handle.geometry)
    handle.material = new THREE.MeshStandardMaterial({ map: wood, color: 0xa79c76, roughness: 0.58 })
    for (const m of [blade, ferrule, handle]) {
      m.castShadow = true
      m.receiveShadow = true
      m.position.set(0, 0, 0)
      m.rotation.set(0, 0, 0)
      g.add(m)
    }
    // at rest: lying on its side on the table in front of the board, handle to the right, its handle and
    // its tip touching the linen, the spine toward us
    const rest = new THREE.Vector3(0.115, TABLE_Y + 0.0123, 0.152)
    const along = new THREE.Vector3(-1, -0.0445, -0.11)
    this.rest = pose(rest, along, new THREE.Vector3(0, 0, 1))
    g.position.copy(this.rest.p)
    g.quaternion.copy(this.rest.q)
  }

  set(p, q) {
    this.object.position.copy(p)
    this.object.quaternion.copy(q)
  }
}

function handleUV(geo) {
  const p = geo.attributes.position
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getY(i) - 0.023)
    uv[i * 2] = p.getX(i) * 2.2
    uv[i * 2 + 1] = a * 0.05 + 0.3
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}
