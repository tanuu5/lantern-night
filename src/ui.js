// DOM overlay: counters, toast messages, buttons, intro and finale panels.
export class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.hud = this.$('hud');
    this.intro = this.$('intro');
    this.finale = this.$('finale');
    this.toastEl = this.$('toast');
    this.hint = this.$('hint');
    this.startBtn = this.$('start');
    this.toastTimer = null;
    this.hintTimer = null;
    this.touch = window.matchMedia('(pointer: coarse)').matches;
    if (this.touch) {
      document.querySelectorAll('[data-touch]').forEach((el) => (el.textContent = el.dataset.touch));
      this.$('intro-note').textContent = '音が出ます ・ スワイプで見回す ・ タップで灯す';
    }
  }

  ready() {
    this.startBtn.disabled = false;
    this.$('start-label').textContent = '夜へ入る';
  }

  enter() {
    this.intro.classList.add('hidden');
    this.hud.classList.remove('hidden');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint.classList.add('fade'), 16000);
  }

  setLit(n) {
    const el = this.$('lit');
    if (el.textContent !== String(n)) {
      el.textContent = n;
      this.bump('c-pumpkin');
    }
  }

  setFreed(n) {
    const el = this.$('freed');
    if (el.textContent !== String(n)) {
      el.textContent = n;
      this.bump('c-ghost');
    }
  }

  bump(id) {
    const el = this.$(id);
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  toast(msg, ms = 2600) {
    const el = this.toastEl;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  showFinale(show) {
    this.finale.classList.toggle('hidden', !show);
  }

  setMuted(m) {
    this.$('btn-sound').classList.toggle('muted', m);
  }
}
