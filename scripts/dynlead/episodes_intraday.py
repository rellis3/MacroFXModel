"""COG-DYNAMIC-LEAD Addendum D (forge/COG_DYNAMIC_LEAD_ADDENDUM_D.md): episode framing on the intraday SOFR / Euribor / ESTR futures lines (17 lines x 34 assets, 15-minute bars).
    python scripts/dynlead/episodes_intraday.py --build
    python scripts/dynlead/episodes_intraday.py --run [--draws 200] [--workers 8]
Everything is causal (expected direction from the 20-day contemporaneous slope to t0-1, coupling from the previous 5 days, entry at the close of t_c = t0 + m)."""
import argparse
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E
import intraday as I

BARS = 96
Z0, KB, MB, CB, HB = (1.0, 1.5, 2.0), (4, 16, 96), (1, 2, 4, 8), (0.25, 0.5, 1.0), (4, 16, 96, 192)
STATES = ('any', 'coupled')
COOL = 16
DM, DC, DH = (1, 2, 4, 8), (0.5, 1.0), (16, 96)
W20, W5 = 20 * BARS, 5 * BARS
PAN, DEEP = E.PAN, I.DEEP
PAIRS = [('SR3Z6', a) for a in ('EURUSD', 'USDJPY', 'GOLD', 'SPX500', 'NAS100')] + [('IH7', a) for a in ('EURUSD', 'EURJPY', 'DE30')] + [('IZ6', a) for a in ('EURUSD', 'DE30')] + [('ER3Z6', a) for a in ('EURUSD', 'EURGBP')] \
    + [('SR3Z6-SR3U6', a) for a in ('EURUSD', 'USDJPY', 'GOLD', 'NAS100')] + [('P0', a) for a in ('EURUSD', 'USDJPY')] + [('P3', a) for a in ('EURUSD', 'EURGBP')]
LEGS = ['SR3U6', 'SR3Z6', 'SR3H7', 'IH7', 'IZ6', 'ER3Z6', 'ER3H7']
CAL = {'SR3Z6-SR3U6': ('SR3Z6', 'SR3U6'), 'SR3H7-SR3Z6': ('SR3H7', 'SR3Z6'), 'SR3H7-SR3U6': ('SR3H7', 'SR3U6'), 'IH7-IZ6': ('IH7', 'IZ6'), 'ER3H7-ER3Z6': ('ER3H7', 'ER3Z6')}
CROSS = {'P0': ('SR3U6', 'IH7'), 'P1': ('SR3H7', 'IH7'), 'P2': ('SR3Z6', 'IZ6'), 'P3': ('SR3Z6', 'ER3Z6'), 'P4': ('SR3H7', 'ER3H7')}


def build():
    G = pd.date_range('2024-04-15', '2026-08-20 23:45', freq='15min', tz='UTC')
    leg = {n: I.r15(DEEP / f'{("CME_" if n.startswith("SR3") else "ICEEU_")}{n}.parquet').reindex(G) for n in LEGS}
    day = pd.Series(G.date, index=G)
    ok = {n: pd.Series(day.map(s.groupby(day.values).agg(lambda v: v.dropna().nunique()).to_dict()).values >= 3, index=G) for n, s in leg.items()}
    lines = {n: (leg[n] * 100).where(ok[n]) for n in LEGS}
    for nm, (a, b) in {**CAL, **CROSS}.items():
        lines[nm] = ((leg[a] - leg[b]) * 100).where(ok[a] & ok[b])
    L = pd.DataFrame(lines)
    L.to_parquet(PAN / 'intraday_lines_v2.parquet')
    print({c: int(L[c].notna().sum()) for c in L.columns})


def roll_sums(X, Y, W, minp):
    v = np.isfinite(X)[:, None] & np.isfinite(Y)
    x = np.where(v, X[:, None], 0.0)
    y = np.where(v, Y, 0.0)

    def cs(a):
        c = np.cumsum(a, axis=0)
        o = c.copy()
        o[W:] = c[W:] - c[:-W]
        return o
    n, sx, sy, sxx, syy, sxy = cs(v.astype(float)), cs(x), cs(y), cs(x * x), cs(y * y), cs(x * y)
    with np.errstate(all='ignore'):
        mx, my = sx / n, sy / n
        cov = sxy / n - mx * my
        vx = sxx / n - mx ** 2
        vy = syy / n - my ** 2
        beta = cov / vx
        corr = cov / np.sqrt(vx * vy)
    bad = n < minp
    beta[bad] = np.nan
    corr[bad] = np.nan
    return np.vstack([np.full((1, beta.shape[1]), np.nan), beta[:-1]]), np.vstack([np.full((1, corr.shape[1]), np.nan), corr[:-1]])        # shift(1): data to t0 - 1


