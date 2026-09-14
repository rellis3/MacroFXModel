/**
 * driftAnatomy — what a drift reading is MADE OF.
 *
 * `driftReadout` (js/volForecast.js) answers "how unusual is this trend for this
 * instrument". That is a good question and it is not the only one a desk asks. The
 * three this module adds are the ones that separate a described trend from an
 * understood one:
 *
 *     1. PRECISION   is d distinguishable from zero at all?
 *     2. BASELINE    how much of it is just the interest-rate differential?
 *     3. COMPOSITION did it arrive in jumps, or as a grind?
 *
 * Pure: numbers in, numbers out. No fetch, no fs, no clock — same contract as
 * `jumpDiffusionCore.js`, for the same reason (a pure helper must not sit behind an
 * I/O import). Every input is supplied by the caller.
 *
 * ## 1. Precision — the fact that makes drift different from volatility
 *
 * σ and μ are not symmetric quantities, and the asymmetry is the whole reason this
 * module exists. σ can be estimated arbitrarily well by sampling more finely: that
 * is why realised variance converges, and why `jumpDiffusionCore`'s 5-minute grid
 * is worth building. μ cannot. Its standard error is σ/√T where T is CALENDAR SPAN,
 * and it does not shrink with sampling frequency at all (Merton 1980). Sampling a
 * pair every second for a year gives exactly the same error bar on μ as sampling it
 * daily.
 *
 * In `_driftD`'s own units — d = μ_win / σ — that lands on one line:
 *
 *     SE(d) = 1/√win        t = d·√win
 *
 * For win=14 the standard error is 0.267, which puts every `DRIFT_BANDS` threshold
 * in js/volForecast.js below or barely at the 2σ line:
 *
 *     band          |d|     t       two-sided p
 *     Strong        0.25    0.94    0.35
 *     Very strong   0.35    1.31    0.19
 *     Extreme       0.50    1.87    0.06
 *
 * That is NOT a defect in those bands — they rank a realised path against its own
 * history, which is a legitimate descriptive question, and `volForecast.js` already
 * states the readout is descriptive rather than predictive. But a reader shown only
 * "Strong bearish (top 14% of days)" cannot tell that the reading sits inside one
 * standard error of zero, and "strong" invites exactly the wrong inference. The
 * t-stat is the honest companion number, and it costs one multiplication.
 *
 * `daysToSignificance` inverts it: at this observed strength, how long a window
 * WOULD it take to separate the drift from zero (N ≥ (1.96/d)²). It is a statement
 * about the estimator's resolution, not a forecast that the drift persists.
 *
 * Caveat stated rather than buried: this SE treats σ as known. σ is itself estimated
 * (Yang-Zhang over ~30 days), so the true interval is modestly wider than the one
 * reported here. The direction of that error is knowable — always wider, never
 * narrower — so the t-stat here is an UPPER bound on significance.
 *
 * ## 2. Baseline — the drift you can observe instead of estimate
 *
 * In FX there is one drift nobody has to estimate. Covered interest parity fixes the
 * forward against spot exactly, so the forward curve states the risk-neutral drift
 * of the spot quote outright:
 *
 *     F/S = (1 + r_quote·T) / (1 + r_base·T)      →   mu_RN ≈ r_quote − r_base
 *
 * for a quote in units of QUOTE per unit of BASE (EURUSD = USD per EUR). With
 * r_USD 4% and r_EUR 2%, EURUSD's forward-implied drift is +2%/yr: the higher-rate
 * currency trades at a forward discount.
 *
 * Comparing a realised 14-day drift to that number is the difference between two
 * completely different market states wearing the same label. A drift roughly the
 * size of carry is the trade grinding along the forward curve. A drift a hundred
 * times carry is a repricing, and nothing about the rate differential explains it.
 * Both print "Strong bearish" today.
 *
 * NOTE the sign convention, because it is the easy bug: `fwdDriftPctPerDay` is what
 * the forward curve implies the SPOT QUOTE does. `carryAccrualPctPerDay` is what a
 * LONG-BASE position EARNS, which is its mirror image (long EUR / short USD earns
 * r_EUR and pays r_USD). `js/carryEngine.js` computes the accrual leg with the same
 * convention — `(rate_ccy − rate_funding)/100/252` per day held — and its honesty
 * caveat carries over unchanged: interbank rates are an upper bound on what a retail
 * account actually receives, so prefer broker financing rates when the caller has
 * them.
 *
 * ## 3. Composition — the one place jumps legitimately meet drift
 *
 * Phase 13 (`volatilityExhaustion/README.md`) settled that jumps are a
 * volatility-regime variable and carry no persistent directional information: they
 * do not cluster, do not skew, do not predict continuation. Three independent tests
 * then failed to turn the jump share into a better forward number, which is why
 * `server.js` serves the jump tables as DESCRIPTIVE ONLY and no bot imports them.
 *
 * None of that forbids the question here, because this is attribution rather than
 * forecasting. "Was the trend that ALREADY HAPPENED delivered by three CPI prints or
 * by a steady grind" is a decomposition of a realised path — the same kind of claim
 * as RV = BV + jump variance, which Phase 13 validated. It says nothing about
 * tomorrow, and this module must not be read as if it does.
 *
 * It is worth separating because the two paths behave differently in every respect a
 * trader cares about other than direction: an event-delivered drift is concentrated
 * in minutes around scheduled releases (the calendar tells you when the next one
 * is), while a diffusive drift is spread across sessions. Same −0.48%/day, entirely
 * different risk.
 *
 * ## What is deliberately ABSENT: drift persistence / half-life
 *
 * The obvious fourth question is "how long does a drift reading persist" — fit an
 * AR(1) to the d series and report ln(0.5)/ln(phi). It is not here, because on
 * ROLLING windows the answer is an artifact. A `win`-day rolling mean is an MA(win)
 * filter, so consecutive readings share win−1 of their win returns and the series
 * carries an AR(1) coefficient of roughly 1 − 1/win BY CONSTRUCTION, on pure noise,
 * with no persistence of any kind present. At win=14 that is phi ≈ 0.93 and a
 * half-life near 10 days — a number that looks like a finding and is arithmetic.
 *
 * Non-overlapping windows remove the artifact and leave ~1/win as many samples (35
 * on a 500-day history), which is too few to fit AR(1) with a usable error bar. So
 * the honest options are a biased number or an underpowered one. Neither ships. If
 * this question is worth answering it wants the pooled cross-sectional treatment —
 * many instruments, `forge/xsect.py`'s design — not another time-series statistic.
 */

