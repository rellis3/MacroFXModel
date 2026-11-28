# cboe-vol-indices-range — do the untested Cboe vol indices add to the range forecast for their underlying?

**Pre-registered 2026-11-28, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `cboe-vol-indices-range` (family). One ledger id per map × horizon: `cboe-vol-range-<index>-<instrument>-<1d or 5d>`, e.g. `cboe-vol-range-ovx-wti-1d` (30 ids, all `doc` = this file) |
| Branch | `wf2/vol-indices-range` |
| Register row | `plans/RESEARCH_REGISTER.md` → `cboe-vol-indices-range` |
| Data | Cboe closes `analysis/surfaces/cboe/*.csv`. Underlyings: the ladder-v2 walk-forward test frames `analysis/output/ladder-v2-<sym>/test_<track>.parquet` (London 00:00-22:00 sessions, ≥ 600 M1 bars, chosen sigma already forecast-ready) and, for 5-session windows, London sessions rebuilt from the same M1 files ladder-v2 used (`scripts/ladder-v2/ladder.py` `load_m1`/`london_sessions`; futures from the ratio-adjusted continuous file so a roll inside a window is not a range). Test years 2018 → 2026-08-21 (ladder-v2's `YEARS`, lockbox cut at 2026-08-21). Production own-IV for FX: CME settlement ATM 30d (`oi_research_book/data/iv_daily_*.parquet`, 2020-09 →) |
| Seed | `20261128` |
| Uncertainty | moving-block bootstrap over test sessions, block 63 sessions (ladder-v2's block; ≥ 5d horizon), B = 2000 |
| Scripts / outputs | `scripts/cboe-vol-indices-range/` → `analysis/output/cboe-vol-indices-range/` |
| Harness | own script reusing the ladder-v2 walk-forward frames, `forge/vol.py` `fit_width_multiplier` / `pinball_loss` and `forge/run_combined_range.py` `asof_before` / `cboe`, because the benchmark to beat is the ladder-v2 chosen sigma, which only exists in those frames |

## 1. The claim (required)

`plans/DATA_ASSET_MAP.md` §2: "15 of 21 Cboe indices never tested (OVX, VXTLT, SKEW, VXEEM…)"; §4 asks for them "as
context (OVX for oil, VXTLT for bonds, VXEEM for EM, SKEW)". The claim tested: an implied-vol index for an underlying
carries information about that underlying's realised high-low range on the next London session (1d) and over the next
5 sessions (5d) that the repo's current production range forecast does not already hold. Edge source (method lesson
4): forecasting skill. Options price forward-looking vol (scheduled events, supply shocks, auctions) that a trailing
realised estimator only sees after the fact. Nobody is on the other side; this is a forecast-quality question, not a
trade.

## 2. Why it is not already settled (required)

- `combined-range` (validated): own IV ÷ own σ inside the ladder, with VIX for SPX/US30/US2000/DE30/UK100 and VXN for NQ.
  It never used RVX, VXD, OVX, VXSLV, VXTLT or SKEW, and ran on the old yz/ewma ladder.
- `iv-ladder-gold`, `gold-calc-upgrades`: GVZ for gold. GVZ is excluded here (already tested).
- `ladder-v2-rollout` (`ladder-v2-wti`, `-silver`, `-us30`, `-us2000`): OVX, VXSLV, VXD and RVX entered as
  **replacement** arms (V3 = live σ × IV-elasticity, V4 = pure IV, B_har_iv = HAR/IV blend) in a race scored on
  *regime miss* (calibration per σ-fifth). The chosen arms (B_har_garcht, HARCJ, har_rv_log, ewma_090) carry no IV.
  That race asked "which σ is best calibrated", not "does the index add to the winner", and did not score pinball,
  5-day windows or the index's change. This study takes the ladder-v2 winner as given and asks whether the index
  improves it as a removable layer. Different question; not a re-run. (Owner rule: new analysis is not pre-judged by
  that race.)
- SKEW, VXTLT, VXEEM, VXFXI, VXGDX, VXAPL, VXAZN: no ledger entry at all.

## 3. Definitions, fixed in advance (required)

**Maps (family A, direct underlying).** Track C = OANDA CFD, F = NT8 futures.

| Index | Instrument (primary track) | Replication track | Benchmark own-IV layer (production) |
|---|---|---|---|
| OVX | WTI (C) | WTI F (CL) | none (production WTI has no IV) |
| VXSLV | SILVER (C) | SILVER F (SI) | none |
| VXTLT | ZB (F) | — | none |
| VXTLT | ZN (F) | — | none |
| RVX | US2000 (C) | US2000 F (RTY) | VIX |
| VXD | US30 (C) | US30 F (YM) | VIX |
| SKEW | SPX500 (C) | SPX500 F (ES) | VIX |
| SKEW | NQ (C) | NQ F | VXN |

**Maps (family B, cross-asset proxy; no direct underlying held).**

| Index | Instrument (C) | Benchmark own-IV layer |
|---|---|---|
| VXEEM | AUDUSD | CME settlement ATM 30d (aud_usd) |
| VXFXI | AUDUSD | CME settlement ATM 30d (aud_usd) |
| VXGDX | GOLD | GVZ |
| VXAPL | NQ | VXN |
| VXAZN | NQ | VXN |
| OVX | USDCAD | CME settlement ATM 30d (usd_cad) |
| OVX | BRENT | none |

VXEWZ is dropped (no Brazil instrument held). VIX-term, VVIX, VXN and GVZ are out (already tested or in the benchmark).

**Benchmark B (what production would forecast).** σ_b = the ladder-v2 chosen arm for that instrument and track
(`results.json` → `chosen`; NQ C pilot `E6`), already forecast-ready in `test_<track>.parquet`. Where production
applies an own-IV adjustment (table above), B = σ_b × exp(k·(x − μ)), x = log(IV_own/√252 ÷ σ_b), with k, μ fitted on
the training rows exactly as `ladder.py` `fit_k` (ridge λ = 1 on the standardised x). Otherwise B = σ_b.

**Layer L (the thing tested).** σ_L = B × exp(Zβ − mean_train(Zβ)), Z standardised on train, β from ridge (λ = 1) of
y = log(R_h ÷ (B·√h)) (train-demeaned) on Z, train rows only. Two variants, both scored:
- **Lin:** Z = [lvl, d1, d5]. For a vol index lvl = log(index/√252 ÷ B); for SKEW lvl = log(SKEW) (not a vol).
  d1, d5 = 1- and 5-trading-day change in log index, computed on the index's own dates.
- **Ext (extremes):** Z = four 0/1 flags: lvl ≥ train p90, lvl ≤ train p10, d5 ≥ train p90, d5 ≤ train p10.

**Knowable when?** Every index value is the latest Cboe close dated strictly before the London session date
(`asof_before`, `allow_exact_matches=False`): the D−1 16:15 ET close precedes the 00:00 London open of D.

**The outcome.** R_1 = session H-L % of the session open (the frame's `hl`). R_5 = (max high − min low) over sessions
t…t+4 ÷ open of session t, %; a window with a missing session (more than 9 calendar days from t to t+4) is dropped and
counted. Both arms scale σ by √h, and widths absorb the rest.

**Widths and loss.** For each arm and τ ∈ {0.50, 0.75, 0.90}: width = `fit_width_multiplier` on train; prediction =
width × σ·√h; loss = Σ_τ mean pinball(R_h, prediction, τ) over test rows. Cell statistic = loss ratio L ÷ B
(< 1 = the layer helps).

**Walk-forward.** For each test year Y in 2018…2026: train = all rows with every input before 1 Jan Y; test = rows in
Y (≤ 2026-08-21). A year is scored only if train has ≥ 500 rows (so the FX settlement-IV maps start ≈ 2023). For 5d a
train window's last session t+4 must also be before 1 Jan Y.

**Uncertainty.** Moving-block bootstrap over the pooled test rows in date order, block 63, B = 2000, seed 20261128;
ratio of summed losses per draw. 95% percentile CI; one-sided p = share of draws with ratio ≥ 1.

**Positive control (method lesson 1, run before the real cells, same pipeline).** (a) Planted: replace the index
with exp(0.5·log(R_1/B) + N(0, 1)) (a known-informative, lookahead-by-construction feature) on WTI C 1d: the pipeline
must return ratio < 0.97 with CI upper < 1. (b) Known-zero: an index of pure N(0,1) noise: ratio CI must contain 1
and the point must be ≥ 0.995. If either fails, nothing is scored and the pipeline is fixed first.

**Placebo (selection-aware).** For every scored cell, 20 circular shifts of the index series against the sessions by
offsets drawn uniformly in [252, n − 252] (seeded), refit and scored identically. Reported: median and range of the
placebo ratios; the real ratio's rank among the 21.

**Sample.** Halves for stability: 2018-2022 and 2023-2026.08.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | OVX → WTI, VXSLV → SILVER: the index improves next-day range beyond the ladder-v2 winner (which carries no IV) | **Yes, small**: ratio ≈ 0.97-0.99 (GVZ gave gold −2.6% over a realised ladder). Larger on 5d than 1d |
| b | VXTLT → ZB / ZN | **Weak yes on ZB** (duration match), smaller on ZN |
| c | RVX → US2000, VXD → US30 beyond the VIX-adjusted benchmark | **Null-ish**: RVX/VXD are ~0.9 correlated with VIX; expect ratio 0.99-1.00 |
| d | SKEW → SPX500 / NQ | **Null** on range size: SKEW prices tail shape, not variance |
| e | Family B cross-asset | **Null** except possibly OVX → USDCAD / BRENT |
| — | **THE GATE (per map × horizon, either variant)** | VALIDATED needs all of: ratio ≤ **0.985**; 95% CI upper < 1; one-sided p survives **Holm α = 0.05** across the scored cells of its family (A: 8 maps × 2 horizons × 2 variants = 32; B: 7 × 2 × 2 = 28); ratio < 1 in **both halves**; real ratio below at least 19 of the 20 placebo ratios; for maps with a replication track, the same variant's ratio < 1 on that track |
| — | **THE MIRROR** | No sign mirror (range is unsigned). The mirror is the placebo shift: a layer built from the same index at the wrong dates must not help |

**Cell verdicts.** NULL = the 95% CI lower bound > 0.985 (a 1.5% gain is ruled out). CONTEXT = CI upper < 1 and Holm
survives but the point is above 0.985 (real, below the bar), or the gate fails only on the replication track.
UNDERPOWERED = anything else (pass bar inside the CI, or a gate clause fails). Map × horizon verdict: VALIDATED if
either variant is; else CONTEXT if either is; else NULL if both are NULL; else UNDERPOWERED.

## 5. Power — what this design can and cannot find (required)

Sessions per cell ≈ 2,200 (1d, test 2018-2026.08), ≈ 2,200 overlapping 5d windows (≈ 440 independent), FX settlement
maps ≈ 900. With 63-session blocks the effective n is ≈ 35 blocks. Combined-range's pinball ratios moved by 2-10%
between arms on comparable samples; the loss-ratio SE is not known in advance for a fitted layer, so the power is
read from each cell's own bootstrap: **MDE = 2.8 × SE(log ratio)** (`mdeFromCI`). A cell whose MDE > 0.015 (the pass
bar) is UNDERPOWERED by design and can never be NULL, whatever its point. Expected (from the size of daily pinball
noise on 2,000 sessions): MDE ≈ 0.01-0.02 at 1d, ≈ 0.02-0.04 at 5d, so most 5d cells and the FX cells are expected
UNDERPOWERED-by-design; the 1d family A cells are expected near the bar. The power table is written into RESULTS.md
per cell.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** family A 32, family B 28 (above). Holm α = 0.05 within each family on the one-sided bootstrap p.
  The halves / placebo / replication clauses are conjunctive on top (no further correction).
- **Disaggregation (descriptive):** per scored cell, the test days in train-edge buckets lvl ≥ p90, lvl ≤ p10,
  d5 ≥ p90, d5 ≤ p10: ratio L ÷ B and B's p75 exceedance vs 25% in each. BH q = 0.10 across all bucket cells with the
  chance baseline. A survivor is a candidate for its own prereg, never a result.
- Also descriptive: per-τ split (p90 for SKEW especially), per year, the replication-track numbers, the
  family-A primary track run on the F track where both exist.
- Errors correlate across instruments (≈ 0.47 for σ); indices overlap (RVX/VXD/VIX). Holm within family is
  conservative under positive dependence.
- **Promotion bar:** anything that changes a live line needs |t| ≥ 3 on its cell (log ratio ÷ SE) and owner sign-off.

## 7. What this does NOT test (required)

Direction (nothing here says which side of the range; `use` lines will say so). Tradability or costs. Intraday
timing. OH / OL one-sided lines (descriptive only if reported). Weekly/monthly rungs beyond 5 sessions. Cause (an
index may help because it front-runs scheduled events; the scheduled-news baseline is not separated here — stated as
a limit). Whether the index should *replace* σ (ladder-v2 already raced that).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry; a removable "index layer" switch (off by default) on the ladder-v2 shadow for that
  instrument, side by side, after |t| ≥ 3 and owner sign-off. No live calc changes in this study.
- **CONTEXT** → ledger entry; the index may show as context (e.g. "OVX extreme") on the range page, no line change.
- **NULL** → ledger entry; the asset map line moves the index from "never tested" to "tested, adds nothing to range".
- **UNDERPOWERED** → ledger entry with the MDE; what would make it testable (longer history, intraday index,
  forward record).

## Amendments

(none)

---

## RESULTS — run <date>

*Written to `analysis/output/cboe-vol-indices-range/RESULTS.md`.*
