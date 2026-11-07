# Statistics defaults

These are the defaults a prereg uses unless it says otherwise and why. Helpers: `js/preregStats.js` (`mdeMeanDiff`,
`mdeFromCI`, `mdeProportion`, `nForMde`, `powerVerdict`, `pFromCI`, `holm`, `benjaminiHochberg`, `chanceBaseline`).

## Uncertainty

- **Date-clustered (session) block bootstrap**: B = 2000 for a final run (1000 is fine while debugging). Block = the
  outcome horizon or 20 sessions, whichever is longer; a month block (≈ 21 sessions) for daily-or-slower studies.
- **Cluster by date across instruments.** Cross-instrument σ errors correlate ~0.47, so 28 instruments a day are ~2.1
  independent observations (`plans/SEARCH_BREADTH.md`). Pooling instruments as independent overstates the evidence
  ~3.7×.
- **Seed**: one per study, the prereg date as YYYYMMDD, in the prereg header and `results.json`. Studies through
  `js/harness/runStudy.mjs` use its fixed seed (`0x9e3779b9`, `js/harness/stats.mjs`). Never unseeded `Math.random`,
  and never a different seed per script.

## Multiplicity and power (from the template)

- Holm α = 0.05 on the scored cells; BH q = 0.10 on disaggregation cells, with `chanceBaseline`. A slice that
  survives BH is a candidate for its own prereg, never a result.
- Write the MDE for every scored cell before running. If MDE > the pass bar, the cell is UNDERPOWERED by design. An
  underpowered cell that comes back empty is `UNDERPOWERED`, never `NULL`.
- Best-of-N: E[max of 4 noise variants] ≈ 1.03 SE. Count every variant you tried.
- **Promotion to anything live needs |t| ≥ 3** on the scored cell. `validated` at |t| ≥ 2 stays research-only until
  it clears 3 or passes a forward test.

## Holdouts

- The lockbox (`forge/LOCKBOX_PROTOCOL.md`): sessions after **2026-08-21** are H-A, and nothing scores layers 3, 5 or 6
  on them. The one evaluation is `python -m forge.lockbox_check --evaluate` at ≥ 60 sessions. See `data-rules` for the
  BST-safe truncation.
- Otherwise use a chronological IS/OOS split, fixed in the prereg and opened once. A conjunctive gate ("both halves",
  "every instrument") needs no further correction.

## Controls that should be routine

- A **placebo** (shifted dates or matched non-events) whose mean is near zero. A placebo far from zero means the
  design is biased, not that the result is real.
- A **time shift** (±1 bar/session) for anything that claims a lead.
- A **scheduled-news baseline** for any volatility effect.
- **Concentration**: by year, without the top 1% of days, and the most recent 1–3 years alone.
- **Costs on**, MAE from the real M1 path, and count what didn't resolve rather than dropping it.

## Lessons (append here, dated)

- 2026-10-14…18 (rates / Nasdaq / FX work, from `cog-knowledge`):
  - Matched controls drawn away from every event were all quiet bars and made event bars look busy (placebo mean
    +0.069). Exclude only the event's own neighbourhood.
  - **Read the registered gates against the verdict code before reading any result.** Two verdict scripts skipped a
    registered gate; both were caught by rereading the prereg, not by the numbers.
  - A volatility win needs a scheduled-news baseline. With a release calendar in the baseline, a 2-hour volatility gain
    fell to about zero.
  - Price a search with a selection-aware placebo: rerun selection + OOS scoring on shifted series; the real survivor
    count must beat that distribution.
  - IBKR stamps 1-minute bars by their start, so a right-closed 15-minute bar holds one minute past its label. Report
    the bar convention as a sensitivity.
  - Same-day is not forward: sign-stable same-day links had ~0.025 forward correlation. Use them for attribution only.
- 2026-10-18: a result file said "NULL by the registered rule — and the harness says the test is underpowered". That
  is `UNDERPOWERED`. Decide the word from the power table, not the point estimate.
