// The castella: its material, and the pieces it is cut into.
//
// Every piece is drawn from its loaf-space mesh. The shader works out what the sponge looks like at each point
// from where that point was inside the uncut loaf, the way a real cut reveals it:
//   - the top crust: a 2–3 mm caramel band with a darker baked line under it, then golden crumb,
//   - the crumb: honey yellow, fine and moist, slightly more golden near the top,
//   - the bottom: a thin, dark, sugary crust holding zarame crystals that catch the light.
// The baked outside (skin = 1) shows the crust's own surface instead: satin brown on top, dark and sugary below.
//
// The sponge gives: a knife's edge or a fingertip pushes the surface in (an elastic indentation that dies away
// with distance and toward the supported bottom), and a piece that lands hard squashes and springs back.
import * as THREE from 'three'
import { meshVolume, meshCentroid, split, hullPoints, polytope, polytopeMesh } from './slice.js'

export const LOAF = { L: 0.27, W: 0.09, H: 0.0605 }
export const DENSITY = 398 // kg/m³: a 1号 castella weighs 580 g and fills 27 × 9 × 6 cm
export const MIN_PIECE = 1.2e-6 // m³: thinner than this, a shaving is crumbs, not a piece
// the uncut loaf as half-spaces a·p >= b, for the physics
export const LOAF_BOX = [[1, 0, 0, -0.135], [-1, 0, 0, -0.135], [0, 1, 0, 0], [0, -1, 0, -0.0606], [0, 0, 1, -0.045], [0, 0, -1, -0.045]]

const shaderCommon = /* glsl */ `
  uniform vec4 uKnife;        // the knife's plane in this piece's space: n.xyz, w
  uniform vec3 uDown;         // world down, in this piece's space
  uniform float uKnifeDent;   // how far the edge pushes the surface in (m)
  uniform vec2 uUp;           // the piece's extent along world up: bottom, height (m)
  uniform vec4 uPoke;         // a fingertip: centre xyz, depth (m)
  uniform mat3 uSquash;       // the squash of a landing (affine about uSquashO)
  uniform vec3 uSquashO;
`

const vertexHead = /* glsl */ `
  attribute float skin;
  varying vec3 vLoaf;
  varying vec3 vLoafN;
  varying float vSkin;
  ${shaderCommon}
  // the support carries the bottom, so the give grows toward the top
  float give(vec3 p, out vec3 grad) {
    float h = clamp((dot(p, -uDown) - uUp.x) / max(uUp.y, 1e-3), 0.0, 1.0);
    grad = -uDown * (1.6 * pow(max(h, 1e-4), 0.6) / max(uUp.y, 1e-3));
    return pow(h, 1.6);
  }
  // displacement along uDown at p, and its gradient (for the bent normal)
  float indent(vec3 p, out vec3 grad) {
    vec3 gg; float g = give(p, gg);
    float s = 0.0; grad = vec3(0.0);
    // a knife's edge: a line load, a V-shaped crease that dies away over ~5 mm on either side
    if (uKnifeDent > 0.0) {
      float sd = dot(p, uKnife.xyz) - uKnife.w;
      float d = abs(sd);
      const float lam = 0.0048, r = 0.0007;
      float q = sqrt(d * d + r * r);
      float f = exp(-(q - r) / lam);
      float fp = -f * d / (lam * q);
      s += uKnifeDent * f * g;
      grad += uKnifeDent * (fp * sign(sd) * uKnife.xyz * g + f * gg);
    }
    // a fingertip: a round dimple, about 1.3 cm across
    if (uPoke.w > 0.0) {
      vec3 q = p - uPoke.xyz;
      vec3 qt = q - uDown * dot(q, uDown);
      const float lam = 0.0105;
      float f = exp(-dot(qt, qt) / (lam * lam));
      s += uPoke.w * f * g;
      grad += uPoke.w * (f * (-2.0 / (lam * lam)) * qt * g + f * gg);
    }
    return s;
  }
`

