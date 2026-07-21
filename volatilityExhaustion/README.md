# Volatility-Exhaustion — a measurement-first study

**Goal.** Learn, honestly and from our own data, whether *expected volatility*
tells us the point at which price **exhausts and reverts** intraday — combining
the vol forecast (how far price travels) with exhaustion dynamics (where it turns).

We build the **lens before the trade**: measure the phenomenon directly and look
at real charts, and only build a strategy if the data shows a real, stable effect.
This folder is self-contained and runs offline on the local M1 parquet cache
(`portfolioBacktest/cache/`, ~10.4y M1, 2016→2026) + `calendar_events.csv`.

## The σ contract (no drift from the live forecaster)
`vol_exhaustion_lib.py` reproduces the project's Yang-Zhang σ, the Europe/London
day boundary, and the causal `σ_pred[i]=yz[i-1]` rule **exactly** (generate-don't-port,
per `PYTHON_LEGO.md`). `compare_sigma.py` runs the real `js/volBacktestEngine.js`
`yzVolSeries` on the same synthetic bars and asserts agreement to 1e-10 — this is the
contract, and it **passes** (max |JS−Py| = 1.7e-18). The exhaustion lens is on the
same σ as the forecaster by construction.

## The measurement (descriptive, not a strategy)
- Anchor = London-midnight open `O`; scale = causal YZ σ. Distance `d = (price−O)/O/σ`.
- **Two-barrier race:** at a state, place barriers ±`θσ` (θ=0.25) in price — reversal
  (toward open) vs continuation (away). Whichever is hit first within `H`=60min labels it.
- For a driftless walk the **null is P(reversal)=0.50 at every distance** (optional
  stopping). So the pre-registered read is unambiguous:
  - P(reversal) **rises with distance** → real, vol-scaled exhaustion.
  - P(reversal) **flat ~0.50** → null; exhaustion is folklore here.
- A result only counts if it **holds on both halves** (in-sample & out-of-sample).

Two framings:
- `measure.py` — distance from the **fixed open** (+ splits by time-of-day, arrival
  speed, Major-news day).
- `measure_extremes.py` — the **fairer** test: condition on a **fresh session extreme**
  ≥0.4σ from open and ask "does this extreme *hold*?" (the real "is this THE high?" setup).

## Results (Phase 0)

**1. Distance-from-open: NULL, on both instruments.**
EUR/USD reversal probability hugs 0.50 at every distance; the far-distance wiggles
(>2.5σ) are noise and **disagree** across the IS/OOS split (the pre-registered kill
condition). Time-of-day, arrival-speed, and news splits are all flat too. NQ tilts
*below* 0.50 at distance (weak momentum), IS/OOS agreeing — the opposite of exhaustion.
Harness validated: daily max travel-from-open has median 1.01σ / 75th 1.49σ, right
against the Feller HL median 1.572σ — the σ scaling is correct, the null is real.

**2. Fresh-extreme (impulse) test: a weak but cross-sectionally-consistent, economically-signed split.**
Conditioning on a fresh extreme (not a fixed distance) is the first thing that isn't
flat — and the sign **replicates across ALL 6 FX majors AND the IS/OOS split**
(~44–49k events each; OOS far ≥1.5σ hold-rate):

| Instrument | mean hold | far IS | far OOS | reading |
|---|---|---|---|---|
| EUR/USD | 0.519 | 0.536 | 0.539 | exhausts |
| GBP/USD | 0.505 | 0.500 | 0.533 | exhausts |
| AUD/USD | 0.508 | 0.533 | 0.531 | exhausts |
| NZD/USD | 0.513 | 0.553 | 0.537 | exhausts |
| USD/CAD | 0.508 | 0.523 | 0.507 | exhausts (weak) |
| USD/CHF | 0.515 | 0.518 | 0.527 | exhausts |
| **NQ (index)** | 0.464 | 0.476 | 0.483 | **trends** (opposite sign) |

