import * as THREE from 'three';
import { heightAt } from '../world/layout.js';
import { withFog } from '../shaders/fog.js';

// Autumn leaves tumbling down through the scene and settling on the ground.
function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.quadraticCurveTo(0.42, -0.2, 0.32, 0.12);
  s.lineTo(0.48, 0.18);
  s.quadraticCurveTo(0.25, 0.38, 0.0, 0.55);
  s.quadraticCurveTo(-0.25, 0.38, -0.48, 0.18);
  s.lineTo(-0.32, 0.12);
  s.quadraticCurveTo(-0.42, -0.2, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 6);
  g.scale(0.2, 0.2, 0.2);
  // slight fold along the spine
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.abs(pos.getX(i)) * 0.35);
  g.computeVertexNormals();
  return g;
}

const COLORS = [0xc2410c, 0xea580c, 0xb45309, 0x9a3412, 0xca8a04, 0x7c2d12].map((h) => new THREE.Color(h));

export class Leaves {
  constructor(count = 240) {
    this.count = count;
    const mat = withFog(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), null, 'leaf');
    this.mesh = new THREE.InstancedMesh(leafGeometry(), mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const it = { p: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), seed: Math.random() * 100, rest: 0, fall: 0, scale: 0.7 + Math.random() * 0.7 };
      this.respawn(it, true);
      this.items.push(it);
      this.mesh.setColorAt(i, COLORS[i % COLORS.length].clone().multiplyScalar(0.8 + Math.random() * 0.4));
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.dummy = new THREE.Object3D();
    this.wind = new THREE.Vector2(0.8, 0.3);
  }

  respawn(it, initial = false) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 30;
    it.p.set(Math.cos(a) * r - 2, initial ? Math.random() * 14 : 11 + Math.random() * 5, Math.min(Math.sin(a) * r - 4, 11));
    if (initial && Math.random() < 0.4) it.p.y = heightAt(it.p.x, it.p.z) + 0.03;
    it.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    it.spin.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5);
    it.fall = 0.45 + Math.random() * 0.5;
    it.rest = 0;
  }

  update(dt, t) {
    const d = this.dummy;
    const gust = 0.6 + 0.6 * Math.max(0, Math.sin(t * 0.31));
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      const gy = heightAt(it.p.x, it.p.z) + 0.03;
      if (it.rest > 0) {
        it.rest -= dt;
        if (it.rest <= 0) this.respawn(it);
      } else {
        const sway = Math.sin(t * 1.7 + it.seed) * 0.9;
        it.p.x += (this.wind.x * gust + sway * Math.cos(it.seed)) * dt;
        it.p.z += (this.wind.y * gust + sway * Math.sin(it.seed)) * dt;
        it.p.y -= it.fall * (0.8 + 0.4 * Math.sin(t * 2.3 + it.seed)) * dt;
        it.rot.x += it.spin.x * dt;
        it.rot.y += it.spin.y * dt;
        it.rot.z += it.spin.z * dt;
        if (it.p.y <= gy) {
          it.p.y = gy;
          it.rest = 6 + Math.random() * 10;
          it.rot.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3);
        }
      }
      const fade = it.rest > 0 ? Math.min(1, it.rest / 1.5) : 1;
      d.position.copy(it.p);
      if (it.rest > 0) d.position.y = gy - (1 - fade) * 0.05;
      d.rotation.copy(it.rot);
      d.scale.setScalar(it.scale * (0.3 + 0.7 * fade));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
