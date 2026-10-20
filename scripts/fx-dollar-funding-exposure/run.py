"""fx-dollar-funding-exposure — forge/FX_DOLLAR_FUNDING_EXPOSURE_PREREG.md.

Exposure E(c,q) = USD share of cross-border bank claims on country c (BIS LBS stocks), applied to the weeks of
quarter q+3. Weekly Friday-close FX returns (+ = local currency stronger vs USD). Risk-off week = weekly VIX change
in its top 20%. Cells: hit = IC(risk-off weeks) - IC(other weeks); follow = IC vs next week's return after a
risk-off week. Week-block bootstrap, label-shuffle placebo, leave-one-currency-out, halves.

Run: python scripts/fx-dollar-funding-exposure/run.py
"""
import io, json, math, os, urllib.request
import numpy as np
import pandas as pd

SEED = 20261021
B = 2000
BLOCK = 8
N_SHUFFLE = 1000
MIN_N = 12
USEFUL = 0.10
START, LOCKBOX = pd.Timestamp('2004-01-02'), pd.Timestamp('2026-08-21')
SPLIT = pd.Timestamp('2015-01-01')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'fx-dollar-funding-exposure')
CACHE = os.path.join(OUT, 'cache')
os.makedirs(CACHE, exist_ok=True)
FX = {'5C': ('EURUSD=X', 1), 'GB': ('GBPUSD=X', 1), 'AU': ('AUDUSD=X', 1), 'NZ': ('NZDUSD=X', 1), 'JP': ('JPY=X', -1),
      'CA': ('CAD=X', -1), 'CH': ('CHF=X', -1), 'KR': ('KRW=X', -1), 'BR': ('BRL=X', -1), 'MX': ('MXN=X', -1), 'IN': ('INR=X', -1),
      'TW': ('TWD=X', -1), 'SG': ('SGD=X', -1), 'ID': ('IDR=X', -1), 'TR': ('TRY=X', -1), 'MY': ('MYR=X', -1), 'TH': ('THB=X', -1),
      'PH': ('PHP=X', -1), 'NO': ('NOK=X', -1), 'SE': ('SEK=X', -1)}
BIS = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LBS_D_PUB/1.0/{key}?format=csv'


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            open(path, 'wb').write(r.read())
    return open(path, 'rb').read()


def exposure():
    key = f"Q.S.C.A.USD+TO1+EUR+JPY.A.5J.A.5A.A.{'+'.join(FX)}.N"
    df = pd.read_csv(io.BytesIO(fetch(BIS.format(key=key), 'bis_ccy_shares.csv')))
    df['q'] = pd.PeriodIndex(df.TIME_PERIOD.str.replace('-', ''), freq='Q')
    p = df.pivot_table(index=['L_CP_COUNTRY', 'q'], columns='L_DENOM', values='OBS_VALUE', aggfunc='sum')
    out = pd.DataFrame({'usd': p.USD / p.TO1 * 100, 'eur': p.EUR / p.TO1 * 100, 'jpy': p.JPY / p.TO1 * 100}).dropna(subset=['usd'])
    out = out.reset_index().rename(columns={'L_CP_COUNTRY': 'cc'})
    out['q_apply'] = out.q + 3                       # known end of q+2 -> used in quarter q+3
    return out


def weekly_fx():
    rets = {}
    for cc, (sym, sgn) in FX.items():
        url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&period1=1072915200&period2=1790000000'
        j = json.loads(fetch(url, f'{sym.replace("=", "_")}_d.json'))['chart']['result'][0]
        px = pd.Series(j['indicators']['quote'][0]['close'], index=pd.to_datetime(j['timestamp'], unit='s').normalize()).dropna()
        px = px[px > 0]; px = px[~px.index.duplicated(keep='last')]
        wk = px.resample('W-FRI').last()
        rets[cc] = np.log(wk).diff() * 100 * sgn
    r = pd.DataFrame(rets)
    # guard against bad Yahoo prints: a weekly move beyond 25% in a non-crisis currency is dropped (reported)
    return r[(r.index >= START) & (r.index <= LOCKBOX)]


def weekly_vix():
    v = pd.read_parquet(os.path.join(ROOT, 'features', 'vix.parquet'))
    v['date'] = pd.to_datetime(v['date'])
    s = v.drop_duplicates('date').set_index('date').value.sort_index()
    w = s.resample('W-FRI').last()
    return w.diff()


