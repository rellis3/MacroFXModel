"""
1-minute HMM Regime Engine — Python port of hmm5m-v2.js (4-state).

States: BULL | BEAR | RANGE | CHOP
  BULL  — positive trendZ, above-avg ADX, suppressed vol
  BEAR  — negative trendZ, above-avg ADX, suppressed vol
  RANGE — flat trendZ, low ADX, low vol (orderly, mean-reverting)
  CHOP  — flat trendZ, low ADX, HIGH vol (directionless noise, no-trade zone)

Improvements over v1:
  • 4th CHOP state eliminates the v1 confusion between orderly ranges and
    high-vol directionless sessions — CHOP is always a no-trade condition.
  • Per-state variance on Gaussian emissions (learned via Baum-Welch or defaults).
  • Session-aware transition matrix: boosts self-transition during THIN/ASIA
    so the model ignores thin-market noise rather than flipping regime.
  • Macro confidence overlay: FRED VIX/HY/curve multiplier adjusts raw HMM
    confidence down in stress environments — this flows directly into lot sizing.
  • Accepts Baum-Welch learned params from KV (loaded by dashboard_client).

run_length tracks consecutive 1m bars in the current regime — used by the
decay detector and displayed in every status line.
"""

import math
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import config

log = logging.getLogger(__name__)

# ── State constants ───────────────────────────────────────────────────────────

K            = 4
STATE_NAMES  = ['BULL', 'BEAR', 'RANGE', 'CHOP']

# Default emission means [trendZ, volZ, adxZ] — mirrors hmm5m-v2.js DEFAULT_MEANS
DEFAULT_MEANS: list[list[float]] = [
    [ 1.0,  0.0,  0.7],   # BULL
    [-1.0,  0.0,  0.7],   # BEAR
    [ 0.0,  0.0, -1.0],   # RANGE
    [ 0.0,  1.0,  0.0],   # CHOP
]
DEFAULT_VARS: list[list[float]] = [
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
]


# ── Snapshot dataclass ────────────────────────────────────────────────────────

@dataclass
class RegimeSnapshot:
    regime:      str    # 'BULL' | 'BEAR' | 'RANGE' | 'CHOP'
    conf:        float  # macro-adjusted confidence 0–1
    raw_conf:    float  # HMM-only confidence before macro adjustment
    p_bull:      float
    p_bear:      float
    p_range:     float
    p_chop:      float
    trend_z:     float
    vol_z:       float
    adx_z:       float
    run_length:  int
    session:     str    # 'LONDON_OPEN'|'LONDON'|'NY'|'ASIA'|'THIN'|'ACTIVE'
    macro_mult:  float  # confidence multiplier from FRED (0.45–1.15)
    macro_label: str    # 'CALM'|'CAUTION'|'STRESS'
    is_learned:  bool   # True when Baum-Welch params used


# ── Session helpers ───────────────────────────────────────────────────────────

def _session_label(hour_utc: int) -> str:
    if 7  <= hour_utc < 9:  return 'LONDON_OPEN'
    if 9  <= hour_utc < 12: return 'LONDON'
    if 12 <= hour_utc < 17: return 'NY'
    if 2  <= hour_utc < 7:  return 'ASIA'
    if hour_utc >= 22 or hour_utc < 2: return 'THIN'
    return 'ACTIVE'


def _session_trans_matrix(base_a: list[list[float]], hour_utc: int) -> list[list[float]]:
    """
    During off-peak hours (outside 07–17 UTC) boost self-transition so the
    model ignores thin-market noise rather than registering a real regime flip.
    Mirrors sessionTransMatrix() in hmm5m-v2.js.
    """
    if 7 <= hour_utc < 17:
        return base_a

    result = []
    for i, row in enumerate(base_a):
        self_p = row[i]
        boost  = min(0.98, self_p + (1 - self_p) * 0.3)
        denom  = max(1 - self_p, 1e-10)
        scale  = (1 - boost) / denom
        new_row = [p * scale if j != i else boost for j, p in enumerate(row)]
        result.append(new_row)
    return result


