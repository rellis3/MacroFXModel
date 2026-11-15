# growth-inflation-quadrant — does the growth × inflation quadrant, built point-in-time, tilt 1-8 week direction?

**Pre-registered 2026-11-15, before any outcome was scored against the real quadrant.** The only numbers below come
from (a) the label build (signal only, no outcome), (b) the control-only power run
(`scripts/growth-inflation-quadrant/run.py --power`: the real quadrant series circularly shifted against the real
outcomes, so the real alignment is never scored) and (c) the synthetic `--selftest` (no market data).

| | |
|---|---|
| ID / ledger id | `growth-inflation-quadrant` (21 scored cells, one prereg; banked as one entry with per-cell lines unless cells split VALIDATED/other, §8) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `growth-inflation-quadrant` (maintained by the session owner) |
| Question source | `plans/DAILY_BIAS_REVIEW.md` §5 test 3; `plans/BIAS_RESEARCH_SYNTHESIS.md` (merged order 6) |
| Data | Macro: ALFRED vintages (FRED API, read-only, free) of PAYEMS, INDPRO, CFNAI, ICSA, CPILFESL, PCEPILFE (observations 1990→, every real-time period since 2000; CFNAI vintages start 2011-05-23, ICSA 2009-05-28) and T5YIE (daily market series, not revised). Cached in `analysis/output/growth-inflation-quadrant/_cache/` (not committed). Prices: feature store OANDA daily closes `features/px_d1_*.parquet` (EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCAD, USDCHF, XAUUSD, NAS100, SPX500), sampled at Friday closes. **No price after 2026-08-21** (lockbox; the loader truncates and asserts, every forward window ends ≤ 2026-08-21). Never R2 (`R2_*` unset in the script). |
| Seed | `20261115` |
| Uncertainty | Cluster bootstrap, cluster = calendar half-year (≈ 35 clusters; covers the 8-week overlap and most quadrant spells), B = 2000; p from the bootstrap SE (normal approximation) |
| Scripts / outputs | `scripts/growth-inflation-quadrant/run.py` → `analysis/output/growth-inflation-quadrant/` (+ evidence packs via `scripts/evidence_pack/pack.py`) |
| Harness | Own script: needs vintage snapshots per decision date, which `analysis/study.mjs` / `runStudy.mjs` do not express |

## 1. The claim (required)

C.OG's Quantitative & Macro Insights lesson 6 (cross-asset synthesis) and the macro deep-dives course notes
(`education/QUANT_MACRO_LESSONS_1-6.md` §6.2, `education/macro-deep-dives-notes.md` §1.3-1.4,
`cog/lessons/macro-deep-dives.html`) classify the backdrop by the **direction of travel** of growth and inflation
(rate of change, not level) into four quadrants — goldilocks (growth up, inflation down), reflation (both up),
stagflation (growth down, inflation up), deflation / risk-off (both down) — each with an asset over/underweight map,
and say the **transitions** between quadrants carry the most value. He also warns that regime identification is
backward-looking. Paraphrased as testable claims:

1. **Map claim.** Knowing today's quadrant (from data as it was published) tilts the next 1-8 weeks of US indices
   (up in goldilocks/reflation, down in stagflation/deflation), gold (down in goldilocks, up in stagflation and
   deflation) and the dollar (down in goldilocks, up in deflation) relative to their unconditional drift.
2. **Transition claim.** The weeks right after the quadrant changes carry the new quadrant's tilt more strongly.
3. **Any-tilt claim** (map-free). Whatever the right map is, the quadrant carries a tilt that holds out of sample
   (learn the per-quadrant sign in one half of the sample, score it in the other).

