// All sound is synthesized with WebAudio, so the game ships with no audio files.
(function () {
  'use strict';
  const S = window.SKY;

  const CATEGORY = {
    jump: 'jump', land: 'land', coin: 'coin', crumble: 'collapse', collapse: 'collapse', warn: 'warn', over: 'over',
    boom: 'fx', pad: 'fx', speed: 'fx', beacon: 'fx', ui: 'fx', reward: 'fx', env: 'fx', fuse: 'fx', buy: 'fx',
    airjump: 'jump', bump: 'fx', stomp: 'fx', shield: 'fx', count: 'fx', go: 'fx', overtake: 'fx',
  };

  class Sound {
    constructor(vol) {
      this.vol = vol;
      this.ctx = null;
      this.bus = {};
      this.musicOn = false;
      this.music = null;
      this.env = 0;
      this.timer = null;
      this.danger = 0;
      this.coinChain = 0;
      this.coinT = 0;
    }

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = (this.ctx = new AC());
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 5;
        comp.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.connect(comp);
        for (const k of Object.keys(this.vol)) {
          if (k === 'master') continue;
          const g = ctx.createGain();
          g.connect(this.master);
          this.bus[k] = g;
        }
        this.musicDuck = ctx.createGain();
        this.musicDuck.connect(this.bus.bgm);
        this.applyVolumes();
        const len = ctx.sampleRate;
        this.noise = ctx.createBuffer(1, len, len);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        if (this.musicOn) this._startClock();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.vol.master, t, 0.01);
      for (const k in this.bus) this.bus[k].gain.setTargetAtTime(this.vol[k], t, 0.01);
    }

    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    duck(on) { if (this.ctx) this.musicDuck.gain.setTargetAtTime(on ? 0.32 : 1, this.ctx.currentTime, 0.08); }

    _tone(cat, type, f0, f1, dur, vol, delay, attack) {
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.bus[cat]);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    _noise(cat, dur, vol, lp0, lp1, delay, q) {
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise;
      s.loop = true;
      f.type = 'lowpass';
      f.Q.value = q || 0.7;
      f.frequency.setValueAtTime(lp0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, lp1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.bus[cat]);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.02);
    }

    play(name, arg) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const cat = CATEGORY[name];
      switch (name) {
        case 'jump':
          this._tone(cat, 'triangle', 300, 760, 0.16, 0.34);
          this._tone(cat, 'sine', 610, 1240, 0.1, 0.12);
          break;
        case 'land': {
          const k = arg === undefined ? 0.6 : arg;
          this._tone(cat, 'sine', 150 + k * 40, 58, 0.13, 0.28 + k * 0.32);
          this._noise(cat, 0.08, 0.12 + k * 0.18, 1500, 300);
          break;
        }
        case 'coin': {
          const now = this.ctx.currentTime;
          this.coinChain = now - this.coinT < 0.9 ? Math.min(this.coinChain + 1, 10) : 0;
          this.coinT = now;
          const f = 880 * Math.pow(2, (this.coinChain * 2) / 12);
          this._tone(cat, 'square', f, f, 0.07, 0.1);
          this._tone(cat, 'square', f * 1.5, f * 1.5, 0.17, 0.11, 0.06);
          break;
        }
        case 'crumble':
          this._noise(cat, 0.3, 0.25, 900, 240, 0, 2);
          for (let i = 0; i < 4; i++) this._tone(cat, 'square', 110 + Math.random() * 60, 70, 0.04, 0.09, i * 0.06);
          break;
        case 'collapse':
          this._noise(cat, 0.5, 0.5, 1700, 120);
          this._tone(cat, 'sawtooth', 130, 42, 0.42, 0.3);
          break;
        case 'warn':
          for (let i = 0; i < 3; i++) {
            this._tone(cat, 'sawtooth', 520, 860, 0.17, 0.2, i * 0.27);
            this._tone(cat, 'square', 260, 430, 0.17, 0.1, i * 0.27);
          }
          break;
        case 'over':
          [392, 330, 262, 196, 131].forEach((f, i) => this._tone(cat, 'triangle', f, f * 0.96, 0.32, 0.36, i * 0.14));
          this._noise(cat, 0.9, 0.3, 2600, 120);
          break;
        case 'boom':
          this._noise(cat, 0.62, 0.95, 4200, 70);
          this._tone(cat, 'sine', 170, 30, 0.52, 0.85);
          break;
        case 'fuse':
          this._tone(cat, 'square', 920, 920, 0.06, 0.14);
          this._tone(cat, 'square', 1230, 1230, 0.06, 0.14, 0.12);
          break;
        case 'pad':
          this._tone(cat, 'sine', 180, 1320, 0.26, 0.42);
          this._tone(cat, 'triangle', 360, 1760, 0.22, 0.18, 0.02);
          break;
        case 'speed':
          this._noise(cat, 0.36, 0.35, 700, 6200, 0, 3);
          this._tone(cat, 'sawtooth', 220, 880, 0.22, 0.12);
          break;
        case 'beacon':
          [1047, 1319, 1568, 2093].forEach((f, i) => this._tone(cat, 'sine', f, f, 0.5, 0.2, i * 0.06));
          break;
        case 'ui':
          this._tone(cat, 'triangle', 660, 880, 0.06, 0.16);
          break;
        case 'airjump':
          this._tone(cat, 'triangle', 520, 1250, 0.14, 0.3);
          this._tone(cat, 'sine', 1040, 2100, 0.1, 0.12, 0.02);
          break;
        case 'bump': {
          const k = arg === undefined ? 0.6 : arg;
          this._noise(cat, 0.12, 0.25 + k * 0.3, 900, 180);
          this._tone(cat, 'sine', 210, 95, 0.14, 0.3 + k * 0.25);
          break;
        }
        case 'stomp':
          this._tone(cat, 'square', 330, 990, 0.12, 0.16);
          this._tone(cat, 'sine', 160, 70, 0.16, 0.4);
          break;
        case 'shield':
          [784, 1047, 1319, 1568].forEach((f, i) => this._tone(cat, 'triangle', f, f * 1.01, 0.3, 0.22, i * 0.05));
          this._noise(cat, 0.5, 0.25, 6000, 900);
          break;
        case 'count':
          this._tone(cat, 'square', 660, 660, 0.13, 0.14);
          break;
        case 'go':
          this._tone(cat, 'square', 990, 990, 0.32, 0.16);
          this._tone(cat, 'triangle', 1320, 1320, 0.32, 0.18, 0.02);
          break;
        case 'overtake':
          this._tone(cat, 'triangle', 784, 784, 0.09, 0.22);
          this._tone(cat, 'triangle', 1175, 1175, 0.16, 0.22, 0.08);
          break;
        case 'buy':
          [784, 988, 1319].forEach((f, i) => this._tone(cat, 'triangle', f, f, 0.2, 0.25, i * 0.07));
          break;
        case 'reward':
          [523, 659, 784, 1047, 1319].forEach((f, i) => { this._tone(cat, 'triangle', f, f, 0.34, 0.3, i * 0.08); this._tone(cat, 'sine', f * 2, f * 2, 0.26, 0.12, i * 0.08); });
          break;
        case 'env':
          [262, 392, 523, 659, 784, 1047].forEach((f, i) => this._tone(cat, 'sawtooth', f, f, 0.52, 0.16, i * 0.09));
          this._tone(cat, 'sine', 65, 131, 0.95, 0.5);
          break;
      }
    }

    // ---- music (arrangement lives in music.js) ----
    startMusic(env) {
      this.env = env || 0;
      this.musicOn = true;
      if (this.ctx) this._startClock();
    }
    setMusicEnv(i) {
      this.env = i;
      if (this.music) this.music.setEnv(i);
    }
    setDanger(v) {
      this.danger = v;
      if (this.music) this.music.danger = v;
    }
    setLite(on) {
      this.lite = on;
      if (this.music) this.music.setLite(on);
    }
    stopMusic() {
      this.musicOn = false;
      clearInterval(this.timer);
      this.timer = null;
    }
    _startClock() {
      clearInterval(this.timer);
      if (!this.music) {
        this.music = new S.Music(this.ctx, this.musicDuck);
        this.music.setLite(!!this.lite);
      }
      this.music.reset(this.ctx.currentTime + 0.08, this.env);
      this.timer = setInterval(() => {
        if (this.ctx.state === 'running') this.music.schedule(this.ctx.currentTime + 0.25);
      }, 50);
    }
  }
  S.Sound = Sound;
})();
