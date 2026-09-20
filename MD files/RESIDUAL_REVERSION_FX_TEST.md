# Residual mean-reversion — the FX branch of the MVE, actually run (2026-09-20)

*Pre-registered before running. This is the direct answer to "does mean-reversion
of residuals have edge on FX" — the question the desk has approached four times
without ever testing this specific object on real data. Verdicts get appended
below the line once §5 runs on Railway (`FRED_KEY` + `OANDA_KEY`; this sandbox has
`OANDA_KEY` but not `FRED_KEY`, so nothing below the line is fabricated).*

## 0. Why this, and why now

The prior four attempts (`js/deskEvidence.js`: `yields-to-fx-direction`,
`price-vs-spread-divergence`, `spread-leads-fx-hours`, and the MVE itself) tested
adjacent but different objects — a raw yield *move*, a raw spread *divergence*, or
(for the MVE) a residual that was only ever run on NQ. None of them is "actual
price minus an OLS-fitted macro fair value, benchmarked against a naive trailing
mean." That object already exists, fully built and unit-tested
(`js/mve/validateInstrument.js`, 122/122 synthetic assertions), with the exact
discipline a residual test needs to avoid fooling itself:

- **Benchmark-relative, not raw.** `icEdge = icPredictive − icBenchmark` — a
  trailing-mean anchor "reverts" on a pure random walk too, so only the FACTOR
  fair value's edge OVER that spurious baseline counts. Verified null on synthetic
  random walks before ever touching real data.
- **Horizon-matched, non-overlapping trades.** The z-fade holds for the horizon
  where the IC lives, entries spaced so trade returns aren't autocorrelated.
- **Deflated Sharpe across every (hold × threshold) config tried** — the
  multiple-testing correction, not a cherry-picked cell.
- **Cross-instrument pooling that requires corroboration**, not just sign
  (`poolConsistency`: an instrument only counts as evidence if its icEdge AND its
  hit rate both clear the bar — "3 of 5 positive" alone is stated explicitly as a
  coin-flip outcome).

It has simply never been run on FX. `MVE_RUN_GUIDE.md` §8's status table has one
row still blank: *"OOS proof on real feeds — regression branch: run, NQ/XAUUSD/
AUDUSD NULL, EURUSD weak-positive."* That "weak-positive" was never followed up
because the desk moved to other work — this test is that follow-up, done properly
(see §1 for what changed since).

## 1. Fixed before this ran (not after)

**Publication lag.** `js/mve/liveAdapter.js`'s `buildContext` forward-filled every
FRED series onto the OANDA date index with no lag — a monthly foreign-rate
observation dated the 1st was treated as known that same day. This is the
identical lookahead the validated 2Y yield-spread sleeve had to fix before its
number could be trusted (Sharpe fell 2.16→1.58 once added, and still held —
`YIELD_SPREAD_STRATEGY.md` §4). Fixed 2026-09-20: `PUB_LAG_DAYS` (US daily legs
+2d, the monthly OECD foreign family +45d — the validated sleeve's own numbers,
reused not re-derived), default ON. No historical MVE-FX number anywhere predates
this fix, so nothing needs to be re-litigated — this is the first honest run.

**`bestTrPnls` + `dates` exposed.** Two small, additive, backward-compatible
fields (`scoreMispricing`'s `includeTrades` option; `buildContext`'s `dates`
array) — needed for §3's cost overlay and §2's regime split respectively. Neither
changes any existing scored number (proven in `js/mve/mve.test.mjs`: the same
report with `includeTrades:true` scores identically to the default).

## 2. The regime split — applying the desk's own unclosed gap to this test first

Auditing the two reproducible prior nulls (`analysis/market_sense_studies.mjs`
§S11, `analysis/lead_lag_studies.mjs` §L1) found no code bug — both are honestly
built, no lookahead, proper minimum-n gates, a real placebo. But neither
disaggregated by regime before declaring null, and CLAUDE.md is explicit:
*"Pooled nulls hide subset edges — disaggregate before declaring null."* The
candidate regime here is not arbitrary: 2022–24 was the fastest, most sustained
rate-divergence cycle in the sample (the Fed hiking into the ECB/BoJ/RBA holding),
so if a rate-differential residual ever catches FX, that is the window where the
fundamentals say it should.

