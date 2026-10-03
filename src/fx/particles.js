import * as THREE from 'three';
import { GlowPoints } from './glowpoints.js';
import { heightAt } from '../world/layout.js';

// Pooled CPU particle system rendered as glow points (sparks, embers, magic dust, firework stars).
export class Particles {
  constructor(capacity = 6000) {
    this.cap = capacity;
    this.gp = new GlowPoints(capacity);
    this.points = this.gp.points;
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.c = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.flick = new Float32Array(capacity);
    this.bounce = new Uint8Array(capacity);
    this.n = 0;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0.5, flick = 0, bounce = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const i3 = i * 3;
    this.p[i3] = x;
    this.p[i3 + 1] = y;
    this.p[i3 + 2] = z;
    this.v[i3] = vx;
    this.v[i3 + 1] = vy;
    this.v[i3 + 2] = vz;
    this.c[i3] = r;
    this.c[i3 + 1] = g;
    this.c[i3 + 2] = b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.flick[i] = flick;
    this.bounce[i] = bounce;
  }

  // Burst helper. colors: array of THREE.Color (HDR allowed).
  burst(pos, { count = 40, speed = 3, spread = 1, up = 0.5, colors, size = [0.04, 0.09], life = [0.6, 1.4], grav = -3, drag = 1.2, flick = 0.5, bounce = 0, radius = 0 }) {
    const dir = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (dir.lengthSq() > 1) {
        k--;
        continue;
      }
      dir.normalize();
      dir.y = dir.y * spread + up;
      const s = speed * (0.35 + Math.random() * 0.65);
      const col = colors[Math.floor(Math.random() * colors.length)];
      const r0 = radius * Math.random();
      this.spawn(
        pos.x + dir.x * r0, pos.y + dir.y * r0, pos.z + dir.z * r0,
        dir.x * s, dir.y * s, dir.z * s,
        col.r, col.g, col.b,
        size[0] + Math.random() * (size[1] - size[0]),
        life[0] + Math.random() * (life[1] - life[0]),
        grav, drag, flick, bounce
      );
    }
  }

  update(dt, t) {
    let i = 0;
    const gp = this.gp;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const last = --this.n;
        if (i !== last) this.copy(last, i);
        continue;
      }
      const i3 = i * 3;
      const dragK = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= dragK;
      this.v[i3 + 1] = this.v[i3 + 1] * dragK + this.grav[i] * dt;
      this.v[i3 + 2] *= dragK;
      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.bounce[i]) {
        const gy = heightAt(this.p[i3], this.p[i3 + 2]) + 0.03;
        if (this.p[i3 + 1] < gy) {
          this.p[i3 + 1] = gy;
          this.v[i3 + 1] = Math.abs(this.v[i3 + 1]) * 0.35;
          this.v[i3] *= 0.6;
          this.v[i3 + 2] *= 0.6;
        }
      }
      const k = this.life[i] / this.maxLife[i];
      const fade = Math.min(1, k * 3) * Math.min(1, (1 - k) * 12 + 0.2);
      const fl = this.flick[i] > 0 ? 1 - this.flick[i] * (0.5 + 0.5 * Math.sin(t * 40 + i * 1.7)) : 1;
      gp.set(i, this.p[i3], this.p[i3 + 1], this.p[i3 + 2], this.c[i3], this.c[i3 + 1], this.c[i3 + 2], this.size[i] * (0.6 + 0.4 * k), fade * fl);
      i++;
    }
    gp.commit(this.n);
  }

  copy(from, to) {
    const f3 = from * 3;
    const t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.p[t3 + k] = this.p[f3 + k];
      this.v[t3 + k] = this.v[f3 + k];
      this.c[t3 + k] = this.c[f3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.flick[to] = this.flick[from];
    this.bounce[to] = this.bounce[from];
  }
}
