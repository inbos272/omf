// Room: one Durable Object per match. It hands out the shared seed and start time, relays
// player snapshots and events between clients, collects results, and settles rank points.
// Physics runs on the clients; the lowest connected human slot also simulates the AI rivals.
import { aiSkillForRp, orderResults, chooseHost, JOIN_MS, COUNTDOWN_MS, RACE_MS, GRACE_MS, AI_WAIT_MS } from './rules.js';

const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch (e) { /* socket already gone */ } };
const toFloor = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const toTime = (v) => (Number.isFinite(+v) ? +v : 1e9);

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.m = null;
  }

  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async meta() {
    if (!this.m) this.m = await this.ctx.storage.get('meta');
    return this.m;
  }

  async save() { await this.ctx.storage.put('meta', this.m); }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') return Response.json(await this.init(await req.json()));
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    await this.join(server, String(url.searchParams.get('pid') || ''), String(url.searchParams.get('token') || ''));
    return new Response(null, { status: 101, webSocket: client });
  }

  async init(cfg) {
    const roster = cfg.players.map((p, i) => ({ slot: i, ai: false, pid: p.pid, name: p.name, skin: p.skin, ab: p.ab, rp: p.rp, token: p.token }));
    for (let i = 0; i < cfg.ai; i++) {
      const s = aiSkillForRp(cfg.avgRp || 0, Math.random());
      roster.push({ slot: roster.length, ai: true, skill: s.skill, aggro: s.aggro });
    }
    const now = this.now();
    this.m = { mode: cfg.mode, seed: cfg.seed, roster, startAt: now + JOIN_MS + COUNTDOWN_MS, results: {}, ended: false, host: -1 };
    await this.save();
    await this.ctx.storage.setAlarm(this.m.startAt + RACE_MS + GRACE_MS);
    return { ok: true, slots: roster.length };
  }

  publicRoster() {
    return this.m.roster.map((r) => ({ slot: r.slot, ai: r.ai, name: r.name || null, skin: r.skin || null, ab: r.ab || null, rp: r.rp || 0, skill: r.skill || 0, aggro: r.aggro || 0 }));
  }

  connected() {
    const s = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) s.add(a.slot);
    }
    return s;
  }

  broadcast(msg, except) {
    for (const ws of this.ctx.getWebSockets()) if (ws !== except && ws.deserializeAttachment()) send(ws, msg);
  }

  async updateHost() {
    const h = chooseHost(this.m.roster, this.connected());
    if (h !== this.m.host) {
      this.m.host = h;
      await this.save();
      this.broadcast({ t: 'host', slot: h });
    }
  }

  async join(ws, pid, token) {
    this.ctx.acceptWebSocket(ws);
    const m = await this.meta();
    const r = m && m.roster.find((x) => !x.ai && x.pid === pid && x.token === token);
    const forfeited = r && m.results[r.slot] && m.results[r.slot].dc;
    if (!r || m.ended || forfeited) {
      send(ws, { t: 'error', code: 'room' });
      ws.close(4004, 'unknown room or token');
      return;
    }
    ws.serializeAttachment({ slot: r.slot, pid });
    await this.updateHost();
    send(ws, { t: 'hello', you: r.slot, mode: m.mode, seed: m.seed, startAt: m.startAt, now: this.now(), host: m.host, roster: this.publicRoster() });
    this.broadcast({ t: 'joined', slot: r.slot }, ws);
  }

  async webSocketMessage(ws, data) {
    // Real messages are a few hundred bytes; anything far bigger is dropped instead of being
    // relayed to every other player (it would only cost them bandwidth and frames).
    if (typeof data !== 'string' || data.length > 4096) return;
    const a = ws.deserializeAttachment();
    const m = await this.meta();
    if (!a || !m || m.ended) return;
    let msg = null;
    try { msg = JSON.parse(data); } catch (e) { return; }
    switch (msg && msg.t) {
      case 'ping':
        send(ws, { t: 'pong', c: msg.c, s: this.now() });
        break;
      case 's':
      case 'ev':
        // Hot path (~20 msgs/s per player): relay straight away, nothing stored.
        this.broadcast({ ...msg, from: a.slot }, ws);
        break;
      case 'ai':
        if (a.slot !== m.host) break;
        this.broadcast({ ...msg, from: a.slot }, ws);
        // Remember each AI's latest progress: if the host vanishes before reporting, the AI is
        // ranked by what it had actually climbed instead of counting as 0 floors.
        m.lastAi = m.lastAi || {};
        for (const s of msg.list || []) {
          const e = m.roster[s.slot];
          if (e && e.ai) m.lastAi[s.slot] = { floor: toFloor(s.f), floorT: toTime(s.ft) };
        }
        break;
      case 'res': // a player's own final result (sent when they fall or when time runs out)
        if (!m.results[a.slot]) m.results[a.slot] = { floor: toFloor(msg.floor), floorT: toTime(msg.floorT) };
        await this.save();
        await this.settle();
        break;
      case 'aires': // AI results, only from the host, sent as each AI falls
        if (a.slot !== m.host || !Array.isArray(msg.list)) break;
        for (const r of msg.list) {
          const e = m.roster[r.slot];
          if (e && e.ai && !m.results[r.slot]) m.results[r.slot] = { floor: toFloor(r.floor), floorT: toTime(r.floorT) };
        }
        await this.save();
        await this.settle();
        break;
    }
  }

  complete() {
    return this.m.roster.every((r) => this.m.results[r.slot]);
  }

  // End as soon as nothing can change: every slot reported, or nobody connected. Once every human
  // is done only the AI is left; give the host a moment to report them, then end regardless.
  async settle() {
    const m = this.m;
    if (this.complete() || this.connected().size === 0) return this.finish();
    if (m.roster.every((r) => r.ai || m.results[r.slot])) await this.ctx.storage.setAlarm(this.now() + AI_WAIT_MS);
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    try { ws.serializeAttachment(null); } catch (e) { /* closed sockets may refuse writes */ }
    const m = await this.meta();
    if (!a || !m || m.ended) return;
    // Leaving without a result (before or during the race) forfeits: last place, and a rejoin
    // later cannot replace it. Everyone else is told so the leaver's ghost drops out of the race.
    if (!m.results[a.slot]) {
      m.results[a.slot] = { dc: true, floor: 0 };
      this.broadcast({ t: 'left', slot: a.slot });
    }
    await this.save();
    await this.updateHost();
    await this.settle();
  }

  async alarm() {
    await this.finish();
  }

  async finish() {
    const m = await this.meta();
    if (!m || m.ended) return;
    m.ended = true;
    const last = m.lastAi || {};
    const entries = m.roster.map((r) => ({ slot: r.slot, ...(m.results[r.slot] || (r.ai ? last[r.slot] || { floor: 0 } : { dc: true, floor: 0 })) }));
    const order = orderResults(entries);
    // AI the host never reported (host gone, app killed): their final height is unknown, so no
    // standing can be trusted. The match is void — no wins, no rank points — rather than letting a
    // player who fell (and then refreshed) win against rivals frozen mid-climb.
    m.void = m.roster.some((r) => r.ai && !m.results[r.slot]);
    const humans = [];
    order.forEach((e, i) => {
      const r = m.roster[e.slot];
      if (!r.ai) humans.push({ pid: r.pid, name: r.name, place: i + 1, slot: r.slot });
    });
    let profiles = {};
    if (humans.length && !m.void) {
      // If the ledger can't be reached the race still ends for everyone (standings shown, no
      // rank change) rather than leaving the players waiting for an end that never comes.
      try {
        const stub = this.env.LEDGER.get(this.env.LEDGER.idFromName('global'));
        const res = await stub.fetch('https://ledger/apply', { method: 'POST', body: JSON.stringify({ mode: m.mode, players: humans }) });
        const byPid = await res.json();
        for (const h of humans) if (byPid[h.pid]) profiles[h.slot] = byPid[h.pid];
      } catch (e) {
        profiles = {};
      }
    }
    await this.save();
    const pub = {};
    for (const s in profiles) {
      const p = profiles[s];
      pub[s] = { delta: p.delta, rp: p.rp, tier: p.tier, casualWins: p.casualWins, placed: p.placed, placeN: p.placeN, placedNow: p.placedNow };
    }
    this.broadcast({ t: 'end', void: m.void, order: order.map((e) => ({ slot: e.slot, floor: e.floor || 0, dc: !!e.dc })), profiles: pub });
    for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'race over'); } catch (e) { /* already closed */ }
  }
}
