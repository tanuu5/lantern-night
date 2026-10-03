import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/glsl.js';

// Low-lying ground mist: a few stacked horizontal layers of drifting noise,
// tinted by moonlight and lit from below by every burning pumpkin.
const vertexShader = /* glsl */ `
varying vec3 vWorld;
varying float vDist;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uLayer;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec4 uGlows[16];
uniform vec3 uLantern;
uniform vec4 uOcc[16];
uniform vec3 uLanternColor;
uniform float uFlash;
varying vec3 vWorld;
varying float vDist;
${NOISE_GLSL}
void main() {
  vec2 p = vWorld.xz * 0.055;
  vec2 drift = vec2(uTime * 0.018 * (1.0 + uLayer * 0.6), uTime * 0.007);
  float n = fbm2(p + drift + uLayer * 7.31);
  n = n * 0.75 + fbm2(p * 2.6 - drift * 1.7 + 3.7) * 0.35;
  float a = smoothstep(0.42, 0.85, n) * uOpacity;
  float r = length(vWorld.xz - vec2(0.0, -4.0));
  a *= 1.0 - smoothstep(32.0, 52.0, r);
  a *= smoothstep(1.5, 7.0, vDist);
  // soften where the layers slice through pumpkins
  for (int i = 0; i < 16; i++) {
    vec4 o = uOcc[i];
    a *= smoothstep(o.w * 0.75, o.w * 1.7, distance(vWorld, o.xyz));
  }

  vec3 vd = normalize(vWorld - cameraPosition);
  float md = max(dot(vd, uMoonDir), 0.0);
  float s = pow(md, 14.0) * 0.6 + pow(md, 3.0) * 0.08;
  vec3 col = uColor + uMoonColor * s;
  vec3 warm = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    vec4 g = uGlows[i];
    vec3 d = vWorld - g.xyz;
    warm += g.w * exp(-dot(d, d) * 0.16);
  }
  col += vec3(1.0, 0.42, 0.1) * warm * 0.55;
  vec3 dl = vWorld - uLantern;
  col += uLanternColor * exp(-dot(dl, dl) * 0.22) * 0.6;
  col += vec3(0.5, 0.55, 0.9) * uFlash * 0.6;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

export function createMist(env) {
  const group = new THREE.Group();
  const layers = [];
  const heights = [0.3, 0.85, 1.55, 2.4];
  heights.forEach((h, i) => {
    const uniforms = {
      uTime: env.uniforms.uTime,
      uLayer: { value: i },
      uOpacity: { value: [0.26, 0.2, 0.15, 0.1][i] },
      uColor: { value: env.mistColor },
      uMoonDir: { value: env.moonDir },
      uMoonColor: { value: env.moonGlow },
      uGlows: env.glows,
      uLantern: env.lanternPos,
      uOcc: env.occluders,
      uLanternColor: { value: env.lanternColor },
      uFlash: env.flash,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const geo = new THREE.CircleGeometry(54, 64);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, h, -4);
    mesh.renderOrder = 2;
    group.add(mesh);
    layers.push(mesh);
  });
  return { group, layers };
}
