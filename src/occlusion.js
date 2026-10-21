// The flame, its glow and the smoke are drawn after the scene, into a layer of their own that goes over the picture
// once the lens has blurred it (they are where the camera is focused, and a blur would smear them into the wall
// behind). They still have to go behind whatever stands in front of them: each looks up the scene's depth under it.
import * as THREE from 'three'

export const sceneDepth = {
  tSceneDepth: { value: null },
  uDepthRes: { value: new THREE.Vector2(1, 1) },
  uCamNear: { value: 0.03 },
  uCamFar: { value: 30 },
}

export const depthGLSL = /* glsl */ `
  uniform sampler2D tSceneDepth;
  uniform vec2 uDepthRes;
  uniform float uCamNear;
  uniform float uCamFar;
  // distance along the view axis (m) of a window depth
  float depthDist(float z) { return uCamNear * uCamFar / (uCamFar - (uCamFar - uCamNear) * z); }
  float sceneDist(vec2 uv) { return depthDist(texture2D(tSceneDepth, uv).r); }
  // how much of a point at this window depth is in front of the scene here: 0 behind it, 1 in front (soft over 'soft' m)
  float unhidden(vec2 uv, float z, float soft) { return smoothstep(-soft, 0.0, sceneDist(uv) - depthDist(z)); }
`
