# Determining Confidence at Entry Zones

> How the forecast-level strategy decides, at each vol-forecast line: **where to
> enter (the zone)**, **which way (fade vs follow)**, and **whether to enter
> (confidence)** — and how that's assembled into an honest multi-pair book.
> Companion to `REVERSION_CONTINUATION_CONCEPT.md` (the theory), `LEGO_MODULES.md`
> (the brick registry) and `CLAUDE.md` (the rules). Read this to pick up the
> strategy work where it stands.

---

## The three decisions

At every forecast line a touch raises three questions. The whole engine is built
around answering them, in order:

1. **Entry zone** — *where* is the line, and did price tag it?
2. **Direction** — *fade* (price reverts off it) or *follow* (price breaks through)?
3. **Confidence** — is the edge big enough, after costs, to actually trade?

---

## 1. Entry zone — *where* we enter

Per day, off the open and a vol-forecast σ, we draw **8 lines** (4 names × 2 sides):

| Line | Meaning | Distance |
|---|---|---|
| `OC50` / `OC75` | Close median / 75th displacement | `HN_P50=0.6745` / `HN_P75=1.1503` × σ |
| `HL50` / `HL75` | Projected High/Low median / 75th range | `BM_P50=1.572` / `BM_P75=2.049` × σ (Feller) |

**Geometry — matches the live Pine chart (this was a fix):**
- **OC (Close) lines are STATIC off the open**: `open × (1 ± ocDist)`.
- **HL (Proj H/L) lines are DYNAMIC** — each trails the *opposite* running extreme,
  recomputed every bar: `projHigh = runLow × (1 + hl)`, `projLow = runHigh × (1 − hl)`.
  (Originally they were wrongly static-off-open, which also produced a false
  "2× too wide" calibration alarm — now corrected.)

