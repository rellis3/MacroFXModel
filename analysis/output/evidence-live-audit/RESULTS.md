# evidence-live-audit: results (2026-11-28)

A code-level audit of VALIDATED Evidence Book entries that had no audit status, starting with the ones a live surface
depends on. Audit, not a study: no study was re-run. Each row comes from reading the study code against data-rules
(point in time, date alignment, sessions and bars, units, population, multiple testing, lockbox, benchmark).

- Rows: `analysis/output/evidence-live-audit/LIVE_AUDIT.csv`, written by `scripts/evidence-live-audit/rows.mjs`.
- Merged into `js/evidenceAudit.js` by `scripts/repo-review/build_evidence_audit.mjs`, which now reads later audit
  batches after the 2026-10-31 CSV. Each new row carries its own date (2026-11-28). `citable()` in `js/deskEvidence.js`
  now quotes that date in the prompt tag, not the 2026-10-31 batch date.
- On the site, the status shows wherever the audit is already read: Evidence Book grades (`evidence.html` via
  `evidenceGrade.gradeAll`), and the `[tag]` on every entry in the AI prompts (`server.js` evidenceBrief: end-of-day
  review, Head of Research, research proposals).

## Scope

There were 152 VALIDATED entries with no audit status: 28 study entries and 124 per-instrument `ladder-v2-*` /
`exhaustion-v2-*` cells. Live dependency was found by grepping js/, server.js and the pages for each id and for the
logic each one supports. Note: every entry reaches a live surface in one sense, because `server.js` puts the whole
Evidence Book into the end-of-day and research prompts with its `citable()` tag.

