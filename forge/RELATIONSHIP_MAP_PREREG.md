# relationship-map — Which "everyone knows" cross-market relationships move together, which lead, and what follows a big move?

**Pre-registered 2026-11-13, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `relationship-map` (one family: 20 pairs; one ledger entry for the family, the grades per pair in `results.json`) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `relationship-map` |
| Data | Daily closes 2006-01-01 → **2026-08-21** (lockbox end; nothing after is read). Yahoo daily: DXY `DX-Y.NYB`, Brent `BZ=F`, copper `HG=F`, gold `GC=F`/cached `px_GOLD`, S&P 500, Nasdaq 100, EURUSD, USDJPY, AUDUSD, USDCAD (cached `analysis/output/yield_coupling/px_*.csv` where held, same source). FRED daily: 2y, 10y, real 10y, 10y breakeven, 10y-2y slope (cached `yields.csv`). VIX: Cboe `analysis/surfaces/cboe/VIX.csv` |
| Seed | `20261113` |
| Uncertainty | block bootstrap over calendar months (resample the months that hold events, all their events together), B = 2000 |
| Scripts / outputs | `scripts/relationship-map/` → `analysis/output/relationship-map/` |
| Harness | own script (Node): the measures are three simple statistics per pair; it reuses the robust correlation of `js/leadLag.js` |

## 1. Claim

The owner (2026-11-13) wants a live monitor that says "this is building" when relationships the market believes in start
to line up ("DXY sells off, gold buys"; "yields up, VIX down"; "10y up, 2y down, so EURUSD does X"). Before any rule goes
into such a monitor, each believed relationship needs three separate answers, because they are routinely confused:

1. **Together:** do the two move together on the same day, in the believed direction, and is that stable year to year?
2. **Lead:** does A's move today tell you anything about B's move over the following days?
3. **After a big move:** when A makes a large move (|z| ≥ 2), does B over the next 1, 5, 20 days move the believed way
   more than on an ordinary day? (A linear correlation can miss an effect that only exists after large moves.)

The output is a **graded map**, on the Evidence Book's new scale (js/evidenceGrade.js, owner direction 2026-11-13: a null
is not dead), that seeds the monitor's rulebook.

## 2. Why this is not already settled

- `yield_asset_coupling` (2026-08-23, analysis/yield_asset_coupling.py): yields → 8 indices, 7 FX, gold. Same-day coupling
  large, forward IC collapses (median |IC| 0.170 → 0.015). **Linear forward only; no after-big-move conditioning; yields
  only.** This study reuses its design points: skip one day (asynchronous closes), and use the same-day pass as a positive control.
- `/api/lead-lag` (js/leadLag.js, 2026-11-04): 1,892 pairs of 44 OANDA markets, lags 1-5, BH 10%: no lead survived. **Linear,
  no yields/VIX/DXY, no conditioning on move size, no stability by year.** One near miss is registered forward (`spx-usdchf-next-day`); not re-tested here.
- Evidence Book: `rates-pivot-lead` (2y pivots → Nasdaq intraday, null, powered), `yields-to-fx-direction` (RE-RUN pending),
  `gr-us-yields-direction`, `gr-dollar-tape-direction`, `vix-inversion` (validated, range not direction), `rates-spread-asset-lead`.
  None asks the after-big-move question across the believed cross-asset set, and none grades on the new scale.
- This is a **map**, not a strategy: no costs, no trades. A cell that grades Leaning becomes a forward rule candidate, not a result.

## 3. Definitions

**The 20 pairs (frozen).** Believed sign: + means A up goes with B up.

| # | A (leader) | B (follower) | Believed | Folklore |
|---|---|---|---|---|
| P1 | DXY | Gold | − | dollar sells, gold buys |
| P2 | DXY | S&P 500 | − | strong dollar hurts equities |
| P3 | DXY | Copper | − | dollar up, commodities down |
| P4 | US 10y yield | Gold | − | yields up, gold down |
| P5 | US real 10y | Gold | − | real yields drive gold |
| P6 | US 10y yield | Nasdaq 100 | − | rates up, tech down |
| P7 | US 2y yield | USDJPY | + | front-end differential drives yen |
| P8 | US 10y yield | USDJPY | + | long-end differential drives yen |
| P9 | US 2y yield | EURUSD | − | US front end up, euro down |
| P10 | 10y-2y slope | EURUSD | ± (two-sided) | the owner's example: 10y up / 2y down (steepening) → EURUSD does something |
| P11 | VIX | S&P 500 | − | fear up, stocks down |
| P12 | VIX | USDJPY | − | risk-off, yen bid |
| P13 | VIX | AUDUSD | − | risk-off, Aussie sold |
| P14 | VIX | Gold | + | fear, gold bid |
| P15 | S&P 500 | AUDUSD | + | risk-on Aussie |
| P16 | Brent | USDCAD | − | oil up, CAD up |
| P17 | Brent | 10y breakeven | + | oil drives inflation pricing |
| P18 | Copper | AUDUSD | + | Dr Copper, Aussie |
| P19 | Copper | US 10y yield | + | growth, yields |
| P20 | Gold | AUDUSD | + | gold, Aussie |

**Daily change:** log return for prices and VIX; first difference (percentage points) for yields, breakeven and slope.
A date enters only when both A and B have a value that day (pairwise-complete). Window 2006-01-01 → 2026-08-21.

**σ (causal):** each series' standard deviation of daily changes over the **prior** 250 valid days (never including the day).
**z of A on day t** = change(t) / σ(t). A big move = |z| ≥ 2. **De-cluster:** an event needs 5 trading days since the previous one.

