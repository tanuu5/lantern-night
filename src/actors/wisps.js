import * as THREE from 'three';
import { GlowPoints } from '../fx/glowpoints.js';
import { noise } from '../util/noise.js';
import { heightAt, GRAVEYARD } from '../world/layout.js';
import { damp } from '../util/math.js';

// Hitodama: little blue-green spirit flames that drift around the graveyard,
// trail comet tails, and gather around the player's onibi when it comes near.
const TRAIL = 9;

export class Wisps {
  constructor(count = 18) {
    this.count = count;
    this.gp = new GlowPoints(count * TRAIL);
    this.points = this.gp.points;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const x = GRAVEYARD.minX + Math.random() * (GRAVEYARD.maxX - GRAVEYARD.minX);
      const z = GRAVEYARD.minZ + Math.random() * (GRAVEYARD.maxZ - GRAVEYARD.minZ);
      const p = new THREE.Vector3(x, heightAt(x, z) + 0.8 + Math.random() * 1.5, z);
      const hue = Math.random();
      this.items.push({
        pos: p,
        home: p.clone(),
        vel: new THREE.Vector3(),
        trail: Array.from({ length: TRAIL }, () => p.clone()),
        seed: Math.random() * 100,
        color: new THREE.Color().setRGB(0.25 + hue * 0.25, 0.9 + hue * 0.3, 1.1 - hue * 0.25),
        orbit: Math.random() * Math.PI * 2,
        follow: 0,
      });
    }
  }

  update(dt, t, lantern, finale = 0) {
    let n = 0;
    for (const w of this.items) {
      const s = w.seed;
      // curl-ish wandering from noise
      const fx = noise.noise3D(w.pos.x * 0.15, w.pos.y * 0.15, t * 0.15 + s);
      const fy = noise.noise3D(w.pos.x * 0.15 + 31, w.pos.y * 0.15, t * 0.15 + s);
      const fz = noise.noise3D(w.pos.x * 0.15 - 17, w.pos.z * 0.15, t * 0.15 + s);
      const desired = new THREE.Vector3(fx, fy * 0.5, fz).multiplyScalar(1.6);
      // stay near home
      desired.addScaledVector(new THREE.Vector3().subVectors(w.home, w.pos), 0.25);
      const dl = w.pos.distanceTo(lantern);
      const near = dl < 5.5 && lantern.y > -50;
      w.follow = damp(w.follow, near ? 1 : 0, near ? 2 : 0.6, dt);
      if (w.follow > 0.01) {
        w.orbit += dt * (1.6 + (s % 1));
        const r = 0.9 + (s % 0.7);
        const orbitPos = new THREE.Vector3(
          lantern.x + Math.cos(w.orbit) * r,
          lantern.y + Math.sin(w.orbit * 1.7 + s) * 0.45,
          lantern.z + Math.sin(w.orbit) * r
        );
        const toOrbit = orbitPos.sub(w.pos).multiplyScalar(3.2);
        desired.lerp(toOrbit, w.follow);
      }
      w.vel.x = damp(w.vel.x, desired.x, 2.2, dt);
      w.vel.y = damp(w.vel.y, desired.y, 2.2, dt);
      w.vel.z = damp(w.vel.z, desired.z, 2.2, dt);
      w.pos.addScaledVector(w.vel, dt);
      const gy = heightAt(w.pos.x, w.pos.z) + 0.35;
      if (w.pos.y < gy) w.pos.y = gy;

      w.trail[0].copy(w.pos);
      for (let k = TRAIL - 1; k > 0; k--) w.trail[k].lerp(w.trail[k - 1], Math.min(1, dt * 22));

      const flick = 0.75 + 0.25 * Math.sin(t * 17 + s * 5) * Math.sin(t * 7.1 + s);
      const c = w.color;
      const boost = 1.6 + finale * 1.5;
      for (let k = 0; k < TRAIL; k++) {
        const f = (1 - k / TRAIL) * (k === 0 ? 1 : Math.min(1, w.trail[k].distanceTo(w.pos) / (0.06 * k)));
        const p = w.trail[k];
        this.gp.set(n++, p.x, p.y + k * 0.012, p.z, c.r * boost, c.g * boost, c.b * boost, (k === 0 ? 0.22 : 0.15 * f) * (0.8 + 0.2 * flick), (k === 0 ? 1 : f * 0.55) * flick);
      }
    }
    this.gp.commit(n);
  }
}
