#!/usr/bin/env python
"""Mechanics check for fx-factor-stack (run after run.py; reads the same inputs, recomputes the return legs a second way).

1. Month returns: Rm (sum of daily total returns, entry = close after the rebalance day) vs the raw pair-price change over the same
   window plus the carry accrual of that month. Sign inversion (USDJPY, USDCAD, USDCHF) and the entry-day alignment are what could be wrong.
2. Placebo is centred: mean placebo Sharpe is about minus the cost drag, not positive.
3. Rank-IC of carry recomputed with scipy.spearmanr month by month.
Output: analysis/output/fx-factor-stack/verify.json
"""
import os, sys, json
from pathlib import Path
import numpy as np, pandas as pd
from scipy.stats import spearmanr
import importlib.util

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('run', HERE / 'run.py'); run = importlib.util.module_from_spec(spec); spec.loader.exec_module(run)

I = run.build_inputs()
px = run.load_prices(); idx = px.index
reb = I['reb']
pos = {d: i for i, d in enumerate(idx)}
out = {}
# 1. raw legs
diffs = []
for m in range(len(reb) - 1):
    p0, p1 = pos[reb[m]] + 1, pos[reb[m + 1]] + 1
    for c, (pair, sgn) in run.PAIR.items():
        spot = sgn * np.log(px[c].iloc[p1] / px[c].iloc[p0])
        # pipeline month return for this ccy minus raw spot = accrual; must be small (|annual carry|/12 ~ <= 1%)
        diffs.append(I['Rm'][m, run.CCY.index(c)] - spot)
diffs = np.array(diffs)
out['month_return_minus_raw_spot'] = {'max_abs': float(np.abs(diffs).max()), 'mean': float(diffs.mean()), 'n': int(len(diffs))}
# 3. IC with scipy
ics = []
for m in range(len(reb)):
    s = np.where(np.isfinite(I['Sc']['carry'][m]), I['Sc']['carry'][m], 0.0)
    ics.append(spearmanr(s, I['Rm'][m])[0])
oos = (reb >= pd.Timestamp('2017-12-01')) & (reb <= pd.Timestamp('2026-07-15'))
out['carry_ic_oos_scipy'] = float(np.nanmean(np.array(ics)[oos]))
res = json.load(open(run.OUT / 'results.json'))
out['carry_ic_oos_run'] = res['arms']['carry']['ic_oos']
out['placebo_means'] = {k: res['arms'][k].get('placebo_mean') for k in ('carry', 'momentum', 'value', 'surprise', 'stack')}
(run.OUT / 'verify.json').write_text(json.dumps(out, indent=1))
print(json.dumps(out, indent=1))
