/* ============================================================
   audio.js — âm thanh tổng hợp bằng Web Audio (không cần tệp ngoài)
   ============================================================ */
(function () {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuf = null;
      this.enabled = true;
      this.ambientStarted = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.36;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 1.2);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.startAmbient();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    startAmbient() {
      if (this.ambientStarted || !this.ctx) return;
      this.ambientStarted = true;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0.045;
      src.connect(filter).connect(gain).connect(this.master);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
      src.start();

      // distant industrial hum
      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 46;
      const hg = ctx.createGain();
      hg.gain.value = 0.012;
      hum.connect(hg).connect(this.master);
      hum.start();
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    tone({ freq = 440, end = null, dur = 0.15, type = 'sine', gain = 0.1, attack = 0.004, delay = 0 }) {
      if (!this.ctx || !this.enabled) return;
      const t = this.now() + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (end !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    noise({ dur = 0.1, gain = 0.1, type = 'lowpass', freq = 1200, end = null, q = 0.7, delay = 0 }) {
      if (!this.ctx || !this.enabled) return;
      const t = this.now() + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (end !== null) f.frequency.exponentialRampToValueAtTime(Math.max(40, end), t + dur);
      f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random() * 0.2);
      src.stop(t + dur + 0.02);
    }

    shoot(id) {
      if (!this.ctx) return;
      if (id === 'pistol') {
        this.noise({ dur: 0.09, gain: 0.2, type: 'highpass', freq: 900, end: 500 });
        this.tone({ freq: 165, end: 55, dur: 0.1, type: 'triangle', gain: 0.16 });
      } else if (id === 'shotgun') {
        this.noise({ dur: 0.26, gain: 0.3, type: 'lowpass', freq: 2200, end: 300 });
        this.tone({ freq: 105, end: 34, dur: 0.22, type: 'triangle', gain: 0.24 });
      } else if (id === 'rifle') {
        this.noise({ dur: 0.07, gain: 0.17, type: 'highpass', freq: 1300, end: 700 });
        this.tone({ freq: 220, end: 70, dur: 0.07, type: 'square', gain: 0.1 });
      } else if (id === 'turret') {
        this.noise({ dur: 0.05, gain: 0.08, type: 'bandpass', freq: 1900, q: 1.4 });
        this.tone({ freq: 300, end: 120, dur: 0.05, type: 'square', gain: 0.04 });
      } else if (id === 'soldier') {
        this.noise({ dur: 0.075, gain: 0.1, type: 'highpass', freq: 1000 });
        this.tone({ freq: 190, end: 70, dur: 0.07, type: 'triangle', gain: 0.07 });
      } else {
        this.noise({ dur: 0.1, gain: 0.12, type: 'bandpass', freq: 1500, q: 1.2 });
      }
    }

    melee() {
      this.noise({ dur: 0.14, gain: 0.14, type: 'bandpass', freq: 1800, end: 500, q: 1.8 });
      this.tone({ freq: 320, end: 140, dur: 0.08, type: 'sawtooth', gain: 0.03 });
    }

    hit() {
      this.noise({ dur: 0.08, gain: 0.13, type: 'lowpass', freq: 700, end: 180 });
      this.tone({ freq: 120, end: 60, dur: 0.09, type: 'triangle', gain: 0.09 });
    }

    kill() {
      this.noise({ dur: 0.2, gain: 0.14, type: 'lowpass', freq: 500, end: 120 });
      this.tone({ freq: 90, end: 35, dur: 0.22, type: 'sawtooth', gain: 0.07 });
    }

    hurt() {
      this.tone({ freq: 190, end: 55, dur: 0.25, type: 'sawtooth', gain: 0.12 });
      this.noise({ dur: 0.25, gain: 0.12, type: 'lowpass', freq: 400, end: 100 });
    }

    pickup(good = false) {
      this.tone({ freq: good ? 620 : 480, end: good ? 980 : 700, dur: 0.12, type: 'sine', gain: 0.07 });
      this.tone({ freq: good ? 940 : 720, end: good ? 1320 : 980, dur: 0.14, type: 'sine', gain: 0.045, delay: 0.06 });
    }

    build() {
      this.tone({ freq: 140, end: 70, dur: 0.1, type: 'square', gain: 0.07 });
      this.tone({ freq: 110, end: 55, dur: 0.14, type: 'triangle', gain: 0.1, delay: 0.1 });
      this.noise({ dur: 0.12, gain: 0.08, type: 'lowpass', freq: 900, delay: 0.1 });
    }

    levelup() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        this.tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.07, delay: i * 0.09 });
        this.tone({ freq: f * 2, dur: 0.2, type: 'sine', gain: 0.025, delay: i * 0.09 });
      });
    }

    quest() {
      this.tone({ freq: 587, end: 784, dur: 0.18, type: 'triangle', gain: 0.07 });
      this.tone({ freq: 880, end: 1174, dur: 0.28, type: 'sine', gain: 0.05, delay: 0.12 });
    }

    wave() {
      this.tone({ freq: 70, end: 42, dur: 1.1, type: 'sawtooth', gain: 0.1 });
      this.tone({ freq: 105, end: 63, dur: 1.2, type: 'triangle', gain: 0.05, delay: 0.05 });
      this.noise({ dur: 1.4, gain: 0.06, type: 'lowpass', freq: 300, end: 90 });
    }

    explosion() {
      this.noise({ dur: 0.7, gain: 0.35, type: 'lowpass', freq: 1400, end: 60 });
      this.tone({ freq: 80, end: 22, dur: 0.55, type: 'sawtooth', gain: 0.22 });
    }

    empty() {
      this.tone({ freq: 190, dur: 0.035, type: 'square', gain: 0.05 });
    }

    reload() {
      this.tone({ freq: 300, dur: 0.04, type: 'square', gain: 0.04 });
      this.tone({ freq: 210, dur: 0.05, type: 'square', gain: 0.05, delay: 0.18 });
    }

    heal() {
      this.tone({ freq: 330, end: 440, dur: 0.3, type: 'sine', gain: 0.06 });
      this.tone({ freq: 495, end: 660, dur: 0.35, type: 'sine', gain: 0.04, delay: 0.08 });
    }

    click() {
      this.tone({ freq: 720, dur: 0.03, type: 'square', gain: 0.025 });
    }

    error() {
      this.tone({ freq: 150, end: 110, dur: 0.16, type: 'square', gain: 0.06 });
    }

    bossRoar() {
      this.tone({ freq: 55, end: 28, dur: 1.6, type: 'sawtooth', gain: 0.18 });
      this.noise({ dur: 1.5, gain: 0.12, type: 'lowpass', freq: 500, end: 80 });
    }
  }

  TT.AudioEngine = AudioEngine;
  TT.audio = new AudioEngine();
})();
