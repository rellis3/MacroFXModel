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

console.log('[levelVsTargetScore / trendScore — score field itself is rounded, not just latestYoy]');
{
  // levelVsTargetScore has its OWN inline clip((yoy-target)/band), a
  // second unrounded path separate from zToScore — (2.94-2.0)/4.0 leaves
  // a float tail same as z/2.5 does.
  const m = new Map([['2024-01-01', 2.94]]);
  const meta = { series: 'x', isIndex: false };
  const level = levelVsTargetScore(m, meta);
  ok('levelVsTargetScore.score has no floating-point tail', level.score === +level.score.toFixed(2), level.score);
}
{
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, i % 2 === 0 ? 1.05 : 0.95);
  m.set('d19', 1.03);
  const meta = { series: 'x', isIndex: false };
  const trend = trendScore(m, meta);
  ok('trendScore.score has no floating-point tail', trend.score === +trend.score.toFixed(2), trend.score);
}

console.log('[CPI_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => CPI_UNIVERSE[c]));
  // The invariant that matters now: a currency either has a live series or a
  // DOCUMENTED reason it does not. Silently dropping one would leave the page
  // unable to explain a missing inflation read, which is how the old dead OECD
  // series went unnoticed for months in the first place.
  ok('every currency has either a headline series or a documented discontinuation',
     Object.values(CPI_UNIVERSE).every(c => c.headline || c.discontinued));
  ok('no currency has both', Object.values(CPI_UNIVERSE).every(c => !(c.headline && c.discontinued)));
  ok('every discontinuation records when, what and why',
     Object.values(CPI_UNIVERSE).filter(c => c.discontinued)
       .every(c => c.discontinued.since && c.discontinued.was && c.discontinued.reason));
  // Verified against fredgraph 2026-09-10: the whole OECD MEI family froze in
  // spring 2025 (JPY back in 2021). Eurostat is a different provider, still live.
  ok('the dead OECD series are gone from the live set',
     !JSON.stringify(Object.values(CPI_UNIVERSE).map(c => c.headline).filter(Boolean)).includes('CPALTT01'));
  ok('USD headline/core are index-level series', CPI_UNIVERSE.USD.headline.isIndex && CPI_UNIVERSE.USD.core.isIndex);
  // The Eurostat replacements are INDEX levels (2015=100), unlike the OECD "659N"
  // series they replace, which were already YoY prints. Getting this flag wrong
  // would silently score an index level as if it were an inflation rate.
  ok('EUR/CHF replacements are index levels, so YoY is computed downstream',
     CPI_UNIVERSE.EUR.headline.isIndex === true && CPI_UNIVERSE.CHF.headline.isIndex === true);
  ok('core is USD-only (the rest died or were unverified)',
     Object.entries(CPI_UNIVERSE).filter(([, c]) => c.core).map(([k]) => k).join() === 'USD');
  // AUD/NZD were the quarterly-at-source entries; both are now discontinued, so the
  // cadence flag has no live user. The mechanism still has to work, because the
  // scorecard's staleness budget depends on it -- a quarterly series judged against
  // a monthly budget gets marked stale while perfectly healthy.
  ok('every live headline declares a cadence the scorecard can use',
     Object.values(CPI_UNIVERSE).filter(c => c.headline)
       .every(c => c.headline.quarterly === undefined || typeof c.headline.quarterly === 'boolean'));
  ok('cpiScore reports monthly cadence for the live entries',
     cpiScore({}, CPI_UNIVERSE.EUR).cadence === 'monthly');
  ok('and would report quarterly if a headline were flagged so',
     cpiScore({}, { headline: { series: 'X', quarterly: true } }).cadence === 'quarterly');
}

console.log('[a discontinued source reports WHY, rather than going quiet]');
{
  const r = cpiScore({}, CPI_UNIVERSE.JPY);
  ok('scores nothing', r.pressure === null && r.coverage.length === 0);
  ok('but says the source stopped, and when', r.discontinued?.since === '2021-06', r.discontinued?.since);
  ok('and names the series it replaced', r.discontinued?.was === 'CPALTT01JPM659N');
  // Without this a dead source is indistinguishable from a fetch that failed today,
  // and the page keeps implying the print is merely late.
  const live = cpiScore({}, CPI_UNIVERSE.EUR);
  ok('a live currency with no data yet carries no discontinued marker', live.discontinued === undefined);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll cpiEngine tests passed.');
