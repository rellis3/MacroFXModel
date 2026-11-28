// js/terminal/helixScript.test.mjs: the Helix broadcast SCRIPT, read as words (the evening briefing of Fri 27 Nov 2026, a US half day, had "2.4 percent, the gold", "Gold edges
// higher 2.4%" under a "QUIET DAY" kicker on a 2x day, "A quiet start" at night, "no of one the called way", "The bigger picture: 4, the of 38 central banks...", "the last hour"
// on a thin Friday night). Each fix has its case here, and a SCRIPT LINT runs the planner over fixture days and fails on the phrases that should never be spoken.
// Run: node --test js/terminal/helixScript.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBroadcast, openerLine, heroFig, dateWords, BUILTIN, SEGMENTS, GUIDE_TEXT, countWord } from './broadcastCore.js';
import { tuneHeadline, sizeVerb } from './broadcastHeadline.js';
import { biasDayText, curveText, closeAge } from './broadcastPanels.js';
import { buildLanes, ratePathsScript, saneRungs, SANE_BP } from './ratePathsCore.js';
import { holoModel, fxgridScript, scriptWindow } from './fxHoloCore.js';
import { boardSummary, topMovers } from './jarvisCandles.js';
import { pillarScript } from './gammaHoloCore.js';

// ── a board like 27 Nov: gold about twice its usual move, silver and copper bigger, about two in five markets past their typical range ──
const row = (key, oc, ratio, hl = null, range = null) => ({ key, oc, ratio, noise: Math.abs(oc / ratio) || 1, tone: Math.abs(ratio) < 0.5 ? 'quiet' : ratio > 0 ? 'up' : 'dn', hl, range });
const BUSY = [row('SILVER', 5.2, 2.3, 6, 3), row('COPPER', 3.1, 1.9, 4, 2.2), row('GOLD', 2.4, 2.0, 2.9, 1.6), row('NQ', 0.2, 0.2, 0.5, 1.2), row('SPX500', 0.1, 0.15, 0.4, 0.9),
  row('EURUSD', -0.05, -0.1, 0.3, 0.55), row('USDJPY', 0.1, 0.2, 0.4, 0.6), row('GBPUSD', 0.15, 0.3, 0.5, 0.6), row('BRENT', 0.4, 0.3, 1.0, 1.9), row('WTI', 0.5, 0.35, 1.1, 2.0),
  row('BTCUSD', 1.1, 0.4, 2.2, 3.5), row('DE30', 0.3, 0.4, 0.6, 1.0), row('AUDUSD', 0.3, 0.6, 0.7, 0.6), row('NZDUSD', 0.4, 0.8, 0.8, 0.6), row('USDCAD', -0.1, -0.3, 0.3, 0.4),
  row('USDCHF', -0.2, -0.4, 0.5, 0.5), row('PLATINUM', 2.0, 1.1, 2.8, 2.3), row('UK100', 0.1, 0.2, 0.3, 0.8)];
const QUIET = BUSY.map(r => row(r.key, r.oc / 8, r.ratio / 8, r.range * 0.4, r.range));
const NOW = { friEve: new Date('2026-11-27T21:10:00Z'), tueEve: new Date('2026-11-24T21:00:00Z'), tueAm: new Date('2026-11-24T07:30:00Z'), thuAm: new Date('2026-11-26T07:30:00Z'), friAm: new Date('2026-11-27T07:05:00Z') };
const HEAD = { kicker: 'QUIET DAY · FRIDAY 27 NOVEMBER', headline: 'Gold edges higher 2.4%', figure: { value: '2.4%', label: 'Gold' }, tone: 'up', key: 'GOLD', keys: ['GOLD'], means: '', say: 'The headline: Gold edges higher 2.4%.' };
const inpOf = (rows, now, extra = {}) => ({ now, rows, movers: topMovers(rows, 6), board: boardSummary(rows), chain: null, events: [], extra: {}, headline: HEAD, ...extra });

// ── stand-in scenes with the SHAPES the real ones gave on 27 Nov (their figures are what leaked into the segues) ──
const rb = { tenors: [{ k: '2y', level: 3.52, chg5d: -3 }], slopes: [{ k: '2s10s', bp: 24, asOf: '2026-11-25', ageDays: 2, chg5d: -5, pct1y: 1 }] };
const FX = { ok: true, asOf: '2026-11-27T21:00:00Z', closed: false, horizons: Object.fromEntries(['1H', '4H', '1D', '1W'].map((k, i) => [k, { available: true, flat: false, from: '', to: '', unitPct: 0.03 * (i + 1),
  scores: ['NZD', 'GBP', 'AUD', 'CHF', 'EUR', 'JPY', 'CAD', 'USD'].map((c, j, a) => ({ ccy: k === '1D' ? a[(j + 3) % 8] : c, score: +(0.8 - j * 0.22).toFixed(2), rank: j + 1 })) }])) };
