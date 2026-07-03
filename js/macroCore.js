/**
 * Macro Core — Tier-1 brick: the pre-registered risk-regime classifier for the
 * macro falsification test (platform review #7 / TDE ARCHITECTURE §7c).
 *
 * ONE question, TWO pre-registered factors, ZERO tunable weights:
 *   "Is the market in a risk-off, neutral, or risk-on state — using only
 *    information publishable by then?"
 *   • VIX (FRED VIXCLS): level + short trend
 *   • HY credit (FRED BAMLH0A0HYM2): 20-observation OAS change
 *
 * THRESHOLDS ARE FROZEN (2026-07-03, before any backfill result was seen).
 * Changing them after looking at bucket/ablation results voids the test —
 * that is the whole point of pre-registration. If a future recalibration is
 * ever justified, it ships as a NEW named threshold set with a new test run,
 * never an edit of this one.
 *
 * Publication honesty: FRED daily series print with a lag — an observation
 * dated D is treated as usable from the NEXT BUSINESS DAY (Fri→Mon). All
 * consumers (live slow loop and the backfill's contextByDate) resolve through
 * the same `macroRegime`, so training and serving cannot diverge.
 *
 * riskSens is DERIVED from fx-macro-model's PAIR_DRIVERS at import time via
 * the instrument registry's resolveKey — never a hand-copied table (frozen
 * contract, TDE §7c #2; golden-equality-tested in js/macroCore.test.mjs).
 * Sign convention (frozen there): riskSens > 0 ⇒ pair RISES in risk-off.
 *
 * Consumers:
 *   • server slow loop → tdeRefreshPair(pair, { macro: macroContext(...) })
 *   • server backfill route → runBackfill([pair], { contextByDate:
 *       macroContextByDate(pair, fredHistory) })   (per pair — riskSens is
 *       pair-specific, so each pair gets its own map)
 * The TDE stamps the context into snapshots and resolves direction via
 * decisionCore.macroState; this brick never sees a trade.
 */

import { PAIR_DRIVERS } from './fx-macro-model.js';
import { resolveKey } from './instrumentRegistry.js';

// FRED series this brick is defined over (the loader fetches exactly these).
export const MACRO_FRED_SERIES = Object.freeze({ vix: 'VIXCLS', hy: 'BAMLH0A0HYM2' });

// ── FROZEN thresholds (pre-registered — see header) ──────────────────────────
export const MACRO_THRESHOLDS = Object.freeze({
  vixRiskOff:     25,    // VIX at/above this level alone ⇒ RISK_OFF
  vixElevated:    20,    // elevated level AND rising ⇒ RISK_OFF
  vixTrendObs:    5,     // trend window, in observations (~1 week)
  vixTrendRise:   3,     // "rising" = VIX up ≥ this many points over the window
  hyChangeObs:    20,    // HY OAS change window, in observations (~1 month)
  hyWidenRiskOff: 0.40,  // HY OAS +40bp over the window ⇒ RISK_OFF
  vixRiskOn:      16,    // calm VIX level …
  // … AND VIX not rising AND HY not widening ⇒ RISK_ON. Anything else NEUTRAL.
});

// Context older than this (calendar days past the newest usable observation's
// effective date) is STALE → regime NEUTRAL + stale:true. Fail-neutral, never
// fail-closed: macro is a modifier, a FRED outage must not block trading.
export const MACRO_STALE_DAYS = 3;

// ── riskSens derived from PAIR_DRIVERS (zero copies) ─────────────────────────
// Built by resolveKey-ing PAIR_DRIVERS' OWN keys ('EUR/USD' → 'eurusd'), so the
// lookup accepts any alias the registry knows and there is no hand-kept map.
const _RISK_SENS = (() => {
  const m = new Map();
  for (const [display, cfg] of Object.entries(PAIR_DRIVERS)) {
    const key = resolveKey(display);
    if (key && Number.isFinite(cfg?.riskSens)) m.set(key, cfg.riskSens);
  }
  return m;
})();

// riskSens for any pair alias, or null when the pair has no driver row
// (indices etc.) — null propagates to a null macro context = fail-neutral.
export function riskSensFor(pair) {
  const key = resolveKey(pair);
  return key != null && _RISK_SENS.has(key) ? _RISK_SENS.get(key) : null;
}

// ── date plumbing (UTC, string math on 'YYYY-MM-DD') ─────────────────────────
const DAY_MS = 86_400_000;
const dstr = ms => new Date(ms).toISOString().slice(0, 10);

// An observation dated D is USABLE from the next business day (publication
// lag): Mon–Thu → next day; Fri → Mon; Sat/Sun (shouldn't occur) → Mon.
export function effectiveDate(obsDate) {
  const t = Date.parse(obsDate + 'T00:00:00Z');
  if (!Number.isFinite(t)) return null;
  const dow = new Date(t).getUTCDay();               // 0 Sun … 6 Sat
  const add = dow === 5 ? 3 : dow === 6 ? 2 : 1;     // Fri→Mon, Sat→Mon, else next day
  return dstr(t + add * DAY_MS);
}

