# Bot decision questions — what a level-trading bot actually needs answered

The cross-pair research first answered *"is the volatility forecast statistically
calibrated?"* (calibration, skill, sharpness). That's a **forecast-quality**
question. A bot doesn't trade calibration — it trades **behaviour at the level**.
This is the decision funnel a level bot walks, and the questions each step needs.

Status tags: **answerable now** (data exists — surfaced on `cross-pair-research.html`),
**GAP** (needs an engine change or a new data layer).

---

## 1. Universe — trade this pair at all?
Does the pair's level behaviour repeat **out-of-sample**, or is it a one-off? The
only honest "exclude" reason is *inconsistent touch behaviour* or *edge doesn't
survive costs* — **not** calibration.
- *Now:* touch data per pair (touch rate, fade/follow). *Missing:* an IS/OOS split
  of the touch edge (the intraday engine runs walk-forward but doesn't yet emit a
  paired IS/OOS touch-edge number).

## 2. Setup — is today a day the level matters?
How often does price actually **reach** the median line? the 75th? And on which
kind of day (regime / vol-state / day-type)?
- *Now:* `touchRatePct` per pair, `byRegime`. *Sharpen:* touch rate conditioned on
  the day-type clusters (Phase 2) — "on quiet-range days the line is hit X%…".

## 3. Direction — FADE or FOLLOW at the line? *(the core decision)*
On first touch of the **median**, does price revert toward the open (fade) or
break through (follow)? Same at the **75th** (exhaustion → the fade line). Split
by **regime** (trend → follow, range → fade).
- *Now:* `continuePct` vs `reversePct`, `p75` exhaustion, `byRegime`, and the
  cross-pair fade-vs-follow sign test + the fade-in-range/follow-in-trend count.

## 4. Retest — 1st vs 2nd vs 3rd touch  **[GAP]**
Does the edge **decay or strengthen** with each retest? A clean first tap and a
level hammered three times behave differently.
- *Now:* only single-touch vs heavily-retested. *Needs:* a clean 1st/2nd/3rd
  touch-sequence in `intradayForecastResearch` (an engine change).

## 5. Timing — which session is the touch/fade cleanest in?
- *Now:* `touches.bySession` per pair (not yet folded cross-pair — small add).

## 6. Exit — target & stop from the behaviour, not a guess
The post-touch **MFE (favourable)** and **MAE (adverse)** distributions say what
target the level pays and what stop it survives.
- *Now:* mean MFE / MAE per pair. *Sharpen:* full percentile distributions (p25/50/75)
  so R:R is set from the tail, not the mean.

## 7. Direction skew — which side is hit first?
Is the upper band hit first systematically (drift/skew to exploit)?
- *Now:* `direction.firstUpperPct` per pair.

