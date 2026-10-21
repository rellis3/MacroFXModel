# gex-range-es — results

Prereg: `oi_research_book/GEX_RANGE_ES_PREREG.md` (committed in `6740bac2`, 2026-10-20, pushed before any ES outcome
existed). Run 2026-10-21, seed 20261020, B = 10,000. Branch `main`. Ledger ids: `gex-range-es` (Q1, new), `gex-range`
(Q2, re-run in place). Scripts: `scripts/27a_nyclose_sessions.py`, `scripts/27_gex_range_es.py`,
`scripts/27b_gex_range_es_posthoc.py`. Outputs: `data/results/gex_range_es.json`, `data/results/gex_range_es_posthoc.json`.

## Verdicts

- **Q1 ES: VALIDATED** as registered. Vol-matched ΔDR **+0.377** [+0.237, +0.516], Holm p < 0.001, 770 sessions
  (199 short / 571 long gamma), positive on all four spec cells and in both halves, placebo and lookahead checks passed.
  **But see the post-hoc check:** about 60% of it is "the market has recently fallen". With trailing returns and
  drawdown controlled for, the gamma-specific part is **+0.147 [+0.006, +0.289], t 2.05**, below the |t| ≥ 3 bar for
  live use. Research-only.
- **Q2 NQ re-run: UNDERPOWERED** by the registered rule, because the single +125-row placebo came out at +0.125. Every
  other check says the effect is present: vol-matched **+0.288** [+0.176, +0.400], 4/4 cells, both halves, above all
  130 label-shift placebos (their mean −0.013, sd 0.062). The failed check was a badly specified placebo (§Controls),
  not a failed effect, but a post-hoc finding can't promote.

## Scored cells

Honest pipeline: New York-close sessions from OANDA M1, near surface (DTE ≤ 45), `net_gex_sum` sign, OI(D) → session
D+2, σ = 20-session stdev ending D+1. Window: OI dates 2020-11-03 → targets ≤ 2026-08-20 (lockbox).

| Cell | n | S / L | vm ΔDR | 95% CI | MDE (prereg) | Pass bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|---|
| ES near/rv20 | 770 | 199 / 571 | **+0.377** | [+0.237, +0.516] | ~0.15 | +0.05 (+0.10 operational) | < 0.001 | VALIDATED |
| NQ near/rv20 | 770 | 230 / 540 | **+0.288** | [+0.176, +0.400] | ~0.15 | same | < 0.001 | UNDERPOWERED (placebo gate) |

Absolute reading: long-gamma DR 0.928 on ES (vs 1, p 0.026) and 0.893 on NQ (p < 0.001); short-gamma DR 1.136 / 1.078.
"Long gamma is quiet" holds on both, less strongly on ES, where short gamma is also clearly above a random walk.

**Four spec cells (gate needs all positive):**

| | near/rv20 | near/atr14 | all/rv20 | all/atr14 |
|---|---|---|---|---|
| ES | +0.377 | +0.250 | +0.341 | +0.235 |
| NQ | +0.288 | +0.146 | +0.217 | +0.129 |

**Halves (split 2023-08-31):** ES +0.270 / +0.430; NQ +0.221 / +0.419.

## Controls

| Check | ES | NQ |
|---|---|---|
| Placebo, labels shifted +125 rows (registered, \|x\| < 0.03) | −0.006 pass | **+0.125 fail** |
| Placebo, every shift 60…n−60 step 5 (descriptive, 130 shifts) | mean −0.009, sd 0.072; real above 100% | mean −0.013, sd 0.062; real above 100% |
| Injection (+0.15 on short days recovered) | pass | pass |
| No lookahead (prices after target ×1.37, DR unchanged; target opens after OI(D) is public) | pass | pass |

**Why the NQ placebo failed:** a single shift has its own spread of ~0.06, so a bar of 0.03 passes less than half the
time even with no effect present. +0.125 is a ~2-sd draw. The design came from `GEX_RANGE_BROWNIAN_PREREG.md`, where
it was applied to the raw ΔDR (−0.005 there). Lesson added to `stats-defaults.md`.

## Deviations from the prereg

- The registered window ran to targets ≤ 2026-08-21; the local M1 ends 2026-08-20 23:59 UTC, so the last complete
  New York-close session is 2026-08-20. Two rows per instrument lost.
- The ES pull needed four attempts (Databento 504s on 2023/24/26); 2024 and 2026 were fetched in quarterly chunks with
  the pull script's own functions. Coverage: 1,527 dates, the 44 missing weekdays are all exchange holidays.
- Descriptive placebo distribution and the post-hoc file were added after results were seen (Amendment A1).

## Descriptive (not part of the verdict)

**Pipeline ladder (near/rv20, vm ΔDR):**

| | (a) original: UTC D1, OI(D) → next row | (b) NY-close, OI(D) → D+1 | (c) scored: NY-close, OI(D) → D+2 |
|---|---|---|---|
| ES | +0.313 | +0.438 | +0.377 |
| NQ | +0.321 | +0.361 | +0.288 |

The Sunday-stub fault diluted the number; the honest timing costs about a fifth of it. Neither fault created it.

**Post-hoc concentration and confound checks (`27b`, results seen; may only describe or demote):**

- Not carried by a few days: dropping the top 1% of DR days gives ES +0.368 / NQ +0.296; winsorising at p95 +0.352 /
  +0.273. Positive in every year with ≥ 10 short days (ES 2022 +0.33, 2023 +0.18, 2024 +0.36, 2025 +0.14).
- **Short gamma follows falls.** ES short-gamma days: trailing 20-session return −2.7% vs +2.7% on long days; 7.1% below
  the 60-session high vs 1.1%. NQ: −3.4% vs +3.6%; 9.3% vs 2.6%. Falls widen ranges on their own (the leverage effect).
- **With those controlled** (OLS of DR on short + σ-quintile dummies + 5/20-session return + 60-session drawdown, block
  bootstrap B 4000): ES **+0.147 [+0.006, +0.289], t 2.05**, label-shift placebo below it 98% of the time; NQ **+0.165
  [+0.067, +0.263], t 3.31**, 100%. So a gamma-specific part survives on both, at about half the headline size.
- **ES and NQ are not independent votes:** same gamma sign on 82.5% of the 770 dates (147 both short, 52 ES-only, 83
  NQ-only). The ES result is largely the same market state seen through a second book, not a separate confirmation.

## What this changes

- **G2 is not NQ-only.** The same relation shows on ES with near-identical size, so it's an equity-index effect (FX
  remains the exception). Ledger `gex-range-es` validated, research-only.
- **The size people quote is overstated.** Roughly half of "short gamma → wider range" is "the market has fallen →
  wider range". Any page or prompt line should say "long gamma has been quieter than a vol-matched baseline, partly
  because it coincides with rising markets". Don't present +0.3 as the gamma effect.
- **NQ `gex-range` is demoted to underpowered** by its own re-run rule, with the reason in its `use`. The effect is not
  in doubt; the confirming check was badly built. To restore it: a fresh prereg whose placebo gate is the percentile
  of the real value in the all-shift distribution, scored on data the current run hasn't seen (lockbox tail plus
  forward capture), with the drawdown controls as the headline.
- **Next question (own prereg):** does gamma add anything to the shipped SPX500/NQ range lines once trailing returns
  are in them (`one-range-forecast` Q2 found NQ gamma sign added nothing on top of the shipped lines, consistent with
  the lines already absorbing much of this).
- Nothing live changes.
