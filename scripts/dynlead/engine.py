"""COG-DYNAMIC-LEAD engine (forge/COG_DYNAMIC_LEAD_PREREG.md): rolling, real-time-gated spread -> asset lead tests, family M and family D.
Everything here is causal: the relationship estimate at date t uses only pairs whose outcome window has ended by t."""
import numpy as np
import pandas as pd
from scipy import stats
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAN = ROOT / 'analysis' / 'output' / 'dynlead'
K_LIST, H_LIST, W_LIST = (1, 5, 20), (1, 2, 5, 10, 20), (250, 500)
PERIODS = {'DISC': ('2017-01-01', '2020-12-31'), 'VAL': ('2021-01-01', '2023-12-31'), 'OOS': ('2024-01-01', '2026-08-20')}
COST_BP = {}
for a in ('EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'):
    COST_BP[a] = 0.8
for a in ('EURGBP', 'EURJPY', 'EURCHF'):
    COST_BP[a] = 1.2
COST_BP['GOLD'] = 2.5
for a in ('SPX500', 'US30', 'US2000', 'NAS100', 'DE30', 'UK100'):
    COST_BP[a] = 1.5
SPREADS = {
    'US-DE 1Y': ('US1', 'DE1'), 'US-DE 2Y': ('US2', 'DE2'), 'US-DE 5Y': ('US5', 'DE5'), 'US-DE 10Y': ('US10', 'DE10'), 'US-DE 30Y': ('US30', 'DE30'),
    'US-JP 2Y': ('US2', 'JP2'), 'US-JP 5Y': ('US5', 'JP5'), 'US-JP 10Y': ('US10', 'JP10'), 'US-JP 30Y': ('US30', 'JP30'),
    'DE-JP 2Y': ('DE2', 'JP2'), 'DE-JP 5Y': ('DE5', 'JP5'), 'DE-JP 10Y': ('DE10', 'JP10'), 'DE-JP 30Y': ('DE30', 'JP30'),
    'US-GB 10Y': ('US10', 'GB10'), 'DE-GB 10Y': ('DE10', 'GB10'),
    'US slope 10-2': ('US10', 'US2'), 'DE slope 10-2': ('DE10', 'DE2'), 'JP slope 10-2': ('JP10', 'JP2'), 'US slope 30-10': ('US30', 'US10'), 'DE slope 30-10': ('DE30', 'DE10'),
    'US2 - US3M': ('US2', 'US3M'),
}
OUTRIGHTS = ['US2', 'US10', 'DE2', 'DE10', 'JP10']


def load():
    ad = pd.read_parquet(PAN / 'assets_daily.parquet')
    ad = ad[(ad.index >= '2016-01-01') & (ad.index <= '2026-08-20')]
    yd = pd.read_parquet(PAN / 'yields_daily.parquet')
    full = yd.index.union(ad.index)
    yd = yd.reindex(full).ffill(limit=3).reindex(ad.index)
    S = {n: (yd[a] - yd[b]) for n, (a, b) in SPREADS.items()}
    S['(US10-US2) - (DE10-DE2)'] = (yd['US10'] - yd['US2']) - (yd['DE10'] - yd['DE2'])
    S['(US10-US2) - (JP10-JP2)'] = (yd['US10'] - yd['US2']) - (yd['JP10'] - yd['JP2'])
    for o in OUTRIGHTS:
        S[o] = yd[o]
    return ad, yd, S


def make_x(S, k):
    d1 = S.diff()
    sig = d1.rolling(250, min_periods=120).std().shift(1)
    return (S - S.shift(k)) / (sig * np.sqrt(k))


def period_mask(idx, p):
    a, b = PERIODS[p]
    return np.asarray((idx >= pd.Timestamp(a)) & (idx <= pd.Timestamp(b)))


