# hedge-residual-system — is the hedge relationship itself tradable: long a pair, short the Hedge finder's best partner at the rolling min-variance ratio, traded on the residual?

**Pre-registered 2026-11-06, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `hedge-residual-mr` (mean reversion), `hedge-residual-mom` (residual momentum), `hedge-residual-carry` (carry). One entry per scored cell, all with this `doc` |
| Branch | `worktree-agent-a4107183ccffa1412` |
| Register row | `plans/RESEARCH_REGISTER.md` → `hedge-residual-system` |
| Data | Local OANDA mid M1 cache (`VolRangeForecaster/data/m1`, main checkout): EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, AUDJPY, CADJPY, EURJPY, GBPJPY, NZDJPY, 2016-01-04 → 2026-08-20 23:59 UTC. Seven currencies (USD, EUR, GBP, JPY, AUD, NZD, CAD; CAD from CADJPY ÷ USDJPY) give the desk's 21 G10 pairs without CHF. H1 closes (last M1 close in each UTC hour, 66,174 hours) and NY-close daily closes (17:00 New York, 2,758 sessions to **2026-08-20**). Policy rates: BIS WS_CBPOL daily (US, GB, JP, AU, NZ, CA) and the ECB deposit facility rate (FRED ECBDFR) for EUR. Built by `scripts/hedge-residual-system/extract.py` and `fetch_rates.mjs` into `data/hedge-residual-system/` (gitignored, sha256 in its manifests). Lockbox: nothing after 2026-08-21 is read |
| Seed | `20261106` (every script) |
| Uncertainty | circular moving-block bootstrap of daily (NY-close session) net returns, block 21 sessions, B = 2000; the Monte-Carlo SE from `power.json` is the second leg of the NULL rule |
| Scripts / outputs | `scripts/hedge-residual-system/` (extract.py, fetch_rates.mjs, lib.mjs, power.mjs, run.mjs) → `analysis/output/hedge-residual-system/` |
| Harness | own script. `js/harness/runStudy.mjs` scores single-instrument signals on daily bars at a 10% vol target; this is a two-leg spread on hourly bars with a monthly partner choice from the live tab's ranking, which it does not model. Its cost rule (half the measured spread per unit of turnover) is kept, on both legs |

## Data source, and why (checked 2026-11-06 from this session)

- **M1 cache:** present in the main checkout for 10 of the 26 instruments (the 2016-2026 cache), not in this worktree.
  Used read-only by absolute path. Missing locally: USDCAD, USDCHF, EURGBP and the other crosses (rebuilt from the legs
  where possible), **CHF (no leg at all), gold and every index**.
- **OANDA:** the practice and live hosts now answer **401** through the proxy (reachable; no key in this environment),
  so no fresh M1 or gold/index history could be pulled.
- **R2:** no credentials in this environment; the endpoint does not answer.
- **FRED** (`NODE_USE_ENV_PROXY=1`, keyless) and **BIS** answer **200**. Daily FX from FRED (the H.10 noon fix, used by
  `hedge-finder-book`) is too slow for this question (`ou-bands-fx-crosses` was too thin at daily), so FRED/BIS are used
  only for the policy rates.

So the universe is the 21 desk G10 pairs on the seven currencies the cache covers, at H1. Gold and indices are out.

## 1. The claim (required)

The owner, 2026-11-06: *"Run the hedging system as a single system instead of hedging a primary system."* Is the hedge
relationship itself tradable standalone: long X, short its best hedge at a rolling hedge ratio (or the reverse), i.e.
trading the residual?

The hedge is the Desk Terminal's **Hedge finder** (`js/terminal/hedgeView.js` → `corrMath.rankHedges`): for a market X,
every other panel instrument ranked by |60-day correlation| × sign stability (share of 60-day windows sampled every 5 days
over the last 250 days whose sign matches today's), dropping |ρ| < 0.10, with the min-variance ratio |ρ|·sd_X/sd_Y.
`corrMath.js` is imported unchanged.

## 2. Why it is not already settled (required)

Nearest entries in `js/deskEvidence.js` and what differs:

- `hedge-finder-book` / `hedge-finder-book-es` (2026-11-06): the finder's hedge as an **overlay** on a book (it cut the
  daily 5% tail ~9%, cost ~0.06 Sharpe). That asked whether the hedge reduces risk; this asks whether the hedged spread
  earns. Different question, same ranking.
