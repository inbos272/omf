// In-page stand-in for the Cloudflare runtime (Durable Object storage, alarms, WebSocket pairs),
// running the real server classes. Used by tests that drive the real game against the real server code.
import * as rules from '../server/src/rules.js';
import { Matchmaker } from '../server/src/matchmaker.js';
import { Room } from '../server/src/room.js';
import { Ledger } from '../server/src/ledger.js';
import worker from '../server/src/index.js';

class Storage {
  constructor() { this.map = new Map(); this.alarm = null; }
  async get(k) { const v = this.map.get(k); return v === undefined ? undefined : structuredClone(v); }
  async put(k, v) { this.map.set(k, structuredClone(v)); }
  async delete(k) { return this.map.delete(k); }
  async list(o) {
    const out = new Map(), pre = (o && o.prefix) || '';
    for (const [k, v] of [...this.map].sort()) if (k.startsWith(pre)) out.set(k, structuredClone(v));
    return out;
  }
  async setAlarm(t) { this.alarm = t; }
}
class Ctx {
  constructor() { this.storage = new Storage(); this.sockets = []; }
  acceptWebSocket(ws) { this.sockets.push(ws); }
  getWebSockets() { return this.sockets.filter((s) => !s.closed); }
}
function pair(owner) {
  const server = { closed: false, att: null }, client = { closed: false, onmessage: null, onclose: null, onerror: null };
  server.send = (d) => { if (!client.closed) queueMicrotask(() => client.onmessage && client.onmessage({ data: d })); };
  server.close = () => {
    if (server.closed) return;
    server.closed = client.closed = true;
    queueMicrotask(() => { client.onclose && client.onclose({}); owner().webSocketClose(server); });
  };
  server.serializeAttachment = (v) => { server.att = v === null ? null : structuredClone(v); };
  server.deserializeAttachment = () => (server.att ? structuredClone(server.att) : null);
  client.send = (d) => { if (!server.closed) queueMicrotask(() => owner().webSocketMessage(server, d)); };
  client.close = () => {
    if (client.closed) return;
    server.closed = client.closed = true;
    queueMicrotask(() => { client.onclose && client.onclose({}); owner().webSocketClose(server); });
  };
  return { server, client };
}

export function makeEnv(now) {
  const env = { NOW: now };
  let n = 0;
  const ns = (Cls) => {
    const inst = new Map();
    return {
      inst,
      idFromName: (name) => ({ name, toString: () => name }),
      newUniqueId: () => { const name = 'room-' + ++n; return { name, toString: () => name }; },
      idFromString: (name) => ({ name, toString: () => name }),
      get(id) {
        if (!inst.has(id.name)) inst.set(id.name, new Cls(new Ctx(), env));
        const o = inst.get(id.name);
        return { fetch: (u, init) => o.fetch(new Request(u, init)), o };
      },
    };
  };
  env.LEDGER = ns(Ledger);
  env.MATCH = ns(Matchmaker);
  env.ROOM = ns(Room);
  env.socket = (url) => {
    const u = new URL(url), q = u.searchParams;
    if (u.pathname === '/play') {
      const mm = env.MATCH.get(env.MATCH.idFromName(q.get('mode'))).o;
      const p = pair(() => mm);
      queueMicrotask(() => mm.join(p.server, { mode: q.get('mode'), pid: q.get('pid'), name: rules.sanitizeName(q.get('name')), skin: q.get('skin'), ab: q.get('ab') }));
      return p.client;
    }
    const room = env.ROOM.get(env.ROOM.idFromString(q.get('id'))).o;
    const p = pair(() => room);
    queueMicrotask(() => room.join(p.server, q.get('pid'), q.get('token')));
    return p.client;
  };
  env.fetch = (u, o) => worker.fetch(new Request(u, o), env);
  return env;
}
