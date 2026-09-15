/**
 * carryDrift — the drift you can OBSERVE, as opposed to the one you estimate.
 *
 * `driftAnatomy` measures how badly an estimated drift is resolved (SE(d)=1/√win,
 * so every DRIFT_BANDS threshold sits at or below 2σ) and `drift-direction-test.mjs`
 * showed the estimated drift forecasts nothing — null at every horizon over 3,302
 * sessions. Both of those are statements about a drift FITTED FROM PRICE.
 *
 * There is a second drift that needs no fitting at all. Covered interest parity
 * pins the forward against spot exactly, so the forward curve states the
 * risk-neutral drift of the spot quote outright:
 *
 *     F/S = (1 + r_quote·T) / (1 + r_base·T)      →   mu_RN ≈ r_quote − r_base
 *
 * That number is a PRICE, not a forecast. It is the one drift an institution
 * actually trades — the carry premium is the empirical failure of uncovered
 * interest parity, and desks earn it by bearing crash risk, not by predicting
 * anything. Putting it beside the estimated drift turns "−0.48%/day" into
 * "−0.48%/day against +0.004%/day of carry", which separates a repricing from a
 * carry grind without forecasting either.
 *
 * ## Two sources, and why the order matters
 *
 * 1. BROKER FINANCING (preferred). What you are actually paid or charged. The
 *    server captures OANDA's annualised long/short rates daily into
 *    `oanda_financing_history` — the one series that cannot be backfilled.
 * 2. INTERBANK SHORT RATES (fallback). `rateDiffEngine`'s FRED series per
 *    currency. Theoretical, and `carryEngine.js` already records the caveat: a
 *    retail account never receives the interbank differential, so this is an
 *    UPPER BOUND on tradeable carry.
 *
 * The two disagree by the broker's spread, and that gap is itself worth showing —
 * it is the real cost of holding the position overnight.
 *
 * ## Stripping the broker spread (the part worth getting right)
 *
 * OANDA quotes two annualised rates per instrument, and they are NOT symmetric:
 * the broker takes a cut on both sides, so `longRate + shortRate < 0`. Writing
 * `c` for the true mid carry of a long-base position and `s` for the one-sided
 * spread:
 *
 *     longRate  =  c − s
 *     shortRate = −c − s
 *
 * so the spread falls out of the DIFFERENCE and the carry out of the SUM:
 *
 *     c = (longRate − shortRate) / 2          mid carry, long base
 *     s = −(longRate + shortRate) / 2         what the broker keeps, per side
 *
 * and the forward-implied drift of the spot quote is −c, because earning carry
 * long-base is the mirror of the quote currency drifting up. Taking `longRate`
 * alone as the carry would fold the broker's spread into the market's drift and
 * bias every pair the same direction.
 *
 * ## Staleness is gated, not assumed
 *
 * This repo has already been bitten once: a discontinued FRED series left the
 * scorecard's CHF rate legs scoring a 2024 print for 33 months (see
 * `yieldCurveEngine.js`'s own note). A rate is a number that looks equally
 * plausible whether it is from today or from 2024, so age is checked explicitly
 * and a stale source is REFUSED rather than quietly used — the same treatment
 * `macroScorecardEngine.readDim` gives a stale dimension, and the same reason:
 * an old policy rate is missing data wearing a number. Budgets come from that
 * module's own `MAX_AGE_BY_CADENCE`, so there is one table, not two.
 *
 * Pure: no fetch, no fs, no clock except an injectable `now`. The caller supplies
 * whatever it has and is told which source was usable.
 */

import { MAX_AGE_BY_CADENCE } from './macroScorecardEngine.js';
import { carryDrift as _interbankCarry } from './driftAnatomy.js';

const DAY_MS = 864e5;
const r5 = x => (Math.round(x * 1e5) / 1e5) || 0;
const r3 = x => (Math.round(x * 1e3) / 1e3) || 0;

/**
 * Broker financing → mid carry and spread, both annualised percent.
 *
 *   brokerCarry(-2.1, 0.7)
 *     -> { midCarryPctPerYear: -1.4, fwdDriftPctPerYear: 1.4, spreadPctPerYear: 0.7 }
 *
 * `longRatePct` / `shortRatePct` are OANDA's annualised financing PERCENTAGES for
 * holding the instrument long and short. Note OANDA's own API returns these as
 * fractions — `server.js`'s `fetchOandaFinancing` and `carryEngine.financingHaircut`
 * both multiply by 100 — so convert before calling, rather than feeding raw
 * fractions in and getting an answer 100× too small with no error.
 */
export function brokerCarry(longRatePct, shortRatePct) {
  const out = { midCarryPctPerYear: null, fwdDriftPctPerYear: null, spreadPctPerYear: null };
  if (!Number.isFinite(longRatePct) || !Number.isFinite(shortRatePct)) return out;
  const c = (longRatePct - shortRatePct) / 2;
  const s = -(longRatePct + shortRatePct) / 2;
  out.midCarryPctPerYear = r3(c);
  out.fwdDriftPctPerYear = r3(-c);
  // A negative spread would mean the broker pays you on both sides, which does
  // not happen — report it rather than clamping, since it means the inputs are
  // the wrong way round or in the wrong units.
  out.spreadPctPerYear = r3(s);
  return out;
}

/** Age in whole days, or null when the date is unusable. */
function ageOf(asOf, now) {
  const t = asOf ? Date.parse(asOf) : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / DAY_MS);
}