**Design, fixed now:** re-run the exact same `scoreMispricing` machinery
(`validateInstrument` uses internally) on two slices of the SAME walk-forward OOS
series — one restricted to `2022-01-01`–`2024-12-31`, one on everything else — for
each pair, at the slow horizons (20/60-bar) only (the guide's own instruction:
"expect NULL or WEAK at daily horizons; look at the 20/60-bar rows"). Both slices
use the identical fair-value fit (no refitting on the slice — the split is on the
OOS *scoring* sample, not on training data, so it can't leak).

**Reading rule, fixed in advance:**
- Full sample NULL, both slices NULL → a clean, non-hidden null. Report it as such.
- Full sample NULL, 2022–24 slice clears SURVIVES (icEdge > 0.03, deflated Sharpe
  ≥ 0.95) while the rest doesn't → **exactly the pooled-null-hides-a-subset-edge
  case** — report as regime-conditional, not as a blanket edge, and never as "wire
  it in" without a live test through an actual divergence cycle (there's only one
  in the sample; n=1 regime is a hypothesis, not proof).
- Both slices clear SURVIVES independently → broader evidence than a regime
  artifact; still needs the cross-instrument pooling (§4) before it means anything.
- Neither slice beats the full sample meaningfully → the regime split added
  nothing; say so plainly rather than fishing further splits (this is the ONE
  disaggregation this test pre-registers, not license to slice until something
  clears).

## 3. Cost — an honest overlay, not a live gate

CLAUDE.md's own house rule from `execution-gate`: spread/ATR ≥ 0.15 kills a cell
before its Sharpe is trusted. This harness has no live spread data, so a genuine
spread/ATR gate cannot be built here — per CLAUDE.md's "data limits beat fake
productivity," that is stated as a limitation, not faked. What IS applied: the
best z-fade config's per-trade returns (`includeTrades: true`), haircut by the
validated sleeve's own round-trip cost assumption (0.02%, ~2 pips on majors) —
labeled explicitly as an assumption borrowed from a different, already-validated
strategy's cost environment, not a measurement of this one's. Reported as
"pre-cost Sharpe" and "cost-overlay Sharpe" side by side; a result that only
survives pre-cost is not reported as edge.

## 4. Cross-instrument pooling

`poolConsistency` across EURUSD, GBPUSD, USDJPY, AUDUSD's slow-horizon (20/60-bar)
results — already built, already requires an instrument to clear BOTH a positive
icEdge AND an above-50% hit rate to count as real evidence, and states the
chance-baseline explicitly (positive-sign-only is a coin flip). No new pass bar
invented here; the existing one is used as designed.

## 5. What's NOT changing

Same isolation posture as every MVE addition to date: no import from `server.js`,
no API route, no dashboard link, no `deskEvidence.js` entry until there's an
actual verdict. This is a validation run, not a deploy — even a SURVIVES verdict
does not wire anything in (`MVE_RUN_GUIDE.md` §7's "deliberate, still off" applies
unchanged).

## 6. Code

- `js/mve/liveAdapter.js` — publication lag (§1), `dates` field (§1). Unchanged
  otherwise; the FX/gold/NQ factor specs are not touched.
- `js/mve/validateInstrument.js` — `includeTrades` opt (§1). The scoring math
  itself (`oosMispricingSeries`, `scoreMispricing`, `poolConsistency`) is
  unchanged — reused exactly as built.
- `js/mve/mve.test.mjs` — extended, 122/122 pass (was 110 before tonight).
- `analysis/residual_reversion_fx.mjs` — the runner. `node
  analysis/residual_reversion_fx.mjs` (needs `FRED_KEY`; `OANDA_KEY` already
  present in this sandbox, so only the FRED leg is missing here). Writes
  `analysis/output/residual_reversion_fx.json`.

## 7. Results

*(not yet run — needs `FRED_KEY` on Railway; append here in the same format as
`MD files/LEAD_LAG_TESTS.md`'s results section. A `deskEvidence.js` ledger entry
gets added only once there's an actual verdict — `validated` / `null` / `context`,
never "built but unrun.")*
