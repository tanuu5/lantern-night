import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

// Procedural jack-o'-lantern faces. Painted white-on-black, then packed into a texture:
//   R = slightly blurred mask (carving field: holes grow from the middle outwards)
//   G = heavily blurred mask (translucent glow around the cuts)
const S = 512;

function triPath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

function drawEyes(g, type, rand) {
  const cy = 196 + (rand() - 0.5) * 16;
  const dx = 66 + rand() * 16;
  const w = 68 + rand() * 22;
  const h = 58 + rand() * 22;
  for (const side of [-1, 1]) {
    const cx = 256 + side * dx;
    switch (type) {
      case 'tri':
        triPath(g, [cx - w / 2, cy + h / 2, cx + w / 2, cy + h / 2, cx, cy - h / 2]);
        break;
      case 'angry':
        triPath(g, [cx - side * w * 0.55, cy - h * 0.5, cx + side * w * 0.5, cy + h * 0.02, cx - side * w * 0.05, cy + h * 0.5]);
        break;
      case 'round':
        g.beginPath();
        g.ellipse(cx, cy, w * 0.42, h * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'happy':
        g.lineWidth = 24;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(cx, cy + 26, 36, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
        break;
      case 'diamond':
        triPath(g, [cx, cy - h * 0.6, cx + w * 0.42, cy, cx, cy + h * 0.6, cx - w * 0.42, cy]);
        break;
      case 'slit':
        g.beginPath();
        g.ellipse(cx, cy, w * 0.55, h * 0.2, side * -0.28, 0, Math.PI * 2);
        g.fill();
        break;
      case 'moon':
        g.beginPath();
        g.arc(cx, cy, h * 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(cx + side * 14, cy - 12, h * 0.42, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        break;
      default:
        break;
    }
  }
}

function drawNose(g, type) {
  if (type === 'tri') triPath(g, [232, 282, 280, 282, 256, 244]);
  else if (type === 'inv') triPath(g, [234, 248, 278, 248, 256, 282]);
  else if (type === 'dot') {
    g.beginPath();
    g.ellipse(256, 266, 14, 18, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function drawMouth(g, type, rand) {
  const L = 150 + rand() * 20;
  const R = 362 - rand() * 20;
  const top = 306 + rand() * 10;
  if (type === 'jagged') {
    g.beginPath();
    g.moveTo(L, top - 14);
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 1; i < n * 2; i++) {
      const x = L + ((R - L) * i) / (n * 2);
      const y = i % 2 ? top + 16 : top - 2;
      g.lineTo(x, y);
    }
    g.lineTo(R, top - 14);
    g.quadraticCurveTo(256, top + 120, L, top - 14);
    g.fill();
  } else if (type === 'toothy') {
    g.beginPath();
    g.moveTo(L, top - 10);
    g.quadraticCurveTo(256, top + 40, R, top - 10);
    g.quadraticCurveTo(256, top + 128, L, top - 10);
    g.fill();
    g.fillStyle = '#000';
    g.fillRect(222, top + 6, 26, 30);
    g.fillRect(270, top + 6, 26, 30);
    g.fillRect(244, top + 58, 26, 26);
    g.fillStyle = '#fff';
  } else if (type === 'o') {
    g.beginPath();
    g.ellipse(256, top + 30, 36, 46, 0, 0, Math.PI * 2);
    g.fill();
  } else if (type === 'stitch') {
    g.lineWidth = 20;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(L + 10, top + 20);
    g.quadraticCurveTo(256, top + 70, R - 10, top + 20);
    g.stroke();
    g.lineWidth = 9;
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      const x = L + 10 + (R - L - 20) * t;
      const y = top + 20 + Math.sin(t * Math.PI) * 25;
      g.beginPath();
      g.moveTo(x - 6, y - 22);
      g.lineTo(x + 6, y + 22);
      g.stroke();
    }
  } else if (type === 'smirk') {
    g.beginPath();
    g.moveTo(L + 30, top + 26);
    g.quadraticCurveTo(250, top + 50, R, top - 24);
    g.quadraticCurveTo(270, top + 116, L + 30, top + 26);
    g.fill();
  } else if (type === 'fangs') {
    g.beginPath();
    g.moveTo(L - 6, top - 22);
    g.quadraticCurveTo(256, top + 30, R + 6, top - 22);
    g.quadraticCurveTo(256, top + 132, L - 6, top - 22);
    g.fill();
    g.fillStyle = '#000';
    triPath(g, [200, top, 228, top + 4, 214, top + 46]);
    triPath(g, [284, top + 4, 312, top, 298, top + 46]);
    g.fillStyle = '#fff';
  }
}

function blurred(src, factor) {
  const w = Math.max(4, Math.round(S / factor));
  const small = document.createElement('canvas');
  small.width = small.height = w;
  const gs = small.getContext('2d');
  gs.imageSmoothingEnabled = true;
  gs.imageSmoothingQuality = 'high';
  gs.drawImage(src, 0, 0, w, w);
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const go = out.getContext('2d');
  go.imageSmoothingEnabled = true;
  go.imageSmoothingQuality = 'high';
  go.drawImage(small, 0, 0, S, S);
  return go.getImageData(0, 0, S, S).data;
}

const EYES = ['tri', 'angry', 'round', 'happy', 'diamond', 'slit', 'moon', 'tri', 'angry'];
const NOSES = ['tri', 'inv', 'dot', 'none', 'tri'];
const MOUTHS = ['jagged', 'toothy', 'o', 'stitch', 'smirk', 'fangs', 'jagged', 'toothy'];

export function makeFaceTexture(seed, preset = null) {
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  const eyes = preset?.eyes ?? EYES[Math.floor(rand() * EYES.length)];
  const nose = preset?.nose ?? NOSES[Math.floor(rand() * NOSES.length)];
  const mouth = preset?.mouth ?? MOUTHS[Math.floor(rand() * MOUTHS.length)];
  drawEyes(g, eyes, rand);
  drawNose(g, nose);
  drawMouth(g, mouth, rand);

  const med = blurred(c, 5);
  const heavy = blurred(c, 22);
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const go = out.getContext('2d');
  const img = go.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = med[i];
    img.data[i + 1] = Math.min(255, heavy[i] * 1.6);
    img.data[i + 2] = 0;
    img.data[i + 3] = 255;
  }
  go.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.anisotropy = 4;
  return tex;
}
