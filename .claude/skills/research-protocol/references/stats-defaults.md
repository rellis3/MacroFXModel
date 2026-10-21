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
