# pre-release-ranging — results

Prereg: `forge/PRE_RELEASE_RANGING_PREREG.md` (committed in `76c66710`, 2026-11-15). Run 2026-11-15, seed 20261115,
B = 2000 (date-cluster), 1000 date-level label shuffles. Branch `claude/signal-bot-bias-analysis-bwr1qv`.
Ledger id(s): `pre-release-ranging` (cells A-D; bank B and A as the headline, C and D separately if split).
Script: `scripts/pre-release-ranging/run.py` (`--selftest` PASSED; `--power` before the prereg; then the run).

## Verdict: VALIDATED (B pre-release range, A share) · NULL (C Asia break) · UNDERPOWERED (D coiling)

On tier-1 US release days (411 dates 2017-01 → 2026-08, CPI/NFP/PPI/FOMC; 2,359 instrument-days over gold, EURUSD,
GBPUSD, USDJPY, NQ, SPX500) the 07:00 → release window is **narrower than on a matched ordinary day**: −0.104σ
[0.074, 0.134] net of the pseudo-event placebo, against a 0.085σ bar (≈ 12% narrower: 0.73σ vs 0.83σ; t ≈ 6.8). All
six instruments, both halves, every year 2017-2026 (+0.06 to +0.17) are on the same side. The share of the day's
range printed before the release falls from 0.66 to 0.51 (+0.147 [0.128, 0.166] vs a 0.05 bar) — but most of A is
the post-release burst in the denominator (post range 1.35σ vs 0.97σ matched), so A is a desk fact about when the
range is printed, not evidence of ranging on its own. The Asia high/low is still broken before the release on 93% of
event days vs 95% matched (C: +0.015 [0.000, 0.030], Holm p 0.056; the 0.08 bar is ruled out) → NULL. Coiling (D)
came out with the wrong sign (−0.20) on a statistic that is confounded by mixing release clocks; by the registered
positive-control clause it is UNDERPOWERED; within the 13:30 clock alone there is no coiling (see Why).

## Scored cells

| Cell | n (event dates / rows) | Estimate | 95% CI | MDE | Pass bar | Holm p | Gate c1-c6 | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| A share before T (control − event, net of pseudo) | 411 / 2,359 | +0.147 | [+0.128, +0.166] | 0.026 | 0.05 | <1e-10 | all pass | **VALIDATED** |
| B pre-release range, σ | 411 / 2,359 | +0.104σ | [+0.074, +0.134] | 0.054 | 0.085 | 2e-11 | all pass | **VALIDATED** |
| C Asia high/low broken before T | 411 / 2,359 | +0.015 | [+0.000, +0.030] | 0.026 | 0.08 | 0.056 | c1, c2, c3 fail | **NULL** |
| D coiling Δρ (pseudo ρ − event ρ) | 411 / 2,359 | −0.202 | [−0.274, −0.133] | 0.131 | 0.15 | 4e-8 | c2-c5 fail | **UNDERPOWERED** (A1: 1× plant detected 0/40) |

Positive = compression on event days. Halves (<2022 / ≥2022): A +0.120 / +0.175; B +0.111 / +0.096; C +0.019 / +0.011;
D −0.185 / −0.229. Instruments positive: A 6/6, B 6/6, C 5/6, D 0/6.

## Controls (placebo, time shift, news baseline, concentration)

- **Pseudo-event placebo** (821 non-release dates at real release clocks, matched by the same rule): compression ≈ 0
  on every cell (A +0.004, B −0.0002σ, C +0.005), so the matching itself is unbiased; controls' σ ratio 1.00 for both arms.
- **Label shuffle** (event/pseudo labels permuted across dates, 1000×): 97.5th pct A +0.018, B +0.032, C +0.015,
  D +0.080; A and B sit at the 100th percentile; C at the 97th (just inside).
- **Concentration**: B with the top 1% |compression| rows removed stays positive; B by year 2017 +0.17, 2018 +0.12,
  2019 +0.06, 2020 +0.10, 2021 +0.11, 2022 +0.09, 2023 +0.10, 2024 +0.09, 2025 +0.10, 2026 +0.08.
