# gold-line-system-jordan: the gold line system on Jordan's lines only (HL projections and Close±, P75/P90)

**Pre-registered 2026-11-27, before the system has been simulated on this line set.**

| | |
|---|---|
| ID / ledger id | `gold-line-system-jordan` |
| Branch | `jvphone` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gold-line-system-jordan` |
| Source | Owner 2026-11-27: the system trades Jordan's lines, the HL projections, Close+ and Close−, not all 18. `plans/GOLD_LINE_SYSTEM_HANDOFF.md` D4 (P75/P90 only; P50 made the fade worse) and §6 (Jordan's own lines are HL projections and Close±). `gold-line-system-base` used all 18 lines by mistake (carried over from the rolling-MAE window test); this corrects the line set |
| Lines | **8 shadow lines** (N7_ALL walk-forward widths, `analysis/output/gold-rolling-mae-window/widths/F_GOLD.parquet`): HL projection up (running low + HL width, short), HL projection down (running high − HL width, long), Close+ (short), Close− (long), each at **P75 and P90** |
| Entry, target, stop, costs | **Unchanged from `gold-line-system-base` S2** (`forge/GOLD_LINE_SYSTEM_BASE_PREREG.md`): Jordan's gold entry (arm at 0.10 × stop through, fill on the retest, cancel 1.2 × stop, chase outward, one trade at a time, each line once a session, flat 22:00 London); target VWAP ± 0.5σ_v fixed at the fill bar; stop = rolling-MAE, median line-to-line MAE of that line over the trailing 63 sessions, 5-tick floor (the MAE history is measured exactly as before, with all 18 lines defining "the next line out"; only the traded set changes); BE off; $0.10 in, $0.10 out on non-target exits, $0.12 commission; pessimistic fills. Engine `scripts/gold-line-system-base/run.py` `sim`, with the other 10 lines switched off (stop = NaN, so never armed) |
| Data | GC futures M1 (NT8), IS 2021–2022, OOS 2023 → 2026-08-21. Lockbox untouched |
| Seed | `20261127` |
| Uncertainty | 63-session block bootstrap, B = 2000, 90% CI |
| Scripts / outputs | `scripts/gold-line-system-jordan/` → `analysis/output/gold-line-system-jordan/` |
| Live impact | None |

## 1. Claim

The gold line system traded on Jordan's 8 lines makes money after costs out of sample, above the same pipeline on
shuffled lines, and does not depend on its best 1% of trades.

## 2. Honesty about what has been seen

`gold-line-system-base` reported OOS splits by tier and family on the 18-line run (P50 −0.03, P75 +0.36, P90 +0.26;
HL down +0.43, Close− −0.17, HL up +0.07, Close+ +0.07). This line set was chosen from the plan (D4, §6), not from
those numbers, but the OOS period is not clean for it. **The confirmation is the lockbox (after 2026-08-21), used once
at the end.** Removing 10 lines also changes which trades happen (one trade at a time, chasing), so the result is not a
subset of the 18-line trades.

## 3. Gates (primary: 8 lines, S2, VWAP + 0.5σ_v, BE off)

- **VALIDATED** if all of: OOS 90% CI > 0; IS > 0; OOS above the shuffled-lines placebo's 95th percentile (100
  same-year shuffles of the widths, whole pipeline); OOS total R > 0; **OOS total R still > 0 after removing the best
  1% of OOS trades** (owner's rule, new here).
- **NULL** if the OOS CI's upper end < +0.05R. Otherwise **UNDERPOWERED**.
- One primary test, no multiplicity correction.

## 4. Descriptive (not judged)

The same 4 families with P50 added (12 lines); BE on; the S1 stop (0.15 × P90); by line, by year, by side; without the
best 1% / 5%; the isolated-vs-stacked split (another same-side line within 0.5 stop). The backtest page
`line-system-backtest.html` switches to this primary.

## Amendments

- **A1, 2026-11-28, POST-HOC (primary results seen): entry-rule switches for the page, descriptive only.** Owner: add
  Jordan's rules as a selectable option; with M1 bars a poke and a retouch inside the same candle can't be ordered,
  so treat that touch as if it didn't happen (Jordan tracks the retouch with tick data). The primary and its verdict
  are unchanged. Two switches, 4 combinations, all on the same 8 lines, target, stop, costs and gates:
  - **Same-candle retouch.** *Fill* (primary): a line pokes on a bar; the bar fills only if it closes back through the
    line. *Ignore*: a line counts as poked only if the poking bar closes beyond the line; a bar that pokes and closes
    back through is ignored for that line (not armed, not spent, so it can arm later). The fill can then only come on
    a later bar.
  - **Chase.** *Any line* (primary): an armed order moves out to any more extreme same-side line that pokes. *Same line
    (PDF)*: it moves out only to the same line's P90 (e.g. Close+ P75 → Close+ P90); a poke of another line while an
    order is armed is spent and ignored.
  - Each combination is reported with IS / OOS, the 90% CI, without the best 1%, and the same 100-shuffle fake-lines
    placebo (the same permutations for all 4). Verdict words are not given to the variants; the primary stays as
    banked. The backtest page gets an "Entry rules" selector with the 4 combinations.
