"""vix-nasdaq-beta: POST-HOC robustness of the passing cell (B_change lo -> ret5). Demote-only (Amendment A1)."""
import os, sys, json
import numpy as np, pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'vvix-nasdaq-ratio'))
import model as M

OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-nasdaq-beta')
P = pd.read_parquet(os.path.join(OUT, 'panel.parquet'))
lnN, lnV = np.log(P['NDX']), np.log(P['VIX'])
y = (lnN.shift(-6) - lnN.shift(-1)); sd = float(y.std()); y = (y / y.std()).to_numpy()
P['x_ret5'] = lnN.diff(5); P['x_ret1'] = lnN.diff(1); P['x_dvix5'] = lnV.diff(5); P['x_dvix20'] = lnV.diff(20); P['x_rb'] = P['R_b_pct']
BASE = list(M.CONTROLS); out = {}
for lab, extra in (('as registered', []), ('+ Nasdaq 5d and 1d return (short-term reversal)', ['x_ret5', 'x_ret1']),
                   ('+ VIX 5d and 20d change', ['x_dvix5', 'x_dvix20']), ('all of the above + R_b percentile', ['x_ret5', 'x_ret1', 'x_dvix5', 'x_dvix20', 'x_rb'])):
    M.CONTROLS = BASE + extra; b, t, n = M.fit(P, y, 'B_change', 'lo', 5); out[lab] = dict(beta=b, t=t, pct_5d=b * sd * 100)
    print(f'{lab:55s} beta {b:+.3f} SD (~{b * sd * 100:+.2f}%)  t {t:+.2f}')
M.CONTROLS = BASE + ['x_ret5', 'x_ret1', 'x_dvix5', 'x_dvix20']
loyo = {yr: M.fit(P, y, 'B_change', 'lo', 5, mask=np.asarray(P.index.year != yr))[1] for yr in range(2010, 2027)}
print('leave-one-year-out t (full controls):', round(min(loyo.values()), 2), '..', round(max(loyo.values()), 2), '| weakest when dropping', min(loyo, key=lambda z: abs(loyo[z])))
# drop the 10 largest |5d returns| among flagged days
f = P['B_change_lo'].fillna(0).to_numpy() == 1; yy = y.copy(); big = np.argsort(-np.abs(np.where(f & np.isfinite(yy), yy, 0)))[:10]
mask = np.ones(len(P), bool); mask[big] = False
b10 = M.fit(P, y, 'B_change', 'lo', 5, mask=mask); print('drop the 10 biggest flagged moves:', round(b10[0], 3), 't', round(b10[1], 2))
M.CONTROLS = BASE
out['leave_one_year_out_t'] = {str(k): v for k, v in loyo.items()}; out['drop10'] = dict(beta=b10[0], t=b10[1])
# hit rate of the raw flagged days (descriptive)
raw = (lnN.shift(-6) - lnN.shift(-1)).to_numpy(); m = f & np.isfinite(raw)
out['flag_days'] = dict(n=int(m.sum()), mean_pct=float(np.mean(raw[m]) * 100), up_share=float(np.mean(raw[m] > 0)), all_days_mean_pct=float(np.nanmean(raw) * 100), all_days_up=float(np.nanmean(raw > 0)))
print('flagged days: n', out['flag_days']['n'], 'mean 5d %.2f%% up %.0f%% | all days %.2f%% up %.0f%%' % (out['flag_days']['mean_pct'], 100 * out['flag_days']['up_share'], out['flag_days']['all_days_mean_pct'], 100 * out['flag_days']['all_days_up']))
json.dump(out, open(os.path.join(OUT, 'robustness.json'), 'w'), indent=1, default=float)
