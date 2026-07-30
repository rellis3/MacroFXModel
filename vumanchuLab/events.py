"""events.py — start from PRICE, not from the oscillator.

Find every confirmed reversal and every confirmed continuation over the full
history, then ask what all three VuManChu components were doing at each. This
is the inverse of `shapes.py` (which starts from an oscillator shape and looks
forward).

THE ONE DESIGN DECISION THAT MAKES THIS HONEST
──────────────────────────────────────────────
Describing what the indicator looks like at reversals, on its own, is worthless
— it will look "oversold-ish and turning" and so does half the chart. Every
feature here is therefore reported as a CONTRAST:

    lift = P(feature | REVERSAL) / P(feature | CONTINUATION)

lift 1.00 means the feature is equally common at turns and at trend-persistence
— i.e. it cannot distinguish them, no matter how convincing it looks on a chart
of past turns. Both event classes are drawn with the same magnitude filter, so
they differ in outcome and not in "was there a move at all".

WHAT IS AND IS NOT CAUSAL HERE
──────────────────────────────
The LABEL is hindsight — you only know a bar was a turn after price left it.
That is inherent to the question and it is fine for a descriptive map.
The FEATURES at the event bar use only data up to and including that bar
(oscillators are causal; divergences use only pivots already confirmed by then).
So this answers "what does the indicator look like at a turn", NOT "this
predicts a turn". `shapes.py` is the forward test; keep the two separate.

EVENTS
──────
Pivot high/low on the event timeframe: an extreme over +/-`pivot_bars`, whose
swing in AND out both exceed `min_swing` sigma.
  REVERSAL    — a confirmed pivot (price turned).
  CONTINUATION— a bar with an equally large prior move that did NOT turn: it
                kept going >= `min_swing` sigma further in the same direction
                over the same window, with no pivot in between.

THE THREE COMPONENTS
────────────────────
  WT     WaveTrend level / form / wt1-vs-wt2 cross, per timeframe
  MF     Money Flow sign, slope, extremity (causal normalisation)
  VWAP   rolling-VWAP distance in sigma + its slope
plus DIVERGENCES (regular and hidden, bull and bear) detected against price on
each of the WT and VWAP-oscillator series independently.

  python vumanchuLab/events.py --instrument eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.panel import (  # noqa: E402
    OB, OS, SIGMA_MIN, SIGMA_WINDOW, TIMEFRAMES, epoch_seconds, load_m1, resample,
)
from pylego.indicators.vumanchu import (  # noqa: E402
    OPERATOR_WT, align_htf_causal, causal_money_flow, causal_vwap_dist, wave_trend,
)

EVENT_TF = 5          # minutes — the grid turns are detected on
PIVOT_BARS = 12       # bars each side (12 x 5m = 1h)
MIN_SWING = 1.0       # sigma, both into and out of the pivot
DIV_LOOKBACK = 60     # event-grid bars to search for the last two pivots
DIV_MIN_GAP = 5
OSC_MIN_DIFF = 2.0    # minimum oscillator separation to call a divergence


# ── pivots ───────────────────────────────────────────────────────────────────

def find_pivots(high: np.ndarray, low: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    """Indices of pivot highs and lows: strict extreme over +/-k bars."""
    n = len(high)
    hi = pd.Series(high); lo = pd.Series(low)
    roll_max = hi.rolling(2 * k + 1, center=True).max().to_numpy()
    roll_min = lo.rolling(2 * k + 1, center=True).min().to_numpy()
    idx = np.arange(n)
    ph = idx[(high == roll_max) & np.isfinite(roll_max)]
    pl = idx[(low == roll_min) & np.isfinite(roll_min)]
    return ph, pl


def build_events(close, high, low, sigma, k: int, min_swing: float):
    """REVERSAL events at qualifying pivots; CONTINUATION events at bars with an
    equally large prior move that kept going."""
    n = len(close)
    ph, pl = find_pivots(high, low, k)
    rev_idx, rev_dir = [], []
    for arr, sign in ((ph, -1), (pl, +1)):
        for i in arr:
            if i - k < 0 or i + k >= n:
                continue
            s = sigma[i] * np.sqrt(k)
            if not np.isfinite(s) or s <= 0:
                continue
            into = abs(close[i] - close[i - k]) / (s * close[i])
            out = abs(close[i + k] - close[i]) / (s * close[i])
            if into >= min_swing and out >= min_swing:
                rev_idx.append(i)
                rev_dir.append(sign)      # +1 = turned UP (pivot low)
    rev_idx = np.array(rev_idx, dtype=int)
    rev_dir = np.array(rev_dir, dtype=int)

    # Continuations: same magnitude in, same magnitude out, SAME direction.
    pivots = np.zeros(n, dtype=bool)
    pivots[np.r_[ph, pl].astype(int)] = True
    i = np.arange(k, n - k)
    s = sigma[i] * np.sqrt(k) * close[i]
    with np.errstate(divide='ignore', invalid='ignore'):
        into = (close[i] - close[i - k]) / s
        out = (close[i + k] - close[i]) / s
    ok = (np.isfinite(into) & np.isfinite(out)
          & (np.abs(into) >= min_swing) & (np.abs(out) >= min_swing)
          & (np.sign(into) == np.sign(out)) & ~pivots[i])
    con_idx = i[ok]
    con_dir = np.sign(into[ok]).astype(int)   # +1 = continuing UP
    return (rev_idx, rev_dir), (con_idx, con_dir)


# ── divergence, read causally at a given bar ─────────────────────────────────

def divergence_at(idx: int, close: np.ndarray, osc: np.ndarray, k: int,
                  lookback: int = DIV_LOOKBACK, min_gap: int = DIV_MIN_GAP) -> str:
    """Regular / hidden divergence from the last two price pivots CONFIRMED by
    bar `idx` (pivot at r is confirmable only at r+k, so anything later is not
    knowable here). Returns one of REG_BULL / REG_BEAR / HID_BULL / HID_BEAR /
    NONE.
    """
    # The window must hold at least TWO pivots, each needing +/-k bars of
    # confirmation, plus the min_gap between them. A fixed 60-bar lookback
    # silently returned NONE for every event once k grew past ~28 — which reads
    # as "no divergences at large reversals" rather than "the detector had no
    # room to look". Scale it with k.
    lookback = max(lookback, 5 * k + min_gap)
    lo_i = max(0, idx - lookback)
    seg_h = close[lo_i:idx + 1]
    if len(seg_h) < 2 * k + 3:
        return 'NONE'
    ph, pl = find_pivots(seg_h, seg_h, k)
    # Only pivots whose right-hand confirmation window has completed by `idx`.
    ph = [p for p in ph if p + k <= len(seg_h) - 1]
    pl = [p for p in pl if p + k <= len(seg_h) - 1]

    def osc_at(p):
        a = max(0, lo_i + p - 2); b = min(len(close), lo_i + p + 3)
        seg = osc[a:b]
        seg = seg[np.isfinite(seg)]
        return seg if seg.size else None

    if len(ph) >= 2 and (ph[-1] - ph[-2]) >= min_gap:
        p1, p2 = ph[-2], ph[-1]
        o1, o2 = osc_at(p1), osc_at(p2)
        if o1 is not None and o2 is not None:
            v1, v2 = float(o1.max()), float(o2.max())
            if seg_h[p2] > seg_h[p1] and (v1 - v2) >= OSC_MIN_DIFF:
                return 'REG_BEAR'
            if seg_h[p2] < seg_h[p1] and (v2 - v1) >= OSC_MIN_DIFF:
                return 'HID_BEAR'
    if len(pl) >= 2 and (pl[-1] - pl[-2]) >= min_gap:
        p1, p2 = pl[-2], pl[-1]
        o1, o2 = osc_at(p1), osc_at(p2)
        if o1 is not None and o2 is not None:
            v1, v2 = float(o1.min()), float(o2.min())
            if seg_h[p2] < seg_h[p1] and (v2 - v1) >= OSC_MIN_DIFF:
                return 'REG_BULL'
            if seg_h[p2] > seg_h[p1] and (v1 - v2) >= OSC_MIN_DIFF:
                return 'HID_BULL'
    return 'NONE'


# ── feature read at an event ─────────────────────────────────────────────────

def component_frame(instrument: str, event_tf: int = EVENT_TF, start=None, end=None,
                    verbose=True) -> tuple[pd.DataFrame, dict]:
    """All three components on the event grid, plus each higher timeframe's WT
    step-held causally onto it."""
    m1 = load_m1(instrument, start, end)
    ev = resample(m1, event_tf)
    h = ev['high'].to_numpy(float); l = ev['low'].to_numpy(float)
    c = ev['close'].to_numpy(float); o = ev['open'].to_numpy(float)
    vol = ev['volume'].to_numpy(float)
    v = vol if np.isfinite(vol).any() else None

    wt = wave_trend(h, l, c, **OPERATOR_WT)
    mf = causal_money_flow(o, h, l, c, v, period=14, window=2000)
    vd = causal_vwap_dist(h, l, c, v, window=20, sigma_window=SIGMA_WINDOW,
                          min_periods=SIGMA_MIN)

    df = pd.DataFrame(index=ev.index)
    df['close'] = c
    df['wt1'], df['wt2'] = wt.wt1, wt.wt2
    df['mf'] = mf
    df['vwap_dist'] = vd
    df['sigma'] = pd.Series(c, index=ev.index).pct_change() \
        .rolling(SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy()

    # Higher timeframes' WT, causally aligned onto the event grid.
    ev_close = epoch_seconds(ev.index) + event_tf * 60
    for tf in TIMEFRAMES:
        if tf <= event_tf:
            continue
        b = resample(m1, tf)
        w = wave_trend(b['high'].to_numpy(float), b['low'].to_numpy(float),
                       b['close'].to_numpy(float), **OPERATOR_WT)
        sc = epoch_seconds(b.index) + tf * 60
        df[f'htf{tf}_wt1'] = align_htf_causal(ev_close, sc, w.wt1)
        df[f'htf{tf}_wt2'] = align_htf_causal(ev_close, sc, w.wt2)
    if verbose:
        print(f'  {instrument}: {len(df):,} {event_tf}m bars '
              f'{df.index[0].date()} -> {df.index[-1].date()}')
    return df, {'wt1': wt.wt1, 'mf': mf, 'vwap_dist': vd, 'close': c,
                'high': h, 'low': l}


def describe_events(df: pd.DataFrame, series: dict, idx: np.ndarray, dirs: np.ndarray,
                    k: int) -> pd.DataFrame:
    """One row per event: what each component was doing, oriented to the PRIOR
    MOVE.

    `dirs` MUST be the direction price had been travelling INTO the event, for
    BOTH classes — not the direction it left in. A first cut oriented reversals
    to the direction they turned TO and continuations to the direction they kept
    going, which are different reference frames: "oscillator stretched against
    the move" was then near-guaranteed at reversals and near-impossible at
    continuations, and the contrast returned lifts of 277x. That was arithmetic,
    not a finding. Orienting both classes to the prior move makes every feature
    mean the same thing in both, so the only thing that differs is what price
    did next — which is the entire question.
    """
    c = series['close']; wt1 = series['wt1']; mf = series['mf']; vd = series['vwap_dist']
    wt1s = pd.Series(wt1); mfs = pd.Series(mf); vds = pd.Series(vd)
    wt2 = df['wt2'].to_numpy(float)

    rows = []
    for i, p in zip(idx, dirs):
        if i < 30 or not np.isfinite(wt1[i]):
            continue
        # p = the direction price had been travelling INTO this bar.
        # --- WT: is the wave stretched in the direction price has been going? ---
        lvl = 'OB' if wt1[i] >= OB else ('OS' if wt1[i] <= OS else 'mid')
        wt_stretched = (p < 0 and wt1[i] <= OS) or (p > 0 and wt1[i] >= OB)
        wt_slope = np.sign(wt1[i] - wt1[i - 3]) if np.isfinite(wt1[i - 3]) else 0
        wt_turning_back = bool(wt_slope == -p)
        wt_cross_back = (np.sign(wt1[i] - wt2[i]) == -p) if np.isfinite(wt2[i]) else False
        # --- MF ---
        mf_v = mf[i]
        mf_with = (np.sign(mf_v) == p) if np.isfinite(mf_v) else False
        mf_against = (np.sign(mf_v) == -p) if np.isfinite(mf_v) else False
        mf_slope = np.sign(mf_v - mf[i - 3]) if np.isfinite(mf_v) and np.isfinite(mf[i - 3]) else 0
        mf_fading = bool(mf_slope == -p)
        # --- VWAP: price stretched away from fair value, the way it came ---
        vd_v = vd[i]
        vwap_stretched = (np.isfinite(vd_v) and abs(vd_v) >= 1.0 and np.sign(vd_v) == p)
        vwap_turning_back = (np.sign(vd_v - vd[i - 3]) == -p) if (
            np.isfinite(vd_v) and np.isfinite(vd[i - 3])) else False
        # --- HTF WT: is the slow wave ALSO stretched the way price came? ---
        htf = {}
        for col in [c2 for c2 in df.columns if c2.startswith('htf') and c2.endswith('wt1')]:
            hv = df[col].to_numpy(float)[i]
            tf = col.split('_')[0].replace('htf', '')
            htf[f'htf{tf}_stretched'] = bool(np.isfinite(hv) and
                                             ((p < 0 and hv <= OS) or (p > 0 and hv >= OB)))
        # --- divergences (causal at this bar) ---
        div_wt = divergence_at(i, c, wt1, k)
        div_vwap = divergence_at(i, c, vd, k)
        div_mf = divergence_at(i, c, mf, k)

        def warns_reversal(dv):
            """Bull divergence after a DOWN move / bear after an UP move — a
            divergence arguing the prior move is running out."""
            if dv in ('REG_BULL', 'HID_BULL'):
                return p < 0
            if dv in ('REG_BEAR', 'HID_BEAR'):
                return p > 0
            return False

        rows.append({
            'idx': i, 'prior_dir': int(p),
            'wt_level': lvl, 'wt_stretched': bool(wt_stretched),
            'wt_turning_back': wt_turning_back, 'wt_cross_back': bool(wt_cross_back),
            'mf_with': bool(mf_with), 'mf_against': bool(mf_against),
            'mf_fading': mf_fading,
            'vwap_stretched': bool(vwap_stretched),
            'vwap_turning_back': bool(vwap_turning_back),
            'div_wt': div_wt, 'div_wt_warns': warns_reversal(div_wt),
            'div_wt_regular': div_wt.startswith('REG'),
            'div_wt_hidden': div_wt.startswith('HID'),
            'div_vwap_warns': warns_reversal(div_vwap),
            'div_mf_warns': warns_reversal(div_mf),
            **htf,
        })
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    # How many of the THREE parts were "stretched / opposing" at this bar.
    out['n_components'] = (out['wt_stretched'].astype(int)
                           + out['mf_against'].astype(int)
                           + out['vwap_stretched'].astype(int))
    return out


# ── the contrast ─────────────────────────────────────────────────────────────

def contrast(rev: pd.DataFrame, con: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    """P(feature | reversal) vs P(feature | continuation) and the lift between."""
    rows = []
    nr, nc = len(rev), len(con)
    for f in features:
        pr = float(rev[f].mean()); pc = float(con[f].mean())
        # SE of a difference of two proportions (events are far enough apart in
        # time to treat as roughly independent; pivots are >= pivot_bars apart).
        se = np.sqrt(pr * (1 - pr) / max(nr, 1) + pc * (1 - pc) / max(nc, 1))
        rows.append({
            'feature': f,
            'P_at_reversal': round(pr, 4),
            'P_at_continuation': round(pc, 4),
            'lift': round(pr / pc, 3) if pc > 0 else np.nan,
            'diff_pp': round(100 * (pr - pc), 2),
            'z': round((pr - pc) / se, 2) if se > 0 else np.nan,
        })
    return pd.DataFrame(rows).sort_values('lift', key=lambda s: (s - 1).abs(),
                                          ascending=False).reset_index(drop=True)


FEATURES = [
    'wt_stretched', 'wt_turning_back', 'wt_cross_back',
    'mf_against', 'mf_with', 'mf_fading',
    'vwap_stretched', 'vwap_turning_back',
    'div_wt_warns', 'div_wt_regular', 'div_wt_hidden',
    'div_vwap_warns', 'div_mf_warns',
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--event-tf', type=int, default=EVENT_TF)
    ap.add_argument('--pivot-bars', type=int, default=PIVOT_BARS)
    ap.add_argument('--min-swing', type=float, default=MIN_SWING)
    ap.add_argument('--start', default=None)
    a = ap.parse_args()

    print(f'Loading {a.instrument} ...')
    df, series = component_frame(a.instrument, a.event_tf, start=a.start)
    (ri, rd), (ci, cd) = build_events(series['close'], series['high'], series['low'],
                                      df['sigma'].to_numpy(float),
                                      a.pivot_bars, a.min_swing)
    print(f'  events: {len(ri):,} reversals, {len(ci):,} continuations '
          f'(pivot +/-{a.pivot_bars} bars = {a.pivot_bars*a.event_tf}m, '
          f'swing >= {a.min_swing} sigma both sides)')
    print('  computing divergences at each event ...')
    # Both classes oriented to the PRIOR move: a pivot low turned UP (+1),
    # so the move INTO it was down (-1). Continuations already carry the
    # prior direction. Same reference frame => an honest contrast.
    rev = describe_events(df, series, ri, -rd, a.pivot_bars)
    con = describe_events(df, series, ci, cd, a.pivot_bars)
    htf_feats = [c for c in rev.columns if c.endswith('_stretched') and c.startswith('htf')]

    print(f'\n{"="*96}')
    print(f'WHAT THE THREE VuManChu PARTS WERE DOING — {a.instrument}, '
          f'{a.event_tf}m grid')
    print(f'{len(rev):,} reversals vs {len(con):,} continuations')
    print(f'{"="*96}')
    print('\nlift = P(feature | REVERSAL) / P(feature | CONTINUATION).')
    print('lift 1.00 = the feature is equally common at turns and at trend-persistence,')
    print('i.e. it does not distinguish them however good it looks on a chart of turns.\n')
    print(contrast(rev, con, FEATURES + htf_feats).to_string(index=False))

    print(f'\n-- HOW MANY OF THE THREE COMPONENTS WERE STRETCHED AGAINST THE MOVE --')
    tab = []
    for k in range(4):
        pr = float((rev['n_components'] == k).mean())
        pc = float((con['n_components'] == k).mean())
        tab.append({'n_components': k, 'P_at_reversal': round(pr, 4),
                    'P_at_continuation': round(pc, 4),
                    'lift': round(pr / pc, 3) if pc > 0 else np.nan,
                    'n_rev': int((rev['n_components'] == k).sum())})
    print(pd.DataFrame(tab).to_string(index=False))

    print(f'\n-- WT LEVEL AT THE EVENT --')
    lv = pd.DataFrame({
        'P_at_reversal': rev['wt_level'].value_counts(normalize=True),
        'P_at_continuation': con['wt_level'].value_counts(normalize=True)})
    lv['lift'] = (lv['P_at_reversal'] / lv['P_at_continuation']).round(3)
    print(lv.round(4).to_string())

    print(f'\n-- DIVERGENCE TYPE AT THE EVENT (WaveTrend) --')
    dv = pd.DataFrame({
        'P_at_reversal': rev['div_wt'].value_counts(normalize=True),
        'P_at_continuation': con['div_wt'].value_counts(normalize=True)})
    dv['lift'] = (dv['P_at_reversal'] / dv['P_at_continuation']).round(3)
    print(dv.round(4).to_string())


if __name__ == '__main__':
    main()
