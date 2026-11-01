#!/usr/bin/env python
"""fx-factor-stack: cross-sectional FX factors (carry, momentum, value 5y reversal, surprise momentum), dollar-neutral, 8 currencies.

Pre-registered in forge/FX_FACTOR_STACK_PREREG.md (2026-10-17) + Amendment A1 (2026-11-01, PRE-RESULTS). Seed 20261017.
Every rule below is the amendment's; nothing here was tuned on a result.

Usage:  python -I scripts/fx-factor-stack/run.py            (MFX_DATA_ROOT = checkout holding features/, default repo root)
        python -I scripts/fx-factor-stack/run.py --smoke    (synthetic data only: checks the machinery, reads no real outcome)
"""
import os
import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import rankdata, norm

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get('MFX_DATA_ROOT', ROOT))
OUT = ROOT / 'analysis/output/fx-factor-stack'
SEED = 20261017
START, END = pd.Timestamp('2005-01-01'), pd.Timestamp('2026-08-21')
OOS0, HALF = pd.Timestamp('2018-01-01'), pd.Timestamp('2022-01-01')
CCY = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']
PAIR = {'EUR': ('eurusd', 1), 'GBP': ('gbpusd', 1), 'AUD': ('audusd', 1), 'NZD': ('nzdusd', 1),
        'JPY': ('usdjpy', -1), 'CAD': ('usdcad', -1), 'CHF': ('usdchf', -1)}
SURP = {'US': 'USD', 'EU': 'EUR', 'GB': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 'NZ': 'NZD', 'CA': 'CAD', 'CH': 'CHF'}
FACTORS = ['carry', 'momentum', 'value', 'surprise']
ALL_ARMS = FACTORS + ['yieldspread']
TARGET_VOL = 0.10
B_BOOT, BLOCK, N_PLACEBO = 2000, 3, 1000
BARS = {'ic': 0.03, 'sharpe_factor': 0.3, 'sharpe_comb': 0.5, 'dd': 0.25, 'dsr': 0.95}


# ------------------------------------------------------------------ data
def first_print(rows):
    d = rows.copy()
    d['date'] = pd.to_datetime(d['date'])
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
    d = d.sort_values(['date', 'asof']).drop_duplicates('date', keep='first')
    return d


def eff_asof(d):
    """Addendum A: rows stamped with the 2013-06-03 bulk backfill are known 45 days after month end; others keep their asof."""
    bulk = d['asof'].dt.strftime('%Y-%m-%d').eq('2013-06-03')
    me = d['date'] + pd.offsets.MonthEnd(0)
    return pd.Series(np.where(bulk, me + pd.Timedelta(days=45), d['asof']), index=d.index)


def known_series(d, idx):
    """Value known at each date in idx: the latest reference month whose effective asof <= idx + 20h."""
    d = d.assign(eff=eff_asof(d)).sort_values('eff')
    eff, dt, val = d['eff'].to_numpy(), d['date'].to_numpy(), d['value'].astype(float).to_numpy()
    out = np.full(len(idx), np.nan)
    j, best_d, best_v = 0, None, np.nan
    for k, t in enumerate(idx):
        lim = np.datetime64(t + pd.Timedelta(hours=20))
        while j < len(d) and eff[j] <= lim:
            if best_d is None or dt[j] >= best_d:
                best_d, best_v = dt[j], val[j]
            j += 1
        out[k] = best_v
    return pd.Series(out, index=idx)


def daily_known(d, idx):
    d = d.copy()
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
    d['value'] = pd.to_numeric(d['value'], errors='coerce')
    d = d.dropna(subset=['value']).sort_values('asof')
    q = pd.DataFrame({'t': idx + pd.Timedelta(hours=20)})
    m = pd.merge_asof(q, d[['asof', 'value']], left_on='t', right_on='asof')
    return pd.Series(m['value'].to_numpy(), index=idx)


