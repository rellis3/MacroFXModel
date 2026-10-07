# Meta-labelling built properly from the ground up (López de Prado, AFML ch. 3–4, 10; Lesson 03 §01)

*Pre-registered 2026-10-07, before any layer was built. Replaces the thin version (forge/META_LABEL_YS_PREREG.md,
FAIL), which the owner rightly said "didn't feel like meta-labelling". It fitted a small model to a pre-filtered
trade list. Every layer here is built and checked separately. One pre-registration + at most one logged variant, then
a decision (stopping rule). No Vote Atlas input.*

## Layer 1 — the primary: high recall, validated direction

- **Universe:** USDJPY, EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF.
- **Daily bars:** UTC daily closes, highs and lows from local M1, as the yield-spread engine builds them
  (`buildDayIndex`), 2016-01-01 → 2026-08-20.
- **Spread z:** the yield-spread engine's own `buildRollingZSeries` (z-window 126), on FRED series per
  `ZSCORE_PAIRS`, from FRED's public download (`fredgraph.csv`, latest vintage, as the API default). Publication lags
  +2 days (US) / +45 days (foreign). Side = `directionFromZ(z, resolveInverted(usdRole))`, exactly as the strategy.
- **Events (CUSUM filter, AFML 2.5.2.1):** a symmetric CUSUM on daily log close returns. An event is emitted when
  the cumulative move since the last reset passes **h = 1.0 × σ** (σ = that day's point-in-time daily σ).
- **The primary fires** at an event when **|z| ≥ 1.0**: a deliberately low threshold, for recall. (The traded
  strategy uses 2.0; |z| is a feature, so the meta-model can learn the threshold rather than have it imposed.)
- **σ throughout** = the point-in-time export σ (`pit_sig_used`, Step 0 table), causal from 2016. The chosen
  forecast's own walk-forward history starts in 2020-08, too late for barriers. Its state enters as features.

**Layer 1 checks (reported before any model):**
- events per pair and year, and the share where the primary fires;
- **precision** (share of primary bets whose label is 1);
- **recall** (primary bets that hit the profit barrier ÷ all events where either barrier was hit);
- the same numbers for the |z| ≥ 2.0 subset (the traded strategy), for comparison.

## Layer 2 — triple-barrier labels (AFML 3.4)

- **Entry** = the event day's close.
- **Barriers:** profit = stop = **2.0 σ** from entry (σ in price), checked on daily highs and lows from the next day
  on. A day touching both counts as the stop.
- **Vertical barrier** = **10 trading days**.
- **Return at exit** = +2σ / −2σ / the vertical close, in the primary's direction, **minus 0.02% round trip**.
- **Meta label** y = 1 if that net return > 0.
- **Rule checks:** the stop is wider than the "how much" minimum stop (0.55–0.60σ, forge/HOW_MUCH_SPEC.md); labels
  read only bars after the event day (by construction plus a truncation spot check).

**Layer 2 checks:** label balance; share ending at profit / stop / vertical; mean days held; average uniqueness.

## Layer 3 — features (all known at the event close)

| Group | Features |
|---|---|
| Primary | z, \|z\|, 5-day change in z, days since \|z\| crossed 1.0, the raw spread level |
| Event | the CUSUM move's sign relative to the primary's side (+1 = price already moving the primary's way) |
| Volatility system | regime (σ vs trailing 250 median), res5 (5-day range vs σ), today's range vs σ, BNS jump days in the last 5, 5-day change in log σ, implied vol ÷ σ (CME CVOL; research source, flagged) |
| Cross-section | USD trend: mean 10-day return of the other five pairs' USD leg, signed to the primary's USD side (leave-one-out) |
| Calendar | Major releases (USD + the pair's currency) in the next 5 days (calendar proxy, to 2026-07-02; missing after) |

## Layer 4 — sample weights (AFML 4.4–4.6)

Weight = average uniqueness over the label span (event day → exit day, concurrency across all six pairs) ×
linear time decay (oldest training event 0.5, newest 1.0).

## Layer 5 — model (fixed, not tuned)

- **Bagged trees:** `RandomForestClassifier` with 500 trees, `max_features='sqrt'`, `min_samples_leaf=50`,
  `class_weight='balanced_subsample'`.
- `max_samples` = the training set's mean uniqueness (AFML 4.5: the sequential bootstrap's effect, approximated).
- Missing values filled with the training median + a missing flag.
- No hyper-parameter search, so no cross-validated tuning.

## Layer 6 — walk-forward, purge, embargo

- Test year Y (2019 → 2026) uses a model trained on events whose **label span ended before** 1 January Y, minus a
  **10-trading-day embargo** (AFML 7.4).

## Layer 7 — bet sizing (AFML 10.1)

- For each primary bet, p = P(y = 1); z = (p − 0.5) ÷ √(p(1 − p)); size = 2Φ(z) − 1, floored at 0 (p < 0.5 → no
  bet), rounded to steps of 0.1.
- The flat comparison bets size 1 on every primary event.

## Scoring (test years pooled; intervals by month-block bootstrap, 2,000 reps)

1. **Precision:** meta-filtered (p > 0.5) vs the primary alone, difference with interval; F1 of both.
2. **Sharpe:** per-bet Sharpe of meta-sized vs flat returns, difference with interval.
3. **Ablation (does the volatility system matter?):** the same model without the volatility-system features. Report
   precision and Sharpe for it, and the full-minus-ablation difference.
4. **Deflated Sharpe** with N = 5 meta-label trials so far (3a, 3a-v1, 3b-stopped, C, this).

## PASS

(1) precision difference interval wholly above 0 **and** (2) Sharpe difference interval wholly above 0.

**The volatility system earns its place** only if, in addition, full − ablation Sharpe is above 0 with its interval
wholly above 0. Otherwise any gain belongs to the primary's own features, the USD trend or the calendar, not the
volatility layer.

## Output

Builder `scripts/meta_proper/build_events.mjs` (layers 1–2), `scripts/meta_proper/model.py` (layers 3–7);
`analysis/output/meta_proper/`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | — |

## Amendment 1 (2026-10-07): implementation fault — the first run produced no model

With `max_samples` = mean uniqueness (0.12, so ~360 draws per tree) and `min_samples_leaf = 50`, scikit-learn grew
**single-node trees**: every prediction 0.500, every importance 0. That is a fault, not a result (nothing was fitted),
so its numbers are void. The registered intent was "leaves of about 50 events" on the full sample. On a 12% bootstrap
sample that is `min_samples_leaf = max(5, round(50 × mean uniqueness))` (≈ 6). Fixed to that; nothing else
changes. Logged here rather than as the allowed variant, because no valid run preceded it.
