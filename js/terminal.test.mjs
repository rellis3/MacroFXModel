import assert from 'node:assert/strict';
import { riskMonitor, movers, matrix, eventRisk } from './terminal.js';

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

console.log(`terminal: ${n} groups, all passed`);
