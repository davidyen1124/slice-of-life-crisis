// The stage: renderer, camera, light, the room and the props, and the photographic finish (depth of field,
// a neutral tone curve, vignette and grain). The scene is in metres; the board's top is at y = 0.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

export const BOARD = { L: 0.42, W: 0.2, T: 0.018 }
export const TABLE_Y = -BOARD.T
export const PAPER_Y = 0.0003 // the washi's thickness: what the cake stands on

const tmp = new THREE.Vector3()

export class Stage {
  constructor(canvas, { quality, qa }) {
    this.canvas = canvas
    this.quality = quality
    this.qa = qa
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!qa }))
    renderer.setClearColor(0xefe9df, 1)
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace // the finish pass does the tone curve and sRGB
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.03, 30)
    this.target = new THREE.Vector3(0, 0.025, 0)
    // the camera rig: where we look from (azimuth around +y from +z, elevation), and the user's adjustments
    this.rig = { az: 0, el: 0, dist: 1, fov: 26, userAz: 0, userEl: 0, userZoom: 1, focus: new THREE.Vector3() }
    this.anim = { az: null, el: null, zoom: null }
    this.size = { w: 1, h: 1, dpr: 1 }
    this.time = 0
  }

  async load(onProgress) {
    const manager = new THREE.LoadingManager()
    manager.onProgress = (_url, done, total) => onProgress?.(done / total)
    const tex = new THREE.TextureLoader(manager)
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    const pending = []
    const load = (name, srgb = true, repeat = false) => {
      const t = tex.load(`/tex/${name}`)
      pending.push(new Promise((resolve, reject) => { t.userData.ready = resolve; t.userData.fail = reject }))
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.anisotropy = Math.min(8, maxAniso)
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
      return t
    }
    // every picture must be in before the scene is built (the knife's handle copies the board's photograph)
    const loadTex = tex.load.bind(tex)
    tex.load = (url) => {
      let t = null
      t = loadTex(url, () => t.userData.ready?.(), undefined, (e) => t.userData.fail?.(e))
      return t
    }
    this.tex = {
      crumb: load('crumb.jpg', true, true),
      crumbN: load('crumb_n.jpg', false, true),
      crust: load('crust.jpg', true, true),
      crustN: load('crust_n.jpg', false, true),
      bottom: load('bottom.jpg', true, true),
      bottomN: load('bottom_n.jpg', false, true),
      linen: load('linen.jpg', true, true),
      washi: load('washi.jpg', true, true),
      board: load('board.jpg'),
      leaves: load('leaves.jpg', true, true),
      backdrop: load('backdrop.webp'),
    }
    const [gltf, hdr] = await Promise.all([
      new GLTFLoader(manager).loadAsync('/scene.glb'),
      new HDRLoader(manager).loadAsync('/tex/room.hdr'),
    ])
    await Promise.all(pending)
    this.gltf = gltf
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    hdr.mapping = THREE.EquirectangularReflectionMapping
    this.envMap = pmrem.fromEquirectangular(hdr).texture
    hdr.dispose()
    pmrem.dispose()
    this.build()
  }

  build() {
    const { scene, tex } = this
    const meshes = {}
    this.gltf.scene.traverse((o) => { if (o.isMesh) meshes[o.name] = o })
    this.meshes = meshes

    // the morning room, as light: the shoji window is on the left (-x)
    scene.environment = this.envMap
    scene.environmentIntensity = 0.15
    scene.environmentRotation.set(0, Math.PI / 2, 0)

    // the sun through the window and the maple outside it: a spot light carrying the leaves as a gobo
    const sun = (this.sun = new THREE.SpotLight(0xfff4e8, 24, 0, 0.23, 0.6, 2))
    sun.position.set(-1.62, 1.32, 0.52)
    sun.target.position.set(0.03, 0, -0.03)
    sun.castShadow = true
    const sm = this.quality === 'low' ? 1024 : 2048
    sun.shadow.mapSize.set(sm, sm)
    sun.shadow.camera.near = 1.4
    sun.shadow.camera.far = 3.4
    sun.shadow.bias = -0.00012
    sun.shadow.normalBias = 0.0012
    sun.shadow.radius = 3.5 // light through a window is soft-edged
    sun.map = tex.leaves
    scene.add(sun, sun.target)
    // a soft bounce from the white wall on the right, so the shadow side is not dead
    const bounce = (this.bounce = new THREE.DirectionalLight(0xf6f3ee, 0.45))
    bounce.position.set(1.1, 0.7, 1.2)
    scene.add(bounce)

    // the table, under linen
    tex.linen.repeat.set(40, 40)
    const table = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ map: tex.linen, roughness: 0.97, color: 0xf1ece4 }))
    table.rotation.x = -Math.PI / 2
    table.position.y = TABLE_Y
    table.receiveShadow = true
    scene.add(table)

    // the hinoki board: the photograph across its top, the grain running on down its sides
    const board = meshes.board
    boxUV(board.geometry, BOARD.L, BOARD.W, BOARD.T)
    board.material = new THREE.MeshStandardMaterial({ map: tex.board, roughness: 0.66, color: 0xf6f3ec })
    board.castShadow = board.receiveShadow = true
    scene.add(board)

    // the washi sheet the castella was baked on
    const washi = meshes.washi
    planarUV(washi.geometry, 0.24)
    tex.washi.repeat.set(1, 1)
    washi.material = new THREE.MeshStandardMaterial({ map: tex.washi, roughness: 0.92, color: 0xeeebe4, side: THREE.DoubleSide })
    washi.receiveShadow = true
    washi.castShadow = false
    washi.position.y = 0.0001
    scene.add(washi)

    // a yunomi of sencha at the back, which the lens throws out of focus
    const cup = new THREE.Group()
    meshes.yunomi.material = new THREE.MeshPhysicalMaterial({ color: 0x8e9a86, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 })
    meshes.tea.material = new THREE.MeshPhysicalMaterial({ color: 0x5f6a1c, roughness: 0.04, clearcoat: 1 })
    meshes.yunomi.castShadow = meshes.yunomi.receiveShadow = true
    cup.add(meshes.yunomi, meshes.tea)
    cup.position.set(0.3, TABLE_Y, -0.3)
    scene.add(cup)
    this.cup = cup

    // the wall behind, far and soft
    const back = (this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.05), new THREE.MeshBasicMaterial({ map: tex.backdrop, color: 0xe8e2d8, fog: false })))
    scene.add(back)

    this.makeFinish()
  }

  // ------------------------------------------------------------------------------------------ the camera rig
  /** frame the board for this screen: from the front on wide screens, along the loaf on tall ones */
  layout(w, h) {
    const aspect = w / h
    const tall = aspect < 0.8
    const r = this.rig
    // how the photograph is composed: where the cake sits on the page and how much room the title takes
    if (tall) {
      r.az = THREE.MathUtils.degToRad(60)
      r.el = THREE.MathUtils.degToRad(41)
      r.fov = 34
      this.frame = { x0: -0.97, x1: 0.97, y0: -0.5, y1: 0.36 }
    } else if (aspect < 1.25) {
      r.az = THREE.MathUtils.degToRad(30)
      r.el = THREE.MathUtils.degToRad(36)
      r.fov = 30
      this.frame = { x0: -0.86, x1: 0.62, y0: -0.6, y1: 0.5 }
    } else {
      r.az = THREE.MathUtils.degToRad(-12)
      r.el = THREE.MathUtils.degToRad(30)
      r.fov = 25
      this.frame = { x0: -0.8, x1: 0.66, y0: -0.66, y1: 0.56 }
    }
    this.camera.fov = r.fov
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    this.tall = tall
    r.dist = this.fitDistance()
  }

  /** the distance at which the loaf, its board and the knife's resting place fill the frame */
  fitDistance() {
    const cam = this.camera
    const pts = []
    for (const x of [-0.17, 0.17]) for (const z of [-0.075, 0.075]) for (const y of [0, 0.065]) pts.push(new THREE.Vector3(x, y, z))
    for (const x of [-0.21, 0.21]) for (const z of [-0.1, 0.1]) pts.push(new THREE.Vector3(x, 0, z))
    // the knife, resting on the table in front of the board (on a tall screen it may run off the edge)
    if (!this.tall) for (const x of [-0.15, 0.24]) pts.push(new THREE.Vector3(x, TABLE_Y, 0.165))
    let lo = 0.2, hi = 6
    const f = this.frame
    for (let i = 0; i < 40; i++) {
      const d = (lo + hi) / 2
      this.placeCamera(d, 0, 0)
      let fits = true
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const p of pts) {
        tmp.copy(p).project(cam)
        minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x)
        minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y)
      }
      // scale about the frame: the content must fit the frame's size; then it is centred in it
      if (maxX - minX > f.x1 - f.x0 || maxY - minY > f.y1 - f.y0) fits = false
      if (fits) hi = d
      else lo = d
    }
    // where the content lands, so it can be shifted into the frame's centre with a view offset
    this.placeCamera(hi, 0, 0)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of pts) {
      tmp.copy(p).project(cam)
      minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x)
      minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y)
    }
    this.shift = { x: (f.x0 + f.x1) / 2 - (minX + maxX) / 2, y: (f.y0 + f.y1) / 2 - (minY + maxY) / 2 }
    return hi
  }

  placeCamera(dist, dAz, dEl) {
    const r = this.rig
    const az = r.az + dAz, el = THREE.MathUtils.clamp(r.el + dEl, 0.2, 1.35)
    this.camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(this.target)
    this.camera.lookAt(this.target)
    this.camera.updateMatrixWorld()
  }

  updateCamera() {
    const r = this.rig
    const cam = this.camera
    this.placeCamera(r.dist * r.userZoom, r.userAz, r.userEl)
    // slide the picture so the cake sits where the layout wants it (a shift lens, not a turn)
    const s = this.shift || { x: 0, y: 0 }
    const { w, h } = this.size
    cam.setViewOffset(w, h, (-s.x * w) / 2, (s.y * h) / 2, w, h)
    cam.updateProjectionMatrix()
    // the wall stands far behind the cake, facing us
    const az = r.az + r.userAz
    this.backdrop.position.set(-Math.sin(az) * 0.46, 3.05 / 2 + TABLE_Y - 0.03, -Math.cos(az) * 0.46)
    this.backdrop.rotation.set(0, az, 0)
  }

  resize() {
    // the canvas fills the window; before the stylesheet has applied it still reports its default 300 × 150
    let w = this.canvas.clientWidth, h = this.canvas.clientHeight
    if (!w || !h || (w === 300 && h === 150)) { w = window.innerWidth; h = window.innerHeight }
    w = Math.max(1, w)
    h = Math.max(1, h)
    if (this.size.w === w && this.size.h === h && this.size.scale === this.dprScale && this.rtReady) return
    this.rtReady = true
    const dprCap = this.quality === 'low' ? 1.5 : 2
    let dpr = Math.min(window.devicePixelRatio || 1, dprCap)
    // keep the number of shaded pixels sane on very large or very dense screens
    const maxPx = this.quality === 'high' ? 4.2e6 : 2.6e6
    if (w * h * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (w * h))
    dpr *= this.dprScale ?? 1
    this.size = { w, h, dpr, scale: this.dprScale }
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.layout(w, h)
    this.updateCamera()
    const W = Math.round(w * dpr), H = Math.round(h * dpr)
    this.rt.setSize(W, H)
    this.finish.uniforms.uRes.value.set(W, H)
    this.finish.uniforms.uMaxBlur.value = Math.max(6, H * 0.016)
  }

  // ------------------------------------------------------------------------- the photographic finish
  makeFinish() {
    const depth = new THREE.DepthTexture(1, 1)
    depth.type = THREE.UnsignedIntType
    // light is kept in half floats where the GPU can render to them; otherwise in bytes (the highlights clip a little)
    const ext = this.renderer.extensions
    const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: this.quality === 'low' ? 2 : 4,
      depthTexture: depth,
      depthBuffer: true,
    })
    this.finish = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: depth },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.03 },
        uFar: { value: 30 },
        uFocus: { value: 0.8 },
        uBlur: { value: 34 },
        uMaxBlur: { value: 14 },
        uTaps: { value: this.quality === 'low' ? 12 : 22 },
        uExposure: { value: 1.0 },
        uTime: { value: 0 },
        uGrain: { value: 0.018 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tColor, tDepth;
        uniform vec2 uRes;
        uniform float uNear, uFar, uFocus, uBlur, uMaxBlur, uExposure, uTime, uGrain;
        uniform int uTaps;
        varying vec2 vUv;
        float viewDist(float z) { return (uNear * uFar) / ((uFar - uNear) * z - uFar); }
        float coc(vec2 uv) {
          float d = -viewDist(texture2D(tDepth, uv).r);
          return min(uMaxBlur, uBlur * abs(1.0 / d - 1.0 / uFocus) * uRes.y / 1000.0);
        }
        // Khronos PBR Neutral: keeps the colours of the food true, rolls off only the highlights
        vec3 neutral(vec3 c) {
          float x = min(c.r, min(c.g, c.b));
          float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
          c -= off;
          float peak = max(c.r, max(c.g, c.b));
          const float sc = 0.76;
          if (peak < sc) return c;
          const float d = 1.0 - sc;
          float np = 1.0 - d * d / (peak + d - sc);
          c *= np / peak;
          float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
          return mix(c, vec3(np), g);
        }
        vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
        void main() {
          vec3 col = texture2D(tColor, vUv).rgb;
          col = clamp(col, 0.0, 16.0); // no NaN or flare survives into the blur
          float c0 = coc(vUv);
          if (c0 > 0.6) {
            // gather a disc of the size of this pixel's blur; a tap counts if it is blurred at least that much
            vec3 acc = col; float wsum = 1.0;
            float ga = 2.39996323;
            float rot = hash(gl_FragCoord.xy) * 6.2831;
            for (int i = 0; i < 32; i++) {
              if (i >= uTaps) break;
              float fi = float(i) + 0.5;
              float r = sqrt(fi / float(uTaps)) * c0;
              float a = fi * ga + rot;
              vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
              float ct = coc(uv);
              float w = smoothstep(r - 1.5, r + 0.5, ct);
              acc += texture2D(tColor, uv).rgb * w;
              wsum += w;
            }
            col = acc / wsum;
          }
          col *= uExposure;
          col = neutral(col);
          // a printed page: blacks lifted a touch and warm, saturation eased a little
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, 0.94);
          col = col * 0.965 + vec3(0.02, 0.016, 0.011);
          // the lens falls off gently toward the corners
          vec2 q = vUv - 0.5;
          q.x *= uRes.x / uRes.y;
          col *= 1.0 - 0.2 * smoothstep(0.35, 1.05, length(q));
          col = srgb(clamp(col, 0.0, 1.0));
          col += (hash(gl_FragCoord.xy + fract(uTime) * 157.0) - 0.5) * uGrain;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    this.quad = new THREE.Mesh(tri, this.finish)
    this.quad.frustumCulled = false
    this.postScene = new THREE.Scene()
    this.postScene.add(this.quad)
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  render(dt) {
    this.time += dt
    // the leaves outside move in the breeze, now and then
    const t = this.time
    if (this.sun.map) {
      const m = this.sun.map
      m.offset.set(0.012 * Math.sin(t * 0.37) + 0.006 * Math.sin(t * 1.13 + 1), 0.01 * Math.sin(t * 0.29 + 2) + 0.004 * Math.sin(t * 1.7))
    }
    const u = this.finish.uniforms
    u.uNear.value = this.camera.near
    u.uFar.value = this.camera.far
    u.uFocus.value = this.camera.position.distanceTo(this.rig.focus)
    u.uTime.value = this.qa ? 0 : t
    const r = this.renderer
    r.setRenderTarget(this.rt)
    r.render(this.scene, this.camera)
    r.setRenderTarget(null)
    r.render(this.postScene, this.postCam)
  }
}

/** UVs for a board-like box: its top and bottom get the whole photograph, the sides continue the grain */
function boxUV(geo, L, W, T) {
  const p = geo.attributes.position, n = geo.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i))
    let u = x / L + 0.5, v = z / W + 0.5
    if (ny < 0.5) {
      if (nx > 0.5) { u = z / L + 0.5; v = 0.5 + y / L } // the ends: a little of the photograph, turned
      else { u = x / L + 0.5; v = (z > 0 ? 1 : 0) + y / W } // the long sides: the grain carries on over the edge
    }
    uv[i * 2] = u
    uv[i * 2 + 1] = 1 - v
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

function planarUV(geo, size) {
  const p = geo.attributes.position
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / size + 0.5
    uv[i * 2 + 1] = p.getZ(i) / size + 0.5
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}
