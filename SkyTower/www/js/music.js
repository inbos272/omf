// Generative soundtrack: one arranged loop per environment (pads, bass, plucks, lead, drums)
// with reverb and tempo-synced delay. Works on any AudioContext, including offline ones for tests.
(function () {
  'use strict';
  const S = (window.SKY = window.SKY || {});
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Chords: b = bass note, v = upper voicing (MIDI). Patterns are 16 sixteenths: x = full, o = soft / octave.
  const SONGS = [
    { // Sky Islands: warm chill-house in F major
      bpm: 98, swing: 0.12, level: 1,
      chords: [{ b: 41, v: [57, 60, 64, 67] }, { b: 40, v: [55, 59, 62, 64] }, { b: 38, v: [57, 60, 64, 65] }, { b: 36, v: [55, 59, 62, 64] }],
      pad: { cut: 1400, rev: 0.5 }, bass: { pat: 'x..x..x...x...o.', tone: 'sub' },
      arp: { rate: 2, seq: [0, 2, 1, 3, 2, 4, 3, 5], tone: 'pluck', cut: 2300, vel: 0.8 },
      lead: 'soft', motif: [[0, 3, 3], [3, 2, 3], [6, 1, 2], [8, 2, 6], [16, 4, 3], [19, 3, 3], [22, 2, 2], [24, 1, 8]],
      drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', g: 'o.o.o.o.o.o.o.o.' },
    },
    { // Desert Skies: dusty half-time groove in D dorian
      bpm: 90, swing: 0.18, level: 1,
      chords: [{ b: 38, v: [57, 60, 64, 65] }, { b: 46, v: [58, 62, 65, 69] }, { b: 43, v: [57, 58, 62, 65] }, { b: 45, v: [55, 58, 61, 64] }],
      pad: { cut: 1100, rev: 0.45 }, bass: { pat: 'x.....x.x.....o.', tone: 'sub' },
      arp: { rate: 2, seq: [0, 1, 2, 1, 3, 2, 4, 2], tone: 'pluck', cut: 1700, vel: 0.85 },
      lead: 'soft', motif: [[0, 2, 2], [2, 3, 2], [4, 4, 4], [10, 3, 2], [12, 2, 4], [18, 1, 2], [20, 2, 2], [22, 3, 8]],
      drums: { k: 'x......x..x.....', s: '........x.......', h: 'x.x.x.xxx.x.x.x.', g: '' },
    },
    { // Frozen Mountains: spacious ambient bells in E minor
      bpm: 78, swing: 0, level: 1.15,
      chords: [{ b: 40, v: [59, 62, 66, 67] }, { b: 36, v: [59, 62, 64, 66] }, { b: 43, v: [57, 59, 62, 64] }, { b: 38, v: [57, 59, 64, 66] }],
      pad: { cut: 1700, rev: 0.75 }, bass: { pat: 'x.......x.......', tone: 'sub' },
      arp: { rate: 2, seq: [0, 3, 5, 2, 4, 6, 3, 7], tone: 'bell', cut: 0, vel: 0.7 },
      lead: 'soft', motif: [[0, 4, 8], [8, 3, 8], [16, 5, 6], [24, 2, 8]],
      drums: { k: 'x.........x.....', s: '', h: '....o.......o...', g: '' },
    },
    { // Volcanic World: driving minor electro in C minor
      bpm: 120, swing: 0, level: 1.1,
      chords: [{ b: 36, v: [55, 58, 62, 63] }, { b: 44, v: [55, 60, 63, 67] }, { b: 41, v: [56, 60, 63, 67] }, { b: 43, v: [53, 56, 59, 62] }],
      pad: { cut: 900, rev: 0.4 }, bass: { pat: 'x.xx.xx.x.xx.xx.', tone: 'saw' },
      arp: { rate: 1, seq: [0, 2, 4, 2, 1, 3, 5, 3], tone: 'pluck', cut: 1800, vel: 0.85 },
      lead: 'saw', motif: [[0, 0, 2], [3, 1, 2], [6, 2, 2], [8, 4, 4], [14, 3, 2], [16, 2, 4], [22, 1, 2], [24, 0, 6]],
      drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'oxoxoxoxoxoxoxox', g: '' },
    },
    { // Outer Space: wide synthwave in A minor
      bpm: 104, swing: 0, level: 1.15,
      chords: [{ b: 45, v: [59, 60, 64, 67] }, { b: 41, v: [57, 60, 64, 65] }, { b: 36, v: [55, 59, 60, 64] }, { b: 43, v: [55, 59, 62, 64] }],
      pad: { cut: 1300, rev: 0.6 }, bass: { pat: 'x.o.x.o.x.o.x.o.', tone: 'saw' },
      arp: { rate: 1, seq: [0, 1, 2, 3, 4, 3, 2, 1], tone: 'pluck', cut: 2600, vel: 0.75 },
      lead: 'soft', motif: [[0, 2, 4], [4, 3, 4], [8, 5, 8], [18, 4, 2], [20, 3, 4], [24, 2, 8]],
      drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', g: '' },
    },
  ];
  const vel = (p, i) => (p && p[i] === 'x' ? 1 : p && p[i] === 'o' ? 0.55 : 0);

  class Music {
    constructor(ctx, out) {
      this.ctx = ctx;
      this.env = 0;
      this.pending = -1;
      this.danger = 0;
      this.step = 0;
      this.nextT = 0;
      this.seed = 1;

      this.dry = ctx.createGain();
      this.dry.gain.value = 0.85;
      this.dry.connect(out);

      this.rev = ctx.createConvolver();
      this.rev.buffer = this._impulse(2.4);
      const revOut = ctx.createGain();
      revOut.gain.value = 0.5;
      this.rev.connect(revOut);
      revOut.connect(out);
      this.revIn = ctx.createGain();
      this.revIn.connect(this.rev);

      this.dly = ctx.createDelay(1.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const fb = ctx.createGain();
      fb.gain.value = 0.33;
      this.dly.connect(lp);
      lp.connect(fb);
      fb.connect(this.dly);
      const dOut = ctx.createGain();
      dOut.gain.value = 0.42;
      lp.connect(dOut);
      dOut.connect(out);
      dOut.connect(this.revIn);
      this.dlyIn = ctx.createGain();
      this.dlyIn.connect(this.dly);

      // One shared bus per instrument carries the effect sends, so a note costs only its own voice nodes.
      const bus = (rev, dly) => {
        const g = ctx.createGain();
        g.connect(this.dry);
        g.rev = ctx.createGain();
        g.rev.gain.value = rev;
        g.connect(g.rev);
        g.rev.connect(this.revIn);
        if (dly) {
          const d = ctx.createGain();
          d.gain.value = dly;
          g.connect(d);
          d.connect(this.dlyIn);
        }
        return g;
      };
      this.bus = {
        pad: bus(0.5, 0), bass: bus(0, 0), pluck: bus(0.25, 0.32), bell: bus(0.6, 0.3),
        lead: bus(0.35, 0.38), kick: bus(0, 0), snare: bus(0.25, 0), hat: bus(0.08, 0),
      };

      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = this._rand() * 2 - 1;
      this._applyTempo();
    }

    _rand() {
      this.seed = (this.seed * 16807) % 2147483647;
      return this.seed / 2147483647;
    }

    _impulse(sec) {
      const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let y = 0;
        for (let i = 0; i < len; i++) {
          y = y * 0.55 + (this._rand() * 2 - 1) * 0.45; // darker tail than raw white noise
          d[i] = y * Math.pow(1 - i / len, 3.2);
        }
      }
      return buf;
    }

    get song() { return SONGS[this.env]; }

    // Low-end devices skip the convolution reverb, the most expensive node in the graph.
    setLite(on) {
      this.revIn.gain.setValueAtTime(on ? 0 : 1, this.ctx.currentTime);
    }

    _applyTempo() {
      const beat = 60 / this.song.bpm, t = this.ctx.currentTime;
      this.dly.delayTime.setValueAtTime(beat * 0.75, t);
      this.bus.pad.rev.gain.setValueAtTime(this.song.pad.rev, t);
    }

    reset(t, env) {
      this.env = env || 0;
      this.pending = -1;
      this.step = 0;
      this.nextT = t;
      this._applyTempo();
    }

    setEnv(i) {
      if (i === this.env && this.pending < 0) return;
      this.pending = i === this.env ? -1 : i; // switches on the next bar line
    }

    schedule(until) {
      if (this.nextT < this.ctx.currentTime - 0.1) this.nextT = this.ctx.currentTime + 0.05;
      while (this.nextT < until) {
        if (this.step % 16 === 0 && this.pending >= 0) {
          this.env = this.pending;
          this.pending = -1;
          this.step = 0;
          this._applyTempo();
        }
        const sd = 60 / this.song.bpm / 4 / (1 + this.danger * 0.05);
        this._tick(this.nextT, sd);
        this.step++;
        this.nextT += sd;
      }
    }

    _tick(t0, sd) {
      const song = this.song, step = this.step, st = step % 16, bar = Math.floor(step / 16);
      const sec = bar % 16, intro = sec < 4, brk = sec >= 12, main = !intro && !brk;
      const ch = song.chords[bar % song.chords.length];
      const t = t0 + (st % 2 ? song.swing * sd : 0);
      const L = song.level, dg = this.danger;

      if (st === 0) this._pad(t, ch.v, sd * 16 * 1.05, song.pad, L);

      const bv = vel(song.bass.pat, st);
      if (bv && (main || st === 0)) {
        const n = song.bass.pat[st] === 'o' ? ch.b + 12 : ch.b;
        this._bass(t, n, sd * (song.bass.tone === 'saw' ? 1.6 : 3.2), song.bass.tone, L * (main ? 1 : 0.8));
      }

      const a = song.arp;
      if (st % a.rate === 0) {
        const tones = ch.v.concat(ch.v.map((n) => n + 12));
        const k = (step / a.rate) % a.seq.length;
        const n = tones[a.seq[k] % tones.length] + 12;
        const accent = k % 4 === 0 ? 1 : 0.7;
        const cut = a.cut * (brk ? 0.55 : 1) * (1 + dg * 0.5);
        if (a.tone === 'bell') this._bell(t, n, a.vel * accent * L);
        else this._pluck(t, n, a.vel * accent * L, cut);
      }

      if (main) {
        const idx = (bar % 2) * 16 + st, lift = sec >= 8 ? 1 : 0;
        for (const m of song.motif) {
          if (m[0] !== idx) continue;
          const tones = ch.v.map((n) => n + 12).concat(ch.v.map((n) => n + 24));
          this._lead(t, tones[Math.min(tones.length - 1, m[1] + lift)], m[2] * sd, song.lead, L);
        }
      }

      const D = song.drums;
      const drums = main || (intro && sec >= 2) || sec === 15;
      if (drums) {
        const kv = vel(D.k, st);
        if (kv && !(sec === 15 && st >= 8)) this._kick(t, kv * L);
        if (main || sec === 15) {
          const sv = vel(D.s, st);
          if (sv) this._snare(t, sv * L);
        }
      }
      if (!brk || sec >= 14) {
        let hv = vel(D.h, st);
        if (!hv && dg > 0.45 && st % 2 === 1) hv = 0.4; // tension: hats fill the gaps near the lava
        if (hv) this._hat(t, hv * (0.85 + this._rand() * 0.15) * (intro ? 0.7 : 1) * L, false);
        const gv = vel(D.g, st);
        if (gv && main) this._hat(t, gv * 0.45 * L, false);
      }
    }

    // ---- instruments ----
    _out(node, name) {
      node.connect(this.bus[name]);
    }

    _env(g, t, peak, attack, hold, release) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      if (hold > attack) g.gain.setValueAtTime(peak, t + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold, attack) + release);
      return t + Math.max(hold, attack) + release + 0.05;
    }

    _pad(t, notes, dur, p, L) {
      const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(p.cut * 0.7, t);
      f.frequency.linearRampToValueAtTime(p.cut * (1 + this.danger * 0.6), t + dur * 0.5);
      f.frequency.linearRampToValueAtTime(p.cut * 0.8, t + dur);
      f.Q.value = 0.4;
      f.connect(g);
      const end = this._env(g, t, 0.055 * L, 0.5, dur - 0.3, 0.9);
      for (const n of notes) {
        for (const det of [-8, 7]) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(n);
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(end);
        }
      }
      this._out(g, 'pad');
    }

    _bass(t, n, dur, tone, L) {
      const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'lowpass';
      if (tone === 'saw') {
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(220, t + dur);
        f.Q.value = 3;
      } else {
        f.frequency.value = 520;
      }
      f.connect(g);
      const end = this._env(g, t, (tone === 'saw' ? 0.25 : 0.24) * L, 0.006, dur * 0.8, 0.09);
      const o = c.createOscillator();
      o.type = tone === 'saw' ? 'sawtooth' : 'sine';
      o.frequency.value = mtof(n);
      o.connect(f);
      o.start(t);
      o.stop(end);
      if (tone !== 'saw') {
        const o2 = c.createOscillator();
        o2.type = 'triangle';
        o2.frequency.value = mtof(n);
        const g2 = c.createGain();
        g2.gain.value = 0.35;
        o2.connect(g2);
        g2.connect(f);
        o2.start(t);
        o2.stop(end);
      }
      this._out(g, 'bass');
    }

    _pluck(t, n, v, cut) {
      const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      f.type = 'lowpass';
      f.Q.value = 2.2;
      f.frequency.setValueAtTime(cut, t);
      f.frequency.exponentialRampToValueAtTime(280, t + 0.24);
      o.connect(f);
      f.connect(g);
      const end = this._env(g, t, 0.05 * v, 0.004, 0, 0.42);
      o.start(t);
      o.stop(end);
      this._out(g, 'pluck');
    }

    _bell(t, n, v) {
      const c = this.ctx, g = c.createGain();
      const end = this._env(g, t, 0.06 * v, 0.004, 0, 1.7);
      for (const [ratio, amp, decay] of [[1, 1, 1.7], [2.76, 0.22, 0.6], [5.4, 0.07, 0.3]]) {
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sine';
        o.frequency.value = mtof(n) * ratio;
        og.gain.setValueAtTime(amp, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + decay);
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(end);
      }
      this._out(g, 'bell');
    }

    _lead(t, n, dur, tone, L) {
      const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = tone === 'saw' ? 1900 : 3000;
      f.connect(g);
      const end = this._env(g, t, (tone === 'saw' ? 0.045 : 0.075) * L, 0.035, dur * 0.85, 0.3);
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(9, t + 0.3);
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(end);
      const voices = tone === 'saw' ? [['sawtooth', -6, 1], ['sawtooth', 6, 1]] : [['triangle', 0, 1], ['sine', 1200, 0.18]];
      for (const [type, det, amp] of voices) {
        const o = c.createOscillator(), og = c.createGain();
        o.type = type;
        o.frequency.value = mtof(n);
        o.detune.value = det;
        depth.connect(o.detune);
        og.gain.value = amp;
        o.connect(og);
        og.connect(f);
        o.start(t);
        o.stop(end);
      }
      this._out(g, 'lead');
    }

    _kick(t, v) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      o.connect(g);
      const end = this._env(g, t, 0.5 * v, 0.003, 0, 0.3);
      o.start(t);
      o.stop(end);
      this._out(g, 'kick');
    }

    _noiseHit(t, type, freq, q, peak, decay, bus) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise;
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      s.connect(f);
      f.connect(g);
      const end = this._env(g, t, peak, 0.002, 0, decay);
      s.start(t, this._rand() * 0.8);
      s.stop(end);
      this._out(g, bus);
    }

    _snare(t, v) {
      this._noiseHit(t, 'bandpass', 1900, 0.7, 0.2 * v, 0.17, 'snare');
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      o.connect(g);
      const end = this._env(g, t, 0.09 * v, 0.002, 0, 0.1);
      o.start(t);
      o.stop(end);
      this._out(g, 'snare');
    }

    _hat(t, v, open) {
      this._noiseHit(t, 'highpass', 7600, 0.7, 0.05 * v, open ? 0.26 : 0.045, 'hat');
    }
  }

  S.Music = Music;
  S.SONGS = SONGS;
})();