// the real pillar line (27 Nov said "spot is 26,721, 0.4 percent below": two numbers side by side)
const gpillarLine = pillarScript({ spot: 26721, flip: 26830, longAt: () => false, walls: [], callWall: null, putWall: null }, 'NQ');
const HOOKS = [
  { id: 'daymove', build: () => ({ title: 'Move of the day', view: 'session', text: 'The move of the day: gold. It opened at 4100, traded between 4090 and 4205, and stands at 4198 this evening. That is up 2.4 percent on the day, about 2 times its usual move.', figure: { value: '2.0×', label: 'Gold vs usual' } }) },
  { id: 'biasday', build: () => ({ title: 'The bias against the day', view: 'globe', text: biasDayText([{ key: 'GOLD', dir: 'up', bars: [], open: 1, last: 2, movePct: 1, moveU: 2, verdict: 'with', changes: [], desk: { dir: 'up', verdict: 'with' }, v1: { dir: 'dn', verdict: 'against' } }]), figure: { value: '1 / 1', label: 'went the called way' } }) },
  { id: 'moneyglobe', build: () => ({ title: 'The money globe', view: 'globe', text: 'Policy rates from the BIS, as of 24 November: over three months 4 of 38 central banks have cut and 20 have hiked.', figure: { value: '4', label: 'of 38 central banks cut over 3 months' } }) },
  { id: 'cbpaths', build: () => ({ title: 'Rate paths', view: 'cbpaths', text: 'Rate paths: what futures and swaps price for each central bank over the next year. The most easing is priced for the Reserve Bank of Australia, about 45 basis points of cuts.', figure: { value: '45 bp', label: '' } }) },
  { id: 'curve', build: (inp) => { const text = curveText(rb, +inp.now); return text ? { title: 'The Treasury curve', view: 'globe', text, figure: { value: '24 bp', label: '2s10s' } } : null; } },
  { id: 'fxgrid', build: (inp) => ({ title: 'Who has out-run whom', view: 'fxgrid', text: fxgridScript(holoModel(FX), { evening: dateWords(inp.now).hour >= 18 }) }) },
  { id: 'gpillar', build: () => ({ title: 'The gamma pillar', view: 'gpillar', text: gpillarLine, figure: { value: '0.4%', label: '' } }) },
];
const HAVE = new Set(HOOKS.map(h => h.id === 'daymove' ? 'session' : h.id === 'cbpaths' ? 'cbpaths' : h.id).concat(['session', 'fxgrid', 'gpillar', 'cbpaths']));
const plan = (inp, mode = 'full') => planBroadcast(inp, { hooks: HOOKS, have: HAVE, mode });
const spoken = P => P.items.map(x => x.text).filter(Boolean).join(' ');

test('1. the opener says the market and the move, never "<number>, the <label>"', () => {
  const d = dateWords(NOW.friEve);
  assert.equal(heroFig(HEAD), 'gold, up 2.4 percent');
  const o = openerLine({ date: d, part: 'evening', head: tuneHeadline(HEAD, { rows: BUSY }), when: 'tonight' });
  assert.ok(o.startsWith('Gold, up 2.4 percent: the number that leads tonight. Good evening.'), o);
  assert.doesNotMatch(o, /percent, the gold/);
  assert.equal(heroFig({ figure: { value: '13 bp', label: '' } }), '13 basis points', 'no market named: the number alone');
  assert.equal(heroFig({ ...HEAD, tone: 'dn', figure: { value: '−1.2%', label: 'Gold' } }), 'gold, down 1.2 percent');
});

