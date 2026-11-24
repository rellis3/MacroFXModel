"""asia-day-bias: does the Asia session (00:00-07:00 London) call the 07:00-21:00 London day direction?
Prereg: forge/ASIA_DAY_BIAS_PREREG.md (registered 2026-11-23, before any outcome). Seed 20261123.

  python scripts/asia-day-bias/score.py [--m1 <dir>] [--B 2000]

Reads local OANDA mid M1 parquet (read-only), writes analysis/output/asia-day-bias/{panel.parquet,results.json,RESULTS.md}.
"""
import argparse, json, math, sys, time
from pathlib import Path
import numpy as np, pandas as pd, pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'asia-day-bias'
SEED = 20261123
LAST_DATE = '2026-08-20'
GROUPS = {
    'usd': ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf'],
    'jpy': ['eurjpy', 'gbpjpy', 'audjpy', 'nzdjpy', 'cadjpy', 'chfjpy'],
    'crosses': ['euraud', 'eurcad', 'eurchf', 'eurgbp', 'eurnzd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd', 'audcad', 'audchf', 'audnzd', 'cadchf', 'nzdcad'],
    'gold': ['gold'],
    'indices': ['nq', 'spx500', 'us30', 'us2000', 'de30', 'uk100'],
}
CELL = {'all': 'asia-day-bias-all', 'usd': 'asia-day-bias-usd', 'jpy': 'asia-day-bias-jpy', 'crosses': 'asia-day-bias-crosses',
        'gold': 'asia-day-bias-gold', 'indices': 'asia-day-bias-indices', 'oneway': 'asia-day-bias-oneway'}
BAR_IC, BAR_F = 0.05, 0.10
SHIFTS = list(range(5, 55))
BLOCK = 21


