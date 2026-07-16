"""
vol_exhaustion_lib — the baseplate for the Volatility-Exhaustion measurement lens.

PURE functions only (numpy in, numpy out). No trade logic here — this file just
reproduces the project's volatility math EXACTLY and turns raw M1 into the
day-anchored, sigma-scaled state we measure in.

Why re-derive sigma here instead of importing the JS? The repo rule (PYTHON_LEGO.md)
is GENERATE-don't-port for shared math: the JS `yzVolSeries` in
js/volBacktestEngine.js is the single source of truth, and this module reproduces
it line-for-line so the two cannot silently disagree. `crosscheck_sigma.mjs`
runs the JS and this side on the same synthetic bars and asserts they match — that
test is the contract, not a comment.

Reproduced from source of truth:
  * London day boundary  -> js/sessionStats.js `_londonParts` (Europe/London calendar date)
  * London daily OHLC     -> js/volEstimatorAB.js `buildLondonDaily` (open=first, close=last, minBars>=6)
  * Yang-Zhang sigma      -> js/volBacktestEngine.js `yzVolSeries(window=30)`, k=0.34/(1.34+(w+1)/(w-1))
  * causal sigma for day i = yz[i-1]  (predicts day i using data < i)
"""
import numpy as np
import pyarrow.parquet as pq

MIN_PER_DAY = 1440
EPOCH_DAY_MIN = MIN_PER_DAY  # minutes in a day

# ── Load M1 parquet -> sorted numpy arrays ────────────────────────────────────
def load_m1(path):
    t = pq.read_table(path, columns=['open', 'high', 'low', 'close', 'volume', 'datetime'])
    o = t.column('open').to_numpy(zero_copy_only=False).astype(np.float64)
    h = t.column('high').to_numpy(zero_copy_only=False).astype(np.float64)
    lo = t.column('low').to_numpy(zero_copy_only=False).astype(np.float64)
    c = t.column('close').to_numpy(zero_copy_only=False).astype(np.float64)
    v = t.column('volume').to_numpy(zero_copy_only=False).astype(np.float64)
    dt = t.column('datetime').to_numpy(zero_copy_only=False)          # datetime64 (UTC)
    utc_min = dt.astype('datetime64[m]').astype(np.int64)             # minutes since epoch, UTC
    order = np.argsort(utc_min, kind='stable')
    return {k: arr[order] for k, arr in
            dict(open=o, high=h, low=lo, close=c, volume=v, utc_min=utc_min).items()}


# ── Europe/London offset (exact BST rule: last-Sun-Mar 01:00 UTC -> last-Sun-Oct 01:00 UTC) ──
def _last_sunday(year, month):
    """UTC minute-of-epoch for 01:00 UTC on the last Sunday of (year, month)."""
    import datetime as _d
    d = _d.date(year, month, 28)
    while (d + _d.timedelta(days=1)).month == month:
        d = d + _d.timedelta(days=1)
    while d.weekday() != 6:          # 6 = Sunday
        d = d - _d.timedelta(days=1)
    epoch = _d.date(1970, 1, 1)
    return (int((d - epoch).days) * MIN_PER_DAY) + 60   # 01:00 UTC


def london_offset_minutes(utc_min):
    """Return per-element offset (0 or 60) that converts UTC -> Europe/London wall clock."""
    utc_min = np.asarray(utc_min, dtype=np.int64)
    years = np.arange(2013, 2031)
    off = np.zeros(utc_min.shape, dtype=np.int64)
    for y in years:
        start = _last_sunday(y, 3)   # BST begins
        end = _last_sunday(y, 10)    # BST ends
        off[(utc_min >= start) & (utc_min < end)] = 60
    return off


def london_parts(utc_min):
    """Return (london_day_index [days since epoch], london_min_of_day [0..1439])."""
    loc = np.asarray(utc_min, dtype=np.int64) + london_offset_minutes(utc_min)
    day_idx = loc // MIN_PER_DAY
    mod = loc % MIN_PER_DAY
    return day_idx, mod


# ── London daily OHLC + minute-slice ranges (mirror of buildLondonDaily) ──────
def build_london_daily(m1, min_bars_per_day=6):
    day_idx, min_of_day = london_parts(m1['utc_min'])
    # day boundaries in the already-time-sorted arrays
    change = np.empty(day_idx.shape, dtype=bool)
    change[0] = True
    change[1:] = day_idx[1:] != day_idx[:-1]
    starts = np.flatnonzero(change)
    ends = np.append(starts[1:], day_idx.size)          # exclusive
    keep = (ends - starts) >= min_bars_per_day
    starts, ends = starts[keep], ends[keep]
    o = m1['open'][starts]
    c = m1['close'][ends - 1]
    # per kept segment (a "day" may have dropped-short neighbours, so compute explicitly)
    hi = np.array([m1['high'][s:e].max() for s, e in zip(starts, ends)])
    lo = np.array([m1['low'][s:e].min() for s, e in zip(starts, ends)])
    return dict(day_idx=day_idx[starts], open=o, high=hi, low=lo, close=c,
                start=starts, end=ends, min_of_day_all=min_of_day)


