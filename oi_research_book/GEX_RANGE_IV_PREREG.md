# gex-range-iv — is any short-gamma range widening left once implied vol is in the baseline?

**Pre-registered 2026-11-03, before any outcome was computed.** The only numbers below come from banked outputs
(`data/results/gex_range_es_posthoc.json`). No regression including implied vol has been run. Set as Q1c of
`.claude/skills/research-director/agendas/gex-range.md`, a follow-up to `gex-split-book` (null).

| | |
|---|---|
| ID / ledger id | `gex-range-iv` (two scored cells: ES, NQ) |
| Branch | `ccr-1e1f5362-zln3nr` |
| Register row | `plans/RESEARCH_REGISTER.md` → `gex-range-iv` |
| Data | The `gex-range-es` frames as built by `scripts/27_gex_range_es.py` (`frame(name, "near", "c", first_date)`: NY-close sessions, OI(D) → S(D+2), targets ≤ **2026-08-21**, lockbox respected), with the return/drawdown controls built as in `scripts/27b_gex_range_es_posthoc.py`. Implied vol: Cboe **VIX** (for ES) and **VXN** (for NQ) closes from `analysis/surfaces/cboe/*.csv` (dates MM/DD/YYYY). Sensitivity for NQ: CME settlement `iv30` from `data/iv_daily_nas100_usd.parquet`. |
| Seed | `20261103` |
| Uncertainty | stationary block bootstrap, mean block 10 sessions, B = 4,000 (`27b`'s OLS bootstrap) |
| Scripts / outputs | `oi_research_book/scripts/32_gex_range_iv.py` (imports scripts 27 and 27b; nothing copied) → `data/results/gex_range_iv.json`, `oi_research_book/GEX_RANGE_IV_RESULTS.md` |
| Harness | own script (OI-book convention) |

## 1. The claim (required)

Short-gamma sessions run wider than a same-vol random walk (ES vm +0.377, NQ +0.288). After trailing return and
drawdown controls, ES +0.147 (t 2.05) and NQ +0.165 (t 3.31) remain. `gex-split-book` found no book-specific effect
where the two books disagree, and both markets widen together. That points to a **common driver** the gamma sign
correlates with.

The obvious candidate is the one the earlier controls never had: **implied volatility**. Options already price the
next session's expected move. If short gamma just coincides with IV running above realised vol (fear priced in after
falls), the "gamma" widening is what the IV surface already says.

**Claim tested:** once the IV-to-realised ratio is in the baseline, a short-gamma coefficient remains.

## 2. Why it is not already settled (required)

- `gex-range-es` post-hoc OLS controlled σ quintiles, r5, r20 and dd60, but never IV.
- `gamma-real-iv` (null) found the IV surface prices gamma for **FX**, with only 26 NQ out-of-sample rows. The equity
  index cell was never closed.
- `one-range-forecast` Q2 (null) put NQ gamma on top of shipped lines that include IV, against a forecast benchmark
  (pinball), not this decomposition. It suggests the answer but is not the same test.
- **Seen data:** the fifth analysis on this window (family note in §6).

## 3. Definitions, fixed in advance (required)

- **Frames, DR, setup, timing:** exactly `GEX_RANGE_ES_PREREG.md` §3. DR = ln(H/L) of S(D+2) ÷ (σ·√(8/π)),
  σ = trailing 20-session stdev ending S(D+1). Short = near-book `net_gex_sum` < 0.
- **IV, knowable when:** the Cboe close (16:15 New York) on the label date of S(D+1), the last session before the
  target, which opens 17:00 New York. If that date has no Cboe close, use the last close on or before it (never after).
  IV ratio **v = ln(IV/100 ÷ (σ·√252))**: implied over trailing realised, on the same annualised scale. DR is already
  divided by σ, so v is the IV information DR doesn't already carry.
- **Baseline model (B0, reproduces the banked post-hoc):** OLS of DR on [1, short, σ-quintile dummies, r5, r20,
  dd60]. Its short coefficient must reproduce `27b` (ES +0.147, NQ +0.165) to within 0.005, or the run is stopped and
  debugged.
