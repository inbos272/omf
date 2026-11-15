// Ads facade. The game only calls Ads.rewarded(placement) and Ads.interstitial(placement).
// Providers (window.SKY_ADS.provider in config.js):
//   'admob'       — native app built with Capacitor + @capacitor-community/admob
//   'h5'          — web / PWA / TWA: Google H5 Games Ads (AdSense Ad Placement API)
//   'placeholder' — default until ads are connected: an in-game stand-in screen
// Any provider that is missing or fails falls back to the placeholder, so buttons always work.
(function () {
  'use strict';
  const S = window.SKY;
  const t = (k, v) => S.t(k, v);
  const cfg = () => window.SKY_ADS || { provider: 'placeholder' };
  const admob = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;

  // The game's own music and effects pause while an ad is on screen.
  function quiet(on) {
    const a = S.game && S.game.audio;
    if (!a) return;
    if (on) a.suspend();
    else if (!document.hidden) a.resume();
  }

  function placeholder(reward) {
    return new Promise((resolve) => {
      const box = document.getElementById('adScreen');
      const timer = document.getElementById('adTimer');
      const btn = document.getElementById('btnAdClose');
      let left = reward ? 5 : 3;
      btn.textContent = reward ? t('ad.claim') : t('ad.close');
      btn.disabled = true;
      timer.textContent = t('ad.wait', { s: left });
      box.classList.remove('hidden');
      const iv = setInterval(() => {
        left--;
        if (left > 0) { timer.textContent = t('ad.wait', { s: left }); return; }
        clearInterval(iv);
        timer.textContent = '';
        btn.disabled = false;
      }, 1000);
      btn.onclick = () => {
        if (btn.disabled) return;
        box.classList.add('hidden');
        resolve(reward);
      };
    });
  }

  function loadH5(client) {
    if (document.getElementById('h5ads')) return;
    const s = document.createElement('script');
    s.id = 'h5ads';
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    s.crossOrigin = 'anonymous';
    s.dataset.adFrequencyHint = '30s';
    if (cfg().h5.testing) s.dataset.adbreakTest = 'on';
    document.head.appendChild(s);
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
    window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
  }

  const Ads = {
    provider: 'placeholder',
    busy: false,

    async init() {
      const c = cfg();
      try {
        if (c.provider === 'admob' && admob()) {
          await admob().initialize({ initializeForTesting: !!(c.admob && c.admob.testing) });
          this.provider = 'admob';
        } else if (c.provider === 'h5' && c.h5 && c.h5.client) {
          loadH5(c.h5.client);
          this.provider = 'h5';
        }
      } catch (e) {
        this.provider = 'placeholder';
      }
    },

    // Resolves true only if the player watched the ad through (reward earned).
    async rewarded(placement) {
      if (this.busy) return false;
      this.busy = true;
      quiet(true);
      try {
        if (this.provider === 'admob') return await this._admobRewarded();
        if (this.provider === 'h5') return await this._h5('reward', placement);
        return await placeholder(true);
      } catch (e) {
        return false;
      } finally {
        this.busy = false;
        quiet(false);
      }
    },

    async interstitial(placement) {
      if (this.busy) return;
      this.busy = true;
      quiet(true);
      try {
        if (this.provider === 'admob') await this._admobInterstitial();
        else if (this.provider === 'h5') await this._h5('next', placement);
        else await placeholder(false);
      } catch (e) {
        /* no ad available: carry on */
      } finally {
        this.busy = false;
        quiet(false);
      }
    },

    // @capacitor-community/admob: resolve when the ad is closed (or fails), never hang the game.
    _admobRewarded() {
      const A = admob(), c = cfg().admob;
      return new Promise(async (resolve) => {
        let earned = false, finished = false;
        const subs = [];
        const done = () => {
          if (finished) return;
          finished = true;
          clearTimeout(guard);
          subs.forEach((h) => h && h.remove && h.remove());
          resolve(earned);
        };
        const guard = setTimeout(done, 120000);
        subs.push(await A.addListener('onRewardedVideoAdReward', () => { earned = true; }));
        subs.push(await A.addListener('onRewardedVideoAdDismissed', done));
        subs.push(await A.addListener('onRewardedVideoAdFailedToShow', done));
        subs.push(await A.addListener('onRewardedVideoAdFailedToLoad', done));
        try {
          await A.prepareRewardVideoAd({ adId: c.rewardedId, isTesting: !!c.testing });
          await A.showRewardVideoAd();
        } catch (e) {
          done();
        }
      });
    },

    _admobInterstitial() {
      const A = admob(), c = cfg().admob;
      return new Promise(async (resolve) => {
        let finished = false;
        const subs = [];
        const done = () => {
          if (finished) return;
          finished = true;
          clearTimeout(guard);
          subs.forEach((h) => h && h.remove && h.remove());
          resolve();
        };
        const guard = setTimeout(done, 60000);
        subs.push(await A.addListener('interstitialAdDismissed', done));
        subs.push(await A.addListener('interstitialAdFailedToShow', done));
        subs.push(await A.addListener('interstitialAdFailedToLoad', done));
        try {
          await A.prepareInterstitial({ adId: c.interstitialId, isTesting: !!c.testing });
          await A.showInterstitial();
        } catch (e) {
          done();
        }
      });
    },

    _h5(type, name) {
      return new Promise((resolve) => {
        let earned = false;
        const o = { type, name, adBreakDone: () => resolve(type === 'reward' ? earned : true) };
        if (type === 'reward') {
          o.beforeReward = (showAdFn) => showAdFn();
          o.adViewed = () => { earned = true; };
          o.adDismissed = () => { earned = false; };
        }
        window.adBreak(o);
      });
    },
  };
  S.Ads = Ads;
})();
