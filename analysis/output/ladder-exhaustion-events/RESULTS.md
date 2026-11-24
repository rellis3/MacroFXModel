# ladder-exhaustion-events: results

Prereg: `forge/LADDER_EXHAUSTION_EVENTS_PREREG.md` (pushed 925f2aaf before scoring). Seed 20261124, B = 2000,
63-session date-aligned blocks. Scripts `scripts/ladder-exhaustion-events/{events.py, race.py}`; numbers
`results.json`; log `report.txt`; tables `event_widths.csv` (per instrument), `event_widths_pooled.csv` (by class),
`hit_rates_layered.csv`.

40 OANDA CFDs, lines HL, OH, OL, Close+ (up-close days), Close− (down-close days), scored 2020 → 2026-08-21.
Exhaustion score = pinball loss of the p50/p75/p90 levels against the actual (at p50, half the absolute error).

Controls: realised lines reproduce the build on 100% of sessions for all 40; the QLIKE picks reproduce the live CFD
export's picks on 100% of line-years; calendar sanity as registered (Fed decisions on Wednesdays 98/104, payrolls
Fridays 147/155).

A reporting bug in the first run's per-instrument H2 line (it summed the unknown-calendar sessions on one side only)
was fixed and the study re-run with the same seed; the bootstrap and both verdicts were unaffected and are identical.

## H1, pick each line's calc by exhaustion score instead of QLIKE: **NULL**

| | Δ pinball (pinball pick vs QLIKE pick) |
|---|---|
| All years | −0.12% [−0.20, −0.05] |
| 2020–22 | −0.18% [−0.31, −0.03] |
| 2023–26 | −0.05% [−0.10, +0.00] |

The two rules pick a different calc on 40% of line-years, but the calcs they swap between land the levels almost
equally well: the gain is a tenth of a percent, under the registered 0.5% bar. **The QLIKE per-line picks already
forecast the high / low / close levels as well as anything picked for that purpose. Keep them.** Every line
−0.2% to 0.0%; no instrument better by more than 1.5%.

## H2, event-day widths per line on top of each line's calc: **UNDERPOWERED** (leaning, strong on central banks and FOMC)

| | Δ pinball (layer vs none) | Placebo (calendar shifted 5 sessions) |
|---|---|---|
| All years | **−0.45% [−0.65, −0.24]** | +0.15% [+0.06, +0.24] |
| 2020–22 | −0.18% [−0.37, +0.01] | +0.25% |
| 2023–26 | **−0.79% [−1.09, −0.44]** | +0.01% |

The real calendar helps and the wrong-day calendar makes it worse, so the gain is from the events, not from the
extra parameters. 2020–22 just crosses zero, so the registered word is UNDERPOWERED. 30 of 40 instruments improve;
by line, HL gains most (−1.40%; the other lines −0.2%).

