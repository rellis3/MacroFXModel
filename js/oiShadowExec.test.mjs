// OI SHADOW EXECUTOR — the JS port of oi_bot/engine.py used to paper-trade the CME and
// Cboe zone plans side by side. Pins the cases engine_test.py pins (zone_id, max-pain
// live stop, guard-wall ladder, TP cap, minRR skip, one-shot), then the bar simulator:
// touch fills, gap fills, stop-first, priming, guards, chain reset, max hold.
//   node js/oiShadowExec.test.mjs
import { zoneId, alreadyEntered, shouldFire, maxpainStop, makeSpec, emptyBook, syncPlan, stepBar, summarize } from './oiShadowExec.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const SELL_FADE = { mode: 'fade', side: 'sell', level: 4300, entry: 4300, sl: 4305, tp1: 4200, tp2: 4100, regime: 'PIN' };
const BUY_FADE = { mode: 'fade', side: 'buy', level: 4100, entry: 4100, sl: 4095, tp1: 4200, regime: 'PIN' };
const BUY_BREAK = { mode: 'break', side: 'buy', level: 4300, entry: 4320, sl: 4295, tp1: null, tp2: null, regime: 'BREAKOUT' };
const MAXPAIN = { mode: 'maxpain', side: 'sell', level: 4200, entry: 4260, sl: 4310, tp1: 4200, regime: 'PIN' };
const SPX_MP = { mode: 'maxpain', side: 'buy', level: 7701.5, entry: 7684.25, sl: 7667, tp1: 7701.5, minDist: 11.060831,
  slGuardWall: 7650, slFrac: 1.0, slFloor: 5, slDist: 17.25, regime: 'BREAKOUT' };

console.log('[engine port — same cases as engine_test.py]');
ok('zone_id is mode_side_level', zoneId(SELL_FADE) === 'fade_sell_4300');
ok('zone_id drops float noise like Python :g', zoneId({ mode: 'fade', side: 'buy', level: 2976.9500000000003 }) === 'fade_buy_2976.95');
ok('zone_id keeps 6 significant digits like :g', zoneId({ mode: 'maxpain', side: 'sell', level: 30898.2412 }) === 'maxpain_sell_30898.2');
ok('fade armed above fires on the rise to entry', shouldFire(SELL_FADE, 4300, 4200) && !shouldFire(SELL_FADE, 4299, 4200));
ok('fade armed below fires on the fall to entry', shouldFire(BUY_FADE, 4100, 4200) && !shouldFire(BUY_FADE, 4101, 4200));
ok('touch tolerance counts a near miss', shouldFire(SELL_FADE, 4298.5, 4200, 2));
ok('maxpain with minDist re-validates the extension at live px', shouldFire(SPX_MP, 7690, 7684) && !shouldFire(SPX_MP, 7695, 7684));
ok('guard wall behind px → the pin-fraction cap sets the stop (61.5)', near(maxpainStop(SPX_MP, 7640), 7640 - 61.5));
ok('protective guard wall nearer than the cap wins', near(maxpainStop({ ...SPX_MP, slGuardWall: 7630 }, 7640), 7640 - 15));
ok('sell side mirrors', near(maxpainStop({ ...SPX_MP, side: 'sell', level: 7600, slGuardWall: null }, 7640), 7680));
ok('floored at slFloor', near(maxpainStop({ ...SPX_MP, slGuardWall: null }, 7701), 7696));
ok('no ingredients → null (plan stop kept)', maxpainStop(MAXPAIN, 4258) === null);
const NQ_MP = { mode: 'maxpain', side: 'sell', level: 30090.85, entry: 30530.35, sl: 30714, tp1: 30090.85, minDist: 58.19,
  slGuardWall: 30690.85, slFrac: 1.0, slFloor: 23.275, slDist: 183.8, regime: 'PIN' };
