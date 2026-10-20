# rates-vol-gap — results

Prereg: `forge/RATES_VOL_GAP_PREREG.md` (committed in `5c6c0a5f`, 2026-10-21). Run 2026-10-21, seed 20261021,
B = 2000, block 21 sessions, 400 shift placebos. Branch `main`. Ledger ids: `rates-vol-gap-move`, `rates-vol-gap-state`.
Source of the question: C.OG, *Cross Asset Volatility Analysis* (Issue 07), `education/cross-asset-volatility-analysis/`.

## Verdict: NULL (C1), UNDERPOWERED (C2)

The registered gate for C1 needed five things: a pooled CI above 0, an estimate ≥ +0.05, an estimate above the shift
placebo's 95th percentile, a positive estimate in both halves, and Holm. It met the first three and failed the last two.
- **Pooled:** +0.057 [+0.007, +0.108].
- **Halves:** Explore +0.136, Confirm −0.012.
- **Holm:** p 0.028 against the 0.025 it needed.

Concentration settles it. Without 2020 the estimate is −0.005 [−0.058, +0.047], which rules out the +0.10 effect worth
having. A day ahead, VXN, VXN's percentile, recent realised vol and the FOMC/CPI/NFP calendar already hold what MOVE
knows about Nasdaq vol, except in March 2020.

The lesson's own setup (C2: rates rich and equity cheap, against equity cheap alone) points the wrong way,
−0.07 log [−0.20, +0.07], and it was underpowered by design.

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| C1 MOVE pct → next-session NQ log Parkinson var, pooled | 2,480 sessions | +0.057 | [+0.007, +0.108] | 0.105 | 0.10 | 0.028 (needed 0.025) | NULL (gate failed: Confirm half −0.012, Holm) |
| C2 rates rich & equity cheap vs equity cheap only, next 5 sessions | 203 vs 799 days | −0.070 log | [−0.197, +0.069] | 0.29 log | 0.15 log | 0.30 | UNDERPOWERED |

## Controls

- **Placebo** (MOVE pct circularly shifted ≥ 126 sessions): mean −0.000, 95th pct +0.053. The design is unbiased.
  The C2 placebo was biased before the one-leg match (−0.10 to −0.15) and centred after it (§3 of the prereg).
- **News baseline**: FOMC/CPI/NFP counts in the outcome window, plus weekday, are in every regression.
- **Concentration** (C1, per-year partial corr): 2017 −0.08, 2018 +0.10, 2019 +0.02, **2020 +0.20**, 2021 +0.15,
  2022 −0.10, 2023 −0.07, 2024 −0.17, 2025 +0.19, 2026 −0.06. Five years positive and five negative. Without 2020
  −0.005; without 2022 +0.052.
- **Equity-IV source**: with NQ settlement iv30 as the baseline instead of VXN (2020-10 → 2026-08, n 1,513),
  +0.032 [−0.053, +0.099]. VXN on the same window gives +0.034, so the choice of equity IV changes nothing.

## Deviations from the prereg

A1 (post-hoc, recorded in the prereg) fixes the verdict word for a case the §4 rules left undefined: a pooled CI that
excludes 0 while a gate condition fails. That case gets the protocol's translation, a failed gate on a powered cell = `null`.

## Descriptive (not part of the verdict)

- C1 at the lesson's horizons: next 5 sessions +0.054 [−0.034, +0.144] (Explore +0.15, Confirm −0.03); next 21
  +0.012 [−0.115, +0.153].
- MOVE **level** (ln MOVE) instead of percentile, h1: +0.138 [+0.080, +0.191]. This is not a scored cell. It is
  probably the same 2020/2022 high-MOVE stretch, because the level is persistent and has no within-year
  normalisation. If anyone wants it, it gets its own prereg with a by-year split.
- FOMC-window interaction (does MOVE matter more with an FOMC in the next 5 sessions): partial corr −0.031 over 384
  FOMC windows. No. The lesson's mechanism, rates vol bunched at FOMC dates and leaking into equities, doesn't
  show up a week ahead.
- **Mirror (equity rich, rates cheap)**, next 5 sessions: among days with VXN ≥ its 70th percentile, those with MOVE ≤ its
  30th percentile ran **−0.27 log [−0.39, −0.13]** below baseline, against the other equity-rich days (241 vs 576
  days). That is roughly 24% less realised vol than VXN and the rest of the baseline imply. It is the
  lesson's cross-asset coherence check run the other way round: **an equity-vol spike that rates vol does not
  confirm tends to over-price the next week.** It is descriptive, from a post-hoc look at a mirror cell. It may be
  VXN-spike mean reversion that the linear `vp` term doesn't capture, and it needs its own prereg (with a nonlinear
  VXN control and a by-year split) before anyone uses it.

## What this changes

- The today.html "rate vol high, equity vol calm" divergence and the COG risk gate's 0.6-weight `movePercentile`
  component now have a tested-null evidence row. Show MOVE as context. Don't present it as a lead on Nasdaq vol.
- The rates page (`cog-chart.html`) gains nothing predictive from rates implied vol. A MOVE/VXN readout can sit
  there as context only.
- The one thread worth following is the mirror: unconfirmed equity-vol spikes over-pricing the next week. That needs
  a new prereg on the C.OG coherence-check logic.
- Reopen C1 only with SR3 options data (skew, term-structure steps), which MOVE does not capture, or with a
  pre-2016 Nasdaq source for more history. Either way it needs a new prereg.
