# reopened-audit-rerun — do the 11 validated entries the 2026-10-31 code audit REOPENED stand once their specific defect is fixed?

**Pre-registered 2026-11-28, before any re-run outcome was computed.** (The audit's own spot numbers, quoted in §2, were
seen; the re-runs below were not.)

| | |
|---|---|
| ID / ledger id | `reopened-audit-rerun` (audit row). Re-banked ids: `vvix-ratio-range`, `vix-beta-change`, `vix-second-derivative`, `vix-ratio-vx-futures`, `dispersion-reset`, `surprise-size`, `nq-down-week`, `post-fomc-usd-drift`, `gex-range-es`, `ladder-calibration`, `vmc-nq-cipher-volatility` |
| Not covered | `mv-vixterm-range`, `mv-dispersion-range` (re-run by other branches for data faults; only the audit objection is noted here) |
| Branch | `wf2/reopened` |
| Register row | `plans/RESEARCH_REGISTER.md` → `reopened-audit-rerun` |
| Data | each entry's own registered data and window, cut at the lockbox 2026-08-21 |
| Seed | `20261128` for every new resample in this study |
| Uncertainty | per entry, §3 |
| Scripts / outputs | `scripts/reopened-audit-rerun/` → `analysis/output/reopened-audit-rerun/` |
| Harness | each entry's own registered script, patched only where §3 says; new scripts only where the audit says the registered test did not test the claim |

## 1. Claim

Each of the 11 entries is re-judged on its own original prereg, with only the defect the audit named fixed. Source of
the objections: `js/evidenceAudit.js`, `plans/REPO_REVIEW_2026-10-31.md`,
`analysis/output/repo-review-2026-10-31/AUDIT_validated.md` and `VERDICT_AUDIT.csv`.

## 2. Why not already settled

The audit (2026-10-31) graded these 11 FRAGILE or BUG and set them to `reopened`: "we don't know yet". No re-run of any
of them has been banked since (register rows 146-160 list the bootstrap/date-fix re-runs; only `dispersion-reset` among
these has a RE-RUN row, and it is unscored). Several feed live surfaces (fearVsNasdaq / atlas / vixForward for the VIX
family; impactMatrix / deskWatch / eventDayContext for surprise-size; rangePressure for nq-down-week; claimWatch for
dispersion-reset; rates.html / flow-chain for post-fomc-usd-drift; optionZone for gex-range-es).

## 3. Per-entry fix, test and decision rule (frozen)

### 3A. The C.OG VIX family: vvix-ratio-range (24 cells), vix-beta-change (16), vix-calculus parts B/C (40) and E (2)

**Defect (audit §2):** inference. Newey-West with lag = horizon on overlapping 20-session outcomes and persistent flags;
the banked cells clear Holm by hair-widths, and a 63/126-session block bootstrap gives |t| 2.6-2.9. Three sibling
preregs on one panel, one day, each with its own Holm.

**Fix:** same panels (`analysis/output/{vvix-nasdaq-ratio,vix-nasdaq-beta,vix-calculus}/panel*.parquet`), same cells,
same regression, same controls, same outcome scaling. Standard error from a **circular moving-block pairs bootstrap**
of the (X, y) rows, **block 63 sessions (primary)**, 126 reported, B = 2000, seed 20261128. t = beta / SE_block,
two-sided normal p.

**Gate (all must hold for `validated`):**
1. the registered within-prereg Holm (0.05) on the block-63 p;
2. **family-wide Holm (0.05) across all 82 sibling cells** (24 + 16 + 40 + 2) on the block-63 p;
3. the registered sign / period conditions (same sign in all three periods; E: negative in all three);
4. the registered placebo condition, unchanged (|t_NW| above the shifted-flag placebo 95th, NW against NW).

Fails any → `underpowered` if the block-63 95% CI excludes zero or crosses zero but reaches beyond ±0.2 SD; `null` if the CI is inside ±0.2 SD.

### 3B. dispersion-reset (MD files/DISPERSION.md D2)

