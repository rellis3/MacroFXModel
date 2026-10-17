"""COG-DYNAMIC-LEAD Addendum C (forge/COG_DYNAMIC_LEAD_ADDENDUM_C.md): spread-move episodes with a confirmation that the asset is following.
    python scripts/dynlead/episodes.py --run [--draws 200] [--workers 8]
All causal: the expected direction uses the rolling contemporaneous slope to t0-1; the coupling state uses the previous 60 days; entry is at the close of t_c = t0 + m."""
import argparse
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E

Z0, KS, MS, CS, HS = (1.0, 1.5, 2.0), (1, 5), (1, 2, 3, 5), (0.25, 0.5, 1.0), (2, 5, 10, 20)
STATES = ('any', 'coupled')
COOL = 10
DIV_MS, DIV_CS, DIV_HS = (1, 2, 3, 5), (0.5, 1.0), (5, 10)
PAIRS = [('US-DE 2Y', 'EURUSD'), ('US-DE 5Y', 'EURUSD'), ('US-DE 10Y', 'EURUSD'), ('US-DE 2Y', 'GBPUSD'), ('US-DE 2Y', 'USDCHF'), ('US-JP 2Y', 'USDJPY'), ('US-JP 5Y', 'USDJPY'), ('US-JP 10Y', 'USDJPY'),
         ('US2', 'USDJPY'), ('US2', 'GOLD'), ('US10', 'GOLD'), ('US slope 10-2', 'SPX500'), ('US2', 'SPX500'), ('US-DE 2Y', 'EURJPY'), ('DE-JP 10Y', 'EURJPY')]


class Ctx:
    def __init__(self, ad, S):
        self.ad = ad
        self.idx = ad.index
        self.T = len(ad)
        self.LP = np.log(ad).values
        lp = np.log(ad)
        r1 = lp.diff()
        self.sig = r1.rolling(250, min_periods=120).std().shift(1).values
        self.cost_rt = np.array([E.COST_BP.get(c, 2.0) for c in ad.columns]) / 1e4        # full round trip as a fraction
        self.S = S
        self.beta250, self.coupled = {}, {}
        for j, s in S.items():
            d1 = s.diff()
            b250 = r1.rolling(250, min_periods=200).cov(d1).div(d1.rolling(250, min_periods=200).var(), axis=0).shift(1)
            b60 = r1.rolling(60, min_periods=50).cov(d1).div(d1.rolling(60, min_periods=50).var(), axis=0).shift(1)
            c60 = r1.rolling(60, min_periods=50).corr(d1).shift(1)
            self.beta250[j] = b250.values
            self.coupled[j] = ((c60 ** 2 >= 0.10) & (np.sign(b60) == np.sign(b250)) & b250.notna() & b60.notna()).values
        wk = self.idx.isocalendar()
        self.week = (wk.year.values.astype(int) * 100 + wk.week.values.astype(int))
        self.month = self.idx.year.values * 100 + self.idx.month.values
        per = np.zeros(self.T, int)
        for code, p in ((1, 'DISC'), (2, 'VAL'), (3, 'OOS')):
            per[E.period_mask(self.idx, p)] = code
        self.period = per


def find_events(x, z0):
    ev, last = [], -10 ** 9
    xv = x.values
    for t in range(len(xv)):
        if np.isfinite(xv[t]) and abs(xv[t]) >= z0 and t - last >= COOL:
            ev.append(t)
            last = t
    return np.array(ev, int)


def episode_pass(ctx, S=None, specs_only=None, collect=False, only_pairs=None):
    """Returns, per spec key, a list of tuples (net values, week clusters, period codes). Optionally also event-level records for requested specs."""
    S = ctx.S if S is None else S
    out = {}
    recs = []
    LP, T = ctx.LP, ctx.T
    for j, s in S.items():
        # context for shifted spreads is recomputed by the caller (ctx.S replaced); here we use the ctx stored arrays for j
        for k in KS:
            x = E.make_x(s, k)
            for z0 in Z0:
                ev = find_events(x, z0)
                if not len(ev):
                    continue
                sx = np.sign(x.values[ev])
                d = np.sign(ctx.beta250[j][ev, :]) * sx[:, None]
                cpl = ctx.coupled[j][ev, :]
                for m in MS:
                    ok_m = ev + m < T
                    if not ok_m.any():
                        continue
                    evm = ev[ok_m]
                    dm = d[ok_m]
                    tc = evm + m
                    cr = dm * (LP[tc, :] - LP[evm, :]) / (ctx.sig[evm, :] * np.sqrt(m))
                    cplm = cpl[ok_m]
                    for h in HS:
                        ok_h = tc + h < T
                        if not ok_h.any():
                            continue
                        ret = dm * (LP[np.minimum(tc + h, T - 1), :] - LP[tc, :])
                        ret = np.where(ok_h[:, None], ret, np.nan)
                        net = ret - ctx.cost_rt[None, :]
                        for c in CS:
                            conf = (cr >= c) & np.isfinite(net) & np.isfinite(dm)
                            for st in STATES:
                                msk = conf & (cplm if st == 'coupled' else True)
                                if not msk.any():
                                    continue
                                rows_i, cols_i = np.where(msk)
                                key = (st, z0, k, m, c, h)
                                tcs = tc[rows_i]
                                out.setdefault(key, []).append((net[rows_i, cols_i], ctx.week[tcs], ctx.period[tcs]))
                                if collect and (specs_only is None or key in specs_only):
                                    for r_, c_ in zip(rows_i, cols_i):
                                        recs.append((key, j, ctx.ad.columns[c_], ctx.idx[tc[r_]], float(net[r_, c_])))
                        # divergence specs (z0 = 1.5, k = 5, state any)
                        if z0 == 1.5 and k == 5 and m in DIV_MS and h in DIV_HS:
                            for c in DIV_CS:
                                dv = (cr <= -c) & np.isfinite(ret) & np.isfinite(dm)
                                if not dv.any():
                                    continue
                                rows_i, cols_i = np.where(dv)
                                tcs = tc[rows_i]
                                for trade, sgn in (('catchup', 1.0), ('breakdown', -1.0)):
                                    v = sgn * ret[rows_i, cols_i] - ctx.cost_rt[cols_i]
                                    out.setdefault(('div-' + trade, z0, k, m, c, h), []).append((v, ctx.week[tcs], ctx.period[tcs]))
    if only_pairs is not None:
        pass
    return out, recs


