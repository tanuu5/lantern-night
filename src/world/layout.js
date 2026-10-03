import * as THREE from 'three';
import { noise } from '../util/noise.js';
import { smoothstep } from '../util/math.js';

// World layout shared by every module.
export const HOUSE_POS = new THREE.Vector3(15, 0, -58);
export const KING_POS = new THREE.Vector3(-1.2, 0, -1.5);
export const BIG_TREE_POS = new THREE.Vector3(-9.5, 0, -12.5);
export const GRAVEYARD = { minX: -20, maxX: -6.5, minZ: -19, maxZ: -5.5 };
export const CRYPT_POS = new THREE.Vector3(-17.2, 0, -16.6);

// Dirt path winding from the foreground to the haunted house.
export const PATH = [
  [2.5, 40], [2.2, 24], [4.2, 12], [5.6, 2], [5.4, -8], [7.4, -20],
  [10.4, -32], [13, -44], [14.6, -52],
].map(([x, z]) => new THREE.Vector2(x, z));

export function pathDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const apx = x - a.x;
    const apz = z - a.y;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / (abx * abx + abz * abz)));
    const dx = apx - abx * t;
    const dz = apz - abz * t;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  // a little wobble so the edges aren't ruler-straight
  return Math.sqrt(best) + noise.noise2D(x * 0.35, z * 0.35) * 0.35;
}

export function inGraveyard(x, z, margin = 0) {
  return x > GRAVEYARD.minX - margin && x < GRAVEYARD.maxX + margin && z > GRAVEYARD.minZ - margin && z < GRAVEYARD.maxZ + margin;
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z + 2);
  let h = noise.fbm2(x * 0.024, z * 0.024, 4) * 2.4;
  h += noise.noise2D(x * 0.16, z * 0.16) * 0.14;
  h *= 0.16 + 0.84 * smoothstep(10, 32, r);
  const dx = x - HOUSE_POS.x;
  const dz = z - HOUSE_POS.z;
  h += 7.5 * Math.exp(-(dx * dx + dz * dz) / (2 * 14 * 14));
  h += smoothstep(58, 125, r) * (5 + 6 * (noise.fbm2(x * 0.011 + 7.3, z * 0.011 - 2.1, 3) + 0.5));
  const pd = pathDist(x, z);
  h -= 0.1 * (1 - smoothstep(0.5, 1.5, pd));
  return h;
}
