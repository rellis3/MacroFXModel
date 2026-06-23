# Forecaster Optimizer — Saved Results Log

Optimizer results live only in an in-memory JS array (`optResults` in
`forecaster-backtest.html`) — nothing is persisted to disk or
localStorage, so a page reload loses every trial. This file is a manual
archive of result sets worth keeping, so we don't have to re-run the
(slow, system-intensive) sweep just to look something up again.

Append new runs below with a date header, the run settings if known, and
the raw top-25 table. Pair/date-range/trial-count were not captured for
the first entry below (user pasted the results table only).

---

## 2026-06-23 — run #1 (objective: P&L%)

Sorted by raw cumulative P&L% (`optObjective = totalPnl`) — **not**
risk-adjusted. Pair, date range, and trial count not recorded.

| # | Score | P&L% | Sharpe | PF | Win% | MaxDD% | Trades | Config |
|---|------:|-----:|-------:|---:|-----:|-------:|-------:|--------|
| 1 | 40.05 | 40.05% | 1.58 | 1.11 | 51.0% | 28.82% | 6096 | DirOpen · SL:Pips 79 · TP:Trail 10%@2.1R · BE@4.2R · Stop@0.05ATR+0.05slip · conc/cd16 · MaxLv9 · 12-15h |
| 2 | 35.08 | 35.08% | 1.08 | 1.08 | 34.8% | 41.44% | 6588 | DirOpen · SL:MAEcal P73/490 · TP:None · BE@0.4R · \|MomZ\|≥1.3 · Stop@0.00ATR+0.05slip · conc/cd113 · MaxLv9 · 1-17h |
| 3 | 22.40 | 22.40% | 0.55 | 1.03 | 47.3% | 21.98% | 7230 | Reversal · SL:MAEcal P79/80 · TP:Trail 10%@2.3R · BE@3.7R · \|MomZ\|≥1.3 · conc/cd180 · MaxLv8 · 0-21h |
| 4 | 22.00 | 22.00% | 0.64 | 1.04 | 56.2% | 22.07% | 6925 | Reversal · SL:Pips 63 · TP:Trail 30%@0.4R · BE@1.0R · \|MomZ\|≥1.2 · conc/cd359 · MaxLv10 · 5-22h |
| 5 | 18.96 | 18.96% | 0.93 | 1.11 | 46.2% | 15.54% | 1903 | DirOpen · SL:MAEcal P80/330 · TP:Trail 45%@2.0R · BE@0.9R · \|MomZ\|≥1.8 · Stop@0.35ATR+0.01slip · conc/cd483 · MaxLv3 · 8-20h |
| 6 | 16.39 | 16.39% | 1.62 | 1.64 | 53.9% | 4.80% | 243 | DirOpen · SL:Pips 149 · TP:None · BE@1.6R · \|MomZ\|≥3.4 · Stop@0.10ATR+0.14slip · conc/cd10 · MaxLv4 · 7-20h |
| 7 | 15.86 | 15.86% | 1.72 | 1.50 | 61.9% | 3.70% | 402 | DirOpen · SL:MAEcal P80/340 · TP:R×4.0+Trail 35% · BE@0.7R · \|MomZ\|≥3.2 · Stop@0.20ATR+0.06slip · conc/cd371 · MaxLv9 · 5-23h |
| 8 | 15.62 | 15.62% | 0.43 | 1.02 | 50.3% | 20.49% | 8327 | Reversal · SL:Pips 262 · TP:None · BE@1.4R · \|MomZ\|≥0.6 · conc/cd484 · MaxLv9 · 10-16h |
| 9 | 13.96 | 13.96% | 0.50 | 1.03 | 49.5% | 12.08% | 5616 | Reversal · SL:MAEcal P84/450 · TP:None · BE@1.9R · \|MomZ\|≥0.7 · conc/cd218 · MaxLv7 · 12-17h |
| 10 | 13.95 | 13.95% | 2.09 | 2.72 | 70.5% | 1.46% | 88 | DirOpen · SL:Pips 78 · TP:R×4.3 · BE@2.4R · \|MomZ\|≥4.0 · Stop@0.20ATR+0.25slip · conc/cd344 · MaxLv6 · 7-23h |
| 11 | 10.41 | 10.41% | 1.35 | 1.70 | 50.0% | 2.03% | 152 | DirOpen · SL:ATR×5.8/30m · TP:R×8.5+Trail 25% · BE@4.7R · \|MomZ\|≥3.3 · Stop@0.60ATR+0.04slip · conc/cd495 · MaxLv7 · 8-17h |
| 12 | 9.50 | 9.50% | 0.40 | 1.04 | 46.5% | 11.56% | 2456 | Reversal · SL:ATR×4.7/30m · TP:Trail 90%@2.1R · BE@0.6R · \|MomZ\|≥1.8 · conc/cd53 · MaxLv2 · 9-22h |
| 13 | 9.38 | 9.38% | 1.50 | 1.34 | 77.4% | 3.62% | 907 | DirOpen · SL:MAEcal P86/460 · TP:Trail 10%@0.1R · BE@2.7R · \|MomZ\|≥2.4 · Stop@0.35ATR+0.01slip · conc/cd292 · MaxLv5 · 10-22h |
| 14 | 8.22 | 8.22% | 1.84 | 2.31 | 51.5% | 1.56% | 97 | DirOpen · SL:Pips 21 · TP:Trail 50%@1.6R · BE@4.6R · \|MomZ\|≥3.6 · Stop@0.40ATR+0.11slip · conc/cd442 · MaxLv5 · 1-14h |
| 15 | 7.73 | 7.73% | 0.69 | 1.13 | 40.6% | 3.33% | 731 | Reversal · SL:MAEcal P66/210 · TP:None · BE@1.5R · \|MomZ\|≥2.0 · 1@time · MaxLv10 · 9-21h |
| 16 | 7.10 | 7.10% | 0.54 | 1.10 | 48.1% | 5.04% | 692 | Reversal · SL:MAEcal P78/450 · TP:R×8.2 · \|MomZ\|≥1.4 · 1@time · MaxLv5 · 4-18h |
| 17 | 6.97 | 6.97% | 1.33 | 2.25 | 67.2% | 1.32% | 61 | DirOpen · SL:Pips 196 · TP:Trail 90%@2.3R · BE@3.0R · \|MomZ\|≥3.6 · Stop@0.95ATR+0.09slip · 1@time · MaxLv5 · 10-20h |
| 18 | 6.85 | 6.85% | 1.03 | 1.48 | 56.4% | 2.45% | 156 | DirOpen · SL:MAEcal P82/120 · TP:R×9.4+Trail 85% · BE@2.9R · \|MomZ\|≥3.3 · Stop@0.90ATR+0.01slip · conc/cd314 · MaxLv1 · 1-19h |
| 19 | 6.84 | 6.84% | 0.24 | 1.02 | 42.2% | 33.12% | 3905 | DirOpen · SL:MAEcal P79/150 · TP:R×1.6+Trail 40% · BE@0.5R · \|MomZ\|≥0.7 · Stop@0.10ATR+0.01slip · conc/cd499 · MaxLv5 · 7-17h |
| 20 | 6.78 | 6.78% | 1.25 | 2.24 | 48.5% | 1.34% | 68 | Reversal · SL:ATR×3.1/30m · TP:None · BE@0.8R · \|MomZ\|≥3.9 · Stop@0.95ATR+0.14slip · conc/cd263 · MaxLv4 · 3-20h |
| 21 | 6.71 | 6.71% | 1.62 | 1.65 | 48.7% | 1.16% | 187 | DirOpen · SL:Pips 14 · TP:Trail 10%@1.3R · BE@3.9R · \|MomZ\|≥3.2 · Stop@0.55ATR+0.04slip · conc/cd53 · MaxLv10 · 12-22h |
| 22 | 6.48 | 6.48% | 2.15 | 1.84 | 57.6% | 1.05% | 408 | DirOpen · SL:ATR×4.6/30m · TP:OppLvl, Trail≥15h · BE@3.2R · \|MomZ\|≥1.5 · Stop@0.15ATR+0.01slip · conc/cd34 · MaxLv10 · 11-12h |
| 23 | 6.21 | 6.21% | 0.66 | 1.19 | 42.3% | 7.93% | 305 | DirOpen · SL:ATR×2.9/30m · TP:None · BE@3.0R · \|MomZ\|≥3.0 · Stop@1.00ATR+0.07slip · conc/cd130 · MaxLv1 · 5-17h |
| 24 | 5.90 | 5.90% | 0.97 | 1.57 | 56.6% | 1.68% | 99 | DirOpen · SL:Pips 219 · TP:R×6.3 · BE@3.3R · \|MomZ\|≥3.4 · Stop@0.95ATR+0.13slip · 1@time · MaxLv8 · 0-22h |
| 25 | 5.66 | 5.66% | 1.31 | 1.92 | 62.3% | 1.33% | 77 | DirOpen · SL:MAEcal P97/280 · TP:OppLvl, Trail≥12h · BE@4.6R · \|MomZ\|≥3.8 · Stop@0.85ATR+0.27slip · conc/cd242 · MaxLv?? · ??-??h *(row truncated in source paste — MaxLv/hours unconfirmed)* |

