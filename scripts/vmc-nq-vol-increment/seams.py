"""vmc-nq-vol-increment: seams (contract rolls and feed joins) and the segment rule. NO OUTCOMES are computed here.

The rule (prereg section 3.1), stated once and enforced here:
  SEAM      a 1-minute bar whose contract or feed source differs from the previous 1-minute bar
            (roll = contract change; join = NinjaTrader <-> owner file). Neither is assumed harmless.
  SEGMENT   a maximal run of tau-bars with no seam inside it. A tau-bar that holds 1-minute bars from BOTH sides of
            a seam (a "mixed" bar) belongs to no segment and is never used.
  FEATURES  every feature at bar t is computed from bars of t's own segment only: rolling windows are undefined when
            the window would reach before the segment start, recursive indicators (WaveTrend EMAs, RSI) restart at
            the segment start, and "previous trade date" quantities are undefined unless that whole date lies in t's
            segment. So no feature's actual lookback ever crosses a seam.
  ELIGIBLE  bar t is an observation only if (i) t - segment_start >= L, the longest actual lookback of any feature
            used by any compared model, including the stale-V control (+12); (ii) the previous trade date lies
            wholly inside the segment; (iii) the target window t+1..t+h lies inside the same segment.
`test_seams.py` checks this mechanically (segment perturbation: anything outside t's segment can be changed
arbitrarily and no eligible observation may change).
"""
import numpy as np
import pandas as pd


def find_seams(m1):
    """m1: 1-minute rows sorted by t_open, with contract and owner_share (1 = owner file, 0 = NinjaTrader).
    Returns a DataFrame of seams: t_open of the first bar after the seam, kind ('roll' / 'join' / 'roll+join')."""
    src = (m1.owner_share.to_numpy(float) > 0.5).astype(np.int8)
    con = m1.contract.astype(str).to_numpy()
    roll = np.r_[False, con[1:] != con[:-1]]
    join = np.r_[False, src[1:] != src[:-1]]
    i = np.where(roll | join)[0]
    kind = np.where(roll[i] & join[i], "roll+join", np.where(roll[i], "roll", "join"))
    return pd.DataFrame({"t_open": m1.t_open.to_numpy()[i], "kind": kind,
                         "from": con[i - 1], "to": con[i], "src_from": src[i - 1], "src_to": src[i]})


def segments(bars, seam_t, m1_t):
    """bars: tau-bars (t_open, t_close, epoch s, clock bins). seam_t: sorted seam 1-minute t_open. m1_t: sorted
    1-minute t_open of the base. Returns (seg, mixed): seg = segment id per bar (-1 for mixed bars)."""
    to, tc = bars.t_open.to_numpy(), bars.t_close.to_numpy()
    if not len(seam_t):
        return np.zeros(len(bars), np.int64), np.zeros(len(bars), bool)
    k0 = np.searchsorted(seam_t, to, side="left")
    k1 = np.searchsorted(seam_t, tc, side="left")
    has = k1 > k0                                     # a seam's first bar falls inside [t_open, t_close)
    s = seam_t[np.minimum(k0, len(seam_t) - 1)]
    # mixed = the bar also holds 1-minute bars from before that seam
    before = np.searchsorted(m1_t, s, side="left") - np.searchsorted(m1_t, to, side="left")
    mixed = has & (before > 0)
    seg = np.cumsum(has)                              # a seam bar opens a new segment
    seg = np.where(mixed, -1, seg)
    # a mixed bar's segment starts at the next bar
    return seg, mixed


def seg_start_index(seg):
    """Index of the first bar of each bar's segment (mixed bars: -1)."""
    n = len(seg)
    idx = np.arange(n)
    first = pd.Series(idx).groupby(seg).transform("min").to_numpy()
    return np.where(seg >= 0, first, -1)


def per_segment(bars, seg, fn):
    """Apply fn(segment_frame) -> DataFrame (same length) on each segment separately; mixed bars get NaN rows.
    This is how every feature is built: fn never sees another segment."""
    parts = []
    for g, d in bars.groupby(seg, sort=False):
        if g < 0:
            continue
        r = fn(d.reset_index(drop=True))
        r.index = d.index
        parts.append(r)
    return pd.concat(parts).reindex(bars.index)


def eligible(seg, trade_date, lookback, horizon):
    """Bars whose every lookback (lookback bars back, plus the whole previous trade date) and the forward target
    window t+1..t+horizon lie inside their own segment."""
    n = len(seg)
    idx = np.arange(n)
    start = seg_start_index(seg)
    td = pd.to_datetime(trade_date).to_numpy()
    ud = np.unique(td)
    pos = np.searchsorted(ud, td)
    first_by_date = pd.Series(idx).groupby(td).min().reindex(ud).to_numpy()
    prev_first = np.where(pos > 0, first_by_date[np.maximum(pos - 1, 0)], -1)
    back = (seg >= 0) & (idx - start >= lookback) & (prev_first >= start) & (pos > 0)
    fwd = np.zeros(n, bool)
    ok = idx + horizon < n
    fwd[ok] = seg[np.minimum(idx + horizon, n - 1)][ok] == seg[ok]
    return back & fwd
