/**
 * Research forecasters for the direction ledger (forge/DIRECTION_BAR_PREREG.md, Amendment A2).
 *
 * Each is one validated sparse direction cell, registered as it was banked: the trigger is the cell's own frozen rule
 * and nothing here is refitted. A forecaster speaks only when its trigger is active at the issue close; on every other
 * day it returns null and the ledger holds the baselines alone.
 *
 * What a forecast says. p_up = B0's p_up for that instrument and horizon, moved by the cell's own measured excess hit
 * rate over its baseline, towards the side the cell names. So the forecast is "the baseline, plus what this cell added
 * in its most recent seen sample", and the ledger scores it against B0/B1 on the same rows. EXCESS below is copied from
 * analysis/output/direction-bar/scoreboard.json (the latest split of each cell: the one nearest the present and the
 * least in-sample). It is never re-fitted on ledger data.
 *
 * Inputs come from the server (`external`), as of the issue close:
 *   external.vol  { date, vixBetaPct, dRimpPct }   from volFlags() on Cboe VIX/VVIX/VXN and the Nasdaq-100 close
 *   external.cot  { NQ: {state, trend, reportDate}, ... }   from /api/cot-state (js/cotState.js)
 *   external.fomcDates  ['YYYY-MM-DD', ...]   scheduled decision days (js/fomcCalendar.js)
 *   external.rates  { date, rates: {USD, EUR, ...} annual %, refs: {ccy: last observation date} }   3m rates for fx-factor-carry
 * Pure. Tested in js/directionResearch.test.mjs.
 */

/** Excess hit rate over B0, per cell: scoreboard.json, latest split. */
export const EXCESS = {
  'vix-beta-change': 0.0857,        // S4 test split 2021-01 → 2026-07, NDX +5 sessions
  'vix-second-derivative': 0.0165,  // S5 test split 2021-02 → 2026-07, NDX +20 sessions
  'cot-state-d': 0.1286,            // S3 holdout markets, standardised 4-week move in the trend direction
  'post-fomc-usd-drift': 0.1061,    // S1 2022+ half, 7-leg long-USD basket over 5 sessions
};
export const FLAGS = { 'post-fomc-usd-drift': ['FRAGILE'] };      // 2026-10-31 code audit; see the cell's entry in js/deskEvidence.js

const clip = p => Math.min(0.99, Math.max(0.01, p));

/** pandas rolling(252, min_periods=200).rank(pct=True) for the last element: average rank among the window's finite values. */
export function lastPct(values, win = 252, minPeriods = 200) {
  const w = values.slice(-win).filter(Number.isFinite);
  const x = values.at(-1);
  if (!Number.isFinite(x) || w.length < minPeriods) return null;
  let less = 0, eq = 0;
  for (const v of w) { if (v < x) less++; else if (v === x) eq++; }
  return (less + (eq + 1) / 2) / w.length;
}

/**
 * The two VIX flags of forge/VIX_SIGNALS_FORWARD_PREREG.md, rebuilt exactly as scripts/vix-signals-forward/score.py does:
 *   dB    = 5-session change of the 20-session slope of ln VIX on ln Nasdaq-100            flag when its 252-session percentile <= 0.10
 *   dRimp = 5-session change of ln(VVIX/VXN)                                              flag when its 252-session percentile >= 0.90
 * `series` = { VIX, VVIX, VXN, NDX }, each [{date, value}]. Only dates present in all four are used. Returns the values at
 * the last common date, which the caller checks against the issue date.
 */
