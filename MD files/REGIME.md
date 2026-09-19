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
