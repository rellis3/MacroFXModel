# Agenda: pairs / spread trading (the differential between two assets)

Set 2026-11-03 by research-director, from a pasted social-media clip (speaker unknown, **not C.OG**; it ends with a
"comment below for the link" pitch, so it is a lead, not a source). Theme keywords for `evidence_map.mjs`:
`pairs cointegration residual spread ratio`. Hand chosen cards to `research-protocol` to claim.

## What the clip claims, and what holds

| Claim in the clip | Verdict | Why |
|---|---|---|
| Trade A/B, not A or B | Sound idea | The textbook pairs/stat-arb frame (Gatev, Goetzmann & Rouwenhorst 2006, *RFS* 19(3)) |
| "You don't care about S&P, FOMC, Korea" | **Overstated** | A pair cancels only the shared factor it is hedged against. NVDA/MSFT is a semis-vs-megacap, high-beta-vs-low-beta and rates-duration bet. Pair books carry their own crowded-factor risk: the Aug 2007 quant drawdown (Avellaneda & Lee 2010 study it) |
| Buy statistically cheap, sell rich | Only if the spread is stationary | A ratio that trends (NVDA/MSFT 2023-24) is never "cheap"; z-scores on a trending ratio produce manufactured reversion in-sample (micro bank q1, `education/mean-reversion-of-residuals-notes.md` slides 25-26) |
| Hedge ratio = cap A / cap B | **Wrong** | Market cap says nothing about how the two co-move. Dollar-neutral is equal notional; beta-neutral is notional_B = notional_A × β_A/β_B; spread-stationary is the regression (or Kalman) coefficient on log prices; risk-neutral is inverse-vol. The cap ratio is none of these, and on NVDA vs MSFT (vol ~2:1) it is neither dollar- nor beta-neutral |
| Easy | No | Profits from simple pairs rules fell steadily 1962-2009, with ~70% of the fall attributed to rising arbitrage risk; they did best in turbulent spells (Do & Faff 2010, *FAJ* 66(4)). Avellaneda & Lee (2010, *Quant. Finance* 10(7)): ETF-residual Sharpe 1.1 over 1997-2007 with degradation after 2002; PCA 0.9 over 2003-07 (earlier drafts quote other numbers) |

