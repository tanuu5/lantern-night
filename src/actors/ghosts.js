import * as THREE from 'three';
import { fogShaderUniforms } from '../shaders/fog.js';
import { heightAt, KING_POS } from '../world/layout.js';
import { clamp, damp, lerp, smoothstep, easeOutCubic } from '../util/math.js';

// Classic bed-sheet ghosts: lathe body, rippling hem, fresnel glow, painted face.
function ghostGeometry() {
  const pts = [];
  const top = 24;
  for (let i = 0; i <= top; i++) {
    const a = (i / top) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * 0.52 + 0.0001, 0.5 + Math.cos(a) * 0.52));
  }
  const body = 22;
  for (let i = 1; i <= body; i++) {
    const t = i / body;
    pts.push(new THREE.Vector2(0.52 + 0.14 * Math.pow(t, 1.6), 0.5 - t * 1.45));
  }
  const g = new THREE.LatheGeometry(pts, 64);
  return g;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uPhase;
uniform float uBoo;
uniform float uWiggle;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  vLocal = position;
  float ang = atan(p.z, p.x);
  float below = smoothstep(0.4, -0.95, p.y);
  float wave = sin(ang * 6.0 + uTime * 3.2 + uPhase);
  p.xz *= 1.0 + below * (0.09 * wave + 0.14 * below) + uBoo * 0.12 * below;
  p.y += below * below * 0.11 * sin(ang * 7.0 - uTime * 2.6 + uPhase);
  p.x += sin(uTime * 1.4 + uPhase + p.y * 1.6) * 0.1 * below * (1.0 + uWiggle);
  p.z += cos(uTime * 1.1 + uPhase + p.y * 1.3) * 0.07 * below;
  // little arms
  float arm = smoothstep(0.35, 0.0, abs(p.y - 0.05)) * smoothstep(0.2, 0.5, abs(p.x)) * (1.0 - smoothstep(0.0, 0.4, abs(p.z)));
  p.x += sign(p.x) * arm * (0.16 + 0.05 * sin(uTime * 4.0 + uPhase) + uBoo * 0.25);
  p.y += arm * (0.06 * sin(uTime * 4.0 + uPhase) + uBoo * 0.35);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBoo;
