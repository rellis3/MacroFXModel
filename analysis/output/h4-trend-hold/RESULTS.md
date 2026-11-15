# h4-trend-hold: 07:00 entry on the 4h trend, 21:00 review, vs Max Cole

**EXPLORATORY, not pre-registered** (owner 2026-11-14). OANDA H1 mid from the dashboard feed, 13 instruments (gold, 9 FX, NAS100/SPX500/US30), 2026-02-26 to 2026-11-12. 1R = 1 daily σ stop; 0.03R cost per round trip. Rule and readings in the script docstring. Aggregates only.

## All instruments, every weekday

| Window | Variant | Trades | Total R | Mean R [±1 SE] | Win | Avg nights held | Gold / FX / Indices mean R |
|---|---|---|---|---|---|---|---|
| pre-lockbox (2026-02-26 → 2026-08-20) | DAY | 1637 | -68.2 | -0.042 [±0.025] | 44% | +0.0 | +0.041 / -0.057 / -0.024 |
| pre-lockbox (2026-02-26 → 2026-08-20) | HOLD | 856 | -91.9 | -0.107 [±0.052] | 31% | +0.9 | -0.037 / -0.100 / -0.151 |
| lockbox-to-max (2026-08-21 → 2026-10-06) | DAY | 429 | +3.6 | +0.008 [±0.050] | 44% | +0.0 | -0.238 / +0.003 / +0.108 |
| lockbox-to-max (2026-08-21 → 2026-10-06) | HOLD | 185 | +22.3 | +0.120 [±0.126] | 36% | +1.3 | -0.493 / +0.310 / -0.214 |
| max-period (2026-10-07 → 2026-11-12) | DAY | 351 | -32.1 | -0.091 [±0.054] | 45% | +0.0 | +0.124 / -0.117 / -0.087 |
| max-period (2026-10-07 → 2026-11-12) | HOLD | 181 | -55.4 | -0.306 [±0.090] | 29% | +0.7 | -0.117 / -0.377 / -0.171 |

## Head to head on Max's instrument-days (his first signal per instrument per day, crypto excluded)

| Variant | Instrument-days | Our R (total, mean) | Max first signal R (total, mean) | Max all signals that day (total) | Same side |
|---|---|---|---|---|---|
| DAY | 49 | -0.9, -0.018 | +10.6, +0.216 | +7.2 | 84% |
| HOLD | 26 | -6.5, -0.250 | +16.6, +0.638 | +15.1 | 81% |

Max's whole record on these instruments over the period (every filled signal): 86 trades, +7.2R, mean +0.084R.

## Reading (exploratory)

- **The 4h trend on its own loses.** Over every weekday on 13 instruments it loses in the longest window, before the
  lockbox date (−0.04R a trade, day only), and in Max's five weeks (−0.09R). It is around zero between them.
- **Holding overnight is worse**, not better: −0.11R and −0.31R a trade. The 21:00 "still the same trend" check keeps
  trades open into reversals, and the win rate falls to about 30%.
- **On the days Max traded, he beats the rule although he picks the same side about 84% of the time.**
  - Day-only: same 49 instrument-days, −0.9R for us vs +10.6R for his first signals.
  - Hold: 26 days, −6.5R vs +16.6R.
  - So his edge is not *which way*. It is **which days and markets he picks, when he gets in, and how he gets out**:
    his trades are at market around London, with his own stops, closes and swings.
- **What this changes**:
  - Our trend-following bias, traded mechanically from 07:00, does not beat Max. On this evidence it should not
    replace his signals.
  - The direction call alone (his or ours) is not where the money is. Timing and selection are.
  - The bias-scoreboard keeps `h4-trend` as a forecaster, and it should score below Max on R even where it ties him on
    direction.
- Limits: OANDA mid prices, a fixed 0.03R cost, a stop at 1 daily σ, nine months, one rule (the reading that matched
  Max). The window after 2026-08-21 is the lockbox and is reported for comparison only. Not a validated result.

## Evidence pack (2026-11-15)

Diagnostics only (register row `evidence-pack-retrofit`, EXPLORATORY); the verdict above does not change. Built by `scripts/h4-trend-hold/evidence.py` with the shared `scripts/evidence_pack/pack.py`.

**Different data from the study.** The dashboard H1 candles are not in this checkout, so this pack runs the study's own `simulate()` (imported unchanged) on local M1 mid resampled to H1, 13 instruments, 2016-01-27 → 2026-08-20 (M1 cut at 21:00 London on 2026-08-21; nothing later read): 35,545 DAY trades and 16,719 HOLD trades, against 1,637 / 856 in the study. The study had no pass bar, so +0.05 R (the bar of exit-on-fixed-entries, same 07:00 entry) is used. DAY is exact: each entry is also simulated with the slope forced long and forced short on the same path. HOLD's opposite side is approximated (wrong for stopped trades), so its placebo is rough. How to read it: (1) **DAY** −0.015 R [−0.032, +0.003]. A planted +0.05 R is found 100% of the time, so a useful edge is ruled out. A random side on the same entries does about as well (−0.019 R mean, real at the 75th pct). 11 of 13 instruments are negative, both halves negative, 7 of 11 years negative. The slope adds nothing over a coin flip. (2) **HOLD** +0.010 R [−0.028, +0.047]: also FLAT against the bar. But over ten years it is NOT worse than DAY, unlike the study's 2026 window (−0.107 R ±0.052). That reading looks like a short-window result. HOLD is positive in H1 (+0.028) and negative in H2 (−0.007), and goes to −0.069 R without the top 1% of trades, so it rests on a few long holds (gold +0.10 R). (3) Buckets: long-slope entries do better than short-slope ones in both variants, the same long-only asymmetry as exit-on-fixed-entries E1.

| Cell | Diagnosis | Estimate [95% CI] | Bar | Planted 0.5×/1×/2× found | Shuffle pct | Halves H1 / H2 | Inst. same sign | Top-1% removed | Canary (leaked) | Charts |
|---|---|---|---|---|---|---|---|---|---|---|
| DAY | **FLAT** | -0.0153 [-0.0322, +0.00325] | +0.05 | 0%/100%/100% | 75 | -0.0108 / -0.0198 | 85% | ✓ | +0.733 | [placebo](evidence/DAY/placebo.png) · [buckets](evidence/DAY/buckets.png) · [breakdown](evidence/DAY/breakdown.png) · [plants](evidence/DAY/plants.png) · [pack](evidence/DAY/EVIDENCE.md) |
| HOLD | **FLAT** | +0.0103 [-0.0282, +0.0466] | +0.05 | 43%/100%/100% | 100 | +0.0277 / -0.00701 | 54% | ✗ | +1.16 | [placebo](evidence/HOLD/placebo.png) · [buckets](evidence/HOLD/buckets.png) · [breakdown](evidence/HOLD/breakdown.png) · [plants](evidence/HOLD/plants.png) · [pack](evidence/HOLD/EVIDENCE.md) |
