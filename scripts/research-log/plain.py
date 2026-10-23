"""research-log: plain-units numbers for the Garin-style cards on research-log.html. Description only: every number re-expresses a banked
study's own data (up to the 2026-08-21 lockbox) as "after the signal vs normal days, in %", plus how many calendar years went the same way.
Writes analysis/output/research-log/plain.json."""
import os, json
import numpy as np, pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'research-log'); os.makedirs(OUT, exist_ok=True)
VC = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus')
P = pd.read_parquet(os.path.join(VC, 'panel_daily.parquet'))
lnN, lnV = np.log(P['NDX']), np.log(P['VIX'])
fwd = lambda ln, h: (ln.shift(-(h + 1)) - ln.shift(-1)) * 100              # entry at the next close, as in every study


def after(flag, y, sign, label_flag, label_all):
    """Mean % after flagged days vs all days, share higher, and years where flagged beat all-days in the expected direction."""
    f = (flag == 1) & y.notna(); yrs = []
    for yr, g in y.groupby(y.index.year):
        ff = f[g.index]
        if ff.sum() >= 3: yrs.append(bool(np.sign(g[ff].mean() - g.mean()) == sign))
    return dict(flag=dict(label=label_flag, mean=round(float(y[f].mean()), 2), up=round(float((y[f] > 0).mean() * 100)), n=int(f.sum())),
                all=dict(label=label_all, mean=round(float(y.mean()), 2), up=round(float((y.dropna() > 0).mean() * 100))),
                years_same_way=int(sum(yrs)), years=len(yrs))


R = {}
ratio = ((P['R_a_hi'] == 1) | (P['R_b_hi'] == 1)).astype(float)
R['vvix-ratio-range'] = after(ratio, fwd(lnV, 20), -1, 'After fear ran ahead', 'All days')
R['vix-beta-change'] = after(P['B_change_lo'], fwd(lnN, 5), +1, "After C.OG's dR/dt bottom 10%", 'All days')
R['vix-second-derivative'] = after(P['dRimp_hi'], fwd(lnN, 20), +1, 'After VVIX/VXN jumped', 'All days')

# VX futures after the ratio flag (the contract a holder would actually hold; same construction as vix-calculus part E)
src = open(os.path.join(ROOT, 'scripts', 'vix-calculus', 'vx.py'), encoding='utf-8').read().split('# ── the run ──')[0].replace("if sys.argv[1:] == ['power']:", 'if False:')
ns = {'__file__': os.path.join(ROOT, 'scripts', 'vix-calculus', 'vx.py')}; exec(compile(src, ns['__file__'], 'exec'), ns); E = ns['P']
fE = ((E['R_a_hi'] == 1) | (E['R_b_hi'] == 1)).astype(float); vx = E['vx20'] * 100; sp = E['spot20'] * 100
both = vx.notna()
R['vix-ratio-vx-futures'] = dict(spot=after(fE[both], sp[both], -1, 'Spot VIX after the flag', 'Spot VIX, all days'), future=after(fE[both], vx[both], -1, 'VX future after the flag', 'VX future, all days'))

# short-VX rule: per-trade % and years with a positive total
T = pd.read_csv(os.path.join(ROOT, 'analysis', 'output', 'short-vx-rule', 'trades.csv')); S = json.load(open(os.path.join(ROOT, 'analysis', 'output', 'short-vx-rule', 'results.json')))
by = T.groupby(pd.to_datetime(T['date']).dt.year)['ret_pct'].sum()
R['short-vx-rule'] = dict(flag_ret=round(float(T['ret_pct'].mean()), 2), random_ret=round(float(S['a2_fixed_sampler']['random_mean_R'] * 25), 2), win=round(float((T['R'] > 0).mean() * 100)),
                          years_positive=int((by > 0).sum()), years=int(len(by)), worst_ret=round(float(T['ret_pct'].min()), 1), n=len(T))

# Brownian: % of the priced-in move that actually happened
A = json.load(open(os.path.join(VC, 'results_A.json')))
R['vix-brownian-scaling'] = {n: {f'{h}d': round(A['kappa'][f'{n}|h{h}']['kappa'] * 100) for h in (1, 5, 20)} for n in ('NDX', 'VIX')}
R['vix-brownian-scaling']['jordan'] = {k: round(v, 2) for k, v in A['jordan']['by_rho_quintile'].items()}

# Garin's rule: Hard minus Barely (units of a normal rest-of-day move)
D = json.load(open(os.path.join(VC, 'results_D.json')))
g = {'ES-down': 0.120, 'ES-up': 0.098}; rep = D['reproduction_2016_2020']; oos = {c['cell']: c for c in D['cells']}
R['garin-vix-intraday-oos'] = {k: dict(garin=v, rebuild=round(rep[f"ES · {'Down' if k.endswith('down') else 'Up'} since 10:00"]['hard'] - rep[f"ES · {'Down' if k.endswith('down') else 'Up'} since 10:00"]['barely'], 3),
                                       oos=round(oos[k]['diff'], 3), years_positive=oos[k]['years_positive'], years=oos[k]['n_years']) for k, v in g.items()}

json.dump(R, open(os.path.join(OUT, 'plain.json'), 'w'), indent=1); print(json.dumps(R, indent=1))
