"""events.py - the PRICE side of the study. No VuManChu anywhere in this file.

The brief's first instruction is to make price the independent event and ask
what the oscillator was doing, rather than the reverse. That only works if the
price taxonomy is built without ever looking at the oscillator, so it lives
here on its own.

TWO LAYERS
----------
`phase`   - WHERE price is right now, causally: impulsing, pulling back,
            broken, ranging. Knowable at the bar. This is the conditioning
            variable, and it is the thing a trader can actually observe.

`resolve` - WHAT happened next, as a first-touch race between a continuation
            barrier and a reversal barrier, both measured in sigma and both
            signed RELATIVE TO THE PREVAILING TREND. This looks forward on
            purpose; it is the label.

Trend-relative signing is the point. "Did it go up" is not a question with a
stable base rate. "Did the prevailing move extend before it retraced" is, and
it maps directly onto the brief's continuation / pullback / reversal /
failed-reversal categories without a fragile pivot chain in between.

  resolve = +1  continuation barrier touched first  (trend extended)
  resolve = -1  reversal barrier touched first      (trend gave way)
  resolve =  0  neither inside the horizon          (stalled / ranged)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Prior-move window in base (M5) bars: 48 = 4 hours.
TREND_W = 48
# A move must be worth this many sigma before "trend" means anything.
TREND_MIN = 1.0
IMPULSE_MIN = 1.5
# Retracement fractions that separate impulse / pullback / broken.
PULLBACK_LO, PULLBACK_HI = 0.25, 0.90

PHASE_NAMES = {0: 'range', 1: 'impulse', 2: 'pullback', 3: 'broken', 4: 'drift'}


def barrier_race(high, low, close, sigma, k=2.0, horizon=48, chunk=150_000):
    """First-touch race between +k*sigma and -k*sigma, vectorised and chunked.

    Returns (hit, bars_to_hit) where hit is +1 up-first, -1 down-first, 0
    neither within `horizon`. A bar that touches both barriers inside the same
    M5 bar is unresolvable at this resolution and is returned as 0 rather than
    guessed - guessing it is how a backtest quietly buys itself a win rate.
    """
    h, l, c = np.asarray(high, float), np.asarray(low, float), np.asarray(close, float)
    s = np.asarray(sigma, float)
    n = c.size
    hit = np.zeros(n, dtype=np.int8)
    when = np.full(n, np.nan, dtype=np.float32)

    up_b, dn_b = c + k * s, c - k * s
    big = horizon + 1

    for lo in range(0, n, chunk):
        hi = min(lo + chunk, n - horizon)
        if hi <= lo:
            break
        seg_h = np.lib.stride_tricks.sliding_window_view(h[lo + 1:hi + horizon], horizon)
        seg_l = np.lib.stride_tricks.sliding_window_view(l[lo + 1:hi + horizon], horizon)
        u = seg_h >= up_b[lo:hi, None]
        d = seg_l <= dn_b[lo:hi, None]
        fu = np.where(u.any(axis=1), u.argmax(axis=1), big)
        fd = np.where(d.any(axis=1), d.argmax(axis=1), big)
        res = np.where(fu < fd, 1, np.where(fd < fu, -1, 0)).astype(np.int8)
        res[(fu >= big) & (fd >= big)] = 0
        hit[lo:hi] = res
        first = np.minimum(fu, fd).astype(np.float32) + 1.0
        first[res == 0] = np.nan
        when[lo:hi] = first

    hit[np.isnan(s) | (s <= 0)] = 0
    return hit, when


def _rolling_arg_extreme(a, window, how, chunk=150_000):
    """Index of the max/min within the trailing `window` bars ending at i."""
    n = a.size
    out = np.full(n, -1, dtype=np.int64)
    for lo in range(0, n, chunk):
        hi = min(lo + chunk, n - window + 1)
        if hi <= lo:
            break
        seg = np.lib.stride_tricks.sliding_window_view(a[lo:hi + window - 1], window)
        pos = seg.argmax(axis=1) if how == 'max' else seg.argmin(axis=1)
        out[lo + window - 1:hi + window - 1] = np.arange(lo, hi) + pos
    return out


def price_phase(close, sigma, window=TREND_W):
    """Causal price phase + the trend direction it is relative to.

    WHY THE IMPULSE IS MEASURED TO THE EXTREME, NOT TO NOW
    -----------------------------------------------------
    The obvious version - trend = close[i] - close[i-W], retrace = give-back
    over the same W - is broken, and measurably so: it made "pullback" 1.1% of
    all bars. Both quantities read the same window, so a deep pullback
    mechanically shrinks the very trend it is supposed to be a pullback IN, and
    the two conditions can barely be true at once. The category that the brief
    cares about most was being defined almost out of existence.

    So the leg and the give-back are decoupled:

      impulse_sig : move from the window's start to its EXTREME, in sigma
      retrace     : give-back from that extreme to now, as a fraction of it

    A 3-sigma rally that has since handed back half is now what it should be -
    a strong impulse in a 50% pullback - instead of a 1.5-sigma nothing.
    """
    c = np.asarray(close, float)
    s = np.asarray(sigma, float)
    n = c.size

    past = np.full(n, np.nan)
    past[window:] = c[:-window]

    # Net move only sets the DIRECTION of the leg; magnitude comes from the run
    # to the extreme.
    with np.errstate(divide='ignore', invalid='ignore'):
        net = (c - past) / (s * np.sqrt(window))
    roll_max = pd.Series(c).rolling(window, min_periods=window).max().to_numpy()
    roll_min = pd.Series(c).rolling(window, min_periods=window).min().to_numpy()

    # Direction: whichever extreme travelled further from the window's start.
    up_run, dn_run = roll_max - past, past - roll_min
    d = np.where(up_run >= dn_run, 1.0, -1.0)
    d[~np.isfinite(up_run) | ~np.isfinite(dn_run)] = np.nan
    ext = np.where(d > 0, roll_max, roll_min)

    with np.errstate(divide='ignore', invalid='ignore'):
        impulse_sig = (ext - past) * d / (s * np.sqrt(window))
        span = np.abs(ext - past)
        retrace = np.where(span > 0, np.abs(ext - c) / span, np.nan)
    retrace = np.clip(retrace, 0.0, 3.0)

    mag = impulse_sig
    phase = np.full(n, 4, dtype=np.int8)                       # drift
    phase[mag < TREND_MIN] = 0                                 # range
    strong = mag >= IMPULSE_MIN
    phase[strong & (retrace < PULLBACK_LO)] = 1                # impulse
    phase[strong & (retrace >= PULLBACK_LO) & (retrace <= PULLBACK_HI)] = 2   # pullback
    phase[strong & (retrace > PULLBACK_HI)] = 3                # broken
    phase[~np.isfinite(mag) | ~np.isfinite(retrace)] = 4

    # trend_sig keeps the leg's signed magnitude: direction from the leg, size
    # from the impulse. Downstream code signs every outcome by its sign.
    trend_sig = impulse_sig * d
    return trend_sig, retrace, phase, net


def add_events(panel, k=2.0, horizons=(48, 288)):
    """Attach phase, trend direction and trend-relative resolve to a panel."""
    c = panel['close'].to_numpy(float)
    s = panel['sigma_price'].to_numpy(float)

    trend_sig, retrace, phase, net = price_phase(c, s)
    out = {}
    out['trend_sig'] = trend_sig.astype(np.float32)
    out['trend_dir'] = np.sign(trend_sig).astype(np.int8)
    out['retrace'] = retrace.astype(np.float32)
    out['phase'] = phase
    out['net_move'] = net.astype(np.float32)

    # A second, slower leg for higher-timeframe context (24h vs 4h).
    trend_slow, retrace_slow, phase_slow, _ = price_phase(c, s, window=288)
    out['trend_sig_slow'] = trend_slow.astype(np.float32)
    out['trend_dir_slow'] = np.sign(trend_slow).astype(np.int8)
    out['retrace_slow'] = retrace_slow.astype(np.float32)
    out['phase_slow'] = phase_slow

    for H in horizons:
        hit, when = barrier_race(panel['high'].to_numpy(float),
                                 panel['low'].to_numpy(float), c, s, k=k, horizon=H)
        # Sign the race relative to the prevailing trend: +1 = the move
        # extended, -1 = it gave way. This is what makes the base rate stable.
        td = np.sign(trend_sig)
        res = (hit * td).astype(np.int8)
        res[td == 0] = 0
        res[~np.isfinite(trend_sig)] = 0
        out['resolve_%d' % H] = res
        out['resolve_raw_%d' % H] = hit
        out['t_resolve_%d' % H] = when

    return pd.concat([panel, pd.DataFrame(out, index=panel.index)], axis=1)


def summary(panel):
    """Base rates, so every conditional result later has something to beat."""
    ph = panel['phase'].to_numpy()
    lines = []
    lines.append('%-10s %9s %7s %7s %7s %7s' % ('phase', 'n', 'share', 'P(+1)', 'P(-1)', 'P(0)'))
    for code, name in PHASE_NAMES.items():
        m = ph == code
        if not m.any():
            continue
        r = panel.loc[m, 'resolve_48'].to_numpy()
        lines.append('%-10s %9s %6.1f%% %6.1f%% %6.1f%% %6.1f%%'
                     % (name, format(int(m.sum()), ','), 100.0 * m.mean(),
                        100.0 * (r == 1).mean(), 100.0 * (r == -1).mean(), 100.0 * (r == 0).mean()))
    r = panel['resolve_48'].to_numpy()
    lines.append('%-10s %9s %6.1f%% %6.1f%% %6.1f%% %6.1f%%'
                 % ('ALL', format(len(panel), ','), 100.0,
                    100.0 * (r == 1).mean(), 100.0 * (r == -1).mean(), 100.0 * (r == 0).mean()))
    return '\n'.join(lines)