- **σ proxy (lesson #10)**: B with σ60 instead of HAR-800: +0.096σ (same answer).
- **News baseline**: the controls are ordinary weekdays, which include tier-2 data and Thursday claims at 13:30; the
  comparison is tier-1 vs an ordinary day, as registered.

## Why — evidence

Per-cell evidence packs (`<cell>/evidence/EVIDENCE.md`, `placebo.png`, `breakdown.png`, `plants.png`, `buckets.png`,
`sample_rows.csv`):

| Cell | Pack diagnosis | 1× plant detected | Leak canary (labels by realised post-release excess) | Placebo band |
|---|---|---|---|---|
| A | REAL (formal: VALIDATED) | 100% (0.5× too) | +0.147 → +0.240 | [−0.010, +0.011] |
| B | REAL (formal: VALIDATED) | 100% (0.5× too) | +0.104 → −0.088 | [−0.022, +0.019] |
| C | SMALL BUT REAL: above zero, below the useful size | 100% | +0.015 → +0.004 | [−0.014, +0.013] |
| D | UNDERPOWERED (pack): plant sits on a −0.20 wrong-sign baseline | 0% at 1×, 100% at 2× | — | — |

Why it holds (B): the morning before a tier-1 print is narrower in every instrument, both halves and every year, and
the matched placebo is flat, so this is not a matching artefact or a vol-regime effect (controls are σ-matched, and the
result is in σ units). By family: NFP +0.12σ (0.63σ vs 0.76σ), CPI +0.09σ, FOMC +0.23σ (whole day to 19:00), PPI only
+0.03σ (PPI is the weakest of the four, as `event-impact-map` ranks it). At the 08:30-ET clock alone (post-hoc
description): B +0.086σ [0.057, 0.116] — the pre-13:30 morning is ≈ 10.5% narrower (NQ 7%, SPX500 7%, gold 10%,
EURUSD 11%, GBPUSD 9%, USDJPY 16%). The leak canary moves B to −0.09 because days with a big realised release also
had busier mornings — vol clustering, which runs against the claim and still did not erase it.

Why A is mostly the denominator: the selftest's known-zero world (no pre-release change, a 2× first post-release
hour) already showed A at +0.09 "passing". On real data the post window is 1.35σ vs 0.97σ matched, which alone moves
the share; B is the part that is genuinely "the morning is quieter".

Why C fails: the Asia range is small relative to a London morning; 94-95% of ordinary mornings break one side of it
before 13:30, and a 12% narrower morning only removes ~1.5 pp of breaks. The pipeline could see 8 pp (plants 100%).

Why D is not readable: pooling 13:30 and 19:00 rows puts a mechanical negative pre/post relation into the pooled ρ
(a longer pre window = a shorter post window), and the two arms carry different family mixes, so the DiD is −0.20
for reasons that have nothing to do with coiling (prereg A2). Within the 13:30 clock: event ρ +0.055 vs pseudo ρ
+0.076, Δ +0.02 [−0.05, +0.09] — a tight morning does NOT foretell a bigger print; if anything the usual vol
clustering (`fast-start-rest-of-day`) carries through release days unchanged.

## Deviations from the prereg

- A1 (post-hoc, demotion): the registered positive-control clause was not coded; applied → D NULL → UNDERPOWERED.
- A2 (post-hoc, describe): D's pooled statistic is confounded by clock mixing; within-clock numbers are description.
- The evidence pack's own diagnosis for B/A says "ci excludes bar: False" — that check asks whether the CI lies
  entirely below the bar; the formal gate (point ≥ bar plus c1-c6) is the prereg's.

## Descriptive (not part of the verdict)

| | event | matched | (pseudo arm: self / matched) |
|---|---|---|---|
| share of day before T | 0.508 | 0.659 | 0.676 / 0.680 |
| pre range (σ) | 0.726 | 0.830 | 0.846 / 0.846 |
| post range (σ) | 1.350 | 0.971 | 0.932 / 0.912 |
| day 07-21 range (σ) | 1.566 | 1.329 | 1.323 / 1.305 |
| Asia broken before T | 0.930 | 0.950 | 0.944 / 0.949 |

Against the shipped forecast's σ (HAR-800): an ordinary 07:00 → 13:30 morning uses ≈ 0.76σ; on NFP/CPI days ≈ 0.65σ.
Coverage: 2,359 of 2,466 possible event rows scored (SPX500 333/411 — sparse 2017 M1 — the rest ≥ 402).

## What this changes

- **The release-day card may say**: "Tier-1 US data at 13:30: the morning usually runs ~10% narrower than a normal
  morning (in σ), and about half the day's range comes after the print." Valid for NFP and CPI (and FOMC up to 19:00);
  PPI mornings are close to normal. B clears |t| ≥ 3 (t ≈ 6.8), so the line meets the promotion bar for wording.
- **It may NOT say "it'll range until 13:30"** in the sense of a fence: the Asia high/low still breaks before the print
  on ~93% of release days (C NULL). "Narrower", not "range-bound".
- **Never "coiled into the number"**: no sign that a tight morning predicts a bigger release (D; and
  `narrow-day-expansion` NULL agrees).
- Max's going neutral before data fits the size picture (the morning offers ~10% less range, the print most of it),
  but this says nothing about direction or tradability.
- Reopen: a within-clock coiling prereg (D), or pre-2016 M1 to extend the 13:30 per-family cells.
