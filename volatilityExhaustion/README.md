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

## Phase 6 — the DECISION at the median line: fade or follow? (`median_tag_decision.py`)

The owner's real question, stated plainly: *the forecast lines are good, trading them
blindly isn't — at the median line do I fade (→open) or follow (→75th), and does the
range-budget consumed getting there add confidence?* Measured directly: first bar the
one-sided excursion reaches the median line (1.289σ fx), then a two-barrier race to
session close — FOLLOW = reach the 75th line (+0.385σ) vs FADE = back to open (−1.289σ).
Causal, IS/OOS, 6 majors, expectancy in σ (the asymmetric barriers make a raw win-rate
misleading, so we net the distances and subtract a rough 0.03σ cost).

**The benchmark FIRST (or 86% lies):** the follow barrier is far closer, so a *driftless
random walk* reaches the 75th before the open **77%** of the time (gambler's ruin
1.289÷1.674), with **zero** expectancy on either side. So the honest read is vs 77%, not 50%.

**Finding — at the median these majors CONTINUE, they don't exhaust.**

| | P(follow to 75th) | E[fade→open] | E[follow→75th] |
|---|---|---|---|
| IS  | 88.0% | −0.215σ | **+0.155σ** |
| OOS | 85.8% | −0.177σ | **+0.117σ** |

Observed 85.8% vs the 77% null = ~9pp of genuine continuation → **positive FOLLOW
expectancy, negative FADE expectancy, OOS, on all 6 majors.** This is the *opposite* of
the textbook "fade the median exhaustion" — the median is mid-distribution, price walks
through it. (Coheres with the 75th being the exhaustion zone where fades die to overshoot,
Phase 1–2.)

**The owner's budget hypothesis (clean/low-budget tag → more follow) is NULL: 0/6** — the
sign is if anything backwards. Budget-at-tag does not sharpen the fade/follow call.

**Not an edge yet — a real LEAD needing the costed test.** Caveats before belief:
(1) the 9pp over null may just be the documented fat right tail (EVT, Phase 0) re-measured,
not a separate signal; (2) R:R is 0.30:1 so it rides entirely on the ~86% win rate holding
(break-even 77%); (3) the 0.03σ cost is a guess and entry is a breakout (slippage) — though
the edge is ~4× cost, unlike the 75th fade; (4) uses STATIC lines off the open, not the live
DYNAMIC (trailing) geometry. Next step: a properly-costed, dynamic-line, fat-tail-controlled
follow-the-median engine with the 77% null as benchmark. Run `python3 median_tag_decision.py`.

## Phase 7 — the COSTED median follow, + the placebo that proves it's momentum (`costed_median_follow.py`)

Turns the Phase-6 lead into a costed trade on the LIVE dynamic (trailing) line geometry —
a faithful port of `forecastCore.js simulateEntry` dynamic-HL (not a fresh re-derivation),
real fills, round-trip spread + breakout slippage, IS/OOS, 6 majors. Tests the exit design
(the Phase-6 race caps winners at the 75th — a bad follow structure), plus a shuffled-returns
placebo. NULL benchmark: a driftless walk has 0 net expectancy on any barrier bet.

**Costed result (pooled FX OOS, per-trade):**

| config | OOS mean | OOS Sharpe |
|---|---|---|
| follow · TP 75th · SL≈open (Phase-6 race) | −0.012% | −0.74 |
| follow · TP 75th · SL 1.5 | −0.009% | −0.53 |
| follow · run-to-close · SL 1.0 | −0.010% | −0.39 |
| **fade · OC-median (textbook)** | **−0.042%** | **−2.7** |

Every follow config lands slightly negative after cost; the textbook FADE is clearly negative.

**The placebo is the real finding.** Shuffling each day's 1-min returns destroys serial
correlation but keeps the fat-tailed marginal. Real vs placebo (OOS mean/trade):

| config | REAL | PLACEBO | Δ |
|---|---|---|---|
| follow·75th·slOpen | −0.012% | −0.022% | **+0.010%** |
| follow·75th·sl1.5  | −0.009% | −0.022% | **+0.013%** |

The real path beats the shuffle by ~+0.01%/trade, consistently IS+OOS → **the median
continuation is genuine serial MOMENTUM, not a fat-tail artifact** (Phase-6 caveat #1
resolved in the signal's favour). Also a lookahead sanity check: a leaky engine would
inflate the placebo too; instead real cleanly beats placebo by a sensible small margin.

**Honest conclusion (not null, not standalone-tradeable):** the continuation is REAL and
FOLLOW beats FADE decisively — so the median's directional answer is unambiguous: continue,
never fade. But the ~+0.01%/trade momentum edge is ≈ the transaction cost, so as a standalone
intraday breakout scalp it nets slightly negative — the entry slippage eats it. Its honest
use is a **directional filter / confidence input** (bias continuation at the median, don't
fade) applied where you're NOT paying fresh breakout slippage (an existing position / the
trend book), NOT a standalone entry.

