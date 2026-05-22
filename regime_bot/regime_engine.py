"""
1-minute HMM Regime Engine — Python port of hmm5m.js.

Runs a 3-state Forward HMM (BULL | BEAR | RANGE) on 1m bars using
z-scored features: linreg slope (trendZ), ATR (volZ), ADX (adxZ).

Adds run_length tracking: consecutive bars the current regime has held.
This is used by the decay detector and logged in every status line.
"""

import math
import logging
from dataclasses import dataclass
from typing import Optional

import config

log = logging.getLogger(__name__)


@dataclass
class RegimeSnapshot:
    regime:     str    # 'BULL' | 'BEAR' | 'RANGE'
    conf:       float  # 0.0–1.0 (max of pBull/pBear/pRange)
    p_bull:     float  # raw probability 0–1
    p_bear:     float
    p_range:    float
    trend_z:    float  # z-scored linreg slope
    vol_z:      float  # z-scored ATR (negative = suppressed vol = clean trend)
    adx_z:      float  # z-scored ADX
    run_length: int    # consecutive 1m bars in this regime


# ── Feature builders (match hmm5m.js exactly) ─────────────────────────────────

def _linreg_slope(closes: list[float], start: int, n: int) -> float:
    if n < 2:
        return 0.0
    xm = (n - 1) / 2.0
    sXY = sX2 = 0.0
    for i in range(n):
        xi = i - xm
        sXY += xi * closes[start + i]
        sX2 += xi * xi
    return sXY / sX2 if sX2 > 0 else 0.0


def _build_atr(bars: list[dict], n: int = 20) -> list[float]:
    L   = len(bars)
    out = [0.0] * L
    if L < 1:
        return out
    out[0] = abs(bars[0]['high'] - bars[0]['low'])
    k = 1.0 / n
    for i in range(1, L):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = max(h - l, abs(h - pc), abs(l - pc))
        out[i] = k * tr + (1 - k) * out[i - 1] if tr > 0 else out[i - 1]
    return out


def _build_adx(bars: list[dict], n: int = 14) -> list[float]:
    L   = len(bars)
    out = [0.0] * L
    if L < n * 2 + 2:
        return out

    dmp_arr, dmm_arr, tr_arr = [], [], []
    for i in range(1, L):
        h, l   = bars[i]['high'],     bars[i]['low']
        ph, pl = bars[i - 1]['high'], bars[i - 1]['low']
        pc     = bars[i - 1]['close']
        up     = h - ph
        dn     = pl - l
        dmp_arr.append(up if up > dn and up > 0 else 0.0)
        dmm_arr.append(dn if dn > up and dn > 0 else 0.0)
        tr_arr.append(max(h - l, abs(h - pc), abs(l - pc)))

    sDMp = sum(dmp_arr[:n])
    sDMm = sum(dmm_arr[:n])
    sTR  = sum(tr_arr[:n])
    dx   = []
    for i in range(n, len(dmp_arr)):
        sDMp = sDMp - sDMp / n + dmp_arr[i]
        sDMm = sDMm - sDMm / n + dmm_arr[i]
        sTR  = sTR  - sTR  / n + tr_arr[i]
        if sTR < 1e-10:
            dx.append(0.0)
            continue
        dip = (sDMp / sTR) * 100
        dim = (sDMm / sTR) * 100
        dx.append(abs(dip - dim) / (dip + dim) * 100 if dip + dim > 0 else 0.0)

    if len(dx) < n:
        return out

    adx_val = sum(dx[:n]) / n
    off     = n * 2
    if off < L:
        out[off] = adx_val
    for i in range(n, len(dx)):
        adx_val = (adx_val * (n - 1) + dx[i]) / n
        if i + n < L:
            out[i + n] = adx_val

    if out[L - 1] == 0.0 and L > 1:
        out[L - 1] = out[L - 2]
    return out


def _rolling_z(arr: list[float], idx: int, period: int = 200) -> float:
    start = max(0, idx - period + 1)
    n     = idx - start + 1
    if n < 5:
        return 0.0
    mean = sum(arr[start:idx + 1]) / n
    var  = sum((arr[i] - mean) ** 2 for i in range(start, idx + 1)) / n
    std  = math.sqrt(var)
    return 0.0 if std < 1e-12 else (arr[idx] - mean) / std


