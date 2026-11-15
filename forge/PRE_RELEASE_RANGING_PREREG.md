# pre-release-ranging — on a tier-1 US release day, does the market range until the release?

**Pre-registered 2026-11-15, before any outcome was computed.** (The only numbers below come from the control-only
power run, `scripts/pre-release-ranging/run.py --power`, which builds pseudo-event rows on non-release days and reads no
event-day outcome. The synthetic `--selftest` was also run; it uses no market data.)

| | |
|---|---|
| ID / ledger id | `pre-release-ranging` (four scored cells A-D, one prereg; banked per cell if they split, see §8) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `pre-release-ranging` (maintained by the session owner) |
| Data | Local M1 (`VolRangeForecaster/data/m1/{gold,eurusd,gbpusd,usdjpy,nq,spx500}_m1.parquet`, OANDA mid; nq = NAS100 CFD), London sessions, window 2017-01-06 → 2026-08-21 (M1 starts 2016-01-04; HAR-800 σ needs 250 NY-close bars, so the first scorable session is 2017-01-06). Nothing after the 2026-08-21 lockbox; the loader asserts it. Never R2 (`R2_*` unset in the script). |
| Seed | `20261115` (one for every script in this study) |
| Uncertainty | Date-cluster bootstrap (all instruments of a London date resampled together), B = 2000; p from the bootstrap SE (normal approximation, `pFromCI`-style) |
| Scripts / outputs | `scripts/pre-release-ranging/run.py` → `analysis/output/pre-release-ranging/` (+ an evidence pack per cell, `scripts/evidence_pack/pack.py`) |
| Harness | Own script: the windows are London-clock intraday slices at the release minute, which `analysis/study.mjs` / `runStudy.mjs` do not express |

## 1. The claim (required)

Source: `plans/BIAS_RESEARCH_SYNTHESIS.md` P5 — Max Cole's (Colez Trades) habit of going neutral before tier-1 US data,
and the desk folklore "it'll range until 13:30". Stated as a testable claim: **on a tier-1 US release day (CPI, NFP,
PPI, FOMC), price ranges before the release** — less of the day's range is printed before the release, the pre-release
range is narrower than on a comparable day, and the Asia high/low is broken less often before the release. A second
claim, C.OG's "coiling" idea: **a tight pre-release range is followed by a bigger post-release range.**

Edge source (method lesson #4): none claimed. This is a range/timing description (who must act: nobody wants to
carry inventory into a binary print), not a direction or a trade.

## 2. Why it is not already settled (required)

Nearest Evidence Book entries (`js/deskEvidence.js`):

- `event-impact-map` (validated): the 30-min spike AFTER a release is 2.8-5.5× an ordinary half-hour for CPI/NFP/FOMC.
  It measures the post-release burst, not what happens before. This study's cell A is partly that burst (see §3.8).
- `surprise-size` (validated): the size of the surprise scales the release session; a post-release, size-of-surprise
  question.
- `event-layer` (NULL): a finer release-type layer does not improve the IV-adjusted daily lines; the coarse event tag
  already handles release days. Whole-day range forecast, not the intraday split of the day around the print.
- `fast-start-rest-of-day` (validated): a fast first two hours → wider afternoon (vol clustering inside the day). This
  is the opposite of coiling and is the prior for cell D.
- `narrow-day-expansion` (NULL): a narrow DAY does not lead to an expanding next day ("do not write coiled spring").
  Daily, not around a scheduled print; D is the intraday, event-anchored version.
- `positioning-into-release-range` (NULL): crowded COT positioning does not widen the release day. Positioning, not
  timing.
- `post-release-drift-pooled` (UNDERPOWERED) / `post-release-momentum-pooled` (NULL): direction after the release.

None measures the PRE-release window against matched days. Not a re-run of a banked null: the closest null
(`narrow-day-expansion`) is daily and unscheduled; D asks about the scheduled-print intraday case.
`grep` of forge/, plans/, analysis/output/ for "pre-release" / "prerelease" found no prior study of this question.

Method lessons applied (`education/RESEARCH_METHOD_LESSONS.md`): #1 positive control from outside the pipeline (the
synthetic `--selftest` plants a known 30% pre-release vol cut and a known-zero world); #10 statistic on a latent proxy
on two specs (cell B repeated with σ60 as a sensitivity); #25 the evidence pack's state buckets and per-family
ladder are reported, not just one difference.

## 3. Definitions, fixed in advance (required)

1. **Event days.** `analysis/output/post-release-drift-pooled/events.parquet` (681 US CPI / NFP / PPI / FOMC releases,
   2010-2026, UTC release instant `t`). London date = date of `t` in Europe/London. Days with two releases keep the
   EARLIEST release as T (family = that release). Sample: London dates 2017-01-06 → 2026-08-13 with a valid σ,
   weekdays only: **411 event dates** (NFP 116, PPI 115, CPI 114, FOMC 66). Every date with any tier-1 release in the
   full table is a "tier-1 date" and can never be a control or a pseudo-event.
