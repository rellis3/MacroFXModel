"""bridge.py — does a yellow-line flip actually coincide with a PRICE turn?

The unexamined assumption under the whole timing thread. `duration.py` showed
that predicting when the Cipher B yellow line (`wt1 - wt2`) crosses zero is
easy and almost entirely mechanical — a random walk reproduces the law. That
only matters if the flip lands on a real price pivot. If it does, mechanically
anticipating the flip hands you price timing for free. If it does not, the
timing thread is dead.

THE TWO CONTROLS, AND WHY BOTH ARE NEEDED
─────────────────────────────────────────
Price pivots are not rare, so with any tolerance window you hit some by luck.
And the yellow line is DERIVED FROM PRICE, so a bare coincidence rate is
guaranteed to look impressive. Two separate controls:

  RANDOM BARS   same count of bars drawn at random from the same series.
                Answers: "are crosses nearer to pivots than arbitrary bars?"

  RANDOM WALK   the identical measurement on synthetic data with matched pivot
                detection. Answers the harder question: "is the coincidence
                more than the mechanical consequence of both objects being
                derived from the same wiggly line?" This is the control that
                killed the duration result, so it is not optional here.

DIRECTION IS SCORED SEPARATELY
──────────────────────────────
Coinciding is not enough — an UP-cross should land on a price TROUGH to be
useful. A cross that reliably lands near pivots of the WRONG sign would be
worse than useless, and a bare proximity number hides that.

  python vumanchuLab/bridge.py --instrument eurusd --tf 5
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Redirecting stdout to a file makes Python pick the locale codec (cp1252 on
# Windows), which dies on the sigma/arrow glyphs this module prints. Force
# UTF-8 so `> out.txt` behaves the same as the console.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from vumanchuLab.events import build_events  # noqa: E402
from vumanchuLab.panel import SIGMA_MIN, SIGMA_WINDOW, load_m1, resample  # noqa: E402
from pylego.indicators.vumanchu import OPERATOR_WT, wave_trend  # noqa: E402

WINDOWS = (1, 2, 3, 5, 8)     # +/- bars tolerance
PIVOT_K = 12
MIN_SWING = 1.0


def zero_crosses(y: np.ndarray):
    """Bars where the yellow line changes sign. +1 = crossed UP."""
    s = np.sign(np.asarray(y, dtype=float))
    ok = np.isfinite(s) & (s != 0)
    idx = np.flatnonzero(ok)
    if idx.size < 2:
        return np.empty(0, int), np.empty(0, int)
    v = s[idx]
    ch = np.flatnonzero(v[1:] != v[:-1]) + 1
    return idx[ch], v[ch].astype(int)


def coincidence(cross_i, cross_dir, piv_i, piv_dir, n, windows=WINDOWS, seed=5):
    """P(a price pivot lands within +/-w of a cross), vs a random-bar control,
    plus the share of those hits whose DIRECTION agrees."""
    rng = np.random.default_rng(seed)
    rand_i = rng.integers(0, n, size=max(cross_i.size, 1))
    piv_sorted = np.sort(piv_i)
    order = np.argsort(piv_i)
    pdir = np.asarray(piv_dir)[order]

    def nearest(qs):
        if piv_sorted.size == 0:
            return np.full(qs.size, 10**9), np.zeros(qs.size, int)
        j = np.searchsorted(piv_sorted, qs)
        lo = np.clip(j - 1, 0, piv_sorted.size - 1)
        hi = np.clip(j, 0, piv_sorted.size - 1)
        dlo = np.abs(qs - piv_sorted[lo])
        dhi = np.abs(qs - piv_sorted[hi])
        pick = np.where(dlo <= dhi, lo, hi)
        return np.minimum(dlo, dhi), pdir[pick]

    d_real, dir_real = nearest(cross_i)
    d_rand, _ = nearest(rand_i)
    rows = []
    for w in windows:
        hit = d_real <= w
        p_real = float(hit.mean())
        p_rand = float((d_rand <= w).mean())
        # cross UP (+1) should meet a pivot LOW (+1 in build_events' convention)
        agree = float((dir_real[hit] == cross_dir[hit]).mean()) if hit.sum() else np.nan
        rows.append({
            'window_bars': w,
            'P_hit': round(100 * p_real, 1),
            'P_random_bar': round(100 * p_rand, 1),
            'lift': round(p_real / p_rand, 2) if p_rand > 0 else np.nan,
            'dir_agree_pct': round(100 * agree, 1) if np.isfinite(agree) else np.nan,
        })
    return pd.DataFrame(rows)


def measure(high, low, close, label, k=PIVOT_K, ms=MIN_SWING, seed=5, quiet=False):
    wt = wave_trend(high, low, close, **OPERATOR_WT)
    y = wt.wt1 - wt.wt2
    ci, cd = zero_crosses(y)
    sigma = pd.Series(close).pct_change().rolling(
        SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy()
    (ri, rd), _ = build_events(close, high, low, sigma, k, ms)
    if not quiet:
        print(f'  {label}: {ci.size:,} zero-crosses, {ri.size:,} price pivots '
              f'({100*ri.size/len(close):.2f}% of bars)')
    return coincidence(ci, cd, ri, rd, len(close), seed=seed), ci.size, ri.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--tf', type=int, default=5)
    ap.add_argument('--pivot-k', type=int, default=PIVOT_K)
    ap.add_argument('--min-swing', type=float, default=MIN_SWING)
    a = ap.parse_args()

    bars = resample(load_m1(a.instrument), a.tf)
    h = bars['high'].to_numpy(float); l = bars['low'].to_numpy(float)
    c = bars['close'].to_numpy(float)

    print(f'\n{"="*90}')
    print(f'DOES A YELLOW-LINE FLIP LAND ON A PRICE TURN? — {a.instrument} {a.tf}m')
    print(f'pivot = extreme of +/-{a.pivot_k} bars with >= {a.min_swing}σ both sides')
    print(f'{"="*90}\n')

    real, nc, npv = measure(h, l, c, f'REAL {a.instrument}', a.pivot_k, a.min_swing)
    print('\n  REAL')
    print(real.to_string(index=False))

    # Random-walk control with matched length and roughly matched volatility.
    rng = np.random.default_rng(17)
    vol = float(np.nanstd(np.diff(np.log(c))))
    p = c[0] * np.exp(np.cumsum(rng.normal(0, vol, len(c))))
    wig = p * vol * 0.5
    print()
    synth, _, _ = measure(p + wig, p - wig, p, 'random walk', a.pivot_k, a.min_swing)
    print('\n  RANDOM WALK (same length, matched volatility)')
    print(synth.to_string(index=False))

    m = real.merge(synth, on='window_bars', suffixes=('_real', '_rw'))
    m['excess_lift'] = (m['lift_real'] - m['lift_rw']).round(2)
    m['excess_dir'] = (m['dir_agree_pct_real'] - m['dir_agree_pct_rw']).round(1)
    print(f'\n  REAL minus RANDOM WALK — the only column that carries market content')
    print(m[['window_bars', 'lift_real', 'lift_rw', 'excess_lift',
             'dir_agree_pct_real', 'dir_agree_pct_rw', 'excess_dir']].to_string(index=False))

    print(f'\n{"-"*90}')
    print('lift          = P(pivot within window of a cross) ÷ P(same for a random bar)')
    print('dir_agree_pct = of the hits, how many were the RIGHT KIND of pivot')
    print('                (up-cross meeting a trough). 50% = coin flip on direction.')
    print('excess_*      = real minus random walk. Near zero means the coincidence is')
    print('                mechanical — both objects derive from the same price series —')
    print('                and the flip carries no independent information about turns.')
    print('-' * 90)


if __name__ == '__main__':
    main()
