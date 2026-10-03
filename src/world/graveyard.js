import * as THREE from 'three';
import { heightAt, GRAVEYARD, CRYPT_POS, BIG_TREE_POS } from './layout.js';
import { noise } from '../util/noise.js';
import { mulberry32, range } from '../util/math.js';
import { withFog } from '../shaders/fog.js';

function stoneTexture(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rand = mulberry32(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise.noise2D(x * 0.03 + seed, y * 0.03) * 0.5 + noise.noise2D(x * 0.12, y * 0.12 + seed) * 0.25 + noise.noise2D(x * 0.5, y * 0.5) * 0.12;
      let v = 118 + n * 60 + (rand() - 0.5) * 22;
      const mossN = noise.noise2D(x * 0.05 - seed, y * 0.05 + 3.3) * 0.5 + 0.5;
      const moss = Math.max(0, mossN - 0.55) * 2.2 * (0.4 + (y / size) * 0.9);
      const stain = Math.max(0, noise.noise2D(x * 0.02, y * 0.08 + seed * 2) - 0.2) * 0.6;
      const i = (y * size + x) * 4;
      img.data[i] = v * (1 - moss * 0.55) * (1 - stain * 0.5);
      img.data[i + 1] = v * (1 - moss * 0.15) * (1 - stain * 0.45);
      img.data[i + 2] = v * (1 - moss * 0.65) * (1 - stain * 0.4) + 6;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // hairline cracks
  g.strokeStyle = 'rgba(25,22,28,0.55)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    let x = rand() * size;
    let y = rand() * size;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (rand() - 0.5) * 30;
      y += rand() * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function engraving(kind) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const carve = (draw) => {
    g.save();
    g.translate(1.5, 1.5);
    g.fillStyle = 'rgba(220,220,235,0.22)';
    g.strokeStyle = 'rgba(220,220,235,0.22)';
    draw();
    g.restore();
    g.fillStyle = 'rgba(12,10,16,0.88)';
    g.strokeStyle = 'rgba(12,10,16,0.88)';
    draw();
  };
  const serif = 'Georgia, "Times New Roman", serif';
  if (kind === 0) {
    carve(() => {
      g.font = `bold 66px ${serif}`;
      g.fillText('R.I.P.', 128, 104);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(56, 148);
      g.lineTo(200, 148);
      g.stroke();
      g.font = `bold 30px ${serif}`;
      g.fillText('1692', 128, 184);
    });
  } else if (kind === 1) {
    carve(() => {
      g.fillRect(120, 30, 16, 92);
      g.fillRect(96, 52, 64, 14);
      g.font = `bold 26px ${serif}`;
      g.fillText('REST IN', 128, 152);
      g.fillText('PEACE', 128, 186);
    });
  } else if (kind === 2) {
    carve(() => {
      g.font = `bold 30px ${serif}`;
      g.fillText('HERE LIES', 128, 70);
      g.font = `italic bold 40px ${serif}`;
      g.fillText('Jack O.', 128, 124);
      g.font = `bold 24px ${serif}`;
      g.fillText('1801 – 1831', 128, 178);
    });
  } else {
    carve(() => {
      // a little skull
      g.beginPath();
      g.arc(128, 104, 46, Math.PI * 0.95, Math.PI * 0.05);
      g.lineTo(158, 150);
      g.lineTo(98, 150);
      g.closePath();
      g.lineWidth = 6;
      g.stroke();
      g.beginPath();
      g.arc(110, 108, 12, 0, Math.PI * 2);
      g.arc(146, 108, 12, 0, Math.PI * 2);
      g.fill();
      g.font = `bold 28px ${serif}`;
      g.fillText('BOO', 128, 196);
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function tombShape(kind, w, h) {
  const s = new THREE.Shape();
  if (kind === 0) {
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
    s.lineTo(w / 2, 0);
  } else if (kind === 1) {
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 2, h * 0.62);
    s.quadraticCurveTo(-w / 2, h * 0.92, 0, h);
    s.quadraticCurveTo(w / 2, h * 0.92, w / 2, h * 0.62);
    s.lineTo(w / 2, 0);
  } else if (kind === 2) {
    const t = w * 0.28;
    const a = h * 0.62;
    s.moveTo(-t / 2, 0);
    s.lineTo(-t / 2, a);
    s.lineTo(-w / 2, a);
    s.lineTo(-w / 2, a + t);
    s.lineTo(-t / 2, a + t);
    s.lineTo(-t / 2, h);
    s.lineTo(t / 2, h);
    s.lineTo(t / 2, a + t);
    s.lineTo(w / 2, a + t);
    s.lineTo(w / 2, a);
    s.lineTo(t / 2, a);
    s.lineTo(t / 2, 0);
  } else {
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 2, h * 0.82);
    s.quadraticCurveTo(-w * 0.45, h * 0.95, -w * 0.18, h * 0.95);
    s.quadraticCurveTo(0, h * 1.06, w * 0.18, h * 0.95);
    s.quadraticCurveTo(w * 0.45, h * 0.95, w / 2, h * 0.82);
    s.lineTo(w / 2, 0);
  }
  s.closePath();
  return s;
}

function prism(width, height, depth) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, height);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function createGraveyard() {
  const rand = mulberry32(666);
  const group = new THREE.Group();
  const stoneTex = stoneTexture(3);
  const stone = withFog(new THREE.MeshStandardMaterial({ map: stoneTex, color: new THREE.Color().setRGB(0.55, 0.55, 0.62), roughness: 0.96 }), null, 'stone');
  const darkStone = withFog(new THREE.MeshStandardMaterial({ map: stoneTex, color: new THREE.Color().setRGB(0.32, 0.31, 0.36), roughness: 1 }), null, 'stone');
  const decals = [0, 1, 2, 3].map((k) =>
    withFog(
      new THREE.MeshStandardMaterial({ map: engraving(k), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      null,
      'decal'
    )
  );

  const tombs = [];
  const candleSpots = [];
  const cols = 5;
  const rows = 4;
  const gw = GRAVEYARD.maxX - GRAVEYARD.minX;
  const gd = GRAVEYARD.maxZ - GRAVEYARD.minZ;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rand() < 0.18) continue;
      const x = GRAVEYARD.minX + ((c + 0.5 + (rand() - 0.5) * 0.5) / cols) * gw;
      const z = GRAVEYARD.minZ + ((r + 0.5 + (rand() - 0.5) * 0.4) / rows) * gd;
      if (Math.hypot(x - BIG_TREE_POS.x, z - BIG_TREE_POS.z) < 2.6) continue;
      if (Math.hypot(x - CRYPT_POS.x, z - CRYPT_POS.z) < 4.2) continue;
      const kind = Math.floor(rand() * 4);
      const w = range(rand, 0.65, 0.95);
      const h = kind === 2 ? range(rand, 1.4, 1.8) : range(rand, 0.95, 1.45);
      const depth = range(rand, 0.15, 0.22);
      const geo = new THREE.ExtrudeGeometry(tombShape(kind, w, h), {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.022,
        bevelSegments: 2,
        curveSegments: 14,
      });
      geo.translate(0, 0, -depth / 2);
      const tomb = new THREE.Group();
      const body = new THREE.Mesh(geo, rand() < 0.3 ? darkStone : stone);
      body.castShadow = true;
      body.receiveShadow = true;
      tomb.add(body);
      if (kind !== 2) {
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, w * 0.82), decals[Math.floor(rand() * decals.length)]);
        decal.position.set(0, kind === 0 ? h - w * 0.62 : h * 0.55, depth / 2 + 0.026);
        tomb.add(decal);
      }
      if (rand() < 0.45) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.18, depth + 0.3), darkStone);
        base.position.y = 0.04;
        base.castShadow = true;
        base.receiveShadow = true;
        tomb.add(base);
      }
      const gy = heightAt(x, z);
      tomb.position.set(x, gy - range(rand, 0.05, 0.2), z);
      tomb.rotation.set((rand() - 0.5) * 0.22, 0.25 + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.2);
      group.add(tomb);
      const front = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, tomb.rotation.y, 0));
      tombs.push({ position: new THREE.Vector3(x, gy, z), front, height: h });
      if (rand() < 0.5) {
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const off = front.clone().multiplyScalar(0.32 + rand() * 0.2);
          const side = new THREE.Vector3(front.z, 0, -front.x).multiplyScalar((rand() - 0.5) * 0.6);
          const px = x + off.x + side.x;
          const pz = z + off.z + side.z;
          candleSpots.push({ x: px, z: pz, y: heightAt(px, pz), h: range(rand, 0.1, 0.26) });
        }
      }
    }
  }

  // --- crypt
  const crypt = new THREE.Group();
  const cBase = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 5.6), darkStone);
  cBase.position.y = 0.1;
  const cBody = new THREE.Mesh(new THREE.BoxGeometry(3.9, 3.1, 4.7), stone);
  cBody.position.y = 1.85;
  const cRoof = new THREE.Mesh(prism(4.7, 1.5, 5.4), darkStone);
  cRoof.position.y = 3.4;
  const cCornice = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.22, 5.3), darkStone);
  cCornice.position.y = 3.35;
  crypt.add(cBase, cBody, cRoof, cCornice);
  for (const sx of [-1.45, 1.45]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.9, 12), stone);
    col.position.set(sx, 1.8, 2.65);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.55), darkStone);
    cap.position.set(sx, 3.3, 2.65);
    crypt.add(col, cap);
  }
  const porch = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.8), darkStone);
  porch.position.set(0, 3.3, 2.6);
  crypt.add(porch);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), withFog(new THREE.MeshStandardMaterial({ color: 0x050308, roughness: 1 }), null, 'door'));
  door.position.set(0, 1.45, 2.36);
  crypt.add(door);
  const crackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.9, 0.35, 2.4), toneMapped: true });
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 2.1), crackMat);
  crack.position.set(0, 1.45, 2.37);
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.04), crackMat);
  sill.position.set(0, 0.36, 2.37);
  crypt.add(crack, sill);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), stone);
  crossV.position.set(0, 5.2, 2.2);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.16), stone);
  crossH.position.set(0, 5.35, 2.2);
  crypt.add(crossV, crossH);
  crypt.traverse((o) => {
    if (o.isMesh && o.material !== crackMat) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  crypt.position.set(CRYPT_POS.x, heightAt(CRYPT_POS.x, CRYPT_POS.z) - 0.15, CRYPT_POS.z);
  crypt.rotation.y = 0.55;
  group.add(crypt);
  const cryptFront = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, crypt.rotation.y, 0));
  for (let k = 0; k < 4; k++) {
    const side = new THREE.Vector3(cryptFront.z, 0, -cryptFront.x).multiplyScalar(k < 2 ? -0.95 - k * 0.22 : 0.95 + (k - 2) * 0.22);
    const px = CRYPT_POS.x + cryptFront.x * 3.1 + side.x;
    const pz = CRYPT_POS.z + cryptFront.z * 3.1 + side.z;
    candleSpots.push({ x: px, z: pz, y: heightAt(px, pz) + 0.0, h: 0.16 + 0.1 * (k % 2) });
  }

  // --- wrought-iron fence
  const iron = withFog(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.02, 0.02, 0.025), metalness: 0.75, roughness: 0.42 }), null, 'iron');
  const fenceLines = [
    { a: new THREE.Vector2(-21, -4.6), b: new THREE.Vector2(-5.6, -4.6), gate: [-14.6, -12.4] },
    { a: new THREE.Vector2(-5.6, -4.6), b: new THREE.Vector2(-5.6, -20), gate: null },
    { a: new THREE.Vector2(-21, -4.6), b: new THREE.Vector2(-21, -12), gate: null },
  ];
  const postPositions = [];
  const pillarPositions = [];
  const rails = [];
  for (const L of fenceLines) {
    const len = L.a.distanceTo(L.b);
    const dir = new THREE.Vector2().subVectors(L.b, L.a).normalize();
    const nPosts = Math.floor(len / 0.3);
    let sectionLean = (rand() - 0.5) * 0.12;
    let railStart = null;
    for (let i = 0; i <= nPosts; i++) {
      const t = i * 0.3;
      const x = L.a.x + dir.x * t;
      const z = L.a.y + dir.y * t;
      const coord = Math.abs(dir.x) > 0.5 ? x : z;
      const inGate = L.gate && coord > L.gate[0] && coord < L.gate[1];
      if (i % 10 === 0 || i === nPosts || (L.gate && (Math.abs(coord - L.gate[0]) < 0.15 || Math.abs(coord - L.gate[1]) < 0.15))) {
        pillarPositions.push({ x, z });
        sectionLean = (rand() - 0.5) * 0.14;
        if (railStart && !inGate) rails.push({ a: railStart, b: { x, z }, lean: sectionLean });
        railStart = inGate ? null : { x, z };
        continue;
      }
      if (inGate) continue;
      if (railStart === null) railStart = { x, z };
      if (rand() < 0.07) continue;
      postPositions.push({ x, z, lean: sectionLean + (rand() - 0.5) * 0.06, dir, h: 1.1 + (rand() - 0.5) * 0.08 });
    }
  }
  const postGeo = new THREE.BoxGeometry(0.035, 1, 0.035);
  postGeo.translate(0, 0.5, 0);
  const tipGeo = new THREE.ConeGeometry(0.045, 0.16, 4);
  tipGeo.translate(0, 0.08, 0);
  const posts = new THREE.InstancedMesh(postGeo, iron, postPositions.length);
  const tips = new THREE.InstancedMesh(tipGeo, iron, postPositions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  postPositions.forEach((pp, i) => {
    const y = heightAt(pp.x, pp.z) - 0.05;
    const axis = new THREE.Vector3(pp.dir.x, 0, pp.dir.y);
    q.setFromAxisAngle(axis, pp.lean);
    p.set(pp.x, y, pp.z);
    sc.set(1, pp.h, 1);
    m.compose(p, q, sc);
    posts.setMatrixAt(i, m);
    const top = new THREE.Vector3(0, pp.h, 0).applyQuaternion(q).add(p);
    sc.set(1, 1, 1);
    m.compose(top, q, sc);
    tips.setMatrixAt(i, m);
  });
  posts.castShadow = tips.castShadow = true;
  group.add(posts, tips);
  for (const pp of pillarPositions) {
    const y = heightAt(pp.x, pp.z);
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.45, 0.3), darkStone);
    pil.position.set(pp.x, y + 0.6, pp.z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), darkStone);
    cap.position.set(pp.x, y + 1.45, pp.z);
    pil.castShadow = cap.castShadow = true;
    pil.receiveShadow = true;
    group.add(pil, cap);
  }
  for (const r of rails) {
    for (const hh of [0.22, 0.95]) {
      const ya = heightAt(r.a.x, r.a.z) + hh;
      const yb = heightAt(r.b.x, r.b.z) + hh;
      const a = new THREE.Vector3(r.a.x, ya, r.a.z);
      const b = new THREE.Vector3(r.b.x, yb, r.b.z);
      const len = a.distanceTo(b);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, len), iron);
      rail.position.copy(a).add(b).multiplyScalar(0.5);
      rail.lookAt(b);
      rail.castShadow = true;
      group.add(rail);
    }
  }

  // --- candles (flames are drawn by the glow-point system)
  const candleMat = withFog(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.75, 0.66, 0.5), roughness: 0.6, emissive: new THREE.Color().setRGB(0.25, 0.1, 0.02) }), null, 'candle');
  const candleGeo = new THREE.CylinderGeometry(0.035, 0.04, 1, 8);
  candleGeo.translate(0, 0.5, 0);
  const candles = new THREE.InstancedMesh(candleGeo, candleMat, candleSpots.length);
  const flames = [];
  candleSpots.forEach((cs, i) => {
    p.set(cs.x, cs.y - 0.02, cs.z);
    q.identity();
    sc.set(1, cs.h, 1);
    m.compose(p, q, sc);
    candles.setMatrixAt(i, m);
    flames.push(new THREE.Vector3(cs.x, cs.y + cs.h + 0.045, cs.z));
  });
  group.add(candles);

  return { group, tombs, flames, crackMat };
}
