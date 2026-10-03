import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TubeBuilder } from '../util/tube.js';
import { mulberry32, range, clamp, easeInOutCubic, easeOutBack, smoothstep } from '../util/math.js';
import { noise } from '../util/noise.js';
import { heightAt, pathDist, inGraveyard, KING_POS } from '../world/layout.js';
import { fogUniforms } from '../shaders/fog.js';
import { makeFaceTexture } from './faces.js';
import { GlowPoints } from '../fx/glowpoints.js';

function pumpkinGeometry() {
  const sphere = new THREE.SphereGeometry(1, 96, 64);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geo = mergeVertices(sphere, 1e-4);
  const pos = geo.attributes.position;
  const n = pos.count;
  const dirs = new Float32Array(n * 3);
  const cols = new Float32Array(n * 3);
  const ribs = 10;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    dirs[i * 3] = x;
    dirs[i * 3 + 1] = y;
    dirs[i * 3 + 2] = z;
    const theta = Math.atan2(z, x);
    const rib = Math.pow(Math.abs(Math.cos((theta * ribs) / 2)), 0.5);
    const groove = 1 - rib;
    const ay = Math.abs(y);
    const eq = 1 - ay * ay;
    let r = (1 - 0.085 * groove) * (1 + 0.025 * rib * eq);
    let yy = y * 0.74;
    yy -= Math.sign(y) * Math.pow(ay, 8) * (y > 0 ? 0.22 : 0.13);
    if (y < 0) yy *= 0.95;
    yy *= 1 - 0.02 * groove;
    pos.setXYZ(i, x * r, yy, z * r);
    const shade = (0.62 + 0.38 * rib) * (1 - 0.35 * Math.pow(ay, 5));
    cols[i * 3] = shade;
    cols[i * 3 + 1] = shade * (0.92 + 0.08 * rib);
    cols[i * 3 + 2] = shade;
  }
  geo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

function stemGeometry(rand) {
  const tb = new TubeBuilder();
  const pts = [];
  const radii = [];
  const bend = new THREE.Vector3(range(rand, -0.25, 0.25), 0, range(rand, -0.25, 0.25));
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector3(bend.x * t * t, 0.44 + t * range(rand, 0.26, 0.36), bend.z * t * t));
    radii.push(0.11 * (1 - t * 0.35) + (t > 0.85 ? 0.015 : 0));
  }
  tb.add(pts, radii, 8, true);
  // curly tendril
  const tp = [];
  const tr = [];
  const a0 = rand() * Math.PI * 2;
  const cx = Math.cos(a0) * 0.17;
  const cz = Math.sin(a0) * 0.17;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const a = a0 + t * Math.PI * 7;
    const rad = 0.025 + t * 0.05;
    const lean = t * 0.12;
    tp.push(new THREE.Vector3(cx + Math.cos(a0) * lean + Math.cos(a) * rad, 0.5 + t * 0.3, cz + Math.sin(a0) * lean + Math.sin(a) * rad));
    tr.push(0.011 * (1 - t * 0.6));
  }
  tb.add(tp, tr, 4, true);
  return tb.build();
}

function hatGeometry() {
  const tb = new TubeBuilder();
  const pts = [];
  const radii = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const bend = Math.pow(t, 2.6);
    pts.push(new THREE.Vector3(bend * 0.85, t * 2.2 - bend * 0.35, -bend * 0.2));
    radii.push(0.95 * Math.pow(1 - t, 1.1) + 0.02);
  }
  tb.add(pts, radii, 28, true);
  return tb.build();
}

// Soft brim that droops a little over the pumpkin's shoulders, with a curled edge.
function brimGeometry() {
  const pts = [
    new THREE.Vector2(0.6, 0.02),
    new THREE.Vector2(1.0, 0.0),
    new THREE.Vector2(1.3, -0.05),
    new THREE.Vector2(1.55, -0.12),
    new THREE.Vector2(1.72, -0.13),
    new THREE.Vector2(1.8, -0.07),
    new THREE.Vector2(1.74, -0.08),
    new THREE.Vector2(1.55, -0.07),
    new THREE.Vector2(1.3, 0.0),
    new THREE.Vector2(1.0, 0.05),
    new THREE.Vector2(0.6, 0.06),
  ];
  return new THREE.LatheGeometry(pts, 56);
}

