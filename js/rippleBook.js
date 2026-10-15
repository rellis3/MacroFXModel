/**
 * RIPPLE BOOK — the one shared reading of the option book "by DTE": every contract's gamma at its OWN
 * time-to-expiry and IV (gexLadder / fullBookGex maths, not a copy), summed per strike, with each strike's
 * gamma split into DTE buckets. Page, export and bot should read levels from here so they cannot disagree
 * about what a strike is made of.
 *
 * Status (oi_research_book/RIPPLE_BOOK_RESULTS.md, 2026-10-15): the weighting is just correct maths. As a
 * RANGE read on NQ the full book is about as good as the short book (not better); ripple walls react like any
 * listed strike (placebo null). So this is MEASUREMENT: it says what a level is made of; it does not claim the
 * level has edge. The three-way (ripple vs day book vs ≤3 DTE) test waits for our own nightly capture.
 *
 * Pure, offline-testable.  rippleBook(legs, spot, opts) → { strikes, buckets, rows, walls, nodes, gex, flip, regime } | null
 */
import { gexLadder } from './gexLadder.js';
import { fullBookGex } from './fullBookGex.js';

export const RIPPLE_BUCKETS = [
  { id: 'd0_1', label: '0–1 DTE', max: 1 },
  { id: 'd2_7', label: '2–7 DTE', max: 7 },
  { id: 'd8_45', label: '8–45 DTE', max: 45 },
  { id: 'd46p', label: '46+ DTE', max: Infinity },
];
const bucketOf = dte => RIPPLE_BUCKETS.find(b => !(Number.isFinite(dte)) || dte <= b.max) || RIPPLE_BUCKETS[RIPPLE_BUCKETS.length - 1];

// opts: mult, flatSigma, windowFrac (strikes kept within ±frac of spot), nodes (how many top |net| strikes), plus gexLadder's.
export function rippleBook(legs, spot, { mult = 1, flatSigma = 0.2, windowFrac = 0.12, nodes = 6 } = {}) {
  const lad = gexLadder(legs, spot, { mult, flatSigma, windowFrac, maxSeries: 999 });
  if (!lad) return null;
  const n = lad.strikes.length;
  const zero = () => Object.fromEntries(RIPPLE_BUCKETS.map(b => [b.id, 0]));
  const rows = lad.strikes.map(k => ({ strike: k, call: 0, put: 0, net: 0, abs: 0, byBucket: zero(), absByBucket: zero() }));
  for (const s of lad.series) {
    const b = bucketOf(s.dte).id;
    for (let i = 0; i < n; i++) {
      rows[i].call += s.call[i]; rows[i].put += s.put[i]; rows[i].net += s.net[i];
      rows[i].byBucket[b] += s.net[i];
      rows[i].absByBucket[b] += Math.abs(s.call[i]) + Math.abs(s.put[i]);
    }
  }
  for (const r of rows) {
    r.abs = Math.abs(r.call) + Math.abs(r.put);
    const tot = Object.values(r.absByBucket).reduce((a, b) => a + b, 0);
    r.share = Object.fromEntries(RIPPLE_BUCKETS.map(b => [b.id, tot > 0 ? +(r.absByBucket[b.id] / tot).toFixed(3) : 0]));
    r.driver = tot > 0 ? RIPPLE_BUCKETS.reduce((m, b) => (r.absByBucket[b.id] > r.absByBucket[m.id] ? b : m), RIPPLE_BUCKETS[0]).id : null;
  }
  const pick = (arr, f) => arr.reduce((m, r) => (m == null || f(r) > f(m) ? r : m), null);
  const above = rows.filter(r => r.strike > spot), below = rows.filter(r => r.strike < spot);
  const wall = (r, side) => r && { strike: r.strike, side, gamma: side === 'call' ? r.call : r.put, driver: r.driver, share: r.share };
  const walls = { call: wall(pick(above, r => r.call), 'call'), put: wall(pick(below, r => r.put), 'put') };
  const top = [...rows].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, nodes)
    .map(r => ({ strike: r.strike, net: r.net, sign: r.net >= 0 ? 'long' : 'short', driver: r.driver, share: r.share }));
  const fb = fullBookGex(legs, spot, { mult, flatSigma });
  return { strikes: lad.strikes, buckets: RIPPLE_BUCKETS, rows, walls, nodes: top,
    gex: fb?.gex ?? null, flip: fb?.flip ?? null, regime: fb?.regime ?? null, byExpiry: fb?.byExpiry ?? [], nExpiries: lad.nExpiries };
}