test('2. the headline verb follows the move against its usual move; a big day is never kicked as a quiet one', () => {
  assert.deepEqual([0.5, 1.0, 2.0, 3.0].map(sizeVerb), ['edges higher', 'moves higher', 'jumps', 'surges']);
  assert.deepEqual([-0.5, -1.0, -2.0, -3.0].map(sizeVerb), ['drifts lower', 'moves lower', 'drops', 'slumps']);
  const h = tuneHeadline(HEAD, { rows: BUSY });
  assert.equal(h.headline, 'Gold jumps 2.4%'); assert.equal(h.say, 'The headline: Gold jumps 2.4%.');
  assert.equal(h.kicker, 'BIG MOVES · FRIDAY 27 NOVEMBER');
  const q = tuneHeadline({ ...HEAD, headline: 'Gold edges higher 0.3%', say: 'The headline: Gold edges higher 0.3%.' }, { rows: QUIET });
  assert.equal(q.kicker, 'QUIET DAY · FRIDAY 27 NOVEMBER', 'a quiet day keeps its kicker'); assert.equal(q.headline, 'Gold edges higher 0.3%');
  const wide = tuneHeadline(HEAD, { rows: QUIET.map(r => ({ ...r, hl: r.range * 1.2 })) });
  assert.equal(wide.kicker, 'WIDE RANGES · FRIDAY 27 NOVEMBER', 'two in five markets past their range');
  assert.equal(tuneHeadline({ ...HEAD, headline: 'EUR/USD slips 0.6% and Gold edges higher 2.4%', keys: ['EURUSD', 'GOLD'], say: 'The headline: Euro Dollar slips 0.6% and Gold edges higher 2.4%.' }, { rows: [row('EURUSD', -0.6, -1.2), row('GOLD', 2.4, 2.0)] }).say,
    'The headline: Euro Dollar moves lower 0.6% and Gold jumps 2.4%.');
  assert.equal(tuneHeadline(null), null);
});

test('3. the evening lead describes the day, never "a quiet start", and its counts do not fight each other', () => {
  const P = plan(inpOf(BUSY, NOW.friEve), 'quick'), lead = P.items.filter(x => x.kind === 'lead').map(x => x.text).join(' ');
  assert.doesNotMatch(lead, /quiet start/i); assert.doesNotMatch(lead, /barely moving/i);
  assert.match(lead, /A busy day beyond the headline\. Three of the 18 markets moved at least one and a half times their usual size, and six of 18 travelled further than their typical range\./);
  assert.match(lead, /Today was the day after Thanksgiving, a US half day, and the board still moved\./);
  const Q = plan(inpOf(QUIET, NOW.tueEve, { headline: null }), 'quick'), ql = Q.items.filter(x => x.kind === 'lead').map(x => x.text).join(' ');
  assert.match(ql, /A quiet day\. 18 of the 18 markets finished little changed against their usual size\./); assert.doesNotMatch(ql, /start/);
  assert.match(Q.items.find(x => x.seg?.id === 'markets' && x.kind === 'scene')?.text ?? '', /little changed\./, 'the evening Markets segue: little changed, not barely moving');
  const M = plan(inpOf(QUIET, NOW.tueAm, { headline: null }), 'quick');
  assert.match(M.items.find(x => x.kind === 'lead').text, /A quiet start\./, 'the morning keeps its quiet start');
});

test('4. zero as a count is "zero of" / "none", and the scored-calls scene is out of every broadcast and the guide', () => {
  const t = biasDayText([{ key: 'GOLD', dir: 'up', bars: [], open: 1, last: 0.5, movePct: -1, moveU: -2, verdict: 'against', changes: [], desk: { dir: 'dn', verdict: 'with' }, v1: { dir: 'up', verdict: 'against' } },
    { key: 'NQ', dir: 'up', bars: [], open: 1, last: 1.5, movePct: 1, moveU: 1, verdict: 'with', changes: [], desk: { dir: 'up', verdict: 'with' }, v1: null }]);
  assert.match(t, /The desk run: two of two went the called way, none against\./); assert.match(t, /Bias Engine V1: zero of one the called way, one against\./);
  assert.doesNotMatch(t, /\bno (of|against)\b/);
  assert.equal(countWord(0), 'none'); assert.equal(countWord(3), 'three');
  assert.ok(!SEGMENTS.some(s => s.tiers.flat().includes('biasday'))); assert.ok(!('biasday' in GUIDE_TEXT)); assert.doesNotMatch(GUIDE_TEXT.biasboard, /\bcalls?\b|long or short/); assert.doesNotMatch(Object.values(GUIDE_TEXT).join(' '), /scores every|called way/);
  for (const now of [NOW.friEve, NOW.tueEve]) for (const mode of ['quick', 'full']) assert.ok(!plan(inpOf(BUSY, now), mode).items.some(x => x.scene?.id === 'biasday'), `${mode} ${now.toISOString()}`);
  assert.ok(!planBroadcast(inpOf(BUSY, NOW.friEve), { hooks: HOOKS, have: HAVE, mode: 'guide' }).items.some(x => x.scene?.id === 'biasday'));
});

