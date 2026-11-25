# level-near-miss-entry: is a touch-only entry at the volatility levels leaving money on the table?

**Pre-registered 2026-11-25, before any outcome in this design was computed.**

| | |
|---|---|
| ID / ledger id | `level-near-miss-entry` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `level-near-miss-entry` |
| Source | **C.OG, 2026-11-25** (paraphrased, paid group): within his system, near misses don't stop orders being filled, because there are approaches that allow for them ("binary vs probabilistic"). He suggested the trend of historic trades as a good place to start. **Owner, 2026-11-25:** test near misses, first-passage, Brownian bridge, OU, competing risks and probabilistic entry against touch entry, calibrated, out of sample |
| Data | 25 NT8 futures (`ladder-qlike-per-line-fut`), unadjusted M1 with exchange volume, sessions 00:00–22:00 London, 2020-01-02 → **2026-08-21** (lockbox respected). CFDs are not used: no exchange volume for VWAP, and their costs are unknown |
| Split | **train** 2020-01-02 → 2022-12-30 · **validation** 2023 · **test** 2024-01-02 → 2026-08-21, touched once |
| Seed | `20261125` |
| Uncertainty | date-clustered bootstrap, B = 1000, 90% CI |
| Scripts / outputs | `scripts/level-near-miss-entry/` → `analysis/output/level-near-miss-entry/` |
| Lessons applied | placebo ladder (a "turn before the line" must beat a line placed nowhere special); one trade per approach episode (duplicates = one event); thresholds chosen on validation only; costs on; probabilities calibrated before use |

## 1. Claim

Price often turns just before our levels. Two things should then hold:
- An entry triggered before the touch (fixed or σ-scaled proximity, or a calibrated probability, with or without confirmation) should earn more net per trade, and recover more profitable opportunities, than the exact-touch entry, out of sample.
- Price should turn before the real levels more often than before placebo levels.

## 2. Why this isn't already settled

Every earlier level study entered on the touch only (`trade-at-lines`, `close-level-reversal`, `jordan-*`,
`level-context-engine`). Near misses have never been counted, and no pre-touch entry has been tested.

## 3. Definitions

**Levels:** the 15 lines from `level-context-engine`:
- High / Low (OH / OL), Close±, and the HL moving projections;
- each at Median / P75 / P90;
- each its own walk-forward QLIKE calc.

Placebo: the same lines with distances scaled by a draw from 0.75–0.90 or 1.10–1.25, per session per line.

**Scales:**
- W = the day's forecast HL median, in price (the forecast range width).
- **σ_day** = W ÷ 1.56. This is C.OG's HL p50 constant, so σ_day is the daily diffusion scale implied by our own ladder.
- **Intraday variance profile** w(m): each instrument's share of session variance by London minute, from **train years only**.
- **σ_rem(t, H)** = σ_day · √Σ w(t+1 … t+H).
- **Z_distance** = |L − P_t| ÷ σ_rem(t, 60).

**Approach episode** (one underlying event):
- **Starts** when price, from the open side, first comes within 0.25 W of a line after having been at least 0.35 W away (or at the session open).
- **Ends** at the first of:
  - a **touch** (high ≥ L for an upper line);
  - a **retreat** (back to ≥ 0.35 W away), which is the near miss;
  - **neither** within 120 minutes, or at the session end.
- **Closest approach** is recorded in W, in Z, and in ticks.
- **Data resolution:** M1 highs and lows hold the intrabar extremes, so an M1 near miss is a real non-touch on this feed. A near miss within 2 ticks is flagged "feed-ambiguous", because another feed (CFD bid / mid) might have touched.

**States** (candidate pre-touch entries): within an episode, the bar close at which the closest approach first reaches
0.20, 0.15, 0.10 and 0.05 W, before any touch. Each state records:
- Z_distance, distance in W and in ticks;
- approach velocity over 5 / 15 / 30 minutes (in σ_rem units);
- momentum deterioration (5-minute velocity minus 30-minute velocity ÷ 6);
- vol regime;
- VWAP deviation (price − session VWAP, hlc3 × volume, in σ_day, signed toward the level);
- time of day and minutes since the open;
- earlier touches and near misses of this line today;
- range consumed;
- the previous day's trend agreeing with the approach;
- tier and family;
- the Brownian first-passage probabilities (see part 2).

**Outcomes per state:**
- the level is reached within 5 / 15 / 30 / 60 minutes;
- a retreat before the touch (within 120 minutes);
- continuing through the level (touch and then L ± 0.25 line-σ beyond, within 120 minutes);
- a fade bracket and a follow bracket entered at the state's close: ±u = 0.25 line-σ, from the next bar, 120-minute cap with a mark-to-market exit (gross R, then net of 2.5 ticks ÷ u);
- MFE and MAE over 60 minutes, and holding time.

