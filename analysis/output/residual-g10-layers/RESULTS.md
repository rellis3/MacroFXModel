# residual-g10-layers — the paper layers on the full G10 (adds NOK and SEK)

**EXPLORATORY, not pre-registered.** Follow-up to `residual-fx8-paper-layers`. Rules fixed in the header of
`scripts/residual-g10-layers/g10.py` before any result was computed. Page: `residual-fx8-paper-layers.html?u=g10`
(Universe switch: FX8 OANDA / G10 Fed noon / FX8 Fed noon).

- **Data:** Federal Reserve H.10 noon New York rates from FRED for all 9 USD pairs (one source, one clock), days with all 9
  published, P&L 2016-06-24 → 2026-08-20 (lockbox untouched; 117 weekdays dropped for US holidays or missing prints).
  OANDA (the FX8 study's source) returns 403 from the sandbox, so G10 could not be built at the 17:00 close.
- NOK/SEK rates: OECD 3m interbank (FRED), month M used from M+2. NOK/SEK cost 0.035% round trip, fixed before results.
- Model, layers, seed (20261123), bootstrap and the better/worse bar are unchanged from the FX8 study. K = 2 again by the
  frozen noise-band rule.

## 1. Source check: the same FX8 model on Fed noon prices

| | Net Sharpe 1st half | 2nd half | All |
|---|---|---|---|
| FX8, OANDA 17:00 NY (main study) | 0.43 | 0.38 | 0.43 |
| FX8, Fed H.10 noon NY | 0.45 | **0.09** | 0.27 |

Daily P&L correlation between the two: 0.69. Moving the close five hours and changing the source leaves the first
half alone but takes most of the second half away. **The FX8 edge is fragile to the data clock.** That does not touch the
forward record (it uses OANDA 17:00, the same clock as its backtest) but it is a warning about how thin the edge is.

## 2. G10 vs FX8 on the same Fed data

| Variant | Trades | Net IS | Net OOS | +carry IS | +carry OOS | Δ vs base (+carry), 90% CI | Call |
|---|---|---|---|---|---|---|---|
| **Base G10** | 322 | 0.40 | 0.30 | 0.41 | 0.33 | — | — |
| +V global FX vol | 270 | 0.53 | 0.14 | 0.54 | 0.15 | −0.04 [−0.27, +0.22] | no clear change |
| +M momentum guard | 254 | 0.30 | 0.14 | 0.31 | 0.18 | −0.12 [−0.36, +0.09] | no clear change |
| +VAL value guard | 227 | 0.32 | 0.05 | 0.34 | −0.02 | −0.21 [−0.49, +0.09] | no clear change |
| **+C carry guard** | 167 | 0.60 | 0.61 | **0.67** | **0.78** | **+0.36 [−0.08, +0.73]** | no clear change (up in both halves) |
| +AL Avellaneda-Lee | 531 | 0.77 | 0.24 | 0.77 | 0.26 | +0.16 [−0.13, +0.37] | no clear change |
| NN factor-neutral off | 322 | 0.04 | 0.34 | 0.07 | 0.35 | −0.16 [−0.36, +0.09] | no clear change |
| Stack V+M | 211 | 0.41 | −0.07 | 0.43 | −0.05 | −0.20 [−0.52, +0.16] | no clear change |
| Stack V+M+VAL | 135 | 0.43 | −0.36 | 0.45 | −0.45 | −0.38 [−0.77, +0.03] | no clear change |
| Stack V+M+VAL+C | 70 | 0.07 | 0.32 | 0.12 | 0.37 | −0.13 [−0.59, +0.38] | no clear change |

FX8 on the same Fed data: base +carry 0.44 / 0.13 (all 0.28). Full table in `fx8_h10/results.json`.

## What it says

1. **G10 is a bit better than FX8 on the same data** (+carry Sharpe 0.37 vs 0.28 overall, and steadier: 0.41 / 0.33
   vs 0.44 / 0.13). NOK added about +250 bp of leg P&L over ten years, SEK about −130 bp.
2. **The carry guard is the one layer that keeps showing up.** It is up in both halves in the FX8 OANDA run
   (+0.11 / +0.20) and the G10 run (+0.26 / +0.46); on FX8 Fed noon it is up in the first half only (+0.29 / −0.08).
   Its G10 interval (−0.08 to +0.73) still includes zero, so it does not pass the bar, and it is the best of 6 layers
   tried 3 times. It is a lead, not a result.
3. **Stacking the papers still makes the book worse**, and the vol, value and no-hedge layers still flip between halves.
4. **The momentum guard is no longer clearly harmful** on G10 (−0.12, interval spans 0); on FX8 OANDA it was.

## 3. G10 at the OANDA 17:00 close (run 2026-11-28)

Data: OANDA hourly mid candles served read-only by the live site (`/api/ohlc-range`, the server's own key), the close of
the 16:00 NY hour = the 17:00 NY price (`scripts/residual-g10-layers/fetch_via_site.py`). Check: identical to the FX8
OANDA panel (0.0 bp on every one of 2,757 days); `g10.py oanda` asserts FX8 reproduces 0.432 / 0.378 and it does
(`fx8_oanda/`). Same model, layers and bar as above.

| Variant | Trades | Net IS | Net OOS | +carry IS | +carry OOS | Δ vs base (+carry), 90% CI | Call |
|---|---|---|---|---|---|---|---|
| **Base G10 (OANDA 17:00)** | 328 | 0.15 | 0.15 | 0.15 | 0.17 | — | — |
| +V global FX vol | 274 | 0.28 | 0.52 | 0.29 | 0.54 | +0.26 [−0.04, +0.53] | no clear change |
| +M momentum guard | 255 | 0.24 | −0.14 | 0.23 | −0.12 | −0.10 [−0.33, +0.12] | no clear change |
| +VAL value guard | 228 | −0.02 | −0.15 | −0.02 | −0.21 | −0.27 [−0.51, −0.02] | **worse** |
| **+C carry guard** | 164 | 0.24 | 0.50 | **0.30** | **0.68** | **+0.34 [−0.05, +0.71]** | no clear change (up in both halves) |
| +AL Avellaneda-Lee | 530 | 0.01 | 0.27 | 0.01 | 0.28 | −0.03 [−0.31, +0.16] | no clear change |
| NN factor-neutral off | 328 | 0.01 | −0.02 | 0.01 | −0.00 | −0.15 [−0.38, +0.05] | no clear change |
| Stack V+M+VAL+C | 69 | 0.20 | 0.15 | 0.24 | 0.19 | +0.05 [−0.49, +0.57] | no clear change |

**At the clock the live record uses, G10 is worse than FX8:** base net 0.15 / 0.15 vs FX8 0.43 / 0.38. Gross Sharpe
0.33 vs 0.51, and spread cost 40 vs 23 bp a year (NOK/SEK). Adding two currencies changes the PCA factors and the
weights of every currency (GBP's leg P&L falls from +783 to +121 bp over ten years); NOK's own legs made +406 bp, SEK's
−62 bp. The Fed-noon result in §2 (G10 a little better) does not hold at 17:00, a second sign the edge depends on the clock.

**The carry guard is the one thing that keeps pointing the same way:** up in both halves on FX8 OANDA (+0.15), G10 Fed
noon (+0.36) and G10 OANDA (+0.34); first half only on FX8 Fed noon (+0.09). No single interval excludes zero, and it is
the best of 6 layers tried 4 times, so it is still a lead, not a result. **The pre-registrable candidate is FX8 + carry
guard at the OANDA 17:00 close** (the better universe at the live clock), as a forward shadow next to the frozen FX8
record, never a change to it.

## Next (owner's call)

- Pre-register **G10 + carry guard** as a forward shadow at the OANDA 17:00 close (the clock the live record uses),
  next to `residual-fx8-forward`. That needs the 9-pair OANDA closes and nightly financing, so it runs where OANDA is
  reachable (Railway / the laptop recorder), not in this sandbox.
- Before that, get G10 OANDA 17:00 history (via `scripts/fetch_m1_oanda.py --price M --no-upload` on a machine with OANDA
  access) and rerun this script on it, to see whether the clock result in section 1 holds for G10 too.

Files: `fx8_h10/`, `g10/`, `fx8_oanda/`, `g10_oanda/`, `oanda/daily_1700ny.csv` (results.json, site.json, daily CSVs), `runs_summary.json`, `fred/` (inputs as fetched).
