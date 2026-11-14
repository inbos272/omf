// Room: one Durable Object per match. It hands out the shared seed and start time, relays
// player snapshots and events between clients, collects results, and settles rank points.
// Physics runs on the clients; the lowest connected human slot also simulates the AI rivals.
import { aiSkillForRp, orderResults, chooseHost, JOIN_MS, COUNTDOWN_MS, RACE_MS, GRACE_MS } from './rules.js';

const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch (e) { /* socket already gone */ } };

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
    if (!r || m.ended) {
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
        this.broadcast({ ...msg, from: a.slot }, ws);
        break;
      case 'ai':
        if (a.slot === m.host) this.broadcast({ ...msg, from: a.slot }, ws);
        break;
      case 'res': {
        const num = (v, d) => (Number.isFinite(+v) ? +v : d);
        if (!m.results[a.slot]) m.results[a.slot] = { floor: Math.max(0, Math.floor(num(msg.floor, 0))), floorT: num(msg.floorT, 1e9) };
        if (a.slot === m.host && Array.isArray(msg.ai)) {
          for (const r of msg.ai) {
            const e = m.roster[r.slot];
            if (e && e.ai && !m.results[r.slot]) m.results[r.slot] = { floor: Math.max(0, Math.floor(num(r.floor, 0))), floorT: num(r.floorT, 1e9) };
          }
        }
        await this.save();
        if (this.complete()) await this.finish();
        break;
      }
    }
  }

  complete() {
    return this.m.roster.every((r) => this.m.results[r.slot]);
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    try { ws.serializeAttachment(null); } catch (e) { /* closed sockets may refuse writes */ }
    const m = await this.meta();
    if (!a || !m || m.ended) return;
    // Leaving a started race without a result counts as last place.
    if (this.now() >= m.startAt && !m.results[a.slot]) m.results[a.slot] = { dc: true, floor: 0 };
    await this.save();
    await this.updateHost();
    if (this.complete() || this.connected().size === 0) await this.finish();
  }

  async alarm() {
    await this.finish();
  }

  async finish() {
    const m = await this.meta();
    if (!m || m.ended) return;
    m.ended = true;
    const entries = m.roster.map((r) => ({ slot: r.slot, ...(m.results[r.slot] || (r.ai ? { floor: 0 } : { dc: true, floor: 0 })) }));
    const order = orderResults(entries);
    const humans = [];
    order.forEach((e, i) => {
      const r = m.roster[e.slot];
      if (!r.ai) humans.push({ pid: r.pid, name: r.name, place: i + 1, slot: r.slot });
    });
    let profiles = {};
    if (humans.length) {
      const stub = this.env.LEDGER.get(this.env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/apply', { method: 'POST', body: JSON.stringify({ mode: m.mode, players: humans }) });
      const byPid = await res.json();
      for (const h of humans) profiles[h.slot] = byPid[h.pid];
    }
    await this.save();
    const pub = {};
    for (const s in profiles) {
      const p = profiles[s];
      pub[s] = { delta: p.delta, rp: p.rp, tier: p.tier, casualWins: p.casualWins };
    }
    this.broadcast({ t: 'end', order: order.map((e) => ({ slot: e.slot, floor: e.floor || 0, dc: !!e.dc })), profiles: pub });
    for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'race over'); } catch (e) { /* already closed */ }
  }
}
