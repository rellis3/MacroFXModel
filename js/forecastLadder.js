/**
 * Forecast ladder — the single band engine for the "Forecast" export family.
 *
 * ONE calc, replacing the Original / Bot / Calibrated / Export-v2 variants. It
 * produces a quantile ladder — p50 / p75 / p90 for four quantities — where every
 * rung means what its name says:
 *
 *     H-L   the day's range reaches this   (p50 → 50% of days, p75 → 25%, p90 → 10%)
 *     O-C   |close − open| reaches this
 *     O-H   the HIGH reaches open + this   ← the exhaustion levels that get faded
 *     O-L   the LOW  reaches open − this
 *
 * Three things make the rungs honest, none of which the previous variants did:
 *
 *   1. WIDTHS ARE FITTED, NOT ASSUMED. Every multiplier is the realized quantile
 *      of (realized ÷ σ), fit walk-forward on train data only by `forge/vol.py`
 *      and frozen. The old path multiplied a textbook Feller/half-normal constant
 *      by a hand-tuned per-asset correction; measured over 65 sessions its "median"
 *      band was exceeded 12-37% of the time instead of 50%.
 *   2. O-H / O-L ARE FITTED SEPARATELY, not inferred from O-C. The reflection
 *      principle says the running max of a DRIFTLESS walk is distributed like
 *      |close|, but real days have drift, so the up-excursion and the
 *      down-excursion are genuinely different variables.
 *   3. SCHEDULED EVENTS SHIFT σ BOTH WAYS. A day with no US Major release runs
 *      ~0.90 and an NFP/FOMC day ~1.22. The old `detectNewsMultiplier` floored at
 *      1.0, so it could not express the quiet case — which is half the calendar.
 *
 * Pure: no network, no I/O, no clock. Everything it needs arrives as arguments,
 * so the same function serves the live forecaster, the exports, the charts and
 * any backtest, and none of them can silently disagree.
 *
 * NOT a replacement for the COG family — `js/cogBands.js` reproduces COG's own
 * published line and is deliberately left alone. Two calcs, two purposes.
 */

import { LADDER_PARAMS } from './forecastLadderParams.js';

// σ scaling per horizon. The multipliers are fit per-horizon where the fit exists
// (see LADDER_PARAMS.horizons); √-time scaling of the daily σ is the fallback.
export const HORIZON_SCALE = { daily: 1, weekly: Math.sqrt(5), monthly: Math.sqrt(20) };

export const RUNGS      = ['p50', 'p75', 'p90'];
export const QUANTITIES = ['hl', 'oc', 'oh', 'ol'];

// Nominal exceedance each rung promises — what a coverage check scores against.
export const RUNG_TARGET = { p50: 0.50, p75: 0.25, p90: 0.10 };

const _r2 = x => Math.round(x * 100) / 100;

// Instrument → the key its fitted params are stored under. Falls back to the
// asset-class default when an instrument has no local price history to fit on
// (DE30 / UK100 / US2000 today — see LADDER_PARAMS.coverage).
export function paramsFor(instrument, assetClass = 'fx') {
  const key = String(instrument || '').toUpperCase();
  const pair = LADDER_PARAMS.pairs?.[key];
  if (pair) return { ...pair, source: 'fitted', key };
  const cls = LADDER_PARAMS.classDefaults?.[assetClass] ?? LADDER_PARAMS.classDefaults?.fx;
  return { ...cls, source: 'class-default', key: assetClass };
}

// The event multiplier for one day. `tag` is one of FOMC / NFP / CPI / other /
// none — `none` is a real bucket with a real (sub-1.0) multiplier, not a no-op.
// Unknown tags return 1.0 so an unrecognised calendar can never distort a band.
export function eventMultiplier(params, tag = 'none') {
  if (!tag) return 1;
  const m = params?.event?.[tag];
  return Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * Build the full ladder for one instrument.
 *
 * @param {number} sigmaDaily  daily σ as a FRACTION (e.g. 0.0034), pre-event
 * @param {object} opts
 *   instrument   display name ('EURUSD', 'GOLD', …) — selects the fitted params
 *   assetClass   'fx' | 'index' | 'commodity' — only used for the fallback
 *   eventTag     'FOMC' | 'NFP' | 'CPI' | 'other' | 'none'
 *   horizon      'daily' | 'weekly' | 'monthly'
 *   open         optional price; when given, each rung also carries ± levels
 * @returns {object} ladder — percentages of price, plus `levels` when `open` is set
 */
export function buildLadder(sigmaDaily, opts = {}) {
  const {
    instrument = '', assetClass = 'fx', eventTag = 'none',
    horizon = 'daily', open = null,
  } = opts;

  const params = paramsFor(instrument, assetClass);
  const evMult = eventMultiplier(params, eventTag);
  // Per-horizon fitted widths where they exist, else the daily widths with the
  // σ scaled by √time. Flagged either way so a caller can tell them apart —
  // √-scaling assumes the range SHAPE is horizon-invariant, which is an
  // assumption the daily fit cannot verify.
  const hp = params.horizons?.[horizon];
  const width = hp?.width ?? params.width;
  const widthSource = hp?.width ? `fitted-${horizon}` : (horizon === 'daily' ? 'fitted-daily' : 'sqrt-scaled');

  const sigmaScaled = sigmaDaily * (HORIZON_SCALE[horizon] ?? 1) * evMult;
  const sPct = sigmaScaled * 100;

  const out = {
    sigma_daily_pct: _r2(sigmaDaily * 100),
    sigma_used_pct:  _r2(sPct),
    vol_annual:      _r2(sigmaDaily * Math.sqrt(252) * 100),
    event_tag:       eventTag,
    event_mult:      Math.round(evMult * 1000) / 1000,
    horizon,
    params_source:   params.source,
    width_source:    widthSource,
    estimator:       params.estimator ?? null,
  };

  for (const q of QUANTITIES) {
    const mult = width?.[q];
    if (!mult) continue;
    out[q] = {};
    RUNGS.forEach((rung, i) => {
      const c = mult[i];
      if (!Number.isFinite(c)) return;
      out[q][rung] = _r2(c * sPct);
    });
  }

  if (Number.isFinite(open) && open > 0) out.levels = ladderLevels(out, open);
  return out;
}

// ± price levels off an open. H-L is a WIDTH (a range threshold, not a level), so
// it is deliberately absent here — drawing open±hl would imply a one-sided move of
// the whole range, which is not what the H-L rung forecasts.
export function ladderLevels(ladder, open) {
  const lv = {};
  for (const rung of RUNGS) {
    if (ladder.oh?.[rung] != null) lv[`oh_${rung}`] = open * (1 + ladder.oh[rung] / 100);
    if (ladder.ol?.[rung] != null) lv[`ol_${rung}`] = open * (1 - ladder.ol[rung] / 100);
    if (ladder.oc?.[rung] != null) {
      lv[`oc_up_${rung}`] = open * (1 + ladder.oc[rung] / 100);
      lv[`oc_dn_${rung}`] = open * (1 - ladder.oc[rung] / 100);
    }
  }
  return lv;
}

// Flat {hl_p50, oc_p75, oh_p90, …} view — the shape the export text builders and
// the archive want, so neither has to walk the nested object.
export function flattenLadder(ladder) {
  const flat = {};
  for (const q of QUANTITIES) {
    for (const rung of RUNGS) {
      const v = ladder?.[q]?.[rung];
      if (v != null) flat[`${q}_${rung}`] = v;
    }
  }
  return flat;
}
