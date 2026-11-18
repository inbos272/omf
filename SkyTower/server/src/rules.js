// Pure game rules shared by the Durable Objects and the browser tests (no Cloudflare APIs here).

// Bump when the client/server messages change; the game refuses a server on another version.
export const PROTOCOL = 2;
export const ROOM_SIZE = 5;
export const AI_WAIT_MS = 3000;       // after the last human finishes, wait this long for AI results
export const FILL_AFTER_MS = 10000;   // wait this long for humans, then fill with AI
export const JOIN_MS = 4000;          // time for matched players to connect to the room
export const COUNTDOWN_MS = 3600;     // same 3-2-1-GO as the AI race
export const RACE_MS = 90000;
export const GRACE_MS = 8000;         // late results still accepted
export const RANKED_UNLOCK = 5;       // casual wins needed for ranked
export const PLACE_RP = [40, 20, 5, -10, -20];
export const TOP_N = 100;             // leaderboard length
export const MAX_FLOOR = 100000;      // best-floor submissions above this are rejected
export const PLACEMENT_GAMES = 5;     // ranked games before a first tier is given
export const PLACEMENT_RP = 450;      // rating used to pair and pick AI for players still in placement

export const TIERS = [
  { id: 'bronze', rp: 0 }, { id: 'silver', rp: 300 }, { id: 'gold', rp: 700 },
  { id: 'platinum', rp: 1200 }, { id: 'diamond', rp: 1800 }, { id: 'master', rp: 2500 },
];

export function tierFor(rp) {
  let t = TIERS[0];
  for (const x of TIERS) if (rp >= x.rp) t = x;
  return t.id;
}

export function rpDelta(place, rp) {
  const d = PLACE_RP[place - 1] ?? 0;
  return rp + d < 0 ? -rp : d;
}

// Same curve as the client's S.aiSkillBand, driven by the room's average RP.
export function aiSkillForRp(rp, r) {
  const level = Math.min(8, Math.floor(rp / 300) + 1);
  const lo = Math.min(0.75, 0.35 + level * 0.05), hi = Math.min(0.98, 0.6 + level * 0.05);
  return { skill: lo + (hi - lo) * r, aggro: Math.min(0.75, 0.2 + level * 0.05) };
}

export function sanitizeName(s) {
  const clean = cleanName(s);
  return clean || 'Climber';
}
export function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
}
// Two nicknames clash when they look the same: case, width (ＡＢ vs AB) and spaces are ignored.
export function nameKey(s) {
  return cleanName(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// Placement: after PLACEMENT_GAMES ranked games the average finish decides the first tier.
// Each place is worth [100, 75, 50, 25, 0] points; the average maps to
// Gold 700–850 (avg ≥ 75, i.e. mostly 1st–2nd), Silver 300–650 (avg ≥ 40), otherwise Bronze 0–250.
export function placementRp(places) {
  const PTS = [100, 75, 50, 25, 0];
  const avg = places.reduce((s, p) => s + (PTS[p - 1] ?? 0), 0) / Math.max(1, places.length);
  if (avg >= 75) return 700 + Math.round(((avg - 75) / 25) * 150);
  if (avg >= 40) return 300 + Math.round(((avg - 40) / 35) * 350);
  return Math.round((avg / 40) * 250);
}

// Cloudflare region hint for a match room, from where its players connect (request.cf).
export function regionOf(cf) {
  if (!cf) return '';
  const lon = Number(cf.longitude), c = cf.continent;
  if (c === 'NA') return lon < -100 ? 'wnam' : 'enam';
  if (c === 'SA') return 'sam';
  if (c === 'EU') return lon > 20 ? 'eeur' : 'weur';
  if (c === 'AF') return 'afr';
  if (c === 'OC') return 'oc';
  if (c === 'AS') return lon < 60 ? 'me' : 'apac';
  return '';
}
export function majorityRegion(list) {
  const n = {};
  let best = '', bestN = 0;
  for (const r of list) if (r) { n[r] = (n[r] || 0) + 1; if (n[r] > bestN) { best = r; bestN = n[r]; } }
  return best;
}

// Disconnected players last, then higher floor, then who reached it first.
export function orderResults(entries) {
  return entries.slice().sort((a, b) =>
    (a.dc ? 1 : 0) - (b.dc ? 1 : 0) || (b.floor || 0) - (a.floor || 0) || (a.floorT ?? 1e9) - (b.floorT ?? 1e9) || a.slot - b.slot);
}

// Decide whether the queue can start a room now.
// queue: [{ pid, rp, joined }] oldest first. Returns { players, ai } or null.
export function pickGroup(queue, now, mode) {
  if (!queue.length) return null;
  const oldest = queue[0];
  // Players near the longest-waiting one come first (a far-away player means a laggy race).
  const far = (e) => (oldest.region && e.region && e.region !== oldest.region ? 1 : 0);
  const rest = queue.slice(1).sort((a, b) => far(a) - far(b)
    || (mode === 'ranked' ? Math.abs(a.rp - oldest.rp) - Math.abs(b.rp - oldest.rp) : a.joined - b.joined));
  const group = [oldest, ...rest.slice(0, ROOM_SIZE - 1)];
  if (group.length === ROOM_SIZE) return { players: group, ai: 0 };
  if (now - oldest.joined >= FILL_AFTER_MS) return { players: group, ai: ROOM_SIZE - group.length };
  return null;
}

export function makeToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Lowest connected human slot hosts the AI rivals.
export function chooseHost(roster, connectedSlots) {
  let host = -1;
  for (const r of roster) if (!r.ai && connectedSlots.has(r.slot) && (host < 0 || r.slot < host)) host = r.slot;
  return host;
}
