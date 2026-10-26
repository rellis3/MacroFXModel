"""Release Reaction, Layer 1 (what happened): shared measurement code for history and live.
C.OG's layered frame (Discord 2026-10-19): Layer 1 = what happened to NQ, 2y, 10y, USD around a release. Here the assets are the SOFR Sep26 leg, the Euribor Mar27 leg
and their spread (the C.OG line), the 2y and 10y Treasury, the dollar and Nasdaq. DESCRIPTIVE ONLY: nothing here predicts anything.
Conventions (strict causal, as the rest of the STIR work): a 1-minute bar is stamped at its START, so the value "at" an instant t is the close of the last bar that had ENDED by t.
Each asset is rebased to its value at the release instant and sampled every minute from -30 to +240 minutes (15-minute assets every 15). Rates in bp (rate = 100 - price), prices as log % change.
"""
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[2]
AO = ROOT / 'analysis' / 'output'
DEEP, BONDS, S1M = AO / 'stir_1m_deep', AO / 'stir_1m_bonds', AO / 'stir_1m'
OFFS = list(range(-30, 241))                       # minutes from the release
KEYS = ['sofr', 'eur', 'spr', 'zt', 'zn', 'dx', 'nq', 'eurusd', 'gbpusd', 'usdjpy', 'gold', 'es', 'vix', 'vxn']
ASSETS = ['sofr', 'eur', 'zt', 'zn', 'dx', 'nq', 'eurusd', 'gbpusd', 'usdjpy', 'gold', 'es', 'vix', 'vxn']      # the ones measured directly (the line is built from sofr and eur)
LABEL = {'sofr': 'SOFR Sep26 leg (bp)', 'eur': 'Euribor Mar27 leg (bp)', 'spr': 'SOFR - Euribor line (bp)', 'zt': 'US 2y note future (%)', 'zn': 'US 10y note future (%)', 'dx': 'Dollar index future (%)', 'nq': 'Nasdaq (%)',
         'eurusd': 'EUR/USD (%)', 'gbpusd': 'GBP/USD (%)', 'usdjpy': 'USD/JPY (%)', 'gold': 'Gold (%)', 'es': 'S&P 500 (%)', 'vix': 'VIX (points)', 'vxn': 'VXN (points)'}
UNIT = {'sofr': 'bp', 'eur': 'bp', 'spr': 'bp', 'zt': '%', 'zn': '%', 'dx': '%', 'nq': '%', 'eurusd': '%', 'gbpusd': '%', 'usdjpy': '%', 'gold': '%', 'es': '%', 'vix': 'pt', 'vxn': 'pt'}
# rates direction: +1 means "a rise in the number is a rise in rates / hawkish". Bond futures are PRICES, so price down = yields up.
RATES_SIGN = {'sofr': 1, 'eur': 1, 'spr': 1, 'zt': -1, 'zn': -1}


def _rd(p, cols=('time', 'close')):
    d = pd.read_parquet(p, columns=list(cols)); d['time'] = pd.to_datetime(d['time'], utc=True)
    return d.set_index('time')['close'].sort_index()


def _chain(files):
    """1-minute close series from several contract files (later files win on a clash); the contract is chosen per event by coverage, so levels are never spliced across a roll."""
    return [(Path(f).stem, _rd(f)) for f in files if Path(f).exists()]


class Src:
    """one asset: candidate 1-minute series (tried in order) plus an optional 15-minute CFD fallback"""
    def __init__(self, key, one_min, transform, cfd=None):
        self.key, self.cands, self.tf, self.cfd = key, one_min, transform, cfd


def _rd_ba(name):
    """1-minute OANDA CFD mid (research mid) from the bid/ask archive data/m1_bidask (to 2026-10-19); 'time' is a naive-UTC column, bar start"""
    d = pd.read_parquet(ROOT / 'data' / 'm1_bidask' / f'{name}_m1.parquet', columns=['time', 'close']); d['time'] = pd.to_datetime(d['time']).dt.tz_localize('UTC')
    return d.set_index('time')['close'].sort_index()


