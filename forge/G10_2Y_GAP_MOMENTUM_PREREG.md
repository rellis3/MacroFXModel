# g10-2y-gap-momentum — does the change in daily 2-year yield gaps rank the G10 currencies over the next 5 and 20 days?

**Pre-registered 2026-11-28, before any outcome was computed.** Only the inputs exist: the yield audit
(`analysis/output/g10-2y-gap-momentum/yields/coverage.json`) and the FX price files from `residual-g10-layers`. No
forward FX return has been computed against any yield signal.

| | |
|---|---|
| ID / ledger id | `g10-2y-gap-momentum` (family), cells `g10-2y-gap-l20h5` (primary), `g10-2y-gap-l5h5`, `g10-2y-gap-l20h20`, `g10-2y-gap-l5h20` |
| Branch | `ccr-251b1df6-yo7y0p` |
| Register row | `plans/RESEARCH_REGISTER.md` → `g10-2y-gap-momentum` |
| Data | 9 currencies (USD EUR JPY GBP CAD AUD CHF SEK NOK; NZD has no reachable daily yield source). FX: Fed H.10 noon New York rates (FRED, `analysis/output/residual-g10-layers/fred/`). Yields: one official daily short government yield per currency (table in §3). Signal dates 2005-01-03 → the last date whose outcome window ends on or before **2026-08-20** (lockbox untouched) |
| Seed | `20261128` |
| Uncertainty | Moving-block bootstrap on signal days, block = max(21, 2H) days, B = 2000, on the daily IC series (Fama-MacBeth style: the SE comes from the time series of the per-day statistic) |
| Scripts / outputs | `scripts/g10-2y-gap-momentum/` → `analysis/output/g10-2y-gap-momentum/` |
| Harness | Own script (cross-sectional daily panel; `runStudy.mjs` is single-instrument) |

## 1. The claim

FX-001 from the owner's G10 plan: when one country's short yields rise relative to the others, the market is repricing its
central bank more hawkishly, and that currency keeps gaining over the following days. So ranking the currencies by the
**recent change** in their 2-year yield gap should rank their next 5 and 20 trading days, beyond what the yield
**level** (carry) already says.

**Where an edge would come from (method lesson #4):** slow diffusion of rate repricing into FX. Bond and rates traders
reprice the path first; FX real-money and hedgers adjust over days to weeks (the Ang & Chen / Dahlquist & Hasseltoft
"policy momentum" story). It would be crowded out by fast macro funds trading the same gap the same day, which is why a
daily signal is needed: the monthly version is already dead.

## 2. Why it is not already settled

- `rate-diff-xsmom` (NULL, 2026-10-08): 9 currencies, **monthly** OECD 3-month rates with a 45-day lag, 3-month change in
  the gap, monthly rebalance, 1976-2026: Sharpe 0.13, nothing beyond carry. Its own note: *"Untested: the same on DAILY
  market-priced rates … which is how C.OG means it."* This study is that test: daily market yields, 1-day lag,
  5- and 20-day changes, 5- and 20-day outcomes.
- `fx-factor-stack` (UNDERPOWERED, 2026-11-01): monthly carry/momentum/value/surprise on 8 currencies. No rate-change
  factor; monthly power was the problem. Daily signals over 21 years give many more cross-sections.
- `policy-direction-at-lines` (NULL): the 63-day US-minus-German 2y change as a direction at the vol lines on EURUSD.
  One pair, a different outcome (line breaks), a 63-day change.
- Not a re-cut of a banked null: different data frequency, different universe (adds AUD, CAD, CHF, SEK, NOK, GBP, JPY
  at daily frequency), different horizons.

## 3. Definitions, fixed in advance

**Yields** (% p.a., one series per currency, `scripts/g10-2y-gap-momentum/fetch_yields.py`):

| Ccy | Series | Coverage notes (from the audit) |
|---|---|---|
| USD | FRED DGS2 | from 1976 |
| EUR | Bundesbank BBSIS R02XX, German 2y | from 1997 |
| JPY | MoF JGB 2Y | from 1974 |
| GBP | BoE GLC nominal spot curve 2.0y | from 2000 |
| CAD | BoC BD.CDN.2YR.DQ.YLD | from 2001 |
| AUD | RBA FCMYGBAG2D | from 1995; **missing 2013-05-20 → 2013-09-01** (the RBA files do not overlap) |
| CHF | SNB rendoblid 2J | **ends 2025-07-31** (cube discontinued) |
| SEK | Riksbank SEGVB2YC | from 2000 |
| NOK | Norges Bank GOVT_GENERIC_RATES 3Y (no 2y tenor) | **from 2019-01-02** |

**Clock and lag.** FX day t = an H.10 noon New York fixing date. The yield used for day t is the latest value dated
**on or before t − 1** (calendar), carried forward at most 5 calendar days; older = missing. This one-day lag removes
every time-zone and publication question (Asian/European closes are before noon NY on the same date, but the US 2y
close is not, and RBA/RBNZ publish the next morning).

**Universe on day t:** currencies with a valid yield on t and on t − L (the lookback), and an FX return over the outcome
window. A day needs at least 7 currencies to count.

**Signal.** yd[c,t] = y[c,t] − mean over the day's universe of y (the yield gap to the cross-sectional average; USD is a
member). S_L[c,t] = yd[c,t] − yd[c,t−L] (trading days), L ∈ {5, 20}.

**Outcome.** Currency log return vs USD r[c] (USD = 0) from H.10; basket return x[c] = r[c] − mean over the universe;
F_H[c,t] = sum of x[c] over days t+1 … t+H, H ∈ {5, 20}. (Signal at noon t, outcome from noon t to noon t+H.)

