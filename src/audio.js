export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.ambience = null;
    this.nightMode = false;
    this.started = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
      this.startAmbience();
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.05);
    }
  }

  startAmbience() {
    if (!this.ctx || this.ambience) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      const drone = this.ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 43;
      const dg = this.ctx.createGain();
      dg.gain.value = 0.028;
      drone.connect(dg).connect(this.master);
      drone.start();
      this.ambience = { gain, filter, src, drone, dg };
    } catch (e) {
      /* ambient audio is optional */
    }
  }

  setNight(night) {
    if (night === this.nightMode) return;
    this.nightMode = night;
    if (!this.ambience) return;
    const t = this.ctx.currentTime;
    this.ambience.gain.gain.setTargetAtTime(night ? 0.085 : 0.045, t, 1.4);
    this.ambience.filter.frequency.setTargetAtTime(night ? 190 : 340, t, 1.5);
    this.ambience.dg.gain.setTargetAtTime(night ? 0.05 : 0.022, t, 1.5);
    this.ambience.drone.frequency.setTargetAtTime(night ? 36 : 45, t, 2.0);
  }

  noise(dur, freq, gainValue, type = 'lowpass', q = 0.8, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1 + Math.random() * 0.15;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, gainValue, type = 'square', slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  shoot(kind) {
    this.init();
    if (!this.ctx) return;
    if (kind === 'pistol') {
      this.noise(0.09, 2200, 0.28, 'highpass', 0.7);
      this.tone(180, 0.08, 0.16, 'square', 60);
    } else if (kind === 'shotgun') {
      this.noise(0.25, 1100, 0.48, 'lowpass', 0.8);
      this.tone(100, 0.18, 0.24, 'sawtooth', 38);
      this.noise(0.35, 320, 0.18, 'lowpass', 0.7, 0.03);
    } else if (kind === 'rifle') {
      this.noise(0.07, 2600, 0.23, 'highpass', 0.8);
      this.tone(150, 0.06, 0.12, 'square', 55);
    } else if (kind === 'launcher') {
      this.noise(0.4, 700, 0.32, 'lowpass', 0.8);
      this.tone(85, 0.35, 0.18, 'sawtooth', 40);
    } else if (kind === 'turret') {
      this.noise(0.05, 3000, 0.12, 'highpass', 0.9);
      this.tone(260, 0.04, 0.05, 'square', 90);
    } else {
      this.noise(0.08, 2000, 0.16, 'highpass');
    }
  }

  dryFire() {
    this.tone(900, 0.03, 0.06, 'square', 400);
  }

  reload() {
    this.tone(700, 0.04, 0.05, 'square');
    this.noise(0.05, 1800, 0.08, 'highpass');
    this.tone(420, 0.06, 0.06, 'square', 240, 0.13);
  }

  hit() {
    this.noise(0.06, 900, 0.12, 'bandpass', 1.4);
  }

  flesh() {
    this.noise(0.1, 420, 0.18, 'lowpass', 0.9);
  }

  kill() {
    this.noise(0.24, 260, 0.2, 'lowpass', 0.8);
    this.tone(120, 0.16, 0.09, 'sawtooth', 50);
  }

  hurt() {
    this.tone(110, 0.2, 0.15, 'sawtooth', 60);
    this.noise(0.16, 500, 0.12, 'lowpass');
  }

  explosion() {
    this.noise(0.65, 500, 0.5, 'lowpass', 0.9);
    this.tone(62, 0.5, 0.28, 'sine', 30);
    this.noise(0.25, 1900, 0.15, 'highpass', 0.7, 0.02);
  }

  pickup() {
    this.tone(620, 0.06, 0.09, 'sine', 900);
    this.tone(980, 0.08, 0.07, 'sine', 1300, 0.06);
  }

  build() {
    this.noise(0.12, 700, 0.18, 'lowpass');
    this.tone(220, 0.08, 0.1, 'square', 160);
    this.tone(340, 0.06, 0.06, 'square', 260, 0.09);
  }

  ui() {
    this.tone(520, 0.03, 0.05, 'sine', 640);
  }

  denied() {
    this.tone(190, 0.12, 0.1, 'square', 130);
  }

  levelup() {
    [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.16, 0.08, 'triangle', f * 1.02, i * 0.09));
  }

  night() {
    this.tone(72, 1.4, 0.18, 'sawtooth', 58);
    this.tone(108, 1.2, 0.08, 'sine', 90);
    this.noise(1.2, 240, 0.12, 'lowpass', 0.7);
  }

  dawn() {
    [392, 494, 587].forEach((f, i) => this.tone(f, 0.35, 0.055, 'sine', f, i * 0.16));
  }

  bossRoar() {
    this.tone(48, 1.1, 0.24, 'sawtooth', 30);
    this.noise(0.9, 300, 0.22, 'lowpass', 0.7);
    this.tone(85, 0.9, 0.12, 'square', 42);
  }

  heal() {
    this.tone(520, 0.1, 0.07, 'sine', 780);
    this.tone(780, 0.16, 0.06, 'sine', 1040, 0.1);
  }

  wave() {
    this.tone(196, 0.6, 0.1, 'sawtooth', 147);
    this.tone(294, 0.5, 0.06, 'sawtooth', 220, 0.25);
  }

  spit() {
    this.noise(0.16, 950, 0.09, 'bandpass', 2.2);
    this.tone(240, 0.12, 0.04, 'sine', 130);
  }
}