- **IV model (B1, scored):** B0 + v. **b_IV** = the short coefficient in B1.
- **Absorbed share (descriptive, rule fixed here):** Δb = b_B0 − b_IV, paired bootstrap (same resample for both
  models). "IV absorbs most of it" is stated only if Δb ≥ 0.5·b_B0 **and** the paired 95% CI of Δb > 0.
- **Noise threshold:** all-shift placebo on the short label in B1 (every shift 60…n−60 step 5); the real b_IV's
  percentile is the gate.
- **Sensitivity (descriptive):** NQ with `iv30` (CME) instead of VXN; v in quintile dummies instead of linear.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| ES | b_IV > 0? | **No: most of +0.147 absorbed.** After falls, IV runs above realised, and that is when ES books are short |
| NQ | b_IV > 0? | **Mostly absorbed; a small remainder possible** (NQ had the stronger controlled effect, t 3.31) |
| — | **THE GATE** (each cell) | b_IV ≥ +0.05; bootstrap 95% CI lower > 0; Holm p < 0.05 across the two cells; real b_IV above **95%** of all-shift placebos |
| — | **THE MIRROR** | long gamma's DR stays below the IV-implied expectation (reported; not a gate) |

**Verdict rules (each cell):**

- **VALIDATED**: the gate holds. Short gamma adds to what IV prices.
- **NULL**: the gate fails **and** the 95% CI upper bound of b_IV < **+0.10**.
- **UNDERPOWERED**: anything else.

## 5. Power — what this design can and cannot find (required)

From the banked post-hoc SEs of the same OLS without v: ES 0.072, NQ 0.050 (adding one regressor changes these only
slightly). MDE at 80% power, Holm worst case α 0.025 two-sided (×3.0 SE):

| Cell | n | SE (banked) | MDE | Pass bar | Verdict |
|---|---|---|---|---|---|
| ES b_IV | 770 | 0.072 | 0.22 | +0.05 gate / +0.10 operational | **UNDERPOWERED by design for a small remainder**; powered only to confirm a remainder ≥ 0.22 |
| NQ b_IV | 770 | 0.050 | 0.15 | same | **Powered for a remainder the size of the current controlled estimate (0.165); not below it** |

**Honest reading in advance:** a clean NULL needs the CI upper below +0.10, i.e. b_IV ≲ +0.0 (NQ) or ≲ −0.04 (ES). So
UNDERPOWERED is the likely label if IV absorbs most but not all. **Δb and the absorbed share are what this study can
answer well**, which is why their reading rule is fixed above.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored:** two cells (ES, NQ), Holm at α 0.05.
- Descriptive: Δb and the absorbed share, B0 reproduction, iv30 sensitivity, v in quintiles, halves, the long-gamma
  mirror.
- **Seen-data family:** fifth analysis of the 2020-10 → 2026-08 gamma/range window (`gex-range-es`, post-hoc, NQ
  re-run, `gex-split-book`, this). Any pass is research-only, with |t| ≥ 3 and unseen data required before live use.

## 7. What this does NOT test (required)

Direction; tradability; the full Cboe book; whether IV *causes* anything (both may respond to the same falls); forecast
value against the shipped lines (that is `one-range-forecast`'s pinball test).

## 8. What each verdict changes (required)

- **VALIDATED (either cell)** → ledger validated, research-only. Short gamma carries range information IV doesn't; the
  CME gamma sign stays a candidate input to the range lines (agenda Q2 can be reopened for that instrument).
- **NULL** → ledger null. "Short gamma is wider" is what implied vol already prices. Pages say "options already price
  the wider days; the gamma sign adds nothing", and the CME-book gamma-range line is closed for that instrument.
- **UNDERPOWERED** → ledger underpowered, with the absorbed share as the headline in `use` (e.g. "IV absorbs X%; what is
  left, if anything, is below what 770 sessions can see"). Nothing reopens on the CME book. The question moves to the
  Cboe capture.

---

## Amendments

(none)

---

## RESULTS

*Written to `oi_research_book/GEX_RANGE_IV_RESULTS.md`. Nothing above this line changes after the run.*