export function volFlags(series) {
  const maps = ['VIX', 'VVIX', 'VXN', 'NDX'].map(k => new Map((series?.[k] ?? []).map(p => [p.date, p.value])));
  if (maps.some(m => !m.size)) return null;
  const dates = [...maps[0].keys()].filter(d => maps.every(m => m.has(d) && m.get(d) > 0)).sort().slice(-420);
  if (dates.length < 300) return null;
  const [vix, vvix, vxn, ndx] = maps.map(m => dates.map(d => m.get(d)));
  const rV = vix.map((v, i) => (i ? Math.log(v / vix[i - 1]) : NaN)), rN = ndx.map((v, i) => (i ? Math.log(v / ndx[i - 1]) : NaN));
  const B = rV.map((_, i) => {
    if (i < 20) return NaN;                                        // needs 20 returns: indices i-19..i, all finite
    const a = rV.slice(i - 19, i + 1), b = rN.slice(i - 19, i + 1), ma = a.reduce((s, x) => s + x, 0) / 20, mb = b.reduce((s, x) => s + x, 0) / 20;
    let cov = 0, vr = 0; for (let k = 0; k < 20; k++) { cov += (a[k] - ma) * (b[k] - mb); vr += (b[k] - mb) ** 2; }
    return cov / vr;                                               // the (n-1) factors cancel
  });
  const dB = B.map((v, i) => (i >= 5 ? v - B[i - 5] : NaN));
  const lr = vvix.map((v, i) => Math.log(v / vxn[i]));
  const dRimp = lr.map((v, i) => (i >= 5 ? v - lr[i - 5] : NaN));
  const n = dates.length - 1;
  return { date: dates[n], dB: dB[n], dRimp: dRimp[n], dBPct: lastPct(dB), dRimpPct: lastPct(dRimp) };
}

const NDX_INSTS = new Set(['nq']);
/** Ledger instrument -> /api/cot-state key (js/cotState.js COT_ROW_FOR). */
const COT_KEY = { nq: 'NQ', es: 'SPX500', gold: 'GOLD', eurusd: 'EURUSD', gbpusd: 'GBPUSD', usdjpy: 'USDJPY' };
/** Sign of the long-USD basket on each ledger FX instrument: USD up = USDJPY up, EURUSD and GBPUSD down. */
const USD_SIGN = { eurusd: -1, gbpusd: -1, usdjpy: +1 };

const make = (model_id, prereg, fn) => ({ model_id, model_version: `${model_id}-v1`, prereg, forecast: ctx => {
  const r = fn(ctx);
  if (!r) return null;
  const p = clip(ctx.baseline.p0 + r.side * EXCESS[model_id]);
  return { p_up: p, mu_log: null, decision: r.side > 0 ? 'LONG' : 'SHORT', inputs: { cell: model_id, excess_hit: EXCESS[model_id], ...r.inputs }, flags: FLAGS[model_id] ?? [] };
} });

export const VIX_BETA_CHANGE = make('vix-beta-change', 'forge/VIX_SIGNALS_FORWARD_PREREG.md', ({ date, inst, h, external }) => {
  const v = external?.vol;
  if (!NDX_INSTS.has(inst) || h !== 5 || !v || v.date !== date || !(v.dBPct <= 0.1)) return null;
  return { side: +1, inputs: { dB_pct: +v.dBPct.toFixed(3), flag: 'dB 252-session percentile <= 0.10', window: 'ledger target runs from the signal close; the cell measured d+1 to d+6' } };
});

export const VIX_SECOND_DERIVATIVE = make('vix-second-derivative', 'forge/VIX_SIGNALS_FORWARD_PREREG.md', ({ date, inst, h, external }) => {
  const v = external?.vol;
  if (!NDX_INSTS.has(inst) || h !== 20 || !v || v.date !== date || !(v.dRimpPct >= 0.9)) return null;
  return { side: +1, inputs: { dRimp_pct: +v.dRimpPct.toFixed(3), flag: 'dln(VVIX/VXN, 5) 252-session percentile >= 0.90', window: 'ledger target runs from the signal close; the cell measured d+1 to d+21' } };
});

export const COT_STATE_D = make('cot-state-d', 'forge/COT_CROWDING_PROGRAMME_PREREG.md', ({ inst, h, external }) => {
  const s = external?.cot?.[COT_KEY[inst]];
  if (h !== 20 || !s || s.state !== 'D' || !(s.trend === 1 || s.trend === -1)) return null;
  // one event per (instrument, COT report): the state can only change when a new report is published
  return { side: s.trend, inputs: { cot_report_date: s.reportDate ?? null, trend: s.trend, event_key: `${inst}|${s.reportDate ?? '?'}` } };
});

