# DailyOpenResearch

Analysis suite for the retail "daily open" playbook (23:00 UK broker open) on gold, Nasdaq and EURUSD, built on the 1-minute parquet files in `VolRangeForecaster/data/m1/`.

Read `FINDINGS.md` first. Per-instrument reports are in `out/<pair>/REPORT.md`, the raw numbers in `out/<pair>/results.json`, and the cross-instrument table in `out/SUMMARY.md`.

```
pip3 install pandas pyarrow scipy numpy
python3 scripts/r2_download.py nq          # gold and eurusd are already local
python3 -m DailyOpenResearch.run --pairs gold,nq,eurusd
python3 -m DailyOpenResearch.summary
```

Studies (each a function in its own module, all taking a `Days` object built with a chosen anchor):

| module | question |
|---|---|
| `studies_profile.py` | where is the volatility; which anchor matters; do extremes form early (with shuffled-returns null) |
| `studies_orb.py` | opening-range breakout: follow-through, false breaks, race vs random-walk null, trade sims, conditioning |
| `studies_open.py` | the open as a level, first-move vs rest of day, open holds, Judas swing, trend-day checkpoints, gaps |
| `studies_fib.py` | causal impulse-leg detection, pullback depth vs continuation with random-walk null, extensions, limit-entry sims |
| `studies_vwap.py` | session VWAP bands: reversion vs baseline, push-away, bounce race, fade sims |
| `studies_session.py` | Asia range into London/NY (breakout and sweep-fade sims); PDH/PDL/PDC/PWH/PWL touch and reaction |
| `studies_mtf.py` | first candle of the day on 5m/15m/30m/1h/4h |
| `studies_retest.py` | swing high/low retest later in the day: reject vs break, with sims (distinct from the fib study's immediate pullback) |
| `news.py` | Major-impact event dates from `calendar_events.csv` for conditioning |

Conventions: distances in ADR (trailing 20-day median daily range, strictly prior); R net of an assumed round-trip cost with gross alongside; Wilson 95% CIs; 60/40 IS/OOS by date; minimum 30 per reported cell.
