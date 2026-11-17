// node js/deskBiasProcess.test.mjs   (plans/DESK_BIAS_PROCESS_SPEC.md, build steps 1-2)
import assert from 'node:assert/strict';
import {
  emaSlopeSign, lastSwings, structureLayer, structureSide, eventLayer, volRegime, regimeLayer, regimeSupports, macroLayer, positioningLayer, rangeLayer,
  systemCall, invalidationOf, cleanestPairs, expressionOf, buildLayers, buildPack, historyFor, validateAiReply, runProcessAi, finishCard, dayRecord,
  PACK_KEYS, LAYER_KEYS, AI_SYSTEM_PROMPT, AI_PROMPT_VERSION, AI_TEMPERATURE, londonMs, parseReplyJson,
} from './deskBiasProcess.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('  ok ', name); };
const DAY = 864e5, H4 = 4 * 3600e3;
const D = '2026-11-18';                      // Wednesday
const ISSUE = londonMs(D, 7, 30), asOf = new Date(ISSUE).toISOString();

// daily bars (open = London midnight), oldest first, the last one closed at D 00:00
const dBars = (closes, end = Date.parse(`${D}T00:00:00Z`)) => closes.map((c, i) => ({ t: end - (closes.length - i) * DAY, o: c, h: c * 1.002, l: c * 0.998, c }));
const trend = (n, a, step) => Array.from({ length: n }, (_, i) => a + i * step);
// an engine record: currencies with drivers (wNorm, contrib) so the trend driver can be taken out
const ccy = (score, trendContrib = 0, extra = []) => ({ score, coverage: 0.9, dir: 'NEUTRAL', strength: 0, missing: [],
  drivers: [{ key: 'policy', label: 'Policy path', d: 1, wNorm: 0.95, contrib: score - trendContrib }, { key: 'trend', label: 'Trend', d: 1, wNorm: 0.05, contrib: trendContrib }, ...extra] });
const engine = (over = {}) => ({ version: 'bias-engine-v1', asOf: new Date(londonMs(D, 7, 5)).toISOString(), risk: { score: 0.6, coverage: 1 },
  currencies: { USD: ccy(-0.5), EUR: ccy(0.6), GBP: ccy(0.1), JPY: ccy(0.4), AUD: ccy(0.2), NZD: ccy(-0.1), CAD: ccy(0), CHF: ccy(0.05), ...(over.currencies ?? {}) },
  markets: { GOLD: { score: 0.9, coverage: 0.8, dir: 'BULLISH', strength: 5, missing: [], drivers: [{ key: 'usd', label: 'USD', d: 1, wNorm: 0.8, contrib: 0.8 }, { key: 'trend', label: 'Trend', d: 1, wNorm: 0.2, contrib: 0.1 }] }, ...(over.markets ?? {}) } });

await ok('EMA20 slope sign: up, down, flat, null with too little history', () => {
  assert.equal(emaSlopeSign(trend(40, 100, 1)), 1);
  assert.equal(emaSlopeSign(trend(40, 100, -1)), -1);
  assert.equal(emaSlopeSign(Array(40).fill(5)), 0);
  assert.equal(emaSlopeSign(trend(22, 1, 1)), null);
});

await ok('fractal swing: needs 2 lower highs on each side; a bar with only 1 bar after it is not confirmed', () => {
  const mk = hs => hs.map((h, i) => ({ t: i * DAY, h, l: h - 10, c: h - 5 }));
  assert.equal(lastSwings(mk([1, 2, 5, 3, 2])).high.level, 5);           // confirmed by the 2 bars after
  assert.equal(lastSwings(mk([1, 2, 4, 3, 2, 5, 3])).high.level, 4);     // the 5 has one bar after: not yet a swing; the older 4 is
  assert.equal(lastSwings(mk([1, 2, 5, 5, 2, 1])).high, null);           // ties are not swings
  const lows = [9, 8, 6, 7, 8].map((l, i) => ({ t: i * DAY, h: l + 10, l, c: l + 5 }));
  assert.equal(lastSwings(lows).low.level, 6);
  assert.equal(lastSwings(lows).low.confirmedT, 4 * DAY);
});

