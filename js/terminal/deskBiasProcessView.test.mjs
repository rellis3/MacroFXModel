// The Desk Terminal "Bias process" tab (js/terminal/deskBiasProcessView.js): groups, sort, the card (layers, by, the override note, the invalidation
// line in its 'trade' surface), the head-to-head table (fixed competitor order, judgement points, the empty state), the weekly review and the
// FundaBias form's messages.   node --test js/terminal/deskBiasProcessView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from './deskBiasProcessView.js';
import { surfaceById } from './tabRegistry.js';
import { headToHead } from '../deskBiasH2H.js';

const card = (market, dir, conviction, by = 'ai-accept', extra = {}) => ({
  market, date: '2026-11-17',
  call: { dir, conviction, by, invalidation: dir === 'NEUTRAL' ? null : 4135.2 },
  system: { dir: extra.sysDir ?? dir, conviction: extra.sysConv ?? conviction, rule: 'macro and structure agree; W1 agrees' },
  ai: by.startsWith('ai') ? { decision: by === 'ai-override' ? 'OVERRIDE' : 'ACCEPT', reason: 'Macro and D1 agree; no tier-1 release pending.' } : null,
  invalidation: { level: 4135.2, basis: 'last confirmed D1 swing high (2026-11-12)' },
  layers: {
    event: { state: 'CLEAR', pending: [], laterToday: extra.later ?? [], previous: [] },
    regime: { risk: 'off', R: -0.6, vol: 'normal', volPct1y: 55, smile: 'left: risk-off, USD as haven', role: 1 },
    macro: { score: -0.42, side: -1, drivers: [{ key: 'policy', leg: 'USD', label: 'Policy path', contrib: -0.3 }, { key: 'data', label: 'Data momentum', contrib: -0.1 }, { key: 'x', label: 'third', contrib: 0.05 }] },
    structure: { w1: -1, d1: -1, h4: 1, swingHigh: { level: 4135.2, date: '2026-11-12' }, swingLow: { level: 3990.5, date: '2026-11-05' }, bos: 0, side: -1, price: 4050 },
    positioning: { crowded: true, crowdedSide: 1, readings: ['crowded long'] },
    range: { p50Pct: 1.21, p75Pct: 1.6, p50: 49.1, p75: 64.9, usedOfP50: 0.4, sigmaDay: 0.011 },
  },
});

test('groups and the conviction sort (Neutral last, ties keep the stored order)', () => {
  assert.deepEqual(['EURUSD', 'GOLD', 'NQ', 'SPX500', 'US30', 'WTI', 'GBPJPY'].map(V.groupOf), ['fx', 'metals', 'indices', 'indices', 'indices', 'commodities', 'fx']);
  const cs = [card('EURUSD', 'NEUTRAL', null, 'system'), card('GOLD', 'BEARISH', 2), card('NQ', 'BULLISH', 4), card('USDJPY', 'BULLISH', 2)];
  assert.deepEqual(V.filterSort(cs).map(c => c.market), ['NQ', 'GOLD', 'USDJPY', 'EURUSD']);
  assert.deepEqual(V.filterSort(cs, { sort: 'market' }).map(c => c.market), ['EURUSD', 'GOLD', 'NQ', 'USDJPY']);
  assert.deepEqual(V.filterSort(cs, { group: 'fx' }).map(c => c.market), ['USDJPY', 'EURUSD']);
  assert.deepEqual(V.filterSort(cs, { group: 'metals' }).map(c => c.market), ['GOLD']);
});

