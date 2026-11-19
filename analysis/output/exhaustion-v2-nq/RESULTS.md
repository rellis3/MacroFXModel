# exhaustion-v2-nq — results

Prereg: `forge/EXHAUSTION_V2_NQ_PREREG.md` (2026-11-19; A1 pre-results: real touch counts).
Run 2026-11-19, seed 20261119, B = 2000, 63-session blocks. Scripts `scripts/exhaustion-v2/{touches,score}.py`.
Numbers `results.json`, log `report.txt`, extraction check `check.txt`. Ledger: `exhaustion-v2-nq`, `exhaustion-v2-nq-fut`.

## Verdict: VALIDATED (C and F)

After NQ first touches one of the day's ladder lines (OH, OL, OC, projected high/low; p50/75/90 on the ladder-v2-nq
har_rv_log lines), the chance of travelling further (to the next rung, or 0.25σ) by 22:00 London is far better
forecast with the clock than by the plain ladder odds. Walk-forward test years 2019 → 2026-08-21.

| | CFD | Futures |
|---|---|---|
| Sessions / touches (next rung · 0.25σ) | 1,730 / 7,584 · 8,475 | 1,703 / 7,434 · 8,307 |
| Calibration miss, plain ladder odds X0 | 10.59pp | 10.10pp |
| Calibration miss, chosen X7 (logistic blend) | **3.37pp** | **3.24pp** |
| Best calibrated, X4 (vol clock + day hot/cold), tied | 2.73pp | 2.73pp |
| Chosen − X0, winner re-selected per draw, 90% CI | [−8.31, −4.97] | [−8.15, −4.58] |
| Log loss chosen ÷ X0, 90% CI | 0.940 [0.929, 0.961] | 0.943 [0.935, 0.971] |
| Noise floor p90 / calibrated to noise | 2.51 / no | 2.53 / no |
| Both halves, 5 stress windows out, fault days out | all below 0 | all below 0 |

Positive control (synthetic Brownian sessions on the real vol clock): X2 scores 2.22pp against a floor p90 of 2.35,
so it reads as calibrated. X0 misses one time bucket by 13.8pp. The scorer recovers both.

## What the clock does (CFD; futures within ~1pp)

Chance of reaching the **next rung** after a touch, observed vs forecast:

| London time | Observed | X0 plain odds | X2 random walk, vol clock | X7 chosen |
|---|---|---|---|---|
| 00–07 (n 626) | 67.4% | 49.8% | 59.5% | 66.2% |
| 07–12 (n 1,013) | 57.2% | 49.0% | 56.8% | 56.0% |
| 12–16 (n 3,297) | 50.5% | 46.4% | 49.1% | 49.3% |
| 16–22 (n 2,648) | 26.4% | 43.8% | 23.7% | 32.4% |

The 0.25σ target shows the same shape: 82.7% before 07:00 and 53.1% after 16:00, against a flat ~68% from X0.

## All candidates (CFD; * = fails GUARD)

| | Candidate | Miss | Log loss ÷ X0 |
|---|---|---|---|
| X4 | random walk on the vol clock, remaining σ × ρ^0.2 (day's realised vol so far vs expected) | 2.73 | 0.948 |
| X5 | X2 with remaining variance × 1.25 when a USD Major release is still to come | 3.02* | 0.955 |
| X7 | logistic: X2 + ρ + release-to-come + range used + family × rung | 3.37 | 0.940 |
| X2 | random walk, vol clock | 3.45* | 0.955 |
| X6 | X2 × range used^0.3 | 4.74* | 0.948 |
| X3 | hour × rung table | 5.95 | 0.960 |
| X1 | random walk, clock time | 8.05* | 0.971 |
| X0 | plain ladder odds | 10.59 | 1.000 |
| X8 (F only) | logistic on X2 + VWAP distance + touch volume | 3.51 (F) | 0.942 (F) |

## Reading

- **The plain ladder odds ignore the clock.** A line touched after 16:00 London reaches the next rung about 26% of the
  time, not ~44%. One touched before 07:00 does so about 67% of the time. A driftless random walk on the intraday vol
  clock (X2) captures most of this and needs no fitted table.
- **A day running hot or cold adds a little;** X4 is the best calibrated. Releases still to come, range used, VWAP and
  touch volume add little beyond the vol clock, in line with the earlier nulls.
- **The chosen blend over-calls late-day travel:** 32% against 26% for the next rung after 16:00. So it is not yet
  calibrated to noise; X4 is closer there. A follow-up could test X4's form with a late-day term.
- **Placebo levels (descriptive, not a clean test):** levels borrowed from a random same-year session travel further
  than X2 predicts (51% vs 44%), while real lines travel about as far as X2 predicts (44% vs 42%). The borrowed lines
  carry another day's σ, so this does not show that the real lines are "sticky". No conclusion is drawn.
- **Wrong-side dynamic touches** (~140 per target) behave like the rest.
- **Not tested:** direction or reversal, any trade, other instruments.

## What this changes

The exhaustion figure on the shadow export (runbook 2.4) becomes the chosen forecast's probability for each rung at
the current time, e.g. `OH p75 · next rung 31% now`. It gets a forward record before anything goes live. Gold and the
other indices follow on this harness once their σ race is done.