const fragmentHead = /* glsl */ `
  uniform sampler2D tCrumb, tCrumbN, tCrust, tCrustN, tBottom, tBottomN;
  uniform float uH;
  varying vec3 vLoaf;
  varying vec3 vLoafN;
  varying float vSkin;
  float castellaWrap = 0.0;
  float crumbiness = 0.0;
  float sugar = 0.0;
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(6.0)); return w / (w.x + w.y + w.z); }
  vec3 tri(sampler2D t, vec3 p, vec3 w) {
    return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;
  }
  // whiteout-blended triplanar normal mapping (in loaf space)
  vec3 triN(sampler2D t, vec3 p, vec3 n, vec3 w, float k) {
    vec3 tx = texture2D(t, p.zy).xyz * 2.0 - 1.0; tx.xy *= k;
    vec3 ty = texture2D(t, p.xz).xyz * 2.0 - 1.0; ty.xy *= k;
    vec3 tz = texture2D(t, p.xy).xyz * 2.0 - 1.0; tz.xy *= k;
    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
    return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  }
  vec3 lin(vec3 c) { return c * c * (c * 0.2848 + 0.7152); } // a cheap sRGB -> linear for hand-picked colours
`

// the colour of the sponge where a knife reveals it, at loaf-space point p
const cutColour = /* glsl */ `
  vec3 p = vLoaf;
  vec3 wN = triW(vLoafN);
  vec3 crumbTex = tri(tCrumb, p * 30.0, wN);
  float depth = uH - p.y;                                     // from the nominal top
  float wob = (vnoise(vec3(p.xz * 900.0, 1.0)) - 0.5) * 0.0005 + (vnoise(vec3(p.xz * 140.0, 7.0)) - 0.5) * 0.0007;
  float dz = depth + wob;
  // crumb, a touch more golden under the crust and at the base
  vec3 crumbC = crumbTex * mix(vec3(1.0), vec3(1.02, 0.9, 0.72), smoothstep(0.009, 0.0032, dz));
  crumbC *= mix(vec3(1.0), vec3(1.0, 0.94, 0.84), smoothstep(0.009, 0.004, p.y));
  // the top crust band: a dark baked skin, caramel, and the darker line where it meets the crumb
  vec3 band = mix(lin(vec3(0.36, 0.17, 0.08)), lin(vec3(0.6, 0.33, 0.15)), smoothstep(0.0, 0.0011, dz));
  band = mix(band, lin(vec3(0.44, 0.21, 0.09)), smoothstep(0.0016, 0.0024, dz));
  vec3 golden = lin(vec3(0.84, 0.55, 0.22));
  vec3 c = mix(band, golden, smoothstep(0.0025, 0.0031, dz));
  c = mix(c, crumbC, smoothstep(0.0029, 0.0042, dz));
  float topBand = 1.0 - smoothstep(0.0025, 0.004, dz);
  // the base: dark sugary crust with zarame, then crystals scattered in the lowest crumb
  float yb = p.y + (vnoise(vec3(p.xz * 700.0, 3.0)) - 0.5) * 0.0005;
  vec3 baseTex = tri(tBottom, p * 26.0, wN);
  float crystal = smoothstep(0.42, 0.62, dot(baseTex, vec3(0.33)));
  vec3 base = mix(baseTex * vec3(1.0, 0.92, 0.88), lin(vec3(0.93, 0.9, 0.84)), crystal * 0.6);
  float inBase = 1.0 - smoothstep(0.0016, 0.0026, yb);
  float inSugar = (1.0 - smoothstep(0.0026, 0.0052, yb)) * smoothstep(0.55, 0.75, vnoise(p * 1600.0));
  c = mix(c, base, inBase);
  c = mix(c, lin(vec3(0.95, 0.92, 0.86)), inSugar * (1.0 - inBase) * 0.85);
  sugar = max(crystal * inBase, inSugar * (1.0 - inBase));
  crumbiness = (1.0 - topBand) * (1.0 - inBase);
  vec3 cutC = c;
`

const skinColour = /* glsl */ `
  // the baked outside: satin caramel on top, with the faint mottle of the oven; dark and sugary underneath
  isTop = step(0.0, vLoafN.y + 0.2) * step(uH * 0.5, vLoaf.y);
  vec3 topC = texture2D(tCrust, vLoaf.xz * 11.0).rgb;
  topC *= mix(0.86, 1.1, vnoise(vec3(vLoaf.xz * 36.0, 2.0)));
  topC *= mix(vec3(1.0), vec3(0.9, 0.82, 0.78), smoothstep(0.5, 1.0, vnoise(vec3(vLoaf.xz * 9.0, 5.0))));
  vec3 botC = texture2D(tBottom, vLoaf.xz * 22.0).rgb * 0.85;
  vec3 skinC = mix(botC, topC, isTop);
`

