// Online server address (the deployed Cloudflare Worker). Leave it empty to disable Casual and
// Ranked; AI races always work offline.
window.SKY_SERVER_URL = 'https://sky-tower.polar-dino-entertainment.workers.dev';

// Ads. See README "광고 (AdMob) 연동". Until a provider is set up, 'placeholder' shows a stand-in
// ad screen so every ad button already works.
window.SKY_ADS = {
  provider: 'placeholder', // 'placeholder' | 'admob' (Capacitor app) | 'h5' (web / PWA / TWA)
  admob: {
    // Google's official test unit IDs. Replace with your own before release, and set testing: false.
    rewardedId: 'ca-app-pub-3940256099942544/5224354917',
    interstitialId: 'ca-app-pub-3940256099942544/1033173712',
    testing: true,
  },
  h5: {
    client: '', // your AdSense publisher id, e.g. 'ca-pub-1234567890123456'
    testing: true,
  },
};