# ── Feature builders ──────────────────────────────────────────────────────────

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


def _build_adx(bars: list[dict], n: int = 50) -> list[float]:
    L   = len(bars)
    out = [0.0] * L
    if L < n * 2 + 2:
        return out

    dmp_a, dmm_a, tr_a = [], [], []
    for i in range(1, L):
        h, l   = bars[i]['high'],     bars[i]['low']
        ph, pl = bars[i - 1]['high'], bars[i - 1]['low']
        pc     = bars[i - 1]['close']
        up, dn = h - ph, pl - l
        dmp_a.append(up if up > dn and up > 0 else 0.0)
        dmm_a.append(dn if dn > up and dn > 0 else 0.0)
        tr_a.append(max(h - l, abs(h - pc), abs(l - pc)))

    sDMp = sum(dmp_a[:n])
    sDMm = sum(dmm_a[:n])
    sTR  = sum(tr_a[:n])
    dx   = []
    for i in range(n, len(dmp_a)):
        sDMp = sDMp - sDMp / n + dmp_a[i]
        sDMm = sDMm - sDMm / n + dmm_a[i]
        sTR  = sTR  - sTR  / n + tr_a[i]
        if sTR < 1e-10:
            dx.append(0.0)
            continue
        dip = (sDMp / sTR) * 100
        dim = (sDMm / sTR) * 100
        dx.append(abs(dip - dim) / (dip + dim) * 100 if dip + dim > 0 else 0.0)

    if len(dx) < n:
        return out
    adx_val = sum(dx[:n]) / n
    off = n * 2
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


def _lse_k(vals: list[float]) -> float:
    mx = max(vals)
    return mx + math.log(sum(math.exp(v - mx) for v in vals))


def _gauss_ll_v(x: float, mu: float, variance: float) -> float:
    """Gaussian log-likelihood with per-state variance (mirrors gaussLLV in v2.js)."""
    v = max(variance, 1e-6)
    return -0.5 * (x - mu) ** 2 / v - 0.5 * math.log(v)


# ── Transition matrix builder ─────────────────────────────────────────────────

def _build_trans_matrix(self_prob: float) -> list[list[float]]:
    off = (1 - self_prob) / (K - 1)
    return [[self_prob if i == j else off for j in range(K)] for i in range(K)]


# ── Core HMM forward pass (v2) ────────────────────────────────────────────────

