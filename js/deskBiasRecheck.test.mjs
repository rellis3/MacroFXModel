// node js/deskBiasRecheck.test.mjs   (plans/DESK_BIAS_PROCESS_SPEC.md "Intraday rechecks")
import assert from 'node:assert/strict';
import { londonMs, validateAiReply } from './deskBiasProcess.js';
import {
  slotsFor, dueSlot, stateFor, invalidationHit, reactionOf, systemUpdate, needsAi, buildRecheckPack, RECHECK_KEYS, slotRow, slotRecord,
  recheckCalls, timeline, SLOT_WINDOW_MS, RECHECK_SYSTEM_PROMPT,
} from './deskBiasRecheck.js';
import { tradeRule } from './deskBiasH2H.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('  ok ', name); };
const D = '2026-11-18', M0 = londonMs(D, 6, 3);
const ev = (country, event, h, m, impact = 'High') => ({ country, event, impact, ms: londonMs(D, h, m) });
const cal = { ok: true, events: [ev('GB', 'CPI y/y', 7, 0), ev('US', 'Retail Sales m/m', 13, 30), ev('US', 'Core Retail Sales m/m', 13, 30), ev('US', 'FOMC Minutes', 19, 0), ev('US', 'Late thing', 20, 45), ev('JP', 'Low thing', 9, 0, 'Low'), ev('GB', 'Before issue', 5, 0)] };

await ok('slots: the three fixed slots and one post-event slot per release time, only for the markets it touches', () => {
  const s = slotsFor(D, cal, M0);
  assert.deepEqual(s.map(x => x.id), ['post-event-0700'.replace('0700', '0700'), 'london-open', 'post-event-1330', 'ny-open', 'post-event-1900', 'review'].map(x => x));
  const gb = s.find(x => x.id === 'post-event-0700');
  assert.equal(gb.atMs, londonMs(D, 7, 30));
  assert.deepEqual(gb.markets, ['GBPUSD', 'GBPJPY']);
  const us = s.find(x => x.id === 'post-event-1330');
  assert.equal(us.events.length, 2);                                     // two releases at the same time: one slot
  assert.ok(us.markets.includes('GOLD') && us.markets.includes('EURUSD') && !us.markets.includes('EURJPY') && !us.markets.includes('GBPJPY'));
  assert.ok(!s.some(x => x.id === 'post-event-2045'), 'a release whose +30 min lands after 20:30 is not rechecked');
  assert.ok(!s.some(x => x.id === 'post-event-0500'), 'a release before the morning issue is in the morning call');
  assert.ok(!s.some(x => x.id === 'post-event-0900'), 'only tier-1');
  assert.equal(s.find(x => x.id === 'london-open').markets.length, 13);
});

await ok('due slot: inside its 30-minute window, not stored, earliest first; a missed window is a gap', () => {
  const s = slotsFor(D, cal, M0);
  assert.equal(dueSlot(s, londonMs(D, 7, 29), []), null);
  assert.equal(dueSlot(s, londonMs(D, 7, 35), []).id, 'post-event-0700');
  assert.equal(dueSlot(s, londonMs(D, 7, 35), ['post-event-0700']), null);
  assert.equal(dueSlot(s, londonMs(D, 8, 5) + SLOT_WINDOW_MS, []), null);   // window closed
  assert.equal(dueSlot(s, londonMs(D, 21, 10), []).id, 'review');
});

const fresh = (dir, conviction, inv = null, rule = 'macro and structure agree') => ({ system: { dir, conviction, rule }, invalidation: { level: inv, basis: 'swing' } });
await ok('rules: no position -> ACTIVE or STAND_ASIDE; a blocked side stays out', () => {
  const p = { dir: 'NEUTRAL', conviction: null, invalidation: null, blocked: 0 };
  assert.deepEqual(systemUpdate(p, fresh('BEARISH', 3, 1.1)), { status: 'ACTIVE', dir: 'BEARISH', conviction: 3, invalidation: 1.1, rule: 'macro and structure agree' });
  assert.equal(systemUpdate(p, fresh('NEUTRAL', null)).status, 'STAND_ASIDE');
  assert.equal(systemUpdate({ ...p, blocked: -1 }, fresh('BEARISH', 3, 1.1)).status, 'STAND_ASIDE');
  assert.equal(systemUpdate({ ...p, blocked: -1 }, fresh('BULLISH', 3, 1.0)).status, 'ACTIVE');
});

