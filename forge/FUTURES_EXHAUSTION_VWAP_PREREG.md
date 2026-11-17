# futures-exhaustion-vwap — at a vol-line touch on CME futures, does fading toward a frozen session VWAP pay when price shows exhaustion?

**Pre-registered 2026-11-17, before any outcome of this rule was computed.**

| | |
|---|---|
| ID / ledger id | `futures-exhaustion-vwap` |
| Branch | `main` (temp worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `futures-exhaustion-vwap` |
| Data | CME futures NQ, 6E, GC: NT8 continuous unadjusted 1-minute bars with real exchange volume (`analysis/output/nt8/continuous/<ROOT>_1m_unadj.parquet`, end-stamped → moved back 1 min). Lines: production OH/OL, OC, HL p50/p75/p90 from the day-reconstruction archive, as `scripts/line-touch-mae-futures/build.py`. London 00:00–22:00. **Discovery 2016-03 → 2022-12-31; holdout 2023-01-01 → 2026-08-20.** Lockbox (≥ 2026-08-21) untouched. Days with < 90% of bars skipped (GC/6E NT8 holes) |
| Seed | `20261117` |
| Uncertainty | London-day block bootstrap (resample days), B = 2000 |
| Scripts / outputs | `scripts/futures-exhaustion-vwap/` → `analysis/output/futures-exhaustion-vwap/` |
| Harness | own script (re-uses the line and touch code of `line-touch-mae-futures`) |

## 1. The claim

Owner, 2026-11-17, after `line-touch-mae-futures` showed every touch splits 50/50: "if we look at the volatility
levels as an exhaustion mechanism, the TP could be VWAP". The line says where; signs of exhaustion at the touch say
whether. Fade the touch toward the session VWAP (fair value), with a fixed stop beyond the line, only when price
arrives looking spent.

## 2. Why it is not already settled

- `line-touch-mae-futures` (exploratory, today): unconditional touches 50/50; median-stop/median-target race 48–50%.
  No VWAP target, no exhaustion filter.
- `vwap-stretch-line-touch` (UNDERPOWERED, not supported, 2026-11-02): NQ **CFD**, tick volume, v3 lines, first touch
  of p75/p90 only, exit after 60 min, **no stop and no VWAP target**. Stretch was the only filter.
- `vwap-extension-fade` (NULL): VWAP stretch with no forecast line; fixed target lost on 6/6. The moving-target
  version was an artefact; here the target is frozen.
- volatilityExhaustion/ (median-line touch continues to p75 85.8%): different touch point, no VWAP target.
- New here: real futures volume; VWAP as a **fixed price target** at the forecast lines; a fixed stop; exhaustion
  features other than stretch (range used, approach speed, approach volume, repeat touch); all three markets, all
  line families.

## 3. Definitions, fixed in advance

- **Touches:** exactly `line-touch-mae-futures` (touch n with 0.1σ re-arm), forecast lines, every family and rung.
  **One trade per (day, minute, side):** where several lines are touched in the same minute on the same side, keep
  the outermost (the better level). Placebo touches: the same ladder ×0.85 and ×1.15, same rules.
- **Session VWAP:** typical price (h+l+c)/3 weighted by exchange volume from the first bar at 00:00 London; bars with
  0 volume weight 0 (a bar of all zero volume up to k−1 → no VWAP, touch skipped). VWAP and its volume-weighted SD
  `sd_vwap` are taken **through bar k−1** (no lookahead). Touches before minute 30 are excluded.
- **Trade (fade):** limit at the line price, filled at the touch bar k. Target = VWAP_{k−1}, **frozen**. Requires
  VWAP on the open side of the line (target in the fade direction) and at least 2 ticks away; otherwise no trade
  (counted). Stop = line ± 0.25σ (σ = the day's `sigma_used` in price), beyond the line. Walk bars from k: the stop
  can be hit on bar k (its extreme is after the touch, conservative), the target from bar k+1. A bar reaching both =
  stop. Neither by 22:00 → exit at the 21:59 close.
- **R** = P&L / stop distance, after cost. **Cost** = 2 ticks + $4 commission per round trip in ticks (NQ 2.8, 6E 2.64,
  GC 2.4 ticks; `FUTURES_COST_RESCORE` rule). Sensitivity: 2× cost.
- **Exhaustion features at the touch** (all from bars ≤ k−1):
  - F1 `stretch` = (line − VWAP_{k−1}) / sd_vwap_{k−1}, signed so + = stretched in the touch direction.
  - F2 `range_used` = (session high − low through k−1) / σ.
  - F3 `speed` = |close_{k−1} − close_{k−31}| / σ (30-min approach).
  - F4 `vol_ratio` = mean volume bars k−15..k−1 / mean volume bars k−75..k−16 (approach volume rising > 1, fading < 1).
  - F5 `repeat` = touch_n ≥ 2.
- **Conditions (13):** baseline (all touches); F1 hi; F2 hi; F3 hi; F3 lo; F4 hi; F4 lo; F5; pairs F1hi&F2hi,
  F1hi&F3hi, F1hi&F5, F2hi&F3hi, F2hi&F5. "hi"/"lo" = top/bottom tercile, cut points fit **on discovery only**, per
  instrument (pooled over rungs and families).
- **Cells:** instrument (3) × rung (p50, p75, p90) × condition (13) = 117.

## 4. Hypotheses, gate and mirror

- **H1 (gate):** a cell's discovery net mean R > 0 with BH q = 0.10 across all 117 cells (one-sided bootstrap p).
- **Replication:** that cell's holdout net mean R > 0, one-sided p < 0.05, same cut points.
- **Beats placebo:** in the holdout, the cell's net mean R minus the same condition on the pooled placebo ladders
  (×0.85, ×1.15) > 0 (point estimate) — the line must matter, not just the exhaustion filter.
- **Beats baseline:** holdout net mean R of the cell minus the same instrument × rung baseline > 0 (point estimate).
- **Mirror:** the continuation trade with the same stop distance and target distance mirrored (stop on the VWAP side
  at 0.25σ, target the same distance beyond the line) is reported for every cell; descriptive.
- **VALIDATED** = at least one cell passes all four. **NULL** = none passes and the baseline cells' 95% CIs exclude
  +0.10R. **UNDERPOWERED** otherwise. Each surviving cell is reported with its own numbers.

## 5. Power

Expected SD of R ≈ 1.2 (stop 0.25σ, target ~0.3–0.6σ). Discovery n per tercile cell ≈ 300–1,500 →
MDE (80%, two-sided 5%) = 2.8 × 1.2 / √n ≈ 0.09–0.19R. Pass bar for "could have found it": 0.10R. Cells with
discovery n < 300 are reported, scored, and can only be UNDERPOWERED. Real SDs reported in RESULTS.

## 6. Multiplicity

117 cells, BH q = 0.10 on discovery, then a single holdout check per survivor (no further correction: the holdout is
the replication). Pairs are limited to the five listed. No other features, thresholds, stops or targets are scored;
anything else is labelled exploratory.

## 7. What it does NOT test

Moving (live) VWAP targets; other stops; entries after the touch bar (confirmation); costs beyond 2×; order-flow delta;
the lockbox period; CFDs.

## 8. What each verdict changes

- VALIDATED → the surviving cell becomes a forward paper record on the futures page; no money before a forward test.
- NULL → "exhaustion at the lines with a VWAP target" closes on futures; the lines stay size rulers.
- UNDERPOWERED → report effects and ranges; wait for more data or pool markets in a new prereg.

## Amendments

(none)
