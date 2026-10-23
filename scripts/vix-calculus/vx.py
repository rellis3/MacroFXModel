"""vix-calculus part E (forge/VIX_CALCULUS_PREREG.md): does the validated VIX give-back (vvix-ratio-range, R_a/R_b top decile) show up on a TRADABLE
VX futures contract? Contract = nearest VX with >= 35 calendar days to expiry at the d+1 close, held 20 sessions, never rolled.
  python vx.py power   -> synthetic planted-signal power on the E sample (no real outcome read), writes power_E.json
  python vx.py run     -> the scored cells + spot comparison + descriptive net-of-cost rule, writes results_E.json"""
import os, sys, json
import numpy as np, pandas as pd
from statsmodels.stats.multitest import multipletests
from scipy.stats import norm
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'vvix-nasdaq-ratio'))
import model as M
OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus'); SEED = 20261023; rng = np.random.default_rng(SEED)
P = pd.read_parquet(os.path.join(OUT, 'panel_daily.parquet'))
V = pd.read_parquet(os.path.join(OUT, 'data', 'vx_settle.parquet'))
F = V.pivot_table(index='date', columns='expiry', values='settle')                  # date x contract settle
P = P[P.index >= F.index.min()].copy(); dates = P.index


def contract_outcome():
    out = np.full(len(P), np.nan); fprice = np.full(len(P), np.nan); dte = np.full(len(P), np.nan)
    for i in range(len(P) - 21):
        d1, d21 = dates[i + 1], dates[i + 21]
        if d1 not in F.index or d21 not in F.index: continue
        row = F.loc[d1].dropna(); ex = [e for e in row.index if (e - d1).days >= 35]
        if not ex: continue
        e = min(ex); a, b = row[e], F.at[d21, e] if e in F.columns else np.nan
        if np.isfinite(a) and np.isfinite(b) and a > 0 and b > 0: out[i] = np.log(b / a); fprice[i] = a; dte[i] = (e - d1).days
    return out, fprice, dte


yF, f1, dte = contract_outcome()
P['vx20'] = yF; P['vx_entry'] = f1; P['vx_dte'] = dte
lnV = np.log(P['VIX']); P['spot20'] = (lnV.shift(-21) - lnV.shift(-1))
P['split3'] = np.where(dates.year <= 2016, 'p1', np.where(dates.year <= 2020, 'p2', 'p3'))
cut = dates <= pd.Timestamp('2026-08-21'); P = P[cut]
CELLS = ['R_a', 'R_b']

if sys.argv[1:] == ['power']:
    ok = np.isfinite(P['vx20'].to_numpy()); res = {}
    for k in CELLS:
        for beta in (0.2, 0.3, 0.5, 0.7):
            hit = 0
            for _ in range(300):
                e = rng.standard_t(4, len(P) + 20) / np.sqrt(2)
                y = pd.Series(e).rolling(20).sum().shift(-19).to_numpy()[:len(P)]; y = np.where(ok, y, np.nan); y = y / np.nanstd(y)
                y = y - beta * np.nan_to_num(P[f'{k}_hi'].to_numpy())
                b, t, n = M.fit(P, y, k, 'hi', 20); hit += (t < -1.96 * 1.0) and (abs(t) > 2.24)    # Holm-2 worst case two-sided alpha 0.025 -> |t| 2.24
            res[f'{k}|beta{beta}'] = hit / 300; print(k, beta, res[f'{k}|beta{beta}'], flush=True)
    res['n_sessions_with_outcome'] = int(ok.sum()); json.dump(res, open(os.path.join(OUT, 'power_E.json'), 'w'), indent=1); sys.exit()