def _inv(s):
    return 1.0 / s


def _cfd15(name):
    s = pd.read_parquet(AO / 'rate-surprise-events' / 'm15' / f'{name}.parquet')['close']
    s = s[~s.index.duplicated()].sort_index(); s.index = pd.to_datetime(s.index, utc=True); return s


def load_sources():
    rate = lambda s: (100 - s) * 100                                              # price -> rate in bp
    logp = lambda s: np.log(s) * 100                                              # price -> log %
    nqcfd = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; nqcfd.index = pd.to_datetime(nqcfd.index, utc=True)
    S = {
        'sofr': Src('sofr', _chain([DEEP / 'CME_SR3U6.parquet']), rate),
        'eur': Src('eur', _chain([DEEP / 'ICEEU_IH7.parquet']), rate),
        'zt': Src('zt', _chain([DEEP / 'CBOT_ZTZ6.parquet', S1M / 'CBOT_ZTZ6.parquet', S1M / 'CBOT_ZTU6.parquet']), logp, cfd=_cfd15('USB02Y_USD')),
        'zn': Src('zn', _chain([DEEP / 'CBOT_ZNZ6.parquet', BONDS / 'CBOT_ZNZ6.parquet']), logp, cfd=_cfd15('USB10Y_USD')),
        'dx': Src('dx', _chain([DEEP / 'NYBOT_DXZ6.parquet']), logp),
        'nq': Src('nq', [('nq_m1_cfd', nqcfd.sort_index())] + _chain([S1M / 'CME_NQU6.parquet', S1M / 'CME_NQZ6.parquet', DEEP / 'CME_NQZ6.parquet']), logp),
    }
    ident = lambda s: s                                                           # volatility indices in points
    S.update({
        'eurusd': Src('eurusd', [('oanda_cfd', _rd_ba('eurusd'))] + _chain([DEEP / 'CME_6EZ6.parquet']), logp),
        'gbpusd': Src('gbpusd', [('oanda_cfd', _rd_ba('gbpusd'))] + _chain([DEEP / 'CME_6BZ6.parquet']), logp),
        'usdjpy': Src('usdjpy', [('oanda_cfd', _rd_ba('usdjpy'))] + [(n, _inv(x)) for n, x in _chain([DEEP / 'CME_6JZ6.parquet'])], logp),        # the yen future is USD per JPY: invert to USD/JPY
        'gold': Src('gold', [('oanda_cfd', _rd_ba('gold'))] + _chain([DEEP / 'COMEX_GCZ6.parquet']), logp),
        'es': Src('es', [('oanda_cfd', _rd_ba('spx'))] + _chain([DEEP / 'CME_ESZ6.parquet']), logp),
        'vix': Src('vix', _chain([DEEP / 'CBOE_VIX.parquet']), ident),
        'vxn': Src('vxn', _chain([DEEP / 'CBOE_VXN.parquet']), ident),
    })
    return S


def at_many(s, ts, tol=pd.Timedelta(minutes=10)):
    """value of the last 1-minute bar that had ended by each instant (NaN when the nearest ended bar is older than tol)"""
    idx = s.index.values; v = s.values; ts = pd.DatetimeIndex(ts).values
    i = np.searchsorted(idx, ts - np.timedelta64(1, 'm'), side='right') - 1
    ok = i >= 0; j = np.where(ok, i, 0)
    return np.where(ok & ((ts - idx[j]) <= tol.to_timedelta64()), v[j], np.nan)


def covers(s, t, a=-30, b=0, need=0.4):
    w = s[(s.index >= t + pd.Timedelta(minutes=a)) & (s.index < t + pd.Timedelta(minutes=b))]
    return len(w) >= need * (b - a)


