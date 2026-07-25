// Synthetic, no-network unit tests for bookStress. Sleeve series are built so
// the crisis behaviour is exact by construction — the test knows the right
// answer before the engine runs.
//
//   node js/bookStress.test.mjs

import {
  STRESS_WINDOWS, alignSleeves, seriesStats, bookSeries,
  stressReplay, allocationCompare, riskParityWeights,
} from './bookStress.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Deterministic LCG.
let seed = 987654321;
const rnd = () => { seed = (1103515245 * seed + 12345) % 2147483648; return seed / 2147483648 - 0.5; };

// Business-day-ish date axis from 2018-01-01 (calendar days is fine — the
// engine only ever compares date strings).
function mkDates(n, start = Date.UTC(2018, 0, 1)) {
  return Array.from({ length: n }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10));
}

console.log('[alignSleeves]');
{
  const a = alignSleeves({
    A: { dates: ['2020-01-01', '2020-01-02', '2020-01-03'], returns: [0.01, 0.02, 0.03] },
    B: { dates: ['2020-01-02', '2020-01-03', '2020-01-04'], returns: [0.10, 0.20, 0.30] },
  });
  ok('intersects to the common calendar', a.dates.length === 2 && a.dates[0] === '2020-01-02');
  ok('columns aligned to the intersection', near(a.cols[0][0], 0.02) && near(a.cols[1][0], 0.10));
  ok('empty input → empty, no throw', alignSleeves({}).dates.length === 0);
  ok('drops non-finite returns from the map', alignSleeves({ A: { dates: ['d1', 'd2'], returns: [NaN, 1] }, B: { dates: ['d1', 'd2'], returns: [1, 1] } }).dates.length === 1);
}

console.log('\n[seriesStats / bookSeries]');
{
  const s = seriesStats([0.01, -0.01, 0.02, -0.02, 0.01], 252);
  ok('n and total exact', s.n === 5 && near(s.total, 0.01, 1e-12));
  ok('worst/best exact', near(s.worst, -0.02) && near(s.best, 0.02));
  ok('hitRate exact (3 of 5)', near(s.hitRate, 0.6));
  ok('empty → NaNs, no throw', Number.isNaN(seriesStats([]).total));
  // Two perfectly opposite sleeves must net to zero at equal weight.
  const b = bookSeries([[0.02, -0.03], [-0.02, 0.03]]);
  ok('opposite sleeves net to 0 at 1/N', b.every(x => near(x, 0)));
  // Weighted: 75/25 of [0.04] and [0] → 0.03.
  ok('weights normalise and apply', near(bookSeries([[0.04], [0]], [0.75, 0.25])[0], 0.03, 1e-12));
}

