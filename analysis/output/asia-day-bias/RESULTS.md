# asia-day-bias — RESULTS (run 2026-11-24)

Prereg: `forge/ASIA_DAY_BIAS_PREREG.md` (pushed 2026-11-23 in `d7e9277d`, before any outcome). Script:
`scripts/asia-day-bias/score.py`. Seed 20261123, date-block bootstrap (21 sessions, B 2000), all-shift placebo
(k = 5…54). London dates 2016-03-29 → 2026-08-20 (2,694 dates after the 60-day σ warm-up), 84,993 instrument-sessions.

**Question.** Does the Asia move (00:00→07:00 London, in σ) tell you which way the 07:00→21:00 day goes, either
as continuation or as reversal?

**Answer: no.** All five registered groups and the "big one-way Asia" cell fail the gate. Where there is any sign,
it is a faint *reversal*, not a continuation, and it is well under the 0.05 bar.

## Pipeline checks (before reading any cell)

- **Planted signal:** zD' = zD + 0.06·zA (scaled) lifted S1 by +0.060 and showed at least half its size in 95.5% of
  200 draws. The pipeline sees an effect of the bar's size.
- **Session cuts audited by hand** on EURUSD 2024-07-15 (BST) and 2024-01-15 (GMT): P00, P07 and P21 equal the raw
  M1 bars at 00:00, 06:59 and 20:59 London exactly. A direct correlation reproduces EURUSD's IC (−0.0482).
- **Placebo means** are all within ±0.003 of zero. The design is not biased.
- **Coverage.** UK100 has no bars before 01:00 London in this file, so under the registered rule (P00 in 00:00–00:30)
  it has no Asia session: 0 sessions, so the indices group is 5 instruments. DE30 has 780 sessions (Asia coverage
  starts 2018-12). SPX500 2,063 and US2000 2,014 (Asia coverage under 60% on some early days). Everything else
  2,459–2,693.

## Scored cells (Holm over S1–S7)

| Cell | Metric | Estimate | 95% CI | Halves | Placebo pct | MDE | Bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| S1 all 34 | IC(zA, zD) | −0.021 | [−0.058, +0.013] | −0.009 / −0.030 | 8 | 0.027 | 0.05 | 1.00 | **NULL** |
| S2 USD majors (7) | IC | −0.010 | [−0.042, +0.020] | −0.019 / −0.001 | 20 | 0.033 | 0.05 | 1.00 | **NULL** |
| S3 JPY crosses (6) | IC | +0.001 | [−0.057, +0.054] | +0.005 / −0.003 | 60 | 0.045 | 0.05 | 1.00 | **NULL** |
| S4 other crosses (14) | IC | −0.031 | [−0.063, +0.000] | −0.024 / −0.036 | 2 | 0.030 | 0.05 | 0.45 | **NULL** |
| S5 gold | IC | +0.038 | [−0.041, +0.105] | −0.002 / +0.076 | 98 | 0.054 | 0.05 | 1.00 | **UNDERPOWERED** |
| S6 indices (5 with data) | IC | −0.048 | [−0.123, +0.032] | +0.027 / −0.108 | 2 | 0.056 | 0.05 | 1.00 | **UNDERPOWERED** |
| S7 big one-way Asia | mean sign(A)·zD − placebo, σ | −0.006 | [−0.037, +0.026] | +0.013 / −0.016 | 32 | 0.042 | 0.10 | 1.00 | **NULL** |
| S8 Asia agrees with V1 | hit-rate difference | — | — | — | — | — | 4pp | — | **not run** |

- **JPY crosses**, where Asia is the home session: +0.001, the flattest group of all.
- **Big one-way Asia days** (19,021 instrument-days, top third of size with ≥ 60% efficiency): the follow-through after
  removing drift is −0.006σ. A strong, clean Asia move does not carry into London.
- **S8** was not run: the point-in-time V1 replay (`engine_daily.csv`) isn't on this machine. Asia agreeing with the
  bias is tracked forward on the bias scoreboard for V1 and V2 instead.

## Disaggregation (BH q 0.10; candidates only, never results)

- Per instrument: **1 of 34 passes BH (EURCHF −0.085 [−0.125, −0.042]); 3.4 expected by chance.** 26 of 33 point
  estimates are at or below zero: a faint reversal tendency across FX, too small to use (median about −0.02).
- Indices by year: negative in 8 of 11 years (2022 −0.135, 2023 −0.154, 2025 −0.185), positive in 2019, 2020 and
  2024. The second half alone is −0.108. Not stable.
- Gold by year: positive in 2023–2026 (+0.115, +0.149, +0.077, +0.213), negative in 2016 and 2022. The second half
  alone is +0.076. Not stable.
- Morning only (07:00→13:00): all −0.031, indices −0.087, crosses −0.037, USD −0.016, gold −0.007, JPY +0.006.
  The indices' London morning tends to give back some of Asia's move; descriptive.
- All 34 by year: from −0.117 (2016) to +0.041 (2020), no trend.

## What it means

- The Asia session's direction is **not** a day bias, continuation or reversal, for FX majors, JPY crosses, other
  crosses or a big clean Asia move. This agrees with `gr-today-tape-direction` and `bias-learner-fx`, on a wider
  set of assets and a cleaner window.
- Gold and indices can't be ruled out at the 0.05 bar (single instrument, fewer sessions), and their halves disagree
  with each other. Both are candidates only. Recent years lean gold-continuation and index-reversal. Testing them would
  need their own prereg on data not seen here (the lockbox, from 2026-08-21).
- Asia stays useful for what was already validated: **size** (a wide Asia means less range left for London) and its
  high and low as **levels** (slight reversion on touch). Not for direction.