test('the card: direction chip and dots, by, reason, six layer rows, invalidation in its trade surface, the "system said" note on an override', () => {
  const h = V.cardHtml(card('GOLD', 'BEARISH', 3));
  assert.match(h, /class="chip dn bp-dir">▼ Bearish/); assert.equal((h.match(/<i class="on"><\/i>/g) ?? []).length, 3);
  assert.match(h, /by AI accept/); assert.match(h, /Macro and D1 agree/);
  for (const l of ['Event', 'Regime', 'Macro', 'Structure', 'Positioning', 'Day range']) assert.match(h, new RegExp(`<b>${l}</b>`));
  assert.match(h, /−0\.42 · USD Policy path −0\.30, Data momentum −0\.10/, 'the top two drivers only'); assert.doesNotMatch(h, /third/);
  assert.match(h, /W1 ▼ D1 ▼ H4 ▲ · swing H 4135\.2 · swing L 3990\.5 · inside swings/);
  assert.match(h, /p50 1\.21% · p75 1\.60%/); assert.match(h, /crowded long/);
  assert.match(h, /<div class="bp-inv" data-surface="panel\.bp\.invalid">Invalidation <b class="mono">4135\.2<\/b>/);
  assert.doesNotMatch(h, /system said/);
  const o = V.cardHtml(card('GOLD', 'BEARISH', 2, 'ai-override', { sysDir: 'NEUTRAL', sysConv: null }));
  assert.match(o, /by AI override/); assert.match(o, /system said Neutral/);
  const n = V.cardHtml(card('EURUSD', 'NEUTRAL', null, 'system'));
  assert.match(n, /▸?– Neutral/); assert.doesNotMatch(n, /bp-dots/); assert.doesNotMatch(n, /bp-inv/); assert.match(n, /Rules: macro and structure agree/);
  assert.equal(V.regimeSide(card('GOLD', 'BEARISH', 3)), -1, 'risk-off pushes a pro-risk market (role +1) down');
  assert.match(V.cardHtml({ market: 'X', call: { dir: 'BULLISH', conviction: 1 }, layers: {} }), /unknown/, 'missing layers say so, never crash');
});

test('the cards block: only groups that have a market get a pill; the head says live reads are rules only', () => {
  const rec = { date: '2026-11-17', version: 'desk-bias-process-v1', markets: { GOLD: card('GOLD', 'BEARISH', 3), EURUSD: card('EURUSD', 'BULLISH', 1) } };
  const h = V.cardsHtml(rec, { group: 'all' });
  assert.match(h, /data-group="fx"/); assert.match(h, /data-group="metals"/); assert.doesNotMatch(h, /data-group="indices"/);
  assert.match(V.cardsHtml({ markets: {} }), /not issued yet/);
  assert.match(V.headHtml({ ...rec, live: true, asOf: '2026-11-17T06:10:00Z' }), /live, rules only/);
  assert.match(V.headHtml(rec), /issue 2026-11-17/);
});

test('head to head: the empty state names the first issue day; a table has every competitor in the fixed order and the judgement points', () => {
  assert.equal(V.nextIssueDate(Date.parse('2026-11-17T06:30:00Z')), '2026-11-17');
  assert.equal(V.nextIssueDate(Date.parse('2026-11-17T09:00:00Z')), '2026-11-18');
  assert.equal(V.nextIssueDate(Date.parse('2026-11-20T09:00:00Z')), '2026-11-23', 'Friday after 07:00: Monday');
  assert.match(V.h2hHtml({ ok: true, empty: true }, { nowMs: Date.parse('2026-11-17T09:00:00Z') }), /first stored issue, 2026-11-18 at 06:00 London/);
  assert.match(V.h2hHtml({ ok: false, error: 'owner only' }), /owner only/);
  const bars = [], t0 = Date.parse('2026-11-16T00:00:00Z');
  for (let i = 0; i < 4 * 288; i++) bars.push({ t: t0 + i * 3e5, o: 100 + i * 0.01, h: 100 + i * 0.01 + 0.02, l: 100 + i * 0.01 - 0.02, c: 100 + i * 0.01 + 0.01, sp: 0.01 });
  const calls = ['2026-11-16', '2026-11-17'].flatMap(d => [
    { competitor: 'process-ai', market: 'EURUSD', date: d, ms: Date.parse(`${d}T07:35:00Z`), dir: 'BULLISH', conviction: 3, sigmaDay: 0.01, by: 'ai-override', systemDir: 'NEUTRAL' },
    { competitor: 'max-signals', market: 'EURUSD', date: d, ms: Date.parse(`${d}T09:00:00Z`), side: -1, sigmaDay: 0.01 }]);
  const H = headToHead({ calls, bars: { EURUSD: bars }, b: 50 });
  const rows = V.h2hRows(H);
  assert.deepEqual(rows.map(r => r.key), V.COMPETITORS.map(([k]) => k));
  assert.equal(rows[0].calls, 2); assert.equal(rows[0].hit, 1); assert.equal(rows.find(r => r.key === 'max-signals').hit, 0);
  assert.equal(rows.find(r => r.key === 'fundabias').has, false);
  const J = V.judgement(H);
  assert.equal(J.days, 2); assert.match(J.text, /First formal verdict at 60 shared days \(58 to go\)/);
  assert.equal(V.judgement({ days: 130, sharedDays: 125 }).points.every(p => p.reached), true);
  const html = V.h2hHtml({ ok: true, h2h: H });
  assert.match(html, /Override record \(process-ai\):<\/b> 2 overrides; the AI was better on 2/);
  assert.match(html, /Process \(AI\)/); assert.match(html, /FundaBias/); assert.match(html, /H4 trend/);
  assert.equal(V.calibText({ 3: { n: 4, hit: 0.5 }, 1: { n: 2, hit: 1 }, none: { n: 1, hit: 0 } }), '1: 100% (2) · 3: 50% (4) · n/a: 0% (1)');
});

