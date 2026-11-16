# vol-layer-state-confirm — results

Prereg: `forge/VOL_LAYER_STATE_CONFIRM_PREREG.md` (committed in `2f63c51a`, 2026-11-16). Run 2026-11-16, seed 20261116, B = 2000 (block 20; block 60 as a check).
Branch `main` (worktree). Ledger ids: `vol-layer-state-confirm-over`, `-chosen`, `-nudge`, `-error`, `-dsigma`.
Window scored once: London dates 2023-01-01 → 2026-08-20 (943 dates, 34 instruments). Nothing from 2026-08-21 on was read.

## Verdict: split by cell — 2 VALIDATED, 2 CONTEXT, 1 UNDERPOWERED

- **The live σ over-reacts (A1): VALIDATED.** Quiet-σ days run +0.32σ wider than busy-σ days, relative to σ. Every gate part held.
- **The chosen σ's own recent error widens the range (C): VALIDATED.** Top minus bottom fifth +0.18σ. Every gate part held.
- **HAR expected change beats plain mean reversion (D): CONTEXT.** +0.093 IC, clear of the bar, but the one-session-older version is flat (+0.008). It fails the +1 lag check.
- **HAR-month + HARQ terms (B): CONTEXT.** Real but tiny: 0.16% pinball gain, the bar was 0.5%.
- **Does the chosen σ over-react (A2): UNDERPOWERED.** +0.045 [−0.015, +0.115]. Not significant, and the interval still reaches the 0.10 bar.

## Step 0 (discovery, before any 2023 outcome was read): passed

- Build: the 2016-10-24 → 2026-08-20 session table matches the discovery table exactly on 54,408 rows (max relative difference 0 on rv5, F1-F5, har1, garch_vt, rq).
- Reproduction (point within 0.001, same dates): A1 +0.3397 (1,555 dates), A2 +0.0407 (614), A2 live benchmark +0.2693, C +0.2084 (594; table says 0.209), C stage 3 form +0.0388, D +0.0580 (1,293). Cell B fold ratios 0.9877 and 0.9862, exact.
- Plants and zero cases (mean of 50 month-block draws): A1 calibrated +0.005; A2 calibrated +0.009; A2 planted 0.15 → 0.158; C planted +0.402 → +0.402; C zero −0.001; D plants +0.055 / −0.129 against closed form +0.056 / −0.128; D zero IC +0.010. B: weak leak k 0.10 → 0.9957 [0.9930, 0.9985]; month-shuffled terms 1.0000.
- Power re-check for B: MDE 0.0019 at one-sided α 0.01 (≤ 0.005), so B became POWERED.
- Details and two code fixes made on the way are amendment 2026-11-16 PRE-RESULTS in the prereg.

## Scored cells

MDE = 80% power at α 0.01 (the strictest Holm step), from this run's own interval. B is shown as the ratio SRH ÷ SR; its MDE and bar are in gain (1 − ratio).

| Cell | n (dates / rows) | Estimate | 95% CI | MDE | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| A1 `-over` live σ, low − high fifth of range ÷ σ | 943 / 31,996 | +0.317σ | [+0.238, +0.405] | 0.146σ | +0.17σ | 0.0025 | **VALIDATED** |
| A2 `-chosen` chosen σ, 1 − MZ slope | 943 / 31,815 | +0.045 | [−0.015, +0.115] | 0.113 | +0.10 | 0.155 | **UNDERPOWERED** |
| B `-nudge` pinball SRH ÷ SR | 943 / 31,815 | 0.9984 | [0.9970, 0.9997] | 0.0022 | 0.995 | 0.022 | **CONTEXT** |
| C `-error` chosen σ error, top − bottom fifth | 943 / 31,815 | +0.181σ | [+0.115, +0.240] | 0.109σ | +0.10σ | 0.0025 | **VALIDATED** |
| D `-dsigma` IC(F2) − IC(MR5) | 943 / 31,815 | +0.093 | [+0.043, +0.140] | 0.084 | +0.05 | 0.0025 | **CONTEXT** |

### Gate parts

