"""lookup.py — state in, outcome distribution out.

The engine surface: describe what the three VuManChu parts are doing right now
across 1m/5m/15m, and get back what price did the LAST N TIMES it looked like
this — as a distribution, with the sample count and the year-to-year spread.

NOT a trading system. No costs, no entry, no exit, no P&L. It answers one
question: "historically, how often did price revert the prior move from a state
like this, versus continue it?"

MATCH BACKOFF
─────────────
An exact 3-timeframe shape match is often too rare to mean anything. So the
lookup tries progressively looser matches and TELLS YOU which one it used:

  L0  exact   all three timeframes' zone AND form, + MF sign, + VWAP slope
  L1  shapes  all three timeframes' zone AND form
  L2  zones   all three timeframes' zone
  L3  core    fast + slow zone
  L4  fast    fast timeframe zone only

It reports the tightest level that still clears `min_n`. A number from L4 with
n=50,000 and a number from L0 with n=90 are very different objects, so the
level is always printed next to the probability.

READING THE OUTPUT HONESTLY
───────────────────────────
Three numbers matter, in this order:

  n         how many historical analogues. Under ~300 treat the estimate as
            indicative only.
  baseline  what an equivalent bar did (same hour, same volatility regime, same
            prior-move size). The conditional probability alone is meaningless —
            an instrument that drifts up reverts down-moves more often for free.
  spread    the per-year range of the delta. Measured on this data, the SIGN of
            these effects is very stable but the SIZE is not — gold's tripled
            between 2021-23 and 2024-26. A single pooled number hides that, so
            the per-year min/max ships alongside it.

The cell here is determined by the chart in front of you, not chosen because it
scored well, so this is not a cherry-picked cell. It is still a historical
frequency, not a forecast, and the magnitude is demonstrably non-stationary.

  python vumanchuLab/lookup.py --instrument gold --tf1 OS/Vup --tf5 OS/fall --tf15 mid/fall
  python vumanchuLab/lookup.py --instrument eurusd --at "2025-09-17 11:00"
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import DATA  # noqa: E402
from vumanchuLab.panel import OB, OS, TIMEFRAMES  # noqa: E402
from vumanchuLab.shapes import (  # noqa: E402
    FORM_LAG, LAGS, build_shape_frame, symbolic_codes,
)

LEVELS = [
    ('L0 exact  (3 shapes + MF sign + VWAP slope)',
     ['tf1_code', 'tf5_code', 'tf15_code', 'mf_sign', 'vwap_slope']),
    ('L1 shapes (3 timeframes, zone + form)', ['tf1_code', 'tf5_code', 'tf15_code']),
    ('L2 zones  (3 timeframes, zone only)', ['tf1_level', 'tf5_level', 'tf15_level']),
    ('L3 core   (fast + slow zone)', ['tf1_level', 'tf15_level']),
    ('L4 fast   (fast timeframe zone only)', ['tf1_level']),
]
MIN_N = 300
VALID_LEVEL = ('OS', 'mid', 'OB')
VALID_FORM = ('rise', 'fall', 'Vup', 'Vdn')


def load(instrument: str, horizon: int, prior: int, cache={}) -> pd.DataFrame:
    key = (instrument, horizon, prior)
    if key in cache:
        return cache[key]
    df = build_shape_frame(instrument, prior_w=prior, horizon=horizon, verbose=False)
    sym = symbolic_codes(df)
    out = pd.concat([df, sym], axis=1)
    out['mf_sign'] = np.sign(out['tf1_l0'] * 0 + np.sign(out.get('mf_now', 0))) \
        if 'mf_now' in out else np.nan
    cache[key] = out
    return out


def enrich(instrument: str, horizon: int, prior: int) -> pd.DataFrame:
    """Shape frame + the MF sign and VWAP slope columns the L0 match needs."""
    from vumanchuLab.events import component_frame
    from pylego.indicators.vumanchu import align_htf_causal
    from vumanchuLab.panel import epoch_seconds, load_m1, resample

    df = load(instrument, horizon, prior)
    m1 = load_m1(instrument)
    base = resample(m1, TIMEFRAMES[0])
    cf, _ = component_frame(instrument, TIMEFRAMES[0], verbose=False)
    mf = cf['mf'].reindex(df.index)
    vd = cf['vwap_dist'].reindex(df.index)
    df = df.copy()
    df['mf_sign'] = np.sign(mf).fillna(0).astype(int).astype(str)
    df['vwap_slope'] = np.sign(vd.diff(3)).fillna(0).astype(int).astype(str)
    return df


def query(df: pd.DataFrame, spec: dict, min_n: int = MIN_N):
    """Try each match level tightest-first; return the first that clears min_n."""
    base_rate = float(df['reverted'].mean())
    for label, cols in LEVELS:
        if not all(c in spec and spec[c] is not None for c in cols):
            continue
        if not all(c in df.columns for c in cols):
            continue
        m = pd.Series(True, index=df.index)
        for c in cols:
            m &= (df[c].astype(str) == str(spec[c]))
        n = int(m.sum())
        if n < min_n:
            continue
        return label, cols, m, n, base_rate
    return None, None, None, 0, base_rate


def matched_baseline(df: pd.DataFrame, m: pd.Series) -> float:
    """Same hour x vol-bucket x prior-move-size mix as the matched rows."""
    st = (df['hour'].astype(int) * 100 + df['vol_bucket'].astype(int) * 10
          + df['prior_bucket'].astype(int))
    glob = df['reverted'].groupby(st).mean()
    w = st[m].value_counts(normalize=True)
    common = w.index.intersection(glob.index)
    if not len(common):
        return float(df['reverted'].mean())
    return float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())


def report(instrument: str, spec: dict, horizon: int, prior: int, min_n: int):
    df = enrich(instrument, horizon, prior)
    label, cols, m, n, uncond = query(df, spec, min_n)

    print(f'\n{"="*84}')
    print(f'STATE LOOKUP — {instrument}')
    print(f'  1m  {spec.get("tf1_code", "—")}')
    print(f'  5m  {spec.get("tf5_code", "—")}')
    print(f'  15m {spec.get("tf15_code", "—")}')
    if spec.get('mf_sign') is not None:
        print(f'  money flow {spec["mf_sign"]}   vwap slope {spec.get("vwap_slope","—")}')
    print(f'  question: over the next {horizon} min, does price REVERT the prior '
          f'{prior} min move?')
    print(f'{"="*84}')

    if m is None:
        print(f'\nNo match level reached n >= {min_n}. This state is too rare in '
              f'{len(df):,} bars to say anything.')
        return

    sub = df[m]
    p = float(sub['reverted'].mean())
    base = matched_baseline(df, m)
    # per-year spread of the delta — the non-stationarity, made visible
    per_year = []
    for yr, g in sub.groupby(sub.index.year):
        if len(g) < 40:
            continue
        per_year.append((int(yr), 100 * (float(g['reverted'].mean()) - base)))

    print(f'\n  matched at:  {label}')
    print(f'  analogues:   n = {n:,}  ({100*n/len(df):.1f}% of all bars)')
    print(f'\n  P(revert)          {p*100:5.1f}%')
    print(f'  matched baseline   {base*100:5.1f}%   (same hour / vol / prior-move size)')
    print(f'  P(continue)        {(1-p)*100:5.1f}%')
    print(f'  --> delta          {100*(p-base):+5.1f} pp')

    if per_year:
        ys = [d for _, d in per_year]
        pos = sum(1 for d in ys if d > 0)
        print(f'\n  per-year delta:    min {min(ys):+.1f}  max {max(ys):+.1f} pp   '
              f'({pos}/{len(ys)} years same sign)')
        print('                     ' + '  '.join(f'{y}:{d:+.1f}' for y, d in per_year))

    for h in ('mfe', 'mae'):
        col = f'{h}_x'
        if col in sub.columns:
            print(f'  {h}: {sub[col].mean():.3f}')

    print('\n  READ: the delta is the informative number. A few points off a coin flip')
    print('  is what this indicator gives — the sign has been stable, the size has not.')
    print(f'  Unconditional P(revert) on {instrument} is {uncond*100:.1f}%.')


def parse_code(s: str | None):
    if not s:
        return None
    s = s.strip()
    if '/' not in s:
        if s not in VALID_LEVEL:
            raise SystemExit(f'bad level {s!r}; want one of {VALID_LEVEL}')
        return s
    lvl, form = s.split('/', 1)
    if lvl not in VALID_LEVEL or form not in VALID_FORM:
        raise SystemExit(f'bad code {s!r}; want LEVEL/FORM with LEVEL in {VALID_LEVEL} '
                         f'and FORM in {VALID_FORM}')
    return s


def main():
    ap = argparse.ArgumentParser(description='Historical analogues for a VMC state.')
    ap.add_argument('--instrument', default='gold')
    ap.add_argument('--tf1', help='e.g. OS/Vup  (LEVEL/FORM) or just OS')
    ap.add_argument('--tf5')
    ap.add_argument('--tf15')
    ap.add_argument('--mf-sign', choices=['-1', '0', '1'],
                    help='sign of money flow now')
    ap.add_argument('--vwap-slope', choices=['-1', '0', '1'])
    ap.add_argument('--at', help='instead of a state: read it off this UTC timestamp')
    ap.add_argument('--horizon', type=int, default=60, help='forward minutes')
    ap.add_argument('--prior', type=int, default=60, help='prior-move window, minutes')
    ap.add_argument('--min-n', type=int, default=MIN_N)
    a = ap.parse_args()

    if a.at:
        df = enrich(a.instrument, a.horizon, a.prior)
        ts = pd.Timestamp(a.at, tz='UTC')
        i = df.index.searchsorted(ts)
        if i >= len(df):
            raise SystemExit(f'{a.at} is past the end of the data')
        row = df.iloc[i]
        spec = {'tf1_code': row['tf1_code'], 'tf5_code': row['tf5_code'],
                'tf15_code': row['tf15_code'], 'mf_sign': row['mf_sign'],
                'vwap_slope': row['vwap_slope'],
                'tf1_level': row['tf1_level'], 'tf5_level': row['tf5_level'],
                'tf15_level': row['tf15_level']}
        print(f'read state at {df.index[i]}:')
    else:
        c1, c5, c15 = parse_code(a.tf1), parse_code(a.tf5), parse_code(a.tf15)
        spec = {'tf1_code': c1 if c1 and '/' in c1 else None,
                'tf5_code': c5 if c5 and '/' in c5 else None,
                'tf15_code': c15 if c15 and '/' in c15 else None,
                'tf1_level': c1.split('/')[0] if c1 else None,
                'tf5_level': c5.split('/')[0] if c5 else None,
                'tf15_level': c15.split('/')[0] if c15 else None,
                'mf_sign': a.mf_sign, 'vwap_slope': a.vwap_slope}
    report(a.instrument, spec, a.horizon, a.prior, a.min_n)


if __name__ == '__main__':
    main()