// ── 1. Precision ─────────────────────────────────────────────────────────────

const Z95 = 1.959963984540054;

/**
 * Standard error, t-stat and confidence interval for a drift ratio.
 *
 *   driftPrecision(-0.53, 14)
 *     -> { se: 0.2673, t: -1.983, ci95: [-1.0512, -0.0088],
 *          significant: true, daysToSignificance: 14 }
 *
 * `d` is `_driftD`'s dimensionless mu/sigma. `win` is the number of returns it was
 * averaged over. Returns nulls rather than throwing on unusable input, so a caller
 * can attach the result unconditionally.
 */
export function driftPrecision(d, win = 14) {
  const out = { se: null, t: null, ci95: null, significant: null, daysToSignificance: null };
  if (!Number.isFinite(d) || !Number.isFinite(win) || win < 2) return out;

  const r4 = x => Math.round(x * 10000) / 10000;
  const se = 1 / Math.sqrt(win);
  const t  = d / se;

  out.se = r4(se);
  out.t  = r4(t);
  out.ci95 = [r4(d - Z95 * se), r4(d + Z95 * se)];
  out.significant = Math.abs(t) >= Z95;
  // N >= (1.96/|d|)^2 — the window length at which a drift THIS strong would clear
  // the 2-sigma bar. Undefined at d = 0 (no strength to resolve, ever).
  out.daysToSignificance = Math.abs(d) > 1e-9
    ? Math.ceil(Math.pow(Z95 / Math.abs(d), 2))
    : null;
  return out;
}

/**
 * The Merton (1980) horizon, in the units a reader can argue with: how many YEARS of
 * data are needed before an annualised drift of `muAnnualPct` is distinguishable
 * from zero at 95%, given annualised vol `sigmaAnnualPct`.
 *
 *   T >= (1.96 * sigma / mu)^2
 *
 * EURUSD at 8% annualised vol with a true 5%/yr drift needs ~10 years. At a 2%/yr
 * drift, ~61. This is why desks import mu from carry, factor models, options skew
 * and positioning rather than estimating it from one asset's price path — and why
 * the CTA answer to an unestimable mu is to pool it across 50+ markets.
 *
 * Cross-check worth knowing: fed a CONSISTENT pair (the same sigma the drift ratio
 * was divided by), this and `driftPrecision`'s `daysToSignificance` are the same
 * statement in different units — d=0.53 gives 14 days, and the annualised form gives
 * 0.054 years = 13.7 days. `driftAnatomy.test.mjs` asserts that agreement, so an
 * inconsistent sigma passed by a caller shows up as the two disagreeing rather than
 * as a quietly wrong number.
 */
