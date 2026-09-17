# Growth stocks vs yields — does a rates shock predict "interesting moves" on Nasdaq?

> **Status: PRE-REGISTERED 2026-09-17 (commit 9e24f44), run the same day.
> Verdict: the range effect is real, but it is Nasdaq's own down-week, not
> yields.** S1 passes (+0.15 ATR) and so does its yield-mirror S4 (+0.24); S2 and
> S3 fail in opposite yield directions. A post-hoc check with rates QUIET gives
> the same +0.19. Yields add nothing identifiable. Banked as: after a Nasdaq
> down-week the next session runs ~20% wider; the yield leg stays descriptive.

## The claim

From an educator (COG), 2026-09-16: *"We're seeing opposing moves between growth
stocks and the yield and bond markets. Usually when this happens you could see
some interesting moves on Nasdaq."*

Read literally: when yields have moved sharply and growth stocks have moved
against them, Nasdaq's next session(s) are unusually eventful. "Interesting
moves" is a claim about **range**, not direction, so that is what is tested.
The sign relationship is ambiguous in the wording (stocks against *bonds* is the
normal risk-on pairing; stocks against *yields* is the textbook discount-rate
pairing), so both are tested as separate setups and neither is privileged.

This repo has already banked one nearby null: yields → indices forward coupling
is null (real but same-bar only, 2026-08-23). That was direction. This is range.

## Design, frozen before the first run

| | |
|---|---|
| data | NAS100_USD daily (OANDA, session-dated, as far back as the API gives); DGS10 and DFII10 daily (FRED, keyless CSV). Merged on shared dates. |
| features at day t | yΔ5 = 10Y change over 5 trading days (bp); nqR5 = Nasdaq 5-day log return (%) |
| S1 textbook | yΔ5 ≥ +10bp AND nqR5 ≤ −1% (rates up, growth down) |
| S2 divergent | yΔ5 ≥ +10bp AND nqR5 ≥ +1% (rates up, growth up anyway) |
| S3 textbook, mirror | yΔ5 ≤ −10bp AND nqR5 ≥ +1% |
| S4 divergent, mirror | yΔ5 ≤ −10bp AND nqR5 ≤ −1% |
| primary outcome | next-day range (H−L)/ATR14, ATR measured at t |
| secondary | next-5-day realised range (max H − min L over t+1..t+5)/ATR14 |
| exploratory, no pass bar | next-day absolute return; next-5-day return sign |
| control | one non-setup day per setup day: different ISO week, same ATR-percentile quintile (ATR14/close, trailing 250-day rank), same 20-day trend tercile; not itself inside any setup |
| statistic | paired mean difference; ISO-week block bootstrap, 1000 reps, 95% CI |
| pass | primary difference ≥ +0.10 ATR with the CI clear of zero, in S1 or S2 (the two COG's wording most plausibly means). S3/S4 reported, not scored. |
| robustness | R1: 2018-01-01 onward only · R2: thresholds 15bp / 2% · R3: DFII10 (real yield) in place of DGS10 |
| population audit | number of days at each filter step, so a thin setup cannot pass on a handful of samples (n < 40 = not scored) |

Script: `analysis/growth_vs_yields_study.mjs`. Run from this PC; the OANDA key is
read from `C:/QuantLab/lib/config.py` into the environment and never printed.

## What a pass would change

A pass would earn the relationship a **~ context** row in "The chain, today"
(real yields → growth stocks) that is allowed to say "range tends to widen".
A null earns the same row but the read stays descriptive: it says what the two
did, never what Nasdaq does next.

## Result

Population 4,730 days (2008-07-23 → 2026-09-09, NAS100_USD × DGS10), unconditional
next-day range 1.02 ATR. Every setup found a control; nothing was below MIN_N.

| setup (5-day window) | n | next-day range diff [95% CI] | next-5d range diff | verdict |
|---|---|---|---|---|
| S1 rates up ≥10bp, growth down ≤−1% | 224 | **+0.150 [+0.058, +0.248]** | +0.34 | pass |
| S2 rates up ≥10bp, growth up ≥+1% | 396 | −0.171 [−0.237, −0.106] | −0.43 | null (narrower) |
| S3 rates down ≤−10bp, growth up ≥+1% | 221 | −0.186 [−0.279, −0.104] | −0.49 | null (narrower) |
| S4 rates down ≤−10bp, growth down ≤−1% | 344 | **+0.235 [+0.141, +0.343]** | +0.47 | pass |

Robustness: R1 (2018+) S1 +0.20, S4 +0.36, both pass; R2 (15bp/2%) S1 +0.12 with the
CI touching zero, S4 +0.31 pass; R3 (real yield) S1 +0.23, S4 +0.24, both pass.

**What separates pass from null is the sign of Nasdaq's own week, not the yield.**
The two passes have opposite yield moves; so do the two nulls. Post-hoc, labelled
as such:

| | n | next-day range diff |
|---|---|---|
| growth down ≤−1%, rates QUIET (\|Δ5\| < 5bp) | 356 | **+0.185 [+0.118, +0.262]** |
| growth down ≤−1%, any rates | 1,232 | **+0.228 [+0.184, +0.276]** |
| growth up ≥+1%, rates quiet | 766 | −0.112 [−0.162, −0.059] |
| rates up ≥10bp, growth FLAT | 241 | +0.055 [−0.019, +0.142] — null |

Rates alone, with Nasdaq flat, do nothing. Nasdaq down a percent on the week,
with rates doing nothing, does the whole job. This is the familiar equity-vol
asymmetry (sell-offs cluster, rallies calm), wearing a yields costume.

## What this changes on the page

- "The chain, today" gets the **real yields → growth stocks** link as **~ context**:
  it says what the two did (and today's break, if any), never what Nasdaq does next.
- The Nasdaq card gets a **✓ validated** chip when NAS100 is down ≥1% on the week:
  *next session tends to run ~20% wider (+0.19–0.23 ATR; 2018+ holds; n > 1,200)*.
  A statement about RANGE, never direction — the exploratory 5-day up-share after
  a down-week is 58%, which is a base rate, not a signal.
- COG's sentence is half right: "interesting moves on Nasdaq" after a down-week,
  yes. "Because of the opposing move with yields", no — the yield leg is a passenger.
