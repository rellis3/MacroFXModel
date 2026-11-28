# residual-fx8-carry-forward — does the carry guard add to the FX8 residual book on new data?

**Pre-registered 2026-11-28, before any forward outcome of this book existed.** The shadow records from the first signal
close on or after **2026-11-30**; no P&L of the carry-guarded book dated after 2026-08-20 has been computed.

| | |
|---|---|
| ID / ledger id | `residual-fx8-carry-forward` (C1, scored), `residual-fx8-carry-forward-diff` (C2, scored) |
| Branch | `ccr-251b1df6-yo7y0p` |
| Register row | `plans/RESEARCH_REGISTER.md` → `residual-fx8-carry-forward` |
| Data | OANDA daily mid candles at the 17:00 New York close (the main record's fetch), 7 USD pairs; OANDA financing from the main record's nightly log; OECD 3-month rates (FRED) for the carry gap |
| Seed | `20261128` |
| Uncertainty | Moving-block bootstrap on forward trading days, block = 21, B = 2000 (as `residual-fx8-forward`) |
| Scripts / outputs | `scripts/residual-fx8-carry-forward/record_carry.py` → `analysis/output/residual-fx8-carry-forward/` (KV on Railway) |
| Harness | Own script; imports `scripts/residual-fx8-forward/record.py` unchanged |

## 1. The claim

In the exploratory paper-layers work, one change to the FX8 residual threshold book kept pointing the same way: **don't
open a fade whose direction pays carry**. Up in both halves on FX8 at OANDA 17:00 (+0.15 Sharpe with carry), G10 at Fed
noon (+0.36) and G10 at OANDA 17:00 (+0.34); first half only on FX8 at Fed noon (+0.09). No interval excluded zero, and
it was the best of 6 layers tried on 4 datasets. The claim: the carry-guarded book earns a positive net return on data
that did not exist when the rule was chosen, and more than the frozen book on the same days.

## 2. Why it is not already settled

Every number in §1 is in-sample (2016-2026, the same history the base book was chosen on) and the guard was picked
after seeing all six layers (`analysis/output/residual-fx8-paper-layers/RESULTS.md`,
`analysis/output/residual-g10-layers/RESULTS.md`, both EXPLORATORY). Nearest Evidence Book entries: `rate-diff-xsmom`
(carry level worked 1976-2014, Sharpe 0.54), `fx-factor-carry` (UNDERPOWERED), and the descriptive carry IC in
`g10-2y-gap-momentum` (+0.033 [+0.009, +0.057]). None scores this book forward. Not a re-cut of a banked null.

## 3. Definitions, fixed in advance

**Everything is the frozen `residual-fx8-forward` book (its prereg §3) except the entry rule:**

| Setting | Value (frozen) |
|---|---|
| Model, window, K, z, weights, costs, financing, hash chain | identical: `record.py` imported unchanged |
| Entry | enter when \|z\| ≥ 1.5, direction d = −sign(z), **unless d × cd < 0**; a blocked day opens nothing (the next day is checked again while \|z\| ≥ 1.5) |
| Carry gap cd | 3-month OECD interbank rate of the currency minus the equal-weight average of the 8 (USD = US rate, EUR = euro-area rate), in pp; month M used from day 1 of M+2, carried forward |
| Rates source | FRED `IR3TIB01{US,EZ,GB,AU,NZ,JP,CA,CH}M156N` fetched each run; on failure the committed copies, run flagged `rates_stale` |
| Exit | first close where z changes sign (open trades are never closed by the guard) |
| Trade state | built from z only from 2026-01-02 (as the main record) |
| First signal | 2026-11-30 (first scored P&L day 2026-12-01) |
| Financing | the main record's nightly OANDA rates, read-only, same rule |

**Reproduction gate:** before anything is recorded, the script must reproduce the paper-layers "+C carry guard" book
on `panel_daily.csv` with the committed rates: net Sharpe IS **0.492**, OOS **0.435** (checked 2026-11-28: exact).

**Where it runs:** on Railway, in the same nightly job as the main record, after it (server.js `_rfx8Tick`).

**Judgement date:** 2028-11-30 (about 520 forward days), then yearly on the full forward sample.

## 4. Hypotheses

| # | Question | Pass / fail |
|---|---|---|
| C1 | Forward mean daily **net** return (1× cost, with financing) > 0? | VALIDATED if one-sided block-bootstrap p ≤ 0.05 (Holm with C2) |
| C2 | Forward mean of (shadow net − main net) on the same days > 0? | VALIDATED if one-sided p ≤ 0.05 (Holm with C1) and positive in both halves of the forward sample |
| Kill | max drawdown worse than −7% (as the main record's R1) | record closed, banked as NULL for C1 |

Expectation: C1 positive but probably not significant by 2028; C2 very likely UNDERPOWERED (see §5).

## 5. Power

The backtest Sharpe difference was +0.15 (with carry) with a 10-year 90% interval of about ±0.35. Over ~520 forward
days the interval on a Sharpe difference is roughly ±0.35 × √(2,636/520) ≈ ±0.8. **C2 cannot detect a +0.15 to +0.35
improvement by 2028; it is underpowered by design** and can only come back VALIDATED if the guard is far better than
the backtest suggests, or UNDERPOWERED. C1's MDE is about the same as the main record's (net Sharpe ~1.6 at 520 days).
This record exists to accumulate honest out-of-sample evidence beside the main one, not to deliver a fast verdict.
A NULL is only possible if the 95% upper bound of the C2 difference falls below 0 (the guard hurt).

## 6. Multiplicity

Two scored cells (C1, C2), Holm α = 0.05. No variants: thresholds, rates, the entry rule and the start date are fixed
here. The 3-of-4-datasets history in §1 is the reason for the test, and the multiple layers tried there are why it is
needed.

## 7. What this does NOT test

- G10 (worse than FX8 at the 17:00 close in `residual-g10-layers`); other layers; carry measured from OANDA's own swap
  rates (the guard uses OECD rates, as in the backtest).
- The main record's own question (`residual-fx8-forward` F1/F2), which is unaffected by this shadow.

## 8. What each verdict changes

- **C1 and C2 VALIDATED:** the carry guard replaces the base rule for anything live, after the main record's own
  judgement; not before |t| ≥ 3 or two years of record.
- **C1 VALIDATED, C2 UNDERPOWERED:** the guarded book works but its advantage is unproven; keep both records.
- **C2 NULL (guard hurt) or kill hit:** close the shadow; the base rule stays.
- **UNDERPOWERED on both:** keep recording; re-judge yearly.

## Amendments

(none)

## RESULTS

(not yet run)
