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

## Next (owner's call)

- Pre-register **G10 + carry guard** as a forward shadow at the OANDA 17:00 close (the clock the live record uses),
  next to `residual-fx8-forward`. That needs the 9-pair OANDA closes and nightly financing, so it runs where OANDA is
  reachable (Railway / the laptop recorder), not in this sandbox.
- Before that, get G10 OANDA 17:00 history (via `scripts/fetch_m1_oanda.py --price M --no-upload` on a machine with OANDA
  access) and rerun this script on it, to see whether the clock result in section 1 holds for G10 too.

Files: `fx8_h10/` and `g10/` (results.json, site.json, daily CSVs), `runs_summary.json`, `fred/` (inputs as fetched).
