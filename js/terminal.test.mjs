import assert from 'node:assert/strict';
import { riskMonitor, movers, matrix, eventRisk, feedHealth, deskBrief, liveTape, tapeHealth } from './terminal.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const row = (key, last, change, z, extra = {}) => ({ key, label: key, last, change, z, kind: 'price', ...extra });

const BOARD = [
  row('vix', 14.9, -1.0, -0.2), row('vixterm', 3.2, 0.5, 0.2),
  row('hy', 2.66, -3, 0.0), row('ccc', 10.77, 41, 0.6), row('ig', 0.77, -4, 0.4),
  row('us2y', 4.76, 52, 2.4), row('curve', 0.20, -26, -2.4),
  row('dxy', 119.51, 1.2, 1.1), row('dspx', 36.4, 1.7, 0.4, { pct: 0.95 }),
];
const STATE = { breadth: { concentration: -5.5, sectorsUp: 2, sectorsTotal: 11, spread: 15.4 } };

t('there is no composite score, only a count of what is elevated', () => {
  const r = riskMonitor(BOARD, STATE, null);
  assert.equal(r.gauges.length, 6);
  assert.equal(r.elevated + r.stressed + r.calm + r.gauges.filter(g => g.state === 'unknown').length, r.gauges.length);
  assert.equal('score' in r, false, 'a weighted index of things nobody weighted is the least defensible number available');
  assert.equal('overall' in r, false);
  for (const g of r.gauges) assert.ok(g.value !== undefined && g.sub && g.note, `${g.id} incomplete`);
});

t('an inverted VIX curve dominates the level, because it is the tested one', () => {
  const inv = BOARD.map(b => b.key === 'vixterm' ? row('vixterm', -2.1, -3, -0.9) : b);
  const g = riskMonitor(inv, STATE, null).gauges.find(x => x.id === 'vol');
  assert.equal(g.state, 'stressed');
  assert.match(g.sub, /INVERTED/);
  assert.match(g.note, /wider range, not direction/);
  // and a normal curve with a quiet VIX is calm despite the same level
  assert.equal(riskMonitor(BOARD, STATE, null).gauges.find(x => x.id === 'vol').state, 'calm');
});

t('narrow breadth registers as stress without anything else moving', () => {
  const g = riskMonitor(BOARD, STATE, null).gauges.find(x => x.id === 'breadth');
  assert.equal(g.state, 'stressed');
  assert.match(g.value, /-5\.5%/);
  const broad = riskMonitor(BOARD, { breadth: { concentration: 0.4, sectorsUp: 9, sectorsTotal: 11, spread: 4 } }, null);
  assert.equal(broad.gauges.find(x => x.id === 'breadth').state, 'calm');
});

t('a stale options book reads as unknown, never as calm', () => {
  const stale = riskMonitor(BOARD, STATE, { ok: true, stale: true, ageH: 54, rows: [{ inside: true }] });
  const g = stale.gauges.find(x => x.id === 'positioning');
  assert.equal(g.state, 'unknown');
  assert.equal(g.value, 'STALE');
  assert.match(g.sub, /54h old/);
  // and no book at all means no gauge, rather than a gauge with no data
  assert.equal(riskMonitor(BOARD, STATE, null).gauges.some(x => x.id === 'positioning'), false);
});

t('movers rank by how unusual the move is for that market, not by size', () => {
  const b = [row('a', 1, 12, 0.4), row('b', 1, 2, 3.1), row('c', 1, -1, -2.8), row('d', 1, -20, -0.3)];
  const m = movers(b, 2);
  assert.deepEqual(m.up.map(x => x.key), ['b', 'a'], '+2 at z 3.1 outranks +12 at z 0.4');
  assert.deepEqual(m.down.map(x => x.key), ['c', 'd']);
});

t('a group is summarised by SHARE, never by averaging different units', () => {
  const rows = [
    { group: 'Rates', d1: 2, d5: 5, d20: 40, shape: 'steady' },
    { group: 'Rates', d1: -1, d5: 3, d20: 30, shape: 'stalling' },
    { group: 'FX', d1: -0.2, d5: -0.5, d20: -2, shape: 'steady' },
  ];
  const m = matrix(rows);
  const rates = m.find(x => x.group === 'Rates');
  assert.deepEqual(rates.d20, { up: 2, n: 2, share: 1 });
  assert.equal(rates.tone, 'broadly up');
  assert.deepEqual(rates.shapes, { steady: 1, stalling: 1 });
  assert.equal(m.find(x => x.group === 'FX').tone, 'broadly down');
  // no mean anywhere -- averaging bp and per cent produces a number with no meaning
  for (const g of m) for (const w of ['d1', 'd5', 'd20']) assert.equal('mean' in (g[w] ?? {}), false);
});

