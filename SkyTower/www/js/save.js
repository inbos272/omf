// Local-only persistence. Keeps a second copy so an interrupted write cannot wipe progress.
(function () {
  'use strict';
  const S = window.SKY;
  const KEY = 'omf_skytower_v1', BACKUP = KEY + '_bak';

  const defaults = () => ({
    v: 1, coins: 0, best: 0, runs: 0, lang: null, raceWins: 0, racePlays: 0,
    nick: '', pid: '', casualWins: 0, rp: 0, tier: 'bronze', // online numbers are a cache of the server's
    skins: ['default'], themes: ['classic'], skin: 'default', theme: 'classic',
    claimed: [], seen: {},
    settings: {
      vol: { master: 0.9, bgm: 0.55, jump: 0.8, land: 0.7, coin: 0.75, collapse: 0.8, warn: 0.8, over: 0.8, fx: 0.8 },
      quality: 'auto', haptics: true, swap: false, oneHand: false, shake: true,
    },
  });

  function parse(raw) {
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && typeof o.coins === 'number' ? o : null;
    } catch (e) {
      return null;
    }
  }
  function read(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }

  // Random device id for online play (no account). Falls back when crypto.randomUUID is missing.
  S.newId = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  };
  // Same rules as the server: 1–12 visible characters, no control characters or angle brackets.
  S.cleanNick = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);

  S.Save = {
    data: defaults(),
    load() {
      const o = parse(read(KEY)) || parse(read(BACKUP));
      const d = defaults();
      if (o) {
        Object.assign(d, o);
        d.settings = Object.assign(defaults().settings, o.settings || {});
        d.settings.vol = Object.assign(defaults().settings.vol, (o.settings && o.settings.vol) || {});
      }
      if (!d.skins.includes('default')) d.skins.push('default');
      if (!d.themes.includes('classic')) d.themes.push('classic');
      if (!S.SKINS.some((s) => s.id === d.skin && d.skins.includes(s.id))) d.skin = 'default';
      if (!S.THEMES.some((t) => t.id === d.theme && d.themes.includes(t.id))) d.theme = 'classic';
      if (!d.nick) d.nick = 'Climber' + String(Math.floor(1000 + Math.random() * 9000));
      if (!d.pid) d.pid = S.newId();
      this.data = d;
      return d;
    },
    save() {
      try {
        const s = JSON.stringify(this.data);
        window.localStorage.setItem(KEY, s);
        window.localStorage.setItem(BACKUP, s);
      } catch (e) { /* storage full or disabled: the session keeps working in memory */ }
    },
    reset() {
      const old = this.data;
      this.data = defaults();
      // Progress reset, not the language, name or online identity (rank lives on the server).
      for (const k of ['settings', 'lang', 'nick', 'pid', 'casualWins', 'rp', 'tier']) this.data[k] = old[k];
      this.save();
    },
  };
})();
