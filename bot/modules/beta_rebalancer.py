"""
Beta Rebalancer — Part 6 of the beta-focused stochastic control system.

Given the current beta deviation and Kalman uncertainty, decides whether the
deviation is large enough to warrant rebalancing. This is the actual control
output — the "inaction band" from stochastic control theory.

The inaction band widens when beta is poorly identified (high Kalman variance),
reflecting that uncertainty about the true beta makes aggressive rebalancing
costly in expectation.

Output is a sizing *suggestion*, not a forced trade. It feeds into the position
manager as an advisory signal, logged and pushed to KV for dashboard display.
"""

import json
import logging
import time
import urllib.request

log = logging.getLogger(__name__)

# ── Band parameters ───────────────────────────────────────────────────────────
BASE_BAND        = 0.20   # minimum deviation needed to trigger rebalancing
UNCERTAINTY_SCALE = 2.0   # widen band by this × Kalman variance

# ── Urgency thresholds ────────────────────────────────────────────────────────
_URGENCY_HIGH   = 2.0     # deviation/band ratio → HIGH urgency
_URGENCY_MEDIUM = 1.4     # deviation/band ratio → MEDIUM urgency

# ── Pair affinity — which pairs move each factor exposure ─────────────────────
# Long EURUSD = negative DXY beta; long USDJPY = positive rates beta; etc.
FACTOR_AFFINITY = {
    'beta_dxy': {
        'reduce_positive': ['USDJPY', 'USDCAD', 'USDCHF'],   # sell USD pairs to cut DXY beta
        'reduce_negative': ['EURUSD', 'GBPUSD', 'AUDUSD'],   # sell EUR/GBP/AUD pairs
    },
    'beta_rates': {
        'reduce_positive': ['EURUSD', 'AUDUSD'],
        'reduce_negative': ['USDJPY', 'USDCAD'],
    },
    'beta_vix': {
        'reduce_positive': ['AUDUSD', 'GBPUSD'],
        'reduce_negative': ['USDCHF', 'USDJPY'],
    },
}


def _urgency(dev: float, band: float) -> str:
    ratio = abs(dev) / band if band > 1e-6 else 0.0
    if ratio >= _URGENCY_HIGH:
        return 'HIGH'
    if ratio >= _URGENCY_MEDIUM:
        return 'MEDIUM'
    return 'LOW'


def evaluate_rebalancing(
    deviation: dict,
    beta_estimates: dict,
    open_symbols: list[str] | None = None,
) -> dict:
    """
    Determine whether the current beta deviation warrants rebalancing.

    Args:
        deviation:      output from compute_beta_deviation()
        beta_estimates: output from BetaEstimator.estimate() (for Kalman variance)
        open_symbols:   MT5 symbols of currently open positions

    Returns:
        dict with rebalance_needed flag and action details
    """
    if not deviation or not deviation.get('deviations'):
        return {'rebalance_needed': False}

    open_syms = set(open_symbols or [])
    signals: list[dict] = []
    ts = int(time.time() * 1000)

    for factor, d in deviation['deviations'].items():
        dev = float(d['deviation'])
        if d['status'] == 'ON_TARGET':
            continue

        # Average Kalman variance over open positions for this factor
        variances = [
            beta_estimates[sym][factor]['variance']
            for sym in open_syms
            if sym in beta_estimates and factor in beta_estimates[sym]
        ]
        avg_var = sum(variances) / len(variances) if variances else 0.05

        band = BASE_BAND + UNCERTAINTY_SCALE * avg_var
        if abs(dev) <= band:
            continue   # within inaction band — no action needed

        urg = _urgency(dev, band)
        affinity = FACTOR_AFFINITY.get(factor, {})

        if dev > 0:
            action = f'REDUCE_{factor.upper()}_EXPOSURE'
            candidate_syms = affinity.get('reduce_positive', [])
        else:
            action = f'INCREASE_{factor.upper()}_EXPOSURE'
            candidate_syms = affinity.get('reduce_negative', [])

        # Prioritise pairs that are actually open
        relevant = [s for s in open_syms if s in candidate_syms]
        suggestions = relevant[:3] or candidate_syms[:2]

        signals.append({
            'factor':          factor,
            'deviation':       round(dev, 4),
            'target':          round(d['target'], 4),
            'current':         round(d['current'], 4),
            'band':            round(band, 4),
            'action':          action,
            'suggested_pairs': suggestions,
            'urgency':         urg,
            'kf_variance':     round(avg_var, 6),
        })

    if not signals:
        return {
            'rebalance_needed':  False,
            'regime':            deviation.get('regime'),
            'overall_alignment': deviation.get('overall_alignment'),
            'timestamp':         ts,
        }

    # Sort by urgency
    _order = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
    signals.sort(key=lambda s: _order.get(s['urgency'], 3))
    top = signals[0]

    return {
        'rebalance_needed':  True,
        'factor':            top['factor'],
        'deviation':         top['deviation'],
        'band':              top['band'],
        'action':            top['action'],
        'suggested_pairs':   top['suggested_pairs'],
        'urgency':           top['urgency'],
        'all_signals':       signals,
        'regime':            deviation.get('regime'),
        'overall_alignment': deviation.get('overall_alignment'),
        'timestamp':         ts,
    }


def push_rebalance_signal(signal: dict, base_url: str, timeout: int = 5) -> bool:
    """Push rebalancing signal to KV."""
    if not signal:
        return True
    try:
        payload = json.dumps({
            'key':       'beta_rebalance',
            'data':      signal,
            'timestamp': int(time.time() * 1000),
        }).encode()
        req = urllib.request.Request(
            f'{base_url.rstrip("/")}/api/kv/set',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=timeout):
            pass
        return True
    except Exception as exc:
        log.debug(f'BetaRebalancer: KV push failed: {exc}')
        return False
