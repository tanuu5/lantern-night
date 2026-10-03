import * as THREE from 'three';
import { heightAt, pathDist, inGraveyard } from './layout.js';
import { noise } from '../util/noise.js';
import { smoothstep, lerp } from '../util/math.js';
import { withFog } from '../shaders/fog.js';

export function createTerrain(env) {
  const size = 260;
  const seg = 240;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const grass = new THREE.Color().setRGB(0.03, 0.034, 0.016);
  const dry = new THREE.Color().setRGB(0.055, 0.042, 0.02);
  const dirt = new THREE.Color().setRGB(0.04, 0.027, 0.018);
  const moss = new THREE.Color().setRGB(0.02, 0.03, 0.02);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const n1 = noise.fbm2(x * 0.06, z * 0.06, 3) * 0.5 + 0.5;
    const n2 = noise.noise2D(x * 0.4, z * 0.4) * 0.5 + 0.5;
    c.copy(grass).lerp(dry, smoothstep(0.35, 0.75, n1));
    c.lerp(moss, smoothstep(0.6, 0.9, n2) * 0.5);
    const pd = pathDist(x, z);
    c.lerp(dirt, 1 - smoothstep(0.7, 1.9, pd));
    if (inGraveyard(x, z, 1.5)) c.lerp(dirt, 0.45 * smoothstep(0.2, 0.8, n2));
    const shade = lerp(0.8, 1.15, n2);
    colors[i * 3] = c.r * shade;
    colors[i * 3 + 1] = c.g * shade;
    colors[i * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = withFog(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }),
    (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        #ifdef USE_FOG
          float gd = fogNoise(vFogWorldPos * 1.9) * 0.6 + fogNoise(vFogWorldPos * 7.3) * 0.4;
          diffuseColor.rgb *= 0.7 + 0.6 * gd;
        #endif`
      );
    },
    'ground'
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  // Distant ridges: unlit silhouettes, slightly darker than the haze, layered for depth.
  const ridges = new THREE.Group();
  const layers = [
    { r: 300, base: 6, amp: 26, k: 0.72, seed: 1.7 },
    { r: 420, base: 16, amp: 34, k: 0.86, seed: 9.3 },
  ];
  for (const L of layers) {
    const n = 360;
    const verts = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * L.r;
      const z = Math.sin(a) * L.r;
      const nn = noise.fbm2(Math.cos(a) * 3 + L.seed, Math.sin(a) * 3 - L.seed, 5) * 0.5 + 0.5;
      const top = L.base + Math.pow(nn, 1.6) * L.amp;
      verts.push(x, -40, z, x, top, z);
      if (i < n) {
        const b = i * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uFogColor: { value: env.fogColor },
        uMoonColor: { value: env.moonGlow },
        uMoonDir: { value: env.moonDir },
        uK: { value: L.k },
        uFlash: env.flash,
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying float vH;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vH = position.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform vec3 uMoonColor;
        uniform vec3 uMoonDir;
        uniform float uK;
        uniform float uFlash;
        varying vec3 vWorld;
        varying float vH;
        void main() {
          vec3 d = normalize(vWorld - cameraPosition);
          float md = max(dot(d, uMoonDir), 0.0);
          vec3 haze = uFogColor + uMoonColor * 0.45 * (pow(md, 14.0) + pow(md, 3.0) * 0.12);
          // lower slopes sink back into the haze
          float k = mix(1.0, uK, smoothstep(-8.0, 14.0, vH));
          vec3 col = haze * k + vec3(0.25, 0.28, 0.5) * uFlash * 0.25;
          gl_FragColor = vec4(col, 1.0);
        }`,
      fog: false,
      side: THREE.DoubleSide,
    });
    const ridge = new THREE.Mesh(g, m);
    ridge.renderOrder = -5;
    ridges.add(ridge);
  }

  return {
    mesh,
    ridges,
    update(camera) {
      ridges.position.set(camera.position.x, 0, camera.position.z);
    },
  };
}
