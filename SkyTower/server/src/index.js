// Worker entry: routes HTTP and WebSocket requests to the Durable Objects.
import { PROTOCOL, regionOf } from './rules.js';
export { Matchmaker } from './matchmaker.js';
export { Room } from './room.js';
export { Ledger } from './ledger.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
      const q = new URLSearchParams({ type: url.searchParams.get('type') || 'floor', pid: url.searchParams.get('pid') || '' });
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/top?' + q.toString());
      return new Response(res.body, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
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
