// Synthetic tests for retailSalesEngine.js. No network.
//   node js/retailSalesEngine.test.mjs
import { RETAIL_SALES_UNIVERSE, toSeries, yoyPct, retailSalesScore, retailSalesCompositeScore } from './retailSalesEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[toSeries / yoyPct]');
{
  const m = new Map([['2024-02-01', 101], ['2024-01-01', 100]]);
  ok('sorted ascending', toSeries(m)[0].date === '2024-01-01');
  const idx = [];
  for (let i = 0; i < 13; i++) idx.push({ date: `m${i}`, value: 100 + i });
  const yoy = yoyPct(idx);
  ok('13th point has yoy (100->112, 12% growth)', Math.abs(yoy[12].yoy - 12) < 0.01, yoy[12].yoy);
}

console.log('[retailSalesScore — $-level series (USD-style), YoY derived then z-scored vs own history]');
{
  const m = new Map();
  for (let i = 0; i < 13; i++) m.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 100000 * (1 + (0.04 / 12) * i));
  const meta = { series: 'RSAFS', isIndex: true };
  const r = retailSalesScore(m, meta);
  ok('latestYoy is ~4%', Math.abs(r.latestYoy - 4) < 0.3, r.latestYoy);
}

console.log('[retailSalesScore — pre-computed YoY% series (OECD-style), not re-derived]');
{
  const m = new Map([['2024-01-01', 2.5], ['2024-02-01', 1.8]]);
  const meta = { series: 'SLRTTO01DEQ659S', isIndex: false, quarterly: true };
  const r = retailSalesScore(m, meta);
  ok('latestYoy is the raw value (1.8), not re-derived', r.latestYoy === 1.8, r.latestYoy);
}

console.log('[retailSalesScore — acceleration vs own trailing history reads positive]');
{
  // 19 points flat at 1%, then a clear step-up to 5%.
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, 1);
  m.set('d19', 5);
  const meta = { series: 'x', isIndex: false };
  const r = retailSalesScore(m, meta);
  ok('latest print is the step-up (5)', r.latestYoy === 5);
  ok('z reads strongly positive (unusual vs its own recent history)', r.z > 2, r.z);
  ok('score saturates toward +1', r.score > 0.8, r.score);
}

console.log('[retailSalesCompositeScore — composite IS the headline score directly]');
{
  const headline = new Map([['2024-01-01', 2.0], ['2024-02-01', 2.4]]);
  const exAutos = new Map([['2024-01-01', 1.0], ['2024-02-01', 1.5]]);
  const universe = RETAIL_SALES_UNIVERSE.USD;
  // USD's headline/exAutos are both isIndex:true $-levels — build 13-pt series.
  const h = new Map();
  const ex = new Map();
  for (let i = 0; i < 13; i++) {
    h.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 500000 * (1 + (0.03 / 12) * i));
    ex.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 400000 * (1 + (0.02 / 12) * i));
  }
  const r = retailSalesCompositeScore({ headline: h, exAutos: ex }, universe);
  ok('coverage lists headline + exAutos', r.coverage.includes('headline') && r.coverage.includes('exAutos'));
  ok('spending equals the headline score directly', r.spending === r.dims.headline.score);
}
{
  const r = retailSalesCompositeScore({}, RETAIL_SALES_UNIVERSE.USD);
  ok('empty input -> no dims, spending null, not a crash', r.coverage.length === 0 && r.spending === null);
}

console.log('[retailSalesScore — rounds long floating-point tails on pre-computed-YoY series]');
{
  const m = new Map([['2024-01-01', 2.943827113847]]);
  const meta = { series: 'SLRTTO01DEQ659S', isIndex: false, quarterly: true };
  const r = retailSalesScore(m, meta);
  ok('latestYoy rounds to 2dp', r.latestYoy === 2.94, r.latestYoy);
}

console.log('[RETAIL_SALES_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => RETAIL_SALES_UNIVERSE[c]));
  ok('USD has headline + exAutos, both index-level $ series', RETAIL_SALES_UNIVERSE.USD.headline.isIndex && RETAIL_SALES_UNIVERSE.USD.exAutos.isIndex);
  ok('non-USD currencies have only headline (no exAutos)', Object.entries(RETAIL_SALES_UNIVERSE).filter(([c]) => c !== 'USD').every(([, cfg]) => Object.keys(cfg).length === 1 && cfg.headline));
  ok('all 7 non-USD headline entries are pre-computed YoY (not index) and quarterly', Object.entries(RETAIL_SALES_UNIVERSE).filter(([c]) => c !== 'USD').every(([, cfg]) => !cfg.headline.isIndex && cfg.headline.quarterly));
  ok('all 7 non-USD entries use the uniform SLRTTO01 Q659S family', Object.entries(RETAIL_SALES_UNIVERSE).filter(([c]) => c !== 'USD').every(([, cfg]) => /^SLRTTO01[A-Z]{2}Q659S$/.test(cfg.headline.series)));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll retailSalesEngine tests passed.');
