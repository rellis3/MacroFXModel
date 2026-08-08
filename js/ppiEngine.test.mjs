// Synthetic tests for ppiEngine.js. No network.
//   node js/ppiEngine.test.mjs
import { PPI_UNIVERSE, toSeries, yoyPct, ppiScore, ppiCompositeScore } from './ppiEngine.js';

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

console.log('[ppiScore — index-level series, YoY derived then z-scored vs own history]');
{
  const m = new Map();
  for (let i = 0; i < 13; i++) m.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 150 * (1 + (0.03 / 12) * i));
  const meta = { series: 'PPIFIS', isIndex: true };
  const r = ppiScore(m, meta);
  ok('latestYoy is ~3%', Math.abs(r.latestYoy - 3) < 0.3, r.latestYoy);
}

console.log('[ppiScore — pipeline pressure building reads positive vs own trailing history]');
{
  // 19 months flat at 1.5% YoY, then a clear step-up to 6% — pipeline
  // pressure building, the exact "early warning ahead of CPI" case.
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, 1.5);
  m.set('d19', 6);
  const meta = { series: 'x', isIndex: false };
  const r = ppiScore(m, meta);
  ok('latest print is the step-up (6)', r.latestYoy === 6);
  ok('z reads strongly positive (unusual vs its own recent history)', r.z > 2, r.z);
  ok('score saturates toward +1', r.score > 0.8, r.score);
}

console.log('[ppiCompositeScore — composite IS the headline score directly, core standalone]');
{
  const headline = new Map();
  const core = new Map();
  for (let i = 0; i < 13; i++) {
    headline.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 150 * (1 + (0.03 / 12) * i));
    core.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 145 * (1 + (0.025 / 12) * i));
  }
  const universe = PPI_UNIVERSE.USD;
  const r = ppiCompositeScore({ headline, core }, universe);
  ok('coverage lists headline + core', r.coverage.includes('headline') && r.coverage.includes('core'));
  ok('pressure equals the headline score directly', r.pressure === r.dims.headline.score);
  ok('core YoY derived correctly from its own index series (~2.5%)', Math.abs(r.dims.core.latestYoy - 2.5) < 0.2, r.dims.core.latestYoy);
}
{
  const r = ppiCompositeScore({}, PPI_UNIVERSE.USD);
  ok('empty input -> no dims, pressure null, not a crash', r.coverage.length === 0 && r.pressure === null);
}

console.log('[PPI_UNIVERSE sanity — USD-only by design]');
{
  ok('covers USD only', Object.keys(PPI_UNIVERSE).length === 1 && PPI_UNIVERSE.USD);
  ok('headline is PPIFIS (BLS Final Demand, the desk-quoted headline print)', PPI_UNIVERSE.USD.headline.series === 'PPIFIS');
  ok('core is PPIFES (Final Demand Less Foods and Energy)', PPI_UNIVERSE.USD.core.series === 'PPIFES');
  ok('both USD series are index levels', PPI_UNIVERSE.USD.headline.isIndex && PPI_UNIVERSE.USD.core.isIndex);
  ok('no non-USD entries (OECD family confirmed frozen since ~Dec 2022, not built against)', !PPI_UNIVERSE.EUR && !PPI_UNIVERSE.GBP && !PPI_UNIVERSE.JPY);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll ppiEngine tests passed.');