**Pivot — to lift a real-but-sub-cost edge over costs:** (1) an **OU half-life** estimator
to isolate the subset of median tags with low reversion speed (strong drift) that clears
cost; (2) **dealer gamma** (the actual fade-vs-extend mechanism — negative γ extends,
positive γ pins) as the regime selector, options-data-gated. Run `python3
costed_median_follow.py` (add `placebo` for the shuffle control).

## Phase 8 — can OU half-life or jumps rescue the sub-cost follow? (`median_follow_conditioned.py`)

Phase-7 left the median follow real-but-sub-cost. Averages hide subsets, so this conditions
the costed follow on two causal, pre-tag theory estimators the owner asked to test:
- **OU half-life** — AR(1) φ of log(close)−log(sessionVWAP) up to the fill; half-life =
  −ln2/ln(φ). Hypothesis: long half-life (trending) → follow clears cost.
- **Jump fraction (bipower)** — max(RV−BV,0)/RV on the pre-tag 1-min returns. Was the tag
  a jump (news) or a diffusive grind?

**Result — NULL pooled (both).** OU half-life: OOS terciles −0.010/−0.016/−0.010% (flat, all
sub-cost) and IS/OOS DISAGREE on the best bucket (IS says low-half-life is best, the opposite
of the hypothesis). A one-pair EURUSD positive (hi-bucket +0.003% OOS) did NOT replicate —
subset noise. Jump fraction: high-jump tags follow *worse* (OOS −0.025% vs −0.009%),
consistently — a real mild "jumps to the median overshoot and revert" pattern, but it doesn't
help the follow and every bucket stays sub-cost.

