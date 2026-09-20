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

---

## R2 — the regime per currency, and the pair as a regime *differential* (registered 2026-09-20, before running)

The US-only table had no FX tilt, which is what a one-sided label should give:
EUR/USD is not "US goldilocks", it is "US goldilocks *against* euro-area
stagflation". This registers the two-sided version.

**Per-currency labels** (same construction as the US one — rate of change,
z over a trailing ten years, threshold zero, one-month publication lag), on
series validated this week and nothing older:

| currency | growth legs | inflation legs |
|---|---|---|
| USD | as above | as above |
| GBP | −Δ unemployment (3m vs 12m), monthly GDP 3m annualised (ONS) | CPI y/y, core CPI y/y (ONS), scored as 3-month change |
| EUR | −Δ unemployment, GDP q/q held monthly (Eurostat) | HICP y/y, core HICP y/y (Eurostat) |
| CAD | −Δ unemployment, monthly GDP 3m annualised (StatCan) | CPI y/y (from the index), CPI-trim, CPI-median (StatCan) |
| AUD, JPY, CHF, NZD | **no read** — the only free series are stale OECD mirrors | |

**The differential:** for EUR/USD, GBP/USD, USD/CAD each month, the pair of
labels (base, quote). Reported two ways: the full 4×4 grid, and the coarse
split *aligned* (same quadrant) / *diverging* (different quadrant), which is
the notes' "policy-divergence regime".

**Outcomes:** next-month return and next-month range (high−low ÷ price), by
cell, with n and a bootstrap interval, 2007 →.

**What counts:** this is a base-rate table like the US one — no pass bar, no
lean. The one hypothesis worth stating in advance: **diverging months run a
wider range than aligned months** (the notes' claim, restated as range). If the
range difference's interval clears zero it goes on the page as a tested
sentence; direction cells are reported and expected to be no-tilt.

### R2 results (run 2026-09-20; design frozen above before running)

`analysis/regime_pairs_study.mjs`; labels via `regimeCore.currencyRegime`.

**Per-currency labels** (months of history): USD 666 (1971→), GBP 305
(2001→), EUR 212 (2008→, Eurostat's HICP starts 2005 and the ten-year z needs
three years), CAD 271 (2004→). Today: USD goldilocks, GBP goldilocks, EUR
reflation, CAD goldilocks. Shares are balanced within each (each quadrant
15–30%), so the construction is not degenerate on any of them.

**The differential — NULL on all four pairs.** Next-month range and return,
aligned vs diverging months, 2008 →:

| pair | aligned n · range · ret | diverging n · range · ret | range diff [95%] | return diff [95%] |
|---|---|---|---|---|
| EUR/USD | 70 · 3.79% · +0.04% | 142 · 3.81% · −0.15% | +0.03pp [−0.48, +0.52] | −0.19pp [−0.93, +0.60] |
| GBP/USD | 79 · 4.23% · +0.26% | 134 · 3.90% · −0.25% | −0.33pp [−0.86, +0.23] | −0.51pp [−1.18, +0.16] |
| USD/CAD | 88 · 3.51% · +0.05% | 125 · 3.42% · +0.06% | −0.09pp [−0.53, +0.33] | +0.01pp [−0.65, +0.63] |
| EUR/GBP | 93 · 3.30% · −0.16% | 119 · 3.19% · +0.03% | −0.11pp [−0.54, +0.32] | +0.19pp [−0.31, +0.76] |

The notes' "policy-divergence regime" does not show up as wider months or as
a tilt on this construction. The per-currency labels ship as description
(regime.html "By currency", the pair's backdrop line in the drawer's Why tab),
with the null printed beside them.
