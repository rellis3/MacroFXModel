# Economic-Trend Cross-Sectional Test — pre-registration

> **Status: PRE-REGISTERED, NOT YET RUN.** This document freezes the design and the
> pass/fail criteria **before** the first live-data run (sandbox has no FRED/OANDA —
> the run happens on Railway via `econ-trend.html`). Editing the criteria after seeing
> results voids the test (same discipline as `macroCore.js`'s frozen thresholds).
> Do not tune, re-slice, or re-narrate after the fact.

## The honest prior (stated before running)

- **Family:** "economic trend" — trend applied to *fundamentals*, not prices
  (AQR, Brooks et al.). This is the **replicated** family, unlike the nulled
  `macro-direction` test, which used ~30-day factor momentum to predict 1–20 *day*
  forward drift per pair. This test is monthly-horizon and **cross-sectional**
  (relative ranking of currencies), the form the literature actually supports.
- **Blunt odds: ~20–30%** that this survives after costs. **The default expected
  outcome is null.** A cheap null is a win.
- Signal uses **no price data**. Price is used only for vol-sizing, execution and
  mark-to-market (the honest reading of "macro-only": price is not a decision input).

## Design (frozen)

**Universe:** EUR, GBP, JPY, AUD, CAD, CHF, NZD vs USD (the `TREND_UNIVERSE` pairs).

**Factors per currency, relative to USD** (signs fixed a priori from the policy
channel — the one factor family that weakly led even in the macro-direction null):

| Factor | Series family | Sign (relative momentum ↑ ⇒ currency) |
|---|---|---|
| `rate` — short rate | FRED GS2 (US) / OECD immediate+3m rates | **+** (hawkish repricing → appreciate) |
| `y10` — 10Y govt yield | GS10 / OECD IRLTLT01 | **+** |
| `unemp` — unemployment | UNRATE / OECD LRHUTTTT | **−** (rising relative unemployment → dovish → depreciate) |

**Momentum windows:** 90 / 180 / 365 calendar days — fixed, equal-weighted, not tuned
(mirrors the trend basket's multi-lookback design).

**Score:** per (factor, window): relative change vs USD, z-scored **cross-sectionally**
across currencies (needs ≥4 currencies with data). Per-currency score = mean of signed
z's; requires ≥2 distinct factors, else the currency sits out.

**Portfolio:** rank scores; **long top-2, short bottom-2** vs USD; inverse-vol sized
(equal risk, 10% portfolio vol target); **monthly rebalance** (21 trading days);
2 bps cost on turnover per rebalance; ~2005→present; **IS/OOS split 60/40**.
Machinery = `runTrendBasket` with a `directionAt` hook — no new portfolio code.

**Publication lags (no lookahead):** FRED monthly observations are dated at month
START. A month's value is usable only from obs-date + lag: **US +35d** (≈5 days after
month end), **foreign +75d** (≈45 days after month end). Conservative on purpose; do
not shorten them "to get more signal."

**Placebo benchmark:** ≥200 runs of the identical portfolio machinery with **random**
top-2/bottom-2 assignments each rebalance (seeded, deterministic). This is the chance
floor — the strategy must beat what noise does with the same costs and sizing.

## Pass / fail (frozen — both outcomes written down first)

**"It worked" =** ALL of:
1. OOS Sharpe **> 0**;
2. OOS Sharpe ≥ the **90th percentile** of the placebo OOS-Sharpe distribution;
3. **Majority of complete OOS years positive**;
4. IS Sharpe also **> 0** (IS/OOS consistency — an OOS-only fluke doesn't count).

Then it earns: paper-trading as a third sleeve candidate. Nothing more.

**"It didn't" =** anything less. We record the null in this doc and `BACKTEST_INDEX.md`,
stop, and do **not** iterate factors/windows/K to rescue it — that's the overfitting
path. One shot.

## Result (fill in after the Railway run — one run, then this section is final)

- Date run: _
- OOS Sharpe: _ · placebo percentile: _ · OOS years +: _/_ · IS Sharpe: _
- Verdict: _