2. **Clock.** London clock minutes. Asia = [00:00, 07:00); day = [07:00, 21:00); pre = [07:00, T); post = [T, 21:00),
   T = the release minute in London (13:30 or 12:30 for 08:30 ET; 19:00/18:00 for FOMC 14:00 ET; 19:15 for 14:15 ET).
   M1 bars are start-stamped; a bar at minute m belongs to the window containing m (the release-minute bar is POST).
3. **σ.** Point-in-time HAR-800 (`js/forecastSigma.js` `'har_rv_log'`, the shipped forecaster's σ) on NY-close daily
   bars built from the same M1 (data-rules item 2), via `scripts/post-release-drift-pooled/sigma.mjs`. The σ for London
   session d is the forecast made at the NY-close bar that ended 17:00 NY on the prior business day (known before
   00:00 London). Sensitivity: σ60 (RMS of the last 60 daily log returns).
4. **Outcomes per (instrument, date, T).** `share` = pre range ÷ day range; `pre_sig` = pre range ÷ open at 07:00 ÷ σ;
   `brk` = 1 if the pre window trades above the Asia high or below the Asia low; `post_sig` = post range ÷ open07 ÷ σ.
   Coverage: day ≥ 80% of its 840 minutes, Asia ≥ 60%, pre ≥ 80% and post ≥ 80% of their minutes; else the row is
   dropped and counted.
5. **Matching rule (the control).** For each event row: candidate dates = same instrument, same weekday, ±1..±10 weeks,
   not a tier-1 date, passing coverage at the SAME clock T. Take the **K = 4** with the smallest |log(σ_cand ÷ σ_event)|
   (ties → nearer week); require ≥ 2. The control value is the mean of the controls' outcomes at clock T. "Compression"
   = control − event (positive = narrower / smaller share / fewer Asia breaks).
6. **Pseudo-events (the design placebo).** 2 × 411 dates drawn without replacement (seed 20261115) from non-tier-1
   weekdays in the event span, each given the London clock of a randomly drawn real event, then matched to its own
   controls by the same rule. Their compression measures any bias of the matching itself (non-release days are
   mostly Thursday-claims-type days at 13:30; that baseline is intended: the question is tier-1 vs ordinary).
7. **Scored statistic** for cells A-C: mean compression over event rows − mean compression over pseudo rows (DiD),
   pooled over the six instruments, date-cluster bootstrap. Cell D: Spearman(pre_sig, post_sig) on pseudo rows −
   Spearman(pre_sig, post_sig) on event rows (positive = coiling beyond an ordinary day). Raw event-day Spearman is
   reported beside it.
8. **Known mechanical effect in cell A.** The post-release burst enlarges the denominator, so `share` falls on event
   days even if the pre-release window is perfectly ordinary. The selftest's known-zero world (no pre-release
   compression, a 2× first post-release hour) shows A at +0.09 and "passing". **So A answers "what share of the day is
   printed before the release" (a desk fact), not "the market ranges before the release". The ranging claim rests on
   B (and C).**
9. **Instruments**: gold, EURUSD, GBPUSD, USDJPY, NQ (NAS100 CFD), SPX500 — scored pooled, reported separately.
10. **Halves** for stability: London dates < 2022-01-01 vs ≥ 2022-01-01.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| A | Share of the 07:00→21:00 range printed before T: event lower than matched, net of pseudo | **Yes**, ~0.05-0.10, mostly the denominator (§3.8) |
| B | Pre-release range in σ: event narrower than matched, net of pseudo | **Small**, 0-0.05σ; a real effect for the 13:30 releases is plausible (the last hour before 13:30 goes quiet) but ≥ 10% seems unlikely |
| C | Asia high/low broken before T: event less often than matched, net of pseudo | **Null** (base rate ~95%; a narrower morning barely changes it) |
| D | Coiling: tighter pre-release range → bigger post-release range, beyond ordinary days | **No** — vol clustering (`fast-start-rest-of-day`) predicts ρ > 0 on both; DiD ≈ 0 |
| | **THE GATE** (per cell, VALIDATED only if all hold): (c1) Holm-adjusted p < 0.05 over the four cells; (c2) estimate ≥ the pass bar; (c3) estimate > 97.5th percentile of 1000 date-level event/pseudo label shuffles; (c4) positive in both halves; (c5) positive on ≥ 4 of 6 instruments; (c6) still positive with the event rows' top 1% |compression| removed (A-C) | |
| | **THE MIRROR**: the opposite sign — event mornings WIDER than matched (positioning/pre-release leaks, NQ pre-market) — is reported; for D the mirror is a positive ρ (busy morning → busy release), which is the expectation | |