# ── Yang-Zhang sigma, bit-identical to js/volBacktestEngine.js yzVolSeries ─────
def yz_sigma(o, h, l, c, window=30):
    n = o.size
    out = np.zeros(n, dtype=np.float64)
    k = 0.34 / (1.34 + (window + 1) / (window - 1))
    lo_oc = np.log(c / o)                    # log(close/open)  per day
    lo_on = np.empty(n); lo_on[:] = np.nan
    lo_on[1:] = np.log(o[1:] / c[:-1])       # log(open_j / close_{j-1})  overnight
    hc = np.log(h / c); ho = np.log(h / o)
    lc = np.log(l / c); loo = np.log(l / o)
    rs_term = hc * ho + lc * loo             # Rogers-Satchell per day
    for i in range(window, n):
        on = lo_on[i - window + 1:i + 1]     # j = i-window+1 .. i  (== JS j=1..window)
        oc = lo_oc[i - window + 1:i + 1]
        rs = rs_term[i - window + 1:i + 1]
        mu_on = on.mean(); mu_oc = oc.mean()
        var_on = ((on - mu_on) ** 2).sum() / (window - 1)
        var_oc = ((oc - mu_oc) ** 2).sum() / (window - 1)
        rs_avg = rs.sum() / window
        out[i] = np.sqrt(max(var_on + k * var_oc + (1.0 - k) * rs_avg, 0.0))
    return out


def causal_sigma(daily, window=30):
    """sigma_pred[i] = yz[i-1]  -> the sigma used to forecast day i (no lookahead)."""
    yz = yz_sigma(daily['open'], daily['high'], daily['low'], daily['close'], window)
    pred = np.empty_like(yz); pred[:] = np.nan
    pred[1:] = yz[:-1]
    return pred


def hv_sigma(daily, window=20):
    """Close-to-close historical vol (HV20): a genuinely DIFFERENT estimator from YZ
    (ignores the OHLC range decomposition). Causal: pred[i] = stdev of daily log
    returns strictly BEFORE day i. Used only as a robustness swap for the sigma scale."""
    c = daily['close']; n = c.size
    ret = np.empty(n); ret[:] = np.nan
    ret[1:] = np.log(c[1:] / c[:-1])
    pred = np.empty(n); pred[:] = np.nan
    for i in range(window + 1, n):
        w = ret[i - window:i]                     # days i-window .. i-1  (all < i)
        pred[i] = w.std(ddof=1)
    return pred


def robust_sigma(daily, window=30, trim=0.05):
    """Winsorized close-to-close vol — the owner's "trim the >95% outliers each day and
    recompute" idea, done causally. For day i, take the prior `window` daily log returns,
    clip each to the [trim, 1-trim] quantile of that window (so a few crisis days can't
    inflate the scale), then take the std. pred[i] uses only returns strictly BEFORE i."""
    c = daily['close']; n = c.size
    ret = np.empty(n); ret[:] = np.nan
    ret[1:] = np.log(c[1:] / c[:-1])
    pred = np.empty(n); pred[:] = np.nan
    for i in range(window + 1, n):
        w = ret[i - window:i].copy()                  # returns for days < i
        lo_q, hi_q = np.quantile(w, [trim, 1 - trim])
        np.clip(w, lo_q, hi_q, out=w)                 # winsorize the outlier tails
        pred[i] = w.std(ddof=1)
    return pred


def causal_sigma_kind(daily, kind='yz'):
    """Select the causal sigma series by estimator: 'yz' (forecast default), 'hv', 'robust'."""
    if kind == 'hv':
        return hv_sigma(daily)
    if kind == 'robust':
        return robust_sigma(daily)
    return causal_sigma(daily)


# ── tiny self-test on synthetic bars (also used by the JS cross-check) ─────────
def _synthetic_daily(n=80, seed=7):
    rng = np.random.default_rng(seed)
    c = 100 * np.exp(np.cumsum(rng.normal(0, 0.008, n)))
    o = np.empty(n); o[0] = 100.0
    o[1:] = c[:-1] * np.exp(rng.normal(0, 0.002, n - 1))
    span = np.abs(rng.normal(0, 0.006, n)) * c
    h = np.maximum(o, c) + span
    l = np.minimum(o, c) - span
    return o, h, l, c


if __name__ == '__main__':
    o, h, l, c = _synthetic_daily()
    s = yz_sigma(o, h, l, c, 30)
    print('yz_sigma synthetic tail:', np.round(s[-5:], 8).tolist())
