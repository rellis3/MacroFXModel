# stress-filter-hold — does stepping down when the market is stressed improve holding NQ, beyond what vol sizing already does?

**Pre-registered 2026-11-02, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `stress-filter-hold` (study); ledger ids `stress-filter-hold-direction` (H1), `stress-filter-hold-flat` (H2a), `stress-filter-hold-half` (H2b), `stress-filter-hold-beyond-vt` (H3), `vol-managed-mm` (H4) |
| Branch | `main` (owner standing rule: push to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `stress-filter-hold` |
| Data | OANDA D1 mid closes (17:00 New York): NAS100 (primary), SPX500 and XAU/USD (secondary), weekdays only (DATA_SPEC #9). FRED VIXCLS (2000+) and VXVCLS (VIX3M, 2007-12+). USD 3m rate (`features/rate3m_usd.parquet`, monthly) for cash. Evaluation window **2004-01-02 → 2026-08-21** (gold 2007-01-02 →, S3 2009-01-02 →). Ends at the lockbox. |
| Seed | `20261102` (every script in this study) |
| Uncertainty | stationary block bootstrap, mean block 20 trading days, B = 2000, paired across arms; circular-shift label placebo (2000 shifts, offset ≥ 252 rows from each end) for H1 |
| Scripts / outputs | `scripts/stress-filter-hold/` → `analysis/output/stress-filter-hold/` |
| Harness | own Python script, because the arms are daily position series, not event trades; it re-uses the Phase 0 loader rules (`scripts/direction-bar/bar.py` `load`) |

## 1. The claim

C.OG, Discord, 2026-11-01 (pasted by the owner): *"test some simple filters, such as high stress or low stress"*, read the SSRN papers, and treat the full process as education. The owner's question behind it: a buy & hold held for weeks should make money, so does a daily regime filter make it better?

The literature version is Moreira & Muir (2017, *Volatility-Managed Portfolios*, SSRN 2659431): scale exposure by 1/σ², because returns do not rise with volatility, so high-vol periods carry worse risk-adjusted returns. Cederburg, O'Doherty, Wang & Yan (2020, *JFE*) found most of that gain does not survive out of sample.

The question this study answers: **on the Nasdaq, is a stressed market (VIX high against its own last year) followed by worse risk-adjusted returns, so that stepping down improves the hold, and does it add anything beyond plain vol-target sizing?**

## 2. Why it is not already settled

- `vol-target` (validated 2026-10-05): sizing by a forecast σ gives the same Sharpe and a 20–25% smaller worst month on NQ/ES/gold. That says vol sizing is a drawdown tool. It does not test a *discrete stress state*, and it did not test 1/σ² (Moreira–Muir).
- `iv-sizing-filter` (2026-09-23): an IV term-structure stress stand-aside on **bot trades** had the wrong sign (stress days better). Different object (intraday bot R, not holding the index), so not a re-run; it is a warning that stress may cut rebounds.
- `mv-vixterm-range` / market-sense VIX inversion: VIX ≥ VIX3M predicts **range**, not direction (range is not tested here).
- `direction-bar` (Phase 0): sets the bar. NQ base P(up) 0.554 at 1 day; a single-market 1-day cell at 10% coverage needs ~6pp / 0.13σ.
- `trend-following`, `portfolio-book` core beta: trend/beta sleeves, not a stress state.
- Exploratory 2026-11-01 (this session, not banked): NQ 2009–2026 buy & hold vs 200d / 50d MA long-flat and long-short. **Seen**: B&H Sharpe 0.90, long-flat 200d 0.72, long-short worse. No stress or VIX filter was computed. MA filters are not an arm here.

No banked entry tests a VIX-percentile stress state against holding the index.

## 3. Definitions, fixed in advance

**Prices and returns.**
- `P_t` = OANDA D1 mid close for date t, loaded exactly as `direction-bar` (`load`), weekdays only.
- Daily excess return `R_{t+1} = P_{t+1}/P_t − 1 − rf_t/252`, where rf_t = USD 3m rate (% p.a./100) of the latest month **before** the month of t (latest vintage; it is accounting, not a signal).
- Dividends are ignored (NDX ~0.7%/yr). The same omission applies to every arm, and flat days earn 0 excess, so it biases against the filters very slightly.
- Point-in-time σ̂_t = EWMA (λ 0.94, min 60 obs) of daily log returns ≤ t, annualised ×√252.

**Knowable when.**
- VIXCLS is the 16:15 ET close, so it is known before the 17:00 ET OANDA mark. A signal on date t sets the position w_t held from close t to close t+1.
- If VIX is missing on t (exchange holiday mismatch), carry the last value forward, at most 3 rows.
- **Robustness (required for VALIDATED):** the same arm with the signal lagged one extra row (w_t uses the signal of t−1).

**Stress states** (all strictly point-in-time):
- **S1 (primary):** VIX_t > 80th percentile of VIX over the previous 252 valid rows (t−252 … t−1, t excluded). Expected coverage about 20%.
- **S2 (secondary):** RV20_t = √(252 · mean of the last 20 squared log returns ≤ t), for the instrument's own returns, above the 80th percentile of RV20 over the previous 252 rows.
- **S3 (secondary):** VIX_t ≥ VIX3M_t.

**Arms (position w_t, long-only):**

| Arm | w_t |
|---|---|
| B1 buy & hold | 1 |
| F-flat | 0 if stressed, else 1 |
| F-half | 0.5 if stressed, else 1 |
| VT (vol target) | min(2, σ*_t / σ̂_t), with σ*_t = expanding median of σ̂ up to t (point-in-time, so average exposure ≈ 1) |
| VT+S | VT × (0.5 if stressed, else 1) |
| MM (Moreira–Muir, daily) | min(2, v*_t / σ̂_t²), with v*_t = expanding median of σ̂² up to t |

**Costs (futures basis, every arm).**
- Turnover: |w_t − w_{t−1}| × c per day, with c = 0.003% for NQ/ES and 0.005% for gold per unit traded.
- Roll: 4 rolls a year at 2c × |w|, charged daily as |w_t| × 8c/252.
- A 3× cost stress is reported.
- CFD financing is not modelled (the owner's live route for a multi-week hold would be futures; said in §7).

**Outcomes.**
- **H1 (direction):** z_{t+1} = R_{t+1} / (σ̂_t/√252). Statistic Δz = mean(z | S1 stressed) − mean(z | calm). The P(up) on stressed days vs B0 (the expanding P(up) of `direction-bar`) is reported beside it.
- **H2–H4 (economic):** the annualised net Sharpe difference (mean/sd × √252, daily net excess returns) between two arms, paired.
- **Described for every arm, not scored:** CAGR, vol, max drawdown, worst calendar month, Calmar, time in market, turnover, and drawdown after scaling each arm ex post to B1's full-sample vol.

**Uncertainty.**
- H1:
  - p-value from the circular-shift placebo on the stress label, which keeps its clustering;
  - 95% CI from the stationary block bootstrap.
- H2–H4: paired stationary block bootstrap (mean block 20, B 2000).
  - The CI is the 2.5–97.5 percentiles.
  - The p-value is twice the smaller tail share around 0.

**Sample split** for the stability gate: 2004-01-02 → 2014-12-31 and 2015-01-01 → 2026-08-21.

## 4. Hypotheses, expectation first

| # | Question (NQ, S1) | Pre-registered expectation |
|---|---|---|
| H1 | Δz < 0: are stressed days followed by lower risk-adjusted returns than calm days? | **Null / underpowered.** Moreira–Muir implies Δz ≈ −0.02 to −0.04σ, below the ~0.1σ this design can see (§5). |
| H2a | Sharpe(F-flat) − Sharpe(B1) > 0 | **Small, not significant** (+0.0 to +0.15); drawdown clearly lower |
| H2b | Sharpe(F-half) − Sharpe(B1) > 0 | same as H2a, smaller in both directions |
| H3 | Sharpe(VT+S) − Sharpe(VT) > 0 — **the stress state adds something beyond vol sizing** | **Null** (≈ 0); the stress state is mostly what σ̂ already sees |
| H4 | Sharpe(MM) − Sharpe(B1) > 0 — the SSRN replication on NQ | **Small positive, not significant**, in line with Cederburg et al. |

**THE GATE (for a VALIDATED on a scored cell), all of:**
1. Holm-adjusted p < 0.05 within the five-cell family.
2. The sign is the claimed one in both halves.
3. The extra one-row-lag version has the same sign, with p < 0.10 unadjusted.
4. The 3× cost version keeps the sign.

H1 additionally needs the placebo p and the bootstrap CI to agree (the CI excludes 0).

**THE MIRROR:** stressed days followed by *better* returns (Δz > 0, filters losing Sharpe). If that comes back significant it is reported as the measured result for H1–H3, i.e. NULL for the claim. It is **not** promoted to a "buy stress" rule without its own prereg.

**Secondary (descriptive, cannot validate alone):**
- the same five cells for S2 and S3 on NQ;
- S1–S3 on ES and gold.

That is 40 cells, BH at q 0.10. A secondary cell that survives is a candidate for its own prereg.

## 5. Power — what this design can and cannot find

The script computes the MDEs before scoring, from controls only, and prints them first:
- **H1:** the placebo SD of Δz across circular label shifts, giving MDE = (z_{0.975} + z_{0.80}) × SD_placebo. This shift-placebo SD is computed on the real return series, but with every label decoupled from its own day.
- **H2–H4:** the bootstrap SD of the Sharpe difference, giving MDE = 2.8 × SD.
- **A positive control, run before scoring:**
  1. Draw 200 random circular shifts of S1.
  2. On each, plant Δz = −0.15σ by subtracting 0.15 × σ̂_t/√252 from R_{t+1} on the shifted stressed days.
  3. Report the share detected at p < 0.05 by the H1 machinery.

  This is not a pass condition, but if it is below 0.6 the H1 design is declared too weak in the results.

Expectation from what is already known (no setup outcome):
- Phase 0 puts a 1-day NQ cell at 10% coverage at ~0.13σ.
- At ~20% coverage with clustered stress runs (design effect ~2–3), MDE ≈ 0.10–0.15σ.
- SE of a single 22-year Sharpe ≈ 0.21; a paired difference of correlated arms is ~0.08–0.15, so MDE_Sharpe ≈ 0.2–0.4.

| Cell | n (rows) | MDE (expected) | Pass bar | Verdict by design |
|---|---|---|---|---|
| H1 Δz | ~5,700 (≈1,100 stressed) | 0.10–0.15σ | > 0 at Holm 0.05 | **likely UNDERPOWERED** for the Moreira–Muir-sized effect (0.02–0.04σ) |
| H2a/H2b/H3/H4 ΔSharpe | ~5,700 | 0.2–0.4 | > 0 at Holm 0.05 | powered only for large gains |

**Verdict rule per cell:**
- **VALIDATED:** the gate holds.
- **NULL:** not validated, and the 95% CI upper bound for the claimed direction is below the worthwhile size. That size is **+0.15 Sharpe** (H2–H4) or **0.05σ** (H1), so a worthwhile gain is ruled out.
- **UNDERPOWERED:** not validated, and the CI still includes the worthwhile size.
- **NULL (mirror):** the CI excludes 0 in the wrong direction.

Drawdown reductions are reported as CONTEXT; they are expected and not a claim.

## 6. Multiplicity

- **Scored cells:** H1, H2a, H2b, H3, H4, on NQ with S1. Holm at α = 0.05 across the five.
- **Secondary:** the 40 cells in §4, BH q 0.10, candidates only.
- **Ledger:** the result is placed against the 241-claim trial ledger by `build_trial_ledger`, and the ledger-level p is reported.
- **Promotion to anything that sizes a live position:** needs |t| ≥ 3 plus a forward record (§8).

## 7. What this does NOT test

- Range or volatility prediction (VIX ≥ VIX3M → wider range is already banked).
- Shorting in stress. Long-only by design: the exploratory look showed shorting fought the drift on every rule.
- CFD financing (multi-week CFD holds pay overnight financing; a pass here is a futures-basis result).
- Intraday timing and execution at the 17:00 mark beyond the turnover cost.
- Any FX instrument, event filters, or combinations with other cells (the owner's Phase 0 limit).
- Moreira–Muir at their monthly rebalance. This is a daily variant, and labelled so.
- Why it works (cause).

## 8. What each verdict changes

- **Every verdict:** banked in `js/deskEvidence.js` with a POWER row, the trial ledger regenerated, and the register row → BANKED.
- **Every verdict, forward record:** S1 is added to the direction ledger as a research forecaster `stress-vix-p80`. It has its own model id and this prereg. It issues `p_up = B0 + (in-sample P(up|stressed) − P(up))` when stressed, and no forecast when calm. That is how the owner's Phase 0 ledger becomes the forward evidence for a cell history can't settle. The excess is frozen at the in-sample value and recorded in the results. This is added after the results commit, in its own commit.
- **Pass (H2/H3/H4):** the Overnight Hold / hold pages may show the stress state as a validated risk-down rule for holding NQ. Nothing live sizes on it until |t| ≥ 3 and 20 forward stressed episodes in the ledger.
- **Null on H3, with a drawdown cut on H2:** the line becomes "a stress filter is a drawdown tool, same as vol sizing, and adds nothing beyond it". Further stress filters on holding NQ are closed unless there is a new mechanism.
- **Underpowered:** the forward ledger forecaster is the only route. History can't settle a ~0.03σ daily effect.

## Amendments

### A1 — 2026-11-02 — PRE-RESULTS (describe only)
Two loader details fixed before any outcome was computed:
- The USD 3m rate is monthly with month-start dates. It is now read without the weekday filter, which had dropped weekend month starts.
- The evaluation starts 2004-03-16, not 2004-01-02, because the 252-row VIX percentile needs history on the NQ calendar, which begins 2003-03-24.

## RESULTS — run 2026-11-02

Full write-up: `analysis/output/stress-filter-hold/RESULTS.md`. NQ, 5,795 days, 1,122 stressed. Holm across the five cells:

| Cell | Statistic | 95% CI | Holm p | Verdict |
|---|---|---|---|---|
| H1 | Δz **+0.022σ** (wrong sign, both halves) | [−0.051, +0.089] | 1.0 | UNDERPOWERED |
| H2a | ΔSharpe −0.079 | [−0.330, +0.204] | 1.0 | UNDERPOWERED |
| H2b | +0.013 | [−0.105, +0.133] | 1.0 | NULL |
| H3 | −0.029 (beyond vol target) | [−0.113, +0.069] | 1.0 | NULL |
| H4 | −0.006 (Moreira–Muir) | [−0.263, +0.257] | 1.0 | UNDERPOWERED |

Secondary: 0 of 40 cells survive BH q 0.10.
- Stress filters' drawdown cut disappears at matched volatility (−57% vs −55%).
- Vol sizing gives −42%, and 1/σ² gives −30%.

Ledger forecaster `stress-vix-p80` added per §8.
