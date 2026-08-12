// Synthetic test for the Labor Market Strength engine. No network — builds
// fake FRED Map<date,value> observation sets directly.
//   node js/laborMarketEngine.test.mjs
import {
  toSeries, monthOverMonth, yoyPct, latestZScore,
  payrollScore, wageScore, unemploymentTrendScore, participationTrendScore,
  quitsScore, jobOpeningsScore,
  breadthScore, revisionScore,
  laborMarketScore, LABOR_UNIVERSE, SECTOR_UNIVERSE, UNEMPLOYMENT_UNIT_LABEL,
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

// Same idea, one point every 3 months — for the quarterly-cadence series
// (EUR/GBP participation, NZD's everything).
function quarterlySeries(startYM, values) {
  const m = new Map();
  let [y, mo] = startYM.split('-').map(Number);
  for (const v of values) {
    m.set(`${y}-${String(mo).padStart(2, '0')}-01`, v);
    mo += 3; if (mo > 12) { mo -= 12; y++; }
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

console.log('[wageScore — default isIndex:true (USD/JPY-style index level)]');
{
  const vals = Array.from({ length: 20 }, (_, i) => 30 + i * 0.05); // slow steady wage growth
  const m = monthlySeries('2023-01', vals);
  const r = wageScore(m);
  ok('reports a yoy% and a score', r.latestYoyPct != null && typeof r.score !== 'undefined');
}

console.log('[wageScore — isIndex:false (EUR/GBP/AUD/CAD/NZD-style pre-computed YoY%)]');
{
  // The raw values ARE the YoY% print already — must NOT be re-derived via
  // yoyPct, which would silently produce a nonsense number (same trap
  // js/cpiEngine.js's toYoySeries guards against for CPI).
  const m = monthlySeries('2023-01', [3.1, 2.9, 2.8]);
  const r = wageScore(m, { isIndex: false });
  ok('latestYoyPct is the raw value (2.8), not re-derived from an index', r.latestYoyPct === 2.8, r.latestYoyPct);
}
{
  // Quarterly opt shortens the z-score lookback (8 instead of 24) — just
  // confirm it still produces a score with fewer points than the monthly
  // default would need.
  const m = quarterlySeries('2020-01', Array.from({ length: 12 }, (_, i) => 2.0 + i * 0.1));
  const r = wageScore(m, { isIndex: false, quarterly: true });
  ok('quarterly wage series with only 12 points still produces a score', r.score != null, r.score);
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

console.log('[unemploymentTrendScore — quarterly opt skips monthly smoothing]');
{
  // Steadily falling unemployment, one point per quarter (NZD-style).
  const vals = Array.from({ length: 12 }, (_, i) => 5.0 - i * 0.15);
  const m = quarterlySeries('2021-01', vals);
  const r = unemploymentTrendScore(m, { quarterly: true });
  ok('falling quarterly unemployment -> positive score, same direction as monthly', r.score > 0, r.score);
  ok('latestLevel is the final quarter\'s value', Math.abs(r.latestLevel - vals.at(-1)) < 0.001);
}

console.log('[participationTrendScore — rising participation reads strong]');
{
  const vals = Array.from({ length: 20 }, (_, i) => 62.0 + i * 0.02);
  const m = monthlySeries('2023-01', vals);
  const r = participationTrendScore(m);
  ok('rising participation -> positive score', r.score > 0, r.score);
}
{
  // EUR/GBP-style: participation is quarterly even though unemployment for
  // that same currency is monthly — the two trend functions are called with
  // DIFFERENT opts for the same currency, not a uniform per-currency setting.
  const vals = Array.from({ length: 12 }, (_, i) => 63.0 + i * 0.1);
  const m = quarterlySeries('2021-01', vals);
  const r = participationTrendScore(m, { quarterly: true });
  ok('rising quarterly participation -> positive score', r.score > 0, r.score);
}

console.log('[quitsScore — rising quits rate reads as worker confidence/strong]');
{
  const vals = Array.from({ length: 20 }, (_, i) => 2.0 + i * 0.02);
  const m = monthlySeries('2023-01', vals);
  const r = quitsScore(m);
  ok('rising quits rate -> positive score', r.score > 0, r.score);
  ok('reports latestRate', r.latestRate != null);
}
{
  const m = monthlySeries('2024-01', [2.0, 2.1]);
  ok('too little history -> null score, not a crash', quitsScore(m).score === null);
}

console.log('[jobOpeningsScore — rising openings rate reads as tight/strong]');
{
  const vals = Array.from({ length: 20 }, (_, i) => 5.0 - i * 0.03); // falling openings
  const m = monthlySeries('2023-01', vals);
  const r = jobOpeningsScore(m);
  ok('falling openings rate -> negative score', r.score < 0, r.score);
}

console.log('[breadthScore — diffusion index + concentration]');
{
  // 10 sectors, latest month: 7 growing, 1 flat, 2 shrinking. One sector
  // (healthcare) dominates the net change.
  const mk = (base, lastChg) => monthlySeries('2025-06', [base, base + lastChg]);
  const sectors = {
    healthcare: mk(5000, 40), government: mk(3000, 5), construction: mk(800, 3),
    manufacturing: mk(1200, 2), finance: mk(900, 1), info: mk(300, 1),
    leisure: mk(1600, -2), mining: mk(600, 0), trade: mk(2500, -1), prof: mk(2100, 4),
  };
  const r = breadthScore(sectors);
  ok('10 sectors reported', r.sectors.length === 10, r.sectors.length);
  // 7 positive, 1 flat, 2 negative -> diffusion = (7 + 0.5)/10*100 = 75%
  ok('diffusion index = 75%', r.diffusion === 75, r.diffusion);
  ok('score is positive (broad-based growth)', r.score > 0, r.score);
  ok('top contributor is healthcare (+40, largest abs change)', r.topContributor.name === 'healthcare', r.topContributor.name);
  // total abs = 40+5+3+2+1+1+2+0+1+4 = 59; healthcare share = 40/59
  ok('concentration flags healthcare carrying most of the print', r.concentration > 60, r.concentration);
}
{
  ok('no sector data -> null score, not a crash', breadthScore({}).score === null);
}
{
  // Every sector shrinking -> diffusion 0%, score -1.
  const mk = (base) => monthlySeries('2025-06', [base, base - 5]);
  const sectors = { a: mk(1000), b: mk(1000), c: mk(1000) };
  const r = breadthScore(sectors);
  ok('all-shrinking -> diffusion 0%', r.diffusion === 0, r.diffusion);
  ok('all-shrinking -> score -1 (saturated)', r.score === -1, r.score);
}

console.log('[breadthScore — score field itself is rounded, not just diffusion]');
{
  // 4 of 7 sectors growing, 0 flat, 3 shrinking -> diffusion 57.1%,
  // (57.1-50)/50 leaves a float tail (0.14200000000000002) same class of
  // bug as zToScore's z/2.5 — breadthScore computes its own clip() inline.
  const mk = (base, chg) => monthlySeries('2025-06', [base, base + chg]);
  const sectors = {
    a: mk(1000, 5), b: mk(1000, 3), c: mk(1000, 2), d: mk(1000, 1),
    e: mk(1000, -2), f: mk(1000, -1), g: mk(1000, -3),
  };
  const r = breadthScore(sectors);
  ok('score has no floating-point tail', r.score === +r.score.toFixed(2), r.score);
}

console.log('[unemploymentTrendScore — score field itself is rounded, not just latestLevel]');
{
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, i % 2 === 0 ? 1.05 : 0.95);
  m.set('d19', 1.03);
  const r = unemploymentTrendScore(m);
  ok('score has no floating-point tail', r.score === +r.score.toFixed(2), r.score);
}

console.log('[revisionScore — payrolls current vs first-published]');
{
  // Current (most-revised) values run higher than what was first reported —
  // consistent upward revisions, a genuinely bullish labor-market tell.
  const current = monthlySeries('2024-01', [20000, 20150, 20320, 20500, 20690, 20900, 21130]);
  const initial = monthlySeries('2024-01', [20000, 20120, 20260, 20410, 20560, 20720, 20900]); // each lower than current
  const r = revisionScore(current, initial);
  ok('latest revision is positive (revised up)', r.latestRevision > 0, r.latestRevision);
  ok('reports revision history', r.history.length > 0 && r.history.length <= 6);
  ok('score reflects the upward-revision pattern', r.score > 0, r.score);
}
{
  ok('no overlapping dates -> null, not a crash', revisionScore(monthlySeries('2030-01', [1, 2]), monthlySeries('2010-01', [1, 2])).score === null);
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
  // JOLTS dims flow through the composite the same way fetchLaborData hands
  // them off (data.quitsRate, data.jobOpenings).
  const quitsRate = monthlySeries('2023-01', Array.from({ length: 20 }, (_, i) => 2.0 + i * 0.02));
  const jobOpenings = monthlySeries('2023-01', Array.from({ length: 20 }, (_, i) => 5.0 + i * 0.02));
  const r = laborMarketScore({ quitsRate, jobOpenings });
  ok('quitsConfidence dim present and feeds the composite', 'quitsConfidence' in r.dims && r.strength != null, JSON.stringify(r.coverage));
  ok('jobOpenings dim present and feeds the composite', 'jobOpenings' in r.dims);
}
{
  const r = laborMarketScore({});
  ok('empty input -> null strength, not a crash', r.strength === null && r.coverage.length === 0);
}
{
  // Full pipeline: sectors + revision data flow through laborMarketScore the
  // same way fetchLaborData hands them off (data.sectors, data.payrollsInitialRelease).
  const mk = (base, lastChg) => monthlySeries('2025-06', [base, base + lastChg]);
  const sectors = { healthcare: mk(5000, 20), construction: mk(800, 5), leisure: mk(1600, 3) };
  const current = monthlySeries('2024-01', [20000, 20150, 20320]);
  const initial = monthlySeries('2024-01', [20000, 20100, 20260]);
  const r = laborMarketScore({ payrolls: current, sectors, payrollsInitialRelease: initial });
  ok('breadth dim present and feeds the composite', 'breadth' in r.dims && r.strength != null, JSON.stringify(r.coverage));
  ok('revisionSurprise dim present (reported standalone)', 'revisionSurprise' in r.dims);
}

console.log('[rounding — long floating-point tails from raw OECD values are rounded to 2dp]');
{
  const m = monthlySeries('2023-01', [3.1, 2.943827113847]);
  const r = wageScore(m, { isIndex: false });
  ok('wageScore latestYoyPct rounds to 2dp', r.latestYoyPct === 2.94, r.latestYoyPct);
}
{
  const vals = Array.from({ length: 19 }, () => 62.0);
  const m = monthlySeries('2023-01', [...vals, 61.882736451]);
  const r = participationTrendScore(m);
  ok('participationTrendScore latestLevel rounds to 2dp', r.latestLevel === 61.88, r.latestLevel);
}

console.log('[laborMarketScore — universe opts threading (isIndex/quarterly reach the right dimension)]');
{
  // EUR-style: pre-computed-YoY quarterly wages + quarterly participation,
  // alongside monthly unemployment for the SAME currency — confirms
  // laborMarketScore correctly forwards each factor's own opts rather than
  // applying one setting universe-wide.
  const universe = LABOR_UNIVERSE.EUR;
  const unemployment = monthlySeries('2022-01', Array.from({ length: 20 }, (_, i) => 6.0 - i * 0.03));
  const participation = quarterlySeries('2020-01', Array.from({ length: 12 }, (_, i) => 60.0 + i * 0.1));
  const wages = quarterlySeries('2020-01', [2.5, 2.6, 2.4]); // pre-computed YoY%, NOT an index
  const r = laborMarketScore({ unemployment, participation, wages }, universe);
  ok('wage YoY is the raw pre-computed value (2.4), not re-derived', r.dims.wageGrowth.latestYoyPct === 2.4, r.dims.wageGrowth.latestYoyPct);
  ok('participation trend scores using the quarterly opt (positive score, no crash from monthly smoothing on 12 points)', r.dims.participationTrend.score > 0, r.dims.participationTrend.score);
  ok('unemployment trend still uses its own (monthly, default) opt independently', r.dims.unemploymentTrend.score != null);
}

console.log('[LABOR_UNIVERSE / SECTOR_UNIVERSE]');
{
  ok('USD has all seven factors', ['payrolls', 'unemployment', 'participation', 'wages', 'hours', 'quitsRate', 'jobOpenings'].every(k => k in LABOR_UNIVERSE.USD));
  ok('USD wages is isIndex:true', LABOR_UNIVERSE.USD.wages.isIndex === true);
  ok('covers all 8 currencies from ECON_UNIVERSE', Object.keys(LABOR_UNIVERSE).length === 8, Object.keys(LABOR_UNIVERSE).join(','));
  ok('SECTOR_UNIVERSE has 10 supersectors, all unique series IDs', Object.keys(SECTOR_UNIVERSE).length === 10
    && new Set(Object.values(SECTOR_UNIVERSE)).size === 10, Object.values(SECTOR_UNIVERSE).join(','));
  ok('CHF uses SECO registered unemployment, not the OECD-harmonized rate', LABOR_UNIVERSE.CHF.unemployment.series === 'LMUNRLTTCHM647S', LABOR_UNIVERSE.CHF.unemployment.series);
  ok('CHF still unemployment-only (one factor) — no confirmed wage series exists', Object.keys(LABOR_UNIVERSE.CHF).length === 1);
  ok('CHF is labeled as a level, not a % rate', UNEMPLOYMENT_UNIT_LABEL.CHF !== '%', UNEMPLOYMENT_UNIT_LABEL.CHF);
  ok('every other currency defaults to %', Object.entries(UNEMPLOYMENT_UNIT_LABEL).filter(([c]) => c !== 'CHF').every(([, u]) => u === '%'));

  const upgraded = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD'];
  ok('the 6 newly-upgraded currencies each now have unemployment + participation + wages', upgraded.every(c =>
    ['unemployment', 'participation', 'wages'].every(f => f in LABOR_UNIVERSE[c])));
  ok('EUR and GBP participation is flagged quarterly despite monthly unemployment', LABOR_UNIVERSE.EUR.participation.quarterly === true && !LABOR_UNIVERSE.EUR.unemployment.quarterly
    && LABOR_UNIVERSE.GBP.participation.quarterly === true && !LABOR_UNIVERSE.GBP.unemployment.quarterly);
  ok('NZD is quarterly across unemployment, participation, AND wages', ['unemployment', 'participation', 'wages'].every(f => LABOR_UNIVERSE.NZD[f].quarterly === true));
  ok('JPY wages is isIndex:true (a raw index level), unlike the other 5 upgraded currencies', LABOR_UNIVERSE.JPY.wages.isIndex === true);
  ok('EUR/GBP/AUD/CAD/NZD wages are NOT flagged isIndex (already pre-computed YoY%)', ['EUR', 'GBP', 'AUD', 'CAD', 'NZD'].every(c => !LABOR_UNIVERSE[c].wages.isIndex));
  ok('NZD unemployment uses the corrected quarterly series (…NZQ156S, not the unconfirmed …NZM156S)', LABOR_UNIVERSE.NZD.unemployment.series === 'LRHUTTTTNZQ156S');
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll laborMarketEngine tests passed.');
