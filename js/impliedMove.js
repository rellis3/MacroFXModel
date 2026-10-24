/**
 * What the options market says a typical day is worth, per market, for the newsletter's cards.
 *
 * SOURCE. The nightly CME QuikStrike capture stores a per-expiry implied-volatility curve for 11 markets (the FX majors, gold, the Nasdaq, S&P 500, Dow and Russell 2000).
 * js/ivMetrics.js impliedDayMove() turns the curve into a one-day number, and /api/oi-levels serves a few numbers per market (not the 1MB store). This is the same
 * capture that gives the option zones; it is NOT CME's CVOL index. The repo's CVOL file is a static manual upload covering six FX pairs and gold only.
 *
 * WHAT IS CLAIMED. Implied volatility forecasts realised volatility better than past-volatility models on the markets the ledger lists (iv-forecast, validated; gold from
 * iv-ladder-gold). It says how big, never which way. On any other market the row says it is untested there instead of borrowing the validation.
 *
 * Pure. Tested in js/impliedMove.test.mjs.
 */
import { DESK_EVIDENCE } from './deskEvidence.js';

/** Newsletter market key -> the key /api/oi-levels uses. */
export const IMPLIED_KEY = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', USDCHF: 'usdchf', GOLD: 'gold', NQ: 'nq', US30: 'dow', SPX500: 'spx', US2000: 'rut' };
export const impliedKeyFor = k => IMPLIED_KEY[k] ?? null;

const VALIDATED = new Set([
  ...(DESK_EVIDENCE.find(e => e.id === 'iv-forecast' && e.verdict === 'validated')?.instruments ?? []),
  ...(DESK_EVIDENCE.some(e => e.id === 'iv-ladder-gold' && e.verdict === 'validated') ? ['GOLD'] : []),
]);
export const impliedValidatedOn = key => VALIDATED.has(key);

const DAY = 864e5;
/** The row for one market, or null when there is no implied number or it is more than `maxAgeDays` old. rec is one entry of /api/oi-levels `implied`. */
export function impliedRow(rec, key, nowMs, { maxAgeDays = 5 } = {}) {
  if (!rec || !(rec.expMovePct > 0)) return null;
  if (Number.isFinite(nowMs) && Number.isFinite(rec.savedAtMs) && nowMs - rec.savedAtMs > maxAgeDays * DAY) return null;
  const dp = rec.expMovePct < 0.1 ? 3 : 2, validated = VALIDATED.has(key);
  return {
    move: +rec.expMovePct.toFixed(dp), iv30: rec.iv30Pct ?? null, validated,
    words: `a typical day of about ±${rec.expMovePct.toFixed(dp)}%`,
    sub: `${rec.iv30Pct != null ? `30-day implied volatility ${rec.iv30Pct.toFixed(1)}%. ` : ''}${validated ? 'A size read from the options market, never a direction.' : 'Untested on this market.'}`,
  };
}
