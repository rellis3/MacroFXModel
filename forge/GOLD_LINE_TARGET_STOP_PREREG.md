# gold-line-target-stop: with the arm-then-retest entry on the shadow lines, which target and stop make money on gold, and does the same rule carry to the other futures?

**Pre-registered 2026-11-27, before any trade with these targets or stops has been simulated.**

| | |
|---|---|
| ID / ledger id | `gold-line-target-stop` (gold, primary) and `gold-line-target-stop-wide` (17 other futures, replication) |
| Branch | `jvphone` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gold-line-target-stop` |
| Source | `plans/GOLD_LINE_SYSTEM_HANDOFF.md` §6 (the next study). Owner 2026-11-27: "run it on gold, then see what happens across the others" |
| Entry (fixed, D2) | the `gold-band-fade-stop` mechanism, unchanged: `sim_day` in `scripts/gold-band-fade-stop/run.py` (arm margin 0.10 × stop, fill on the retest, in the arming bar only if the bar closes back through, cancel at 1.2 × stop, chase P75 → P90, one trade at a time, each line once a day, flat at 22:00 London) |
| Lines (fixed, D1/D4) | shadow calc N7_ALL, forecast HIGH = open × (1 + OH width), LOW = open × (1 − OL width), P75 and P90. Widths walk-forward (`hits_and_gap`, `scripts/gold-calc-upgrades/score.py`). Other instruments: the same N7_ALL build as `calc-upgrades-wide` (IV regressor only where an IV index exists, else dropped) |
| Data | NT8 futures 1-minute, unadjusted, with exchange volume (`ladder.load_m1(sym,"F","unadj")`). GOLD = GC, primary. Replication: the other 17 contracts of `js/ladderV2QlikeParams.json`. OANDA XAU_USD = gold CFD check (non-VWAP targets only; no volume). Session 00:00–22:00 London, weekends out. Test 2020 → 2026-08-21; lockbox untouched |
| Seed | `20261127` (the handoff's study date; the same seed as the parent, stated here so it is fixed) |
| Uncertainty | 63-session block bootstrap of per-session net R, B = 2000, 90% CI; BH q = 0.10 |
| Scripts / outputs | `scripts/gold-line-target-stop/` → `analysis/output/gold-line-target-stop/` |
| Live impact | **None.** Research only |

## 1. Claim

The parent study's best arm (A2: $7.50 stop, open target, shadow lines) was +0.055R [−0.029, +0.112], UNDERPOWERED,
with the target reached on only 9.5% of trades and a fixed-dollar stop that broke as gold's price trebled. A nearer
target and a stop scaled to the day's forecast fix both faults and give a positive net edge on gold. If it is a real
property of the lines and the entry, the same frozen rule makes money on the other futures.

## 2. Why this isn't already settled

`gold-band-fade-stop` tested only the open as target, and only $7.50 or 0.375 × P90 as stop. `jordan-vwap-band-tp`
tested VWAP-band targets but with a first-touch fade entry (F7), not arm-then-retest. The combination is new.

## 3. Definitions

**Stop** s = f × (distance from the open to that side's P90 line, in price), f ∈ {**0.15, 0.25, 0.35**}. (On gold the
parent's $7.50 was ≈ 0.2–0.3 × P90 in 2020–24 and ≈ 0.07 × in 2026; A4 used 0.375 and was NULL.) The arm margin and
the cancel scale with s, as in the parent, so the entry set differs between stop sizes but is identical across targets.

**Targets**, all fixed at the fill bar (short side shown; long mirrored):

| ID | Target |
|---|---|
| T1 | VWAP + 1σ_v |
| T2 | VWAP + 0.5σ_v |
| T3 | VWAP |
| T4 | the same-side P50 line (forecast HIGH P50) |
| T5 | the session open (parent A2, reference) |
| T6 | none (stop or 22:00 only) |

VWAP and σ_v are the owner's indicator exactly as `forge/JORDAN_VWAP_BAND_TP_PREREG.md` §3 / `scripts/jordan-vwap-band-tp/run.py`:
hlc3 × volume from 00:00 London; at bar t the VWAP of the bars before t; σ_v = median of the previous 20 sessions' RMS
(hlc3 − VWAP); sessions with fewer than 20 prior sessions are skipped (all arms, so the sample is common).
If a target is not on the profit side of the entry (short: target ≥ entry), the trade has no target (stop / BE / 22:00
only). Its share is reported.

**Break-even (BE)**: on / off. On = once the bar's favourable extreme reaches entry ± 1R, the stop moves to the entry
from the next bar (pessimistic: the stop is checked before the move in the same bar).

**Grid:** 3 stops × 6 targets × 2 BE = **36 cells**, per instrument.

**Fills:** pessimistic primary (as the parent): inside a bar the stop beats the target; gaps fill at the bar open.
Optimistic bound descriptive.

**Costs (always on):**
- GC: 1 tick ($0.10) entry slip, 1 tick on stop / BE / time exits (not on a target limit), $0.12 commission.
- Other futures: 1 tick entry slip, 1 tick on stop / BE / time exits, **1 tick** of commission (conservative; tick
  from the data, `tick_of`).
- Gold CFD: $0.40 round trip.
- net R = (P&L − cost) / s.

## 4. Hypotheses and gates

**Part G (gold, primary).** Per cell, mean net R per trade, GC, pessimistic.
- **VALIDATED** if: (1) 90% CI > 0; (2) BH q = 0.10 over the 36 cells (one-sided bootstrap p); (3) both halves
  2020–22 and 2023–26 > 0; (4) above the shuffled-lines placebo's 95th percentile (PL1: each day gets another same-year
  test day's widths, 200 permutations); (5) the gold CFD point estimate > 0 (T4, T5, T6 only; VWAP targets have no CFD
  check and need 1–4).
- **NULL** if the CI's upper end < +0.05R. Otherwise **UNDERPOWERED**.

**Part W (replication, 17 other futures).** The **gold-selected cell** = the cell with the highest gold point mean
(chosen mechanically, whatever its verdict) is run unchanged on each of the 17 contracts.
- Pooled metric: Σ net R / Σ trades over all 17, 63-session block bootstrap on the union date index.
- **VALIDATED** if pooled 90% CI > 0, both halves > 0, pooled mean above the pooled PL1 placebo's 95th percentile (100
  permutations per instrument), and ≥ 60% of instruments with a positive point mean.
- **NULL** if the pooled CI's upper end < +0.05R. Otherwise **UNDERPOWERED**.
- **THE MIRROR:** the gold result is a line property only if the same cell is positive pooled across the others.

**Positive control (must pass before any scoring):** the A2 reference (f replaced by the fixed $7.50 stop, T5, BE
off) reproduces the parent's GC A2 mean (+0.055R) to 3 decimals on the common sample of the parent.

**Descriptive (no verdict):** all 36 cells on every instrument and pooled; per class (index, metal, energy, FX); exit
mix (target / stop / BE / time); target-on-wrong-side share; by year; optimistic bound.

## 5. Power

Parent A2 had ≈ 1,000 gold trades with a 90% CI half-width ≈ ±0.07R. The stop sizes here shrink R, so trades and SD
are similar: an edge of ≈ 0.10R per cell is detectable on gold; smaller is UNDERPOWERED. Pooled over 17 futures
(≈ 15,000 trades, cross-instrument correlation absorbed by the date-block bootstrap) the detectable pooled edge is
≈ 0.03R.

## 6. Multiplicity

36 cells on gold, BH q = 0.10 over all of them. Part W is one pre-declared test (the gold-selected cell). The other 35
cells on the 17 contracts are descriptive only. Fixed here: f grid, targets, BE trigger at 1R, 20-session σ_v,
1-tick costs.

## 7. What it does NOT test

HL projection and Close± lines (Jordan's own lines): out, to keep the grid small; a follow-up arm if the OH/OL entry
earns its place. Trailing stops (excluded, handoff §7). CFDs other than gold. Sizing. The lockbox.

## 8. What each verdict changes

- **Gold VALIDATED + W VALIDATED:** the rule goes to a forward paper record on post-lockbox data, then the one-time
  holdout run (handoff D6). No live change without the owner.
- **Gold VALIDATED, W not:** a gold-only property; forward record on gold only, flagged as possibly a search artefact.
- **Gold NULL / UNDERPOWERED:** decomposed by part (stop size, target, BE) per the null rule; the target/stop stays
  open as graded evidence.

## Amendments
