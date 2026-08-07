// FULL-BOOK GEX — aggregate net gamma across all expiries, each weighted by its own
// gamma. Pins the gamma weighting (near-dated dominates per contract), the per-expiry
// breakdown, the flip root-find, and the sign convention.
//   node js/fullBookGex.test.mjs
import { fullBookGex } from './fullBookGex.js';
import { bsGamma } from './gammaGreeks.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const spot = 4100, mult = 50, sig = 0.20;

console.log('[single expiry matches the direct formula]');
{
  const K = [4000, 4050, 4100, 4150, 4200];
  const calls = [200, 600, 2400, 3000, 1500];
  const puts = [1500, 900, 2000, 500, 200];
  const r = fullBookGex([{ dte: 14, strikes: K, calls, puts, sigma: sig }], spot, { mult, flatSigma: sig });
  let want = 0;
  for (let i = 0; i < K.length; i++) want += bsGamma(spot, K[i], 14 / 365, sig) * (calls[i] - puts[i]) * mult * spot;
  ok('one-leg GEX equals Σ gamma·(c−p)·mult·spot', Math.abs(r.gex - want) < Math.abs(want) * 1e-6, `${r.gex} vs ${want.toFixed(2)}`);
  ok('one expiry ⇒ single byExpiry row at 100% share', r.byExpiry.length === 1 && r.byExpiry[0].sharePct === 100);
  ok('regime follows the sign', r.regime === (r.gex > 0 ? 'PIN' : 'BREAKOUT'));
}

console.log('[gamma weighting — a near-dated leg dominates a far one of equal OI]');
{
  const K = [4050, 4100, 4150];
  const oi = { calls: [500, 3000, 500], puts: [500, 500, 500] };   // net +2500 at ATM
  const near = { dte: 2, strikes: K, ...oi, sigma: sig };
  const far = { dte: 45, strikes: K, ...oi, sigma: sig };
  const r = fullBookGex([near, far], spot, { mult, flatSigma: sig });
  ok('two expiry rows, shares sum to ~100', r.byExpiry.length === 2
    && Math.abs(r.byExpiry.reduce((a, b) => a + b.sharePct, 0) - 100) < 0.2,
    r.byExpiry.map(x => x.dte + 'd:' + x.sharePct + '%').join(' '));
  ok('the 2-DTE leg carries the larger share (higher gamma per contract)',
    r.byExpiry[0].dte === 2 && r.byExpiry[0].sharePct > r.byExpiry[1].sharePct,
    r.byExpiry.map(x => x.dte + 'd:' + x.sharePct + '%').join(' '));
  ok('byExpiry sorted by |gex| desc', Math.abs(r.byExpiry[0].gex) >= Math.abs(r.byExpiry[1].gex));
}

console.log('[the cross-expiry regime flip — 0-DTE PIN outweighed by a deep monthly put wall]');
{
  // Near 0-DTE: net-positive call cluster at spot (PIN pull). Far 30-DTE: a big deep put
  // wall well below (net-negative). Near-dated wins the ATM weight; the monthly's size and
  // spread pull the total the other way — the book-level tension a single column misses.
  const near = { dte: 1, strikes: [4080, 4100, 4120], calls: [400, 2600, 500], puts: [300, 300, 200], sigma: sig };
  const farK = [3700, 3750, 3800, 4100, 4200];
  const far = { dte: 30, strikes: farK, calls: [100, 100, 200, 900, 1200], puts: [9000, 8000, 5000, 600, 300], sigma: sig };
  const r = fullBookGex([near, far], spot, { mult, flatSigma: sig });
  ok('per-expiry signs are opposite (0-DTE +, monthly −)',
    Math.sign(r.byExpiry.find(x => x.dte === 1).gex) === 1 && Math.sign(r.byExpiry.find(x => x.dte === 30).gex) === -1,
    r.byExpiry.map(x => x.dte + 'd:' + (x.gex > 0 ? '+' : '−')).join(' '));
  ok('a regime is returned and a flip is found near spot',
    ['PIN', 'BREAKOUT'].includes(r.regime) && (r.flip == null || Math.abs(r.flip - spot) <= spot * 0.25),
    `${r.regime} flip=${r.flip}`);
  ok('nExpiries / nContracts reported', r.nExpiries === 2 && r.nContracts > 0, `${r.nExpiries} exp, ${r.nContracts} ctr`);
}

console.log('[guards]');
{
  ok('empty legs → null', fullBookGex([], spot) === null);
  ok('no spot → null', fullBookGex([{ dte: 7, strikes: [1], calls: [1], puts: [1] }], 0) === null);
  ok('missing dte falls back (no throw)', !!fullBookGex([{ strikes: [4100], calls: [10], puts: [5] }], spot));
  ok('0-DTE floored (no infinite gamma)', Number.isFinite(fullBookGex([{ dte: 0, strikes: [4100, 4110], calls: [10, 5], puts: [5, 5] }], spot).gex));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
