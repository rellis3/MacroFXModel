// GEX LADDER — per-expiry, per-strike gamma for the oi-dashboard strike ladder. Pins:
// each series totals to fullBookGex's byExpiry figure (one maths, two views), nearest
// expiries first with the remainder folded into one "later" series, the strike window,
// and the volume-gamma split/gross paths.
//   node js/gexLadder.test.mjs
import { gexLadder } from './gexLadder.js';
import { fullBookGex } from './fullBookGex.js';
import { bsGamma, bsCharm, bsVanna } from './gammaGreeks.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };
const near = (a, b) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-4);

const spot = 4100, mult = 50, sig = 0.2;
const K = [4000, 4050, 4100, 4150, 4200];
const leg = (dte, c, p, sigma = sig) => ({ dte, code: 'X' + dte, strikes: K, calls: c, puts: p, sigma });
const legs = [
  leg(30, [100, 300, 900, 1200, 600], [800, 500, 400, 100, 50]),
  leg(0, [50, 200, 1500, 300, 20], [40, 600, 900, 100, 10], 0.25),
  leg(2, [10, 20, 30, 40, 50], [50, 40, 30, 20, 10]),
  leg(7, [5, 5, 5, 5, 5], [1, 1, 1, 1, 1]),
  leg(14, [9, 9, 9, 9, 9], [3, 3, 3, 3, 3]),
  leg(60, [7, 7, 7, 7, 7], [2, 2, 2, 2, 2]),
];

console.log('[series totals match fullBookGex byExpiry]');
{
  const L = gexLadder(legs, spot, { mult, maxSeries: 10 });
  const fb = fullBookGex(legs, spot, { mult, flatSigma: sig });
  for (const s of L.series) {
    const f = fb.byExpiry.find(x => x.dte === s.dte);
    ok(`${s.label} total = fullBook ${s.dte} DTE`, f && near(s.total, f.gex), `${s.total} vs ${f && f.gex}`);
  }
  const g = bsGamma(spot, 4100, 1 / 365, 0.25);   // 0 DTE floored to 1 day, its own sigma
  const i = L.strikes.indexOf(4100), s0 = L.series[0];
  ok('per-strike net = (c−p)·γ·mult·spot', near(s0.net[i], (1500 - 900) * g * mult * spot), `${s0.net[i]}`);
  ok('net = call − put', near(s0.net[i], s0.call[i] - s0.put[i]));
}

console.log('[ordering + later bucket]');
{
  const L = gexLadder(legs, spot, { mult, maxSeries: 3 });
  ok('nearest expiries first', L.series.slice(0, 3).map(s => s.dte).join(',') === '0,2,7');
  const rest = L.series[3];
  ok('remainder folded into one later series', L.series.length === 4 && rest.rest && rest.label === 'later (3)');
  const fb = fullBookGex(legs, spot, { mult, flatSigma: sig });
  const want = fb.byExpiry.filter(x => [14, 30, 60].includes(x.dte)).reduce((a, x) => a + x.gex, 0);
  ok('later total = sum of the folded expiries', near(rest.total, want), `${rest.total} vs ${want}`);
  ok('nExpiries counts every leg', L.nExpiries === 6);
}

console.log('[strike window]');
{
  const L = gexLadder([leg(5, [1, 1, 1, 1, 1], [1, 1, 1, 1, 1])], spot, { mult, windowFrac: 0.02 });
  ok('strikes outside ±window dropped', L.strikes.join(',') === '4050,4100,4150', L.strikes.join(','));
  ok('null without spot', gexLadder(legs, 0) === null);
}

console.log('[volume gamma]');
{
  const vs = { strikes: [4050, 4100], calls: [100, 300], puts: [50, 400], dte: 0, sigma: 0.25 };
  const L = gexLadder(legs, spot, { mult, vol: vs });
  const i = L.strikes.indexOf(4100), g = bsGamma(spot, 4100, 1 / 365, 0.25);
  ok('split → net is signed (puts heavier ⇒ negative)', L.vol.split && L.vol.net[i] < 0 && near(L.vol.net[i], (300 - 400) * g * mult * spot));
  ok('gross = (c+p)·γ·mult·spot', near(L.vol.gross[i], 700 * g * mult * spot));
  const G = gexLadder(legs, spot, { mult, vol: { strikes: [4100], totals: [700], dte: 0, sigma: 0.25 } });
  ok('totals only → gross, no net', !G.vol.split && G.vol.net === null && near(G.vol.gross[G.strikes.indexOf(4100)], 700 * g * mult * spot));
  ok('no volume → vol null', gexLadder(legs, spot, { mult }).vol === null);
}

console.log('[delta / charm / vanna]');
{
  const L = gexLadder(legs, spot, { mult, maxSeries: 10 });
  const s0 = L.series[0], i = L.strikes.indexOf(4150), t = 1 / 365, sg = 0.25;
  const d1 = (Math.log(spot / 4150) + 0.5 * sg * sg * t) / (sg * Math.sqrt(t));
  // N(d1) by direct numeric integration of the pdf, independent of the module's erf
  let cd = 0.5; const n = 20000, h = d1 / n; for (let k = 0; k < n; k++) { const x = (k + 0.5) * h; cd += Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * h; }
  ok('dex = (c·N(d1) + p·(N(d1)−1))·mult', near(s0.dex[i], (300 * cd + 100 * (cd - 1)) * mult), `${s0.dex[i]}`);
  ok('charm = (c−p)·mult·charm/365', near(s0.charm[i], 200 * mult * bsCharm(spot, 4150, t, sg) / 365), `${s0.charm[i]}`);
  ok('vanna = (c−p)·mult·vanna·0.01', near(s0.vanna[i], 200 * mult * bsVanna(spot, 4150, t, sg) * 0.01), `${s0.vanna[i]}`);
  ok('per-series totals reported', Number.isFinite(s0.totals.dex) && Number.isFinite(s0.totals.charm) && Number.isFinite(s0.totals.vanna));
  const otm = L.strikes.indexOf(4200), ladderC = gexLadder([leg(30, [0, 0, 0, 0, 1000], [0, 0, 0, 0, 0])], spot, { mult });
  ok('OTM call only ⇒ positive dex, below 0.5·OI·mult', ladderC.series[0].dex[ladderC.strikes.indexOf(4200)] > 0 && ladderC.series[0].dex[ladderC.strikes.indexOf(4200)] < 500 * mult);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