test('weekly review: wrong calls with the layer that pointed the wrong way, override helped or hurt, an event after the call', () => {
  const recs = [
    { date: '2026-11-09', markets: { GOLD: card('GOLD', 'BEARISH', 3) } },   // outside the 7 days
    { date: '2026-11-16', markets: { GOLD: card('GOLD', 'BEARISH', 3, 'ai-accept', { later: [{ ccy: 'USD', event: 'Fed Chair speaks' }] }), EURUSD: card('EURUSD', 'BULLISH', 2, 'ai-override', { sysDir: 'BEARISH' }), NQ: card('NQ', 'NEUTRAL', null, 'system') } },
    { date: '2026-11-17', markets: { GOLD: card('GOLD', 'BEARISH', 2), USDJPY: card('USDJPY', 'BULLISH', 2, 'ai-override', { sysDir: 'NEUTRAL' }) } },
  ];
  const out = { 'GOLD|2026-11-09': { d21: { y: 1, ret: 0.01 } }, 'GOLD|2026-11-16': { d21: { y: 1, ret: 0.004 } }, 'EURUSD|2026-11-16': { d21: { y: 0, ret: -0.002 } }, 'NQ|2026-11-16': { d21: { y: 1, ret: 0.01 } },
    'GOLD|2026-11-17': { d21: { y: 0, ret: -0.003 } }, 'USDJPY|2026-11-17': { d21: { y: 1, ret: 0.002 } } };
  const R = V.weeklyReview(recs, out, { endDate: '2026-11-17' });
  assert.equal(R.from, '2026-11-11'); assert.equal(R.calls, 4); assert.equal(R.right, 2); assert.equal(R.wrong, 2);
  assert.deepEqual(R.overrides, { n: 2, helped: 1, hurt: 1, same: 0 });
  assert.deepEqual(R.rows.map(r => `${r.date} ${r.market}`), ['2026-11-16 EURUSD', '2026-11-16 GOLD']);
  const g = R.rows.find(r => r.market === 'GOLD');
  assert.deepEqual(g.wrongLayers, ['macro', 'structure', 'W1 trend', 'D1 trend', 'regime', 'positioning (contrarian)']); assert.deepEqual(g.eventAfter, ['USD Fed Chair speaks']); assert.equal(g.override, null);
  assert.equal(R.rows.find(r => r.market === 'EURUSD').override, 'hurt');
  const h = V.reviewHtml({ ok: true, review: R });
  assert.match(h, /2 wrong/); assert.match(h, /helped 1, hurt 1/); assert.match(h, /Fed Chair speaks/);
  assert.match(V.reviewHtml({ ok: true, empty: true }, { nowMs: Date.parse('2026-11-17T09:00:00Z') }), /first issue is 2026-11-18/);
  assert.equal(V.weeklyReview([], {}).rows.length, 0);
});

