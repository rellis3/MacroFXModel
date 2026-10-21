"""net-liquidity-tailwind — forge/NET_LIQUIDITY_TAILWIND_PREREG.md.

C.OG: "Net Liquidity = Fed Balance Sheet − TGA − RRP ... When it's rising, risk assets have a tailwind."
Weekly (Friday 21:00 UTC), point-in-time from the feature store (first-published vintages, asof <= t).
NL(w) = WALCL/1000 − WTREGEN/1000 − RRP   ($bn; units per js/netLiquidity.js)
Signal: ΔNL4 = NL(latest known Wednesday) − NL(4 Wednesdays earlier); rising = ΔNL4 > 0.
Outcome: log return x100, Friday close -> close 20 trading days later. Stat: mean(rising) − mean(falling).

Run: python scripts/net-liquidity-tailwind/run.py
"""
import json, math, os, re, urllib.request
import numpy as np
import pandas as pd

SEED = 20261021
B = 2000
BLOCK = 8
H = 20
USEFUL = 1.0
LOCKBOX = pd.Timestamp('2026-08-21')
SPLIT = pd.Timestamp('2019-01-01')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'net-liquidity-tailwind')
os.makedirs(OUT, exist_ok=True)


def feat(fid):
    df = pd.read_parquet(os.path.join(ROOT, 'features', f'{fid}.parquet'))
    df['date'] = pd.to_datetime(df['date'])
    df['asof'] = pd.to_datetime(df['asof'], utc=True).dt.tz_localize(None)
    return df


def first_published(df):
    """one row per observation date: the earliest vintage (its value and asof)"""
    return df.sort_values(['date', 'asof']).drop_duplicates('date', keep='first').set_index('date')[['value', 'asof']]


def prices(fid):
    df = feat(fid).drop_duplicates('date').set_index('date').sort_index()
    return df['value']


def build_nl(walcl, tga, rrp):
    """NL per H.4.1 Wednesday with the asof at which ALL three legs were known."""
    w = walcl.join(tga, lsuffix='_w', rsuffix='_t', how='inner')
    r = rrp.sort_index()
    rows = []
    for d, x in w.iterrows():
        rr = r[r.index <= d]
        if not len(rr):
            continue
        rv, ra = rr['value'].iloc[-1], rr['asof'].iloc[-1]
        rows.append({'date': d, 'nl': x.value_w / 1000 - x.value_t / 1000 - rv, 'asof': max(x.asof_w, x.asof_t, ra)})
    return pd.DataFrame(rows).set_index('date').sort_index()


def weekly_panel(nl, px, lag_weeks=0):
    fr = pd.date_range('2011-07-01', LOCKBOX, freq='W-FRI')
    pidx = px.index
    rows = []
    for f in fr:
        t = f + pd.Timedelta(hours=21)
        known = nl[nl['asof'] <= t]
        if len(known) < 6:
            continue
        if lag_weeks:
            known = known.iloc[:-lag_weeks] if len(known) > lag_weeks + 5 else known.iloc[:0]
            if not len(known):
                continue
        w0 = known.index[-1]
        prev = known[known.index <= w0 - pd.Timedelta(days=28)]
        if not len(prev) or (w0 - prev.index[-1]).days > 35:
            continue
        d4 = known['nl'].iloc[-1] - prev['nl'].iloc[-1]
        i = pidx.searchsorted(f, side='right') - 1           # Friday close (or last close before)
        if i < 0 or i + H >= len(pidx) or pidx[i + H] > LOCKBOX:
            continue
        p0 = px.iloc[i]
        row = {'t': f, 'd4': d4, 'nl': known['nl'].iloc[-1], 'fwd': 100 * math.log(px.iloc[i + H] / p0)}
        row['fwd5'] = 100 * math.log(px.iloc[i + 5] / p0)
        row['fwd65'] = 100 * math.log(px.iloc[i + 65] / p0) if i + 65 < len(pidx) and pidx[i + 65] <= LOCKBOX else np.nan
        row['same'] = 100 * math.log(p0 / px.iloc[i - H]) if i - H >= 0 else np.nan
        rows.append(row)
    return pd.DataFrame(rows).set_index('t')


def diff(d, col='fwd', sig='d4'):
    up, dn = d[d[sig] > 0][col].dropna(), d[d[sig] <= 0][col].dropna()
    return float(up.mean() - dn.mean()) if len(up) > 5 and len(dn) > 5 else float('nan')


def boot(d, rng):
    n = len(d); nb = math.ceil(n / BLOCK); out = np.empty(B)
    s, y = (d.d4.values > 0), d.fwd.values
    for k in range(B):
        st = rng.integers(0, n - BLOCK + 1, nb)
        idx = np.concatenate([np.arange(a, a + BLOCK) for a in st])[:n]
        ss, yy = s[idx], y[idx]
        out[k] = yy[ss].mean() - yy[~ss].mean()
    return out


