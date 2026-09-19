# Motif swing-regime lookahead — pre-registration (written BEFORE the fix)

Written 2026-09-19, before any code change, so the re-run can be judged
against a prediction rather than rationalised after the fact.

## The bug

`pylego/swing_structure.py` stamps each regime change-point at the pivot's
OWN bar (`RegimePoint(idx=ev.idx)`), and `regime_at(series, i)` returns the
last change-point with `idx <= i`. A pivot with `pivot_n = 5` is only
knowable once bar `i + 5` has closed. So the backtest — which runs
`compute_features` over the full history — labels a confirm bar's
`swing_regime` using pivots that printed in the 1–4 bars before it, which the
live tracker (data ends at the confirm bar) cannot see. The comment in
`AnalogML/motif_features.py:127-129` claiming `regime_at` "respects this by
construction" is wrong. `forge/events.py:_trend_series` knew, and shifts.

`swing_regime` is the input to best-config's "skip with-trend" filter, so this
is a live-vs-backtest population mismatch AND a contaminated validation.

Measured read-only 2026-09-19 (8 pairs, last 100 days, server M1-tail route):
29% of H1 bars carry an unknowable regime; at 224 actual confirm bars **21%
relabel**; the dominant flip is live=`range` → backtest=`with` (30 = 13%) —
the pullback pivot that forms the breakout. Live would take ~13% MORE trades
than the backtest, specifically those the backtest skipped with hindsight.

## Baseline — current export (`AnalogML/data/motif_alert_backtest.json`, generated 2026-09-16T14:18Z)

30,062 confirmations, 2016-01-06 → 2026-08-19. `r` under the modelled cost.
Regime at confirm bar (all): with 12,547 (41.7%) · range 13,901 (46.2%) · against 3,614 (12.0%).

| population | n | PF | win | avg R | sum R |
|---|---|---|---|---|---|
| ALL confirmations | 30,062 | 1.149 | 45.1% | +0.085 | 2,551 |
| spread ≤ 2.0p, no regime filter | 22,883 | 1.172 | 45.7% | +0.097 | 2,219 |
| **BEST CONFIG** (spread ≤ 2.0p & skip `with`) | **13,480** | **1.321** | **48.6%** | **+0.171** | **2,307** |
| spread ≤ 2.0p & swing = `with` | 9,403 | 0.985 | 41.4% | −0.009 | −88 |
| spread ≤ 2.0p & swing = `against` | 2,762 | 1.515 | 52.1% | +0.256 | 708 |
| spread ≤ 2.0p & swing = `range` | 10,718 | 1.275 | 47.7% | +0.149 | 1,598 |

The filter's incremental lift over spread-only: PF 1.321 vs 1.172 (**+0.149**).

## Prediction (committed before the fix)

Mechanism: the hindsight `with` label partly encodes the breakout's own
approach path. Removing it (a) moves ~10–13% of confirmations out of `with`
into `range`/`against`, and (b) those moved trades are worse than the average
non-`with` trade (that pivot WAS informative — the filter was catching it).

