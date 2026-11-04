# fx-short-term-fair-value — does price close the gap to a short-term rates-and-risk fair value?

**Pre-registered 2026-11-04, before any outcome was computed.** (The power section used real gaps against
SYNTHETIC outcomes only: `analysis/output/fx-short-term-fair-value/power.json`.)

| | |
|---|---|
| ID / ledger id | `fx-short-term-fair-value` (one scored question: the pooled closure, three horizons, Holm) |
| Branch | `worktree-agent-a1c659cb9484c89a4` |
| Register row | `plans/RESEARCH_REGISTER.md` → `fx-short-term-fair-value` |
| Data | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD. FX: FRED H.10 noon New York rates (DEXUSEU, DEXUSUK, DEXJPUS, DEXUSAL, DEXCAUS); yields: FRED DGS2/DGS10, Bundesbank 2y/10y, BoE IUDSNPY (5y par, GBP's short leg, as on the yield board) / IUDMNZC, MoF JGB 2Y/10Y, Bank of Canada benchmark 2y/10y, RBA F2 2y/10y; risk: FRED VIXCLS. Window 1999-01-04 → **2026-08-21** (no signal and no outcome after the lockbox date). AUDUSD starts 2014-09 (RBA F2 daily 2y begins 2013-09), USDCAD 2002-01 |
| Seed | `20261104` (every script) |
| Uncertainty | moving-block bootstrap of date clusters (`js/harness/stats.mjs` clusteredBlockBootstrap), mean block 63 sessions, B = 2000; plus a Monte-Carlo null (400 synthetic correlated random-walk outcomes on the real gaps) |
| Scripts / outputs | `scripts/fx-short-term-fair-value/` (fetch.mjs, run.mjs) → `analysis/output/fx-short-term-fair-value/` |
| Harness | own script: the model is `js/fxFairValue.js`, the same pure module the live page (`/api/fx-fair-value`) uses, so the test scores exactly what is shown |

## 1. The claim (required)

Owner-approved build item 4 (2026-11-04): a short-term fair value for the G10 pairs, as banks publish them ("STFV"
models): regress the pair on rate differentials and a risk factor over a trailing window, read the gap between price
and the model, and expect price to close it over days to weeks. The owner's condition: "tested before it influences
anything". The claim tested here: **the out-of-sample gap between price and this model predicts that price moves to
close it over the next 5, 10 and 20 trading days.**

## 2. Why it is not already settled (required)

- `residual-reversion-fx` (null, 2026-09-20, `MD files/RESIDUAL_REVERSION_FX_TEST.md`) is the nearest entry: price
  minus an OLS macro fair value on the MVE's inputs (US daily legs plus the **monthly OECD foreign family**, +45-day
  publication lag), judged by an icEdge over a trailing-mean benchmark and a z-fade's deflated Sharpe. This is a
  different object: daily issuer yields for both legs (2y and 10y, no monthly series), a risk factor, a **250-day
  rolling** refit (a short-term model; the MVE's fair value is long-memory), and the question is the size of the gap
  closure itself (the share of the gap price closes), not a trade's Sharpe. It is not a re-run: if the gap closes
  here, the MVE null is not contradicted (its gap is a slower object); if it does not, the two nulls agree.
- `yield-ladder-eurusd` (underpowered) asked whether rate CHANGES forecast EURUSD returns; `nonus-yield-gap-direction`
  (null, RE-RUN pending) used the yield gap's level as a direction signal. Neither measures price against a fitted
  level. `yield-spread-sleeve` (demoted on point-in-time data) traded the spread's own z-score.
- Nobody has tested a rolling short-term fair value of this form on this desk.

## 3. Definitions, fixed in advance (required)

- **The model** (`js/fxFairValue.js`): for pair p and day t, OLS on days t−250 … t−1 of
  `ln(price) = a + b1·(2y_base − 2y_quote) + b2·(10y_base − 10y_quote) + b3·ln(VIX)`. Inputs joined to the FX date
  as-of (latest value dated ≤ t, dropped if older than 5 calendar days).
- **The setup / signal**: gap_t = ln(price_t) − fitted_t, the fitted value using the coefficients estimated on the 250
  days BEFORE t (out of sample). Every day is a signal; there is no threshold (the closure is a slope, so all gaps,
  small and large, count).
- **Knowable when?** All inputs are dated ≤ t. Clocks differ (H.10 is noon NY; US and Bund yields are end of day;
  JGBs are Tokyo close), so the outcome starts one full day later: **skip = 1**.
- **The outcome**: the pair's log return from t+1 to t+1+h, h ∈ {5, 10, 20} trading days (rows of the pair's own
  series).
- **The statistic**: the closure share β_h = slope of the outcome on −gap_t (with an intercept), pooled across the
  five pairs. β = 0: price ignores the gap; β = 1: price closes all of it in h days. Under a random walk β = 0 (checked:
  40 synthetic random-walk prices, mean +0.012, sd 0.047 on one pair at h = 20; 200 synthetic outcomes on the real
  gaps, mean −0.001).
- **Pass bar**: the closure implied by a 120-trading-day half-life of the gap shown on the page, 1 − ½^(h/120):
  **0.0285 (h = 5), 0.0561 (h = 10), 0.1091 (h = 20)**. Slower than that is of no use to a desk reading a gap.
- **The control (naive anchor)**: the price's distance from its own trailing 250-day mean log price, through the same
  slope. A fair value must close faster than a plain price anchor, or the rates and risk inputs add nothing.
