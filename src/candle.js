// The birthday candle: a slim spiral candle of ivory wax with one vermilion stripe, and a braided cotton wick that
// curls over at the tip. The same candle as The Birthday Issue's Blender scene (its geometry and its stripe are the
// same formulas), drawn here in the room's own light, plus the light of its flame on the wax.
//
// The candle's frame: its foot at the origin, +y up its length. Pushed into a piece of cake it rides with that piece
// (and is part of its rigid body, see physics.js); knocked off by the knife it is a body of its own.
import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'

export const CANDLE = {
  R: 0.0031, // m: a slim birthday candle, 6.2 mm across
  L: 0.074, // its length
  SINK: 0.016, // how deep it goes into the sponge
  WICK: 0.0085,
  DENSITY: 900, // kg/m³, paraffin
}
const FLUTES = 8
const TURNS = 3.2
const CUP = 0.0012 // depth of the melt pool at the top
const WICK_TURN = THREE.MathUtils.degToRad(35) // which way the wick curls, about the candle's axis

// Blender's axes (z up) to the scene's (y up)
const yUp = (x, y, z) => [x, z, -y]

/** the candle: 8 twisted flutes and a melted cup at the top, foot at y = 0 */
function candleGeometry() {
  const { R, L } = CANDLE
  const nt = 72, nz = 120
  const profile = []
  for (let k = 0; k <= nz; k++) profile.push([(L * k) / nz, 1])
  // a rounded shoulder, and a dip into the melt pool
  for (const [r, dz] of [[0.97, -0.0002], [0.9, -0.0005], [0.78, -0.0008], [0.6, -0.0011], [0.38, -0.0012], [0.18, -CUP]]) profile.push([L + dz, r])
  const pos = []
  for (const [z, rs] of profile) {
    const tw = (2 * Math.PI * TURNS * Math.min(z, L)) / L
    for (let i = 0; i < nt; i++) {
      const th = (2 * Math.PI * i) / nt
      const flute = 0.075 * Math.cos(FLUTES * th + tw) * (rs > 0.95 ? 1 : Math.max(0, (rs - 0.6) / 0.4))
      const r = R * (1 + flute) * rs
      pos.push(...yUp(r * Math.cos(th), r * Math.sin(th), z))
    }
  }
  const idx = []
  for (let k = 0; k < profile.length - 1; k++) {
    for (let i = 0; i < nt; i++) {
      const a = k * nt + i, b = k * nt + ((i + 1) % nt), c = (k + 1) * nt + ((i + 1) % nt), d = (k + 1) * nt + i
      idx.push(a, b, c, a, c, d)
    }
  }
  const top = pos.length / 3
  pos.push(...yUp(0, 0, L - CUP))
  const last = (profile.length - 1) * nt
  for (let i = 0; i < nt; i++) idx.push(last + i, last + ((i + 1) % nt), top)
  const foot = pos.length / 3
  pos.push(0, 0, 0)
  for (let i = 0; i < nt; i++) idx.push((i + 1) % nt, i, foot)
  return finish(pos, idx, 32)
}

/** a braided cotton wick that curls over at the tip, its foot in the melt pool */
function wickGeometry() {
  const n = 24, m = 10
  const pts = []
  for (let k = 0; k <= n; k++) {
    const t = k / n
    pts.push(new THREE.Vector3(...yUp(0.0021 * t ** 2.2, 0.0002 * Math.sin(t * 6), CANDLE.WICK * t - 0.0015)))
  }
  const BACK = new THREE.Vector3(...yUp(0, 1, 0))
  const pos = []
  for (let k = 0; k <= n; k++) {
    const tdir = pts[Math.min(k + 1, n)].clone().sub(pts[Math.max(k - 1, 0)]).normalize()
    const side = tdir.clone().cross(BACK).normalize()
    const up = side.clone().cross(tdir).normalize()
    const r = 0.00042 * (1 - 0.35 * (k / n) ** 3)
    for (let i = 0; i < m; i++) {
      const a = (2 * Math.PI * i) / m
      const braid = 1 + 0.12 * Math.sin(a * 2 + k * 1.9)
      const p = pts[k].clone().addScaledVector(side, Math.cos(a) * r * braid).addScaledVector(up, Math.sin(a) * r * braid)
      pos.push(p.x, p.y, p.z)
    }
  }
  const idx = []
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < m; i++) {
      const a = k * m + i, b = k * m + ((i + 1) % m), c = (k + 1) * m + ((i + 1) % m), d = (k + 1) * m + i
      idx.push(a, b, c, a, c, d)
    }
  }
  const tip = pos.length / 3
  const end = pts[n].clone().addScaledVector(pts[n].clone().sub(pts[n - 1]).normalize(), 0.0003)
  pos.push(end.x, end.y, end.z)
  for (let i = 0; i < m; i++) idx.push(n * m + i, n * m + ((i + 1) % m), tip)
  return finish(pos, idx, 80)
}

/** faces outward (whichever way the rings were wound), normals smooth up to a crease angle, as Blender shades it */
function finish(pos, idx, crease) {
  let vol = 0
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3]
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  const out = toCreasedNormals(g, THREE.MathUtils.degToRad(crease))
  g.dispose()
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

// ------------------------------------------------------------------------------------------------ materials

/**
 * Ivory wax, the stripe following the spiral (in the candle's own space, as in the Blender material), and wax's
 * translucency: light wraps a little way round it, and near the top it glows with the flame burning above it.
 */
