import * as THREE from 'three';
import { withFog } from '../shaders/fog.js';
import { GlowPoints } from '../fx/glowpoints.js';
import { damp, lerp } from '../util/math.js';

// Bat silhouette: body + two scalloped wings. Head points to +z. aWing = side * (distance from body).
function batGeometry() {
  const pos = [];
  const wing = [];
  const idx = [];
  const add = (x, y, z, w) => {
    pos.push(x, y, z);
    wing.push(w);
    return pos.length / 3 - 1;
  };
  // wing outline (right side, x > 0), leading edge at +z, scalloped trailing edge at -z
  // shoulder -> wrist -> finger tips with scalloped membrane between them -> back to the body
  const outline = [
    [0.05, 0.06], [0.2, 0.13], [0.36, 0.17], [0.52, 0.1], [0.78, -0.02],
    [0.62, -0.06], [0.62, -0.21], [0.5, -0.14], [0.44, -0.28], [0.32, -0.16],
    [0.22, -0.25], [0.13, -0.13], [0.05, -0.13],
  ];
  for (const side of [1, -1]) {
    const c = add(0.04 * side, 0, 0, 0);
    const ring = outline.map(([x, z]) => add(x * side, 0, z, side * Math.min(1, x / 0.78)));
    for (let i = 0; i < ring.length - 1; i++) {
      if (side > 0) idx.push(c, ring[i], ring[i + 1]);
      else idx.push(c, ring[i + 1], ring[i]);
    }
  }
  // body
  const b0 = add(0, 0.03, 0.2, 0);
  const b1 = add(0.06, 0, 0.05, 0);
  const b2 = add(0, -0.02, -0.18, 0);
  const b3 = add(-0.06, 0, 0.05, 0);
  const b4 = add(0, 0.05, 0.02, 0);
  idx.push(b0, b1, b4, b0, b4, b3, b4, b1, b2, b4, b2, b3, b0, b3, b2, b0, b2, b1);
  // ears
  const e0 = add(0.03, 0.05, 0.16, 0);
  const e1 = add(0.05, 0.13, 0.15, 0);
  const e2 = add(0.01, 0.05, 0.12, 0);
  const e3 = add(-0.03, 0.05, 0.16, 0);
  const e4 = add(-0.05, 0.13, 0.15, 0);
  const e5 = add(-0.01, 0.05, 0.12, 0);
  idx.push(e0, e1, e2, e3, e5, e4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Bats {
  constructor(env, count = 64) {
    this.env = env;
    this.count = count;
    const geo = batGeometry();
    const phase = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      phase[i * 2] = Math.random() * 10;
      phase[i * 2 + 1] = 13 + Math.random() * 6;
    }
    geo.setAttribute('aBat', new THREE.InstancedBufferAttribute(phase, 2));
    const mat = withFog(
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.012, 0.008, 0.016), side: THREE.DoubleSide }),
      (shader) => {
        shader.uniforms.uTime = env.uniforms.uTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWing;\nattribute vec2 aBat;')
          .replace(
            '#include <begin_vertex>',
            /* glsl */ `#include <begin_vertex>
            float side = sign(aWing);
            float w = abs(aWing);
            float flap = sin(uTime * aBat.y + aBat.x);
            float a = (flap * 0.95 + flap * 0.55 * w) * side * step(0.001, w);
            vec3 tp = transformed;
            float ca = cos(a);
            float sa = sin(a);
            transformed.x = tp.x * ca - tp.y * sa;
            transformed.y = tp.x * sa + tp.y * ca;
            transformed.y -= flap * 0.04;`
          );
      },
      'bat'
    );
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.bats = [];
    for (let i = 0; i < count; i++) {
      this.bats.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        radius: 6 + Math.random() * 10,
        speed: (0.35 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1),
        angle: Math.random() * Math.PI * 2,
        height: Math.random() * 8,
        scale: 1.3 + Math.random() * 0.8,
        mode: 'circle',
        delay: 0,
        swarmTarget: new THREE.Vector3(),
        seed: Math.random() * 100,
      });
    }
    this.eyes = new GlowPoints(count);
    this.center = new THREE.Vector3();
    this.dummy = new THREE.Object3D();
    this.fwd = new THREE.Vector3();
    this.initialised = false;
  }

  setHome(center) {
    this.center.copy(center);
    if (!this.initialised) {
      for (const b of this.bats) {
        b.pos.set(center.x + Math.cos(b.angle) * b.radius, center.y + b.height, center.z + Math.sin(b.angle) * b.radius);
      }
      this.initialised = true;
    }
  }

  // Send the colony swooping over the field (toward the camera), then home again.
  swarm(camera, intensity = 1) {
    const n = Math.floor(this.count * Math.min(1, 0.55 + intensity * 0.45));
    for (let i = 0; i < n; i++) {
      const b = this.bats[i];
      b.mode = 'swarm';
      b.delay = Math.random() * 1.4;
      const side = new THREE.Vector3((Math.random() - 0.5) * 30, 4 + Math.random() * 7, (Math.random() - 0.5) * 10);
      b.swarmTarget.copy(camera.position).lerp(new THREE.Vector3(-1, 0, -4), 0.62).add(side);
      b.passT = 0;
    }
  }

  update(dt, t) {
    const d = this.dummy;
    const steer = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const b = this.bats[i];
      let target;
      let speed;
      if (b.mode === 'swarm') {
        if (b.delay > 0) {
          b.delay -= dt;
          target = null;
        } else {
          target = b.swarmTarget;
          speed = 15;
          const dist = b.pos.distanceTo(b.swarmTarget);
          if (dist < 4) {
            b.passT = (b.passT || 0) + dt;
            if (b.passT > 0.3) b.mode = 'return';
          }
        }
      }
      if (b.mode === 'return' || b.mode === 'circle' || target === null) {
        b.angle += b.speed * dt * 0.6;
        const wob = Math.sin(t * 0.7 + b.seed) * 2;
        target = steer.set(
          this.center.x + Math.cos(b.angle) * (b.radius + wob),
          this.center.y + b.height + Math.sin(t * 1.3 + b.seed) * 1.5,
          this.center.z + Math.sin(b.angle) * (b.radius + wob)
        ).clone();
        speed = b.mode === 'return' ? 12 : 7;
        if (b.mode === 'return' && b.pos.distanceTo(target) < 8) b.mode = 'circle';
      }
      const desired = target.clone().sub(b.pos);
      const dist = desired.length();
      desired.normalize().multiplyScalar(speed);
      // jittery bat flight
      desired.x += Math.sin(t * 5.1 + b.seed) * 2.2;
      desired.y += Math.sin(t * 6.3 + b.seed * 1.7) * 1.8;
      desired.z += Math.cos(t * 4.7 + b.seed) * 2.2;
      const k = b.mode === 'swarm' ? 2.6 : 1.8;
      b.vel.x = damp(b.vel.x, desired.x, k, dt);
      b.vel.y = damp(b.vel.y, desired.y, k, dt);
      b.vel.z = damp(b.vel.z, desired.z, k, dt);
      b.pos.addScaledVector(b.vel, dt);
      if (dist < 0.01) b.pos.add(new THREE.Vector3(0.1, 0, 0));
      d.position.copy(b.pos);
      d.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y * 0.5, b.pos.z + b.vel.z);
      d.rotateZ(Math.sin(t * 2 + b.seed) * 0.4 - b.vel.x * 0.02);
      d.scale.setScalar(b.scale * lerp(1, 0.75, b.mode === 'swarm' ? 1 : 0));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      const f = this.fwd.set(0, 0, 1).applyQuaternion(d.quaternion);
      const s = d.scale.x;
      const blink = Math.sin(t * 0.9 + b.seed * 3) > 0.96 ? 0.1 : 1;
      this.eyes.set(i, b.pos.x + f.x * 0.17 * s, b.pos.y + 0.03 * s + f.y * 0.17 * s, b.pos.z + f.z * 0.17 * s, 2.6, 0.35, 0.12, 0.07 * s, blink);
    }
    this.eyes.commit(this.count);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