const LADDER = { ...NQ_MP, slGuardWalls: [30690.85, 30790.85, 31290.85] };
ok('2026-09-25 NQ: ladder → next wall up guards (30790.85 + 23.275)', near(makeSpec('nq', LADDER, 30691.7).sl, 30790.85 + 23.275));
const capped = makeSpec('nq', { ...LADDER, tpCapDist: 232.75, minRR: 0.8 }, 30691.7);
ok('TP capped at the implied move from the LIVE entry', near(capped.tp, 30691.7 - 232.75) && capped.tpCapped);
ok('fire-time minRR skip reported', makeSpec('nq', { ...LADDER, tpCapDist: 50, minRR: 1 }, 30691.7).rrSkip != null);
ok('strike-anchored modes ignore live px', makeSpec('gold', SELL_FADE, 4310).entry === 4300 && makeSpec('gold', SELL_FADE, 4310).sl === 4305);
ok('maxpain: one per side per chain, whatever the level drift', alreadyEntered({ ...MAXPAIN, level: 4201.3 }, ['maxpain_sell_4200']));
ok('fade: same zone within 0.05% counts as entered', alreadyEntered({ ...SELL_FADE, level: 4301 }, ['fade_sell_4300']));
ok('fade: a different wall does not', !alreadyEntered({ ...SELL_FADE, level: 4350 }, ['fade_sell_4300']));