**Statistic.** IC_t = Spearman rank correlation across currencies of S_L[·,t] and F_H[·,t]; the cell statistic is the
mean of IC_t over signal days.

**Beyond carry.** On each day, regress the signal ranks cross-sectionally on the yield-level ranks (yd); the residual
is the carry-orthogonal signal; its mean IC is the "beyond carry" statistic.

**Book (for the net-of-cost check).** Daily target weight per currency = signal rank minus mean rank, scaled to gross
1; held as H overlapping tranches (1/H of the book rebalanced each day). Daily P&L = w · x(t+1). Cost = turnover ×
house round-trip / 2 (`tags.COST`; NOK, SEK 0.035%). Reported: net Sharpe with the same bootstrap.

**Halves.** Split at the middle signal day of each cell.

**Positive control (method lesson #1), before the real run:** replace the signal with S* = F_H + noise scaled so the
true IC is about 0.05; the pipeline must recover a mean IC in 0.03–0.07 with a CI that excludes 0. And a cross-sectional
shuffle of the real signal (500 shuffles) must centre on 0. If either fails, nothing is scored until the code is fixed
(PRE-RESULTS amendment).

## 4. Hypotheses, expectation first

Expectation (stated now): a small positive IC at H = 5 (around 0.02–0.04), weaker or nil at 20; most of it carry-related.

| Cell | L | H | Pass (VALIDATED) |
|---|---|---|---|
| **g10-2y-gap-l20h5 (primary)** | 20 | 5 | mean IC > 0, Holm-adjusted one-sided p ≤ 0.05 (4 cells), AND IC > 0 in both halves |
| g10-2y-gap-l5h5 | 5 | 5 | same |
| g10-2y-gap-l20h20 | 20 | 20 | same |
| g10-2y-gap-l5h20 | 5 | 20 | same |

**THE GATE (family verdict VALIDATED):** the primary cell passes, AND its carry-orthogonal IC has one-sided p ≤ 0.05,
AND its net-of-cost book Sharpe point estimate is > 0. If the primary passes but the carry-orthogonal IC does not, the
family is CONTEXT ("rate changes rank currencies, but only as carry does").

**THE MIRROR:** the reversed signal (−S) is the same test with the opposite sign; it is reported. A significantly
negative IC (Holm one-sided p ≤ 0.05 on −S, both halves) means rate changes are faded (reversal) and is reported as
such, scored NULL for the momentum claim.

**Verdict words per cell:** VALIDATED as above. NULL if the 95% upper bound of the mean IC is below **0.03** (rules out
an economically useful effect). UNDERPOWERED otherwise.

Descriptive only (not scored): the same-day IC (S vs the outcome of day t itself, a contemporaneous check); IC by
year; the carry IC (yd level) and 20-day price-momentum IC as benchmarks; per-currency contribution.

## 5. Power

Daily cross-sectional Spearman IC with N ≈ 8–9 currencies has a null SD of about 1/√(N−1) ≈ 0.36. Over ≈ 5,300 signal
days with H-day overlap, the effective count is about n/H: SE(mean IC) ≈ 0.36/√(5300/5) ≈ 0.011 at H = 5 and
0.36/√(5300/20) ≈ 0.022 at H = 20. With Holm over 4 cells (α ≈ 0.0125 one-sided, z ≈ 2.24) and 80% power (z 0.84):
MDE ≈ 3.1 × SE ≈ **0.034 at H = 5** and **0.068 at H = 20**. The economic bar is IC 0.03 (typical published monthly FX
factor ICs are 0.03–0.08). So the H = 5 cells can roughly detect the bar; **the H = 20 cells are underpowered by design
for IC 0.03** and can only come back VALIDATED (large effect) or UNDERPOWERED (they will rarely be able to rule out
0.03). Bootstrapped SEs replace these approximations in the results.

## 6. Multiplicity

Four scored cells (2 lookbacks × 2 horizons), Holm at α = 0.05 one-sided. The gate adds conjunctive conditions (no
further correction). Descriptive cells are not scored. No other variants: tenors, lookbacks, horizons, start date and the
7-currency minimum are fixed here. Promotion to anything live needs |t| ≥ 3 on the primary cell (stats-defaults).

## 7. What this does NOT test

- Market-implied policy paths (OIS, rate futures): not available free for 9 currencies; 2y government yields are the proxy.
- NZD (no reachable daily source). NOK only from 2019 and on a 3y yield. CHF stops 2025-07-31.
- Execution at the OANDA 17:00 close (OANDA is 403 from the sandbox); H.10 noon fixings are used for both signal and
  outcome. Carry/financing P&L is not added to the book.
- Intraday timing, stops, sizing: this is a ranking test.

## 8. What each verdict changes

- **VALIDATED (gate passes):** the rate-change ranking becomes a candidate layer on the residual/carry book (its own
  prereg, the better/worse test used in `residual-fx8-paper-layers`), then an OANDA 17:00 forward record. Not live
  before |t| ≥ 3 or a forward pass.
- **CONTEXT:** use carry (level), not the change; close FX-001 as "nothing beyond carry" at daily frequency too.
- **NULL:** FX-001 is closed at daily frequency on government yields; only an OIS/futures version would remain.
- **UNDERPOWERED:** no decision; a longer sample (pre-2005 for the 7 currencies with history) is the only cheap power
  gain and would be its own prereg.

## Amendments

(none)

## RESULTS

(not yet run)
