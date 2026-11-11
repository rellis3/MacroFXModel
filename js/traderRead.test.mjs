// Tests for js/traderRead.js.   node js/traderRead.test.mjs
import { zOf, followThrough, twoClocks, crowdedExposed, newsVsPrice, checklist, storyByWindow } from './traderRead.js';
import { evaluateChain, CHAIN_NODES } from './macroChain.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const V = o => Object.fromEntries(Object.entries(o).map(([k, d]) => [k, { delta: d, last: 1 }]));

console.log('noise units');
{ ok('20-day move in units of the plain floor', Math.abs(zOf(V({ nq: 4 }), 'nq', 20) - 4 / CHAIN_NODES.nq.floor) < 1e-9);
  ok('1-day floor is scaled by √(1/20)', Math.abs(zOf(V({ nq: 1 }), 'nq', 1) - 1 / (CHAIN_NODES.nq.floor * Math.sqrt(1 / 20))) < 1e-9);
  ok('no data is null, not zero', zOf({}, 'nq', 1) === null && zOf(V({ nq: 1 }), 'nope', 1) === null); }

console.log('follow-through');
{ const big = 3 * CHAIN_NODES.nq.floor * Math.sqrt(1 / 20);
  const c = followThrough(V({ nq: -big, spx: -0.5, dxy: 0.01, usdjpy: 0.02, us2y: 0.3, us10y: 0.5 }), 1);
  ok('a big stock move nothing else follows is "contained"', c.verdict === 'contained' && /liquidation/.test(c.line), c.line);
  const f = followThrough(V({ nq: -big, dxy: 0.5, usdjpy: -0.9, us2y: -6, us10y: -8 }), 1);
  ok('two or more FX/rates markets past their band is "followed"', f.verdict === 'followed' && f.moved >= 2);
  ok('a small stock move is "quiet", nothing to test', followThrough(V({ nq: 0.1, dxy: 2 }), 1).verdict === 'quiet');
  ok('it is about size: the sign of the FX move does not matter', followThrough(V({ nq: big, dxy: -0.5, usdjpy: 0.9 }), 1).verdict === 'followed'); }

console.log('two clocks');
{ const s = V({ dxy: 0.5, gold: 2 }), l = V({ dxy: -2, gold: 5 });
  const t = twoClocks(s, 1, l, 20);
  ok('a market moving against its own monthly move past both bands is "opposed", and sorts first', t.rows[0].key === 'dxy' && t.rows[0].state === 'opposed' && t.opposed === 1);
  ok('the same way on both clocks is "aligned"', t.rows.find(r => r.key === 'gold').state === 'aligned');
  ok('the line names it', /Dollar/.test(t.line)); }

console.log('crowded and exposed');
{ const cot = { reportDate: '2026-11-03', instruments: { NQ: { crowd: 1, pct: 98, label: 'Crowded against the trend' }, EURUSD: { crowd: -1, pct: 0 }, GOLD: { crowd: 0, pct: 32 }, US30: { crowd: 0, pct: 59 } } };
  const big = 2 * CHAIN_NODES.nq.floor * Math.sqrt(1 / 20);
  const c = crowdedExposed(cot, V({ nq: -big, eurusd: -0.01 }), 1);
  ok('crowded long and falling past its band is "against" the crowd', c.rows.find(r => r.key === 'NQ').against === true && c.pressed === 1);
  ok('crowded rows sort first', c.rows[0].crowd !== 0 && c.rows[1].crowd !== 0);
  ok('an instrument with no chain node keeps its crowding but has no move', c.rows.find(r => r.key === 'US30').z === null);
  ok('the line never names a direction to trade', /says nothing about which way/.test(c.line));
  ok('no report says so', /not loaded/.test(crowdedExposed(null).line)); }

console.log('news against price');
{ const now = Date.parse('2026-11-11T12:00:00Z');
  const rec = [
    { event: 'Core CPI m/m', at: '2026-11-10T13:30:00Z', ms: Date.parse('2026-11-10T13:30:00Z'), surprise: { ok: true, z: 1.1, direction: 'above' }, markets: [{ id: 'eurusd', m30: 0.2, exp30: -0.1 }, { id: 'zt', m30: 0.05, exp30: -0.02 }] },
    { event: 'NFP', at: '2026-11-06T13:30:00Z', ms: Date.parse('2026-11-06T13:30:00Z'), surprise: { ok: true, z: -2, direction: 'below' }, markets: [{ id: 'eurusd', m30: 0.3, exp30: 0.2 }] },
    { event: 'small', ms: now - 3600e3, surprise: { ok: true, z: 0.4 }, markets: [{ id: 'eurusd', m30: 1, exp30: -1 }] },
    { event: 'old', ms: now - 40 * 864e5, surprise: { ok: true, z: 3 }, markets: [{ id: 'eurusd', m30: 1, exp30: -1 }] },
  ];
  const n = newsVsPrice(rec, { nowMs: now });
  ok('a clear surprise where price went the other way is "fought"', n.releases[0].call === 'price fought the news' && n.fought === 1);
  ok('one that moved as history says is "with"', n.releases[1].call === 'price went with the news');
  ok('small and old surprises are left out', n.releases.length === 2);
  ok('every market leaves a point for the chart', n.pts.length === 3); }

console.log('stories and the checklist');
{ const vals = V({ real: -30, nq: -6, gold: -8, dxy: -1, us10y: -30, bei: 1, oil: 1 });
  const links = evaluateChain(vals, undefined, undefined, 20);
  const s = storyByWindow({ 20: links, 1: evaluateChain(V({ real: -1, nq: 2 }), undefined, undefined, 1) });
  ok('a story per window', !!s.byWin[20]);
  const cl = checklist({ idea: s.byWin[20], links, ft: { verdict: 'contained' }, clocks: { opposed: 2 }, crowd: { rows: [{}], crowded: 1, pressed: 0 }, news: { fought: 0 }, events: [], nowMs: 0 });
  ok('eight questions, each with a state', cl.length === 8 && cl.every(q => ['ok', 'watch', 'broken', 'none', 'info'].includes(q.state)));
  ok('no follow-through flags the price-reaction question', cl.find(q => q.n === 5).state === 'watch');
  ok('two clocks pulling apart flag the horizon question', cl.find(q => q.n === 7).tag === '2 pulling apart');
  ok('no idea, no checklist', checklist({}).length === 0); }

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
