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

## 7. Results (run 2026-09-20 on Railway; design frozen above before running)

`mve.html`'s "🧪 Validate ALL" (`/api/mve-validate-all`), pub-lag honest (default ON,
§1's fix). Covers all six MVE-supported instruments, not just the four FX pairs this
doc scoped — EURUSD/GBPUSD/USDJPY/AUDUSD plus XAUUSD and NQ came along for free from
the pooled endpoint.

| Instrument | Slow icEdge | Horizon | Hit rate | Deflated Sharpe | Verdict |
|---|---|---|---|---|---|
| XAUUSD | 0.0034 | 20b | 0.471 | 0.006 | NULL |
| EURUSD | 0.0475 | 60b | 0.510 | 0.549 | WEAK/INCONCLUSIVE |
| GBPUSD | 0.0263 | 20b | 0.538 | 0.796 | WEAK/INCONCLUSIVE |
| USDJPY | 0.0335 | 20b | 0.475 | 0.000 | WEAK/INCONCLUSIVE |
| AUDUSD | -0.0463 | 60b | 0.514 | 0.062 | NULL |
| NQ | -0.2459 | 20b | 0.401 | 0.296 | NULL |

**Pooled (§4): NULL/INCONSISTENT.** Only 1/6 (EURUSD) clears both a positive icEdge
and an above-coin-flip hit rate; 2/6 (EURUSD, USDJPY) are positive on sign alone,
which `poolConsistency` itself calls a coin-flip outcome at this magnitude (mean
icEdge −0.030, mean hit rate 0.485). No cross-sectional corroboration.

**Reading, instrument by instrument:**
- **NQ (−0.246)** replicates July's "null and worse than inert" finding on this exact
  instrument almost exactly (`MVE_RUN_GUIDE.md`'s prior real-data run) — the naive
  trailing-mean anchor beats the factor fair value here, not just fails to lose to it.
  Confirms the earlier result wasn't a fetch/pipeline artifact.
- **XAUUSD, AUDUSD**: flat to slightly negative, unremarkable nulls.
- **USDJPY** is the one internally inconsistent case: icEdge positive (0.0335, clears
  the 0.03 magnitude bar) but hit rate *below* 50% (0.475) — the average correlation
  is the right sign while the specific actionable bets lose more often than they win.
  Not corroborating evidence; if anything a caution that the correlation isn't a
  stable, tradeable relationship for this pair.
- **EURUSD** is the only pair with both a real (>0.03) icEdge and an above-50% hit
  rate — but deflated Sharpe (0.549) sits well short of the 0.95 SURVIVES bar, matching
  its own `WEAK/INCONCLUSIVE` verdict. Being the sole survivor of six is itself close
  to what `poolConsistency`'s stated chance baseline predicts, not strong corroboration.
- **GBPUSD**'s deflated Sharpe (0.796) is the closest thing to tradeable in this table,
  but its slow-horizon icEdge (0.0263) sits under the 0.03 pooling threshold, so it
  doesn't corroborate cross-sectionally either — a single promising number surrounded
  by a null pool is exactly the shape `poolConsistency` exists to catch.

**§2's regime split — run 2026-09-21 via `/api/mve-validate-full/:sym`
(`🔬 Run OOS validation`, EURUSD).** Same OOS scoring series as the pooled result
above, sliced by date only (no refit):

| Slice | n | Best icEdge | Horizon | Best z-fade config | Deflated Sharpe | Verdict |
|---|---|---|---|---|---|---|
| Pooled (full sample) | — | 0.0475 | 60b | 10-bar hold, z≥1.5, 263 trades | 0.549 | WEAK/INCONCLUSIVE |
| 2022–24 rate-divergence supercycle | 778 | 0.1236 | 20b | 20-bar hold, z≥2 | 0.366 | WEAK/INCONCLUSIVE |
| Rest of sample | 4041 | 0.0332 | 20b | 20-bar hold, z≥2 | 0.178 | WEAK/INCONCLUSIVE |

Full IC-by-horizon table for the pooled run, for reference (icEdge = model
icPredictive − trailing-mean-benchmark icPredictive, the real signal net of the
spurious reversion any anchor shows):

| Horizon | IC (raw) | IC benchmark | IC edge | Hit rate |
|---|---|---|---|---|
| 1 bar | 0.0080 | 0.0005 | 0.0075 | 0.503 |
| 5 bars | 0.0211 | 0.0202 | 0.0009 | 0.514 |
| 10 bars | 0.0170 | −0.0111 | 0.0281 | 0.510 |
| 20 bars | −0.0055 | −0.0396 | 0.0341 | 0.487 |
| 60 bars | 0.0050 | −0.0425 | 0.0475 | 0.510 |

Cost overlay (assumption, not measured on EURUSD — borrowed from the validated
yield-spread sleeve's own 0.02% round-trip): the pooled best config's 263 trades,
mean per-trade 0.00131 pre-cost → 0.00111 post-cost. Doesn't change the verdict either
way — the gate that's failing is the deflated-Sharpe bar, not costs.

**Reading — the regime split did not change the reading, but it isn't a flat "no
effect" either; it's two things moving in opposite directions.** §2's fundamental
hypothesis (2022–24's rate-divergence supercycle is where a rate-differential
residual should show up, if anywhere) is directionally confirmed on the raw signal:
icEdge is ~3.7x larger in that window (0.1236 vs 0.0332 rest) — the correlation
really is stronger there. But the tradeable z-fade's deflated Sharpe goes the other
way (0.366 in-regime vs 0.178 rest vs 0.549 pooled) — smaller, higher-icEdge samples
lose more to the deflation penalty (fewer independent trades, n=778 vs the full
pool) than they gain from the stronger raw correlation. Net effect: every slice —
pooled, in-regime, and out-of-regime — sits well under the 0.95 SURVIVES bar. The
regime split doesn't rescue the pooled result; if anything it shows the edge is real
in direction (consistent with the fundamental story) but too weak and too thin a
sample, even in its best window, to clear the bar. This is exactly the "disaggregate
before declaring null" check CLAUDE.md asks for, and it comes back the same
verdict — not because the check was skipped, but because it was run and the answer
held.

**Verdict: NULL.** Residual mean-reversion does not show tradeable,
cross-sectionally-corroborated edge on FX, on top of the identical NQ null already on
record, and EURUSD specifically — the one pair with a real pooled icEdge — does not
clear the bar in its own best-case regime window either. Nothing here contradicts the
economic intuition (rate divergence does correlate with a bigger residual-fair-value
edge); it just isn't strong or persistent enough, after deflation for the sample size
and the number of configs tried, to trade. Book closed on this framing pending a
structurally different signal, not a re-run of this one.