class ICtx:
    def __init__(self, A, L):
        self.cols = list(A.columns)
        self.idx = A.index
        self.N = len(A)
        self.LP = A.values
        r1 = A.diff().values
        self.r1 = r1
        sr = pd.DataFrame(r1).rolling(W20, min_periods=W20 // 2).std().shift(1).values
        self.sig = sr
        self.cost_rt = np.array([E.COST_BP.get(c, 2.0) for c in self.cols]) / 1e4
        self.dcode = pd.factorize(pd.Series(A.index.date))[0]
        self.nd = int(self.dcode.max()) + 1
        per = np.zeros(self.N, int)
        for code, p in ((1, 'DISC'), (2, 'VAL'), (3, 'OOS')):
            a, b = I.PER_B[p]
            per[np.asarray((A.index >= pd.Timestamp(a, tz='UTC')) & (A.index <= pd.Timestamp(b, tz='UTC')))] = code
        self.period = per
        self.lines = {c: L[c] for c in L.columns}
        self.beta20, self.coupled = {}, {}
        for c, s in self.lines.items():
            d1 = s.diff().values
            b20, _ = roll_sums(d1, r1, W20, W20 // 2)
            b5, c5 = roll_sums(d1, r1, W5, W5 // 2)
            self.beta20[c] = b20
            self.coupled[c] = (c5 ** 2 >= 0.02) & (np.sign(b5) == np.sign(b20)) & np.isfinite(b20) & np.isfinite(b5)


def find_events(xv, z0):
    cand = np.where(np.isfinite(xv) & (np.abs(xv) >= z0))[0]
    out, last = [], -10 ** 9
    for t in cand:
        if t - last >= COOL:
            out.append(t)
            last = t
    return np.array(out, int)


def add(acc, key, vals, dc, per, nd):
    a = acc.setdefault(key, [np.zeros(4 * nd), np.zeros(4 * nd), np.zeros(4)])
    comb = per * nd + dc
    a[0] += np.bincount(comb, weights=vals, minlength=4 * nd)
    a[1] += np.bincount(comb, minlength=4 * nd)
    a[2] += np.bincount(per, weights=(vals < 0).astype(float), minlength=4)


def run_pass(ctx, collect_key=None):
    acc, recs = {}, []
    LP, N, nd = ctx.LP, ctx.N, ctx.nd
    for name, s in ctx.lines.items():
        d1 = s.diff()
        sg = d1.rolling(W20, min_periods=W20 // 2).std().shift(1)
        for k in KB:
            xv = ((s - s.shift(k)) / (sg * np.sqrt(k))).values
            for z0 in Z0:
                ev = find_events(xv, z0)
                if not len(ev):
                    continue
                sx = np.sign(xv[ev])
                d = np.sign(ctx.beta20[name][ev, :]) * sx[:, None]
                cpl = ctx.coupled[name][ev, :]
                for m in MB:
                    okm = ev + m < N
                    if not okm.any():
                        continue
                    evm, dm, cm = ev[okm], d[okm], cpl[okm]
                    tc = evm + m
                    cr = dm * (LP[tc, :] - LP[evm, :]) / (ctx.sig[evm, :] * np.sqrt(m))
                    for h in HB:
                        okh = tc + h < N
                        if not okh.any():
                            continue
                        ret = np.where(okh[:, None], dm * (LP[np.minimum(tc + h, N - 1), :] - LP[tc, :]), np.nan)
                        net = ret - ctx.cost_rt[None, :]
                        for c in CB:
                            conf = (cr >= c) & np.isfinite(net) & np.isfinite(dm)
                            for st in STATES:
                                msk = conf & (cm if st == 'coupled' else True)
                                if not msk.any():
                                    continue
                                r_, c_ = np.where(msk)
                                key = (st, z0, k, m, c, h)
                                add(acc, key, net[r_, c_], ctx.dcode[tc[r_]], ctx.period[tc[r_]], nd)
                                if collect_key is not None and key == collect_key:
                                    recs.append(pd.DataFrame({'line': name, 'asset': np.array(ctx.cols)[c_], 'date': ctx.idx[tc[r_]], 'net': net[r_, c_]}))
                        if z0 == 1.5 and k == 16 and m in DM and h in DH:
                            for c in DC:
                                dv = (cr <= -c) & np.isfinite(ret) & np.isfinite(dm)
                                if not dv.any():
                                    continue
                                r_, c_ = np.where(dv)
                                for trade, sg_ in (('catchup', 1.0), ('breakdown', -1.0)):
                                    add(acc, ('div-' + trade, z0, k, m, c, h), sg_ * ret[r_, c_] - ctx.cost_rt[c_], ctx.dcode[tc[r_]], ctx.period[tc[r_]], nd)
    return acc, (pd.concat(recs) if recs else None)


def tabulate(acc, nd):
    rows = []
    for key, (sm, ct, ng) in acc.items():
        row = dict(trade=key[0], z0=key[1], k=key[2], m=key[3], c=key[4], h=key[5])
        for code, nm in ((1, 'DISC'), (2, 'VAL'), (3, 'OOS')):
            s_, c_ = sm[code * nd:(code + 1) * nd], ct[code * nd:(code + 1) * nd]
            n = c_.sum()
            if n >= 30:
                mean = s_.sum() / n
                se = np.sqrt(((s_ - mean * c_) ** 2).sum()) / n
                t = mean / se if se > 0 else np.nan
            else:
                mean = t = np.nan
            row[f'mean_{nm}'] = mean * 1e4
            row[f't_{nm}'] = t
            row[f'p_{nm}'] = stats.norm.sf(t) if np.isfinite(t) else np.nan
            row[f'n_{nm}'] = int(n)
            row[f'neg_{nm}'] = ng[code] / n if n else np.nan
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
            d.loc[cand.index[E.bh(cand.p_VAL.values)], 's2'] = True
    d['oos_pass'] = d.s2 & (d.mean_OOS > 0) & (d.p_OOS < 0.05)
    return d, dict(step1=int(d.s1.sum()), step2=int(d.s2.sum()), oos_pass=int(d.oos_pass.sum()), best_oos_mean_bp=float(d.loc[d.s2, 'mean_OOS'].max()) if d.s2.any() else np.nan)


def load():
    A = pd.read_parquet(PAN / 'intraday_assets.parquet')
    L = pd.read_parquet(PAN / 'intraday_lines_v2.parquet')
    return A, L


def one_draw(seed):
    A, L = load()
    rng = np.random.default_rng(7000 + seed)
    Ls = I.shifted_lines(L, rng)
    ctx = ICtx(A, Ls)
    acc, _ = run_pass(ctx)
    t = tabulate(acc, ctx.nd)
    d, c = pipeline_ep(t)
    return dict(draw=seed, **c), t[['trade', 'z0', 'k', 'm', 'c', 'h', 'mean_DISC', 'mean_VAL', 'mean_OOS', 'n_OOS']].assign(draw=seed)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--build', action='store_true')
    ap.add_argument('--run', action='store_true')
    ap.add_argument('--draws', type=int, default=200)
    ap.add_argument('--workers', type=int, default=8)
    a = ap.parse_args()
    if a.build:
        build()
    if a.run:
        A, L = load()
        ctx = ICtx(A, L)
        prim = ('coupled', 1.5, 16, 4, 0.5, 96)
        acc, recs = run_pass(ctx, collect_key=prim)
        tab = tabulate(acc, ctx.nd)
        d, c = pipeline_ep(tab)
        d.to_parquet(PAN / 'episodesB_cells.parquet')
        if recs is not None:
            recs.to_parquet(PAN / 'episodesB_primary_events.parquet')
        print('REAL intraday episodes:', c, 'specs', len(d), flush=True)
        with ProcessPoolExecutor(max_workers=a.workers) as ex:
            res = list(ex.map(one_draw, range(a.draws)))
        pl = pd.DataFrame([r[0] for r in res])
        pl.to_csv(PAN / 'episodesB_placebo.csv', index=False)
        pd.concat([r[1] for r in res]).to_parquet(PAN / 'episodesB_placebo_specs.parquet')
        print('PLACEBO', pl.describe().round(2).to_string(), flush=True)
        print('EPISODES_B_DONE', flush=True)
