"""shapes.py — what is the VuManChu wave DOING, across 1m/5m/15m, and what does
price do next?

The difference from `analyse.py`: that module conditioned on a SNAPSHOT (the
zone the wave sat in at bar i). This conditions on the wave's PATH — the shape
of the last N readings on each of the three timeframes, read together as one
stack. "Rolling over from overbought on 1m while 15m is still climbing" is a
shape; "1m overbought" is not.

TWO ENCODINGS, ON PURPOSE
─────────────────────────
`symbolic`  — per timeframe: LEVEL (OS / mid / OB) x FORM (rising / falling /
              turn-up / turn-down), where FORM compares the first half of the
              lookback's slope against the second half. Readable, and it maps
              onto what you can actually eyeball on the pane.
`cluster`   — k-means over the concatenated, causally-aligned trajectory
              (3 timeframes x N lags). Data-driven, so it can surface shapes
              nobody thought to name, and it dodges the combinatorial blow-up
              of a full 3-timeframe symbolic cross (12^3 = 1728 cells).

THE OUTCOME IS REVERT-vs-CONTINUE, NOT UP-vs-DOWN
─────────────────────────────────────────────────
For each bar: the prior move over `w` bars sets a direction; the forward move
over `h` decides whether price CONTINUED that direction or REVERTED it. Bars
whose prior move is smaller than `min_prior` sigma are dropped — with no move
to speak of, "revert" has no meaning and the sign is coin-flip noise.

BOTH DIRECTIONS OF THE QUESTION, BECAUSE ONE ALONE LIES
──────────────────────────────────────────────────────
forward : P(revert | shape) vs a matched baseline. This is the inference table
          — "when I see this shape, what happens next".
reverse : at confirmed price reversals, which shapes were present, vs how often
          those shapes occur overall (lift).

The reverse view on its own is the classic selection-on-outcome trap: a shape
can be present at EVERY reversal and still be worthless, because it is also
present at a thousand non-reversals. Lift against unconditional frequency is
what separates those, and the forward table is what you would actually trade
off. They are reported side by side so the trap is visible rather than
implicit.

BASELINE
────────
Stratified on (hour x volatility bucket x prior-move-size bucket) and
reweighted to each cell's own mix. The third term matters here specifically:
shape correlates strongly with how big the preceding move was, and big moves
revert differently from small ones. Without it, a shape that only appears after
large moves would be scored against the average move's reversion rate.

  python vumanchuLab/shapes.py --instrument eurusd
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

from sklearn.cluster import MiniBatchKMeans  # noqa: E402

from vumanchuLab.analyse import batch_means_se  # noqa: E402
from vumanchuLab.panel import (  # noqa: E402
    OB, OS, SIGMA_MIN, SIGMA_WINDOW, TIMEFRAMES, epoch_seconds, load_m1, resample,
)
from pylego.indicators.vumanchu import OPERATOR_WT, align_htf_causal, wave_trend  # noqa: E402

# Lags (in each timeframe's OWN bars) sampled to describe the trajectory.
LAGS = (0, 2, 4, 6, 8, 10)

# Lookback halves for the symbolic FORM read.
FORM_LAG = 10

N_BLOCKS = 40
MIN_CELL_N = 300


# ── trajectory extraction ────────────────────────────────────────────────────

def build_shape_frame(instrument: str, prior_w: int = 60, horizon: int = 60,
                      stride: int = 5, min_prior: float = 0.5,
                      start=None, end=None, verbose=True) -> pd.DataFrame:
    """WT1 trajectory on every timeframe, causally aligned to the M1 grid, plus
    the revert/continue outcome."""
    m1 = load_m1(instrument, start, end)
    base = resample(m1, TIMEFRAMES[0])
    base_close_sec = epoch_seconds(base.index) + TIMEFRAMES[0] * 60

    df = pd.DataFrame(index=base.index)
    for tf in TIMEFRAMES:
        bars = resample(m1, tf)
        wt = wave_trend(bars['high'].to_numpy(float), bars['low'].to_numpy(float),
                        bars['close'].to_numpy(float), **OPERATOR_WT)
        w1 = pd.Series(wt.wt1, index=bars.index)
        slow_close = epoch_seconds(bars.index) + tf * 60
        for lag in LAGS:
            lagged = w1.shift(lag).to_numpy(float)
            if tf == TIMEFRAMES[0]:
                df[f'tf{tf}_l{lag}'] = lagged
            else:
                # Lag on the HTF's own grid FIRST, then step-hold causally.
                df[f'tf{tf}_l{lag}'] = align_htf_causal(base_close_sec, slow_close, lagged)
        # Symbolic form needs one deeper read.
        form_lag = w1.shift(FORM_LAG).to_numpy(float)
        half = w1.shift(FORM_LAG // 2).to_numpy(float)
        if tf == TIMEFRAMES[0]:
            df[f'tf{tf}_far'], df[f'tf{tf}_half'] = form_lag, half
        else:
            df[f'tf{tf}_far'] = align_htf_causal(base_close_sec, slow_close, form_lag)
            df[f'tf{tf}_half'] = align_htf_causal(base_close_sec, slow_close, half)

    c = base['close']
    ret1 = c.pct_change()
    sigma = ret1.rolling(SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy(float)

    prior = (c / c.shift(prior_w) - 1.0).to_numpy(float)
    fwd = (c.shift(-horizon) / c - 1.0).to_numpy(float)
    with np.errstate(divide='ignore', invalid='ignore'):
        df['prior_sig'] = prior / (sigma * np.sqrt(prior_w))
        df['fwd_sig'] = fwd / (sigma * np.sqrt(horizon))
    df['sigma'] = sigma
    df['hour'] = df.index.hour
    df['vol_bucket'] = (pd.Series(sigma, index=df.index)
                        .rolling(20000, min_periods=2000).rank(pct=True)
                        .mul(3).clip(0, 2.999).fillna(-1).astype(int))
    # Prior-move-size bucket — the confounder specific to a shape study.
    df['prior_bucket'] = pd.Series(np.abs(df['prior_sig']), index=df.index) \
        .rolling(20000, min_periods=2000).rank(pct=True).mul(3).clip(0, 2.999) \
        .fillna(-1).astype(int)

    # CONTINUE = forward move keeps the prior move's sign. REVERT = flips it.
    df['reverted'] = (np.sign(df['fwd_sig']) != np.sign(df['prior_sig'])).astype(float)
    df.loc[~np.isfinite(df['fwd_sig']) | ~np.isfinite(df['prior_sig']), 'reverted'] = np.nan
    # Drop bars with no meaningful prior move — "revert" is undefined there.
    df.loc[np.abs(df['prior_sig']) < min_prior, 'reverted'] = np.nan
    df['prior_dir'] = np.sign(df['prior_sig'])

    df = df.iloc[::stride]
    need = [f'tf{tf}_l{lag}' for tf in TIMEFRAMES for lag in LAGS]
    df = df.dropna(subset=need + ['reverted'])
    if verbose:
        print(f'  {instrument}: {len(df):,} shaped bars '
              f'(prior>={min_prior}sig, h={horizon}m, w={prior_w}m)')
    return df


# ── encodings ────────────────────────────────────────────────────────────────

def symbolic_codes(df: pd.DataFrame) -> pd.DataFrame:
    """Per-timeframe LEVEL x FORM, readable off the pane."""
    out = pd.DataFrame(index=df.index)
    for tf in TIMEFRAMES:
        now = df[f'tf{tf}_l0'].to_numpy(float)
        half = df[f'tf{tf}_half'].to_numpy(float)
        far = df[f'tf{tf}_far'].to_numpy(float)
        level = np.where(now >= OB, 'OB', np.where(now <= OS, 'OS', 'mid'))
        s_early, s_late = half - far, now - half
        form = np.where((s_early < 0) & (s_late > 0), 'Vup',
                np.where((s_early > 0) & (s_late < 0), 'Vdn',
                np.where(s_late >= 0, 'rise', 'fall')))
        out[f'tf{tf}_level'] = level
        out[f'tf{tf}_form'] = form
        out[f'tf{tf}_code'] = pd.Series(level, index=df.index) + '/' + pd.Series(form, index=df.index)
    # The stack read: the three FORMs together, fast -> slow.
    out['stack_form'] = (out[f'tf{TIMEFRAMES[0]}_form'] + '>' +
                         out[f'tf{TIMEFRAMES[1]}_form'] + '>' +
                         out[f'tf{TIMEFRAMES[2]}_form'])
    out['stack_code'] = (out[f'tf{TIMEFRAMES[0]}_code'] + ' | ' +
                         out[f'tf{TIMEFRAMES[1]}_code'] + ' | ' +
                         out[f'tf{TIMEFRAMES[2]}_code'])
    return out


def cluster_shapes(df: pd.DataFrame, k: int = 16, seed: int = 7) -> tuple[pd.Series, np.ndarray]:
    """k-means over the concatenated 3-timeframe trajectory.

    WaveTrend is already self-normalising (it divides by an EMA of its own mean
    absolute deviation), so the three timeframes share a ~+/-100 scale and can
    be concatenated without rescaling — that property is why this works at all.
    """
    feats = [f'tf{tf}_l{lag}' for tf in TIMEFRAMES for lag in LAGS]
    X = df[feats].to_numpy(float) / 100.0
    km = MiniBatchKMeans(n_clusters=k, random_state=seed, n_init=10, batch_size=4096)
    lab = km.fit_predict(X)
    return pd.Series(lab, index=df.index, name='cluster'), km.cluster_centers_ * 100.0


# ── conditional tables ───────────────────────────────────────────────────────

def _strata(df: pd.DataFrame) -> pd.Series:
    return (df['hour'].astype(int) * 100 + df['vol_bucket'].astype(int) * 10
            + df['prior_bucket'].astype(int))


def shape_table(df: pd.DataFrame, codes: pd.Series, min_n: int = MIN_CELL_N) -> pd.DataFrame:
    """P(revert | shape) vs the matched baseline."""
    outcome = df['reverted']
    strata = _strata(df)
    glob = outcome.groupby(strata).mean()
    blocks = pd.Series(np.minimum((np.arange(len(df)) * N_BLOCKS) // len(df), N_BLOCKS - 1),
                       index=df.index)
    split = int(len(df) * 0.6)
    is_mask = pd.Series(np.arange(len(df)) < split, index=df.index)

    rows = []
    for key, idx in codes.groupby(codes).groups.items():
        m = pd.Series(False, index=df.index)
        m.loc[idx] = True
        n = int(m.sum())
        if n < min_n:
            continue
        w = strata[m].value_counts(normalize=True)
        common = w.index.intersection(glob.index)
        base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum()) \
            if len(common) else float(outcome.mean())
        p = float(outcome[m].mean())
        se = batch_means_se(outcome[m] - base, blocks[m])
        d_is = float(outcome[m & is_mask].mean()) - base if (m & is_mask).sum() > min_n // 3 else np.nan
        d_oos = float(outcome[m & ~is_mask].mean()) - base if (m & ~is_mask).sum() > min_n // 3 else np.nan
        rows.append({
            'shape': key, 'n': n, 'freq_pct': round(100 * n / len(df), 2),
            'p_revert': round(p, 4), 'base': round(base, 4),
            'delta_pp': round(100 * (p - base), 2),
            't': round((p - base) / se, 2) if np.isfinite(se) and se > 0 else np.nan,
            'is_d': round(100 * d_is, 2) if np.isfinite(d_is) else np.nan,
            'oos_d': round(100 * d_oos, 2) if np.isfinite(d_oos) else np.nan,
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out['consistent'] = (np.sign(out['is_d']) == np.sign(out['oos_d'])) & \
                        out[['is_d', 'oos_d']].notna().all(axis=1)
    return out.sort_values('delta_pp', key=abs, ascending=False).reset_index(drop=True)


def reversal_lift(df: pd.DataFrame, codes: pd.Series, top: int = 12) -> pd.DataFrame:
    """The reverse view: among bars where price DID revert, how over- or
    under-represented is each shape versus its unconditional frequency?

    lift = P(shape | reverted) / P(shape). A lift of 1.00 means the shape is
    exactly as common at reversals as it is everywhere — i.e. it tells you
    nothing, however intuitive it looks on a chart.
    """
    rev = df['reverted'] == 1.0
    overall = codes.value_counts(normalize=True)
    at_rev = codes[rev].value_counts(normalize=True)
    common = overall.index.intersection(at_rev.index)
    out = pd.DataFrame({
        'shape': common,
        'freq_pct': (100 * overall.loc[common]).round(2).to_numpy(),
        'at_reversal_pct': (100 * at_rev.loc[common]).round(2).to_numpy(),
    })
    out['lift'] = (at_rev.loc[common].to_numpy() / overall.loc[common].to_numpy()).round(3)
    out['n_at_reversal'] = codes[rev].value_counts().loc[common].to_numpy()
    return out.sort_values('lift', ascending=False).head(top).reset_index(drop=True)


def describe_centre(centre: np.ndarray) -> str:
    """Render a cluster centre as a readable per-timeframe trajectory (oldest
    reading -> newest), so a cluster id means something."""
    parts = []
    for i, tf in enumerate(TIMEFRAMES):
        seg = centre[i * len(LAGS):(i + 1) * len(LAGS)][::-1]  # oldest first
        parts.append(f'{tf}m[' + ' '.join(f'{v:+.0f}' for v in seg) + ']')
    return '  '.join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--horizon', type=int, default=60)
    ap.add_argument('--prior', type=int, default=60)
    ap.add_argument('--min-prior', type=float, default=0.5)
    ap.add_argument('--k', type=int, default=16)
    ap.add_argument('--start', default=None)
    a = ap.parse_args()

    print(f'Building shape frame for {a.instrument} ...')
    df = build_shape_frame(a.instrument, prior_w=a.prior, horizon=a.horizon,
                           min_prior=a.min_prior, start=a.start)
    sym = symbolic_codes(df)
    clus, centres = cluster_shapes(df, k=a.k)

    base_rate = float(df['reverted'].mean())
    print(f'\n{"="*104}')
    print(f'VMC SHAPE -> REVERT/CONTINUE — {a.instrument}, prior {a.prior}m, forward {a.horizon}m')
    print(f'{len(df):,} bars | unconditional P(revert) = {base_rate:.3f}')
    print(f'{"="*104}')

    for label, codes in (('STACK FORM (fast>mid>slow)', sym['stack_form']),
                         ('FAST 1m LEVEL/FORM', sym['tf1_code']),
                         ('SLOW 15m LEVEL/FORM', sym['tf15_code']),
                         ('FULL STACK CODE', sym['stack_code'])):
        t = shape_table(df, codes)
        if t.empty:
            continue
        print(f'\n-- {label} — P(revert) vs matched (hour x vol x prior-size) baseline --')
        print(t.head(10).to_string(index=False))

    print(f'\n-- CLUSTERED SHAPES (k={a.k}, trajectory over {max(LAGS)} bars per timeframe) --')
    t = shape_table(df, clus)
    t['trajectory'] = [describe_centre(centres[int(s)]) for s in t['shape']]
    print(t.head(10).to_string(index=False))

    print('\n-- REVERSE VIEW: which shapes are present WHEN price reverts --')
    print('   (lift = P(shape|revert) / P(shape); 1.00 means it says nothing)')
    print(reversal_lift(df, sym['stack_form']).to_string(index=False))

    surv = t[(t['t'].abs() >= 2) & t['consistent']]
    print(f'\n{"-"*104}')
    print(f'{len(t)} clustered shapes tested; ~{len(t)*2*0.0228:.1f} expected at |t|>=2 by chance; '
          f'{len(surv)} cleared |t| AND held sign IS->OOS.')
    print('-' * 104)


if __name__ == '__main__':
    main()
