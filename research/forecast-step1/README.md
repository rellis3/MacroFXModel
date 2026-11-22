# Step 1: the best forecast of the session high, low and range

The first step of the forecast-first research order (owner, 2026-11-22). It starts from scratch: only raw 1-minute data, C.OG's forecast lessons and Jordan's guidance. No earlier analysis in this repo is used.

> Jordan: "The first part is finding a forecaster that predicts the correct high and low and also the HL range …
> Find the best HL, OH and OL forecast. Each could end up using a different model … I would try 2 approaches."
> On OC: "I would skip trying to find a forecast model to trade the OC levels", so OC is not part of step 1.

## Decisions

| | |
|---|---|
| Session | London date, **00:00 → 22:00 London**, weekdays (owner: "midnight") |
| Data | **Futures primary** (CME NQ, GC, 6E; NT8 1-minute, ratio-adjusted, end-stamped bars moved back one minute), **CFD alongside** (OANDA NAS100, XAU/USD, EUR/USD 1-minute) |
| Levels | HL = (H − L)/O, OH = (H − O)/O, OL = (O − L)/O, in % of the session open |
| Percentiles | p50, p75, p90 |
| Years | Discovery (where the choice is made) 2018–2022; validation (where it is judged) 2023 → 2026-08-21. Sessions after 2026-08-21 stay untouched as a holdout |

## Models raced

Every model gives a volatility number for the session using earlier sessions only:

- **Rolling estimators** over 10, 20 and 60 sessions:
  - close-to-close
  - Parkinson
  - Garman-Klass
  - Rogers-Satchell
  - Yang-Zhang
- **5-minute realised variance**, averaged over 5 and 20 sessions.
- **EWMA** (λ 0.94, 0.97) on close-to-close returns and on Parkinson variance.
- **GARCH(1,1)** and **GARCH-t**.
- **HAR**, on 5-minute realised variance and on Parkinson variance.
- **Benchmarks with no model:** the plain 20- and 60-session quantile of each level.

Each level at each percentile is a multiplier × the volatility number. The multiplier is the matching quantile of level ÷ volatility over all earlier sessions. Multipliers and model parameters (GARCH, HAR) are refitted every 1 January on earlier sessions only.

## Scores

| Score | Role |
|---|---|
| **Pinball loss** at p50, p75 and p90 | **Decides.** It scores each percentile line directly |
| **QLIKE** on the p50 line | Reported, as Jordan suggested. Uses level² vs forecast², the standard volatility loss |
| **Hit rates** | Is p50/p75/p90 exceeded 50/25/10% of days, overall and on quiet / normal / busy days? |
| **MZ R²** | How well the forecast ranks big and small days |

## The two approaches

- **A, one model for all levels:** the model with the lowest pinball across HL + OH + OL. Each level is scaled by the 60-session benchmark, so HL doesn't dominate.
- **B, a model per level:** the lowest pinball for HL, for OH and for OL separately.

Both are chosen on the discovery years and judged on the validation years. "B − A" is the change in loss, with a 90% block-bootstrap interval (63-session blocks).

## Run

```bash
python research/forecast-step1/test_pipeline.py                     # synthetic checks: no look-ahead, calibration, planted model found
python research/forecast-step1/pipeline.py run --all                # NQ, GOLD, EURUSD x futures and CFD
python research/forecast-step1/pipeline.py run --sym NQ --track F   # one at a time
```

Needs the 1-minute files on disk:
- futures: `analysis/output/nt8/continuous/{NQ,GC,6E}_1m_ratio.parquet`
- CFD: `portfolioBacktest/cache/{nq,gold,eurusd}_m1.parquet`

Outputs:
- `output/RESULTS.md`: a scoreboard per instrument, data source and level
- `output/<SYM>_<F|C>.json`: every number behind it
