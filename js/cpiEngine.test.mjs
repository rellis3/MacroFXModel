// Synthetic tests for cpiEngine.js. No network.
//   node js/cpiEngine.test.mjs
import { CPI_UNIVERSE, toSeries, yoyPct, latestZScore, levelVsTargetScore, trendScore, cpiScore } from './cpiEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[toSeries / yoyPct]');
{
  const m = new Map([['2024-01-01', 100], ['2024-02-01', 101]]);
  ok('sorted ascending', toSeries(m)[0].date === '2024-01-01');
  const idx = [];
  for (let i = 0; i < 13; i++) idx.push({ date: `m${i}`, value: 100 + i });
  const yoy = yoyPct(idx);
  ok('13th point has yoy (100->112, 12% growth)', Math.abs(yoy[12].yoy - 12) < 0.01, yoy[12].yoy);
}

console.log('[levelVsTargetScore — index-level series (USD-style)]');
{
  // A 13-month index series ending at a value implying +5% YoY (hot vs 2% target).
  const m = new Map();
  for (let i = 0; i < 13; i++) m.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 100 * (1 + (0.05 / 12) * i));
  const meta = { series: 'CPIAUCSL', isIndex: true };
  const r = levelVsTargetScore(m, meta);
  ok('latestYoy is ~5%', Math.abs(r.latestYoy - 5) < 0.5, r.latestYoy);
  ok('score is positive (above target = hawkish)', r.score > 0, r.score);
}

console.log('[levelVsTargetScore — pre-computed YoY% series (OECD-style)]');
{
  // OECD series ALREADY reports YoY% directly — must NOT be re-derived.
  const m = new Map([['2024-01-01', 1.5], ['2024-02-01', 1.2]]);
  const meta = { series: 'CPALTT01GBM659N', isIndex: false };
  const r = levelVsTargetScore(m, meta);
  ok('latestYoy is the raw value (1.2), not re-derived', r.latestYoy === 1.2, r.latestYoy);
  ok('score is negative (below 2% target = dovish)', r.score < 0, r.score);
}

console.log('[trendScore — disinflation-from-a-high-base reads as improving even while still hot]');
{
  // 30 points: YoY starts at 9%, steadily falls to 6% (still well above the
  // 2% target, but clearly decelerating relative to ITS OWN recent history).
  // Zero-padded index in the date string — plain `m${i}` sorts "m10" before
  // "m2" as STRINGS, scrambling chronological order (toSeries sorts
  // lexicographically), which silently corrupted this test's intended trend.
  const m = new Map();
  for (let i = 0; i < 30; i++) m.set(`d${String(i).padStart(2, '0')}`, 9 - (i * 3 / 29));
  const meta = { series: 'x', isIndex: false };
  const level = levelVsTargetScore(m, meta);
  const trend = trendScore(m, meta);
  ok('level still reads hot (well above target)', level.score > 0.5, level.score);
  ok('trend reads negative (cooling vs its own recent history)', trend.score < 0, trend.score);
}

console.log('[cpiScore — composite + core reported standalone]');
{
  const headline = new Map();
  for (let i = 0; i < 13; i++) headline.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 100 * (1 + (0.03 / 12) * i));
  // USD's core (CPILFESL) is ALSO an index level (isIndex:true), same as
  // headline — build a proper 13-point index series implying ~2.8% YoY,
  // not a single raw "2.8" value (which yoyPct can't derive YoY from with
  // zero prior periods, and would silently read as null).
  const core = new Map();
  for (let i = 0; i < 13; i++) core.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 100 * (1 + (0.028 / 12) * i));
  const universe = CPI_UNIVERSE.USD;
  const r = cpiScore({ headline, core }, universe);
  ok('coverage lists headlineLevel + headlineTrend + coreLevel', r.coverage.includes('headlineLevel') && r.coverage.includes('headlineTrend') && r.coverage.includes('coreLevel'));
  ok('pressure is a number (headline dims averaged)', typeof r.pressure === 'number', r.pressure);
  ok('core YoY derived correctly from its own index series (~2.8%)', Math.abs(r.dims.coreLevel.latestYoy - 2.8) < 0.1, r.dims.coreLevel.latestYoy);
}
{
  const r = cpiScore({}, CPI_UNIVERSE.USD);
  ok('empty input -> no dims, pressure null, not a crash', r.coverage.length === 0 && r.pressure === null);
}

console.log('[levelVsTargetScore — rounds long floating-point tails on pre-computed-YoY series]');
{
  const m = new Map([['2024-01-01', 2.943827113847]]);
  const meta = { series: 'CPALTT01GBM659N', isIndex: false };
  const r = levelVsTargetScore(m, meta);
  ok('latestYoy rounds to 2dp', r.latestYoy === 2.94, r.latestYoy);
}

console.log('[CPI_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => CPI_UNIVERSE[c]));
  ok('all 8 have headline coverage', Object.values(CPI_UNIVERSE).every(c => c.headline));
  ok('GBP and NZD deliberately lack core (unconfirmed series)', !CPI_UNIVERSE.GBP.core && !CPI_UNIVERSE.NZD.core);
  ok('USD headline/core are index-level series', CPI_UNIVERSE.USD.headline.isIndex && CPI_UNIVERSE.USD.core.isIndex);
  ok('EUR headline/core are pre-computed YoY (not index)', !CPI_UNIVERSE.EUR.headline.isIndex && !CPI_UNIVERSE.EUR.core.isIndex);
  ok('AUD and NZD headline flagged quarterly', CPI_UNIVERSE.AUD.headline.quarterly && CPI_UNIVERSE.NZD.headline.quarterly);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll cpiEngine tests passed.');
