"""rate-surprise-events: the registered run (forge/RATE_SURPRISE_EVENTS_PREREG.md). Reads post-signal outcomes for the first time."""
import os, sys, json
import numpy as np, pandas as pd
from scipy.stats import norm
from statsmodels.stats.multitest import multipletests
sys.path.insert(0, os.path.dirname(__file__))
from fixedrule import residualise, partial_stat
from model import walk_forward, score
from events import load_m15, px, OUT, NY

SEED = 20261021; rng = np.random.default_rng(SEED)
HZ = ('h1', 'h2', 'h3', 'h4'); ASSETS = {'eurusd': 'EUR_USD', 'nq': 'NAS100_USD'}
SLIP = {'eurusd': 0.2e-4, 'nq': 0.5e-4}
X = pd.read_parquet(os.path.join(OUT, 'events.parquet')).sort_values('t').reset_index(drop=True)
S = {k: load_m15(k) for k in ('USB02Y_USD', 'USB10Y_USD', 'EUR_USD', 'NAS100_USD')}


def px_near(s, t, back='3h'):
    """price at instant t, falling back to the last bar close within `back` (holidays, thin hours)."""
    v = px(s, t)
    if np.isfinite(v): return v, t
    w = s[(s.index <= t - pd.Timedelta('15min')) & (s.index >= t - pd.Timedelta(back))]
    return (float(w.iloc[-1]), w.index[-1] + pd.Timedelta('15min')) if len(w) else (np.nan, None)


def ny_close(day, n_bd):
    d = (pd.Timestamp(day) + pd.offsets.BDay(n_bd)) if n_bd else pd.Timestamp(day)
    return pd.Timestamp(f'{d.date()} 16:00').tz_localize(NY).tz_convert('UTC')


# trailing 60-session sign of the Nasdaq <-> 2y yield daily link (16:00 ET closes), known before the event day
def daily_1600(s):
    idx = s.index.tz_convert(NY); m = (idx.hour == 15) & (idx.minute == 45)      # bar opened 15:45 closes at 16:00
    d = pd.Series(s[m].to_numpy(), index=idx[m].normalize().tz_localize(None)); return d[~d.index.duplicated()]
nqd, u2d = np.log(daily_1600(S['NAS100_USD'])), -np.log(daily_1600(S['USB02Y_USD']))
J = pd.concat([nqd.diff(), u2d.diff()], axis=1, keys=['nq', 'y']).dropna()
link = J['nq'].rolling(60, min_periods=40).corr(J['y'])

# ---------------- outcomes + costs ----------------
ba = {}
for a in ASSETS:
    d = pd.read_parquet(os.path.join(os.path.dirname(OUT), '..', '..', 'data', 'm1_bidask', f'{a}_m1.parquet')) if False else pd.read_parquet(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'm1_bidask', f'{a}_m1.parquet'))
    d.index = pd.to_datetime(d['time'], utc=True); ba[a] = (d['ask_c'] - d['bid_c']).sort_index() / d['close'].sort_index()


def spread_at(a, t):
    s = ba[a]; i = s.index.searchsorted(t - pd.Timedelta('1min'), side='right') - 1
    if i < 0 or s.index[i] < t - pd.Timedelta('10min'): return np.nan
    return float(s.iloc[i])


