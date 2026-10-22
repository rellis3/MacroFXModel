# quarter-end-funding — results

Prereg: `forge/QUARTER_END_FUNDING_PREREG.md` (committed in `495b9595`, 2026-10-22). Run 2026-10-22, seed 20261022, B = 2000, 1000 random-date placebos.
Branch `main`. Ledger ids: `quarter-end-funding-spike`, `quarter-end-funding-usd`.

## Verdict: UNDERPOWERED (spike) · UNDERPOWERED (usd)

**spike.** A thinner overnight-RRP buffer, known 5 business days ahead, went with a bigger quarter-end SOFR spike (SOFR − floor on the last business day, against its own recent median). Spearman ρ **−0.32 [−0.65, +0.07]** over 33 quarter-ends 2018–2026. The sign is right, both halves are negative (−0.25 / −0.62), and the result is just outside the random-date placebo [−0.32, +0.36]. But Holm p is 0.17 and the CI includes 0. UNDERPOWERED.

**usd.** The 7-pair USD basket did **not** firm into quarter-ends more than into ordinary month-ends: −0.07% [−0.30, +0.17], the wrong sign. The shifted window (10 days earlier) shows the same −0.07%, so nothing here is specific to quarter-end. The CI reaches past the −0.25% bar, so the verdict is UNDERPOWERED, not NULL.

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Useful bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| spike | 33 quarter-ends (2018-06 → 2026-06) | ρ −0.32 | [−0.65, +0.07] | 0.54 | 0.40 | 0.17 | UNDERPOWERED |
| usd | 93 quarter vs 186 other month-ends (2003-04 → 2026-06) | −0.07 % | [−0.30, +0.17] | 0.39 % | 0.25 % | 0.57 | UNDERPOWERED |

## The quarter-end prints (spike over the recent norm, bp; RRP $bn a week before)

| Period | Spikes | RRP |
|---|---|---|
| 2018-06 → 2019-12 (RRP near 0, reserves shrinking under QT) | 23, 6, **59**, 24, 13, **45** (Sep 2019), 1 | 1–21 |
| 2020-03 → 2021-03 (RRP near 0, but reserves flooded by QE) | −9, 2, −1, −1, 0 | 0–42 |
| 2021-06 → 2023-09 (RRP $0.8–2.3tn) | −1 to +7 | 814–2,319 |
| 2023-12 → 2025-12 (buffer draining) | 7, 3, 1, 13, 12, 10, 16, 10, **20** | 778 → 6 |
| 2026-03, 2026-06 (RRP near 0; Fed bill purchases since QT ended) | 4, 6 | 1–7 |

The table explains the weak correlation. **RRP near zero meant two different things**: scarce liquidity in 2018–19 and 2025, but abundant reserves in 2020. A thin buffer only produced spikes when reserves were also tight.

## Controls

- **Random-date placebo** (1,000 sets of 33 non-month-end business days): [−0.32, +0.36], mean +0.02.
- **Ordinary month-ends** (descriptive): ρ −0.26 (n 66); mean spike 4.2 bp against 8.3 bp at quarter-ends. Quarter-ends are about twice the month-end effect.
- **usd shifted placebo**: −0.07%, the same as the scored window.

## Deviations from the prereg

None. The descriptive reserves line first returned NaN (an index-alignment bug, and WRESBAL's early vintages are in $bn while later ones are in $mn). It was fixed before reading it. The scored cells were unchanged by the fix (same seed, same numbers).

## Descriptive (not part of the verdict)

- **Reserves as the predictor**: ρ −0.38 (log reserves a week before).
- **Thin RRP (< $50bn) AND below-median reserves**: mean spike **14.5 bp** (n 14) against **3.8 bp** (n 19). Post-hoc. It is the candidate for its own prereg, judged on new quarter-ends.
- **Forward record, 2026-12-31**: at today's RRP ($0.2bn) the scored-sample fit (spike = 15.6 − 1.66 × log(1+RRP)) implies about **15 bp** over the recent norm. Not a claim; it is logged to be checked against the actual print. funding_read_v1 records SOFR−IORB daily, so the outcome will be on file.
- **USD into year-end** (December against other months): −0.48%. The dollar has tended to *soften* into year-end. Reversal over the first 5 days of a new quarter: +0.19%. Both descriptive.

## What this changes

- No quarter-end squeeze line is added to the funding read or Desk Watch (the gate was not met).
- The course's "predictable quarter-end widening" is confirmed as a description: quarter-end spikes average about twice month-ends, and they are largest when RRP is thin **and** reserves are tight. It is not yet a validated forecast.
- Next: a prereg on the two-condition rule (thin RRP and tight reserves → spike), scored on quarter-ends from 2026-Q3 on. The 2026 year-end is the first observation.
