import * as THREE from 'three';
import { heightAt, KING_POS } from './world/layout.js';
import { clamp, damp, easeInOutCubic, smoothstep } from './util/math.js';

const C = (r, g, b) => new THREE.Color().setRGB(r, g, b);
const CHIPS = [C(1.0, 0.55, 0.12), C(0.95, 0.7, 0.3), C(0.8, 0.35, 0.05)];
const FLARE = [C(4.0, 1.8, 0.4), C(3.0, 1.0, 0.15), C(4.5, 3.0, 1.2)];
const EMBER = C(2.4, 0.9, 0.15);
const SPIRIT = [C(0.6, 2.4, 2.0), C(1.2, 2.6, 2.6), C(0.4, 1.4, 2.6)];
const CONFETTI = [C(3, 1.2, 0.2), C(1.6, 0.6, 3), C(1, 3, 0.8), C(3, 0.8, 2), C(3, 3, 1)];

const DEFAULT_VIEW = { pos: new THREE.Vector3(3.5, 6.4, 23.5), target: new THREE.Vector3(-1.2, 2.4, -3.5) };
const FINALE_VIEW = { pos: new THREE.Vector3(9, 4.6, 16.5), target: new THREE.Vector3(-1.6, 4.2, -3) };

const MILESTONES = {
  1: 'ひとつ目の灯がともった',
  3: '墓地のほうで、なにかが目を覚ました…',
  6: '風が、少しだけあたたかい',
  9: 'あと四つ',
  12: '最後のひとつ',
};

export class Game {
  constructor(w) {
    this.w = w;
    this.started = false;
    this.lit = 0;
    this.freed = 0;
    this.finale = null;
    this.finaleK = 0;
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerInside = false;
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
    this.down = null;
    this.ghostT = 3;
    this.thunderT = 28 + Math.random() * 25;
    this.camTween = null;
    this.introAngle = 0;
    this.tmp = new THREE.Vector3();
    this.ndc = new THREE.Vector3();
    this.baseFog = w.env.fogColor.clone();
    this.finaleFog = C(0.05, 0.024, 0.052);
    this.hud = true;

    const { pumpkins, ghosts, particles, candy, fireworks, audio } = w;

    pumpkins.onCarveChip = (pos) => {
      particles.burst(pos, { count: 2, speed: 2.6, up: 0.7, spread: 0.8, colors: CHIPS, size: [0.03, 0.055], life: [0.5, 1.1], grav: -7, drag: 0.6, flick: 0, bounce: 1 });
    };
    pumpkins.onIgnite = (p) => this.onIgnite(p);
    pumpkins.onEmber = (pos) => {
      particles.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, EMBER.r, EMBER.g, EMBER.b, 0.035 + Math.random() * 0.03, 1.2 + Math.random() * 1.2, 0.25, 0.8, 0.7);
    };
    ghosts.onSpawn = (g) => audio.ghostMoan(this.panOf(g.pos));
    ghosts.onPop = (g) => {
      const at = g.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
      candy.burst(at, 24);
      particles.burst(at, { count: 90, speed: 6, up: 0.4, colors: CONFETTI, size: [0.04, 0.1], life: [0.8, 1.8], grav: -4, drag: 1.6, flick: 0.4 });
      particles.burst(at, { count: 40, speed: 2, up: 0.8, colors: SPIRIT, size: [0.08, 0.16], life: [1.0, 2.0], grav: 0.6, drag: 1.2, flick: 0.3 });
      audio.free(this.panOf(at));
      this.freed++;
      w.ui.setFreed(this.freed);
      if (this.freed === 1) w.ui.toast('おばけはお菓子になって消えた');
    };
    candy.onBounce = (p, s) => audio.candyBounce(s);
    fireworks.onBurst = (p) => audio.pop(this.panOf(p), clamp(p.distanceTo(w.camera.position) / 60, 0.3, 2));

