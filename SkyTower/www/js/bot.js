// Autoplayer: drives AI rivals in the race, and powers balancing tests and `?bot=0.8` soak runs.
(function () {
  'use strict';
  const S = window.SKY;
  S.Bot = class {
    // skill 0..1 = reaction speed and aim; aggro 0..1 = how often it charges into nearby rivals.
    constructor(skill, seed, aggro) {
      this.skill = skill;
      this.aggro = aggro || 0;
      this.rng = S.mulberry(seed || 7);
      this.out = { move: 0, jump: false };
      this.wait = 0;
      this.cur = 0;
      this.wasAir = false;
      this.launched = false;
      this.chargeT = 0;
      this.chargeDir = 0;
      this.reach = 0.85;
    }

    update(sim, dt, body) {
      const p = body || sim.p, o = this.out, k = p.perk;
      if (p.grounded) this.cur = p.ground.floor;
      else if (p.forced) {
        if (!this.launched) {
          const pad = sim.findGolden(this.cur + 1);
          if (pad && pad.type === S.PT.JUMP && pad.y <= p.y + 0.5) this.cur++;
        }
        this.launched = true;
      } else if (this.launched && p.vy <= 0) {
        // Coming down from a jump pad: aim for the highest reachable golden platform below the feet.
        this.launched = false;
        let f = this.cur;
        for (const q of sim.plats) {
          if (q.side || q.state === 2 || q.type === S.PT.JUMP || q.y >= p.y - 0.3 || q.floor <= f) continue;
          if (Math.abs(S.wrapD(q.x - p.x)) - q.hw < 4) f = q.floor;
        }
        this.cur = f - 1;
      }
      if (p.grounded) this.launched = false;

      const t = sim.findGolden(this.cur + 1);
      if (!t) { o.move = 0; o.jump = false; return o; }
      const dx = S.wrapD(t.x - p.x), dir = Math.sign(dx), adx = Math.abs(dx);

      if (!p.grounded) {
        this.wasAir = true;
        o.move = adx > 0.4 ? dir : 0;
        // Falling short of the target with an air jump left: release, then press again.
        const wantAir = p.airJ > 0 && p.vy < -2 && !p.forced && t.y > p.y - 0.4 && adx < 9;
        o.jump = wantAir ? !o.jump : p.vy > 0 || (k.glide && p.vy < 0 && adx > t.hw + 0.5);
        return o;
      }

      if (this.wasAir) {
        this.wasAir = false;
        const base = 0.42 - 0.34 * this.skill;
        this.wait = base * (0.6 + this.rng() * 0.8);
        // Weaker bots misjudge distances now and then; strong ones almost never do.
        const miss = (1 - this.skill) * (1 - this.skill) * 0.35;
        this.reach = (0.8 + this.skill * 0.1) + (this.rng() < miss ? 0.3 : 0);
      }

      if (this.chargeT > 0) {
        this.chargeT -= dt;
        o.move = this.chargeDir;
        o.jump = false;
        return o;
      }
      if (this.aggro > 0 && p.ground.state === 0 && this.rng() < this.aggro * dt * 1.5) {
        for (const b of sim.bodies) {
          if (b === p || b.dead || b.ground !== p.ground) continue;
          const bx = S.wrapD(b.x - p.x);
          if (Math.abs(bx) < 3.5) {
            this.chargeT = 0.45;
            this.chargeDir = Math.sign(bx) || 1;
            break;
          }
        }
      }

      this.wait -= dt;
      if (this.wait > 0 && p.ground.state === 0) { o.move = 0; o.jump = false; return o; }
      if (t.state === 2) { o.move = 0; o.jump = false; return o; }
      o.move = adx > t.hw * 0.4 ? dir : 0;
      const edge = adx - t.hw + 0.1;
      o.jump = edge <= S.reachFor(t.y - p.y) * this.reach && !o.jump;
      return o;
    }
  };
})();
