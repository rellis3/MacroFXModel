import test from 'node:test'; import assert from 'node:assert/strict';
import { cleanClaim, cleanClaims, collectClaims, closeRows, scoreClaim, scoreDay, wilson, mergeSummary, signAgreeChance, KIND_IDS } from './helixScoreCore.js';
import { pickLead, planBroadcast } from './broadcastCore.js';
import { reviewClaims } from './eveningCore.js';
import { netClaims } from './netCore.js';
import { dayRecordBody } from './helixRecord.js';

const close = { ok: true, sessionDate: '2026-11-27', rows: {
  GOLD: { oc: 1.9, hl: 2.6, range: 1.6, noise: 0.8, ratio: 2.4 }, NQ: { oc: -0.3, hl: 0.9, range: 1.4, noise: 0.7, ratio: -0.43 }, EURUSD: { oc: -0.4, hl: 0.5, range: 0.6, noise: 0.3, ratio: -1.3 },
  GBPUSD: { oc: -0.35, hl: 0.5, range: 0.6, noise: 0.3, ratio: -1.2 }, USDCHF: { oc: 0.3, hl: 0.4, range: 0.55, noise: 0.3, ratio: 1 }, AUDUSD: { oc: 0.1, hl: 0.4, range: 0.7, noise: 0.35, ratio: 0.3 },
  USDJPY: { oc: 0.2, hl: 0.5, range: 0.7, noise: 0.35, ratio: 0.6 } } };

test('cleanClaim: unknown kinds dropped, fields typed and clipped', () => {
  assert.equal(cleanClaim({ kind: 'trade_call' }), null);
  const c = cleanClaim({ kind: 'mover_big', key: 'GOLD', ratio: '2.4', oc: 1.2, junk: 'x', name: 'y'.repeat(500), members: 'no' });
  assert.equal(c.key, 'GOLD'); assert.equal(c.ratio, 2.4); assert.ok(!('junk' in c)); assert.equal(c.name.length, 120); assert.ok(!('members' in c));
  assert.equal(cleanClaim({ kind: 'mover_big', key: 'bad key!' }).key, undefined);
  assert.equal(cleanClaims(Array(100).fill({ kind: 'quiet_start' })).length, 60);
  assert.deepEqual(KIND_IDS, ['mover_big', 'quiet_start', 'range_used', 'net_as_one', 'release_vs_expected', 'release_reaction']);
});

test('closeRows: per market ratio; refuses another session date', () => {
  const st = { session_date: '2026-11-27', instruments: { GOLD: { oc: 1.6, hl: 2, forecast: { hl_median: 1.5, oc_median: 0.8 } }, NQ: { oc: null, hl: null } } };
  const c = closeRows(st, '2026-11-27'); assert.equal(c.ok, true); assert.equal(c.rows.GOLD.ratio, 2); assert.ok(!c.rows.NQ);
  assert.equal(closeRows(st, '2026-11-28').ok, false); assert.equal(closeRows(null, 'x').ok, false);
});