t('events are grouped by day, de-duplicated, and the next two days flagged', () => {
  const now = Date.UTC(2026, 8, 23, 12, 0);
  const ev = [
    { ms: Date.UTC(2026, 8, 24, 1, 30), ccy: 'AUD', rank: 3, event: 'Employment Change' },
    { ms: Date.UTC(2026, 8, 24, 1, 30), ccy: 'AUD', rank: 3, event: 'Employment Change' },   // the feed really does this
    { ms: Date.UTC(2026, 8, 29, 9, 0), ccy: 'USD', rank: 3, event: 'Core PCE' },
    { ms: Date.UTC(2026, 7, 1, 9, 0), ccy: 'USD', rank: 3, event: 'in the past' },
    { ms: Date.UTC(2027, 0, 1, 9, 0), ccy: 'USD', rank: 3, event: 'too far out' },
  ];
  const r = eventRisk(ev, now, { days: 10 });
  assert.equal(r.length, 2, 'past and far-future dropped');
  assert.equal(r[0].n, 1, 'the duplicate is collapsed');
  assert.equal(r[0].imminent, true);
  assert.equal(r[1].imminent, false);
  assert.ok(r[0].date < r[1].date, 'soonest first');
});

t('missing inputs produce dashes, never NaN or a crash', () => {
  for (const bad of [[], null, undefined]) {
    assert.doesNotThrow(() => riskMonitor(bad, null, null));
    assert.doesNotThrow(() => movers(bad ?? []));
    assert.doesNotThrow(() => matrix(bad ?? []));
    assert.doesNotThrow(() => eventRisk(bad ?? []));
  }
  const r = riskMonitor([], null, null);
  for (const g of r.gauges) {
    assert.doesNotMatch(String(g.value), /NaN|undefined/);
    assert.doesNotMatch(String(g.sub), /NaN|undefined/);
  }
});

t('an empty calendar past the file end is UNKNOWN, never clear', () => {
  const now = Date.UTC(2026, 8, 23);
  const csvEnd = Date.UTC(2026, 6, 2);                 // the file really did end here
  const dead = feedHealth({ to: '2026-09-22', n: 1583, series: {} }, null, { csvLastMs: csvEnd, events: [] }, now);
  const cal = dead.rows.find(r => r.id === 'calendar');
  assert.equal(cal.state, 'bad', 'both sources silent must not read as a quiet diary');
  assert.match(cal.detail, /treat as UNKNOWN, not clear/);
  // and a live feed that actually answered is fine
  const live = feedHealth({ to: '2026-09-22', n: 1583, series: {} }, null,
    { csvLastMs: csvEnd, events: [{ ms: now + 864e5 }] }, now);
  assert.equal(live.rows.find(r => r.id === 'calendar').state, 'ok');
});

t('feed health flags a stale board, carried series and an old book', () => {
  const now = Date.UTC(2026, 8, 23);
  const h = feedHealth({ to: '2026-09-01', n: 1500, series: { a: [] }, carried: ['gold'], missing: [] },
    { ok: true, stale: true, ageH: 54, count: 11 }, { csvLastMs: 0, events: [] }, now);
  assert.equal(h.rows.find(r => r.id === 'board').state, 'bad', '22 days behind is not ok');
  assert.equal(h.rows.find(r => r.id === 'series').state, 'warn');
  assert.match(h.rows.find(r => r.id === 'series').detail, /carried forward/);
  assert.equal(h.rows.find(r => r.id === 'book').state, 'warn');
  assert.match(h.rows.find(r => r.id === 'book').detail, /54h old/);
  assert.ok(h.bad >= 1 && h.warn >= 2);
  // a healthy set reports clean
  const ok = feedHealth({ to: new Date(now).toISOString().slice(0, 10), n: 1583, series: { a: [] }, carried: [], missing: [] },
    { ok: true, stale: false, ageH: 9, count: 11 }, { csvLastMs: 0, events: [{ ms: now }] }, now);
  assert.equal(ok.bad, 0);
});

