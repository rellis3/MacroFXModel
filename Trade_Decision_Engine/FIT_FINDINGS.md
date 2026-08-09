# Trade Decision Engine — fit findings (backtest vs hand-weighting)

The question: instead of the hand-set `modelV0` prior (`calibrated: false`), can we
**fit** the model on history and add the Phase-11-validated WaveTrend MTF-stretch as a
feature? Ran the existing `backfillPair` → `fitLogistic` pipeline (same `decide()` path
the live API uses; triple-barrier after-cost labels; time-ordered train/OOS + embargo).

## Setup
- Pooled 6 FX majors from the M1 cache: **110,883 labeled events** (38,635 OOS).
- Baseline features = `modelV0.weights` keys. A/B adds `wt_stretch_fade` (new feature:
  MTF WaveTrend OB/OS-stretched in the fade direction — M15+H1 wt1 ±53, causal at the touch,
  computed in `backfill.js:_mtfStretchLookup`).

## Result 1 — fitting BEATS hand-weighting (real, promotable)
| model | OOS Brier |
|---|---|
| `modelV0` hand-set prior | **0.2724** |
| fitted (v0 features) | **0.2469** |

The fitted logistic is materially better-calibrated than the hand-set prior
(`fitted_beats_prior: true`). So "backtest instead of hand-weight" is a genuine win — a
fitted `modelV1` would give honest, calibrated probabilities for the go-threshold + sizing.

## Result 2 — but the model is weakly DISCRIMINATING (the honest ceiling)
OOS calibration collapses to a single reliable bucket: **predicted 0.558 → realized 0.554**
across all 38,635 OOS events. Almost everything scores 50–60% and realizes ~55% — the
features barely separate winners from losers. A fitted v1 is better *calibrated*; it is not
more *selective*, because the setups themselves aren't very separable (consistent with the
whole research arc: magnitude/context is predictable, per-trade direction is not).

## Result 3 — the WT-stretch feature does NOT transfer to the general zone set (NULL here)
- fitted `wt_stretch_fade` weight ≈ **−0.005** (≈ zero); Brier improvement baseline→+WT = **0.00000**.
- Raw: among fades, `wt_stretch_fade=1` (7.5% of them) win **54.6%** vs all-fades **55.7%** —
  slightly *worse*, not better.

Why, given Phase 11 showed MTF-stretch lifts the **median-line** fade to 62%? Because Phase 11
measured it at the **forecast median/75th lines** with the OC-median fade geometry. The decision
engine fades a much broader zone universe (pivots, prior H/L, S&R clusters, round numbers,
asia/monday ladders, session hi/lo) with a σ triple-barrier. The WT-stretch edge is
**forecast-line-specific — it is not a universal "fade any stretched level" signal.** Useful
boundary: its home stays the level alert / reversion chart (forecast lines), where it's wired.

## Result 4 — `htf_align` did NOT replicate (also null here)
`decisionCore`'s header calls `htf_align` "the one feature that survived OOS+cost testing."
In this pooled after-cost backfill it does **not**: agree-win **55.6%** vs oppose-win **55.7%**
(= base 55.7%), fitted weight **≈0.003**, zero OOS Brier change. So it too is dropped from
`modelV1`. (The prior claim may have been on a different metric/universe — per-trade R with a
directional filter rather than pooled Brier — worth reconciling, but not promotable as-is.)

## `modelV1.js` — what was produced
A re-fit of the **v0 feature set only** (no new feature earned in). Notable correction: the
fit flips `stretch_fade` from the hand-set **+0.45 → −0.14** — fading a distance-stretched
level is mildly *anti*-predictive after cost, the opposite of the prior's belief. Fitted
magnitudes are small across the board (max |w|≈0.14), reflecting the shallow discrimination.
`calibrated: true`, FX-majors only — re-fit before applying to gold/indices.

## Result 5 — cross-asset direction: the FIRST feature that discriminates (`crossAssetFit.mjs`)

