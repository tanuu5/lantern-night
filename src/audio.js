// Fully procedural soundscape (Web Audio): wind, drone, crickets, owls, an original
// music-box waltz in A minor, and one-shot effects for every interaction.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// [beat, midi note, beats]  — 3/4 waltz, original melody
const MELODY = [
  [0, 76, 2], [2, 69, 1], [3, 72, 1], [4, 71, 1], [5, 69, 1],
  [6, 68, 2], [8, 71, 1], [9, 64, 3],
  [12, 76, 2], [14, 69, 1], [15, 72, 1], [16, 71, 1], [17, 69, 1],
  [18, 77, 1], [19, 76, 1], [20, 74, 1], [21, 76, 3],
  [24, 77, 2], [26, 74, 1], [27, 76, 2], [29, 72, 1],
  [30, 74, 1], [31, 72, 1], [32, 71, 1], [33, 69, 3],
];
const BASS = [
  [0, 45], [3, 45], [6, 40], [9, 40], [12, 45], [15, 41], [18, 50], [21, 40],
  [24, 50], [27, 45], [30, 40], [33, 45],
];
const PENTA = [57, 60, 62, 64, 67];

export class SpookyAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.lastTick = 0;
    this.lastBounce = 0;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, ctx.currentTime, 1.2);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.2, 2.6);
    this.revIn = ctx.createGain();
    this.revIn.gain.value = 1;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.revIn.connect(this.reverb).connect(revOut).connect(this.master);

    this.noise = this.noiseBuffer(3, 'white');
    this.brown = this.noiseBuffer(5, 'brown');

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });

    this.startWind();
    this.startDrone();
    this.startCrickets();
    this.scheduleOwl(6);
    this.musicTimer = setTimeout(() => this.musicBox(0.85), 4000);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15);
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(seconds, kind) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  // Route a node to the master (and reverb) with pan.
  out(node, { pan = 0, rev = 0.3, gain = 1 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      tail = p;
    }
    node.connect(g);
    tail.connect(this.master);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      tail.connect(s).connect(this.revIn);
    }
    return g;
  }

  noiseSource(buf = this.noise, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  // ------------------------------------------------------------------ ambience
  startWind() {
    const ctx = this.ctx;
    const src = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    src.connect(lp).connect(g);
    this.out(g, { rev: 0.2 });
    src.start();

    const src2 = this.noiseSource();
    src2.playbackRate.value = 0.93;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 9;
    const g2 = ctx.createGain();
    g2.gain.value = 0.02;
    src2.connect(bp).connect(g2);
    let pan = null;
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      g2.connect(pan);
      pan.connect(this.master);
      const rs = ctx.createGain();
      rs.gain.value = 0.4;
      pan.connect(rs).connect(this.revIn);
    } else g2.connect(this.master);
    src2.start();

    const mod = () => {
      const t = ctx.currentTime;
      lp.frequency.setTargetAtTime(280 + Math.random() * 700, t, 1.6);
      g.gain.setTargetAtTime(0.035 + Math.random() * 0.09, t, 1.8);
      bp.frequency.setTargetAtTime(600 + Math.random() * 900, t, 1.4);
      g2.gain.setTargetAtTime(Math.random() < 0.35 ? 0.035 + Math.random() * 0.03 : 0.006, t, 1.5);
      if (pan) pan.pan.setTargetAtTime(Math.random() * 1.6 - 0.8, t, 2);
      this.windTimer = setTimeout(mod, 2200 + Math.random() * 2000);
    };
    mod();
  }

  startDrone() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.gain.setTargetAtTime(0.045, ctx.currentTime, 4);
    this.droneGain = g;
    for (const [f, type, det] of [[55, 'sawtooth', -4], [55, 'sawtooth', 5], [82.41, 'triangle', 0], [110, 'sine', 2]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ctx.createGain();
    lg.gain.value = 90;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start();
    lp.connect(g);
    this.out(g, { rev: 0.5 });
  }

  startCrickets() {
    const ctx = this.ctx;
    const chirp = () => {
      this.cricketTimer = setTimeout(chirp, 350 + Math.random() * 1300);
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.05;
      const pan = Math.random() * 1.8 - 0.9;
      const f = 4300 + Math.random() * 600;
      const pulses = 3 + Math.floor(Math.random() * 2);
      for (let k = 0; k < pulses; k++) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        const s = t + k * 0.055;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.012, s + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
        o.connect(g);
        this.out(g, { pan, rev: 0.25 });
        o.start(s);
        o.stop(s + 0.05);
      }
    };
    chirp();
  }

  scheduleOwl(delay) {
    this.owlTimer = setTimeout(() => {
      if (this.ctx.state === 'running') this.owl();
      this.scheduleOwl(18 + Math.random() * 25);
    }, delay * 1000);
  }

  owl() {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const pan = Math.random() * 1.6 - 0.8;
    const hoots = [[0, 0.32, 1], [0.62, 0.18, 0.7], [0.86, 0.42, 0.9]];
    for (const [off, dur, vel] of hoots) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const s = t + off;
      o.frequency.setValueAtTime(390, s);
      o.frequency.linearRampToValueAtTime(350, s + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.05 * vel, s + 0.05);
      g.gain.setValueAtTime(0.05 * vel, s + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, s + dur + 0.06);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      o.connect(lp).connect(g);
      this.out(g, { pan, rev: 0.7 });
      o.start(s);
      o.stop(s + dur + 0.1);
    }
  }

  // ------------------------------------------------------------------ music
  bell(freq, t, vel = 0.16, dur = 2.2, pan = 0, rev = 0.55) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [mul, amp] of [[1, 1], [2.0, 0.28], [3.01, 0.1], [4.17, 0.06]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    this.out(g, { pan, rev });
  }

  musicBox(beat = 0.68, loud = 1, repeat = true) {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      clearTimeout(this.musicTimer);
      this.musicTimer = setTimeout(() => this.musicBox(beat, loud, repeat), 5000);
      return;
    }
    const t0 = this.ctx.currentTime + 0.1;
    for (const [b, m, len] of MELODY) this.bell(midi(m), t0 + b * beat, 0.09 * loud, 1.4 + len * beat, 0.15, 0.6);
    for (const [b, m] of BASS) {
      this.bell(midi(m), t0 + b * beat, 0.05 * loud, 2.2, -0.2, 0.5);
      this.bell(midi(m + 12 + 3), t0 + (b + 1) * beat, 0.025 * loud, 1.2, -0.1, 0.5);
      this.bell(midi(m + 12 + 7), t0 + (b + 2) * beat, 0.025 * loud, 1.2, -0.1, 0.5);
    }
    const total = 36 * beat;
    clearTimeout(this.musicTimer);
    if (repeat) this.musicTimer = setTimeout(() => this.musicBox(0.85, 1, true), (total + 22 + Math.random() * 18) * 1000);
  }

  // ------------------------------------------------------------------ one-shots
  tick() {
    if (!this.ctx || this.ctx.currentTime - this.lastTick < 0.08) return;
    this.lastTick = this.ctx.currentTime;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.025, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g);
    this.out(g, { rev: 0.2 });
    o.start(t);
    o.stop(t + 0.08);
  }

  whoosh(t, dur = 0.5, from = 300, to = 2400, gain = 0.25, pan = 0) {
    const ctx = this.ctx;
    const s = this.noiseSource(this.noise, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.3;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.4);
    s.connect(bp).connect(g);
    this.out(g, { pan, rev: 0.3 });
    s.start(t, Math.random() * 2);
    s.stop(t + dur * 1.5);
  }

  fly(pan = 0) {
    if (!this.ctx) return;
    this.whoosh(this.now, 0.45, 600, 3000, 0.08, pan);
    this.bell(midi(88), this.now + 0.05, 0.02, 0.6, pan, 0.6);
  }

  carve(pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    for (let k = 0; k < 5; k++) {
      const s = this.noiseSource(this.noise, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 2500 + Math.random() * 2500;
      hp.Q.value = 2;
      const g = ctx.createGain();
      const st = t + k * 0.17 + Math.random() * 0.05;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.06, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
      s.connect(hp).connect(g);
      this.out(g, { pan, rev: 0.15 });
      s.start(st, Math.random() * 2);
      s.stop(st + 0.15);
    }
  }

  ignite(index, pan = 0, big = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    this.whoosh(t, big ? 0.9 : 0.55, 180, big ? 1800 : 2600, big ? 0.4 : 0.28, pan);
    // thump
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(big ? 70 : 110, t);
    o.frequency.exponentialRampToValueAtTime(big ? 32 : 48, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(big ? 0.5 : 0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.2 : 0.4));
    o.connect(g);
    this.out(g, { pan, rev: 0.2 });
    o.start(t);
    o.stop(t + 1.3);
    // crackle
    for (let k = 0; k < (big ? 40 : 16); k++) {
      const s = this.noiseSource(this.noise, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800 + Math.random() * 3000;
      const cg = ctx.createGain();
      const st = t + 0.1 + Math.random() * (big ? 2.0 : 1.1);
      const v = 0.02 + Math.random() * 0.06;
      cg.gain.setValueAtTime(v, st);
      cg.gain.exponentialRampToValueAtTime(0.0001, st + 0.012 + Math.random() * 0.02);
      s.connect(hp).connect(cg);
      this.out(cg, { pan: pan + (Math.random() - 0.5) * 0.3, rev: 0.1 });
      s.start(st, Math.random() * 2.5);
      s.stop(st + 0.05);
    }
    // rising chime: each new pumpkin is one step higher on the pentatonic scale
    const base = PENTA[index % 5] + 12 * (1 + Math.floor(index / 5));
    this.bell(midi(base), t + 0.12, 0.09, 2.4, pan, 0.6);
    this.bell(midi(base + 7), t + 0.24, 0.06, 2.2, pan, 0.6);
    if (big) [0, 3, 7, 12, 15, 19].forEach((iv, k) => this.bell(midi(57 + iv), t + 0.1 + k * 0.09, 0.07, 3.5, (k - 2.5) * 0.25, 0.8));
  }

  ghostMoan(pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 170 + Math.random() * 60;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.5, t + 0.7);
    o.frequency.linearRampToValueAtTime(f0 * 1.15, t + 1.5);
    o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 2.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.value = f0 * 0.03;
    vib.connect(vg).connect(o.frequency);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 320;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 820;
    f2.Q.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.5);
    g.gain.linearRampToValueAtTime(0.11, t + 1.6);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    o.connect(f1).connect(g);
    o.connect(f2).connect(g);
    this.out(g, { pan, rev: 0.8, gain: 0.9 });
    o.start(t);
    vib.start(t);
    o.stop(t + 2.7);
    vib.stop(t + 2.7);
  }

  boo(pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    // "hee-hee" giggle
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const s = t + k * 0.13;
      o.frequency.setValueAtTime(620 + k * 40, s);
      o.frequency.exponentialRampToValueAtTime(900 + k * 60, s + 0.09);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.08, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.11);
      o.connect(bp).connect(g);
      this.out(g, { pan, rev: 0.5 });
      o.start(s);
      o.stop(s + 0.13);
    }
  }

  free(pan = 0) {
    if (!this.ctx) return;
    const t = this.now;
    this.whoosh(t, 0.25, 900, 5000, 0.12, pan);
    const notes = [72, 76, 79, 84, 88, 91];
    notes.forEach((m, k) => this.bell(midi(m), t + 0.03 + k * 0.055, 0.05, 1.6, pan + (k - 3) * 0.08, 0.7));
  }

  candyBounce(strength) {
    if (!this.ctx || this.ctx.currentTime - this.lastBounce < 0.035) return;
    this.lastBounce = this.ctx.currentTime;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.frequency.value = 1800 + Math.random() * 1600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.03, strength * 0.006), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g);
    this.out(g, { pan: Math.random() - 0.5, rev: 0.1 });
    o.start(t);
    o.stop(t + 0.05);
  }

  bats(duration = 2.6) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    for (let k = 0; k < 46; k++) {
      const s = t + Math.random() * duration;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(7500 + Math.random() * 2500, s);
      o.frequency.exponentialRampToValueAtTime(4200 + Math.random() * 800, s + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.022, s + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.035);
      o.connect(g);
      this.out(g, { pan: Math.random() * 2 - 1, rev: 0.25 });
      o.start(s);
      o.stop(s + 0.04);
    }
    // wing flutter
    const src = this.noiseSource(this.noise, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 16;
    const lg = ctx.createGain();
    lg.gain.value = 0.05;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.6);
    env.gain.linearRampToValueAtTime(0, t + duration + 0.5);
    lfo.connect(lg).connect(g.gain);
    src.connect(bp).connect(g).connect(env);
    this.out(env, { rev: 0.2 });
    src.start(t);
    lfo.start(t);
    src.stop(t + duration + 0.6);
    lfo.stop(t + duration + 0.6);
  }

  thunder(delay = 0.8, strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now + delay;
    // crack
    const c = this.noiseSource(this.noise, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.35 * strength, t + 0.01);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    c.connect(hp).connect(cg);
    this.out(cg, { rev: 0.6, pan: (Math.random() - 0.5) * 0.6 });
    c.start(t, Math.random());
    c.stop(t + 0.5);
    // rumble
    const r = this.noiseSource(this.brown, false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.25);
    let tt = t + 0.25;
    for (let k = 0; k < 6; k++) {
      tt += 0.3 + Math.random() * 0.5;
      rg.gain.exponentialRampToValueAtTime((0.25 + Math.random() * 0.6) * strength * (1 - k / 7), tt);
    }
    rg.gain.exponentialRampToValueAtTime(0.0001, tt + 2.5);
    r.connect(lp).connect(rg);
    this.out(rg, { rev: 0.5 });
    r.start(t);
    r.stop(tt + 2.6);
  }

  pop(pan = 0, dist = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now + dist * 0.15;
    const s = this.noiseSource(this.noise, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    s.connect(bp).connect(g);
    this.out(g, { pan, rev: 0.7 });
    s.start(t, Math.random() * 2);
    s.stop(t + 0.55);
    for (let k = 0; k < 14; k++) {
      const cs = this.noiseSource(this.noise, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const cg = ctx.createGain();
      const st = t + 0.25 + Math.random() * 1.2;
      cg.gain.setValueAtTime(0.03, st);
      cg.gain.exponentialRampToValueAtTime(0.0001, st + 0.02);
      cs.connect(hp).connect(cg);
      this.out(cg, { pan: pan + (Math.random() - 0.5) * 0.5, rev: 0.4 });
      cs.start(st, Math.random() * 2);
      cs.stop(st + 0.03);
    }
  }

  finale() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now + 0.1;
    // swelling pad (A minor add9)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 5);
    lp.frequency.exponentialRampToValueAtTime(600, t + 16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 3.5);
    g.gain.setValueAtTime(0.07, t + 10);
    g.gain.linearRampToValueAtTime(0, t + 17);
    for (const m of [45, 52, 57, 60, 64, 71]) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + 17.5);
      }
    }
    lp.connect(g);
    this.out(g, { rev: 0.8 });
    // gong
    this.bell(55, t, 0.25, 8, 0, 0.9);
    this.bell(110 * 1.003, t, 0.12, 6, 0, 0.9);
    clearTimeout(this.musicTimer);
    this.musicTimer = setTimeout(() => this.musicBox(0.5, 1.4, false), 2600);
    setTimeout(() => this.musicBox(0.5, 1.2, true), 2600 + 36 * 500 + 400);
  }
}
