"""panel.py — build the VuManChu feature panel: one row per bar, causal state
columns + forward outcome columns.

WHY A PANEL AND NOT A PILE OF ANALYSIS SCRIPTS
──────────────────────────────────────────────
Every question in this study — single-timeframe conditional response,
cross-timeframe agreement, and the eventual ML model — is the same groupby
against the same matrix. Build it once and the analysis is queries; build a
bespoke script per question and the third one silently disagrees with the
first. The panel IS the future training matrix, so moving from crosstabs to a
gradient-boosted model costs no rewrite.

WHAT MAKES A COLUMN ADMISSIBLE
──────────────────────────────
Causal, or it does not go in. Everything here uses the `causal_*` family from
`pylego.indicators.vumanchu` (truncation-invariance proven in its test), never
the `parity_*` family, whose whole-array normalisation would let a 2026 spike
set a 2016 row's value. The multi-timeframe columns go through
`align_htf_causal` — forward-filling a 15m oscillator onto 1m rows by START
time leaks up to 14 minutes of future into every row, and an agreement study
built on that leak looks spectacular for entirely mechanical reasons.

THE STRIDE
──────────
Features are computed on the FULL base grid (no information dropped), then only
every `stride`-th row is emitted. Adjacent M1 rows are near-duplicates, so this
cuts file size ~5x without changing any feature's value. It does NOT fix
autocorrelation — the effective sample size is still far below the row count,
which matters for every significance claim downstream and is handled in
`analyse.py`, not here.

FORWARD COLUMNS ARE OUTCOMES, NOT SIGNALS
─────────────────────────────────────────
`fwd_*` columns deliberately look into the future — they are the labels. They
are the ONLY columns permitted to. Anything that trains on them must split by
time with an embargo at least as long as the longest horizon, or the overlap
leaks the answer.

  python vumanchuLab/panel.py --instruments eurusd,gold,nq
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pylego.indicators.vumanchu import (  # noqa: E402
    OPERATOR_WT, agreement, align_htf_causal, causal_money_flow, causal_vwap_dist,
    wave_trend,
)
from pylego.instruments import asset_class, resolve_key  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# Two caches exist; VolRangeForecaster's is the fuller one (29 instruments).
M1_DIRS = [
    os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1'),
    os.path.join(ROOT, 'portfolioBacktest', 'cache'),
]
OUT_DIR = os.path.join(HERE, 'data')

# Timeframes in the stack, in minutes. The first is the BASE grid every other
# timeframe is causally aligned onto.
TIMEFRAMES = (1, 5, 15)

# Forward horizons in BASE-grid bars (so minutes, since base is M1).
HORIZONS = (15, 60, 240, 1440)

# WaveTrend zone bands — the operator's drawn bands from js/vumanchuChart.js.
OB, OS = 53.0, -53.0

# Trailing window (in that timeframe's own bars) for the realised-vol scale.
SIGMA_WINDOW = 500
SIGMA_MIN = 100


# ── data loading ─────────────────────────────────────────────────────────────

def m1_path(instrument: str) -> str:
    for d in M1_DIRS:
        p = os.path.join(d, f'{instrument}_m1.parquet')
        if os.path.exists(p):
            return p
    raise FileNotFoundError(
        f'no M1 parquet for {instrument!r} in {M1_DIRS}. '
        f'Pull it with scripts/r2_download.py {instrument}')


def epoch_seconds(index: pd.DatetimeIndex) -> np.ndarray:
    """Epoch seconds from a DatetimeIndex, RESOLUTION-SAFE.

    Do not use `index.view('int64') // 10**9`. Parquet files in this repo carry
    mixed datetime resolutions — eurusd is datetime64[ns] but gold and nq are
    datetime64[us] — and `view('int64')` returns the raw underlying integer in
    whatever unit that is. The ns assumption silently divides the us files by
    1000x too much, collapsing every timestamp into a few-second span and
    reducing `align_htf_causal` to noise. It raises no error: the columns are
    still populated, still finite, and completely wrong, which showed up only
    as gold/nq multi-timeframe agreement sitting exactly on its chance baseline
    while eurusd's was +43pp.
    """
    return np.asarray(index.tz_convert(None).astype('datetime64[s]'), dtype='int64')


def load_m1(instrument: str, start: str | None = None, end: str | None = None) -> pd.DataFrame:
    """Load the M1 cache. Tolerant of both parquet layouts in this repo
    (datetime index vs a datetime/time column), matching sltp_distribution.py."""
    df = pd.read_parquet(m1_path(instrument))
    if not isinstance(df.index, pd.DatetimeIndex):
        for col in ('datetime', 'time', 'timestamp'):
            if col in df.columns:
                df = df.set_index(pd.to_datetime(df[col], utc=True)).drop(columns=[col])
                break
        else:
            raise ValueError(f'{instrument}: no datetime index or column found')
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    # Normalise the resolution too, so mixed-unit caches cannot surprise any
    # downstream consumer (see epoch_seconds).
    df.index = df.index.as_unit('ns')
    df = df.sort_index()
    if start:
        df = df[df.index >= pd.Timestamp(start, tz='UTC')]
    if end:
        df = df[df.index <= pd.Timestamp(end, tz='UTC')]
    need = ['open', 'high', 'low', 'close']
    missing = [c for c in need if c not in df.columns]
    if missing:
        raise ValueError(f'{instrument}: missing columns {missing}')
    if 'volume' not in df.columns:
        # Not fatal, but Money Flow degenerates to unweighted candle direction.
        df['volume'] = np.nan
    return df[need + ['volume']]


def resample(df: pd.DataFrame, minutes: int) -> pd.DataFrame:
    """Down-sample to `minutes`. label/closed='left' so a bar stamped t covers
    [t, t+tf) and therefore CLOSES at t+tf — the convention align_htf_causal
    assumes. Empty buckets (weekends, holidays) are dropped, not filled."""
    if minutes == 1:
        return df
    out = df.resample(f'{minutes}min', label='left', closed='left').agg(
        {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'})
    return out.dropna(subset=['open', 'high', 'low', 'close'])


# ── per-timeframe feature block ──────────────────────────────────────────────

def timeframe_features(bars: pd.DataFrame, minutes: int, wt_params: dict) -> pd.DataFrame:
    """The VMC state of one timeframe, on that timeframe's own grid.

    Every column here is knowable at that bar's close and nothing later.
    """
    h = bars['high'].to_numpy(float)
    l = bars['low'].to_numpy(float)
    c = bars['close'].to_numpy(float)
    o = bars['open'].to_numpy(float)
    vol = bars['volume'].to_numpy(float)
    has_vol = bool(np.isfinite(vol).any())
    v = vol if has_vol else None

    wt = wave_trend(h, l, c, **wt_params)
    wt1, wt2 = wt.wt1, wt.wt2
    diff = wt1 - wt2

    f = pd.DataFrame(index=bars.index)
    f['wt1'] = wt1
    f['wt2'] = wt2
    f['wt_diff'] = diff
    # Discrete state — what a reader actually looks at on the pane.
    f['wt_side'] = np.sign(wt1)                                    # above/below zero
    f['wt_dir'] = np.sign(diff)                                    # wave rolling up/down
    f['wt_zone'] = np.where(wt1 >= OB, 1, np.where(wt1 <= OS, -1, 0))

    # Bars since the last wt1/wt2 cross — "how mature is this leg".
    crossed = np.r_[False, np.sign(diff[1:]) != np.sign(diff[:-1])]
    grp = np.cumsum(crossed)
    f['bars_since_cross'] = pd.Series(np.arange(len(c)), index=bars.index).groupby(grp).cumcount()

    # Money flow — the only leg carrying non-price information. On FX the
    # volume is OANDA tick COUNT, not size, so this is activity-weighted candle
    # direction; the panel records `has_volume` so that caveat travels with it.
    mf = causal_money_flow(o, h, l, c, v, period=14,
                           window=max(200, 20 * 60 // max(minutes, 1)), pctile=99.0)
    f['mf'] = mf
    f['mf_sign'] = np.sign(mf)
    f['mf_slope'] = np.sign(pd.Series(mf).diff(3).to_numpy())

    # VWAP: the ROLLING distance in sigma units, never the cumulative anchor
    # (which is measured degenerate across timeframes).
    f['vwap_dist'] = causal_vwap_dist(h, l, c, v, window=20,
                                      sigma_window=SIGMA_WINDOW, min_periods=SIGMA_MIN)
    f['vwap_slope'] = np.sign(pd.Series(f['vwap_dist']).diff(3).to_numpy())

    # Trailing realised vol on this grid — the scale every outcome is put in.
    ret = pd.Series(c, index=bars.index).pct_change()
    f['sigma'] = ret.rolling(SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy()
    f['has_volume'] = has_vol
    f['close_sec'] = epoch_seconds(bars.index) + minutes * 60
    return f


# ── forward outcomes ─────────────────────────────────────────────────────────

def forward_outcomes(bars: pd.DataFrame, sigma: np.ndarray, horizons=HORIZONS) -> pd.DataFrame:
    """Labels. THE ONLY COLUMNS ALLOWED TO SEE THE FUTURE.

    For horizon h (base-grid bars) measured from this bar's close:
      fwd_ret_h   signed return, in units of the trailing sigma scaled by sqrt(h)
      fwd_mfe_h   best excursion in the favourable-up direction, same units
      fwd_mae_h   worst excursion down, same units (negative)

    sigma-normalising is what makes a 3-pip EURCHF move and a $4 gold move the
    same number, so cells can be pooled across instruments at all.
    """
    c = bars['close']
    hi, lo = bars['high'], bars['low']
    out = pd.DataFrame(index=bars.index)
    for h in horizons:
        scale = sigma * np.sqrt(h)
        with np.errstate(divide='ignore', invalid='ignore'):
            fwd_ret = (c.shift(-h) / c - 1.0).to_numpy()
            # max(high[i+1 .. i+h]) — rolling then shifted back by exactly h.
            fwd_max = hi.rolling(h).max().shift(-h).to_numpy()
            fwd_min = lo.rolling(h).min().shift(-h).to_numpy()
            cc = c.to_numpy()
            ok = np.isfinite(scale) & (scale > 0)
            out[f'fwd_ret_{h}'] = np.where(ok, fwd_ret / scale, np.nan)
            out[f'fwd_mfe_{h}'] = np.where(ok, (fwd_max / cc - 1.0) / scale, np.nan)
            out[f'fwd_mae_{h}'] = np.where(ok, (fwd_min / cc - 1.0) / scale, np.nan)
    return out


# ── panel assembly ───────────────────────────────────────────────────────────

def build_panel(instrument: str, timeframes=TIMEFRAMES, stride: int = 5,
                wt_params: dict | None = None, start=None, end=None,
                verbose: bool = True) -> pd.DataFrame:
    wt_params = dict(wt_params or OPERATOR_WT)
    t0 = time.time()
    m1 = load_m1(instrument, start, end)
    if verbose:
        print(f'  {instrument}: {len(m1):,} M1 bars '
              f'{m1.index[0].date()} -> {m1.index[-1].date()}')

    base_tf = timeframes[0]
    base = resample(m1, base_tf)
    blocks = {tf: timeframe_features(resample(m1, tf), tf, wt_params) for tf in timeframes}

    # Guard against the resolution bug returning by another route: if the epoch
    # conversion is wrong, close_sec spacing collapses and the causal HTF
    # alignment degrades to noise WITHOUT raising anything. Fail loud instead.
    for tf, blk in blocks.items():
        cs = blk['close_sec'].to_numpy(float)
        med = float(np.median(np.diff(cs))) if len(cs) > 1 else 0.0
        if not np.isclose(med, tf * 60, rtol=0.01):
            raise ValueError(
                f'{instrument} tf{tf}: median close_sec spacing {med:.1f}s != {tf*60}s — '
                f'timestamp resolution is wrong, alignment would be silent garbage')

    panel = pd.DataFrame(index=base.index)
    panel['instrument'] = instrument
    panel['asset_class'] = asset_class(instrument)
    panel['close'] = base['close'].to_numpy()

    base_f = blocks[base_tf]
    base_close_sec = base_f['close_sec'].to_numpy(float)
    for col in ('wt1', 'wt2', 'wt_diff', 'wt_side', 'wt_dir', 'wt_zone',
                'bars_since_cross', 'mf', 'mf_sign', 'mf_slope',
                'vwap_dist', 'vwap_slope'):
        panel[f'tf{base_tf}_{col}'] = base_f[col].to_numpy()
    panel['sigma'] = base_f['sigma'].to_numpy()
    panel['has_volume'] = bool(base_f['has_volume'].iloc[0])

    # Higher timeframes, step-held onto the base grid CAUSALLY.
    for tf in timeframes[1:]:
        blk = blocks[tf]
        slow_close = blk['close_sec'].to_numpy(float)
        for col in ('wt1', 'wt2', 'wt_side', 'wt_dir', 'wt_zone', 'mf', 'mf_sign',
                    'vwap_dist'):
            panel[f'tf{tf}_{col}'] = align_htf_causal(
                base_close_sec, slow_close, blk[col].to_numpy(float))

    # Agreement between the base timeframe and each higher one, all three modes.
    for tf in timeframes[1:]:
        for mode in ('direction', 'level', 'zone'):
            panel[f'agree_{mode}_{base_tf}v{tf}'] = agreement(
                panel[f'tf{base_tf}_wt1'].to_numpy(float),
                panel[f'tf{base_tf}_wt2'].to_numpy(float),
                panel[f'tf{tf}_wt1'].to_numpy(float),
                panel[f'tf{tf}_wt2'].to_numpy(float),
                mode=mode)

    # The N-timeframe stack read: do ALL timeframes sit the same side of zero,
    # and which side. `stack_side` is +1 all-bullish, -1 all-bearish, 0 split.
    sides = np.vstack([panel[f'tf{tf}_wt_side'].to_numpy(float) for tf in timeframes])
    all_finite = np.all(np.isfinite(sides), axis=0)
    all_up = np.all(sides > 0, axis=0)
    all_dn = np.all(sides < 0, axis=0)
    panel['stack_side'] = np.where(~all_finite, np.nan,
                                   np.where(all_up, 1.0, np.where(all_dn, -1.0, 0.0)))
    zones = np.vstack([panel[f'tf{tf}_wt_zone'].to_numpy(float) for tf in timeframes])
    z_finite = np.all(np.isfinite(zones), axis=0)
    panel['stack_zone'] = np.where(~z_finite, np.nan,
                                   np.where(np.all(zones > 0, axis=0), 1.0,
                                            np.where(np.all(zones < 0, axis=0), -1.0, 0.0)))
    # How many of the N timeframes agree with the FASTEST one on side-of-zero.
    fast = sides[0]
    panel['stack_n_agree'] = np.where(
        all_finite, np.sum(sides == fast, axis=0).astype(float), np.nan)

    # Context for the matched baseline — an unconditional rate must be compared
    # like-for-like on hour and volatility regime, not pooled across both.
    panel['hour'] = panel.index.hour
    panel['dow'] = panel.index.dayofweek
    sig = panel['sigma']
    panel['vol_bucket'] = (sig.rolling(20000, min_periods=2000)
                             .rank(pct=True).mul(3).clip(0, 2.999).astype('float'))

    panel = pd.concat([panel, forward_outcomes(base, panel['sigma'].to_numpy(float))], axis=1)

    if stride > 1:
        panel = panel.iloc[::stride]
    panel = panel.dropna(subset=['tf1_wt1', f'tf{timeframes[-1]}_wt1', 'sigma'])
    if verbose:
        print(f'  {instrument}: panel {len(panel):,} rows x {panel.shape[1]} cols '
              f'in {time.time()-t0:.1f}s')
    return panel


def main():
    ap = argparse.ArgumentParser(description='Build VuManChu feature panels.')
    ap.add_argument('--instruments', default='eurusd,gold,nq')
    ap.add_argument('--timeframes', default='1,5,15')
    ap.add_argument('--stride', type=int, default=5)
    ap.add_argument('--start', default=None)
    ap.add_argument('--end', default=None)
    ap.add_argument('--out', default=OUT_DIR)
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    tfs = tuple(int(x) for x in a.timeframes.split(','))
    for name in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        key = resolve_key(name)
        p = build_panel(key, timeframes=tfs, stride=a.stride, start=a.start, end=a.end)
        dest = os.path.join(a.out, f'panel_{key}.parquet')
        p.to_parquet(dest)
        print(f'  wrote {dest} ({os.path.getsize(dest)/1e6:.0f} MB)\n')


if __name__ == '__main__':
    main()