Verdict mapping per cell: all of c1-c6 → **VALIDATED**. Else, if the 95% CI upper bound < the bar and the cell is
POWERED (§5): **CONTEXT** when c1 holds with the claimed sign (real but smaller than useful), otherwise **NULL**. Else
**UNDERPOWERED**.

## 5. Power — what this design can and cannot find (required)

From the control-only power run (`--power`, 821 pseudo dates; SE of the DiD from 300 random relabellings of pseudo
dates at the registered 411:821 ratio, rescaled to the real 1232 dates; MDE = 3.34 × SE = two-sided α 0.0125 (Holm
worst case for 4 cells) at 80% power). Control means: share 0.680, pre_sig 0.846σ, Asia-break rate 0.949.

| Cell | Planned n | SE of DiD | Design effect | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| A share | 411 event dates × 6 inst (~2,400 rows) vs 821 pseudo dates | 0.0077 | in the date-cluster SE | **0.026** | 0.05 (5 pp of the day's range) | POWERED |
| B pre range (σ) | same | 0.0162 | same | **0.054σ** | **0.085σ** (= 10% of the control mean 0.846σ) | POWERED |
| C Asia break | same | 0.0078 | same | **0.026** | 0.08 (8 pp, from a 95% base) | POWERED |
| D coiling (Δρ) | same | 0.0393 | same | **0.131** | **0.15** | POWERED |

D's bar: a rank correlation of 0.10 explains 1% of the post-release range's variance and could not change a desk read;
at that bar D would be underpowered by design (MDE 0.131), so the bar is set at 0.15 (≈ 2% of variance, the smallest
relation a "tight morning → expect a big print" line could stand on) BEFORE any event outcome was computed.
The SE uses non-release days; event days have a wider post-release window, so A's and D's real SE may be somewhat
larger — the bootstrap on the real rows decides, and a cell whose CI still includes its bar is UNDERPOWERED.

Positive controls: (i) `--selftest` (synthetic, known answer from outside the pipeline): a planted 30% cut of
pre-release minute vol → B +0.39σ [+0.34, +0.44] and C +0.09 [+0.06, +0.13], both VALIDATED; the known-zero world → B
−0.02 [−0.08, +0.03] NULL, C +0.01 NULL, D not flagged. (ii) Each scored cell's evidence pack plants a bar-sized
compression into the REAL event rows (0.5×, 1×, 2× the bar, 40 draws each) and must detect the 1× plant ≥ 80% of the
time; a cell whose pack fails this is reported UNDERPOWERED whatever its CI says. (iii) Lookahead canary: event labels
reassigned by the realised post-release range excess must move the estimate.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells**: A, B, C, D (four). **Holm at α = 0.05** across them (gate c1).
- **Disaggregation** (per family CPI/NFP/PPI/FOMC, per instrument, σ60 sensitivity, per clock): descriptive, reported
  with BH q = 0.10 where p-values are given; a slice that survives is a candidate for its own prereg, never a result.
- **Promotion bar**: anything that changes a live card's wording needs |t| ≥ 3 on its cell (here B for "ranging").

## 7. What this does NOT test (required)

- **Direction**: not tested; neither "it breaks up after" nor fade/continue.
- **Tradability**: no entries, stops or costs. A narrow morning is not a short-vol trade here.
- **Cause**: whether dealers, positioning or simple absence of flow cause it.
- **Non-US releases** (ECB, BoE, BoJ) and tier-2 US data.
- **Futures/cash-session effects**: NQ and SPX500 are OANDA CFDs; pre-13:30 is the pre-market for the cash index.
- **The release-day total range** (already `event-impact-map` / `event-layer`).

## 8. What each verdict changes (required)

- **B VALIDATED** (with |t| ≥ 3): the release-day card may say "expect a narrower morning into the 13:30 print —
  about X% of an ordinary morning", per instrument where it holds. Below |t| 3: research-only line on evidence.html.
- **A VALIDATED with B not**: the card may say "on release days about Y% of the day's range comes after the print",
  explicitly NOT "it ranges until 13:30" — the morning is ordinary, the afternoon is bigger.
- **C VALIDATED**: the Asia range holds into the release more often than usual; usable as a description on the card.
- **NULL / CONTEXT on B**: the card stops implying ranging before 13:30; going neutral before data is a risk choice,
  not a range forecast.
- **D**: VALIDATED → "a tight morning → bigger print" line allowed; NULL → never write "coiled into the number".
- **UNDERPOWERED**: says which data (more years of M1 pre-2016, more tier-1 families) would make it testable.

## Amendments

(none)

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/pre-release-ranging/RESULTS.md`. Nothing above this line changes after the run.*
