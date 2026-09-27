# Pre-registration — Gold IV ladder from CBOE GVZ vs the production realized ladder

Written 2026-09-27 before `forge/run_vol_gvz.py` exists. Frozen. Same question and protocol
as forge/IV_LADDER_PREREG.md (which added the 5 USD majors), for the one instrument that file
could not test: no gold history exists in `OI Data/`.

## σ source

CBOE GVZ — 30-day implied vol of GLD (gold ETF) options, VIX methodology, free daily file
(`cdn.cboe.com/api/global/us_indices/daily_prices/GVZ_History.csv`, 2 columns DATE,GVZ, so no
open/close ambiguity), the same feed server.js already pulls. GVZ is a variance-swap-style
number on the ETF, so its LEVEL differs from CME ATM IV — irrelevant here, because the ladder's
widths are fit on GVZ itself, and the live export must then use GVZ too (NOT the QuikStrike
gold curve, whose scale the widths were not fit on).

`sigma_gvz[t]` = GVZ close of the latest CBOE date STRICTLY before the london22 session t's
start. GVZ settles ~16:15 ET (≈21:15 UTC), before the 00:00 London open that follows.

## Protocol (identical to IV_LADDER_PREREG)

`load_daily("gold", ..., session="london22")`, ForexFactory event tags for gold's currencies,
`build_forecast_frame`, rows restricted to where both σ exist. Same 6 expanding walk-forward
folds for both ladders: realized = `design_vol(train)` (its own estimator/width selection);
GVZ = `design_vol(train, estimators=("gvz",))`. Event multipliers fit on train.

## Pass rule

- **PRIMARY:** n-weighted OOS combined H-L pinball lower for GVZ than realized, AND GVZ lower
  in ≥ 4 of the 6 folds (one instrument, so the fold count stands in for the 5-of-7 rule).
- **CALIBRATION GUARD:** GVZ's mean |exceed − target| over the 12 daily rungs no more than 1pp
  worse than realized's.
- Weekly/monthly: reported only; daily-only shipping as for the majors.

If PASS: gold joins the "⬇ Forecast (IV)" export with σ = live GVZ, a staleness fallback to
the standard block, and the same Pine-safe footer. If FAIL: gold stays on the realized ladder.

---

## RESULTS (run 2026-09-27) — PASS

`forge/out_vol_iv/gvz_compare.json`. 6 folds, 2016-08-21 → 2026-08-20, 2,581 sessions. The
realized ladder selected `har_rv_log` in all 6 folds.

- **PRIMARY:** pooled H-L pinball realized 0.2146 vs GVZ 0.2090 (**2.6% better**); GVZ lower in
  **5 of 6** folds (fold 4 lost by 0.6%). PASS.
- **CALIBRATION GUARD:** mean |exceed − target| realized 2.4pp vs GVZ 3.3pp — within the +1pp
  limit (by 0.1pp). PASS.
- Weekly/monthly: badly calibrated (weekly HL p50/p75/p90 exceeded 0.67/0.35/0.20, monthly
  0.68/0.45/0.26 vs 0.50/0.25/0.10) — not shipped, as for the majors.

**Shipped:** GOLD added to `js/forecastLadderParamsIV.js` (estimator `gvz`; the 7 existing
instruments byte-identical) and to the "⬇ Forecast (IV)" export via live GVZ
(`_ivGvzLatest` in server.js, 6h cache; `GVZ_MAX_AGE_D` = 4 staleness fallback). Live check
2026-09-27: GVZ 22.44 (close 2026-09-25) → median H-L 1.53% vs the realized ladder's 1.72%.
