import * as THREE from 'three';
import { TubeBuilder } from '../util/tube.js';
import { mulberry32, lerp } from '../util/math.js';
import { heightAt, BIG_TREE_POS, HOUSE_POS } from './layout.js';
import { withFog } from '../shaders/fog.js';

function randomUnit(rand, v = new THREE.Vector3()) {
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return v.set(Math.cos(a) * s, u, Math.sin(a) * s);
}

// Gnarled, leafless tree made of tapered tubes.
export function buildTreeGeometry(seed, P) {
  const rand = mulberry32(seed);
  const tb = new TubeBuilder();
  const radial = [11, 7, 5, 4, 3, 3];

  function grow(start, dir, length, radius, depth) {
    const segs = Math.max(3, Math.round(length / P.segLen));
    const pts = [start.clone()];
    const radii = [radius];
    const dirs = [dir.clone()];
    const d = dir.clone();
    const p = start.clone();
    const tip = depth >= P.maxDepth ? 0.12 : P.taper;
    for (let i = 1; i <= segs; i++) {
      const g = P.gnarl * (depth === 0 ? 0.6 : 1);
      d.x += (rand() - 0.5) * g;
      d.z += (rand() - 0.5) * g;
      d.y += (rand() - 0.5) * g * 0.5 + (depth === 0 ? P.upward : depth < 2 ? P.upward * 0.4 : -P.droop);
      d.normalize();
      p.addScaledVector(d, length / segs);
      pts.push(p.clone());
      dirs.push(d.clone());
      const t = i / segs;
      radii.push(radius * lerp(1, tip, Math.pow(t, 0.85)));
    }
    tb.add(pts, radii, radial[Math.min(depth, radial.length - 1)], true);

    if (depth >= P.maxDepth) return;
    const nChildren = P.children[depth];
    for (let c = 0; c < nChildren; c++) {
      let t;
      if (depth === 0) t = lerp(P.firstBranch, 0.97, (c + rand() * 0.7) / nChildren);
      else t = lerp(0.3, 0.92, rand());
      const idx = Math.min(segs, Math.max(1, Math.round(t * segs)));
      const at = pts[idx];
      const pd = dirs[idx];
      let nd;
      if (depth === 0) {
        const az = (c / nChildren) * Math.PI * 2 + rand() * 1.2;
        const el = lerp(P.minEl, P.maxEl, rand());
        nd = new THREE.Vector3(Math.cos(az) * Math.sin(el), Math.cos(el), Math.sin(az) * Math.sin(el));
      } else {
        const axis = new THREE.Vector3().crossVectors(pd, randomUnit(rand)).normalize();
        nd = pd.clone().applyAxisAngle(axis, lerp(0.45, 1.05, rand()));
        if (nd.y < -0.3) nd.y = -0.3;
        nd.normalize();
      }
      const len = length * lerp(P.lenMin, P.lenMax, rand()) * (depth === 0 ? P.crown : 1);
      grow(at, nd, len, radii[idx] * lerp(0.55, 0.75, rand()), depth + 1);
    }
  }

  grow(new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, 1, 0), P.height, P.radius, 0);

  // roots clawing into the ground
  for (let i = 0; i < P.roots; i++) {
    const az = (i / P.roots) * Math.PI * 2 + rand() * 0.8;
    const pts = [];
    const radii = [];
    const len = P.radius * lerp(2.5, 4.5, rand());
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const r = P.radius * 0.35 + t * len;
      pts.push(new THREE.Vector3(Math.cos(az) * r, 0.5 * P.radius * (1 - t) * (1 - t) - t * 0.25, Math.sin(az) * r));
      radii.push(P.radius * lerp(0.55, 0.06, t));
    }
    tb.add(pts, radii, 6, true);
  }
  return tb.build();
}

const PRESETS = {
  big: { height: 7.2, radius: 0.62, maxDepth: 4, children: [6, 3, 3, 2], gnarl: 0.42, segLen: 0.38, taper: 0.32, upward: 0.04, droop: 0.06, minEl: 0.55, maxEl: 1.15, lenMin: 0.55, lenMax: 0.78, crown: 0.95, firstBranch: 0.5, roots: 7 },
  medium: { height: 4.8, radius: 0.36, maxDepth: 4, children: [5, 3, 2, 2], gnarl: 0.45, segLen: 0.35, taper: 0.3, upward: 0.03, droop: 0.07, minEl: 0.5, maxEl: 1.1, lenMin: 0.55, lenMax: 0.78, crown: 0.9, firstBranch: 0.45, roots: 5 },
  thin: { height: 6.0, radius: 0.24, maxDepth: 3, children: [5, 3, 2], gnarl: 0.5, segLen: 0.4, taper: 0.28, upward: 0.05, droop: 0.05, minEl: 0.35, maxEl: 0.85, lenMin: 0.5, lenMax: 0.72, crown: 0.75, firstBranch: 0.55, roots: 4 },
};

export function createTrees() {
  const group = new THREE.Group();
  const mat = withFog(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.04, 0.032, 0.03), roughness: 1, metalness: 0 }), null, 'bark');
  const list = [
    { pos: BIG_TREE_POS, preset: 'big', seed: 13, scale: 1.25, rot: 0.6 },
    { pos: new THREE.Vector3(12.5, 0, -11), preset: 'medium', seed: 21, scale: 1.25, rot: 1.2 },
    { pos: new THREE.Vector3(-22, 0, 5), preset: 'medium', seed: 34, scale: 1.3, rot: 2.1 },
    { pos: new THREE.Vector3(19, 0, 4), preset: 'thin', seed: 55, scale: 1.0, rot: 0.3 },
    { pos: new THREE.Vector3(HOUSE_POS.x - 11, 0, HOUSE_POS.z + 4), preset: 'medium', seed: 89, scale: 1.5, rot: 0.9 },
    { pos: new THREE.Vector3(HOUSE_POS.x + 12, 0, HOUSE_POS.z + 2), preset: 'thin', seed: 144, scale: 1.6, rot: 2.5 },
    { pos: new THREE.Vector3(-32, 0, -26), preset: 'big', seed: 233, scale: 1.1, rot: 1.7 },
    { pos: new THREE.Vector3(30, 0, -24), preset: 'medium', seed: 377, scale: 1.4, rot: 0.2 },
    { pos: new THREE.Vector3(-38, 0, 12), preset: 'thin', seed: 610, scale: 1.3, rot: 1.1 },
    { pos: new THREE.Vector3(36, 0, 10), preset: 'medium', seed: 987, scale: 1.2, rot: 2.9 },
    { pos: new THREE.Vector3(-14, 0, -40), preset: 'thin', seed: 1597, scale: 1.5, rot: 0.7 },
    { pos: new THREE.Vector3(0, 0, -46), preset: 'medium', seed: 2584, scale: 1.3, rot: 1.9 },
  ];
  const trunks = [];
  for (const t of list) {
    const geo = buildTreeGeometry(t.seed, PRESETS[t.preset]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(t.pos.x, heightAt(t.pos.x, t.pos.z), t.pos.z);
    mesh.rotation.y = t.rot;
    mesh.scale.setScalar(t.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    trunks.push({ x: t.pos.x, z: t.pos.z, r: PRESETS[t.preset].radius * t.scale + 0.4, top: mesh.position.y + PRESETS[t.preset].height * t.scale });
  }
  return { group, trunks, list };
}
