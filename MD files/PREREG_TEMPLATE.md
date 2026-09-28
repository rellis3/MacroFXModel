# <TEST-ID> — <the claim, as a question>

> **Template.** Copy to `MD files/<NAME>_PREREG.md`, fill every section, commit it,
> *then* write the harness. Sections marked **(required)** cannot be left blank or "TBD":
> a pre-registration missing its power or multiplicity section is not a
> pre-registration. The two sections new in this version — **§5 Power** and
> **§6 Multiplicity** — are explained at the bottom, with the numbers behind them.
> Helpers: `js/preregStats.js` (tested: `node js/preregStats.test.mjs`).

**Pre-registered <YYYY-MM-DD>, before the harness was written or run.**

## 1. The claim (required)

Where it comes from (a book, a video, a desk habit, our own ledger) and what it says, in
the source's own words where possible. One claim per document.

## 2. Why it is not already settled (required)

The nearest entries in `js/deskEvidence.js` and why none of them answers this. If a
banked null sits next door, say in one line why this is a different question and not a
re-run of it. **Re-running a banked null in new clothes is not allowed.**

## 3. Definitions, fixed in advance (required)

- **The setup** — the exact trigger, with thresholds, computed without look-ahead.
- **Knowable when?** — publication lags (`PUB_LAG`), the bar on which the signal is
  first known, and the bar on which the outcome window starts.
- **The outcome** — the measured quantity and its units (ATR, bp, hit rate).
- **Instruments** — fixed list, reported separately. Not a basket.
- **The control** — what the setup is compared against, and how it is matched.
- **De-clustering** — how overlapping setups are thinned.
- **Uncertainty** — the interval method (block bootstrap, block length, resamples).
- **Sample** — date span, and the IS/OOS or half-split used for the stability gate.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | … | **Yes / No / Null**, with a size if one is expected |
| … | **THE GATE** — what must hold for a pass (all instruments? both halves?) | |
| … | **THE MIRROR** — the opposite-sign setup, if one exists | |

## 5. Power — what this design can and cannot find (required)

Filled in from the **control sample only** (its SD and the planned setup count). This is
allowed before registering because it never touches a setup outcome.

| Cell | Planned n (after de-clustering) | Outcome SD (control) | Design effect | **MDE** (80% power, the §6 α) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| … | | | | | | POWERED / UNDERPOWERED |

- **MDE** = `mdeMeanDiff({ sd, n1, n2, alpha, deff })`, or `mdeFromCI` when the SE comes
  from a placebo run (control vs control) or the harness's last study on the same data,
  or `mdeProportion` for a hit rate against its base rate.
- **The rule.** If the MDE exceeds the pass bar, the cell is **UNDERPOWERED by design**.
  Either change the design (longer sample, more instruments, lower frequency) *before*
  registering, or run it as a description only. **An underpowered cell that comes back
  empty is recorded as `UNDERPOWERED`, never as `null`** — `driver-roundtrip` (MDE ≈ 0.79
  of a move) and `nowcast-gap-cpi` (43 calls: only a 71% hit rate was findable) are the
  cases this rule exists for.
- **Design effect.** 1 if de-clustering leaves setups independent. Overlapping h-session
  outcome windows that survive de-clustering: use ≈ h.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells** — the cells a pass rests on, listed. Everything else is descriptive
  and carries no pass/fail weight.
- **Family-wise correction on the scored cells** — **Holm** at α = 0.05
  (`holm(pvals, 0.05)`). One scored cell: no correction needed. A gate that requires
  *every* cell to pass (all instruments AND both halves) is already stricter than Holm;
  write "conjunctive gate, no further correction" and move on.
- **Disaggregation cells** (per-pair, per-regime slices under a pooled result) —
  reported with **Benjamini–Hochberg at q = 0.10** (`benjaminiHochberg`) and their
  chance baseline (`chanceBaseline({ tests, passes })`). A slice that survives BH is a
  *candidate* for its own pre-registration, never a result.
- **Bootstrap intervals → p-values** — where the harness reports intervals, not
  p-values, use `pFromCI` (normal approximation) for the correction, and say so.
- **Promotion bar (live trading, not the ledger)** — anything that will size or gate a
  real position needs **|t| ≥ 3** on its scored cell (Harvey–Liu–Zhu 2016), not 2.
  A ledger `validated` at |t| ≥ 2 stays research-only until it clears 3 or passes a
  forward test.

## 7. What this does NOT test (required)

Direction? Tradability after costs? Cause? Name each thing a reader might wrongly take
from a pass, and say it is out of scope.

## 8. What each verdict changes (required)

- **Pass** → the ledger entry, and what the page / brief / bot does with it.
- **Null** → the ledger entry, and what line the page stops saying.
- **Underpowered** → what data or design would make it testable, or "closed as
  untestable here".

---

## RESULTS — run <YYYY-MM-DD>

*Appended below this line. Nothing above it changes after the run. If a data problem
forces an amendment, add it as a dated **Recorded amendment** block above, stating that
no results were seen, per house precedent.*

---

## Why §5 and §6 exist (the numbers, 2026-09-27)

**Power.** The ledger holds nulls of two kinds that read the same on a page: tests that
could have found a tradeable effect and didn't (`rates-pivot-lead`: interval ±0.12 ATR,
inside the 0.15 execution gate — a real null), and tests that could only have found a
huge one (`driver-roundtrip`: interval spanning 1.1 of a move). Writing the MDE down
first separates them before anyone is invested in the answer, and stops a thin sample
from closing a question it never had the resolution to answer.

**Multiplicity.** Across the whole ledger on 2026-09-27: 59 scored tests, 19 validated,
against 3 expected by chance at 5% (P ≈ 4×10⁻¹¹). On the macro / events / positioning
domains alone: 29 tests, 6 validated, against 1.45 expected (P ≈ 0.003). Three of the six
are one family (the spread sleeves), so the independent count is nearer 4 — still
above chance. So the ledger as a whole is not noise. The risk sits *inside* individual
tests, where one study scores several instruments, horizons and halves: five cells at
5% give a 23% chance of one false pass. §6 makes each study state its cell count and
correct for it before the run.

Reproduce: `node -e "import('./js/preregStats.js').then(m => console.log(m.chanceBaseline({ tests: 29, passes: 6 })))"`.