    this.bindEvents();
  }

  panOf(pos) {
    this.ndc.copy(pos).project(this.w.camera);
    return clamp(this.ndc.x, -1, 1) * 0.85;
  }

  bindEvents() {
    const { canvas } = this.w;
    const setPointer = (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerInside = true;
    };
    canvas.addEventListener('pointermove', setPointer);
    canvas.addEventListener('pointerdown', (e) => {
      setPointer(e);
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
      canvas.classList.add('dragging');
    });
    window.addEventListener('pointerup', (e) => {
      canvas.classList.remove('dragging');
      if (!this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      const dt = performance.now() - this.down.t;
      this.down = null;
      if (moved < 7 && dt < 700 && this.started) {
        setPointer(e);
        this.click();
      }
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointerInside = false;
    });
    window.addEventListener('keydown', (e) => {
      if (!this.started || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'l') this.thunder();
      else if (k === 'b') this.releaseBats();
      else if (k === 'm') this.toggleMute();
      else if (k === 'r') this.reset();
      else if (k === 'h') this.toggleHud();
    });
    const $ = (id) => document.getElementById(id);
    $('btn-sound').addEventListener('click', () => this.toggleMute());
    $('btn-thunder').addEventListener('click', () => this.thunder());
    $('btn-bats').addEventListener('click', () => this.releaseBats());
    $('btn-reset').addEventListener('click', () => this.reset());
    $('again').addEventListener('click', () => this.reset());
    $('stay').addEventListener('click', () => this.w.ui.showFinale(false));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.w.audio.start();
    this.w.ui.enter();
    this.tweenCamera(DEFAULT_VIEW.pos, DEFAULT_VIEW.target, 3.2, () => {
      const c = this.w.controls;
      c.minDistance = 7;
      c.maxDistance = 42;
      c.minPolarAngle = 0.55;
      c.maxPolarAngle = 1.5;
      c.minAzimuthAngle = -1.75;
      c.maxAzimuthAngle = 1.75;
    });
    setTimeout(() => this.w.ui.toast(this.w.ui.touch ? 'カボチャをタップして灯そう' : '鬼火を動かして、カボチャをクリック'), 3600);
  }

  toggleMute() {
    const a = this.w.audio;
    a.setMuted(!a.muted);
    this.w.ui.setMuted(a.muted);
  }

  toggleHud() {
    this.hud = !this.hud;
    this.w.ui.hud.classList.toggle('hidden', !this.hud);
  }

  tweenCamera(pos, target, dur, done) {
    this.camTween = {
      fromPos: this.w.camera.position.clone(),
      fromTarget: this.w.controls.target.clone(),
      pos: pos.clone(),
      target: target.clone(),
      t: 0,
      dur,
      done,
    };
    this.w.controls.enabled = false;
  }

  // ------------------------------------------------------------------ picking
  groundHit(ray) {
    const o = ray.origin;
    const d = ray.direction;
    let prev = 0;
    let t = 0.5;
    for (let i = 0; i < 160; i++) {
      const y = o.y + d.y * t;
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      if (y < heightAt(x, z)) {
        let a = prev;
        let b = t;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m < heightAt(o.x + d.x * m, o.z + d.z * m)) b = m;
          else a = m;
        }
        return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
      }
      prev = t;
      t += 0.35 + t * 0.03;
      if (t > 110) break;
    }
    return null;
  }

  pick() {
    const { camera, pumpkins, ghosts, house } = this.w;
    this.raycaster.setFromCamera(this.pointer, camera);
    const targets = [];
    for (const p of pumpkins.items) if (p.state === 'dark' && !p.targeted) targets.push(p.proxy);
    for (const g of ghosts.list) if (g.state === 'wander' || g.state === 'dance') targets.push(g.proxy);
    targets.push(house.proxy);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    const o = hits[0].object;
    if (o.userData.pumpkin) return { type: 'pumpkin', obj: o.userData.pumpkin, point: hits[0].point };
    if (o.userData.ghost) return { type: 'ghost', obj: o.userData.ghost, point: hits[0].point };
    return { type: 'house', point: hits[0].point };
  }

  click() {
    const { onibi, ghosts, audio, particles } = this.w;
    const hit = this.pick();
    if (hit?.type === 'pumpkin') {
      const p = hit.obj;
      if (onibi.busy) return;
      p.targeted = true;
      audio.fly(this.panOf(p.group.position));
      onibi.flyTo(p.worldPoint(new THREE.Vector3(0, 0.15, 1.05)), () => {
        if (p.ignite()) audio.carve(this.panOf(p.group.position));
      });
    } else if (hit?.type === 'ghost') {
      if (ghosts.boo(hit.obj)) audio.boo(this.panOf(hit.obj.pos));
    } else if (hit?.type === 'house') {
      this.releaseBats();
    } else {
      const ground = this.groundHit(this.raycaster.ray);
      if (!ground && this.raycaster.ray.direction.y > 0.02) {
        this.thunder();
      } else {
        onibi.pulse = 1;
        particles.burst(onibi.pos, { count: 26, speed: 2.4, up: 0.3, colors: SPIRIT, size: [0.04, 0.09], life: [0.5, 1.1], grav: 0.4, drag: 2, flick: 0.4 });
        audio.tick();
      }
    }
  }

  // ------------------------------------------------------------------ events
  onIgnite(p) {
    const { particles, audio, ui, ghosts } = this.w;
    const pos = p.worldPoint(p.flameLocal, new THREE.Vector3());
    particles.burst(pos, { count: p.king ? 260 : 80, speed: p.king ? 8 : 4.2, up: 1.0, colors: FLARE, size: p.king ? [0.08, 0.2] : [0.05, 0.13], life: [0.6, 1.7], grav: -0.8, drag: 1.5, flick: 0.5, radius: 0.3 * p.size });
    if (p.king) {
      audio.ignite(13, this.panOf(pos), true);
      return;
    }
    audio.ignite(this.lit, this.panOf(pos));
    this.lit = this.w.pumpkins.litCount;
    ui.setLit(this.lit);
    if (MILESTONES[this.lit]) ui.toast(MILESTONES[this.lit]);
    if (this.lit === 3 && ghosts.active.length < 3) this.ghostT = 0.4;
    if (this.lit >= 13 && !this.finale) {
      this.finale = { t: 0, kingLit: false, batsDone: false, panel: false, nextFirework: 3.4 };
      setTimeout(() => ui.toast('十三の灯がそろった――', 3000), 500);
    }
  }

  thunder() {
    const { lightning, audio, camera } = this.w;
    const base = lightning.strike(camera);
    const dist = base.distanceTo(camera.position);
    audio.thunder(0.25 + dist / 500, 1);
    if (Math.random() < 0.45) setTimeout(() => this.releaseBats(0.6), 900);
    this.thunderT = 40 + Math.random() * 40;
  }

  releaseBats(intensity = 1) {
    const { bats, audio, camera } = this.w;
    bats.swarm(camera, intensity);
    setTimeout(() => audio.bats(2.8), 500);
  }

  reset() {
    const { pumpkins, ghosts, candy, ui } = this.w;
    if (this.camTween) return;
    pumpkins.reset();
    for (const p of pumpkins.items) p.targeted = false;
    ghosts.stopDance();
    ghosts.clear();
    candy.clear();
    this.lit = 0;
    this.finale = null;
    ui.setLit(0);
    ui.showFinale(false);
    ui.toast('灯が消えた。もう一度、夜をはじめよう');
    this.ghostT = 4;
  }

  // ------------------------------------------------------------------ frame
  update(dt, t) {
    const w = this.w;
    const { camera, controls, onibi, pumpkins, ghosts, sky, fireworks, env } = w;

    // camera choreography
    if (!this.started) {
      this.introAngle += dt * 0.05;
      const a = -0.35 + Math.sin(this.introAngle) * 0.5;
      const r = 17;
      camera.position.set(KING_POS.x + Math.sin(a) * r, 4.2 + Math.sin(this.introAngle * 1.7) * 0.6, KING_POS.z + Math.cos(a) * r);
      controls.target.set(KING_POS.x, 3.0, KING_POS.z - 4);
    } else if (this.camTween) {
      const c = this.camTween;
      c.t += dt;
      const k = easeInOutCubic(clamp(c.t / c.dur, 0, 1));
      camera.position.lerpVectors(c.fromPos, c.pos, k);
      controls.target.lerpVectors(c.fromTarget, c.target, k);
      if (c.t >= c.dur) {
        this.camTween = null;
        controls.enabled = true;
        if (c.done) c.done();
      }
    }

    // onibi follows the pointer across the ground
    if (this.started && this.pointerInside && !onibi.busy) {
      this.raycaster.setFromCamera(this.pointer, camera);
      let p = this.groundHit(this.raycaster.ray);
      if (!p) p = this.raycaster.ray.at(16, new THREE.Vector3());
      const cx = 0;
      const cz = -3;
      const dx = p.x - cx;
      const dz = p.z - cz;
      const dd = Math.hypot(dx, dz);
      if (dd > 30) {
        p.x = cx + (dx / dd) * 30;
        p.z = cz + (dz / dd) * 30;
      }
      const gy = heightAt(p.x, p.z);
      p.y = clamp(p.y, gy, gy + 4) + 1.1;
      onibi.target.copy(p);
    } else if (!this.started) {
      onibi.target.set(KING_POS.x + 3.2 + Math.sin(t * 0.4) * 2, 2.0 + Math.sin(t * 0.9) * 0.4, KING_POS.z + 3.5 + Math.cos(t * 0.3) * 1.5);
    }

    // hover
    let hov = null;
    if (this.started && this.pointerInside && !this.down) hov = this.pick();
    const hovPumpkin = hov?.type === 'pumpkin' ? hov.obj : null;
    for (const p of pumpkins.items) p.hover = damp(p.hover, p === hovPumpkin ? 1 : 0, 10, dt);
    const key = hov ? (hov.type === 'pumpkin' ? 'p' + hov.obj.index : hov.type === 'ghost' ? 'g' + hov.obj.id : 'h') : null;
    if (key !== this.hovered) {
      if (key && hov.type === 'pumpkin') w.audio.tick();
      this.hovered = key;
      w.canvas.classList.toggle('pointer', !!key);
    }

    // ghost population grows with the light
    if (this.started) {
      this.ghostT -= dt;
      const want = this.finale ? 9 : Math.min(9, 2 + Math.floor(this.lit * 0.55));
      if (this.ghostT <= 0) {
        this.ghostT = 3 + Math.random() * 4;
        if (ghosts.active.length < want) ghosts.spawn();
      }
      this.thunderT -= dt;
      if (this.thunderT <= 0 && !this.finale) this.thunder();
    }

    // finale choreography
    if (this.finale) {
      const f = this.finale;
      f.t += dt;
      if (f.t > 1.2 && !f.cam) {
        f.cam = true;
        w.audio.finale();
        this.tweenCamera(FINALE_VIEW.pos, FINALE_VIEW.target, 3.5);
      }
      if (f.t > 1.8 && !f.kingLit) {
        f.kingLit = true;
        pumpkins.king.ignite();
        w.audio.carve(0);
      }
      if (f.t > 4.2 && !f.batsDone) {
        f.batsDone = true;
        this.releaseBats(1);
        ghosts.startDance();
      }
      if (f.t > 6.0 && !f.panel) {
        f.panel = true;
        w.ui.showFinale(true);
      }
      if (f.t > f.nextFirework) {
        const busy = f.t < 30;
        f.nextFirework = f.t + (busy ? 0.6 + Math.random() * 1.0 : 3 + Math.random() * 5);
        const origin = new THREE.Vector3(-16 + Math.random() * 46, 0, -34 - Math.random() * 26);
        origin.y = heightAt(origin.x, origin.z);
        const target = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 15 + Math.random() * 11, (Math.random() - 0.5) * 8));
        fireworks.launch(origin, target);
      }
      this.finaleK = damp(this.finaleK, smoothstep(3.5, 7, f.t), 1.5, dt);
    } else {
      this.finaleK = damp(this.finaleK, 0, 1.2, dt);
    }
    sky.uniforms.uFinale.value = this.finaleK;
    const fogCol = this.baseFog.clone().lerp(this.finaleFog, this.finaleK);
    env.fogColor.copy(fogCol);
    w.scene.fog.color.copy(fogCol);
  }
}
