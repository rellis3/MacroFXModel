# gold-line-vwap-stretch-filter: does "only fade when price is 2σ+ from VWAP" improve the gold line system?

**Pre-registered 2026-11-28, before the filter has been simulated.**

| | |
|---|---|
| ID / ledger id | `gold-line-vwap-stretch-filter` |
| Branch | `jvphone` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gold-line-vwap-stretch-filter` |
| Source | Owner 2026-11-28: when the VWAP target is used, does the fade fail if price hasn't stretched far from VWAP? `gold-line-continuation-explore` part A (exploratory, the system's own trades): fades filled less than 2σ_v from VWAP lost in IS and OOS under both entry rules (fill rule: IS −0.80 n 37, OOS −0.08 n 119). **Found on the same 2021–26 data this test runs on** |
| Base (unchanged, never overwritten) | `gold-line-system-jordan` primary: Jordan's 8 shadow lines (HL up/down, Close+, Close−, P75/P90), Jordan's gold entry, VWAP ± 0.5σ_v target fixed at the fill, rolling-MAE stop (3 months per line), BE off, costs on, pessimistic. Engine `scripts/gold-line-system-jordan/entry_rules.py` `sim2` |
| Layer | **VWAP stretch filter:** at the moment an armed order would fill, z = (fill price − VWAP) / σ_v in the fade's direction (+ for a short above VWAP, + for a long below), using the VWAP of the bars before the fill bar (as the target) and σ_v as the target's band. **If z < 2.0 the fill is skipped:** the order is cancelled and that line is spent for the session; the system carries on (other lines can still arm). No other change. A switch, on / off |
| Data | GC futures M1 (NT8), IS 2021–2022, OOS 2023 → 2026-08-21. Lockbox untouched |
| Seed | `20261128` |
| Uncertainty | 63-session block bootstrap, B = 2000, 90% CI; the difference layer − base by day blocks |
| Scripts / outputs | `scripts/gold-line-vwap-stretch-filter/` → `analysis/output/gold-line-vwap-stretch-filter/` |
| Live impact | None |

## 1. Claim

Skipping fades filled less than 2σ_v from VWAP raises net R a trade, in both periods, by more than skipping the same
share of fills at random.

## 2. Gates (primary: the fill entry rule, the tested system)

Because the filter was found on this data, **the strongest verdict available here is UNDERPOWERED**; the
confirmation is the lockbox (after 2026-08-21), used once at the end with the final rule set, or a forward record.
On 2021–26 the layer is a **pass** if all of:
1. base + layer mean R > base mean R in IS **and** in OOS;
2. OOS total R with the layer ≥ 90% of the base's OOS total R (it shouldn't buy a better average by throwing profit away);
3. the OOS improvement in mean R is above the 95th percentile of a **random-skip placebo**: 200 runs that skip
   each fill with probability equal to the layer's OOS skip share, the whole system re-simulated (so freed-up
   trades are counted).

Pass → UNDERPOWERED (lead to confirm on the lockbox / forward). Any gate failing → NULL for the layer.

## 3. Descriptive

The same on the "same-candle retouch ignored" entry rule; thresholds 1.5σ and 2.5σ (not judged); the skip count;
by year; without the best 1%; the backtest page gets a "VWAP filter" switch over every entry-rule setting.

## Amendments

(none)
