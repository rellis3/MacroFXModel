"""vix-signals-forward (forge/VIX_SIGNALS_FORWARD_PREREG.md): rebuild the four frozen signals from public closes and score events from 2026-10-26.
Re-running at any date reproduces the same record (inputs are unrevised end-of-day closes). Writes analysis/output/vix-signals-forward/record.json.
  python score.py            fetch fresh CBOE/FRED/VX data, then score
  python score.py --offline  use the local research copies only (for checking the plumbing)"""
import os, sys, io, json, urllib.request, datetime as dt
import numpy as np, pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-signals-forward'); os.makedirs(OUT, exist_ok=True)
FWD = pd.Timestamp('2026-10-26'); SEED = 20261023; rng = np.random.default_rng(SEED); OFFLINE = '--offline' in sys.argv
UA = {'User-Agent': 'Mozilla/5.0'}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode()


def cboe(name):
    try:
        if OFFLINE: raise RuntimeError('offline')
        d = pd.read_csv(io.StringIO(get(f'https://cdn.cboe.com/api/global/us_indices/daily_prices/{name}_History.csv'))); src = 'cboe live'
    except Exception:
        d = pd.read_csv(os.path.join(ROOT, 'analysis/surfaces/cboe', f'{name}.csv')); src = 'local copy'
    d.columns = [c.strip().upper() for c in d.columns]; col = 'CLOSE' if 'CLOSE' in d.columns else d.columns[-1]
    return pd.Series(pd.to_numeric(d[col], errors='coerce').to_numpy(), index=pd.to_datetime(d['DATE'], format='mixed')).dropna().sort_index(), src