### Review

This run used **raw P&L% as the objective**, which is the likely reason
it "feels rubbish": cumulative return scales with trade count, so the
search rewards high-frequency churn over real per-trade edge. The top of
this table shows it clearly —

- **#1–4, #8, #9, #12, #15, #16, #19, #23** combine weak Sharpe (most
  under 1.0, several under 0.5) with either huge trade counts
  (5,600–8,300) or large drawdowns (12–41%). #2 and #19 are the worst
  offenders: Sharpe 1.08/0.24 with 33–41% max drawdown — these are
  overfit/overtrading artifacts, not durable edges.

- **The actually interesting configs are buried lower in this same
  list**, because they trade less often and so score worse on raw P&L%
  despite far better risk-adjusted numbers:
  - **#22** — Sharpe 2.15, PF 1.84, Win 57.6%, MaxDD 1.05%, 408 trades
  - **#10** — Sharpe 2.09, PF 2.72, Win 70.5%, MaxDD 1.46%, 88 trades
  - **#14** — Sharpe 1.84, PF 2.31, Win 51.5%, MaxDD 1.56%, 97 trades
  - **#17** — Sharpe 1.33, PF 2.25, Win 67.2%, MaxDD 1.32%, 61 trades
  - **#7** — Sharpe 1.72, PF 1.50, Win 61.9%, MaxDD 3.70%, 402 trades
  - **#6** — Sharpe 1.62, PF 1.64, Win 53.9%, MaxDD 4.80%, 243 trades
  - **#13** — Sharpe 1.50, PF 1.34, Win 77.4%, MaxDD 3.62%, 907 trades

  These have the profile worth following up on: positive PF well above
  1, Sharpe > 1.3, single-digit drawdown, trade counts that are plausible
  rather than alarming.

