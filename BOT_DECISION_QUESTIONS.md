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

## Validation discipline (applies to every question)
- **Out-of-sample** split, **≥30 events**, **costs on**.
- **Per pair-type**, and **cross-pair consistency** (a pattern must hold across
  ≥2 types, sign-test + BH-corrected) — a signal in three correlated crosses is
  not a trend.
- **Pre-register both outcomes** before running, so a null can't be re-narrated.

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
