/**
 * Confluence Count — pure helper to test the trading-lesson hypothesis:
 * "Confluence amplifies probability. Alignment zones where multiple session
 *  extensions overlap offer higher probability."
 *
 * Given a level price and a set of independent partner reference prices (prior
 * sessions' ladders, cross-session lines, PDH/PDL, PWH/PWL, pivots, round numbers,
 * daily opens), count how many fall within a pip tolerance — i.e. how "confluent"
 * the level is. Bucket it so a backtest can compare reversion / expectancy across
 * solo vs 2-source vs 3+-source zones. Pure, no network. Tested in
 * js/telegramV2.test.mjs.
 */

// How many partner prices sit within `tol` (absolute price) of `price`.
export function countWithin(price, partners, tol) {
  if (!(tol > 0) || !Array.isArray(partners)) return 0;
  let n = 0;
  for (const p of partners) if (Number.isFinite(p) && Math.abs(p - price) <= tol) n++;
  return n;
}

// Bucket a confluence count for cell/aggregation keys.
//   0 partners → '0·solo', 1 → '1·pair', ≥2 → '2·triple+'
export function confluenceBucket(count) {
  return count <= 0 ? '0·solo' : count === 1 ? '1·pair' : '2·triple+';
}
