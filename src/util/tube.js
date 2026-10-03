import * as THREE from 'three';
import { clamp } from './math.js';

// Builds tapered tubes along polylines (parallel-transport frames) into one geometry.
// Used for tree branches, pumpkin stems, vines, witch hats and lightning bolts.
export class TubeBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.color = null;
  }

  add(points, radii, radial = 6, capEnd = true) {
    const n = points.length;
    if (n < 2) return;
    const base = this.pos.length / 3;
    const T = [];
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(n - 1, i + 1)];
      const t = new THREE.Vector3().subVectors(b, a);
      if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
      T.push(t.normalize());
    }
    const up = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const nrm = new THREE.Vector3().crossVectors(T[0], up).normalize();
    const N = [];
    const B = [];
    const axis = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        axis.crossVectors(T[i - 1], T[i]);
        const len = axis.length();
        if (len > 1e-6) {
          axis.divideScalar(len);
          const ang = Math.acos(clamp(T[i - 1].dot(T[i]), -1, 1));
          nrm.applyAxisAngle(axis, ang);
        }
      }
      N.push(nrm.clone());
      B.push(new THREE.Vector3().crossVectors(T[i], nrm).normalize());
    }

    let vAcc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) vAcc += points[i].distanceTo(points[i - 1]);
      const r = radii[i];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const dx = N[i].x * c + B[i].x * s;
        const dy = N[i].y * c + B[i].y * s;
        const dz = N[i].z * c + B[i].z * s;
        this.pos.push(points[i].x + dx * r, points[i].y + dy * r, points[i].z + dz * r);
        this.nor.push(dx, dy, dz);
        this.uv.push(j / radial, vAcc);
        if (this.color) this.col.push(this.color.r, this.color.g, this.color.b);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j;
        const b = a + radial + 1;
        this.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    if (capEnd) {
      const last = points[n - 1];
      const tip = this.pos.length / 3;
      const tr = radii[n - 1];
      this.pos.push(last.x + T[n - 1].x * tr, last.y + T[n - 1].y * tr, last.z + T[n - 1].z * tr);
      this.nor.push(T[n - 1].x, T[n - 1].y, T[n - 1].z);
      this.uv.push(0.5, vAcc + tr);
      if (this.color) this.col.push(this.color.r, this.color.g, this.color.b);
      const ring = base + (n - 1) * (radial + 1);
      for (let j = 0; j < radial; j++) this.idx.push(ring + j, ring + j + 1, tip);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
