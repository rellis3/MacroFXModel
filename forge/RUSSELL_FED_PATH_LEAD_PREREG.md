# russell-fed-path-lead — does the Russell 2000's relative return lead the fed path, or only move with it?

**Pre-registered 2026-11-02, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `russell-fed-path-lead` (two scored cells, one id: H1 forward lead, H2 reverse lead; banked together with the per-cell verdicts in the result text) |
| Branch | `ccr-dfef37e6-2ty8zi` |
| Register row | `plans/RESEARCH_REGISTER.md` → `russell-fed-path-lead` |
| Data | Russell 2000 and S&P 500 cash-index daily closes (Yahoo `^RUT`, `^GSPC`, keyless; cross-checked 2020-10→ against the OANDA NY-close bars the drill bundle holds for `US2000_USD` / `SPX500_USD`); US 2-year constant-maturity yield (FRED `DGS2`); Dec-2026 3-month SOFR future `CME_SR3Z6` 15-min bars (`analysis/output/stir/CME_SR3Z6.csv`, IBKR archive) collapsed to one daily close per session (the last bar at or before 20:00 UTC, i.e. the 16:00 ET equity close). Window **2003-01-02 → 2026-08-21** (the lockbox cut; the SR3Z6 cell 2025-10-13 → 2026-08-21). Daily data, no M1, no σ. |
| Seed | `20261102` (every script in this study) |
| Uncertainty | date-clustered block bootstrap, block 20 sessions (≥ the 5-session outcome), B = 2000; placebo = the all-shift distribution (below) |
| Scripts / outputs | `scripts/russell-fed-path-lead/` → `analysis/output/russell-fed-path-lead/` (`RESULTS.md`, `results.json`) |
| Harness | own node script. Not an M1 / σ study, so `js/harness/runStudy.mjs` does not fit; `analysis/study.mjs` reads preregs from `MD files/` only. Uses `js/preregStats.js` (MDE, Holm, BH, `pFromCI`) and the block resampler in `js/statsCore.js`. |

## 1. The claim (required)

Nicholas Crown, clip of 2026-10-31 (`MD files/CROWN_WATCH.md`, 2026-10-31 entry):

> *"There's an 80% implied odds of a rate hike in December, but the equity market doesn't
> believe it. That's why small cap is front-running and moving first and outperforming the
> rest of the market... small cap is one of the most interest-rate-sensitive factors in the
> market... so if the implied odds come down, small cap rallies."*