- 2026-10-21: a **single label-shift placebo with a fixed bar** is not a test. `gex-range` re-run: the +125-row shift came out at +0.125 against a 0.03 bar, while 130 shifts averaged −0.013 with sd 0.062, so the bar was half the placebo's own noise and passes < 50% of the time with no effect. Gate placebos on the real value's percentile in the all-shift (or permutation) distribution, and check the bar against that distribution's sd before registering. Also from that study: when a positioning state follows price moves (short gamma follows falls), control trailing return and drawdown, or the leverage effect is credited to the positioning (it was ~60% of the ES number).
- 2026-10-21 (yield-predictive-ladder): a power table that assumes an ideal IC test overstates the power of a *shrunk model*. Cross-validated ridge on daily returns chose maximum shrinkage (lambda 1000) and recovered a planted rho 0.10 feature as forecast IC ~0.05, and missed 0.05 entirely. **Run a planted-signal positive control on the exact pipeline BEFORE registering its MDE.** Also check print clocks before reading any lag +1: a noon FX fix against 15:30 yields makes the same-day link look like a one-day lead.
- 2026-10-24 (macro-confluence-rerun): a multi-instrument script built its date spine from EURUSD and read every other instrument at the same **row position** (`L.bars[i]`); the date map was built and never used. FX weekend rows and exchange holidays put SPX500 ~16 months and GOLD ~4 months off at the start, so three banked studies scored those cells at the wrong dates. Join each series to the spine **by date**, and assert `bars[i].date === dates[i]` (or count misses) before reading an outcome. Also: before re-running a banked study on substitute data, reproduce the banked output exactly with the old code first (here 0 of 12 cells differed), so any change is the fix and not the data.

- **2026-10-25 (cost-verification, overnight-hold-toolkit).** (1) Fill vs the minute's mid is not a spread measurement when the rows have no order type: market-order entries came out *better* than mid and exits worse, because the strategy's own timing sits inside the minute. Average entry and exit for a bracket; get the spread from the broker feed. (2) A prop-toolkit pass rate is not edge: no-time-limit programs fund a zero-edge copy of the same trades ~20% of the time and its EV can clear the fee, so always report the zero-edge control next to it.

- **2026-11-04 (swing-walk-track): a row-level shuffled control understates the SE when the signal persists within a cluster.** The count-stage MDE came from shuffling the dots row by row; a real dot's offset carries across the nights and expiries of a month, so the real cluster-bootstrap SE was 3x the control's (0.087 vs 0.026) and an anchor ruled POWERED came back UNDERPOWERED. Shuffle whole clusters (permute the dot series between months) for the power table and the placebo, or the placebo percentile reads 100 for any beta above zero.

- **2026-11-04 (fx-short-term-fair-value).** (1) For a slope on a persistent regressor pooled across correlated pairs, the date-cluster block bootstrap understated the null spread: a 21-session block gave SE 0.022 against a Monte-Carlo sd of 0.028 (synthetic correlated random-walk outcomes on the real signal), and one synthetic draw sat 3.8 bootstrap SEs from zero. Take the SE for the power table from such a Monte Carlo (it reads no outcome) and make the MC-null p part of the gate. (2) A fair value refitted on a rolling window soaks a slow true gap into its own coefficients: planted gaps with 60- and 120-day half-lives came through a 250-day refit as ~0-25% of their true closure (0/6 found), a 20-day one at ~30% (6/6 found). Say which half-lives the pipeline can see before reading its null, and never quote the gap's own AR(1) half-life as the time for price to converge (in the real data the gap faded in 9-16 days while price closed ~1% of it).

- **2026-11-07 (swing-walk-heading): a one-draw shuffle proof fails 5% of the time by chance.** `forge/verdict_gate.py` marks a cell INVALID when one shuffle's interval excludes zero. With 10 cells, a false INVALID is more likely than not (two landed here; 0-4 of 40 re-draws exclude zero on every anchor alike). Use many whole-cluster shuffles and pass the spread, as `scripts/swing-walk-heading/score.py` does, or give the `real_beats_all` form. Register that up front: changing it after results is a post-hoc amendment.
