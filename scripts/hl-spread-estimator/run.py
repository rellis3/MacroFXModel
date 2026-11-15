"""hl-spread-estimator -- do Corwin-Schultz and Abdi-Ranaldo daily high-low-close estimates reproduce the quoted OANDA spread?
Prereg: forge/HL_SPREAD_ESTIMATOR_PREREG.md (seed 20261114). Read-only on data/m1_bidask. Run with the repo venv: python -I scripts/hl-spread-estimator/run.py"""
import os, json
import numpy as np, pandas as pd

SEED = 20261114
ROOT = os.environ.get('MFX_ROOT', r'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel')
BA = os.path.join(ROOT, 'data', 'm1_bidask')
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'analysis', 'output', 'hl-spread-estimator'))
os.makedirs(OUT, exist_ok=True)
END = pd.Timestamp('2026-08-21')
LON = 'Europe/London'
MAJORS = {'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'nzdusd'}
IDX = {'nq', 'spx', 'dow', 'dax', 'uk100', 'us2000'}


def group_of(k):
    if k in MAJORS: return 'FX major'
    if k == 'gold': return 'gold'
    if k in IDX: return 'index'
    return 'FX cross'


def load_daily(key):
    d = pd.read_parquet(os.path.join(BA, key + '_m1.parquet'), columns=['time', 'open', 'high', 'low', 'close', 'bid_c', 'ask_c'])
    t = pd.to_datetime(d['time'], utc=True)
    d = d[t < END.tz_localize('UTC')].copy(); t = t[d.index]
    lon = t.dt.tz_convert(LON)
    keep = (lon.dt.hour < 22).values
    d = d[keep]; lon = lon[keep]
    d['ld'] = pd.DatetimeIndex(lon.dt.date)
    mid = (d['bid_c'] + d['ask_c']) / 2
    sp = (d['ask_c'] - d['bid_c']) / mid * 100
    med = sp[sp > 0].median()
    ok = (d['ask_c'] > d['bid_c']) & (d['bid_c'] > 0) & (sp <= 20 * med)
    d['sp'] = np.where(ok, sp, np.nan)
    n_bad = int((~ok).sum()); n_all = int(len(d))
    g = d.groupby('ld')
    day = pd.DataFrame({'sp': g['sp'].mean(), 'n': g.size(), 'O': g['open'].first(), 'H': g['high'].max(), 'L': g['low'].min(), 'C': g['close'].last()})
    day = day[(day.index.dayofweek < 5) & (day['n'] >= 0.85 * day['n'].median())]
    return day, {'minutes': n_all, 'bad_spread_minutes': n_bad, 'median_spread_pct': float(med)}


def cs_series(day):
    H, L = np.log(day['H'].values), np.log(day['L'].values)
    b = (H - L) ** 2
    beta = b[:-1] + b[1:]
    gam = (np.maximum(H[:-1], H[1:]) - np.minimum(L[:-1], L[1:])) ** 2
    k = 3 - 2 * np.sqrt(2)
    alpha = (np.sqrt(2 * beta) - np.sqrt(beta)) / k - np.sqrt(gam / k)
    s = 2 * (np.exp(alpha) - 1) / (1 + np.exp(alpha))
    s = np.maximum(s, 0) * 100
    return pd.Series(s, index=day.index[:-1])


def ar_daily(day):
    H, L, C = np.log(day['H'].values), np.log(day['L'].values), np.log(day['C'].values)
    eta = (H + L) / 2
    s2 = 4 * (C[:-1] - eta[:-1]) * (C[:-1] - eta[1:])
    return pd.Series(s2, index=day.index[:-1])


def monthly(day, cs, ar2):
    df = pd.DataFrame({'sp': day['sp'], 'cs': cs, 'ar2': ar2}).dropna(subset=['sp'])
    df['m'] = df.index.to_period('M')
    g = df.groupby('m')
    cnt = g['sp'].count()
    out = pd.DataFrame({'measured': g['sp'].mean(), 'CS': g['cs'].mean(), 'AR': np.sqrt(np.maximum(g['ar2'].mean(), 0)) * 100, 'days': cnt})
    return out[out['days'] >= 15].dropna()


def spearman(a, b):
    if len(a) < 6: return np.nan
    ra, rb = pd.Series(a).rank().values, pd.Series(b).rank().values
    if ra.std() == 0 or rb.std() == 0: return np.nan
    return float(np.corrcoef(ra, rb)[0, 1])


def stats_for(M, est):
    rel = np.abs(M[est] - M['measured']) / M['measured']
    return float(np.median(rel)), spearman(M[est].values, M['measured'].values)


def pooled_boot(MS, est, B, rng):
    keys = list(MS); rels = np.zeros((B, len(keys))); rhos = np.zeros((B, len(keys)))
    for j, k in enumerate(keys):
        M = MS[k]; n = len(M); e = M[est].values; m = M['measured'].values
        for b in range(B):
            ix = rng.integers(0, n, n)
            rels[b, j] = np.median(np.abs(e[ix] - m[ix]) / m[ix]); rhos[b, j] = spearman(e[ix], m[ix])
    pr, ph = np.median(rels, axis=1), np.nanmedian(rhos, axis=1)
    q = lambda x: {'lo95': float(np.quantile(x, .025)), 'hi95': float(np.quantile(x, .975)), 'lo975': float(np.quantile(x, .0125)), 'hi975': float(np.quantile(x, .9875))}
    return {'rel': q(pr), 'rho': q(ph)}


def main():
    rng = np.random.default_rng(SEED)
    keys = sorted(f[:-len('_m1.parquet')] for f in os.listdir(BA) if f.endswith('_m1.parquet'))
    MS, meta = {}, {}
    for k in keys:
        try:
            day, mt = load_daily(k)
            cs = cs_series(day); ar2 = ar_daily(day)
            M = monthly(day, cs, ar2)
            if len(M) < 24: meta[k] = {'dropped': 'months<24', **mt}; continue
            MS[k] = M; meta[k] = {**mt, 'months': int(len(M)), 'group': group_of(k), 'first': str(M.index[0]), 'last': str(M.index[-1])}
            print(k, len(M), 'measured %.4f' % M['measured'].mean(), 'CS %.4f AR %.4f' % (M['CS'].mean(), M['AR'].mean()), flush=True)
        except Exception as e:
            meta[k] = {'error': str(e)}; print(k, 'ERR', e, flush=True)
    res = {'seed': SEED, 'n_instruments': len(MS), 'meta': meta}
    per = {}
    for k, M in MS.items():
        per[k] = {'group': group_of(k), 'months': int(len(M)), 'mean_measured': float(M['measured'].mean())}
        for est in ('CS', 'AR'):
            rel, rho = stats_for(M, est)
            per[k][est] = {'rel_err_median': rel, 'spearman': rho, 'mean': float(M[est].mean()), 'bias_ratio': float(M[est].mean() / M['measured'].mean())}
            h1, h2 = M[M.index < pd.Period('2020-01')], M[M.index >= pd.Period('2020-01')]
            per[k][est]['era'] = {'pre2020': stats_for(h1, est) if len(h1) >= 12 else None, 'post2020': stats_for(h2, est) if len(h2) >= 12 else None}
    res['per_instrument'] = per
    for est in ('CS', 'AR'):
        rels = [per[k][est]['rel_err_median'] for k in per]; rhos = [per[k][est]['spearman'] for k in per if not np.isnan(per[k][est]['spearman'])]
        boot = pooled_boot(MS, est, 1000, rng)
        mm = np.array([per[k]['mean_measured'] for k in per]); me = np.array([per[k][est]['mean'] for k in per])
        order = spearman(me, mm)
        bo = []
        for _ in range(1000):
            ix = rng.integers(0, len(mm), len(mm)); bo.append(spearman(me[ix], mm[ix]))
        bo = np.array(bo); bo = bo[~np.isnan(bo)]
        # THE MIRROR: pair each instrument's estimator series with a randomly chosen OTHER instrument's measured series (same calendar months)
        mir_rel, mir_rho = [], []
        ks = list(MS)
        for _ in range(200):
            perm = rng.permutation(len(ks)); rr, hh = [], []
            for i, k in enumerate(ks):
                o = ks[perm[i]]
                if o == k: continue
                j = MS[k][est].to_frame('e').join(MS[o]['measured'].rename('m'), how='inner').dropna()
                if len(j) < 24: continue
                rr.append(float(np.median(np.abs(j['e'] - j['m']) / j['m']))); hh.append(spearman(j['e'].values, j['m'].values))
            mir_rel.append(np.median(rr)); mir_rho.append(np.nanmedian(hh))
        res[est] = {'pooled_median_rel_err': float(np.median(rels)), 'pooled_median_spearman': float(np.median(rhos)), 'boot': boot,
                    'ordering_spearman': order, 'ordering_boot': {'lo95': float(np.quantile(bo, .025)), 'hi95': float(np.quantile(bo, .975))},
                    'mirror_random_pairing': {'rel_err_median': float(np.median(mir_rel)), 'spearman_median': float(np.median(mir_rho))},
                    'bias_ratio_median': float(np.median([per[k][est]['bias_ratio'] for k in per])),
                    'by_group': {g: {'rel_err_median': float(np.median([per[k][est]['rel_err_median'] for k in per if per[k]['group'] == g])),
                                     'spearman_median': float(np.nanmedian([per[k][est]['spearman'] for k in per if per[k]['group'] == g])),
                                     'bias_ratio_median': float(np.median([per[k][est]['bias_ratio'] for k in per if per[k]['group'] == g])), 'n': int(sum(1 for k in per if per[k]['group'] == g))}
                                 for g in ('FX major', 'FX cross', 'gold', 'index')}}
    # verdict per the prereg
    def passes(e):
        r = res[e]
        h1 = r['pooled_median_rel_err'] <= 0.30 and r['boot']['rel']['hi975'] <= 0.40
        h2 = r['pooled_median_spearman'] >= 0.50 and r['boot']['rho']['lo975'] > 0.30
        h3 = r['ordering_spearman'] >= 0.80
        return {'H1': bool(h1), 'H2': bool(h2), 'H3': bool(h3)}
    def nullish(e):
        r = res[e]
        return bool(r['boot']['rel']['lo95'] > 0.40 or r['boot']['rho']['hi95'] < 0.30)
    res['gates'] = {e: passes(e) for e in ('CS', 'AR')}; res['nullish'] = {e: nullish(e) for e in ('CS', 'AR')}
    if any(g['H1'] and g['H2'] and g['H3'] for g in res['gates'].values()): v = 'VALIDATED'
    elif any(g['H1'] and g['H2'] for g in res['gates'].values()): v = 'CONTEXT'
    elif all(res['nullish'].values()): v = 'NULL'
    else: v = 'UNDERPOWERED'
    res['verdict'] = v
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=str)
    pd.DataFrame({k: {'group': per[k]['group'], 'months': per[k]['months'], 'measured_pct': per[k]['mean_measured'], 'CS_pct': per[k]['CS']['mean'], 'AR_pct': per[k]['AR']['mean'],
                      'CS_rel_err': per[k]['CS']['rel_err_median'], 'AR_rel_err': per[k]['AR']['rel_err_median'], 'CS_rho': per[k]['CS']['spearman'], 'AR_rho': per[k]['AR']['spearman']} for k in per}).T.to_csv(os.path.join(OUT, 'per_instrument.csv'))
    print(json.dumps({k: res[k] for k in ('CS', 'AR', 'gates', 'nullish', 'verdict')}, indent=1, default=str))


if __name__ == '__main__':
    main()