def _lse3(a: float, b: float, c: float) -> float:
    mx = max(a, b, c)
    return mx + math.log(math.exp(a - mx) + math.exp(b - mx) + math.exp(c - mx))


def _gauss_ll(x: float, mu: float) -> float:
    return -0.5 * (x - mu) ** 2


# ── HMM forward pass ──────────────────────────────────────────────────────────

def compute_hmm(bars: list[dict]) -> Optional[dict]:
    """
    Runs the 3-state Forward HMM on bars (oldest-first list of OHLC dicts).
    Returns dict with regime/conf/p_bull/p_bear/p_range/trend_z/vol_z/adx_z,
    or None when there is insufficient data.
    """
    n_bars = len(bars)
    ln     = config.HMM_LINREG_N
    if n_bars < ln + 50:
        return None

    self_p  = config.HMM_SELF_PROB
    other_p = (1 - self_p) / 2
    log_s   = math.log(self_p)
    log_o   = math.log(other_p)
    adt     = config.HMM_ADX_TARGET

    closes = [b['close'] for b in bars]
    atr    = _build_atr(bars, 20)
    adx    = _build_adx(bars, config.HMM_ADX_N)

    trend = [0.0] * n_bars
    for i in range(ln - 1, n_bars):
        trend[i] = _linreg_slope(closes, i - ln + 1, ln)

    # Forward algorithm (log space)
    LOG_INIT = math.log(1 / 3)
    la = [LOG_INIT, LOG_INIT, LOG_INIT]   # [bull, bear, range]

    for i in range(1, n_bars):
        tz = _rolling_z(trend, i, 200)
        vz = _rolling_z(atr,   i, 200)
        az = _rolling_z(adx,   i, 200)

        eB  = _gauss_ll(tz, +1) + _gauss_ll(az,  adt) + _gauss_ll(vz, 0)
        eBr = _gauss_ll(tz, -1) + _gauss_ll(az,  adt) + _gauss_ll(vz, 0)
        eR  = _gauss_ll(tz,  0) + _gauss_ll(az, -1.0) + _gauss_ll(vz, 0)

        p_bull  = _lse3(la[0] + log_s, la[1] + log_o, la[2] + log_o)
        p_bear  = _lse3(la[0] + log_o, la[1] + log_s, la[2] + log_o)
        p_range = _lse3(la[0] + log_o, la[1] + log_o, la[2] + log_s)
        la = [p_bull + eB, p_bear + eBr, p_range + eR]

    # Softmax → probabilities
    mx  = max(la)
    exp = [math.exp(v - mx) for v in la]
    s   = sum(exp)
    p_bull, p_bear, p_range = [v / s for v in exp]

    regime = (
        'BULL'  if p_bull  >= p_bear  and p_bull  >= p_range else
        'BEAR'  if p_bear  >= p_bull  and p_bear  >= p_range else
        'RANGE'
    )

    last = n_bars - 1
    return {
        'regime':  regime,
        'p_bull':  p_bull,
        'p_bear':  p_bear,
        'p_range': p_range,
        'conf':    max(p_bull, p_bear, p_range),
        'trend_z': round(_rolling_z(trend, last, 200), 3),
        'vol_z':   round(_rolling_z(atr,   last, 200), 3),
        'adx_z':   round(_rolling_z(adx,   last, 200), 3),
    }


# ── Stateful engine with run_length tracking ──────────────────────────────────

class RegimeEngine:
    """
    Wraps compute_hmm() and tracks how many consecutive 1m bars the current
    regime has held (run_length).  Resets to 1 on a regime change.
    """

    def __init__(self):
        self._last_regime: Optional[str] = None
        self._run_length: int = 0

    def update(self, bars: list[dict]) -> Optional[RegimeSnapshot]:
        result = compute_hmm(bars)
        if result is None:
            return None

        regime = result['regime']
        if regime == self._last_regime:
            self._run_length += 1
        else:
            self._last_regime = regime
            self._run_length  = 1

        return RegimeSnapshot(
            regime     = regime,
            conf       = result['conf'],
            p_bull     = result['p_bull'],
            p_bear     = result['p_bear'],
            p_range    = result['p_range'],
            trend_z    = result['trend_z'],
            vol_z      = result['vol_z'],
            adx_z      = result['adx_z'],
            run_length = self._run_length,
        )
