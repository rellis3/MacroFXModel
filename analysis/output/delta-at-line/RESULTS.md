# delta-at-line — results

Prereg: `forge/DELTA_AT_LINE_PREREG.md` (amendment A1 committed in `1e33475c`, 2026-11-07, before scoring). Run 2026-11-07, seed 20261107, B = 2000.
Branch `main`. Ledger ids: `delta-at-line-regular-with` (NULL), `delta-at-line-against-hidden` (UNDERPOWERED).

## Verdict: split

No signal passed the gate. Regular divergence and delta with the move are **NULL**: both could have shown a 10 pp shift, and both intervals rule it out. Delta against the move and hidden divergence are **UNDERPOWERED**, by the count-first step. Delta against is the exact case the owner asked about, and it stays open: +7.8 pp, in the predicted direction, on 98 signals, with an interval from -3 to +18.

Whether any of these pays could not be judged on these numbers, because all four net cells were underpowered by design. One net result is clear anyway: regular divergence as a fade lost 0.14 K, with an interval below zero.

## Scored cells

Base P(reject | resolved) at the line 0.470, 2,030 resolved of 2,550 touches. Contrast = P(reject) with the signal minus without.

| Signal | Predicts | Signals / others | Contrast | 95% CI | MDE | Bar | Holm p | Halves | EURUSD / USDJPY | Shuffle band | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 delta against | Fade (+) | 98 / 1,887 | +7.8 pp | [-3.1, +18.1] | 18.5 | +10 | 1 | +5.0 / +8.6 | +9.7 / +7.0 | -8.3, +7.8 | UNDERPOWERED |
| F2 regular divergence | Fade (+) | 487 / 1,349 | -1.2 pp | [-6.7, +2.9] | 9.4 | +10 | 1 | -2.7 / +1.0 | -0.5 / -1.9 | -4.5, +4.1 | NULL |
| F3 hidden divergence | Continue (-) | 324 / 969 | -1.1 pp | [-7.3, +5.4] | 11.5 | -10 | 1 | -3.5 / +1.0 | -2.1 / -0.1 | -4.8, +5.1 | UNDERPOWERED |
| F4 delta with | Continue (-) | 492 / 1,493 | -2.2 pp | [-7.6, +3.1] | 9.3 | -10 | 1 | +1.5 / -5.6 | -5.8 / +3.1 | -3.9, +4.3 | NULL |

| Trade, net K | Side | n | Net | 95% CI | Gross | Cost | MDE | Holm p | Halves |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Fade | 138 | 0.00 | [-0.18, +0.06] | +0.08 | 0.08 | 0.33 | 1 | -0.09 / +0.05 |
| F2 | Fade | 621 | -0.14 | [-0.20, -0.07] | -0.06 | 0.07 | 0.15 | 0.004 | -0.19 / -0.08 |
| F3 | Follow | 415 | -0.04 | [-0.11, +0.02] | +0.04 | 0.07 | 0.18 | 1 | -0.02 / -0.05 |
| F4 | Follow | 661 | -0.02 | [-0.08, +0.05] | +0.06 | 0.07 | 0.15 | 1 | -0.04 / 0.00 |

The trade table counts every touch with the signal, including those that timed out, so its n is larger than the resolved signal count.

## Descriptive (not part of the verdict)

**Is it about the line?** Contrast at 0.2 and 0.3 sigma from the line, the neighbours:

| Signal | At the line | 0.2 sigma away | 0.3 sigma away |
|---|---|---|---|
| F1 | +7.8 | +0.4 [-7.2, +7.9] | +1.2 [-5.7, +7.9] |
| F2 | -1.2 | +8.0 [+2.5, +12.4] | +4.3 [-0.6, +8.5] |
| F3 | -1.1 | +2.5 [-1.9, +7.0] | -0.8 [-6.9, +3.7] |
| F4 | -2.2 | +0.6 [-3.0, +3.8] | +0.4 [-4.1, +4.0] |

- F1 is near zero at the neighbours, so if its +7.8 is real it belongs to the line. That rests on 98 signals.
- F2 at 0.2 sigma is +8.0 and F2 at the line is -1.2. This is a slice of a slice with no reason behind it, so read it as noise until shown otherwise.
- By rung, F1 at p75 is +23.9 pp [+9.6, +37.4] on 39 signals. It is one of many slices and is not a result.
- Side, session and variants: nothing consistent. Delta against at the stricter 10th percentile +12.3 pp [-2.1, +25.6] on 35; over 15 minutes +1.2, over 60 minutes +4.4. Delta with varied between 0.2 and 1.8 pp on any setting.
- NQ alone: unreadable (F1 1, F2 1, F3 5, F4 68). Two reasons. Flow is cash hours only, so few touches have the 120-minute lookback. And the tick rule follows price so closely on NQ (+0.91 with the true flag) that it rarely disagrees with price, which is why F1 fired once. Testing divergence on NQ needs the exchange's flag.

## Deviations from the prereg

A1 only. After scoring, a label error in the by-side descriptive slice was fixed (`up` and `dn`, the script asked for `down`). The re-run left every scored cell identical.

## What this changes

- Do not treat regular delta divergence or strong delta with the move as a fade or continue call at a chosen line, on EURUSD or USDJPY. Do not fade regular divergence at a line.
- Delta against at the line stays open and is the only thing here worth following. It needs about 3 to 4 times as many signals. It fires about 30 times a year on these two markets, so a forward record alone would take years; older 6E and 6J months or more markets with the true flag are the route, and both cost money.
- The history is on `delta-at-line.html`, with every touch in `events.csv`.
- Not tested: discretion, other levels, order-book depth.