| Cell | Holm < 0.05 | Sign + bar | Plateau (both neighbours ≥ half) | +1 lag | Years same sign | Placebo |
|---|---|---|---|---|---|---|
| A1 | yes | yes | terciles +0.223, deciles +0.434: yes | +0.431: yes | 2023 +0.35, 2024 +0.30, 2025 +0.35, 2026 +0.46: 4/4 | real +0.317 vs 97.5th pct +0.030: yes |
| A2 | no | no (+0.045 < 0.10) | √RV5 +0.043, next-session range +0.176 | +0.176 | +0.11, +0.06, +0.01, +0.10 | real +0.045 vs +0.019: above |
| B | yes | no (gain 0.16% < 0.5%) | IV-13 board 0.9994 (gain 0.06%): **no**; rolling 3y 0.9983: yes | 0.9999: **no** | 4/4 below 1 | real 0.9984 vs 2.5th pct 0.99995: yes |
| C | yes | yes | half-life 5 +0.214, 20 +0.166: yes | F5c from t−2 +0.144: yes | +0.12, +0.16, +0.18, +0.04: 4/4 | real +0.181 vs +0.025: yes |
| D | yes | yes | horizon 3 +0.096, 10 +0.086: yes | **+0.008 [−0.044, +0.061]: no** | +0.03, +0.05, +0.14, −0.00: 3/4 | real +0.093 vs −0.353: yes |

Cell B's extra gate parts: QLIKE on range² 0.9983 (below 1, yes); worst class 0.9991 (yes); HL p75 calm/busy miss 1.96 pp vs SR 2.18 pp (yes).

## Controls

- **Placebos (200 whole-month draws each).** A1 calibrated-by-construction outcomes: mean +0.002, 97.5th +0.030. A2: mean −0.001, 95% band [−0.015, +0.019]. C shuffled F5c: mean +0.002, 97.5th +0.025. B shuffled terms: ratios 0.99995 to 1.00018.
- **D's placebo is weak by design.** It shuffles F2 and keeps MR5, so the placebo statistic is about −0.37 (MR5's own IC is +0.41). The real value clears it easily. That check says little; the lag check is the one that bites.
- **Block 60 bootstrap.** Nothing changes: A1 [+0.252, +0.395]; A2 [−0.006, +0.109], p 0.08; B [0.9971, 0.9996]; C [+0.119, +0.236]; D [+0.043, +0.139].
- **Concentration.** A1: 42 of 44 slices pass BH (q 0.10); weakest instrument USDJPY +0.09; no slice negative. C: 34 of 44 pass BH; NZDUSD −0.04 is the only negative instrument. D: 35 of 44 pass; all instruments positive. A2: 12 of 44 pass BH and point both ways (USDJPY −0.46 under-reacts; FX crosses +0.09 over-react). These are candidates only, never results.
- **D, non-overlapping rerun (every 5th session):** +0.101 [+0.051, +0.154]. The overlap does not make the effect.

## Proof pack (`scripts/vol-layer-state-confirm/proof.py`, gate `forge/verdict_gate.py`)

The proof re-runs every cell from the scripts and reproduces the confirm numbers exactly (all five). Planted effects at 2 × bar and at the bar are recovered in full on every cell. Month-block shuffles show nothing for A1 [−0.009, +0.056], A2 [−0.014, +0.020], C [−0.031, +0.027] and B [−0.0001, +0.0001].

**D does not pass the gate's shuffle check.** IC of a month-shuffled F2 is +0.038 [+0.020, +0.057], not 0. Over 50 draws its mean is +0.036 (MR5 shuffled: +0.022). So on this window a whole-month shuffle leaves a small baseline IC for both fields. It does not explain D: the baselines differ by about 0.014, against D's +0.093. But the gate reads it as INVALID, and the gate's own rule would also not see D's failed lag check. So the gate's word for D (INVALID) differs from the prereg's (CONTEXT).

Gate words: over VALIDATED, chosen UNDERPOWERED, error VALIDATED, nudge CONTEXT, dsigma INVALID. Four of five agree. Because one disagrees, the proof wrote `checks_MISMATCH_do_not_commit.json`, not `checks.json`. The banked word for D stays CONTEXT under the prereg; the mismatch is for the coordinator to settle before banking.

## Deviations from the prereg