// Index of the newest observation usable at asOfDate (effectiveDate ≤ asOfDate),
// scanning backward from a hint for O(1) amortized sequential access.
function usableIdx(series, asOfDate, hint) {
  let i = Math.min(hint ?? series.length - 1, series.length - 1);
  while (i >= 0 && effectiveDate(series[i].date) > asOfDate) i--;
  while (i + 1 < series.length && effectiveDate(series[i + 1].date) <= asOfDate) i++;
  return i;   // −1 when nothing usable yet
}

// The classifier itself, over resolved indices — the ONE formula both entry
// points share (macroRegime for a single asOf, macroContextByDate for the map).
function regimeAt(vixArr, hyArr, iv, ih) {
  const T = MACRO_THRESHOLDS;
  if (iv < T.vixTrendObs || ih < T.hyChangeObs) return { regime: 'NEUTRAL', insufficient: true };
  const vix    = vixArr[iv].value;
  const vixChg = vix - vixArr[iv - T.vixTrendObs].value;
  const hyChg  = hyArr[ih].value - hyArr[ih - T.hyChangeObs].value;
  const riskOff = vix >= T.vixRiskOff
               || (vix >= T.vixElevated && vixChg >= T.vixTrendRise)
               || hyChg >= T.hyWidenRiskOff;
  const riskOn  = !riskOff && vix <= T.vixRiskOn && vixChg <= 0 && hyChg <= 0;
  return { regime: riskOff ? 'RISK_OFF' : riskOn ? 'RISK_ON' : 'NEUTRAL',
           vix, vixChg: +vixChg.toFixed(4), hyChg20: +hyChg.toFixed(4) };
}

// ── public: regime at one instant ────────────────────────────────────────────
// fredHistory: { vix: [{date:'YYYY-MM-DD', value}…asc], hy: [same] } — obs-dated.
// Returns { regime, asOfObs: {vix, hy} | null, vix?, vixChg?, hyChg20?,
//           insufficient? } — NEUTRAL whenever the honest answer is "can't say".
export function macroRegime(fredHistory, asOfMs) {
  const vixArr = fredHistory?.vix ?? [], hyArr = fredHistory?.hy ?? [];
  const asOfDate = dstr(asOfMs);
  const iv = usableIdx(vixArr, asOfDate);
  const ih = usableIdx(hyArr, asOfDate);
  if (iv < 0 || ih < 0) return { regime: 'NEUTRAL', asOfObs: null, insufficient: true };
  const r = regimeAt(vixArr, hyArr, iv, ih);
  return { ...r, asOfObs: { vix: vixArr[iv].date, hy: hyArr[ih].date } };
}

// ── public: the snapshot context object (TDE §7c shape) ──────────────────────
// { regime, riskSens, asOf, stale } — or null when the pair has no riskSens
// (buildSnapshot stamps null = fail-neutral). Stale data ⇒ regime NEUTRAL +
// stale:true, riskSens kept finite so the degradation is stamped and visible.
export function macroContext(pair, fredHistory, asOfMs = Date.now(), { staleDays = MACRO_STALE_DAYS } = {}) {
  const rs = riskSensFor(pair);
  if (rs == null) return null;
  const reg = macroRegime(fredHistory, asOfMs);
  if (!reg.asOfObs) return { regime: 'NEUTRAL', riskSens: rs, asOf: null, stale: true };
  const effMs = Date.parse(effectiveDate(reg.asOfObs.vix) + 'T00:00:00Z');
  const stale = asOfMs - effMs > staleDays * DAY_MS;
  return {
    regime: stale ? 'NEUTRAL' : reg.regime,
    riskSens: rs,
    asOf: effMs,
    stale,
  };
}

// ── public: the backfill injection map (TDE §7c #4 shape) ────────────────────
// { 'YYYY-MM-DD': { macro: { regime, riskSens, asOf } } } for ONE pair (riskSens
// is pair-specific — run the backfill per pair with its own map). Single O(n)
// pass; every date from the first fully-warmed observation to `to` gets an
// entry, so replayed days join on their date string. Pairs without a driver
// row return {} — their backfill runs macro-neutral, rows unchanged.
export function macroContextByDate(pair, fredHistory, { to = Date.now() } = {}) {
  const rs = riskSensFor(pair);
  if (rs == null) return {};
  const vixArr = fredHistory?.vix ?? [], hyArr = fredHistory?.hy ?? [];
  const T = MACRO_THRESHOLDS;
  if (vixArr.length <= T.vixTrendObs || hyArr.length <= T.hyChangeObs) return {};
  // First date with full windows on both series (their effective dates).
  const firstOk = [effectiveDate(vixArr[T.vixTrendObs].date), effectiveDate(hyArr[T.hyChangeObs].date)]
    .sort()[1];
  const out = {};
  let iv = 0, ih = 0;
  for (let t = Date.parse(firstOk + 'T00:00:00Z'); t <= to; t += DAY_MS) {
    const date = dstr(t);
    iv = usableIdx(vixArr, date, iv + 1);
    ih = usableIdx(hyArr, date, ih + 1);
    if (iv < 0 || ih < 0) continue;
    const r = regimeAt(vixArr, hyArr, iv, ih);
    out[date] = { macro: { regime: r.regime, riskSens: rs, asOf: t } };
  }
  return out;
}