**Suggestion for next time (no extra sweep required):** switch
`optObjective` to `sharpe` or `calmar` before running — that sorts on
risk-adjusted return directly, so configs like #22/#10/#14 above land
near the top instead of being buried under overtrading noise. That's a
smarter run, not a bigger one.

### Verdict — is any of this actually good?

Not all bad, but none are deploy-ready. **#22 is the pick of the batch**:
Sharpe 2.15 / PF 1.84 / MaxDD 1.05% on 408 trades — the only entry in the
high-Sharpe cluster with a trade count large enough that the numbers
aren't mostly noise (#10/#14/#17 post flashier Sharpe/PF but on only
60–100 trades, which is too thin to trust on its own).

Two caveats even on #22:
- The **11-12h entry window** is a single random-search hour slot — that
  smells like curve-fit to this dataset rather than a real session
  effect. Test whether the edge survives widening it (e.g. 10-13h); if
  Sharpe collapses, it was noise.
- **Every row in this table is in-sample** — best-of-N random trials
  judged on the same data used to rank them. That's classic
  multiple-comparisons bias. None of these are proven.

Cheapest next step, no optimizer re-run needed: Apply #22, then
`▶ Load & Run` against a date range (or pair) it wasn't selected on. If
Sharpe/PF hold up out-of-sample, it's real; if they evaporate, it wasn't.
