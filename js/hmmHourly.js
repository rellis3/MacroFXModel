/**
 * The HOURLY market-state model, and the log that remembers it.
 *
 * WHAT IT IS. The same two-state Gaussian model the daily page uses (hmm.js), fitted on hourly log returns instead of daily ones. Its two states
 * differ by return VARIANCE, so it says whether the tape is QUIET or ACTIVE right now. It does not say which way price will go (hmm.js's header and
 * js/travelRead.js explain why that distinction cost a whole dollar move on 2026-09-29). The daily model suits longer trades; this one suits the day.
 *
 * WHY A LOG. The intraday HMM feeds the old regime bots wrote live on the laptop and are empty on the server now, so there was no record of how a
 * pair moved between states through a day. Each hour the server fits the model on the trailing ~25 trading days of hourly bars, keeps ONLY the state
 * for the hour just completed (the filtered, as-it-was-known read, never a smoothed one that peeks ahead), and appends it here. The first run also
 * backfills a few days the same way, refitting at every hour using only bars up to that hour, so even the backfill is point-in-time.
 *
 * STORE SHAPE (compact on purpose, the bill is egress):
 *   { v: 1, pairs: { 'EUR/USD': { t0: '2026-10-21T08', s: 'qqqaaq.q', p: [97, 95, 71, ...] } } }
 *   plus d: one character per hour of what the hour's price DID (u up, d down, f flat, . unknown), kept so the strip can colour active hours green or red.
 *   one character per consecutive hour from t0: q quiet, a active, . unknown (no bar that hour: weekend, holiday, a missed run); p = percent sure.
 *
 * Pure: no fetch, no clock. Tested in js/hmmHourly.test.mjs.
 */
import { fitHMM } from '../hmm.js';

export const FIT_BARS = 600;        // hourly bars fitted: ~25 FX trading days
export const MIN_BARS = 120;        // below this the fit is not trusted
export const KEEP_HOURS = 24 * 45;  // 45 days of log

const hourKey = ms => new Date(ms).toISOString().slice(0, 13);                 // 'YYYY-MM-DDTHH'
const hourMs = key => Date.parse(key + ':00:00Z');

/** candles: [{ ms, c }] ascending. Drops any return that spans a gap of more than maxGapH hours (weekend, holiday) so a closed market is not read as a giant move. */
export function barsToReturns(candles, { maxGapH = 4 } = {}) {
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    const a = candles[i - 1], b = candles[i];
    if (!(a.c > 0) || !(b.c > 0)) continue;
    if ((b.ms - a.ms) / 3.6e6 > maxGapH) continue;
    returns.push(Math.log(b.c / a.c));
  }
  return returns;
}

/** What the hour just completed DID: 'u' closed up, 'd' closed down, 'f' flat, '.' unknown (no previous bar close by). Past tense only; a description, never a forecast. */
export function dirAt(candles, k) {
  const a = candles[k - 1], b = candles[k];
  if (!a || !b || !(a.c > 0) || !(b.c > 0) || (b.ms - a.ms) / 3.6e6 > 4) return '.';
  return b.c > a.c ? 'u' : b.c < a.c ? 'd' : 'f';
}

/** The model's read at the LAST bar of `candles`. null when there is too little data or the fit fails. */
export function hourlyState(candles) {
  const slice = candles.slice(-FIT_BARS);
  const returns = barsToReturns(slice);
  if (returns.length < MIN_BARS) return null;
  const r = fitHMM(returns);
  if (!r || !Number.isFinite(r.rangeProb)) return null;
  const quiet = r.regime === 'RANGE', p = quiet ? r.rangeProb : r.trendProb;
  return { state: quiet ? 'quiet' : 'active', prob: Math.round(Math.min(1, Math.max(0, p)) * 100), sigmaRatio: r.sigmaRatio ?? null, reliable: r.reliable !== false };
}

/** Point-in-time backfill: for each of the last `hours` bars, the state using only the bars up to and including that one. */
export function backfill(candles, hours) {
  const out = [], n = candles.length;
  for (let k = Math.max(MIN_BARS, n - hours); k < n; k++) {
    const st = hourlyState(candles.slice(0, k + 1));
    if (st) out.push({ hour: hourKey(candles[k].ms), state: st.state, prob: st.prob, dir: dirAt(candles, k) });
  }
  return out;
}

/** Same as backfill, but hands the event loop back every few fits: each fit is ~100 ms of unbroken work, and 96 of them in a row froze the server. */
export async function backfillAsync(candles, hours, { yieldEvery = 3 } = {}) {
  const out = [], n = candles.length; let i = 0;
  for (let k = Math.max(MIN_BARS, n - hours); k < n; k++) {
    const st = hourlyState(candles.slice(0, k + 1));
    if (st) out.push({ hour: hourKey(candles[k].ms), state: st.state, prob: st.prob, dir: dirAt(candles, k) });
    if (++i % yieldEvery === 0) await new Promise(r => setImmediate(r));
  }
  return out;
}