1. Regime mix at confirm bars: `with` 41.7% → **~30–33%**; `range` up to ~53–56%; `against` roughly flat (±2pp).
2. **Best-config n: 13,480 → ~15,000–15,800** (+11–17%).
3. **Best-config PF: 1.321 → 1.22–1.27**; avg R 0.171 → 0.12–0.15; win 48.6% → 46.5–47.5%. Sum R roughly flat (2,200–2,450): more trades × lower average.
4. `with` bucket PF: 0.985 → **1.05–1.12** (what's left is genuine pre-existing trend, less contaminated); `range` PF 1.275 → ~1.20–1.23.
5. The filter's lift over spread-only shrinks from +0.149 to **+0.05–0.09 PF** — it survives, weaker.
6. The **detection itself does not change**: confirmation count stays 30,062 ± a handful (the detector is causal; only the regime label moves). If the count moves materially, something else changed and the run is not comparable.

**Falsification:** if best-config PF ≤ 1.172 (no lift over spread-only) after
the fix, the "skip with" filter has no real edge and should be removed from
`pylego/motif_policy.BEST_CONFIG`. If best-config PF stays ≥ 1.30, the
lookahead wasn't doing the work I think it was and I should look for what is.

Either way: after the fix the tracker's live label for a confirm bar equals
the backtest's label for the same bar by construction — the population
mismatch is closed regardless of how the numbers land.

## What "the fix" is

- `pylego/swing_structure.py`: `RegimePoint` gains `known_idx = pivot idx +
  pivot_n` (the bar whose CLOSE first makes the pivot knowable); new
  `regime_known_at(series, idx)` looks up by `known_idx`. `regime_at` is kept
  as-is (its docstring now warns), because `forge/events.py` shifts on top of
  it and must not be double-shifted.
- `AnalogML/motif_features.py`: both H1 (`swing_dir`) and D1 (`d1_dir`) reads
  switch to `regime_known_at`. Lag = `pivot_n` because the motif decision is
  made at the confirm bar's close, where bars ≤ k are legitimately known
  (`forge` uses `pivot_n + 1` because it reads at the open — both correct
  for their own read point).
- Backtest and live tracker both call `compute_features` — one function,
  two callers, they move together.
- Re-run `AnalogML/motif_alert_backtest.py` on the same data lineage; commit
  the new export; fill in the "Result" section below.

## Result — filled in 2026-09-19 after the re-run

Data caveat first: Railway's parquet covers 2021-09 → 2026-09 (5 years),
not the 2016–2026 of the baseline export above, so the honest A/B was **old
code vs new code on the SAME Railway data** (deployed pre-fix code vs a
scratch tree with only the two patched files). Same 14,310 trades, identical
`r` on every trade — only the regime label moved. 20.6% of confirm bars
relabelled (with→range 1,491, range→against 773, range→with 335, ...).

| | OLD (hindsight) | NEW (knowable) | predicted |
|---|---|---|---|
| `with` share at confirm | 42.0% | 33.4% | 30–33% ✓ |
| `against` share | 11.6% | 15.6% | flat ✗ |
| best-config n | 6,357 | 7,280 (+14.5%) | +11–17% ✓ |
| best-config PF | 1.315 | **1.198** | 1.22–1.27 ✗ worse |
| best-config avg R | +0.169 | +0.111 | 0.12–0.15 ✗ slightly worse |
| best-config win | 48.5% | 46.2% | 46.5–47.5% ≈ |
| best-config sum R | 1,076 | 807 (−25%) | flat ✗ worse |
| `with` PF | 0.954 | 1.067 | 1.05–1.12 ✓ |
| `range` PF | 1.279 | 1.214 | 1.20–1.23 ✓ |
| `against` PF | 1.472 | **1.144** | not predicted — collapsed |
| lift over spread-only | +0.162 | **+0.045** | +0.05–0.09 (just under) |
| confirmations | 14,310 | 14,310 | unchanged ✓ |

The 1,176 trades the hindsight label had been "skipping" (spread ≤ 2p,
old=`with`, new≠`with`): **PF 0.656, 32.0% win, −0.243R avg** — and the live
tracker, whose data ends at the confirm bar, was already taking them. The
old backtest's 1.32 was never the live expectation; ~1.20 was. `against`
was contaminated as badly as `with`: a counter-trend confirmation's own
approach path was flipping the label.

**Falsification test:** 1.198 > 1.153, so "skip with" survives — barely
(+0.045 PF). But the UNFILTERED spread-≤2p book has MORE total R (948 vs
807): the filter now buys a small quality gain at a 15% cost in total R.
Per this pre-registration BEST_CONFIG is kept; whether that trade-off is
worth it is an owner decision, recorded here, not made here.

Shipped: `pylego/swing_structure.py` (`known_idx`, `regime_known_at`),
`AnalogML/motif_features.py` (H1 + D1 reads), 4 new tests incl. the
truncated-vs-full-history agreement property, and
`AnalogML/data/motif_alert_backtest.json` replaced by the causal Railway
re-run (2021–2026). The 2016–2026 hindsight export lives in git history.
