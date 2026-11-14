// Pure game rules shared by the Durable Objects and the browser tests (no Cloudflare APIs here).

export const ROOM_SIZE = 5;
export const FILL_AFTER_MS = 10000;   // wait this long for humans, then fill with AI
export const JOIN_MS = 4000;          // time for matched players to connect to the room
export const COUNTDOWN_MS = 3600;     // same 3-2-1-GO as the AI race
export const RACE_MS = 90000;
export const GRACE_MS = 8000;         // late results still accepted
export const RANKED_UNLOCK = 5;       // casual wins needed for ranked
export const PLACE_RP = [40, 20, 5, -10, -20];

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
  const clean = String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
  return clean || 'Climber';
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
  if (mode === 'ranked') {
    // Closest ratings to the longest-waiting player.
    const near = queue.slice(1).sort((a, b) => Math.abs(a.rp - oldest.rp) - Math.abs(b.rp - oldest.rp));
    const group = [oldest, ...near.slice(0, ROOM_SIZE - 1)];
    if (group.length === ROOM_SIZE) return { players: group, ai: 0 };
    if (now - oldest.joined >= FILL_AFTER_MS) return { players: group, ai: ROOM_SIZE - group.length };
    return null;
  }
  if (queue.length >= ROOM_SIZE) return { players: queue.slice(0, ROOM_SIZE), ai: 0 };
  if (now - oldest.joined >= FILL_AFTER_MS) return { players: queue.slice(), ai: ROOM_SIZE - queue.length };
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
