// Synthetic tests for pairCompositeEngine.js. No network.
//   node js/pairCompositeEngine.test.mjs
import { cotPairBias, pairComposite } from './pairCompositeEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[cotPairBias — GBP overcrowded long + JPY heavily short => positive (long GBPJPY)]');
{
  // Real-world-shaped example (GBP Z +2.4/WillCo 95, JPY Z -1.9/WillCo 12).
  // Note JPY's 12 sits just OUTSIDE the strict <=10 extreme band — a good
  // edge case: the score still leans hard positive, but `extreme` correctly
  // stays false rather than flagging on an almost-but-not-quite reading.
  const cotByCcy = { GBP: { specZ: 2.4, specPct: 95 }, JPY: { specZ: -1.9, specPct: 12 } };
  const r = cotPairBias('GBP', 'JPY', cotByCcy);
  ok('score is positive (base favored)', r.score > 0, r.score);
  ok('score saturates at 1 (raw (2.4-(-1.9))/4 = 1.075, clipped)', r.score === 1, r.score);
  ok('extreme flag NOT set — JPY (12) is outside the strict <=10 band', r.extreme === false);
  ok('base/quote reads carried through', r.base.z === 2.4 && r.quote.z === -1.9);
}

console.log('[cotPairBias — reversed extremes flip the sign, extreme still flags]');
{
  const cotByCcy = { EUR: { specZ: -2.1, specPct: 8 }, AUD: { specZ: 2.0, specPct: 93 } };
  const r = cotPairBias('EUR', 'AUD', cotByCcy);
  ok('score is negative (quote favored)', r.score < 0, r.score);
  ok('extreme flag set (base<=10, quote>=90)', r.extreme === true);
}

console.log('[cotPairBias — not extreme when neither leg clears 90/10]');
{
  const cotByCcy = { USD: { specZ: 0.8, specPct: 65 }, CAD: { specZ: -0.5, specPct: 40 } };
  const r = cotPairBias('USD', 'CAD', cotByCcy);
  ok('extreme flag is false', r.extreme === false);
  ok('still returns a mild score', r.score != null && Math.abs(r.score) < 0.5, r.score);
}

console.log('[cotPairBias — saturates at +/-1, never exceeds it]');
{
  const cotByCcy = { CHF: { specZ: 5, specPct: 99 }, NZD: { specZ: -5, specPct: 1 } };
  const r = cotPairBias('CHF', 'NZD', cotByCcy);
  ok('clipped to exactly 1', r.score === 1, r.score);
}

console.log('[cotPairBias — one leg missing is still usable, not treated as flat]');
{
  const cotByCcy = { GBP: { specZ: 1.6, specPct: 88 } };
  const r = cotPairBias('GBP', 'JPY', cotByCcy);
  ok('score derived from the one known leg', r.score > 0, r.score);
  ok('quote leg reported as null, not zero', r.quote === null);
}

console.log('[cotPairBias — both legs entirely missing -> null, not a crash]');
{
  const r = cotPairBias('GBP', 'JPY', {});
  ok('score null', r.score === null);
  ok('extreme false', r.extreme === false);
}

console.log('[pairComposite — averages present legs, missing left out not zeroed]');
{
  const r = pairComposite({
    technical: { score: 0.4 },
    cot: { score: 0.6 },
    macro: { score: null }, // missing coverage
    carry: { score: 0.2 },
  });
  ok('averages only the 3 non-null legs', r.score === +((0.4 + 0.6 + 0.2) / 3).toFixed(2), r.score);
  ok('total counts only present legs', r.total === 3);
}

console.log('[pairComposite — all legs agree -> agree === total]');
{
  const r = pairComposite({ a: { score: 0.5 }, b: { score: 0.3 }, c: { score: 0.7 } });
  ok('all 3 agree', r.agree === 3 && r.total === 3);
  ok('direction LONG', r.direction === 'LONG');
}

console.log('[pairComposite — mixed signs still averages correctly, agree counts only sign-matching]');
{
  const r = pairComposite({ a: { score: 0.8 }, b: { score: -0.2 }, c: { score: 0.6 } });
  // avg = 0.4 -> positive sign; a and c agree, b does not
  ok('composite score is the plain average', r.score === +((0.8 - 0.2 + 0.6) / 3).toFixed(2), r.score);
  ok('agree counts only same-sign legs', r.agree === 2, r.agree);
}

console.log('[pairComposite — small composite reads NEUTRAL, not a false LONG/SHORT]');
{
  const r = pairComposite({ a: { score: 0.1 }, b: { score: -0.05 } });
  ok('direction NEUTRAL under the 0.12 threshold', r.direction === 'NEUTRAL', r.score);
}

console.log('[pairComposite — no legs at all -> null, not a crash]');
{
  const r = pairComposite({});
  ok('score null', r.score === null);
  ok('direction null', r.direction === null);
  ok('total 0', r.total === 0);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll pairCompositeEngine tests passed.');