export function yearsToDetectDrift(muAnnualPct, sigmaAnnualPct) {
  if (!Number.isFinite(muAnnualPct) || !Number.isFinite(sigmaAnnualPct)) return null;
  if (!(sigmaAnnualPct > 0) || Math.abs(muAnnualPct) < 1e-9) return null;
  const years = Math.pow(Z95 * sigmaAnnualPct / muAnnualPct, 2);
  // Precision scales with the answer. A fixed 1-decimal round collapses every
  // horizon under ~2 weeks to "0.0" — and short horizons are exactly the readings
  // worth quoting, since they are the ones a 14-day window can actually resolve.
  const dp = years < 0.1 ? 5 : years < 1 ? 3 : 1;
  const f = Math.pow(10, dp);
  return Math.round(years * f) / f;
}

// ── 2. Baseline — the forward-implied drift ──────────────────────────────────

/**
 * The drift the forward curve states outright, from the two legs' annual rates (in
 * PERCENT, e.g. 4.25 for 4.25%).
 *
 *   carryDrift(2.0, 4.0)   // EURUSD: base EUR 2%, quote USD 4%
 *     -> { fwdDriftPctPerDay: 0.0079, carryAccrualPctPerDay: -0.0079,
 *          fwdDriftPctPerYear: 2, diffPct: 2 }
 *
 * `fwdDriftPctPerDay`      what CIP implies the SPOT QUOTE does (r_quote − r_base).
 * `carryAccrualPctPerDay`  what a LONG-BASE position earns (its mirror).
 */
export function carryDrift(rateBasePct, rateQuotePct, daysPerYear = 252) {
  const out = { fwdDriftPctPerDay: null, carryAccrualPctPerDay: null, fwdDriftPctPerYear: null, diffPct: null };
  if (!Number.isFinite(rateBasePct) || !Number.isFinite(rateQuotePct)) return out;
  if (!(daysPerYear > 0)) return out;

  const diff = rateQuotePct - rateBasePct;            // %/yr on the spot quote
  const r5 = x => Math.round(x * 100000) / 100000;
  out.diffPct = Math.round(diff * 1000) / 1000;
  out.fwdDriftPctPerYear = out.diffPct;
  out.fwdDriftPctPerDay = r5(diff / daysPerYear);
  out.carryAccrualPctPerDay = r5(-diff / daysPerYear);
  return out;
}

/**
 * Realised drift against the forward-implied baseline.
 *
 *   driftVsCarry(-0.48, 0.0079)
 *     -> { excessPctPerDay: -0.4879, multiple: -60.8, label: 'repricing', ... }
 *
 * `multiple` is realised ÷ forward-implied, so its SIGN carries the read: positive
 * means the move is running WITH the rate differential (a carry grind, amplified),
 * negative means it is running AGAINST it (the rate differential does not explain
 * this move at all). |multiple| ≤ ~3 is carry-scale; beyond that the differential is
 * a rounding error on the day's move and calling it a driver would be wrong.
 */
export function driftVsCarry(realisedPctPerDay, fwdDriftPctPerDay) {
  const out = { excessPctPerDay: null, multiple: null, label: null, withCarry: null };
  if (!Number.isFinite(realisedPctPerDay) || !Number.isFinite(fwdDriftPctPerDay)) return out;

  out.excessPctPerDay = Math.round((realisedPctPerDay - fwdDriftPctPerDay) * 10000) / 10000;

  if (Math.abs(fwdDriftPctPerDay) < 1e-9) {
    // Rates are level: there is no baseline to be a multiple OF, and dividing would
    // manufacture an enormous number out of a zero denominator.
    out.label = 'no rate differential to explain it';
    return out;
  }

  const mult = realisedPctPerDay / fwdDriftPctPerDay;
  out.multiple = Math.round(mult * 10) / 10;
  out.withCarry = mult > 0;
  const a = Math.abs(mult);
  out.label = a <= 3      ? (mult > 0 ? 'carry-scale, with the differential' : 'carry-scale, against the differential')
            : a <= 20     ? (mult > 0 ? 'well beyond carry, same direction'  : 'well beyond carry, opposing it')
            :               'repricing — the rate differential does not explain this';
  return out;
}

// ── 3. Composition — jump-delivered vs diffusive ─────────────────────────────

/**
 * Splits a realised drift into the part delivered by detected jumps and the part
 * that arrived diffusively.
 *
 *   driftComposition(dailyLogReturns, jumpLogReturnsPerDay)
 *
 * Both arrays are per-day and the same length: `dailyReturns[i]` is day i's total log
 * return, `jumpReturns[i]` the SIGNED sum of that day's detected jump returns (0 on a
 * day with no detection). Callers get the second array from `jumpDiffusionCore`'s
 * `detectJumps` — this module deliberately does not detect anything itself, so the
 * detector stays in one place.
 *
 * `jumpShare` is the fraction of the drift attributable to jumps. It is NOT bounded
 * to [0,1] and that is the point: a share above 1 means the diffusive part leaned
 * the other way and jumps carried the trend alone; a negative share means the jumps
 * opposed the trend and the grind produced it despite them. Both are real states and
 * clamping them would hide the more interesting half of the readings.
 */