console.log('[bar simulator]');
const T0 = Date.UTC(2026, 9, 12, 14, 0);
const bar = (i, o, h, l, c) => ({ t: T0 + i * 60e3, o, h, l, c });
{
  const b = emptyBook();
  syncPlan(b, 'gold', { spot: 4200, zones: [SELL_FADE] }, 'c1', 4250);
  ok('below the wall: not primed', !b.sessions.gold.primed['fade_sell_4300']);
  stepBar(b, 'gold', bar(0, 4290, 4299, 4288, 4295), { pip: 0.1 });
  ok('no touch, no entry (tol 0.2)', b.open.length === 0);
  stepBar(b, 'gold', bar(1, 4295, 4301, 4294, 4298), { pip: 0.1 });
  ok('touch fills AT the wall', b.open.length === 1 && b.open[0].entry === 4300 && b.open[0].dirUp === false);
  stepBar(b, 'gold', bar(2, 4298, 4299, 4199, 4205), { pip: 0.1 });
  ok('target hit → closed tp, +20R', b.closed.length === 1 && b.closed[0].reason === 'tp' && near(b.closed[0].r, 20));
  stepBar(b, 'gold', bar(3, 4205, 4302, 4204, 4300), { pip: 0.1 });
  ok('one-shot: the same wall does not re-enter', b.open.length === 0);
}
{
  const b = emptyBook();
  syncPlan(b, 'gold', { spot: 4200, zones: [SELL_FADE] }, 'c1', 4310);
  ok('price already through the wall at plan load → primed (never retro-enters)', !!b.sessions.gold.primed['fade_sell_4300']);
  stepBar(b, 'gold', bar(0, 4310, 4312, 4299, 4300), { pip: 0.1 });
  ok('primed zone stays out', b.open.length === 0);
  syncPlan(b, 'gold', { spot: 4200, zones: [SELL_FADE] }, 'c2', 4250);
  ok('new OI chain resets one-shot state', !b.sessions.gold.primed['fade_sell_4300']);
}
{
  const b = emptyBook();
  syncPlan(b, 'gold', { spot: 4200, zones: [SELL_FADE] }, 'c1', 4250);
  stepBar(b, 'gold', bar(0, 4290, 4306, 4288, 4304), { pip: 0.1 });
  ok('touch that runs through the stop inside the minute → stopped on the entry bar',
    b.closed.length === 1 && b.closed[0].reason === 'sl' && near(b.closed[0].r, -1));
}
{
  const b = emptyBook();
  syncPlan(b, 'gold', { spot: 4200, zones: [SELL_FADE] }, 'c1', 4250);
  stepBar(b, 'gold', bar(0, 4299.9, 4301, 4299, 4300), { pip: 0.1 });
  stepBar(b, 'gold', bar(1, 4300, 4306, 4199, 4250), { pip: 0.1 });
  ok('bar spanning stop AND target → stop first (conservative)', b.closed[0]?.reason === 'sl');
}
{
  const b = emptyBook();
  syncPlan(b, 'gold', { spot: 4200, zones: [SELL_FADE] }, 'c1', 4250);
  stepBar(b, 'gold', bar(0, 4290, 4295, 4288, 4294), { pip: 0.1 });
  stepBar(b, 'gold', bar(1, 4303, 4304, 4301, 4302), { pip: 0.1 });
  ok('gap through the wall → filled at the open, not the better wall price', b.open[0]?.entry === 4303);
}
{
  const b = emptyBook();
  syncPlan(b, 'gold', { spot: 4300, zones: [BUY_BREAK] }, 'c1', 4300);
  stepBar(b, 'gold', bar(0, 4310, 4325, 4309, 4322), { pip: 0.1 });
  ok('break: one close past the trigger is a wick, not a break', b.open.length === 0);
  stepBar(b, 'gold', bar(1, 4322, 4330, 4320, 4326), { pip: 0.1 });
  ok('break: second consecutive close fires at that close', b.open.length === 1 && b.open[0].entry === 4326);
}
{
  const b = emptyBook();
  syncPlan(b, 'spx', { spot: 7684.25, zones: [SPX_MP] }, 'c1', 7640);
  stepBar(b, 'spx', bar(0, 7642, 7643, 7638, 7640), { pip: 0.1 });
  ok('maxpain fires at the close with the live-anchored stop', b.open.length === 1 && b.open[0].entry === 7640 && near(b.open[0].sl, 7578.5));
  stepBar(b, 'spx', bar(1, 7640, 7702, 7639, 7700), { pip: 0.1 });
  ok('…and banks at the pin', b.closed[0]?.reason === 'tp' && b.closed[0].exit === 7701.5);
}
{
  const b = emptyBook();
  const BUY4250 = { ...BUY_FADE, level: 4250, entry: 4250, sl: 4245, tp1: 4400 };
  syncPlan(b, 'gold', { spot: 4260, zones: [SELL_FADE, BUY4250] }, 'c1', 4260);
  stepBar(b, 'gold', bar(0, 4260, 4261, 4249, 4252), { pip: 0.1 });
  syncPlan(b, 'gold', { spot: 4260, zones: [SELL_FADE, BUY4250] }, 'c1', 4252);
  stepBar(b, 'gold', bar(1, 4252, 4301, 4251, 4296), { pip: 0.1 });
  ok('opposite guard: no short while the long is open', b.open.length === 1 && b.open[0].dirUp === true);
}
{
  const b = emptyBook();
  const set = ['spx', 'nq', 'rut'];
  for (const [k, lvl] of [['spx', 100], ['nq', 200], ['rut', 300]]) {
    syncPlan(b, k, { spot: lvl + 10, zones: [{ mode: 'fade', side: 'buy', level: lvl, entry: lvl, sl: lvl - 5, tp1: lvl + 10 }] }, 'c1', lvl + 10);
    stepBar(b, k, { t: T0, o: lvl + 1, h: lvl + 1, l: lvl - 1, c: lvl }, { pip: 0.1, isIndex: true, indexSet: set });
  }
  ok('correlated-group cap: third same-direction index long deferred', b.open.length === 2 && !b.open.some(p => p.instrument === 'rut'));
}
{
  const b = emptyBook();
  syncPlan(b, 'gold', { spot: 4200, zones: [SELL_FADE] }, 'c1', 4250);
  stepBar(b, 'gold', bar(0, 4299, 4300, 4298, 4299), { pip: 0.1 });
  stepBar(b, 'gold', { t: T0 + 49 * 3.6e6, o: 4299, h: 4300, l: 4298, c: 4290 }, { pip: 0.1 });
  ok('max hold: a fade left open past 48 h is closed at the bar close', b.closed[0]?.reason === 'time' && b.closed[0].exit === 4290);
}
{
  const s = summarize([{ openT: T0, instrument: 'nq', r: 1, pts: 10 }, { openT: T0, instrument: 'nq', r: -1, pts: -12 }, { openT: T0, instrument: 'spx', r: 0.5, pts: 4 }]);
  const d = s['2026-10-12'];
  ok('summary per day: n, wins, losses, R', d.n === 3 && d.wins === 2 && d.losses === 1 && near(d.r, 0.5));
  ok('summary per instrument', d.byInstr.nq.n === 2 && near(d.byInstr.nq.pts, -2));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
