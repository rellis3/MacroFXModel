# Fama-MacBeth Regressions for Quant Finance (full video)

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=vSnGJDhhj5s |
| ReelScribe id | j577f6xskge8d9p53fvp37dqex8j20ty · 21 min |
| Notebook | **not in the library**: no folder in the local clone matches the title, the video ID or "MacBeth" (the only hit is one remark in folder 48, `trading_performance.ipynb`). The procedure below comes from the transcript |
| Recorded | unknown (2026; the shorts were posted 2026-11-02/03) |
| Processed | 2026-11-12 |
| Related | shorts note [2026-11-12-shorts-fama-macbeth.md](2026-11-12-shorts-fama-macbeth.md) (the two Instagram clips cut from this video); method lesson #9 |

## Lesson
Return distributions change over time, so one pooled regression across all stocks and dates mixes regimes and
gets standard errors that are too small. Fama-MacBeth holds time fixed instead. **Step 1**: each period, run a
cross-sectional regression of the *next* period's returns on a characteristic measured *now* (here the CAPM beta). **Step 2**: average
the per-period slopes across time and test the average against its own time-series spread. The output is a premium per unit of the
characteristic, plus a slope series you can inspect period by period. Then turn it into a book: sort on the characteristic,
go long the top and short the bottom, read the alpha against the pricing model you used, and combine it with the market.

## Approach
- **Question**: "Do stocks with higher market betas earn higher than average returns?" Swap beta for any characteristic
  (momentum, sentiment). Description of a *priced characteristic*, then a trading translation.
- **Why FM, not pooled**: pooled fits blend "two different time effects": the characteristic itself drifts (NVDA's
  rolling beta ranges from about 1 to 4.95, averaging 2.14, 2021 to now), and so does the return distribution. A cross-section at a fixed date removes the time effect.
- **The procedure as stated** (transcript; no code available):
  1. Estimate each firm's beta by regressing its returns on SPY (the market proxy) over a rolling window ending at month t.
  2. Each month t, regress the firm's month-t+1 return on its beta from month t across the universe ("Russell 3000, S&P 500 or any other filter").
  3. "Average the coefficient values and test for statistical significance." **He does not say how the SE is computed.**
     Newey-West is never mentioned. "Heteroscedastic, robust errors" comes up once, in passing, about the alpha step.
  4. Interpret: a positive average slope means beta carries a premium.
  5. Portfolio: top 25% of beta each month, long-only (Sharpe 1.15, max drawdown 31.2%). CAPM regression of that portfolio: beta 1.39, "some alpha".
  6. "Market-neutral" long-short: 5.64% a year, vol 13.42%, Sharpe 0.42, max drawdown 20%. Then mixed with SPY → Sharpe 1.33,
     because the two are claimed to be "orthogonal".
  7. Check monotonicity: forward return by signal quintile should rise steadily (his Q5 > Q4, then it "stalls").
- **Validation**: walk-forward by construction ("everything is walk forward"). He names lookahead, and says the universe must include firms that went
  bankrupt or merged. He admits survivorship in his own sample ("a stratified sample of firms across industry"). There is no holdout and
  no multiple-testing control. The FM slopes are **statistically insignificant** in his own run, yet the alpha and portfolio steps go ahead "for illustrative purposes".
- **Costs**: "Transaction costs will eat you alive." Turnover is high, and costs are not modelled.
- **Framing line worth keeping**: "Either over conditioning and not extracting the general case, or under conditioning and not
  actually observing any edge, and that really is the game."
- **Joint hypothesis**: any test of a premium is also a test of the pricing model you chose (CAPM vs FF3/FF5).

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Pooled regressions over time-varying distributions look like noise. FM conditions on time (QG) | method | **PARTLY ON FILE, and the shorts note under-counted it.** The desk already uses the *univariate* FM estimator under another name: `fx-factor-stack` = mean **monthly cross-sectional rank-IC** across 8 currencies (`forge/FX_FACTOR_STACK_PREREG.md` A1.4). `residual-pca-family` = mean **daily cross-sectional IC** with **Newey-West 5 lags** (`forge/RESIDUAL_PCA_FAMILY_PREREG.md`). The harness clusters pooled rows by date before bootstrapping (`js/harness/runStudy.mjs`), which is the bootstrap analogue of FM's time-effect robustness. *Not* on file: multivariate per-period slopes |
| 2 | Higher beta earns a higher premium (QG, his sample) | trading | Not ours to test (no equity cross-section). In his own run it is insignificant. The classic literature finds a flat or negative security market line (Fama-French 1992; Frazzini-Pedersen BAB). A 2021-26 positive slope mostly restates that the market went up |
| 3 | Long-short on beta is orthogonal to SPY, so combining lifts Sharpe to 1.33 (QG) | trading | Doubtful as stated: a dollar-neutral long-high-beta / short-low-beta book has *net positive* beta unless it is beta-weighted. The lift-by-combining point is REPEAT of lesson #8 / factor blend (ALREADY DO: `project_factor_blend`, corr 0.06) |
| 4 | Forward return should rise monotonically across signal quantiles (QG, 19:26) | method | PARTLY: tercile books (`rate-xsmom`, `fx-factor-stack`) report the book, not the full quantile ladder. Monotonicity appears in `research-director/agendas/gex-range.md` only |