test('5. a figure stays on screen: the segue never speaks it as a bare number', () => {
  const s = spoken(plan(inpOf(BUSY, NOW.friEve)));
  for (const bad of [/the of 38/, /The bigger picture: 4/, /where the options sit: 0\.4 percent/, /The headline number:/]) assert.doesNotMatch(s, bad);
  assert.match(s, /The bigger picture\. Policy rates from the BIS/); assert.match(s, /Positioning, and where the options sit\. In Nasdaq options/);
  assert.match(s, /moves have tended to be amplified/, 'the gamma wording is kept');
  assert.match(gpillarLine, /^In Nasdaq options, spot is 26,721, which is 0\.4 percent below the gamma flip at 26,830/);
  const it = plan(inpOf(BUSY, NOW.friEve)).items.find(x => x.scene?.id === 'moneyglobe'); assert.equal(it.figure.value, '4', 'the figure is still on the card');
});

test('6. rate paths: the Fed\'s 75bp of hikes is the strip itself; the sanity guard drops expired and implausible rungs and says which', () => {
  // /api/fed-path zq.meetings and /api/cb-expectations USD rungs as served on 28 Nov 2026 (policy midpoint 3.875, ZQX6 3.877 = the November average)
  const meetings = [['2026-12-09', 3.88, 4.1266, 24.66], ['2027-01-27', 4.1266, 4.308, 18.14], ['2027-03-17', 4.29, 4.4671, 17.71], ['2027-04-28', 4.4671, 4.21, -25.71], ['2027-06-09', 4.515, 4.6007, 8.57],
    ['2027-07-28', 4.6007, 4.5417, -5.9], ['2027-09-15', 4.605, 4.605, 0], ['2027-10-27', 4.605, 4.605, 0]].map(([meeting, rBefore, rAfter, moveBp]) => ({ meeting, rBefore, rAfter, moveBp, probPct: moveBp * 4 }));
  const now = Date.parse('2026-11-27T21:00:00Z');
  const m = buildLanes({ cbx: { policy: { USD: { rate: 3.875 } }, banks: {} }, fed: { zq: { meetings } }, now });
  const fed = m.lanes.find(l => l.ccy === 'USD');
  assert.equal(fed.totalBp, 72.5, 'ZQV7 4.605 against the 3.88 November average: hikes priced, no sign flip, no expired rung');
  assert.match(ratePathsScript(m), /the most tightening for the Fed, about 75 basis points of hikes/);
  assert.deepEqual(m.dropped, []);
  // a bad print far from the rate is dropped with every meeting after it, and logged
  const bad = buildLanes({ cbx: { policy: { USD: { rate: 3.875 } }, banks: {} }, fed: { zq: { meetings: meetings.map((r, i) => (i === 4 ? { ...r, rAfter: 95.4 } : r)) } }, now });
  assert.equal(bad.lanes[0].meetings.length, 4); assert.equal(bad.dropped.length, 4); assert.match(bad.dropped[0].why, /past \+-150bp/);
  // a strip: an expired monthly rung (two months back), a three-month contract past its period, a price read as a rate
  const s1 = saneRungs({ kind: '1m', rungs: [{ month: '202609', local: 'ZQU6', rate: 5.9 }, { month: '202610', local: 'ZQV6', rate: 3.9 }, { month: '202611', local: 'ZQX6', rate: 3.877 }, { month: '202612', local: 'ZQZ6', rate: 95.9 }] }, 3.875, now);
  assert.deepEqual(s1.bank.rungs.map(r => r.local), ['ZQV6', 'ZQX6'], 'last month stays: it anchors the next meeting');
  assert.deepEqual(s1.dropped.map(d => `${d.local} ${d.why.split(',')[0]}`), ['ZQU6 expired', 'ZQZ6 implies 9203bp']);
  const s3 = saneRungs({ kind: '3m', rungs: [{ month: '202609', local: 'SO3M6', rate: 3.9 }, { month: '202612', local: 'SO3U6', rate: 3.86 }, { month: '202703', expiry: '20270317', local: 'SO3Z6', rate: 4.3 }] }, 4, now);
  assert.deepEqual(s3.bank.rungs.map(r => r.local), ['SO3U6', 'SO3Z6']); assert.equal(s3.dropped[0].why, 'expired');
  const same = { kind: '3m', rungs: [{ month: '202612', rate: 2.4 }] }; assert.equal(saneRungs(same, 2.5, now).bank, same, 'nothing dropped: the bank object is untouched');
  assert.equal(SANE_BP, 150);
});

