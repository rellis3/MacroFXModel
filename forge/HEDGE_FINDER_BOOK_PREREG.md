# hedge-finder-book — does hedging a book's biggest net currency exposure with the Hedge finder's pick cut drawdowns and the 5% expected shortfall without killing returns?

**Pre-registered 2026-11-06, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `hedge-finder-book` (the joint question). If the powered ES cell (P1) ends with a different word from the joint verdict, it is banked separately as `hedge-finder-book-es` with the same `doc` |
| Branch | `worktree-agent-a91c6673ee0e34bfa` |
| Register row | `plans/RESEARCH_REGISTER.md` → `hedge-finder-book` |
| Data | FRED daily: H.10 noon New York rates (DEXUSEU, DEXUSUK, DEXJPUS, DEXUSAL, DEXUSNZ, DEXCAUS, DEXSZUS, DEXCHUS, DEXSFUS), WTI and Brent spot (DCOILWTICO, DCOILBRENTEU), Nasdaq 100 close (NASDAQ100). Spine = the DEXUSEU dates, 1999-01-04 → **2026-08-21** (lockbox: nothing after it is read). Scored from **2000-06-01** (6,574 days). Fetched by `scripts/hedge-finder-book/fetch.mjs`, sha256 per series in `data/hedge-finder-book/manifest.json` (gitignored) |
| Seed | `20261106` (every script in this study) |
| Uncertainty | paired circular moving-block bootstrap of daily returns, block 21 days, B = 2000; the same index draws for every arm |
| Scripts / outputs | `scripts/hedge-finder-book/` (fetch.mjs, lib.mjs, power.mjs, run.mjs) → `analysis/output/hedge-finder-book/` |
| Harness | own script. `js/harness/runStudy.mjs` scores signal strategies on a vol-targeted universe; this is an overlay on a fixed book, compared arm against arm, which it does not do. Its cost rule (half the measured spread per unit of turnover, unmeasured instruments charged the worst measured FX pair) is copied |

## 1. The claim (required)

The owner, 2026-11-06: *"Does hedging a book's biggest net currency exposure, with the hedge the new Hedge finder would
pick, cut drawdowns without killing returns?"*

The Hedge finder is the Desk Terminal's Correlations & hedges tab (`js/terminal/hedgeView.js`, maths in
`js/terminal/corrMath.js`). Its **Book hedge** takes the desk book's biggest net currency exposure after the cap
(`biggestExposure(exposure.after)`), reads it as that currency's basket against the other seven, long or short, drops every
FX pair containing that currency and every basket from the candidates (`bookHedges`), and ranks the rest by
|correlation| × sign stability over the tab's window (60 days by default, `corrView.js` `ST.win`), with stability = the share
of 60-day windows sampled every 5 days over the last 250 that had today's sign, and a min-variance ratio
|ρ|·sd_target/sd_candidate. Candidates with |ρ| < 0.10 are dropped. The tab today carries an UNTESTED chip
(`js/terminal/corrEvidence.js`: "no entry tests that holding these cuts a book's losses out of sample").

## 2. Why it is not already settled (required)

Nearest entries in `js/deskEvidence.js`:

- `rule-a-portfolio-budget` (underpowered): correlated legs behave as one bet; sizing by cluster. Sizing, not hedging.
- `spread-sleeve-factor-audit` (context), `fx-factor-book-v2` (underpowered): factor-neutralising a book. Different
  instruments and a factor hedge, not the finder's ranked single-instrument hedge.
- `fx-dollar-funding-exposure-hit` (null): which currencies get hit in risk-off weeks. Not a hedge.
- `hedge-flow` / `hedge-flow-side`: dealer option hedging, unrelated despite the name.

None tests a correlation-ranked hedge out of sample. This is a new question, not a re-cut of a null.

**Why not the desk's own book.** The desk's paper book starts 2026-11-03: three days, all inside the lockbox H-A block.
A 5% change in a 5% tail needs thousands of days (§5); three days cannot test anything. The desk book is LLM-written, so it
cannot be reproduced back in time either.

**Why not the bot fleet's trade histories (candidate a).** The systems store (`analysis/output/systems/*`,
`/api/system-backtests`) is not in this checkout or reachable from the sandbox (no R2 credentials, OANDA answers 403), and
the fleet's FX systems trade a few pairs intraday, so a daily net-currency book from them would be thin and short.

