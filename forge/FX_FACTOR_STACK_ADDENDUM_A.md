# FX factor stack — Addendum A: the vintage floor

*Registered 2026-10-17, the same day as the pre-registration and before any factor score was computed. Prompted by
the first build of the feature store (plans/FEATURE_MANIFEST.json), not by any result.*

## What the store showed

ALFRED's vintage history for the OECD-mirror series on FRED (`IR3TIB01*`, `IRLTLT01*`) begins on
**2013-06-03** for every one of them. Observations dated before that are knowable, point-in-time, only from
2013-06-03 — because that is when FRED first published them. `cpi_usd` (BLS via ALFRED) reaches back to
2000-02-18; the OANDA price series reach 2002–2006; COT reaches 2006-06.

Two further facts: `rate3m_eur` has had no new vintage since **2026-02-16** (the source is frozen, as the
2026-09-07 scorecard audit warned), and `rate3m_gbp` is the BoE Bank Rate, not a 3-month interbank rate.

## What this changes in the registered design

The pre-registration fixed **IS 2005–2017, OOS 2018–2026** and said rates, yields and CPI take their asof
"from the feature store". Taken literally, the carry, yield-spread and value legs have no in-sample history
before 2013-06-03, and the IS window for them is 2013–2017: four and a half years of monthly observations,
too few to fit anything and barely enough to look at.

**Decision, made now:** the registered windows stand, and the pre-2013 history for these legs is
constructed with a **registered assumption** rather than dropped:

- For `rate3m_*` and `y10_*` (OECD mirrors) before 2013-06-03: `asofRule = fixed_lag:45` on the reference
  month — the OECD MEI's documented publication lag is five to six weeks, and the spread engines in this
  repo already shift these series by 45 days for the same reason. Flagged per row as
  `source: alfred-backcast`.
- For `rate3m_eur` after 2026-02-16: the leg is **missing**, not forward-filled; EUR gets a neutral carry
  score for those months and the count is reported.
- For `rate3m_gbp`: Bank Rate is used as registered; the difference from a 3-month rate is a term premium
  of a few basis points and is not what the carry factor ranks on.

The OOS window (2018–2026) is entirely inside the true vintage history and is unaffected. **The bars,
placebo, mirror and stopping rule are unchanged.** The only thing this addendum adds is that the IS period
for three legs rests on a stated 45-day lag assumption rather than on observed vintages, and that the result
must say so.

## What would void this

If the 45-day assumption is wrong in the direction that helps — that is, if the actual publication lag was
longer and the backcast therefore leaks a value that was not yet knowable — the IS result for those legs
is optimistic. The check: for the overlap period 2013-06 → 2015-06, compare the `fixed_lag:45` asof against
the observed ALFRED `realtime_start`. If the observed lag exceeds 45 days in more than 10% of months, the
backcast is replaced with `fixed_lag:` at the observed 90th-percentile lag before the study runs.