export function createCastellaMaterial(tex) {
  const uniforms = {
    tCrumb: { value: tex.crumb },
    tCrumbN: { value: tex.crumbN },
    tCrust: { value: tex.crust },
    tCrustN: { value: tex.crustN },
    tBottom: { value: tex.bottom },
    tBottomN: { value: tex.bottomN },
    uH: { value: LOAF.H },
    uKnife: { value: new THREE.Vector4(1, 0, 0, 1e3) },
    uDown: { value: new THREE.Vector3(0, -1, 0) },
    uKnifeDent: { value: 0 },
    uUp: { value: new THREE.Vector2(0, LOAF.H) },
    uPoke: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSquash: { value: new THREE.Matrix3() },
    uSquashO: { value: new THREE.Vector3() },
  }
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color(0.26, 0.19, 0.07),
    clearcoat: 0.1,
    clearcoatRoughness: 0.55,
    specularIntensity: 0.6,
  })
  m.userData.uniforms = uniforms
  m.customProgramCacheKey = () => 'castella-v1'
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertexHead)
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        vec3 objectNormal = vec3(normal);
        vLoaf = position; vLoafN = normal; vSkin = skin;
        vec3 gradS; float sDisp = indent(position, gradS);
        // the surface moved along uDown by s(p): bend its normal by the slope of s
        if (sDisp > 0.0) {
          vec3 N = objectNormal;
          objectNormal = normalize(N - dot(uDown, N) * (gradS - dot(gradS, N) * N));
        }
        objectNormal = normalize(inverse(transpose(uSquash)) * objectNormal);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position) + uDown * sDisp;
        transformed = uSquash * (transformed - uSquashO) + uSquashO;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragmentHead + '\nuniform mat3 normalMatrix;\n')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        float sk = smoothstep(0.15, 0.85, vSkin);
        float isTop = 0.0;
        {
          ${cutColour}
          ${skinColour}
          diffuseColor.rgb = mix(cutC, skinC, sk);
        }
        crumbiness *= 1.0 - sk;
        castellaWrap = 0.42 * crumbiness;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        float roughnessFactor = mix(mix(0.86, 0.7, 1.0 - crumbiness), 0.2, sugar * (1.0 - sk));
        roughnessFactor = mix(roughnessFactor, mix(0.62, 0.48, isTop), sk);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        {
          vec3 nL = normalize(vLoafN);
          vec3 wn = triW(nL);
          vec3 pc = triN(tCrumbN, vLoaf * 30.0, nL, wn, 1.35);
          vec3 pb = triN(tBottomN, vLoaf * 26.0, nL, wn, 1.0);
          vec3 pCut = normalize(mix(pc, pb, step(vLoaf.y, 0.0026)));
          vec3 tn = texture2D(tCrustN, vLoaf.xz * 11.0).xyz * 2.0 - 1.0;
          vec3 pTop = normalize(nL + vec3(tn.x, 0.0, -tn.y) * 0.35 * isTop);
          vec3 pObj = normalize(mix(pCut, pTop, sk));
          // carry the detail over to the bent, squashed normal the vertex shader produced
          vec3 dn = pObj - nL;
          normal = normalize(normal + normalMatrix * dn);
        }`
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `
        #include <lights_physical_fragment>
        material.sheenColor *= crumbiness;
        material.clearcoat *= sk * isTop;`
      )
      .replace(
        // seen edge-on in raking light, sheen can spike: keep any one pixel from flaring (the lens would smear it)
        '#include <opaque_fragment>',
        'outgoingLight = min(outgoingLight, vec3(2.5));\n#include <opaque_fragment>'
      )
      .replace(
        // light travels a little way into the sponge: soften the terminator on cut crumb
        '#include <lights_physical_pars_fragment>',
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
          'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + castellaWrap ) / ( 1.0 + castellaWrap ) );'
        )
      )
  }
  return m
}

/** the depth material for shadows has to move the vertices the same way */
export function createCastellaDepthMaterial(uniforms) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  m.customProgramCacheKey = () => 'castella-depth-v1'
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertexHead)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 gradS; float sDisp = indent(position, gradS);
        vec3 transformed = vec3(position) + uDown * sDisp;
        transformed = uSquash * (transformed - uSquashO) + uSquashO;`
      )
  }
  return m
}

