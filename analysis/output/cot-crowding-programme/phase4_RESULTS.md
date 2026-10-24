# cot-crowding-programme — Phase 4 (trading decisions): results

Prereg: `forge/COT_CROWDING_PROGRAMME_PREREG.md` (committed `705e46ea`, 2026-10-24). Cells A1–A4, VA1, VA2, run as
registered; amendment A1 adds the spectrum family and doesn't touch Phase 4. Seed 20261024, B = 2000.
Scripts: `scripts/cot-crowding-programme/phase4_prep.py`, `phase4_trend.mjs`, `phase4_voteatlas.py`,
`phase4_combine.py`. Machine-readable: `phase4_results.json` (with `phase4_trend.json` and `phase4_voteatlas.json`).

## Plain English

**None of the six ways of using the crowding states improves a real trading decision.** All six are **NULL**.

- **Trend system (34 markets, 2017 → Aug 2026 out of sample).** None of these moves the out-of-sample Sharpe by
  more than ±0.015:
  - skipping new entries into a vulnerable crowd (state B or D);
  - halving exposure there;
  - exiting in an active unwind (D);
  - scaling by state.
  The intervals are tight: they rule out any improvement bigger than about +0.05 Sharpe. Halving exposure didn't
  thin the tail either: daily CVaR(97.5%) changed by +0.002 points [−0.012, +0.017]. The rules rarely bind; the
  scaling rules alter 4.5% of market-days with a position, and the entry filter 0.6%.
- **Vote Atlas bot (12 instruments with their own COT market, 2022-05 → Aug 2026).** Trades taken *with* a crowd in
  state B or D did no worse than matched trades in non-crowded weeks: +0.002% pnl per trade [−0.019, +0.030], 904
  trades. Skipping them would have changed out-of-sample pnl per trade by +0.0005% [−0.0003, +0.0011] and lowered
  total out-of-sample pnl slightly (722.2 vs 735.8).

A separate fact, not a COT result: the trend system itself had a weak out-of-sample decade on this 34-market
universe. Basket Sharpe was −0.04 over 2017–2026 (+0.10 in 2017–21, −0.21 in 2022–26), against +0.43 in 2007–16.
Every COT arm inherits that, and none changes it.

## Scored cells (family 2, Holm α = 0.05)

| Cell | Rule | Metric (OOS) | Estimate | 95% CI | p | Holm p | Gate checks | Verdict |
|---|---|---|---|---|---|---|---|---|
| A1 | no new entry while crowd in B/D on the signal's side | Sharpe diff vs BASE | +0.015 | [−0.024, +0.044] | 0.39 | 1.00 | CI ✗ · both subperiods ✓ (+0.023 / +0.006) | **NULL** |
| A2 | ×0.5 while crowd in B/D on the signal's side | CVaR(97.5%) diff, % pts (+ = milder) | +0.002 | [−0.012, +0.017] | 0.81 | 1.00 | CVaR CI ✗ · max DD no worse ✓ (+0.06) · Sharpe lower CI > −0.10 ✓ (diff +0.009 [−0.018, +0.036]) · subperiods ✗ | **NULL** |
| A3 | flat while crowd in D on the signal's side | Sharpe diff vs BASE | −0.001 | [−0.036, +0.041] | 0.97 | 1.00 | CI ✗ · subperiods ✗ | **NULL** |
| A4 | A ×1, C ×1, B ×0.5, D ×0 | Sharpe diff vs BASE | +0.007 | [−0.033, +0.051] | 0.74 | 1.00 | CI ✗ · subperiods ✗ (−0.007 / +0.023) | **NULL** |
| VA1 | trades with a B/D crowd vs matched non-crowded trades (instrument × decision × rung × session) | mean pnlPct diff | +0.002 | [−0.019, +0.030] | 0.84 | 1.00 | CI ✗ · IS +0.018 / OOS +0.007 same sign ✓ | **NULL** (n = 904 test trades, 903 matched) |
| VA2 | skip those trades | OOS pnlPct/trade, skip − all | +0.0005 | [−0.0003, +0.0011] | 0.18 | 1.00 | CI ✗ · total OOS pnl falls (722.2 < 735.8) ✗ | **NULL** (556 skipped of 18,624) |

p-values come from the bootstrap CI by normal approximation (`pFromCI`). No cell is underpowered by the §5 rule: VA
test n = 904 ≥ 100, and the A-cell intervals are narrow.

## Trend system detail (basket, vol-targeted to 10%, 2bp turnover cost)

| Arm | Sharpe IS 2007-06–16 | Sharpe OOS 2017–26/08 | OOS 2017–21 | OOS 2022–26/08 | OOS CAGR % | OOS max DD % | OOS CVaR97.5 % | OOS days altered % |
|---|---|---|---|---|---|---|---|---|
| BASE | 0.425 | −0.044 | 0.101 | −0.207 | −1.01 | −29.67 | −1.904 | 0 |
| A1 | 0.441 | −0.029 | 0.124 | −0.201 | −0.85 | −30.01 | −1.909 | 0.63 |
| A2 | 0.433 | −0.035 | 0.095 | −0.182 | −0.92 | −29.61 | −1.902 | 4.53 |
| A3 | 0.400 | −0.044 | 0.104 | −0.211 | −1.02 | −29.51 | −1.900 | 1.46 |
| A4 | 0.420 | −0.037 | 0.094 | −0.184 | −0.94 | −29.53 | −1.902 | 4.53 |

Descriptive, ex-10Y (33 markets), OOS Sharpe: BASE −0.070, A1 −0.052, A2 −0.058, A3 −0.065, A4 −0.057. Same
picture.

## Vote Atlas detail

- 33,972 trades in the registered window. 904 were taken with a crowd in B (725) or D (179).
- Mean pnlPct: test 0.034 vs control 0.039 (raw); win rate 58.1% vs 57.8%; mean MAE 0.165% vs 0.225%.
- Trades *against* a B/D crowd: n 854, mean 0.019.
- By state (raw, descriptive): B +0.047, D −0.017.
- No test trades on dow or spx (ES and YM never reached a B/D crowded-with-trend state in this window). nq has 12
  and us2000 18.

## Audits run before calling it null

- **Engine reproduction.** BASE on the 12 discovery markets gives IS 0.498 / OOS 0.097, against cot-trend-filter's
  0.493 / 0.097 on the same engine and data family.
- **Point-in-time state.** Spot-checked EUR 2017-10-03, JPY 2016-05-17 and CORN 2017-12-20 against the report rows.
  Each state starts the Monday after the release Friday, and signs and flow are correct in pair terms (e.g. USDJPY
  crowded short = specs long yen).
- **Alignment.** All 34 markets sit on one 5,440-day grid (assert L == grid length). A market before its first price
  is held flat, through constant back-filled closes (RTY from 2017-07).
- **Vote Atlas COT row.** The latest report whose Friday 15:30 ET release is strictly before the trade's entry
  epoch. Trades before 2022-05-05 in some files are excluded to the registered window.

## Caveats

- The Vote Atlas bot's own rules were fixed on data overlapping 2022–2026; only the conditional difference is
  scored.
- Unadjusted continuous futures carry roll jumps, equally in every arm.
- Financing is not modelled beyond the engine's cost.
- These nulls are about using the A–D states *as decision rules* on these two systems. Whether the states carry
  information about outcomes is P1–P10 / family 3, reported separately.