**The book used (candidate b): a currency-strength trend book on the desk's own G10 universe, with the desk's own cap.**
Each day, for each of the desk universe's 28 G10 pairs (`DESK_UNIVERSE.fx_majors` + the G10 `fx_crosses`, NOK and SEK left
out), a card is LONG at size 1 if the pair's 60-day log return to the previous close is positive and SHORT if negative. The
cards go through the desk's per-currency cap unchanged (`js/deskExposure.js` `capExposure`, cap 4), and the exposure the
finder reads is that function's `report.after`. Trend signs on every pair of the eight currencies add up to a currency
strength ranking (the strongest currency is long against all seven others), so the book carries concentrated net bets on
one or two currencies, as the desk's book did on its first run (32 of 41 cards short, "one trade wearing twenty tickers").
It is fully point-in-time (closes to t−1 only, no fitted parameter), and it has 26 years. Its own profitability is not
the question and is reported only as context. Before registration only the setup was counted: the biggest capped
exposure on scored days is AUD 1,327, NZD 1,147, EUR 847, USD 787, GBP 668, CAD 626, CHF 595, JPY 577; |net| is at the
cap (4.0, 4.01 after the cap's rounding) on essentially every day, so which currency is "biggest" is often settled among
currencies at the cap by the cap's 0.01 rounding and then the CCY8 order. That is exactly what the live tab would do
with the same book, so it is kept.

## 3. Definitions, fixed in advance (required)

- **Panel (the candidates).** The live panel is 26 OANDA instruments (server.js `CORR_PAIRS`). With a long keyless daily
  history, 19 are rebuilt: EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF from the H.10 rates; GBPJPY, EURGBP,
  EURJPY, EURCHF, GBPCHF, AUDJPY, CADJPY from those legs; USDCNH ← H.10 USD/CNY (DEXCHUS; pegged before 2005-07, where its
  correlation is null and it drops out on its own); USDZAR ← DEXSFUS; WTI, BRENT ← FRED spot; NQ ← FRED NASDAQ100.
  **Missing: GOLD, SILVER, PLATINUM, COPPER, SPX500, US30, US2000** (no keyless long daily source in the sandbox: OANDA
  403, Yahoo rate-limited, FRED's S&P 500/Dow only from 2016, no gold). The panel closes are null where a series did not
  print, exactly like `buildPanel`; the ranking runs on `corrMath.series(panel)` and `bookHedges(S, exposure, S.ids,
  { w: 60, end: i − 1 })` imported unchanged.
- **Clocks.** FX at the noon New York fix, Nasdaq 100 at the 16:00 close, WTI/Brent spot at their settlements. The live
  panel is all 17:00 NY. Mixed clocks attenuate the non-FX candidates' correlations; the FX-only pool (§4 S-cells) is the
  same-clock check.
- **Knowable when.** Cards for day i from closes ≤ i−1; the hedge for day i from the panel ≤ i−1 (`end: i − 1`); both
  held over day i's close-to-close return (forward-filled closes, so a missed print moves the return to the next printed
  day). Nothing uses day i or later.
- **Arms** (all on the same book, same days, same costs for the book):
  - **U, unhedged**: the book.
  - **F, finder**: U plus the finder's top-ranked row: units = side × ratio × |net| of that candidate (side long = +1,
    short = −1), re-chosen and re-sized every day. No row (no candidate with |ρ| ≥ 0.10) → no hedge that day.
  - **C1, naive own leg**: U plus the exposure currency's own USD pair (EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCAD,
    USDCHF; **DXY** when the currency is USD), sized by the same min-variance formula (`rankCandidates`, 60-day window,
    data to i−1, no |ρ| floor). Trading the own pair cuts the exposure rather than hedging it, which is why the finder
    excludes it; it is the natural benchmark.
  - **C2, naive DXY**: U plus DXY (the ICE weights rebuilt from legs, `corrMath` `DXY_W`) for every currency, same sizing.
  - **P, placebo (200 draws, seeds 20261106 + k)**: U plus a candidate drawn uniformly from the finder's own eligible rows
    that day, sized by its own ratio and side. The draw is kept while it stays eligible and redrawn only on days the
    finder's own pick changes (or the drawn one leaves the list), so the placebo switches about as often as the finder.