# ── the run ──
sdF = float(np.nanstd(P['vx20'])); sdS = float(np.nanstd(P['spot20']))
yF = (P['vx20'] / sdF).to_numpy(); yS = (P['spot20'] / sdS).to_numpy(); both = np.isfinite(yF)
yS_same = np.where(both, yS, np.nan)
rows = []
for k in CELLS:
    b, t, n = M.fit(P, yF, k, 'hi', 20)
    per = {s: M.fit(P, yF, k, 'hi', 20, mask=(P['split3'].to_numpy() == s))[0] for s in ('p1', 'p2', 'p3')}
    bs, ts, _ = M.fit(P, yS_same, k, 'hi', 20)
    pl = []
    for _ in range(200):
        sh = int(rng.integers(252, len(P) - 252)); Q = P.copy(); pc = pd.Series(np.roll(P[k].to_numpy(), sh), index=P.index).rolling(252, min_periods=200).rank(pct=True)
        Q[f'{k}_hi'] = (pc >= 0.9).astype(float).where(pc.notna()); Q[f'{k}_lo'] = (pc <= 0.1).astype(float).where(pc.notna()); pl.append(abs(M.fit(Q, yF, k, 'hi', 20)[1]))
    flag = (P[f'{k}_hi'] == 1).to_numpy() & both
    rows.append(dict(construction=k, beta_sd=b, t=t, n=n, n_flag=int(flag.sum()), pct_effect=b * sdF * 100, p=float(2 * norm.sf(abs(t))), ci_lo=b - 1.96 * abs(b / t), ci_hi=b + 1.96 * abs(b / t),
                     **{f'{s}_beta': per[s] for s in per}, placebo_t95=float(np.nanpercentile(pl, 95)),
                     spot_same_dates_beta_sd=bs, spot_same_dates_t=ts, spot_pct_effect=bs * sdS * 100,
                     raw_flag_mean_vx20_pct=float(np.nanmean(P['vx20'].to_numpy()[flag]) * 100), raw_all_mean_vx20_pct=float(np.nanmean(P['vx20']) * 100),
                     raw_flag_mean_spot20_pct=float(np.nanmean(P['spot20'].to_numpy()[flag]) * 100), raw_all_mean_spot20_pct=float(np.nanmean(P['spot20'].to_numpy()[both]) * 100)))
C = pd.DataFrame(rows); C['holm'] = multipletests(C['p'], 0.05, 'holm')[0]
C['same_sign_3'] = [c['beta_sd'] < 0 and all(c[f'{s}_beta'] < 0 for s in ('p1', 'p2', 'p3')) for _, c in C.iterrows()]   # registered: negative in all three periods
C['gate'] = C['holm'] & C['same_sign_3'] & (C['t'].abs() > C['placebo_t95'])
C['verdict_cell'] = np.where(C['gate'], 'validated', np.where((C['ci_lo'] > -0.2) & (C['ci_hi'] < 0.2), 'null', 'underpowered'))

# descriptive: non-overlapping short-VX rule on either flag, 20-session hold, 0.10 VX points round trip
trades = []; i = 0; flag_any = ((P['R_a_hi'] == 1) | (P['R_b_hi'] == 1)).to_numpy(); vx = P['vx20'].to_numpy(); ent = P['vx_entry'].to_numpy()
while i < len(P):
    if flag_any[i] and np.isfinite(vx[i]):
        gross = -(np.exp(vx[i]) - 1); cost = 0.10 / ent[i]; trades.append(dict(date=str(dates[i].date()), gross_pct=gross * 100, net_pct=(gross - cost) * 100)); i += 21
    else: i += 1
T = pd.DataFrame(trades)
rule = dict(n=len(T), mean_net_pct=float(T['net_pct'].mean()), median_net_pct=float(T['net_pct'].median()), win_share=float((T['net_pct'] > 0).mean()),
            worst_pct=float(T['net_pct'].min()), best_pct=float(T['net_pct'].max()), total_net_pct=float(T['net_pct'].sum()), trades=trades) if len(T) else {}
uncond = dict(mean_short_vx20_net_pct=float(np.nanmean(-(np.exp(P['vx20']) - 1) - 0.10 / P['vx_entry']) * 100), median_dte=float(np.nanmedian(P['vx_dte'])))
json.dump(dict(id='vix-calculus', part='E', seed=SEED, sd_vx20=sdF, sd_spot20=sdS, n_sessions=int(both.sum()), cells=json.loads(C.to_json(orient='records')), rule=rule, unconditional=uncond),
          open(os.path.join(OUT, 'results_E.json'), 'w'), indent=1)
pd.set_option('display.width', 250); print(C.drop(columns=[]).round(3).T.to_string()); print({k: v for k, v in rule.items() if k != 'trades'}); print(uncond)
