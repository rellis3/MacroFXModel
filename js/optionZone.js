/**
 * The OPTION ZONE of a market: the stretch of price between the biggest option positions below and above it, in plain words.
 *
 * Source: /api/oi-today (CME options open interest, 11 markets). The engine calls the two edges the put wall and the call wall and tags the dealer
 * position PIN or BREAKOUT. Those names stay out of anything a reader sees. What is said instead, and why:
 *   - the ZONE is a LOCATION. Our placebo test (2026-09-23) found these levels attract price no better than the levels next to them, and the
 *     max-pain idea tested null, so nothing here says price is drawn to them.
 *   - the DEALER NOTE says whether dealers are positioned to calm moves (PIN) or amplify them (BREAKOUT). That is a RANGE statement. It is validated
 *     for S&P 500 ranges (ledger: gex-range-es) and has not been tested on FX, gold or the other indices, and the output says so.
 *
 * Pure: no fetch, no DOM. Tested in js/optionZone.test.mjs.
 */
import { DESK_EVIDENCE } from './deskEvidence.js';

const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
/** Validated range read for these markets only (the S&P future's gamma-range relation). */
export const DEALER_VALIDATED = new Set(['SPX500']);

/** row = one entry of /api/oi-today `pairs`; key = the page's instrument key (EURUSD, NQ, SPX500...). dp = decimals to print. */
export function optionZone(row, key, dp = 4) {
  const spot = num(row?.spot), a = num(row?.putWall), b = num(row?.callWall);
  if (spot == null || a == null || b == null || !(spot > 0) || !(a > 0) || !(b > 0)) return null;   // a wall of 0 means the level did not load, not a level at zero
  const lo = Math.min(a, b), hi = Math.max(a, b), f = v => v.toFixed(dp);
  const where = spot < lo ? 'below' : spot > hi ? 'above' : 'inside';
  const edgePct = where === 'below' ? (lo / spot - 1) * 100 : where === 'above' ? (spot / hi - 1) * 100 : 0;
  const dealers = row.regime === 'PIN' ? 'calm' : row.regime === 'BREAKOUT' ? 'amplify' : null;
  const validated = DEALER_VALIDATED.has(key) && DESK_EVIDENCE.some(e => e.id === 'gex-range-es' && e.verdict === 'validated');
  return { lo: f(lo), hi: f(hi), where, awayPct: Math.round(Math.abs(edgePct) * 100) / 100, dealers, dte: num(row.dte), validated,
    words: `${f(lo)} to ${f(hi)}`,
    placeWords: where === 'inside' ? 'price is inside it' : `price is ${Math.abs(edgePct) < 0.05 ? 'just ' : ''}${where} it${Math.abs(edgePct) >= 0.05 ? `, ${Math.abs(edgePct).toFixed(1)}% away` : ''}`,
    // Where the dealer read has been tested (the S&P 500 only) it is stated; elsewhere it is a conditional reading of the open interest, not an observed behaviour.
    dealerWords: dealers == null ? '' : validated
      ? (dealers === 'amplify' ? 'Dealers are positioned so their hedging tends to amplify moves.' : 'Dealers are positioned so their hedging tends to calm moves.')
      : (dealers === 'amplify' ? 'If dealers are positioned as the open interest suggests, their hedging would tend to amplify moves.' : 'If dealers are positioned as the open interest suggests, their hedging would tend to calm moves.') };
}
