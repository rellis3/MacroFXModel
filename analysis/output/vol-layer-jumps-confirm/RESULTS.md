# vol-layer-jumps-confirm — results

Prereg: `forge/VOL_LAYER_JUMPS_CONFIRM_PREREG.md` (committed in `5294b495`, 2026-11-16). Run 2026-11-16, seed 20261116, B = 2000, 200 shuffle draws.
Worktree on `main`. Ledger ids: `vol-layer-jumps-confirm-touch`, `vol-layer-jumps-confirm-overshoot`, `vol-layer-jumps-confirm-large-follow` (closure, not scored).
Score window 2023-01-01 → 2026-08-20. Lockbox untouched. Scored once.

## Verdict: T1 VALIDATED, T2 NULL, (a) UNDERPOWERED by design

After a burst, a 0.5σ stop is hit within 60 minutes far more often than the vol clock predicts. The excess is +19.5pp [+17.2, +21.6] more than after a near-burst bar. Every gate part held: Holm p < 0.001, above the +5pp bar, above every shuffle, both neighbours, the +1 lag and all four years.

When the stop is hit, the fill lands no further past it after a burst. Δ = +0.0038R [−0.0012, +0.0098], far below the +0.05R bar. NULL.

## Scored cells

| Cell | n | Estimate | 95% CI | MDE (prereg / realised) | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| T1 touch excess, d = 0.5, 60 min | 3,430 bursts in 964 moments; 30,641 controls | +0.1947 | [+0.1721, +0.2159] | 0.032 / 0.034 | +0.05 | < 0.001 | **VALIDATED** |
| T2 loss beyond stop per hit, d = 0.5 | 1,891 burst hits; 2,936 control hits | +0.0038R | [−0.0012, +0.0098] | 0.0048 / 0.0086 | +0.05R | 0.171 | **NULL** |

Raw numbers, T1. Bursts: touch 27.6%, vol clock predicts 3.2%, excess +24.3pp. Controls: touch 4.8%, predicts 1.8%, excess +3.0pp (post-stratified +4.9pp). So the pass is not the controls falling below the walk.

Gate parts:

| Part | T1 | T2 |
|---|---|---|
| Holm p < 0.05 | yes (< 0.001) | no (0.171) |
| Δ ≥ bar | yes | no |
| Above 97.5% of 200 shuffles | yes: shuffle [−0.030, +0.027], real at the 100th percentile | no: shuffle [−0.006, +0.010], real at the 83rd |
| Plateau d = 0.25 / 1.0 | +0.281 [+0.260, +0.301] / +0.052 [+0.039, +0.065] | +0.010 [−0.003, +0.025] / +0.0014 [+0.0001, +0.0031] |
| +1 lag (entry one slot later) | +0.167 [+0.146, +0.186] | +0.0030 [−0.0010, +0.0090] |
| Years 2023 / 24 / 25 / 26 | +0.162 / +0.177 / +0.203 / +0.231 | +0.010 / +0.006 / −0.001 / +0.001 |

## Banked closure: candidate (a)

| Cell | Window | Estimate | 95% CI | MDE | Bar | Verdict |
|---|---|---|---|---|---|---|
| (a) large market-wide bursts (size > 0.703σ, 3+ instruments), follow net of spread, 60 min | discovery, < 2023 (330 moments) | +0.040σ | [−0.040, +0.122] | 0.141σ on 2023-26 (228 moments); 0.090σ on 2017-26 (558) | 0.03σ | **UNDERPOWERED** by design |

It cannot be settled on any data we hold. At the 0.03σ bar it needs about 5,000 moments, about 80 years of bursts. It stops being listed as a next prereg. The proof pack re-computes these discovery numbers; no 2023+ outcome was read for it.

## Controls

- **Positive controls (passed, run first).** Known zero on simulated Brownian paths: Δ −0.8pp, +0.6pp, +0.0pp at d = 0.25, 0.5, 1.0 (all within ±1pp). Known effect (bursts' variance × 1.5): recovered +3.69pp vs +3.50pp predicted (105%). Planted gaps: T2 recovered +0.0109R, interval [+0.0058, +0.0175], truth +0.0109R. GPD on ξ = 0.3 draws: ξ 0.311.
- **Step 0 (passed).** Discovery reproduced exactly: 4,951 bursts, 45,407 controls; touch 26.9% vs 8.0%, Δ +18.9pp; d = 0.25 +25.8pp; d = 1.0 +5.7pp; overshoot Δ +0.0014R.
- **Shuffle.** T1: 4.5% of shuffles had an interval excluding 0 (near 5%, as it should be). T2: 20%. T2's bootstrap interval is too narrow (amendment A2). The NULL stands on the shuffle spread alone.
- **Proof pack** (`checks.json`, `forge/verdict_gate.py`): t1 VALIDATED, t2 NULL, a UNDERPOWERED, the same words as above. Planted large / minimum recovered: t1 +0.150 / +0.052, t2 +0.150R / +0.050R, a +0.20σ / +0.03σ.

## Deviations from the prereg

- A1 (PRE-RESULTS): the shuffle reassigns labels within London hour, not instrument × hour, because a cojump moment spans several instruments; weights are recomputed in each draw. Also fixes the step-0 rule, the simulation details and the profile gap rule.
- A2 (POST-HOC, demotes nothing): T2's bootstrap interval is too narrow; 366 burst hits have no control hit in their stratum; 2 events dropped.

## Descriptive (not part of the verdict)

- **Horizons, T1:** 15 min +11.2pp, 30 min +15.7pp, 60 min +19.5pp, 120 min +20.5pp. T2 near 0 at all horizons (+0.002 to +0.005R).
- **Slices, T1** (BH q = 0.10, 10 tests, about 1 false discovery expected by chance): common +21.0pp, own +13.1pp, FX +20.9pp, index +12.9pp, gold +19.7pp (96 bursts). All pass BH. Common > own and FX > index are candidates for their own prereg, not results.
- **Slices, T2:** none pass BH.
- **Overshoot tail.** Gapped burst hits: d = 0.25: 113, GPD ξ −0.29 (thin tail), median 0.094σ, p99 0.80σ. d = 0.5: 41 (under 80, quantiles only), median 0.036σ, p90 0.44σ, p99 0.57σ. d = 1.0: 10. The discovery random-entry tail was ξ 0.34, p99 0.69σ. p99 of all burst hits at 0.5σ: 0.086σ (controls 0.014σ).
- **Cut by 22:00:** 0% of 60-minute windows; 1.0% of 120-minute windows.

## What this changes

- **T1:** a burst raises the next hour's stop-hit rate by about 20pp more than the vol clock says, beyond a near-burst bar. It is research-only by L02/L04 deflation, though |t| ≈ 17 clears the |t| ≥ 3 rule. Next: a jump allowance on the stop layer (layer 7), shadow only: widen by the measured excess, or wait an hour. Nothing live. What it does not show: whether this is a jump or plain vol clustering. A forecast using realised vol so far today is the next benchmark.
- **T2:** a σ stop's fill after a burst is no worse than after a near-burst bar, on M1 bid/ask, intraday. Loss-given-stop after a burst stays 1R. The jump allowance for fills stays weekends only. T2 is a lower bound: fills inside an M1 bar are not seen.
- **(a):** closed as UNDERPOWERED by design.
- Reopen T1 if the forward record of the same events disagrees; reopen T2 only with tick data.