- **Costs.** Half the measured round-trip spread per unit of turnover (`analysis/output/costs/spread_profile_hist.json`,
  that year's median pips × pip / price; years before 2016 take the widest yearly median 2016–2026). Instruments without a
  measured spread (NZDCHF in the book; USDCNH, USDZAR, WTI, BRENT in the panel) are charged the worst measured FX pair
  that year (the harness rule). DXY is charged its legs' weighted costs. Switching hedge instrument pays both the exit and
  the entry. No carry or swap on any arm (spot returns only; a limitation, §7).
- **Outcomes** (daily net returns in units of one size-1 card, additive P&L):
  - ES5 = minus the mean of the worst 5% of daily returns. Relative change = ES5(arm)/ES5(U) − 1.
  - Max drawdown = largest peak-to-trough fall of the cumulative P&L over the whole scored sample. Relative change likewise.
  - Sharpe = mean/sd × √252; annual return = mean × 252; the Sharpe and annual-return change = arm − U.
  - Descriptive: mean of the max drawdowns inside consecutive 252-day chunks ("yearly drawdown"); ES5 of overlapping
    21-day sums; cost drag; turnover; days with no hedge.
- **Uncertainty.** Paired circular moving-block bootstrap (21-day blocks, B = 2000, seed 20261106): every arm is
  resampled on the same index draws and the relative change is recomputed per draw. 95% percentile intervals.
- **Sample.** 2000-06-01 → 2026-08-21. Halves split at 2013-07-01. The hedge rule has no fitted parameter, so the whole
  sample is out of sample for it.

## 4. Hypotheses, expectation first (required)

| # | Cell | Pass bar | Pre-registered expectation |
|---|---|---|---|
| P1 | **ES5, F vs U** (scored, powered) | relative change ≤ −5% **and** 95% CI upper < 0 | **No**: a cut of about −1% to −3%. A single-instrument daily hedge on one currency of a 28-pair book removes ρ² of a slice of its variance |
| P2 | **Max drawdown, F vs U** (scored, owner's measure, UNDERPOWERED by design) | relative change ≤ −5% **and** 95% CI upper < 0 | **Null-ish**: the planted hedges in §5 do not move the max drawdown even when they cut ES |
| P3 | **Sharpe, F − U** (scored, non-inferiority) | 95% CI lower > −0.10 | cost drag of a daily-rebalanced hedge makes this borderline |
| P4 | **Placebo** (scored) | F's relative ES5 change at or below the 5th percentile of the 200 placebo draws | **Yes**: the ranking picks higher-|ρ| candidates than a random eligible one |
| G | **THE GATE (VALIDATED)** | P1, P2, P3 and P4 all pass, and P1's point estimate is a cut in both halves | |
| M | **THE MIRROR** | the C1/C2 naive hedges: reported with the paired CI of (F − C) on ES5 and max drawdown. Not part of the gate; if a naive hedge does at least as well, the `use` line says so | |

**Verdict for `hedge-finder-book`, applied in this order:**

1. P1's 95% CI lower bound > −5% (a 5% ES cut ruled out) → **NULL**.
2. P2's 95% CI lower bound > −5% (a 5% drawdown cut ruled out) → **NULL**.
3. P3's 95% CI upper bound < −0.10 (more than 0.10 Sharpe given up is established) → **NULL** ("kills returns").
4. P1 passes but P4 fails → **CONTEXT** (any min-variance hedge from the eligible list does it; the ranking adds nothing).
5. The gate G holds → **VALIDATED** (research-only below |t| 3).
6. Anything else → **UNDERPOWERED** (expected: P2 cannot reach its bar on one 26-year path).

**Descriptive cells (no pass/fail weight):** annual return given up (F − U, with CI); yearly drawdown and 21-day ES5 for
every arm; C1, C2 and the placebo median on every outcome; gross of costs; costs × 2; the FX-only pool (same clock; the 16
FX instruments, CNH and ZAR included); the halves; F vs U ES5 by the exposure currency (8 cells, BH q = 0.10, with
`chanceBaseline`); the finder's most-picked instruments; days with no hedge.

## 5. Power — what this design can and cannot find (required)

From the **control arm only** (`scripts/hedge-finder-book/power.mjs` → `analysis/output/hedge-finder-book/power.json`,
committed before this file): the unhedged book's daily net returns (6,574 days, ≈ 313 21-day blocks) with **planted**
min-variance hedges of book-level correlation ρ (hedge P&L = −ρσ_t·c_t, c_t = ρz_t + √(1−ρ²)e_t, e_t = the book's own
standardised return half a sample away, so fat tails and vol clusters are kept). Paired block bootstrap, 21-day blocks,
B = 500. No finder or control hedge was computed. MDE = 2.8 × bootstrap SE (80% power, two-sided 5%).

| ρ (book-level) | planted ES5 change | MDE ES5 | planted max-DD change | MDE max DD | planted yearly DD | MDE yearly DD | MDE ΔSharpe |
|---|---|---|---|---|---|---|---|
| 0.05 | −0.5% | 0.5pp | −1.0% | 7.6pp | −0.2% | 1.8pp | 0.03 |
| 0.10 | −1.2% | 1.0pp | −1.0% | 14.6pp | −0.4% | 3.6pp | 0.06 |
| 0.15 | −2.2% | 1.4pp | +0.1% | 21.3pp | −1.2% | 5.2pp | 0.08 |
| 0.20 | −3.1% | 1.9pp | +1.1% | 27.6pp | −2.4% | 6.8pp | 0.11 |
| 0.25 | −4.2% | 2.5pp | +1.4% | 33.2pp | −4.0% | 8.3pp | 0.14 |
| 0.30 | −5.6% | 3.2pp | +1.2% | 38.4pp | −5.8% | 9.8pp | 0.16 |

| Cell | n | MDE at the pass bar | Pass bar | Verdict |
|---|---|---|---|---|
| P1 ES5 | 6,574 days / ≈313 blocks | ≈3.1pp (ρ ≈ 0.29 gives the −5% bar) | −5% | **POWERED** (MDE < bar) |
| P2 max drawdown | one path | 8–38pp | −5% | **UNDERPOWERED by design** |
| yearly drawdown (descriptive) | 26 chunks | ≈9.5pp at a −5% effect | −5% | underpowered at the bar |
| P3 ΔSharpe | 6,574 days | 0.11–0.16 at ρ 0.2–0.3 (CI half-width ≈ 0.08–0.12) | −0.10 margin | borderline |

Two things follow and are written down now. (1) **Max drawdown on one path cannot be tested at a 5% bar**: its SE is 3–14
times the bar, and a same-day hedge that cuts the daily tail by 5.6% left the planted max drawdown unchanged (+1.2%),
because drawdowns are multi-week runs and a daily hedge's own noise adds up over them. The owner's drawdown half of the
question therefore can only come back UNDERPOWERED unless the effect is very large. **What it would take:** a drawdown cut
needs either many independent books (e.g. the 28 single-pair books, or ≥ 30 independent strategy books, scored as a
cross-section of max drawdowns) or a hedge whose correlation holds at the 1–3 month horizon, scored on 21-day returns. (2)
P1 is the powered cell: if the finder's hedge reaches a book-level ρ of about 0.3, the test finds it.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** P1, P2, P3, P4. The VALIDATED gate is conjunctive (all four, and both halves on P1): "conjunctive
  gate, no further correction". Holm-adjusted p-values (α = 0.05, `holm`, p from the bootstrap CI with `pFromCI`) on P1
  and P2 are reported as well.
- **Disaggregation:** the 8 per-currency ES5 cells, BH q = 0.10 with `chanceBaseline`. A surviving currency is a
  candidate for its own prereg, never a result.
- **Variants:** one book (60-day trend, cap 4), one window (60, the tab's default), one candidate rule (the top row). The
  S-cells (FX-only pool, gross, costs × 2) are sensitivities listed here; nothing else is run. No other window, book or
  pick (e.g. "top 3") is tried.
- **Promotion:** nothing live changes on this test; a chip change only (§8).

## 7. What this does NOT test (required)

- **The desk's own book.** A proxy book with the desk's universe and cap, not the LLM book. Its own return is context.
- **The full live panel.** Gold, silver, platinum, copper, the S&P 500, the Dow and the Russell 2000 are missing; gold
  in particular is a natural USD hedge. A null here does not cover them.
- **Carry and swap.** Spot returns only, for every arm; a hedge that is short a high-yielder pays carry not counted here.
- **Other windows, the "Inverse only" setting, the per-market Hedge finder card** (hedging one instrument, not the book).
- **Intraday or 17:00 NY clocks.** Noon New York fix for FX.
- **Direction.** Nothing here says where any market goes.

## 8. What each verdict changes (required)

- **VALIDATED** → the Book hedge card's chip points at `hedge-finder-book` (research-only, not a trade instruction).
- **NULL** → the chip says TESTED: NULL on `hedge-finder-book`; the card keeps "past co-movement only" and adds that a
  daily hedge from this ranking did not cut the tail of a 26-year proxy book.
- **CONTEXT** → the chip shows the base rate: a min-variance hedge cuts the daily tail by about the r² it shows, and the
  ranking does no better than any eligible candidate.
- **UNDERPOWERED** → the chip says UNDERPOWERED on `hedge-finder-book`; the drawdown half needs the cross-section-of-books
  or 21-day design in §5. P1's own word, if different, is banked as `hedge-finder-book-es`.

In every case the hedges view's "untested" line in `js/terminal/corrEvidence.js` is replaced by the banked entry.

## Amendments

(none)

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/hedge-finder-book/RESULTS.md`.*
