// Online client: matchmaking, room connection, clock sync, snapshot relay and interpolation.
// The socket factory and fetch are injectable so tests can plug in an in-page fake server.
(function () {
  'use strict';
  const S = window.SKY;
  // Smoothness tuning. Rivals are drawn a little in the past so there are always two snapshots
  // to blend between; that delay adapts to the measured network jitter instead of being fixed.
  const SEND_HZ = 20;
  const DELAY_MIN = 70, DELAY_MAX = 400, DELAY_START = 130; // ms
  const EXTRAP_MAX = 0.22;   // s: keep a rival moving this long past its last snapshot
  const SMOOTH_T = 0.09;     // s: how fast a position correction fades out
  const SNAP_DIST = 2.5;     // corrections bigger than this jump instead of sliding
  const PING_EVERY = 2;      // s: clock re-sync during a match
  const PROTOCOL = 2; // must match server/src/rules.js
  S.NET_PROTOCOL = PROTOCOL;

  class Net {
    constructor(opts) {
      opts = opts || {};
      this.socketFactory = opts.socketFactory || ((u) => new WebSocket(u));
      this.fetchFn = opts.fetchFn || ((u, o) => fetch(u, o));
      this.baseUrl = opts.baseUrl !== undefined ? opts.baseUrl : String(window.SKY_SERVER_URL || '');
      this.nowFn = opts.now || (() => Date.now());
      this.reset();
    }

    reset() {
      this.phase = 'idle'; // idle | queue | joining | room | ended | lost | error
      this.ws = null;
      this.rws = null;
      this.slot = -1;
      this.host = -1;
      this.roster = [];
      this.snaps = {};
      this.offset = 0;
      this.offsetTarget = 0;
      this.bestRtt = 1e9;
      this.rtts = [];            // recent [rtt, offset] samples; the lowest-rtt one sets the clock
      this.pingT = 0;
      this.delay = DELAY_START;  // current playback delay for rivals (ms)
      this.latM = 0;             // snapshot age on arrival: running mean and deviation (ms)
      this.latD = 20;
      this.latN = 0;
      this.sendT = 0;
      this.lastG = null;
      this.h = null;
      this.leftSlots = new Set();
    }

    get configured() { return !!this.baseUrl; }
    base() { return this.baseUrl.replace(/\/+$/, ''); }
    wsUrl(path, params) { return this.base().replace(/^http/, 'ws') + path + '?' + new URLSearchParams(params).toString(); }

    // 'ok' | 'outdated' (server runs another protocol version: redeploy needed) | 'offline'
    async health() {
      if (!this.configured) return 'offline';
      try {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => ctl && ctl.abort(), 2500);
        const r = await this.fetchFn(this.base() + '/health', ctl ? { signal: ctl.signal } : {});
        clearTimeout(timer);
        if (!r || !r.ok) return 'offline';
        const j = await r.json().catch(() => ({}));
        return j.v === PROTOCOL ? 'ok' : 'outdated';
      } catch (e) {
        return 'offline';
      }
    }

    async profile(pid) {
      if (!this.configured) return null;
      try {
        const r = await this.fetchFn(this.base() + '/profile?pid=' + encodeURIComponent(pid));
        return r.ok ? await r.json() : null;
      } catch (e) {
        return null;
      }
    }

    // ---- leaderboard ----
    async _timed(url, opts, ms) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctl && ctl.abort(), ms || 4000);
      try {
        return await this.fetchFn(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {}));
      } finally {
        clearTimeout(timer);
      }
    }

    async submitScore(pid, name, best) {
      if (!this.configured) return false;
      try {
        const r = await this._timed(this.base() + '/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid, name, best }),
        });
        return !!(r && r.ok);
      } catch (e) {
        return false;
      }
    }

    // Register a nickname: 'ok' | 'taken' (someone else has it) | 'invalid' | 'offline' | 'outdated'
    async claimNick(pid, name) {
      if (!this.configured) return 'offline';
      try {
        const r = await this._timed(this.base() + '/nick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid, name }),
        });
        if (!r) return 'offline';
        if (r.status === 404) return 'outdated';
        const j = await r.json().catch(() => null);
        if (!j || typeof j.ok !== 'boolean') return 'outdated'; // a server without the registry
        return j.ok ? 'ok' : j.code === 'taken' ? 'taken' : 'invalid';
      } catch (e) {
        return 'offline';
      }
    }

    // type: 'floor' | 'rp' → { top: [{ name, v, me }], me: { v, rank|null } } | 'outdated' | null
    async top(type, pid) {
      if (!this.configured) return null;
      try {
        const r = await this._timed(this.base() + '/top?type=' + encodeURIComponent(type) + '&pid=' + encodeURIComponent(pid));
        if (!r) return null;
        if (r.status === 404) return 'outdated';
        if (!r.ok) return null;
        const j = await r.json().catch(() => null);
        return j && Array.isArray(j.top) ? j : 'outdated'; // a server without rankings answers with plain text
      } catch (e) {
        return null;
      }
    }

    // me: { pid, name, skin, ab }. h: { queue(n, fillIn), hello(msg), host(slot), event(msg), end(msg), error(code), lost() }
    find(mode, me, h) {
      this.close();
      this.reset();
      this.h = h;
      this.me = me;
      this.mode = mode;
      this.phase = 'queue';
      const ws = (this.ws = this.socketFactory(this.wsUrl('/play', { mode, pid: me.pid, name: me.name, skin: me.skin, ab: me.ab || '' })));
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t === 'queue') h.queue(m.n, m.fillIn);
        else if (m.t === 'match') { this.phase = 'joining'; this._joinRoom(m.room, m.token); }
        else if (m.t === 'error') { this.phase = 'error'; h.error(m.code); }
      };
      ws.onclose = () => { if (this.phase === 'queue') { this.phase = 'error'; h.error('closed'); } };
      ws.onerror = () => {};
    }

    cancel() {
      if (this.ws && this.phase === 'queue') {
        this.phase = 'idle';
        this._send(this.ws, { t: 'cancel' });
      }
      this.close();
      this.phase = 'idle';
    }

    close() {
      for (const w of [this.ws, this.rws]) if (w) try { w.close(); } catch (e) { /* already closed */ }
      this.ws = this.rws = null;
    }

    _joinRoom(room, token) {
      const ws = (this.rws = this.socketFactory(this.wsUrl('/room', { id: room, pid: this.me.pid, token })));
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        this._onRoom(m);
      };
      ws.onclose = () => {
        if (this.phase === 'room' || this.phase === 'joining') {
          this.phase = 'lost';
          if (this.h.lost) this.h.lost();
        }
      };
      ws.onerror = () => {};
    }

    _onRoom(m) {
      switch (m.t) {
        case 'hello':
          this.slot = m.you;
          this.roster = m.roster;
          this.seed = m.seed;
          this.startAt = m.startAt;
          this.host = m.host;
          this.offset = this.offsetTarget = m.now - this.nowFn();
          this.phase = 'room';
          for (let i = 0; i < 4; i++) setTimeout(() => this.ping(), i * 200);
          this.h.hello(m);
          break;
        case 'pong': {
          // Keep the clock in step all match long: of the recent samples, trust the one with the
          // shortest round trip (least queueing), and glide towards it rather than jump.
          const now = this.nowFn(), rtt = Math.max(0, now - m.c);
          this.rtts.push([rtt, m.s + rtt / 2 - now]);
          if (this.rtts.length > 8) this.rtts.shift();
          let best = this.rtts[0];
          for (const s of this.rtts) if (s[0] < best[0]) best = s;
          this.bestRtt = best[0];
          this.offsetTarget = best[1];
          if (this.rtts.length <= 4) this.offset = this.offsetTarget; // still before the start
          break;
        }
        case 'host':
          this.host = m.slot;
          if (this.h.host) this.h.host(m.slot);
          break;
        case 's':
          this._push(m.from, m);
          break;
        case 'ai':
          for (const s of m.list || []) this._push(s.slot, s);
          break;
        case 'ev':
          if (this.h.event) this.h.event(m);
          break;
        case 'left':
          this.leftSlots.add(m.slot);
          if (this.h.left) this.h.left(m.slot);
          break;
        case 'end':
          this.phase = 'ended';
          this.h.end(m);
          break;
        case 'error':
          this.phase = 'error';
          this.h.error(m.code);
          break;
      }
    }

    serverNow() { return this.nowFn() + this.offset; }
    get isHost() { return this.slot >= 0 && this.slot === this.host; }

    _send(ws, msg) {
      if (!ws) return;
      try { ws.send(JSON.stringify(msg)); } catch (e) { /* socket closing */ }
    }

    ping() { this._send(this.rws, { t: 'ping', c: this.nowFn() }); }

    _push(slot, s) {
      const buf = this.snaps[slot] || (this.snaps[slot] = []);
      // Out-of-order or duplicate packets would make the rival twitch backwards: drop them.
      if (buf.length && s.ts <= buf[buf.length - 1].ts) return;
      buf.push(s);
      if (buf.length > 32) buf.shift();
      // How old snapshots are when they arrive (network delay + jitter), as a running mean/deviation.
      const age = this.serverNow() - s.ts;
      if (age > -500 && age < 3000) {
        const k = this.latN < 20 ? 1 / ++this.latN : 0.05;
        const d = age - this.latM;
        this.latM += d * k;
        this.latD += (Math.abs(d) - this.latD) * k;
      }
    }

    // Playback delay that covers the usual arrival age plus its spread plus one send interval.
    delayTarget() {
      const t = this.latM + 2.5 * this.latD + 1000 / SEND_HZ;
      return Math.max(DELAY_MIN, Math.min(DELAY_MAX, t));
    }

    // Snapshot for a slot at server time t, linearly interpolated (x along the wrapped circle).
    // Past the newest snapshot the rival keeps moving along its last velocity for a moment
    // (with gravity while airborne) instead of freezing, then holds.
    sample(slot, t) {
      const buf = this.snaps[slot];
      if (!buf || !buf.length) return null;
      if (t <= buf[0].ts) return buf[0];
      const C = S.CFG;
      for (let i = buf.length - 1; i > 0; i--) {
        const a = buf[i - 1], b = buf[i];
        if (t >= a.ts && t <= b.ts) {
          const k = b.ts > a.ts ? (t - a.ts) / (b.ts - a.ts) : 1;
          const x = a.x + S.wrapD(b.x - a.x) * k;
          return { ...b, x: ((x % C.CIRC) + C.CIRC) % C.CIRC, y: a.y + (b.y - a.y) * k };
        }
      }
      const last = buf[buf.length - 1];
      if (last.d) return last;
      const e = Math.min(EXTRAP_MAX, (t - last.ts) / 1000);
      const x = last.x + last.vx * e;
      const y = last.g ? last.y : last.y + last.vy * e - 0.5 * (last.vy > 0 ? C.GRAV_UP : C.GRAV_DOWN) * e * e;
      return { ...last, x: ((x % C.CIRC) + C.CIRC) % C.CIRC, y, extra: true };
    }

    static pack(b, ts) {
      return {
        ts, x: +b.x.toFixed(3), y: +b.y.toFixed(3), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2),
        f: b.floor, ft: +b.floorT.toFixed(3), g: b.grounded ? 1 : 0, d: b.dead ? 1 : 0, sh: b.shields,
      };
    }

    // Called every frame during an online race: sends my state (and the AI's if I host) at 20 Hz,
    // and moves remote bodies to their interpolated positions.
    update(sim, dt, onRemoteDeath) {
      if (this.phase !== 'room') return;
      // Clock: periodic pings, small corrections glide in so the timer and lava never jump.
      this.pingT -= dt;
      if (this.pingT <= 0) { this.pingT = PING_EVERY; this.ping(); }
      const drift = this.offsetTarget - this.offset;
      this.offset = Math.abs(drift) > 400 ? this.offsetTarget : this.offset + drift * Math.min(1, dt * 1.5);
      this.delay += (this.delayTarget() - this.delay) * Math.min(1, dt * 1.2);

      const now = this.serverNow();
      this.sendT -= dt;
      // A jump or landing goes out at once (not up to 50 ms later), so rivals see it sooner.
      const g = sim.p.grounded;
      const changed = this.lastG !== null && g !== this.lastG && this.sendT < 1 / SEND_HZ - 0.03;
      this.lastG = g;
      if (this.sendT <= 0 || changed) {
        this.sendT = 1 / SEND_HZ;
        this._send(this.rws, { t: 's', ...Net.pack(sim.p, now) });
        if (this.isHost) {
          const list = [];
          for (const b of sim.bodies) if (!b.human && !b.remote && this.roster[b.slot] && this.roster[b.slot].ai) list.push({ slot: b.slot, ...Net.pack(b, now) });
          if (list.length) this._send(this.rws, { t: 'ai', list });
        }
      }
      const t = now - this.delay;
      const fade = Math.exp(-dt / SMOOTH_T);
      for (const b of sim.bodies) {
        if (!b.remote) continue;
        if (this.leftSlots.has(b.slot)) {
          // Forfeited players drop out of the race: no frozen ghost, no lead, no spectating.
          if (!b.dead) {
            b.dead = true;
            b.dc = true;
            if (onRemoteDeath) onRemoteDeath(b);
          }
          continue;
        }
        const s = this.sample(b.slot, t);
        if (!s) continue;
        // Error smoothing: where the rival should be now (last drawn spot + its motion) versus the
        // new target. A small mismatch (late packet, extrapolation corrected) fades out over ~90 ms
        // instead of popping; a big one (respawn, push) snaps.
        if (b.netSeen && !s.d) {
          // offset = (previous drawn spot + expected motion) − new target, then decay
          const ox = S.wrapD(b.x + b.netVx * dt - s.x), oy = b.y + b.netVy * dt - s.y;
          const far = Math.hypot(ox, oy) > SNAP_DIST;
          b.ox = far ? 0 : ox * fade;
          b.oy = far ? 0 : oy * fade;
        } else {
          b.ox = b.oy = 0;
        }
        b.netSeen = true;
        b.netVx = s.vx;
        b.netVy = s.g ? 0 : s.vy;
        const C = S.CFG;
        b.x = b.px = (((s.x + b.ox) % C.CIRC) + C.CIRC) % C.CIRC;
        b.y = b.py = s.y + b.oy;
        b.vx = s.vx;
        b.vy = s.vy;
        b.floor = s.f;
        b.floorT = s.ft;
        b.grounded = !!s.g;
        b.shields = s.sh;
        if (s.d && !b.dead) {
          b.dead = true;
          if (onRemoteDeath) onRemoteDeath(b);
        }
      }
    }

    sendEvent(ev) { this._send(this.rws, { t: 'ev', ...ev }); }

    // My own final result.
    sendResult(body) {
      this._send(this.rws, { t: 'res', floor: body.floor, floorT: body.floorT });
    }

    // Host only: final results for AI rivals (sent as each one falls, the rest at the end).
    sendAiResults(list) {
      if (list.length) this._send(this.rws, { t: 'aires', list: list.map((b) => ({ slot: b.slot, floor: b.floor, floorT: b.floorT })) });
    }

    // Host only: report AIs that have fallen since last time. If every human is out, nothing can
    // change the standings any more except the AI, so play their remaining race out instantly
    // (fastForward) and report everything — the room can then end without waiting for the clock.
    settleAi(sim, raceLeft, fastForward) {
      if (!this.isHost || this.phase !== 'room') return;
      const isAi = (b) => !b.human && this.roster[b.slot] && this.roster[b.slot].ai;
      const ais = sim.bodies.filter(isAi);
      const humansOut = sim.bodies.filter((b) => !isAi(b)).every((b) => b.dead);
      let over = raceLeft <= 0;
      if (humansOut && ais.some((b) => !b.dead) && !over) {
        fastForward(ais, raceLeft);
        over = true;
      }
      const fresh = ais.filter((b) => (b.dead || over) && !b.reported);
      for (const b of fresh) b.reported = true;
      this.sendAiResults(fresh);
    }
  }
  S.Net = Net;

  // Rival list for Sim.reset from the room roster. AI looks/abilities come from the shared seed,
  // so every client draws the same rivals; only the host actually runs the AI.
  S.onlineRacers = (msg, mySlot, isHost) =>
    msg.roster.filter((r) => r.slot !== mySlot).map((r) => {
      if (r.ai) {
        const rng = S.mulberry(((msg.seed ^ (r.slot * 7919)) >>> 0) || 1);
        const skin = S.SKINS[1 + Math.floor(rng() * (S.SKINS.length - 1))];
        const ab = S.AI_ABILITIES[Math.floor(rng() * S.AI_ABILITIES.length)];
        return {
          slot: r.slot, skin, ab, perk: S.perkFor(ab), name: null, ai: true,
          remote: !isHost, bot: isHost ? new S.Bot(r.skill, (msg.seed + r.slot) >>> 0, r.aggro) : null,
        };
      }
      const skin = S.SKINS.find((s) => s.id === r.skin) || S.SKINS[0];
      const ab = S.ABILITIES[r.ab] ? r.ab : null;
      return { slot: r.slot, skin, ab, perk: S.perkFor(ab), name: r.name, remote: true };
    });

  // Host changed: the new host starts simulating the AI rivals from where they were last seen.
  S.onlineTakeover = (sim, net) => {
    for (const b of sim.bodies) {
      const r = net.roster[b.slot];
      if (b.human || !r || !r.ai) continue;
      if (net.isHost && b.remote) {
        b.remote = false;
        b.bot = new S.Bot(r.skill, (net.seed + b.slot) >>> 0, r.aggro);
        b.grounded = false;
        b.ground = null;
      } else if (!net.isHost && !b.remote) {
        b.remote = true;
      }
    }
  };
})();
