# Pre-registration — does the gamma-weighted full book (the "ripple") read the tape better than the book the bots trade?

**Written 2026-10-15, before any result below was computed. Frozen once committed.**

## Why this test exists

- 2026-07-31 (`857cdcdb`) added full-book GEX (every expiry, each option weighted by its own gamma — the *ripple*: near expiry is a tall
  narrow spike, far expiry a shorter, much wider plateau) as **analysis-only**: "the traded PIN/BREAKOUT regime stays on the single-expiry number
  until the full-book flip is shown to read the tape better".
- 2026-08-26 (`46cb506d`) and 08-28 (`78b523ae`) applied ripple scoring to the **export** and showed the full-book regime as a cross-check.
- That condition ("shown to read the tape better") was never tested. The nearest evidence, `GEX_RANGE_BROWNIAN_RESULTS.md`, compared a ≤45-DTE
  surface against all expiries (ΔDR vol-matched +0.315 vs +0.225) — on **different day samples** (793 vs 1,516) and with **no ≤3-DTE / day-book
  surface**, which is what the OI bot (shortest expiry) and the OI-Vol bot (≤3 DTE aggregate) actually trade.
- 2026-10-15: both bots trade levels from those short books. On live NQ the heaviest gamma below spot (29,317 and 28,817, mostly later-dated) is not
  traded by either; both trade a 1-DTE wall ~570 pts away. Whether the short books or the ripple book is the better description of the tape is the
  open question.

## Instrument, data, window

NQ only (the one instrument where a gamma→range effect has been supported; FX was MIXED/null in `GEX_FX_CROSSMATCH_RESULTS.md`, so nothing here is
claimed for FX). Source: `OI Data/NAS100_USD.csv` via `oi_research_book/data/cache/contract_level_ffilled_nas100_usd.parquet`
(contract-level OI, forward-filled ≤5 trading days — script 01's own construction, unchanged). Prices: script 01's D1 file (same `rv20_ann`,
`fwd_hi_1d`, `fwd_lo_1d` as scripts 18/19).

**Window 2020-09-04 → 2026-08-21.** Nothing after 2026-08-21 (the H-A lockbox start, `forge/LOCKBOX_PROTOCOL.md`) is scored. Scripts 18/19 ran to
2026-09-04; this test deliberately does not, so its numbers will differ slightly from theirs and are not meant to reproduce them.

## Surfaces (net dealer GEX at date t, gamma at each contract's OWN time-to-expiry, assumed IV = trailing rv20, multiplier 20 — script 01's formula)

| id | scope | what trades it |
|---|---|---|
| S0 | the **day book**: the shortest-DTE expiry with ≥ 500 contracts within ±3% of spot | the OI bot |
| S1 | every expiry with DTE ≤ 3 summed | the OI-Vol bot |
| S2 | DTE ≤ 7 summed | — |
| S3 | DTE ≤ 45 summed (script 01's `near`) | the old G2 read |
| S4 | **all expiries** summed, each at its own gamma (the ripple full book) | proposed |

**Common-day sample:** only days on which S0…S4 all exist. Dropped days are counted and reported, not silently discarded.

## Statistic (unchanged from scripts 18/19)

`DR_{t+1} = ln(hi_{t+1}/lo_{t+1}) / (σ_t · √(8/π))`, σ_t = rv20_ann/√252 (trailing, ends at t). GEX read at t, range at t+1. A surface's
**ΔDR = mean DR on short-gamma days − mean DR on long-gamma days, matched within 5 rv20 strata** (pooled by stratum size) — the vol-matched figure,
because raw ΔDR is diluted by the vol confound (scripts 19). Significance: stationary block bootstrap, mean block 10 days, 10,000 resamples,
**the same resampled day indices for every surface** so differences are paired.

## The primary test (one comparison, fixed now)

**ΔDR(S4) − ΔDR(S0)** on the common days, paired bootstrap 95% CI.

- **RIPPLE BETTER:** difference ≥ **+0.05** and CI excludes 0.
- **RIPPLE WORSE:** difference ≤ **−0.05** and CI excludes 0 (the day book reads range better than the full book).
- **NOT DISTINGUISHABLE:** anything else. Not a licence to re-cut.

The other pairwise differences (S1 vs S0, S2, S3 vs S4, …) are **descriptive**, reported with CIs, and not used for a verdict.

## Secondary (reported either way)

1. Each surface's own ΔDR against the earlier bars: SUPPORTED needs ΔDR ≥ +0.05 and p < 0.05; the operational bar is ΔDR ≥ +0.10.
2. **Does S4 add information beyond S0?** Four-cell table on common days (both short / S0-short only / S4-short only / both long): mean DR and n per cell.
3. Continuous version: Spearman of `net GEX / Σ|GEX|` against DR within rv20 strata, per surface.
4. By calendar year, so one year cannot carry the result.

## Harness gates (must pass before any surface's number is believed)

1. **Placebo:** circular-shift each surface's GEX series by +125 trading days; |ΔDR| must be < 0.05.
2. **Injection control** (script 19's, since the |return| control was shown to be mis-specified): multiply a random half of DR by 1.15 and recover it.
3. **No lookahead:** perturbing all prices after t+1 leaves DR_{t+1} unchanged.
4. A surface with < 400 common days is reported as unjudgeable, not as a result.

## What this does NOT decide

- It says nothing about **wall reaction**; that is the second, separate test below.
- It says nothing about direction. The directional layer is already falsified (`gex-range` use line).
- Even a RIPPLE BETTER verdict supports using the full-book regime as the **range statement** on NQ. It is not evidence that a trade at a ripple level
  has edge, and nothing here changes a live bot.

---

## Second test — are ripple-weighted walls reacted to more than neighbouring strikes?

Frozen with the above. Same detector and placebo discipline as `WALL_PLACEBO_PREREG.md` (script 05's `detect_touch_events`, same buffers, T-1 lag,
approach side; placebo = listed strikes ±1 and ±2 steps (100 pts on NQ), same days, dropped if within half a step of the opposite wall).

**Wall definitions, per day (reachable side of spot only, within ±2.5% of spot, one call wall above and one put wall below):**

- **W_oi:** the strike with the most open interest in S1 (≤3 DTE) — what the OI-tier / OI-Vol short book would pick.
- **W_ripple:** the strike with the largest |gamma| (call side for calls, put side for puts) in S4 — the ripple full book.

**Test:** break rate of each wall minus the grid placebo's, per side, at 15 / 60 / 240 minutes; 95% CI by cluster bootstrap over ISO weeks, 2,000
reps. PASS (a wall-specific effect) needs, at 15 min, difference ≤ −3 pp with the CI excluding 0 on **both** sides — the earlier bar, unchanged.
Also reported: **W_ripple − W_oi** break-rate difference.

Prior: the OI wall result failed this test on 7 instruments (`WALL_PLACEBO_PREREG.md` RESULTS). The expectation here is a **null**; a pass would be
a surprise and would be checked for the same detector artefact before being believed.

M1 prices: `VolRangeForecaster/data/m1/nas100_usd_m1.parquet` (ends ~2026-08-21 — inside the lockbox by construction).
