# Volatility Estimator Change Log

## 2026-06-15 — Primary Estimator Switch (reference-comparison driven)

### Context
After adding shadow columns (YZ, HV20, EWMA) to the compare table and running a
full comparison against the C.OG reference quant system on the June 15 session,
the gap data was unambiguous:

| Instrument | GARCH Δ | YZ Δ   | HV20 Δ | EWMA Δ | Ref vol  |
|------------|---------|--------|--------|--------|----------|
| GOLD       | +15.5%  | +20.1% | **+2.7%** | −11.3% | 28.91%  |
| NQ         | +15.9%  | +32.2% | +13.5% | **+3.7%** | 29.99% |
| EURUSD     | +21.4%  | +12.0% | +37.0% | +31.8% | 5.89%    |

(Δ = how much higher ref is. Positive = we underestimate. Closest to 0 = winner.)

HV20 is nearly exact for GOLD (+2.7%).  EWMA λ=0.90 is near-exact for indices (+3.7%).
YZ remains the best available for FX (−12%), but HV30 is being tried as the new FX primary.

---

### BEFORE this change

**File: `js/volForecast.js`**

Primary estimators (lines ~312–316):
```javascript
const volSeries = assetClass === 'commodity'
  ? rsEwmaVolSeries(ohlc)
  : garch11VolSeries(ohlc, p.garch_omega);
```

Correction factors (lines ~63–67):
```javascript
const ASSET_PARAMS = {
  commodity: { hl_50_corr: 1.203, hl_75_corr: 1.076, oc_50_corr: 1.328, oc_75_corr: 1.237 },
  index:     { hl_50_corr: 1.106, hl_75_corr: 1.068, oc_50_corr: 1.157, oc_75_corr: 1.241, garch_omega: 4.76e-6 },
  fx:        { hl_50_corr: 1.080, hl_75_corr: 1.015, oc_50_corr: 1.147, oc_75_corr: 1.122, garch_omega: 3.60e-7 },
};
```

Shadow fields stored per instrument: `yz_vol_annual`, `hv_vol_annual`, `ewma_vol_annual`

---

### AFTER this change

**Primary estimators switched per asset class:**
- `commodity` → `hv20Series(ohlc, 20)`  (was: RS-EWMA λ=0.94)
- `index`     → `ewmaVolSeries(ohlc, 0.90)`  (was: GARCH α=0.06 β=0.91)
- `fx`        → `hv20Series(ohlc, 30)` [HV30]  (was: GARCH α=0.06 β=0.91)

**Correction factors reset to 1.0** (old corrections were calibrated for GARCH/RS-EWMA;
with new estimators closer to reference, the corrections overshoot):
```javascript
const ASSET_PARAMS = {
  commodity: { hl_50_corr: 1.0, hl_75_corr: 1.0, oc_50_corr: 1.0, oc_75_corr: 1.0 },
  index:     { hl_50_corr: 1.0, hl_75_corr: 1.0, oc_50_corr: 1.0, oc_75_corr: 1.0, garch_omega: 4.76e-6 },
  fx:        { hl_50_corr: 1.0, hl_75_corr: 1.0, oc_50_corr: 1.0, oc_75_corr: 1.0, garch_omega: 3.60e-7 },
};
```
(garch_omega kept for the legacy shadow series which still runs GARCH internally)

**New shadow field added:** `legacy_vol_annual`, `legacy_hl_median`, `legacy_oc_median`
(stores the old GARCH/RS-EWMA output so compare table shows before/after side by side)

---

### How to revert

To go back to the pre-switch state, in `js/volForecast.js`:

1. Restore ASSET_PARAMS correction factors (values above in BEFORE section)
2. Change `computeForecast()` primary logic back to:
   ```javascript
   const volSeries = assetClass === 'commodity'
     ? rsEwmaVolSeries(ohlc)
     : garch11VolSeries(ohlc, p.garch_omega);
   ```
3. Remove the `legacy_vol_annual/hl/oc` fields from the return object
4. Restore the old return block:
   ```javascript
   return Object.assign(_buildOutput(volSeries, sigmaFwd, assetClass, newsMult), {
     yz_vol_annual: ..., yz_hl_median: ..., yz_oc_median: ...,
     hv_vol_annual: ..., hv_hl_median: ..., hv_oc_median: ...,
     ewma_vol_annual: ..., ewma_hl_median: ..., ewma_oc_median: ...,
   });
   ```

Git: the last commit before this change is tagged with message
`"Store HV20 and EWMA shadow fields in KV alongside GARCH/YZ"`.
Run `git log --oneline` to find it and `git revert <hash>` or `git checkout <hash> -- js/volForecast.js`.

