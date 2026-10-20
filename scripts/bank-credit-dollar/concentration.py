"""Descriptive concentration checks for the nasdaq/dxy cells (POST-HOC, describe only; see prereg Amendments)."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as R
g = R.growth('USD', 'A')
out = {}
for cell, sym, cache in [('nasdaq', '%5EIXIC', 'yahoo_ixic_1mo.json'), ('dxy', 'DX-Y.NYB', 'yahoo_dxy_1mo.json')]:
    df = R.align(g, R.yahoo_quarterly(sym, cache), R.LAG)
    yr = df.index.year
    c = lambda m: dict(n=int(m.sum()), r=float(np.corrcoef(df.g[m], df.r[m])[0, 1]))
    allm = np.ones(len(df), bool)
    big = df.r.abs() >= df.r.abs().quantile(0.97)
    out[cell] = {
        'all': c(allm),
        'ex_1998_2002': c(~((yr >= 1998) & (yr <= 2002))),
        'ex_2007_2009': c(~((yr >= 2007) & (yr <= 2009))),
        'ex_both_crises': c(~(((yr >= 1998) & (yr <= 2002)) | ((yr >= 2007) & (yr <= 2009)))),
        'ex_top3pct_abs_returns': c(~big.values),
        'by_decade': {f'{d}s': c((yr >= d) & (yr < d + 10)) for d in (1980, 1990, 2000, 2010, 2020)},
        'last_10y': c(yr >= 2016),
        'top_tercile_g_mean_ret': float(df.r[df.g >= df.g.quantile(2/3)].mean()),
        'bottom_tercile_g_mean_ret': float(df.r[df.g <= df.g.quantile(1/3)].mean()),
        'mid_tercile_g_mean_ret': float(df.r[(df.g > df.g.quantile(1/3)) & (df.g < df.g.quantile(2/3))].mean()),
        'g_terciles': [float(df.g.quantile(1/3)), float(df.g.quantile(2/3))],
        'latest_g': {str(k): float(v) for k, v in g.tail(4).items()},
    }
json.dump(out, open(os.path.join(R.OUT, 'concentration.json'), 'w'), indent=2)
print(json.dumps(out, indent=1))