def cluster_stats(values, clusters):
    n = len(values)
    if n < 20:
        return np.nan, np.nan, n
    u, inv = np.unique(clusters, return_inverse=True)
    sums = np.bincount(inv, values)
    cnt = np.bincount(inv).astype(float)
    mean = values.mean()
    se = np.sqrt(((sums - mean * cnt) ** 2).sum()) / n
    t = mean / se if se > 0 else np.nan
    return mean, t, n


def tabulate(out):
    rows = []
    for key, parts in out.items():
        v = np.concatenate([p[0] for p in parts])
        w = np.concatenate([p[1] for p in parts])
        pr = np.concatenate([p[2] for p in parts])
        row = dict(trade=key[0], z0=key[1], k=key[2], m=key[3], c=key[4], h=key[5])
        for code, nm in ((1, 'DISC'), (2, 'VAL'), (3, 'OOS')):
            sel = pr == code
            mean, t, n = cluster_stats(v[sel], w[sel]) if sel.any() else (np.nan, np.nan, 0)
            row[f'mean_{nm}'] = mean * 1e4
            row[f't_{nm}'] = t
            row[f'p_{nm}'] = stats.norm.sf(t) if np.isfinite(t) else np.nan
            row[f'n_{nm}'] = n
            row[f'neg_{nm}'] = float((v[sel] < 0).mean()) if sel.any() else np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def pipeline_ep(df, min_n=100):
    d = df.copy()
    d['s1'] = E.bh(np.where(d.n_DISC >= min_n, d.p_DISC, np.nan)) & (d.mean_DISC > 0)
    d['s2'] = False
    s1 = d[d.s1]
    if len(s1):
        cand = s1[(s1.mean_VAL > 0) & (s1.p_VAL < 0.05) & (s1.n_VAL >= 50)]
        if len(cand):
            keep = E.bh(cand.p_VAL.values)
            d.loc[cand.index[keep], 's2'] = True
    d['oos_pass'] = d.s2 & (d.mean_OOS > 0) & (d.p_OOS < 0.05)
    return d, dict(step1=int(d.s1.sum()), step2=int(d.s2.sum()), oos_pass=int(d.oos_pass.sum()), best_oos_mean_bp=float(d.loc[d.s2, 'mean_OOS'].max()) if d.s2.any() else np.nan)


def one_draw(seed):
    ad, yd, S = E.load()
    rng = np.random.default_rng(5000 + seed)
    Sh = E.shifted_spreads(S, rng)
    ctx = Ctx(ad, Sh)
    out, _ = episode_pass(ctx, Sh)
    t = tabulate(out)
    d, c = pipeline_ep(t)
    # the placebo mean of every spec in the out-of-sample period (excess-over-momentum baseline) and discovery
    return dict(draw=seed, **c), t[['trade', 'z0', 'k', 'm', 'c', 'h', 'mean_DISC', 'mean_VAL', 'mean_OOS', 'n_OOS']].assign(draw=seed)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', action='store_true')
    ap.add_argument('--draws', type=int, default=200)
    ap.add_argument('--workers', type=int, default=8)
    A = ap.parse_args()
    if A.run:
        ad, yd, S = E.load()
        ctx = Ctx(ad, S)
        out, _ = episode_pass(ctx)
        tab = tabulate(out)
        d, c = pipeline_ep(tab)
        d.to_parquet(E.PAN / 'episodes_cells.parquet')
        print('REAL episodes:', c, 'specs', len(d), flush=True)
        with ProcessPoolExecutor(max_workers=A.workers) as ex:
            res = list(ex.map(one_draw, range(A.draws)))
        pl = pd.DataFrame([r[0] for r in res])
        pl.to_csv(E.PAN / 'episodes_placebo.csv', index=False)
        pd.concat([r[1] for r in res]).to_parquet(E.PAN / 'episodes_placebo_specs.parquet')
        print('PLACEBO', pl.describe().round(2).to_string(), flush=True)
        print('EPISODES_DONE', flush=True)
