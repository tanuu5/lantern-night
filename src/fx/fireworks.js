import * as THREE from 'three';

// Spectral fireworks for the finale. Shells rise with a sparkling trail and burst
// into rings / peonies / willows of Halloween colours.
const PALETTES = [
  [0xff7a1a, 0xffb347],
  [0x9b5cff, 0xd4b3ff],
  [0x6dff7a, 0xc8ffb0],
  [0xff7a1a, 0x9b5cff],
  [0x55e0ff, 0xb9f3ff],
  [0xffe14f, 0xff7a1a],
].map((p) => p.map((h) => new THREE.Color(h).multiplyScalar(3.2)));

export class Fireworks {
  constructor(particles) {
    this.particles = particles;
    this.shells = [];
    this.onBurst = null;
    this.onLaunch = null;
  }

  launch(origin, target) {
    const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    this.shells.push({
      p: origin.clone(),
      v: target.clone().sub(origin).multiplyScalar(1 / 1.6),
      t: 0,
      fuse: 1.6,
      pal,
      kind: Math.floor(Math.random() * 3),
    });
    if (this.onLaunch) this.onLaunch(origin);
  }

  update(dt) {
    const P = this.particles;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      s.v.y -= 2.0 * dt;
      s.p.addScaledVector(s.v, dt);
      const c = s.pal[1];
      P.spawn(s.p.x, s.p.y, s.p.z, (Math.random() - 0.5) * 0.6, -0.5, (Math.random() - 0.5) * 0.6, c.r * 0.7, c.g * 0.7, c.b * 0.7, 0.12, 0.5 + Math.random() * 0.3, -1, 1.5, 0.6);
      if (s.t >= s.fuse) {
        this.burst(s);
        this.shells.splice(i, 1);
      }
    }
  }

  burst(s) {
    const P = this.particles;
    const n = 160;
    const axis = new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
    const tmp = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      // fibonacci sphere for even spread
      const y = 1 - (k / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = k * 2.399963;
      tmp.set(Math.cos(th) * r, y, Math.sin(th) * r);
      let speed = 9 + Math.random() * 1.5;
      if (s.kind === 1) {
        // ring
        tmp.addScaledVector(axis, -tmp.dot(axis)).normalize();
        speed = 11;
      }
      const col = s.pal[k % 2];
      const willow = s.kind === 2;
      P.spawn(s.p.x, s.p.y, s.p.z, tmp.x * speed, tmp.y * speed, tmp.z * speed, col.r, col.g, col.b, willow ? 0.32 : 0.42, willow ? 3.2 : 1.9 + Math.random() * 0.6, willow ? -3.5 : -2.2, willow ? 1.2 : 1.9, 0.35);
    }
    if (this.onBurst) this.onBurst(s.p, s.pal[0]);
  }
}