def nw_stats(P, mask, lag):
    """P: DataFrame of daily net P&L (NaN = not valid). Returns arrays over columns: sharpe, one-sided Newey-West p (mean > 0), n, mean."""
    V = P.values[mask]
    n = np.sum(np.isfinite(V), axis=0).astype(float)
    with np.errstate(all='ignore'):
        mean = np.nansum(V, axis=0) / n
        e = V - mean
        e0 = np.where(np.isfinite(e), e, 0.0)
        g0 = (e0 * e0).sum(0) / n
        lrv = g0.copy()
        for l in range(1, lag + 1):
            gl = (e0[l:] * e0[:-l]).sum(0) / n
            lrv += 2 * (1 - l / (lag + 1)) * gl
        se = np.sqrt(np.maximum(lrv, 1e-18) / n)
        t = mean / se
        sd = np.sqrt(g0)
        sharpe = mean / sd * np.sqrt(252)
    p = stats.norm.sf(t)
    return sharpe, p, n, mean


def family_M(ad, S, want_pnl=False, k_list=K_LIST, h_list=H_LIST, w_list=W_LIST):
    """Returns a DataFrame with one row per (spread, asset, k, h, W) and net Sharpe / p / n for DISC, VAL, OOS."""
    LP = np.log(ad)
    idx = ad.index
    r_next = (LP.shift(-1) - LP)
    cost = np.array([COST_BP.get(c, 2.0) for c in ad.columns]) / 2e4            # half the round trip, as a fraction
    ys = {h: (LP.shift(-h) - LP) for h in h_list}
    masks = {p: period_mask(idx, p) for p in PERIODS}
    rows = []
    store = {}
    for sname, s in S.items():
        for k in k_list:
            x = make_x(s, k)
            xc = x.clip(-2, 2) / 2
            for h in h_list:
                yh = ys[h]
                for W in w_list:
                    roll = yh.rolling(W, min_periods=int(0.8 * W)).corr(x).shift(h)      # relationship estimate available at t: pairs completed by t
                    valid = roll.notna()
                    thr = 2.0 / np.sqrt(W / h)
                    active = roll.abs() >= thr
                    pos = (np.sign(roll) * xc.values[:, None] * active).fillna(0.0)
                    eff = pos.rolling(h, min_periods=1).mean() if h > 1 else pos
                    turn = eff.diff().abs().fillna(0.0)
                    pnl = (eff * r_next - turn * cost).where(valid & r_next.notna() & x.notna().values[:, None])
                    out = {}
                    for p, m in masks.items():
                        out[p] = nw_stats(pnl, m, h + 4)
                    for ai, a in enumerate(ad.columns):
                        rows.append((sname, a, k, h, W, out['DISC'][0][ai], out['DISC'][1][ai], out['DISC'][2][ai], out['VAL'][0][ai], out['VAL'][1][ai], out['VAL'][2][ai], out['OOS'][0][ai], out['OOS'][1][ai], out['OOS'][2][ai]))
                    if want_pnl:
                        store[(sname, k, h, W)] = pnl
    cols = ['spread', 'asset', 'k', 'h', 'W', 'sh_DISC', 'p_DISC', 'n_DISC', 'sh_VAL', 'p_VAL', 'n_VAL', 'sh_OOS', 'p_OOS', 'n_OOS']
    return (pd.DataFrame(rows, columns=cols), store) if want_pnl else pd.DataFrame(rows, columns=cols)


def bh(p, q=0.10):
    p = np.asarray(p, float)
    ok = np.isfinite(p)
    keep = np.zeros(len(p), bool)
    pv = np.where(ok, p, 1.0)
    o = np.argsort(pv)
    thr = q * np.arange(1, len(p) + 1) / max(1, ok.sum())
    passed = pv[o] <= thr
    if passed.any():
        keep[o[:np.max(np.where(passed)[0]) + 1]] = True
    return keep & ok