**Covered: 33 of 152.** That is all 28 non-ladder entries plus a sample of 5 ladder/exhaustion cells.
**Not covered: 119** ladder-v2 / exhaustion-v2 cells (the sample covers the engine they share, `scripts/ladder-v2/ladder.py`
and `scripts/exhaustion-v2/`, but each cell's own report was not read).

| Status | n | Ids |
|---|---|---|
| stands | 18 | hedge-finder-book-es, hedge-method-comparison, hedge-today-pick, pre-release-ranging, pre-release-ranging-share, gold-calc-upgrades, ladder-v2-gold, ladder-v2-nq-fut, ladder-v2-gbpusd, exhaustion-v2-spx500, exhaustion-v2-lockbox, noise-area-momentum-spy, noise-area-build-wf, vol-layer-feedback-confirm-{persist, morning, qlike-plain, qlike-chosen, cov75} |
| reopened | 3 | bias-fast-lag (DESIGN), fqt-p90-follow (DESIGN), gold-line-system-base-mae (FRAGILE) |
| unverified | 12 | vol-layer-rv5-increment, vol-layer-state-confirm-{over, error}, vol-layer-jumps-confirm-touch, vol-layer-stops-confirm-{skill, steady}, vol-layer-features-confirm-{tod, fr, eq}, vol-layer-sizing-confirm-{a, b, e} |

## Live-dependent entries

| Id | Live surface | Status | One line |
|---|---|---|---|
| hedge-finder-book-es | Desk Terminal hedge card | stands | Hedge picked by the live `corrMath.bookHedges` from data up to the day before; random-candidate placebo; lockbox respected |
| hedge-method-comparison | Desk Terminal Hedges tab (EWMA beside OLS60) | stands | Every weight uses returns before t; one NY-close clock; BH across methods |
| hedge-today-pick | Desk Terminal hedge Today mode | stands | Session weights from earlier sessions and the previous NY close; positive control passes |
| bias-fast-lag | Through the day lag flag (`biasFastCore.LAG_FLAG`) | **reopened** | Fails the prereg's own BH on the statistic its verdict rests on (see below) |
| pre-release-ranging | Desk Terminal release-day card | stands | Matched same-clock controls, pseudo-event DiD, point-in-time HAR sigma, date-cluster bootstrap |
| pre-release-ranging-share | Desk Terminal release-day card | stands | Computation sound; the entry already says it is mostly mechanical and is not separate evidence |
| fqt-p90-follow | Forecast Reversion style `j_p90_follow` | **reopened** | No drift benchmark for a direction-follow trade; 90% interval, no correction across 4 parts; entry-bar stop not checked |
| gold-calc-upgrades | Pre-open shadow export, vol-forecast-v3 | stands | A3 lookahead fix verified in code; live module uses the same definitions |
| gold-line-system-base-mae | gold-line-system.html (no live change) | **reopened** | Shares the simulator whose same-minute retouch fills carry the edge on M1 |
| ladder-v2-gold, -nq-fut, -gbpusd | ladder-v2 shadow export | stands (sample) | Sigma known before 00:00 London; per-year fits; winner re-selected in every bootstrap draw |
| exhaustion-v2-spx500, -lockbox | exhaustion odds on the shadow export | stands (sample) | Touch features from bars before the touch; vol clock and model per test year; one-shot holdout |

## Defects found (reopened)

### bias-fast-lag (DESIGN)
The mechanics are point in time: betas from the 120 sessions before, the call at the slot, the outcome from the slot
forward, the same module as the live shadow. The defect is in the inference. Amendment A2 found that the prereg's
session-mean statistic looks ahead, through its weights, and rests every verdict on the call-weighted statistic. On
that statistic the three hypotheses have p = 0.094 (H1), 0.218 (H2) and 0.040 (H3). The prereg's BH at q = 0.10
across H1-H3 rejects nothing: 0.040 > 0.033, 0.094 > 0.067, 0.218 > 0.10. The BH pass in the results applies only to the
contaminated statistic. The "dollar pairs only" scope is also a post-hoc per-market split of a pooled gate. That gate
needed 8 of 12 markets positive and got exactly 8 (7 dollar pairs and SPX500). Reading: an UNDERPOWERED lead for the
dollar pairs. **Live impact:** the Through the day lag flag on the FX pairs should be labelled a candidate with a forward
record, not a validated finding. The flag logic itself needs no change.

### fqt-p90-follow (DESIGN)
The lines are point in time: the QLIKE arm is picked per line by a yearly walk-forward. Three problems with the word
VALIDATED:
1. It is a direction-follow trade judged against zero in a rising 2020-26 sample, with no same-time same-direction
   random-entry benchmark. The split is upside +0.115R and downside -0.009R.
2. The pass rests on a 90% interval (lower +0.007R), with no correction across parts A-D. This was registered that
   way, but it is a weak bar.
3. The simulator does not check the stop on the entry bar. The exit loop starts at bar k+1, so an M1 bar that
   triggers p90 and falls back to p75 is not stopped. This is an optimistic bias of unmeasured size.

**Live impact:** the Forecast Reversion style button calls it "pre-registered". It should carry "reopened: no drift
benchmark" until the drift-controlled confirm runs.

### gold-line-system-base-mae (FRAGILE)
`scripts/gold-line-system-jordan/run.py` imports the base study's simulator. Its A1 entry-rule switch shows the
same-minute retouch fills carry +210R of +226R, and ignoring them gives +0.032R. The simulator fills in the poking
minute only when that minute closes back through the line, which is a favourable selection that M1 bars cannot avoid.
The 18-line base shares this simulator, and its edge sits in the smallest stops and the top 1% of trades, the pattern
this effect would leave. NQ/EURUSD replication also failed (7f72fb37). **Live impact:** none on live calcs (the entry
says no live change). The gold-line-system page should note the same-minute caveat; that page belongs to the session
running gold-line-system, so it was not edited here.

## Unverified (why)
- vol-layer-rv5-increment: the features are lagged and the folds embargoed. But the feature is scaled by
  `live_sig_daily`, the live estimator, whose per-instrument settings were chosen on data to 2025-08. This is the same
  settings-choice leak the vol-layer review found in stage 3. Its size was not measured.
- The 11 vol-layer stage-4 cells (state, jumps, stops, features, sizing): only the headers were read. They show a frozen
  discovery, one scoring of 2023-01 to 2026-08-20, the point-in-time sigma as primary, and an M1 cut before the
  lockbox. The cell mechanics were not traced. None drives a live calc; they show on the vol-layer research page and in
  the prompts.

## Notes that are not defects
- pre-release-ranging: the matched controls include later weeks, which is fine for a description. A coverage filter
  reads post-release bars, but it is applied to events and controls alike.
- hedge-finder-book-es: H.10 noon FX against the 16:00 NQ close is a timing mismatch. It applies to the fit and to the
  P&L alike.
- exhaustion-v2-lockbox: parameters were frozen before the holdout according to the prereg. That freeze was not
  re-verified by hash.
- ladder-v2 cells: the quintile edges of the regime variable are cut on the pooled test rows. They are used as a
  grouping, never as a forecast input.

## Not done
- 119 ladder-v2 / exhaustion-v2 cells were not audited individually.
- No study was re-run, so no defect has been sized.
- No page text was changed. The live-impact wording above is for the owner or the owning sessions to apply.