Wired a CAUSAL macro context from the M1 cache (no FRED): risk regime from NQ (20d), per-pair
`riskSens = −corr(pair, NQ)` (60d) to activate the engine's `macro_align`, plus a new
leave-one-out synthetic **USD trend** (10d over the *other* majors) → candidate
`usd_trend_align` (does the trade's USD side agree with the prevailing USD momentum?).

| feature | agree win | oppose win | n (agree/oppose) | fitted weight | ΔOOS Brier |
|---|---|---|---|---|---|
| `macro_align` (risk regime) | 57.4% | 52.7% | 10.5k / 9.9k | +0.085 | 0.2469→0.2467 |
| **`usd_trend_align`** | **58.4%** | **52.8%** | **50.4k / 47.3k** | **+0.094** | **0.2469→0.2458** |

**This is the first candidate to genuinely move direction** — large samples, correct sign,
and the first to improve OOS Brier. Economically clean: for FX the dominant direction driver
is the **USD trend**, and fading a level *with* the prevailing USD momentum beats *against* it.
It's idea #4 realized as a feature — borrowing direction from where it's actually real
(cross-sectional momentum) into the level decision.

**Honesty guardrails before promotion:** the Brier gain is real but small (0.0011) — it shifts
a subset, not the whole mass; win-rate ≠ after-cost expectancy (the triple barrier is
asymmetric), so the mean-R of the usd-aligned subset must be checked before it's a *trade
rule* (vs a *model feature*, where the OOS-Brier improvement already validates it). Live use
also needs the USD-trend computed cross-pair in the slow loop (featureState), which the
current per-pair snapshot doesn't do yet.

### Expectancy check (the tradeability gate) — PASS as a filter, thin as a standalone
Mean after-cost pnl (fades only), OOS half (split 2022-11-18), after the 1.2bp spread:

| | n (OOS) | mean pnl |
|---|---|---|
| USD-**aligned** fades | 15,668 | **+0.71 bp** |
| USD-**opposed** fades | 16,554 | **−3.61 bp** |
| all fades (blind) | 36,108 | −1.44 bp |

Per-pair OOS: aligned **beats** opposed on **6/6**; aligned is **positive on 5/6** (USDCHF −0.16);
opposed is negative on all six (−1.9 to −4.6 bp). So "fade WITH the USD trend, never against"
is a real, OOS, cross-sectionally-consistent **direction filter** — it removes the −3.6bp
opposed half. Caveat: +0.71bp is after the 1.2bp spread but NOT the 0.6bp `DEFAULT_SLIP_PCT`
(stop exits pay it), so the aligned side is realistically **≈ +0.1–0.4bp** — marginally
positive, cost-sensitive. Use it as a **filter / direction-confidence read**, not a standalone
money-maker. Reproduce with `crossAssetFit.mjs` (add the expectancy block, or see git history).

### Follow (continuation) does NOT work — even USD-aligned
Testing the same USD alignment on FOLLOW events (not just fades), OOS after-cost:

| action | aligned | opposed |
|---|---|---|
| FADE | +0.71 bp | −3.61 bp |
| **FOLLOW** | **−2.37 bp** | −7.57 bp |

Following loses even when aligned (−2.37bp, negative on 6/6 pairs). So the decision is NOT
"fade vs follow vs skip" — it's **"fade in the USD-favoured direction, or skip."** One axis.
(Consistent with the arc: median continuation is real but sub-cost; the engine's broad-zone
follow selection loses outright.) This *simplifies* the live decision rather than complicating it.

### Shipped: ONE consolidated decision on the level alert
`volLevelAlertCore.decideAtLevel` collapses the signal pile into a single call: DIRECTION from
the USD trend → **FADE {dir}** (USD-aligned, the +0.71bp side) or **SKIP** (opposed fade −3.6bp
/ follow loses either way); CONFIDENCE tier (HIGH/MED/LOW) from WaveTrend MTF-stretch
(exhaustion confirms) + regime (contained → caps → better; expansion → caution). Non-USD pairs
/ flat trend fall back to the raw context blocks. Replaces the separate USD/WT/dispersion
sections with one headline + one "why" line.

### Shipped: the USD-trend filter on the live level alert
`volLevelAlertCore.formatUsdTrendLines` + `server._computeUsdTrends` add a "💵 USD-trend
filter" block to the level-proximity Telegram alert: 🟢 Aligned (fade with the USD trend —
the tradeable side) / 🔴 Opposed (against it, −3.6bp — skip). USD trend = leave-one-out 10d
return of the other majors, matching the backtest. Still TODO: reversion-chart read + promote
`usd_trend_align` into `modelV1` (needs the cross-pair USD trend in `featureState`'s slow loop).

## Takeaways
1. **Promote a fitted `modelV1`** for the calibration win (Brier 0.272→0.247) — a human
   decision on this OOS evidence, per Lego Principle 5. It improves honesty of the probability,
   not selectivity.
2. **Do not add `wt_stretch_fade` to `modelV1` weights** — it's null on the engine's zone set.
   Keep it logged as an inert candidate (like `macro_align`/`credit_*`) for future subset work
   (e.g. gate it to forecast-line zones only, where Phase 11 validated it).

Reproduce: pool `backfillPair` events across the majors and run
`fitLogistic(events, { features: [...Object.keys(MODEL_V0.weights), 'wt_stretch_fade'] })`.
