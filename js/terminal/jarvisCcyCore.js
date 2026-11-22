// js/terminal/jarvisCcyCore.js: the pure half of Jarvis's CURRENCIES view. A currency's strength today is the AVERAGE of its pair moves, each pair's open-to-now move divided by that pair's own usual
// open-to-close move (forecast.oc_median), counted +move for the base currency and -move for the quote currency. No model, no forecast: it describes how far each currency has travelled so far today.
import { spokenName } from './jarvisNames.js';
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export const CCY_NAMES = { USD: 'the dollar', EUR: 'the euro', GBP: 'the pound', JPY: 'the yen', AUD: 'the Australian dollar', NZD: 'the kiwi', CAD: 'the Canadian dollar', CHF: 'the Swiss franc' };
export const CAP = 3;            // a pair's move is clipped at three times its usual move, as in CANDLES
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const clip = v => Math.max(-CAP, Math.min(CAP, v));

/** vol = /api/vol-forecast/live `instruments`. Returns { list: [{ ccy, s, n }] strongest first, pairs: [{ key, base, quote, ratio }] biggest first, minPairs } or null when too little data. */
export function ccyStrength(vol) {
  if (!vol || typeof vol !== 'object') return null;
  const sum = {}, cnt = {}, pairs = [];
  for (const c of CCYS) { sum[c] = 0; cnt[c] = 0; }
  for (let i = 0; i < CCYS.length; i++) for (let j = i + 1; j < CCYS.length; j++) {
    const a = CCYS[i], b = CCYS[j];
    let key = a + b, flip = 1, v = vol[key]; if (!v) { key = b + a; v = vol[key]; flip = -1; } if (!v) continue;
    const oc = num(v.oc), noise = num(v.forecast?.oc_median); if (oc == null || !(noise > 0)) continue;
    const base = flip === 1 ? a : b, quote = flip === 1 ? b : a, r = clip(oc / noise);
    sum[base] += r; sum[quote] -= r; cnt[base]++; cnt[quote]++; pairs.push({ key, base, quote, ratio: r });
  }
  if (pairs.length < 12 || CCYS.some(c => cnt[c] < 3)) return null;
  const list = CCYS.map(c => ({ ccy: c, s: sum[c] / cnt[c], n: cnt[c] })).sort((x, y) => y.s - x.s);
  pairs.sort((x, y) => Math.abs(y.ratio) - Math.abs(x.ratio));
  return { list, pairs, minPairs: Math.min(...CCYS.map(c => cnt[c])) };
}

/** Ring radius for rank i (0 = strongest = inner ring). */
export const ringRadius = i => 0.6 + i * 0.17;
/** Where a sphere sits: ring i of 8 (0 = inner), angle a, tilted about X by tx and about Z by tz. Writes [x, y, z] into out (no allocation). */
export function orbitPos(i, a, tx, tz, out) {
  const r = ringRadius(i), x = r * Math.cos(a), z = r * Math.sin(a);
  const y1 = -z * Math.sin(tx), z1 = z * Math.cos(tx);
  out[0] = x * Math.cos(tz) - y1 * Math.sin(tz); out[1] = x * Math.sin(tz) + y1 * Math.cos(tz); out[2] = z1; return out;
}
/** Sphere SIZE shows the SIZE of the move, whatever its direction (a review found the old signed scale drew the weakest currency smallest, hiding a big fall).
 *  Returns the radius as a fraction 0..1 of the biggest sphere, so the drawn AREA is proportional to |strength| on one fixed scale (CAP usual moves = full size; strength is an
 *  average of capped pair moves, so it can never pass CAP). A floor (FLOOR of the radius) keeps a still currency visible; the floor is the only place area is not proportional. */
export const FLOOR = 0.16;
export const sizeOf = (s, cap = CAP) => Math.max(FLOOR, Math.sqrt(Math.min(1, Math.abs(Number(s) || 0) / cap)));
/** Direction: 'up' / 'dn' / 'flat' (|strength| under FLAT usual moves counts as barely moved), and its glyph, the second cue beside colour. */
export const FLAT = 0.12;
export const dirOf = s => (Math.abs(s) < FLAT ? 'flat' : s > 0 ? 'up' : 'dn');
export const arrowOf = s => ({ up: '▲', dn: '▼', flat: '–' })[dirOf(s)];
/** Orbit speed is DECORATION in the view (every sphere turns at the same slow rate). Kept for callers: |strength| against the biggest, 0..1. */
export const speedOf = (s, maxAbs) => (maxAbs > 0 ? Math.min(1, Math.abs(s) / maxAbs) : 0);
export const signed = v => { const a = Math.abs(v).toFixed(2); return Number(a) === 0 ? '0.00' : `${v >= 0 ? '+' : '-'}${a}`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** The spoken line, or null without data. */
export function ccyScript(R) {
  if (!R?.list?.length) return null;
  const hi = R.list[0], lo = R.list[R.list.length - 1], p = R.pairs[0];
  const spoke = spokenName;
  const dirWord = p.ratio >= 0 ? 'up' : 'down';
  return `${cap(CCY_NAMES[hi.ccy])} is the strongest of the eight majors so far today, and ${CCY_NAMES[lo.ccy]} the weakest. Each currency is scored as the average of its pair moves against their usual size. The biggest single pair move is ${spoke(p.key)}, ${dirWord} ${Math.abs(p.ratio).toFixed(1)} times its usual move. This describes the day so far; it is not a forecast.`;
}
