// node js/deskBiasH2H.test.mjs   (plans/DESK_BIAS_PROCESS_SPEC.md "Head to head")
import assert from 'node:assert/strict';
import { tradeRule, priceAt, fridayCloseMs, callOutcome, headToHead, processCalls, ledgerCalls, engineV2Calls, dayBoot } from './deskBiasH2H.js';
import { londonMs } from './directionLedger.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok ', name); };
const M5 = 5 * 60_000;
// 5-minute bars from a price function over [from, to)
const barsOf = (from, to, px, sp = 0) => { const out = []; for (let t = from; t < to; t += M5) { const o = px(t), c = px(t + M5); out.push({ t, o, h: Math.max(o, c), l: Math.min(o, c), c, sp }); } return out; };
const MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18', FRI = '2026-11-20';
const at = (d, h, m = 0) => londonMs(d, h, m);

ok('prices and the Friday close', () => {
  const b = barsOf(at(MON, 7), at(MON, 8), t => 100 + (t - at(MON, 7)) / M5);
  assert.equal(priceAt(b, at(MON, 7, 30), M5).c, 106);
  assert.equal(priceAt(b, at(MON, 7, 2), M5), null);                 // no bar closed yet
  assert.equal(priceAt(b, at(MON, 9), M5), null);                    // more than 15 min after the last bar
  assert.equal(fridayCloseMs(at(WED, 7, 30)), at(FRI, 21));
  assert.equal(fridayCloseMs(at(FRI, 22)), at('2026-11-27', 21));
});

ok('trade rule: enter at the call, held while the side repeats, exit on flip at the next call time, R in stop units', () => {
  // price rises 0.01 per bar from 100 through the week
  const t0 = at(MON, 0), b = barsOf(t0, at(FRI, 23), t => 100 + (t - t0) / M5 * 0.01);
  const calls = [
    { date: MON, ms: at(MON, 7, 30), dir: 'BULLISH', sigmaDay: 0.01 },
    { date: TUE, ms: at(TUE, 7, 30), dir: 'BULLISH', sigmaDay: 0.01 },
    { date: WED, ms: at(WED, 7, 30), dir: 'BEARISH', sigmaDay: 0.01 },
  ];
  const tr = tradeRule(calls, b, { barMs: M5 });
  assert.equal(tr.length, 2);
  assert.equal(tr[0].exitWhy, 'flip'); assert.equal(tr[0].side, 1);
  assert.equal(tr[0].stopBasis, '1 sigma_day');
  assert.ok(tr[0].R > 1);                                            // 2 days up 0.01 * 288 per day
  assert.equal(tr[1].side, -1); assert.equal(tr[1].exitWhy, 'stop');  // the short is stopped by the rising price
  assert.ok(Math.abs(tr[1].R + 1) < 1e-9);
});

ok('trade rule: the invalidation is the stop when it is on the losing side; a gap through it exits at the open; Neutral exits', () => {
  const t0 = at(MON, 0);
  const px = t => (t < at(MON, 12) ? 100 : 95);                     // a gap down at noon
  const b = barsOf(t0, at(MON, 20), px).map(x => ({ ...x, o: px(x.t), h: px(x.t), l: px(x.t), c: px(x.t) }));   // each bar flat at its own price: the noon bar opens at 95
  const tr = tradeRule([{ date: MON, ms: at(MON, 7, 30), dir: 'BULLISH', invalidation: 99, sigmaDay: 0.1 }], b, { barMs: M5 });
  assert.equal(tr[0].stopBasis, 'invalidation'); assert.equal(tr[0].exitWhy, 'stop (gap)'); assert.equal(tr[0].exit, 95);
  assert.equal(tr[0].R, -5);
  // invalidation on the wrong side -> 1 sigma_day
  assert.equal(tradeRule([{ date: MON, ms: at(MON, 7, 30), dir: 'BULLISH', invalidation: 101, sigmaDay: 0.01 }], barsOf(t0, at(MON, 20), () => 100), { barMs: M5 })[0].stopBasis, '1 sigma_day');
  const flat = barsOf(t0, at(TUE, 20), () => 100);
  const n = tradeRule([{ date: MON, ms: at(MON, 7, 30), dir: 'BULLISH', sigmaDay: 0.01 }, { date: TUE, ms: at(TUE, 7, 30), dir: 'NEUTRAL' }], flat, { barMs: M5 });
  assert.equal(n[0].exitWhy, 'neutral'); assert.equal(n[0].R, 0);
});

ok('trade rule: Friday 21:00 exit, a position still open at the end is marked open, spread charged from the bars', () => {
  const t0 = at(FRI, 0), b = barsOf(t0, at(FRI, 23), () => 100, 0.02);
  const tr = tradeRule([{ date: FRI, ms: at(FRI, 7, 30), dir: 'BEARISH', sigmaDay: 0.01 }], b, { barMs: M5 });
  assert.equal(tr[0].exitWhy, 'friday 21:00'); assert.equal(tr[0].exitMs, at(FRI, 21));
  assert.equal(tr[0].R, 0); assert.equal(tr[0].cost, 0.02); assert.equal(tr[0].Rnet, -0.02);   // risk 1.0: half of 0.02 in and out
  const short = barsOf(at(MON, 0), at(MON, 12), () => 100);
  assert.equal(tradeRule([{ date: MON, ms: at(MON, 7, 30), dir: 'BULLISH', sigmaDay: 0.01 }], short, { barMs: M5 })[0].open, true);
  // no sigma and no invalidation: no trade
  assert.deepEqual(tradeRule([{ date: MON, ms: at(MON, 7, 30), dir: 'BULLISH' }], short, { barMs: M5 }), []);
});