def asset_path(src, t):
    """-> dict(step, v (list, rebased to the release instant), bars (1-minute bars actually present 0..+30), source, thin) or None"""
    for name, s in src.cands:
        if not covers(s, t): continue
        if src.key == 'nq' and name == 'nq_m1_cfd' and t >= pd.Timestamp('2026-08-21', tz='UTC'): continue
        tr = src.tf(s)
        ts = [t + pd.Timedelta(minutes=m) for m in OFFS]; x = at_many(tr, ts); b0 = x[OFFS.index(0)]
        if not np.isfinite(b0): continue
        x = np.where(pd.DatetimeIndex(ts).values > (s.index.max() + pd.Timedelta(minutes=1)).tz_convert('UTC').tz_localize(None).to_datetime64(), np.nan, x)      # nothing past the newest bar (a release still forming)
        w = s[(s.index >= t) & (s.index < t + pd.Timedelta(minutes=30))]
        return dict(step=1, v=[None if not np.isfinite(a) else round(float(a - b0), 3) for a in x], bars=int(len(w)), source=name, thin=bool(len(w) < 20))
    if src.cfd is not None and t < pd.Timestamp('2026-08-22', tz='UTC'):
        s = src.cfd; tr = src.tf(s); out = []
        px = lambda tt: s.get(tt - pd.Timedelta(minutes=15), np.nan)
        b0 = px(t)
        if not np.isfinite(b0): return None
        for m in OFFS:
            if m % 15: out.append(None); continue
            a = px(t + pd.Timedelta(minutes=m)); out.append(None if not np.isfinite(a) else round(float(np.log(a / b0) * 100), 3))
        return dict(step=15, v=out, bars=None, source='OANDA 15-min CFD', thin=False)
    return None


def cond_sigma(src, t, m, event_days, nprev=40):
    """RMS of the same m-minute clock window on the previous weekdays that carried no release (the conditional normaliser); 1-minute sources only"""
    for name, s in src.cands:
        if not covers(s, t): continue
        if src.key == 'nq' and name == 'nq_m1_cfd' and t >= pd.Timestamp('2026-08-21', tz='UTC'): continue
        tr = src.tf(s); d = t.normalize(); vals = []; k = 0
        while len(vals) < nprev and k < 120:
            k += 1; dd = d - pd.Timedelta(days=k)
            if dd.weekday() >= 5 or dd.date() in event_days: continue
            tt = dd + (t - d); a = at_many(tr, [tt, tt + pd.Timedelta(minutes=m)])
            if np.isfinite(a).all(): vals.append(a[1] - a[0])
        return float(np.sqrt(np.mean(np.square(vals)))) if len(vals) >= 15 else None
    return None


def cond_sigma_spread(S, t, m, event_days, nprev=40):
    """the same conditional normaliser for the SOFR - Euribor line (both legs must have a quote at the start and end of the window)"""
    ss = next((s for _, s in S['sofr'].cands if covers(s, t)), None); se = next((s for _, s in S['eur'].cands if covers(s, t)), None)
    if ss is None or se is None: return None
    a_, b_ = S['sofr'].tf(ss), S['eur'].tf(se); d = t.normalize(); vals = []; k = 0
    while len(vals) < nprev and k < 120:
        k += 1; dd = d - pd.Timedelta(days=k)
        if dd.weekday() >= 5 or dd.date() in event_days: continue
        tt = dd + (t - d); w = [tt, tt + pd.Timedelta(minutes=m)]; x, y = at_many(a_, w), at_many(b_, w)
        if np.isfinite(x).all() and np.isfinite(y).all(): vals.append((x[1] - y[1]) - (x[0] - y[0]))
    return float(np.sqrt(np.mean(np.square(vals)))) if len(vals) >= 15 else None