**6/6 FX majors hold above 0.50 out-of-sample; the index sits below.** The tendency
strengthens past ~1.75–2σ (rough dose-response, see the overlay chart). The sign
difference — **FX exhausts weakly, the index trends weakly** — is economically
sensible and matches the replicated literature (short-horizon FX mean reversion;
index momentum). Cross-sectional consistency is real evidence against a
multiple-testing fluke. BUT the effect is *small* (≈53% vs 50% null) and its
after-cost tradeability is **not** established — a 3pp edge on a 0.25σ target is
exactly the scale that spread + the overshoot tail tend to eat.

**3. Estimator robustness.** The σ scale is Yang-Zhang(30) — the actual FX forecast
estimator (`VOL_ESTIMATOR_DRIFT.md`: for FX the bot/book and live forecaster use the
identical estimator), verified bit-identical to the JS. The forecast *band* lines are
`σ × Feller-constant × per-asset-correction`, i.e. a fixed multiplier — using them
instead of raw σ is a pure x-axis relabel and cannot change any conclusion. Swapping to
a genuinely different estimator (close-to-close **HV20**) that re-normalizes each day
non-linearly leaves the result intact: **6/6 majors exhaust under BOTH YZ30 and HV20**,
near-identical hold-rates (`measure_extremes.py compare`). The effect is not a vol-calc artifact.

## Honest verdict
- The naïve "vol-distance predicts the reversal point" idea is **null** off the open.
- The **fresh-extreme** framing yields a genuine effect that is **out-of-sample-stable,
  cross-sectionally consistent (6/6 FX majors), and correctly signed** (FX exhausts, index
  trends) — the best lead this study has produced. But it is weak (≈53/47) and untested
  against costs and the overshoot tail.
- Blunt odds this becomes a tradeable, after-cost edge: **~20–25%** (up from ~15% once it
  replicated across all majors — cross-sectional agreement is real evidence, but a 3pp edge
  on a 0.25σ target is exactly where costs bite). Worth the costed Phase-1 test; not excitement.

## Next (Phase 1, if pursued)
1. Convert the fresh-extreme reversion into a **costed** IS/OOS trade (fade a fresh ≥2σ
   FX extreme; target partial-revert/open; stop beyond; real spread + slippage; handle the
   overshoot). Pre-register: must beat the naïve benchmark OOS after costs, ≥30 trades.
2. Test the **sign-flip**: momentum-follow fresh NQ extremes.
3. Extend the fresh-extreme measurement to the other FX majors — is the reversion sign an
   FX property or a EUR/USD fluke? (guards against multiple-testing on one series).

## Phase 1 — forecast line vs actual fade point (`forecast_vs_fade.py`)

Question: is the forecast's dynamic H-L exhaustion line **near** where price actually
fades, and can pre-session σ **predict** that fade point out-of-sample? For each day we
build the Expected-High/Low projection (`running_extreme ± C·σ`, fx median C=1.289 /
75th C=1.674) and find the day's **dominant reversal** (largest-retrace pivot), then
compare its realized H-L excursion to the forecast.

**Findings (7 instruments, IS/OOS):**
1. **They are NOT near — the forecast lines sit far outside the fade.** The actual
   dominant fade excursion has median **~0.65σ** (fx) — well *inside* the forecast H-L
   median (1.29σ) and 75th (1.67σ). The forecast lines mark the day's **range extreme**,
   not the reversal point; most days the biggest turn happens at roughly *half* the
   forecast-median distance. (This explains prior at-line-fade nulls: tagging the 75th
   means arriving ~1σ *after* the typical turn — in the overshoot tail.)
2. **σ predicts the fade only weakly.** OOS corr(σ, realized fade) ≈ **0.23–0.33** across
   all 7 instruments — real, consistent, but σ explains only ~5–11% of the variance. The
   scatter is a diffuse cloud, not a 45° line.
3. **σ-scaling beats a naive fixed-% line 7/7 OOS — but barely** (e.g. EURUSD MAE 0.159 vs
   0.164, ~3%). The vol forecast carries genuine information about the fade distance; it is
   just a *soft zone*, not a precise point.

