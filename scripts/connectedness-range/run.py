"""connectedness-range -- Diebold-Yilmaz total connectedness of ten markets' London-session log ranges vs the next session's pooled range,
beyond HAR persistence, VIX and mean |rho|. Prereg: forge/CONNECTEDNESS_RANGE_PREREG.md (seed 20261114).
Stages: --stage power (design SE/MDE from the B0 residual SD, no b_C read), --stage score. Run with the repo venv:
  python -I scripts/connectedness-range/run.py --stage power|score"""
import argparse, importlib.util, json, sys, os
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve(); REPO = HERE.parents[2]
OUT = REPO / 'analysis' / 'output' / 'connectedness-range'; OUT.mkdir(parents=True, exist_ok=True)
SEED, B = 20261114, 2000
GATE, OPERATIONAL = 0.02, 0.05
sys.path.insert(0, str(REPO / 'scripts' / 'fomc-range-share'))
import run as FR                                                   # the day tables (London session hi/lo/n per market), cached
_s = importlib.util.spec_from_file_location('p27', REPO / 'oi_research_book' / 'scripts' / '27_gex_range_es.py')
p27 = importlib.util.module_from_spec(_s); _s.loader.exec_module(p27)
MK = list(FR.INSTR)                                                # EURUSD GBPUSD USDJPY AUDUSD USDCAD USDCHF NZDUSD XAUUSD NAS100 SPX500
GROUP = FR.GROUP


def closes():
    cache = OUT / '_closes.pkl'
    if cache.exists(): return pd.read_pickle(cache)
    out = {}
    for k in MK:
        d = pd.read_parquet(os.path.join(FR.M1, FR.INSTR[k] + '_m1.parquet'), columns=['close'])
        d = d[(d.index >= FR.START.tz_localize('UTC')) & (d.index < FR.END.tz_localize('UTC') + pd.Timedelta(days=1))]
        lon = d.index.tz_convert(FR.LON); keep = lon.hour < 22
        c = d['close'][keep]; ld = pd.DatetimeIndex(lon[keep].date)
        out[k] = c.groupby(ld).last()
    D = pd.DataFrame(out); pd.to_pickle(D, cache); return D


def cboe_vix():
    c = pd.read_csv(REPO / 'analysis' / 'surfaces' / 'cboe' / 'VIX.csv'); c['DATE'] = pd.to_datetime(c['DATE'], format='%m/%d/%Y')
    return c.set_index('DATE')['CLOSE'].sort_index().dropna()


def build():
    T = FR.build_all()
    LR = pd.DataFrame({k: np.log(np.log(t['hi'] / t['lo'])).where(t['n'] >= 0.85 * t['n'].median()) for k, t in T.items()})   # ln of the range ln(H/L): units of the gate (0.02 = 2% wider range)
    LR = LR[(LR.index.dayofweek < 5) & (LR.index >= '2016-01-04') & (LR.index < FR.END)]
    LR = LR[LR.notna().sum(axis=1) >= 9]
    C = closes().reindex(LR.index)
    ret = np.log(C).diff()
    return LR, ret


def gfevd_total(Y, H=10):
    """total connectedness (percent) from a VAR(1) fitted on Y (n x N), generalized FEVD at horizon H, rows normalised"""
    Yd = Y - Y.mean(axis=0); X, Z = Yd[:-1], Yd[1:]
    A = np.linalg.lstsq(X, Z, rcond=None)[0].T                          # Z = X A'
    E = Z - X @ A.T; n, N = E.shape; S = E.T @ E / (n - N)
    num = np.zeros((N, N)); den = np.zeros(N); Phi = np.eye(N)
    for _ in range(H):
        P = Phi @ S; num += P ** 2; den += np.diag(Phi @ S @ Phi.T); Phi = A @ Phi
    theta = (num / np.diag(S)[None, :]) / den[:, None]
    theta = theta / theta.sum(axis=1, keepdims=True)
    return 100.0 * (theta.sum() - np.trace(theta)) / N