function waxMaterial(tex, uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0 })
  m.customProgramCacheKey = () => 'candle-wax-v1'
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { tWax: { value: tex } })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\nvObjN = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform sampler2D tWax;
        uniform float uGlow;
        uniform float uLen;
        varying vec3 vObj;
        varying vec3 vObjN;
        float waxWrap = 0.45;
        vec3 lin(vec3 c) { return c * c * (c * 0.2848 + 0.7152); }`
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        {
          // the wax photograph, box-projected in the candle's space (2 cm to a repeat), softly blended between faces
          vec3 w = pow(abs(normalize(vObjN)), vec3(4.0));
          w /= w.x + w.y + w.z;
          vec3 q = vObj * 50.0;
          vec3 wax = texture2D(tWax, q.zy).rgb * w.x + texture2D(tWax, q.xz).rgb * w.y + texture2D(tWax, q.xy).rgb * w.z;
          vec3 col = wax * lin(vec3(1.0, 0.965, 0.902));
          // the stripe: one turn of the spiral every 1/3.2 of the length, fading where the top has melted
          float ph = fract(atan(-vObj.z, vObj.x) / 6.2831853 + vObj.y * 3.2 / uLen);
          float stripe = 1.0 - smoothstep(0.035, 0.05, abs(ph - 0.5));
          stripe *= 1.0 - smoothstep(uLen - 0.004, uLen - 0.0015, vObj.y);
          diffuseColor.rgb = mix(col, lin(vec3(0.71, 0.22, 0.169)), stripe);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // the flame's light, carried down into the wax below it
        totalEmissiveRadiance += vec3(1.0, 0.56, 0.22) * uGlow * 0.55 * exp(-(uLen - vObj.y) / 0.0065) * diffuseColor.rgb;`
      )
      .replace(
        '#include <lights_physical_pars_fragment>',
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
          'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + waxWrap ) / ( 1.0 + waxWrap ) );'
        )
      )
  }
  return m
}

/** charred cotton: dull black while it burns; just after, its curled tip glows red and cools */
function wickMaterial(uniforms, tipY) {
  const m = new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 0.9 })
  m.customProgramCacheKey = () => 'candle-wick-v1'
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uTipY: { value: tipY } })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvY = position.y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uEmber;\nuniform float uTipY;\nvarying float vY;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.32, 0.08) * uEmber * smoothstep(uTipY - 0.0035, uTipY, vY) * 3.0;'
      )
  }
  return m
}

/**
 * The candle in its own flame's shadow map: nothing. A real flame is a glowing body two centimetres tall, and the shadow
 * a slim candle casts in it is a faint, wide blur at its foot; from a point light it would be a hard black disc.
 */
function noShadow() {
  const m = new THREE.MeshDistanceMaterial()
  m.customProgramCacheKey = () => 'candle-no-shadow-v1'
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position = vec4(2.0, 2.0, 2.0, 1.0);')
  }
  return m
}

// ---------------------------------------------------------------------------------------------- the candle

const _v = new THREE.Vector3()

export class Candle {
  constructor(waxTexture) {
    this.uniforms = { uGlow: { value: 0 }, uEmber: { value: 0 }, uLen: { value: CANDLE.L } }
    const body = (this.body = new THREE.Mesh(candleGeometry(), waxMaterial(waxTexture, this.uniforms)))
    const wickGeo = wickGeometry()
    const wick = (this.wick = new THREE.Mesh(wickGeo, wickMaterial(this.uniforms, wickGeo.boundingBox.max.y)))
    wick.position.set(0, CANDLE.L, 0)
    wick.rotation.y = WICK_TURN
    const unshadowed = noShadow()
    for (const m of [body, wick]) {
      m.castShadow = true // in the morning sun
      m.receiveShadow = true
      m.customDistanceMaterial = unshadowed
    }
    this.object = new THREE.Group()
    this.object.add(body, wick)
    // the wick's tip (where smoke leaves it) and the flame's root, in the candle's frame
    this.tipLocal = new THREE.Vector3(0.0021, CANDLE.WICK - 0.0015, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), WICK_TURN).add(new THREE.Vector3(0, CANDLE.L, 0))
    this.rootLocal = new THREE.Vector3(0.0004, CANDLE.L, 0)

    this.state = 'none' // 'none' | 'planted' (stuck in a piece) | 'loose' (knocked off, a body of its own)
    this.piece = null
    this.collider = null // its wax, part of the piece's body, while planted
    this.rigid = null // its own body, while loose
    this.top = new THREE.Vector3() // where it enters the sponge, in the piece's (loaf) space
    this.axis = new THREE.Vector3(0, 1, 0) // its direction, in the piece's space
    this.sink = CANDLE.SINK
  }

  /** the flame's root (world): just above the melt pool, over the wick */
  root(out) {
    return this.object.localToWorld(out.copy(this.rootLocal)).add(_v.set(0, 0.0012, 0))
  }

  /** the tip of the wick (world): where the smoke leaves it */
  tip(out) {
    return this.object.localToWorld(out.copy(this.tipLocal))
  }

  /** which way it points (world) */
  up(out) {
    return out.set(0, 1, 0).transformDirection(this.object.matrixWorld)
  }

  dispose() {
    for (const m of [this.body, this.wick]) {
      m.geometry.dispose()
      m.material.dispose()
    }
  }
}

/** a see-through candle that shows where a tap would put the real one */
export function ghostCandle(candle) {
  // (it writes depth, so the lens focuses it where the cake is rather than blurring it into the wall behind)
  const mat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, roughness: 0.5, transparent: true, opacity: 0.55 })
  const g = new THREE.Group()
  for (const src of [candle.body, candle.wick]) {
    const m = new THREE.Mesh(src.geometry, mat)
    m.position.copy(src.position)
    m.rotation.copy(src.rotation)
    m.renderOrder = 5
    g.add(m)
  }
  g.visible = false
  g.userData.material = mat
  return g
}
