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
