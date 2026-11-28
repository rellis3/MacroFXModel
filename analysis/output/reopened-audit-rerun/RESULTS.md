# reopened-audit-rerun — results

Prereg: `forge/REOPENED_AUDIT_RERUN_PREREG.md` (committed in `aca10163`, 2026-11-28; A1/A2 in `b65e2d35`). Run
2026-11-28, seed 20261128, B = 2000. Branch `wf2/reopened`. Re-banked ids: `vvix-ratio-range`, `vix-beta-change`,
`vix-second-derivative`, `vix-ratio-vx-futures`, `surprise-size`, `nq-down-week`, `post-fomc-usd-drift`,
`gex-range-es`, `ladder-calibration`, `vmc-nq-cipher-volatility`. Not done here: `dispersion-reset` (in flight on
`wf2/rerun-a`, A1), `mv-vixterm-range` / `mv-dispersion-range` (other branches).

## Verdicts (one per entry)

| Entry | Was | Defect fixed | Now | Effect (95% CI) |
|---|---|---|---|---|
| vvix-ratio-range | validated | NW SE → 63-session block bootstrap; family-wide Holm | **UNDERPOWERED** | R_a −0.295 SD [−0.513, −0.077], t −2.65; R_b −0.287 [−0.481, −0.093], t −2.90; fails Holm-24 (p 0.0038 vs 0.0021) and Holm-82 |
| vix-beta-change | validated | same | **UNDERPOWERED** | +0.211 SD [+0.073, +0.348], t 2.995; passes Holm-16, fails Holm-82 (p 0.0027 vs 0.0006) |
| vix-second-derivative | validated | same | **UNDERPOWERED** | dRimp +0.232 SD [+0.078, +0.385], t 2.96; passes part-C Holm, fails Holm-82; d2R/dt2 null |
| vix-ratio-vx-futures | validated | same | **UNDERPOWERED** | R_a −0.267 [−0.510, −0.025], t −2.16; R_b −0.307 [−0.536, −0.078], t −2.63; Holm-2 passes, Holm-82 fails |
| surprise-size | validated | size never tested → within-release-day slope on \|z\|, 54 cells, Holm; NY-close dating | **UNDERPOWERED** | 0/54 pass; best CPI EUR/USD next session +0.077 ATR per \|z\| [+0.025, +0.131], t 2.94 |
| nq-down-week | validated | post-hoc union → vol-state-controlled regression, block bootstrap | **CONTEXT** | +0.096 ATR [+0.040, +0.151] (bar +0.10); halves +0.138 / +0.083; mirror up-week −0.120 |
| post-fomc-usd-drift | validated | whole-sample placebo → local-drift (±60 trading days) excess + local placebo | **VALIDATED (stands)** | +30.5bp, t 2.81, 70% positive, 99.9th pct of local placebo; halves +36.9 / +24.5bp; 2022+ +19.6bp t 1.06 |
| gex-range-es | validated | none named; claim scoped | **VALIDATED (stands, scoped)** | registered vm dDR +0.377 [+0.237, +0.516]; gamma-specific +0.147 [+0.006, +0.289] (post-hoc), +0.054 with IV |
| ladder-calibration | validated | none to fix (amendment fixed a data fault); claim narrowed | **VALIDATED (stands, "reduces" not "fixes")** | regime miss 2.86 → 1.41pp; target bar not met; one test year |
| vmc-nq-cipher-volatility | validated | baseline lacked recent range (own follow-ups) | **CONTEXT** | level effect −0.3 to −0.6% vs price+calendar; Cipher B adds 0.1% of MSE |

## 3A. VIX family (82 cells)

All 82 registered betas reproduce to 1e-6. Block-63 SEs are 5-25% larger than Newey-West on the banked cells; the
126-block agrees (t within ±0.15 of block-63 except vix-ratio-vx-futures R_a). Under the registered within-prereg Holm
on block p, vvix-ratio-range fails (it cleared Holm-24 only by 0.00003 in p under NW); vix-beta-change, the part-C
dRimp cell and the two part-E cells still pass their own Holm. **None passes the family-wide Holm across the 82 cells
registered on the same panel on the same day** (first-step bar p 0.00061; smallest p 0.0027). Every banked cell's
interval stays clear of zero, so they are graded UNDERPOWERED, not NULL. 12 of 82 cells are NULL (CI inside ±0.2 SD),
70 UNDERPOWERED, 0 VALIDATED. File: `vix_family.json`, log `vix_family_log.txt`. A B = 50 smoke run preceded the
scored run (A2); nothing changed between them.

