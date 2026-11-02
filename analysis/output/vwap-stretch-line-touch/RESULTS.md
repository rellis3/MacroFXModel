# vwap-stretch-line-touch: results

- **Prereg:** `forge/VWAP_STRETCH_LINE_TOUCH_PREREG.md`, pushed in f62b1702 before the run.
- **Amendment A1 (PRE-RESULTS, 66fffee9):** redefines "stretched" after the count pass and before any outcome; details below.
- **Script:** `scripts/vwap-stretch-line-touch/run.py`, seed 20261102. Run once on 2026-11-02.
- **Outputs:** `counts.json`, `results.json`.

## Verdict: UNDERPOWERED by the frozen rule. In substance, the reversion idea is not supported.

- **The literal rule is not a condition.** At the first touch of a v3 p75/p90 line, price is ≥ 1.5 session-VWAP SDs away on **95–98% of days**:
  - discovery: 756 of 770 touches at p75, 276 of 291 at p90;
  - replication: 441 of 452 at p75, 190 of 197 at p90.
  - Reaching a p75/p90 line means a large move from the open, so price is always far from VWAP there. The median z at the most-stretched third is about 3.
- **Fading those touches (the literal rule), 60-minute exit:**
  - discovery −0.038% [−0.086, +0.008] at p75 and −0.046% at p90;
  - replication −0.032% at p75 and −0.004% at p90.
- **More stretch makes the fade worse, not better.** Top-tercile z minus bottom-tercile z (60-minute fade) is negative in all four cells:

| | stretched fade | unstretched fade | stretched − unstretched | vs ATR lines | placebo pctile |
|---|---|---|---|---|---|
| discovery p75 (256 / 259) | −0.060 [−0.147, +0.022] | −0.020 | −0.040 [−0.159, +0.083] | −0.001 | 32.6 |
| discovery p90 (97 / 95) | **−0.141 [−0.301, −0.012]** | +0.013 | **−0.154 [−0.339, −0.020]** | −0.030 | 1.3 |
| replication p75 (135 / 188) | −0.070 [−0.154, +0.027] | +0.015 | −0.084 [−0.190, +0.015] | +0.016 | 9.1 |
| replication p90 (76 / 47) | −0.053 [−0.157, +0.043] | −0.019 | −0.034 [−0.208, +0.127] | −0.125 | 14.8 |

- **Gate:** G1–G4 fail on both rungs (Holm p 0.17 / 0.06, both for a negative mean).
- **Why the word is UNDERPOWERED:**
  - p90 has fewer than 100 stretched events in discovery (97).
  - At p75, the NULL bars were not met: the stretched-fade upper bound is +0.022 vs a +0.02 bar, and the stretched − unstretched upper bound is +0.083 vs a +0.03 bar.
- **The data point the other way from reversion:**
  - The most-stretched touches tend to keep going, if anything.
  - Discovery p90: the follow mirror is +0.127%, and the stretched fade sits at the 1.3rd percentile of the placebo.
  - This does not replicate in 2016–20: follow +0.039 at p90, and real − ATR −0.125. It is not a candidate.
- **21:55 exit (secondary):**
  - stretched fades: −0.110 / −0.266 (discovery) and −0.012 / −0.133 (replication);
  - unstretched: −0.104 / +0.008 and −0.080 / −0.148.
  - No reversion at either horizon.

## What it means

The owner's idea, "z > 1.5 from VWAP means reversion may happen", is answered for forecast-line touches on NQ:
- At those lines, price is almost always > 1.5σ from VWAP.
- Fading them loses.
- The further the stretch, the worse the fade.

This fits `vwap-extension-fade` (reversion too small to beat cost), `daily-band-fade` (NULL) and `line-touch-wide-scan` (fails net). VWAP distance stays a **size/structure** read, not a reversal entry. No variants (other z cut-offs, holds or bands) are proposed.
