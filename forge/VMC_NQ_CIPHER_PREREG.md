# vmc-nq-cipher — does VuManChu Cipher B carry information about what NQ futures do next, beyond what price already says?

**Pre-registered 2026-10-30, before any outcome was computed.** Stage 0 (spec, dataset, leak tests, event counts)
computed features and event counts only.

| | |
|---|---|
| ID / ledger ids | `vmc-nq-cipher-direction` (signed return and threshold race), `vmc-nq-cipher-volatility` (size of the next move), `vmc-nq-cipher-sequencing` (does one component's change come first, beyond mechanics), `vmc-nq-cipher-interaction` (do combinations beat the best single component) |
| Branch | `main` (commits from a detached worktree of origin/main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `vmc-nq-cipher` |
| Data | NQ futures 1-minute (NinjaTrader, 44 contracts, ratio back-adjusted; holes filled from the owner's file per whole trade date), resampled to 1, 3, 5, 15, 30, 60, 240 min and daily. **Discovery** trade dates 2016-01-04 → 2022-12-31; **validation** 2023-01-01 → 2026-08-20. **Lockbox** (trade dates ≥ 2026-08-21) not read; see §3 |
| Seed | `20261030` (every script in this study) |
| Uncertainty | trade-date block bootstrap, blocks of 20 trade dates, B = 2000 (final), percentile intervals |
| Scripts / outputs | `scripts/vmc-nq-cipher/` → `analysis/output/vmc-nq-cipher/` |
| Harness | own scripts: the dataset and event code is study-specific; the loader `vmcds.py` enforces the lockbox |

## 1. The claim

From the owner's brief (2026-10-30), paraphrased: the components of VuManChu Cipher B can reveal upcoming NQ price
behaviour before it is obvious on the chart. This covers:
- WaveTrend waves (peaks and troughs, successive waves getting stronger or weaker, crosses after extremes, speed of
  reversal);
- money flow, and the Cipher B "VWAP" (WT spread, wt1 − wt2);
- momentum;
- regular and hidden divergences, including between components;
- how components align or conflict, and which changes first;
- context from higher timeframes.

The brief asks for genuine discovery: "not confirmation of an existing trading belief". It also asks to judge
direction, threshold races and volatility/size separately.

## 2. Why it is not already settled

Nearest banked work, all on OANDA CFD data (tick-count volume):
- `MD files/VUMANCHU_DIRECTION_FINDINGS.md`: direction |IC| 0.02–0.05, below cost; the components largely restate
  price.
- `vumanchuLab/FINDINGS.md`: stretched WT reverts slightly (about 1–2pp over 1h on NQ); MTF agreement adds in FX but
  not NQ; VWAP plus WT co-divergence marks volatility, not direction.
- `vmcResearch/` (Aug 2026): nothing leads; MTF confluence is non-monotone; GBM ceiling AUC 0.50; VWAP extension at
  confirmed pivots is real.
- `vmcResearch/FUTURES_NQ.md` (today): on NQ futures, no component forecasts price (partial |corr| ≤ 0.025), and
  divergence is slightly negative.

This is **not a re-run of those nulls**. These questions were never asked, or not on futures:
1. **Waves as objects**: successive-wave amplitude ratios, with weakening and strengthening (F3). Never built.
2. **Sequencing against a mechanical null**: does a change in one component come before another more often than the
   same pipeline produces on price paths with no information in them (§3, the shuffle null)? Never tested.
3. **Component-vs-component divergence** (WT2 vs MF, F5) and **failed alignment** (F7x). Never tested.
4. **Volatility and size of move as the outcome**, for every family. Previously tested only for co-divergence.
5. The Pine-faithful `f_findDivs` divergences (gated WT2) on **futures**, on **30m and daily** too.

The direction families that repeat earlier nulls (F1a, F4, F6z, F7f) are kept in the screen as anchors: they show
whether futures behave like the CFD. They are expected to be null, and a null there adds nothing new.

## 3. Definitions, fixed in advance

**Indicator**: `analysis/output/vmc-nq-cipher/SPEC.md` (operator WaveTrend 9/12/3; faithful Money Flow; WT spread =
Cipher B "VWAP"; price-VWAP distance separate; divergences as `js/divergenceCore.js`).

**Events**: `scripts/vmc-nq-cipher/events.py`, families F1a–F9n, exactly as its header lists (24 families). Each event
is stamped on the bar at whose close it is first knowable (fractal pivots + 2 bars; HTF values only from closed HTF
bars). Each has a direction s. Thresholds are fixed in the code and were chosen before any outcome:
- 0.75 / 1.333 wave ratios;
- ±53 extremes over 10 bars;
- |wt1| < 20 for mid-range;
- 30-bar MF run;
- alignment sampled every 12 bars;
- failed alignment within 6 bars and < 0.5σ;
- MF lead within 10 bars.

**De-clustering**: within a family × timeframe cell, an event fewer than 12 bars after the previous kept one is
dropped. Remaining overlap is absorbed by the trade-date block bootstrap.

**Cells**: family × timeframe (1, 3, 5, 15, 30, 60, 240, D; F8 has no 240/D) = 188 cells.

**Outcomes**, measured on the event timeframe's own bars from the close of the event bar t. σ = the trailing 500-bar
return SD of that timeframe; P = close at t.
- **R_h** (direction) = s · (C[t+h] − C[t]) / (σ · P · √h), for h ∈ {3, 12, 48} bars. **Primary h = 12.**
- **Race** (direction) = 1 if C ± σ·P·√12 in direction s is touched before the opposite level within 12 bars (bar
  high/low); 0 if the opposite is first. Bars that touch both are ties: excluded and counted. Unresolved by 12 bars
  are excluded and counted.
- **V_12** (volatility, no sign) = log((max H − min L over bars t+1..t+12 + 1 tick) / (σ · P · √12)), with tick 0.25
  index points expressed in the ratio-adjusted price.
- **MFE/MAE** over 12 bars in σ√12 units: descriptive only.

**Control (matched baseline)**: every exploratory bar of the same timeframe and period, grouped into strata:
- New York clock hour (24);
- σ tercile (cutpoints from discovery);
- prior 12-bar return in σ√12 units, 10 bins (sign × 5 magnitude bins, quintile cutpoints of |prior| from discovery).

For an event with direction s, the baseline is s · μ(stratum) for R_h. μ is the stratum mean of the unsigned outcome,
and the stratum uses the event's own unsigned prior return. For V_12 it is μ(stratum); for the race, the stratum hit
rate of an up-race (or down-race when s = −1). **Effect Δ = mean over events of (outcome − baseline).** This is the
"beyond price" control: it removes what time of day, volatility level and the recent move already predict.

**Shuffle null (mechanics and selection)**:
- K = 20 synthetic NQ histories. Within each trade date the order of the 1-minute bars is permuted (each bar's open,
  high, low and close relative to its open, and its volume, kept). The trade dates are then permuted in blocks of 20.
- Each history goes through the full pipeline: features, events, outcomes, baseline, screen.
- No real intraday information survives, but every mechanical relationship between the indicator, the events and the
  outcome window does.

**Samples**: discovery 2016-01-04 → 2022-12-31; the stability split is 2016–2019 vs 2020–2022. Validation
2023-01-01 → 2026-08-20, opened once for frozen survivors.

**Lockbox**: trade dates ≥ 2026-08-21 sit in `data/lockbox/`. The loader refuses them without
`VMC_LOCKBOX_APPROVED=1`. Nothing in this study reads them. A confirmation run needs the owner's approval and ≥ 60
sessions; there are 36 now.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Weakening WT2 waves (F3w, F3wL) precede a move against the weakening leg | **Null** for direction (the earlier divergence and turning work points that way). A **volatility** change (smaller next move) is plausible |
| H2 | Strengthening waves (F3s) precede continuation | **Null to small** |
| H3 | A cross after an extreme (F1b) behaves differently from a mid-range cross (F1c) | **Small reversion difference** at 1–15m (stretched WT reverts about 1–2pp in earlier work), likely below materiality |
| H4 | Reversal speed at a cross matters more than level: partial rank correlation of s·R_12 with speed given level, vs with level given speed, at F1a events | **Both ≈ 0**; no ordering expected |
| H5 | Divergences (F4, Pine-faithful, all series) predict direction | **Null or slightly negative** on NQ (today's futures re-run). Regular divergence → **higher V_12** (the co-divergence volatility result) |
| H6 | WT2 vs Money Flow divergence (F5) predicts direction | **Null** |
| H7 | MF zero cross (F6z) and MF weakening (F6w) predict direction | **Null** |
| H8 | Full alignment (F7f) beats partial (F7p); failed alignment (F7x) reverses | **Null**; full alignment mean-reverts slightly if anything |
| H9 | LTF crosses with the HTF agreeing (F8a) beat those with the HTF opposing (F8o) | **Null** on NQ (earlier MTF work) |
| H10 (sequencing) | MF changes before the WT cross more often than mechanics alone produce, and crosses that MF led (F9) differ from crosses MF opposes (F9n) | **Mechanical**: the lead share sits inside the shuffle-null range |
| — | **THE GATE (discovery → survivor)**: BH q < 0.10 within each outcome family (R_12, race, V_12) over all cells; \|Δ\| ≥ materiality (R_12 0.03 σ√h; race 2pp; V_12 0.05 log units ≈ 5% in range); the same sign in 2016–19 and 2020–22; and the cell's \|t\| above the 95th percentile of that cell's \|t\| over the 20 shuffle histories | |
| — | **THE SCREEN-LEVEL GATE**: the real number of survivors must exceed the 95th percentile of survivor counts across the 20 shuffle histories, else every survivor is labelled selection noise and the screen verdict is NULL | |
| — | **THE MIRROR**: every family has its opposite sign built in (s = ±1 pooled); the bull and bear halves of each surviving cell are reported separately and must not have opposite signs | |
| — | **VALIDATION GATE**: each frozen survivor is scored once on 2023 → 2026-08-20 with the same outcome; Holm α = 0.05 one-sided in the discovery direction across survivors; validated if it passes with Δ of the same sign | |
| — | **INTERACTION GATE** (ledger `-interaction`): a surviving combination (F7, F8, F9 family) counts only if, in validation, Δ(combination) − Δ(best single component state on the same bars) has a 95% interval above 0 (paired bootstrap). The single components are: spread sign, wt1 sign, MF sign and price-VWAP sign, each sampled exactly like F7 | |
| — | **SEQUENCING GATE** (ledger `-sequencing`): the share of WT crosses preceded within 10 bars by a same-direction MF zero cross, on 1/5/15/60m, must sit above the 97.5th percentile of the 20 shuffle histories on at least 3 of the 4 timeframes in discovery, then again in validation | |

## 5. Power: what this design can and cannot find

Outcome SDs from the control sample (all discovery bars, every 12th, no event outcome read):
- R_12 ≈ 1.05–1.14;
- V_12 ≈ 0.52–0.55 (60m/240m; lower timeframes measured with the tick floor at run time).

Design effect assumed 1.5 (events thinned to ≥ 12 bars apart, but they cluster in busy sessions).
MDE = 2.8 · SD · √1.5 / √n (80% power, two-sided 0.05; BH and Holm make the real bar stricter).

| Cell (typical family) | n discovery | n validation | MDE R_12 disc / val | Pass bar 0.03 | MDE V_12 disc / val | Pass bar 0.05 |
|---|---|---|---|---|---|---|
| 1m (F3w 81,814 / 42,963) | 82k | 43k | 0.013 / 0.018 | POWERED | 0.007 / 0.009 | POWERED |
| 5m (F3w 16,390 / 8,593) | 16k | 8.6k | 0.030 / 0.041 | borderline / UNDERPOWERED in val | 0.015 / 0.020 | POWERED |
| 15m (F3w 5,439 / 2,844) | 5.4k | 2.8k | 0.052 / 0.072 | UNDERPOWERED | 0.025 / 0.035 | POWERED |
| 60m (F3w 1,322 / 672) | 1.3k | 0.7k | 0.105 / 0.15 | UNDERPOWERED | 0.05 / 0.07 | borderline / UNDERPOWERED |
| 240m / D | 368 / 65 | 194 / 26 | > 0.2 | UNDERPOWERED | > 0.1 | UNDERPOWERED |

Rarer families (F4reg_wt2: 1m 27k, 5m 5.8k, 60m 525) scale accordingly; `event_counts.csv` has every cell.

**Read this as**:
- direction can only be found at 1–5 minutes at a 0.03σ bar;
- volatility effects of 5% can be found through 15–30m;
- 60m and slower are UNDERPOWERED for both, by design;
- a null at 60m/240m/D is recorded as **UNDERPOWERED**, never NULL.

## 6. Multiplicity

- **Screen**: 188 cells × 3 outcome families (R_12, race, V_12) = 564 tests, BH q = 0.10 within each outcome family.
  R_3 and R_48 are descriptive only. The screen produces **candidates**, never results.
- The **shuffle null** prices the whole search, selection included (screen-level gate, §4).
- **Validation**: Holm α = 0.05 over the frozen survivors, one-sided in the discovery direction. With a single
  survivor there is no correction.
- **Promotion** to anything live needs |t| ≥ 3 in validation. A `validated` at |t| between 2 and 3 stays research-only.
- **Variants**: none. The thresholds in §3 are the only ones run. Any later variant is a new prereg on data this study
  has not used.

## 7. What this does NOT test

- **A trading strategy.** Δ is a conditional shift in the outcome distribution, not a P&L. Costs are reported
  descriptively for survivors: NQ round trip 0.725 pt in σ units per timeframe.
- **Cause.** A validated cell says a configuration was followed by a different outcome, not why.
- **Other instruments.** NQ only; any survivor would need its own replication on ES/GC.
- **Sommi flags and diamonds, the Schaff Trend Cycle, the gold dot** (out of the brief; earlier nulls).
- **Discretionary reading** of the chart. A human may combine things this catalogue does not encode.

## 8. What each verdict changes

- **VALIDATED (any ledger id)**: Evidence Book entry. The surviving configuration gets a dedicated follow-up prereg:
  execution model, cost, lockbox confirmation at ≥ 60 sessions with approval. Nothing goes live from this study.
- **NULL**: Evidence Book entry. The VuManChu pages and briefs keep describing the indicator as a description of recent
  momentum, not a forecast. Wave, sequencing and component-divergence ideas are closed on NQ at the powered
  timeframes.
- **UNDERPOWERED**: 60m and slower are recorded as untestable here. They would need decades more data, or pooling
  across instruments under its own prereg.
- **Sequencing found mechanical**: "MF moves first" is recorded as a property of the formulas (different smoothing),
  not of the market.

## Amendments

### A1 — 2026-10-30 — POST-HOC (results seen)
Checks on the validated volatility cells (F1c, V_12), added after validation:
- major US releases removed;
- the recent 12-bar range added to the strata;
- mid-range bars without a cross;
- by year and without the top 1%.

They are reported in `analysis/output/vmc-nq-cipher/posthoc_F1c.json` and RESULTS.md. They can only demote or describe.
They did not demote: the effect stays positive and |t| >= 2.3 under every control. They do describe it: about half of
the effect belongs to WaveTrend sitting mid-range, not to the cross.

Implementation notes, no outcome-relevant change:
- 186 of the 188 planned cells had events. The two missing ones are daily cells with no event after de-clustering.
- Shuffle histories used B = 500 (discovery) and B = 200 (validation) for their t statistics; the real data used
  B = 2000.

## RESULTS — run 2026-10-30

See `analysis/output/vmc-nq-cipher/RESULTS.md`.
- **direction: NULL** (1-5m powered; 15m and slower UNDERPOWERED);
- **volatility: VALIDATED**: mid-range WaveTrend cross, next-12-bar range +5-8% on 1/3/5/30m, validation t 3.7-5.6;
  about +3-4% after the post-hoc controls;
- **sequencing: VALIDATED** as a property: MF turns first in 16.4% vs 15.7% of crosses, with no price consequence;
- **interaction: NULL**.