test('scoring rules: each kind hit, miss and unscorable', () => {
  assert.equal(scoreClaim({ kind: 'mover_big', key: 'GOLD', ratio: 2.1 }, { close }).hit, true);
  const nq = scoreClaim({ kind: 'mover_big', key: 'NQ', ratio: -2.2 }, { close }); assert.equal(nq.hit, false); assert.equal(nq.detail.held, false);
  assert.equal(scoreClaim({ kind: 'mover_big', key: 'WHEAT' }, { close }).hit, null);
  assert.equal(scoreClaim({ kind: 'range_used', key: 'EURUSD', used: 0.6 }, { close }).hit, false);
  const q = scoreClaim({ kind: 'quiet_start' }, { close }); assert.equal(q.hit, true, 'median market inside its range'); assert.equal(q.detail.n, 7);
  assert.equal(scoreClaim({ kind: 'quiet_start' }, { close: { rows: { GOLD: close.rows.GOLD } } }).hit, null);
  // EURUSD anchor: GBPUSD with (+0.8, fell with it: agree), USDCHF against (-0.7, rose: agree), AUDUSD with (+0.6, rose: disagree) -> 2 of 3 = hit
  const n = scoreClaim({ kind: 'net_as_one', anchor: 'EURUSD', members: [{ k: 'GBPUSD', r: 0.8 }, { k: 'USDCHF', r: -0.7 }, { k: 'AUDUSD', r: 0.6 }] }, { close });
  assert.equal(n.hit, true); assert.equal(n.detail.agree, 2); assert.ok(n.detail.chance > 0.7 && n.detail.chance < 0.8);
  assert.equal(scoreClaim({ kind: 'net_as_one', anchor: 'EURUSD', members: [{ k: 'AUDUSD', r: 0.6 }, { k: 'USDJPY', r: 0.5 }] }, { close }).hit, false);
  assert.ok(Math.abs(signAgreeChance(0) - 0.5) < 1e-9 && Math.abs(signAgreeChance(1) - 1) < 1e-9);
  const ms = Date.parse('2026-11-27T13:30:00Z'), events = [{ ms, country: 'US', event: 'Core PCE Price Index m/m', actual: '0.3%', estimate: '0.2%' }, { ms, country: 'US', event: 'Unemployment Claims', actual: '1.2M', estimate: '950K' }];
  assert.equal(scoreClaim({ kind: 'release_vs_expected', ccy: 'USD', ms, name: 'Core PCE Price Index m/m', dir: 'above' }, { events }).hit, true);
  const claims = scoreClaim({ kind: 'release_vs_expected', ccy: 'USD', ms: ms + 60e3, name: 'Unemployment Claims', dir: 'below' }, { events }); assert.equal(claims.hit, false, 'units: 1.2M is above 950K'); assert.equal(claims.detail.calendarDir, 'above');
  assert.equal(scoreClaim({ kind: 'release_vs_expected', ccy: 'EUR', ms, name: 'CPI', dir: 'above' }, { events }).hit, null);
  const t0 = ms / 1000, bars = { EURUSD: [{ t: t0, o: 1.1, c: 1.099 }, { t: t0 + 900, o: 1.099, c: 1.098 }, { t: t0 + 30000, o: 1.098, c: 1.097 }] };
  assert.equal(scoreClaim({ kind: 'release_reaction', pair: 'EURUSD', sign: -1, ms, movePct: 0.15 }, { bars }).hit, true, 'EURUSD down = the dollar up, kept to the close');
  assert.equal(scoreClaim({ kind: 'release_reaction', pair: 'EURUSD', sign: 1, ms, movePct: 0.15 }, { bars }).hit, false);
  assert.equal(scoreClaim({ kind: 'release_reaction', pair: 'EURUSD', sign: 1, ms, movePct: 0.01 }, { bars }).hit, null);
});

test('scoreDay: spoken claims on the parts their kind is checked on; counts; no P&L field anywhere', () => {
  const rec = { date: '2026-11-27', runs: {
    morning: { claims: [{ kind: 'mover_big', id: 'mover_big:GOLD', key: 'GOLD', ratio: 2 }, { kind: 'range_used', id: 'range_used:NQ', key: 'NQ', spoken: false }, { kind: 'quiet_start', id: 'quiet_start:day' }] },
    evening: { claims: [{ kind: 'mover_big', id: 'mover_big:NQ', key: 'NQ', ratio: 2 }] } } };
  const s = scoreDay(rec, { close }, { now: Date.parse('2026-11-27T22:15:00Z') });
  assert.deepEqual(s.results.map(r => r.id), ['mover_big:GOLD', 'quiet_start:day']);
  assert.deepEqual(s.counts, { mover_big: [1, 1], quiet_start: [1, 1] }); assert.equal(s.close.sessionDate, '2026-11-27');
  assert.ok(!/pnl|profit|p&l/i.test(JSON.stringify(s).replace(s.note, '')));
});

test('wilson: textbook values', () => {
  const w = wilson(8, 10); assert.equal(w.rate, 0.8); assert.ok(Math.abs(w.lo - 0.49) < 0.005 && Math.abs(w.hi - 0.943) < 0.005, JSON.stringify(w));
  const z = wilson(0, 10); assert.equal(z.lo, 0); assert.ok(Math.abs(z.hi - 0.278) < 0.005); assert.equal(wilson(0, 0).rate, null);
});