const BASE_GEO = pumpkinGeometry();
const PROXY_GEO = new THREE.SphereGeometry(0.85, 12, 8);
const FLAME = new THREE.Color().setRGB(1.0, 0.5, 0.14);

class Pumpkin {
  constructor({ index, position, size, yaw, color, faceSeed, facePreset, king = false, rand }) {
    this.index = index;
    this.king = king;
    this.size = size;
    this.state = 'dark';
    this.timer = 0;
    this.glow = 0;
    this.carve = 0;
    this.hover = 0;
    this.seed = rand() * 100;
    this.emberT = rand();

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.set((rand() - 0.5) * 0.12, yaw, (rand() - 0.5) * 0.12);
    this.group.scale.setScalar(size);

    this.uniforms = {
      uFace: { value: makeFaceTexture(faceSeed, facePreset) },
      uCarve: { value: 0 },
      uGlow: { value: 0 },
      uHover: { value: 0 },
    };
    const mat = new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.42, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fogUniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aDir;\nvarying vec3 vDir;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = aDir;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform sampler2D uFace;
          uniform float uCarve;
          uniform float uGlow;
          uniform float uHover;
          varying vec3 vDir;`
        )
        .replace(
          '#include <clipping_planes_fragment>',
          /* glsl */ `#include <clipping_planes_fragment>
          vec4 faceTex = texture2D( uFace, vDir.xy * 0.5 + 0.5 );
          float faceFront = smoothstep( 0.15, 0.4, vDir.z );
          float faceM = faceTex.r * faceFront;
          float faceB = faceTex.g * faceFront;
          float carveThr = mix( 1.25, 0.5, uCarve );
          if ( faceM > carveThr ) discard;
          float cutRim = smoothstep( carveThr - 0.12, carveThr, faceM ) * step( 0.001, uCarve );
          bool innerSide = !gl_FrontFacing;`
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec3 fleshCol = vec3( 0.95, 0.66, 0.25 );
          if ( innerSide ) diffuseColor.rgb = fleshCol * 0.55;
          else diffuseColor.rgb = mix( diffuseColor.rgb, fleshCol, cutRim );`
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          vec3 flameCol = vec3( 1.0, 0.42, 0.07 );
          if ( innerSide ) {
            float hgt = clamp( vDir.y * 0.5 + 0.5, 0.0, 1.0 );
            totalEmissiveRadiance += flameCol * uGlow * ( 1.2 + 1.6 * ( 1.0 - hgt ) );
          } else {
            totalEmissiveRadiance += vec3( 1.0, 0.72, 0.28 ) * cutRim * uGlow * 2.4;
            totalEmissiveRadiance += flameCol * faceB * uGlow * 0.55;
            float fres = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 2.5 );
            totalEmissiveRadiance += vec3( 1.0, 0.55, 0.12 ) * fres * uHover * 0.9;
            totalEmissiveRadiance += diffuseColor.rgb * 0.018 + vec3( 0.25, 0.3, 0.55 ) * fres * 0.035;
            totalEmissiveRadiance += vec3( 0.9, 0.35, 0.05 ) * uHover * 0.05;
          }`
        );
    };
    mat.customProgramCacheKey = () => 'pumpkin';
    this.body = new THREE.Mesh(BASE_GEO, mat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.group.add(this.body);

    const stemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.12, 0.1, 0.035), roughness: 0.85 });
    this.stem = new THREE.Mesh(stemGeometry(rand), stemMat);
    this.stem.castShadow = true;
    this.group.add(this.stem);

    this.proxy = new THREE.Mesh(PROXY_GEO, new THREE.MeshBasicMaterial());
    this.proxy.visible = false;
    this.proxy.userData.pumpkin = this;
    this.group.add(this.proxy);

    this.light = new THREE.PointLight(new THREE.Color().setRGB(1.0, 0.52, 0.16), 0, king ? 34 : 15, 2);
    this.light.position.set(0, 0.25, 0.3);
    this.group.add(this.light);

    if (king) {
      const hatMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.03, 0.012, 0.045), roughness: 0.92, side: THREE.DoubleSide });
      const hat = new THREE.Group();
      const cone = new THREE.Mesh(hatGeometry(), hatMat);
      const brim = new THREE.Mesh(brimGeometry(), hatMat);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.99, 0.3, 40, 1, true),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.16, 0.03, 0.26), roughness: 0.5, side: THREE.DoubleSide })
      );
      band.position.y = 0.17;
      const buckle = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.035, 6, 4),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.9, 0.6, 0.15), metalness: 0.9, roughness: 0.3 })
      );
      buckle.rotation.z = Math.PI / 4;
      buckle.position.set(0, 0.17, 0.95);
      hat.add(cone, brim, band, buckle);
      hat.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      // rests on the flat top of the pumpkin; brim clearance checked against the deformed body
      hat.position.set(0.02, 0.64, -0.02);
      hat.rotation.set(-0.03, 0.3, 0.05);
      hat.scale.setScalar(0.52);
      this.group.add(hat);
      this.hat = hat;
    }

    this.flameLocal = new THREE.Vector3(0, -0.05, 0.05);
    this.faceLocal = new THREE.Vector3(0, 0.0, 0.85);
    this.baseY = position.y;
    this.bounce = 0;
  }

  worldPoint(local, out = new THREE.Vector3()) {
    return this.group.localToWorld(out.copy(local));
  }

  ignite() {
    if (this.state !== 'dark') return false;
    this.state = 'carving';
    this.timer = 0;
    return true;
  }

  douse() {
    if (this.state === 'dark') return;
    this.state = 'dousing';
    this.timer = 0;
    this.douseFrom = { glow: this.glow, carve: this.carve };
  }

  get isLit() {
    return this.state === 'igniting' || this.state === 'lit';
  }
}

export class Pumpkins {
  constructor(env, { trunks, tombs }) {
    this.env = env;
    this.group = new THREE.Group();
    this.items = [];
    this.flames = new GlowPoints(32);
    this.group.add(this.flames.points);
    this.onCarveChip = null;
    this.onIgnite = null;
    this.onEmber = null;
    this.tmp = new THREE.Vector3();

    const rand = mulberry32(1031);
    const camRef = new THREE.Vector3(2, 0, 24);
    const spots = [];
    let guard = 0;
    while (spots.length < 13 && guard < 5000) {
      guard++;
      const x = range(rand, -13, 13);
      const z = range(rand, -9, 12.5);
      if (pathDist(x, z) < 1.9) continue;
      if (inGraveyard(x, z, 1.2)) continue;
      if (Math.hypot(x - KING_POS.x, z - KING_POS.z) < 3.6) continue;
      if (trunks.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 1.4)) continue;
      if (tombs.some((t) => Math.hypot(x - t.position.x, z - t.position.z) < 1.5)) continue;
      if (spots.some((s) => Math.hypot(x - s.x, z - s.z) < 3.1)) continue;
      spots.push({ x, z });
    }
    const palette = [0xf06000, 0xff7410, 0xe25200, 0xff8a1c, 0xf26a06];
    spots.forEach((s, i) => {
      const size = i === 4 ? 1.15 : range(rand, 0.55, 1.05);
      const yaw = Math.atan2(camRef.x - s.x, camRef.z - s.z) + (rand() - 0.5) * 0.7;
      const white = i === 7;
      const color = new THREE.Color(white ? 0xd6d0bc : palette[Math.floor(rand() * palette.length)]);
      const pos = new THREE.Vector3(s.x, heightAt(s.x, s.z) + 0.52 * size, s.z);
      const p = new Pumpkin({ index: i, position: pos, size, yaw, color, faceSeed: 100 + i * 17, rand });
      this.items.push(p);
      this.group.add(p.group);
    });

    const kingPos = new THREE.Vector3(KING_POS.x, heightAt(KING_POS.x, KING_POS.z) + 0.5 * 2.3, KING_POS.z);
    this.king = new Pumpkin({
      index: 13,
      position: kingPos,
      size: 2.3,
      yaw: Math.atan2(camRef.x - KING_POS.x, camRef.z - KING_POS.z),
      color: new THREE.Color(0xd8600c),
      faceSeed: 4242,
      facePreset: { eyes: 'angry', nose: 'tri', mouth: 'fangs' },
      king: true,
      rand,
    });
    this.group.add(this.king.group);
    this.all = [...this.items, this.king];
    this.proxies = this.items.map((p) => p.proxy);
  }

  get litCount() {
    return this.items.filter((p) => p.state === 'lit' || p.state === 'igniting').length;
  }

  update(dt, t) {
    let fi = 0;
    const glows = this.env.glows.value;
    this.all.forEach((p, idx) => {
      p.timer += dt;
      if (p.state === 'carving') {
        const dur = p.king ? 1.6 : 1.0;
        const k = clamp(p.timer / dur, 0, 1);
        p.carve = easeInOutCubic(k);
        if (this.onCarveChip && Math.random() < dt * 40) {
          const local = this.tmp.set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.6 - 0.05, 0.8);
          this.onCarveChip(p.worldPoint(local, new THREE.Vector3()), p);
        }
        if (k >= 1) {
          p.state = 'igniting';
          p.timer = 0;
          if (this.onIgnite) this.onIgnite(p);
        }
      } else if (p.state === 'igniting') {
        const k = clamp(p.timer / 0.7, 0, 1);
        p.glow = easeOutBack(k) * 1.0;
        p.bounce = Math.sin(k * Math.PI) * 0.12;
        if (k >= 1) {
          p.state = 'lit';
          p.timer = 0;
          p.bounce = 0;
        }
      } else if (p.state === 'lit') {
        p.glow = 1;
        p.emberT -= dt;
        if (p.emberT <= 0 && this.onEmber) {
          p.emberT = 0.15 + Math.random() * 0.5;
          const local = this.tmp.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.4, 0.85);
          this.onEmber(p.worldPoint(local, new THREE.Vector3()), p);
        }
      } else if (p.state === 'dousing') {
        const k = clamp(p.timer / 1.4, 0, 1);
        p.glow = p.douseFrom.glow * (1 - smoothstep(0, 0.5, k));
        p.carve = p.douseFrom.carve * (1 - smoothstep(0.3, 1, k));
        if (k >= 1) {
          p.state = 'dark';
          p.glow = 0;
          p.carve = 0;
        }
      }

      const flick = 0.8 + 0.14 * noise.noise2D(t * 7.5 + p.seed, p.seed) + 0.06 * Math.sin(t * 31 + p.seed * 3);
      const g = p.glow * flick * (p.king ? 1.35 : 1);
      p.uniforms.uCarve.value = p.carve;
      p.uniforms.uGlow.value = g;
      p.uniforms.uHover.value = p.hover;
      p.light.intensity = g * (p.king ? 120 : 26) * p.size;
      p.group.position.y = p.baseY + p.bounce * p.size + (p.hover > 0 ? Math.sin(t * 9) * 0.015 * p.hover : 0);

      const wp = p.worldPoint(p.flameLocal, this.tmp);
      if (g > 0.01) {
        this.flames.set(fi++, wp.x, wp.y, wp.z, FLAME.r * 2.2, FLAME.g * 2.2, FLAME.b * 2.2, 0.55 * p.size * (0.85 + 0.3 * flick), clamp(g, 0, 1.4));
      }
      if (idx < 16) {
        glows[idx].set(wp.x, wp.y, wp.z, g * p.size * (p.king ? 2.0 : 1.0));
        const gp = p.group.position;
        this.env.occluders.value[idx].set(gp.x, gp.y, gp.z, p.size * 1.05);
      }
    });
    this.flames.commit(fi);
  }

  reset() {
    for (const p of this.all) p.douse();
  }
}