- `ou-bands-fx-crosses` (underpowered): OU bands vs ±2σ bands on four fixed daily crosses; 22 OOS trades. Difference:
  hourly bars (thousands of trades per cell), partners chosen point-in-time by the live ranking rather than four fixed
  crosses, a min-variance two-leg spread rather than a single cross, and a stated power table. It does not re-cut that
  null: it never reached its trade floor.
- `yield-spread-sleeve` (context, point-in-time Sharpe 0.09) / `multi-spread-sleeve` / `spread-sleeve-factor-audit`
  (context: neutralising factors raised the sleeves' Sharpe, i.e. relative value looked real, but on a lookahead
  stream): those trade a **yield** spread z into FX. Here the spread is between FX prices, and carry uses policy rates
  read at D−1.
- `residual-reversion-fx` (null), `residual-pca-wide10` (null) and the `residual-pca-*` family: reversion of a macro
  fair-value or PCA residual, daily, next-day. Here the residual is a pairwise min-variance hedge chosen by the finder,
  hourly, with a multi-hour hold.
- Study 3, `forge/RESIDUAL_INTRADAY_PREREG.md` (registered FAIL, never banked): first |z| ≥ 2 residual of four fixed
  pairs on 5-minute bars inside one London day, 60-minute hold; pooled net −0.05σ per trade. Difference: a week-long z
  window, holds up to 120 hours, the finder's pairs, and two more signal families. Its result is the expectation for the
  MR cell (§4).
- The retired hedge signals (`MD files/HEDGING_VS_SPREAD.md`, retired 2026-11-06, untested): 1:1 log spread, z > 2 / 0.5
  / 3.5, statistics kept in memory and against a full-history mean. What not to do, kept out here: the ratio is the
  min-variance one, every statistic is trailing, and nothing uses a full-sample mean.

Nothing banked tests a correlation-ranked spread as a standalone system. This is a new question.

## 3. Definitions, fixed in advance (required)

- **Universe.** The desk's G10 pairs (`DESK_UNIVERSE.fx_majors` + `fx_crosses`) without CHF, NOK, SEK: EURUSD, GBPUSD,
  USDJPY, AUDUSD, NZDUSD, USDCAD, GBPJPY, EURGBP, EURJPY, AUDJPY, CADJPY, EURAUD, EURCAD, EURNZD, GBPAUD, GBPCAD, AUDCAD,
  NZDCAD, NZDJPY, GBPNZD, AUDNZD (21). Pair closes are built from the seven currencies' USD values at the same minute.
- **Panel.** NY-close daily closes of the 21 pairs, `corrMath.series(panel)`, exactly the live panel's shape.
- **Partner choice (point-in-time, monthly).** On the first session of each month from 2017-04, with data to the previous
  session's close (`end = i − 1`): for each X, `rankHedges(S, X, other 20, { w: 60, end, minAbs: 0.10, lookback: 250 })`;
  the top row is X's partner Y **only if its sign stability share ≥ 0.80** (the "stability rule held"); otherwise X has no
  slot that month. One slot per unordered pair: if X→Y and Y→X are both picked, the orientation with the higher finder
  score is kept (ties: the earlier X in the list). The month's slots are in force from the first hour after that close
  to the hour of the next month's selection; slots that end are closed at that hour.
- **Hedge ratio (daily, t−1).** β = ρ·sd_X/sd_Y (the finder's min-variance ratio with ρ's sign), 60 daily returns to the
  last NY close at or before the decision hour. The spread is X − β·Y: long the spread = long 1 of X, short β of Y.
