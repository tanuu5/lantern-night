import * as THREE from 'three';
import { heightAt, HOUSE_POS } from './layout.js';
import { noise } from '../util/noise.js';
import { withFog } from '../shaders/fog.js';

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

function silhouetteTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(64, 92, 22, 27, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(20, 256);
  g.quadraticCurveTo(18, 150, 46, 128);
  g.lineTo(82, 128);
  g.quadraticCurveTo(110, 150, 108, 256);
  g.fill();
  // a pointy hat
  g.beginPath();
  g.moveTo(26, 76);
  g.lineTo(102, 76);
  g.lineTo(70, 6);
  g.closePath();
  g.fill();
  g.fillRect(14, 70, 100, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createHouse() {
  const group = new THREE.Group();
  const wall = withFog(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.04, 0.034, 0.048), roughness: 0.95 }), null, 'house');
  const roof = withFog(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.02, 0.017, 0.028), roughness: 0.9 }), null, 'house');
  const trim = withFog(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.012, 0.01, 0.014), roughness: 0.9 }), null, 'house');

  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(17, 0.9, 9), trim, 0.6, 0.35, 0.4);
  add(new THREE.BoxGeometry(9, 6.6, 7), wall, 0, 4.1, 0);
  add(prism(7.8, 3.9, 10), roof, 0, 7.4, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(5.2, 4.8, 6), wall, 7.1, 3.2, 0.4);
  add(prism(6.4, 2.9, 6.6), roof, 7.1, 5.6, 0.4);
  // tower
  add(new THREE.CylinderGeometry(1.8, 1.8, 11.6, 8), wall, -5.6, 6.6, 2.2, Math.PI / 8);
  add(new THREE.CylinderGeometry(2.05, 2.05, 0.3, 8), trim, -5.6, 12.45, 2.2, Math.PI / 8);
  add(new THREE.ConeGeometry(2.5, 6.4, 8), roof, -5.6, 15.8, 2.2, Math.PI / 8);
  add(new THREE.CylinderGeometry(0.03, 0.07, 2.4, 6), trim, -5.6, 20.1, 2.2);
  add(new THREE.SphereGeometry(0.14, 8, 6), trim, -5.6, 19.2, 2.2);
  add(new THREE.CylinderGeometry(1.95, 1.95, 0.2, 8), trim, -5.6, 7.3, 2.2, Math.PI / 8);
  // chimneys
  add(new THREE.BoxGeometry(0.9, 3.6, 0.9), trim, 2.7, 9.6, -1.5);
  add(new THREE.BoxGeometry(0.8, 3.0, 0.8), trim, -2.4, 9.3, 1.2);
  // dormer
  add(new THREE.BoxGeometry(1.7, 1.6, 1.6), wall, 1.0, 8.2, 2.3);
  add(prism(2.1, 1.1, 1.9), roof, 1.0, 9.0, 2.35);
  // porch
  add(new THREE.BoxGeometry(4.4, 0.18, 2.4), roof, 1.6, 3.75, 4.7);
  add(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 6), trim, -0.4, 2.3, 5.7);
  add(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 6), trim, 3.6, 2.3, 5.7);
  add(new THREE.BoxGeometry(2.2, 0.3, 1.2), trim, 1.6, 0.85, 6.0);

  // windows
  const windows = [];
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.012, 0.012, 0.024) });
  const addWindow = (x, y, z, w, h, lit, hue = 'warm', round = false) => {
    const geo = round ? new THREE.CircleGeometry(w / 2, 20) : new THREE.PlaneGeometry(w, h);
    const mat = lit ? new THREE.MeshBasicMaterial({ color: new THREE.Color() }) : glass;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    const frameV = new THREE.Mesh(new THREE.BoxGeometry(0.07, round ? w : h, 0.05), trim);
    frameV.position.set(x, y, z + 0.03);
    const frameH = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.05), trim);
    frameH.position.set(x, y + (round ? 0 : h * 0.12), z + 0.03);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.12, 0.18), trim);
    sill.position.set(x, y - (round ? w / 2 : h / 2) - 0.05, z + 0.05);
    group.add(frameV, frameH);
    if (!round) group.add(sill);
    if (lit) {
      windows.push({
        mesh: m,
        base: hue === 'warm' ? new THREE.Color().setRGB(2.6, 1.25, 0.32) : new THREE.Color().setRGB(1.3, 0.45, 2.6),
        seed: Math.random() * 100,
      });
    }
    return m;
  };
  const fz = 3.52;
  addWindow(-2.6, 2.7, fz, 1.0, 1.6, false);
  addWindow(-0.6, 2.7, fz, 1.0, 1.6, true);
  addWindow(-2.6, 5.7, fz, 1.0, 1.6, true);
  addWindow(-0.6, 5.7, fz, 1.0, 1.6, false);
  addWindow(2.6, 5.7, fz, 1.0, 1.6, false);
  addWindow(6.0, 2.8, 3.42, 1.0, 1.5, false);
  addWindow(8.2, 2.8, 3.42, 1.0, 1.5, true);
  addWindow(7.1, 6.55, 3.42, 1.0, 1.0, true, 'warm', true);
  addWindow(1.0, 8.1, 3.12, 0.8, 1.0, false);
  const tz = 2.2 + 1.8 * Math.cos(Math.PI / 8) + 0.03;
  addWindow(-5.6, 5.0, tz, 0.75, 1.4, false);
  const towerWin = addWindow(-5.6, 9.6, tz, 0.8, 1.5, true, 'purple');
  // door
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.5), new THREE.MeshBasicMaterial({ color: 0x030205 }));
  door.position.set(1.6, 2.05, 3.53);
  const doorLight = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.0, 0.9, 0.25) }));
  doorLight.position.set(1.6, 0.83, 3.54);
  group.add(door, doorLight);

  // the figure in the tower window
  const figure = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 1.2),
    new THREE.MeshBasicMaterial({ map: silhouetteTexture(), transparent: true, opacity: 0, depthWrite: false })
  );
  figure.position.copy(towerWin.position).add(new THREE.Vector3(0, -0.12, 0.015));
  group.add(figure);

  const proxy = new THREE.Mesh(new THREE.BoxGeometry(19, 20, 10), new THREE.MeshBasicMaterial());
  proxy.position.set(0.8, 9, 0.5);
  proxy.visible = false;
  group.add(proxy);

  const y = heightAt(HOUSE_POS.x, HOUSE_POS.z) - 0.4;
  group.position.set(HOUSE_POS.x, y, HOUSE_POS.z);
  group.rotation.y = -0.22;
  group.scale.setScalar(1.15);

  let figureT = 8;
  let figureOn = false;
  const towerTop = new THREE.Vector3(-5.6, 17, 2.2);

  return {
    group,
    proxy,
    towerTop: () => group.localToWorld(towerTop.clone()),
    update(dt, t) {
      for (const w of windows) {
        const n = noise.noise2D(t * 2.2 + w.seed, w.seed) * 0.5 + 0.5;
        const f = 0.7 + 0.3 * n + (Math.sin(t * 23 + w.seed) > 0.97 ? -0.25 : 0);
        w.mesh.material.color.copy(w.base).multiplyScalar(f);
      }
      figureT -= dt;
      if (figureT <= 0) {
        figureOn = !figureOn;
        figureT = figureOn ? 3.5 + Math.random() * 3 : 12 + Math.random() * 14;
      }
      const fm = figure.material;
      fm.opacity += ((figureOn ? 0.95 : 0) - fm.opacity) * Math.min(1, dt * 2.5);
    },
  };
}