---

### Notes

- FX HV30 is experimental — the reference gap for FX was best closed by YZ (+12%), not HV.
  If HV30 underperforms GARCH for FX, switch fx primary to `yangZhangVolSeries(ohlc)` instead.
- Correction factors may need fine-tuning after a week of compare data with the new primaries.
  Look at Δ columns for HL median and OC median specifically (not just vol) to calibrate.
- The legacy shadow column in the compare table (labelled "Old") will show the pre-switch
  GARCH/RS-EWMA output for direct before/after comparison.

---

## 2026-06-15 Evening — Intra-day corrections after first live comparison

### Context
First live forecast comparison for Tuesday June 16 session showed two problems:

| Instrument | Estimator | Ours    | Ref     | Δ         | Verdict           |
|------------|-----------|---------|---------|-----------|-------------------|
| GOLD       | HV20      | 29.34%  | 27.59%  | −6.0%     | ✓ Keep (acceptable) |
| NQ         | EWMA(0.90)| 33.54%  | 20.95%  | **−37.5%**| ✗ Way too reactive |
| EURUSD     | HV30      | 4.59%   | 5.53%   | **+20.5%**| ✗ Too slow         |

**NQ problem**: EWMA(λ=0.90) has a half-life of only 6.6 days. After a large NQ move,
it spikes dramatically with no floor to prevent explosion. Reference uses a smoother estimator.
Jun-15 morning it was Δ+3.7% (close to ref); one volatile trading session later it blew to Δ−37.5%.

