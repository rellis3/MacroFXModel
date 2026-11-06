# gex-range-gold — does the G2 gamma-range effect appear on gold, once the timing and the bars are honest?

**Pre-registered 2026-11-06, before any gold outcome was computed.** The gold option history (Databento `OG.OPT`) was
still downloading when this was written (44 of 54 monthly chunks on disk, none assembled, none opened). No gold range,
DR or GEX value had been computed. The only numbers used below come from the banked NQ and ES runs
(`GEX_RANGE_ES_RESULTS.md`, `GEX_RANGE_IV_RESULTS.md`).

| | |
|---|---|
| ID / ledger id | Q1 `gex-range-gold` (new, confirmatory). Q2 `gex-range-gold-nq-ref` (NQ re-scored on the same script, **reference only**, see §3) |
| Branch | `gex-range-gold` |
| Register row | `plans/RESEARCH_REGISTER.md` → `gex-range-gold` |
| Data | Gold options: Databento `GLBX.MDP3`, parent `OG.OPT` (standard monthly gold options, underlying GC), definition + statistics, 2022-11-05 → 2026-09-04, pulled 2026-11-05/06 with `oi_recon/databento_gold_pull.py`, assembled to `oi_recon/databento_oi/XAU_USD.csv` (same columns as the other pairs). NQ options: existing `oi_recon/databento_oi/NAS100_USD.csv`. Prices: OANDA M1 `portfolioBacktest/cache/xauusd_m1.parquet` and `nas100_usd_m1.parquet` (M1 ends 2026-08-20). **Window ends 2026-08-21 (lockbox).** |
| Seed | `20261106` (every script in this study) |
| Uncertainty | stationary block bootstrap, mean block 10 sessions, B = 10,000 (identical to the NQ and ES studies) |
| Scripts / outputs | `oi_research_book/scripts/34_gex_range_gold.py` (a copy of `27_gex_range_es.py` with the instrument table changed, nothing else) + a `XAU_USD` row in `pair_config.py` → `oi_research_book/data/results/gex_range_gold.json`, `oi_research_book/GEX_RANGE_GOLD_RESULTS.md` |
| Harness | own script; reuses the bootstrap and estimator code of scripts 18, 21 and 27 verbatim (OI book convention) |

## 1. The claim (required)

G2 of the C.OG shadow reads dealer gamma and maps it to a range tier. On NQ the next-day range divided by what a random
walk of the same trailing vol would give (DR) is higher on short-gamma days than on long-gamma days (`gex-range`:
vol-matched +0.288 [+0.176, +0.400] under honest timing, but its registered single-shift placebo failed; the all-shift
placebo passes). On ES, `gex-range-es` was validated (vm +0.377 [+0.237, +0.516]), though post-hoc about half of that
is recent falls (return-controlled +0.147, t 2.05). FX did not reproduce it (`GEX_FX_CROSSMATCH`, pooled +0.038).

**Claim tested here:** the same effect, measured the same way, appears on **gold**, using the CME gold options book
(OG, on GC futures).

## 2. Why it is not already settled (required)

- Gold has never been tested for this: no gold option history existed (the CME `OG.OPT` series was priced and
  confirmed on a one-day pull on 2026-11-05, then pulled in full).
- `gex-range-es` and `gex-range` are the nearest entries and are different instruments. `gex-range-iv` asked whether
  anything is left once implied vol is in the baseline (ES and NQ only; UNDERPOWERED, IV absorbs 64% / 73%); that is a
  different question and is not re-opened here.
- `hedge-flow` (size beyond gamma sign: NULL) and the positioning nulls say nothing about the sign → range relation.
- The commodities in the OI Profile have no tested gamma-range link; this is the first.

## 3. Definitions, fixed in advance (required)

Identical to `GEX_RANGE_ES_PREREG.md` §3, repeated here only where gold differs:

- **Sessions.** New York-close sessions built from OANDA XAUUSD M1 by `27a_nyclose_sessions.py` (label = date of NY
  time + 7 h; weekends dropped; ≥ 60 M1 bars per session). CME trade date D ↔ session S(D).
- **Setup.** `net_gex_sum` from the `near` surface (DTE ≤ 45) for trade date D, **sign only** (short gamma = < 0),
  computed by `01_build_daily_dataset.py` exactly as for NQ and ES. Gold contract multiplier **100** (troy oz; sign is
  unaffected). OANDA spot at the New York close is used as the spot, as for NQ and ES.
- **Knowable when?** OI(D) is public by ~16:00 UTC on D+1, so the **target is S(D+2)**.
- **Outcome.** `DR = ln(high/low) of S(D+2) ÷ (σ · √(8/π))`, σ = trailing 20-session close-to-close stdev of NY-close
  log returns ending at S(D+1).