**Verdict:** you can forecast the exhaustion *zone* a little from σ (better than a fixed
%), but not a sharp point — and the shipped H-L 75th line is calibrated to the range
extreme, ~2.5× farther out than the typical dominant fade. The better-calibrated
"expected fade" is the empirical constant **~0.65σ from the opposite extreme**, though
even that is a wide distribution.

## Phase 2 — payoff geometry (the tradeability test) (`payoff_geometry.py`)

Question: if you actually faded a fresh 0.65σ extreme, is the reward bigger than the risk?
Causal, one hypothetical trade/day: entry = first fresh extreme ≥0.65σ from open, fade toward
open; measure forward **MFE** (favourable reversion) vs **MAE** (adverse overshoot) in σ, plus a
stop/target expectancy grid (first-passage, after approximate cost), IS/OOS.

**Finding — NOT tradeable.** Reward/risk ≈ **1.0** on all 7 instruments (median MFE ≈ MAE ≈ 0.5σ);
the MFE and MAE distributions sit almost on top of each other. Every stop/target cell is negative
OOS after cost, and the IS-best cell loses OOS on 6/7 (the lone USD/CAD positive is what noise
produces across 7 tests). **The exhaustion tendency is real but the payoff is symmetric** — when a
fresh extreme reverts it reverts about as far as it first ran against you, so after costs it loses
at every stop/target. Same overshoot wall that beat every prior version, now confirmed with proper
geometry.

## Robust-σ test — does trimming the outliers help? (`forecast_vs_fade.py robust`)

The owner's hypothesis: do the rare >95% days pull σ too wide? A causal winsorized σ predicts the
fade **worse on 7/7** (corr falls, MAE rises). The tail is **signal, not noise** — vol clusters, so
the RMS σ that keeps recent big days predicts better. (The median/75th are percentiles, already
outlier-robust; outliers only enter the σ scale, and even there keeping them wins.)

## Extreme-value law behind the levels (`evt_envelope.py`)

Does the day's extreme excursion follow the reflection-principle / EVT law the forecast
levels are built on — and where does it break (the LIL/tail regime)? Pool the one-sided
O→H, O→L excursions in σ-units and test vs the half-normal (median 0.6745 = the O-C
constant; full-range median = Feller 1.572σ).

**Finding — theory confirmed in the bulk, breaks in the tail.** Real excursions track the
driftless-BM half-normal **almost exactly out to ~1.5–1.8σ** (through the Feller H-L
median) — so the forecast levels sit on the correct extreme-value physics, which is *why
they look accurate on normal days*. Beyond ~2σ the tail is **1.2–1.3× fatter** than
Gaussian (EURUSD ×1.21 … **NQ ×1.34**, index jumps) — the LIL regime where no finite σ can
pin the level; this is why crisis-day 75th numbers are unreliable. The bulk is slightly
*tighter* than half-normal (median 0.52σ vs 0.67σ) — leptokurtosis — which vindicates the
"lines look wide on calm days" intuition for the right reason, but can't be trimmed away
(the tail is clustered signal, Section 4). Charts `*_11_evt_envelope.png` (survival + QQ).

## Phase 3 — does prior-vol predict TODAY's expansion? (`daytype_classifier.py`)

The owner's push: "continuation past the 75th is only ~25%, and vol clusters — can
yesterday's vol tell us whether TODAY blows through or stays contained?" A different
question from the fade study: not *fade-or-follow at the level* but *is today an
expansion (blow-through) day or a contained day*, from information known **before**
the London open. If that classifies with real OOS skill, the live level-alert can
honestly tag break-vs-hold; if not, it ships factual context only.

**Label (primary):** `expand[i] = realized H-L(i) in σ-units > forecast 75th line`
(`BM_P75 × hl_75_corr`, fx = 1.674σ). **Features** (all causal): σ level & percentile,
σ-acceleration, vol-of-vol, overnight gap, prior-day exceedance & efficiency.
**Validation:** time-ordered 60/40 per instrument + pooled FX (z-scored within
instrument); benchmarks = base-rate floor and a σ-only ablation; logistic (min-DOF)
+ shallow GBM. Pre-registered pass = pooled OOS AUC ≥ 0.55 AND beats the base floor
AND beats σ-only AND +skill on ≥4/6 majors.

