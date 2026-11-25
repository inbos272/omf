// Worker entry: routes HTTP and WebSocket requests to the Durable Objects.
import { PROTOCOL, regionOf } from './rules.js';
export { Matchmaker } from './matchmaker.js';
export { Room } from './room.js';
export { Ledger } from './ledger.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Admin requests need "Authorization: Bearer <ADMIN_KEY>". The key is a Worker secret
// (npx wrangler secret put ADMIN_KEY), never in the code. Without it, admin is switched off.
function adminOk(req, env) {
  const key = env.ADMIN_KEY;
  if (!key || key.length < 24) return false;
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (got.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ got.charCodeAt(i); // constant time
  return diff === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/health') return Response.json({ ok: true, v: PROTOCOL }, { headers: CORS });

    if (url.pathname === '/profile') {
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/get?pid=' + encodeURIComponent(url.searchParams.get('pid') || ''));
      return new Response(res.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Leaderboards: POST /score {pid, name, best} · GET /top?type=floor|rp&pid=
    if (url.pathname === '/score' && req.method === 'POST') {
      const body = await req.text();
      if (body.length > 512) return new Response('too large', { status: 413, headers: CORS });
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/score', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/top') {
      const q = new URLSearchParams({ type: url.searchParams.get('type') || 'floor', pid: (url.searchParams.get('pid') || '').slice(0, 64) });
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/top?' + q.toString());
      return new Response(res.body, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    // Admin: /admin/export, /admin/player, /admin/remove, /admin/rename, /admin/reset (see README).
    if (url.pathname.startsWith('/admin/')) {
      if (!adminOk(req, env)) return Response.json({ ok: false, code: 'forbidden' }, { status: 403, headers: CORS });
      const body = req.method === 'POST' ? await req.text() : undefined;
      if (body && body.length > 4096) return new Response('too large', { status: 413, headers: CORS });
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger' + url.pathname + url.search, { method: req.method, body, headers: { 'Content-Type': 'application/json' } });
      return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    // Progress reset in the game: POST /forget {pid} erases that player's server record.
    if (url.pathname === '/forget' && req.method === 'POST') {
      const body = await req.text();
      if (body.length > 512) return new Response('too large', { status: 413, headers: CORS });
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/forget', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Nickname registry: POST /nick {pid, name} → {ok, name} | {ok:false, code:'taken'|'invalid'}
    if (url.pathname === '/nick' && req.method === 'POST') {
      const body = await req.text();
      if (body.length > 512) return new Response('too large', { status: 413, headers: CORS });
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/nick', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/play') {
      const mode = url.searchParams.get('mode') === 'ranked' ? 'ranked' : 'casual';
      // Pass the player's region along (the matchmaker uses it to group nearby players).
      const fwd = new URL(req.url);
      fwd.searchParams.set('region', regionOf(req.cf));
      return env.MATCH.get(env.MATCH.idFromName(mode)).fetch(new Request(fwd.toString(), req));
    }

    if (url.pathname === '/room') {
      let id;
      try { id = env.ROOM.idFromString(url.searchParams.get('id') || ''); }
      catch (e) { return new Response('bad room id', { status: 400 }); }
      return env.ROOM.get(id).fetch(req);
    }

    return new Response('Sky Tower online server', { headers: CORS });
  },
};
