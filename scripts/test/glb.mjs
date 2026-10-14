// minimal GLB reader for tests: returns { name -> { pos, nrm, skin, idx } }
import fs from 'node:fs'
export function readGlb(file) {
  const buf = fs.readFileSync(file)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString())
  const binStart = 20 + jsonLen + 8
  const bin = buf.subarray(binStart)
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView]
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] * a.count
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0)
    const C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]
    const arr = new C(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * C.BYTES_PER_ELEMENT))
    if (a.normalized && C !== Float32Array) return Float32Array.from(arr, (v) => v / (C === Uint16Array ? 65535 : 255))
    return arr
  }
  const out = {}
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue
    const prim = json.meshes[node.mesh].primitives[0]
    const col = prim.attributes.COLOR_0 !== undefined ? acc(prim.attributes.COLOR_0) : null
    const pos = acc(prim.attributes.POSITION)
    const nv = pos.length / 3
    const cw = col ? col.length / nv : 0
    out[node.name] = {
      pos, nrm: acc(prim.attributes.NORMAL),
      skin: col ? Float32Array.from({ length: nv }, (_, i) => col[i * cw]) : new Float32Array(nv),
      idx: Uint32Array.from(acc(prim.indices)),
      t: node.translation, r: node.rotation,
    }
  }
  return out
}