await ok('rules: a position is confirmed, weakened, flipped or invalidated; its stop is never moved intraday', () => {
  const p = { dir: 'BULLISH', conviction: 3, invalidation: 1.05, blocked: 0 };
  assert.deepEqual(systemUpdate(p, fresh('BULLISH', 3, 1.07)), { status: 'CONFIRMED', dir: 'BULLISH', conviction: 3, invalidation: 1.05, rule: 'macro and structure agree' });
  assert.equal(systemUpdate(p, fresh('BULLISH', 2, 1.07)).status, 'WEAKENED');
  const n = systemUpdate(p, fresh('NEUTRAL', null, null, 'macro and structure conflict'));
  assert.equal(n.status, 'WEAKENED'); assert.equal(n.dir, 'BULLISH'); assert.equal(n.conviction, 2); assert.equal(n.invalidation, 1.05);
  assert.equal(systemUpdate({ ...p, conviction: 1 }, fresh('NEUTRAL', null)).conviction, 1);
  const f = systemUpdate(p, fresh('BEARISH', 2, 1.12));
  assert.equal(f.status, 'FLIPPED'); assert.equal(f.dir, 'BEARISH'); assert.equal(f.invalidation, 1.12);
  const inv = systemUpdate(p, fresh('BULLISH', 4, 1.0), { invalid: { hit: true, level: 1.05 } });
  assert.equal(inv.status, 'INVALIDATED'); assert.equal(inv.dir, 'NEUTRAL');
});

await ok('rules: the 21:00 review holds a still-agreeing side and closes anything else', () => {
  const p = { dir: 'BEARISH', conviction: 3, invalidation: 1.2, blocked: 0 };
  assert.equal(systemUpdate(p, fresh('BEARISH', 2, 1.21), { kind: 'review' }).status, 'HOLD');
  assert.equal(systemUpdate(p, fresh('BEARISH', 2, 1.21), { kind: 'review' }).invalidation, 1.2);
  assert.equal(systemUpdate(p, fresh('NEUTRAL', null), { kind: 'review' }).status, 'CLOSE');
  assert.equal(systemUpdate(p, fresh('BULLISH', 3, 1.1), { kind: 'review' }).dir, 'NEUTRAL');   // review never opens the other side
  assert.equal(systemUpdate({ dir: 'NEUTRAL' }, fresh('BULLISH', 3, 1.1), { kind: 'review' }).status, 'STAND_ASIDE');
  assert.ok(needsAi({ status: 'HOLD' }) && needsAi({ status: 'CLOSE' }) && !needsAi({ status: 'CONFIRMED' }) && !needsAi({ status: 'INVALIDATED' }) && !needsAi({ status: 'STAND_ASIDE' }));
});

const m5 = (from, closes, step = 5 * 60_000, wick = 0.0005) => closes.map((c, i) => ({ t: from + i * step, o: c, h: c + wick, l: c - wick, c }));
await ok('invalidation: only bars closed after the prior state and by now count', () => {
  const bars = m5(londonMs(D, 6, 0), [1.100, 1.098, 1.093, 1.099]);       // the 06:10 bar's low 1.0925
  const p = { dir: 'BULLISH', invalidation: 1.093, atMs: londonMs(D, 6, 3) };
  assert.equal(invalidationHit(p, bars, londonMs(D, 6, 14)).hit, false);   // the 06:10 bar has not closed
  assert.equal(invalidationHit(p, bars, londonMs(D, 6, 15)).hit, true);
  assert.equal(invalidationHit({ ...p, atMs: londonMs(D, 6, 12) }, bars, londonMs(D, 7)).hit, false);
  assert.equal(invalidationHit({ dir: 'NEUTRAL', invalidation: 1.09 }, bars, Infinity).hit, false);
  assert.equal(invalidationHit({ dir: 'BEARISH', invalidation: 1.1, atMs: 0 }, bars, Infinity).hit, true);
});

