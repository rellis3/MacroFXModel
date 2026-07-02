/**
 * computeMacroScore fixture tests — pins the 2026-07 safe-haven sign fix.
 * The defect: risk-stress (VIX>25, HY widening) was scored BULLISH for any pair
 * containing JPY/CHF — but the safe haven is the QUOTE leg in every configured
 * pair, so stress drives those pairs DOWN. Offline; run: node js/macroScore.test.mjs
 */
import { computeMacroScore } from '../levels.js';

let pass = 0, failCount = 0;
const ok = (name, cond) => cond ? (pass++, console.log(`  ✓ ${name}`))
                                : (failCount++, console.error(`  ✗ ${name}`));

// Risk-off snapshot: VIX 30 and rising, HY spreads widening.
const stress = { vix: { current: 30, prev: 27 }, hy: { current: 5.0, prev: 4.5 } };
// Risk-on snapshot: VIX low and falling, HY tightening.
const calm   = { vix: { current: 13, prev: 14 }, hy: { current: 3.0, prev: 3.2 } };

console.log('[computeMacroScore — safe-haven leg sign]');
ok('risk-off is BEARISH for long GBP/JPY (JPY is the quote)',
   computeMacroScore('long', 'GBP/JPY', stress) < 0.5);
ok('risk-off is BULLISH for short GBP/JPY',
   computeMacroScore('short', 'GBP/JPY', stress) > 0.5);
ok('risk-off is BEARISH for long USD/CHF (CHF is the quote)',
   computeMacroScore('long', 'USD/CHF', stress) < 0.5);
ok('CHF/JPY (both legs safe-haven) nets to neutral 0.5',
   computeMacroScore('long', 'CHF/JPY', stress) === 0.5);
ok('risk-off stays BULLISH for long gold (XAU is the base — original logic)',
   computeMacroScore('long', 'XAU/USD', stress) > 0.5);
ok('risk-on favors long GBP/JPY (carry regime)',
   computeMacroScore('long', 'GBP/JPY', calm) > 0.5);
ok('non-safe-haven pair without yield data stays neutral (unchanged behavior)',
   computeMacroScore('long', 'EUR/USD', stress) === 0.5);
ok('long/short are mirror images',
   Math.abs(computeMacroScore('long', 'GBP/JPY', stress)
          + computeMacroScore('short', 'GBP/JPY', stress) - 1) < 1e-12);

console.log(`\n${pass} passed, ${failCount} failed`);
if (failCount) process.exit(1);
