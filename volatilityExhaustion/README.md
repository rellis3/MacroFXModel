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
- `analysis-book.html` — human-readable write-up of every phase with charts + explanations.
- `summary.json` / `forecast_vs_fade_summary.json` — headline stats.
