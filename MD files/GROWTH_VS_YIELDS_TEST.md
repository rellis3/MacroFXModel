# Growth stocks vs yields — does a rates shock predict "interesting moves" on Nasdaq?

> **Status: PRE-REGISTERED 2026-09-17, before the first run.** Result section is
> filled in only after the run; nothing above it changes.

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

*(filled in after the run)*
