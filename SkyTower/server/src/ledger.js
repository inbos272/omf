// Ledger: one Durable Object holding every player's rank points, casual wins, best floor and
// nickname, the nickname registry (one owner per name), and the two public leaderboards
// (top 100 best floor, top 100 peak rank points).
// Players are identified by a random id their device generates (no accounts). Ids never leave
// the server in leaderboard responses, so nobody can read another player's id and play as them.
import { sanitizeName, cleanName, nameKey, tierFor, rpDelta, placementRp, TOP_N, MAX_FLOOR, PLACEMENT_GAMES, HOF_FLOOR, HOF_RP, HOF_MAX } from './rules.js';

const blank = (pid) => ({ pid, name: 'Climber', rp: 0, casualWins: 0, rankedGames: 0, best: 0, peak: 0, nickSet: false, placed: false, placements: [] });
const validPid = (pid) => typeof pid === 'string' && pid.length >= 8 && pid.length <= 64;

export class Ledger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async get(pid) {
    const stored = await this.ctx.storage.get('p:' + pid);
    const p = Object.assign(blank(pid), stored || {});
    // Players from before placement matches existed keep the rank they already earned.
    if (stored && stored.placed === undefined) p.placed = (stored.rankedGames || 0) > 0;
    return p;
  }

  view(p) {
    return { ...p, tier: p.placed ? tierFor(p.rp) : 'unranked', placeN: p.placements.length };
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/get') {
      return Response.json(this.view(await this.get(String(url.searchParams.get('pid') || ''))));
    }
    if (url.pathname === '/apply' && req.method === 'POST') {
      return Response.json(await this.apply(await req.json()));
    }
    if (url.pathname === '/score' && req.method === 'POST') {
      const body = await req.json().catch(() => null);
      const res = body ? await this.score(body) : { ok: false };
      return Response.json(res, { status: res.ok ? 200 : 400 });
    }
    if (url.pathname === '/forget' && req.method === 'POST') {
      const body = await req.json().catch(() => null);
      return Response.json(body ? await this.forget(body.pid) : { ok: false });
    }
    if (url.pathname === '/nick' && req.method === 'POST') {
      const body = await req.json().catch(() => null);
      return Response.json(body ? await this.nick(body) : { ok: false, code: 'invalid' });
    }
    if (url.pathname.startsWith('/admin/')) {
      // Only reachable through the Worker after the admin key check (index.js).
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      const res = await this.admin(url.pathname.slice(7), url.searchParams, body);
      return Response.json(res, { status: res.ok ? 200 : 400 });
    }
    if (url.pathname === '/top') {
      return Response.json(await this.top(url.searchParams.get('type'), String(url.searchParams.get('pid') || '')));
    }
    return new Response('not found', { status: 404 });
  }

  // ---- nicknames ----
  // { pid, name } → { ok, name } | { ok:false, code:'taken'|'invalid' }. A name belongs to the first
  // device that registers it; changing name frees the old one.
  async nick(body) {
    const name = cleanName(body.name);
    if (!validPid(body.pid) || !name) return { ok: false, code: 'invalid' };
    const key = 'n:' + nameKey(name);
    const owner = await this.ctx.storage.get(key);
    if (owner && owner !== body.pid) return { ok: false, code: 'taken' };
    const p = await this.get(body.pid);
    const oldKey = p.nickSet ? 'n:' + nameKey(p.name) : null;
    if (oldKey && oldKey !== key && (await this.ctx.storage.get(oldKey)) === p.pid) await this.ctx.storage.delete(oldKey);
    await this.ctx.storage.put(key, p.pid);
    const renamed = p.name !== name;
    p.name = name;
    p.nickSet = true;
    await this.ctx.storage.put('p:' + p.pid, p);
    if (renamed) await this.renameOnBoards(p);
    return { ok: true, name };
  }

  // Older clients send their name with results instead of registering it. Accept it only while it
  // is free; a registered player's name only changes through nick().
  async adopt(p, raw) {
    if (p.nickSet) return;
    const name = sanitizeName(raw);
    const key = 'n:' + nameKey(name);
    const owner = await this.ctx.storage.get(key);
    if (owner && owner !== p.pid) return;
    if (name === 'Climber') { p.name = name; return; }
    await this.ctx.storage.put(key, p.pid);
    p.name = name;
    p.nickSet = true;
  }

  async renameOnBoards(p) {
    for (const type of ['floor', 'rp']) {
      const list = (await this.ctx.storage.get('top:' + type)) || [];
      const e = list.find((x) => x.pid === p.pid);
      if (e && e.name !== p.name) {
        e.name = p.name;
        await this.ctx.storage.put('top:' + type, list);
      }
    }
    const hof = await this.hallOfFame();
    const e = hof.find((x) => x.pid === p.pid);
    if (e && e.name !== p.name) {
      e.name = p.name;
      await this.ctx.storage.put('hof', hof);
    }
  }

  // ---- match results ----
  // results: { mode, players: [{ pid, name, place }] } → updated profiles by pid
  async apply(results) {
    const out = {};
    for (const r of results.players) {
      const p = await this.get(r.pid);
      const before = p.name;
      await this.adopt(p, r.name);
      let delta = 0, placedNow = false;
      if (results.mode === 'ranked') {
        p.rankedGames++;
        if (!p.placed) {
          // Placement: no points move until the fifth game, which sets the first rating.
          p.placements = [...p.placements, r.place].slice(-PLACEMENT_GAMES);
          if (p.placements.length >= PLACEMENT_GAMES) {
            p.rp = placementRp(p.placements);
            p.placed = placedNow = true;
            delta = p.rp;
          }
        } else {
          delta = rpDelta(r.place, p.rp);
          p.rp += delta;
        }
        if (p.placed && p.rp > p.peak) {
          p.peak = p.rp;
          await this.board('rp', p, p.peak);
          await this.fame(p);
        }
      } else if (r.place === 1) {
        p.casualWins++;
      }
      await this.ctx.storage.put('p:' + r.pid, p);
      if (p.name !== before) await this.renameOnBoards(p);
      out[r.pid] = { ...this.view(p), delta, placedNow };
    }
    return out;
  }

  // { pid, name, best } from a finished solo run. Keeps the higher best.
  async score(body) {
    const best = Math.floor(Number(body.best));
    if (!validPid(body.pid) || !Number.isFinite(best) || best < 0 || best > MAX_FLOOR) return { ok: false };
    const p = await this.get(body.pid);
    const before = p.name;
    await this.adopt(p, body.name);
    const improved = best > p.best;
    if (improved) p.best = best;
    await this.ctx.storage.put('p:' + p.pid, p);
    if (improved) {
      await this.board('floor', p, p.best);
      await this.fame(p);
    }
    if (p.name !== before) await this.renameOnBoards(p);
    return { ok: true, best: p.best, name: p.name };
  }

  // Hall of fame: in for good once the best solo run reaches HOF_FLOOR or ranked peak reaches
  // Master. Later records only update the numbers shown next to the name.
  async fame(p) {
    const floorIn = p.best >= HOF_FLOOR, masterIn = p.peak >= HOF_RP;
    if (!floorIn && !masterIn) return;
    const hof = await this.hallOfFame();
    let e = hof.find((x) => x.pid === p.pid);
    if (!e) {
      if (hof.length >= HOF_MAX) return;
      e = { pid: p.pid, name: p.name, floor: 0, rp: 0, t: Date.now() };
      hof.push(e);
    }
    e.name = p.name;
    if (floorIn) e.floor = Math.max(e.floor, p.best);
    if (masterIn) e.rp = Math.max(e.rp, p.peak);
    await this.ctx.storage.put('hof', hof);
  }

  // Seeded once from the leaderboards, so records set before the hall of fame existed count too.
  async hallOfFame() {
    let hof = await this.ctx.storage.get('hof');
    if (Array.isArray(hof)) return hof;
    hof = [];
    const byPid = {};
    for (const [type, min, field] of [['floor', HOF_FLOOR, 'floor'], ['rp', HOF_RP, 'rp']]) {
      for (const e of (await this.ctx.storage.get('top:' + type)) || []) {
        if (e.v < min) continue;
        const h = byPid[e.pid] || (byPid[e.pid] = { pid: e.pid, name: e.name, floor: 0, rp: 0, t: e.t });
        h[field] = e.v;
        h.t = Math.min(h.t, e.t);
      }
    }
    hof = Object.values(byPid).sort((a, b) => a.t - b.t).slice(0, HOF_MAX);
    await this.ctx.storage.put('hof', hof);
    return hof;
  }

  // A player reset their progress in the game: erase everything the server knows about them —
  // profile, rank, nickname claim, leaderboard rows and hall-of-fame entry. Only the device that
  // holds the (secret, random) id can ask for this.
  async forget(pid) {
    if (!validPid(pid)) return { ok: false };
    const stored = await this.ctx.storage.get('p:' + pid);
    if (stored && stored.nickSet) {
      const key = 'n:' + nameKey(stored.name);
      if ((await this.ctx.storage.get(key)) === pid) await this.ctx.storage.delete(key);
    }
    const p = { pid };
    await this.board('floor', p, 0);
    await this.board('rp', p, 0);
    const hof = await this.hallOfFame();
    const i = hof.findIndex((e) => e.pid === pid);
    if (i >= 0) { hof.splice(i, 1); await this.ctx.storage.put('hof', hof); }
    await this.ctx.storage.delete('p:' + pid);
    return { ok: true, existed: !!stored };
  }

  // ---- admin ----
  // Find a player by device id or by (registered) nickname.
  async findPid(q) {
    if (q.pid && validPid(q.pid)) return q.pid;
    if (q.name) return (await this.ctx.storage.get('n:' + nameKey(q.name))) || null;
    return null;
  }

  async admin(op, params, body) {
    const q = { pid: body.pid || params.get('pid'), name: body.name || params.get('name') };
    if (op === 'export') {
      const all = {};
      for (const [k, v] of await this.ctx.storage.list()) all[k] = v;
      return { ok: true, at: Date.now(), data: all };
    }
    if (op === 'reset') {
      // what: 'floor' | 'rp' (new ranked season: everyone back to placement) | 'hof'
      const what = body.what;
      if (what === 'floor') await this.ctx.storage.put('top:floor', []);
      else if (what === 'hof') await this.ctx.storage.put('hof', []);
      else if (what === 'rp') {
        let n = 0;
        for (const [k, p] of await this.ctx.storage.list({ prefix: 'p:' })) {
          Object.assign(p, { rp: 0, peak: 0, placed: false, placements: [] });
          await this.ctx.storage.put(k, p);
          n++;
        }
        await this.ctx.storage.put('top:rp', []);
        return { ok: true, what, players: n };
      } else return { ok: false, code: 'what' };
      return { ok: true, what };
    }
    const pid = await this.findPid(q);
    if (!pid) return { ok: false, code: 'not-found' };
    const p = await this.get(pid);
    if (op === 'player' && !body.set) return { ok: true, player: this.view(p) };
    if (op === 'player') {
      // body.set: any of rp, peak, best, casualWins, rankedGames, placed
      const s = body.set;
      for (const k of ['rp', 'peak', 'best', 'casualWins', 'rankedGames']) {
        if (s[k] !== undefined && Number.isFinite(+s[k]) && +s[k] >= 0) p[k] = Math.floor(+s[k]);
      }
      if (s.placed !== undefined) p.placed = !!s.placed;
      if (s.rp !== undefined && s.peak === undefined) p.peak = Math.max(p.peak, p.rp);
      await this.ctx.storage.put('p:' + pid, p);
      await this.board('floor', p, p.best);
      await this.board('rp', p, p.placed ? p.peak : 0);
      await this.fame(p);
      return { ok: true, player: this.view(p) };
    }
    if (op === 'remove') {
      // Off every board and out of the hall of fame; with reset:true their records are zeroed too.
      await this.board('floor', p, 0);
      await this.board('rp', p, 0);
      const hof = await this.hallOfFame();
      const i = hof.findIndex((e) => e.pid === pid);
      if (i >= 0) { hof.splice(i, 1); await this.ctx.storage.put('hof', hof); }
      if (body.reset) {
        Object.assign(p, { best: 0, peak: 0, rp: 0 });
        await this.ctx.storage.put('p:' + pid, p);
      }
      return { ok: true, removed: p.name };
    }
    if (op === 'rename') {
      const res = await this.nick({ pid, name: body.newName });
      return res.ok ? { ok: true, name: res.name } : res;
    }
    return { ok: false, code: 'op' };
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
    if (type === 'hof') {
      const hof = await this.hallOfFame();
      const p = validPid(pid) ? await this.get(pid) : blank('');
      return {
        type: 'hof',
        top: [],
        need: { floor: HOF_FLOOR, rp: HOF_RP },
        hof: hof.map((e) => ({ name: e.name, floor: e.floor, rp: e.rp, t: e.t, me: e.pid === pid })),
        me: { best: p.best, peak: p.peak, in: hof.some((e) => e.pid === pid) },
      };
    }
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