rows = []
for i, e in X.iterrows():
    r = {}
    day = e['t'].tz_convert(NY).normalize().tz_localize(None)
    L = link[link.index < day]; r['nq_link'] = float(np.sign(L.iloc[-1])) if len(L) and np.isfinite(L.iloc[-1]) else np.nan
    for a, ins in ASSETS.items():
        s = S[ins]; sg = e[f'{a}_sigma15']
        for lab, delay in (('', 0), ('_d30', 15)):
            te = e['entry_t'] + pd.Timedelta(minutes=delay)
            p0, _ = px_near(s, te, '30min')
            ends = {'h1': te + pd.Timedelta('60min'), 'h2': ny_close(day, 0), 'h3': ny_close(day, 1), 'h4': ny_close(day, 5)}
            bars_h2 = max((ends['h2'] - te) / pd.Timedelta('15min'), 1.0)
            nb = {'h1': 4.0, 'h2': bars_h2, 'h3': bars_h2 + 96, 'h4': bars_h2 + 96 * 5}
            for h in HZ:
                if h == 'h2' and ends['h2'] <= te: r[f'{a}_{h}{lab}'] = np.nan; continue
                p1, tx = px_near(s, ends[h])
                ok = np.isfinite(p0) and np.isfinite(p1) and np.isfinite(sg) and sg > 0
                r[f'{a}_{h}{lab}'] = np.log(p1 / p0) / (sg * np.sqrt(nb[h])) if ok else np.nan
                r[f'{a}_{h}{lab}_raw'] = np.log(p1 / p0) if ok else np.nan
                if lab == '':
                    se, sx = spread_at(a, te), spread_at(a, tx) if tx is not None else np.nan
                    r[f'{a}_{h}_cost_raw'] = ((se + sx) / 2 if np.isfinite(se) and np.isfinite(sx) else np.nan)
                    r[f'{a}_{h}_scale'] = sg * np.sqrt(nb[h]) if np.isfinite(sg) else np.nan
    rows.append(r)
X = pd.concat([X, pd.DataFrame(rows)], axis=1)
for a in ASSETS:                                       # pre-2016-10: 1.5 x median family spread of the later sample
    for h in HZ:
        c = f'{a}_{h}_cost_raw'; med = X[X['t'] >= '2016-11-01'].groupby('family')[c].median()
        fill = X['family'].map(med) * 1.5; X[c] = X[c].where(X[c].notna(), fill) + 2 * SLIP[a]
fam = X['family'].to_numpy(); split = X['split'].to_numpy()


def signal(a, sig):
    v = X[sig].to_numpy(float)
    if sig == 'ds': v = np.nan_to_num(v)
    return -v if a == 'eurusd' else v * X['nq_link'].to_numpy(float)


# ---------------- primary statistic + gate ----------------
cells = []
for a in ASSETS:
    react = X[f'{a}_react'].to_numpy(float)
    for sig in ('rs2', 'ds'):
        Sg = signal(a, sig)
        for h in HZ:
            y = X[f'{a}_{h}'].to_numpy(float); res = residualise(y, react, fam)
            allm = np.ones(len(X), bool)
            st = partial_stat(res, Sg, fam, allm, rng, 2000)
            per = {p: partial_stat(res, Sg, fam, split == p, rng, 1) for p in ('discover', 'validate', 'test')}
            big = np.abs(y) >= np.sort(np.abs(y[np.isfinite(y)]))[-5] if np.isfinite(y).sum() > 5 else np.zeros(len(y), bool)
            dt5 = partial_stat(res, Sg, fam, ~big, rng, 1)
            cells.append(dict(asset=a, signal=sig, h=h, n=st.get('n'), corr=st.get('corr'), lo=st.get('lo'), hi=st.get('hi'), p=st.get('p'),
                              **{f'{p}_corr': per[p].get('corr') for p in per}, **{f'{p}_n': per[p].get('n') for p in per}, drop_top5_corr=dt5.get('corr')))
C = pd.DataFrame(cells)
C['holm'] = multipletests(C['p'].fillna(1), 0.05, 'holm')[0]
C['same_sign_3'] = [all(np.sign(r[f'{p}_corr']) == np.sign(r['corr']) for p in ('discover', 'validate', 'test')) for _, r in C.iterrows()]
C['top5_ok'] = np.sign(C['drop_top5_corr']) == np.sign(C['corr'])
C['gate'] = C['holm'] & C['same_sign_3'] & C['top5_ok']
C['ci_excludes_bar'] = (C['hi'] < 0.10) & (C['lo'] > -0.10)
C['verdict_cell'] = np.where(C['gate'], 'validated', np.where(C['ci_excludes_bar'], 'null', 'underpowered'))