test('FundaBias form: validation and the server\'s answers in plain words', () => {
  assert.equal(V.fbBody({ market: '', dir: 'BULLISH', score10: '7' }).ok, false);
  assert.equal(V.fbBody({ market: 'GOLD', dir: null, score10: '7' }).error, 'Pick Bullish, Bearish or Neutral.');
  assert.equal(V.fbBody({ market: 'GOLD', dir: 'BULLISH', score10: '11' }).ok, false);
  assert.equal(V.fbBody({ market: 'GOLD', dir: 'BULLISH', score10: '' }).ok, false);
  assert.deepEqual(V.fbBody({ market: 'GOLD', dir: 'BEARISH', score10: '7' }).body, { market: 'GOLD', dir: 'BEARISH', score10: 7 });
  assert.match(V.fbMessage(409, { ok: false, error: 'GOLD is already logged for 2026-11-17 (write-once)' }).text, /already logged/);
  assert.match(V.fbMessage(403, { ok: false, error: 'owner only' }).text, /^Owner only/);
  assert.match(V.fbMessage(200, { ok: true, row: { market: 'GOLD', dir: 'BEARISH', score10: 7, loggedAt: '2026-11-17T08:12:00Z' } }).text, /Logged GOLD Bearish 7\/10 at 08:12 UTC/);
  assert.equal(V.fbMessage(500, null).ok, false);
  const h = V.fbHtml(['GOLD', 'EURUSD'], [{ market: 'GOLD', dir: 'BEARISH', score10: 7, loggedAt: '2026-11-17T08:12:00Z' }]);
  assert.match(h, /<option value="GOLD" disabled>GOLD \(logged\)/); assert.match(h, /<option value="EURUSD">EURUSD</);
});

test('surfaces: the tab is preview, the invalidation line trade, the head to head and review pnl, the form internal; colours are tokens', () => {
  assert.equal(surfaceById('tab.bprocess')?.hidden, 'preview');
  assert.equal(surfaceById('panel.bp.invalid')?.hidden, 'trade');
  assert.equal(surfaceById('panel.bp.h2h')?.hidden, 'pnl'); assert.equal(surfaceById('panel.bp.review')?.hidden, 'pnl');
  assert.equal(surfaceById('panel.bp.fundabias')?.hidden, 'internal');
  assert.doesNotMatch(V.CSS, /#[0-9a-fA-F]{3,6}\b|rgb\(\d/, 'theme tokens only');
});

test('intraday rechecks: the now line, the timeline and the schedule strip; nothing shown before the first recheck', () => {
  const tl = [
    { slot: 'morning', at: '2026-11-18T06:03:06Z', status: 'ISSUED', dir: 'NEUTRAL', conviction: null, by: 'ai-accept', reason: 'tier-1 release pending' },
    { slot: 'post-event-0700', at: '2026-11-18T07:31:00Z', status: 'ACTIVE', dir: 'BULLISH', conviction: 2, by: 'ai-accept', reason: 'rules agree', events: [{ country: 'GB', event: 'CPI y/y' }], reaction: { moveSigma: 0.42 } },
    { slot: 'london-open', at: '2026-11-18T08:06:00Z', status: 'WEAKENED→OVERRIDDEN', dir: 'NEUTRAL', conviction: null, by: 'ai-override', reason: 'range used', systemDir: 'BULLISH' },
  ];
  assert.equal(V.nowHtml({ timeline: tl.slice(0, 1) }), '');
  assert.equal(V.timelineHtml({ timeline: tl.slice(0, 1) }), '');
  const now = V.nowHtml({ timeline: tl.slice(0, 2) });
  assert.match(now, /Now active · After GB CPI y\/y 07:31/);
  const t = V.timelineHtml({ timeline: tl });
  assert.match(t, /2 rechecks/); assert.match(t, /Weakened, AI overrode/); assert.match(t, /rules: Bullish/); assert.match(t, /reaction \+0\.42σ/);
  assert.doesNotMatch(t, /4135|invalid/i, 'the timeline carries no stop level (that is the trade surface)');
  const h = V.cardHtml(card('GBPUSD', 'NEUTRAL', null), { timeline: tl });
  assert.match(h, /bp-now/); assert.match(h, /bp-tl/);
  const s = V.scheduleHtml({ ok: true, schedule: [{ id: 'post-event-0700', at: '2026-11-18T07:30:00Z', state: 'done', markets: 2, events: [{ country: 'GB', event: 'CPI y/y' }] }, { id: 'ny-open', at: '2026-11-18T14:35:00Z', state: 'later', markets: 13 }] });
  assert.match(s, /07:30 After GB CPI y\/y · done/); assert.match(s, /14:35 New York open · later/);
  assert.equal(V.scheduleHtml({ ok: true, empty: true }), '');
  assert.equal(V.statusText('HOLD'), 'Hold overnight');
});