export function driftComposition(dailyReturns, jumpReturns) {
  const out = {
    muPctPerDay: null, jumpPctPerDay: null, contPctPerDay: null,
    jumpShare: null, jumpDays: null, n: 0, label: null,
  };
  if (!Array.isArray(dailyReturns) || !Array.isArray(jumpReturns)) return out;
  if (dailyReturns.length === 0 || dailyReturns.length !== jumpReturns.length) return out;

  let sum = 0, jSum = 0, jDays = 0, n = 0;
  for (let i = 0; i < dailyReturns.length; i++) {
    const r = dailyReturns[i], j = jumpReturns[i] ?? 0;
    if (!Number.isFinite(r) || !Number.isFinite(j)) continue;
    sum += r; jSum += j; n++;
    if (Math.abs(j) > 1e-12) jDays++;
  }
  if (n === 0) return out;

  // `|| 0` collapses negative zero. `0 / -0.0048` is -0, which survives rounding and
  // formats as the string "-0" — a jump share of "-0%" reads as a sign claim the
  // number is not making.
  const r4 = x => (Math.round(x * 10000) / 10000) || 0;
  const mu = sum / n, muJ = jSum / n;
  out.n = n;
  out.jumpDays = jDays;
  out.muPctPerDay   = r4(mu * 100);
  out.jumpPctPerDay = r4(muJ * 100);
  out.contPctPerDay = r4((mu - muJ) * 100);

  // A drift of essentially zero has no composition worth quoting — the ratio is
  // 0/0 and any share it produced would be noise over noise.
  if (Math.abs(mu) < 1e-9) {
    out.label = 'no net drift to attribute';
    return out;
  }

  const share = muJ / mu;
  out.jumpShare = r4(share);
  out.label = share < 0     ? 'diffusive grind, against opposing jumps'
            : share < 0.30  ? 'diffusive grind'
            : share < 0.60  ? 'mixed — jumps and grind both contributing'
            : share <= 1.05 ? 'event-driven — jumps delivered most of it'
            :                 'jumps alone — the grind leaned the other way';
  return out;
}

// ── Composer ─────────────────────────────────────────────────────────────────

/**
 * Attaches whichever of the three readings the caller has data for.
 *
 *   driftAnatomy({ d, pctPerDay, win, rates: {basePct, quotePct},
 *                  returns: {daily, jump}, sigmaAnnualPct })
 *
 * Every block is independent and optional: precision needs only `d`, so it is always
 * present; `carry` appears when both rates are supplied; `composition` when both
 * return arrays are. A missing block is null rather than absent, so consumers can
 * read a stable shape.
 */
export function driftAnatomy(opts = {}) {
  const { d, pctPerDay, win = 14, rates, returns, sigmaAnnualPct } = opts;

  const precision = driftPrecision(d, win);
  const out = { precision, carry: null, composition: null, yearsToDetect: null, text: null };

  if (Number.isFinite(sigmaAnnualPct) && Number.isFinite(pctPerDay)) {
    // Annualise the observed daily drift arithmetically — 252 trading days. This is
    // a scale conversion for the Merton horizon, not a compounding claim.
    out.yearsToDetect = yearsToDetectDrift(pctPerDay * 252, sigmaAnnualPct);
  }

  if (rates && Number.isFinite(rates.basePct) && Number.isFinite(rates.quotePct)) {
    const cd = carryDrift(rates.basePct, rates.quotePct);
    out.carry = { ...cd, ...driftVsCarry(pctPerDay, cd.fwdDriftPctPerDay) };
  }

  if (returns && Array.isArray(returns.daily) && Array.isArray(returns.jump)) {
    out.composition = driftComposition(returns.daily, returns.jump);
  }

  const parts = [];
  if (precision.t != null) {
    parts.push(`t = ${precision.t >= 0 ? '+' : ''}${precision.t.toFixed(2)} (${win}d)`);
    if (precision.significant === false) parts.push('not distinguishable from zero');
  }
  if (out.carry?.multiple != null) parts.push(`${Math.abs(out.carry.multiple).toFixed(1)}× carry`);
  if (out.composition?.jumpShare != null) {
    parts.push(`${Math.round(out.composition.jumpShare * 100)}% jump-delivered`);
  }
  out.text = parts.length ? parts.join(' · ') : null;
  return out;
}