t('the brief is terse, and every line carries a number', () => {
  const b = deskBrief({
    board: [row('tips', 2.62, 24, 1.4), row('bei', 2.33, 1, 0.1), row('us10y', 4.96, 26, 1.2),
            row('us2y', 4.76, 52, 2.4), row('curve', 0.2, -26, -2.4), row('dxy', 119, 1.2, 1.1)],
    sectors: [{ key: 'xlre', label: 'Real estate', change: -6.0 }, { key: 'xlu', label: 'Utilities', change: -5.9 }],
    state: { state: 'Narrow and concentrated', breadth: { sectorsUp: 2, sectorsTotal: 11, concentration: -5.5 } },
    horizons: [{ shape: 'reversing', label: 'Crude' }], links: [], health: null,
  });
  const tags = b.map(x => x.tag);
  assert.deepEqual(tags, ['STATE', 'DRIVING', 'LANDED', 'ROLLING', 'EXPOSED']);
  assert.match(b.find(x => x.tag === 'DRIVING').text, /96% real/);
  assert.match(b.find(x => x.tag === 'EXPOSED').text, /banks \(curve -26bp\)/);
  // terse: no line may be a paragraph, and none may explain a mechanism
  for (const l of b) {
    assert.ok(l.text.length < 220, `${l.tag} is running to prose: ${l.text}`);
    assert.doesNotMatch(l.text, /(because|which means|that is why|in other words)/i, `${l.tag} is teaching`);
    assert.doesNotMatch(l.text, /(will|expect|should|target)/i, `${l.tag} is predicting`);
  }
});

t('BLIND names what the screen cannot see, and only when something is down', () => {
  const health = { rows: [{ id: 'calendar', label: 'Economic calendar', state: 'bad', detail: 'feed returned nothing' },
                          { id: 'board', label: 'Price board', state: 'ok', detail: 'fine' }] };
  const b = deskBrief({ board: [], state: { state: 'X', breadth: {} }, health });
  const blind = b.find(x => x.tag === 'BLIND');
  assert.ok(blind, 'a dead feed must reach the brief');
  assert.equal(blind.bad, true);
  assert.match(blind.text, /economic calendar/);
  assert.doesNotMatch(blind.text, /price board/, 'a healthy feed must not be listed as blind');
  // nothing down, no BLIND line at all
  const clean = deskBrief({ board: [], state: { state: 'X', breadth: {} }, health: { rows: [{ state: 'ok', label: 'a', detail: 'b' }] } });
  assert.equal(clean.some(x => x.tag === 'BLIND'), false);
});

t('single names get their own line, because sectors cannot say which name it reached', () => {
  const names = ['NVIDIA', 'Apple', 'Meta', 'JPMorgan', 'Exxon'].map((n, i) =>
    ({ key: 'n' + i, label: n, group: 'Single names', change: 10 - i * 5, z: 1, kind: 'price' }));
  const b = deskBrief({ board: names, state: { state: 'X', breadth: {} } });
  const line = b.find(x => x.tag === 'NAMES');
  assert.ok(line, 'five names is enough to report');
  assert.match(line.text, /NVIDIA \+10\.0%/);
  assert.match(line.text, /Exxon -10\.0%/, 'and the laggards, which is the half that matters');
  // too few names to be worth a line
  assert.equal(deskBrief({ board: names.slice(0, 2), state: { state: 'X', breadth: {} } }).some(x => x.tag === 'NAMES'), false);
});

t('a quiet board gets one honest line, not six empty ones', () => {
  const b = deskBrief({ board: [], sectors: [], state: null });
  assert.equal(b.length, 1);
  assert.match(b[0].text, /outside its own ordinary range/);
});

// ── the live tape: the one current thing on a page built from daily closes ──
const OPENS = {
  EURUSD: { session_open: 1.14466, ac: 'fx', dp: 5, regime: { label: 'RANGE' }, vol_pct: 4 },
  USDJPY: { session_open: 157.392, ac: 'fx', dp: 3 },
  GOLD:   { session_open: 4362.35, ac: 'commodity', dp: 2, current_price: 4300 },
  SPX500: { session_open: 7777, ac: 'index', dp: 1 },
};
const PRICES = {
  'EUR/USD': { price: 1.13845, digits: 5, pip: 0.0001, ageS: 12 },
  'USD/JPY': { price: 158.211, digits: 3, pip: 0.01, ageS: 8 },
  SPX500:    { price: 7723.6, digits: 1, pip: 1, ageS: 40 },
};

t("the live move is price minus the session open, in the instrument's own unit", () => {
  const rows = liveTape(OPENS, PRICES);
  const eur = rows.find(r => r.name === 'EURUSD');
  assert.equal(eur.move, -62, 'pips, not price');
  assert.equal(eur.pct, -0.54);
  assert.equal(eur.unit, 'pips');
  const jpy = rows.find(r => r.name === 'USDJPY');
  assert.equal(jpy.move, 82, 'a JPY pair is 0.01 a pip');
  const spx = rows.find(r => r.name === 'SPX500');
  assert.equal(spx.move, -53);
  assert.equal(spx.unit, 'pts');
});