**EURUSD problem**: HV30 includes 30 days of history, diluting recent elevated FX vol with
quieter days. Morning compare showed YZ at Δ+12% (still under, but far closer than HV30's 20.5%).

### Changes (2026-06-15 evening)

- `index`: EWMA(λ=0.90) → GARCH(1,1)  (reverted to original; GARCH mean-reverts and has ω floor)
- `fx`:    HV30 → YZ(window=30)         (YZ was Δ+12% morning; HV30 was Δ+20.5% same evening)
- `commodity`: HV20 unchanged            (Δ−6%, acceptable)

Updated: `js/volForecast.js`, `js/volBacktestEngine.js`, `js/weeklyVolBacktestEngine.js`, `js/volBacktestM1Engine.js`

### Current state (after evening corrections)

| Asset class | Primary estimator | Notes |
|-------------|------------------|-------|
| commodity   | HV20 (20-day rolling std) | Δ−6% vs ref; best on morning compare |
| index       | GARCH(1,1) α=0.06 β=0.91 | Reverted; stable under vol spikes |
| fx          | Yang-Zhang (window=30) | Best available Δ+12%; OC/HL uses OHLC |

---

## 2026-06-15 Late — Calibrate ASSET_PARAMS against reference chart comparison

### Context
User overlaid our levels vs reference (C.OG) on chart. Visual gap identified especially on OC:
the reference system consistently shows wider OC (body move) bands and tighter HL bands for GOLD.
Root cause: our BM/half-normal constants (1.572/0.6745) don't match reference's distributional model.

### Evidence (GOLD, HV20 vol = 29.34%, σ_d = 1.848%):
| Metric   | Ours  | Ref   | Gap       | Derived corr |
|----------|-------|-------|-----------|--------------|
| HL med   | 2.90% | 2.71% | −6.6% over| 0.934        |
| HL 75p   | 3.79% | 3.33% | −12% over | 0.879        |
| OC med   | 1.25% | 1.36% | +8.8% under| 1.088       |
| OC 75p   | 2.13% | 2.20% | +3.3% under| 1.035       |

Reference HL P75/P50 = 3.33/2.71 = 1.229 vs our BM 2.049/1.572 = 1.304 → ref uses tighter tail.
Reference OC_med = 0.783×σ_d vs our HN_P50 = 0.6745×σ_d → ref OC ~16% wider constant.

### Corrections applied (2026-06-15 late):
```javascript
commodity: { hl_50_corr: 0.93, hl_75_corr: 0.88, oc_50_corr: 1.09, oc_75_corr: 1.03 }
fx:        { oc_50_corr: 1.06 }  // small OC boost; HL held at 1.0 pending YZ compare data
index:     // all 1.0 — hold until clean GARCH vs reference compare available
```

### Next calibration checkpoints:
- After Wed Jun-18 compare: adjust FX HL corrections based on YZ vs reference
- After Thu Jun-19 compare: verify index GARCH corrections needed
- Recalibrate commodity OC after 5 trading days (single-day calibration may drift)

---

## 2026-06-17 — Index (GARCH) first compare since revert; FX refinement

### Context
Wednesday Jun-17 session compare — first clean reference data for index since GARCH
was reverted in on 2026-06-15 evening. Commodity (HV20) and FX (YZ) also re-checked.

| Instrument | Estimator | Vol Δ   | HL med Δ | HL 75p Δ | OC med Δ | OC 75p Δ | Verdict |
|------------|-----------|---------|----------|----------|----------|----------|---------|
| GOLD       | HV20      | +6.3%   | −2.6%    | −0.9%    | +2.3%    | −0.5%    | ✓ Excellent — no change |
| EURUSD     | YZ        | −4.9%   | −3.7%    | +1.5%    | −4.0%    | −7.3%    | ✓ Close — small refinement |
| NQ         | GARCH     | +22.3%  | −23.5%   | −28.9%   | −17.7%   | −11.6%   | ✗ Significantly over — recalibrate |

(Δ = (ours − ref) / ref. Positive = we overestimate.)

**Index/NQ problem**: GARCH(1,1) α=0.06 β=0.91 has persistence α+β=0.97, giving a
~23-day half-life. After a vol shock, the forecast stays elevated long after
reference has cooled off. This is the same symptom (overestimate) seen with
EWMA(0.90) on Jun-15, but a different mechanism — EWMA over-reacts instantly to
a single shock, GARCH stays sticky for weeks afterward. Both need correction;
GARCH was kept as primary (mean-reversion + ω floor are still safer properties
than EWMA's unbounded reactivity) but now needs empirical correction factors.

**Caveat**: index corrections below are derived from NQ only. SPX500, DE30,
UK100, US30, US2000 share the same `index` ASSET_PARAMS entry but have no
reference data yet — monitor once available; may need to split into
per-instrument corrections if they diverge from NQ's behavior.

### Corrections applied (2026-06-17), `js/volForecast.js`:
```javascript
commodity: { hl_50_corr: 0.93, hl_75_corr: 0.88, oc_50_corr: 1.09, oc_75_corr: 1.03 }  // unchanged
index:     { hl_50_corr: 0.81, hl_75_corr: 0.78, oc_50_corr: 0.85, oc_75_corr: 0.90 }  // was all 1.0
fx:        { hl_50_corr: 1.04, hl_75_corr: 0.99, oc_50_corr: 1.10, oc_75_corr: 1.08 }  // was 1.0/1.0/1.06/1.0
```

### Note
`js/volBacktestEngine.js`, `js/weeklyVolBacktestEngine.js`, `js/volBacktestM1Engine.js`
still carry their own older ASSET_PARAMS (calibrated for EWMA(0.94)/RS, e.g.
commodity hl_75_corr=0.940) — these are backtest-internal calibrations from a
different exercise (historical fit, not live reference compare) and were
intentionally NOT touched here. Recalibrating those requires re-running the
backtests with current primaries, tracked as a separate pending task.

### Next calibration checkpoints:
- Index: get SPX500/DE30/UK100/US30/US2000 reference data — confirm NQ-derived
  corrections generalize across the index class, or split per-instrument
- FX: one more session of compare data to confirm Jun-17 refinement holds
- Commodity: holding — Jun-17 compare confirms existing factors are accurate

---

## 2026-06-18 — Index whiplash + missed Fed Chair speech event; news multiplier fix

### Context
Thursday Jun-18 compare showed the Jun-17 NQ-derived `index` corrections had already
flipped sign one day later (Jun-17: we overestimated by ~22%; Jun-18: gap reversed
to underestimate). Decomposed the gap using `vol_annual` (uncorrected) vs the
back-calculated pre-correction HL/OC values: the gap pattern was NOT consistent
with the BM/HN distributional constants being wrong — it matched a forward-looking
event the estimator had no way to see coming. Asked the user whether Jun-18 had a
known high-impact US event; confirmed: **a new Fed Chair gave a speech and price
"went crazy"** across GOLD, NQ, and EURUSD alike.

### Root cause (two separate bugs)
1. `NEWS_PATTERNS` only matched scheduled data releases (FOMC rate decision, NFP,
   CPI, PCE, GDP, PPI) — no pattern matched a Fed Chair speech/testimony/press
   conference calendar entry, so `detectNewsMultiplier()` returned 1.0 even if
   Finnhub's calendar carried the event.
2. `computeForecast()` / `computeForecastFromRV()` unconditionally excluded
   `commodity` from any news multiplier (`assetClass !== 'commodity'`), on the
   assumption gold isn't event-driven. Jun-18 contradicts this — GOLD reacted as
   strongly as fx/index to the speech.

### Important caveat on the Jun-17 index correction factors
The Jun-17 NQ corrections (`hl_50_corr: 0.81` etc.) were calibrated from a single
day where GARCH's persistence (α+β=0.97) kept vol elevated after a fading shock.
One day later that transient had faded and the same factors caused an
underestimate. This is a single-day-calibration whiplash, not evidence the Jun-17
factors are wrong in general — but it's a reminder that ASSET_PARAMS corrections
should eventually be derived from multi-day averages, not single-session
snapshots. Left unchanged for now; flagged for a future multi-day recalibration
pass once several more index compare sessions are available.

### Changes applied (2026-06-18), `js/volForecast.js`:
- Added `Fed Chair Speech` pattern to `NEWS_PATTERNS` (mult 1.18, between NFP 1.16
  and FOMC Rate 1.21 — placeholder until a clean single-event compare is available):
  ```javascript
  { re: /fed\s*chair|fomc\s*press\s*conference|monetary\s*policy\s*testimony|humphrey.?hawkins/i,
    mult: 1.18, label: 'Fed Chair Speech' },
  ```
- Removed the `assetClass !== 'commodity'` exclusion from `sigmaFwd` in both
  `computeForecast()` and `computeForecastFromRV()` — news multiplier now applies
  to commodity (GOLD) as well as fx/index.
- Fixed a stale JSDoc on `computeForecast()` that claimed `newsMult` was
  "informational only, not applied to ranges" — it is applied (via `sigmaFwd`,
  before BM/HN range calculation); the comment was simply wrong.

### Open item — UPDATE after manual refresh test
User ran `POST /api/vol-forecast/refresh` on the live Railway deployment after both
this fix and the news-visibility export fix (2026-06-18 PR) were merged. The fresh
output still showed **no `News: ...` line** — GOLD/EURUSD were bit-identical to the
pre-fix run, NQ/UK100/SPX shifted only by normal bar-data drift. This confirms
`detectNewsMultiplier()` returned `mult: 1.0` even on a live recompute with the new
Fed Chair Speech pattern deployed. Two possible causes, not yet disambiguated:
1. `FINNHUB_KEY` isn't set in Railway — check the startup log line added alongside
   `OANDA_KEY`/`FRED_KEY` (2026-06-18 PR) to confirm.
2. The speech was never on Finnhub's *scheduled* economic calendar in the first
   place (a surprise/off-calendar appearance) — in which case no regex fix can help,
   since `detectNewsMultiplier()` only ever sees what Finnhub's calendar lists in
   advance. This would be a structural limitation of calendar-based forward
   detection, not a pattern-matching bug — catching unscheduled events would need a
   same-session reactive mechanism (e.g. mid-day re-forecast triggered by realized
   vol/range already exceeding forecast), not a forward-looking multiplier.

### Next calibration checkpoints:
- Confirm the Fed Chair Speech multiplier (1.18) against a clean single-event
  reference compare once one becomes available; adjust mult if Jun-18-scale moves
  recur and 1.18 proves too low or too high.
- Re-evaluate Jun-17 index corrections after several more non-event-day sessions
  to rule out the whiplash being structural rather than event-driven.
- Verify FINNHUB_KEY / calendar wiring in production so news detection is
  confirmed live, not just unit-tested.

## 2026-06-19 — Index GARCH persistence confirmed structural; interim β fix

Jun-19 NQ compare (Δ+33.7%, worse than Jun-17's Δ+22.3%) confirmed the index
whiplash wasn't event noise: GARCH(α=0.06, β=0.91, α+β=0.97) has a ~23-day
variance half-life, while the reference's NQ vol appears to nearly fully
mean-revert within a single session after a shock. Static ASSET_PARAMS hl/oc
correction factors can't fix a decay-speed mismatch (they only correct
distribution shape) — confirmed by the Jun-17→18 whiplash when corrections
fit from one persistence-distorted day flipped sign by the next.

**Change** (`js/volForecast.js`): `garch11VolSeries()` now accepts optional
alpha/beta overrides. Index's primary estimator uses
`ASSET_PARAMS.index.{garch_beta_interim: 0.87, garch_omega_interim: 1.11e-5}`
(half-life 23d → 9.5d, same ~20% long-run anchor); the legacy shadow column
keeps the original `garch_omega` + global α=0.06/β=0.91 so before/after stays
comparable. Explicitly labeled provisional — not a refit, a reasoned interim
step pending a proper grid search once more reference data accumulates.

Full plan, data table, and open items now tracked live in
`MD files/VOL_CALIBRATION_TRACKER.md` — update that file each session instead
of waiting for a retrospective entry here.