Sources: [Do & Faff 2010](https://econpapers.repec.org/RePEc:taf:ufajxx:v:66:y:2010:i:4:p:83-95) ·
[Avellaneda & Lee 2010](https://econpapers.repec.org/RePEc:taf:quantf:v:10:y:2010:i:7:p:761-782) (abstracts checked,
not full text) · Gatev et al. 2006 (from memory, not re-checked this session).

C.OG on the same family (course page, verbatim, `cog-question-style.md`): "instruments that drift away from the group
tend to come back. That is an idea, not a model. … decide now how much of the final result you expect to survive."

## Evidence map (honest numbers)

- **The nearest thing we have is the FX8 PCA residual model (micro bank q1).** Original run FAIL: OOS IC +0.027
  (t 2.11) but IS −0.001; full sample +0.013, t 1.43 (`education/residual_pca_currency_test/RESULTS.md`).
- **Family re-runs:** `residual-pca-wide10` NULL (IC +0.0075, p 0.20; gold/silver residuals *trend*);
  `residual-pca-idx6` UNDERPOWERED (six index CFDs, IC +0.011, sign alternates by year); `-news`, `-monthend`, `-cot`
  UNDERPOWERED.
- **Live lead, not banked:** `residual-pca-stops` (exploratory): FX8 threshold book, enter |z| ≥ 1.5, exit at home, net
  Sharpe +0.43 / +0.38 by half; metals negative; no MAE noise threshold inside 4 res-sd; time stops hurt. Register
  says next is a forward-record prereg, owner call.
- **Two-leg version on FX crosses:** `ou-bands-fx-crosses` UNDERPOWERED: 22 OOS trades, 68% of trades end on the time
  stop, 6% reach the OU target.
- **Rates as the "external factor" for a pair:** `rates-spread-asset-lead`, `spread-episodes-nq/-eurusd`,
  `cog-spread-direction` all NULL, but those asked whether rates *lead* direction. None used rates to *hedge* a pair's
  factor exposure.
- **Dispersion** (`dispersion-reset`, VALIDATED): constituent pulling-apart tells you about range, not direction
  (direction null both arms). Consistent with the house pattern: range validates, direction rarely does.
- **Data.** OANDA M1 / NY-close D1 2016-06 → for FX, NQ, SPX500, US30, US2000, DE30, UK100, gold, silver; FRED rates.
  **No single-stock data in the repo** (the clip's MSFT/NVDA/MU). After 2026-08-20 is lockbox.
- **Mechanism.** A pair reverts when the gap came from flow or liquidity (someone forced to buy one leg) and the
  shared fundamental holds; it trends when the gap is information (earnings, a factor re-rating). The trade is paid
  for absorbing that flow and for bearing the risk that this time it is information.

## Questions, ranked

### Q1. Does the differential mean-revert at all, and at what horizon? — score 13/15

> Before any rule: build the log ratio for each pair we can trade, under each hedge (1:1 dollar, rolling beta, rolling
> regression, inverse-vol, and the clip's cap ratio as a mirror). Read its variance ratio and half-life across a family
> of horizons, against matched random walks. Where does the spread behave unlike a random walk, and where does it trend?

| | |
|---|---|
| Construct | log(A) − h·log(B), h from each hedge rule fitted on trailing data only |
| Knowable when | NY-close D1, h from data to t−1 |
| Condition | none (the distribution comes first); split by vol regime as a description |
| Horizons | VR(q) and half-life at 1, 5, 10, 20, 60 sessions |
| Noise threshold | the same statistics on 1,000 vol-matched random-walk pairs |
| Outcome distribution | VR(q) by pair × hedge × horizon, with block-bootstrap bands |
| Benchmark / control / mirror | random-walk pairs; the cap-ratio hedge as the mirror |
| Pairs | NQ/SPX500, US2000/SPX500, US30/SPX500, DE30/UK100, gold/silver, plus 6 G10 crosses as the "already a ratio" set |
| Builds on | `ou-bands-fx-crosses` (OU fitted but rarely reached target), `residual-pca-wide10` (metals trend) |
| Data & power | 2016-06 → 2026-08-20, ~2,550 days per pair; VR SE at q=20 ≈ 0.06, fine for VR ≤ 0.85 |
| If yes → | only the pairs/horizons with VR clearly < 1 go to Q2; the rest are dropped by evidence, not taste |
| If no → | we stop saying "differentials are statistics"; on our universe the ratio is a random walk |
| Falsifier | every pair's VR inside the random-walk band at every horizon |

### Q2. At its extremes, what happens next? (the clip's trade, done properly) — score 11/15

> On the pairs Q1 keeps, take the spread's z in its own trailing 6-12 months. When it is at an extreme, what is the
> distribution of the next 1 to 20 sessions, including MAE, net of the cost of two legs? Beat the same rule on
> random-walk pairs and on the cap-ratio hedge.

| | |
|---|---|
| Construct | z of the Q1 spread, trailing window 126/252 |
| Knowable when | close t; enter next open |
| Condition | |z| above a threshold the sweep finds (the noise threshold), not fixed at 2 |
| Horizons | 1, 3, 5, 10, 20 sessions |
| Noise threshold | placebo pairs and shuffled-date z |
| Outcome distribution | return in spread-σ, MAE/MFE, share of episodes that keep widening |
| Benchmark / control / mirror | random-walk pairs; buy-and-hold of the spread (is it momentum instead?); cap-ratio hedge |
| Mechanism | flow-driven gaps revert, information gaps do not |
| Builds on | `residual-pca-idx6` (indices, IC +0.011), FX8 lead |
| Data & power | extremes ~5% of days → ~25-40 independent episodes per pair at 20 sessions; pool pairs; powered only for a large effect |
| If yes → | a pairs sleeve candidate for the portfolio book |
| If no → | the clip's trade is noise on our universe; Q3 is the only remaining version |
| Falsifier | pooled extreme-bucket return inside the placebo band, or negative after two-leg costs |

### Q3. Take out the external factor first, then trade what is left — score 11/15

> NQ/SPX and US2000/SPX are not neutral: they are rate-duration and size bets. Regress each spread's daily change on
> the move in real yields (and the 2y), keep the residual, and ask whether the residual at its extremes reverts better
> than the raw ratio over the same horizon family.

| | |
|---|---|
| Construct | Δspread − b·Δ(10y real, 2y), b rolling, trailing only |
| Knowable when | FRED dates aligned to NY close (data-rules point-in-time) |
| Condition | residual cumulated to a level, z in its own history, extremes |
| Horizons | 1, 5, 10, 20 sessions |
| Noise threshold | same on the raw spread and on placebo pairs |
| Benchmark / control / mirror | Q2's raw-spread result is the control: does removing the factor raise reversion? |
| Mechanism | the part explained by rates is information; the part that is left is more likely flow |
| Builds on | rates NULLs were lead/direction questions; this is a hedge, so not a re-ask |
| If yes → | the residual, not the ratio, is the variable to build on (the Avellaneda & Lee move) |
| If no → | rates are not the missing factor for index pairs |
| Falsifier | residual reversion no better than raw |

### Q4. The FX8 threshold book: forward record — score 10/15

> The in-house lead (enter |z| ≥ 1.5, exit at home, +0.43/+0.38 net by half) was found after looking. Run it forward,
> untouched, and judge it at a fixed number of closed trades.

Already in the register as `residual-pca-stops` → owner call. Listed here because it is the only pairs-family result
that holds in both halves. Cannot score history again; settles on forward data only (n fixed in its prereg).

## Parked

- **Single-stock pairs (the clip's MSFT/NVDA/MU).** No constituent data in the repo. Needs survivorship-free daily
  equities, borrow costs and corporate actions; the literature says simple versions have decayed. Owner decision
  whether to buy or build that data.
- **Ratio momentum** (trend in A/B instead of reversion): only if Q1 shows VR > 1 somewhere.
- **Anything scored on 2026-08-21 →**: lockbox.

## Owner calls

(none yet)