**Defect (audit, BUG):** the copied `drawBlock` gave the event arm an SE ×0.68 at n = 26. Shared fix landed in
`analysis/lib/eventBootstrap.mjs` (event arm i.i.d., control arm circular block). Residual defect found on reading
the patched script: the D2b gate compares two **event** arms and passes the falling arm as `b`, so it is still
resampled in circular blocks of 10 though its firings are de-clustered. Fix: the two gate comparisons resample both
arms i.i.d. Data: OANDA London-midnight D1 (`fetchD1Aligned`, fixed S1 labels) cut at 2026-08-21, DSPX + VIXCLS live.
Claim text is rewritten to the result (the "normalising = break" story was falsified in sign).

**Rule (as registered):** D2b gate passes on a cell when its 95% CI excludes zero; the entry stays `validated` if at
least 3 of the 4 gate cells pass. D2a "calmer" is reported; it is cited only if its CI excludes zero.

### 3C. surprise-size (MARKET_SENSE_TESTS S7)

**Defect (audit §3):** the registered script compared top-|z| releases and all releases against non-release days; it
never compared big surprises with small ones, so "size matters" was untested; 67 cells, no correction. Also found: the
release-to-session mapping put anything at/after 21:00 UTC on the next date, which in winter mis-dates releases 21:00-
22:00 UTC against the 17:00 New York bars it is joined to.

**Fix / test:** same API history (`/api/econ-surprise?history=1`, read-only), same six families, same pair map, same
OANDA NY-close D1 (`fetchD1`), same outcomes (`day0` = release-session H-L / prior ATR14; `r1` = next session H-L /
ATR14). Session date = New York date of (release time + 7h), the 17:00 NY session. Releases ≤ 2026-08-21. **Within
release days only**, per family × pair with ≥ 40 release sessions (one row per session: the session's max |z| in that
family): OLS slope of the outcome on |z| (|z| capped at 4), plus the top-tercile minus bottom-tercile difference
(descriptive). CI: i.i.d. bootstrap over sessions, B = 2000. Holm (0.05) across all scored cells (family × pair ×
{day0, r1}).

**Rule:** `validated` if at least one cell has a positive slope passing Holm; the claim and `use` are then restated to
the passing cells only. No cell passes → `underpowered` if any CI crosses zero but reaches beyond ±0.05 ATR per unit
|z|, else `null`. The separate, true finding "release days are wider than non-release days" is reported but is not
this entry's claim.

### 3D. nq-down-week (GROWTH_VS_YIELDS_TEST)

**Defect (audit §4):** the banked cell (growth down ≤ −1%, any rates) is a post-hoc union of the two registered passing
cells (S1, S4) and post-hoc cells; it may be the leverage effect already in the vol state.

**Fix / test:** the registered S1 and S4 cells are the evidence; the union is re-tested as a control-adjusted
regression on the repo's own NY-close NAS100 daily bars built from M1 (`oi_research_book/data/gex_range_es/`, the bars
the live σ uses), 2016-01 to 2026-08-20. Outcome: next-session H-L / ATR14 (ATR known at t). Regressors: down-week flag
(5-session log return ≤ −1%), up-week flag (≥ +1%, the mirror), and the vol state at t: ATR14 percentile in its
trailing 250 sessions, today's H-L / ATR14, 20-session realised vol / ATR14 ratio, VIX percentile (Cboe seed, causal
252-session rank). CI: circular moving-block bootstrap, 20-session blocks, B = 2000.

**Rule:** `validated` if the down-week coefficient ≥ +0.10 ATR and its CI excludes zero. Coefficient CI excludes zero
but < +0.10 → `context` (real but under the desk bar). CI crosses zero → `underpowered`/`null` by the ±0.10 band.

### 3E. post-fomc-usd-drift (POST_FOMC_DRIFT_TEST)

**Defect (audit §4):** registered after the +26bp was seen; the harness OOS (2022+) t 1.11. On reading the code, the
registered placebo draws 81 baseline days i.i.d. from the whole 2016-2026 sample, so a local dollar trend around the
events is not controlled.

