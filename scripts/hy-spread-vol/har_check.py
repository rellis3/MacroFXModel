"""POST-HOC robustness (describe/demote only): replace the 20-day persistence baseline with a HAR baseline
(ln|r_t|, ln mean|r| over 5 days, ln mean|r| over 22 days; OLS per instrument) and re-score the tercile difference."""
import json, math, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as R

def har_resid(names, start, end):
    out = {}
    for n in names:
        a = np.log(R.px(n)).diff().abs().replace(0, np.nan)
        fwd = np.log(a[::-1].rolling(5).mean()[::-1].shift(-1))
        X = pd.DataFrame({'d': np.log(a.rolling(1).mean()), 'w': np.log(a.rolling(5).mean()), 'm': np.log(a.rolling(22).mean())})
        m = (a.index >= start) & (a.index <= end)
        ok = m & np.isfinite(fwd) & np.isfinite(X).all(axis=1)
        A = np.column_stack([np.ones(ok.sum()), X[ok].values]); beta = np.linalg.lstsq(A, fwd[ok].values, rcond=None)[0]
        pred = beta[0] + X.values @ beta[1:]
        out[n] = (fwd - pred)[m]
    return pd.DataFrame(out).mean(axis=1)

H = R.signal('HYG', 'IEF'); res = {}
for cell, names in R.CELLS.items():
    E = har_resid(names, R.START, R.END)
    est, j, lo, hi = R.tdiff(E, H.reindex(E.index, method='ffill', limit=3))
    E2 = har_resid(names, pd.Timestamp('2020-08-01'), R.LATE_END)
    est2 = R.tdiff(E2, H.reindex(E2.index, method='ffill', limit=3))[0]
    # also: does H add beyond the last 5 days' equity return? (descriptive) -- partial on SPX 5d return
    res[cell] = dict(har_diff_pct=100 * (math.exp(est) - 1), har_2020_2026_pct=100 * (math.exp(est2) - 1), r=float(np.corrcoef(j.s, j.e)[0, 1]))
json.dump(res, open(os.path.join(R.OUT, 'har_check.json'), 'w'), indent=2)
print(res)

# --- leverage-effect check: does H add anything beyond the S&P 500's own 20-day return? (partial correlation)
spx = np.log(R.px('spx500')); s20 = (spx - spx.shift(20)) * 100
part = {}
for cell, names in R.CELLS.items():
    for label, (a, b) in {'2007_2020': (R.START, R.END), '2020_2026': (pd.Timestamp('2020-08-01'), R.LATE_END)}.items():
        E = har_resid(names, a, b)
        j = pd.concat({'e': E, 'h': H.reindex(E.index, method='ffill', limit=3), 's': s20.reindex(E.index)}, axis=1).dropna()
        def res_on(y, x):
            bb = np.polyfit(x, y, 1); return y - np.polyval(bb, x)
        pr = float(np.corrcoef(res_on(j.h, j.s), res_on(j.e, j.s))[0, 1])
        part[f'{cell}_{label}'] = dict(raw_r=float(np.corrcoef(j.h, j.e)[0, 1]), spx20_r=float(np.corrcoef(j.s, j.e)[0, 1]), h_partial_r=pr, corr_h_spx20=float(np.corrcoef(j.h, j.s)[0, 1]))
json.dump({'har': res, 'leverage_effect_partial': part}, open(os.path.join(R.OUT, 'har_check.json'), 'w'), indent=2)
for k, v in part.items(): print(k, {a: round(b, 3) for a, b in v.items()})