# ---------------- tradable rules (every cell, descriptive unless the gate passed) ----------------
trades = []
oos = X['t'] >= '2018-01-01'
for _, c in C.iterrows():
    a, sig, h = c['asset'], c['signal'], c['h']
    d = np.sign(c['discover_corr']) if np.isfinite(c['discover_corr']) and c['discover_corr'] != 0 else 1.0
    Sg = signal(a, sig); pos = d * np.sign(Sg)
    raw = X[f'{a}_{h}_raw'].to_numpy(float); cost = X[f'{a}_{h}_cost_raw'].to_numpy(float); scale = X[f'{a}_{h}_scale'].to_numpy(float)
    net = (pos * raw - np.abs(pos) * cost) / scale; gross = pos * raw / scale
    b1 = np.sign(X[f'{a}_react'].to_numpy(float)) * np.sign(np.nanmean(np.where(split == 'discover', np.sign(X[f'{a}_react']) * X[f'{a}_{h}'], np.nan)))
    netb1 = (b1 * raw - np.abs(b1) * cost) / scale
    for per, m in (('2018-26', oos.to_numpy()), ('test', split == 'test')):
        k = m & np.isfinite(net) & (pos != 0)
        bs = [np.mean(rng.choice(net[k], k.sum())) for _ in range(2000)] if k.sum() > 10 else [np.nan]
        kb = m & np.isfinite(netb1) & (b1 != 0)
        trades.append(dict(asset=a, signal=sig, h=h, period=per, direction='continuation' if d > 0 else 'reversal', n=int(k.sum()),
                           gross_mean=float(np.nanmean(gross[k])), net_mean=float(np.nanmean(net[k])), net_lo=float(np.percentile(bs, 2.5)), net_hi=float(np.percentile(bs, 97.5)),
                           net_bp_mean=float(np.nanmean((pos * raw - np.abs(pos) * cost)[k]) * 1e4), hit=float(np.mean(net[k] > 0)),
                           b1_net_mean=float(np.nanmean(netb1[kb])), cost_bp_median=float(np.nanmedian(cost[k]) * 1e4)))
T = pd.DataFrame(trades)
C['tradable'] = [bool(c['gate'] and (T[(T.asset == c['asset']) & (T.signal == c['signal']) & (T.h == c['h']) & (T.period == '2018-26')].iloc[0]['net_lo'] > 0)
                      and (T[(T.asset == c['asset']) & (T.signal == c['signal']) & (T.h == c['h']) & (T.period == 'test')].iloc[0]['net_mean'] > 0)) for _, c in C.iterrows()]

# ---------------- secondary: walk-forward forecast ladder ----------------
ladder = []
for a in ASSETS:
    for h in HZ:
        y = X[f'{a}_{h}'].to_numpy(float); F = {m: walk_forward(X, y, a, m) for m in ('B0', 'B1', 'M_RS', 'M_DS', 'M_ALL')}
        for m in ('B1', 'M_RS', 'M_DS', 'M_ALL'):
            base = 'B0' if m == 'B1' else 'B1'
            for per, msk in (('2018-26', oos.to_numpy()), ('test', split == 'test')):
                s_ = score(y, F[base], F[m], msk, lag=1 if h != 'h4' else 3)
                ladder.append(dict(asset=a, h=h, model=m, vs=base, period=per, **s_))
LD = pd.DataFrame(ladder)

# ---------------- splits (descriptive, BH) ----------------
splits = []
X['dir'] = np.where(X['rs2'] > 0, 'hawkish', np.where(X['rs2'] < 0, 'dovish', 'none')); X['large'] = np.where(X['rs2'].abs() >= 1.5, 'large', 'small')
for a in ASSETS:
    react = X[f'{a}_react'].to_numpy(float)
    for sig in ('rs2', 'ds'):
        Sg = signal(a, sig)
        for h in HZ:
            res = residualise(X[f'{a}_{h}'].to_numpy(float), react, fam)
            for var in ('dir', 'large', 'regime_policy', 'regime_realyield', 'regime_risk', 'family'):
                for lv in X[var].unique():
                    st = partial_stat(res, Sg, fam, (X[var] == lv).to_numpy(), rng, 500)
                    if st.get('n', 0) >= 20: splits.append(dict(asset=a, signal=sig, h=h, split=var, level=lv, **st))