export const POST_FOMC_USD_DRIFT = make('post-fomc-usd-drift', 'MD files/POST_FOMC_DRIFT_TEST.md', ({ date, inst, h, external }) => {
  if (h !== 5 || !(inst in USD_SIGN) || !(external?.fomcDates ?? []).includes(date)) return null;
  return { side: USD_SIGN[inst], inputs: { decision_day: date, event_key: `fomc|${date}`, window: 'ledger target runs from the 17:00 New York close of the decision day; the cell measured 14:30 ET on the day to 14:00 ET five sessions on' } };
});

// ── fx-factor-carry (forge/FX_FACTOR_STACK_PREREG.md, A1.8 and A3). UNDERPOWERED, forward record only. ──────────────
// Score of a pair = z(base) − z(quote), z = cross-sectional z of each currency's 3m rate minus the USD rate over the eight
// currencies (population SD, as scripts/fx-factor-stack/run.py). Map: P(up) = B0 + sigmoid(a + b·score) − sigmoid(a), with
// (a, b) fitted once on data to 2026-08-21 by scripts/fx-factor-stack/ledger_map.py and frozen here (analysis/output/
// fx-factor-stack/ledger_map.json). The 60-close fit is flat (b −0.002, CI [−0.086, +0.087]) so it would only repeat B0:
// not issued. The 20-close slope is +0.021 per score unit, CI [−0.062, +0.107]: about ±0.5 pp on P(up) at a score of ±1.
export const FX_CARRY_MAP = { 20: { a: 0.00990330680833078, b: 0.021254558976790176 } };
export const FX_CARRY_EUR_OFFSET = 0.008667064279859879;   // EZ 3m − DE call money, mean of the last 12 shared reference months (run.py load_rates)
export const FX_CARRY_MAX_AGE_DAYS = 200;                  // a rate whose latest reference date is older than this is stale: stay silent
const CCY8 = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const FX_PAIR = { eurusd: ['EUR', 'USD'], gbpusd: ['GBP', 'USD'], usdjpy: ['USD', 'JPY'] };   // [base, quote] of the ledger instrument
const sigmoid = x => 1 / (1 + Math.exp(-x));

/** z-scores of the eight currencies' differential vs USD (annual %). Null if any rate is missing. */
export function carryZ(rates) {
  const d = CCY8.map(c => (Number.isFinite(rates?.[c]) && Number.isFinite(rates?.USD) ? rates[c] - rates.USD : NaN));
  if (d.some(x => !Number.isFinite(x))) return null;
  const m = d.reduce((s, x) => s + x, 0) / 8, sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / 8);
  if (!(sd > 0)) return null;
  return Object.fromEntries(CCY8.map((c, i) => [c, (d[i] - m) / sd]));
}

export const FX_FACTOR_CARRY = { model_id: 'fx-factor-carry', model_version: 'fx-factor-carry-v1', prereg: 'forge/FX_FACTOR_STACK_PREREG.md',
  forecast: ({ date, inst, h, baseline, external }) => {
    const m = FX_CARRY_MAP[h], pair = FX_PAIR[inst], r = external?.rates;
    if (!m || !pair || !r || r.date !== date) return null;
    const z = carryZ(r.rates);
    if (!z) return null;
    const score = z[pair[0]] - z[pair[1]], shift = sigmoid(m.a + m.b * score) - sigmoid(m.a);
    return { p_up: clip(baseline.p0 + shift), mu_log: null, decision: shift >= 0 ? 'LONG' : 'SHORT',
      inputs: { cell: 'fx-factor-carry', score: +score.toFixed(3), shift_pp: +(shift * 100).toFixed(3), map: { a: m.a, b: m.b }, refs: r.refs, event_key: `${inst}|${date.slice(0, 7)}`,
        note: 'UNDERPOWERED: the fitted slope CI crosses zero; this row is the baseline plus a frozen in-sample map, not evidence' },
      flags: ['UNDERPOWERED'] };
  } };

export const RESEARCH = [VIX_BETA_CHANGE, VIX_SECOND_DERIVATIVE, COT_STATE_D, POST_FOMC_USD_DRIFT, FX_FACTOR_CARRY];
