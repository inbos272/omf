// Game flow: state machine, fixed-step loop, solo runs, AI races, rewards, adaptive quality.
(function () {
  'use strict';
  const S = window.SKY;
  const C = S.CFG;
  const t = (k, v) => S.t(k, v);
  const params = new URLSearchParams(location.search);

  const canvas = document.getElementById('gl');
  const save = S.Save.load();
  S.lang = save.lang || S.detectLang();
  S.applyI18n();

  const G = (S.game = {
    state: 'menu', // menu | play | countdown | raceIntro | paused | dying | revive | waiting | over | coll | elevator | matching
    mode: 'solo',  // solo | race
    dragYaw: 0,
    preview: { skin: null, theme: null },
    env: 0,
    rewards: [],
    dyingT: 0,
    countT: 0,
    raceT: 0,
    goT: 0,
    bot: null,
    ff: false,
    myRank: 0,
  });

  let renderer;
  try {
    renderer = new S.Renderer(canvas);
  } catch (e) {
    console.error(e);
    renderer = { ok: false };
  }
  if (!renderer.ok) {
    document.getElementById('fatal').classList.remove('hidden');
    return;
  }

  const sim = new S.Sim(onSimEvent);
  const scene = (G.scene = new S.Scene(renderer, sim));
  const audio = (G.audio = new S.Sound(save.settings.vol));
  // Automated runs stay silent: without an AudioContext every sound call is a no-op.
  if (params.has('bot') || params.has('mute')) audio.unlock = () => {};
  const ui = (G.ui = new S.UI(G));
  const input = new S.Input({
    root: document.getElementById('hud'),
    move: document.getElementById('ctlMove'),
    jumpZone: document.getElementById('ctlJump'),
    base: document.getElementById('stickBase'),
    knob: document.getElementById('stickKnob'),
    left: document.getElementById('btnLeft'),
    right: document.getElementById('btnRight'),
    jump: document.getElementById('jumpBtn'),
  });
  G.sim = sim;
  G.input = input;

  G.vibrate = (ms) => {
    if (G.bot || !S.Save.data.settings.haptics || !navigator.vibrate) return;
    // Browsers refuse (and log an error) before the first real tap on the page.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try { navigator.vibrate(ms); } catch (e) { /* not allowed here */ }
  };

  G.applyControls = () => {
    const st = S.Save.data.settings;
    input.configure(st.swap, st.oneHand);
    scene.shakeEnabled = st.shake;
  };

  G.setLanguage = (id) => {
    S.lang = id;
    S.Save.data.lang = id;
    S.Save.save();
    ui.applyLanguage();
  };
  G.languageChosen = () => {
    ui.show('menu');
    afterLanguage();
  };
  // First-run order: language → nickname → daily gift.
  function afterLanguage() {
    if (!S.Save.data.nickChosen) ui.showNickPick();
    else G.nickDone();
  }
  G.nickDone = () => {
    if (S.dailyInfo(S.Save.data).can && !params.has('bot')) ui.openDaily();
  };

  // ---------- nickname (unique across players, checked by the server) ----------
  // → 'ok' | 'taken' | 'invalid' | 'empty' | 'local' (saved, server unreachable: checked later)
  G.setNick = async (raw) => {
    const d = S.Save.data, name = S.cleanNick(raw);
    if (!name) return 'empty';
    if (name === d.nick && d.nickOk) { d.nickChosen = true; S.Save.save(); return 'ok'; }
    const res = await net.claimNick(d.pid, name);
    if (res === 'taken' || res === 'invalid') return res;
    d.nick = name;
    d.nickChosen = true;
    d.nickOk = res === 'ok';
    S.Save.save();
    return d.nickOk ? 'ok' : 'local';
  };

  // Make sure the current name is registered; false when someone else owns it (asks for a new one).
  async function ensureNick() {
    const d = S.Save.data;
    if (d.nickOk || !net.configured) return true;
    const res = await net.claimNick(d.pid, d.nick);
    if (res === 'ok') { d.nickOk = true; S.Save.save(); }
    if (res !== 'taken') return true; // offline / old server: nothing to check against
    ui.overlay('versus', false);
    ui.showNickPick('nick.takenNow');
    return false;
  }

  // ---------- adaptive quality ----------
  const adapt = { acc: 0, frames: 0, cool: 3, scale: 1 };
  G.applyQuality = () => {
    const q = S.Save.data.settings.quality;
    adapt.scale = 1;
    adapt.acc = adapt.frames = 0;
    adapt.cool = 3;
    renderer.scale = 1;
    renderer.setQuality(q === 'auto' ? 'medium' : q);
    scene.quality = S.QUALITY[renderer.level].part;
    audio.setLite(renderer.level === 'low');
  };
  function adaptQuality(dt) {
    if (S.Save.data.settings.quality !== 'auto') return;
    adapt.acc += dt;
    adapt.frames++;
    adapt.cool -= dt;
    if (adapt.frames < 50) return;
    const avg = (adapt.acc / adapt.frames) * 1000;
    adapt.acc = adapt.frames = 0;
    if (adapt.cool > 0) return;
    if (avg > 23) {
      if (renderer.level === 'medium' && adapt.scale <= 0.8) {
        renderer.scale = 1;
        renderer.setQuality('low');
        adapt.scale = 1;
        scene.quality = S.QUALITY.low.part;
        audio.setLite(true);
      } else {
        adapt.scale = Math.max(0.6, adapt.scale - 0.15);
        renderer.setScale(adapt.scale);
      }
      adapt.cool = 4;
    } else if (avg < 17.6 && adapt.scale < 1) {
      adapt.scale = Math.min(1, adapt.scale + 0.1);
      renderer.setScale(adapt.scale);
      adapt.cool = 8;
    }
  }

  // ---------- loadout ----------
  const skinById = (id) => S.SKINS.find((s) => s.id === id) || S.SKINS[0];
  const themeById = (id) => S.THEMES.find((x) => x.id === id) || S.THEMES[0];
  G.applyLoadout = () => {
    const d = S.Save.data;
    scene.skin = skinById(d.skin);
    scene.theme = themeById(d.theme);
    audio.vol = d.settings.vol;
    audio.applyVolumes();
  };
  const loadout = () => {
    const skin = skinById(S.Save.data.skin);
    return { skin, ab: skin.ab, perk: S.perkFor(skin.ab) };
  };

  // ---------- flow ----------
  const newSeed = () => (Math.random() * 0x7fffffff) | 0;
  const inRun = () => G.state === 'paused' || G.state === 'countdown' || G.state === 'play' || G.state === 'raceIntro';

  function beginHud(mode) {
    G.mode = mode;
    G.env = 0;
    G.rewards = [];
    G.preview.skin = G.preview.theme = null;
    ui.show('hud');
    ui.hudReset(mode, sim.p.ab);
    input.enabled = true;
    input.reset();
    audio.duck(false);
    audio.setMusicEnv(0);
    audio.setDanger(0);
    if (!audio.musicOn) audio.startMusic(0);
  }

  G.toMenu = (abandon) => {
    if (abandon && G.mode === 'solo' && inRun()) finishRun(false);
    net.close();
    scene.follow = null;
    ui.spectate(null);
    G.state = 'menu';
    G.mode = 'solo';
    G.preview.skin = G.preview.theme = null;
    input.enabled = false;
    input.reset();
    audio.duck(false);
    const seed = newSeed();
    sim.reset(seed, 0, loadout());
    scene.resetRun(seed);
    G.env = 0;
    audio.setMusicEnv(0);
    audio.setDanger(0);
    ui.hudReset('solo', null);
    ui.refreshMenu();
    ui.show('menu');
  };

  G.enterCollection = () => {
    G.state = 'coll';
    G.dragYaw = 0;
  };

  G.startRun = () => {
    audio.unlock();
    if (G.mode === 'solo' && inRun()) finishRun(false); // restarting still banks this run
    const seed = newSeed();
    sim.reset(seed, S.Save.data.best, loadout());
    scene.resetRun(seed);
    S.Save.data.runs++;
    G.revives = 0;
    G.adRevived = false;
    G.coinRevived = false;
    beginHud('solo');
    G.state = 'play';
    updateHud();
  };

  // Four rivals with distinct looks and random abilities. They get stronger with every AI-race win;
  // one of them always sits at the top of the current band.
  function makeRacers(mySkin) {
    const pool = S.SKINS.filter((s) => s.id !== mySkin.id);
    const band = S.aiSkillBand(Math.min(S.Save.data.raceWins, 9));
    const skills = [band.hi];
    for (let i = 1; i < S.RACE.ai; i++) skills.push(band.lo + (band.hi - band.lo) * Math.random());
    const racers = [];
    for (let i = 0; i < S.RACE.ai; i++) {
      const skin = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const ab = S.AI_ABILITIES[Math.floor(Math.random() * S.AI_ABILITIES.length)];
      const skill = skills.splice(Math.floor(Math.random() * skills.length), 1)[0];
      const bot = new S.Bot(skill, newSeed(), band.aggro * (0.6 + Math.random() * 0.6));
      racers.push({ skin, ab, perk: S.perkFor(ab), bot });
    }
    return racers;
  }

  G.startRace = () => {
    audio.unlock();
    const seed = newSeed();
    const lo = loadout();
    sim.reset(seed, 0, Object.assign(lo, { racers: makeRacers(lo.skin) }));
    scene.resetRun(seed);
    beginHud('race');
    ui.raceStart(sim.bodies);
    G.state = 'raceIntro';
    G.countT = 3.6;
    G.raceT = S.RACE.dur;
    G.myRank = 0;
    G.lastCount = 0;
    ui.banner(t('menu.race'), t('race.goal'), t('race.tip'));
  };

  G.restart = () => (G.mode === 'race' ? G.startRace() : G.startRun());
  G.again = () => (online() ? G.startOnline(G.mode) : G.startRace());

  // ---------- elevator ----------
  // via: 'coins' (default) | 'ticket' (daily-gift pass, floor 30) | 'free' (after a rewarded ad)
  const canElevate = () => G.mode === 'solo' && G.state === 'play' && !sim.started && sim.startFloor === 0;
  G.elevator = (f, via) => {
    const e = S.ELEVATOR.find((x) => x.floor === f), d = S.Save.data;
    if (!e || !canElevate()) return;
    if (via === 'ticket') {
      if (f !== 30 || d.tickets.elev30 < 1) return;
      d.tickets.elev30--;
    } else if (via !== 'free') {
      if (d.coins < e.price) return;
      d.coins -= e.price;
    }
    S.Save.save();
    const fromY = sim.p.y;
    sim.reset(sim.seed, d.best, Object.assign(loadout(), { startFloor: f })); // same tower, higher start
    G.state = 'elevator';
    G.elevF = f;
    input.enabled = false;
    input.reset();
    ui.elevatorButton(false);
    scene.elevatorStart(fromY, sim.p.y, sim.p.x);
    audio.play('elevHum');
    G.vibrate(30);
  };

  G.elevatorAd = async () => {
    if (!canElevate()) return;
    input.enabled = false;
    input.reset();
    const ok = await S.Ads.rewarded('elevator_30');
    input.enabled = G.state === 'play';
    if (!ok) { ui.toast(t('ad.fail'), 1800); return; }
    G.elevator(30, 'free');
  };

  function elevatorDone() {
    G.state = 'play';
    input.enabled = true;
    input.reset();
    ui.elevatorCounter(null);
    const e = S.envFor(G.elevF);
    G.env = e;
    scene.setEnv(e, true);
    audio.setMusicEnv(e);
    audio.play('ding');
    ui.banner(S.ENVS[e].en, t('elev.arrive', { f: G.elevF }), t('env.' + S.ENVS[e].id));
    scene.celebrate([0.6, 0.9, 1]);
    updateHud();
  }

  // ---------- versus / online ----------
  const net = (G.net = new S.Net());
  if (params.has('noserver')) net.baseUrl = ''; // tests: never touch the live server
  const online = () => G.mode === 'casual' || G.mode === 'ranked';
  let serverState = 'none';

  G.openVersus = async () => {
    serverState = net.configured ? 'checking' : 'none';
    ui.versus({ server: serverState });
    if (!net.configured) return;
    serverState = await net.health();
    if (serverState === 'ok') {
      const p = await net.profile(S.Save.data.pid);
      if (p) syncProfile(p);
    }
    if (!document.getElementById('versus').classList.contains('hidden')) ui.versus({ server: serverState });
  };

  // The server's numbers replace the local cache (older servers don't send placement fields).
  function syncProfile(p) {
    const d = S.Save.data;
    Object.assign(d, { casualWins: p.casualWins, rp: p.rp, tier: p.tier });
    if (p.placed !== undefined) d.placed = !!p.placed;
    else d.placed = true;
    if (p.placeN !== undefined) d.placeN = p.placeN;
    if (p.nickSet && p.name && p.name === d.nick) d.nickOk = true;
    S.Save.save();
  }

  G.startOnline = async (mode) => {
    if (serverState !== 'ok' || G.state === 'matching' || G.nickBusy) return;
    audio.unlock();
    G.nickBusy = true;
    const nameOk = await ensureNick().finally(() => { G.nickBusy = false; });
    if (!nameOk) return;
    const lo = loadout(), d = S.Save.data;
    G.mode = mode;
    G.state = 'matching';
    ui.matching(mode, 'queue', 1, 0);
    net.find(mode, { pid: d.pid, name: d.nick, skin: lo.skin.id, ab: lo.ab || '' }, {
      queue: (n, fillIn) => { if (G.state === 'matching') ui.matching(mode, 'queue', n, fillIn); },
      hello: (msg) => onlineHello(msg, lo),
      host: () => S.onlineTakeover(sim, net),
      event: (m) => { if (m.k === 'tr') sim.triggerRemote(m.f, !!m.sd); },
      end: (m) => onlineEnd(m),
      error: (code) => {
        if (G.state !== 'matching') return;
        ui.matching(mode, 'error', 0, 0);
        if (code === 'locked') ui.toast(t('mt.locked'), 2400);
      },
      left: (slot) => {
        const b = sim.bodies.find((x) => x.slot === slot && !x.human);
        if (b && G.state !== 'over') ui.toast(t('net.left', { name: ui.nameOf(b) }), 1800);
      },
      lost: () => {
        if (G.state === 'matching') { ui.matching(mode, 'error', 0, 0); return; }
        G.netLost = true;
      },
    });
  };

  G.cancelOnline = () => {
    net.cancel();
    ui.overlay('matching', false);
    G.toMenu(false);
  };

  function onlineHello(msg, lo) {
    ui.matching(G.mode, 'joining', 0, 0);
    const racers = S.onlineRacers(msg, net.slot, net.isHost);
    sim.reset(msg.seed, 0, Object.assign(lo, { racers, online: true, mySlot: net.slot }));
    scene.resetRun(msg.seed);
    beginHud(G.mode);
    ui.overlay('matching', false);
    ui.raceStart(sim.bodies);
    G.state = 'raceIntro';
    G.myRank = 0;
    G.lastCount = 0;
    G.netLost = false;
    G.sentResult = false;
    G.sentAi = false;
    G.endMsg = null;
    ui.banner(t('vs.' + G.mode), t('race.goal'), t('race.tip'));
  }

  // Seconds since the shared start, on the server's clock.
  const onlineElapsed = () => (net.serverNow() - net.startAt) / 1000;

  function sendOnlineResults() {
    const elapsed = onlineElapsed();
    if (!G.sentResult && (sim.dead || elapsed >= S.RACE.dur)) {
      G.sentResult = true;
      net.sendResult(sim.p);
    }
    // Host: report AI as they fall; once every human is out, play the AI race out at high speed
    // (a few ms per frame) and report the results. Returns the race time still to simulate.
    net.settleAi(sim, S.RACE.dur - elapsed, (ais, left) => {
      let tLeft = left;
      fastSteps(() => tLeft <= 0 || !ais.some((b) => !b.dead), () => { tLeft -= C.DT; });
      return tLeft;
    });
  }

  // While out of an online race, the camera follows whoever is leading among the climbers.
  function spectate() {
    let lead = null;
    for (const b of sim.bodies) {
      if (b === sim.p || b.dead) continue;
      if (!lead || b.floor > lead.floor || (b.floor === lead.floor && b.y > lead.y)) lead = b;
    }
    scene.follow = lead;
    ui.spectate(lead ? ui.nameOf(lead) : null);
  }

  // The main loop shows the result (after the fall animation if the player just went down).
  function onlineEnd(m) {
    G.endMsg = m;
  }

  function showOnlineResult() {
    const m = G.endMsg;
    const d = S.Save.data;
    const bySlot = {};
    for (const b of sim.bodies) bySlot[b.slot] = b;
    // Without the server's verdict (connection lost) the local standings can't be trusted —
    // rivals froze at their last snapshot — so nothing is ranked or rewarded beyond coins picked up.
    const unranked = !m || !!m.void;
    const order = m
      ? m.order.map((o) => Object.assign(bySlot[o.slot] || {}, { floor: o.floor, dc: o.dc }))
      : raceOrder();
    const rank = order.indexOf(sim.p) + 1;
    const rankReward = unranked ? 0 : S.RACE.rewards[rank - 1] || 0, picked = sim.coinCount, earned = rankReward + picked;
    scene.follow = null;
    ui.spectate(null);
    d.coins += earned;
    let rp = null;
    const prof = m && m.profiles && m.profiles[net.slot];
    if (prof) {
      if (G.mode === 'ranked') {
        rp = {
          delta: prof.delta, rp: prof.rp, tier: prof.tier, prevTier: d.tier,
          placed: prof.placed !== false, placeN: prof.placeN || 0, placedNow: !!prof.placedNow,
        };
      }
      syncProfile(prof);
    }
    S.Save.save();
    countGame();
    G.state = 'over';
    sim.started = false;
    input.enabled = false;
    input.reset();
    net.close();
    ui.raceOver({ reason: 'time', order, rank, rankReward, picked, earned, rp, unranked, note: !m ? t('net.lost') : m.void ? t('net.void') : '' });
    if (!unranked && rank <= 3) {
      audio.play('reward');
      scene.celebrate(rank === 1 ? [1, 0.82, 0.3] : [0.6, 0.85, 1]);
    }
  }

  G.pause = () => {
    if (online()) return; // the race keeps going for everyone else
    if (G.state !== 'play' && G.state !== 'countdown') return;
    G.state = 'paused';
    input.enabled = false;
    input.reset();
    audio.duck(true);
    document.getElementById('pFloor').textContent = S.fl(sim.floor);
    document.getElementById('pBest').textContent = G.mode === 'race' ? S.rankText(G.myRank || 1) : t('pause.best', { v: S.fl(S.Save.data.best) });
    ui.countdown('');
    ui.overlay('pause', true);
  };

  G.resumeWithCountdown = () => {
    ui.overlay('pause', false);
    G.state = 'countdown';
    G.countT = 1.5;
    input.enabled = true;
    input.reset();
    audio.duck(false);
  };

  // ---------- revive (solo) ----------
  // After a fall the player may come back on the floor they reached: pay coins (pricier the higher
  // the floor; once per run), spend a revive pass, or watch an ad (once per run).
  const REVIVE_T = 8, REVIVE_MIN_FLOOR = 5;
  function reviveOffer() {
    const d = S.Save.data, floor = sim.floor;
    if (G.mode !== 'solo' || floor < REVIVE_MIN_FLOOR) return null;
    const price = S.revivePrice(floor);
    const o = { floor, price, coinUsed: !!G.coinRevived, coinsOk: !G.coinRevived && d.coins >= price, tickets: d.tickets.revive, adOk: !G.adRevived };
    return o.coinsOk || o.tickets || o.adOk ? o : null;
  }

  function endSoloRun() {
    ui.overlay('revive', false);
    G.state = 'over';
    finishRun(true);
  }

  G.reviveWith = async (how) => {
    if (G.state !== 'revive' || G.reviveBusy) return;
    const d = S.Save.data, o = reviveOffer();
    if (!how || !o) return endSoloRun();
    if (how === 'coins' && !o.coinsOk) return;
    if (how === 'ticket' && !o.tickets) return;
    if (how === 'ad') {
      if (!o.adOk) return;
      G.reviveBusy = true;
      const ok = await S.Ads.rewarded('revive');
      G.reviveBusy = false;
      if (G.state !== 'revive') return;
      if (!ok) { ui.toast(t('ad.fail'), 1800); G.revT = Math.max(G.revT, 4); return; }
      G.adRevived = true;
    }
    ui.overlay('revive', false);
    if (!sim.revive()) return endSoloRun(); // nothing to stand on: nothing is charged
    if (how === 'coins') { d.coins -= o.price; G.coinRevived = true; }
    else if (how === 'ticket') d.tickets.revive--;
    S.Save.save();
    G.revives++;
    G.state = 'countdown';
    G.countT = 1.5;
    input.enabled = true;
    input.reset();
    audio.duck(false);
    audio.play('reward');
    ui.banner(S.fl(sim.floor), t('rev.done'), '');
    G.vibrate(50);
    updateHud();
  };

  // ---------- rewarded / between-games ads ----------
  G.tripleCoins = async (btn) => {
    const earned = +btn.dataset.earned || 0;
    if (earned <= 0 || btn.disabled) return;
    btn.disabled = true;
    const ok = await S.Ads.rewarded('triple_coins');
    if (!ok) { btn.disabled = false; ui.toast(t('ad.fail'), 1800); return; }
    const d = S.Save.data;
    d.coins += earned * 2;
    S.Save.save();
    btn.dataset.earned = 0;
    btn.classList.add('hidden');
    document.getElementById(btn.id === 'btnTriple' ? 'oEarned' : 'rrEarned').textContent = (earned * 3).toLocaleString();
    ui.toast(t('ad.tripled', { n: (earned * 2).toLocaleString() }), 2000);
    audio.play('reward');
    scene.celebrate([1, 0.82, 0.3]);
  };

  // Every 7–10 finished games an interstitial plays when the player leaves the result screen.
  const countGame = () => { S.Save.data.gamesSinceAd++; S.Save.save(); };
  G.afterGame = async (next) => {
    if (G.adPending) return;
    const d = S.Save.data;
    if (d.gamesSinceAd >= d.adEvery) {
      G.adPending = true;
      d.gamesSinceAd = 0;
      d.adEvery = S.AD_EVERY[0] + Math.floor(Math.random() * (S.AD_EVERY[1] - S.AD_EVERY[0] + 1));
      S.Save.save();
      await S.Ads.interstitial('between_games');
      G.adPending = false;
    }
    next();
  };

  // ---------- daily gift ----------
  G.claimDaily = () => {
    const d = S.Save.data, info = S.dailyInfo(d);
    if (!info.can) return;
    const r = S.DAILY[info.day];
    d.daily = { last: S.today(), streak: info.streak };
    if (r.coins) d.coins += r.coins;
    if (r.elev30) d.tickets.elev30 += r.elev30;
    if (r.revive) d.tickets.revive += r.revive;
    S.Save.save();
    audio.play('reward');
    scene.celebrate([1, 0.8, 0.3]);
    G.vibrate(40);
    ui.openDaily();
    ui.refreshMenu();
  };

  // ---------- rankings ----------
  const submitBest = () => {
    const d = S.Save.data;
    if (net.configured && d.best > 0) return net.submitScore(d.pid, d.nick, d.best);
    return Promise.resolve(false);
  };
  G.loadRanking = async (type) => {
    if (!net.configured) return { error: t('vs.noServer') };
    await submitBest();
    const res = await net.top(type, S.Save.data.pid);
    if (res === 'outdated') return { error: t('vs.outdated') };
    return res || { error: t('vs.offline') };
  };

  function claimMilestones(floor) {
    const d = S.Save.data;
    for (const m of S.MILESTONES) {
      if (floor < m.floor || d.claimed.includes(m.floor)) continue;
      d.claimed.push(m.floor);
      d.coins += m.coins;
      if (m.skin && !d.skins.includes(m.skin)) d.skins.push(m.skin);
      if (m.theme && !d.themes.includes(m.theme)) d.themes.push(m.theme);
      G.rewards.push(m);
      S.Save.save();
      const items = [];
      if (m.skin) items.push(t('skin.' + m.skin));
      if (m.theme) items.push(t('theme.' + m.theme));
      ui.banner(t('ms.title', { f: m.floor }), t('ms.coins', { n: m.coins.toLocaleString() }), items.length ? t('ms.unlock', { items: items.join(' + ') }) : '');
      audio.play('reward');
      scene.celebrate([1, 0.7, 0.25]);
      G.vibrate(60);
    }
  }

  function finishRun(showResult) {
    const d = S.Save.data;
    const prevBest = d.best;
    const floor = sim.floor;
    // Elevator runs only earn the floor bonus for floors climbed after arriving.
    const picked = sim.coinCount, bonus = Math.round((floor - sim.startFloor) * 2 * sim.p.perk.bonus), earned = picked + bonus;
    d.coins += earned;
    const newBest = floor > prevBest;
    if (newBest) d.best = floor;
    S.Save.save();
    if (newBest) submitBest();
    if (showResult) {
      countGame();
      ui.gameOver({ floor, prevBest, newBest, picked, bonus, earned, rewards: G.rewards });
    }
  }

  const raceOrder = () => sim.bodies.slice().sort((a, b) => b.floor - a.floor || a.floorT - b.floorT || a.id - b.id);

  // Runs simulation steps for at most `budgetMs` of real time; returns true when `done()` holds.
  // Used to play the rest of a race out quickly without freezing the screen in one long frame.
  const FF_BUDGET_MS = 6;
  function fastSteps(done, onStep) {
    const t0 = performance.now();
    G.ff = true;
    while (!done() && performance.now() - t0 < FF_BUDGET_MS) {
      for (let i = 0; i < 30 && !done(); i++) { sim.step(idleInput); onStep(); }
    }
    G.ff = false;
    return done();
  }

  function finishRace(reason) {
    // If the player fell out early, the rest of the race is played out at high speed (a few
    // milliseconds of each frame, see 'settling' in the loop) so every rival gets a real result.
    if (G.raceT > 0 && sim.bodies.some((b) => !b.dead)) {
      G.state = 'settling';
      G.settleReason = reason;
      input.enabled = false;
      input.reset();
      return;
    }
    sim.started = false; // freeze lava and rivals behind the results
    const order = raceOrder();
    const rank = order.indexOf(sim.p) + 1;
    const rankReward = S.RACE.rewards[rank - 1] || 0, picked = sim.coinCount, earned = rankReward + picked;
    const d = S.Save.data;
    d.coins += earned;
    d.racePlays++;
    if (rank === 1) d.raceWins++;
    S.Save.save();
    countGame();
    G.state = 'over';
    input.enabled = false;
    input.reset();
    ui.raceOver({ reason, order, rank, rankReward, picked, earned });
    if (rank <= 3) {
      audio.play('reward');
      scene.celebrate(rank === 1 ? [1, 0.82, 0.3] : [0.6, 0.85, 1]);
    }
  }

  function updateHud() {
    ui.hud(sim.floor, S.Save.data.coins + sim.coinCount, sim.p.shields);
  }

  // ---------- simulation events ----------
  function onSimEvent(name, a, b, body) {
    if (!scene || G.state === 'menu' || G.ff) return;
    scene.onEvent(name, a, b, body);
    if (G.state === 'over') return; // results are showing: visuals only
    const mine = !body || body.human;
    switch (name) {
      case 'jump': if (mine) audio.play('jump'); break;
      case 'airjump': if (mine) audio.play('airjump'); break;
      case 'land':
        if (!mine) break;
        audio.play('land', Math.min(1, b / 30));
        if (a.type && !S.Save.data.seen[a.type]) {
          S.Save.data.seen[a.type] = 1;
          S.Save.save();
          ui.toast(t('hint.' + a.type), 2600);
        }
        break;
      case 'coin': if (mine) { audio.play('coin'); G.vibrate(6); } break;
      case 'pad': if (mine) { audio.play('pad'); G.vibrate(15); } break;
      case 'speed': if (mine) audio.play('speed'); break;
      case 'crumble': if (mine) audio.play('crumble'); break;
      case 'collapse': audio.play('collapse'); break;
      case 'fuse': if (mine) audio.play('fuse'); break;
      case 'boom': audio.play('boom'); G.vibrate(b ? 90 : 25); break;
      case 'beacon': audio.play('beacon'); if (mine) ui.toast(t('hud.beacon'), 1500); break;
      case 'warn': if (a) { audio.play('warn'); G.vibrate(40); } break;
      case 'floor': if (mine) onFloor(a.floor); break;
      case 'shield':
        if (!mine) break;
        audio.play('shield');
        ui.toast(t('hud.shield'), 1600);
        G.vibrate(80);
        break;
      case 'bump':
        if (a.human || body.human) { audio.play('bump', Math.min(1, b / 12)); G.vibrate(25); }
        break;
      case 'stomp':
        if (a.human) { audio.play('stomp'); ui.pop(t('race.stomp')); G.vibrate(30); }
        else if (body.human) { audio.play('bump', 0.8); ui.pop(t('race.stomped'), '#ffb4b4'); G.vibrate(40); }
        break;
      case 'dead':
        if (!mine) break;
        G.state = 'dying';
        G.dyingT = 1.15;
        input.enabled = false;
        input.reset();
        audio.play('over');
        audio.setDanger(0);
        G.vibrate(140);
        break;
    }
  }

  function onFloor(f) {
    const e = S.envFor(f);
    if (e !== G.env) {
      G.env = e;
      const env = S.ENVS[e];
      scene.setEnv(e);
      scene.celebrate([0.5, 0.8, 1]);
      if (!online()) sim.slowT = Math.max(sim.slowT, C.ENV_SLOW_T);
      audio.setMusicEnv(e);
      audio.play('env');
      ui.banner(env.en, t('env.' + env.id), t('env.sub', { f: env.from }));
      G.vibrate(60);
    }
    if (G.mode === 'solo') claimMilestones(f);
  }

  // ---------- main loop ----------
  let last = performance.now(), acc = 0;
  const idleInput = { move: 0, jump: false };

  function frame(now) {
    requestAnimationFrame(frame);
    tick(now);
  }

  function tick(now) {
    const raw = Math.max(0, (now - last) / 1000);
    last = Math.max(now, last);
    const dt = Math.min(raw, 0.1);
    adaptQuality(raw);

    let simDt = 0;
    switch (G.state) {
      case 'play':
      case 'dying':
      case 'waiting':
      case 'menu':
      case 'coll':
      case 'over':
        simDt = dt;
        break;
      case 'elevator':
        if (scene.elevatorTick(dt)) elevatorDone();
        else ui.elevatorCounter(Math.round(scene.elevatorProgress() * G.elevF));
        break;
      case 'countdown':
        G.countT -= dt;
        ui.countdown(G.countT > 0 ? String(Math.ceil(G.countT / 0.5)) : '');
        if (G.countT <= 0) G.state = 'play';
        break;
      case 'raceIntro': {
        G.countT -= dt;
        if (online()) G.countT = (net.startAt - net.serverNow()) / 1000; // everyone starts together
        const n = Math.ceil(G.countT);
        if (G.countT <= 3 && n !== G.lastCount && n > 0) {
          G.lastCount = n;
          audio.play('count');
          ui.countdown(String(n));
        }
        if (G.countT <= 0) {
          sim.started = true;
          G.state = 'play';
          G.goT = 0.8;
          ui.countdown(t('race.go'), true);
          audio.play('go');
          G.vibrate(40);
        }
        break;
      }
    }
    if (G.goT > 0) {
      G.goT -= dt;
      if (G.goT <= 0) ui.countdown('');
    }

    let inp = idleInput;
    if (G.state === 'play') inp = G.bot ? G.bot.update(sim, C.DT) : input.poll();

    const isOnline = online() && sim.online;
    // (not while the host is fast-forwarding the AI: that runs ahead of the shared clock on purpose)
    if (isOnline && sim.started && G.state !== 'over' && net.ffLeft === undefined) {
      // Lava follows the shared clock, so every client sees it at the same height.
      sim.runTime = Math.max(0, onlineElapsed() - Math.floor((acc + simDt) / C.DT) * C.DT);
    }
    acc += simDt;
    while (acc >= C.DT) {
      sim.step(inp);
      acc -= C.DT;
      if (G.mode === 'race' && (G.state === 'play' || G.state === 'dying')) G.raceT -= C.DT;
      if (G.bot && G.state === 'play') inp = G.bot.update(sim, C.DT);
    }
    if (isOnline && G.state !== 'over') {
      net.update(sim, dt, (b) => scene.onEvent('dead', null, 0, b));
      G.raceT = S.RACE.dur - onlineElapsed();
      sendOnlineResults();
      // Out of the race but the others are still climbing: spectate until the server reports.
      if (G.state === 'play' && G.raceT <= 0) G.state = 'waiting';
      if (G.state === 'waiting') spectate();
      if (G.state !== 'over' && G.state !== 'raceIntro' && (G.endMsg || G.netLost || G.raceT < -12)) {
        if (G.state === 'dying' && !G.netLost && G.dyingT > 0) { /* let the fall play out first */ }
        else showOnlineResult();
      }
    }

    if (G.mode === 'race' && G.state === 'play' && G.raceT <= 0) finishRace('time');
    if (G.state === 'settling') {
      const over = () => G.raceT <= 0 || !sim.bodies.some((b) => !b.dead);
      if (fastSteps(over, () => { G.raceT -= C.DT; })) finishRace(G.settleReason);
    }
    if (G.state === 'dying') {
      G.dyingT -= dt;
      if (G.dyingT <= 0) {
        if (G.mode === 'race') finishRace('dead');
        else if (online()) {
          G.state = 'waiting';
          ui.toast(t('net.waiting'), 4000);
        } else {
          const o = reviveOffer();
          if (o) {
            G.state = 'revive';
            G.revT = REVIVE_T;
            ui.revive(o);
          } else {
            G.state = 'over';
            finishRun(true);
          }
        }
      }
    }
    if (G.state === 'revive' && !S.Ads.busy) {
      G.revT -= dt;
      ui.reviveTimer(G.revT / REVIVE_T);
      if (G.revT <= 0) G.reviveWith(null);
    }

    if (G.mode === 'solo') ui.elevatorButton(G.state === 'play' && !sim.started && sim.startFloor === 0);

    const paused = G.state === 'paused' || G.state === 'countdown';
    const inPlay = G.state === 'play' || G.state === 'dying' || G.state === 'waiting' || G.state === 'revive' || paused || G.state === 'over' || G.state === 'raceIntro';
    scene.render(paused ? 0 : dt, paused ? 1 : acc / C.DT, {
      camMode: G.state === 'coll' ? (G.preview.theme ? 'theme' : 'custom') : G.state === 'menu' ? 'menu' : G.state === 'elevator' ? 'elevator' : 'play',
      skin: G.preview.skin,
      theme: G.preview.theme,
      dragYaw: G.dragYaw,
      view: G.iconView || null,
    });

    if (inPlay) {
      // Once the run is banked its coins are already in the wallet; refreshing would count them twice.
      if (G.state !== 'over') updateHud();
      const gap = sim.p.y - sim.lavaY;
      const live = G.state === 'play';
      audio.setDanger(live ? Math.max(0, Math.min(1, 1 - gap / 12)) : 0);
      ui.lava(live ? Math.max(0, Math.min(1, 1 - (gap - 1) / 8)) : 0, sim.slowT > 0 && !sim.dead);
      ui.bestTag(live && G.mode === 'solo' ? scene.bestScreen : null);
      if (G.mode !== 'solo' && G.state !== 'over') {
        const order = raceOrder();
        ui.raceHud(order, G.raceT);
        ui.raceTags(scene.tagScreens);
        const rank = order.indexOf(sim.p) + 1;
        if (G.myRank && rank < G.myRank && live) {
          audio.play('overtake');
          ui.pop(rank === 1 ? t('race.lead') : t('race.overtake'), rank === 1 ? '#ffd23f' : '');
        }
        G.myRank = rank;
      }
    }
  }

  // ---------- lifecycle ----------
  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 120));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      G.pause();
      audio.suspend();
      S.Save.save();
    } else {
      last = performance.now();
      audio.resume();
    }
  });
  window.addEventListener('pagehide', () => S.Save.save());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (G.state === 'play') G.pause();
      else if (G.state === 'paused') G.resumeWithCountdown();
    }
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Native shell integrations, only present inside the Capacitor build.
  const cap = window.Capacitor && window.Capacitor.Plugins;
  if (cap) {
    if (cap.StatusBar && cap.StatusBar.hide) cap.StatusBar.hide().catch(() => {});
    if (cap.App && cap.App.addListener) {
      cap.App.addListener('backButton', () => {
        const open = (id) => !document.getElementById(id).classList.contains('hidden');
        if (S.Ads.busy) return; // an ad is showing: it closes itself
        if (open('nickPick')) return; // a nickname is required before going on
        if (open('confirm')) ui.overlay('confirm', false);
        else if (open('revive')) G.reviveWith(null);
        else if (open('daily')) ui.overlay('daily', false);
        else if (open('ranking')) ui.overlay('ranking', false);
        else if (open('elevator')) ui.closeElevator();
        else if (open('versus')) ui.overlay('versus', false);
        else if (open('settings')) ui.closeSettings();
        else if (G.state === 'play') G.pause();
        else if (G.state === 'paused') G.resumeWithCountdown();
        else if (G.state === 'coll' || G.state === 'over') G.toMenu(false);
        else if (cap.App.minimizeApp) cap.App.minimizeApp();
      });
      cap.App.addListener('pause', () => G.pause());
    }
  } else if (('serviceWorker' in navigator && location.protocol === 'https:') || params.has('sw')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Boot
  G.applyQuality();
  G.applyControls();
  G.applyLoadout();
  const seed0 = newSeed();
  sim.reset(seed0, 0, loadout());
  scene.resetRun(seed0);
  ui.applyLanguage();
  S.Ads.init();
  G.revives = 0;
  if (!save.lang) ui.showLanguagePick();
  else if (params.get('mode') === 'race') G.startRace(); // home-screen shortcut
  else {
    ui.show('menu');
    afterLanguage(); // nickname if never chosen, then today's gift
    // A name saved while offline gets its duplicate check now.
    if (save.nickChosen && !save.nickOk && net.configured) {
      net.claimNick(save.pid, save.nick).then((res) => {
        if (res === 'ok') { S.Save.data.nickOk = true; S.Save.save(); }
        else if (res === 'taken' && G.state === 'menu') ui.showNickPick('nick.takenNow');
      });
    }
  }

  if (params.has('bot')) {
    G.bot = new S.Bot(parseFloat(params.get('bot')) || 0.8, 3);
    G.tick = tick;
  }

  requestAnimationFrame(frame);
})();