## 3C. surprise-size

6,549 releases with a z in the six families; the NY-close dating fix moved 0 of them (no release falls 21:00-22:00 UTC
in winter), 8,380 pair-releases to the lockbox. 54 family × pair × outcome cells with ≥ 40 release sessions. No cell's
positive slope passes Holm. Only CPI EUR/USD next-session (+0.077 per unit |z|, t 2.94) and two rate-decision day0
cells (percentile intervals above zero, bootstrap t < 2: z is mostly 0 for rate decisions, so the slope rests on few
surprises) lean positive; retail sales EUR/USD day0 leans the wrong way (−0.062 [−0.109, −0.018]); employment is flat
(−0.06 to +0.02). The S7 finding that release days are wider than matched non-release days is untouched by this and is
not this entry's claim. File: `surprise_size.json`, log `surprise_size_log.txt`.

## 3D. nq-down-week

2,497 NY-close NAS100 sessions from M1 (≥ 60 bars), 2016-01-04 → 2026-08-20; 20-session block bootstrap. Raw (flags
only) +0.143 [+0.085, +0.208]; with ATR percentile, today's H-L/ATR, rv20/ATR and VIX percentile: +0.096 [+0.040,
+0.151]; 2016-20 +0.138 [+0.036, +0.241]; 2021-26 +0.083 [+0.012, +0.150]. Real and in both halves, but under the
registered +0.10 ATR bar once the vol state is in → CONTEXT. Controls: ATR percentile −0.51, VIX percentile +0.43
(VIX carries most of the leverage effect). File: `nq_down_week.json`.

## 3E. post-fomc-usd-drift

81 meetings; local baseline (median 97 non-FOMC days within ±60 trading days) averages −4.2bp, so the local excess
(+30.5bp) is larger than the raw mean. t 2.81 (events ≥ 5 weeks apart, i.i.d.), local placebo 95th 16.1bp, event mean
at its 99.9th percentile, halves +36.9bp (n 39) / +24.5bp (n 42). Stands on its registered rule. The audit's other
point is unchanged: the statistic was peeked before registration and 2022 onward is +19.6bp, t 1.06 (n 34), so it is
an in-sample base rate, not forward-proven. File: `post_fomc.json`.

## 3B. dispersion-reset — handed over, not run

Residual defect for the `wf2/rerun-a` re-run: `analysis/dispersion_study.mjs` D2b gate calls
`bootDiff(ev.a5, evFall.a5)` with the default block 10, so the falling EVENT arm (de-clustered, n ≈ 26-31) is resampled
in circular blocks of 10 through the control-arm path of `analysis/lib/eventBootstrap.mjs`. Both gate arms should be
i.i.d. (pass `block: 1`, or add an event-vs-event helper). The claim text ("normalising dispersion = break starting")
is the falsified story and should be rewritten whatever the re-run gives.

## Live surfaces touched (evidence wording only; no calculation changed)

The repo's own guard tests require any surface that cites an entry as validated/tested to follow the re-banked verdict:
- `js/fearVsNasdaq.js`: the three readings' words now say "not proven: failed the multiple-testing bar on re-check".
- `js/rangePressure.js` (atlas.html gauge): nq-down-week row kept and shown, labelled context, **no longer counted**
  (the gauge now reads "x of 4 validated signals").
- `js/deskWatch.js`: `nq-down-week` and `event-range` retagged `described` (they still fire, with their expectation
  numbers unchanged); nq-down-week detail adds the controlled +0.10.
- `js/eventDayContext.js`: two sentences no longer call surprise-size validated.
- `js/deskWatchEvidence.test.mjs`: the block extractor silently skipped pushes longer than 400 characters
  (vix-inversion); it now also reads literal trigger headers.

Not changed, for the owner: `js/deskWatch.js` keeps NQ +0.21 ATR as the down-week expectation (the controlled number
is +0.10); `js/impactMatrix.js:92` "+0.17 to +0.51 ATR by family", `js/terminal/releasesBoardView.js:81` "A bigger
surprise gives a bigger move", `js/terminal/dayAheadCore.js:272` and `js/newsOutcome.js:11` still describe surprise
size as validated; `js/vixForward.js` and `atlas.html` describe the VIX signals from the old banking.