ok('call outcome to 21:00 and to the next weekday 07:00', () => {
  const t0 = at(MON, 0), b = barsOf(t0, at(TUE, 9), t => (t < at(MON, 15) ? 100 : 101));
  const o = callOutcome({ date: MON, ms: at(MON, 7, 30) }, b, { barMs: M5 });
  assert.equal(o.d21.y, 1); assert.equal(o.n07.y, 1);
  assert.equal(callOutcome({ date: TUE, ms: at(TUE, 7, 30) }, b, { barMs: M5 }).d21, null);   // no price at 21:00 yet
});

ok('head to head: hit vs B0, neutral share, calibration by conviction, shared days, override record', () => {
  const t0 = at(MON, 0), up = barsOf(t0, at(FRI, 23), t => 100 + (t - t0) / M5 * 0.001), bars = { EURUSD: up };
  const days = [MON, TUE, WED];
  const calls = days.flatMap((d, i) => [
    { competitor: 'process-ai', market: 'EURUSD', date: d, ms: at(d, 7, 35), dir: i === 1 ? 'NEUTRAL' : 'BULLISH', conviction: 3, sigmaDay: 0.005, by: i === 2 ? 'ai-override' : 'ai-accept', systemDir: i === 2 ? 'BEARISH' : 'BULLISH' },
    { competitor: 'process-system', market: 'EURUSD', date: d, ms: at(d, 7, 35), dir: i === 2 ? 'BEARISH' : 'BULLISH', conviction: 2, sigmaDay: 0.005 },
    ...(i < 2 ? [{ competitor: 'max-signals', market: 'EURUSD', date: d, ms: at(d, 9), side: -1, sigmaDay: 0.005 }] : []),
  ]);
  const H = headToHead({ calls, bars, b0: { EURUSD: { d21: 0.5, n07: 0.5 } }, b: 200 });
  assert.deepEqual(H.competitors, ['max-signals', 'process-ai', 'process-system']);
  assert.equal(H.sharedMarketDays, 2);
  const ai = H.table.find(r => r.competitor === 'process-ai');
  assert.equal(ai.all.records, 3); assert.equal(ai.all.speaking, 2); assert.equal(ai.all.neutralShare, +(1 / 3).toFixed(4));
  assert.equal(ai.all.hits.d21.hit, 1); assert.equal(ai.all.hits.d21.excess, 0.5);
  assert.deepEqual(ai.all.calibration, { 3: { n: 2, hit: 1 } });
  assert.equal(ai.shared.records, 2);
  const mx = H.table.find(r => r.competitor === 'max-signals');
  assert.equal(mx.all.hits.d21.hit, 0);
  assert.equal(H.override.n, 1); assert.equal(H.override.aiBetter, 1);
  assert.ok(H.override.rows[0].aiRet > 0 && H.override.rows[0].sysRet < 0);
});

ok('records to calls: process issues give two competitors; ledger rows keep their side and knowable time', () => {
  const rec = { date: MON, issuedAt: new Date(at(MON, 7, 41)).toISOString(), markets: { GOLD: { call: { dir: 'NEUTRAL', by: 'ai-override', invalidation: null }, system: { dir: 'BULLISH', conviction: 3, invalidation: 4000 }, layers: { range: { sigmaDay: 0.01 } } } } };
  const pc = processCalls([rec]);
  assert.deepEqual(pc.map(c => [c.competitor, c.dir, c.invalidation]), [['process-ai', 'NEUTRAL', null], ['process-system', 'BULLISH', 4000]]);
  assert.equal(pc[0].systemDir, 'BULLISH'); assert.equal(pc[0].ms, at(MON, 7, 41));
  const led = [{ issue_date: MON, forecasts: [
    { target: 'd21', model_id: 'max-signals', inst: 'gold', speaks: true, side: -1, knowable_ts: new Date(at(MON, 9)).toISOString(), sigma_day: 0.01 },
    { target: 'n07', model_id: 'max-signals', inst: 'gold', speaks: true, side: -1, knowable_ts: new Date(at(MON, 9)).toISOString() },
    { target: 'd21', model_id: 'B0', inst: 'gold', speaks: false, side: 0 },
    { target: 'd21', model_id: 'h4-trend', inst: 'gold', speaks: false, side: 0, knowable_ts: new Date(at(MON, 7)).toISOString() }] }];
  const lc = ledgerCalls(led, { gold: 'GOLD' });
  assert.deepEqual(lc.map(c => [c.competitor, c.side]), [['max-signals', -1], ['h4-trend', 0]]);
  assert.equal(dayBoot([{ day: 'a', v: 1 }]), null);
});

ok('engine V2 calls: the v2 variant per market, side only with strength > 0, knowable at the issue time', () => {
  const recs = [{ date: '2026-11-20', issuedAt: '2026-11-20T05:31:00Z', variants: { v2: { markets: { EURUSD: { dir: 'BEARISH', strength: 3 }, GOLD: { dir: 'BULLISH', strength: 0 }, USDJPY: { dir: 'NEUTRAL', strength: 1 } } }, v1r: { markets: { EURUSD: { dir: 'BULLISH', strength: 2 } } } } }];
  const c = engineV2Calls(recs, (d, m) => m === 'EURUSD' ? 0.005 : null);
  assert.deepEqual(c.map(x => [x.competitor, x.market, x.side]), [['bias-engine-v2', 'EURUSD', -1], ['bias-engine-v2', 'GOLD', 0], ['bias-engine-v2', 'USDJPY', 0]]);
  assert.equal(c[0].ms, Date.parse('2026-11-20T05:31:00Z')); assert.equal(c[0].sigmaDay, 0.005); assert.equal(c[0].conviction, 3);
});

console.log(`\n${passed} passed`);