/**
 * Resolve the carry drift for one pair from whatever the caller has.
 *
 *   resolveCarryDrift({
 *     pair: 'EURUSD', base: 'EUR', quote: 'USD',
 *     broker:    { longRatePct, shortRatePct, asOf },      // preferred
 *     interbank: { basePct, quotePct, baseAsOf, quoteAsOf },
 *     now: Date.now(),
 *   })
 *
 * Returns a single shape whatever the source, so a consumer never branches:
 *
 *   { fwdDriftPctPerDay, fwdDriftPctPerYear, source, asOf, ageDays, stale,
 *     spreadPctPerYear, refused }
 *
 * `source` is 'broker' | 'interbank' | null. `refused` lists the sources that
 * were present but unusable and why, so a null answer is explainable rather than
 * silent — the difference between "no carry data" and "carry data too old to
 * trust" matters to a reader and costs one field to keep.
 *
 * `daysPerYear` is 252 to match `driftAnatomy`'s convention: the readout beside
 * it is a per-TRADING-day drift, so the carry has to be per trading day too.
 * Financing actually accrues on calendar nights (and triple on Wednesdays), which
 * makes this a comparison convention rather than a cash-flow model — stated here
 * because the two are easy to conflate and only one of them is what this is for.
 */
export function resolveCarryDrift({
  pair, base, quote, broker, interbank, now = Date.now(), daysPerYear = 252,
} = {}) {
  const out = {
    pair: pair ?? (base && quote ? `${base}${quote}` : null),
    fwdDriftPctPerDay: null, fwdDriftPctPerYear: null,
    source: null, asOf: null, ageDays: null, stale: false,
    spreadPctPerYear: null, refused: [],
  };

  // ── 1. Broker financing, if it is fresh enough ────────────────────────────
  if (broker && Number.isFinite(broker.longRatePct) && Number.isFinite(broker.shortRatePct)) {
    const age = ageOf(broker.asOf, now);
    const max = MAX_AGE_BY_CADENCE.daily;
    if (age != null && age > max) {
      out.refused.push({ source: 'broker', why: 'stale', ageDays: age, maxAgeDays: max });
    } else {
      const b = brokerCarry(broker.longRatePct, broker.shortRatePct);
      if (b.fwdDriftPctPerYear != null) {
        out.source = 'broker';
        out.asOf = broker.asOf ?? null;
        out.ageDays = age;
        out.fwdDriftPctPerYear = b.fwdDriftPctPerYear;
        out.fwdDriftPctPerDay = r5(b.fwdDriftPctPerYear / daysPerYear);
        out.spreadPctPerYear = b.spreadPctPerYear;
        return out;
      }
    }
  }

  // ── 2. Interbank differential, if it is fresh enough ──────────────────────
  if (interbank && Number.isFinite(interbank.basePct) && Number.isFinite(interbank.quotePct)) {
    // The OLDER of the two legs governs: a differential is only as current as its
    // staler side, and averaging the ages would hide a dead series behind a live one.
    const ages = [ageOf(interbank.baseAsOf, now), ageOf(interbank.quoteAsOf, now)]
      .filter(a => a != null);
    const age = ages.length ? Math.max(...ages) : null;
    const max = MAX_AGE_BY_CADENCE.monthly;
    if (age != null && age > max) {
      out.refused.push({ source: 'interbank', why: 'stale', ageDays: age, maxAgeDays: max });
    } else {
      const c = _interbankCarry(interbank.basePct, interbank.quotePct, daysPerYear);
      if (c.fwdDriftPctPerDay != null) {
        out.source = 'interbank';
        out.asOf = ages.length
          ? [interbank.baseAsOf, interbank.quoteAsOf].filter(Boolean).sort()[0]   // the older date
          : null;
        out.ageDays = age;
        out.fwdDriftPctPerYear = c.fwdDriftPctPerYear;
        out.fwdDriftPctPerDay = c.fwdDriftPctPerDay;
        return out;
      }
    }
  }

  out.stale = out.refused.length > 0;
  return out;
}

/**
 * Both sources at once, when the caller has them — the broker number is what you
 * trade, the interbank number is what the market implies, and the gap is the real
 * overnight cost of the position.
 *
 *   carryComparison({ broker:{...}, interbank:{...} })
 *     -> { tradeable, theoretical, haircutPctPerYear, ... }
 *
 * `haircutPctPerYear` is positive when the broker keeps something, which is the
 * normal case; `carryEngine.financingHaircut` measures the same quantity on the
 * backtest side and this is deliberately the same sign convention so the two
 * numbers can be read against each other.
 */
export function carryComparison({ pair, base, quote, broker, interbank, now = Date.now(), daysPerYear = 252 } = {}) {
  const tradeable = resolveCarryDrift({ pair, base, quote, broker, now, daysPerYear });
  const theoretical = resolveCarryDrift({ pair, base, quote, interbank, now, daysPerYear });
  const out = { pair: tradeable.pair, tradeable, theoretical, haircutPctPerYear: null };
  if (tradeable.source === 'broker' && theoretical.source === 'interbank') {
    // Compare the MID carry both ways round: the interbank differential quoted as
    // a long-base carry is -(r_quote - r_base), the mirror of its forward drift.
    const brokerMid = -tradeable.fwdDriftPctPerYear;
    const interbankMid = -theoretical.fwdDriftPctPerYear;
    out.haircutPctPerYear = r3(Math.abs(interbankMid) - Math.abs(brokerMid));
  }
  return out;
}