/** Hours logged before direction was kept have d '.', but the price history still says what each hour did. Fills them in place from `candles`; returns how many it filled. */
export function fillDirections(store, key, candles) {
  const e = store?.pairs?.[key]; if (!e) return 0;
  if (typeof e.d !== 'string' || e.d.length !== e.s.length) e.d = '.'.repeat(e.s.length);
  const t0 = hourMs(e.t0); let filled = 0;
  for (let k = 1; k < candles.length; k++) {
    const i = Math.round((hourMs(hourKey(candles[k].ms)) - t0) / 3.6e6);
    if (i < 0 || i >= e.s.length || e.d[i] !== '.' || e.s[i] === '.') continue;
    const d = dirAt(candles, k); if (d === '.') continue;
    e.d = e.d.slice(0, i) + d + e.d.slice(i + 1); filled++;
  }
  return filled;
}

/** The hour of the last reading stored for a pair, or null. Lets a run skip a pair that already has the hour it would compute. */
export function lastHour(store, key) {
  const e = store?.pairs?.[key]; return e ? hourKey(hourMs(e.t0) + (e.s.length - 1) * 3.6e6) : null;
}
export const barHour = ms => hourKey(ms);

/** Add one reading to the store. Gaps between the last stored hour and this one are filled with '.', so the string stays one character per hour. */
export function appendReading(store, key, hour, state, prob, { keep = KEEP_HOURS, dir = '.' } = {}) {
  store.pairs ??= {};
  const ch = state === 'quiet' ? 'q' : state === 'active' ? 'a' : '.', pv = ch === '.' ? 0 : Math.round(prob);
  const e = store.pairs[key];
  if (!e) { store.pairs[key] = { t0: hour, s: ch, p: [pv], d: dir }; return store; }
  if (typeof e.d !== 'string' || e.d.length !== e.s.length) e.d = '.'.repeat(e.s.length);   // logs written before direction was kept
  const have = hourMs(e.t0) + (e.s.length - 1) * 3.6e6, want = hourMs(hour);
  if (want <= have) {                                  // an hour already stored (a re-run): overwrite it, never duplicate
    const i = Math.round((want - hourMs(e.t0)) / 3.6e6);
    if (i >= 0) { e.s = e.s.slice(0, i) + ch + e.s.slice(i + 1); e.p[i] = pv; e.d = e.d.slice(0, i) + dir + e.d.slice(i + 1); }
    return store;
  }
  const gap = Math.round((want - have) / 3.6e6) - 1;
  if (gap > 0) { e.s += '.'.repeat(gap); e.d += '.'.repeat(gap); e.p.push(...Array(gap).fill(0)); }
  e.s += ch; e.d += dir; e.p.push(pv);
  if (e.s.length > keep) { const drop = e.s.length - keep; e.t0 = hourKey(hourMs(e.t0) + drop * 3.6e6); e.s = e.s.slice(drop); e.d = e.d.slice(drop); e.p = e.p.slice(drop); }
  return store;
}

/** The last `hours` hours of one pair as [{ hour, state, prob }]; unknown hours are state null. Empty array when the pair has no log. */
export function tail(store, key, hours) {
  const e = store?.pairs?.[key]; if (!e) return [];
  const n = e.s.length, from = Math.max(0, n - hours), t0 = hourMs(e.t0), out = [];
  for (let i = from; i < n; i++) out.push({ hour: hourKey(t0 + i * 3.6e6), state: e.s[i] === 'q' ? 'quiet' : e.s[i] === 'a' ? 'active' : null, prob: e.p[i] });
  return out;
}

/** What the log says about the last N known hours: how many were active, and how many times the state changed. For a one-line read next to the strip. */
export function summarise(rows) {
  const known = rows.filter(r => r.state);
  if (!known.length) return null;
  let flips = 0; for (let i = 1; i < known.length; i++) if (known[i].state !== known[i - 1].state) flips++;
  const act = known.filter(r => r.state === 'active').length;
  return { hours: known.length, activeHours: act, activeShare: Math.round(100 * act / known.length), flips, now: known.at(-1) };
}

/** The last `hours` hours of one pair in the store's own compact shape, for the endpoint: { t0, s, p }. null when the pair has no log. */
export function window_(store, key, hours) {
  const e = store?.pairs?.[key]; if (!e) return null;
  const drop = Math.max(0, e.s.length - hours);
  return { t0: hourKey(hourMs(e.t0) + drop * 3.6e6), s: e.s.slice(drop), p: e.p.slice(drop), d: typeof e.d === 'string' && e.d.length === e.s.length ? e.d.slice(drop) : '.'.repeat(e.s.length - drop) };
}