- **Size.** Each slot's X notional w = 0.01 / (sd_X·√(1 − ρ²)) (1% daily residual sd), from the same window. Sharpe does
  not depend on the scale.
- **Decision clock.** Hourly, at the close of each UTC hour (the last M1 close inside it). Signals use closes up to and
  including that hour and the daily parameters known at it; positions earn the next hour's return. Nothing later is read.
- **Signals (each its own scored cell):**
  1. **MR (mean reversion).** U = log X − β·log Y with the current β over the last N = 120 hours (one trading week);
     z = (U_now − mean U) / sd U. Enter when |z| ≥ 2.0, fading it (z > 0 → short the spread). Exit when z is back within
     0.5 of the mean on the entry side or beyond (long: z ≥ −0.5; short: z ≤ +0.5), or after 120 hours, or when the slot
     ends. No price stop. Flat otherwise.
  2. **MOM (residual momentum).** Sign of the trailing 120-hour residual return (Δlog X − β·Δlog Y over 120 hours, current
     β), re-read on every UTC hour divisible by 4 (and at a slot's first hour). Always in the market.
  3. **CARRY.** Sign of the spread's carry c_X − β·c_Y, with c = policy rate(base) − policy rate(quote) **of calendar day
     D − 1** for a decision after session D's close (policy rates are announced and never revised; D−1 keeps any same-day
     announcement out). Re-read hourly (it changes only when β or a rate changes). Flat if zero or missing.
  - **HOLD (benchmark, not scored):** always long the spread, same slots, sizes and costs.
- **P&L.** Hourly: position_X·r_X + position_Y·r_Y + the financing accrual position·(policy-rate differential of that
  pair, D−1)·elapsed time (calendar time, so weekends accrue), on every arm. No swap markup.
- **Costs.** Both legs, half the measured spread per unit of change in each leg's position (entries, exits, daily
  β and size changes, slot changes), at the hour traded: `analysis/output/costs/spread_profile_hist.json`, the pair's
  weekday × UTC-hour median spread (2016-10 → 2026-08 OANDA bid/ask), scaled by that year's median over the all-year
  median, ÷ price. All 21 pairs are measured. No netting across slots (conservative). Sensitivity: costs × 2.
- **Outcome.** Daily (NY-close session) net P&L of the whole system per cell, summed over slots. **Net Sharpe** = mean/sd
  × √(sessions per year in the sample). Halves split at **2021-12-01**. Scored sample: the first hour after the
  2017-03-31 close → the 2026-08-20 close (≈ 9.4 years, ≈ 113 monthly selections, ≈ 15 slots on synthetic data).
- **Placebo (200 draws, seeds 20261106 + k).** The same X slots each month, each with a partner drawn uniformly from the
  other 20 pairs, the same β, size, signals and costs. The real cell's percentile among the placebo net Sharpes.
- **Whole sample is out of sample for the rule:** every parameter (60-day window, 0.80 share, N = 120, 2.0 / 0.5 / 120 h,
  K = 120, every 4 h) is fixed here; nothing is fitted on the data.

## 4. Hypotheses, expectation first (required)

| # | Cell | Pass bar (all must hold for VALIDATED) | Pre-registered expectation |
|---|---|---|---|
| MR | `hedge-residual-mr` | net Sharpe ≥ 0.5; Holm-adjusted p < 0.05 (two-sided, `pFromCI` on the bootstrap CI) with a positive estimate; net Sharpe > 0 in both halves; ≥ 95th percentile of the placebo | **No.** Study 3 lost −0.05σ per trade net at 5 minutes; synthetic no-edge paths net about −1.1 here from costs alone, so the residual must revert enough to earn ~1 Sharpe gross before a 0.5 net is reachable |
| MOM | `hedge-residual-mom` | the same four | **No.** About 20,000 flips on synthetic data; costs alone take ~1.3 Sharpe |
| CARRY | `hedge-residual-carry` | the same four | **Null-ish to small positive.** The accrual is earned by construction; the question is whether the spot leg gives it back. Expect a net Sharpe inside ±0.4 |
| G | **THE GATE** | each cell is judged on its own four bars; Holm across the three cells | |
| M | **THE MIRROR** | HOLD (buy-and-hold of the spread) and the placebo partners, reported beside every cell. MR and MOM are each other's partial mirror (fade vs follow of the residual); reported, not gated | |

