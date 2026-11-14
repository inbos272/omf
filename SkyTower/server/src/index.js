// Worker entry: routes HTTP and WebSocket requests to the Durable Objects.
export { Matchmaker } from './matchmaker.js';
export { Room } from './room.js';
export { Ledger } from './ledger.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/health') return Response.json({ ok: true, v: 1 }, { headers: CORS });

    if (url.pathname === '/profile') {
      const stub = env.LEDGER.get(env.LEDGER.idFromName('global'));
      const res = await stub.fetch('https://ledger/get?pid=' + encodeURIComponent(url.searchParams.get('pid') || ''));
      return new Response(res.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/play') {
      const mode = url.searchParams.get('mode') === 'ranked' ? 'ranked' : 'casual';
      return env.MATCH.get(env.MATCH.idFromName(mode)).fetch(req);
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