def placebo(d):
    s, y = (d.d4.values > 0), d.fwd.values
    n = len(y)
    return np.array([y[np.roll(s, k)].mean() - y[~np.roll(s, k)].mean() for k in range(26, n - 25)])


def p_from_ci(est, lo, hi):
    se = (hi - lo) / 3.92
    return math.erfc(abs(est) / se / math.sqrt(2)) if se > 0 else 1.0


def main():
    rng = np.random.default_rng(SEED)
    walcl, tga = first_published(feat('fed_assets')), first_published(feat('fed_tga'))
    rrp = feat('rrp_on').drop_duplicates('date').set_index('date')[['value', 'asof']]
    nl = build_nl(walcl, tga, rrp)
    res = dict(id='net-liquidity-tailwind', seed=SEED, B=B, block=BLOCK, horizon_days=H, prereg='forge/NET_LIQUIDITY_TAILWIND_PREREG.md',
               nl_first=str(nl.index[0].date()), nl_last=str(nl.index[-1].date()), latest_nl_bn=float(nl.nl.iloc[-1]), cells={}, descriptive={})
    for cell, fid in [('spx', 'px_d1_spx500'), ('nq', 'px_d1_nas100')]:
        px = prices(fid)
        d = weekly_panel(nl, px)
        est = diff(d)
        bs = boot(d, rng); lo, hi = np.percentile(bs, [2.5, 97.5])
        pl = placebo(d); plo, phi = np.percentile(pl, [2.5, 97.5])
        h1, h2 = d[d.index < SPLIT], d[d.index >= SPLIT]
        lag1 = weekly_panel(nl, px, lag_weeks=1)
        up, dn = d[d.d4 > 0], d[d.d4 <= 0]
        z = (d.d4 - d.d4.rolling(52, min_periods=26).mean()) / d.d4.rolling(52, min_periods=26).std()
        dz = d.assign(z=z).dropna(subset=['z'])
        ex20 = d[(d.index < '2020-01-01') | (d.index >= '2021-01-01')]
        res['cells'][cell] = dict(n=len(d), n_rising=int(len(up)), n_falling=int(len(dn)), first=str(d.index[0].date()), last=str(d.index[-1].date()),
                                  mean_rising=float(up.fwd.mean()), mean_falling=float(dn.fwd.mean()), diff=est, ci95=[float(lo), float(hi)],
                                  half1=diff(h1), half2=diff(h2), placebo95=[float(plo), float(phi)], placebo_mean=float(pl.mean()), lag1_diff=diff(lag1),
                                  p_from_ci=p_from_ci(est, lo, hi),
                                  desc=dict(same_window_diff=diff(d, 'same'), same_window_r=float(d[['d4', 'same']].dropna().corr().iloc[0, 1]),
                                            fwd_r_continuous=float(np.corrcoef(dz.z, dz.fwd)[0, 1]),
                                            h5_diff=diff(d, 'fwd5'), h65_diff=diff(d, 'fwd65'), ex2020_diff=diff(ex20),
                                            by_year={str(y): diff(g) for y, g in d.groupby(d.index.year)}))
    ps = {k: v['p_from_ci'] for k, v in res['cells'].items()}
    order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        g = dict(ci_excludes_0_positive_holm=bool(c['p_holm'] < 0.05 and c['ci95'][0] > 0), both_halves_positive=bool(c['half1'] > 0 and c['half2'] > 0),
                 above_placebo=bool(c['diff'] > c['placebo95'][1]), lag1_same_sign=bool(c['lag1_diff'] > 0))
        c['gate'] = g
        c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95'][0] > -USEFUL and c['ci95'][1] < USEFUL else 'UNDERPOWERED')
    # descriptive: gold
    try:
        d = weekly_panel(nl, prices('px_d1_xauusd')); res['descriptive']['gold_diff'] = diff(d); res['descriptive']['gold_n'] = len(d)
    except Exception as e:
        res['descriptive']['gold'] = str(e)[:80]
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    print(json.dumps({k: v for k, v in res.items() if k != 'cells'}, indent=1, default=float))
    for k, c in res['cells'].items():
        print(k, {x: (round(v, 3) if isinstance(v, float) else v) for x, v in c.items() if x != 'desc'})
        print('   desc', json.dumps({a: (round(b, 3) if isinstance(b, float) else b) for a, b in c['desc'].items() if a != 'by_year'}))
        print('   by_year', {a: round(b, 2) for a, b in c['desc']['by_year'].items()})


if __name__ == '__main__':
    main()
