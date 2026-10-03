import * as THREE from 'three';
import { GlowPoints } from '../fx/glowpoints.js';
import { damp, clamp, easeInOutCubic } from '../util/math.js';

// The player's will-o'-wisp. It follows the cursor across the ground,
// lights its surroundings, and flies into pumpkins to ignite them.
const TRAIL = 16;

export class Onibi {
  constructor(env) {
    this.env = env;
    this.color = env.lanternColor;
    this.pos = new THREE.Vector3(0, 2, 6);
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3(0, 2, 6);
    this.trail = Array.from({ length: TRAIL }, () => this.pos.clone());
    this.gp = new GlowPoints(TRAIL + 8);
    this.points = this.gp.points;
    this.light = new THREE.PointLight(this.color, 12, 18, 2);
    this.light.castShadow = false;
    this.flight = null;
    this.pulse = 0;
  }

  // Arc flight to a world point; onArrive fires when it gets there.
  flyTo(point, onArrive) {
    const from = this.pos.clone();
    const mid = from.clone().lerp(point, 0.5);
    mid.y = Math.max(from.y, point.y) + 2.2 + from.distanceTo(point) * 0.12;
    const dur = clamp(0.35 + from.distanceTo(point) * 0.035, 0.45, 1.0);
    this.flight = { from, mid, to: point.clone(), t: 0, dur, onArrive };
  }

  get busy() {
    return this.flight !== null;
  }

  update(dt, t) {
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const k = easeInOutCubic(clamp(f.t / f.dur, 0, 1));
      const a = f.from.clone().lerp(f.mid, k);
      const b = f.mid.clone().lerp(f.to, k);
      const prev = this.pos.clone();
      this.pos.copy(a.lerp(b, k));
      this.vel.copy(this.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
      if (f.t >= f.dur) {
        this.flight = null;
        this.pulse = 1;
        if (f.onArrive) f.onArrive();
      }
    } else {
      const tx = this.target.x + Math.sin(t * 1.3) * 0.08;
      const ty = this.target.y + Math.sin(t * 2.1) * 0.12;
      const tz = this.target.z + Math.cos(t * 1.7) * 0.08;
      const ax = (tx - this.pos.x) * 28 - this.vel.x * 8.5;
      const ay = (ty - this.pos.y) * 28 - this.vel.y * 8.5;
      const az = (tz - this.pos.z) * 28 - this.vel.z * 8.5;
      this.vel.x += ax * dt;
      this.vel.y += ay * dt;
      this.vel.z += az * dt;
      const sp = this.vel.length();
      if (sp > 40) this.vel.multiplyScalar(40 / sp);
      this.pos.addScaledVector(this.vel, dt);
    }
    this.pulse = damp(this.pulse, 0, 3, dt);

    this.trail[0].copy(this.pos);
    for (let k = TRAIL - 1; k > 0; k--) this.trail[k].lerp(this.trail[k - 1], Math.min(1, dt * 26));

    const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 9.7);
    const c = this.color;
    let n = 0;
    const core = 2.4 + this.pulse * 3;
    this.gp.set(n++, this.pos.x, this.pos.y, this.pos.z, 1.6 * core, 1.8 * core, 1.7 * core, 0.16 * flick, 1);
    this.gp.set(n++, this.pos.x, this.pos.y, this.pos.z, c.r * core, c.g * core, c.b * core, (0.55 + this.pulse * 0.8) * flick, 0.9);
    for (let k = 1; k < TRAIL; k++) {
      const f = 1 - k / TRAIL;
      const p = this.trail[k];
      const spread = Math.min(1, p.distanceTo(this.pos) / (0.12 * k));
      this.gp.set(n++, p.x, p.y + k * 0.015, p.z, c.r * 1.8, c.g * 1.8, c.b * 1.8, 0.34 * f, f * 0.7 * spread);
    }
    for (let k = 0; k < 5; k++) {
      const a = t * (2.2 + k * 0.4) + k * 1.3;
      const r = 0.38 + 0.08 * Math.sin(t * 3 + k);
      this.gp.set(n++, this.pos.x + Math.cos(a) * r, this.pos.y + Math.sin(a * 1.3) * 0.25, this.pos.z + Math.sin(a) * r, c.r * 2, c.g * 2, c.b * 2, 0.07, 0.9);
    }
    this.gp.commit(n);
    this.light.position.copy(this.pos);
    this.light.intensity = (12 + this.pulse * 30) * flick;
    this.env.lanternPos.value.copy(this.pos);
  }
}