**Result — PASS, but MAGNITUDE only (not direction).**

| test | pooled-FX OOS |
|---|---|
| logistic full | AUC **0.680**, Brier-skill **+9.4%** |
| σ-only ablation | AUC 0.556, +0.7% |
| placebo (shuffled labels) | AUC 0.501, −0.03% ✓ clean |
| walk-forward (0.40/0.55/0.70 train) | AUC 0.67 / 0.67 / 0.69 ✓ stable |
| per-instrument +skill | **6/6 FX majors** (+ NQ AUC 0.712) |

So prior-vol/regime **does** predict whether today spends past its budget — OOS,
cross-sectionally consistent, placebo-clean. Two honest caveats from the robustness
pass:
1. **`gap` carries most of it** (gap-only AUC 0.617; drop-gap falls to 0.589/+1.9%).
   The overnight gap is a narrow (~12% of days), partly measurement-window effect:
   energy spent in a between-session jump sits outside the London-day H-L window, so
   big-gap days show a *smaller* measured range. Real and causal, but not the deep
   vol-clustering insight it first looks like. The clean vol-clustering residual
   (accel + prior-exceedance, gap removed) is a **modest but real +1.9%**, placebo-clean.
2. **Direction is NOT predictable.** The trend-vs-revert *character* label (efficiency
   ratio) is pure noise — pooled-FX OOS AUC **0.505**. The classifier knows *how big*
   today will be, not *which way*. This is why the live alert says **break-vs-hold**,
   never "fade" or "buy" — and why the fade *entry* stays dead (Phase 2 payoff geometry).

**Transparent live rule (no black box in the hot path).** A 2-condition selector —
lean **EXPANSION** if the prior day blew through its 75th **OR** σ is accelerating
(`σ_pred_today > 1.10 × mean prior-5`) — keeps the OOS signal without porting a fitted
model: on the pooled-FX OOS half it separates blow-through days **0.388 vs 0.307
(+8pp)**, using only the clean vol-clustering features (no gap). This is what the
Telegram level-alert carries (`js/volLevelAlertCore.js` `budgetContext`), on the same
`volSigmaSeries` σ the plan uses (imported, not re-derived).

**Honest verdict / odds.** A genuine, rare positive — but correctly scoped: *magnitude
yes, direction no*. It is a **context / range-budget** signal (how much room today has,
whether a level is more likely to break or hold), **not** a directional entry and
**not**, on its own, a trading edge — a classification win still has to be *sized onto*
an existing edge to make money (a method is not a strategy). Its honest uses: alert
context, and a candidate sizing/gating input. Fade-the-level remains null after costs.

## Phase 5 — richer at-the-moment conditioners on the fresh-extreme race (`conditioners.py`)

The owner's push after the direction nulls: absolute distance/velocity is too poor a
conditioner — test two richer, principled, σ-normalized *at-the-moment* state features on
the **same** fresh-extreme reversal race, controlling for raw distance:
- **F1 `vwap_stretch`** = `(price − sessionVWAP)/(σ_pred·O)`, signed +ve = extended past
  VWAP in the extreme's direction ("1.8σ above VWAP is stretched; 0.2σ above isn't").