await ok('no lookahead: the structure layer at T is unchanged by bars after T, and an open bar is ignored', () => {
  const end = Date.parse(`${D}T00:00:00Z`);
  const base = dBars([...trend(30, 100, 0.5), 120, 116, 115, 114, 113], end);  // a swing high at 120, confirmed 2 bars later
  const past = { d1: base, h4: [], w1: [] };
  const a = structureLayer(past, ISSUE);
  assert.equal(a.swingHigh.level, 120 * 1.002);
  // the future: a higher swing and a break, all after the issue time
  const future = [130, 140, 125, 110, 90].map((c, i) => ({ t: end + i * DAY, o: c, h: c * 1.002, l: c * 0.998, c }));
  const b = structureLayer({ d1: [...base, ...future], h4: [], w1: [] }, ISSUE);
  assert.deepEqual(b, a);
  // the bar for D itself is open at 07:30 (closes at midnight): even marked complete it is cut by its close time
  const c = structureLayer({ d1: [...base, { t: end, o: 1, h: 999, l: 0.1, c: 500, complete: true }], h4: [], w1: [] }, ISSUE);
  assert.deepEqual(c, a);
  // a swing that needs a bar not closed yet is not visible: two bars after 150 but only one has closed at T
  const late = dBars([...trend(30, 100, 0.5), 150, 140], end);
  const s = structureLayer({ d1: late, h4: [], w1: [] }, ISSUE);
  assert.notEqual(s.swingHigh?.level, 150 * 1.002);
});

await ok('structure side: D1 with H4, or D1 with the break of structure; else none', () => {
  assert.equal(structureSide({ d1: 1, h4: 1, bos: 0 }), 1);
  assert.equal(structureSide({ d1: -1, h4: 1, bos: -1 }), -1);
  assert.equal(structureSide({ d1: 1, h4: -1, bos: 0 }), null);
  assert.equal(structureSide({ d1: 0, h4: 0, bos: 0 }), null);
  assert.equal(structureSide({ d1: null, h4: 1, bos: 1 }), null);
});

const cal = events => ({ ok: true, events, source: 'test' });
await ok('event state: PRE-EVENT before 16:00, later-today events listed, POST-EVENT from the previous weekday, missing calendar stated', () => {
  const cpi = { country: 'US', event: 'CPI m/m', impact: 'high', ms: londonMs(D, 13, 30) };
  assert.equal(eventLayer('EURUSD', cal([cpi]), D, ISSUE).state, 'PRE-EVENT');
  assert.equal(eventLayer('GOLD', cal([cpi]), D, ISSUE).state, 'PRE-EVENT');
  assert.equal(eventLayer('GBPJPY', cal([cpi]), D, ISSUE).state, 'CLEAR');
  assert.equal(eventLayer('EURUSD', cal([{ ...cpi, impact: 'medium' }]), D, ISSUE).state, 'CLEAR');
  const fomc = { country: 'US', event: 'Federal Funds Rate', impact: 'high', ms: londonMs(D, 19) };
  const e = eventLayer('USDJPY', cal([fomc]), D, ISSUE);
  assert.equal(e.state, 'CLEAR'); assert.equal(e.laterToday.length, 1);
  const prev = { country: 'GB', event: 'CPI y/y', impact: 'high', ms: londonMs('2026-11-17', 7) };
  assert.equal(eventLayer('GBPUSD', cal([prev]), D, ISSUE).state, 'POST-EVENT');
  const early = { country: 'GB', event: 'CPI y/y', impact: 'high', ms: londonMs(D, 7) };   // released before the issue: not pending
  assert.equal(eventLayer('GBPUSD', cal([early]), D, ISSUE).state, 'POST-EVENT');
  const monday = eventLayer('GBPUSD', { ...cal([]), coversFrom: '2026-11-16' }, '2026-11-16', londonMs('2026-11-16', 7, 30));
  assert.equal(monday.state, 'CLEAR-TODAY'); assert.match(monday.why, /POST-EVENT unknown/);
  const none = eventLayer('EURUSD', { ok: false, error: 'feed down' }, D, ISSUE);
  assert.equal(none.state, null); assert.match(none.why, /feed down/);
});

