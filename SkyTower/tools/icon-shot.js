// How tools/icon-src.png and tools/icon-src-maskable.png were rendered (with the game's own engine).
// 1. Serve the folder (tools/serve.ps1) and open, in a 640×640 window:
//      http://localhost:8790/www/index.html?mute&bot=0.8&noserver
// 2. Paste this into the browser console. It saves the two PNGs as downloads.
// 3. Copy them into tools/ and run tools/make-icons.ps1.
(async () => {
  const S = window.SKY, G = S.game, sim = G.sim, p = sim.p, C = S.CFG, R = C.R;
  const W = (x) => ((x % C.CIRC) + C.CIRC) % C.CIRC;
  let T = performance.now();
  const run = (n) => { for (let i = 0; i < n; i++) { T += 16.7; G.tick(T); } };
  document.getElementById('ui').style.display = 'none';
  S.Save.data.settings.quality = 'high';
  G.applyQuality();
  G.startRun();
  run(360);                                           // let the bot climb into the sky world
  G.bot = null;
  sim.step = () => {};                                // freeze physics; the character still animates
  const x0 = p.x, y0 = p.y;
  // A clean stage around the character: launch platform below-right, target above-left,
  // a coin trail, lava glowing underneath.
  for (const q of sim.plats) if (Math.abs(q.y - y0) < 40) q.y -= 400;
  for (const c of sim.coins) if (Math.abs(c.y - y0) < 40) c.y -= 400;
  const spare = sim.plats.filter((q) => q.y < y0 - 300);
  [[2.6, -2.4, 2.0, 0], [-3.4, 2.7, 1.9, 0], [3.0, 5.6, 1.7, 0], [-1.2, 9.0, 1.7, 2], [5.6, -4.8, 1.9, 1]].forEach((L, i) =>
    Object.assign(spare[i], { x: W(x0 + L[0]), y: y0 + L[1], hw: L[2], type: L[3], state: 0, spawn: 1, t: 0 }));
  const coins = sim.coins.filter((c) => c.y < y0 - 300);
  [[-1.5, 1.7], [-2.3, 2.3], [1.4, 1.5]].forEach((cc, i) => { coins[i].x = W(x0 + cc[0]); coins[i].y = y0 + cc[1]; });
  sim.lavaY = y0 - 4.8;
  p.vx = -5; p.vy = 4.5; p.grounded = false;          // mid-jump, turned towards the camera
  run(40);
  const eyesOpen = () => { G.scene.anim.blink = 99; G.scene.anim.blinkT = 0; };
  // Camera: 0.27 rad to the lower left of the character, 3.9 out from the tower, looking up.
  const shot = async (tanV, name) => {
    const th = p.x / R, e = th - 0.27, a = th + 0.03;
    G.iconView = { eye: [Math.sin(e) * (R + 3.9), y0 - 0.9, Math.cos(e) * (R + 3.9)], at: [Math.sin(a) * R, y0 + 0.85, Math.cos(a) * R], tanV };
    eyesOpen();
    run(1);
    const link = document.createElement('a');
    link.href = document.getElementById('gl').toDataURL('image/png');
    link.download = name;
    link.click();
  };
  await shot(0.6, 'icon-src.png');
  await shot(0.86, 'icon-src-maskable.png');      // wider: fits a launcher's circular crop
})();
