"""short-vx-rule (forge/SHORT_VX_RULE_PREREG.md): short the nearest VX with >= 35 days left on the banked ratio flag, +25% stop on settles,
20-session hold, one position at a time, 0.10 pts round trip (+0.05 on stops), 1% equity risk at the stop; benchmark = same rule on random days.
  python rule.py power -> random-entry trades only (control sample), writes power.json
  python rule.py run   -> the scored rule + benchmark + descriptive variants, writes results.json, trades.csv"""
import os, sys, json
import numpy as np, pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus'); OUT = os.path.join(ROOT, 'analysis', 'output', 'short-vx-rule'); os.makedirs(OUT, exist_ok=True)
SEED = 20261023; rng = np.random.default_rng(SEED); LOCK = pd.Timestamp('2026-08-21')
P = pd.read_parquet(os.path.join(SRC, 'panel_daily.parquet'))
V = pd.read_parquet(os.path.join(SRC, 'data', 'vx_settle.parquet')); F = V.pivot_table(index='date', columns='expiry', values='settle')
P = P[(P.index >= F.index.min()) & (P.index <= LOCK)]; dates = P.index; N = len(dates)
FLAG = ((P['R_a_hi'] == 1) | (P['R_b_hi'] == 1)).to_numpy()


def trade(i, stop=0.25, hold=20):
    """Short entered at the settle of session i+1 (signal at close of i). Returns (R, ret_net, exit_index, stopped) or None."""
    if i + 1 >= N: return None
    d1 = dates[i + 1]
    if d1 not in F.index: return None
    row = F.loc[d1].dropna(); ex = [e for e in row.index if (e - d1).days >= 35]
    if not ex: return None
    e = min(ex); entry = row[e]; last = min(N - 1, i + 1 + hold)
    if last - (i + 1) < hold: return None                                     # cannot complete the hold inside the sample
    for k in range(i + 2, last + 1):
        s = F.at[dates[k], e] if dates[k] in F.index else np.nan
        if not np.isfinite(s): continue
        if stop is not None and s >= entry * (1 + stop):
            ret = (entry - s - 0.15) / entry; return (ret / 0.25, ret, k, True)
        if k == last:
            ret = (entry - s - 0.10) / entry; return (ret / 0.25, ret, k, False)
    return None


def cache(stop=0.25, hold=20):
    return {i: trade(i, stop, hold) for i in range(N)}


def run_rule(C, flag):
    out, busy = [], -1
    for i in range(N):
        if flag[i] and i >= busy and C.get(i):
            R, ret, k, st = C[i]; out.append(dict(i=i, date=str(dates[i].date()), entry=str(dates[i + 1].date()), exit=str(dates[k].date()), R=R, ret_pct=ret * 100, stopped=st)); busy = k
    return pd.DataFrame(out)


def random_sets(C, per_year, B):
    cand = np.array([i for i in range(N) if C.get(i)]); yr = dates.year.to_numpy(); res = []
    for _ in range(B):
        picks = []
        for y, n in per_year.items():
            pool = cand[yr[cand] == y]
            for _try in range(500):
                s = np.sort(rng.choice(pool, n, replace=False)); ok = True
                for a, b in zip(s[:-1], s[1:]):
                    if b < C[a][2]: ok = False; break
                if ok: picks.extend(s.tolist()); break
        picks.sort(); ok = all(b >= C[a][2] for a, b in zip(picks[:-1], picks[1:]))
        if ok: res.append(np.array([C[i][0] for i in picks]))
    return res


def boot_ci(x, B=5000):
    m = [rng.choice(x, len(x)).mean() for _ in range(B)]; return [float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))]


C = cache()
entries_only = run_rule({i: (0, 0, C[i][2], False) if C.get(i) else None for i in range(N)}, FLAG)   # entry dates/count without reading R
per_year = entries_only.assign(y=pd.to_datetime(entries_only['date']).dt.year).groupby('y').size().to_dict()

if sys.argv[1:] == ['power']:
    allR = np.array([v[0] for v in C.values() if v]); n = len(entries_only)
    res = dict(n_flag_trades=n, per_year={int(k): int(v) for k, v in per_year.items()}, random_entry_sd_R=float(allR.std()), random_entry_mean_R=float(allR.mean()),
               mde_R_80pct=float(2.8 * allR.std() / np.sqrt(n)), n_candidate_sessions=int(len(allR)))
    json.dump(res, open(os.path.join(OUT, 'power.json'), 'w'), indent=1); print(res); sys.exit()

# ── the run ──
T = run_rule(C, FLAG); T['period'] = np.where(pd.to_datetime(T['date']).dt.year <= 2016, '2013-16', np.where(pd.to_datetime(T['date']).dt.year <= 2020, '2017-20', '2021-26'))
R = T['R'].to_numpy(); meanR = float(R.mean()); ci = boot_ci(R)
RS = random_sets(C, per_year, 2000); rnd_means = np.array([r.mean() for r in RS])
p_vs_random = float(np.mean(rnd_means >= meanR)); diff = meanR - rnd_means; diff_ci = [float(np.percentile(diff, 2.5)), float(np.percentile(diff, 97.5))]
per = T.groupby('period')['R'].agg(['mean', 'count']).to_dict('index')
gate = dict(ci_excludes_0=ci[0] > 0, beats_random=p_vs_random < 0.05, all_periods_positive=all(v['mean'] > 0 for v in per.values()) and len(per) == 3)
verdict = 'validated' if all(gate.values()) else ('null' if diff_ci[0] > -0.15 and diff_ci[1] < 0.15 else 'underpowered')
eq = np.cumprod(1 + 0.01 * R); dd = float((eq / np.maximum.accumulate(eq) - 1).min())
rnd_eq_final = np.array([np.prod(1 + 0.01 * r) for r in RS])
desc = {}
for lab, st, hd in (('stop +15%', 0.15, 20), ('stop +40%', 0.40, 20), ('no stop', None, 20), ('hold 10, stop +25%', 0.25, 10)):
    Cx = cache(st, hd); Tx = run_rule(Cx, FLAG); allx = np.array([v[0] for v in Cx.values() if v])
    desc[lab] = dict(n=len(Tx), mean_R=float(Tx['R'].mean()), mean_ret_pct=float(Tx['ret_pct'].mean()), win=float((Tx['R'] > 0).mean()), worst_R=float(Tx['R'].min()), random_entry_mean_R=float(allx.mean()))
res = dict(id='short-vx-rule', seed=SEED, n_trades=len(T), mean_R=meanR, ci95=ci, mean_ret_pct=float(T['ret_pct'].mean()), win_share=float((R > 0).mean()), stops=int(T['stopped'].sum()),
           worst_R=float(R.min()), best_R=float(R.max()), random_mean_R=float(rnd_means.mean()), random_mean_R_p05_p95=[float(np.percentile(rnd_means, 5)), float(np.percentile(rnd_means, 95))],
           flag_minus_random=float(meanR - rnd_means.mean()), flag_minus_random_ci95=diff_ci, p_vs_random=p_vs_random, per_period={k: dict(mean_R=float(v['mean']), n=int(v['count'])) for k, v in per.items()},
           gate=gate, verdict=verdict, equity_final_1pct_risk=float(eq[-1]), max_drawdown_1pct_risk=dd, random_equity_final_median=float(np.median(rnd_eq_final)),
           equity_curve=[dict(date=d, equity=float(e)) for d, e in zip(T['exit'], eq)], descriptive=desc, random_sets_used=len(RS))
T.to_csv(os.path.join(OUT, 'trades.csv'), index=False); json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != 'equity_curve'}, indent=1))
