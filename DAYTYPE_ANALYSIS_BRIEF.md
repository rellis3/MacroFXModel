# Day-Type Score — Analysis Page Integration Brief

> A handoff spec for wiring the `dayTypeCore` lego brick into the forecaster
> analysis page and charting the day-type score against realized
> continuation/reversion over years of history. Companion to
> `REVERSION_CONTINUATION_CONCEPT.md` (the theory) and `CLAUDE.md` (the rules).

**Goal:** for every forecast setup in the backtest, record the day-type score,
then answer three questions — (a) what did the score look like when price
**continued** vs **reverted**, (b) was there a "trend to the confidence" (does a
stronger lean mean more often right), and (c) did it **confirm or contradict**
the directional system.

---

## 1. Import the brick — never copy it

It is the single source of truth on `main` at `js/dayTypeCore.js`.

```js
import { classifyDayType } from './js/dayTypeCore.js';
```

Do **not** re-implement the score — import it, so the analysis can't silently
disagree with the forecaster (Lego Principle #1 in `CLAUDE.md`).

## 2. Call it per setup — strict no-lookahead

At each forecast window `i` (e.g. each day in the backtest), pass the
per-horizon close array and the index of the window being predicted. The
estimators read data **strictly before `idx`** only — feed the full `closes`
array and the integer `i`; do **not** pre-slice future data out, and do **not**
pass the window's own close as if it were known.

```js
const closes = d1Bars.map(b => b.close);            // full series
const { T, signedT, label, components } = classifyDayType(
  { closes, idx: i, win: 14 }                        // uses closes[< i] only
);
```

Outputs:

| field | range | meaning |
|---|---|---|
| `T` | `0 .. 1` | trend-day-ness (0 = chop/revert, 1 = strong trend/continue) |
| `signedT` | `−1 .. +1` | same signal re-centred: **sign = lean** (−ve fade/revert, +ve follow/continue), **magnitude = strength**, ~0 = no lean |
| `label` | `RANGE \| MIXED \| TREND` | coarse bucket |
| `components` | object | per-estimator breakdown (efficiencyRatio, varianceRatio…) |

> ⚠️ `signedT` is a directional **lean, NOT a calibrated probability**. Its
> magnitude is not `P(win)` — do not present it as a "% confidence." Whether the
> magnitude deserves to become a calibrated probability is exactly what analysis
> (b) below tests.

## 3. Define the realized outcome to score against

For each window, compute the forecast bands with
`computeBands(open, sigma, assetClass)` from `js/forecastCore.js`, then classify
what price **actually did**:

- **CONTINUATION** — the close finished **beyond** the median high/low band
  (`|close − open| > hl50`): it broke through the zone and kept going.
- **REVERSION** — price tagged a band but the close came back **inside** toward
  the close-median (`|close − open| ≤ hl50`).

This is exactly the quantity `T` is trying to predict. (If you already have the
forecaster's per-trade `outcome` from `simulateEntry`, you can use that too, but
the close-vs-`hl50` rule is the clean unconditional label.)

## 4. Record schema — one row per window

```
{ date, asset, horizon, open, sigma, hl50, hl75,
  T, signedT, label, components,
  realized: 'CONTINUATION' | 'REVERSION',
  directionalAction,   // forecaster selector's choice: 'fade' | 'follow'
  tradeOutcome }       // optional: win/loss/no_fill from simulateEntry
```

## 5. The three analyses to output

### (a) What did the score look like when price continued vs reverted?
Two overlaid histograms (or violin plots) of `signedT`, split by `realized`.
Expectation: CONTINUATION rows skew **positive**, REVERSION rows skew
**negative**. Report the mean `signedT` per group and the overlap.

### (b) Was there a "trend to the confidence" — does a stronger lean mean more often right?
Bin rows by `signedT` (e.g. deciles from −1 to +1). For each bin plot
**P(CONTINUATION)**. A monotone rising curve ⇒ the lean carries real
information; flat ⇒ no edge. Also report the **AUC** of `signedT` vs the binary
continuation outcome (0.5 = useless, >0.6 = useful). This reliability/calibration
view is how you decide whether the magnitude is worth turning into a calibrated
probability (the meta-label layer) later.

### (c) Did it confirm or contradict the directional system?
Cross-tab the **sign of `signedT`** (fade-lean vs follow-lean) against the
forecaster's `directionalAction`, with the realized hit-rate in each cell:

| | system: fade | system: follow |
|---|---|---|
| **lean −ve (fade)** | agree | disagree |
| **lean +ve (follow)** | disagree | agree |

Key question: does the **agree** diagonal have a higher continuation/reversion
hit-rate (and trade win-rate) than the **disagree** off-diagonal? If yes, the
day-type lean confirms and sharpens the directional system; if the off-diagonal
is just as good, the lean adds nothing.

## 6. Validation discipline (non-negotiable on this repo)

- Split every result **in-sample / out-of-sample** (use `summarizeSplit` from
  `js/honestForecastEngine.js`, default ~40% OOS) and report both — an IS-only
  separation is not evidence.
- Show **sample size** next to every bin/cell; treat any cell with **N < 30** as
  untrustworthy.
- Run across **all horizons** (daily / weekly / 20-day) through the same code
  path — `signedT` is horizon-agnostic.

---

## What the result tells you

- If (b)'s P(continuation)-by-bin curve rises monotonically and AUC > ~0.6, the
  magnitude is meaningful → it's worth building the calibrated **meta-label**
  (triple-barrier `P(win)`) on top, per `REVERSION_CONTINUATION_CONCEPT.md` §5
  Layer 3.
- If (b) is flat, the lean gives **direction but not conviction** — keep the sign
  as a gate, skip the confidence layer.
- (c) tells you whether the day-type lean is **additive** to the existing
  directional system or redundant with it.
