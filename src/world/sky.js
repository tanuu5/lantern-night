import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/glsl.js';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uFogColor;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform float uFinale;
uniform float uFlash;
uniform float uMoonR;
uniform float uScatter;
varying vec3 vDir;

${NOISE_GLSL}

float sdEqTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float md = dot(d, uMoonDir);

  // --- base gradient + faint nebula
  vec3 col = mix(uMid, uZenith, smoothstep(0.02, 0.6, h));
  float neb = fbm3(d * 2.6 + vec3(0.0, 0.0, uTime * 0.004));
  col += vec3(0.022, 0.006, 0.04) * smoothstep(0.42, 0.8, neb) * smoothstep(0.08, 0.5, h);
  col = mix(col, col * vec3(1.6, 0.8, 0.5) + vec3(0.02, 0.004, 0.0), uFinale * 0.5 * (1.0 - smoothstep(0.0, 0.5, h)));

  // --- stars
  float stars = 0.0;
  for (int L = 0; L < 2; L++) {
    float scale = L == 0 ? 120.0 : 230.0;
    float thresh = L == 0 ? 0.962 : 0.93;
    vec3 sp = d * scale;
    vec3 cell = floor(sp);
    vec3 f = fract(sp);
    float rnd = hash13(cell + float(L) * 17.0);
    if (rnd > thresh) {
      vec3 off = vec3(hash13(cell + 3.1), hash13(cell + 7.7), hash13(cell + 11.3)) * 0.6 + 0.2;
      float dist = length(f - off);
      float bright = (rnd - thresh) / (1.0 - thresh);
      float tw = 0.6 + 0.4 * sin(uTime * (1.3 + bright * 4.0) + rnd * 91.0);
      stars += smoothstep(0.17, 0.0, dist) * (0.35 + 1.8 * bright * bright) * tw;
    }
  }

  // --- horizon haze (matches fog colour so geometry melts into the sky)
  float mdp = max(md, 0.0);
  vec3 haze = uFogColor + uMoonColor * uScatter * (pow(mdp, 14.0) + pow(mdp, 3.0) * 0.12);
  float hazeAmt = 1.0 - smoothstep(-0.04, 0.3, h);

  // --- moon glow
  float ang = acos(clamp(md, -1.0, 1.0));
  vec3 glowCol = mix(uMoonColor, vec3(1.0, 0.45, 0.12) * 0.6, uFinale);
  vec3 glow = glowCol * (1.1 * exp(-ang * 16.0) + 0.38 * exp(-ang * 4.0));

  // --- moon disc
  vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, uMoonDir);
  vec2 q = vec2(dot(d, right), dot(d, up)) / uMoonR;
  float r = length(q);
  float disc = md > 0.0 ? smoothstep(1.0, 0.985, r) : 0.0;
  vec3 moon = vec3(0.0);
  if (disc > 0.0) {
    vec3 n = vec3(q, sqrt(max(1.0 - dot(q, q), 0.0)));
    float maria = smoothstep(0.42, 0.66, fbm2(q * 1.5 + 4.0));
    float crat = 0.0;
    for (int k = 0; k < 2; k++) {
      float sc = k == 0 ? 4.0 : 8.5;
      vec2 cq = q * sc;
      vec2 ci = floor(cq);
      vec2 cf = fract(cq) - 0.5;
      float hr = hash12(ci + float(k) * 5.0);
      if (hr > 0.5) {
        vec2 co = (vec2(hash12(ci + 1.7), hash12(ci + 9.1)) - 0.5) * 0.45;
        float cr = 0.16 + 0.2 * hash12(ci + 3.3);
        float dd = length(cf - co) / cr;
        crat += -0.22 * smoothstep(1.0, 0.6, dd) + 0.2 * smoothstep(0.75, 1.0, dd) * smoothstep(1.25, 1.0, dd);
      }
    }
    float tex = 0.84 - 0.24 * maria + crat * 0.55 + (fbm2(q * 7.0) - 0.5) * 0.14;
    float limb = pow(max(n.z, 0.0), 0.32);
    moon = vec3(1.0, 0.95, 0.84) * tex * limb * 2.5;

    if (uFinale > 0.001) {
      vec3 orange = vec3(1.0, 0.4, 0.07) * tex * limb * 1.15;
      moon = mix(moon, orange, uFinale);
      vec2 pe = vec2(abs(q.x), q.y);
      float eye = sdEqTri((pe - vec2(0.36, 0.2)) * vec2(1.0, 1.15), 0.2);
      float nose = sdEqTri((q - vec2(0.0, -0.06)) * vec2(1.0, 1.2), 0.085);
      float mouthA = length(q - vec2(0.0, 0.32)) - 0.78;
      float mouthB = length(q - vec2(0.0, 0.6)) - 0.82;
      float mouth = max(max(mouthA, -mouthB), abs(q.x) - 0.64);
      float teeth = min(sdBox(pe - vec2(0.22, -0.3), vec2(0.06, 0.07)), sdBox(q - vec2(0.0, -0.47), vec2(0.07, 0.06)));
      mouth = max(mouth, -teeth);
      float face = min(min(eye, nose), mouth);
      float fm = smoothstep(0.015, -0.015, face) * smoothstep(0.0, 0.6, uFinale);
      float fl = 0.85 + 0.15 * sin(uTime * 13.0) * sin(uTime * 7.3);
      float rim = smoothstep(0.05, 0.0, face) * (1.0 - fm) * smoothstep(0.0, 0.6, uFinale);
      moon += vec3(1.6, 0.6, 0.08) * rim;
      moon = mix(moon, vec3(7.0, 4.2, 1.2) * fl, fm);
    }
  }

  // --- clouds (thin, drifting, silver-lined near the moon)
  float cl = 0.0;
  if (h > -0.03) {
    vec2 cuv = d.xz / (h + 0.2) * 1.15 + vec2(uTime * 0.011, uTime * 0.0035);
    float c1 = fbm2(cuv * 0.75);
    float c2 = fbm2(cuv * 2.2 + 5.2);
    cl = smoothstep(0.5, 0.8, c1 * 0.78 + c2 * 0.32);
    cl *= smoothstep(-0.03, 0.1, h) * (1.0 - 0.6 * smoothstep(0.45, 0.95, h));
  }

  col += vec3(0.85, 0.88, 1.0) * stars * (1.0 - hazeAmt) * (1.0 - cl);
  col = mix(col, haze, hazeAmt);
  col += glow;
  col = mix(col, moon, disc);

  float lit = pow(max(md, 0.0), 30.0);
  vec3 cloudDark = mix(vec3(0.012, 0.009, 0.026), uFogColor * 0.7, hazeAmt);
  vec3 cloudLit = glowCol * 2.2;
  vec3 cloudCol = mix(cloudDark, cloudLit, lit * (1.0 - cl * 0.75));
  col = mix(col, cloudCol + glow * 0.35, cl * 0.9);

  col += vec3(0.5, 0.56, 0.95) * uFlash * (0.25 + 0.75 * smoothstep(-0.05, 0.5, h)) * (0.55 + 0.6 * cl);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

export function createSky(env) {
  const uniforms = {
    uTime: env.uniforms.uTime,
    uMoonDir: { value: env.moonDir },
    uMoonColor: { value: env.moonGlow },
    uFogColor: { value: env.fogColor },
    uZenith: { value: new THREE.Color().setRGB(0.004, 0.003, 0.016) },
    uMid: { value: new THREE.Color().setRGB(0.028, 0.018, 0.07) },
    uFinale: { value: 0 },
    uFlash: { value: 0 },
    uMoonR: { value: 0.078 },
    uScatter: { value: 0.45 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 64, 32), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms,
    update(camera) {
      mesh.position.copy(camera.position);
    },
  };
}