One PRE-RESULTS amendment, dated 2026-11-16, written before the confirm window was opened. It covers: the reproduction tolerance (C 0.2084 vs 0.209), a fixed bug in the A2 live benchmark, plants averaged over 50 draws, the B plant grid, B becoming POWERED, keeping `live_sig_used` as registered (with `pit_sig_used` reported), and readings where the text left a choice. No POST-HOC amendment.

## Descriptive (not part of the verdict)

- **A1 with `pit_sig_used` (the brief asked for it):** fifths +0.327 [+0.245, +0.416]; 1 − slope +0.293 [+0.225, +0.362]. Same answer as the live σ.
- **A1 for other forecasts on the same check:** live σ 1 − slope +0.280. log-HAR fifths +0.065 [+0.026, +0.107], slope +0.084. Variance-targeted GARCH fifths +0.022 [−0.024, +0.072]. So the over-reaction is mostly a flaw of the live σ, as stage 3 said.
- **A1 ladder (range ÷ live σ, σ fifth 1 to 5):** 1.70, 1.57, 1.54, 1.50, 1.39. Past-only fifths (live-usable) +0.246.
- **A2 ladder (range ÷ chosen σ):** 1.56, 1.53, 1.52, 1.50, 1.50; low − high +0.056 [−0.014, +0.127]. Level: mean log(range ÷ chosen σ) = 0.34. A one-session-older chosen σ over-reacts clearly (+0.176); the next-session range also gives +0.176. So the chosen σ is close to calibrated for the day it is made for, and goes stale fast.
- **C mirror:** top fifth +0.129σ above the middle, bottom fifth −0.052σ below it. Most of the effect is recent under-forecasting. High-impact event days +0.203, no-event days +0.172 (3.7% of rows have unknown calendar and are left out). Calm +0.174, turbulent +0.138. Stage 3's form (live σ's error) is +0.078 on this window.
- **D pieces:** IC(F2) +0.502, IC(MR5) +0.409. Against the stage 2 benchmark −F3: F2 wins by +0.267 (so the old "0.38 vs 0.21" gap was mostly a weak benchmark).
- **B pieces (each term alone added to SR):** rv22m 1.0000; hq 0.9984 [0.9971, 0.9997]; per-instrument log-HAR as a term 0.9986; F5c as a term 1.0014 (worse). All of B's small gain is the HARQ term.
- **QLIKE race, confirm rows (ratio to chosen σ; below 1 is better).** On RV5: S+RV 0.939, S+RV+H 0.954, HARQ 0.976, log-HAR 0.994, panel log-HAR 1.000, live 1.254, GARCH 1.347, GARCH-vt 1.332. On range²: S+RV+H 0.982, S+RV 0.982, HARQ 1.007, log-HAR 1.018, panel log-HAR 1.019, live 1.129, GARCH 1.167, GARCH-vt 1.161. Realized GARCH was not built.

## What this changes

Nothing live changes. Proposals only, side by side.

- **A1 VALIDATED:** the vol state (`/api/vol-state`, `js/volStateVector.js`) should label "σ now" as the live σ and say it over-reacts (quiet days run about 0.3σ wider than busy days, relative to σ). Layers that stop or size by the live σ should be pointed at the chosen σ.
- **A2 UNDERPOWERED:** we cannot yet say the chosen σ is calibrated in slope; its slope is 0.96 and the interval reaches 0.89. Switching "σ now" to the chosen σ is still the better choice on A1's evidence, but it is not proven calibrated. It also goes stale fast (+0.18 when one day old).
- **B CONTEXT:** `vol-layer-l1-sigma` closes. The chosen form plus RV stays layer 1's σ. No forecaster shoot-out and no S+RV+H shadow arm: a 0.16% gain does not pay for the extra term.
- **C VALIDATED:** the chosen σ's own error is a real field. The ASSEMBLY line "only +0.05σ against the chosen σ" must be corrected (that used the live σ's error). The error-scaled stop is reopened for the stop layer on the chosen σ.
- **D CONTEXT:** "Δσ expected" stays descriptive, shown beside MR5. Stop quoting 0.38 vs 0.21. The edge is fresh-information only: F2 one day old has none over MR5.
- **What would reopen it:** A2 on more data (the forward record or a later window); D with a lead-robust form.
