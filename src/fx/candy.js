import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from '../world/layout.js';
import { withFog } from '../shaders/fog.js';

// When a ghost is set free it bursts into bouncing Halloween candy.
function wrappedCandy() {
  const core = new THREE.SphereGeometry(0.075, 14, 10);
  core.scale(1.45, 1, 1);
  const endA = new THREE.ConeGeometry(0.06, 0.08, 10, 1, true);
  endA.rotateZ(Math.PI / 2);
  endA.translate(0.14, 0, 0);
  const endB = endA.clone();
  endB.rotateY(Math.PI);
  return mergeGeometries([core, endA, endB].map((g) => g.toNonIndexed()));
}

function candyCorn() {
  const g = new THREE.ConeGeometry(0.075, 0.17, 10, 6);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 0.17 + 0.5;
    if (y < 0.38) c.setRGB(1.0, 0.72, 0.05);
    else if (y < 0.72) c.setRGB(1.0, 0.28, 0.02);
    else c.setRGB(1.0, 0.95, 0.85);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const COLORS = [0xff7a1a, 0x9b5cff, 0x7cff4f, 0xff4fa8, 0xffe14f, 0x4fd8ff].map((h) => new THREE.Color(h));

export class Candy {
  constructor(capacity = 220) {
    this.cap = capacity;
    const glossy = (extra) =>
      withFog(
        new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.05, vertexColors: extra }),
        (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
              totalEmissiveRadiance += vColor * 0.32;
            #endif`
          );
        },
        extra ? 'candy-corn' : 'candy'
      );
    this.wrapped = new THREE.InstancedMesh(wrappedCandy(), glossy(false), capacity);
    this.corn = new THREE.InstancedMesh(candyCorn(), glossy(true), capacity);
    for (const m of [this.wrapped, this.corn]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
    }
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < capacity; i++) this.wrapped.setColorAt(i, white);
    this.group = new THREE.Group();
    this.group.add(this.wrapped, this.corn);
    this.items = [];
    this.dummy = new THREE.Object3D();
    this.onBounce = null;
  }

  burst(pos, n = 26) {
    for (let k = 0; k < n; k++) {
      if (this.items.length >= this.cap * 2) this.items.shift();
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3.5;
      this.items.push({
        kind: Math.random() < 0.6 ? 0 : 1,
        p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)),
        v: new THREE.Vector3(Math.cos(a) * s, 3.5 + Math.random() * 4.5, Math.sin(a) * s),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 9 + Math.random() * 4,
        age: 0,
        rest: false,
      });
    }
  }

  clear() {
    for (const c of this.items) c.life = Math.min(c.life, c.age + 0.6);
  }

  update(dt) {
    const d = this.dummy;
    let nw = 0;
    let nc = 0;
    const keep = [];
    for (const c of this.items) {
      c.age += dt;
      if (c.age > c.life) continue;
      keep.push(c);
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt;
        c.r.y += c.w.y * dt;
        c.r.z += c.w.z * dt;
        const gy = heightAt(c.p.x, c.p.z) + 0.06;
        if (c.p.y < gy) {
          c.p.y = gy;
          if (Math.abs(c.v.y) > 1.2 && this.onBounce) this.onBounce(c.p, Math.abs(c.v.y));
          c.v.y = Math.abs(c.v.y) * 0.42;
          c.v.x *= 0.6;
          c.v.z *= 0.6;
          c.w.multiplyScalar(0.55);
          if (c.v.y < 0.4) {
            c.rest = true;
            c.r.x = c.kind === 0 ? 0 : Math.PI / 2;
            c.r.z = 0;
          }
        }
      }
      const shrink = Math.min(1, (c.life - c.age) / 0.6) * Math.min(1, c.age * 8);
      d.position.copy(c.p);
      d.rotation.copy(c.r);
      d.scale.setScalar(1.25 * shrink);
      d.updateMatrix();
      if (c.kind === 0 && nw < this.cap) {
        this.wrapped.setMatrixAt(nw, d.matrix);
        this.wrapped.setColorAt(nw, c.color);
        nw++;
      } else if (c.kind === 1 && nc < this.cap) {
        this.corn.setMatrixAt(nc, d.matrix);
        nc++;
      }
    }
    this.items = keep;
    this.wrapped.count = nw;
    this.corn.count = nc;
    this.wrapped.instanceMatrix.needsUpdate = true;
    this.corn.instanceMatrix.needsUpdate = true;
    if (this.wrapped.instanceColor) this.wrapped.instanceColor.needsUpdate = true;
  }
}