test('7. the curve says why the close is old', () => {
  assert.match(curveText(rb, +NOW.friEve), /^The Treasury curve at the latest published close, Wednesday's, since Thursday was Thanksgiving, a US holiday: the two-to-ten year spread is 24 basis points/);
  assert.equal(closeAge('2026-11-26', 1, Date.parse('2026-11-27T07:00:00Z')), '', 'yesterday\'s close is the latest due');
  assert.equal(closeAge('2026-11-20', 3, Date.parse('2026-11-23T07:00:00Z')), " as of Friday's close", 'a weekend is not a gap');
  assert.equal(closeAge('2026-11-18', 3, Date.parse('2026-11-21T07:00:00Z')), " at the latest published close, Wednesday's", 'an unexplained gap says only that it is the latest');
});

test('8. range used carries its base rate', () => {
  const t = BUILTIN.rangeused({ rows: BUSY }).text;
  assert.match(t, /\w+ of 18 markets ran past their typical range\. The typical range is the median day, so on an ordinary day about half of them would[.;]/);
  assert.match(BUILTIN.rangeused({ rows: QUIET }).text, /None of the 18 markets ran past its typical range\. The typical range is the median day, so on an ordinary day about half of them would; today ran narrow\./);
});

test('9. the currency matrix reads the day at night, not a thin last hour', () => {
  const mo = holoModel(FX);
  assert.equal(scriptWindow(mo), '1H'); assert.equal(scriptWindow(mo, { evening: true }), '1D');
  assert.match(fxgridScript(mo, { evening: true }), /^Over the day, /); assert.match(fxgridScript(mo), /^Over the last hour, /);
  assert.match(fxgridScript(holoModel({ ...FX, closed: true })), /^Over the day, into the close, /);
});

// ── 10. THE SCRIPT LINT: every fixture day, every cut ──
const LINT = [[/\bthe of\b/i, '"the of"'], [/\bno of\b/i, '"no of"'], [/\bno against\b/i, '"no against"'], [/\bShort:/, '"Short:"'], [/\bLong:/, '"Long:"'], [/called way/i, '"called way"'], [/\b(?:the|morning's|desk's|engine's|of \w+) calls\b|\bcalls against\b/i, 'bias "calls"'],
  [/:\s+(?:minus\s+)?\d[\d.,]*(?:\s+(?:percent|basis points|times usual))?(?:,\s+the\s+[^.:]{0,60})?\.(?=\s|$)/, '": <bare number>."'], [/\b1 times\b/, '"1 times"'], [/1\.0×|\b1\.0 times\b/, '"1.0 times"'],
  [/\d\s+\d|\d,\s+\d/, 'two numbers side by side'], [/(?:percent|basis points|times usual), the [a-z ]+:/i, 'a figure label glued to a number'], [/quiet start\b[^.]*\btonight|tonight\b[^.]*quiet start/i, 'a quiet start at night']];
const DAYS = [['Fri 27 Nov evening, US half day, busy', BUSY, NOW.friEve], ['Tue evening, quiet', QUIET, NOW.tueEve], ['Tue evening, busy', BUSY, NOW.tueEve], ['Tue morning, busy', BUSY, NOW.tueAm],
  ['Thanksgiving morning, quiet', QUIET, NOW.thuAm], ['Fri morning, busy', BUSY, NOW.friAm]];
test('10. script lint: no fixture day, in any cut, says what the 27 Nov evening said', () => {
  for (const [name, rows, now] of DAYS) for (const head of [HEAD, null]) for (const mode of ['quick', 'full', 'short']) {
    const P = plan(inpOf(rows, now, { headline: head }), mode);
    for (const x of P.items) for (const [re, what] of LINT) assert.doesNotMatch(x.text ?? '', re, `${name} ${mode}${head ? '' : ' (no headline)'}: ${what} in [${x.kind}${x.scene ? `:${x.scene.id}` : ''}] ${x.text}`);
    if (now.getUTCHours() >= 18) assert.ok(!P.items.some(x => x.kind === 'lead' && /quiet start/i.test(x.text)), name);
  }
});
