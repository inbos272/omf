// Ledger: one Durable Object holding every player's rank points and casual wins.
// Players are identified by a random id their device generates (no accounts).
import { sanitizeName, tierFor, rpDelta } from './rules.js';

const blank = (pid) => ({ pid, name: 'Climber', rp: 0, casualWins: 0, rankedGames: 0 });

export class Ledger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async get(pid) {
    return (await this.ctx.storage.get('p:' + pid)) || blank(pid);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/get') {
      const p = await this.get(String(url.searchParams.get('pid') || ''));
      return Response.json({ ...p, tier: tierFor(p.rp) });
    }
    if (url.pathname === '/apply' && req.method === 'POST') {
      return Response.json(await this.apply(await req.json()));
    }
    return new Response('not found', { status: 404 });
  }

  // results: { mode, players: [{ pid, name, place }] } → updated profiles by pid
  async apply(results) {
    const out = {};
    for (const r of results.players) {
      const p = await this.get(r.pid);
      p.name = sanitizeName(r.name);
      let delta = 0;
      if (results.mode === 'ranked') {
        delta = rpDelta(r.place, p.rp);
        p.rp += delta;
        p.rankedGames++;
      } else if (r.place === 1) {
        p.casualWins++;
      }
      await this.ctx.storage.put('p:' + r.pid, p);
      out[r.pid] = { ...p, delta, tier: tierFor(p.rp) };
    }
    return out;
  }
}
