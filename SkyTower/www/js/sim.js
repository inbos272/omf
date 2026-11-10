// Deterministic game simulation: bodies (player + AI rivals), platform generation, lava.
// No DOM or GL here, so tests can drive it headlessly at full speed.
(function () {
  'use strict';
  const S = window.SKY;
  const C = S.CFG;
  const T = (S.PT = { NORMAL: 0, ICE: 1, JUMP: 2, CRUMBLE: 3, SPEED: 4, BOOM: 5 });

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const wrapX = (x) => ((x % C.CIRC) + C.CIRC) % C.CIRC;
  const wrapD = (S.wrapD = (d) => {
    const c = C.CIRC;
    d = (d + c / 2) % c;
    if (d < 0) d += c;
    return d - c / 2;
  });

  // Horizontal distance covered by a fully held jump from a standstill that lands dy higher.
  // Built from the same gravity rules the bodies use, so the generator cannot drift from the physics.
  const REACH = (function () {
    const samples = [];
    let y = 0, vy = C.JUMP_V, vx = 0, x = 0;
    for (let i = 0; i < 900 && y > -0.5; i++) {
      let g = vy > 0 ? C.GRAV_UP : C.GRAV_DOWN;
      if (Math.abs(vy) < C.APEX_V) g *= C.GRAV_APEX;
      vy = Math.max(vy - g * C.DT, -C.MAX_FALL);
      y += vy * C.DT;
      vx = Math.min(C.RUN, vx + C.AIR_ACCEL * C.DT);
      x += vx * C.DT;
      if (vy < 0) samples.push([y, x]);
    }
    const table = [];
    for (let i = 0; i <= 100; i++) {
      const dy = i * 0.05;
      let r = 0;
      for (let k = 0; k < samples.length; k++) if (samples[k][0] >= dy) r = samples[k][1];
      table.push(r);
    }
    return table;
  })();
  S.reachFor = (dy) => {
    if (dy <= 0) return REACH[0];
    return REACH[clamp(Math.ceil(dy / 0.05), 0, REACH.length - 1)];
  };
  S.difficulty = (f) => 1 - Math.exp(-f / 120);

  const COMBOS = [
    [T.CRUMBLE, T.CRUMBLE, T.CRUMBLE],
    [T.ICE, T.ICE, T.CRUMBLE],
    [T.SPEED, T.BOOM, T.BOOM],
    [T.ICE, T.JUMP, T.ICE],
    [T.BOOM, T.CRUMBLE, T.BOOM],
    [T.CRUMBLE, T.ICE, T.CRUMBLE, T.BOOM],
    [T.SPEED, T.ICE, T.ICE, T.ICE],
  ];
  const isHazard = (t) => t === T.ICE || t === T.CRUMBLE || t === T.BOOM;
  const FIRST_FLOOR = { 6: T.JUMP, 8: T.ICE, 13: T.CRUMBLE, 19: T.SPEED, 27: T.BOOM };
  const MILESTONE_FLOOR = {};
  S.MILESTONES.forEach((m) => (MILESTONE_FLOOR[m.floor] = true));

  // Opening layouts for the first floors of a solo run.
  const OPENINGS = (S.OPENINGS = ['classic', 'spiral', 'zigzag', 'stairs', 'pads', 'coins', 'twin']);
  const OPEN_LEN = 10;

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  S.mulberry = mulberry;

  function newBody(id, human) {
    return {
      id, human, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
      grounded: true, ground: null, coyote: 0, buffer: 0, held: false, forced: false,
      boost: 0, lock: 0, shove: 0, bumpT: 0, face: 1, airJ: 0, shields: 0,
      floor: 0, floorT: 0, maxY: 0, coins: 0, coinFrac: 0, dead: false,
      perk: S.perkFor(null), skin: null, ab: null, bot: null, anim: null,
    };
  }
  const IDLE = { move: 0, jump: false };

  class Sim {
    constructor(emit) {
      this.emit = emit || function () {};
      this.platPool = [];
      this.coinPool = [];
      this.plats = [];
      this.coins = [];
      this.bodies = [];
      this.p = newBody(0, true);
      this.bestFloor = 0;
      this.reset(1, 0);
    }

    // The human body's stats, kept as sim-level names for the rest of the game.
    get floor() { return this.p.floor; }
    set floor(v) { this.p.floor = v; }
    get coinCount() { return this.p.coins; }
    set coinCount(v) { this.p.coins = v; }
    get dead() { return this.p.dead; }
    set dead(v) { this.p.dead = v; }
    get maxY() { return this.p.maxY; }
    set maxY(v) { this.p.maxY = v; }

    // opts: { perk, skin, ab, opening, racers: [{ skin, ab, perk, bot }] }
    reset(seed, bestFloor, opts) {
      opts = opts || {};
      while (this.plats.length) this.platPool.push(this.plats.pop());
      while (this.coins.length) this.coinPool.push(this.coins.pop());
      this.rng = mulberry(seed);
      this.seed = seed;
      this.bestFloor = bestFloor || 0;
      this.bestY = null;
      this.time = 0;
      this.runTime = 0;
      this.started = false;
      this.race = !!opts.racers;
      this.lavaY = C.LAVA_START;
      this.lavaV = 0;
      this.lavaMul = this.race ? 1 : (opts.perk ? opts.perk.lava : 1);
      this.slowT = 0;
      this.warned = false;
      this.genFloor = 0;
      this.dir = this.rng() < 0.5 ? -1 : 1;
      this.hazardRun = 0;
      this.combo = [];
      this.comboCool = 20;
      this.opening = this.race ? 'classic' : opts.opening || OPENINGS[Math.floor(this.rng() * OPENINGS.length)];

      const x0 = this.rng() * C.CIRC;
      const first = this._plat(x0, 0, this.race ? 5.4 : this._r(3.8, 5), T.NORMAL, 0, false);
      this.last = first;

      this.bodies.length = 0;
      const p = this.p;
      Object.assign(p, newBody(0, true));
      p.perk = opts.perk || S.perkFor(null);
      p.skin = opts.skin || null;
      p.ab = opts.ab || null;
      this._place(p, x0, first);
      this.bodies.push(p);
      if (opts.racers) {
        const offs = [-3.8, -1.9, 1.9, 3.8];
        opts.racers.forEach((r, i) => {
          const b = newBody(i + 1, false);
          b.perk = r.perk;
          b.skin = r.skin;
          b.ab = r.ab;
          b.bot = r.bot;
          this._place(b, x0 + offs[i % offs.length], first);
          this.bodies.push(b);
        });
      }
      this._generate();
    }

    _place(b, x, q) {
      b.x = b.px = wrapX(x);
      b.y = b.py = q.y;
      b.grounded = true;
      b.ground = q;
      b.airJ = b.perk.airJumps;
      b.shields = b.perk.shields;
    }

    _r(a, b) { return a + (b - a) * this.rng(); }

    _plat(x, y, hw, type, floor, side) {
      const q = this.platPool.pop() || {};
      q.x = wrapX(x);
      q.y = y; q.hw = hw; q.type = type; q.floor = floor; q.side = side;
      q.state = 0;        // 0 solid, 1 triggered, 2 gone
      q.t = 0;
      q.goneT = 0;
      q.spawn = 1;
      q.tLand = -9;
      q.beacon = false;
      q.seed = this.rng();
      this.plats.push(q);
      return q;
    }

    _coin(x, y) {
      const c = this.coinPool.pop() || {};
      c.x = wrapX(x);
      c.y = y;
      c.seed = this.rng();
      this.coins.push(c);
    }

    _pickType(f, d) {
      if (FIRST_FLOOR[f] !== undefined) return FIRST_FLOOR[f];
      if (this.combo.length) return this.combo.shift();
      this.comboCool--;
      if (f > 35 && this.comboCool <= 0 && this.rng() < 0.12 + d * 0.3) {
        this.combo = COMBOS[Math.floor(this.rng() * COMBOS.length)].slice();
        this.comboCool = Math.round(lerp(14, 6, d));
        return this.combo.shift();
      }
      const opts = [[T.NORMAL, lerp(100, 30, d)]];
      const hazOk = this.hazardRun < (d > 0.85 ? 3 : d > 0.45 ? 2 : 1);
      if (f >= 6) opts.push([T.JUMP, 8 + 6 * d]);
      if (f >= 19) opts.push([T.SPEED, 7 + 8 * d]);
      if (hazOk && f >= 8) opts.push([T.ICE, 8 + 22 * d]);
      if (hazOk && f >= 13) opts.push([T.CRUMBLE, 9 + 22 * d]);
      if (hazOk && f >= 27) opts.push([T.BOOM, 6 + 22 * d]);
      let total = 0;
      for (const o of opts) total += o[1];
      let roll = this.rng() * total;
      for (const o of opts) {
        roll -= o[1];
        if (roll <= 0) return o[0];
      }
      return T.NORMAL;
    }

    _generateFloor() {
      const a = this.last;
      const f = ++this.genFloor;
      const d = S.difficulty(f);
      const op = f <= OPEN_LEN ? this.opening : 'classic';
      const special = f % 10 === 0 || MILESTONE_FLOOR[f];

      const prevHazard = a.type === T.CRUMBLE || a.type === T.BOOM;
      let dy = lerp(2.15, 3.0, d) + this._r(-0.2, 0.2);
      if (op === 'stairs') dy = this._r(1.9, 2.15);
      else if (op === 'spiral') dy = this._r(2.2, 2.5);
      if (prevHazard) dy = Math.min(dy, 2.7);
      dy = Math.min(dy, C.MAX_DY);

      let hw = lerp(2.7, 1.4, d) * this._r(0.9, 1.15);
      let type = special ? T.NORMAL : this._pickType(f, d);
      if (op === 'pads' && (f === 2 || f === 7)) type = T.JUMP;
      if (special) hw = Math.max(hw, 2.6);
      if (type === T.JUMP) hw = Math.max(hw, 1.6);
      hw = Math.max(hw, 1.25);
      this.hazardRun = isHazard(type) ? this.hazardRun + 1 : 0;

      // Edge-to-edge gap, bounded by what a real jump covers from a standstill.
      let maxGap = S.reachFor(dy) * C.REACH_MARGIN;
      if (a.type === T.ICE) maxGap *= 0.82;
      if (prevHazard) maxGap *= 0.8;
      let gk = this._r(lerp(-0.45, 0.18, d), lerp(0.38, 0.95, d));
      if (op === 'stairs') gk = this._r(-0.45, -0.2);
      else if (op === 'spiral') gk = this._r(0.15, 0.45);
      else if (op === 'zigzag') gk = this._r(0.25, 0.6);
      const gap = gk * maxGap;

      let flip = this.rng() < 0.27;
      if (op === 'spiral' || op === 'stairs') flip = false;
      else if (op === 'zigzag') flip = true;
      if (flip) this.dir = -this.dir;
      const offset = Math.max(a.hw + hw + gap, Math.min(a.hw, hw) * 0.8);
      const x = a.x + this.dir * offset;
      const y = a.y + dy;
      const b = this._plat(x, y, hw, type, f, false);
      b.beacon = !!special;
      if (f === this.bestFloor) this.bestY = y;

      // Coins follow the jump arc between the platforms.
      const coinChance = op === 'coins' ? 1 : op === 'stairs' ? 0.8 : 0.5;
      if (this.rng() < coinChance) {
        const n = op === 'coins' ? 3 : 1 + Math.floor(this.rng() * 3);
        for (let i = 0; i < n; i++) {
          const t = (i + 1) / (n + 1);
          this._coin(a.x + this.dir * offset * t, lerp(a.y, y, t) + Math.sin(t * Math.PI) * 1.7 + 0.9);
        }
      }
      if (op === 'pads' && type === T.JUMP) for (let i = 0; i < 4; i++) this._coin(x, y + 2.2 + i * 1.5);

      // Optional side platform: more choices, never needed to progress.
      const sideChance = op === 'twin' ? 1 : op === 'coins' ? 0.6 : lerp(0.4, 0.25, d);
      if ((f > 2 || op === 'twin') && this.rng() < sideChance) {
        const sw = op === 'twin' ? hw : this._r(1.4, 2.2);
        const sx = a.x - this.dir * (a.hw + sw + this._r(0.5, maxGap * 0.7));
        const sy = y + (op === 'twin' ? 0 : this._r(-0.4, 0.4));
        const roll = this.rng();
        const st = f < 8 ? T.NORMAL : roll < 0.55 ? T.NORMAL : roll < 0.75 ? T.ICE : roll < 0.9 ? T.JUMP : T.SPEED;
        this._plat(sx, sy, sw, st, f, true);
        const n = 2 + Math.floor(this.rng() * 2);
        for (let i = 0; i < n; i++) this._coin(sx + (i - (n - 1) / 2) * 0.95, sy + 1.25);
      }
      this.last = b;
    }

    _topY() {
      let top = this.p.y;
      for (const b of this.bodies) if (!b.dead && b.y > top) top = b.y;
      return top;
    }

    _generate() {
      const top = this._topY();
      while (this.last.y < top + 46) this._generateFloor();
    }

    findGolden(floor) {
      for (const q of this.plats) if (q.floor === floor && !q.side) return q;
      return null;
    }

    _supports(q, x, slop) {
      return q.state !== 2 && Math.abs(wrapD(x - q.x)) <= q.hw + C.LAND_SLOP + slop;
    }

    _jump(p, mul, air) {
      p.vy = C.JUMP_V * p.perk.jump * mul;
      p.grounded = false;
      p.ground = null;
      p.coyote = 0;
      p.buffer = 0;
      p.forced = false;
      this.emit(air ? 'airjump' : 'jump', null, 0, p);
    }

    _land(p, q) {
      const k = p.perk;
      const impact = -p.vy;
      p.y = q.y;
      p.vy = 0;
      p.grounded = true;
      p.ground = q;
      p.coyote = 0;
      p.forced = false;
      p.airJ = k.airJumps;
      q.tLand = this.time;
      this.emit('land', q, impact, p);
      if (q.y > p.maxY) p.maxY = q.y;
      if (q.floor > p.floor) {
        p.floor = q.floor;
        p.floorT = this.time;
        this.emit('floor', q, 0, p);
      }
      if (q.beacon) {
        q.beacon = false;
        this.slowT = Math.max(this.slowT, C.BEACON_SLOW_T * k.beacon);
        this.emit('beacon', q, 0, p);
      }
      const d = S.difficulty(q.floor);
      if (q.type === T.JUMP) {
        p.vy = C.PAD_V * k.pad;
        p.grounded = false;
        p.ground = null;
        p.forced = true;
        p.buffer = 0;
        this.emit('pad', q, 0, p);
      } else if (q.type === T.SPEED) {
        p.boost = C.BOOST_T * k.boost;
        this.emit('speed', q, 0, p);
      } else if (q.type === T.CRUMBLE && q.state === 0) {
        q.state = 1;
        q.t = lerp(0.72, 0.46, d) * k.fuse;
        this.emit('crumble', q, 0, p);
      } else if (q.type === T.BOOM && q.state === 0) {
        q.state = 1;
        q.t = lerp(1.25, 0.78, d) * k.fuse;
        q.fuse = q.t;
        this.emit('fuse', q, 0, p);
      }
    }

    _gone(q) {
      q.state = 2;
      q.t = C.RESPAWN;
      q.goneT = 0;
    }

    _boom(q) {
      this._gone(q);
      let humanHit = false;
      for (const p of this.bodies) {
        if (p.dead) continue;
        const dx = wrapD(p.x - q.x);
        if (Math.abs(dx) >= q.hw + 1.4 || Math.abs(p.y - q.y) >= 2.6) continue;
        p.grounded = false;
        p.ground = null;
        if (p.perk.boomProof) {
          p.vy = Math.max(p.vy, 6);
          continue;
        }
        p.vx = (dx >= 0 ? 1 : -1) * 15;
        p.vy = 9;
        p.lock = 0.24;
        p.forced = true;
        if (p.human) humanHit = true;
      }
      this.emit('boom', q, humanHit);
    }

    _world(dt) {
      for (let i = this.plats.length - 1; i >= 0; i--) {
        const q = this.plats[i];
        if (q.state === 1) {
          q.t -= dt;
          if (q.t <= 0) {
            if (q.type === T.CRUMBLE) {
              this._gone(q);
              this.emit('collapse', q);
            } else this._boom(q);
          }
        } else if (q.state === 2) {
          q.t -= dt;
          q.goneT += dt;
          if (q.t <= 0) {
            q.state = 0;
            q.spawn = 0;
          }
        }
        if (q.spawn < 1) q.spawn = Math.min(1, q.spawn + dt * 3.2);
        if (q.y < this.lavaY - 9 && q !== this.last) {
          for (const b of this.bodies) if (b.ground === q) { b.ground = null; b.grounded = false; }
          this.platPool.push(q);
          this.plats[i] = this.plats[this.plats.length - 1];
          this.plats.pop();
        }
      }
      for (let i = this.coins.length - 1; i >= 0; i--) {
        if (this.coins[i].y < this.lavaY - 4) {
          this.coinPool.push(this.coins[i]);
          this.coins[i] = this.coins[this.coins.length - 1];
          this.coins.pop();
        }
      }
      const anyAlive = this.race ? this.bodies.some((b) => !b.dead) : !this.p.dead;
      if (this.started && anyAlive) {
        this.runTime += dt;
        const R = S.RACE;
        const v0 = this.race ? R.v0 : C.LAVA_V0, vmax = this.race ? R.vmax : C.LAVA_VMAX, tau = this.race ? R.tau : C.LAVA_TAU;
        let v = (v0 + (vmax - v0) * (1 - Math.exp(-this.runTime / tau))) * this.lavaMul;
        if (this.runTime < 3) v *= 0.5;
        // Rubber band against the human's climb (or the leader once the human is out).
        let ref = this.p.maxY;
        if (this.p.dead) for (const b of this.bodies) if (!b.dead && b.maxY > ref) ref = b.maxY;
        const gap = ref - this.lavaY;
        if (gap > C.LAVA_RUB) v *= 1 + Math.min(1.6, (gap - C.LAVA_RUB) / 12);
        if (this.slowT > 0) {
          this.slowT -= dt;
          v *= C.LAVA_SLOW;
        }
        this.lavaV = v;
        this.lavaY += v * dt;
      }
    }

    _stepBody(p, inp) {
      const dt = C.DT, k = p.perk;
      p.px = p.x;
      p.py = p.y;

      const move = clamp(inp.move, -1, 1);
      if (p.human && !this.race && !this.started && (Math.abs(move) > 0.1 || inp.jump)) this.started = true;
      if (inp.jump && !p.held) p.buffer = C.BUFFER;
      p.held = inp.jump;
      p.buffer = Math.max(0, p.buffer - dt);
      p.coyote = Math.max(0, p.coyote - dt);
      p.lock = Math.max(0, p.lock - dt);
      p.boost = Math.max(0, p.boost - dt);
      p.shove = Math.max(0, p.shove - dt);
      p.bumpT = Math.max(0, p.bumpT - dt);

      if (p.grounded && !this._supports(p.ground, p.x, k.slop)) {
        p.grounded = false;
        p.ground = null;
        p.coyote = C.COYOTE * k.coyote;
      }

      const mv = p.lock > 0 ? 0 : move;
      const surf = p.grounded ? p.ground.type : -1;
      const max = C.RUN * k.run * (p.boost > 0 ? k.boostMul : 1);
      const target = mv * max;
      let acc;
      if (surf === T.ICE && !k.grip) acc = mv !== 0 ? C.ICE_ACCEL : C.ICE_DECEL;
      else if (p.grounded) acc = mv !== 0 ? (mv * p.vx < 0 ? C.DECEL : C.ACCEL) : C.DECEL;
      else acc = mv !== 0 ? C.AIR_ACCEL : C.AIR_DECEL;
      if (p.shove > 0) acc *= 0.15; // let a bump actually move the body before friction wins
      p.vx = approach(p.vx, target, acc * dt);
      if (Math.abs(mv) > 0.05) p.face = mv > 0 ? 1 : -1;

      if (p.buffer > 0) {
        if (p.grounded || p.coyote > 0) this._jump(p, 1, false);
        else if (p.airJ > 0 && !p.forced) {
          p.airJ--;
          this._jump(p, 0.92, true);
        }
      }

      if (!p.grounded) {
        let g;
        if (p.vy > 0) g = p.held || p.forced ? C.GRAV_UP : C.GRAV_CUT;
        else g = C.GRAV_DOWN * k.fall;
        if (Math.abs(p.vy) < C.APEX_V && p.held && !p.forced) g *= C.GRAV_APEX;
        p.vy = Math.max(p.vy - g * dt, -C.MAX_FALL);
        if (k.glide && p.held && p.vy < -4.5) p.vy = Math.min(-4.5, p.vy + 90 * dt);
        if (p.vy <= 0) p.forced = false;
      }

      p.x += p.vx * dt;
      const oy = p.y;
      if (!p.grounded) p.y += p.vy * dt;

      // Platforms are one-way: a descending body whose feet cross the top lands on it.
      // Ledge assist: if a jump peaks with the feet just under a top (body visibly level with
      // the platform), the body is lifted onto it instead of sinking back through.
      if (!p.grounded && p.vy <= 0) {
        let best = null;
        const slop = C.LAND_SLOP + k.slop;
        const nearApex = p.vy > C.LEDGE_VY;
        for (let i = 0; i < this.plats.length; i++) {
          const q = this.plats[i];
          if (q.state === 2 || q.spawn < 0.6) continue;
          if (Math.abs(wrapD(p.x - q.x)) > q.hw + slop) continue;
          const crossed = oy >= q.y - 0.02 && p.y <= q.y;
          const ledge = nearApex && oy < q.y && oy >= q.y - C.LEDGE_UP;
          if ((crossed || ledge) && (!best || q.y > best.y)) best = q;
        }
        if (best) this._land(p, best);
      }
      this._wrapBody(p);
      this._pickupCoins(p, dt);
    }

    _wrapBody(p) {
      if (p.x < 0 || p.x >= C.CIRC) {
        const w = wrapX(p.x);
        p.px += w - p.x;
        p.x = w;
      }
    }

    _pickupCoins(p, dt) {
      const k = p.perk;
      const r = 1.12 * (k.magnet > 2 ? 1.3 : k.magnet), r2 = r * r;
      const pull = k.magnet > 2 ? 1.12 * k.magnet * 1.5 : 0, pull2 = pull * pull;
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        const dx = wrapD(p.x - c.x), dy = p.y + 0.7 - c.y, d2 = dx * dx + dy * dy;
        if (pull && d2 < pull2) {
          const s = Math.min(1, dt * 7);
          c.x = wrapX(c.x + dx * s);
          c.y += dy * s;
        }
        if (d2 < r2) {
          p.coinFrac += k.coin;
          const add = Math.floor(p.coinFrac + 1e-6);
          p.coinFrac -= add;
          p.coins += add;
          this.emit('coin', c, add, p);
          this.coinPool.push(c);
          this.coins[i] = this.coins[this.coins.length - 1];
          this.coins.pop();
        }
      }
    }

    // Rivals push each other on contact; landing on a head bounces you up.
    _collide() {
      const B = this.bodies;
      for (let i = 0; i < B.length; i++) {
        const a = B[i];
        if (a.dead) continue;
        for (let j = i + 1; j < B.length; j++) {
          const b = B[j];
          if (b.dead) continue;
          const dx = wrapD(b.x - a.x), dy = b.y - a.y;
          if (Math.abs(dx) > 0.85 || Math.abs(dy) > 1.15) continue;
          if (dy > 0.75 && b.vy < 0) { this._stomp(b, a); continue; }
          if (-dy > 0.75 && a.vy < 0) { this._stomp(a, b); continue; }
          const s = dx >= 0 ? 1 : -1, overlap = 0.85 - Math.abs(dx);
          a.x = wrapX(a.x - s * overlap * 0.5);
          b.x = wrapX(b.x + s * overlap * 0.5);
          const closing = (a.vx - b.vx) * s;
          if (closing > 1 && a.bumpT <= 0 && b.bumpT <= 0) {
            const imp = closing * 0.8 + 3;
            a.vx -= s * imp * 0.6;
            b.vx += s * imp * 0.6;
            a.shove = b.shove = 0.28;
            a.bumpT = b.bumpT = 0.25;
            if (imp > 7) {
              for (const o of [a, b]) {
                if (!o.grounded) continue;
                o.grounded = false;
                o.ground = null;
                o.vy = 5;
              }
            }
            this.emit('bump', a, imp, b);
          }
        }
      }
    }

    _stomp(top, under) {
      top.vy = 14;
      top.grounded = false;
      top.ground = null;
      top.forced = false;
      top.airJ = top.perk.airJumps;
      under.lock = 0.35;
      under.shove = 0.2;
      if (!under.grounded) under.vy = Math.min(under.vy, -6);
      this.emit('stomp', top, 0, under);
    }

    step(inp) {
      const dt = C.DT;
      this.time += dt;
      for (const b of this.bodies) {
        if (b.dead) continue;
        const bi = b.human ? inp : this.started ? b.bot.update(this, dt, b) : IDLE;
        this._stepBody(b, bi);
      }
      if (this.bodies.length > 1) this._collide();
      this._world(dt);
      this._generate();

      const p = this.p;
      if (!p.dead) {
        const gap = p.y - this.lavaY;
        if (!this.warned && this.started && gap < 6.5) {
          this.warned = true;
          this.emit('warn', true);
        } else if (this.warned && gap > 10) {
          this.warned = false;
          this.emit('warn', false);
        }
      }
      for (const b of this.bodies) {
        if (b.dead || b.y > this.lavaY + 0.1) continue;
        if (b.shields > 0) {
          b.shields--;
          b.y = this.lavaY + 0.2;
          b.vy = 29;
          b.grounded = false;
          b.ground = null;
          b.forced = true;
          b.airJ = b.perk.airJumps;
          this.emit('shield', null, b.shields, b);
        } else {
          b.dead = true;
          this.emit('dead', null, 0, b);
        }
      }
    }
  }
  S.Sim = Sim;
})();
