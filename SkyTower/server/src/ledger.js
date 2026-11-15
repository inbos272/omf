// Ledger: one Durable Object holding every player's rank points, casual wins and best floor,
// plus the two public leaderboards (top 100 best floor, top 100 peak rank points).
// Players are identified by a random id their device generates (no accounts). Ids never leave
// the server in leaderboard responses, so nobody can read another player's id and play as them.
import { sanitizeName, tierFor, rpDelta, TOP_N, MAX_FLOOR } from './rules.js';

const blank = (pid) => ({ pid, name: 'Climber', rp: 0, casualWins: 0, rankedGames: 0, best: 0, peak: 0 });
const validPid = (pid) => typeof pid === 'string' && pid.length >= 8 && pid.length <= 64;

export class Ledger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async get(pid) {
    return Object.assign(blank(pid), (await this.ctx.storage.get('p:' + pid)) || {});
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
    if (url.pathname === '/score' && req.method === 'POST') {
      const body = await req.json().catch(() => null);
      const res = body ? await this.score(body) : { ok: false };
      return Response.json(res, { status: res.ok ? 200 : 400 });
    }
    if (url.pathname === '/top') {
      return Response.json(await this.top(url.searchParams.get('type'), String(url.searchParams.get('pid') || '')));
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
        if (p.rp > p.peak) {
          p.peak = p.rp;
          await this.board('rp', p, p.peak);
        }
      } else if (r.place === 1) {
        p.casualWins++;
      }
      await this.ctx.storage.put('p:' + r.pid, p);
      out[r.pid] = { ...p, delta, tier: tierFor(p.rp) };
    }
    return out;
  }

  // { pid, name, best } from a finished solo run. Keeps the higher best; renames everywhere.
  async score(body) {
    const best = Math.floor(Number(body.best));
    if (!validPid(body.pid) || !Number.isFinite(best) || best < 0 || best > MAX_FLOOR) return { ok: false };
    const p = await this.get(body.pid);
    const name = sanitizeName(body.name);
    const renamed = name !== p.name;
    p.name = name;
    const improved = best > p.best;
    if (improved) p.best = best;
    await this.ctx.storage.put('p:' + p.pid, p);
    if (improved || renamed) await this.board('floor', p, p.best);
    if (renamed && p.peak > 0) await this.board('rp', p, p.peak);
    return { ok: true, best: p.best };
  }

  // Insert / update one player on a leaderboard (sorted by value, earlier holder wins ties).
  async board(type, p, v) {
    const key = 'top:' + type;
    const list = (await this.ctx.storage.get(key)) || [];
    const i = list.findIndex((e) => e.pid === p.pid);
    if (i >= 0 && list[i].v === v) {
      list[i].name = p.name; // same score: keep the place, just rename
    } else {
      if (i >= 0) list.splice(i, 1);
      if (v > 0) list.push({ pid: p.pid, name: p.name, v, t: Date.now() });
      list.sort((a, b) => b.v - a.v || a.t - b.t);
      if (list.length > TOP_N) list.length = TOP_N;
    }
    await this.ctx.storage.put(key, list);
  }

  async top(type, pid) {
    const t = type === 'rp' ? 'rp' : 'floor';
    const list = (await this.ctx.storage.get('top:' + t)) || [];
    const p = validPid(pid) ? await this.get(pid) : blank('');
    const idx = list.findIndex((e) => e.pid === pid);
    return {
      type: t,
      top: list.map((e) => ({ name: e.name, v: e.v, me: e.pid === pid })),
      me: { v: t === 'rp' ? p.peak : p.best, rank: idx >= 0 ? idx + 1 : null },
    };
  }
}