Edge source (method lesson #4): if anything, a slow macro risk premium / slow repricing of growth and inflation news.
Who is on the other side: nobody identifiable; the quadrant is public, monthly and lagging. The prior from the
desk's rates/macro record is null for direction (`plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md` §A1).

## 2. Why it is not already settled — prior art (required)

- **`MD files/REGIME.md` (2026-09-19, the desk's regime screen; `js/regimeCore.js`, `analysis/regime_study.mjs`).**
  Same quadrant construction, but built from **today's fully revised FRED data with a one-month lag**, scored on
  **raw** next-month returns 2007-2026 (not against the unconditional drift), one horizon, no multiplicity, no
  placebo. Its table: S&P +1.2%/mo goldilocks and +1.5% reflation, Nasdaq +1.4% / +2.4%, gold +2.3% in deflation,
  every FX/dollar/10y/copper/oil cell "no tilt". Registered there as a description ("no pass"). The macro-direction
  proposal calls it "sizeable next-month tilts for equities and gold (context, not pre-registered)". **This study is
  the honest version of that table**: vintages instead of revised data, demeaned against B0 (equities rise in most
  months, so an "up in two quadrants" table is partly drift), four horizons, a placebo that keeps the quadrant's
  persistence, Holm.
- **`regime-divergence-fx` (NULL, `MD files/REGIME.md#R2`)**: per-currency labels, diverging vs aligned months —
  no range or return difference on EUR/USD, GBP/USD, USD/CAD, EUR/GBP. Pair-differential, not the US quadrant on
  the dollar/gold/indices.
- **`nq-down-week` / growth-vs-yields (`MD files/GROWTH_VS_YIELDS_TEST.md`)**: the range effect is Nasdaq's own
  down week; yields are a passenger. Range, daily.
- **Rates/yield/macro direction family** (`yield-asset-coupling`, `yield-predictive-ladder`, macro-confluence
  direction NULL/UNDERPOWERED, `nowcast-gap-cpi` NULL, `oil-to-breakevens` NULL): same-bar correlation, no lead.
  None conditions on the growth × inflation quadrant.
- **Point-in-time lesson** (`project_harness_and_deflation`): the 2y-spread sleeve's Sharpe ~1.1 was a GS2
  publication-lag lookahead (0.09 point-in-time). Revised or early-dated macro data can manufacture a direction
  edge — hence vintages here and a canary that moves release dates earlier.
- **Surprise store** (`js/fredActuals.js`, `MD files/SURPRISE_ACTUALS.md`): FRED vintages reproduce first prints
  179/181 against the archive — the vintage route is validated on this desk. ISM/PMI have no free vintage history,
  so the growth composite uses the desk's FRED legs, not ISM.
- **HMM / regimes**: "0 honest tests" for direction (`plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md`); the
  `mtf-structure` prereg (P1) is the HMM arm and is a separate study.

Not a re-run of a banked null: the only banked quadrant result is the FX divergence differential; the US quadrant's
asset tilts have never been scored point-in-time or against B0.

Method lessons applied (`education/RESEARCH_METHOD_LESSONS.md`, `research-protocol/references/stats-defaults.md`):
#1 positive control from outside the pipeline (`--selftest`: synthetic Markov quadrant with a planted tilt, and a
known-zero world with drift); #14 regime labels causal (snapshot strictly before the decision date, no smoothing,
no full-sample cuts); #11 overlapping horizons handled by half-year clusters; stats-defaults 2026-11-04 (a
persistent signal needs a whole-series placebo — the circular shift here, not a row shuffle); #25 the per-quadrant
ladder is reported, not just the map statistic.

## 3. Definitions, fixed in advance (required)

1. **Decision dates.** Every Friday, decision at the Friday NY close (OANDA daily close; if Friday has no bar, the last
   close within 4 days; otherwise missing).
2. **Point-in-time snapshot.** For decision date t and each ALFRED series: for every observation date, the value of
   the **latest vintage with realtime_start < t** (strictly before the Friday — a Friday release such as payrolls
   counts from the next week; conservative by ≤ 1 day). A series with no vintage yet is missing. T5YIE: daily
   prints with date < t. Month-end value = last observation in the month (claims, breakeven).