await ok('regime: risk side, vol regime vs its own year, dollar smile for USD markets only, regime support by risk role', () => {
  const calm = [...Array(300)].map((_, i) => 100 * Math.exp(0.01 * Math.sin(i) * (i < 280 ? 1 : 0.1)));
  const v = volRegime(calm);
  assert.equal(v.regime, 'calm');
  assert.equal(volRegime([1, 2, 3]).regime, null);
  const r = regimeLayer('AUDUSD', engine(), v);
  assert.equal(r.risk, 'on'); assert.equal(r.role, 1.5); assert.equal(r.smile, null); assert.match(r.why, /US vs peer data/);
  const dd = d => ({ key: 'data', label: 'Data', d, wNorm: 0, contrib: 0 });
  const withData = engine({ currencies: Object.fromEntries(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'].map(c => [c, ccy(0, 0, [dd(c === 'USD' ? 2 : 0)])])) });
  assert.match(regimeLayer('EURUSD', withData, v).smile, /right/);
  assert.match(regimeLayer('EURUSD', { ...withData, risk: { score: -0.5, coverage: 1 } }, v).smile, /left/);
  assert.equal(regimeLayer('GBPJPY', engine(), v).smile, null);
  assert.equal(regimeSupports(1, r), true); assert.equal(regimeSupports(-1, r), false);
  assert.equal(regimeSupports(1, { ...r, risk: 'off' }), false);
  assert.equal(regimeSupports(-1, { risk: 'off', role: 1 }), true);
});

await ok('macro: engine score with the trend driver taken out (pairs from the two legs), side at |score| >= 0.3', () => {
  const m = macroLayer('GOLD', engine());
  assert.equal(m.score, +((0.9 - 0.1) / 0.8).toFixed(4)); assert.equal(m.side, 1);
  const e = engine({ currencies: { EUR: ccy(0.6, 0.6), USD: ccy(-0.1, 0) } });
  const p = macroLayer('EURUSD', e);                                           // EUR ex-trend 0, USD -0.1 / 0.95 -> half of that
  assert.equal(p.score, +((0.1 / 0.95) / 2).toFixed(4)); assert.equal(p.side, null);   // renormalised without the trend weight
  assert.equal(macroLayer('EURUSD', null).why, 'no bias-engine issue');
  assert.ok(!macroLayer('GOLD', engine()).drivers.some(x => x.key === 'trend'));
});

await ok('positioning: crowded side from the COT driver, legs read as the pair', () => {
  const pos = d => ({ key: 'positioning', label: 'COT', d, reading: `pct ${d}` });
  const e = engine({ currencies: { EUR: ccy(0.6, 0, [pos(-2)]), USD: ccy(-0.5, 0, [pos(0)]), JPY: ccy(0.4, 0, [pos(-2)]) } });
  assert.equal(positioningLayer('EURUSD', e).crowdedSide, 1);               // EUR longs crowded -> EURUSD long side crowded
  assert.equal(positioningLayer('USDJPY', e).crowdedSide, -1);              // JPY longs crowded -> USDJPY short side crowded
  assert.equal(positioningLayer('EURJPY', e).crowdedSide, null);            // both: no single side
  assert.equal(positioningLayer('EURJPY', e).crowded, true);
});

const layersBase = () => ({
  event: { state: 'CLEAR' }, macro: { side: 1, score: 0.5 }, structure: { side: 1, w1: 0, d1: 1, h4: 1 },
  regime: { risk: 'neutral', role: 1 }, positioning: { crowdedSide: null },
});
await ok('system call: PRE-EVENT and conflicts are Neutral; conviction 2 +W1 +strong +regime -crowded, clamped 1-5', () => {
  assert.deepEqual(systemCall({ ...layersBase(), event: { state: 'PRE-EVENT' } }).rule, 'tier-1 release pending');
  assert.equal(systemCall({ ...layersBase(), event: { state: null } }).dir, 'NEUTRAL');
  assert.equal(systemCall({ ...layersBase(), macro: { side: -1, score: -0.5 } }).rule, 'macro and structure conflict');
  assert.equal(systemCall({ ...layersBase(), macro: { side: null, score: 0.1 } }).dir, 'NEUTRAL');
  assert.equal(systemCall({ ...layersBase(), structure: { side: null } }).dir, 'NEUTRAL');
  const s = systemCall(layersBase());
  assert.deepEqual([s.dir, s.conviction], ['BULLISH', 2]);
  const all = systemCall({ ...layersBase(), macro: { side: 1, score: 0.9 }, structure: { side: 1, w1: 1 }, regime: { risk: 'on', role: 1 } });
  assert.equal(all.conviction, 5); assert.match(all.rule, /W1 agrees/);
  const crowded = systemCall({ ...layersBase(), positioning: { crowdedSide: 1 } });
  assert.equal(crowded.conviction, 1);
  assert.equal(systemCall({ ...layersBase(), event: { state: 'POST-EVENT' } }).dir, 'BULLISH');
  const bear = systemCall({ ...layersBase(), macro: { side: -1, score: -0.9 }, structure: { side: -1, w1: -1 }, regime: { risk: 'off', role: 1 } });
  assert.deepEqual([bear.dir, bear.conviction], ['BEARISH', 5]);
});

await ok('invalidation: the confirmed swing within 3σ, else price ± 1.5σ', () => {
  const st = { price: 100, swingLow: { level: 98, date: 'x' }, swingHigh: { level: 101, date: 'y' } }, rg = { sigmaDay: 0.01 };
  assert.equal(invalidationOf('BULLISH', st, rg).level, 98);                   // 2σ below
  assert.equal(invalidationOf('BEARISH', st, rg).level, 101);
  const far = invalidationOf('BULLISH', { ...st, swingLow: { level: 90, date: 'x' } }, rg);
  assert.equal(far.level, 98.5); assert.match(far.basis, /1.5 σ_day/);
  assert.equal(invalidationOf('BULLISH', { ...st, swingLow: null }, rg).level, 98.5);
  assert.equal(invalidationOf('NEUTRAL', st, rg).level, null);
});

await ok('cleanest pairs: both legs (ex-trend) point the same way for the pair, sorted by the gap', () => {
  const c = cleanestPairs(engine());
  assert.deepEqual(c.map(x => x.pair), ['EURUSD', 'USDJPY']);
  assert.equal(c[0].dir, 'BULLISH'); assert.equal(c[1].dir, 'BEARISH');
  assert.equal(expressionOf('EURUSD', 'BULLISH', engine()).clean, true);
  assert.equal(expressionOf('EURUSD', 'BEARISH', engine()).clean, false);
  assert.equal(expressionOf('GOLD', 'BULLISH', engine()), null);
});

// a full card from raw inputs
const prices = up => {
  const d1 = dBars([...trend(80, 100, up ? 0.3 : -0.3), ...(up ? [124, 126, 128, 125, 124.5, 126, 127] : [76, 74, 72, 75, 75.5, 74, 73])]);
  const h4End = ISSUE - (ISSUE % H4);
  const h4 = Array.from({ length: 60 }, (_, i) => { const c = (up ? 120 : 80) + (up ? 1 : -1) * i * 0.1; return { t: h4End - (60 - i) * H4, o: c, h: c + 0.1, l: c - 0.1, c }; });
  const w1 = Array.from({ length: 40 }, (_, i) => { const c = 100 + (up ? 1 : -1) * i; return { t: Date.parse(`${D}T00:00:00Z`) - (41 - i) * 7 * DAY, o: c, h: c + 1, l: c - 1, c }; });
  return { d1, h4, w1, h1: [] };
};
const inputsFor = (market, over = {}) => ({ date: D, asOf, market, engine: engine(), prices: prices(true), calendar: cal([]), vol: { hl_median: 0.8, hl_75: 1.1, vol_annual: 12 },
  todayRange: { open: 125.5, high: 126.1, low: 125.3 }, ...over });

await ok('buildLayers: a full card, the call and its invalidation from the layers', () => {
  const c = buildLayers(inputsFor('GOLD'));
  assert.equal(c.layers.structure.d1, 1); assert.equal(c.layers.structure.h4, 1); assert.equal(c.layers.structure.w1, 1);
  assert.equal(c.system.dir, 'BULLISH');
  assert.ok(c.system.conviction >= 3);
  assert.ok(c.invalidation.level < c.layers.structure.price);
  assert.equal(c.layers.range.p50, +(125.5 * 0.008).toPrecision(8));
  const pre = buildLayers(inputsFor('GOLD', { calendar: cal([{ country: 'US', event: 'Non-Farm Employment Change', impact: 'high', ms: londonMs(D, 13, 30) }]) }));
  assert.equal(pre.system.dir, 'NEUTRAL'); assert.equal(pre.invalidation.level, null);
  assert.throws(() => buildLayers({ market: 'GOLD' }), /asOf/);
});

await ok('AI pack: the same keys for every market and day, missing data is null with its reason', () => {
  const full = buildPack(buildLayers(inputsFor('GOLD')), []);
  const empty = buildPack(buildLayers({ date: D, asOf, market: 'GBPJPY', engine: null, prices: {}, calendar: { ok: false, error: 'down' }, vol: null, todayRange: null }), []);
  for (const p of [full, empty]) {
    assert.deepEqual(Object.keys(p), PACK_KEYS);
    for (const [k, keys] of Object.entries(LAYER_KEYS)) assert.deepEqual(Object.keys(p.layers[k]), keys, k);
  }
  assert.equal(empty.layers.macro.scoreExTrend, null); assert.equal(empty.layers.macro.why, 'no bias-engine issue');
  assert.equal(empty.layers.event.state, null); assert.match(empty.layers.event.why, /down/);
  assert.match(empty.layers.range.why, /no vol line/);
  assert.equal(empty.system.dir, 'NEUTRAL');
  assert.equal(full.contract, AI_PROMPT_VERSION);
  assert.ok(full.allowedInvalidations.includes(full.invalidation.level));
});

await ok('history: the last 5 earlier calls, outcome from one issue price to the next, nothing from today or later', () => {
  const card = (date, dir, price) => ({ date, call: { dir, by: 'ai-accept', conviction: 3 }, system: { dir }, layers: { structure: { price }, range: { sigmaDay: 0.01 } } });
  const prev = [card('2026-11-10', 'BULLISH', 100), card('2026-11-11', 'BEARISH', 101), card('2026-11-12', 'NEUTRAL', 100), card('2026-11-13', 'BULLISH', 99),
    card('2026-11-16', 'BULLISH', 98), card('2026-11-17', 'BEARISH', 99), card(D, 'BULLISH', 1)];
  const h = historyFor(prev, D, 98.5);
  assert.deepEqual(h.map(x => x.date), ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17']);
  assert.deepEqual(h.map(x => x.outcome), ['right', 'no call', 'wrong', 'right', 'right']);
});

// ── the AI step ────────────────────────────────────────────────────────────────────────────────────────────────
const card0 = buildLayers(inputsFor('GOLD'));
const pack0 = buildPack(card0, []);
const sys0 = pack0.system;
const fake = replies => { const calls = []; return { calls, fn: async a => { calls.push(a); const r = replies[Math.min(calls.length - 1, replies.length - 1)]; if (r instanceof Error) throw r; return { text: typeof r === 'string' ? r : JSON.stringify(r) }; } }; };

await ok('validator: ACCEPT must keep the call; invented levels, foreign numbers and fieldless reasons are rejected', () => {
  const acc = { decision: 'ACCEPT', dir: sys0.dir, conviction: sys0.conviction, reason: 'Macro and structure agree and the event state is clear.', invalidation: null };
  const v = validateAiReply(acc, pack0);
  assert.ok(v.ok, JSON.stringify(v.errors)); assert.equal(v.value.invalidation, pack0.invalidation.level);
  assert.ok(!validateAiReply({ ...acc, conviction: sys0.conviction === 5 ? 4 : sys0.conviction + 1 }, pack0).ok);
  const inv = validateAiReply({ ...acc, invalidation: 4000.5 }, pack0);
  assert.ok(!inv.ok); assert.match(inv.errors.join(), /not one of the pack's levels/);
  assert.ok(!validateAiReply({ ...acc, reason: 'Gold looks strong to me at 4321.7 after the news.' }, pack0).ok);
  assert.match(validateAiReply({ ...acc, reason: 'Looks good.' }, pack0).errors.join(), /names no pack field/);
  assert.ok(!validateAiReply({ ...acc, reason: 'Macro agrees. Structure agrees. Risk is on.' }, pack0).ok);    // 3 sentences
  assert.ok(!validateAiReply({ ...acc, dir: 'UP' }, pack0).ok);
  assert.ok(!validateAiReply({ ...acc, extra: 1 }, pack0).ok);
  const ov = validateAiReply({ decision: 'OVERRIDE', dir: 'NEUTRAL', conviction: 1, reason: 'The range is already used (range.usedOfP50) and event risk sits later today.', invalidation: null }, pack0);
  assert.ok(ov.ok); assert.equal(ov.value.conviction, null);
  assert.ok(!validateAiReply({ decision: 'OVERRIDE', dir: 'NEUTRAL', conviction: 1, reason: 'Range used.', invalidation: pack0.invalidation.level }, pack0).ok);   // neutral + level
  assert.ok(!validateAiReply({ decision: 'OVERRIDE', dir: sys0.dir, conviction: sys0.conviction, reason: 'Macro agrees.', invalidation: null }, pack0).ok);     // no change
});

await ok('AI accept: one call, the fixed prompt, lowest temperature; the published call is the AI\'s', async () => {
  const f = fake([{ decision: 'ACCEPT', dir: sys0.dir, conviction: sys0.conviction, reason: 'Macro and structure agree; W1 agrees.', invalidation: null }]);
  const ai = await runProcessAi({ pack: pack0, callModel: f.fn, retryDelayMs: 0 });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].system, AI_SYSTEM_PROMPT); assert.equal(f.calls[0].temperature, AI_TEMPERATURE); assert.equal(f.calls[0].task, 'desk-analyst');
  assert.ok(f.calls[0].prompt.includes(JSON.stringify(pack0)));
  const c = finishCard(card0, ai);
  assert.deepEqual([c.call.by, c.call.dir, c.call.conviction, c.call.invalidation], ['ai-accept', sys0.dir, sys0.conviction, card0.invalidation.level]);
  assert.equal(c.system.dir, sys0.dir); assert.equal(c.ai.decision, 'ACCEPT');
});

await ok('AI override with a reason tied to pack fields', async () => {
  const f = fake([{ decision: 'OVERRIDE', dir: 'NEUTRAL', conviction: 1, reason: 'COT positioning is crowded and the range is mostly used (range.usedOfP50).', invalidation: null }]);
  const c = finishCard(card0, await runProcessAi({ pack: pack0, callModel: f.fn, retryDelayMs: 0 }));
  assert.deepEqual([c.call.by, c.call.dir, c.call.conviction, c.call.invalidation], ['ai-override', 'NEUTRAL', null, null]);
  assert.equal(c.system.dir, sys0.dir); assert.match(c.ai.reason, /COT/);
});

await ok('AI invalid twice -> the system call stands (system-fallback), with the errors kept', async () => {
  const f = fake(['not json at all', { decision: 'MAYBE' }]);
  const ai = await runProcessAi({ pack: pack0, callModel: f.fn, retryDelayMs: 0 });
  assert.equal(f.calls.length, 2); assert.equal(ai.ok, false);
  assert.match(f.calls[1].prompt, /could not be used/);
  const c = finishCard(card0, ai);
  assert.deepEqual([c.call.by, c.call.dir, c.call.conviction], ['system-fallback', sys0.dir, sys0.conviction]);
  assert.ok(c.ai.error.length > 0);
  const thrown = await runProcessAi({ pack: pack0, callModel: async () => { throw Object.assign(new Error('bad key'), { status: 401 }); }, retryDelayMs: 0 });
  assert.equal(thrown.ok, false); assert.equal(finishCard(card0, thrown).call.by, 'system-fallback');
});

await ok('AI invented level: rejected, retried once with the error, accepted when corrected', async () => {
  const bad = { decision: 'OVERRIDE', dir: sys0.dir, conviction: 1, reason: 'COT positioning crowded on the same side.', invalidation: 1234.5 };
  const f = fake([bad, { ...bad, invalidation: null }]);
  const ai = await runProcessAi({ pack: pack0, callModel: f.fn, retryDelayMs: 0 });
  assert.equal(f.calls.length, 2); assert.match(f.calls[1].prompt, /not one of the pack's levels/);
  assert.equal(ai.ok, true); assert.equal(ai.invalidation, pack0.invalidation.level);   // same side kept: the system level
  const f2 = fake([bad, bad]);
  assert.equal(finishCard(card0, await runProcessAi({ pack: pack0, callModel: f2.fn, retryDelayMs: 0 })).call.by, 'system-fallback');
});

await ok('the pack is identical in shape whatever the market, and the day record carries every card and the cleanest pairs', () => {
  const cards = ['EURUSD', 'GOLD', 'NQ'].map(m => finishCard(buildLayers(inputsFor(m)), null));
  const shapes = cards.map(c => JSON.stringify(Object.keys(buildPack(c, []))));
  assert.equal(new Set(shapes).size, 1);
  const rec = dayRecord({ date: D, asOf, cards, engine: engine() });
  assert.deepEqual(Object.keys(rec.markets), ['EURUSD', 'GOLD', 'NQ']);
  assert.equal(rec.markets.GOLD.call.by, 'system');
  assert.ok(rec.cleanest.length >= 1);
  assert.deepEqual(parseReplyJson('```json\n{"a":1}\n```'), { a: 1 });
});

console.log(`\n${passed} passed`);
