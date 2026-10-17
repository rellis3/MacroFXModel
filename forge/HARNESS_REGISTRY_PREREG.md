# Unified study harness, and deflating the registry it will re-score

*Pre-registered 2026-10-17, before the harness exists and before any registry entry has been re-scored.
Step 2 of `plans/QUANT_SYSTEM_BUILD_PLAN.md`. Part A is a specification; Part B is a test with a prediction
stated in advance.*

## Part A — the harness (specification, not a test)

One entry point, `js/harness/runStudy.mjs`, that every later study calls. Studies that bypass it are not
eligible for `deskEvidence.js`.

```
runStudy({
  id, universe, horizonDays, rebalanceDays,
  signal: (featuresAt, t, inst) => number | null,      // from js/harness/features.mjs only
  sample: { from, to, isEnd },                          // IS/OOS split fixed in the prereg
  cells: [...],                                         // every variant that will be reported
})
```

Fixed inside the harness, not per study:

| concern | rule | why fixed |
|---|---|---|
| position scaling | vol-target 10% annualised per instrument, 60-day EWMA of daily returns (`fxFactorSignals.ewmaVolSeries`) | a Sharpe compared across studies needs one scaling |
| costs | round-trip spread from `/api/spread-profile` at the study's entry hour (26 FX + gold); indices flagged *unmeasured* and charged the worst measured FX pair | measured on this desk, not assumed |
| carry / roll | OANDA D1 is CFD mid: carry accrued explicitly from the rate leg; no roll | the trend study found this understates costs |
| bootstrap | **block bootstrap by week** (`statsCore.blockBootstrapIC`, meanBlock = 5 trading days × ceil(horizonDays / 5)), 1,000 draws, seeded | the COT factor test's block resampled neighbouring instruments, not weeks, and flattered itself |
| cross-instrument dependence | rows pooled across instruments are clustered by date before bootstrapping; the seven USD pairs are reported with an effective-N haircut (PCA share of the dollar factor on that window) | seven FX legs are largely one dollar trade |
| walk-forward | expanding window, minimum 2 years IS, refit at each calendar year | — |
| multiple cells | BH-FDR at 10% across all cells a study reports | a study reports every cell it ran |
| Sharpe-type results | deflated Sharpe (Bailey & López de Prado) with N = number of cells + 1; **PBO** by CSCV (16 splits) for any study with a tuned parameter | — |
| output | one object → one `deskEvidence.js` entry + one `POWER` row, written by the harness, not by hand | the ledger stops depending on transcription |

Reuses, not rewrites: `statsCore` (rankIC, blockBootstrapIC, rollingZ), `fxFactorSignals` (EWMAC,
vol, combineForecasts), `trendFollowEngine` (vol targeting), `multiFactorEngine.combineFactors`.

**Done when:** `runStudy` reproduces, to within bootstrap noise, two existing banked results run
through it — `cot-positioning-factor` (expected: still FAIL, with a *larger* p than 0.0936 once the
block is by week) and `yield-spread-sleeve` (expected: still PASS). If either flips, the harness is
wrong, not the entry.

## Part B — registry deflation

### Question

Of the 36 entries marked `validated` in `js/deskEvidence.js` on 2026-10-17, how many survive when the
whole registry is treated as one experiment?

### Why this is needed

155 pre-registered tests. Each cleared its own bar. None was corrected for the others. With
roughly 20% of a registry validating, some of the validated are the ones that would validate by
chance at those bars; the registry does not currently say which.

### Method (frozen)

1. For every entry with a reported p-value or CI, extract p (or convert the CI to a two-sided p at
   the reported interval level). Entries with neither are listed as *not deflatable* and kept at
   their current status with that label.
2. **BH-FDR at 10% across all extractable p-values in the registry** — one family, 155 wide. Record
   the BH threshold.
3. For entries whose headline is a Sharpe or PF (sleeves, trend, blend): deflated Sharpe with N =
   the number of cells in that entry's own pre-registration (from the `doc` it cites), and PBO
   where the prereg tuned anything.
4. Apply the **Part A harness** to the subset that can be re-run from local data (the price,
   volatility and positioning families; the macro family depends on step 1). Report the re-run p
   beside the banked p.

### Bars (frozen)

An entry **keeps** `validated` if **all** of:
- it survives registry-wide BH at 10%, **and**
- where Sharpe-based, DSR ≥ 0.95, **and**
- where re-run through the harness, the re-run clears the entry's own original bar.

Otherwise it becomes `context` with a new field `deflated: { from: 'validated', why }`. Nothing is
deleted and no `use:` text changes; the page's citation of it changes from VALIDATED to BASE RATE.

### Prediction, stated before running

**Between 3 and 8 of the 36 lose `validated`.** The ones at greatest risk are single-cell results
with p in [0.01, 0.05] and no replication (both OOS halves, or a second instrument). The ones
expected to survive comfortably: `surprise-size`, `gex-range`, `vix-inversion`, `vol-curve-front`,
`yield-spread-sleeve`, the vol-forecast calibration entries — each has either a replication across
instruments or years, or a p below 0.001.

If **fewer than 3** lose status, the bars in use were already conservative and the registry is
cleaner than the base rate suggests — a result worth stating. If **more than 12** lose status, the
registry's bars have been too loose and every page citation of VALIDATED is suspect until re-cut;
that outcome blocks step 3 and 4 from citing any entry not on the surviving list.

### Stopping rule

The surviving list is the only list `citable()` reports as VALIDATED from then on. There is no
second pass with looser bars.

### What changes on the page

`deskEvidence.citable()` gains the deflation flag; the proposal page's evidence pills read from it;
the AI prompts' ledger block carries `deflated:` lines. Nothing else.
