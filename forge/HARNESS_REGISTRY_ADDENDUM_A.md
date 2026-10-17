# Harness — Addendum A: the Part A result, and a lookahead the reproduction found

*Written 2026-10-17 after the two Part A reproductions ran. This addendum records results and one
decision taken after seeing them; it can only demote, never promote. The control cells described
in §3 were designed after the honest cells failed — stated here so nobody reads them as
pre-registered.*

## 1. What was built

`js/harness/runStudy.mjs` with `stats.mjs` (date-clustered block bootstrap, BH-FDR, deflated
Sharpe, PBO by CSCV, PCA share) and `costs.mjs` (measured spread profile at the entry hour), reading
features only through `js/harness/features.mjs`. Seven synthetic tests pass
(`js/harness/runStudy.test.mjs`): a peeking signal is found, a random one is not, costs bite, the
store's gap contract holds inside a signal, FDR/DSR/PBO behave on constructed inputs.

Two deviations from the Part A table, both stated in the code header:

- **The bootstrap unit.** `statsCore.blockBootstrapIC` permutes blocks of ROWS against a fixed
  target and cannot take date clusters of unequal size. The harness bootstraps the statistic over
  blocks of consecutive DATE CLUSTERS (every instrument on a date moves together), reports a
  percentile interval and a two-sided p, and prints the brick's row-block p beside it.
- **Entry hour.** The profile's 21:00 UTC cell is the rollover spike (EURUSD 3.28 pips vs 0.86 at
  22:00). The default entry hour is 22:00 UTC — the first hour a 22:00Z-knowable signal can be
  filled at normal spreads.

Five features were registered and built for the sleeve reproduction: `y2m_usd` (GS2, the US leg the
sleeve actually used), `y2_usd` (DGS2 daily), `rate_on_de`, `rate_on_jp`, `rate_on_ca` (the OECD
call-money legs in `ZSCORE_PAIRS`; the store's `rate3m_*` are a different series).

## 2. Reproduction 1 — `cot-positioning-factor` (expected: still FAIL, larger p)

| | banked 2026-08-22 | harness 2026-10-17 |
|---|---|---|
| legs | 8 (7 TFF FX + gold Disaggregated) | **7** — gold COT is not in the store |
| OOS pooled rank-IC | −0.0317 | −0.0574 [−0.117, +0.004] |
| p, row blocks (the brick) | 0.0936 | 0.035 |
| p, **date-clustered weekly blocks** | — | **0.066** |
| OOS halves | −0.025 / −0.041 | −0.026 / −0.083 |
| per leg | GBP −0.228, GOLD +0.117, AUD +0.004 | GBP −0.232, AUD +0.015, CAD −0.102, NZD −0.076, EUR −0.062, JPY +0.018, CHF −0.010 |
| verdict | FAIL (p ≥ 0.05) | **FAIL** (interval includes 0; p 0.066) |

Still FAIL, as expected. The p did not come out *larger than the banked 0.0936* as predicted —
but on the same 7-leg panel, clustering by date did raise it from 0.035 to 0.066, which is the
direction the prediction was about. The lower absolute p is the missing eighth leg: gold's
positive IC (+0.117) pulled the original pooled estimate toward zero, and GBP (−0.232 vs −0.228)
and AUD (+0.015 vs +0.004) reproduce leg-for-leg. PCA: the seven legs are 56% one factor
(effective N 2.8). The fade-direction P&L is Sharpe 0.39, p 0.14 — not a sleeve.

## 3. Reproduction 2 — `yield-spread-sleeve` (expected: still PASS)

**It did not reproduce on point-in-time asofs.** Validated cell (entry 2.0, window 126, GS2 leg),
OOS 2021-07 → 2026-10: net Sharpe 0.09, PF 1.08, win 46%, 150 trades, mean daily p 0.91; 0 of 13
cells past BH-FDR 10%; per-year 2023/24/25 negative where the entry says every year positive.

The registered rule is "if either flips, the harness is wrong, not the entry". So the question was
whether the harness could reproduce the banked result under the **banked conditions**. Three
control cells were added (after the fact — see the header), each bypassing the point-in-time cut
on one or both legs and applying the original engine's fixed lags (US +2 days, foreign +45 days
from the 1st of the month, latest vintages):

| cell | US leg | foreign legs | OOS Sharpe | PF | win | trades | p |
|---|---|---|---|---|---|---|---|
| banked (doc) | +2d | +45d | 1.14 | 2.19 | 63% | 109 | — |
| **ctl-origlags** | +2d | +45d | **1.29** | **2.98** | **65%** | 136 | 0.002 |
| ctl-uslag-only | +2d | honest asof | 1.10 | 2.36 | 62% | 137 | 0.006 |
| ctl-forlag-only | honest asof | +45d | 0.02 | 1.02 | 46% | 145 | 0.997 |
| honest (gs2-2-126) | honest asof | honest asof | 0.09 | 1.08 | 46% | 150 | 0.91 |
| honest, daily DGS2 leg | close+1h | honest asof | 0.51 | 1.56 | — | 176 | 0.25 |

The harness reproduces the banked sleeve under the banked assumptions. **The whole edge sits on the
US leg's lag assumption.** The store measures the actual lag: GS2 is the *monthly average* of the
2-year yield, dated the 1st of its month and first published by FRED a median **32 days** later
(p10 31, p90 34). Dating it knowable at +2 days means the z-score on, say, 3 January already
contained January's average 2-year yield — the next four weeks of rates. The foreign +45-day
assumption was close to the truth (observed median 42 days, p90 ~61) and, on its own, carries
nothing.

**Decision:** Part A's "done when" is met — the harness reproduces both banked results when fed the
inputs they were built on. What it also found is that one of those inputs was not knowable. This
addendum does not change the entry; Part B does, under its registered bar ("where re-run through the
harness, the re-run clears the entry's own original bar" — it does not). The prediction that
`yield-spread-sleeve` would "survive comfortably" was wrong and is recorded as wrong.

## 4. Consequences Part B must carry

- `yield-spread-sleeve` → `context`, `deflated: { from: 'validated', why: 'lookahead on the GS2 leg' }`.
- Every entry whose evidence runs through the same engine or convention inherits the finding until
  re-run on honest asofs: `multi-spread-sleeve`, `spread-sleeve-factor-audit`, `ys-long-confirm`
  (its script could not be located; its rebuild used monthly rates with an unstated lag), the
  factor-blend entries that used the sleeve's return stream. Each is checked in Part B for which
  US series and lag it used before any status moves.
- The live YieldSpread paper record (since 2026-07) reads FRED's *published* GS2 and therefore
  trades the **honest** version. It is the forward test of Sharpe ~0.1, not ~1.1. Nothing in the
  live engine is edited here (side-by-side rule); the owner decides.
- `MD files/YIELD_SPREAD_STRATEGY.md` §"Publication-lag lookahead" reports that moving from no lag to
  +2/+45 cut Sharpe 2.16 → 1.58 "but the edge held". The remaining lookahead was ~30 days on the US
  leg; the honest number is what the harness reports.