**Fix / test:** same 81 event windows (`analysis/fomc_event_study/stage1_events.csv`) and baseline
(`baseline_r5.csv`). Per event, excess = event R5 − mean baseline R5 over the baseline days within ±60 trading days
(local drift). Events are ≥ 5 weeks apart, so the event-level t is i.i.d.; plus a local placebo: 10,000 draws, each
event replaced by a baseline day drawn from its own ±60-day neighbourhood.

**Rule:** stays `validated` if the local-excess mean is positive with t ≥ 2.0, beats the local placebo 95th, and is
positive in both registered halves (2016-2020, 2021-2026). Positive but failing → `underpowered`. Mean ≤ 0 → `null`.

### 3F. gex-range-es, ladder-calibration, vmc-nq-cipher-volatility: no code defect to fix

The audit named no mechanical defect in these (gex-range-es: "D+2, correct"; ladder: a data-fault-driven amendment and
an unmet target bar; vmc: "baseline lacked recent range", already answered by `vmc-nq-vol-increment` /
`vmc-nq-vol-decomposition`). There is nothing to re-run on the same prereg; they are re-banked on the existing
registered evidence by these rules, fixed now:

- **gex-range-es:** stays `validated` for its registered claim (the vol-matched range relation replicates on ES); the
  claim/use must state that the gamma-specific part is +0.147 [+0.006, +0.289] after return controls (post-hoc,
  below the |t| 3 bar) and largely shared with NQ. Audit status → resolved (stands, scoped).
- **ladder-calibration:** stays `validated` only as "HAR-800 reduces (does not fix) the σ-regime miss on one test
  year; target bar not met". Amendment 2 fixed a documented data fault (DATA_SPEC fault 1) before the re-run and is
  allowed by data-rules; the claim is reworded from "fixes" to "reduces".
- **vmc-nq-cipher-volatility:** demoted to `context`: its own follow-ups showed Cipher B adds ~0.1% of MSE beyond a
  price + calendar forecast (level effect −0.3 to −0.6%), so the "beyond the matched baseline" claim does not hold
  against a baseline that has recent range.

## 4. What this does NOT test

No lockbox sessions (after 2026-08-21) are scored. No forward record is scored (`vix-signals-forward` record.json has 0
scored events as committed). No live calculation changes; re-banking changes only Evidence Book text, verdicts and the
audit status. Direction cells never become signals.

## 5. Power

The VIX family's registered designs detect ~0.2-0.3 SD at 20 sessions (`power.json`); block SEs are larger, so a cell
that fails here is graded `underpowered`, not `null`, unless its CI is inside ±0.2 SD. surprise-size cells with 40-80
release sessions detect slopes of roughly 0.05-0.1 ATR per |z|.

## 6. Multiplicity

VIX family: Holm within prereg (as registered) and across all 82 sibling cells. surprise-size: Holm across all cells.
dispersion-reset: 4 gate cells, ≥ 3 of 4 as registered. Others: one primary cell each.

## 7. What each verdict changes

Live surfaces keep their calculations; their evidence text follows the re-banked verdict (an entry demoted below
`validated` is shown as such through `js/deskEvidence.js` / `js/evidenceAudit.js`). A surface whose chip rests on a
demoted entry is listed in the results for the owner to relabel.

## Amendments

### A1 — 2026-11-28 — PRE-RESULTS (for 3B)
3B (dispersion-reset) is dropped from this study: register row `dispersion-reset` is already RUNNING on branch
`wf2/rerun-a` (shared-code bootstrap re-run), and the protocol forbids editing another session's in-flight study. The
residual defect found here (the D2b gate resamples the falling EVENT arm in circular blocks of 10 via the control-arm
path of `bootDiff`) is handed over in the results file instead. No 3B outcome was computed on this branch.

### A2 — 2026-11-28 — note on a smoke run (3A)
3A was first run with B = 50 as a smoke test of the code (82/82 betas reproduce the registered ones). Its output was
printed before the B = 2000 run. Nothing in the design was changed after it; the B = 2000 run is the scored one.

## RESULTS

See `analysis/output/reopened-audit-rerun/RESULTS.md`.
