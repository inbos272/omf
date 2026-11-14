// DOM screens: menus, HUD, race board, shop, settings, language. Game flow lives in main.js.
(function () {
  'use strict';
  const S = window.SKY;
  const t = (k, v) => S.t(k, v);
  const $ = (id) => document.getElementById(id);
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M9.5 18.5L3.6 12.6l2.5-2.5 3.4 3.4 8.4-8.4 2.5 2.5z"/></svg>';
  const VOL_KEYS = ['master', 'bgm', 'jump', 'land', 'coin', 'collapse', 'warn', 'over', 'fx'];
  const VOL_PREVIEW = { jump: 'jump', land: 'land', coin: 'coin', collapse: 'collapse', warn: 'warn', over: 'over', fx: 'pad', master: 'ui' };
  const MEDAL = ['🥇', '🥈', '🥉', '4', '5'];
  const rgb = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

  class UI {
    constructor(G) {
      this.G = G;
      this.thumbs = {};
      this.coll = { mode: 'custom', tab: 'skin', sel: null };
      this.toastT = 0;
      this.popT = 0;
      this.lastHud = {};
      this.race = null;
      this._bind();
      this._buildVolumes();
      this._buildLangs($('sLang'), false);
      this._buildLangs($('langList'), true);
    }

    show(id, keepHud) {
      for (const el of document.querySelectorAll('.screen')) {
        if (keepHud && el.id === 'hud') continue;
        el.classList.toggle('hidden', el.id !== id);
      }
    }
    overlay(id, on) { $(id).classList.toggle('hidden', !on); }

    _bind() {
      const G = this.G;
      // Unlock audio on the first interaction anywhere (iOS requires a user gesture).
      const unlock = () => G.audio.unlock();
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
      document.addEventListener('click', (e) => { if (e.target.closest('button')) G.audio.play('ui'); }, true);

      $('btnPlay').onclick = () => G.startRun();
      $('btnVersus').onclick = () => G.openVersus();
      $('btnVsClose').onclick = () => this.overlay('versus', false);
      $('vsAi').onclick = () => { this.overlay('versus', false); G.startRace(); };
      $('vsCasual').onclick = () => G.startOnline('casual');
      $('vsRanked').onclick = () => G.startOnline('ranked');
      $('btnMtCancel').onclick = () => G.cancelOnline();
      $('btnElev').onclick = () => this.openElevator();
      $('btnElevClose').onclick = () => this.overlay('elevator', false);
      $('btnNickSave').onclick = () => {
        const n = S.cleanNick($('sNick').value);
        if (!n) { $('sNick').value = S.Save.data.nick; return; }
        S.Save.data.nick = n;
        S.Save.save();
        $('sNick').value = n;
        this.toast(t('set.nickSaved'), 1400);
      };
      $('btnCustom').onclick = () => this.openColl('custom');
      $('btnShop').onclick = () => this.openColl('shop');
      $('btnSettings').onclick = () => this.openSettings();
      $('btnPause').onclick = () => G.pause();
      $('btnResume').onclick = () => G.resumeWithCountdown();
      $('btnRestart').onclick = () => G.restart();
      $('btnPauseSettings').onclick = () => this.openSettings();
      $('btnQuit').onclick = () => G.toMenu(true);
      $('btnAgain').onclick = () => G.startRun();
      $('btnOverMenu').onclick = () => G.toMenu(false);
      $('btnRaceAgain').onclick = () => G.again();
      $('btnRaceMenu').onclick = () => G.toMenu(false);
      $('btnCollBack').onclick = () => G.toMenu(false);
      $('btnCollAction').onclick = () => this.collAction();
      $('btnSetClose').onclick = () => this.closeSettings();
      $('btnReset').onclick = () => this.overlay('confirm', true);
      $('btnResetNo').onclick = () => this.overlay('confirm', false);
      $('btnResetYes').onclick = () => {
        S.Save.reset();
        this.thumbs = {};
        this.overlay('confirm', false);
        G.applyLoadout();
        this.refreshMenu();
        this.closeSettings();
      };

      const st = () => S.Save.data.settings;
      const wire = (id, key, after) => {
        const el = $(id);
        el.onchange = () => {
          st()[key] = el.checked;
          S.Save.save();
          if (after) after();
        };
      };
      wire('sSwap', 'swap', () => G.applyControls());
      wire('sOne', 'oneHand', () => G.applyControls());
      wire('sHaptic', 'haptics', () => { if (st().haptics) G.vibrate(20); });
      wire('sShake', 'shake', () => G.applyControls());
      if (!navigator.vibrate) $('rowHaptic').classList.add('hidden');
      for (const b of $('sQuality').children) {
        b.onclick = () => {
          st().quality = b.dataset.q;
          S.Save.save();
          G.applyQuality();
          this._syncSettings();
        };
      }

      // Turning the character by dragging the empty area of the customize screen.
      const drag = $('dragArea');
      let lastX = null;
      drag.addEventListener('pointerdown', (e) => { lastX = e.clientX; drag.setPointerCapture(e.pointerId); });
      drag.addEventListener('pointermove', (e) => {
        if (lastX === null) return;
        G.dragYaw += (e.clientX - lastX) * 0.016;
        lastX = e.clientX;
      });
      const end = () => { lastX = null; };
      drag.addEventListener('pointerup', end);
      drag.addEventListener('pointercancel', end);
    }

    // ---- language ----
    _buildLangs(box, first) {
      for (const L of S.LANGS) {
        const b = document.createElement('button');
        b.textContent = L.name;
        b.dataset.lang = L.id;
        b.onclick = () => {
          this.G.setLanguage(L.id);
          if (first) this.G.languageChosen();
        };
        box.appendChild(b);
      }
    }

    showLanguagePick() {
      const suggested = S.detectLang();
      for (const b of $('langList').children) b.classList.toggle('on', b.dataset.lang === suggested);
      this.show('langPick');
    }

    applyLanguage() {
      S.applyI18n();
      for (const b of $('sLang').children) b.classList.toggle('on', b.dataset.lang === S.lang);
      for (const b of $('langList').children) b.classList.toggle('on', b.dataset.lang === S.lang);
      this.refreshMenu();
      this.lastHud = {};
      if (!$('coll').classList.contains('hidden')) this.renderColl();
    }

    _buildVolumes() {
      const list = $('volList');
      const G = this.G;
      for (const key of VOL_KEYS) {
        const row = document.createElement('label');
        row.className = 'vol';
        row.innerHTML = `<span data-i18n="vol.${key}"></span><input type="range" min="0" max="100" step="5" data-vol="${key}"><output></output>`;
        list.appendChild(row);
        const input = row.querySelector('input'), out = row.querySelector('output');
        input.oninput = () => {
          const v = +input.value / 100;
          S.Save.data.settings.vol[key] = v;
          out.textContent = input.value;
          G.audio.vol[key] = v;
          G.audio.applyVolumes();
        };
        input.onchange = () => {
          S.Save.save();
          G.audio.unlock();
          if (VOL_PREVIEW[key]) G.audio.play(VOL_PREVIEW[key], 0.7);
        };
      }
    }

    _syncSettings() {
      const st = S.Save.data.settings;
      for (const input of document.querySelectorAll('[data-vol]')) {
        input.value = Math.round(st.vol[input.dataset.vol] * 100);
        input.nextElementSibling.textContent = input.value;
      }
      $('sSwap').checked = st.swap;
      $('sOne').checked = st.oneHand;
      $('sHaptic').checked = st.haptics;
      $('sShake').checked = st.shake;
      for (const b of $('sQuality').children) b.classList.toggle('on', b.dataset.q === st.quality);
      for (const b of $('sLang').children) b.classList.toggle('on', b.dataset.lang === S.lang);
      $('sNick').value = S.Save.data.nick;
    }

    openSettings() {
      this._syncSettings();
      this.overlay('settings', true);
    }
    closeSettings() {
      this.overlay('settings', false);
    }

    refreshMenu() {
      const d = S.Save.data;
      $('mBest').textContent = S.fl(d.best);
      $('mCoins').textContent = d.coins.toLocaleString();
      $('mVersusSub').textContent = t('menu.versusSub');
    }

    nameOf(b) {
      return b.human ? S.Save.data.nick : b.name || S.nameOf('skin', b.skin);
    }

    // ---- versus sheet ----
    // st: { server: 'none' | 'checking' | 'offline' | 'ok' }
    versus(st) {
      const d = S.Save.data;
      const lv = Math.min(d.raceWins, 9) + 1;
      $('vsAiSub').textContent = t('vs.aiSub', { lv, n: d.raceWins });
      const online = st.server === 'ok';
      $('vsCasual').disabled = !online;
      $('vsCasualSub').textContent = t('vs.casualSub', { n: d.casualWins });
      const unlocked = d.casualWins >= S.RANKED_UNLOCK;
      $('vsRanked').disabled = !online || !unlocked;
      const tier = S.tierFor(d.rp);
      $('vsRankIcon').textContent = unlocked ? '🏆' : '🔒';
      $('vsRankIcon').style.color = tier.col;
      $('vsRankedSub').textContent = unlocked ? t('vs.rankedSub', { tier: t('tier.' + tier.id), rp: d.rp }) : t('vs.locked', { n: d.casualWins });
      $('vsRankedSub').style.color = unlocked ? tier.col : '';
      $('vsStatus').textContent = st.server === 'none' ? t('vs.noServer') : st.server === 'offline' ? t('vs.offline') : st.server === 'checking' ? t('vs.checking') : '';
      this.overlay('versus', true);
    }

    matching(mode, phase, n, fillIn) {
      $('mtTitle').textContent = t(mode === 'ranked' ? 'vs.ranked' : 'vs.casual');
      $('mtCount').textContent = phase === 'joining' ? '' : t('mt.count', { n: n || 1 });
      $('mtSub').textContent = phase === 'joining' ? t('mt.joining') : phase === 'error' ? t('mt.failed') : fillIn > 0 ? t('mt.fill', { s: Math.ceil(fillIn / 1000) }) : t('mt.searching');
      $('btnMtCancel').classList.toggle('hidden', phase === 'joining');
      this.overlay('versus', false);
      this.overlay('matching', true);
    }

    // ---- elevator ----
    elevatorButton(show) {
      if (this.lastHud.elev === show) return;
      this.lastHud.elev = show;
      $('btnElev').classList.toggle('hidden', !show);
    }

    openElevator() {
      const d = S.Save.data, list = $('elevList');
      list.textContent = '';
      for (const e of S.ELEVATOR) {
        const b = document.createElement('button');
        b.className = 'elev-row';
        b.disabled = d.coins < e.price;
        b.innerHTML = '<b></b><span><i class="coin"></i> <em></em></span>';
        b.firstChild.textContent = S.fl(e.floor);
        b.querySelector('em').textContent = e.price.toLocaleString();
        b.onclick = () => { this.overlay('elevator', false); this.G.elevator(e.floor); };
        list.appendChild(b);
      }
      $('elevCoins').textContent = d.coins.toLocaleString();
      this.overlay('elevator', true);
    }

    elevatorCounter(f) {
      const el = $('elevCounter');
      if (f === null) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      $('elevFloor').textContent = f;
    }

    // ---- HUD ----
    hudReset(mode, abilityId) {
      this.lastHud = {};
      const race = mode !== 'solo';
      $('hud').classList.toggle('racing', race);
      $('hud').classList.toggle('online', mode === 'casual' || mode === 'ranked'); // no pausing a live match
      this.elevatorButton(false);
      this.elevatorCounter(null);
      $('bestTag').style.opacity = 0;
      $('banner').classList.remove('show');
      $('toast').classList.remove('on');
      $('pop').classList.remove('show');
      $('lavaSlow').classList.remove('on');
      $('lavaGlow').style.opacity = 0;
      $('countdown').textContent = '';
      $('countdown').classList.remove('go');
      $('hAbility').textContent = '';
      this.abilityId = abilityId;
      if (!race) {
        $('raceBoard').textContent = '';
        $('tags').textContent = '';
        this.race = null;
      }
    }

    hud(floor, coins, shields) {
      const L = this.lastHud;
      if (L.floor !== floor) {
        const el = $('hFloor');
        el.textContent = floor;
        el.classList.toggle('long', floor >= 100);
        if (L.floor !== undefined) {
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
        }
        L.floor = floor;
        const next = S.MILESTONES.find((m) => m.floor > floor);
        let prev = 0;
        for (const m of S.MILESTONES) if (m.floor <= floor) prev = m.floor;
        if (next) {
          $('hGoalFill').style.width = (((floor - prev) / (next.floor - prev)) * 100).toFixed(1) + '%';
          $('hGoal').textContent = t('hud.next', { f: next.floor, n: next.floor - floor });
        } else {
          $('hGoalFill').style.width = '100%';
          $('hGoal').textContent = t('hud.allDone');
        }
      }
      if (L.coins !== coins) {
        $('hCoins').textContent = coins.toLocaleString();
        L.coins = coins;
      }
      const ab = this.abilityId;
      const key = ab + ':' + shields;
      if (L.ab !== key) {
        L.ab = key;
        const el = $('hAbility');
        el.textContent = ab ? S.abIcon(ab) + (S.ABILITIES[ab].perk.shields ? ' ×' + shields : '') : '';
        el.title = ab ? S.abName(ab) : '';
        el.classList.toggle('hidden', !ab);
      }
    }

    bestTag(pr) {
      const el = $('bestTag');
      if (!pr) {
        if (this.lastHud.tag) { el.style.opacity = 0; this.lastHud.tag = false; }
        return;
      }
      const x = pr[0] * window.innerWidth, y = (1 - pr[1]) * window.innerHeight;
      el.style.transform = `translate(${Math.round(x - 32)}px,${Math.round(y - 30)}px)`;
      if (!this.lastHud.tag) { el.style.opacity = 1; this.lastHud.tag = true; }
    }

    lava(warnAmt, slow) {
      const L = this.lastHud;
      const w = Math.round(warnAmt * 20) / 20;
      if (L.warn !== w) { $('lavaGlow').style.opacity = w; L.warn = w; }
      if (L.slow !== slow) { $('lavaSlow').classList.toggle('on', slow); L.slow = slow; }
    }

    banner(small, big, sub) {
      $('bSmall').textContent = small;
      $('bBig').textContent = big;
      $('bSub').textContent = sub || '';
      const b = $('banner');
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
    }

    toast(text, ms) {
      const el = $('toast');
      el.textContent = text;
      el.classList.add('on');
      clearTimeout(this.toastT);
      this.toastT = setTimeout(() => el.classList.remove('on'), ms || 2200);
    }

    // Short shout above the player: "Stomp!", "Overtake!".
    pop(text, color) {
      const el = $('pop');
      el.textContent = text;
      el.style.color = color || '';
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }

    countdown(text, go) {
      const el = $('countdown');
      if (el.textContent === text) return;
      el.textContent = text;
      el.classList.toggle('go', !!go);
      if (text) {
        el.classList.remove('tick');
        void el.offsetWidth;
        el.classList.add('tick');
      }
    }

    // ---- race HUD ----
    raceStart(bodies) {
      const board = $('raceBoard'), tags = $('tags');
      board.textContent = '';
      tags.textContent = '';
      this.race = { rows: {}, tags: {}, timer: '', rank: 0 };
      for (const b of bodies) {
        const row = document.createElement('div');
        row.className = 'rb-row' + (b.human ? ' me' : '');
        const dot = document.createElement('i');
        dot.style.background = rgb(b.skin.body);
        const name = document.createElement('span');
        name.className = 'rb-name';
        name.textContent = this.nameOf(b);
        const fl = document.createElement('b');
        fl.textContent = '0';
        row.append(dot, name, fl);
        board.appendChild(row);
        this.race.rows[b.id] = { row, fl, last: -1, rank: -1, dead: false };
        if (!b.human) {
          const tag = document.createElement('div');
          tag.className = 'tag';
          tag.innerHTML = '<span class="tag-ab"></span><span class="tag-name"></span>';
          tag.firstChild.textContent = b.remote && b.name ? '🌐' : S.abIcon(b.ab);
          tag.lastChild.textContent = this.nameOf(b);
          tag.style.borderColor = rgb(b.skin.body);
          tags.appendChild(tag);
          this.race.tags[b.id] = { el: tag, vis: null };
        }
      }
    }

    raceHud(order, timeLeft) {
      const R = this.race;
      if (!R) return;
      const secs = Math.max(0, Math.ceil(timeLeft));
      const txt = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      if (R.timer !== txt) {
        R.timer = txt;
        const el = $('rTimer');
        el.textContent = txt;
        el.classList.toggle('hurry', secs <= 10);
      }
      order.forEach((b, i) => {
        const r = R.rows[b.id];
        if (r.rank !== i) {
          r.rank = i;
          r.row.style.transform = `translateY(${i * 27}px)`;
        }
        if (r.last !== b.floor) { r.last = b.floor; r.fl.textContent = b.floor; }
        if (r.dead !== b.dead) { r.dead = b.dead; r.row.classList.toggle('out', b.dead); }
        if (b.human && R.rank !== i + 1) {
          R.rank = i + 1;
          const el = $('rRank');
          el.textContent = S.rankText(i + 1);
          el.className = 'race-rank r' + (i + 1);
        }
      });
    }

    raceTags(list) {
      const R = this.race;
      if (!R) return;
      const W = window.innerWidth, H = window.innerHeight;
      for (const s of list) {
        const tg = R.tags[s.id];
        if (!tg) continue;
        if (tg.vis !== s.vis) {
          tg.vis = s.vis;
          tg.el.style.opacity = s.vis ? 1 : 0;
        }
        if (s.vis) tg.el.style.transform = `translate(${Math.round(s.x * W)}px,${Math.round((1 - s.y) * H)}px) translate(-50%,-100%)`;
      }
    }

    raceOver(r) {
      $('rrTag').textContent = r.reason === 'time' ? t('race.timeUp') : t('over.tag');
      const title = $('rrTitle');
      title.textContent = r.rank === 1 ? t('race.win') : S.rankText(r.rank);
      title.className = 'race-title r' + r.rank;
      const list = $('rrList');
      list.textContent = '';
      r.order.forEach((b, i) => {
        const li = document.createElement('li');
        li.className = b.human ? 'me' : '';
        const medal = document.createElement('span');
        medal.className = 'medal';
        medal.textContent = MEDAL[i];
        const img = document.createElement('img');
        img.alt = '';
        img.src = this._thumb('skin', b.skin);
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = this.nameOf(b) + (b.ab ? ' ' + S.abIcon(b.ab) : '') + (b.dc ? ' ⚡' : '');
        const fl = document.createElement('b');
        fl.textContent = S.fl(b.floor);
        li.append(medal, img, nm, fl);
        list.appendChild(li);
      });
      $('rrRank').textContent = '+' + r.rankReward;
      $('rrPicked').textContent = '+' + r.picked;
      $('rrEarned').textContent = r.earned.toLocaleString();
      // Ranked: rank-point change and promotions.
      const rp = $('rrRp');
      if (r.rp) {
        rp.classList.remove('hidden');
        const sign = r.rp.delta >= 0 ? '+' : '';
        rp.querySelector('dd').textContent = `${sign}${r.rp.delta} → ${r.rp.rp} RP`;
        rp.querySelector('dd').style.color = r.rp.delta >= 0 ? '#6ee7a8' : '#ff9a9a';
        if (r.rp.tier !== r.rp.prevTier) {
          const up = S.TIERS.findIndex((x) => x.id === r.rp.tier) > S.TIERS.findIndex((x) => x.id === r.rp.prevTier);
          $('rrTag').textContent = t(up ? 'rr.promoted' : 'rr.demoted', { tier: t('tier.' + r.rp.tier) });
        }
      } else rp.classList.add('hidden');
      if (r.note) $('rrTag').textContent = r.note;
      this.overlay('matching', false);
      this.show('raceOver', true);
    }

    // ---- game over ----
    gameOver(r) {
      $('oFloor').textContent = '0';
      const tag = $('oTag');
      tag.textContent = r.newBest ? t('over.record') : t('over.tag');
      tag.classList.toggle('record', r.newBest);
      $('oPicked').textContent = r.picked;
      $('oBonus').textContent = r.bonus;
      $('oEarned').textContent = r.earned.toLocaleString();
      const bar = $('oBar');
      bar.style.width = '0';
      const maxv = Math.max(r.floor, r.prevBest, 1);
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = (r.floor / maxv) * 100 + '%'; }));
      const p = S.fl(r.prevBest);
      let msg;
      if (r.newBest) msg = r.prevBest > 0 ? t('over.cmpNew', { p, d: r.floor - r.prevBest }) : t('over.cmpFirst');
      else if (r.prevBest - r.floor <= 3) msg = r.prevBest === r.floor ? t('over.cmpSame', { p }) : t('over.cmpClose', { d: r.prevBest - r.floor });
      else msg = t('over.cmpBest', { p });
      $('oCompare').textContent = msg;
      const list = $('oRewards');
      list.textContent = '';
      for (const m of r.rewards) {
        const li = document.createElement('li');
        li.textContent = t('over.reward', { f: m.floor, label: S.milestoneLabel(m) });
        list.appendChild(li);
      }
      this.show('over', true);
      const el = $('oFloor'), t0 = performance.now(), dur = Math.min(800, 180 + r.floor * 18);
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(r.floor * (1 - (1 - k) * (1 - k)));
        if (k < 1 && !$('over').classList.contains('hidden')) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // ---- customize / shop ----
    openColl(mode) {
      this.coll.mode = mode;
      this.coll.tab = 'skin';
      this.coll.sel = null;
      this.show('coll');
      this.G.enterCollection();
      this.renderColl();
    }

    _thumb(kind, item) {
      const key = kind + ':' + item.id;
      if (!this.thumbs[key]) this.thumbs[key] = kind === 'skin' ? this.G.scene.thumbnailSkin(item) : this.G.scene.thumbnailTheme(item);
      return this.thumbs[key];
    }

    renderColl() {
      const d = S.Save.data, c = this.coll, G = this.G;
      const isShop = c.mode === 'shop';
      $('collTitle').textContent = isShop ? t('coll.shop') : t('coll.custom');
      $('collCoins').textContent = d.coins.toLocaleString();
      const tabs = $('collTabs');
      tabs.textContent = '';
      const defs = isShop ? ['skin', 'theme', 'reward'] : ['skin', 'theme'];
      for (const id of defs) {
        const b = document.createElement('button');
        b.textContent = t('tab.' + id);
        b.className = c.tab === id ? 'on' : '';
        b.onclick = () => { c.tab = id; c.sel = null; this.renderColl(); };
        tabs.appendChild(b);
      }
      const grid = $('collGrid');
      grid.textContent = '';
      grid.scrollTop = 0;
      const abBox = $('prevAbility');
      abBox.textContent = '';
      if (c.tab === 'reward') {
        this._renderRewards(grid);
        this._collFooter(null, null);
        G.preview.skin = null;
        G.preview.theme = null;
        $('prevName').textContent = t('coll.best', { v: S.fl(d.best) });
        $('prevTag').style.display = 'none';
        return;
      }
      const kind = c.tab;
      const all = kind === 'skin' ? S.SKINS : S.THEMES;
      const owned = kind === 'skin' ? d.skins : d.themes;
      const eq = kind === 'skin' ? d.skin : d.theme;
      const items = all.filter((it) => (isShop ? !owned.includes(it.id) : owned.includes(it.id)));

      if (!c.sel || !items.some((i) => i.id === c.sel)) c.sel = isShop ? (items[0] && items[0].id) : eq;
      for (const it of items) {
        const b = document.createElement('button');
        b.className = 'item' + (it.id === c.sel ? ' sel' : '');
        const name = document.createElement('span');
        name.className = 'n';
        name.textContent = S.nameOf(kind, it);
        const img = document.createElement('img');
        img.alt = '';
        img.src = this._thumb(kind, it);
        b.append(img, name);
        if (kind === 'skin' && it.ab) {
          const icon = document.createElement('span');
          icon.className = 'ab ' + S.TIER_RARITY[S.ABILITIES[it.ab].tier];
          icon.textContent = S.abIcon(it.ab);
          b.appendChild(icon);
        }
        if (isShop) {
          const p = document.createElement('span');
          if (it.milestone) { p.className = 'p m'; p.textContent = t('coll.msPrice', { f: it.milestone }); }
          else { p.className = 'p'; p.innerHTML = '<i class="coin"></i> ' + it.price.toLocaleString(); }
          b.appendChild(p);
        } else if (it.id === eq) {
          const e = document.createElement('span');
          e.className = 'eq';
          e.innerHTML = CHECK;
          b.appendChild(e);
        }
        b.onclick = () => { c.sel = it.id; this.renderColl(); };
        grid.appendChild(b);
      }
      if (!isShop && items.length < all.length) {
        const more = document.createElement('button');
        more.className = 'item more';
        more.textContent = t('coll.more', { n: all.length - items.length });
        more.onclick = () => this.openColl('shop');
        grid.appendChild(more);
      }
      if (isShop && !items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('coll.allOwned');
        grid.appendChild(empty);
      }
      const sel = items.find((i) => i.id === c.sel) || null;
      G.preview.skin = kind === 'skin' && sel ? sel : null;
      G.preview.theme = kind === 'theme' && sel ? sel : null;
      this._collFooter(kind, sel);
      $('prevName').textContent = sel ? S.nameOf(kind, sel) : '';
      const tag = $('prevTag');
      if (sel && sel.rarity) {
        tag.style.display = '';
        tag.textContent = t('rar.' + sel.rarity);
        tag.style.background = S.RARITY[sel.rarity].col;
      } else tag.style.display = 'none';
      if (kind === 'skin' && sel) {
        const ab = sel.ab;
        const head = document.createElement('b');
        head.textContent = ab ? S.abIcon(ab) + ' ' + S.abName(ab) : S.abName(null);
        if (ab) head.className = S.TIER_RARITY[S.ABILITIES[ab].tier];
        const desc = document.createElement('span');
        desc.textContent = S.abDesc(ab);
        abBox.append(head, desc);
      }
    }

    _renderRewards(grid) {
      const d = S.Save.data;
      for (const m of S.MILESTONES) {
        const r = document.createElement('div');
        const done = d.claimed.includes(m.floor);
        r.className = 'rw' + (done ? ' done' : '');
        const a = document.createElement('b');
        a.textContent = S.fl(m.floor);
        const label = document.createElement('span');
        label.textContent = S.milestoneLabel(m);
        const e = document.createElement('em');
        e.textContent = done ? t('rw.done') : t('rw.todo');
        r.append(a, label, e);
        grid.appendChild(r);
      }
    }

    _collFooter(kind, sel) {
      const btn = $('btnCollAction'), d = S.Save.data, c = this.coll;
      const foot = btn.parentElement;
      this.collSel = sel;
      this.collKind = kind;
      foot.classList.toggle('hidden', !sel);
      if (!sel) return;
      btn.disabled = false;
      if (c.mode === 'shop') {
        if (sel.milestone) {
          btn.textContent = t('coll.reach', { f: sel.milestone });
          btn.disabled = true;
        } else if (d.coins < sel.price) {
          btn.textContent = t('coll.short', { n: (sel.price - d.coins).toLocaleString() });
          btn.disabled = true;
        } else {
          btn.textContent = t('coll.buy', { n: sel.price.toLocaleString() });
        }
      } else {
        const eq = kind === 'skin' ? d.skin : d.theme;
        btn.textContent = sel.id === eq ? t('coll.equipped') : t('coll.equip');
        btn.disabled = sel.id === eq;
      }
    }

    collAction() {
      const d = S.Save.data, sel = this.collSel, kind = this.collKind, G = this.G, c = this.coll;
      if (!sel) return;
      if (c.mode === 'shop') {
        if (sel.milestone || d.coins < sel.price) return;
        d.coins -= sel.price;
        (kind === 'skin' ? d.skins : d.themes).push(sel.id);
        if (kind === 'skin') d.skin = sel.id; else d.theme = sel.id;
        G.audio.play('buy');
        G.vibrate(30);
        c.sel = null;
      } else {
        if (kind === 'skin') d.skin = sel.id; else d.theme = sel.id;
        G.audio.play('reward');
      }
      S.Save.save();
      G.applyLoadout();
      this.renderColl();
    }
  }
  S.UI = UI;
})();
