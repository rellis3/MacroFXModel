"""vix-calculus: POST-HOC robustness of the passing cells (demote-only; prereg Amendment A3). C2 dRimp hi -> ret20, E R_a/R_b hi -> VX futures 20-session."""
import os, sys, json
import numpy as np, pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'vvix-nasdaq-ratio'))
import model as M
OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus'); BASE = list(M.CONTROLS); out = {}
P = pd.read_parquet(os.path.join(OUT, 'panel_daily.parquet')); lnN, lnV = np.log(P['NDX']), np.log(P['VIX'])
P['x_ret5'] = lnN.diff(5); P['x_ret20b'] = lnN.diff(10); P['x_dvix5'] = lnV.diff(5); P['x_dvix20'] = lnV.diff(20); P['x_rc'] = P['R_c_pct']; P['x_dvvix5'] = np.log(P['VVIX']).diff(5); P['x_dvxn5'] = np.log(P['VXN']).diff(5)
y = lnN.shift(-21) - lnN.shift(-1); sd = float(y.std()); y = (y / sd).to_numpy()
C2 = BASE + ['R_c_hi', 'R_c_lo']; res = {}
for lab, extra in (('as registered', []), ('+ Nasdaq 5d and 10d return (20d is already a control)', ['x_ret5', 'x_ret20b']), ('+ VIX 5d and 20d change', ['x_dvix5', 'x_dvix20']),
                   ("+ C.OG's dR/dt flags (vix-beta-change)", ['B_change_hi', 'B_change_lo']), ('+ banked VIX ratio flags (vvix-ratio-range)', ['R_b_hi', 'R_b_lo', 'R_a_hi', 'R_a_lo']),
                   ('+ implied-ratio percentile (continuous)', ['x_rc']), ('all of the above', ['x_ret5', 'x_ret20b', 'x_dvix5', 'x_dvix20', 'B_change_hi', 'B_change_lo', 'R_b_hi', 'R_b_lo', 'R_a_hi', 'R_a_lo', 'x_rc'])):
    M.CONTROLS = C2 + extra; b, t, n = M.fit(P, y, 'dRimp', 'hi', 20); res[lab] = dict(beta=b, t=t, pct=b * sd * 100); print(f'C2 {lab:50s} {b:+.3f} SD ({b * sd * 100:+.2f}%) t {t:+.2f}')
M.CONTROLS = C2 + ['x_ret5', 'x_ret20b', 'x_dvix5', 'x_dvix20']
loyo = {yr: M.fit(P, y, 'dRimp', 'hi', 20, mask=np.asarray(P.index.year != yr))[1] for yr in range(2010, 2027)}
f = P['dRimp_hi'].fillna(0).to_numpy() == 1; big = np.argsort(-np.abs(np.where(f & np.isfinite(y), y, 0)))[:10]; mask = np.ones(len(P), bool); mask[big] = False
d10 = M.fit(P, y, 'dRimp', 'hi', 20, mask=mask)
# which leg drives it: VVIX rising or VXN falling?
leg = {}
for lab, extra in (('VVIX 5d change only', ['x_dvvix5']), ('VXN 5d change only', ['x_dvxn5'])):
    M.CONTROLS = C2 + extra; leg[lab] = M.fit(P, y, 'dRimp', 'hi', 20)[:2]
M.CONTROLS = BASE
ov = float(((P['dRimp_hi'] == 1) & (P['B_change_lo'] == 1)).sum() / max(1, (P['dRimp_hi'] == 1).sum()))
raw = (lnN.shift(-21) - lnN.shift(-1)).to_numpy(); m = f & np.isfinite(raw)
out['C2'] = dict(checks=res, leave_one_year_out_t=dict(min=min(loyo.values()), max=max(loyo.values()), weakest=int(min(loyo, key=lambda z: abs(loyo[z])))), drop10=dict(beta=d10[0], t=d10[1]),
                 leg_controls={k: dict(beta=v[0], t=v[1]) for k, v in leg.items()}, overlap_with_dRdt_bottom=ov,
                 flag_days=dict(n=int(m.sum()), mean_pct=float(np.mean(raw[m]) * 100), up_share=float(np.mean(raw[m] > 0)), all_mean_pct=float(np.nanmean(raw) * 100), all_up=float(np.nanmean(raw > 0))))
print('C2 LOYO', out['C2']['leave_one_year_out_t'], 'drop10', d10[:2], 'legs', leg, 'overlap with dR/dt bottom', round(ov, 3))
# E: leave-one-year-out and drop the 2 worst VX episodes (Feb 2018, Mar 2020)
sys.argv = ['vx.py', 'none']
E = pd.read_parquet(os.path.join(OUT, 'panel_daily.parquet'))
import importlib.util
spec = importlib.util.spec_from_file_location('vx', os.path.join(os.path.dirname(__file__), 'vx.py'))
src = open(spec.origin, encoding='utf-8').read().split('# ── the run ──')[0].replace("if sys.argv[1:] == ['power']:", 'if False:')
ns = {'__file__': spec.origin}; exec(compile(src, spec.origin, 'exec'), ns); PE = ns['P']
yF = (PE['vx20'] / np.nanstd(PE['vx20'])).to_numpy(); out['E'] = {}
for k in ('R_a', 'R_b'):
    lo = {yr: M.fit(PE, yF, k, 'hi', 20, mask=np.asarray(PE.index.year != yr))[1] for yr in range(2013, 2027)}
    crash = ~(((PE.index >= '2018-01-15') & (PE.index <= '2018-03-15')) | ((PE.index >= '2020-02-10') & (PE.index <= '2020-04-30')))
    M.CONTROLS = BASE + ['x_dvix20'] if False else BASE
    PE['x_dvix20'] = np.log(PE['VIX']).diff(20); M.CONTROLS = BASE + ['x_dvix20']; dv = M.fit(PE, yF, k, 'hi', 20); M.CONTROLS = BASE
    out['E'][k] = dict(leave_one_year_out_t=dict(min=min(lo.values()), max=max(lo.values()), weakest=int(min(lo, key=lambda z: abs(lo[z])))),
                       without_2018_2020_vol_shocks=dict(zip(('beta', 't', 'n'), M.fit(PE, yF, k, 'hi', 20, mask=np.asarray(crash)))), plus_vix_20d_change=dict(beta=dv[0], t=dv[1]))
    print('E', k, out['E'][k])
json.dump(out, open(os.path.join(OUT, 'robustness.json'), 'w'), indent=1, default=float)