uniform float uBlink;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uRim;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
#include <fog_pars_fragment>
void main() {
  vec3 n = normalize(vNormalW);
  float fres = 1.0 - abs(dot(n, normalize(vViewDir)));
  fres = pow(fres, 2.2);
  float shimmer = 0.92 + 0.08 * sin(vLocal.y * 14.0 - uTime * 3.0);
  vec3 col = uColor * (0.5 + 0.35 * smoothstep(-0.9, 1.0, vLocal.y)) * shimmer + uRim * fres * 1.6;
  float alpha = (0.42 + 0.5 * fres) * uOpacity;
  alpha *= smoothstep(-1.05, -0.75, vLocal.y) * 0.6 + 0.4;

  float face = 0.0;
  if (vLocal.z > 0.0) {
    vec2 q = vLocal.xy;
    float eyeH = mix(0.105, 0.012, uBlink) * (1.0 + uBoo * 0.35);
    float e1 = length((q - vec2(-0.17, 0.56)) / vec2(0.072, eyeH));
    float e2 = length((q - vec2(0.17, 0.56)) / vec2(0.072, eyeH));
    vec2 mr = mix(vec2(0.065, 0.05), vec2(0.13, 0.17), uBoo);
    float m = length((q - vec2(0.0, 0.33 - uBoo * 0.05)) / mr);
    float d = min(min(e1, e2), m);
    face = smoothstep(1.0, 0.82, d);
  }
  col = mix(col, vec3(0.01, 0.0, 0.02), face);
  alpha = mix(alpha, 0.96 * uOpacity, face);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

const GEO = ghostGeometry();
const PROXY_GEO = new THREE.SphereGeometry(0.85, 10, 8);

class Ghost {
  constructor(env, id) {
    this.id = id;
    this.uniforms = {
      ...fogShaderUniforms(),
      uTime: env.uniforms.uTime,
      uPhase: { value: Math.random() * 10 },
      uBoo: { value: 0 },
      uBlink: { value: 0 },
      uWiggle: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color().setRGB(0.62, 0.68, 0.95) },
      uRim: { value: new THREE.Color().setRGB(0.55, 0.75, 1.3) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(GEO, mat);
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
    this.proxy = new THREE.Mesh(PROXY_GEO, new THREE.MeshBasicMaterial());
    this.proxy.visible = false;
    this.proxy.position.y = 0.1;
    this.proxy.userData.ghost = this;
    this.group.add(this.proxy);
    this.group.visible = false;
    this.state = 'off';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.timer = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.scale = 1;
    this.danceAngle = 0;
  }
}

export class Ghosts {
  constructor(env, tombs, max = 10) {
    this.env = env;
    this.tombs = tombs;
    this.group = new THREE.Group();
    this.list = [];
    for (let i = 0; i < max; i++) {
      const g = new Ghost(env, i);
      this.list.push(g);
      this.group.add(g.group);
    }
    this.proxies = this.list.map((g) => g.proxy);
    this.onPop = null;
    this.onSpawn = null;
    this.dancing = false;
    this.tmp = new THREE.Vector3();
  }

  get active() {
    return this.list.filter((g) => g.state !== 'off');
  }

  spawn() {
    const g = this.list.find((x) => x.state === 'off');
    if (!g) return null;
    const tomb = this.tombs[Math.floor(Math.random() * this.tombs.length)];
    g.pos.copy(tomb.position).addScaledVector(tomb.front, 0.7);
    g.pos.y = heightAt(g.pos.x, g.pos.z) - 1.2;
    g.vel.set(0, 0, 0);
    g.state = 'rising';
    g.timer = 0;
    g.scale = 0.85 + Math.random() * 0.35;
    g.yaw = Math.atan2(tomb.front.x, tomb.front.z);
    g.group.visible = true;
    g.uniforms.uOpacity.value = 0;
    g.uniforms.uBoo.value = 0;
    this.pickTarget(g);
    if (this.onSpawn) this.onSpawn(g);
    return g;
  }

  pickTarget(g) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 13;
    g.target.set(Math.cos(a) * r - 2, 0, Math.sin(a) * r * 0.8 - 2);
  }

  boo(g) {
    if (g.state === 'boo' || g.state === 'off' || g.state === 'rising') return false;
    g.state = 'boo';
    g.timer = 0;
    g.popped = false;
    return true;
  }

  startDance() {
    this.dancing = true;
    const act = this.list.filter((g) => g.state === 'wander' || g.state === 'rising');
    act.forEach((g, i) => {
      g.state = 'dance';
      g.danceAngle = (i / Math.max(1, act.length)) * Math.PI * 2;
    });
  }

  stopDance() {
    this.dancing = false;
    for (const g of this.list) if (g.state === 'dance') g.state = 'wander';
  }

  update(dt, t, lantern) {
    const dancers = this.list.filter((g) => g.state === 'dance');
    for (const g of this.list) {
      if (g.state === 'off') continue;
      g.timer += dt;
      const u = g.uniforms;
      const ground = heightAt(g.pos.x, g.pos.z);
      const hover = ground + 1.25 + Math.sin(t * 1.3 + u.uPhase.value) * 0.22;

      // blinking
      g.blinkT -= dt;
      if (g.blinkT < 0) {
        g.blinkT = 2.5 + Math.random() * 4;
      }
      u.uBlink.value = g.blinkT < 0.14 ? 1 : 0;

      let faceYaw = null;
      if (g.state === 'rising') {
        const k = clamp(g.timer / 2.4, 0, 1);
        g.pos.y = lerp(ground - 1.2, hover, easeOutCubic(k));
        u.uOpacity.value = smoothstep(0, 0.6, k);
        g.yaw += dt * 2.5 * (1 - k);
        if (k >= 1) {
          g.state = this.dancing ? 'dance' : 'wander';
          if (this.dancing) g.danceAngle = Math.random() * Math.PI * 2;
        }
      } else if (g.state === 'wander') {
        u.uOpacity.value = damp(u.uOpacity.value, 1, 2, dt);
        const to = this.tmp.set(g.target.x - g.pos.x, 0, g.target.z - g.pos.z);
        const dist = to.length();
        if (dist < 1.2 || Math.random() < dt * 0.04) this.pickTarget(g);
        to.normalize().multiplyScalar(0.9);
        // shy of the onibi: drift away but keep looking at it
        const lx = g.pos.x - lantern.x;
        const lz = g.pos.z - lantern.z;
        const ld = Math.hypot(lx, lz);
        if (ld < 3.2) {
          const push = (1 - ld / 3.2) * 2.4;
          to.x += (lx / Math.max(ld, 0.01)) * push;
          to.z += (lz / Math.max(ld, 0.01)) * push;
          faceYaw = Math.atan2(lantern.x - g.pos.x, lantern.z - g.pos.z);
          u.uWiggle.value = damp(u.uWiggle.value, 1, 4, dt);
        } else {
          u.uWiggle.value = damp(u.uWiggle.value, 0, 2, dt);
        }
        // separation
        for (const o of this.list) {
          if (o === g || o.state === 'off') continue;
          const dx = g.pos.x - o.pos.x;
          const dz = g.pos.z - o.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.8 && d > 0.001) {
            to.x += (dx / d) * (1.8 - d);
            to.z += (dz / d) * (1.8 - d);
          }
        }
        g.vel.x = damp(g.vel.x, to.x, 1.2, dt);
        g.vel.z = damp(g.vel.z, to.z, 1.2, dt);
        g.pos.x += g.vel.x * dt;
        g.pos.z += g.vel.z * dt;
        g.pos.y = damp(g.pos.y, hover, 3, dt);
      } else if (g.state === 'dance') {
        u.uOpacity.value = damp(u.uOpacity.value, 1, 2, dt);
        const idx = dancers.indexOf(g);
        const slot = (idx / Math.max(1, dancers.length)) * Math.PI * 2 + t * 0.45;
        g.danceAngle = slot;
        const R = 6.4;
        const tx = KING_POS.x + Math.cos(slot) * R;
        const tz = KING_POS.z + Math.sin(slot) * R;
        g.pos.x = damp(g.pos.x, tx, 1.5, dt);
        g.pos.z = damp(g.pos.z, tz, 1.5, dt);
        const hop = Math.abs(Math.sin(t * 3.2 + idx * 0.9)) * 0.5;
        g.pos.y = damp(g.pos.y, heightAt(g.pos.x, g.pos.z) + 2.2 + hop, 4, dt);
        faceYaw = Math.atan2(-Math.sin(slot), Math.cos(slot)) + Math.sin(t * 2 + idx) * 0.4;
        u.uWiggle.value = 1;
        u.uBoo.value = damp(u.uBoo.value, 0.35 + 0.25 * Math.sin(t * 3 + idx), 3, dt);
      } else if (g.state === 'boo') {
        const k = g.timer / 1.25;
        u.uBoo.value = damp(u.uBoo.value, 1, 10, dt);
        g.yaw += dt * (6 + k * 18);
        g.pos.y += dt * (0.6 + k * 2.2);
        g.scale = lerp(g.scale, 1.2, dt * 3) + Math.sin(g.timer * 30) * 0.02;
        if (k > 0.82 && !g.popped) {
          g.popped = true;
          if (this.onPop) this.onPop(g);
        }
        u.uOpacity.value = 1 - smoothstep(0.8, 1.0, k);
        if (k >= 1) {
          g.state = 'off';
          g.group.visible = false;
        }
      }

      if (g.state === 'wander' || g.state === 'rising') {
        const moveYaw = Math.hypot(g.vel.x, g.vel.z) > 0.15 ? Math.atan2(g.vel.x, g.vel.z) : g.yaw;
        const want = faceYaw ?? moveYaw;
        let dy = want - g.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.yaw += dy * Math.min(1, dt * 2.5);
        if (g.state === 'wander') u.uBoo.value = damp(u.uBoo.value, 0, 3, dt);
      } else if (faceYaw !== null) {
        let dy = faceYaw - g.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.yaw += dy * Math.min(1, dt * 3);
      }

      g.group.position.copy(g.pos);
      g.group.rotation.set(Math.sin(t * 1.1 + u.uPhase.value) * 0.06 - g.vel.z * 0.02, g.yaw, Math.sin(t * 0.9 + u.uPhase.value) * 0.06 + g.vel.x * 0.03);
      g.group.scale.setScalar(g.scale);
    }
  }

  clear() {
    for (const g of this.list) {
      if (g.state !== 'off' && g.state !== 'boo') {
        g.state = 'boo';
        g.timer = 0.6;
        g.popped = true;
      }
    }
  }
}
