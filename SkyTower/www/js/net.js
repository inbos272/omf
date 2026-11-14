// Online client: matchmaking, room connection, clock sync, snapshot relay and interpolation.
// The socket factory and fetch are injectable so tests can plug in an in-page fake server.
(function () {
  'use strict';
  const S = window.SKY;
  const SEND_HZ = 15, DELAY_MS = 120;

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
      this.bestRtt = 1e9;
      this.sendT = 0;
      this.h = null;
      this.leftSlots = new Set();
    }

    get configured() { return !!this.baseUrl; }
    base() { return this.baseUrl.replace(/\/+$/, ''); }
    wsUrl(path, params) { return this.base().replace(/^http/, 'ws') + path + '?' + new URLSearchParams(params).toString(); }

    async health() {
      if (!this.configured) return false;
      try {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => ctl && ctl.abort(), 2500);
        const r = await this.fetchFn(this.base() + '/health', ctl ? { signal: ctl.signal } : {});
        clearTimeout(timer);
        return !!(r && r.ok);
      } catch (e) {
        return false;
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
          this.offset = m.now - this.nowFn();
          this.phase = 'room';
          for (let i = 0; i < 3; i++) setTimeout(() => this._send(this.rws, { t: 'ping', c: this.nowFn() }), i * 250);
          this.h.hello(m);
          break;
        case 'pong': {
          const now = this.nowFn(), rtt = now - m.c;
          if (rtt <= this.bestRtt) {
            this.bestRtt = rtt;
            this.offset = m.s + rtt / 2 - now;
          }
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

    _push(slot, s) {
      const buf = this.snaps[slot] || (this.snaps[slot] = []);
      buf.push(s);
      if (buf.length > 24) buf.shift();
    }

    // Snapshot for a slot at server time t, linearly interpolated (x along the wrapped circle).
    sample(slot, t) {
      const buf = this.snaps[slot];
      if (!buf || !buf.length) return null;
      if (t <= buf[0].ts) return buf[0];
      for (let i = buf.length - 1; i > 0; i--) {
        const a = buf[i - 1], b = buf[i];
        if (t >= a.ts && t <= b.ts) {
          const k = b.ts > a.ts ? (t - a.ts) / (b.ts - a.ts) : 1;
          const x = a.x + S.wrapD(b.x - a.x) * k;
          return { ...b, x: ((x % S.CFG.CIRC) + S.CFG.CIRC) % S.CFG.CIRC, y: a.y + (b.y - a.y) * k };
        }
      }
      return buf[buf.length - 1];
    }

    static pack(b, ts) {
      return {
        ts, x: +b.x.toFixed(3), y: +b.y.toFixed(3), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2),
        f: b.floor, ft: +b.floorT.toFixed(3), g: b.grounded ? 1 : 0, d: b.dead ? 1 : 0, sh: b.shields,
      };
    }

    // Called every frame during an online race: sends my state (and the AI's if I host) at 15 Hz,
    // and moves remote bodies to their interpolated positions.
    update(sim, dt, onRemoteDeath) {
      if (this.phase !== 'room') return;
      const now = this.serverNow();
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1 / SEND_HZ;
        this._send(this.rws, { t: 's', ...Net.pack(sim.p, now) });
        if (this.isHost) {
          const list = [];
          for (const b of sim.bodies) if (!b.human && !b.remote && this.roster[b.slot] && this.roster[b.slot].ai) list.push({ slot: b.slot, ...Net.pack(b, now) });
          if (list.length) this._send(this.rws, { t: 'ai', list });
        }
      }
      const t = now - DELAY_MS;
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
        b.x = b.px = s.x;
        b.y = b.py = s.y;
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