def compute_hmm_v2(
    bars:           list[dict],
    trained_params: Optional[dict] = None,
    macro_ctx:      Optional[dict] = None,
) -> Optional[dict]:
    """
    Runs the 4-state Forward HMM on bars (oldest-first OHLC list).

    Args:
        bars:           1m bar list from MT5 (oldest first, drop last incomplete bar)
        trained_params: dict keyed by symbol from 'hmm5m_trained_params' KV,
                        or None to use fixed defaults
        macro_ctx:      dict from 'hmm5m_macro_context' KV (VIX/HY/curve mult),
                        or None to skip macro adjustment

    Returns dict with regime/conf/raw_conf/p_bull/p_bear/p_range/p_chop/
            trend_z/vol_z/adx_z/session/macro_mult/macro_label/is_learned,
            or None when there is insufficient data.
    """
    n_bars = len(bars)
    ln     = config.HMM_LINREG_N
    warmup = ln + 50
    if n_bars < warmup:
        return None

    # ── Emission params ───────────────────────────────────────────────────────
    sym     = config.PAIR
    learned = (trained_params or {}).get(sym)
    if learned and 'means' in learned and 'vars' in learned and 'transMatrix' in learned:
        means      = learned['means']
        vars_      = learned['vars']
        base_a     = learned['transMatrix']
        is_learned = True
    else:
        means      = DEFAULT_MEANS
        vars_      = DEFAULT_VARS
        base_a     = _build_trans_matrix(config.HMM_SELF_PROB)
        is_learned = False

    # ── Session-aware transition matrix ───────────────────────────────────────
    hour_utc = datetime.now(timezone.utc).hour
    sess     = _session_label(hour_utc)
    a_mat    = _session_trans_matrix(base_a, hour_utc)
    log_a    = [[math.log(max(p, 1e-300)) for p in row] for row in a_mat]

    # ── Feature series ────────────────────────────────────────────────────────
    closes = [b['close'] for b in bars]
    atr    = _build_atr(bars, 20)
    adx    = _build_adx(bars, config.HMM_ADX_N)
    trend  = [0.0] * n_bars
    for i in range(ln - 1, n_bars):
        trend[i] = _linreg_slope(closes, i - ln + 1, ln)

    # ── Observation sequence (start after warmup) ─────────────────────────────
    obs = []
    for i in range(warmup, n_bars):
        obs.append([
            _rolling_z(trend, i, 200),
            _rolling_z(atr,   i, 200),
            _rolling_z(adx,   i, 200),
        ])

    if not obs:
        return None

    # ── Forward algorithm (log-space, K=4) ───────────────────────────────────
    log_init = math.log(1.0 / K)
    la = [log_init + sum(_gauss_ll_v(obs[0][f], means[k][f], vars_[k][f]) for f in range(3))
          for k in range(K)]

    for t in range(1, len(obs)):
        new_la = []
        for j in range(K):
            trans = [la[i] + log_a[i][j] for i in range(K)]
            em    = sum(_gauss_ll_v(obs[t][f], means[j][f], vars_[j][f]) for f in range(3))
            new_la.append(_lse_k(trans) + em)
        la = new_la

    # ── Softmax → probabilities ───────────────────────────────────────────────
    mx   = max(la)
    exps = [math.exp(v - mx) for v in la]
    s    = sum(exps)
    probs = [v / s for v in exps]

    best_idx    = probs.index(max(probs))
    raw_conf    = probs[best_idx]

    # ── Macro confidence overlay ──────────────────────────────────────────────
    mc          = macro_ctx or {}
    macro_mult  = float(mc.get('mult', 1.0))
    macro_label = mc.get('label', 'UNKNOWN')
    adj_conf    = min(raw_conf, raw_conf * macro_mult)

    # ── Last-bar feature values ───────────────────────────────────────────────
    last = n_bars - 1
    return {
        'regime':      STATE_NAMES[best_idx],
        'p_bull':      probs[0],
        'p_bear':      probs[1],
        'p_range':     probs[2],
        'p_chop':      probs[3],
        'conf':        adj_conf,
        'raw_conf':    raw_conf,
        'trend_z':     round(_rolling_z(trend, last, 200), 3),
        'vol_z':       round(_rolling_z(atr,   last, 200), 3),
        'adx_z':       round(_rolling_z(adx,   last, 200), 3),
        'session':     sess,
        'macro_mult':  macro_mult,
        'macro_label': macro_label,
        'is_learned':  is_learned,
    }


# ── Stateful engine with run_length tracking ──────────────────────────────────

class RegimeEngine:
    """
    Wraps compute_hmm_v2() and tracks consecutive-bar run_length.
    Resets to 1 on a regime change.
    """

    def __init__(self):
        self._last_regime: Optional[str] = None
        self._run_length:  int            = 0

    def update(
        self,
        bars:           list[dict],
        trained_params: Optional[dict] = None,
        macro_ctx:      Optional[dict] = None,
    ) -> Optional[RegimeSnapshot]:
        result = compute_hmm_v2(bars, trained_params, macro_ctx)
        if result is None:
            return None

        regime = result['regime']
        if regime == self._last_regime:
            self._run_length += 1
        else:
            self._last_regime = regime
            self._run_length  = 1

        return RegimeSnapshot(
            regime      = regime,
            conf        = result['conf'],
            raw_conf    = result['raw_conf'],
            p_bull      = result['p_bull'],
            p_bear      = result['p_bear'],
            p_range     = result['p_range'],
            p_chop      = result['p_chop'],
            trend_z     = result['trend_z'],
            vol_z       = result['vol_z'],
            adx_z       = result['adx_z'],
            run_length  = self._run_length,
            session     = result['session'],
            macro_mult  = result['macro_mult'],
            macro_label = result['macro_label'],
            is_learned  = result['is_learned'],
        )