test('mergeSummary: a re-scored day replaces its entry, old days roll off, intervals per kind', () => {
  let s = mergeSummary(null, { date: '2026-11-25', counts: { mover_big: [1, 2] }, results: [] });
  s = mergeSummary(s, { date: '2026-11-26', counts: { mover_big: [2, 2], net_as_one: [1, 1] }, results: [{ kind: 'net_as_one', hit: true, detail: { chance: 0.7 } }] });
  s = mergeSummary(s, { date: '2026-11-25', counts: { mover_big: [0, 2] }, results: [] });
  assert.equal(s.kinds.mover_big.n, 4); assert.equal(s.kinds.mover_big.hits, 2); assert.equal(s.kinds.mover_big.days, 2); assert.ok(s.kinds.mover_big.lo < 0.5 && s.kinds.mover_big.hi > 0.5);
  assert.equal(s.kinds.net_as_one.chancePerMember, 0.7); assert.equal(s.all.n, 5); assert.equal(s.kinds.quiet_start.n, 0);
  const t = mergeSummary(s, { date: '2026-11-27', counts: {}, results: [] }, { keepDays: 2 }); assert.deepEqual(Object.keys(t.days), ['2026-11-26', '2026-11-27']); assert.equal(t.kinds.mover_big.n, 2);
});

test('claims are tagged where the words are written: the lead, the ranges scene, the network, the evening releases', () => {
  const movers = [{ key: 'GOLD', ratio: 2.4, oc: 1.9, tone: 'up', hl: 2.1, range: 1.6 }, { key: 'EURUSD', ratio: -1.5, oc: -0.4, tone: 'dn' }];
  const lead = pickLead({ movers, now: new Date('2026-11-27T07:00:00Z') });
  assert.deepEqual(lead[0].claim, { kind: 'mover_big', key: 'GOLD', ratio: 2.4, oc: 1.9, hl: 2.1, range: 1.6 });
  const quiet = pickLead({ movers: [], board: { n: 30, quiet: 26 }, now: new Date('2026-11-27T07:00:00Z') });
  assert.equal(quiet[0].claim.kind, 'quiet_start');
  const net = { ids: ['EURUSD', 'GBPUSD', 'USDCHF', 'NQ'], m: [[1, 0.8, -0.7, 0.1], [0.8, 1, -0.6, 0.1], [-0.7, -0.6, 1, 0], [0.1, 0.1, 0, 1]] };
  const nc = netClaims(net); assert.equal(nc[0].kind, 'net_as_one'); assert.equal(nc[0].members.length, 2); assert.equal(nc[0].cue, 'Moving as one');
  assert.deepEqual(netClaims({ ids: ['NQ'], m: [[1]] }), []);
  const ms = Date.parse('2026-11-27T13:30:00Z'), day = { events: [{ ms, hm: '13:30', ccy: 'USD', rank: 3, name: 'Core PCE Price Index m/m', short: 'core PCE', actual: '0.3%', forecast: '0.2%' }] };
  const rc = reviewClaims(day, { '13:30|USD': { movePct: 0.12, ratio: 1.4 } }, ms + 3 * 3600e3);
  assert.deepEqual(rc.map(c => c.kind), ['release_vs_expected', 'release_reaction']); assert.equal(rc[0].dir, 'above'); assert.equal(rc[1].pair, 'EURUSD'); assert.equal(rc[1].sign, -1);
});

test('collectClaims via the plan and the record: lead claims always spoken, a cue trimmed away is marked unspoken', () => {
  const rows = [{ key: 'GOLD', ratio: 2.4, oc: 1.9, tone: 'up', hl: 1.4, range: 1.6 }, { key: 'NQ', ratio: 0.2, oc: 0.1, tone: 'quiet', hl: 0.7, range: 1.4 }, { key: 'EURUSD', ratio: 0.3, oc: 0.05, tone: 'quiet', hl: 0.2, range: 0.6 }];
  const inp = { now: new Date('2026-11-27T07:05:00Z'), rows, movers: rows.filter(r => r.tone !== 'quiet'), board: { n: 3, up: 1, dn: 0, quiet: 2 } };
  const P = planBroadcast(inp, { mode: 'full' });
  const c = collectClaims(P, 'morning');
  const mb = c.find(x => x.kind === 'mover_big'); assert.ok(mb && mb.spoken && mb.key === 'GOLD' && mb.part === 'morning');
  const ru = c.find(x => x.kind === 'range_used'); assert.ok(ru, 'the ranges scene tags its "already used" sentence'); assert.equal(ru.spoken, true);
  const fake = { items: [{ kind: 'scene', text: 'Short line.', scene: { claims: [{ kind: 'range_used', key: 'GOLD', cue: 'has already used' }] } }] };
  assert.equal(collectClaims(fake)[0].spoken, false);
  const body = dayRecordBody(inp, P, { part: 'morning', now: Date.parse('2026-11-27T07:05:00Z') }); assert.ok(body.claims.length >= 2);
});
