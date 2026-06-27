/**
 * Fib Projection — the range-extension level set as one brick. The 45-level
 * extension grid and the `low + range × level` projection were copied verbatim
 * into asiaRangeEngine.js, rangeFibEngine.js and confluenceModules.js. One copy
 * here so adding/removing a level happens in exactly one place.
 *
 * These are RANGE-EXTENSION MULTIPLES, not statistical SDs: 0 = range low,
 * 1 = range high, negatives are LONG zones below the range, >1 are SHORT zones
 * above it. 0 / 0.25 / 0.5 / 0.75 / 1.0 are the high-awareness anchors.
 */

export const FIB_LEVELS = [
  -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5,
  -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.25,
  0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3,
  3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
  8.5, 9, 9.5, 10, 10.5,
];

export const KEY_LEVELS = new Set([0, 0.25, 0.5, 0.75, 1.0]);

// Project levels off a range. Each entry: { level, price, isKey }.
// Defaults to the full FIB_LEVELS grid; pass a subset for tighter level sets.
export function calcFibs(low, range, levels = FIB_LEVELS) {
  return levels.map(lv => ({ level: lv, price: low + range * lv, isKey: KEY_LEVELS.has(lv) }));
}