**Verdict per cell, applied in this order:**

1. Bootstrap 95% CI upper < 0.5 **and** estimate + 1.96 × the Monte-Carlo SE (§5) < 0.5 → **NULL** (a 0.5 net Sharpe is
   ruled out).
2. All four bars hold → **VALIDATED** (research-only below |t| 3).
3. Sharpe, Holm and halves hold but the placebo bar fails → **CONTEXT** (any partner does it; the finder adds nothing).
4. Anything else → **UNDERPOWERED** (the design's MDE exceeds the bar, §5).

**Decomposition (owner's rule 2026-10-27; pre-registered so the parts cannot be chosen later; BH q = 0.10 on their
p-values; a part that is positive, BH-significant, positive in both halves and ≥ 95th placebo percentile where one exists
is a reusable candidate, never a result):**

- D1–D3: each cell's **gross** Sharpe (no costs) vs zero (random-walk null) and vs the placebo's gross distribution.
- D4: **MR gross P&L per trade** (bp of X notional, monthly-cluster bootstrap) against the mean cost per trade.
- D5: **CARRY spot-only gross Sharpe** (the price leg without the accrual); the accrual-only Sharpe is described.

**Descriptive (no pass/fail weight):** HOLD on every measure; costs × 2; gross; trades per cell; cost drag; net Sharpe by
calendar year (concentration, the last 3 years alone); the finder's most-picked slots; per-target-X net Sharpe for each
cell (21 × 3, BH q = 0.10 with `chanceBaseline`), where a survivor is a candidate for its own prereg only.

## 5. Power — what this design can and cannot find (required)

From **synthetic prices only** (`scripts/hedge-residual-system/power.mjs` → `analysis/output/hedge-residual-system/power.json`,
committed before this file in 8587b27d). The real hour grid and session dates carry 24 paths of correlated Gaussian
random-walk currencies (dollar factor plus European and commodity blocs, 0.6% daily sd); the whole pipeline runs on them
unchanged. Under that null the signals have no edge, so the spread of their gross Sharpes across paths is the SE the real
test faces. Bootstrap SE on one null path agrees within ~15%; the larger of the two is used. MDE = (2.394 + 0.842) × SE
(Holm's first step, α = 0.05/3 two-sided, 80% power).

| Cell | n | trades (null paths) | SE (MC / boot) | **MDE** | Pass bar | Net Sharpe of a no-edge path (cost drag) | NULL reachable if estimate below | Verdict |
|---|---|---|---|---|---|---|---|---|
| MR | ≈2,450 sessions, 9.4 yr | ≈9,800 | 0.31 / 0.30 | **1.01** | 0.5 | −1.08 | −0.11 | **UNDERPOWERED for VALIDATED** |
| MOM | same | ≈20,500 | 0.28 / 0.32 | **1.05** | 0.5 | −1.34 | −0.14 | **UNDERPOWERED for VALIDATED** |
| CARRY | same | ≈1,980 | 0.37 / 0.31 | **1.20** | 0.5 | −0.23 | −0.23 | **UNDERPOWERED for VALIDATED** |
| HOLD | same | 0 | 0.32 / 0.32 | 1.05 | — | −0.43 | — | benchmark |

What follows, written now:

1. **Trade count does not buy Sharpe precision.** Thousands of hourly trades still give an annual-Sharpe SE of about
   1/√years ≈ 0.31–0.37 over 9.4 years. A true net Sharpe of 0.5 would be found less than half the time; VALIDATED needs
   about 1.0. This is why the owner's bar cannot be **confirmed** on 2016–2026 data at any bar frequency.
2. **NULL is reachable, and is the decisive direction.** A cell whose estimate is below about −0.1 to −0.2 rules out a
   0.5 net Sharpe. Because no-edge paths net −1.1 (MR) and −1.3 (MOM) from costs, a tradable result needs a gross edge
   of about 1.5 Sharpe for those two cells.
3. **Positive control.** A planted Ornstein-Uhlenbeck component in every currency (half-life 24 h, stationary sd 0.25× /
   0.5× the daily sd) came through MR as gross 1.29 / 2.99, net 0.21 / 2.02, with MOM turning negative (−1.22 / −2.43),
   as a fade-vs-follow pair should. The pipeline finds hourly residual reversion when it is there.
4. **Not modelled in the power paths:** fat tails and volatility clustering (Gaussian paths). The bootstrap on real data
   keeps them.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** MR, MOM, CARRY. **Holm at α = 0.05** across the three (`holm`, p from the bootstrap CI via `pFromCI`).
  Each cell also needs both halves and the placebo bar (conjunctive, no further correction).
- **Decomposition:** D1–D5, BH q = 0.10. **Disaggregation:** 63 per-target-X cells, BH q = 0.10 with `chanceBaseline`.
- **Variants:** one universe, one window (60 days, the tab's default), one stability floor (0.80), one parameter set per
  signal, as above. Costs × 2 and gross are sensitivities. No other z window, threshold, lookback, rebalance frequency
  or partner rule is run. Count of variants tried: 1 per cell.
- **Promotion:** nothing live changes on this test (§8). Anything that would trade needs |t| ≥ 3 and a forward record.

## 7. What this does NOT test (required)

- **Gold, indices, CHF.** Not in the local cache; OANDA is keyless here. A null does not cover gold/USD-basket or
  index-pair spreads (e.g. the journal's DAX/S&P), which Study 3 also found negative at 5 minutes.
- **Other partner rules** (cointegration tests, fixed economic pairs such as AUD/NZD), other windows, netting of
  positions across slots (costs are charged per slot; netting would cut them), limit-order execution.
- **The broker's swap markup.** Financing is the policy-rate differential, unmarked-up; real swaps are worse.
- **Direction of any single pair.** Nothing here says where a market goes.
- **The hedge as a hedge.** That is `hedge-finder-book`.

## 8. What each verdict changes (required)

- **VALIDATED (any cell)** → research-only: a forward record of that cell (own prereg) before any bot; the Hedge finder
  card may cite the entry as "the spread itself has earned X net on 2017–2026 history, research-only".
- **NULL** → the Hedge finder card (and `MD files/HEDGING_VS_SPREAD.md`) says the finder's pairs traded as a spread did
  not earn net of costs on 2017–2026 hourly history for that signal; the retired hedge signals stay retired.
- **CONTEXT** → the card says spreads of these pairs earn about as much with any partner; the ranking adds nothing.
- **UNDERPOWERED** → the 0.5 bar cannot be confirmed or ruled out on 9.4 years; what would settle it is a longer history
  (OANDA M1 back to 2005 via Railway, about 21 years, SE ≈ 0.22) or a forward record.

## Amendments

(none)

---

## RESULTS — run 2026-11-06

*Written to `analysis/output/hedge-residual-system/RESULTS.md`.* 2017-03-31 → 2026-08-20, 2,436 sessions, 14.9 spreads on
average. **MR NULL**: net Sharpe −1.19 [−1.76, −0.60], 9,353 trades, halves −1.17 / −1.21, placebo 0th percentile.
**MOM NULL**: −1.78 [−2.45, −1.08], 18,791 trades, halves −2.42 / −1.14, placebo 3.5th. **CARRY UNDERPOWERED**: +0.08
[−0.55, +0.70], 1,869 trades, halves −0.03 / +0.18, placebo 11th. Buy-and-hold of the spread −0.53 [−1.13, +0.05].
Gross of costs every cell's CI includes 0 (MR +0.16, MOM +0.11, CARRY +0.44, mostly accrual); the MR trade earns ~0.9 bp
gross against ~3.3 bp of two-leg spread.
