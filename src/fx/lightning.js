import * as THREE from 'three';
import { TubeBuilder } from '../util/tube.js';

// Distant forked lightning with a flickering flash that lights the whole sky.
function boltPoints(a, b, depth, rough) {
  let pts = [a.clone(), b.clone()];
  let disp = a.distanceTo(b) * rough;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const mid = p.clone().lerp(q, 0.5);
      mid.x += (Math.random() - 0.5) * disp;
      mid.y += (Math.random() - 0.5) * disp * 0.4;
      mid.z += (Math.random() - 0.5) * disp * 0.6;
      next.push(mid, q);
    }
    pts = next;
    disp *= 0.55;
  }
  return pts;
}

export class Lightning {
  constructor(env) {
    this.env = env;
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(6, 6.5, 12), transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -4;
    this.time = 99;
    this.pulses = [];
    this.flash = 0;
  }

  strike(camera) {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dist = 170 + Math.random() * 60;
    const lateral = (Math.random() - 0.5) * dist * 0.9;
    const base = camera.position.clone().addScaledVector(fwd, dist).addScaledVector(side, lateral);
    const top = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, 95 + Math.random() * 30, (Math.random() - 0.5) * 20));
    base.y = 5;
    const tb = new TubeBuilder();
    const main = boltPoints(top, base, 7, 0.28);
    const r = 0.55;
    tb.add(main, main.map((_, i) => r * (1 - (i / main.length) * 0.5)), 4, false);
    const branches = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < branches; k++) {
      const i = Math.floor(main.length * (0.15 + Math.random() * 0.55));
      const s = main[i];
      const e = s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 50, -20 - Math.random() * 35, (Math.random() - 0.5) * 20));
      const bp = boltPoints(s, e, 5, 0.3);
      tb.add(bp, bp.map((_, j) => r * 0.5 * (1 - j / bp.length)), 3, false);
    }
    this.mesh.geometry.dispose();
    this.mesh.geometry = tb.build();
    this.time = 0;
    // flicker pattern: [start, duration, strength]
    this.pulses = [[0, 0.07, 1], [0.11, 0.05, 0.6], [0.2, 0.12, 0.95], [0.38, 0.05, 0.35]];
    return base;
  }

  update(dt) {
    this.time += dt;
    let f = 0;
    for (const [s, d, k] of this.pulses) {
      if (this.time >= s && this.time < s + d + 0.25) {
        const local = this.time - s;
        f = Math.max(f, local < d ? k : k * Math.exp(-(local - d) * 14));
      }
    }
    this.flash = f;
    this.mat.opacity = Math.min(1, f * 1.3);
    this.mesh.visible = f > 0.01;
    this.env.flash.value = f;
  }
}
