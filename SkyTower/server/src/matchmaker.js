// Matchmaker: one Durable Object per mode ("casual", "ranked"). Players wait here on a WebSocket;
// when five are queued (or the oldest has waited 10 s) a Room is created, filled with AI if needed,
// and every matched player is told which room to join.
import { pickGroup, makeToken, sanitizeName, RANKED_UNLOCK, FILL_AFTER_MS, ROOM_SIZE } from './rules.js';

const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch (e) { /* socket already gone */ } };

export class Matchmaker {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const url = new URL(req.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    await this.join(server, {
      mode: url.searchParams.get('mode') === 'ranked' ? 'ranked' : 'casual',
      pid: String(url.searchParams.get('pid') || '').slice(0, 64),
      name: sanitizeName(url.searchParams.get('name')),
      skin: String(url.searchParams.get('skin') || '').slice(0, 24),
      ab: String(url.searchParams.get('ab') || '').slice(0, 24),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async join(ws, info) {
    this.ctx.acceptWebSocket(ws);
    if (!info.pid) {
      send(ws, { t: 'error', code: 'pid' });
      ws.close(4000, 'missing id');
      return;
    }
    const profile = await this.profile(info.pid);
    if (info.mode === 'ranked' && profile.casualWins < RANKED_UNLOCK) {
      send(ws, { t: 'error', code: 'locked', casualWins: profile.casualWins });
      ws.close(4003, 'ranked locked');
      return;
    }
    // One queue entry per device.
    for (const other of this.ctx.getWebSockets()) {
      const a = other.deserializeAttachment();
      if (other !== ws && a && a.pid === info.pid) other.close(4009, 'replaced');
    }
    ws.serializeAttachment({ ...info, rp: profile.rp, joined: this.now() });
    await this.tick();
  }

  async profile(pid) {
    const stub = this.env.LEDGER.get(this.env.LEDGER.idFromName('global'));
    const res = await stub.fetch('https://ledger/get?pid=' + encodeURIComponent(pid));
    return res.json();
  }

  queue() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.joined) out.push({ ...a, ws });
    }
    return out.sort((x, y) => x.joined - y.joined);
  }

  async tick() {
    let q = this.queue();
    let group;
    while (q.length && (group = pickGroup(q, this.now(), q[0].mode))) {
      await this.startRoom(group, q[0].mode);
      q = this.queue();
    }
    const now = this.now();
    for (const e of q) send(e.ws, { t: 'queue', n: q.length, need: ROOM_SIZE, fillIn: Math.max(0, FILL_AFTER_MS - (now - q[0].joined)) });
    if (q.length) await this.ctx.storage.setAlarm(now + 1000);
  }

  async startRoom(group, mode) {
    const id = this.env.ROOM.newUniqueId();
    const players = group.players.map((p) => ({ pid: p.pid, name: p.name, skin: p.skin, ab: p.ab, rp: p.rp, token: makeToken() }));
    const avgRp = players.reduce((s, p) => s + p.rp, 0) / players.length;
    const seed = (Math.random() * 0x7fffffff) | 0;
    await this.env.ROOM.get(id).fetch('https://room/init', {
      method: 'POST',
      body: JSON.stringify({ mode, seed, players, ai: group.ai, avgRp }),
    });
    group.players.forEach((p, i) => {
      p.ws.serializeAttachment(null); // no longer queued
      send(p.ws, { t: 'match', room: id.toString(), token: players[i].token });
      p.ws.close(1000, 'matched');
    });
  }

  async webSocketMessage(ws, data) {
    let msg = null;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg && msg.t === 'cancel') {
      ws.serializeAttachment(null);
      ws.close(1000, 'cancelled');
      await this.tick();
    }
  }

  async webSocketClose(ws) {
    try { ws.serializeAttachment(null); } catch (e) { /* closed sockets may refuse writes */ }
    await this.tick();
  }

  async alarm() {
    await this.tick();
  }
}
