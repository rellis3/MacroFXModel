// Synthetic test for the Labor Market Strength engine. No network — builds
// fake FRED Map<date,value> observation sets directly.
//   node js/laborMarketEngine.test.mjs
import {
  toSeries, monthOverMonth, yoyPct, latestZScore,
  payrollScore, wageScore, unemploymentTrendScore, participationTrendScore,
  laborMarketScore, LABOR_UNIVERSE,
} from './laborMarketEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Build a monthly Map starting 2023-01 through however many values given.
function monthlySeries(startYM, values) {
  const m = new Map();
  let [y, mo] = startYM.split('-').map(Number);
  for (const v of values) {
    m.set(`${y}-${String(mo).padStart(2, '0')}-01`, v);
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  return m;
}

console.log('[toSeries / monthOverMonth]');
{
  const m = monthlySeries('2024-01', [100, 105, 103]);
  const s = toSeries(m);
  ok('sorted ascending', s[0].value === 100 && s[2].value === 103);
  const mom = monthOverMonth(s);
  ok('first chg is null', mom[0].chg === null);
  ok('second chg is +5', mom[1].chg === 5);
  ok('third chg is -2', mom[2].chg === -2);
}

console.log('[yoyPct]');
{
  const vals = Array.from({ length: 13 }, (_, i) => 100 + i); // 100..112
  const m = monthlySeries('2023-01', vals);
  const s = yoyPct(toSeries(m));
  ok('first 12 points have no yoy (no 12-back reference)', s[11].yoy === null);
  ok('13th point has yoy = (112/100-1)*100 = 12%', s[12].yoy === 12, s[12].yoy);
}

console.log('[latestZScore]');
{
  ok('too few points -> null', latestZScore([1, 2, 3], 24, 6) === null);
  const flat = Array.from({ length: 20 }, () => 100);
  ok('latest matching a flat baseline -> exactly 0', latestZScore([...flat, 100], 24, 6) === 0);
  ok('a clean break from a flat baseline saturates rather than divide-by-~0', latestZScore([...flat, 105], 24, 6) === 4);
  const varied = [90, 110, 95, 105, 100, 100, 95, 105]; // mean ~100, some spread
  const z = latestZScore([...varied, 500], 24, 6);
  ok('an extreme latest value produces a large positive z', z > 3, z);
}

console.log('[payrollScore]');
{
  // 24 months of ~150k steady pace, then a blowout +400k print.
  const base = 20000;
  const vals = [base];
  for (let i = 0; i < 23; i++) vals.push(vals.at(-1) + 150);
  vals.push(vals.at(-1) + 400);
  const m = monthlySeries('2023-01', vals);
  const r = payrollScore(m);
  ok('latestChange is 400', r.latestChange === 400, r.latestChange);
  ok('reads as strong (positive score)', r.score > 0.3, r.score);
}

console.log('[wageScore]');
{
  const vals = Array.from({ length: 20 }, (_, i) => 30 + i * 0.05); // slow steady wage growth
  const m = monthlySeries('2023-01', vals);
  const r = wageScore(m);
  ok('reports a yoy% and a score', r.latestYoyPct != null && typeof r.score !== 'undefined');
}

console.log('[unemploymentTrendScore — falling unemployment reads strong]');
{
  const vals = Array.from({ length: 20 }, (_, i) => 5.0 - i * 0.05); // steadily falling
  const m = monthlySeries('2023-01', vals);
  const r = unemploymentTrendScore(m);
  ok('falling unemployment -> positive (strong) score', r.score > 0, r.score);
}
{
  const vals = Array.from({ length: 20 }, (_, i) => 4.0 + i * 0.05); // steadily rising
  const m = monthlySeries('2023-01', vals);
  const r = unemploymentTrendScore(m);
  ok('rising unemployment -> negative (weak) score', r.score < 0, r.score);
}
{
  const m = monthlySeries('2024-01', [4.0, 4.1, 4.0]); // too short
  const r = unemploymentTrendScore(m);
  ok('too little history -> null score, not a crash', r.score === null);
}

console.log('[participationTrendScore — rising participation reads strong]');
{
  const vals = Array.from({ length: 20 }, (_, i) => 62.0 + i * 0.02);
  const m = monthlySeries('2023-01', vals);
  const r = participationTrendScore(m);
  ok('rising participation -> positive score', r.score > 0, r.score);
}

console.log('[laborMarketScore — composite + participation trap flag]');
{
  // Unemployment falling (strong) but participation ALSO falling hard (people leaving) -> trap flag.
  const unemp = monthlySeries('2023-01', Array.from({ length: 20 }, (_, i) => 5.0 - i * 0.08));
  const part = monthlySeries('2023-01', Array.from({ length: 20 }, (_, i) => 63.0 - i * 0.08));
  const r = laborMarketScore({ unemployment: unemp, participation: part });
  ok('coverage lists both dims', r.coverage.includes('unemploymentTrend') && r.coverage.includes('participationTrend'));
  ok('flags the participation trap', r.flag && r.flag.startsWith('participation_trap'), r.flag);
}
{
  // Full USD-style coverage: strong payrolls + falling unemployment + rising participation -> no trap, positive strength.
  const payrolls = monthlySeries('2023-01', (() => { const v = [20000]; for (let i = 0; i < 20; i++) v.push(v.at(-1) + 180); return v; })());
  const unemp = monthlySeries('2023-01', Array.from({ length: 20 }, (_, i) => 5.0 - i * 0.05));
  const part = monthlySeries('2023-01', Array.from({ length: 20 }, (_, i) => 62.0 + i * 0.03));
  const r = laborMarketScore({ payrolls, unemployment: unemp, participation: part });
  ok('no participation trap when both improve together', r.flag === null, r.flag);
  ok('composite strength is positive', r.strength > 0, r.strength);
  ok('wageGrowth absent when no wage data given', r.dims.wageGrowth === undefined);
}
{
  const r = laborMarketScore({});
  ok('empty input -> null strength, not a crash', r.strength === null && r.coverage.length === 0);
}

console.log('[LABOR_UNIVERSE]');
{
  ok('USD has all five factors', ['payrolls', 'unemployment', 'participation', 'wages', 'hours'].every(k => k in LABOR_UNIVERSE.USD));
  ok('other currencies have unemployment only', Object.entries(LABOR_UNIVERSE).filter(([k]) => k !== 'USD')
    .every(([, cfg]) => Object.keys(cfg).length === 1 && cfg.unemployment));
  ok('covers all 8 currencies from ECON_UNIVERSE', Object.keys(LABOR_UNIVERSE).length === 8, Object.keys(LABOR_UNIVERSE).join(','));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll laborMarketEngine tests passed.');
