# Real-Yield / Surprise / Regime-Gated Macro Bias — pre-registration

> **Status: PRE-REGISTERED, NOT YET RUN.** This document freezes the design and the
> pass/fail criteria **before** any data is pulled or code is written — same discipline
> as `ECON_TREND_TEST.md` and `macroCore.js`'s frozen thresholds. Do not tune,
> re-slice, or re-narrate after seeing results. The data-availability check in
> §Open Items happens first and may force a design amendment (recorded, not silent)
> before the first live-data run — that is allowed; tuning the *pass bar* after seeing
> a result is not.

## Relationship to the banked null (Q11 / `ECON_TREND_TEST.md`)

`econ-trend` tested nominal short rate + nominal 10Y + unemployment, cross-sectional
momentum, unconditional (no regime filter), monthly rebalance **as** the entry
mechanism. It came back null (OOS Sharpe 0.09, 78th placebo percentile vs. 90th
needed) and is banked — that verdict stands and is not being re-litigated here.

This test swaps in three specific, differently-motivated ingredients rather than
retuning the old ones:

| Gap in the nulled test | What this test does instead |
|---|---|
| Nominal yields (no inflation adjustment) | Real yield = nominal 10Y − realized YoY CPI |
| No conditioning on whether data surprised vs. consensus | Adds a rolling economic-surprise z-score |
| Ran unconditionally through every regime, all 21 years | Gated to zero exposure in `macroCore.js` RISK_OFF |

These are different economic quantities, not new tunable parameters on the same
recipe — that is the basis for treating this as a distinct, fair test rather than
overfitting the nulled one.

## The honest prior (stated before running)

- Each swapped-in ingredient is individually better-motivated than what it replaces,
  but three new moving parts is also three new places to introduce a bug or a hidden
  lookahead, and the surprise-index leg in particular may not have enough historical
  depth to test cleanly (see §Open Items).
- **Blunt odds: ~25–35%** that this survives after costs. Still expect null as the
  default outcome — a better story is not evidence, and this project has already
  seen a well-motivated story lose to the base rate once this month.

## Design (frozen)

**Universe:** EUR, GBP, JPY, AUD, CAD, CHF, NZD vs USD — same as `econ-trend`
(`TREND_UNIVERSE`), kept cross-sectional for the same reason: a single EUR/USD
series is too few independent bets to trust an OOS Sharpe from. EUR/USD is the pair
surfaced in any card UI built on top of this; the *validation* needs the full
cross-section.

**Factor 1 — real yield differential** (relative to USD):
`realYield_ccy = y10_ccy − cpiYoY_ccy`, then `realYield_ccy − realYield_USD`.
- `y10` reuses the existing `ECON_UNIVERSE` series (`GS10` US / `IRLTLT01{cc}M156N`
  foreign) — already wired in `js/econTrendEngine.js`, no new fetch needed.
- `cpiYoY` needs a new series per country (candidates follow the OECD harmonized
  naming already used for the rate/unemployment families, e.g.
  `CPALTT01{cc}M659N`-style YoY growth series) — **unverified, first Open Item.**
- Sign: **+** (higher relative real yield ⇒ currency appreciates).
- Scored on the same frozen 90/180/365-day relative-change windows as `econ-trend`,
  for direct methodological comparability — not a new free choice.

**Factor 2 — economic surprise index** (relative to USD):
rolling z-score of (actual − consensus) from `js/econCalendar.js`'s existing
calendar feed, decayed over the trailing N releases per country. Sign: **+**
(positive surprises ⇒ hawkish repricing ⇒ appreciate).
- This is the one genuinely new build — nothing today turns the calendar feed into
  a scored time series. Historical depth is unverified — **second Open Item**, and
  may gate whether this factor can run over the same window as Factor 1 at all.

**Regime gate:** `js/macroCore.js` risk regime classifier (VIX + HY OAS, frozen
thresholds, already live). Participation multiplier: **RISK_ON/NEUTRAL = 1×,
RISK_OFF = 0×** (flat, not half-size — fewer free parameters, matches the
minimal-DOF discipline). This modifies portfolio *participation*, not the ranking
score.

**Score:** per currency, mean of signed z-scores across available factors
(real-yield windows + surprise, ≥1 required — same fail-soft pattern as
`econTrendEngine.buildFundamentals`, reported per-series in an availability table,
never silently skipped).

**Portfolio:** rank scores; long top-2 / short bottom-2 vs USD; inverse-vol sized
(10% target); monthly rebalance (21 trading days); 2bp cost on turnover; exposure
zeroed on RISK_OFF months per the gate above. Same machinery (`runTrendBasket`
family) as `econ-trend` — no new portfolio code.

**Publication lags (no lookahead):** same convention as `econTrendEngine.js` —
US +35d, foreign +75d from the FRED obs date (month-start dating). Surprise index
uses actual release timestamps (no lag needed — it's realized on release day).

**Placebo benchmark:** ≥200 seeded runs of the identical machinery with random
top-2/bottom-2 assignment each rebalance — **with the same regime gate applied to
the placebo too**, so a quieter placebo (less time exposed) isn't compared unfairly
against a gated live signal.

## Pass / fail (frozen — both outcomes written down first)

Identical structure to `ECON_TREND_TEST.md`, for direct comparability:

**"It worked" =** ALL of:
1. OOS Sharpe **> 0**;
2. OOS Sharpe ≥ the **90th percentile** of the (regime-gated) placebo distribution;
3. **Majority of complete OOS years positive**;
4. IS Sharpe also **> 0**.

Then it earns: paper-trading as a third sleeve candidate. Nothing more — in
particular, no automatic promotion to feeding live trade entries; that would need
its own separate proof once the "what vs. when" separation (macro bias as an input
to an execution/timing layer, not the trade itself) is actually built.

**"It didn't" =** anything less. Banked here and in `BACKTEST_INDEX.md`, no
factor/window/K iteration afterward — one shot, same as its predecessor.

## Open Items (must resolve before the first run — none need sandbox network)

1. **Confirm CPI YoY series exist per country on FRED**, on Railway (sandbox has no
   FRED reachability — confirmed, same as the documented OANDA gap). Given the
   unemployment family already had CHF/NZD gaps in the `econ-trend` run, expect
   similar per-country holes here; record an availability table exactly like
   `econTrendEngine.buildFundamentals` does, don't silently drop a currency.
2. **Confirm how far back `js/econCalendar.js`'s actual/consensus history goes.**
   If it's shallow (a live calendar feed, not a 20-year archive), Factor 2 can't run
   over the same 2005–present window as Factor 1. In that case: split into **Phase
   A** (real yield + regime gate only, full-depth, directly comparable to the
   `econ-trend` null) and **Phase B** (add the surprise leg once enough forward
   history has accumulated to test it honestly — not retrofit on a short window and
   call it validated).
3. Whichever amendment §1/§2 forces gets recorded here, dated, **before** any
   result exists — an amendment made because a data source doesn't exist is honest;
   one made after seeing a Sharpe number is not.