// The feed keys gold as XAU/USD and the Nasdaq as NAS100/USD. A naive slash rule found
// four of eight and fell back to the brief's older price for the rest — a gap that
// looked exactly like data.
t('feed aliases resolve the instruments a slash rule cannot', () => {
  const opens = { GOLD: { session_open: 4362.35, ac: 'commodity', dp: 2 }, NQ: { session_open: 30500, ac: 'index', dp: 1 },
                  OIL: { session_open: 96, ac: 'commodity', dp: 2 }, SPX500: { session_open: 7777, ac: 'index', dp: 1 } };
  const px = { 'XAU/USD': { price: 4262.04, pip: 1, digits: 2, ageS: 30 }, 'NAS100/USD': { price: 30176.3, pip: 1, digits: 1, ageS: 30 },
               'WTICO/USD': { price: 95.1, pip: 1, digits: 2, ageS: 30 }, 'SPX500/USD': { price: 7668.9, pip: 1, digits: 1, ageS: 30 } };
  const rows = liveTape(opens, px);
  assert.equal(rows.length, 4);
  assert.ok(rows.every(r => r.fromStream), 'every one resolved to a real quote');
  assert.equal(rows.find(r => r.name === 'GOLD').move, -100);
  assert.equal(rows.find(r => r.name === 'NQ').move, -324);
});

// The upstream writes every ~5 minutes, so a 3-minute threshold would paint the strip
// amber all day — a marker that always fires teaches nothing.
t('the stale threshold matches how often the source actually writes', () => {
  const opens = { EURUSD: { session_open: 1.14466, ac: 'fx', dp: 5 } };
  const at300 = liveTape(opens, { 'EUR/USD': { price: 1.138, pip: 0.0001, ageS: 300 } });
  assert.equal(at300[0].stale, false, '5 minutes is how this feed normally behaves');
  assert.equal(tapeHealth(at300).state, 'ok');
  const at900 = liveTape(opens, { 'EUR/USD': { price: 1.138, pip: 0.0001, ageS: 900 } });
  assert.equal(at900[0].stale, true, 'fifteen minutes is a feed that has stopped');
  assert.equal(at300[0].ageS, 300, 'the exact age travels regardless of the verdict');
});

t('a slash-named quote is matched to the six-letter instrument', () => {
  const rows = liveTape(OPENS, PRICES);
  assert.equal(rows.find(r => r.name === 'EURUSD').fromStream, true, "'EUR/USD' must find 'EURUSD'");
  // gold has no live quote, so it falls back to the brief's own price and says so
  const gold = rows.find(r => r.name === 'GOLD');
  assert.equal(gold.fromStream, false);
  assert.equal(gold.price, 4300);
  assert.equal(gold.ageS, null);
});

t('rows are ranked by how much they have moved, not alphabetically', () => {
  const rows = liveTape(OPENS, PRICES);
  const pcts = rows.map(r => Math.abs(r.pct));
  assert.deepEqual(pcts, [...pcts].sort((a, b) => b - a));
});

t('an instrument with no open, or a zero open, is dropped rather than divided by', () => {
  assert.equal(liveTape({ X: { ac: 'fx' } }, {}).length, 0);
  assert.equal(liveTape({ X: { session_open: 0, ac: 'fx', current_price: 1 } }, {}).length, 0);
  assert.equal(liveTape(null, null).length, 0);
  assert.equal(liveTape({ EURUSD: OPENS.EURUSD }, PRICES, { only: ['GOLD'] }).length, 0, 'the filter is respected');
});

// A feed that has stopped and a market that has stopped look identical on a screen.
t('a dead feed is reported, never drawn as a calm market', () => {
  const fresh = liveTape(OPENS, PRICES);
  assert.equal(tapeHealth(fresh).state, 'ok');
  assert.equal(tapeHealth(fresh).worstAgeS, 40);

  // only EURUSD, so "every quote is stale" is unambiguous — gold has no live quote at
  // all and would otherwise sit in the same strip as a different kind of not-live
  const old = liveTape(OPENS, { 'EUR/USD': { price: 1.13845, pip: 0.0001, ageS: 900 } }, { only: ['EURUSD'] });
  const h = tapeHealth(old);
  assert.equal(h.state, 'bad');
  assert.match(h.detail, /the feed has stopped, the market has not necessarily/);

  const mixed = liveTape(OPENS, { 'EUR/USD': { price: 1.13845, pip: 0.0001, ageS: 900 }, 'USD/JPY': { price: 158.211, pip: 0.01, ageS: 5 } }, { only: ['EURUSD', 'USDJPY'] });
  assert.equal(tapeHealth(mixed).state, 'warn');

  assert.equal(tapeHealth([]).state, 'bad');
  assert.match(tapeHealth([]).detail, /not a quiet market/);
  // prices that came only from the brief are minutes old and must not read as live
  assert.equal(tapeHealth(liveTape({ GOLD: OPENS.GOLD }, {})).state, 'warn');
});

console.log(`terminal: ${n} groups, all passed`);