3. **Primary quadrant (P).** The desk's `js/regimeCore.js` construction, ported to Python, computed afresh from each
   snapshot (so every z-score window, every composite and every label uses only what had been published):
   growth legs CFNAI 3-month mean, −(3m − 12m mean of log claims), INDPRO 3-month annualised log change, PAYEMS
   3-month annualised log change; inflation legs core CPI and core PCE 3-month annualised log change, 5y breakeven
   level; each leg z-scored over a trailing 120 months (≥ 36 values); growth composite needs ≥ 3 legs, inflation ≥ 2;
   growth score = composite 3-month mean − 12-month mean; inflation score = composite − composite 3 months earlier;
   label = sign × sign (threshold 0) **for the latest month the snapshot can score** (no extra lag shift: the snapshot
   holds only printed data; the label month is 1-2 months before t, measured below).
   From the label build (signal only): first label 2009-05-29 (claims/CFNAI vintages bind), 900 Fridays to the
   lockbox, shares goldilocks 0.24 / reflation 0.25 / stagflation 0.25 / deflation 0.26, 102 spells, median spell
   8 weeks; label month 1 month old on 415 Fridays, 2 months on 476, 3 on 9.
4. **Secondary quadrant (S2)**, a simpler second spec (lesson #10): growth = PAYEMS 3-month annualised − 12-month
   log growth; inflation = core CPI 3-month annualised − 12-month; same snapshot rule; available from 2000 (longer
   sample). Agrees with P on 56% of Fridays.
5. **The map** (from the lesson's over/underweight table; +1 = expected up, −1 = down, 0 = no call → not scored):

   | | goldilocks | reflation | stagflation | deflation |
   |---|---|---|---|---|
   | US indices (NAS100, SPX500) | +1 | +1 | −1 | −1 |
   | Gold (XAUUSD) | −1 | 0 | +1 | +1 |
   | USD (7 majors, oriented USD-up) | −1 | 0 | 0 | +1 |

   Gold in deflation (+1) follows the lesson's "gold bid on real-yield collapse" confirmation for the move into
   deflation; USD in deflation (+1) follows "safe-haven FX (JPY, CHF, USD)"; quadrants where the material is silent or
   two-sided are 0.
6. **Outcome.** z = log(P[t+h] / P[t]) / (sd of the 52 weekly log returns ending at t × √h), oriented (USD basket:
   EURUSD, GBPUSD, AUDUSD, NZDUSD inverted; USDJPY, USDCAD, USDCHF as is). h ∈ {1, 2, 4, 8} weeks.
   **B0**: z is demeaned per instrument and horizon over the cell's scored sample (the unconditional drift).
7. **Scored statistic.** Map arm: mean over rows with a non-zero side of side × z_dm (rows = instrument × Friday; for
   USD and indices this averages across the group's instruments). Transition arm: same, only on Fridays whose label
   differs from the previous Friday's, h = 4w. Cross-fit arm: per-quadrant mean z_dm (pooled over the group) learned
   on one half of the dates, its sign used as the side on the other half and vice versa, h = 4w. S2 arm: the map arm
   on the S2 label, h = 4w.
8. **Halves**: split at the median decision date of each cell. **Placebo**: the quadrant series circularly shifted
   by a random 52 … N−52 weeks against the outcomes, 1000 shifts (keeps the quadrant's persistence and mix; a row
   shuffle would not — stats-defaults 2026-11-04).
9. **Pass bars.** Useful bar = an annualised information ratio of **0.30**: bar_h = 0.30 × √(h/52) σ_h →
   1w 0.042, 2w 0.059, 4w 0.083, 8w 0.118. "Large / folklore-size" tilt = IR 1.0: 1w 0.139, 2w 0.196, 4w 0.277,
   8w 0.392 (roughly the size the REGIME.md table implies for Nasdaq in reflation, ~0.25σ a month).

## 4. Hypotheses, expectation first (required)

| # | Cells | Pre-registered expectation |
|---|---|---|
| Map | usd / gold / indices × 1, 2, 4, 8 w (12 cells) | **Small or zero once demeaned and point-in-time.** Indices may keep a small positive tilt (+0.03 to +0.10 σ at 4w) — the REGIME.md pattern is partly drift; gold a weak positive; USD ≈ 0 (REGIME.md: no tilt) |
| Transition | usd / gold / indices, 4w (3) | **No stronger than the map** — a zero-threshold quadrant flips often (102 spells in 17 years), most flips are noise |
| Cross-fit | usd / gold / indices, 4w (3) | **≈ 0** — signs learned in one half rarely survive in the other with ~50 spells per half |
| S2 | usd / gold / indices, 4w (3) | Same as the map; longer sample |
| | **THE GATE** (per cell, VALIDATED only if all hold): (c1) Holm-adjusted p < 0.05 over all 21 cells, estimate > 0; (c2) estimate ≥ the useful bar; (c3) estimate > 97.5th percentile of the circular-shift placebo; (c4) positive in both halves; (c5) positive on ≥ 2/3 of the group's instruments (USD 7, indices 2; n/a for gold); (c6) still positive with the top 1% of \|side × z_dm\| rows removed; (c7) pipeline sanity: an effect of the cell's own MDE planted into the real rows is found by the 95% CI ≥ 80% of the time | |
| | **THE MIRROR**: a significantly negative estimate (the map backwards — e.g. indices rising in deflation as the Fed eases) is reported as such | |

**Verdict mapping per cell.** All of c1-c7 → **VALIDATED**. Else, if the 95% CI upper bound < the useful bar (the
data rule out even the useful effect): **CONTEXT** when c1 holds with the claimed sign, otherwise **NULL**. Else
**UNDERPOWERED**. Graded reading reported beside every verdict (owner's "null is not dead" rule): the estimate, its CI,
the MDE, and whether the **folklore-size** tilt (IR 1.0) is ruled out (CI upper < large bar).

## 5. Power — what this design can and cannot find (required)

From the control-only power run (`--power`: SD of the statistic over 300 circular shifts of the real quadrant against
the real outcomes; MDE = 3.88 × SD = two-sided α 0.05/21 (Holm worst case) at 80% power).

| Cell | Fridays | Placebo SD | **MDE** (σ_h) | Useful bar | Large bar | Powered for the useful bar? |
|---|---|---|---|---|---|---|
| map usd 1/2/4/8w | 899/898/896/892 | 0.038/0.057/0.075/0.106 | 0.148/0.222/0.292/0.411 | 0.042/0.059/0.083/0.118 | 0.139/0.196/0.277/0.392 | no |
| map gold 1/2/4/8w | same | 0.037/0.050/0.065/0.082 | 0.145/0.194/0.251/0.318 | same | same | no |
| map indices 1/2/4/8w | same | 0.031/0.043/0.066/0.080 | 0.122/0.165/0.258/0.312 | same | same | no |
| transition usd/gold/indices 4w | 896 | 0.110/0.120/0.101 | 0.427/0.466/0.393 | 0.083 | 0.277 | no |
| cross-fit usd/gold/indices 4w | 896 | 0.056/0.061/0.065 | 0.217/0.235/0.254 | 0.083 | 0.277 | no |
| S2 usd/gold/indices 4w | 1190/1022/1178 | 0.050/0.066/0.053 | 0.194/0.257/0.205 | 0.083 | 0.277 | no |

**Read this before the results.** No cell can see a *useful* (IR 0.3) tilt: 17 years of a monthly signal hold about
35 independent half-years. The design's MDE is an annualised IR of about **1.0-1.5** — it can detect only a
folklore-size tilt (the size the REGIME.md table implies), and the map cells' MDEs sit near the large bar
(indices 4w 0.258 vs 0.277). Consequences fixed now: (i) a cell is VALIDATED only if the tilt is large; (ii) NULL
needs the CI to exclude even the useful bar, which in practice needs a negative estimate; (iii) most cells are
expected UNDERPOWERED, and the informative reading is whether the **large** tilt is ruled out. That is the honest
ceiling of any 2009-2026 point-in-time test of a monthly macro label; pre-2009 vintages of claims and CFNAI do not
exist in ALFRED.

Positive controls: (i) `--selftest` (synthetic, known answer from outside the pipeline): 4-state Markov quadrant
(stay 0.93/week), planted tilt 0.25σ/week along the map → map usd/gold/indices 4w estimates +0.32/+0.38/+0.47 with CIs
clear of zero, all 7 tested cells VALIDATED (1w, transition, cross-fit and S2 included); known-zero world with a
+0.05σ/week drift → no cell VALIDATED (3 NULL, 4 UNDERPOWERED; the drift is removed by B0). Snapshot unit test: first print returned until the revision's vintage, nothing on
the release day itself. (ii) Each cell plants its own MDE into the real rows (c7) and the bar into the real rows
(reported). (iii) Evidence packs (4w map and transition cells) plant 0.5×/1×/2× the bar and leak the realised sign.

**Look-ahead canaries (must fire on the real data, reported in results.json):** (a) every vintage treated as
released 35 days earlier → the share of Fridays whose label changes, and the 4w map estimates with that leak;
(b) the REGIME.md way — today's revised data with a one-month lag → label agreement with the point-in-time
quadrant and the 4w map estimates. A canary that changes nothing would mean the snapshot is not doing its job.

## 6. Multiplicity (required)

- **Scored cells: 21** (12 map + 3 transition + 3 cross-fit + 3 S2). **Holm at α = 0.05** across all 21 (gate c1).
- **Descriptive** (not scored): per-quadrant demeaned mean z at 4w per group with CIs (the honest REGIME.md table);
  transitions and S2 at other horizons are not computed; canary estimates; per-instrument and per-half splits.
- **Promotion bar**: anything that changes a card's wording needs |t| ≥ 3 on its cell.

## 7. What this does NOT test (required)

- **Range / volatility by quadrant** (REGIME.md's "stagflation is widest" is a range description; not re-tested).
- **Non-US quadrants** and the pair differential (`regime-divergence-fx` covers it).
- **Other regime constructions**: HMM states (`mtf-structure`), dead-band or two-month confirmation rules, ISM/PMI
  legs (no free vintages), market-implied growth/inflation (breakevens alone, copper/gold).
- **Tradability**: no costs, sizing or stops; the statistic is a timing skill in σ units.
- **Horizons beyond 8 weeks** (quarters), where a slow macro label would most plausibly work — out of reach with 35
  independent half-years.

## 8. What each verdict changes (required)

- **VALIDATED (map, any group)** with |t| ≥ 3: the morning card's slow-thesis line may name the quadrant and its tilt
  for that group, with the size in σ and the horizon. Below |t| 3: research-only line on evidence.html.
- **VALIDATED transition**: the card may flag "quadrant just changed to X" as a weeks-scale tilt for that group.
- **UNDERPOWERED with the large tilt ruled out**: the quadrant stays a description of the backdrop; the card must not
  print REGIME.md's "S&P ↑ in this backdrop" as a direction tilt; the honest sentence is "no tilt we can measure;
  a large one is ruled out".
- **UNDERPOWERED with the large tilt NOT ruled out**: description only; the old table's tilt is neither confirmed nor
  excluded; say so.
- **NULL / mirror**: the card stops implying a quadrant direction for that group; the mirror, if significant, gets its
  own prereg before any use.
- **Next step, whatever the result**: the remaining power lever is more independent history — pre-2009 vintages exist
  for PAYEMS/INDPRO/CPI (S2 already uses them from 2000) and price history before 2003 would need a non-OANDA source.

## Amendments

### A1 — 2026-11-15 — POST-HOC (results seen), describe only
The positive controls (gate c7 in `run.py` and the evidence packs' 0.5×/1×/2× plants) added the planted effect ON TOP
of the real rows, so they measured "real estimate + plant", not what the pipeline can see from zero. For a cell whose
real estimate is negative (USD, indices, S2) the plant then reads 0% detection whatever the power, and the pack
labelled those cells "UNDERPOWERED" for the wrong reason (same family as pre-release-ranging A1). The evidence packs
were rebuilt (`run.py --repack`) with the plant added to NULL-IZED rows (the real estimate × side removed first).
Gate c7 in `results.json` is left as coded at the run and is flagged there as confounded; it cannot change any
verdict, because no cell passes c1 (smallest Holm p = 0.39), so no cell could be VALIDATED either way. No verdict
changes.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/growth-inflation-quadrant/RESULTS.md`. Nothing above this line changes after the run.*