- **Estimator (headline).** Vol-matched ΔDR (script 21's `vol_matched_delta`, unchanged): mean DR(short) − mean
  DR(long) within σ quintiles, size-weighted, strata with < 10 days in either arm skipped. Raw ΔDR reported alongside.
- **Specification cells (all four must be positive):** surface `near` / `all` × normaliser `rv20` / `atr14`.
- **Descriptive ladder (never scored):** (a) UTC-D1 pipeline, (b) NY-close bars with OI(D) → S(D+1), (c) scored.
- **Q2, NQ reference.** The NQ rows run through the same script on the same code path, so gold and NQ are comparable
  line for line. NQ's window is the NQ OI history already used in `gex-range-es`; **it is not unseen data**, so Q2 is
  not an independent test and cannot VALIDATE anything. It is reported to show whether the gold script reproduces the
  banked NQ number (a pipeline check), nothing more.
- **Placebo gate (replaces the ES single-shift placebo).** Label-shift placebos at every shift 60 … n−60, step 5
  (circular within the window), vol-matched ΔDR each; the real ΔDR must exceed the **95th percentile** of that
  distribution. This is the all-shift gate that the `gex-range` register row said to restore.
- **Injection check.** On a copy of the data, multiply DR on short-gamma sessions by 1.15; the estimator must return
  ΔDR within ±0.03 of the injected size (shows the estimator and the bootstrap can see an effect of that size).

**Gold-specific limitations declared up front:** (1) the strikes are GC futures strikes and the spot is OANDA spot;
the futures-spot basis (a few tenths of a percent) can move a strike's gamma weight and is not corrected. A
descriptive sensitivity shifts the spot ±0.5% and counts sessions whose gamma sign flips (reported, not scored).
(2) `OG.OPT` is the standard monthly series only; gold weeklies and Friday options are not in the file, so the book is
the longer-dated part of gold dealer gamma, as the ES book was for ES.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| Q1 | Gold, primary cell (near, rv20, honest timing): vol-matched ΔDR > 0? | **Null or weak.** FX (a macro-driven market) did not reproduce the NQ effect, and gold's range is driven largely by macro and rates news that the option book does not carry. The CME monthly book is a partial view of gold gamma. I would put the chance of a positive sign near 55% and of clearing the gate near 25%. A null would not surprise. |
| Q2 | NQ reference: reproduces the banked vol-matched ΔDR (+0.29 ± 0.05)? | **Yes**, to within the bootstrap error. If it does not, the gold script is wrong and Q1 is not believed. |
| — | **THE GATE (Q1)** | vol-matched ΔDR ≥ **+0.05**, bootstrap p < 0.05 (one scored cell, so no Holm needed), sign positive on **all four** spec cells, real ΔDR above the 95th percentile of the all-shift placebo, injection check passes |
| — | **THE MIRROR** | long-gamma DR below 1 in absolute terms (reported; not a gate) |

**Verdict rules (Q1):**

- **VALIDATED**: the gate holds.
- **NULL**: the gate fails **and** the 95% interval of vol-matched ΔDR lies below **+0.10** (G2's operational bar), or
  the sign disagrees across the four cells with the interval below +0.10.
- **UNDERPOWERED**: anything else, or fewer than 400 usable sessions, or fewer than 60 in either arm on the primary
  cell.
- A failed placebo, injection or Q2 pipeline check means the run is not believed: Q1 cannot be VALIDATED, and the
  results file says why.

## 5. Power — what this design can and cannot find (required)

From the banked NQ run only (no gold outcomes): bootstrap SE of raw ΔDR was 0.050 at 793 days (near) and 0.036 at
1,516 (all). SE scales roughly as 1/√n; MDE at 80% power, one scored cell, two-sided α 0.05 → ×2.8 SE.

| Cell | Planned n | SE (from NQ) | MDE | Pass bar | Verdict |
|---|---|---|---|---|---|
| Gold near, rv20 | about 3.8 years of sessions ≈ 950 minus sessions without a near-surface book; plan for **600–950** | 0.058–0.046 | **0.16–0.13** | +0.05 gate, +0.10 operational | **POWERED for an NQ- or ES-sized effect (+0.18 raw, +0.3 vol-matched); UNDERPOWERED for anything near the +0.05 gate.** |

So a gold effect of NQ's size can be found or ruled out; an effect of +0.03 to +0.08 cannot be resolved and will read
UNDERPOWERED, which is the honest label. The measured n will be written into Amendment A1 (PRE-RESULTS) when the
gold file is assembled, from row counts only.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** one (Q1 primary). No Holm needed. Q2 is not scored.
- The four-cell sign requirement is a conjunctive gate on top; no further correction.
- Ladder, halves, raw ΔDR, spot-shift sensitivity, variance ratios: descriptive, no weight.
- **Variants tried:** none beyond the four registered cells. Any variant added later goes under Amendments as
  POST-HOC.
- **Promotion bar:** anything that would size or gate a live position needs |t| ≥ 3 on its scored cell. A pass here is
  research-only until then.

## 7. What this does NOT test (required)

- **Direction.** Range only; every direction gate has been null and nothing here changes that.
- **Tradability.** `gamma-regime-trades` (NQ) was negative after costs on every arm.
- **Value on top of the shipped gold range lines** (`one-range-forecast`-style). A pass here would justify asking it
  for gold, in its own prereg.
- **The full gold gamma book.** Standard monthlies only; no weeklies, no Friday options, no OTC. A null does not rule
  out an effect in the full book.
- **Vega.** The new vega column in the OI Profile is descriptive; nothing here tests it.
- **OI Lab gold levels as reaction levels.** A separate question (own prereg) once the history exists.

## 8. What each verdict changes (required)

- **Q1 VALIDATED** → ledger `gex-range-gold` validated: "long gamma is quiet" holds on gold as well as NQ and ES;
  the G2 card gains gold. Next: its own prereg for whether gamma adds to the shipped gold range lines.
- **Q1 NULL** → ledger null; G2 stays an equity-index effect (NQ, ES), and the OI Profile's gamma column for gold is
  described as a picture of the book, not a range read.
- **Q1 UNDERPOWERED** → ledger underpowered; waits for our own capture (weeklies included), autumn 2027.
- **Q2** changes nothing; a failure means the gold script is fixed before anything is read.

---

## Amendments

*(none yet)*

---

## RESULTS

*Written to `oi_research_book/GEX_RANGE_GOLD_RESULTS.md`. Nothing above this line changes after the run.*