def pipeline(df, min_n=200):
    """Steps 1-3 of the registered protocol. Returns the frame with flags and the counts."""
    d = df.copy()
    d['s1'] = bh(np.where(d.n_DISC >= min_n, d.p_DISC, np.nan)) & (d.sh_DISC > 0)
    s1 = d[d.s1]
    d['s2'] = False
    if len(s1):
        ok = (s1.sh_VAL > 0) & (s1.p_VAL < 0.05) & (s1.n_VAL >= 200)
        cand = s1[ok]
        if len(cand):
            keep = bh(cand.p_VAL.values)
            d.loc[cand.index[keep], 's2'] = True
    d['oos_pass'] = d.s2 & (d.sh_OOS > 0) & (d.p_OOS < 0.05)
    return d, dict(step1=int(d.s1.sum()), step2=int(d.s2.sum()), oos_pass=int(d.oos_pass.sum()), best_oos_sharpe=float(d.loc[d.s2, 'sh_OOS'].max()) if d.s2.any() else np.nan)


def shifted_spreads(S, rng):
    """Selection-aware placebo: circularly shift each spread's 1-day-change series by an independent random lag, rebuild the level from it (no seam jump)."""
    out = {}
    n = len(next(iter(S.values())))
    for name, s in S.items():
        d1 = s.diff().fillna(0.0).values
        sh = int(rng.integers(750, max(751, n - 750)))
        out[name] = pd.Series(np.cumsum(np.roll(d1, sh)), index=s.index).where(s.notna())
    return out


D_K, D_H = (5, 20), (5, 10, 20)


def family_D(ad, S, spreads=None):
    """Divergence / catch-up. e(t) = r_k(t) - beta_roll(t-1) * dS_k(t); position = -clip(z_e, -2, 2)/2, scored separately in a high-R2 state (relationship strong) and a low-R2 state (relationship broken)."""
    LP = np.log(ad)
    idx = ad.index
    r_next = (LP.shift(-1) - LP)
    cost = np.array([COST_BP.get(c, 2.0) for c in ad.columns]) / 2e4
    masks = {p: period_mask(idx, p) for p in PERIODS}
    names = [n for n in S if n not in OUTRIGHTS] if spreads is None else spreads
    rows = []
    W = 250
    for sname in names:
        s = S[sname]
        for k in D_K:
            dS = s - s.shift(k)
            rk = LP - LP.shift(k)
            cov = rk.rolling(W, min_periods=200).cov(dS)
            var = dS.rolling(W, min_periods=200).var()
            beta = cov.div(var, axis=0).shift(1)
            corr = rk.rolling(W, min_periods=200).corr(dS)
            R2 = (corr ** 2).shift(1)
            e = rk - beta.mul(dS, axis=0)
            sig = e.rolling(W, min_periods=200).std().shift(1)
            z = (e / sig).clip(-2, 2) / 2
            hi = R2.ge(R2.rolling(500, min_periods=250).quantile(0.667))
            for state, st_mask in (('high R2', hi & R2.notna()), ('low R2', (~hi) & R2.notna())):
                base_pos = (-z * st_mask).fillna(0.0)
                valid = R2.notna() & z.notna()
                for h in D_H:
                    eff = base_pos.rolling(h, min_periods=1).mean()
                    turn = eff.diff().abs().fillna(0.0)
                    pnl = (eff * r_next - turn * cost).where(valid & r_next.notna())
                    out = {p: nw_stats(pnl, m, h + 4) for p, m in masks.items()}
                    for ai, a in enumerate(ad.columns):
                        rows.append((sname, a, k, h, state, out['DISC'][0][ai], out['DISC'][1][ai], out['DISC'][2][ai], out['VAL'][0][ai], out['VAL'][1][ai], out['VAL'][2][ai], out['OOS'][0][ai], out['OOS'][1][ai], out['OOS'][2][ai]))
    cols = ['spread', 'asset', 'k', 'h', 'state', 'sh_DISC', 'p_DISC', 'n_DISC', 'sh_VAL', 'p_VAL', 'n_VAL', 'sh_OOS', 'p_OOS', 'n_OOS']
    return pd.DataFrame(rows, columns=cols)
