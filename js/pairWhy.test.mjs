// Shape and honesty tests for js/pairWhy.js.   node js/pairWhy.test.mjs
import { buildPairWhy, NODE_FOR } from './pairWhy.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const csr = [{ ccy: 'NZD', score: 0.37 }, { ccy: 'AUD', score: 0.31 }, { ccy: 'CHF', score: -0.02 }, { ccy: 'EUR', score: -0.24 }, { ccy: 'USD', score: -0.40 }];
const NOW = Date.parse('2026-10-21T21:00:00Z');
const links = [
  { id: 'real-nq', short: 'real yield → growth stocks', textbook: 'Higher real yields hit growth stocks hardest', verdict: 'broken', read: 'Real yields down, Nasdaq down: growth scare.', a: { key: 'real', label: 'Real yield', text: '-11bp' }, b: { key: 'nq', label: 'Nasdaq', text: '-2.2%' } },
  { id: 'hy-nq', short: 'credit → growth stocks', textbook: 'Wider credit spreads, lower growth stocks', verdict: 'quiet', a: { key: 'hy', label: 'Credit', text: '+4bp' }, b: { key: 'nq', label: 'Nasdaq', text: '-2.2%' } },
  { id: 'oil-usdcad', short: 'oil → CAD', textbook: 'Oil up, CAD stronger', verdict: 'holding', a: { key: 'oil', label: 'Oil', text: '+4%' }, b: { key: 'usdcad', label: 'USD/CAD', text: '-1.2%' } },
];

const nz = buildPairWhy({
  name: 'NZDUSD', ccys: ['NZD', 'USD'], csr, used: 0.84, hlMed: 0.0071,
  composites: { NZD: { composite: -0.06, factorsScored: 1, factorsTotal: 6 }, USD: { composite: 1, factorsScored: 1, factorsTotal: 6 } },
  links, event: { event: 'CPI q/q', time: '22:45', ms: NOW + 1.75 * 3.6e6, impact: 'High' }, now: NOW,
});
ok('flow: both extremes named, tells you to check other pairs', nz.points[0].key === 'flow' && /most-bought/.test(nz.points[0].body) && /most-sold/.test(nz.points[0].body));
ok('range says what it does NOT tell you', nz.points.find(p => p.key === 'range').body.includes('not which way'));
ok('range wording follows the fraction', /most of a typical day/.test(nz.points.find(p => p.key === 'range').body));
ok('macro on thin data says so and cites the null', (() => { const m = nz.points.find(p => p.key === 'macro'); return m.thin && /mostly a rates read/.test(m.body) && /null/.test(m.body); })());
ok('calendar: size not direction', (() => { const c = nz.points.find(p => p.key === 'calendar'); return c && c.kind === 'calendar' && /bigger move, not a known one/.test(c.body) && /about 2 hours/.test(c.body); })());
ok('NZDUSD has no chain node, so no chain points', !nz.points.some(p => p.key.startsWith('chain-')));
ok('lead names the flow, the range and what is next', /NZD \+0.37 and USD -0.40/.test(nz.lead) && /84% of the expected range used/.test(nz.lead) && /next: CPI q\/q/.test(nz.lead), nz.lead);

const nq = buildPairWhy({ name: 'NAS100', used: 0.78, links, now: NOW });
ok('NAS100 maps to nq and gets broken before quiet, max two', nq.points.filter(p => p.key.startsWith('chain-')).length === 2 && nq.points[0].key === 'chain-real-nq');
ok('broken link is explained as information', /A broken link is information/.test(nq.points[0].body));
ok('quiet link says "not judged today", not a weak yes', /not a weak yes/.test(nq.points[1].body));
ok('no FX flow or macro point for an index', !nq.points.some(p => p.key === 'flow' || p.key === 'macro'));
ok('a holding link on the pair\'s own node is explained', (() => { const p = buildPairWhy({ name: 'USDCAD', links, now: NOW }).points.find(x => x.key === 'chain-oil-usdcad'); return !!p && /the usual mechanism is doing the pricing/.test(p.body); })());
ok('node aliases', NODE_FOR.NAS100 === 'nq' && NODE_FOR.XAUUSD === 'gold');

ok('a far-off event is left out', !buildPairWhy({ name: 'EURUSD', event: { event: 'X', ms: NOW + 30 * 3.6e6 }, now: NOW }).points.some(p => p.key === 'calendar'));
ok('a just-printed event is worded that way', /has just printed/.test(buildPairWhy({ name: 'EURUSD', event: { event: 'CPI y/y', ms: NOW - 3600e3 }, now: NOW }).points[0].body));
ok('empty input still builds with a plain lead', buildPairWhy({ name: 'XYZ' }).lead === 'No measured driver stands out for this instrument today.');
ok('never states a direction or a forecast', !JSON.stringify([nz, nq]).match(/\bwill (rise|fall|go|move|drop)\b|\bbullish\b|\bbearish\b|predicts?\b/i));
ok('the foot says it explains and does not forecast', /does not forecast/.test(nz.foot) && /null/.test(nz.foot));
let threw = false; try { buildPairWhy({}); } catch { threw = true; }
ok('name is required', threw);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
