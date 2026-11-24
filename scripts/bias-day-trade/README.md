# bias-day-trade

Prereg: `forge/BIAS_DAY_TRADE_PREREG.md` (seed 20261124).

1. Rebuild the V1 replay with the issue at 00:00 London (the banked pipeline, unchanged except the issue time):

```bash
export BEB_DATA_ROOT=<main checkout> BEB_ISSUE_HHMM=0000 XLSX_FROM=<main checkout>/package.json
python -X utf8 -I scripts/bias-engine-backtest/bars.py
python -X utf8 -I scripts/bias-engine-backtest/build_inputs.py
node scripts/bias-engine-backtest/fetch_y2.mjs && node scripts/bias-engine-backtest/fetch_y2.mjs --extras
node scripts/bias-engine-backtest/run_engine.mjs --selftest && node scripts/bias-engine-backtest/run_engine.mjs
```

`BEB_ISSUE_HHMM` defaults to 0700 (the banked `bias-engine-backtest` issue time), so the banked study is unchanged.

2. Score: `python -X utf8 -I scripts/bias-day-trade/score.py` → `analysis/output/bias-day-trade/`.