**Outcome after day t, horizon h ∈ {1, 5, 20}:** B's change from the close of **t+1** to the close of t+1+h (day t+1 skipped:
asynchronous closes between FRED/Cboe/Yahoo series make t → t+1 partly catch-up), in B's σ units scaled by √h. Signed:
Y = believedSign × sign(A change on t) × outcome. For P10 believedSign = +1 and the grade reads the two-sided result.

**Next day (t → t+1)** is reported as **context only**, labelled "may be close-time catch-up".

## 4. Hypotheses, THE GATE and THE MIRROR

Per pair, three measures:

- **M1 Together:** Spearman correlation of same-day changes, full window and per calendar year; share of years with the believed sign.
  Labels (description, not graded): *reliable* (|r| ≥ 0.20 and believed sign in ≥ 80% of years), *variable* (believed sign in
  50-80% of years or |r| 0.10-0.20), *weak/none* (|r| < 0.10), *opposite* (r the wrong way with |r| ≥ 0.10).
- **M2 Lead (linear):** correlation of A(t) with B over (t+1, t+1+h], h = 5 and 20, and with B(t → t+1) as context.
- **M3 After a big move (primary):** effect = mean Y over events − mean Y over all eligible days, h = 5 primary, 1 and 20 secondary.

**THE GATE for "Leaning" (the highest grade in-sample; "Strong" needs a forward record):** M3 at h = 5 has a 95% CI clear of zero
the believed way, survives BH q = 0.10 across the 20 primary cells, and both halves (2006-2015, 2016-2026-08-21) have the believed sign.

**Grades (js/evidenceGrade.js scale), smallest effect of interest SESOI = 0.10 σ:**
- **Leaning:** passes THE GATE.
- **Faint:** estimate the believed way and (CI clear of zero but fails BH or a half; or ≥ 60% of the CI the believed way).
- **Against:** the CI lies wholly inside ±0.10 σ (a small effect is ruled out), or the CI is clear of zero the wrong way.
- **Untested properly:** fewer than 30 events, or the CI is too wide to tell (none of the above).
- For P10 (two-sided): Leaning/Faint on |effect| with the direction stated; Against only by the ±0.10 rule.

**THE MIRROR (placebo):** the same M3 on 200 random event sets of the same size drawn from the same pair's eligible days
(seed 20261113). The pair's effect is reported with its percentile in that placebo distribution; a Leaning cell must be
above the 95th percentile.

**Positive control (method lesson #1, run first, before any real pair is scored):** on P1's real A series and dates, build a
synthetic B = N(0,1) daily noise plus a planted drift of +0.15 σ per day for the 5 days after each event, in the believed direction.
The pipeline must return an h = 5 effect within 0.05 σ of the planted answer (the planted daily drift summed over 5 days and
scaled by √5: 0.15 × 5 / √5 ≈ 0.335) with a CI clear of zero; and with no drift planted, a CI that covers zero. If either fails,
the run stops and the code is fixed before any real outcome is read. Second positive control: M1 for P11 (VIX vs S&P 500)
must come out strongly negative (known); if not, the data join is broken.

## 5. Power

Computed from A alone before any outcome (allowed): events per pair are expected at roughly 4-5% of days before
de-clustering, about 120-200 after, over ~5,000 days. With outcome Y in σ units (sd ≈ 1), the standard error of the mean
is ≈ 1/√n ≈ 0.07-0.09, so the **minimum detectable effect at 80% power is ≈ 0.20-0.25 σ** per cell. That is larger than the
SESOI of 0.10: many cells will grade **Untested properly**, and that grade is the honest answer for them (not "dead").
The exact event counts and MDE per pair are printed by the run before the outcome table.

## 6. Multiplicity

20 primary cells (M3, h = 5): BH q = 0.10. The 40 secondary cells (h = 1, 20) and M2 are reported with BH within their own
family and can only describe, never set a grade above Faint. M1 is description.

## 7. What it does NOT test

Trading rules, costs, intraday timing, regimes other than the two halves, any series not in the table, anything after
2026-08-21. A Leaning grade is not a signal: it is a candidate for the monitor's rulebook, to be scored forward from the
first day it is wired.

## 8. What each grade changes

- **Leaning:** enters the monitor rulebook as a live rule at its weight; forward-scored from day one.
- **Faint:** enters the rulebook at low weight, shown but never alerted alone; a forward record can raise it.
- **Untested properly:** listed as unknown; a candidate for a better-powered design (intraday data, longer history).
- **Against:** kept in the rulebook as a warning ("widely believed; our data puts it at zero"), with its small weight.
- **M1 *reliable* pairs** become the "out of line" baseline: a day when a reliable pair breaks is itself an alert.

## Amendments

### A1 — 2026-11-13 — PRE-RESULTS
The planted-signal control as written (one run within 0.05 σ of the planted 0.335) is tighter than one run's own sampling
error (~0.08 σ at ~150 events): the first control run gave 0.429 [0.279, 0.576], an interval that covers the planted answer.
The control is now judged on **50 replications**: the mean effect within 0.05 σ of 0.335 and ≥ 80% of replications' CIs clear
of zero (bias and power); with no drift, the mean within 0.05 σ of zero and ≤ 15% of CIs clear of zero (false-positive rate,
allowing for the bootstrap's small-sample width). The VIX/S&P same-day check is unchanged (it passed: r = −0.784).
**No real pair's outcome had been computed** (the script exits before scoring when a control fails).

## RESULTS

(to follow in `analysis/output/relationship-map/RESULTS.md`)