def panel(E, R):
    long = R.stack().rename('r').reset_index().rename(columns={'level_0': 'week', 'level_1': 'cc'})
    long.columns = ['week', 'cc', 'r']
    long['q'] = long.week.dt.to_period('Q')
    e = E[['cc', 'q_apply', 'usd', 'eur', 'jpy']].rename(columns={'q_apply': 'q'})
    p = long.merge(e, on=['cc', 'q'], how='inner').dropna(subset=['r', 'usd'])
    cnt = p.groupby('week').cc.transform('count')
    p = p[cnt >= MIN_N].copy()
    for c in ['usd', 'r', 'eur', 'jpy']:
        p[c + 'd'] = p[c] - p.groupby('week')[c].transform('mean')
    return p


def ic(d, x='usdd', y='rd'):
    return float(np.corrcoef(d[x], d[y])[0, 1]) if len(d) > 5 else float('nan')


def stats(p, flag):
    """hit = IC(flagged weeks) - IC(other weeks); follow = IC of exposure vs NEXT week's return, after flagged weeks."""
    on, off = p[p.week.isin(flag)], p[~p.week.isin(flag)]
    hit = ic(on) - ic(off)
    nxt = p[['week', 'cc', 'rd']].copy(); nxt['week'] = nxt.week - pd.Timedelta(days=7); nxt = nxt.rename(columns={'rd': 'rd_next'})
    f = on.merge(nxt, on=['week', 'cc'])
    return hit, ic(f, 'usdd', 'rd_next'), ic(on), ic(off), len(on), len(f)