SP = pd.DataFrame(splits); SP['bh'] = multipletests(SP['p'], 0.10, 'fdr_bh')[0]

# ---------------- robustness: 10y signal, 30-min later entry, by year ----------------
rob = []
for a in ASSETS:
    react = X[f'{a}_react'].to_numpy(float)
    for h in HZ:
        for lab, Sg, ycol in (('rs10', signal(a, 'rs10'), f'{a}_{h}'), ('rs2_entry+30', signal(a, 'rs2'), f'{a}_{h}_d30')):
            res = residualise(X[ycol].to_numpy(float), react, fam); st = partial_stat(res, Sg, fam, np.ones(len(X), bool), rng, 1000)
            rob.append(dict(asset=a, h=h, variant=lab, **st))
        res = residualise(X[f'{a}_{h}'].to_numpy(float), react, fam); Sg = signal(a, 'rs2')
        for yr in range(2010, 2027):
            st = partial_stat(res, Sg, fam, (X['t'].dt.year == yr).to_numpy(), rng, 1)
            rob.append(dict(asset=a, h=h, variant=f'year_{yr}', **st))
RB = pd.DataFrame(rob)

# ---------------- event-study response profiles (charts) ----------------
prof = {}
for a, ins in ASSETS.items():
    s = S[ins]; out = {}
    for grp, m in (('hawkish (rs2 >= +1)', X['rs2'] >= 1), ('neutral', X['rs2'].abs() < 1), ('dovish (rs2 <= -1)', X['rs2'] <= -1)):
        paths = []
        for _, e in X[m].iterrows():
            p0 = px(s, e['t']); sg = e[f'{a}_sigma15']
            if not (np.isfinite(p0) and np.isfinite(sg)): continue
            paths.append([np.log(px(s, e['t'] + pd.Timedelta(minutes=15 * k)) / p0) / sg for k in range(-4, 97)])
        P = np.array(paths, float)
        out[grp] = dict(n=len(P), mean=list(np.nanmean(P, 0)), lo=list(np.nanmean(P, 0) - 1.96 * np.nanstd(P, 0) / np.sqrt(np.isfinite(P).sum(0))),
                        hi=list(np.nanmean(P, 0) + 1.96 * np.nanstd(P, 0) / np.sqrt(np.isfinite(P).sum(0))))
    prof[a] = out
prof['offsets_15min'] = list(range(-4, 97))

R = dict(id='rate-surprise-events', seed=SEED, n_events=len(X), cells=C.to_dict('records'), trades=T.to_dict('records'), ladder=LD.to_dict('records'),
         splits=SP.to_dict('records'), robustness=RB.to_dict('records'), profiles=prof,
         by_family_n=X['family'].value_counts().to_dict(), split_n=X['split'].value_counts().to_dict())


def clean(o):
    if isinstance(o, dict): return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)): return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, np.bool_): return bool(o)
    return o


json.dump(clean(R), open(os.path.join(OUT, 'results_full.json'), 'w'))
X.drop(columns=[c for c in X.columns if c.endswith('_d30_raw')]).to_parquet(os.path.join(OUT, 'events_with_outcomes.parquet'))
pd.set_option('display.width', 250)
print(C[['asset', 'signal', 'h', 'n', 'corr', 'lo', 'hi', 'p', 'discover_corr', 'validate_corr', 'test_corr', 'drop_top5_corr', 'holm', 'gate', 'verdict_cell']].round(3).to_string())
print(T[T.period == '2018-26'][['asset', 'signal', 'h', 'direction', 'n', 'gross_mean', 'net_mean', 'net_lo', 'net_hi', 'net_bp_mean', 'b1_net_mean', 'cost_bp_median']].round(3).to_string())