Stated as one testable claim: **the Russell 2000's outperformance of the S&P 500 precedes a
fall in the market-implied policy path.** "Front-running" and "moving first" are the words
that make it a lead, not a co-movement. The same-day version ("if the odds come down, small
cap rallies") is coupling and is reported for attribution only.

## 2. Why it is not already settled (required)

Every rates ↔ equities lead test on this desk has come back coincident, and every one of them
ran the direction **rates → equities**:

- `rates-pivot-lead` (NULL, well powered): confirmed 2-year pivots do not lead the Nasdaq at
  1–4 h; rates and equities move in the same M15 bar (+0.23).
- `rate-diff-nq-leadlag` (NULL): the US–EU short-rate differential is "coincident only" with
  the Nasdaq from 1 min to daily; rates-first candidates reversed sign on confirmation.
- `stir-wide-scan` (NULL across 48,600 cells), `stir-composite-nq` (NULL / insufficient at
  hours), `rates-residual-catchup` and `stir-residual-catchup` (NULL): short-rate futures do
  not lead FX, gold or the indices.
- `yields-to-fx-direction` (NULL): the forward coupling is null; the relationship is real only
  in the same bar.

What has **not** been run is the reverse: **equities → rates.** `yield-predictive-ladder`
lists "reverse lead NQ → rates" on its shortlist and nobody has picked it up; nothing has
asked it for the Russell, which is the sleeve the claim names and the one the desk's own
board describes as the rate-sensitive leg ("answers the 2-year"). The 2026-10-31 entry's
descriptive check found the Russell−S&P relative return correlated −0.22 with the daily
2-year change over the last 250 sessions (−0.35 over 60) against ≈ 0 for the Nasdaq−S&P —
same-day, no lead tested. This pre-registration asks the lead, both ways, and is not a re-cut
of any banked null because none of them scored this direction or this sleeve.

**Prior, written down:** same bar. The expectation is that H1 and H2 are both null and the
same-day cell is strongly negative, which would make "front-running" a story about a
coincident correlation.

## 3. Definitions, fixed in advance (required)

- **Series.** `RUT_D`, `SPX_D` = cash-index closes (16:00 ET) on session D. `Y_D` = DGS2 on
  session D (FRED H.15 constant maturity, a ~15:30 ET reading). `Z_D` = SR3Z6 close at the last
  15-min bar at or before 20:00 UTC on D, converted to an implied rate `100 − Z_D` (percent),
  changes in bp. Sessions = dates present in all three of RUT, SPX, DGS2 (the SR3Z6 cell uses
  its own intersection).
- **The signal (equities side).** `S_D` = 5-session log relative return, in percent:
  `S_D = 100 × [ln(RUT_D / RUT_{D−5}) − ln(SPX_D / SPX_{D−5})]`. Known at the close of D.
- **The rates move (rates side).** `R_{a→b}` = `(Y_b − Y_a) × 100` bp. The fed-path-specific
  version uses `Z` in place of `Y`.
- **The print-clock rule (knowable when).** DGS2 is stamped ~15:30 ET and the equity close is
  16:00 ET, so the last half hour of session D's equity move can only show up in the yield on
  D+1. A one-session "lead" would therefore be partly the same-day move. **Every scored
  forward window skips one session**: it starts at the close of D+1 and ends at D+6. The
  D→D+1 cell is reported, labelled "contains the 15:30–16:00 leak", and carries no pass
  weight. SR3Z6 is stamped at 20:00 UTC = 16:00 ET, the same clock as the equities, and uses
  the same skip-one convention for comparability.
- **H1 outcome (forward lead, the claim).** `R_{D+1→D+6}`, in bp, against `S_D`.
- **H2 outcome (reverse lead, the desk's prior direction).** `S'_{D+1→D+6}` = the 5-session
  relative return from the close of D+1 to the close of D+6, against `R_{D−5→D}`.
- **Same-day cell (descriptive).** `R_{D−5→D}` against `S_D`, the coincident coupling.
- **Statistic.** Pearson correlation `r` between signal and outcome over all sessions D in
  the window (overlapping 5-session windows; the overlap is handled by the block bootstrap
  and by the design effect in §5), plus the OLS slope in outcome units per 1 SD of the
  signal. `t` = `r / SE_boot`.
- **The all-shift placebo.** Recompute `r` with the signal series shifted by k sessions for
  every k in [−250, +250] excluding |k| ≤ 10 (480 shifts). The real `r` must sit beyond the
  95th percentile (in the claimed direction) of that distribution, and the pass bar in §4 is
  checked against the distribution's SD before scoring, per the 2026-10-21 lesson (a bar
  inside the placebo's own noise is not a bar).
- **Instruments.** One pair, Russell 2000 vs S&P 500, scored. Reported, not scored:
  Nasdaq Composite vs S&P 500 as the same signal (the control sleeve — if the Nasdaq's
  relative return "leads" the 2-year just as well, this is an equity-beta story, not a
  small-cap rate story), and the Russell alone.
- **The control.** The all-shift placebo is the control: it holds every autocorrelation and
  overlap property of both series and removes only the alignment.
- **De-clustering.** None in the estimate (all sessions used; overlap in the bootstrap block
  and the design effect). Power is computed at `n_eff = n / 5`.
- **Sample and halves.** 2003-01-02 → 2026-08-21. Halves: 2003-01-02 → 2014-12-31 and
  2015-01-02 → 2026-08-21. Concentration checks (descriptive): by calendar year; without the
  top 1% of |outcome| sessions; the last three years alone (2023-08-22 → 2026-08-21).
- **Lockbox.** Nothing after 2026-08-21 is read. The Yahoo pull and the FRED pull are
  truncated at that date before any join; the SR3Z6 file is cut at the same date.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 (scored) | Does `S_D` (Russell outperformance over 5 sessions) predict `R_{D+1→D+6}` (the 2-year's move over the following 5 sessions, skip-one), with a **negative** sign — outperformance before yields fall? | **Null.** Expected `r` within ±0.05, interval across zero. |
| H2 (scored) | Does `R_{D−5→D}` (the 2-year's move over the past 5 sessions) predict `S'_{D+1→D+6}` (the Russell's relative return over the next 5, skip-one), with a **negative** sign — yields fall before small caps outperform? | **Null.** Same shape as every rates→equities test here. |
| C (descriptive) | Same-day: `S_D` against `R_{D−5→D}`. | **Negative and clear**, `r` ≈ −0.15 to −0.25 over 2020→ (the 2026-10-31 descriptive check), weaker over the full sample. Attribution only. |
| N (descriptive) | H1 and H2 with the Nasdaq Composite in place of the Russell. | If H1 passes for the Russell and not the Nasdaq, the small-cap framing holds; if both pass, it is an equity-beta lead and the small-cap story is decoration. |
| Z (descriptive) | H1, H2 and C with SR3Z6 (Dec-2026 SOFR) in place of the 2-year, 2025-10-13 → 2026-08-21. | **Underpowered by design** (§5); reported as description, never a verdict. |
| h1, h20 (descriptive) | H1 and H2 at the 1-session (leak-labelled) and 20-session horizons. | Reported; no pass weight. |
| **THE GATE** | A scored cell PASSES only if all four hold: (i) `r` has the claimed sign and `|r| ≥ 0.10`; (ii) the 95% block-bootstrap interval excludes zero; (iii) both halves have the claimed sign (point estimates); (iv) the real `r` sits beyond the 95th percentile of the all-shift placebo in the claimed direction, and the 0.10 bar exceeds that distribution's SD. | Both cells expected to fail at (i). |
| **THE MIRROR** | H2 is H1's mirror in time (rates → equities). Both are scored so the two directions are judged on one design, and a pass in H1 is read next to H2: a lead that also runs the other way is a shared driver, not a lead. | Both null. |

## 5. Power — what this design can and cannot find (required)

Filled in from the control sample only. Control SDs below are from the production drill
bundle's own copies of these series (DGS2 via FRED, Russell and S&P via OANDA NY-close bars),
2020-10-26 → 2026-08-21, 1,456 sessions, because FRED returned 503 from the sandbox at
registration time. **The full-sample control SDs (2003→) will be recorded in a PRE-RESULTS
amendment when the harness first pulls FRED, before any outcome is computed.** They change
the bp translation, not the correlation MDE, which depends on `n_eff` only.

Control SDs (2020-10 → 2026-08): 5-session Δ2y **13.4 bp** (1-session 6.5, 20-session 27.2);
5-session Russell−S&P relative return **1.78%** (1-session 0.80, 20-session 3.38). Over
2025-10-13 → 2026-08-21 (the SR3Z6 era) the 5-session Δ2y SD is 8.2 bp.

Correlation MDE at 80% power, two-sided α = 0.05: `r_mde ≈ 2.80 / √n_eff`.

| Cell | Sessions (n) | Design effect | `n_eff` | **MDE (r)** | Pass bar (r) | In bp per 1 SD of signal at the bar | Verdict |
|---|---|---|---|---|---|---|---|
| H1 full sample | ≈ 5,900 | 5 (overlapping 5-session windows) | ≈ 1,180 | **0.082** | 0.10 | 0.10 × 13.4 ≈ 1.3 bp | **POWERED** |
| H2 full sample | ≈ 5,900 | 5 | ≈ 1,180 | **0.082** | 0.10 | 0.10 × 1.78% ≈ 0.18% | **POWERED** |
| each half (sign agreement only, not an interval test) | ≈ 2,950 | 5 | ≈ 590 | 0.115 | sign only | — | adequate for a sign check |
| C same-day (descriptive) | ≈ 5,900 | 5 | ≈ 1,180 | 0.082 | — | — | descriptive |
| Z (SR3Z6, 2025-10 → 2026-08) | 215 | 5 | 43 | **0.43** | 0.10 | — | **UNDERPOWERED by design** → description only |
| h1 (leak-labelled) | ≈ 5,900 | 1 | ≈ 5,900 | 0.036 | — | — | descriptive |
| h20 | ≈ 5,900 | 20 | ≈ 295 | 0.163 | — | — | descriptive |

- The scored cells can find a lead of `r` ≈ 0.08; the bar is 0.10, so a null on H1 or H2 is a
  **real null**, not a thin one.
- The bar is deliberately small. `r` = 0.10 is ≈ 1.3 bp of 2-year move per one-SD week of
  Russell outperformance — a statistical lead, not a tradeable one. **A pass is research-only**
  (`validated` at |t| ≥ 2 stays research-only until |t| ≥ 3 or a forward test, per
  `stats-defaults.md`); nothing here is promoted to a page as a signal on a pass.
- The SR3Z6 cell cannot answer anything on 215 sessions and is registered as description so
  that nobody reads a number off it later as if it were a verdict. It becomes testable at
  about two years of archive (≈ 2027-10), under its own pre-registration.
- A planted-signal positive control is run on the exact pipeline before scoring: a synthetic
  `r` = 0.10 lead injected into the real series must be recovered at |t| ≥ 2 and beat the
  all-shift placebo; if it is not, the design is fixed and amended PRE-RESULTS before any real
  outcome is read (2026-10-21 lesson, yield-predictive-ladder).

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: two** — H1 (forward lead) and H2 (reverse lead), each one correlation on the
  full sample. **Holm at α = 0.05** across the two (`holm(pvals, 0.05)`); bootstrap intervals
  are converted with `pFromCI`. The half-sign and placebo conditions are conjunctive on top
  of that and need no further correction.
- **Disaggregation / descriptive cells**: C, N (two sleeves), Z (three cells), h1 and h20
  (two each for H1 and H2), by-year, ex-top-1%, last-three-years — reported with
  **Benjamini–Hochberg q = 0.10** and `chanceBaseline`. A descriptive cell that survives BH is
  a candidate for its own pre-registration, never a result.
- **Variants.** None beyond this table. If the harness needs a construction change (e.g. the
  SR3Z6 daily stamp), it goes in `## Amendments` as PRE-RESULTS before the run.
- **Best-of-N accounting.** Two scored cells and two directions are the whole search: E[max
  of 2 noise cells] ≈ 0.56 SE, inside the Holm correction.

## 7. What this does NOT test (required)

- **Per-meeting hike odds.** The 2-year is the market's integral of the path over two years,
  not the December meeting's probability. The Atlanta Fed window series the desk stores is a
  window probability with a rolling front window and only runs from 2026-02; it is not used.
  SR3Z6 is the contract-level version and is underpowered here.
- **Tradability.** No costs, no execution, no sizing. A pass at `r` = 0.10 is ≈ 1.3 bp.
- **Cause.** A lead, if found, says the Russell's relative return carries information about
  the next week's 2-year move; it does not say small caps *move* the path or that the equity
  market "doesn't believe" the odds.
- **Intraday ordering.** Both series are close-stamped; "moving first" within a day is not
  visible here. The desk's M15 work (`rates-pivot-lead`) already covers that resolution in the
  other direction.
- **The FedWatch number in the clip** (80%). Not reproduced; not a market claim.
- **The regime claim** ("most rate-sensitive factor"). The same-day cell C describes it and
  the 2026-10-31 entry already found it true for the last year and absent over six; this study
  scores the lead, not the beta.

## 8. What each verdict changes (required)

- **Pass (H1)** → ledger `russell-fed-path-lead` as `validated`, research-only, with the bp
  size stated; the Setup Watch `claim-rotation-extreme` look-for text gains one sentence ("a
  Russell-relative lead on the 2-year was found at r ≈ …, research-only"); a forward record
  under its own prereg before any page says "front-running". If H2 also passes, the result is
  written as a shared driver, not a lead, and no look-for text changes.
- **Null (H1 and H2)** → ledger `null`; `CROWN_WATCH.md` 2026-10-31 entry gets the one-line
  pointer; the Setup Watch look-for says "front-running tested here: the Russell and the
  2-year move in the same week, not in sequence (r = …)". The index candidate is struck.
- **Underpowered** → not possible for the scored cells by design (§5). The SR3Z6 cell is
  recorded as description and closes as untestable until the archive is long enough.
- **Pass (H2 only)** → the rates → equities direction, which every prior test nulled, would be
  the surprise; banked as `validated` research-only and flagged for a confirmation
  pre-registration on the lockbox tail before anything is said on a page.

---

## RESULTS — run <YYYY-MM-DD>

*Appended below this line, or written to `analysis/output/russell-fed-path-lead/RESULTS.md`.
Nothing above it changes after the run. Amendments go in an `## Amendments` section above this
one, each dated and tagged `PRE-RESULTS` or `POST-HOC (results seen)`; a post-hoc amendment
can only demote or describe.*