console.log('\n[stressReplay — diversification evaporation, by construction]');
{
  // 1600 days from 2018-01-01 covers Q4-2018, COVID and 2022.
  const N = 1600, dates = mkDates(N);
  const inCovid = d => d >= '2020-02-15' && d <= '2020-04-15';
  // Three sleeves: independent noise in calm periods, but ALL slammed by the
  // same factor during COVID (this is the failure mode being measured).
  const cols = [[], [], []];
  for (let i = 0; i < N; i++) {
    const crisis = inCovid(dates[i]);
    const shock = crisis ? -0.02 + 0.002 * rnd() : 0;
    for (let j = 0; j < 3; j++) cols[j].push(crisis ? shock + 0.0005 * rnd() : 0.01 * rnd());
  }
  const sleeves = Object.fromEntries(['A', 'B', 'C'].map((nm, j) => [nm, { dates, returns: cols[j] }]));
  const r = stressReplay(sleeves);
  ok('ok with 3 aligned sleeves', r.ok === true && r.nSleeves === 3);

  const covid = r.windows.find(w => w.key === 'covid');
  ok('COVID window covered with the right dates', covid.covered && covid.firstDate >= '2020-02-15' && covid.lastDate <= '2020-04-15');
  ok('all 3 sleeves lose in the crisis (correlated shock)', covid.sleevesNegative === 3, `neg=${covid.sleevesNegative}`);
  ok('book loses in the crisis', covid.book.total < 0, `total=${(covid.book.total * 100).toFixed(1)}%`);
  ok('calm period is ~flat by construction', Math.abs(r.calm.book.total) < 0.05, `calm=${(r.calm.book.total * 100).toFixed(2)}%`);

  // THE measurement: correlation → 1 and effective bets → 1 inside the crisis,
  // while calm-period bets ≈ 3 (independent sleeves).
  ok('calm avg correlation ≈ 0', Math.abs(r.calm.avgCorr) < 0.15, `ρ=${r.calm.avgCorr.toFixed(3)}`);
  ok('crisis avg correlation ≫ calm', covid.avgCorr > 0.8, `ρ=${covid.avgCorr.toFixed(3)}`);
  ok('calm effective bets ≈ 3 (independent)', r.calm.effectiveBets > 2.5, `bets=${r.calm.effectiveBets.toFixed(2)}`);
  ok('crisis effective bets collapse toward 1', covid.effectiveBets < 1.5, `bets=${covid.effectiveBets.toFixed(2)}`);
  ok('diversification evaporates exactly when needed (crisis < calm)', covid.effectiveBets < r.calm.effectiveBets);

  // Windows outside the data range must be reported as uncovered, not faked.
  const gfc = r.windows.find(w => w.key === 'gfc');
  ok('pre-data window flagged uncovered (n=0), not invented', gfc.covered === false && gfc.n === 0);
  ok('declared windows are fixed constants, not fitted', STRESS_WINDOWS.length === 6 && STRESS_WINDOWS.every(w => w.from < w.to));
}

console.log('\n[allocationCompare]');
{
  // Sleeve A is 5× the vol of B; both zero-mean noise. Inverse-vol must
  // down-weight A hard; equal weight must end up higher-vol than inverse-vol.
  const N = 900, dates = mkDates(N);
  const A = [], B = [];
  for (let i = 0; i < N; i++) { A.push(0.05 * rnd()); B.push(0.01 * rnd()); }
  const r = allocationCompare({ A: { dates, returns: A }, B: { dates, returns: B } }, { lookback: 60, rebalance: 20 });
  ok('ok with 2 sleeves', r.ok === true && r.nBets === 2);
  const wA = r.modes.inverseVol.finalWeights.find(x => x.name === 'A').w;
  ok('inverse-vol down-weights the 5× vol sleeve (<0.3)', wA < 0.3, `wA=${wA.toFixed(3)}`);
  ok('equal weight keeps 0.5/0.5', near(r.modes.equal.finalWeights[0].w, 0.5));
  ok('equal-weight book is more volatile than inverse-vol', r.modes.equal.vol > r.modes.inverseVol.vol,
     `${r.modes.equal.vol.toFixed(4)} vs ${r.modes.inverseVol.vol.toFixed(4)}`);
  ok('risk parity produces valid normalised weights', Math.abs(r.modes.riskParity.finalWeights.reduce((s, x) => s + x.w, 0) - 1) < 1e-6);
  ok('risk parity also down-weights the high-vol sleeve',
     r.modes.riskParity.finalWeights.find(x => x.name === 'A').w < 0.35);
  ok('too little history → ok:false, no throw', allocationCompare({ A: { dates: dates.slice(0, 10), returns: A.slice(0, 10) } }).ok === false);
}

console.log('\n[riskParityWeights — equal-risk property]');
{
  // Two uncorrelated sleeves with vol ratio 4:1 → ERC weights ratio ≈ 1:4.
  const a = [], b = [];
  for (let i = 0; i < 500; i++) { a.push(0.04 * rnd()); b.push(0.01 * rnd()); }
  const w = riskParityWeights([a, b]);
  ok('weights sum to 1', Math.abs(w[0] + w[1] - 1) < 1e-6);
  ok('ratio ≈ inverse vol ratio (≈1:4)', Math.abs((w[1] / w[0]) - 4) < 1.0, `ratio=${(w[1] / w[0]).toFixed(2)}`);
  ok('empty → null', riskParityWeights([]) === null);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