**By event type** (on that type's days only):

| Day type | Δ pinball | Both halves? |
|---|---|---|
| **Central-bank decision** (own currency, not Fed) | **−6.13% [−6.79, −4.99]** | yes (−5.9%, −5.9%); 28 of 29 instruments better |
| **FOMC** | **−1.55% [−2.07, −0.92]** | yes (−1.1%, −2.1%) |
| NFP | −0.08% [−0.51, +0.43] | no effect |
| US CPI | +0.05% [−0.60, +1.06] | no effect |
| Tier-1 other (CPI/jobs/GDP/retail/PCE/ISM) | +0.12% [+0.03, +0.21] | slightly worse (noise) |
| Day after a big release | +0.58% [−0.32, +1.23] | no effect |
| No release | −0.23% [−0.61, +0.07] | — |

**The layer is too timid where it matters.** Even with it, central-bank days still beat the p50 58% of the time and the
p90 19% (should be 50% / 10%); FOMC 57% / 15%; NFP 55% / 14%; CPI 54% / 13%. Ordinary and no-release days sit at
50% / 10–11%. The shrinkage toward the all-day width (n / (n + 40), with ~8–12 decisions a year) holds the event
widths back.

## The owner's table: how much wider each line runs on event days

Width on that day type ÷ all-day width (median over instruments, full fit 2018 → 2026-08-21, the line's own QLIKE
calc). p50 / p90. Full per-instrument table in `event_widths.csv`.

| FX (28) | HL | Open-High | Open-Low | Close+ | Close− |
|---|---|---|---|---|---|
| Central bank | ×1.33 / ×1.36 | ×1.30 / ×1.34 | ×1.36 / ×1.34 | ×1.51 / ×1.36 | ×1.45 / ×1.31 |
| US CPI | ×1.13 / ×1.14 | ×1.10 / ×1.15 | ×1.08 / ×1.06 | ×1.09 / ×1.14 | ×1.09 / ×1.06 |
| FOMC | ×1.10 / ×1.03 | ×1.13 / ×0.98 | ×1.10 / ×1.01 | ×1.11 / ×1.06 | ×1.22 / ×1.08 |
| NFP | ×1.09 / ×1.03 | ×1.05 / ×1.09 | ×1.06 / ×1.05 | ×1.04 / ×1.05 | ×1.06 / ×1.03 |
| Day after | ×0.92 / ×0.95 | ×0.86 / ×0.89 | ×0.97 / ×0.98 | ×0.88 / ×0.88 | ×0.89 / ×0.91 |
| No release | ×0.94 / ×0.92 | ×0.94 / ×0.93 | ×0.94 / ×0.91 | ×0.94 / ×0.91 | ×0.91 / ×0.91 |

| Indices (6) | HL | Open-High | Open-Low | Close+ | Close− |
|---|---|---|---|---|---|
| FOMC | ×1.21 / ×1.11 | ×1.25 / ×1.16 | ×1.03 / ×1.05 | ×1.34 / ×1.12 | ×1.18 / ×1.12 |
| US CPI | ×1.16 / ×1.08 | ×1.15 / ×1.15 | ×1.15 / ×0.98 | ×1.21 / ×1.15 | ×0.93 / ×0.98 |
| NFP | ×1.12 / ×1.05 | ×1.16 / ×1.13 | ×1.14 / ×1.07 | ×1.31 / ×1.09 | ×1.15 / ×1.08 |
| No release | ×0.95 / ×0.97 | ×0.91 / ×0.95 | ×1.00 / ×0.98 | ×0.92 / ×0.93 | ×0.96 / ×0.99 |

| Metals / energy (6) | HL | Open-High | Open-Low | Close+ | Close− |
|---|---|---|---|---|---|
| FOMC | ×1.12 / ×1.05 | ×1.20 / ×1.03 | ×1.04 / ×1.21 | ×1.26 / ×1.04 | ×1.04 / ×1.12 |
| US CPI | ×1.04 / ×0.99 | ×1.31 / ×1.12 | ×0.83 / ×0.88 | ×1.17 / ×1.02 | ×0.87 / ×0.91 |
| NFP | ×1.05 / ×1.14 | ×1.14 / ×1.11 | ×0.86 / ×1.00 | ×1.16 / ×1.10 | ×1.00 / ×1.18 |

Index and metals cells are 6 instruments with ~80 events each (≈ 400–700 instrument-days): read the direction, not the
second decimal. CPI and NFP days do run 5–15% wider, but the layer could not turn that into better levels out of
sample; central-bank and FOMC days are where the extra width reliably lands.

## What it changes

- **H1 NULL:** the CFD (and futures) exports keep their QLIKE per-line picks. Picking for exhaustion directly gives
  the same levels.
- **H2 UNDERPOWERED:** no event widths on the export yet (the bar was both halves). The live ladder is unchanged.
- **Reusable candidate for a follow-up prereg (not a result):** an event layer of **central-bank + FOMC days only**,
  with **less shrinkage**, because those two buckets carry the whole gain in both halves, the rest add noise, and
  the layered p90 still under-covers them (19% / 15%). That is chosen after seeing these results, so it needs its own
  prereg and the forward sessions since 2026-08-21 to judge.
