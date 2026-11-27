# gold-line-system-base: does the full gold system (18 shadow lines, Jordan's gold entry, VWAP + 0.5σ target) make money, and which stop works better: the 0.15 × P90 that led `gold-line-target-stop` or Jordan's rolling MAE?

**Pre-registered 2026-11-27, before this combination has been simulated.**

| | |
|---|---|
| ID / ledger id | `gold-line-system-base` (S1: 0.15 × P90 stop) and `gold-line-system-base-mae` (S2: rolling-MAE stop) |
| Branch | `jvphone` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gold-line-system-base` |
| Source | Owner 2026-11-27: "the entry lines should be for gold the shadow lines, then the entry the gold entry, and the TP set to be the VWAP line". Builds on `gold-line-target-stop` (OH/OL P75/P90 only: best cell f 0.15, VWAP + 0.5σ_v, BE off, +0.112R, UNDERPOWERED) and `gold-rolling-mae-window` A2 (arm E on 18 lines, line-inside target, rolling-MAE stop: +0.059R OOS, UNDERPOWERED) |
| Lines | gold's 18 shadow lines (N7_ALL walk-forward widths, `analysis/output/gold-rolling-mae-window/widths/F_GOLD.parquet`): OH, OL, Close+, Close−, HL projection up (running low + HL width), HL projection down (running high − HL width) × P50 / P75 / P90 |
| Entry | Jordan's gold entry (ForecastBandFade.cs), as arm E of `gold-rolling-mae-window` A2, engine `sim` in `scripts/gold-rolling-mae-window/run_entry.py` (positive control: reproduces `gold-band-fade-stop` A2 exactly). Overshoot 0.10 × that line's stop arms a stop order at the line; fill on the retest (on the arming bar only if it closes back through; a later bar that opens past the line fills at its open); cancel at 1.2 × stop beyond the line; chase to a more extreme same-side line; one trade at a time; each line once a session; flat 22:00 London |
| Target | **VWAP + 0.5σ_v** (short; long: VWAP − 0.5σ_v), the VWAP of the bars before the fill bar, fixed at the fill bar. VWAP / σ_v exactly as `scripts/gold-line-target-stop/run.py` `sessions()` (hlc3 × exchange volume from 00:00 London; σ_v = median of the previous 20 sessions' RMS(hlc3 − VWAP)). A target not on the profit side of the entry = no target (stop / 22:00 only; share reported). Cannot fill on the fill bar |
| Data | GC futures M1 unadjusted with volume (NT8), 2020 → 2026-08-21. **IS 2021–2022, OOS 2023 → 2026-08-21** (2020 = burn-in for the rolling-MAE stop and σ_v; both arms scored on the same sessions). Lockbox untouched |
| Seed | `20261127` |
| Uncertainty | 63-session block bootstrap, B = 2000, 90% CI |
| Scripts / outputs | `scripts/gold-line-system-base/` → `analysis/output/gold-line-system-base/` |
| Live impact | None |

## 1. Claim

The system as the owner describes it (shadow lines → gold entry → VWAP-band target) earns a positive net R per trade on
gold out of sample, above the same pipeline on shuffled lines.

## 2. Why this isn't already settled

`gold-line-target-stop` had the entry and the VWAP target but only 4 lines (OH/OL P75/P90) and was one of 36 cells.
`gold-rolling-mae-window` A2 had the entry and all 18 lines but the line-inside target. Neither ran the combination.

## 3. Definitions

- **S1 stop:** 0.15 × the distance from the session open to that side's P90 line (OH P90 for upper lines, OL P90 for
  lower lines), as the `gold-line-target-stop` best cell.
- **S2 stop:** Jordan's rolling MAE: median line-to-line MAE of that level type over the trailing 63 sessions (the W
  IS choice), $ (`gold-rolling-mae-window`, same touches and code); 5-tick floor.
- Arm margin and cancel scale with each line's own stop.
- **Break-even:** off in the primary (the selected cell); on (+1R, from the bar after the fill) descriptive.
- **Costs:** $0.10 entry slip, $0.10 on non-target exits, $0.12 commission. net R = (P&L − cost) / stop. Before-cost R
  reported alongside. Pessimistic: the stop beats the target in a bar.

## 4. Hypotheses and gates

Two pre-declared tests, BH q = 0.10 over {S1, S2} on one-sided bootstrap p. For each: **VALIDATED** if OOS 90% CI > 0,
IS > 0, OOS above the shuffled-lines placebo's 95th percentile (100 same-year permutations of the widths, whole
pipeline rerun including the rolling-MAE stop), total OOS R > 0, and BH passes. **NULL** if the OOS CI's upper end is
< +0.05R. Otherwise **UNDERPOWERED**.

Descriptive (no verdict): BE on; targets VWAP + 1σ_v, VWAP, the line inside; S2 with pooled stops and with the
σ-scaled 6-month window; by year; by line family and tier; exit mix; no-target share; long vs short; the equity curve;
two randomly drawn trades per year on the M1 chart.

**Decomposition (if NULL / UNDERPOWERED, per the null rule):** lines (18 vs the 4 OH/OL P75/P90), stop (S1 vs S2),
target (the 4 above), compared with the same arm on shuffled lines.

## 5. Power

A2 E filled ≈ 2,100 OOS trades on 18 lines; with SD ≈ 1R and day clustering the 90% half-width is ≈ 0.065R, so an edge
of ≈ 0.08R is detectable; `gold-line-target-stop`'s +0.11 would be.

## 6. Multiplicity

Two tests (S1, S2). Everything else is descriptive. The target, entry and stop rules are fixed from earlier studies; this
one adds no search over them.

## 7. What it does NOT test

NQ / EURUSD (next, same script, once gold is read). The C.OG probabilistic layer (reach / turn odds, the clock) on the
arming rule: a separate layer after this base is measured. Trailing stops. The lockbox.

## 8. What each verdict changes

- **VALIDATED:** NQ / EURUSD replication, then a forward paper record and the one-time lockbox run. No live change
  without the owner.
- **NULL / UNDERPOWERED:** decomposed as §4; the base stays the reference that the probabilistic-entry layer is
  measured against.

## Amendments

- **A1, 2026-11-27, POST-HOC (results seen), describes only.** The concentration checks in RESULTS (stop-size quintiles,
  top-1% trades, a $1 floor, double slippage, OOS halves) were run after the verdict; they change no verdict.
- **A2, 2026-11-27, PRE-RESULTS for NQ and EURUSD (nothing scored on either).** Replication of the frozen gold
  system, Jordan's three-way comparison. Same script and rules unchanged: 18 shadow lines (`calc-upgrades-wide` N7_ALL
  build, widths in `analysis/output/gold-rolling-mae-window/widths/F_<SYM>.parquet`), Jordan's gold entry, VWAP ± 0.5σ_v
  target, S2 stop = rolling MAE 3 months per line (the gold choice, not re-chosen), BE off. Costs 1 tick in, 1 tick out
  on non-target exits, 1 tick commission (tick from the data); 5-tick floor. IS 2021–22, OOS 2023 → 2026-08-21.
  - **Per instrument:** the same gates as S2 on gold (OOS CI > 0, IS > 0, above its own 100-run shuffled-lines p95,
    total > 0), BH q = 0.10 over {NQ, EURUSD}.
  - **The mirror:** the gold result is a property of the system, not of gold, only if both pass. One pass = that
    instrument only. Neither = gold-only, flagged as possibly specific to gold.
  - S1 and all other arms are descriptive. Each instrument's own best rolling-MAE window (from `gold-rolling-mae-window`
    W run on it, also unchanged) is reported alongside, not tested.

## RESULTS

`analysis/output/gold-line-system-base/RESULTS.md`: S2 (rolling-MAE stop) VALIDATED, OOS +0.106R [+0.032, +0.160], n 2,119,
+224R, placebo p95 +0.090, p 0.008; S1 (0.15 × P90) UNDERPOWERED, +0.040R [−0.004, +0.085]. Edge concentrated in small
stops and the top 1% of trades; needs tick data or a forward record.