def session_table(key, m1dir):
    t = pq.read_table(m1dir / f'{key}_m1.parquet')
    tc = 'datetime' if 'datetime' in t.column_names else 'time'
    df = pd.DataFrame({c: t.column(c).to_numpy() for c in ['open', 'high', 'low', 'close']})
    ts = pd.DatetimeIndex(pd.to_datetime(t.column(tc).to_pandas().values, utc=True))
    order = np.argsort(ts.asi8, kind='stable'); ts = ts[order]; df = df.iloc[order].reset_index(drop=True)
    DAYNS, MINNS = 86_400 * 10**9, 60 * 10**9
    lns = ts.tz_convert('Europe/London').tz_localize(None).asi8       # London wall clock, ns
    df['ld'] = lns // DAYNS                                          # London calendar day number (1970-01-01 = 0)
    df['mod'] = (lns % DAYNS) // MINNS                               # minute of the London day
    df['wd'] = (df['ld'] + 3) % 7                                    # 0 = Monday
    # NY-close daily bars for sigma (17:00 New York; key = NY calendar day of t + 7h)
    nyns = ts.tz_convert('America/New_York').tz_localize(None).asi8 + 7 * 3600 * 10**9
    df['nyk'] = nyns // DAYNS
    d = df.groupby('nyk').agg(c=('close', 'last'), n=('close', 'size'))
    d = d[d.n >= 60]
    r = np.log(d.c).diff()
    sig = r.rolling(60).std()                      # sigma of the 60 NY days ending at key k
    sig_keys = np.array(sig.index); sig_vals = sig.values
    last_day = int(pd.Timestamp(LAST_DATE).value // DAYNS)
    w = df[(df.wd < 5) & (df.ld <= last_day)]
    g = lambda lo, hi: w[(w['mod'] >= lo) & (w['mod'] < hi)].groupby('ld')
    p00 = g(0, 30)['open'].first()
    p07 = g(390, 420)['close'].last()
    p13 = g(750, 780)['close'].last()
    p21 = g(1230, 1260)['close'].last()
    asia = g(0, 420)
    s = pd.DataFrame({'p00': p00, 'p07': p07, 'p13': p13, 'p21': p21, 'ahi': asia['high'].max(), 'alo': asia['low'].min(), 'amin': asia['close'].size()})
    s = s.dropna(subset=['p00', 'p07', 'p21'])
    s = s[s.amin >= 0.6 * 420]
    # sigma for London date D: last NY key strictly before D (that day closed at ~22:00 London on D-1 or earlier)
    idx = np.searchsorted(sig_keys, np.array(s.index), side='left') - 1
    s['sigma'] = np.where(idx >= 0, sig_vals[np.clip(idx, 0, None)], np.nan)
    s = s.dropna(subset=['sigma'])
    s['A'] = np.log(s.p07 / s.p00); s['D'] = np.log(s.p21 / s.p07); s['M'] = np.log(s.p13 / s.p07)
    s['zA'] = (s.A / s.sigma).clip(-5, 5); s['zD'] = (s.D / s.sigma).clip(-5, 5); s['zM'] = (s.M / s.sigma).clip(-5, 5)
    rng_ = np.log(s.ahi / s.alo)
    s['eff'] = np.where(rng_ > 0, s.A.abs() / rng_, 0.0)
    q = s.A.abs().rolling(250, min_periods=120).quantile(0.67).shift(1)
    s['big1way'] = ((s.A.abs() > q) & (s.eff >= 0.6)).astype(float)
    s.loc[q.isna(), 'big1way'] = np.nan
    s['inst'] = key
    s = s.reset_index(names='day')
    s['date'] = pd.to_datetime(s['day'], unit='D').dt.strftime('%Y-%m-%d')
    return s


def wcorr(W, X, Y, M):
    """weighted Pearson per (draw, instrument). W: (B, T), X/Y/M: (I, T) with M the validity mask."""
    Xm, Ym = X * M, Y * M
    n = W @ M.T; sx = W @ Xm.T; sy = W @ Ym.T
    sxx = W @ (Xm * X).T; syy = W @ (Ym * Y).T; sxy = W @ (Xm * Y).T
    cov = sxy / n - sx * sy / n ** 2
    vx = sxx / n - (sx / n) ** 2; vy = syy / n - (sy / n) ** 2
    return cov / np.sqrt(vx * vy)


def wmean(W, V, M):
    return (W @ (V * M).T) / (W @ M.T)


def boot_weights(T, B, rng):
    nb = math.ceil(T / BLOCK)
    W = np.zeros((B, T))
    starts = rng.integers(0, T, size=(B, nb))
    for b in range(B):
        idx = (starts[b][:, None] + np.arange(BLOCK)[None, :]).ravel()[:T] % T
        W[b] = np.bincount(idx, minlength=T)
    return W


def shift(a, k):
    out = np.full_like(a, np.nan); out[:, k:] = a[:, :-k]; return out


def pnorm_two(z):
    return math.erfc(abs(z) / math.sqrt(2))


def holm(ps, alpha=0.05):
    order = np.argsort(ps); m = len(ps); ok = np.zeros(m, bool); adj = np.zeros(m)
    run = 0
    for r, i in enumerate(order):
        run = max(run, min(1, (m - r) * ps[i])); adj[i] = run
    for r, i in enumerate(order):
        if ps[i] <= alpha / (m - r): ok[i] = True
        else: break
    return ok, adj


def bh(ps, q=0.10):
    ps = np.asarray(ps); m = len(ps); order = np.argsort(ps); passed = np.zeros(m, bool)
    k = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / m: k = r
    passed[order[:k]] = True
    return passed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--m1', default=str(ROOT / 'VolRangeForecaster' / 'data' / 'm1'))
    ap.add_argument('--B', type=int, default=2000)
    a = ap.parse_args()
    m1 = Path(a.m1); OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    t0 = time.time()
    insts = [k for g in GROUPS.values() for k in g]
    frames, dropped = [], {}
    for k in insts:
        s = session_table(k, m1)
        frames.append(s); dropped[k] = int(len(s))
        print(f'  {k:7s} sessions {len(s):5d}  {s.date.min()} .. {s.date.max()}  ({time.time() - t0:.0f}s)', flush=True)
    P = pd.concat(frames, ignore_index=True)
    P.to_parquet(OUT / 'panel.parquet', index=False)
    dates = np.array(sorted(P.date.unique())); T = len(dates); I = len(insts)
    di = {d: i for i, d in enumerate(dates)}
    def grid(col):
        G = np.full((I, T), np.nan)
        for ii, k in enumerate(insts):
            s = P[P.inst == k]; G[ii, [di[d] for d in s.date]] = s[col].values
        return G
    XA, YD, YM, BIG = grid('zA'), grid('zD'), grid('zM'), grid('big1way')
    SA = np.sign(XA)
    mask = lambda *arrs: np.all([np.isfinite(x) for x in arrs], axis=0).astype(float)
    nz = lambda x: np.nan_to_num(x)
    W = boot_weights(T, a.B, rng)
    W1 = np.ones((1, T))
    half = dates <= dates[T // 2]
    Wh = np.vstack([half.astype(float), (~half).astype(float)])
    gidx = {g: [insts.index(k) for k in ks] for g, ks in GROUPS.items()}
    gidx['all'] = list(range(I))

    def ic_cells(X, Y, Wm):
        M = mask(X, Y); C = wcorr(Wm, nz(X), nz(Y), M)
        return {g: np.nanmean(C[:, ix], axis=1) for g, ix in gidx.items()}, C

    def oneway(SAx, BIGx, Y, Wm):
        M = mask(SAx, BIGx, Y) * nz(BIGx)
        F = wmean(Wm, nz(SAx * Y), M)
        return np.nanmean(F, axis=1)

    # planted-signal control first (S1 pipeline): zD' = zD + c * zA * sd(zD)/sd(zA), c = 0.06
    c = 0.06
    ratio = np.nanstd(YD, axis=1, keepdims=True) / np.nanstd(XA, axis=1, keepdims=True)
    real1, _ = ic_cells(XA, YD, W1); plant1, _ = ic_cells(XA, YD + c * XA * ratio, W1)
    plantB, _ = ic_cells(XA, YD + c * XA * ratio, W[:200])
    rec = float(np.mean((plantB['all'] - real1['all'][0]) > c / 2))   # share of draws where the plant shows at least half its size
    plant = {'c': c, 'real_S1': float(real1['all'][0]), 'planted_S1': float(plant1['all'][0]), 'lift': float(plant1['all'][0] - real1['all'][0]),
             'recovered_share_200_draws': rec}
    print('PLANT', plant, flush=True)

    est, Cinst = ic_cells(XA, YD, W1)
    boot, _ = ic_cells(XA, YD, W)
    halves, _ = ic_cells(XA, YD, Wh)
    plac = {g: [] for g in gidx}
    placF = []
    for k in SHIFTS:
        e, _ = ic_cells(shift(XA, k), YD, W1)
        for g in gidx: plac[g].append(float(e[g][0]))
        placF.append(float(oneway(shift(SA, k), shift(BIG, k), YD, W1)[0]))
    F_raw = float(oneway(SA, BIG, YD, W1)[0]); F_pm = float(np.mean(placF))
    F_boot = oneway(SA, BIG, YD, W) - F_pm
    F_half = oneway(SA, BIG, YD, Wh) - F_pm
    nbig = int(np.nansum(BIG == 1))

    cells = {}
    for g in ['all', 'usd', 'jpy', 'crosses', 'gold', 'indices']:
        v = float(est[g][0]); b = boot[g]; se = float(np.nanstd(b)); pl = np.array(plac[g])
        cells[g] = {'id': CELL[g], 'metric': 'IC(zA, zD)', 'est': v, 'ci': [float(np.nanpercentile(b, 2.5)), float(np.nanpercentile(b, 97.5))], 'se': se,
                    'halves': [float(halves[g][0]), float(halves[g][1])], 'placebo_mean': float(pl.mean()), 'placebo_sd': float(pl.std()),
                    'placebo_pct': float((pl < v).mean() * 100), 'mde': float(2.8 * pl.std()), 'bar': BAR_IC, 'p': pnorm_two(v / se) if se > 0 else 1.0,
                    'n_inst': len(gidx[g]), 'n_rows': int(np.nansum(mask(XA, YD)[gidx[g]]))}
    plF = np.array(placF)
    cells['oneway'] = {'id': CELL['oneway'], 'metric': 'mean sign(A)*zD on big one-way Asia days minus placebo mean (sigma)', 'est': F_raw - F_pm, 'raw': F_raw,
                       'ci': [float(np.nanpercentile(F_boot, 2.5)), float(np.nanpercentile(F_boot, 97.5))], 'se': float(np.nanstd(F_boot)),
                       'halves': [float(F_half[0]), float(F_half[1])], 'placebo_mean': F_pm, 'placebo_sd': float(plF.std()),
                       'placebo_pct': float((plF < F_raw).mean() * 100), 'mde': float(2.8 * plF.std()), 'bar': BAR_F,
                       'p': pnorm_two((F_raw - F_pm) / np.nanstd(F_boot)), 'n_rows': nbig}
    names = list(cells)
    ok, adj = holm(np.array([cells[n]['p'] for n in names]))
    for n, o, pa in zip(names, ok, adj):
        c_ = cells[n]; c_['holm_p'] = float(pa); c_['holm_pass'] = bool(o)
        gate = (abs(c_['est']) >= c_['bar'] and (c_['ci'][0] > 0 or c_['ci'][1] < 0) and np.sign(c_['halves'][0]) == np.sign(c_['halves'][1]) == np.sign(c_['est'])
                and (c_['placebo_pct'] > 97.5 or c_['placebo_pct'] < 2.5) and o)
        c_['verdict'] = 'VALIDATED' if gate else ('UNDERPOWERED' if c_['mde'] > c_['bar'] else 'NULL')

    # disaggregation: per instrument (BH q 0.10), morning window, per year
    Cb = wcorr(W, nz(XA), nz(YD), mask(XA, YD))
    per = []
    for ii, k in enumerate(insts):
        v = float(Cinst[0, ii]); se = float(np.nanstd(Cb[:, ii]))
        per.append({'inst': k, 'ic': v, 'ci': [float(np.nanpercentile(Cb[:, ii], 2.5)), float(np.nanpercentile(Cb[:, ii], 97.5))], 'p': pnorm_two(v / se), 'n': int(np.nansum(mask(XA, YD)[ii]))})
    bhp = bh([x['p'] for x in per])
    for x, b_ in zip(per, bhp): x['bh_pass'] = bool(b_)
    morn, _ = ic_cells(XA, YM, W1)
    years = sorted({d[:4] for d in dates})
    Wy = np.vstack([np.array([d[:4] == y for d in dates], float) for y in years])
    yr, _ = ic_cells(XA, YD, Wy)
    res = {'slug': 'asia-day-bias', 'prereg': 'forge/ASIA_DAY_BIAS_PREREG.md', 'seed': SEED, 'B': a.B, 'block': BLOCK, 'dates': [str(dates[0]), str(dates[-1])], 'T': int(T),
           'sessions_per_instrument': dropped, 'plant': plant, 'cells': cells, 'S8': 'not run: engine_daily.csv (V1 replay) not present locally; tracked forward instead',
           'per_instrument': per, 'per_instrument_bh_passes': int(sum(bhp)), 'per_instrument_chance': 0.10 * len(per),
           'morning_ic': {g: float(morn[g][0]) for g in gidx}, 'by_year_all': {y: float(yr['all'][i]) for i, y in enumerate(years)},
           'by_year_groups': {g: {y: float(yr[g][i]) for i, y in enumerate(years)} for g in GROUPS}, 'runtime_s': round(time.time() - t0)}
    (OUT / 'results.json').write_text(json.dumps(res, indent=1))
    for n in names:
        c_ = cells[n]; print(f"{n:8s} est {c_['est']:+.4f} ci [{c_['ci'][0]:+.4f},{c_['ci'][1]:+.4f}] halves {c_['halves'][0]:+.4f}/{c_['halves'][1]:+.4f} plac {c_['placebo_mean']:+.4f}±{c_['placebo_sd']:.4f} pct {c_['placebo_pct']:.0f} mde {c_['mde']:.4f} holm {c_['holm_p']:.3f} -> {c_['verdict']}")
    print('per-instrument BH passes', res['per_instrument_bh_passes'], 'chance', res['per_instrument_chance'])
    for x in sorted(per, key=lambda x: x['ic']): print(f"  {x['inst']:7s} {x['ic']:+.4f} [{x['ci'][0]:+.4f},{x['ci'][1]:+.4f}] n {x['n']} {'BH' if x['bh_pass'] else ''}")
    print('morning', {g: round(v, 4) for g, v in res['morning_ic'].items()})
    print('years', {y: round(v, 3) for y, v in res['by_year_all'].items()})


if __name__ == '__main__':
    main()
