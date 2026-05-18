// Level polarity flip detection.
//
// A SELL (resistance) level broken upward by X full-body closes can flip to a BUY (support)
// when price returns from above, if the live HMM regime is BULL.
// A BUY (support) level broken downward by X full-body closes can flip to a SELL (resistance)
// when price returns from below, if the live HMM regime is BEAR.
//
// Multi-flip is supported: the most recent qualifying break in bar history determines the
// current polarity — so a level can flip back and forth as price repeatedly breaks through.
//
// barsChron:   oldest-first array of { open, close } bar objects (5m or 1m)
// hmm5mRegime: { regime: 'BULL'|'BEAR'|'RANGE', confidence: 0–100 } or null
// flipCandles: consecutive full-body closes needed to constitute a genuine break (default 3)
//
// Returns null (no flip) or { newDirection, tag, reason }.

export function detectPolarityFlip(level, barsChron, hmm5mRegime, flipCandles = 3) {
  if (!barsChron || barsChron.length < flipCandles + 5) return null;
  if (!level.direction) return null;

  const P = level.price;

  // Classify each bar body relative to P.
  // A = full body above (Math.min(open,close) > P)
  // B = full body below (Math.max(open,close) < P)
  // Bars where the body straddles P are skipped — they're ambiguous.
  const runs = [];
  for (const bar of barsChron) {
    const lo = Math.min(parseFloat(bar.open), parseFloat(bar.close));
    const hi = Math.max(parseFloat(bar.open), parseFloat(bar.close));
    let side;
    if      (lo > P) side = 'A';
    else if (hi < P) side = 'B';
    else             continue; // body straddles level — skip

    if (!runs.length || runs[runs.length - 1].side !== side) {
      runs.push({ side, count: 1 });
    } else {
      runs[runs.length - 1].count++;
    }
  }

  if (runs.length < 2) return null;

  // Scan backward through prior runs (excluding the most recent, which is the current
  // price position) for the most recent qualifying break (count ≥ flipCandles).
  let lastBreakSide = null;
  for (let i = runs.length - 2; i >= 0; i--) {
    if (runs[i].count >= flipCandles) {
      lastBreakSide = runs[i].side;
      break;
    }
  }

  if (!lastBreakSide) return null;

  // The most recent qualifying break determines effective polarity:
  //   SELL level broken above (A) → effective BUY; broken below (B) → back to original SELL
  //   BUY  level broken below (B) → effective SELL; broken above (A) → back to original BUY
  const origDir = level.direction;
  const effectiveDir = origDir === 'short'
    ? (lastBreakSide === 'A' ? 'long'  : 'short')
    : (lastBreakSide === 'B' ? 'short' : 'long');

  if (effectiveDir === origDir) return null; // no change or flip-back to original

  // Regime gate — only apply the flip when the live HMM regime supports the new direction.
  // RANGE regime is deliberately excluded: ambiguous momentum doesn't validate a polarity change.
  const regime = hmm5mRegime?.regime;
  const conf   = hmm5mRegime?.confidence ?? 0;
  if (conf < 60)                                     return null;
  if (effectiveDir === 'long'  && regime !== 'BULL') return null;
  if (effectiveDir === 'short' && regime !== 'BEAR') return null;

  return {
    newDirection: effectiveDir,
    tag:          'Role Reversal',
    reason:       origDir === 'short'
      ? `Resistance broken (${flipCandles}+ closes above) — retesting as support`
      : `Support broken (${flipCandles}+ closes below) — retesting as resistance`,
  };
}
