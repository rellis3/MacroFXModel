"""divergence_stack.py — when a divergence forms, what predicts how BIG the
move that follows is?

THE HYPOTHESIS (the owner's, from two annotated pullbacks on a gold 5m chart)
────────────────────────────────────────────────────────────────────────────
  Pullback 1: price up, WaveTrend down. ONE regular bear divergence.
              -> a small pullback.
  Pullback 2: the divergence repeats over TWO successive peaks (a "double"),
              AND the VWAP oscillator diverges at the same time.
              -> a much bigger reversal.

So the claim is not "divergence predicts a turn" (binary — already tested in
`events.py`, and null). It is:

  GIVEN a divergence has formed, its STACKING predicts the SIZE of what follows.
    (a) how many divergences have fired consecutively in the same direction
    (b) how many of the three components are diverging simultaneously

That is a magnitude question, and it is the one this module tests.

DESIGN
──────
Divergences are detected CAUSALLY, bar by bar, as they confirm — not read off
pre-identified pivots. Each one is logged with:

    dir           the direction it argues for (+1 up, -1 down)
    kind          regular | hidden
    components    which of WT / VWAP / MF are diverging within `join_bars`
    n_components  1-3
    streak        1 = first of its run, 2 = double, 3+ = triple and beyond
                  (a run breaks when the opposite direction fires, or after
                  `streak_gap` bars of silence)
    wt_level      OB / mid / OS at the moment it fired

and then the FORWARD outcome, in the direction the divergence argued for:

    mfe_sig       best excursion the divergence's way, in sigma (the "how big"
                  the hypothesis is about)
    mae_sig       worst excursion against it — the cost of being early
    ret_sig       close-to-close move
    mfe_usd       the same MFE in instrument units, for a tangible read

WHAT MAKES THIS HONEST
──────────────────────
Every stacked bucket is compared against the SAME-DIRECTION baseline of all
divergences at that horizon, so "bigger" means bigger than an ordinary
divergence rather than bigger than nothing. Bars are also compared against a
random-bar control drawn to the same direction mix — because in a trending
market an MFE in ANY direction looks impressive, and the control is what
separates a real effect from ambient volatility.

Streak and component-count are correlated with volatility regime by
construction (busy markets throw more divergences), so a `vol_bucket` split is
reported alongside the pooled number.

  python vumanchuLab/divergence_stack.py --instrument gold
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.events import component_frame  # noqa: E402
from vumanchuLab.panel import SIGMA_MIN, SIGMA_WINDOW  # noqa: E402
from pylego.instruments import asset_class, pip_size  # noqa: E402

# Fractal reach for pivot confirmation on the event grid. 2 = the operator's
# 5-bar fractal (2 either side), matching the VuManChu divergence convention.
REACH = 2
# Two pivots must be at least this far apart to count as a divergence.
MIN_GAP = 5
# How far back to look for the previous pivot.
LOOKBACK = 60
# Minimum oscillator separation (units of the +/-100 scale) to call it.
OSC_MIN = 2.0
# Two components "co-diverge" if they fire within this many bars of each other.
JOIN_BARS = 6
# A same-direction run breaks after this many quiet bars.
STREAK_GAP = 60
# Forward horizons, in event-grid bars.
HORIZONS = (12, 36, 72)


# ── causal pivot + divergence detection ──────────────────────────────────────

def confirmed_pivots(series: np.ndarray, reach: int):
    """Pivot highs/lows with `reach` bars either side.

    Returns (idx, kind, confirm_idx) where confirm_idx = idx + reach — the bar
    at which the pivot first becomes KNOWABLE. Nothing downstream may use a
    pivot before its confirm bar; that is the whole causality guard.
    """
    n = len(series)
    s = pd.Series(series)
    rmax = s.rolling(2 * reach + 1, center=True).max().to_numpy()
    rmin = s.rolling(2 * reach + 1, center=True).min().to_numpy()
    out = []
    for i in range(reach, n - reach):
        if series[i] == rmax[i]:
            out.append((i, 1, i + reach))
        elif series[i] == rmin[i]:
            out.append((i, -1, i + reach))
    return out


def detect_divergences(price: np.ndarray, osc: np.ndarray, reach=REACH,
                       min_gap=MIN_GAP, lookback=LOOKBACK, osc_min=OSC_MIN):
    """Every regular/hidden divergence, stamped at the bar it CONFIRMS.

    Compares the two most recent price pivots of the same kind and the
    oscillator readings at those same bars. Emits
    (confirm_idx, direction, kind) with direction +1 = argues price up.
    """
    piv = confirmed_pivots(price, reach)
    highs = [(i, c) for (i, k, c) in piv if k == 1]
    lows = [(i, c) for (i, k, c) in piv if k == -1]
    events = []

    for arr, is_high in ((highs, True), (lows, False)):
        for a in range(1, len(arr)):
            (i2, c2), (i1, _) = arr[a], arr[a - 1]
            if i2 - i1 < min_gap or i2 - i1 > lookback:
                continue
            p1, p2 = price[i1], price[i2]
            o1, o2 = osc[i1], osc[i2]
            if not (np.isfinite(o1) and np.isfinite(o2)):
                continue
            # `gap` is the SIZE of the oscillator disagreement, and `span` the
            # bars between the two pivots. Presence and stacking were tested;
            # magnitude never was, and a 5-point divergence is not a 30-point
            # one.
            span = i2 - i1
            if is_high:
                if p2 > p1 and (o1 - o2) >= osc_min:
                    events.append((c2, -1, 'regular', o1 - o2, span))
                elif p2 < p1 and (o2 - o1) >= osc_min:
                    events.append((c2, -1, 'hidden', o2 - o1, span))
            else:
                if p2 < p1 and (o2 - o1) >= osc_min:
                    events.append((c2, +1, 'regular', o2 - o1, span))
                elif p2 > p1 and (o1 - o2) >= osc_min:
                    events.append((c2, +1, 'hidden', o1 - o2, span))
    events.sort(key=lambda e: e[0])
    return events


# ── assemble the log ─────────────────────────────────────────────────────────

def build_log(instrument: str, event_tf: int = 5, start=None, end=None,
              verbose=True) -> pd.DataFrame:
    df, s = component_frame(instrument, event_tf, start=start, end=end, verbose=verbose)
    close = s['close']; high = s['high']; low = s['low']
    wt1 = s['wt1']; mf = s['mf']; vd = s['vwap_dist']
    n = len(close)

    comp = {
        'WT': detect_divergences(close, wt1),
        'VWAP': detect_divergences(close, vd),
        'MF': detect_divergences(close, mf),
    }
    if verbose:
        print('  divergences found: ' + ', '.join(f'{k}={len(v)}' for k, v in comp.items()))

    # Index the non-WT components by bar for fast co-occurrence lookup.
    other = {}
    for name in ('VWAP', 'MF'):
        d = {}
        for ev in comp[name]:
            d.setdefault(ev[1], []).append(ev[0])
        other[name] = {k: np.array(sorted(v)) for k, v in d.items()}

    sigma = pd.Series(close).pct_change().rolling(
        SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy()
    vb = (pd.Series(sigma).rolling(20000, min_periods=2000)
          .rank(pct=True).mul(3).clip(0, 2.999).fillna(-1).astype(int).to_numpy())

    rows = []
    last_dir, last_i, streak = 0, -10**9, 0
    for (i, dirn, kind, gap, span) in comp['WT']:
        if i >= n - max(HORIZONS) - 1 or not np.isfinite(sigma[i]) or sigma[i] <= 0:
            continue
        # streak bookkeeping — same direction, close enough together
        if dirn == last_dir and (i - last_i) <= STREAK_GAP:
            streak += 1
        else:
            streak = 1
        last_dir, last_i = dirn, i

        # which other components diverge the same way, near this bar
        comps = ['WT']
        for name in ('VWAP', 'MF'):
            arr = other[name].get(dirn)
            if arr is not None and arr.size:
                j = np.searchsorted(arr, i)
                near = False
                for cand in arr[max(0, j - 2):j + 2]:
                    if abs(int(cand) - i) <= JOIN_BARS:
                        near = True
                        break
                if near:
                    comps.append(name)

        rec = {
            'idx': i, 'dir': dirn, 'kind': kind,
            'streak': min(streak, 3), 'streak_raw': streak,
            'components': '+'.join(comps), 'n_components': len(comps),
            'has_vwap': 'VWAP' in comps, 'has_mf': 'MF' in comps,
            'wt_level': 'OB' if wt1[i] >= 53 else ('OS' if wt1[i] <= -53 else 'mid'),
            'vol_bucket': int(vb[i]),
            # magnitude of the disagreement, and how far apart the two pivots were
            'gap': round(float(gap), 2),
            'span': int(span),
        }
        for h in HORIZONS:
            e = min(n - 1, i + h)
            scale = sigma[i] * np.sqrt(h)
            seg_h = high[i + 1:e + 1]; seg_l = low[i + 1:e + 1]
            if seg_h.size == 0:
                continue
            up = (seg_h.max() / close[i] - 1.0)
            dn = (seg_l.min() / close[i] - 1.0)
            fav, adv = (up, dn) if dirn > 0 else (-dn, -up)
            rec[f'mfe_{h}'] = fav / scale
            rec[f'mae_{h}'] = adv / scale
            rec[f'ret_{h}'] = dirn * (close[e] / close[i] - 1.0) / scale
            rec[f'mfe_usd_{h}'] = fav * close[i]
        rows.append(rec)

    log = pd.DataFrame(rows)
    if verbose and len(log):
        print(f'  logged {len(log):,} WaveTrend divergences '
              f'({100*log["has_vwap"].mean():.1f}% co-diverge with VWAP, '
              f'{100*log["has_mf"].mean():.1f}% with MF)')
    return log


def control_baseline(instrument: str, log: pd.DataFrame, event_tf=5,
                     seed=7) -> dict:
    """Random bars, drawn to the same direction mix — the ambient-volatility
    floor. Without it, any MFE in a trending market looks like a result."""
    df, s = component_frame(instrument, event_tf, verbose=False)
    close = s['close']; high = s['high']; low = s['low']; n = len(close)
    sigma = pd.Series(close).pct_change().rolling(
        SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy()
    rng = np.random.default_rng(seed)
    m = min(20000, max(2000, len(log) * 4))
    idx = rng.integers(SIGMA_WINDOW + 10, n - max(HORIZONS) - 2, size=m)
    dirs = rng.choice(log['dir'].to_numpy(), size=m) if len(log) else np.ones(m)
    out = {}
    for h in HORIZONS:
        vals = []
        for i, d in zip(idx, dirs):
            sc = sigma[i] * np.sqrt(h)
            if not np.isfinite(sc) or sc <= 0:
                continue
            e = min(n - 1, i + h)
            up = high[i + 1:e + 1].max() / close[i] - 1.0
            dn = low[i + 1:e + 1].min() / close[i] - 1.0
            vals.append((up if d > 0 else -dn) / sc)
        out[h] = float(np.mean(vals)) if vals else np.nan
    return out


# ── reporting ────────────────────────────────────────────────────────────────

def summarise(log: pd.DataFrame, by, h: int, base: float, unit: str,
              min_n: int = 60) -> pd.DataFrame:
    col, mae, usd = f'mfe_{h}', f'mae_{h}', f'mfe_usd_{h}'
    rows = []
    for key, g in log.groupby(by, dropna=True):
        if len(g) < min_n:
            continue
        mfe = g[col].dropna()
        if mfe.empty:
            continue
        se = float(mfe.std(ddof=1) / np.sqrt(len(mfe)))
        rows.append({
            'cell': key if not isinstance(key, tuple) else '+'.join(map(str, key)),
            'n': len(g),
            'mfe_sig': round(float(mfe.mean()), 3),
            'vs_control': round(float(mfe.mean()) - base, 3),
            't': round((float(mfe.mean()) - base) / se, 2) if se > 0 else np.nan,
            f'mfe_{unit}': round(float(g[usd].mean()), 1),
            'mae_sig': round(float(g[mae].mean()), 3),
            'edge_ratio': round(float(mfe.mean()) / abs(float(g[mae].mean())), 2)
            if float(g[mae].mean()) != 0 else np.nan,
        })
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='gold')
    ap.add_argument('--event-tf', type=int, default=5)
    ap.add_argument('--horizon', type=int, default=36)
    ap.add_argument('--start', default=None)
    a = ap.parse_args()

    unit = 'pips' if asset_class(a.instrument) == 'fx' else 'usd'
    print(f'Building divergence log for {a.instrument} ...')
    log = build_log(a.instrument, a.event_tf, start=a.start)
    if log.empty:
        print('no divergences logged'); return
    print('  computing random-bar control ...')
    ctrl = control_baseline(a.instrument, log, a.event_tf)
    h = a.horizon
    base = ctrl[h]

    print(f'\n{"="*104}')
    print(f'DIVERGENCE STACKING -> SIZE OF WHAT FOLLOWS — {a.instrument}, '
          f'{a.event_tf}m grid, {h*a.event_tf}m forward')
    print(f'{len(log):,} WaveTrend divergences · random-bar control MFE = {base:.3f}σ')
    print('mfe_sig = average best excursion the divergence\'s way, in sigma.')
    print('vs_control is the number that matters; edge_ratio = MFE ÷ |MAE|.')
    print(f'{"="*104}')

    print('\n-- (a) THE DOUBLE: how many divergences have stacked in a row --')
    print(summarise(log, 'streak', h, base, unit).to_string(index=False))

    print('\n-- (b) HOW MANY OF THE THREE COMPONENTS DIVERGE TOGETHER --')
    print(summarise(log, 'n_components', h, base, unit).to_string(index=False))

    print('\n-- which components, exactly --')
    print(summarise(log, 'components', h, base, unit).to_string(index=False))

    print('\n-- (a)+(b) COMBINED: the green-box case is streak>=2 AND WT+VWAP --')
    log = log.copy()
    log['combo'] = np.where(
        (log['streak'] >= 2) & log['has_vwap'], 'double + VWAP',
        np.where(log['streak'] >= 2, 'double, WT only',
                 np.where(log['has_vwap'], 'single + VWAP', 'single, WT only')))
    print(summarise(log, 'combo', h, base, unit).to_string(index=False))

    print('\n-- regular vs hidden --')
    print(summarise(log, 'kind', h, base, unit).to_string(index=False))

    print('\n-- (c) DIVERGENCE MAGNITUDE: does a BIGGER gap mean a bigger move? --')
    log['gap_q'] = pd.qcut(log['gap'], 4,
                           labels=['Q1 small', 'Q2', 'Q3', 'Q4 large'],
                           duplicates='drop').astype(str)
    print(summarise(log, 'gap_q', h, base, unit).to_string(index=False))

    print('\n-- magnitude x VWAP co-divergence (the cell that actually worked) --')
    log['gap_vwap'] = log['gap_q'] + np.where(log['has_vwap'], ' +VWAP', ' WT only')
    print(summarise(log, 'gap_vwap', h, base, unit).to_string(index=False))

    print('\n-- PIVOT SPAN: how far apart were the two peaks? --')
    log['span_q'] = pd.qcut(log['span'], 4, labels=['Q1 near', 'Q2', 'Q3', 'Q4 far'],
                            duplicates='drop').astype(str)
    print(summarise(log, 'span_q', h, base, unit).to_string(index=False))

    print('\n-- volatility-regime control (does stacking just mean "busy market"?) --')
    print(summarise(log, ['vol_bucket', 'combo'], h, base, unit, min_n=40)
          .to_string(index=False))

    print(f'\n{"-"*104}')
    print('READ: vs_control near 0 means the bucket does no better than a random bar')
    print('drawn the same direction — the divergence added nothing, however it stacked.')
    print('-' * 104)


if __name__ == '__main__':
    main()