- **De-clustering**: none needed for the slope; overlapping windows are handled by the block bootstrap (block 63 ≥ h).
- **Uncertainty**: clustered moving-block bootstrap of DATE clusters (all pairs on a date move together; the USD
  pairs share a factor), mean block 63 sessions, B = 2000, seed 20261104; two-sided p vs 0. Because the power run
  showed the bootstrap SE understating the Monte-Carlo null spread by ~10-20%, the significance condition also needs
  the Monte-Carlo null p (400 synthetic correlated random-walk outcomes on the same real gaps: ρ = 0.5 common dollar
  factor, 0.6% daily vol) to pass Holm.
- **Sample / halves**: all signal days to the lockbox; the stability gate splits the pooled signal days at their
  median date.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Pooled β_5, β_10, β_20 > 0 and at or above the bar | **Null expected.** Bank models are sold on it, but FX is close to a random walk and the 250-day refit chases price; expect β within ±1 SE of 0 |
| b | Does the fair value close faster than the naive price anchor? | **No** expected |
| c | **THE GATE** (per horizon, a horizon passes only if all hold) | (1) bootstrap p AND Monte-Carlo null p each pass Holm at α = 0.05 across the 3 horizons; (2) β_h ≥ the bar; (3) β_h > 0 in both halves; (4) β_h − β_naive has a 95% bootstrap interval above 0. **VALIDATED** if at least one horizon passes; **NULL** if none passes and the cell's Holm-level MDE ≤ its bar (all three are powered, §5); **UNDERPOWERED** only for a cell whose realised interval is wider than registered (realised SE × 3.24 > bar) and that does not exclude the bar |
| d | **THE MIRROR** | The opposite claim (price runs away from fair value, β < 0, momentum against the model) is read from the same slope: a significant negative β is reported as a description, not a pass |

## 5. Power — what this design can and cannot find (required)

From `power.json` (real gaps, synthetic outcomes; no outcome touched). SE used = the larger of the block-bootstrap SE
(block 63) and the Monte-Carlo null SD (200 draws). MDE at 80% power; the Holm column uses α = 0.05/3.

| Cell | n (rows / date clusters) | Independent h-windows | SE used | MDE (α 0.05) | **MDE (Holm)** | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|
| pooled h = 5  | 29,174 / 6,675 | ~1,335 | 0.0076 (MC) | 0.021 | **0.025** | 0.0285 | POWERED |
| pooled h = 10 | 29,149 / 6,670 | ~667   | 0.0150 (MC) | 0.042 | **0.048** | 0.0561 | POWERED |
| pooled h = 20 | 29,099 / 6,660 | ~333   | 0.0285 (MC) | 0.080 | **0.092** | 0.1091 | POWERED |

**Planted positive controls, run through this exact pipeline** (real yields and VIX; a price built from them plus a
mean-reverting true gap with half-life HL (sd 3%) plus a random walk (0.5% a day); 6 replications, B = 300):

| True half-life | True closure h5 / h10 / h20 | Measured β h5 / h10 / h20 | Pass rate |
|---|---|---|---|
| 20 days  | 0.159 / 0.293 / 0.500 | 0.047 / 0.087 / 0.148 | 6/6 at every horizon |
| 60 days  | 0.056 / 0.109 / 0.206 | 0.013 / 0.025 / 0.049 | 0/6 |
| 120 days | 0.029 / 0.056 / 0.109 | 0.001 / 0.002 / 0.006 | 0/6 |

**What that means.** The 250-day refit soaks most of a slow true gap into its own coefficients, so the gap it shows
is a fast, noisy residual. The test is powered for the question that matters to the page (does the gap the page shows
close at a useful pace) and it finds a true fair value whose gap has a ~20-day half-life. It cannot see a slow
(60-day-plus) true fair value through this model; a NULL here says nothing about that slower object (§7).

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells**: 3 (pooled β_5, β_10, β_20). Holm at α = 0.05 on the bootstrap p AND on the Monte-Carlo p; plus
  the conjunctive gate items (bar, both halves, beats the naive anchor), which need no further correction.
- **Disaggregation cells** (per pair × horizon, 15): reported with BH at q = 0.10 and its chance baseline; a pair that
  survives is a candidate for its own prereg, never a result.
- **Descriptive** (no pass weight): the |z| ≥ 2 subset's closure, the placebo shifts, each pair's out-of-sample
  half-life (AR(1) on the gap series), the R² distribution.
- **Promotion bar**: anything that would feed the desk as an impact needs |t| ≥ 3 on the scored cell AND a forward
  record (the live page logs one row a day to `fx_fair_value_log_v1` from deploy), not only a validated ledger entry.

## 7. What this does NOT test (required)

- Tradability after costs, sizing, or a trading rule: a closure slope is not a strategy.
- Slow fair value (months, years): the BIS real effective rate board covers that; and this model cannot see a slow
  true gap (§5).
- Crosses (EURJPY, GBPJPY, AUDJPY, EURGBP, EURCAD on the page) are combinations of the scored legs and are shown
  descriptively only.
- The live page's price (OANDA 17:00 NY close) differs from the study's (H.10 noon NY). The model and the gap are
  the same object; the clock is not. A pass would need the forward record on OANDA closes before it is used.
- Causality: a pass says price tends to move toward the model, not why.

## 8. What each verdict changes (required)

- **Validated** → the ledger entry; the page shows the verdict word and the gap; it still does not feed the desk as
  an impact until |t| ≥ 3 and the forward record agree (the owner decides).
- **Null** → the ledger entry; the page keeps the model as DESCRIPTION ONLY, labelled NULL ("rates and risk explain
  where the pair has been; the gap does not tell you where it goes"), and no brief or analyst may cite the gap as a
  reason for direction.
- **Underpowered** → description only, labelled UNDERPOWERED; the forward record decides later.

## Amendments

(none)

---

## RESULTS

Written to `analysis/output/fx-short-term-fair-value/RESULTS.md` after the single scoring run.