def connectedness(LR, W=250, H=10):
    dense = LR.dropna()
    C = pd.Series(np.nan, index=LR.index)
    vals = dense.values; idx = dense.index
    for i in range(W, len(dense) + 1):
        C.loc[idx[i - 1]] = gfevd_total(vals[i - W:i], H)
    return C.ffill()                                                    # the most recent value known at the end of each day


def features(LR, ret, Cs, ycols=None):
    d = pd.DataFrame(index=LR.index)
    p = LR.mean(axis=1, skipna=True); d['p'] = p
    d['p5'] = p.rolling(5).mean(); d['p20'] = p.rolling(20).mean()
    d['C'] = Cs
    vix = cboe_vix(); idx = vix.index.searchsorted(d.index, side='right') - 1
    d['lvix'] = np.log(vix.to_numpy()[np.clip(idx, 0, None)])
    # mean |pairwise rho| of London close-to-close returns over the trailing 60 qualifying days
    R = ret.copy(); rho = pd.Series(np.nan, index=d.index)
    for i in range(60, len(R)):
        w = R.iloc[i - 60:i + 1].dropna(axis=1, thresh=45)
        cm = w.corr().abs().values; n = cm.shape[0]
        rho.iloc[i] = (cm.sum() - n) / (n * (n - 1)) if n > 2 else np.nan
    d['rho'] = rho
    d['y'] = p.shift(-1)
    d['dow_t'] = pd.Series(d.index.shift(1, freq='B').dayofweek if False else (pd.Series(d.index).shift(-1).dt.dayofweek.values), index=d.index)
    return d


def design(d, with_c=True, c_col='C', with_vix=True):
    X = pd.DataFrame(index=d.index); X['c'] = 1.0
    X['p'], X['p5'], X['p20'] = d['p'], d['p5'], d['p20']
    if with_vix: X['lvix'] = d['lvix']
    X['rho'] = d['rho']
    for w in (1, 2, 3, 4): X[f'dow{w}'] = (d['dow_t'] == w).astype(float)
    if with_c: X['C'] = d[c_col]
    return X


def clean(d, cols):
    return d.dropna(subset=cols).copy()