**Execution methods** (all fade unless stated; one trade per episode per method):
- **A. Exact touch:** a limit at L, filled on the touch. The through side counts from the fill bar and the back side from the next bar (as in `level-context-engine` A1).
- **B. Fixed proximity:** a limit at L − x·W, x ∈ {0.05, 0.10, 0.15, 0.20}, filled when the high reaches it within the episode.
- **C. Volatility-adjusted proximity:** a limit at L − k·σ_rem(t, 30), k ∈ {0.25, 0.5, 0.75, 1.0}, moving with time.
- **D. Probability-driven:** a logistic model, fitted on train, gives P(fade bracket wins) and P(follow bracket wins) at each state. Enter at the first state in the episode where EV = 2p − 1 − cost_R exceeds a threshold θ, on the side with the larger EV. θ ∈ {0, 0.02, 0.05, 0.10} is chosen on validation.
- **E. D plus confirmation:** after D's signal, wait up to 10 bars (still before any touch) for a bar closing in the trade direction (close < open for a fade at an upper line), then enter at that close.

For B and C, x and k are chosen on validation (best net R per trade with ≥ 300 trades). A gradient-boosting model
replaces logistic only if it improves validation log loss by ≥ 1% **and** validation net R.

## 4. Hypotheses (primary)

- **P1 turn before the line:** P(retreat | the episode reaches within 0.10 W, no touch yet), line − placebo > 0, over all tiers on 2020–2026.
- **P2 probability entry beats touch:** test net R per trade, D − A > 0, and D > 0.
- **P3 fixed proximity beats touch:** test net R, B(x*) − A > 0.
- **P4 vol proximity beats touch:** test net R, C(k*) − A > 0.
- **P5 confirmation helps:** test net R, E − D > 0.

**Gates:**
- **VALIDATED** if:
  - the 90% CI is above 0,
  - it survives BH q = 0.10 over the five,
  - and the two test halves (2024, 2025–26) agree in sign.
  - For P2, D itself must also have a CI above 0.
- **NULL** if the upper CI is below +0.02R (P2–P5) or below +1 pp (P1).
- Otherwise **UNDERPOWERED**.

The paired differences resample dates with both methods' trades on that date.

**Descriptive (no gate):**
- **Near-miss rates and distances:** by tier, time, vol regime and family, real vs placebo, plus the feed-ambiguous share.
- **First passage:** Brownian (μ = 0, and μ = the 30-minute drift carried forward in vol-time) against the observed P(τ ≤ T), T = 5 / 15 / 30 / 60, as reliability tables and Brier scores. The logistic "reach" model's Brier and log loss on test, against Brownian and against base rates.
- **Brownian bridge:** for M1 bars with both closes below L, the predicted crossing probability against the actual high ≥ L, at 1- and 5-minute close spacing. This measures how much a close-sampled near miss understates touches.
- **OU vs drift:**
  - an AR(1) / Dickey-Fuller fit on session price and on the VWAP deviation (κ, half-life, t against −2.86);
  - the conditional 15- and 30-minute drift toward the level by Z bucket, tier, time, vol, momentum, VWAP deviation and earlier interactions, real vs placebo.
- **Competing risks:** discrete-time cause-specific hazards per minute (touch vs retreat) and cumulative incidence at 15 / 30 / 60 / 120 minutes, by Z bucket, momentum and time of day. The "neither" share is reported.
- **Calibration of D's models** on test, overall and by instrument, tier, time bucket and vol regime: Brier, log loss, reliability bins.
- **Per method:**
  - trades, recovered opportunities (D/B/C/E fades in episodes with no touch that won);
  - false entries (episodes that touched and then ran through, losing);
  - win rate, expectancy, profit factor, MFE/MAE, holding time;
  - maximum drawdown of the pooled R series;
  - all by tier, time and vol regime.

## 5. Power

The `level-context-engine` events suggest roughly 15–25k inside touches per futures contract over 2020–26, or about
375k+ episodes in total. The test period is about 40%. The paired SE for D − A at about 50k trades is about 0.006R,
so the MDE is about 0.015–0.02R.

## 6. Multiplicity and overfitting

- There are five primary tests, with BH q = 0.10.
- x, k, θ and the model class are chosen on validation only. The test set is scored once.
- Descriptive tables carry BH q-values within each table.

## 7. What it does NOT test

- CFDs, live fills and queue position.
- Bid/ask beyond the 2.5-tick round trip (slippage on market entries at the close is inside that allowance).
- Structure stops (only the symmetric u bracket).
- The lockbox.

Production execution is untouched.

## 8. What each verdict changes

- **P2 VALIDATED:** probabilistic entry is added in shadow as another execution method on the futures levels page, with forward logging. Nothing live changes.
- **NULL:** touch-only execution isn't leaving measurable money behind. Near misses are reported as context.
- **P1 VALIDATED** with P2 NULL: price does turn before the levels, but that can't be traded after costs. That is a useful caveat for discretionary trading.

## Amendments

(none yet)
