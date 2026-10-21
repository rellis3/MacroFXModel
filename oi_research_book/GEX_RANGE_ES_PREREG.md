# gex-range-es — does the NQ gamma-range effect (G2) replicate on ES, once the timing and the bars are honest?

**Pre-registered 2026-10-20, before any outcome was computed.** The ES option file was still downloading when this
was written; no ES range, DR or GEX value had been computed. The only numbers used below come from the banked NQ run
(`data/results/gex_range_brownian.json`) and one fault check on NQ's Friday rows (described in §2, done before this
study was conceived as a two-question study, and it touches no ES data).

| | |
|---|---|
| ID / ledger id | Q1 `gex-range-es` (new). Q2 `gex-range` (the banked NQ entry, re-run in place under this prereg) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `gex-range-es`; `gex-range` (RE-RUN) |
| Data | ES options: Databento `GLBX.MDP3`, parent `ES.OPT`, definition + statistics, standard monthly/quarterly series only (no weeklies), pulled 2026-10-20 with `oi_recon/databento_oi_pull.py --only SPX500_USD --years 6` → `oi_recon/databento_oi/SPX500_USD.csv`. NQ options: the existing `OI Data/NAS100_USD.csv` (same script, 2026-09). Prices: OANDA M1 `portfolioBacktest/cache/spx500_m1.parquet` and `nas100_usd_m1.parquet` (the NQ study's own price source, OANDA NAS100 CFD, at M1 instead of UTC D1). Window: option trade dates from the first ES date (≈ 2020-10-20) to the last date whose target session ends on or before **2026-08-21** (lockbox). Both instruments on the same window. |
| Seed | `20261020` (every script in this study) |
| Uncertainty | stationary block bootstrap, mean block 10 sessions, B = 10,000 (identical to the NQ study) |
| Scripts / outputs | `oi_research_book/scripts/27_gex_range_es.py` (+ `01_build_daily_dataset.py` for the ES surface, unchanged except a `SPX500_USD` row in `pair_config.py`) → `oi_research_book/data/results/gex_range_es.json`, `oi_research_book/GEX_RANGE_ES_RESULTS.md` |
| Harness | own script; reuses the bootstrap and estimator code of scripts 18 and 21 verbatim (OI book convention) |

## 1. The claim (required)

G2 of the C.OG shadow reads dealer gamma and maps it to a range tier. `GEX_RANGE_BROWNIAN_RESULTS.md` (2026-09-24,
ledger `gex-range`, validated) found NQ's next-day range, divided by what a random walk of the same trailing vol would
give (DR), is higher on short-gamma days than long-gamma days: +0.176 raw (p 0.0008), +0.315 vol-matched. The reliable
side is "long gamma is quiet" (DR ≈ 0.85). The FX cross-match (`GEX_FX_CROSSMATCH_RESULTS.md`) did not reproduce it
(pooled +0.038, p 0.155), so the effect stands as NQ-only and unexplained.

**Claim tested here:** the same effect, measured the same way, appears on ES (S&P 500 futures options), the market most
like NQ: same exchange, same dealer structure, equity index. And: does NQ's own result survive the two pipeline faults
below.

## 2. Why it is not already settled (required)

- `gex-range` (NQ, validated) is one instrument. `GEX_FX_CROSSMATCH` (FX, MIXED → NQ-only) tested a different asset
  class. ES has never been tested because no ES option history existed (tracker build #8, blocked on data until today).
- `one-range-forecast` Q2 (null, 1.0019) asked whether NQ gamma sign adds **on top of the shipped range lines**. That
  is a different question (incremental value over a forecast that already uses IV and persistence). This study asks
  only whether the gamma-range relation exists on ES at all; it does not re-open that null.
- `zero-gamma-distance` (underpowered) and `gamma-regime-trades` (null) asked about distance and trading rules, not
  the sign → range relation.

**Two faults found in the NQ pipeline while preparing this (they are why Q2 exists):**

1. **Friday targets are the Sunday stub.** `01_build_daily_dataset.py` takes "next day" as the next row of
   `nas100_usd_d1.parquet`, a UTC-day file that carries a Sunday-evening stub bar. Of 168 Friday rows in the NQ near
   dataset, 164 have the Sunday stub as their "next day" (mean DR 0.24 on Fridays vs 1.04–1.13 Mon–Thu). Trailing
   rv20 is also computed across those stub returns. Checked before any ES data existed: dropping Fridays moves NQ's raw
   ΔDR from +0.176 to +0.204, so the fault adds noise rather than flattering the result. Data rule 2 already forbids
   these files for σ.
2. **OI is not public on the day it is labelled.** CME options OI for trade date D is finalised ~15:00–16:00 UTC on
   D+1 (`RESEARCH_BOOK.md` Part 13; Databento's worked example). The NQ test paired OI(D) with session D+1, so the
   predictor became known part-way through the session it predicts. That audit re-checked wall touches at T-2, not the
   range test.

## 3. Definitions, fixed in advance (required)

- **Sessions (both instruments).** New York-close sessions built from M1: session S(D) runs 17:00 New York on D-1 to
  17:00 New York on D (i.e. label = date of (timestamp in America/New_York + 7 h)). Weekend labels dropped. A session
  needs ≥ 60 M1 bars or it is dropped (counted). CME trade date D ↔ session S(D).
- **Setup.** `net_gex_sum` from `01_build_daily_dataset.py`'s `near` surface (DTE ≤ 45) for trade date D, sign only:
  short gamma = net GEX < 0. GEX is computed exactly as in the NQ study (assumed-vol Black gamma, calls +, puts −), with
  the builder's spot and rv20 inputs taken from the same New York-close sessions. ES contract multiplier 50 (sign is
  unaffected by it).
- **Knowable when?** OI(D) is public by ~16:00 UTC on D+1, inside S(D+1). So the **target is S(D+2)**, which starts
  at 17:00 New York on D+1, after publication.
- **Outcome.** `DR = ln(high/low) of S(D+2) ÷ (σ · √(8/π))`, σ = trailing 20-session close-to-close stdev of
  New York-close log returns ending at S(D+1) (known before S(D+2) opens).
- **Estimator (headline).** Vol-matched ΔDR: mean DR(short) − mean DR(long) within quintiles of σ, weighted by
  stratum size, strata with < 10 days in either arm skipped (script 21's `vol_matched_delta`, unchanged). Raw ΔDR
  reported alongside.
- **Instruments.** ES (Q1) and NQ (Q2), reported separately, never pooled.
- **Control.** Same-instrument long-gamma days, matched on trailing σ stratum. Absolute control: DR = 1 (random walk).
- **De-clustering.** None (one observation per session); serial dependence handled by the block bootstrap.
- **Sample / stability.** The window above; first and second halves by date reported (descriptive).

**Specification cells (all reported, the gate needs all four positive):** surface `near` / `all` × normaliser
`rv20` / `atr14` (`atr14` = 14-session mean H−L over close ÷ √(8/π), as in script 18), under the honest timing.

**Descriptive pipeline ladder (reported for both instruments, never scored):** (a) the original pipeline (UTC D1 bars,
OI(D) → next row); (b) New York-close bars, OI(D) → S(D+1); (c) the scored version, OI(D) → S(D+2). This shows how much
each fix moves the number.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| Q1 | ES, primary cell (near, rv20, honest timing): vol-matched ΔDR > 0? | **Weak yes or null.** Most S&P dealer gamma sits in Cboe SPX options (much of it 0DTE), not in the CME monthly/quarterly book this file holds, so the CME book is a thinner proxy for ES than for NQ. Expected size well below NQ's +0.315; a null would not surprise. |
| Q2 | NQ, same pipeline and window: vol-matched ΔDR > 0? | **Yes, smaller than +0.315.** The gamma sign is persistent day to day, so a one-day-later target should keep most of it; the Friday fix should help slightly. |
| — | **THE GATE (per question)** | vol-matched ΔDR ≥ **+0.05**, Holm-adjusted bootstrap p < 0.05 across Q1/Q2, sign positive on **all four** spec cells, placebo and injection checks pass |
| — | **THE MIRROR** | long-gamma DR below 1 in absolute terms (reported; the NQ finding was that long gamma is the quiet side). Not a gate. |

**Verdict rules (each question separately):**

- **VALIDATED**: the gate holds.
- **NULL**: the gate fails **and** the 95% interval of vol-matched ΔDR lies below **+0.10** (G2's operational bar,
  `GEX_RANGE_BROWNIAN_PREREG.md`: the two tiers are 2× apart, so less than 0.10 cannot justify switching), **or** the
  sign disagrees across the four cells with the interval below +0.10.
- **UNDERPOWERED**: anything else, or fewer than 400 usable sessions, or fewer than 60 in either arm on the primary
  cell.
- A failed placebo or injection check means the run is not believed: the verdict cannot be VALIDATED, and the
  results file says why.

## 5. Power — what this design can and cannot find (required)

From the banked NQ run only (no ES outcomes): bootstrap SE of raw ΔDR was 0.050 at 793 days (near) and 0.036 at
1,516 (all). SE scales roughly as 1/√n; MDE at 80% power, two-sided α 0.05 (Holm worst case 0.025 → ×3.0 SE).

| Cell | Planned n | SE (from NQ) | MDE (α 0.025) | Pass bar | Verdict |
|---|---|---|---|---|---|
| ES near, rv20 | unknown until the file lands; NQ's near surface covered 793 of 1,516 days, so plan for ~750–1,450 | 0.051–0.037 | 0.15–0.11 | +0.05 gate, +0.10 operational | **POWERED for an NQ-sized effect (+0.18 raw, +0.32 vol-matched); UNDERPOWERED for anything near the +0.05 gate.** |
| NQ near, rv20 | ~780 (same window, lockbox cut) | 0.051 | 0.15 | as above | same |

So this design can confirm or rule out an effect of the size NQ showed and the size G2 needs operationally (+0.10,
via the NULL rule's interval). It cannot resolve a small effect (+0.03 to +0.08); such a result will read UNDERPOWERED
by the rule above, which is the honest label.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** two, Q1 primary and Q2 primary. Holm at α = 0.05 across the two.
- The four-cell sign requirement is a conjunctive gate on top; no further correction.
- Pipeline ladder, halves, raw ΔDR, real-IV GEX (`net_gex`, if built), variance ratios: descriptive, no weight.
- **Promotion bar:** anything that would size or gate a live position needs |t| ≥ 3 on its scored cell. A pass here
  is research-only until then.

## 7. What this does NOT test (required)

- **Direction.** Range only; every gate has been null on direction and nothing here changes that.
- **Tradability.** `gamma-regime-trades` (NQ) was negative after costs on every arm; this is not a trading rule.
- **Value on top of the shipped range lines.** That is `one-range-forecast` Q2's question (null for NQ). A pass here
  would justify asking it for SPX500, in its own prereg.
- **The full S&P gamma book.** CME monthly/quarterly only: no weeklies, no Cboe SPX/SPY, no 0DTE. A null here does
  not rule out a gamma-range effect in the full book; the Cboe capture (`hedging-state-forward`) is the test for that.
- **Why NQ is different.** This confirms or kills the pattern; it does not explain it.

## 8. What each verdict changes (required)

- **Q1 VALIDATED** → ledger `gex-range-es` validated; the "long gamma is quiet" relation is an equity-index effect, not
  NQ-only. Next: register the SPX500 version of `one-range-forecast` Q2 (does it add on top of the shipped lines).
  Nothing live changes from this result alone.
- **Q1 NULL** → ledger null; G2 stays NQ-only, and with one replication failed in its nearest market the NQ result is
  treated as instrument-specific until the Cboe forward record says otherwise. G2 alert text unchanged (it already says
  NQ).
- **Q1 UNDERPOWERED** → ledger underpowered; the question waits for ~400 sessions of our own capture (CME weeklies +
  Cboe), autumn 2027.
- **Q2** updates the `gex-range` entry in place. VALIDATED → the entry's numbers are replaced by the honest-pipeline
  ones. NULL or UNDERPOWERED → `gex-range` is demoted to that verdict, the G2 card and `cog-knowledge` verdicts say
  the NQ effect did not survive honest timing, and Q1 is read in that light.

---

## Amendments

### A1 — 2026-10-21 — POST-HOC (results seen)

The NQ debug run (2026-10-20, after this prereg was pushed) returned the registered +125-row placebo at +0.125 on the
vol-matched statistic. Added, as descriptive only: the full distribution of label-shift placebos (every shift 60…n−60,
step 5) for both instruments, and `scripts/27b_gex_range_es_posthoc.py` (concentration, the trailing-return /
drawdown confound, ES/NQ overlap). Neither changes a verdict; the registered rule stands, so Q2 cannot be VALIDATED.
The post-hoc confound check demotes nothing formally but is stated next to the Q1 verdict everywhere it is banked.

---

## RESULTS

*Written to `oi_research_book/GEX_RANGE_ES_RESULTS.md`. Nothing above this line changes after the run.*
