import * as THREE from 'three';
import { heightAt, pathDist, inGraveyard, KING_POS } from './layout.js';
import { noise } from '../util/noise.js';
import { mulberry32, smoothstep } from '../util/math.js';
import { withFog } from '../shaders/fog.js';

function bladeGeometry() {
  const segs = 4;
  const pos = [];
  const col = [];
  const idx = [];
  for (let i = 0; i < segs; i++) {
    const y = i / segs;
    const w = 0.5 * Math.pow(1 - y, 0.9);
    const z = y * y * 0.12;
    pos.push(-w, y, z, w, y, z);
    const shade = 0.35 + 0.65 * y;
    col.push(shade, shade, shade, shade, shade, shade);
  }
  pos.push(0, 1, 0.12);
  col.push(1, 1, 1);
  for (let i = 0; i < segs - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const t = (segs - 1) * 2;
  idx.push(t, t + 1, segs * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export function createGrass(env, count = 64000) {
  const rand = mulberry32(77);
  const geo = bladeGeometry();
  const uniforms = {
    uLantern: { value: new THREE.Vector3(0, -100, 0) },
    uMoonDir: { value: env.moonDir },
  };

  const mat = withFog(
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    (shader) => {
      shader.uniforms.uTime = env.uniforms.uTime;
      shader.uniforms.uLantern = uniforms.uLantern;
      shader.uniforms.uMoonDir = uniforms.uMoonDir;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform float uTime;
          uniform vec3 uLantern;
          varying float vTip;`
        )
        .replace(
          '#include <project_vertex>',
          /* glsl */ `
          vec4 mvPosition = vec4( transformed, 1.0 );
          vec3 gRoot = vec3( 0.0 );
          float gH = 1.0;
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
            gRoot = instanceMatrix[ 3 ].xyz;
            gH = length( instanceMatrix[ 1 ].xyz );
          #endif
          float gTip = position.y;
          vTip = gTip;
          float gw = sin( uTime * 1.6 + gRoot.x * 0.33 + gRoot.z * 0.21 ) * 0.55
                   + sin( uTime * 0.83 + gRoot.x * 0.12 - gRoot.z * 0.19 ) * 0.45;
          float gust = smoothstep( 0.3, 1.0, sin( uTime * 0.31 + gRoot.x * 0.045 + gRoot.z * 0.02 ) * 0.5 + 0.5 );
          vec2 gBend = vec2( 0.85, 0.4 ) * ( 0.1 + 0.1 * gw + 0.28 * gust * ( 0.6 + 0.4 * gw ) );
          vec2 gAway = gRoot.xz - uLantern.xz;
          float gD = length( gAway );
          float gNear = smoothstep( 2.6, 0.2, gD ) * smoothstep( 4.0, 1.0, abs( uLantern.y - gRoot.y ) );
          gBend += ( gAway / max( gD, 1e-3 ) ) * gNear * 0.9;
          float gk = gTip * gTip;
          mvPosition.xz += gBend * gk * gH;
          mvPosition.y -= dot( gBend, gBend ) * gk * gH * 0.45;
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;
          `
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform vec3 uMoonDir;
          varying float vTip;`
        )
        .replace(
          '#include <normal_fragment_begin>',
          THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_FOG
            vec3 gView = normalize( vFogWorldPos - cameraPosition );
            float back = pow( max( dot( gView, uMoonDir ), 0.0 ), 12.0 );
            totalEmissiveRadiance += vec3( 0.35, 0.42, 0.7 ) * back * vTip * vTip * 0.035;
          #endif`
        );
    },
    'grass'
  );

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  const palette = [
    new THREE.Color().setRGB(0.24, 0.26, 0.11),
    new THREE.Color().setRGB(0.32, 0.26, 0.12),
    new THREE.Color().setRGB(0.2, 0.16, 0.09),
    new THREE.Color().setRGB(0.16, 0.21, 0.1),
  ];

  let placed = 0;
  let guard = 0;
  const R = 40;
  const cz = -4;
  while (placed < count && guard < count * 6) {
    guard++;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * R;
    const x = Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const pd = pathDist(x, z);
    if (pd < 1.1 && rand() > 0.12) continue;
    if (inGraveyard(x, z, 0) && rand() > 0.55) continue;
    if (Math.hypot(x - KING_POS.x, z - KING_POS.z) < 1.6) continue;
    const patch = noise.fbm2(x * 0.09, z * 0.09, 3) * 0.5 + 0.5;
    if (rand() > 0.35 + patch * 0.9) continue;
    const tall = smoothstep(0.45, 0.85, patch);
    const h = (0.28 + rand() * 0.35 + tall * 0.55) * (pd < 1.6 ? 0.55 : 1);
    const w = 0.035 + rand() * 0.04;
    p.set(x, heightAt(x, z) - 0.02, z);
    e.set((rand() - 0.5) * 0.35, rand() * Math.PI * 2, (rand() - 0.5) * 0.35);
    q.setFromEuler(e);
    s.set(w, h, w);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    color.copy(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.75 + rand() * 0.5);
    mesh.setColorAt(placed, color);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  return { mesh, uniforms };
}