await ok('release reaction: last close before it against now, in σ_day; closed bars only', () => {
  const rel = londonMs(D, 13, 30), bars = m5(rel - 10 * 60_000, [100, 100, 101, 102, 103]);
  const r = reactionOf(bars, rel, rel + 15 * 60_000, 0.01);
  assert.equal(r.pre, 100); assert.equal(r.now, 103); assert.equal(r.side, 1);
  assert.ok(Math.abs(r.moveSigma - Math.log(1.03) / 0.01) < 0.01);
  assert.equal(reactionOf(bars, rel, rel + 14 * 60_000, 0.01).now, 102);   // the 13:40 bar has not closed at 13:44
  assert.equal(reactionOf(bars, rel, rel + 15 * 60_000, 0), null);
});

const L = { event: { state: 'POST-EVENT', pending: [], laterToday: [], previous: [], why: null }, regime: { risk: 'off', R: -1, vol: 'normal', volPct1y: 50, smile: null, role: 1, why: null },
  macro: { score: -0.6, side: -1, coverage: 0.9, dir: 'BEARISH', strength: 3, drivers: [], why: null },
  structure: { w1: -1, d1: -1, h4: -1, swingHigh: { level: 0.68 }, swingLow: { level: 0.66 }, bos: 0, side: -1, price: 0.672, priceAsOf: 'x', why: null },
  positioning: { crowded: false, crowdedSide: null, readings: null, why: null }, range: { p50: 0.005, p75: 0.007, open: 0.671, usedSoFar: 0.003, usedOfP50: 0.6, sigmaDay: 0.006, why: null } };
const card = { version: 'desk-bias-process-v1', date: D, asOf: new Date(londonMs(D, 8, 5)).toISOString(), market: 'AUDUSD', system: { dir: 'BEARISH', conviction: 3, rule: 'agree' }, invalidation: { level: 0.68, basis: 'swing high' }, layers: L };

await ok('recheck pack: the morning keys plus the recheck context; the morning validator works on it', () => {
  const prior = { dir: 'NEUTRAL', conviction: null, invalidation: null, slot: 'morning' }, u = systemUpdate(prior, card);
  const pack = buildRecheckPack(card, { slot: { id: 'london-open', kind: 'fixed', atMs: londonMs(D, 8, 5) }, prior, morning: { dir: 'NEUTRAL' }, update: u });
  assert.deepEqual(Object.keys(pack).sort(), [...RECHECK_KEYS].sort());
  assert.equal(pack.system.dir, 'BEARISH'); assert.equal(pack.update.status, 'ACTIVE');
  assert.equal(validateAiReply({ decision: 'ACCEPT', dir: 'BEARISH', conviction: 3, reason: 'Macro side and structure h4 agree.', invalidation: null }, pack).ok, true);
  assert.equal(validateAiReply({ decision: 'ACCEPT', dir: 'NEUTRAL', conviction: 1, reason: 'Macro side.', invalidation: null }, pack).ok, false);
  assert.equal(validateAiReply({ decision: 'OVERRIDE', dir: 'NEUTRAL', conviction: 1, reason: 'The range usedOfP50 is already high.', invalidation: null }, pack).ok, true);
  assert.match(RECHECK_SYSTEM_PROMPT, /process-recheck-v1/);
});

