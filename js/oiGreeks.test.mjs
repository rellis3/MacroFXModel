// OI greeks — DTE-aware gamma/GEX (the fixed-14-DTE assumption was replaced by the
// actual selected-expiry DTE). Pins: gamma ∝ 1/√T, GEX scales with it, and the T
// param DEFAULTS to the old 14-DTE constant so every other caller is unchanged.
//   node js/oiGreeks.test.mjs
import { oiGreeks, oiCalcExposures, OI_GREEK_T } from './oi.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const spot = 4100, pair = 'SPX500_USD';
const strikes = [4000, 4050, 4100, 4150, 4200];
const calls   = [500, 800, 3000, 6000, 9000];
const puts    = [9000, 6000, 3000, 800, 500];

console.log('[gamma scales as 1/√T]');
{
  const g2 = oiGreeks(spot, spot, pair, 2 / 365).gamma;
  const g14 = oiGreeks(spot, spot, pair, 14 / 365).gamma;
  const g45 = oiGreeks(spot, spot, pair, 45 / 365).gamma;
  ok('shorter DTE ⇒ higher ATM gamma', g2 > g14 && g14 > g45, `${g2.toExponential(2)} > ${g14.toExponential(2)} > ${g45.toExponential(2)}`);
  // gamma ∝ 1/√T ⇒ g2/g14 ≈ √(14/2) = √7 ≈ 2.646
  ok('ratio matches 1/√T (2 vs 14 DTE ≈ √7)', Math.abs(g2 / g14 - Math.sqrt(14 / 2)) < 0.02, `${(g2 / g14).toFixed(3)}`);
}

console.log('[GEX follows the DTE, default = old 14-DTE constant]');
{
  const e2 = oiCalcExposures(strikes, calls, puts, spot, pair, 2 / 365).gex;
  const e45 = oiCalcExposures(strikes, calls, puts, spot, pair, 45 / 365).gex;
  ok('near-dated GEX magnitude exceeds far-dated', Math.abs(e2) > Math.abs(e45), `${e2.toExponential(2)} vs ${e45.toExponential(2)}`);
  // Back-compat: omitting T must equal passing the documented OI_GREEK_T (no silent shift
  // for callers that never opted into a real DTE).
  const eDefault = oiCalcExposures(strikes, calls, puts, spot, pair).gex;
  const e14 = oiCalcExposures(strikes, calls, puts, spot, pair, OI_GREEK_T).gex;
  ok('default T === OI_GREEK_T (14-DTE) — every other caller unchanged', eDefault === e14, `${eDefault} === ${e14}`);
  ok('oiGreeks default T also === OI_GREEK_T', oiGreeks(spot, spot, pair).gamma === oiGreeks(spot, spot, pair, OI_GREEK_T).gamma);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