def metrics(p, sig30=None):
    """Layer 1 numbers from one rebased path (see module doc). All moves are in the path's own unit."""
    if p is None: return None
    st = p['step']; g = {m: v for m, v in zip(OFFS, p['v']) if v is not None}
    f = lambda m: g.get(m)
    out = dict(res=st)
    for m in (1, 5, 15, 30, 60, 120, 240):
        out[f'm{m}'] = f(m) if (st == 1 or m % 15 == 0) else None
    out['pre30'] = None if f(-30) is None else round(-f(-30), 3)                       # drift in the 30 minutes before the release
    win = [(m, g[m]) for m in range(0, 31) if m in g and (st == 1 or m % 15 == 0)]
    if win:
        mp, vp = max(win, key=lambda z: abs(z[1])); out['peak'] = vp; out['t_peak'] = mp
        m30 = f(30)
        out['retain'] = None if (m30 is None or abs(vp) < 1e-9) else round(m30 / vp, 2)         # 1 = the peak held to 30 min, <0 = the move reversed
        half = next((m for m, v in win if abs(vp) > 0 and v * vp > 0 and abs(v) >= 0.5 * abs(vp)), None); out['t_half'] = half
        first = next((m for m, v in win if abs(v) > 1e-9), None); out['t_first'] = first
    out['z_cond'] = None if (sig30 is None or sig30 <= 0 or f(30) is None) else round(f(30) / sig30, 2)
    return out


def jump_offset(s, t, w=10):
    """minute (relative to the stamped release) holding the largest 1-minute change of a 1-minute series. A bar stamped x covers x..x+1, so a release at t shows in the bar stamped t -> 0."""
    x = s[(s.index >= t - pd.Timedelta(minutes=w + 1)) & (s.index <= t + pd.Timedelta(minutes=w))]
    d = x.diff().abs().dropna()
    d = d[(d.index >= t - pd.Timedelta(minutes=w)) & (d.index <= t + pd.Timedelta(minutes=w))]
    if len(d) < 5 or d.max() == 0: return None
    return int(round((d.idxmax() - t).total_seconds() / 60))


def agreement(M, thr=0.0):
    """how many of the rates assets moved up vs down in rates over the first 30 minutes (SOFR leg, Euribor leg, 2y, 10y), in hawkish-positive terms"""
    up = dn = 0
    for k in ('sofr', 'eur', 'zt', 'zn'):
        m = (M.get(k) or {}).get('m30')
        if m is None or abs(m) <= thr: continue
        v = m * RATES_SIGN[k]
        if v > 0: up += 1
        elif v < 0: dn += 1
    return dict(up=up, down=dn, n=up + dn)


def build_event(S, ev, event_days):
    """ev: dict(t=Timestamp, family, name, ...) -> a full record with paths and metrics"""
    t = ev['t']; P = {}; M = {}; sig = {}
    for k in ASSETS:
        P[k] = asset_path(S[k], t)
        sig[k] = cond_sigma(S[k], t, 30, event_days) if P[k] and P[k]['step'] == 1 else None
    if P['sofr'] and P['eur']:                                                     # the line = SOFR leg - Euribor leg, point by point
        P['spr'] = dict(step=1, v=[None if (a is None or b is None) else round(a - b, 3) for a, b in zip(P['sofr']['v'], P['eur']['v'])], bars=min(P['sofr']['bars'], P['eur']['bars']), source='SR3U6 - IH7', thin=P['sofr']['thin'] or P['eur']['thin'])
        sig['spr'] = cond_sigma_spread(S, t, 30, event_days)
    else: P['spr'] = None
    for k in KEYS: M[k] = metrics(P.get(k), sig.get(k))
    jo = None
    for name, s in S['sofr'].cands:
        if covers(s, t): jo = jump_offset(s, t); break
    ag = agreement(M)
    r = {k: v for k, v in ev.items() if k != 't'}
    r.update(t=t.strftime('%Y-%m-%dT%H:%M:%SZ'), M=M, agree=ag, jump=jo)
    a_, c_ = ev.get('actual'), ev.get('consensus')
    r['surprise'] = None if a_ is None or c_ is None else round(a_ - c_, 4)                                    # raw actual - consensus, in the release's own unit (Layer 2 models it)
    if S.get('_daily') is not None:                                                                          # the days view (daily_lib): trading-day path k=-6..+5 around the release date
        from daily_lib import daily_path, DKEYS
        day = t.tz_convert('America/New_York').tz_localize(None).normalize(); r['D'] = {k: daily_path(S['_daily'], k, day, ev.get('family')) for k in DKEYS}
    return r, {k: ({kk: vv for kk, vv in P[k].items()} if P.get(k) else None) for k in KEYS}