/** one piece of the loaf: a mesh, a rigid body, and the sponge's give */
export class Piece {
  constructor(mesh, planes, tex) {
    this.mesh = mesh // { pos, nrm, skin, idx } in loaf space
    this.planes = planes // the half-spaces that bound it, in loaf space
    this.volume = meshVolume(mesh)
    this.centroid = meshCentroid(mesh)
    this.mass = this.volume * DENSITY
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.nrm, 3))
    g.setAttribute('skin', new THREE.BufferAttribute(mesh.skin, 1))
    g.setIndex(new THREE.BufferAttribute(mesh.idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    // the dent can move the surface a little outside its rest bounds
    g.boundingSphere.radius += 0.01
    this.geometry = g
    this.material = createCastellaMaterial(tex)
    this.uniforms = this.material.userData.uniforms
    this.object = new THREE.Mesh(g, this.material)
    this.object.castShadow = true
    this.object.receiveShadow = true
    this.object.customDepthMaterial = createCastellaDepthMaterial(this.uniforms)
    this.object.userData.piece = this
    // the squash spring: strain along an axis, in the piece's space
    this.squash = { s: 0, v: 0, axis: new THREE.Vector3(0, 1, 0), origin: new THREE.Vector3() }
    this.poke = { depth: 0, target: 0, point: new THREE.Vector3() }
    this.knifeDent = 0
    this.body = null
  }

  /** extent of this piece along a direction given in its own space */
  extent(dir) {
    const p = this.mesh.pos
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < p.length; i += 3) {
      const s = p[i] * dir.x + p[i + 1] * dir.y + p[i + 2] * dir.z
      if (s < lo) lo = s
      if (s > hi) hi = s
    }
    return [lo, hi]
  }

  hull() { return polytope(this.planes) || hullPoints(this.mesh) }

  /** the same shape as a triangle mesh with whole faces (or null), which rests more surely on things than a hull of points */
  shape() { return polytopeMesh(this.planes) }

  /** cut by a plane given in this piece's space; returns two new meshes or null */
  cut(n, w) {
    const r = split(this.mesh, [n.x, n.y, n.z], w)
    if (!r) return null
    const vf = meshVolume(r.front), vb = meshVolume(r.back)
    return { front: r.front, back: r.back, vf, vb }
  }

  /** update the shader's give from the knife, the finger and the last landing */
  updateGive(dt, worldDown) {
    const u = this.uniforms
    // world down in the piece's space, and its extent that way (so the bottom is held by the support)
    const q = this.object.quaternion
    const down = u.uDown.value.copy(worldDown).applyQuaternion(_qInv.copy(q).invert())
    const up = _v.copy(down).negate()
    const [lo, hi] = this.extent(up)
    u.uUp.value.set(lo, hi - lo)
    u.uKnifeDent.value = this.knifeDent
    // the fingertip sinks in while held and comes back a little slower, as foam does
    const p = this.poke
    const k = p.target > p.depth ? 9 : 6
    p.depth += (p.target - p.depth) * Math.min(1, k * dt)
    if (p.depth < 1e-5 && p.target === 0) p.depth = 0
    u.uPoke.value.set(p.point.x, p.point.y, p.point.z, p.depth)
    // the squash: a damped spring (about 14 Hz, well damped, as a sponge cake is)
    const s = this.squash
    const w = 2 * Math.PI * 14, z = 0.45
    const steps = Math.max(1, Math.ceil(dt / 0.004))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      s.v += (-w * w * s.s - 2 * z * w * s.v) * h
      s.s += s.v * h
    }
    if (Math.abs(s.s) < 1e-5 && Math.abs(s.v) < 1e-4) { s.s = 0; s.v = 0 }
    const st = THREE.MathUtils.clamp(s.s, -0.03, 0.08)
    // compress along the axis, bulge a little across it (a foam's Poisson ratio is small)
    const a = s.axis, nu = 0.18
    const m = u.uSquash.value
    const e = m.elements
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const aa = a.getComponent(i) * a.getComponent(j)
        e[j * 3 + i] = (i === j ? 1 + nu * st : 0) - (1 + nu) * st * aa
      }
    }
    u.uSquashO.value.copy(s.origin)
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
    this.object.customDepthMaterial.dispose()
  }
}

const _qInv = new THREE.Quaternion()
const _v = new THREE.Vector3()