A **touch** = the first intrabar M1 tag of a line. Each *decided* touch stores its
**triple-barrier geometry**: `innerLvl` (next line toward open = the fade's TP),
`outerLvl` (next line away = the SL), and `decidedBy` (`barrier` vs `close`).

**Modules:** `js/forecastCore.js` (`computeBands`, `simulateEntry` w/ `dynamicHL`),
`js/forecastAnalyser.js` (`buildLadder`, `analyseWindow`).

---

## 2. Direction — fade vs follow, *per line*

Not one rule for all lines — **each of the 8 lines is scored independently**. At a
touch the policy says **fade**, **follow**, or **skip** for that specific
`line × condition` cell.

- Module: `js/perLineStrategy.js` (`buildPolicy`).
- A **cell** = `line × condition`, e.g. `HL50_up | 3·spike`.
- Empirically the survivors are **fades of the HL (exhaustion) lines**; the
  Close-line follows didn't pay and were dropped.

---

## 3. Confidence — *whether* to enter (and how sure)

Two layers, and most of the work lives here.

### (a) The at-the-moment feature — `js/touchFeatures.js`
A configurable brick (`createTouchFeatures(cfg)`, config set on import) computing,
at the moment of the touch, from M1 + tick volume:

| Feature | Idea | Verdict |
|---|---|---|
| **`approachVel`** | speed of the move *into* the line (σ-units) | **THE winner** — spike → fade, p<0.001 OOS, ~72% reversion on HL |
| `range-budget` | how much of the day's range was spent at the touch | significant (p<0.001) |
| `approachER` | Kaufman efficiency of the approach | washed out |
| `wtState` | WaveTrend momentum | dead OOS |
| `candleReject` | rejection wick at the touch | died OOS (p 0.002 → 0.33) |
| `volClimax` | tick-volume spike | weak |
| `roundNum` | level on a round number (Osler) | weak in EURUSD |

> **Key discovery:** the *pre-day* day-type score (`dayTypeCore.classifyDayType`,
> from daily closes) is **dead** for this (AUC ≈ 0.50). It's too slow — the edge is
> **intraday, at the moment of the touch**. The `Drivers` tab (chi-square +
> **out-of-sample** toggle) is how each feature was tested and culled.

### (b) The confidence gate = after-cost EXPECTANCY (not just "is it >50%")
`buildPolicy` keeps a cell only if its **in-sample expectancy after costs** (real
TP/SL + honest mark-to-close + spread/slippage) clears a margin. **Significant ≠
profitable** — a 58%-reversion cell whose wins are smaller than the spread is
**skipped**. This is "enter if confidence > X", where **X is measured in money**,
not direction. (Fixing this turned a −818% overtrading book into a broadly
profitable one.)

---

## How it's wired into the strategy — `js/perLineStrategy.js`

```
extractTouches(records, {conditions})         → decided touches + geometry + cell key
buildPolicy(IS touches, {minN, marginPct})    → fade/follow/skip per cell (after-cost expectancy)
pnlFor(touch, decision, {costPct, slipPct})   → triple-barrier PnL; mark-to-close if no barrier hit
runPerLine(touchesByPair, …)                  → POOLED-IS policy applied PER-PAIR OOS → book + portfolio
```

- **Pooled-IS, per-pair-OOS:** one universal policy (avoids per-pair overfit, tests
  Grinold breadth), validated on held-out later data (`splitFrac` = 0.6 → 40% OOS).
- **Triple-barrier exit:** TP = inner line, SL = outer line; the touch outcome says
  which hit first. If neither is reached → **mark-to-close** (a 2-pip drift is *not*
  booked as a full win — `decidedBy='close'`).
- **Honest Sharpe:** `backtestStats.portfolioStats` computes Sharpe on the **daily**
  portfolio return ×√252 (captures concurrency + cross-pair correlation), not
  per-trade ×√(trades/yr) which fantasised a Sharpe ~10. Plus a vol-targeted
  CAGR/DD. *(PR #520, in flight at time of writing.)*
- **Orchestrator/UI:** `forecastAnalyserStore.runPerLineBook` (loads stored records,
  pools, writes `per-line-{horizon}.json` + per-pair trade logs), routes in
  `analyserRoutes.js`, surfaced in the **Book tab** of `forecast-analysis.html`.

---

## Modules & config

| Module | Owns | Key config (defaults) |
|---|---|---|
| `js/forecastCore.js` | level math, `computeBands`, `simulateEntry(dynamicHL)` | BM/HN constants; `dynamicHL:true` |
| `js/forecastAnalyser.js` | `analyseWindow` (dynamic HL, touches, barriers, `decidedBy`), `runAnalyser` | `conditions:['approachVel']`, M1 sessions @22:00 UTC |
| `js/dayTypeCore.js` | day-type score (dead for this) + `labelOutcome` (realized cont/rev label) | label `closeVsOcMed` (~50/50) |
| `js/touchFeatures.js` | at-the-moment features (factory) | `velWin:15`, `velFast:0.60/velSlow:0.25`, `erWin:20`, `wt{10,21,4}`, `volWin:30`, `rnOnPips:5` |
| `js/perLineStrategy.js` | policy + triple-barrier + book | `minN:50`, `marginPct:0`, `splitFrac:0.6`, cost fx 0.012 / idx 0.010 / cmdty 0.020, slip 0.006/0.008/0.012 |
| `js/backtestStats.js` | full battery + bootstrap + Monte-Carlo + `portfolioStats` | `mcRuns:1000`, `bootRuns:1000`, `targetVol:10%`, `periodsPerYear:252` |

---

## Lessons baked in (why each fix exists)

1. **Levels:** HL must be dynamic (trail the opposite extreme) — fixed a false
   "2× too wide" calibration alarm.
2. **Confidence is intraday, not pre-day:** the day-type score from daily closes is
   dead (AUC 0.50); the edge is the **approach** (velocity spike at the touch).
3. **Significant ≠ profitable:** gate on **after-cost expectancy**, not a z-test
   (this fixed a −818% overtrading book — 16k trades/yr paying the spread for ~zero
   average edge).
4. **A win must be a real move:** mark-to-close so a 2-pip drift isn't booked as a
   full target.
5. **Sharpe must be time-aggregated:** per-trade ×√(trades/yr) gave a fantasy 9.64;
   the **portfolio Sharpe** (daily ×√252) is the real number for concurrent,
   correlated pairs.

---

## Current state (snapshot)

- **33/33 pairs profitable out-of-sample**, bootstrap p5 positive, P(profit) 100% —
  the edge is **real and broad**.
- Policy ≈ **15 fades / 0 follows / 9 skips**; core = **HL-spike fades** (~72%
  reversion, +0.19% expectancy after costs).
- Per-trade Sharpe (overstated) ~9.6; **honest portfolio Sharpe** being measured
  (expect ~2–4).
- **Remaining optimism to test:** the backtest assumes limit fills at the exact
  lines and exits at the exact TP/SL — still an *upper bound* on the truth.

## Next

1. Measure the **honest portfolio Sharpe** (PR #520) and re-read with breadth.
2. **Phase 2:** click-a-trade → M1 chart drill-down (`levelChart` brick), forecast
   lines + entry/TP/SL marked (the per-pair trade logs already store the geometry).
3. **Fill realism:** model limit-fill probability / execution slippage beyond the
   flat cost — the last big optimism.
4. Then **paper trade** the survivors.
