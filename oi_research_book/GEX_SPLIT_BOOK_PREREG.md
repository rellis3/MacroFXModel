# gex-split-book — on the days NQ's and ES's dealer books disagree, does the range spread lean toward the short book?

**Pre-registered 2026-11-03, before any outcome was computed.** The only outcome-derived numbers used below are the
standard deviation and lag-1 autocorrelation of the NQ−ES spread on **agreement (control) days only**, and gamma-label
counts. No disagreement-day outcome has been computed. Set as Q1 of `.claude/skills/research-director/agendas/gex-range.md`.

| | |
|---|---|
| ID / ledger id | `gex-split-book` (one scored question) |
| Branch | `ccr-1e1f5362-zln3nr` |
| Register row | `plans/RESEARCH_REGISTER.md` → `gex-split-book` |
| Data | The `gex-range-es` frames exactly as built by `scripts/27_gex_range_es.py` (`frame(name, "near", "c", first_date)`): NY-close sessions from OANDA M1, CME monthly/quarterly near book (DTE ≤ 45), OI(D) → session S(D+2), window 2020-10-20 → target sessions ≤ **2026-08-21** (lockbox respected). NQ and ES joined **by OI date and target session** (`date`, `tgt`), not by row. |
| Seed | `20261103` (every script in this study) |
| Uncertainty | stationary block bootstrap, mean block 10 sessions, B = 10,000 (`scripts/18`'s `_boot_stats`, as in `gex-range-es`) |
| Scripts / outputs | `oi_research_book/scripts/31_gex_split_book.py` (imports script 27's `frame`, `sessions`, `first_date`; nothing copied) → `data/results/gex_split_book.json`, `oi_research_book/GEX_SPLIT_BOOK_RESULTS.md` |
| Harness | own script (OI-book convention); controls built as in `27b_gex_range_es_posthoc.py` |

## 1. The claim (required)

C.OG to the owner, 18/08/2026: *"What you'll need is possibly an external factor that has predictive power towards
forecasting pinning vs acceleration. The place most people begin with that is open interest."* The repo found that
next-session range relative to a same-vol random walk (DR) is wider on short-gamma days: ES +0.377, NQ +0.288
vol-matched (`gex-range-es`, `gex-range`). But short gamma follows falls, and recent falls widen ranges on their own
(the leverage effect). Controlling trailing return and drawdown leaves **ES +0.147 (t 2.05), NQ +0.165 (t 3.31)**,
post-hoc and research-only.

**Claim tested here:** the dealer book itself, not the recent fall, moves the range. Test it where the confound
is shared and the book is not. ES and NQ fall together, and their books share the gamma sign on 82.5% of dates. On the
135 dates they disagree, a common fall can't explain which of the two markets runs wider; the book can.

## 2. Why it is not already settled (required)

- `gex-range-es` / `gex-range` scored each instrument against its own long-gamma days. The leverage confound sits
  inside that contrast; the post-hoc OLS controls reduce it but rely on the controls capturing the confound fully.
- `27b` reported the overlap counts (147 / 52 / 83) as a caveat ("ES is not an independent confirmation"). It never
  scored the disagreement days.
- `one-range-forecast` Q2 (null) asked about incremental value over the shipped lines, a different question.
- **Seen data.** The 2020-10 → 2026-08 window has been analysed by `gex-range-es`, its post-hoc and the NQ re-run. This
  design is new on that window, but the window is not new. A pass here is a stronger *confirmation of mechanism*, not
  fresh-data evidence (§6).

## 3. Definitions, fixed in advance (required)

- **Sessions, setup, timing, DR.** Exactly as `GEX_RANGE_ES_PREREG.md` §3. Short gamma = `net_gex_sum` < 0 on the near
  book for trade date D. DR = ln(H/L) of S(D+2) ÷ (σ·√(8/π)), σ = trailing 20-session close-to-close stdev ending
  S(D+1). OI(D) is public before S(D+2) opens (script 27's assertion is kept).
- **Construct.** For each date in both frames: **S = DR_NQ − DR_ES** (each on its own σ). **g = short_NQ − short_ES**
  ∈ {−1, 0, +1}: +1 NQ-only short, −1 ES-only short, 0 agreement.
- **Controls** (each the NQ value minus the ES value, measured at S(D+1) as in `27b`): Δr5, Δr20 (log returns over 5
  and 20 sessions), Δdd60 (log distance below the 60-session high), and ln(σ_NQ/σ_ES).
- **Primary statistic β.** OLS of S on [1, 1{g=+1}, 1{g=−1}, controls] over all joined dates. **β = (b₊ − b₋) / 2**,
  the controlled effect of moving one book from long to short, in DR units. The per-state coefficients b₊ and b₋ are
  each relative to the agreement days (the control).
- **Raw contrast** (descriptive): ΔS = mean S(g=+1) − mean S(g=−1).
- **Uncertainty.** Block bootstrap of β (B 10,000, mean block 10, seed above).
- **Noise threshold.** All-shift placebo: circularly shift the g vector by every k in 60…n−60 step 5, re-fit, collect
  β. The real β's percentile in that distribution is the placebo gate. The bar is checked against the placebo's own sd,
  per the 2026-10-21 lesson in `research-protocol` (`stats-defaults.md`).
- **De-clustering.** None; one row per date. Disagreement days fall in 60 spells (mean 2.2 days), handled by the block
  bootstrap.
- **Horizon family (descriptive, not scored).** S over cumulative windows S(D+2)…S(D+2+h), h = 0, 2, 4 (range over the
  window vs Brownian expectation for that many sessions), same regression.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| Q1 | β > 0: when one book is short and the other long, the short book's market runs wider relative to the other, beyond relative falls? | **Yes, about +0.10 to +0.15** if the post-hoc gamma-specific parts (+0.15 each) are real; ~0 if the per-instrument effect was the leverage effect |
| — | **THE GATE** | β ≥ +0.05; bootstrap 95% CI lower bound > 0; real β above **95%** of the all-shift placebos; **both mirror signs right**: b₊ > 0 and b₋ < 0 |
| — | **THE MIRROR** | NQ-only short pushes S up (b₊ > 0); ES-only short pushes S down (b₋ < 0). Both required (conjunctive) |

**Verdict rules:**

- **VALIDATED**: the gate holds.
- **NULL**: the gate fails **and** the 95% CI upper bound of β is below **+0.10** (G2's operational bar), meaning a
  book-specific effect large enough to matter is ruled out.
- **UNDERPOWERED**: anything else, or fewer than 40 days in either disagreement state.
- If the placebo sd exceeds the gate distance (0.05), the result is reported but cannot be VALIDATED, and the file
  says why.

## 5. Power — what this design can and cannot find (required)

From control (agreement) days only: sd(S) = **0.281** (n 635), lag-1 autocorrelation 0.094. Disagreement states:
83 (NQ-only short) and 52 (ES-only short).

| Cell | Planned n | Outcome SD (control) | Design effect | MDE (80% power, α 0.05 two-sided) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| β (controlled) | 83 + 52 vs 635 | 0.281 | 1.5 (spells of 2.2 days, low outcome autocorrelation) | SE(ΔS) ≈ 0.281·√(1/83+1/52)·√1.5 ≈ 0.060 → SE(β) ≈ 0.030–0.035 with controls → **MDE ≈ 0.09–0.10** | +0.05 gate, +0.10 operational | **POWERED for the expected +0.10 to +0.15; UNDERPOWERED below ~+0.09** |

If β is truly 0, its CI is about ±0.07, so the NULL rule (upper bound < +0.10) is reachable. That is what makes a no
informative here.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **One scored cell** (β). The mirror and placebo are conjunctive gates on it; no further correction.
- Descriptive: raw ΔS, per-state coefficients, the horizon family, halves by date, the agreement-day split (both short
  vs both long).
- **Seen-data family.** This is the fourth analysis on the 2020-10 → 2026-08 gamma/range window (`gex-range-es`, its
  post-hoc, the NQ re-run, this). A pass is recorded as research-only. The promotion bar (|t| ≥ 3) applies, and
  confirmation on unseen sessions is still required before anything live uses it.

## 7. What this does NOT test (required)

- Direction. Range only.
- Tradability, and value on top of the shipped range lines (`one-range-forecast` Q2's question; Q2 of the agenda).
- The full dealer book. CME monthly/quarterly only, about 5% of Nasdaq dealer gamma. A null does not rule out a
  full-book effect.
- Why NQ and ES books disagree on those days.

## 8. What each verdict changes (required)

- **VALIDATED** → ledger `gex-split-book` validated (research-only). The gamma-specific part of `gex-range` /
  `gex-range-es` is supported by a control the leverage confound can't reach. Next: agenda Q2 (does it add to the
  SPX500/NQ lines), and restoring `gex-range` on unseen data keeps this as its mechanism check. Nothing live changes.
- **NULL** → ledger null. The per-instrument gamma-range effect is treated as the leverage effect wearing a gamma
  label. The OI pages and the `cog-knowledge` G2 line say "recent falls widen ranges; the CME gamma sign adds nothing
  once that is shared". Agenda Q2–Q5 on the CME book are closed. The question waits for the full Cboe book
  (`hedging-state-forward`).
- **UNDERPOWERED** → ledger underpowered. The same design is re-run on the forward capture once it adds ~100
  disagreement days.

---

## Amendments

### A1 — 2026-11-03 — PRE-RESULTS

A planted-signal check is added as **descriptive** (it does not enter the gate). Add +0.15 to the DR of whichever
market's book is short on disagreement days, re-fit, and confirm β rises by about +0.15. This follows the
`research-protocol` lesson to plant a known effect in the exact pipeline before trusting its power. It also
confirms the β = (b₊ − b₋)/2 bookkeeping. No outcome had been computed; the script was written but not run.

---

## RESULTS

*Written to `oi_research_book/GEX_SPLIT_BOOK_RESULTS.md`. Nothing above this line changes after the run.*