def main():
    rng = np.random.default_rng(SEED)
    E, R, V = exposure(), weekly_fx(), weekly_vix()
    big = (R.abs() > 25).sum().sum()
    R = R.mask(R.abs() > 25)
    p = panel(E, R)
    weeks = np.array(sorted(p.week.unique()))
    v = V.reindex(weeks)
    thr = v.quantile(0.8)
    flag = set(v[v >= thr].index); calm = set(v[v <= v.quantile(0.2)].index)
    hit, fol, ic_on, ic_off, n_on, n_f = stats(p, flag)
    # Per-week sufficient statistics (n, Σx, Σy, Σxx, Σyy, Σxy): a pooled correlation over any multiset of
    # weeks is exact from their sums, so the week-block bootstrap and the label placebo need no re-merging.
    byw = {w: d for w, d in p.groupby('week')}
    def suff(x, y):
        x, y = np.asarray(x, float), np.asarray(y, float)
        return np.array([len(x), x.sum(), y.sum(), (x * x).sum(), (y * y).sum(), (x * y).sum()])
    S_same = np.array([suff(byw[w].usdd, byw[w].rd) for w in weeks])
    S_next = np.zeros_like(S_same)
    for i, w in enumerate(weeks):
        nw = pd.Timestamp(w) + pd.Timedelta(days=7)
        if nw in byw:
            a = byw[w][['cc', 'usdd']].merge(byw[nw][['cc', 'rd']], on='cc')
            S_next[i] = suff(a.usdd, a.rd)
    F = np.array([w in flag for w in weeks])
    def corr_s(s):
        n, sx, sy, sxx, syy, sxy = s
        if n < 6: return np.nan
        den = math.sqrt(max(sxx - sx * sx / n, 0) * max(syy - sy * sy / n, 0))
        return (sxy - sx * sy / n) / den if den > 0 else np.nan
    def hit_follow(idx, fmask):
        on, off = idx[fmask[idx]], idx[~fmask[idx]]
        return corr_s(S_same[on].sum(0)) - corr_s(S_same[off].sum(0)), corr_s(S_next[on].sum(0))
    allidx = np.arange(len(weeks))
    chk = hit_follow(allidx, F)
    assert abs(chk[0] - hit) < 1e-9 and abs(chk[1] - fol) < 1e-9, (chk, hit, fol)    # same numbers as the pandas path
    bh, bf = np.empty(B), np.empty(B)
    nb = math.ceil(len(weeks) / BLOCK)
    for k in range(B):
        st = rng.integers(0, len(weeks) - BLOCK + 1, nb)
        idx = np.concatenate([np.arange(s, s + BLOCK) for s in st])[:len(weeks)]
        bh[k], bf[k] = hit_follow(idx, F)
    ci_h, ci_f = np.nanpercentile(bh, [2.5, 97.5]), np.nanpercentile(bf, [2.5, 97.5])
    # placebo: reassign the risk-off labels to random weeks (same count)
    ph, pf = np.empty(N_SHUFFLE), np.empty(N_SHUFFLE)
    for k in range(N_SHUFFLE):
        fm = np.zeros(len(weeks), bool); fm[rng.choice(len(weeks), size=int(F.sum()), replace=False)] = True
        ph[k], pf[k] = hit_follow(allidx, fm)
    pl_h, pl_f = np.percentile(ph, [2.5, 97.5]), np.percentile(pf, [2.5, 97.5])
    h1, h2 = p[p.week < SPLIT], p[p.week >= SPLIT]
    s1, s2 = stats(h1, flag), stats(h2, flag)
    loco = {cc: stats(p[p.cc != cc], flag)[:2] for cc in sorted(p.cc.unique())}
    se = lambda lo, hi: (hi - lo) / 3.92
    pv = {'hit': math.erfc(abs(hit) / se(*ci_h) / math.sqrt(2)), 'follow': math.erfc(abs(fol) / se(*ci_f) / math.sqrt(2))}
    order = sorted(pv, key=pv.get); holm, run = {}, 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, pv[k] * (len(order) - i))); holm[k] = run
    cells = {}
    for name, est, ci, pl, a, b, li in [('hit', hit, ci_h, pl_h, s1[0], s2[0], 0), ('follow', fol, ci_f, pl_f, s1[1], s2[1], 1)]:
        flips = [cc for cc, v2 in loco.items() if np.sign(v2[li]) != np.sign(est)]
        g = dict(ci_excludes_0_negative_holm=bool(holm[name] < 0.05 and ci[1] < 0), both_halves_negative=bool(a < 0 and b < 0),
                 below_placebo=bool(est < pl[0]), loco_no_flip=not flips)
        v_ = 'VALIDATED' if all(g.values()) else ('NULL' if ci[0] > -USEFUL and ci[1] < USEFUL else 'UNDERPOWERED')
        cells[name] = dict(est=est, ci95=[float(ci[0]), float(ci[1])], half1=a, half2=b, placebo95=[float(pl[0]), float(pl[1])],
                           p=pv[name], p_holm=holm[name], loco_flips=flips, gate=g, verdict=v_)
    # descriptive
    on = p[p.week.isin(flag)]
    on_terc = on.assign(t=on.groupby('week').usdd.transform(lambda x: pd.qcut(x.rank(method='first'), 3, labels=False)))
    desc = dict(ic_riskoff=ic_on, ic_other=ic_off, n_riskoff_rows=n_on, n_follow_rows=n_f, n_weeks=len(weeks), n_riskoff_weeks=len(flag),
                vix_threshold=float(thr), bad_prints_masked=int(big),
                riskon_mirror_ic_minus_other=float(ic(p[p.week.isin(calm)]) - ic(p[~p.week.isin(calm)])),
                riskoff_tercile_mean_demeaned_ret={str(k): float(v2) for k, v2 in on_terc.groupby('t').rd.mean().items()},
                eur_share_hit=float(ic(on, 'eurd') - ic(p[~p.week.isin(flag)], 'eurd')),
                jpy_share_hit=float(ic(on, 'jpyd') - ic(p[~p.week.isin(flag)], 'jpyd')),
                latest_usd_share={cc: float(E[E.cc == cc].sort_values('q').usd.iloc[-1]) for cc in FX if (E.cc == cc).any()},
                loco=loco)
    # broad dollar as the risk-off definition (descriptive)
    usd_mean = -R.mean(axis=1)                       # + = dollar up across the board
    uw = usd_mean.reindex(weeks)
    fl2 = set(uw[uw >= uw.quantile(0.8)].index)
    desc['dollar_up_weeks_hit'] = float(stats(p, fl2)[0])
    res = dict(id='fx-dollar-funding-exposure', seed=SEED, B=B, block=BLOCK, prereg='forge/FX_DOLLAR_FUNDING_EXPOSURE_PREREG.md',
               first=str(weeks[0])[:10], last=str(weeks[-1])[:10], n_currencies=int(p.cc.nunique()), cells=cells, descriptive=desc)
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    for k, c in cells.items():
        print(k, {x: (round(v2, 4) if isinstance(v2, float) else v2) for x, v2 in c.items()})
    print(json.dumps({k: v2 for k, v2 in desc.items() if k not in ('loco', 'latest_usd_share')}, default=float, indent=1))
    print('latest usd share', {k: round(v2, 1) for k, v2 in desc['latest_usd_share'].items()})


if __name__ == '__main__':
    main()
