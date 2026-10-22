# Study 2 — the rubber band: stretch from fair value at three speeds (pre-registration)

Committed 2026-09-30 before any number was computed.

## Background (prior results, from the repo)
- Intraday VWAP band fade (MD files/VWAP_REVERSION_FINDINGS.md): NULL on 26 pairs, gross ≈ 0.
- 60-bar VWAP extension (project memory): gross +0.04–0.15 ATR but 3–8× under cost; the
  edge shrinks as fast as cost does across timeframes.
- Daily OU bands on 4 crosses (MD files/FX_FACTOR_V2_TEST.md §9): OOS Sharpe +0.67 but 22
  trades — underpowered; its own advice is to get power from breadth.
So: one simple rule, three speeds, many instruments, few free choices.

## Instruments (28, local M1 2016 → 2026-08)
The 16 cross-pair instruments (7 USD pairs, 8 crosses, gold) plus 12 more crosses:
AUDNZD, AUDCAD, NZDCAD, CADCHF, EURCAD, EURNZD, GBPAUD, GBPCAD, GBPNZD, GBPCHF, AUDCHF, NZDJPY.

## Fair value, stretch and trade (fixed; σ = the day's forecast σ from js/voteAtlasV4Lines.js)
| speed | fair value (known before the decision) | decision times | stretch z | hold |
|---|---|---|---|---|
| **S1 intraday** | London-day VWAP of bars before the decision | 08:00–16:00 London, on the hour | (price − FV) ÷ (σ·open) | 2 hours |
| **S2 swing** | mean of the previous 5 London days' closes | 07:00 London daily | (price − FV) ÷ (σ·open) | to that day's close |
| **S3 slow** | mean of the previous 20 London days' closes | 07:00 London daily | (price − FV) ÷ (σ·open·√5) | 5 London days |
Price = close of the bar before the decision; the trade fills at the decision bar's OPEN.
**Trade:** if |z| ≥ 2, fade toward fair value; exit at the hold time (no stop, no target —
no path choices). One open trade per instrument per speed. Return in units of σ·open, net of
`costForPair` (round trip).

## Also measured (descriptive, no pass rule)
Per instrument and speed: the slope of the forward return over the hold on z (how much of the
stretch comes back), and the "reversion-to-cost ratio" at |z| = 2.

## The big-day switch (secondary, reported only)
For the instruments with walk-forward day-size forecasts (EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF,
USDJPY, gold; 2023–2026), S1 trades are split by predicted big day (model q75 > log(hl75/hl50))
vs not.

## Pass (per speed; three speeds tested → t bar raised to 2.4)
No parameter is fitted, so the whole sample is out of sample for the rule. A speed PASSES if, pooled
across the 28 instruments: mean net return > 0 with t ≥ 2.4 in BOTH 2016–2022 and 2023–2026-08,
AND positive on at least 17 of 28 instruments over the full period.

## Causality
The builder aborts unless sampled decisions' fair value, stretch and entry price are identical when
the decision bar and everything after it are replaced with a different random walk.