// stored records for the replay and scoring tests
const morning = { date: D, issuedAt: new Date(M0).toISOString(), markets: { AUDUSD: { call: { dir: 'BEARISH', conviction: 3, invalidation: 0.68, by: 'ai-accept' }, system: { dir: 'BEARISH', conviction: 3, invalidation: 0.68 }, ai: { reason: 'r' }, layers: { range: { sigmaDay: 0.006 } } },
  GBPUSD: { call: { dir: 'NEUTRAL', conviction: null, invalidation: null, by: 'ai-accept' }, system: { dir: 'NEUTRAL', conviction: null, invalidation: null }, ai: null, layers: { range: { sigmaDay: 0.005 } } } } };
const row = (sysU, aiU, ai = null) => slotRow({ fresh: card, sysU, aiU, ai });
const rec = { date: D, slots: {
  'post-event-0700': slotRecord({ slot: { id: 'post-event-0700', kind: 'post-event', atMs: londonMs(D, 7, 30) }, asOf: 'a', issuedAt: new Date(londonMs(D, 7, 31)).toISOString(),
    rows: { GBPUSD: row({ status: 'ACTIVE', dir: 'BULLISH', conviction: 2, invalidation: 1.3, rule: 'x' }, { status: 'ACTIVE', dir: 'BULLISH', conviction: 2, invalidation: 1.3, rule: 'x' }, { ok: true, decision: 'OVERRIDE', dir: 'NEUTRAL', conviction: null, reason: 'reaction against', invalidation: null }) } }),
  'london-open': slotRecord({ slot: { id: 'london-open', kind: 'fixed', atMs: londonMs(D, 8, 5) }, asOf: 'a', issuedAt: new Date(londonMs(D, 8, 6)).toISOString(),
    rows: { AUDUSD: row({ status: 'INVALIDATED', dir: 'NEUTRAL', conviction: null, invalidation: null, rule: 'hit' }, { status: 'INVALIDATED', dir: 'NEUTRAL', conviction: null, invalidation: null, rule: 'hit' }) } }),
} };

await ok('state replay: the morning call, then each stored update in time order; an invalidated side is blocked', () => {
  const s0 = stateFor(morning, rec, 'AUDUSD', londonMs(D, 8, 0));
  assert.equal(s0.ai.dir, 'BEARISH'); assert.equal(s0.ai.slot, 'morning');
  const s1 = stateFor(morning, rec, 'AUDUSD');
  assert.equal(s1.ai.dir, 'NEUTRAL'); assert.equal(s1.ai.blocked, -1); assert.equal(s1.system.blocked, -1);
  const g = stateFor(morning, rec, 'GBPUSD');
  assert.equal(g.system.dir, 'BULLISH'); assert.equal(g.ai.dir, 'NEUTRAL'); assert.equal(g.ai.by, 'ai-override');
  assert.equal(stateFor(morning, rec, 'NOPE'), null);
});

await ok('scoring: morning + rechecks become one call sequence per track; the trade rule exits on the update', () => {
  const calls = recheckCalls([morning], [rec]);
  const aud = calls.filter(c => c.competitor === 'process-system+rc' && c.market === 'AUDUSD');
  assert.deepEqual(aud.map(c => c.dir), ['BEARISH', 'NEUTRAL']);
  assert.ok(calls.filter(c => c.competitor === 'process-ai+rc' && c.market === 'GBPUSD').every(c => c.dir === 'NEUTRAL'));
  const bars = m5(M0 - 5 * 60_000, Array.from({ length: 40 }, (_, i) => 0.672 - i * 0.0001), 5 * 60_000, 0.00001);
  const t = tradeRule(aud, bars);
  assert.equal(t.length, 1); assert.equal(t[0].exitWhy, 'neutral'); assert.equal(t[0].exitMs, londonMs(D, 8, 6));
});

await ok('timeline for the tab: the morning call then each update on the AI track', () => {
  const tl = timeline(morning, rec, 'GBPUSD');
  assert.deepEqual(tl.map(x => [x.slot, x.status, x.dir]), [['morning', 'ISSUED', 'NEUTRAL'], ['post-event-0700', 'ACTIVE→OVERRIDDEN', 'NEUTRAL']]);
  assert.equal(tl[1].systemDir, 'BULLISH');
});

console.log(`${passed} passed`);