def coef(X, y, name):
    return float(np.linalg.lstsq(X.values, y, rcond=None)[0][list(X.columns).index(name)])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--stage', required=True, choices=['power', 'score']); a = ap.parse_args()
    LR, ret = build()
    Cs = connectedness(LR, 250, 10)
    d = features(LR, ret, Cs)
    d = clean(d, ['y', 'p', 'p5', 'p20', 'C', 'lvix', 'rho', 'dow_t'])
    d['C_raw'] = d['C']; d['C'] = d['C_raw'] / d['C_raw'].std()
    y = d['y'].to_numpy(); n = len(d)
    if a.stage == 'power':
        X0 = design(d, with_c=False); b0 = np.linalg.lstsq(X0.values, y, rcond=None)[0]; sd0 = float((y - X0.values @ b0).std(ddof=X0.shape[1]))
        X1 = design(d); XtXi = np.linalg.pinv(X1.values.T @ X1.values); j = list(X1.columns).index('C'); se0 = sd0 * float(np.sqrt(XtXi[j, j]))
        res = {'seed': SEED, 'stage': 'power', 'n_sessions': n, 'first': str(d.index[0].date()), 'last': str(d.index[-1].date()), 'resid_sd_B0': sd0, 'se_iid_design': se0,
               'se_with_block_inflation_1_5_to_2': [1.5 * se0, 2.0 * se0], 'mde_range': [3.0 * 1.5 * se0, 3.0 * 2.0 * se0], 'C_mean': float(d['C_raw'].mean()), 'C_sd': float(d['C_raw'].std()),
               'C_min': float(d['C_raw'].min()), 'C_max': float(d['C_raw'].max()),
               'spearman_C_vix': float(d['C_raw'].rank().corr(d['lvix'].rank())), 'spearman_C_rho': float(d['C_raw'].rank().corr(d['rho'].rank())), 'spearman_C_p': float(d['C_raw'].rank().corr(d['p'].rank()))}
        json.dump(res, open(OUT / 'power.json', 'w'), indent=1); print(json.dumps(res, indent=1)); return
    rng = np.random.default_rng(SEED)
    X1 = design(d); A = X1.values; jC = list(X1.columns).index('C')
    beta = np.linalg.lstsq(A, y, rcond=None)[0]; bC = float(beta[jC])
    bs = []
    for ch in p27.s18._boot_stats(n, B, rng, chunk=500):
        for ix in ch: bs.append(np.linalg.lstsq(A[ix], y[ix], rcond=None)[0][jC])
    bs = np.array(bs); se = float(bs.std())
    pl = []
    Cv = d['C'].to_numpy()
    for k in range(60, n - 60, 5):
        A2 = A.copy(); A2[:, jC] = np.roll(Cv, k); pl.append(float(np.linalg.lstsq(A2, y, rcond=None)[0][jC]))
    pl = np.array(pl)
    res = {'seed': SEED, 'stage': 'score', 'n': n, 'b_C': bC, 'se': se, 'ci95': [bC - 1.96 * se, bC + 1.96 * se], 'ci95_pct': [float(np.quantile(bs, .025)), float(np.quantile(bs, .975))], 't': bC / se,
           'placebo': {'n_shifts': int(len(pl)), 'mean': float(pl.mean()), 'sd': float(pl.std()), 'real_above_share': float((pl < bC).mean())},
           'b_controls': {c: float(beta[i]) for i, c in enumerate(X1.columns) if c not in ('c',) and not c.startswith('dow')}}
    gate = {'b_ge_0.02': bC >= GATE, 'ci_lower_gt_0': res['ci95'][0] > 0, 'placebo_above_95pct': res['placebo']['real_above_share'] >= 0.95}
    res['gate'] = gate; res['verdict'] = 'VALIDATED' if all(gate.values()) else ('NULL' if res['ci95'][1] < OPERATIONAL else 'UNDERPOWERED')
    # B0 vs B1 fit
    X0 = design(d, with_c=False); r0 = y - X0.values @ np.linalg.lstsq(X0.values, y, rcond=None)[0]; r1 = y - A @ beta
    res['r2_gain'] = float(1 - (r1 ** 2).sum() / (r0 ** 2).sum())
    # descriptive / sensitivities
    desc = {}
    desc['without_vix'] = coef(design(d, with_vix=False), y, 'C')
    d5 = d.copy(); d5['dC5'] = (d['C_raw'] - d['C_raw'].shift(5)); d5 = clean(d5, ['dC5']); d5['dC5'] = d5['dC5'] / d5['dC5'].std()
    desc['dC5'] = coef(design(d5, c_col='dC5'), d5['y'].to_numpy(), 'C')
    for W, H in ((120, 10), (500, 10), (250, 5)):
        Cw = connectedness(LR, W, H); dw = features(LR, ret, Cw); dw = clean(dw, ['y', 'p', 'p5', 'p20', 'C', 'lvix', 'rho', 'dow_t']); dw['C'] = dw['C'] / dw['C'].std()
        desc[f'W{W}_H{H}'] = {'b_C': coef(design(dw), dw['y'].to_numpy(), 'C'), 'n': int(len(dw))}
    half = n // 2
    desc['halves'] = {lab: coef(design(d.iloc[sl]), y[sl], 'C') for lab, sl in (('first', slice(0, half)), ('second', slice(half, None)))}
    grp = {}
    for g in ('FX', 'gold', 'index'):
        cols = [k for k in MK if GROUP[k] == g]
        dg = d.copy(); lr = LR[cols].mean(axis=1, skipna=True); dg['y'] = lr.shift(-1).reindex(dg.index); dg = clean(dg, ['y'])
        grp[g] = coef(design(dg), dg['y'].to_numpy(), 'C')
    desc['by_group_target'] = grp
    desc['spearman_C_vix'] = float(d['C_raw'].rank().corr(d['lvix'].rank())); desc['spearman_C_rho'] = float(d['C_raw'].rank().corr(d['rho'].rank()))
    desc['C_mean_sd'] = [float(d['C_raw'].mean()), float(d['C_raw'].std())]
    res['descriptive'] = desc
    json.dump(res, open(OUT / 'results.json', 'w'), indent=1, default=str); print(json.dumps(res, indent=1, default=str))


if __name__ == '__main__':
    main()