## 8. Costs — does the touch-edge survive spread + slippage?  **[SCREEN built; path-level backtest still to do]**
Every fade/follow number above is **gross**. The only question that decides
whether any of this is real is whether the edge clears round-trip spread +
slippage.
- *Now (`costSurvival`):* each touch becomes the ±20-pip symmetric bracket the
  engine already races; per-touch expectancy of the dominant side =
  `20 × |reverseFrac − continueFrac| − cost`, netted at cost **×1 / ×2 / ×3**
  (documented cost table, sensitivity so a thin edge can't hide). Reports which
  pairs clear ×1 and whether survivors span ≥2 types. **A SCREEN** — it says which
  pairs are in the running.
- *Still to do:* a **path-level backtest** with real per-pair fills, the actual
  entry (limit vs stop) and a real target/stop from Q6's MFE/MAE distribution,
  not the symmetric ±20 proxy. That's the clean answer.

---

---

# The gates — questions that come BEFORE the mechanics (fresh-eyes review)

The eight questions above are **mechanics** ("how does the level behave?"). A quant
handed this data cold would refuse to touch mechanics until three **gates** pass.
If any gate fails, the mechanics are theatre. These are now built (`G1`–`G3` on
`cross-pair-research.html`).

## G1 — Is the FORECAST the source of edge, or just a band? (placebo)
Fade-the-median might work equally well at a **randomly-placed line** the same
distance from the open. If fade-at-forecast ≈ fade-at-placebo, you've found
mean-reversion, not a forecast edge.
- *Built:* the intraday engine now evaluates a seeded **jittered placebo** level
  beside every real forecast level and reports `edgeVsPlacebo` (real reversal rate
  − placebo reversal rate), folded cross-pair with the sign-test + type-spread
  discipline. Near-zero ⇒ the forecast's exact placement adds nothing.

## G2 — What is the PAYOFF SHAPE? Is fading selling underpriced vol insurance? (short gamma)
Fading wins small often and loses big on breakouts — a **negatively-skewed,
short-gamma** payoff that looks like edge in a win-rate table and blows up in the
tail. Win rate is the wrong lens; the loss tail is the truth.
- *Built:* the engine computes the **hold-to-close fade PnL distribution** per
  touched median (revert-toward-open = win, break-away = loss) and reports mean,
  median, **skew**, p5/p95, worst loss, win rate, and **avg-win ÷ avg-loss**. A
  negative skew with avg-loss ≫ avg-win is the insurance-selling signature — the
  net edge must pay for that tail, not just win often.

## G3 — How many INDEPENDENT bets are there really? (portfolio concentration)
26 pairs but 3 USD blocs + EUR/GBP/AUD crosses. Fading EURUSD+GBPUSD+AUDUSD at
once is ~one leveraged USD bet. "31/31 pairs agree" is mostly correlation.
- *Built:* the run computes the daily-return **correlation matrix** across pairs
  and the **effective number of independent bets** = n² ÷ ΣᵢⱼCᵢⱼ² (participation
  ratio), plus mean pairwise correlation. Tells you the *real* breadth behind any
  cross-pair claim and the true portfolio risk.

**Order:** G1 first (no edge over placebo ⇒ stop), then G2 (a real gross edge that
is underpriced insurance ⇒ stop), then G3 (size the portfolio to the *effective*
bet count, not 26). Only past all three do the mechanics (Q1–Q8) and Phase 3 mean
anything.

## Deliberately NOT built yet (the next layer, if the gates pass)
- **Regime-conditioned EDGE** (not behaviour): is the cost-surviving edge only in
  low-vol/ranging states, negative in trends?
- **Time-stability / decay**: rolling-window edge — has it been arbed away?
- **Directional vs range alpha**: does the forecast *skew* predict direction,
  separately from fading the *range*?
- **Fill realism**: can you get the limit fill at the line on the days that matter
  (adverse selection on breakouts)?
- **The reframe**: a vol forecast's *replicated* use is **risk-sizing / vol-target
  / a don't-trade filter**, not entry signals. "Does sizing an existing momentum/
  carry edge by the forecast beat trading it flat?" may be the higher-EV question.

---

## Validation discipline (applies to every question)
- **Out-of-sample** split, **≥30 events**, **costs on**.
- **Per pair-type**, and **cross-pair consistency** (a pattern must hold across
  ≥2 types, sign-test + BH-corrected) — a signal in three correlated crosses is
  not a trend.
- **Pre-register both outcomes** before running, so a null can't be re-narrated.

## Which bands the touch study uses (recalibrated, not raw)
The reference forecaster runs **wide** (exceed-median ~34% vs 50%). The touch /
fade / cost study now places its levels on **walk-forward recalibrated** bands —
each window's level distance is scaled by the trailing median(realized ÷ forecast
H-L) from prior windows only (causal), so it measures the bands a bot would
actually trade, not the too-wide raw lines (`touches.bandsRecalibrated`,
`recalFactor`). Note the likely direction: tighter bands sit *closer* to the open,
a *less-extended* level where mean-reversion is usually **weaker** — so
recalibration tends to **confirm** a fade null, not rescue it. Daily calibration
(exceed-median) stays reported on the *raw* forecaster (that's the honest "how
wide is it" measure); the recal factor + calibrated export show the correction.

## Move 2 — the risk-tool pivot (next build, scoped)
The replicated use of a vol forecast is **risk-sizing / gating**, not entry
signals. The test: *does using the forecast to size or gate an existing edge beat
trading that edge flat?* Concretely, in priority order:
1. **Don't-trade filter** — the hidden-relationship results say the forecast is
   least reliable on high-vol / high-vov / post-big-miss days. Test: on those days
   is realized-vs-forecast materially worse, and does skipping them improve a
   simple baseline's risk-adjusted return? (Needs a baseline edge to gate.)
2. **Vol-target sizing** — size inversely to forecast vol; compare Sharpe / max-DD
   vs flat sizing on the same baseline. This is the classic, evidence-backed use.
3. **Stop placement** — stops beyond the 75th line vs a fixed ATR stop, measured
   on the same trades.
**Dependency, stated up front:** 1 and 2 need an *existing* edge to size/gate —
the forecast can only improve something that already has positive expectancy. If
we don't have a live baseline edge, the honest first step is to pick one
(momentum / carry are the replicated candidates) rather than invent one. That's a
decision to confirm before building, not a default.

## What is NOT on the critical path (deferred)
- **Session-contribution accuracy (2b-ii)** — needs the forecaster to emit an
  Asia/London/NY split. This is a *forecast-quality* measure, not a level-decision
  input; **not needed for the bot**. Defer.
- **Macro/news/holiday conditioning (2c)** — a calendar join; useful as a filter
  later, not on the path to the first honest touch-edge test.

## Order of work implied
1. Fill the two GAPs that gate a real answer: **retest sequence (Q4)** and
   **cost-survival at the level (Q8)** — Q8 first, since a gross edge that dies on
   costs makes the rest moot.
2. Sharpen Q6 to full MFE/MAE distributions and fold Q5 (session) cross-pair.
3. Only then, if a cost-surviving, OOS-consistent, type-diverse touch edge exists,
   does the decision/selector layer (Phase 3) have something real to size.
