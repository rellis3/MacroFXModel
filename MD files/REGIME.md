# The regime screen — growth × inflation, on this desk's data

*Registered 2026-09-19 before running. From `education/macro-deep-dives-notes.md`
§1.3–1.6, rebuilt here rather than quoted: the notes' asset-by-regime table is
1970–2024 on someone else's data; ours is 2006–2026 on ours, with intervals.*

This is a **description**, not a claim: a monthly label for the macro backdrop,
the base rates of what each asset did in each label, and the transition tells.
Nothing here predicts a pair's next move; the tests that say direction is not
learnable stand.

## Construction (frozen)

Monthly, from FRED, no key needed (fredgraph.csv):

- **Growth composite** = mean of four z-scores (each over a trailing 10-year
  window): CFNAI 3-month average; −Δlog initial claims (3-month mean vs
  12-month mean); industrial production 3-month annualised change; payroll
  3-month annualised change. **Growth score** = the composite's 3-month mean
  minus its 12-month mean (rate of change, as the notes insist: an ISM of 55
  falling from 60 is deteriorating growth).
- **Inflation composite** = mean of z-scores of core CPI 3-month annualised,
  core PCE 3-month annualised, and the 5-year breakeven level (from 2003; the
  composite uses what exists). **Inflation score** = the composite's 3-month
  change.
- **Regime** = sign(growth score) × sign(inflation score): rising/falling growth
  × rising/falling inflation → goldilocks, reflation, stagflation, deflation.
  Threshold zero. A regime label is assigned to a month using data *published
  by* that month (release lag one month for CPI/PCE/INDPRO/payrolls, one
  month for CFNAI; claims weekly) — no look-ahead.

## What is measured

1. **Time in each regime** since 2006, and the run lengths (median months per
   spell; how often a spell lasts under three months, which is noise).
2. **Next-month returns by regime** for SPX500, Nasdaq, gold, the 10-year
   Treasury (price), the broad dollar, WTI, copper, EUR/USD, USD/JPY, AUD/USD:
   mean and median monthly return, share positive, with an ISO-month block
   bootstrap interval (1000 reps); n per cell (expect ~40–90).
3. **Realised volatility by regime** (the thing this desk has shown is
   learnable): mean monthly range/ATR by regime.
4. **Transitions**: the four moves the notes name, how many happened, the
   median months they took, and whether the notes' early-warning tells (credit
   spreads widening, breakevens falling, PMIs rolling) preceded them — as
   counts, no claim.

## Pass / what it changes

There is no pass: it is a base-rate table. It changes the page only as
context: a regime line in the brief and a `regime` node at the top of the
chain (*"Reflation, 3rd month; the fast exit is stagflation→deflation and its
tell is credit, which is quiet"*), each number carrying its n and interval.
If a cell's interval spans zero it is shown as "no tilt".

---

## Results (run 2026-09-19; construction frozen above before running)

`analysis/regime_study.mjs` → `analysis/output/regime.json`; `js/regimeCore.js`
is the labeller the server runs daily; `regime.html` is the screen.

**The labels are choppy, as a zero-threshold momentum rule must be.** 666
months since 1971-04: goldilocks 23%, reflation 24%, stagflation 27%,
deflation 26%. 250 spells, median length 3 months, half under three. The page
says so and asks the reader to watch the direction of travel over several
months. A confirmation rule (two months, or a dead band) is a follow-up
registration, not a tweak to this one.

**The asset table, 2007 → 2026, next-month returns with bootstrap intervals
(n per cell 48–70):**

| | goldilocks | reflation | stagflation | deflation |
|---|---|---|---|---|
| S&P 500 | **+1.2%** [0.3, 2.0] | **+1.5%** [0.5, 2.5] | +0.2% | +0.3% |
| Nasdaq | **+1.4%** [0.3, 2.4] | **+2.4%** [1.1, 3.8] | +0.3% | +1.0% |
| Gold | +0.5% | −0.4% | +0.5% | **+2.3%** [1.1, 3.4] |
| 10-year (price), copper, oil, dollar, EUR/USD, USD/JPY, AUD/USD | no tilt in any label |

**Ranges** (mean monthly high−low as % of price) are widest in stagflation for
every market — S&P 8.4% vs 6.0% in goldilocks, Nasdaq 10.0% vs 7.6%, oil 16% vs
11.5% — the range finding again, and the part of this table worth acting on.

**Transitions observed:** goldilocks→reflation 33×, stagflation→deflation 38×
(the notes' "fast, credit-led" move; the prior spell here ran a median of 3
months), reflation→stagflation 9×, deflation→goldilocks 5×.

**What shipped:** the screen; `/api/regime` (labels recomputed daily from FRED,
table from the study); one line on today.html above the desk watch — *"Regime:
Goldilocks, month 5 — growth improving, inflation easing. In this backdrop
since 2007: S&P ↑ (+1.2%/mo, n=56), Nasdaq ↑; the rest no tilt. The usual next
move is reflation; its tell is wages, commodities, breakevens."* Context; the FX
cells are no-tilt, which is the desk's standing result restated.
