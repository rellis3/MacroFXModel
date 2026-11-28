"""Shared pieces for fred-untested-range (forge/FRED_UNTESTED_RANGE_PREREG.md)."""
import math, os
import numpy as np
import pandas as pd

SEED = 20261128
B_DISC, B_CONF, BLOCK = 1000, 2000, 21
H = 5                                   # next-week window: sessions D .. D+4
SPLIT = pd.Timestamp('2023-08-21')      # discovery < SPLIT <= held-out
END = pd.Timestamp('2026-08-20')        # last session; lockbox starts 2026-08-22
WIN, MINWIN = 252, 126                  # trailing percentile window (grid days), minimum history (A1: was 756/252)
CHG = 20                                # change lookback, sessions
INSTS = ['EURUSD', 'USDJPY', 'GOLD', 'NQ', 'SPX500']
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.environ.get('DATA_ROOT', r'C:\Users\relli\OneDrive\Documents\Programming\Trading\v2 trading model\MacroFXModel')
OUT = os.path.join(REPO, 'analysis', 'output', 'fred-untested-range')
VINT = os.path.join(OUT, 'vintages')


def errors():
    """e = ln(r_hl / shipped p50) per instrument per London session (SI p50, else S), OOS rows only; e5 = mean of e over D..D+4."""
    d = pd.read_parquet(os.path.join(DATA, 'analysis/output/vf3_stage_b/part1_lines.parquet'),
                        columns=['inst', 'date', 'oos', 'r_hl', 'S_hl_p50', 'SI_hl_p50'])
    d = d[(d.oos == 1) & d.inst.isin(INSTS)].copy(); d['date'] = pd.to_datetime(d['date'])
    d = d[d.date <= END]
    d['e'] = np.log(d.r_hl / d.SI_hl_p50.fillna(d.S_hl_p50)); d = d[np.isfinite(d.e)]
    E = d.pivot_table(index='date', columns='inst', values='e').sort_index()
    E5 = E.rolling(H, min_periods=H).mean().shift(-(H - 1))   # row D = mean of rows D..D+4 (that instrument's sessions)
    # require the five rows to span <= 9 calendar days (one week, no data hole)
    span = pd.Series(E.index, index=E.index).shift(-(H - 1)) - pd.Series(E.index, index=E.index)
    E5[span > pd.Timedelta(days=9)] = np.nan
    return E, E5


def trailing_pct(x, win=WIN, minwin=MINWIN):
    """percentile rank of x[t] among x[t-win+1 .. t] (causal); NaN until minwin valid points."""
    s = pd.Series(x)
    def f(w):
        if not np.isfinite(w[-1]): return np.nan
        h = w[:-1][np.isfinite(w[:-1])]
        return (h < w[-1]).mean() + 0.5 * (h == w[-1]).mean() if len(h) >= minwin - 1 else np.nan
    return s.rolling(win, min_periods=minwin).apply(f, raw=True).values


def tdiff(ev, pct, nmin=60):
    """mean e5 where pct >= 2/3 minus mean e5 where pct <= 1/3 (log units)."""
    ok = np.isfinite(ev) & np.isfinite(pct)
    a = ev[ok & (pct >= 2 / 3)]; b = ev[ok & (pct <= 1 / 3)]
    return a.mean() - b.mean() if len(a) >= nmin and len(b) >= nmin else np.nan


def block_idx(n, rng, B, block=BLOCK):
    nb = math.ceil(n / block)
    st = rng.integers(0, n - block + 1, (B, nb))
    return (st[:, :, None] + np.arange(block)[None, None, :]).reshape(B, -1)[:, :n]


def boot(ev, pct, rng, B):
    idx = block_idx(len(ev), rng, B)
    out = np.array([tdiff(ev[i], pct[i]) for i in idx])
    return out


def p_from_boot(est, bs):
    se = np.nanstd(bs)
    return math.erfc(abs(est) / se / math.sqrt(2)) if se > 0 and np.isfinite(est) else 1.0, se


def bh(ps, q=0.10):
    ps = [1.0 if not np.isfinite(p) else p for p in ps]
    order = sorted(range(len(ps)), key=lambda i: ps[i]); m = len(ps); k = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / m: k = r
    return set(order[:k])


def holm(ps, alpha=0.05):
    ps = [1.0 if not np.isfinite(p) else p for p in ps]
    order = sorted(range(len(ps)), key=lambda i: ps[i]); m = len(ps); keep = set()
    for r, i in enumerate(order):
        if ps[i] <= alpha / (m - r): keep.add(i)
        else: break
    return keep


pct = lambda x: 100 * (math.exp(x) - 1) if x is not None and np.isfinite(x) else None