def ndx():
    """FRED NASDAQ100 (the series the studies used); when FRED refuses (its 403 bursts), the local copy plus newer Yahoo ^NDX official closes."""
    try:
        if OFFLINE: raise RuntimeError('offline')
        d = pd.read_csv(io.StringIO(get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQ100&cosd=2024-01-01'))); d.columns = ['date', 'v']
        return pd.Series(pd.to_numeric(d['v'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna().sort_index(), 'fred live'
    except Exception: pass
    d = pd.read_csv(os.path.join(ROOT, 'analysis/output/yield-predictive-ladder/raw', 'NASDAQ100.csv')); d.columns = ['date', 'v']
    s = pd.Series(pd.to_numeric(d['v'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna().sort_index(); src = 'local copy'
    if not OFFLINE:
        try:
            j = json.loads(get('https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?range=2y&interval=1d'))['chart']['result'][0]
            ts = pd.to_datetime(j['timestamp'], unit='s', utc=True).tz_convert('America/New_York').tz_localize(None).normalize()
            y = pd.Series(j['indicators']['quote'][0]['close'], index=ts, dtype=float).dropna()
            new = y[y.index > s.index[-1]]
            if len(new): s = pd.concat([s, new]).sort_index(); src = f'local copy to {s.index[-len(new) - 1].date()} + yahoo ^NDX'
        except Exception: pass
    return s, src


def vx_settles():
    p = os.path.join(ROOT, 'analysis/output/vix-calculus/data/vx_settle.parquet'); V = pd.read_parquet(p); src = 'local copy'
    if not OFFLINE:
        try:
            sys.path.insert(0, os.path.join(ROOT, 'scripts', 'vix-calculus')); import fetch_vx_futures  # noqa: F401  (refreshes vx_settle.parquet on import)
            V = pd.read_parquet(p); src = 'cboe live'
        except Exception: pass
    return V.pivot_table(index='date', columns='expiry', values='settle'), src


def pct(s):
    return s.rolling(252, min_periods=200).rank(pct=True)


def events(flag, start):
    """First day of each run of consecutive flag days, from `start`."""
    f = flag.fillna(False).astype(bool); first = f & ~f.shift(1, fill_value=False); return [d for d in f.index[first] if d >= start]


def score(name, ev, out_series, h, sign, P):
    idx = {d: i for i, d in enumerate(P.index)}; rows, busy = [], -1
    for d in ev:
        i = idx[d]; a, b = i + 1, i + 1 + h
        o = float(out_series.iloc[b] - out_series.iloc[a]) if b < len(P) else None
        counted = i >= busy
        if counted: busy = b
        rows.append(dict(date=str(d.date()), outcome_pct=None if o is None else round(o * 100, 3), counted=counted and o is not None, pending=o is None))
    sc = [r['outcome_pct'] for r in rows if r['counted']]
    fw = P.index >= FWD; base = (out_series.shift(-(h + 1)) - out_series.shift(-1))[fw].dropna() * 100
    res = dict(signal=name, horizon=h, expected_sign=sign, events=rows, n_scored=len(sc), mean_pct=float(np.mean(sc)) if sc else None, all_days_mean_pct=float(base.mean()) if len(base) else None)
    if len(sc) >= 3 and len(base):
        m = np.array(sc); boot = np.array([rng.choice(m, len(m)).mean() for _ in range(5000)]) - base.mean()
        res['p_one_sided'] = float(np.mean(boot * sign <= 0))
    need = 15 if name == 'short-vx-rule' else 20
    res['status'] = 'collecting' if len(sc) < need and pd.Timestamp.today() < pd.Timestamp('2028-10-23') else 'ready to judge'
    return res


def main():
    S = {}; src = {}
    for k in ('VIX', 'VVIX', 'VXN'): S[k], src[k] = cboe(k)
    S['NDX'], src['NDX'] = ndx()
    P = pd.concat(S, axis=1).dropna(); P = P[P.index >= '2024-06-01']
    r = np.log(P).diff()
    P['R_a'] = r['VVIX'].rolling(20).std() / r['NDX'].rolling(20).std(); P['R_b'] = r['VIX'].rolling(20).std() / r['NDX'].rolling(20).std()
    P['B'] = r['VIX'].rolling(20).cov(r['NDX']) / r['NDX'].rolling(20).var(); P['dB'] = P['B'] - P['B'].shift(5)
    P['dRimp'] = np.log(P['VVIX'] / P['VXN']).diff(5)
    f1 = (pct(P['R_a']) >= 0.9) | (pct(P['R_b']) >= 0.9); f2 = pct(P['dB']) <= 0.1; f3 = pct(P['dRimp']) >= 0.9
    lnV, lnN = np.log(P['VIX']), np.log(P['NDX'])
    out = dict(id='vix-signals-forward', generated=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'), forward_start=str(FWD.date()), last_close=str(P.index[-1].date()), sources=src,
               today={'ratio_flag': bool(f1.iloc[-1]), 'dRdt_bottom': bool(f2.iloc[-1]), 'implied_change_top': bool(f3.iloc[-1]),
                      'pct_R_a': float(pct(P['R_a']).iloc[-1]), 'pct_R_b': float(pct(P['R_b']).iloc[-1]), 'pct_dRdt': float(pct(P['dB']).iloc[-1]), 'pct_dRimp': float(pct(P['dRimp']).iloc[-1])},
               signals=[score('vvix-ratio-range', events(f1, FWD), lnV, 20, -1, P), score('vix-beta-change', events(f2, FWD), lnN, 5, +1, P),
                        score('vix-second-derivative', events(f3, FWD), lnN, 20, +1, P)])
    # 4. short-VX paper trades on signal 1
    F, src['VX'] = vx_settles(); trades, busy = [], None
    for d in P.index[(P.index >= FWD) & f1.fillna(False).to_numpy()]:
        i = P.index.get_loc(d)
        if i + 1 >= len(P) or (busy is not None and P.index[i + 1] <= busy): continue
        d1 = P.index[i + 1]
        if d1 not in F.index: trades.append(dict(signal=str(d.date()), status='no settle yet')); continue
        row = F.loc[d1].dropna(); ex = [e for e in row.index if (e - d1).days >= 35]
        if not ex: continue
        e = min(ex); entry = float(row[e]); t = dict(signal=str(d.date()), entry_date=str(d1.date()), contract=str(e.date()), entry=entry, status='open')
        later = [x for x in F.index if x > d1 and x in P.index][:20]
        for k, x in enumerate(later, 1):
            s = F.at[x, e]
            if not np.isfinite(s): continue
            if s >= entry * 1.25: t.update(exit_date=str(x.date()), exit=float(s), R=round((entry - s - 0.15) / entry / 0.25, 3), status='stopped'); break
            if k == 20: t.update(exit_date=str(x.date()), exit=float(s), R=round((entry - s - 0.10) / entry / 0.25, 3), status='closed')
        busy = pd.Timestamp(t.get('exit_date', '2100-01-01')); trades.append(t)
    done = [t['R'] for t in trades if 'R' in t]
    out['signals'].append(dict(signal='short-vx-rule', trades=trades, n_scored=len(done), mean_R=float(np.mean(done)) if done else None, backtest_mean_R=0.218, random_entry_mean_R=0.118,
                               status='collecting' if len(done) < 15 else 'ready to judge'))
    json.dump(out, open(os.path.join(OUT, 'record.json'), 'w'), indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != 'signals'}, indent=1)); [print(s['signal'], s.get('n_scored'), s.get('status')) for s in out['signals']]


if __name__ == '__main__':
    main()