**So the FX-spot median angle is now thoroughly explored (Phases 6–8):** the continuation is
genuine momentum (Phase-7 placebo) but sub-cost as a standalone trade, and neither reversion-
speed nor jumpiness isolates a cost-clearing subset. Its honest use stays a **directional
filter** (follow > fade at the median), not an entry. The one mild pointer for further work:
high-jump tags *revert* — a jump-gated FADE (not follow) is the one cheap FX check left.
The genuinely different untried lever is options/gamma/VRP — but per the repo audit that data
is **index/gold, snapshot, not FX-backtestable** (`js/gammaFlow.js`/`ivMetrics.js`/`oi_bot`
say so), so it's a forward/live NQ effort, not a historical FX backtest. Run `python3
median_follow_conditioned.py`.

## Phase 9 — multi-timeframe VuManChu divergence agreement (`mtf_divergence.py`)

The owner's question: does a WaveTrend regular divergence that AGREES on a lower AND higher
timeframe beat the single-TF divergence? Faithful to the operator's TradingView VuManChu —
**wt2 at 9/12/3, OB/OS 45/−65, 5-bar fractal, regular (reversal/fade) divergences** — and
the WaveTrend port is **cross-checked bit-for-bit against `js/vumanchuCore.computeWaveTrend`**
(max |Py−JS| = 6e-13; `mtf_divergence.py crosscheck` + `wt_crosscheck.mjs`). Standalone
divergence fade (entry at the confirmable bar r+reach, SL=swing, TP=2·risk, costed,
first-touch, IS/OOS, one position at a time; a min-stop filter drops degenerate tiny-risk
setups whose cost-in-R explodes). MTF gate = require a same-bias regular divergence active
on the HTF within a 5-HTF-bar window.

**Result — NULL (pre-registered bar: MTF exp(R) > 0 OOS AND beats single-TF):**

| pooled FX | single-TF OOS | MTF (LTF+HTF) OOS |
|---|---|---|
| M5 + M15 | −0.158R (n=5532) | −0.234R (n=106) |
| M15 + H1 | −0.162R (n=2316) | −0.462R (n=41) |

The single-TF divergence fade is a consistent modest loser — win ~33% = exactly the RR-2
break-even, i.e. the divergence carries ~**zero directional edge**, cost tips it negative.
MTF agreement **fails the bar on both pairings**: negative OOS, worse than single-TF, on
samples that collapse to ~40–100 trades (strict two-TF agreement is rare). M5+M15 IS looked
near-breakeven (−0.03R) but OOS was −0.23R — IS/OOS disagree = small-sample noise, not edge.

Consistent with the rest of the VuManChu work (single-TF gate null in `poiReactionV1Engine`
Stage 3 / `vumanchuFadeEngine`; the operator's own docs say the scripted auto-divergence
isn't the edge; money-flow — a VuManChu leg — is unreliable on FX with no real volume).
**Untested variant left:** HIDDEN divergence (continuation/follow) MTF agreement — a
different signal, but the sample would be similarly thin. Run `python3 mtf_divergence.py`.

## Phase 10 — can our two REAL signals, combined, make the level a tradeable entry? (`median_follow_gated.py`, `jump_gated_fade.py`)

The owner's core goal restated: *"confidence around a level — should I enter, and which
direction?"* Two of our own signals are real and OOS-validated but each is sub-tradeable
alone, so this phase GATES one with the other (Phase-3's verdict said a classification win
must be *sized/gated onto* an existing edge, not traded raw):

- **Environment-gated median decision (`median_follow_gated.py`).** Use the Phase-3
  transparent expansion rule (prior day blew its 75th **OR** σ accelerating >1.10 — causal,
  pre-session) to pick the direction at the median tag: EXPANSION-lean day → **FOLLOW**
  (continuation likely), CONTAINED day → **FADE** (range-bound). Pure gate overlay on the
  vetted `costed_median_follow` primitives.

  **Result — NULL (6 majors, ~11k trades).** Follow-on-expansion OOS **−0.0117%** (WORSE
  than ungated **−0.0090%**); fade-on-contained OOS **−0.0412%** (≈ ungated, still deeply
  negative); combined rule **−0.0304%** OOS; only **1/6** majors pass, 0/6 fade, 0/6 combo.
  The tell: follow-on-expansion has a *higher* win rate (65.4% vs 63.5%) but a *worse* mean —
  the classifier predicts **magnitude**, and a big-range day delivers bigger losses
  (whipsaws) as readily as bigger wins. Magnitude does not buy direction. Confirms the
  running theme: *magnitude/state → environment → execution*, never direction-at-the-level.

- **Jump-gated fade (`jump_gated_fade.py`).** The last cheap FX lever Phase-8 flagged
  ("high-jump tags revert"). Bucket the costed median FADE by pre-tag bipower jump fraction.

  **Result — NULL (6 majors).** EURUSD alone showed the right sign (HI-jump fade 54% win vs
  48%, less negative) — but it did NOT replicate: pooled OOS HI-jump **−0.0466%** ≈ LO
  **−0.0467%** (flat), **0/6** majors. Single-pair noise, not a cross-sectional effect.

**What Phase 10 settles.** Every *cheap, in-sandbox* conditioner is now exhausted —
distance, velocity, VWAP-stretch, time-normalization, OU half-life, jumps, MTF divergence,
and environment-gating — all NULL after costs. **The level is a magnitude/context tool, not
a standalone directional entry.** The honest "confidence at a level" the data supports:
*break-vs-hold context* (real, ship it) and a weak *continue-not-fade* directional lean at
the median (a filter, applied where you're not paying fresh entry cost — an existing
position / the trend book — never a standalone trigger). The genuinely different untried
levers are data-gated builds, not bolt-ons: **options/gamma/VRP** (index/gold, forward/live —
not FX-backtestable per the repo audit) and **day-level macro-state** (yields/DXY/credit/COT,
release-cadence-respecting). Run `python3 median_follow_gated.py` / `python3 jump_gated_fade.py`.

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
- `median_tag_decision.py` — Phase-6 fade-vs-follow DECISION at the median line: race to the 75th (follow) vs back to open (fade) with σ-expectancy, budget-at-tag buckets, IS/OOS, 6 majors, vs the 77% gambler's-ruin null. Run `python3 median_tag_decision.py`.
- `costed_median_follow.py` — Phase-7 the COSTED follow-vs-fade on dynamic lines (real fills + spread + slippage, exit grid, IS/OOS) + a shuffled-returns placebo proving the continuation is momentum not fat-tail. Run `python3 costed_median_follow.py` (add `placebo`).
- `median_follow_conditioned.py` — Phase-8 conditions the costed follow on OU half-life & jump fraction (bipower), pre-tag & causal, IS/OOS pooled FX — both NULL (no cost-clearing subset). Run `python3 median_follow_conditioned.py`.
- `mtf_divergence.py` — Phase-9 multi-timeframe VuManChu regular-divergence agreement (WaveTrend cross-checked bit-for-bit vs `js/vumanchuCore`), costed fade, IS/OOS — NULL. Run `python3 mtf_divergence.py` (`crosscheck` for the JS parity guard).
- `median_follow_gated.py` — Phase-10 gates the median DECISION by the Phase-3 causal expansion rule (EXPANSION→follow / CONTAINED→fade), reusing the Phase-7 costed primitives, IS/OOS, 6 majors — NULL (magnitude doesn't buy direction). Run `python3 median_follow_gated.py`.
- `jump_gated_fade.py` — Phase-10b the last cheap FX lever: bucket the costed median FADE by pre-tag bipower jump fraction (Phase-8's "high-jump reverts" pointer), IS/OOS, 6 majors — NULL (didn't replicate past EURUSD). Run `python3 jump_gated_fade.py`.
- `analysis-book.html` — human-readable write-up of every phase with charts + explanations.
- `summary.json` / `forecast_vs_fade_summary.json` — headline stats.