## How FM would apply to this desk (concrete)
**Universal recipe.** For each period t: (a) build characteristics X_{i,t} from data with `asof` ≤ t and z-score them across the cross-section;
(b) the outcome is y_{i,t+h}, the next-h return in each instrument's own σ units (excess return incl. carry accrual for FX); (c) run OLS
y_{·,t+h} = a_t + Σ_k λ_{k,t}·X_{k,·,t}. The intercept a_t absorbs that period's common move (the dollar for FX, the market for the board).
Average: λ̄_k = mean_t λ_{k,t}. SE = sd(λ_{k,t})/√T **only if the λ series is serially uncorrelated**. Use Newey-West with lags ≥ h−1 whenever
returns overlap (h-month returns sampled monthly), and report the λ series' autocorrelation either way. Petersen (2009): FM
SEs are robust to cross-sectional (time) correlation but biased *down* when the characteristic is persistent per instrument (a "firm
effect"). Carry ranks barely change for years, so in FX that bias is the live risk. Fama (1976) reading: with a z-scored characteristic, λ_{k,t}
is the return of a characteristic-weighted zero-cost portfolio. So the FM slope **is** our rank-weighted book's return, up to scaling.
Characteristics are observed, not estimated, so no Shanken errors-in-variables correction is needed (it *would* be needed for QG's estimated betas).

| Study | Cross-section, period | What FM adds over what we ran |
|---|---|---|
| **8 FX majors / carry** (`fx-factor-stack`, `rate-xsmom`) | 8 currencies (USD at 0) or 7 non-USD, monthly, T ≈ 103 OOS | One **joint** monthly regression on carry + momentum (+ value) gives partial slopes: "carry *holding momentum fixed*". That replaces the A1.7 book-Sharpe difference and the `rate-xsmom` time-series alpha regression. Limit: N = 8 leaves 4–5 df per month with 3–4 regressors, so keep K ≤ 2 or stay with rank-IC. Our banked number is already the univariate rank form (carry +0.079) |
| **residual-fx8** | 8 currencies, daily | Already FM in `residual-pca-family` (daily IC, NW 5). For the forward record, a daily slope of next-day residual return on −disp (NW lags ≥ the typical hold) separates "the signal still predicts" from "the threshold/exit rules still pay". Diagnostic beside F1. It does not change the frozen rule |
| **62-market board** | 62 markets, weekly, about 520 weeks over 10 years | Characteristics that exist for all 62 (12-1 momentum, 1-week reversal, σ change; IV÷σ where present). Add asset-class dummies each week so the slopes are *within-class*, and scale returns by σ. Different question from the pooled time-series trend result (~0.3 OOS): this one is relative, not absolute. Needs daily history for all 62 confirmed first |
| **Pooled line-touch / touch selector across pairs** | pairs × days | The harness date-cluster bootstrap already handles time effects. FM adds the per-period slope plot (is the gross +0.10–0.19R steady or a few months?) |

**A method issue this exposes (for the parent / owner, not a verdict change).** `scripts/fx-factor-stack/run.py` takes a
moving-block bootstrap of the **monthly** IC series (block 3) and then widens it by the effective-N haircut √(7/m_eff) = 1.74
(`haircut_ci`). In FM logic, the month-to-month spread of a cross-sectional statistic already carries the cross-sectional
correlation, so the haircut is probably counted twice. Without it, carry's IC interval would be about ±0.064 instead of ±0.111, roughly [+0.015, +0.143]: zero excluded.
The verdict was pre-registered and stays UNDERPOWERED. The Sharpe bars fail either way (unhaircut ≈ [−0.27, +0.99]). But the rule matters for the next
cross-sectional prereg: the haircut belongs on *pooled-row* resampling (which is why the harness reports it there), not on a per-period
statistic's time series. This should be checked before anyone relies on it (e.g. a planted-correlation simulation).

## What we could learn
- **REPEAT / correction of #9.** The tag should move from DON'T DO to **ALREADY DO (univariate IC form) / DO WORSE (multivariate
  slopes; haircut stacked on a time-series SE; persistence/firm-effect check not reported)**.
- **Quantile ladder as a standard display** for any cross-sectional signal (forward outcome by quintile, monotone or not). **DO WORSE**: books
  report top-minus-bottom only. WATCH.
- **Run the significance test before building the portfolio.** QG built and sold the book on slopes he had just called insignificant. Our protocol already
  stops there (**ALREADY DO**: verdict before page).
- **Joint hypothesis**: the alpha is relative to the chosen model. Ours is the B0–B3 baselines (**ALREADY DO**, direction-bar).

## Research ideas
- **FM re-read of `fx-factor-stack` (method audit, not new evidence).** Variable: per-month joint slopes on carry and momentum. Condition: none.
  Horizons: 1 month (NW lag 0–4), 3 months (NW lag ≥ 2). Noise threshold: the univariate rank-IC MDE from A1.6. Benchmark: the banked univariate ICs.
  Also report the lag-1 autocorrelation of λ_carry (the firm effect). Changes: whether carry's premium is separate from momentum, and whether the haircut
  rule in the next FX cross-section prereg should go. Same OOS data, so it is reported only, never re-scored. Agenda: `model-audits.md`.
  Screening: no multivariate per-period slope on file (`git grep -il macbeth` hits only course notes, the whiteboard and the direction proposal).
- 62-market FM: not carded until the board's history depth is confirmed.

## Quotes
- "Either over conditioning and not extracting the general case, or under conditioning and not actually observing any edge, and that really is the game." (~1:30)
- "Instead of looking at variation across time… we're just going to look in the cross-section at variation at a particular point in time." (~11:00)
- "Average the coefficient values and test for statistical significance." (14:01)
- "It may have some survivorship bias cuz this is just a composite of… a stratified sample of firms." (14:13)
- "You want to look at the monotonicity of signal quantile and the forward return." (19:26)