def load_prices():
    cols = {}
    for c, (p, sgn) in PAIR.items():
        d = pd.read_parquet(DATA / 'features' / f'px_d1_{p}.parquet')
        s = pd.Series(pd.to_numeric(d['value'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()
        s = s[~s.index.duplicated(keep='last')].sort_index()
        s = s[(s.index.dayofweek < 5) & (s.index <= END)]
        cols[c] = s
    px = pd.DataFrame(cols).sort_index()
    px = px.ffill(limit=5).dropna()
    return px


def load_rates(idx):
    f = DATA / 'features'
    R = {}
    for c in CCY:
        if c == 'USD':
            continue
        R[c] = known_series(first_print(pd.read_parquet(f / f'rate3m_{c.lower()}.parquet')), idx)
    # USD: 3m interbank to the 2013-06 reference month, then EFFR (A1.3)
    usd3 = known_series(first_print(pd.read_parquet(f / 'rate3m_usd.parquet')), idx)
    effr = daily_known(pd.read_parquet(f / 'effr.parquet'), idx)
    R['USD'] = usd3.where(idx < pd.Timestamp('2013-06-04'), effr)
    # EUR: EZ 3m through its last vintage (2026-02-16), then DE call money + offset (A1.3)
    ez = first_print(pd.read_parquet(f / 'rate3m_eur.parquet'))
    de = first_print(pd.read_parquet(f / 'rate_on_de.parquet'))
    both = ez.merge(de, on='date', suffixes=('_ez', '_de'))
    both = both.sort_values('date').tail(12)
    offset = float((both['value_ez'].astype(float) - both['value_de'].astype(float)).mean())
    de_known = known_series(de, idx) + offset
    cut = pd.Timestamp('2026-02-16')
    R['EUR'] = R['EUR'].where(idx <= cut, de_known)
    R['_eur_offset'] = offset
    R['_eur_splice_from'] = str(cut.date())
    return R


def load_y10(idx):
    f = DATA / 'features'
    out = {}
    try:
        for c in CCY:
            d = pd.read_parquet(f / f'y10_{c.lower()}.parquet')
            out[c] = daily_known(d, idx) if c == 'USD' else known_series(first_print(d), idx)
    except Exception as e:  # reported-only arm: absent data means the arm is skipped, stated in the results
        print('yield arm skipped:', e)
        return None
    return out


def load_spread_frac(px, rebs):
    sp = pd.read_parquet(DATA / 'features' / 'spread_profile.parquet')
    sp = sp[sp.hour.between(10, 19)]
    med = sp.groupby('pair')['mean'].median()
    frac = np.zeros((len(rebs), 8))
    for i, c in enumerate(CCY):
        if c == 'USD':
            continue
        p, _ = PAIR[c]
        pip = 0.01 if 'jpy' in p else 0.0001
        price = px[c].loc[rebs].to_numpy()                 # px[c] is the quoted pair price (USDxxx pairs too)
        frac[:, i] = 0.5 * float(med[p]) * pip / price
    return frac


def build_inputs():
    px = load_prices()
    idx = px.index
    spot = pd.DataFrame(0.0, index=idx, columns=CCY)
    for c, (p, sgn) in PAIR.items():
        spot[c] = sgn * np.log(px[c]).diff()
    spot = spot.fillna(0.0)
    R = load_rates(idx)
    rate = pd.DataFrame({c: R[c] for c in CCY}).ffill()
    carry_ann = rate.sub(rate['USD'], axis=0)
    days = pd.Series(idx, index=idx).diff().dt.days.fillna(1).to_numpy()
    accrual = carry_ann.shift(1).fillna(0.0).mul(days / 36500.0, axis=0)
    tot = spot + accrual
    cum_spot, cum_tot = spot.cumsum(), tot.cumsum()
    pos = pd.Series(np.arange(len(idx)), index=idx)
    me = pos.groupby([idx.year, idx.month]).max().to_numpy()                   # last trading day of each month
    me = me[(idx[me] >= START)]
    ent = me + 1                                                              # entry = close of the next trading day
    # a hold needs the next rebalance's entry day inside the window
    keep = [m for m in range(len(me) - 1) if ent[m + 1] < len(idx) and idx[ent[m + 1]] <= END]
    pm = me[keep]
    reb = idx[pm]
    Rm = np.array([tot.iloc[ent[m] + 1: ent[m + 1] + 1].sum().to_numpy() for m in keep])
    Rm3 = np.full_like(Rm, np.nan)
    for k, m in enumerate(keep):
        if m + 3 < len(me) and ent[m + 3] < len(idx) and idx[ent[m + 3]] <= END:
            Rm3[k] = tot.iloc[ent[m] + 1: ent[m + 3] + 1].sum().to_numpy()
    # EWMA covariance (lambda .94), data <= each rebalance close
    X = tot.to_numpy()
    cov = np.zeros((8, 8)); lam = 0.94
    covs, pset = {}, set(int(p) for p in pm)
    for i in range(len(idx)):
        cov = lam * cov + (1 - lam) * np.outer(X[i], X[i])
        if i in pset:
            covs[i] = cov.copy()
    Sig = np.array([covs[int(p)] for p in pm])
    # ---- scores
    Mn = len(pm)
    Sc = {k: np.full((Mn, 8), np.nan) for k in ALL_ARMS}
    Sc['carry'] = carry_ann.iloc[pm].to_numpy()
    def zrow(a):
        sd = np.nanstd(a)
        return (a - np.nanmean(a)) / sd if sd > 0 else a * 0
    cs = cum_tot.to_numpy()
    mom = np.full((Mn, 8), np.nan)
    for k, p in enumerate(pm):
        if p >= 252:
            w1, w3, w12 = cs[p] - cs[p - 21], cs[p] - cs[p - 63], cs[p - 21] - cs[p - 252]
            mom[k] = (zrow(w1) + zrow(w3) + zrow(w12)) / 3
    Sc['momentum'] = mom
    sp = cum_spot.to_numpy()
    val = np.full((Mn, 8), np.nan)
    for k, p in enumerate(pm):
        if p >= 1260:
            val[k] = -(sp[p] - sp[p - 1260])
    Sc['value'] = val
    # surprise momentum: half-life 91d, neutral if < 3 distinct series in the trailing 91d
    s = pd.read_parquet(DATA / 'features' / 'surprises.parquet')
    s['asof'] = pd.to_datetime(s['asof'], utc=True).dt.tz_localize(None)
    s['v'] = pd.to_numeric(s['value'], errors='coerce')
    s = s[np.isfinite(s['v']) & s['ccy'].isin(SURP) & (s['asof'] <= END + pd.Timedelta(days=1))]
    sur = np.full((Mn, 8), np.nan)
    for k, p in enumerate(pm):
        t = idx[p] + pd.Timedelta(hours=20)
        w = s[(s['asof'] <= t) & (s['asof'] > t - pd.Timedelta(days=365))]
        for ccy_code, c in SURP.items():
            wc = w[w['ccy'] == ccy_code]
            recent = wc[wc['asof'] > t - pd.Timedelta(days=91)]
            if recent['series'].nunique() < 3:
                continue
            age = (t - wc['asof']).dt.total_seconds().to_numpy() / 86400.0
            sur[k, CCY.index(c)] = float((wc['v'].to_numpy() * 0.5 ** (age / 91.0)).sum())
    Sc['surprise'] = sur
    # reported-only arm
    y = load_y10(idx)
    if y is not None:
        spr = pd.DataFrame({c: y[c] - y['USD'] for c in CCY}).ffill()
        full = spr.iloc[[int(p) for p in me]].copy()
        full.index = idx[me]
        mu, sd = full.rolling(60, min_periods=36).mean(), full.rolling(60, min_periods=36).std()
        z = (full - mu) / sd
        Sc['yieldspread'] = (-z.reindex(reb)).to_numpy()
        Sc['yieldspread'][:, 0] = np.where(np.isfinite(Sc['yieldspread'][:, 1:]).sum(axis=1) >= 4, 0.0, np.nan)
    # EUR-neutral sensitivity (Addendum A rule) for the carry score after the EUR 3m vintage ends
    carry_eurneutral = Sc['carry'].copy()
    carry_eurneutral[reb > pd.Timestamp(R['_eur_splice_from']), CCY.index('EUR')] = 0.0
    cost_c = load_spread_frac(px, reb)
    # daily OOS correlation of the seven non-USD currencies (effective-N haircut)
    oos_days = (idx >= OOS0) & (idx <= END)
    corr = np.corrcoef(tot.loc[oos_days, CCY[1:]].to_numpy().T)
    lam_e = np.linalg.eigvalsh(corr)
    m_eff = float(lam_e.sum() ** 2 / (lam_e ** 2).sum())
    return dict(reb=reb, Sc=Sc, Rm=Rm, Rm3=Rm3, Sig=Sig, cost=cost_c, m_eff=m_eff, carry_eurneutral=carry_eurneutral,
                meta=dict(eur_offset=R['_eur_offset'], eur_splice_from=R['_eur_splice_from'], first_px=str(idx[0].date()), last_px=str(idx[-1].date())))


# ------------------------------------------------------------------ machinery
def active_mask(S, minn=4):
    return np.isfinite(S).sum(axis=-1) >= minn


def make_book(S, act, Sig, Rm, cost):
    """S: (D,M,8) scores (NaN = neutral, set to 0). Returns weights (D,M,8), gross (D,M), cost (D,M)."""
    S0 = np.where(np.isfinite(S), S, 0.0)
    w = (rankdata(S0, axis=-1) - 4.5) * act[..., None]
    var = np.einsum('dmi,mij,dmj->dm', w, Sig, w) * 252
    scale = np.where(var > 1e-14, TARGET_VOL / np.sqrt(np.maximum(var, 1e-14)), 0.0)
    w = w * scale[..., None]
    gross = np.einsum('dmi,mi->dm', w, Rm)
    dw = np.abs(np.diff(w, axis=1, prepend=np.zeros_like(w[:, :1])))
    c = np.einsum('dmi,mi->dm', dw, cost)
    return w, gross, c


def combine(Ws, nets, acts, Sig, Rm, cost):
    """Equal-risk blend (inverse 24m vol of each factor's net book), then rescale to 10%. Ws (K,D,M,8), nets (K,D,M), acts (K,M)."""
    K, D, M, _ = Ws.shape
    Wc = np.zeros((D, M, 8))
    for m in range(M):
        avail = acts[:, m]
        if not avail.any():
            continue
        a = np.zeros((K, D))
        for k in range(K):
            if not avail[k]:
                continue
            lo = max(0, m - 24)
            hist = nets[k, :, lo:m][:, acts[k, lo:m]]
            if hist.shape[1] >= 12:
                a[k] = 1.0 / np.maximum(hist.std(axis=1, ddof=1), 1e-9)
            else:
                a[k] = np.nan
        if np.isnan(a).any() or a.sum() == 0:
            a = np.where(avail[:, None], 1.0, 0.0) * np.ones((K, D))
        a = a / a.sum(axis=0, keepdims=True)
        Wc[:, m] = np.einsum('kd,kdi->di', a, Ws[:, :, m])
    var = np.einsum('dmi,mij,dmj->dm', Wc, Sig, Wc) * 252
    scale = np.where(var > 1e-14, TARGET_VOL / np.sqrt(np.maximum(var, 1e-14)), 0.0)
    Wc = Wc * scale[..., None]
    gross = np.einsum('dmi,mi->dm', Wc, Rm)
    dw = np.abs(np.diff(Wc, axis=1, prepend=np.zeros_like(Wc[:, :1])))
    c = np.einsum('dmi,mi->dm', dw, cost)
    return Wc, gross, c


def monthly_ic(S, Rm, act):
    ic = np.full(S.shape[0], np.nan)
    for m in range(S.shape[0]):
        if not act[m]:
            continue
        s = np.where(np.isfinite(S[m]), S[m], 0.0)
        a, b = rankdata(s), rankdata(Rm[m])
        if a.std() > 0 and b.std() > 0:
            ic[m] = np.corrcoef(a, b)[0, 1]
    return ic


def sharpe(x):
    x = np.asarray(x, float)
    return float(x.mean() / x.std(ddof=1) * np.sqrt(12)) if len(x) > 2 and x.std(ddof=1) > 0 else np.nan


def maxdd(x):
    eq = np.cumprod(1 + np.asarray(x, float))
    return float(np.max(1 - eq / np.maximum.accumulate(eq)))


def boot_idx(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, n - BLOCK + 1, size=(B_BOOT, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B_BOOT, -1)[:, :n]


def haircut_ci(est, samples, hc):
    lo, hi = np.percentile(samples, [2.5, 97.5])
    return float(est - hc * (est - lo)), float(est + hc * (hi - est))


def dsr(x, trial_srs, N):
    x = np.asarray(x, float); T = len(x)
    sr = x.mean() / x.std(ddof=1)
    z = (x - x.mean()) / x.std(ddof=1)
    sk, ku = float((z ** 3).mean()), float((z ** 4).mean())
    emc = 0.5772156649
    v = float(np.var(trial_srs, ddof=1))
    sr0 = np.sqrt(v) * ((1 - emc) * norm.ppf(1 - 1 / N) + emc * norm.ppf(1 - 1 / (N * np.e)))
    den = np.sqrt(max(1 - sk * sr + (ku - 1) / 4 * sr ** 2, 1e-9))
    return float(norm.cdf((sr - sr0) * np.sqrt(T - 1) / den))


def analyze(I, rng):
    reb, Sc, Rm, Rm3, Sig, cost = I['reb'], I['Sc'], I['Rm'], I['Rm3'], I['Sig'], I['cost']
    M = len(reb)
    oos = reb >= pd.Timestamp('2017-12-01')                      # rebalances from 2017-12-29 give Jan-2018 onward
    oos = np.array(oos) & np.array(reb <= pd.Timestamp('2026-07-15'))
    is_ = np.array(reb < pd.Timestamp('2017-12-01'))
    h1 = oos & np.array(reb < pd.Timestamp('2021-12-01'))
    h2 = oos & ~h1
    hc = float(np.sqrt(7.0 / I['m_eff']))
    ob = np.where(oos)[0]
    bi = boot_idx(len(ob), rng)
    res = {'n_oos': int(oos.sum()), 'n_is': int(is_.sum()), 'm_eff': I['m_eff'], 'haircut': hc, 'arms': {}}
    arms = {k: Sc[k] for k in ALL_ARMS if k in Sc and np.isfinite(Sc[k]).any()}
    arms['carry_eurneutral'] = I['carry_eurneutral']
    acts = {k: active_mask(v) for k, v in arms.items()}
    W, G, C, N = {}, {}, {}, {}
    for k, S in arms.items():
        w, g, c = make_book(S[None], acts[k], Sig, Rm, cost)
        W[k], G[k], C[k] = w, g, c
        N[k] = g - c
    # combined book over the four factors
    Ws = np.stack([W[k] for k in FACTORS]); Ns = np.stack([N[k] for k in FACTORS]); Ac = np.stack([acts[k] for k in FACTORS])
    Wc, gc, cc = combine(Ws, Ns, Ac, Sig, Rm, cost)
    G['stack'], C['stack'], N['stack'] = gc, cc, gc - cc
    # carry book with the EUR-neutral score feeds a second blend (sensitivity)
    Ws2 = np.stack([W['carry_eurneutral']] + [W[k] for k in FACTORS[1:]]); Ns2 = np.stack([N['carry_eurneutral']] + [N[k] for k in FACTORS[1:]])
    _, g2, c2 = combine(Ws2, Ns2, Ac, Sig, Rm, cost)
    N['stack_eurneutral'] = g2 - c2
    ics = {k: monthly_ic(arms[k], Rm, acts[k]) for k in arms}
    ic3 = {k: monthly_ic(arms[k], np.where(np.isfinite(Rm3), Rm3, 0.0), acts[k] & np.isfinite(Rm3).all(axis=1)) for k in arms}
    # baselines
    dollar = Rm[:, 1:].mean(axis=1)
    # placebos (permute each factor's score vector within month; same construction and costs)
    D = N_PLACEBO
    pl = {}
    permsS = {}
    for k in FACTORS:
        S = arms[k]
        idxp = np.argsort(rng.random((D, M, 8)), axis=-1)
        permsS[k] = np.take_along_axis(np.broadcast_to(S, (D, M, 8)), idxp, axis=-1)
        w, g, c = make_book(permsS[k], acts[k], Sig, Rm, cost)
        permsS[k] = (w, g - c)
        pl[k] = np.array([sharpe((g - c)[d][oos]) for d in range(D)])
    Wp = np.stack([permsS[k][0] for k in FACTORS]); Np = np.stack([permsS[k][1] for k in FACTORS])
    _, gp, cp = combine(Wp, Np, Ac, Sig, Rm, cost)
    pl['stack'] = np.array([sharpe((gp - cp)[d][oos]) for d in range(D)])
    # per-arm results
    for k in list(arms) + ['stack', 'stack_eurneutral']:
        x = N[k][0] if N[k].ndim == 2 else N[k]
        xo = x[oos]
        r = {'sharpe_net_oos': sharpe(xo), 'sharpe_gross_oos': sharpe(G[k][0][oos]) if k in G else None,
             'sharpe_net_is': sharpe(x[is_ & acts.get(k, acts['carry'])]) if (is_ & acts.get(k, acts['carry'])).sum() > 6 else None,
             'sharpe_half1': sharpe(x[h1]), 'sharpe_half2': sharpe(x[h2]), 'mean_half1': float(x[h1].mean()), 'mean_half2': float(x[h2].mean()),
             'maxdd_oos': maxdd(xo), 'ann_ret_oos': float(xo.mean() * 12), 'n_oos': int(len(xo))}
        sb = np.array([sharpe(xo[i]) for i in bi])
        r['sharpe_ci_haircut'] = haircut_ci(r['sharpe_net_oos'], sb[np.isfinite(sb)], hc)
        if k in ics:
            ic = ics[k][oos]; ic = ic[np.isfinite(ic)]
            r['n_ic_oos'] = int(len(ic))
            r['ic_oos'] = float(ic.mean())
            ib = bi[:, :len(ic)] if len(ic) == len(ob) else boot_idx(len(ic), rng)
            r['ic_ci_haircut'] = haircut_ci(r['ic_oos'], ic[ib].mean(axis=1), hc)
            r['ic_half1'] = float(np.nanmean(ics[k][h1])); r['ic_half2'] = float(np.nanmean(ics[k][h2]))
            r['ic_is'] = float(np.nanmean(ics[k][is_])) if np.isfinite(ics[k][is_]).any() else None
            i3 = ic3[k][oos]; i3 = i3[np.isfinite(i3)]
            r['ic3_oos'] = float(i3.mean()) if len(i3) else None
            r['neutral_currency_months_oos'] = int((~np.isfinite(arms[k][oos])).sum())
            r['active_months_oos'] = int(acts[k][oos].sum())
        if k in pl:
            r['placebo_p95'] = float(np.percentile(pl[k][np.isfinite(pl[k])], 95)); r['placebo_mean'] = float(np.nanmean(pl[k]))
            r['beats_placebo'] = bool(r['sharpe_net_oos'] > r['placebo_p95'])
        res['arms'][k] = r
    # mirror: reversed weights, same bars
    for k in FACTORS:
        x = (-G[k][0] - C[k][0])[oos]
        ic = -ics[k][oos]; ic = ic[np.isfinite(ic)]
        sbm = np.array([sharpe(x[i]) for i in bi]); lo, hi = haircut_ci(sharpe(x), sbm[np.isfinite(sbm)], hc)
        ib = bi[:, :len(ic)] if len(ic) == len(ob) else boot_idx(len(ic), rng)
        icl, _ = haircut_ci(float(ic.mean()), ic[ib].mean(axis=1), hc)
        res['arms'][k]['mirror_passes'] = bool(float(ic.mean()) > BARS['ic'] and icl > 0 and sharpe(x) > BARS['sharpe_factor'])
        res['arms'][k]['mirror_sharpe'] = sharpe(x)
    # bars and verdicts
    for k in FACTORS:
        r = res['arms'][k]
        icl, ich = r['ic_ci_haircut']; sl, sh = r['sharpe_ci_haircut']
        passes = (r['ic_oos'] > BARS['ic'] and icl > 0 and np.sign(r['ic_half1']) == np.sign(r['ic_half2']) == 1
                  and r['sharpe_net_oos'] > BARS['sharpe_factor'] and r['beats_placebo'] and not r['mirror_passes'])
        null = (ich < BARS['ic']) or (sh < BARS['sharpe_factor'])
        r['bars_pass'] = bool(passes); r['verdict'] = 'VALIDATED' if passes else ('NULL' if null else 'UNDERPOWERED')
    srs = [res['arms'][k]['sharpe_net_oos'] / np.sqrt(12) for k in FACTORS] + [res['arms']['stack']['sharpe_net_oos'] / np.sqrt(12)]
    xs = N['stack'][0][oos]
    st = res['arms']['stack']
    st['dsr_n5'] = dsr(xs, srs, 5)
    yo = res['arms'].get('yieldspread')
    srs6 = srs + ([yo['sharpe_net_oos'] / np.sqrt(12)] if yo else [srs[-1]])
    st['dsr_n6'] = dsr(xs, srs6, 6)
    sl, sh = st['sharpe_ci_haircut']
    spass = (st['sharpe_net_oos'] > BARS['sharpe_comb'] and st['dsr_n5'] >= BARS['dsr'] and st['maxdd_oos'] < BARS['dd']
             and st['mean_half1'] > 0 and st['mean_half2'] > 0 and st['beats_placebo'])
    st['bars_pass'] = bool(spass)
    st['verdict'] = 'VALIDATED' if spass else ('NULL' if sh < BARS['sharpe_comb'] else 'UNDERPOWERED')
    # baselines
    do = dollar[oos]
    res['baselines'] = {'dollar_basket_sharpe_oos': sharpe(do), 'dollar_basket_ann_ret_oos': float(do.mean() * 12),
                        'stack_corr_dollar': float(np.corrcoef(xs, do)[0, 1]),
                        'stack_beta_dollar': float(np.cov(xs, do)[0, 1] / np.var(do, ddof=1)),
                        'carry_alone_sharpe_oos': res['arms']['carry']['sharpe_net_oos']}
    xc = N['carry'][0][oos]
    diff = np.array([sharpe(xs[i]) - sharpe(xc[i]) for i in bi])
    d0 = sharpe(xs) - sharpe(xc)
    res['baselines']['stack_minus_carry_sharpe'] = d0
    res['baselines']['stack_minus_carry_ci_haircut'] = haircut_ci(d0, diff[np.isfinite(diff)], hc)
    res['stopping_rule'] = {'fires': bool(st['verdict'] == 'NULL' and not any(res['arms'][k]['verdict'] == 'VALIDATED' for k in FACTORS))}
    res['_series'] = {'reb': [str(d.date()) for d in reb], 'oos': oos.tolist(), 'net': {k: (N[k][0] if N[k].ndim == 2 else N[k]).tolist() for k in ['stack'] + list(arms)}}
    return res


# ------------------------------------------------------------------ synthetic smoke test (no real outcome is read)
def synth(planted):
    rng = np.random.default_rng(1)
    M = 260
    reb = pd.date_range('2005-01-31', periods=M, freq='ME')
    Sc = {k: rng.normal(size=(M, 8)) for k in ALL_ARMS}
    for k in ALL_ARMS:
        Sc[k][:, 0] = 0.0
    sig = 0.02 / np.sqrt(21)
    A = rng.normal(size=(8, 8)) * 0.3 + np.eye(8); Sg = A @ A.T * (0.07 / np.sqrt(252)) ** 2
    Sg[0, :] = 0; Sg[:, 0] = 0
    Rm = rng.multivariate_normal(np.zeros(8), Sg * 21, size=M)
    if planted:
        Rm += 0.004 * Sc['carry']
    Rm[:, 0] = 0.0
    I = dict(reb=reb, Sc=Sc, Rm=Rm, Rm3=np.full_like(Rm, np.nan), Sig=np.array([Sg] * M), cost=np.full((M, 8), 1e-5), m_eff=3.0,
             carry_eurneutral=Sc['carry'].copy(), meta={})
    return I


if __name__ == '__main__':
    rng = np.random.default_rng(SEED)
    if '--smoke' in sys.argv:
        for planted in (False, True):
            r = analyze(synth(planted), np.random.default_rng(SEED))
            print('planted' if planted else 'random ', {k: (round(v['ic_oos'], 3), round(v['sharpe_net_oos'], 2), v['verdict']) for k, v in r['arms'].items() if k in FACTORS},
                  'stack', round(r['arms']['stack']['sharpe_net_oos'], 2), r['arms']['stack']['verdict'])
        sys.exit(0)
    I = build_inputs()
    res = analyze(I, rng)
    res['meta'] = I['meta']
    res['seed'] = SEED
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'results.json').write_text(json.dumps(res, indent=1, default=float))
    print(json.dumps({k: {x: v for x, v in r.items() if x in ('verdict', 'ic_oos', 'ic_ci_haircut', 'sharpe_net_oos', 'sharpe_ci_haircut', 'dsr_n5')} for k, r in res['arms'].items()}, indent=1, default=float))
    print(json.dumps(res['baselines'], indent=1, default=float))