- **F2 `time_z`** = `dist_in_σ / √(elapsed session fraction)` — reaching a σ-distance
  *early* scores high (unusual for the time); late scores ≈ distance ("1.9% by 09:15 ≠
  1.9% by 18:30").

The honest control: both correlate with distance, so the headline is terciles of the
feature computed **only on far events (dist ≥ 1.5σ)** — the incremental separation.
Pre-registered pass: high-vs-low tercile P(hold) sep ≥ 0.03, **same sign IS & OOS, on
≥ 5/6 FX majors**.

**Result — NULL (both), pre-registered bar not cleared.**

| feature | majors passing (sep≥3pp, IS&OOS same sign) | verdict |
|---|---|---|
| `vwap_stretch` | **1/6** | NULL |
| `time_z` | **0/6** | NULL |

- **`vwap_stretch`** is the *near-miss*: the **sign** is economically right and
  replicates — IS 6/6 positive, OOS 5/6 positive (more-stretched-past-VWAP extremes
  revert slightly more), with OOS seps up to +0.069 (CHF), +0.068 (NZD). But it is
  *per-instrument unstable* (USDCAD +0.064 IS → −0.004 OOS; GBPUSD +0.058 → +0.003), so
  only 1/6 clears the both-halves magnitude bar. Same weak-but-sign-consistent character
  as the base fresh-extreme effect — **not** a new edge. And even the best cells (~3–7pp)
  can't survive Phase-2's payoff wall (R/R ≈ 1.0 on a 0.25σ target → negative after cost).
- **`time_z`** is genuinely dead — signs scatter across IS/OOS (0/6 consistent). Time-
  normalising the path adds nothing to the race outcome.
- **NQ** (index) flips around with no IS/OOS consistency on either feature.

**Takeaway:** this closes the last *cheap, in-sandbox* directional-conditioner lead. The
symmetric-payoff wall, not a poverty of price conditioners, is what kills the fade —
richer σ-normalized state doesn't move it. The still-open (bigger, data-gated) idea is
**day-level macro-state conditioning** (yields/DXY/credit/COT/regime), which needs those
daily feeds wired in and must respect the release-cadence rule — a deliberate build, not
a bolt-on. The evidence continues to point at *magnitude/state → environment → execution*,
not direction-at-exhaustion.

## Analysis book
`analysis-book.html` — a dark-theme page with every key chart and a plain-English *what it shows /
what it means* under each, ending in the scoreboard and honest conclusion. Open it with `charts/`
alongside.

## Files
- `vol_exhaustion_lib.py` — σ/day/anchor baseplate (matches the JS forecaster).
- `compare_sigma.py` / `crosscheck_sigma.mjs` — the σ-drift guard (JS vs Python).
- `measure.py` — distance-from-open lens + conditioners → `charts/*_1.._6.png`.
- `measure_extremes.py` — fresh-extreme exhaustion test → `charts/*_7.png`; `combined` (overlay) / `compare` (YZ vs HV20) modes.
- `forecast_vs_fade.py` — Phase-1 forecast-line-vs-actual-fade accuracy → `charts/*_8,_9.png`; `robust` mode = the outlier-trim test.
- `payoff_geometry.py` — Phase-2 MFE/MAE reward-vs-risk + expectancy grid → `charts/*_10.png`, `payoff_geometry_summary.json`.
- `evt_envelope.py` — reflection-principle / LIL tail test: excursions vs half-normal → `charts/*_11.png`, `evt_envelope_summary.json`.
- `daytype_classifier.py` — Phase-3 prior-vol → today's-expansion classifier (logistic/GBM, IS/OOS, pooled FX, robustness incl. placebo/drop-gap/trend-label/walk-forward/transparent-rule) → `daytype_classifier_summary.json`. Run `python3 daytype_classifier.py` (full) or `... robust` (skeptic pass).
- **`MARKET_STATE_FINDINGS.md`** — Phase-4 "budget as *state*, not signal" (Tiers 1–4): state-conditioned trend sizing/gating, time-adjusted consumption, remaining-budget exits, vov continuity, cone calibration, and the composite. Read this for the honest scoreboard.
- `budget_research_lib.py` — shared baseplate for Phase 4 (TSMOM reproduction of `js/trendFollowEngine.js` + causal state features on the σ contract).
- `tier1_state_conditioning.py` / `tier2_time_adjusted.py` / `tier3_budget_vov_cone.py` / `tier4_state_composite.py` — the four Phase-4 tests (each prints a pre-registered verdict).
- `conditioners.py` — Phase-5 richer at-the-moment conditioners (VWAP-stretch/σ + time-normalized path) on the fresh-extreme race, distance-controlled, IS/OOS, pre-registered cross-sectional verdict → `conditioners_summary.json`. Run `python3 conditioners.py` (6 majors + NQ) or `... EURUSD` (one pair).
- `analysis-book.html` — human-readable write-up of every phase with charts + explanations.
- `summary.json` / `forecast_vs_fade_summary.json` — headline stats.
