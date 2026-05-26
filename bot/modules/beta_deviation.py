"""
Beta Deviation Tracker — Part 5 of the beta-focused stochastic control system.

Computes how far the current portfolio factor exposure is from the target
profile for the active macro regime. This is what the control system is trying
to minimise — the "error signal" in control theory terms.

Target profiles are initially set from the regime-conditional mean betas
documented in the design (Part 3 table). They can be overridden by writing
a 'beta_targets' key to KV.

Status labels:
  ON_TARGET:   |deviation| <= 0.15
  SLIGHT_OVER: 0.15 < |deviation| <= 0.30
  OVEREXPOSED: |deviation| > 0.30

Runs every 30s alongside portfolio beta in the fast path.
"""

import json
import logging
import time
import urllib.request

log = logging.getLogger(__name__)

# ── Target beta profiles per regime ──────────────────────────────────────────
# These are starting points based on historical regime-conditional means.
# In RANGE and CHOP, target is zero — no net factor exposure desired.
DEFAULT_TARGETS: dict = {
    'BULL':  {'beta_dxy': -0.65, 'beta_rates':  0.40, 'beta_vix': -0.20},
    'BEAR':  {'beta_dxy':  0.55, 'beta_rates': -0.35, 'beta_vix':  0.30},
    'RANGE': {'beta_dxy':  0.00, 'beta_rates':  0.00, 'beta_vix':  0.00},
    'CHOP':  {'beta_dxy':  0.00, 'beta_rates':  0.00, 'beta_vix':  0.00},
}

FACTORS = ('beta_dxy', 'beta_rates', 'beta_vix')

# Deviation status thresholds
_T_ON     = 0.15
_T_SLIGHT = 0.30


def _status(dev: float) -> str:
    a = abs(dev)
    if a <= _T_ON:
        return 'ON_TARGET'
    if a <= _T_SLIGHT:
        return 'SLIGHT_OVER'
    return 'OVEREXPOSED'


def _overall_alignment(deviations: dict) -> float:
    """Score 0–1: 1 = perfectly on target, 0 = fully misaligned."""
    if not deviations:
        return 1.0
    scores = [max(0.0, 1.0 - abs(d['deviation']) / 0.5)
              for d in deviations.values()]
    return round(sum(scores) / len(scores), 3)


def compute_beta_deviation(portfolio_beta: dict, regime: str,
                           targets: dict | None = None) -> dict:
    """
    Compute per-factor deviation between current portfolio beta and regime target.

    Args:
        portfolio_beta: output from compute_portfolio_beta()
        regime:         current macro regime label (BULL / BEAR / RANGE / CHOP)
        targets:        optional custom target map (falls back to DEFAULT_TARGETS)

    Returns:
        {regime, deviations: {factor: {current, target, deviation, status}},
         overall_alignment, timestamp}
    """
    if not portfolio_beta:
        return {}

    target_map = targets or DEFAULT_TARGETS
    # Normalise regime — unknown regimes treated as RANGE
    regime_key = regime.upper() if regime else 'RANGE'
    regime_targets = target_map.get(regime_key, target_map.get('RANGE', {}))

    deviations: dict = {}
    for factor in FACTORS:
        current = float(portfolio_beta.get(factor, 0.0))
        target  = float(regime_targets.get(factor, 0.0))
        dev     = round(current - target, 4)
        deviations[factor] = {
            'current':   round(current, 4),
            'target':    round(target,  4),
            'deviation': dev,
            'status':    _status(dev),
        }

    return {
        'regime':            regime_key,
        'deviations':        deviations,
        'overall_alignment': _overall_alignment(deviations),
        'timestamp':         int(time.time() * 1000),
    }


def push_beta_deviation(deviation: dict, base_url: str, timeout: int = 5) -> bool:
    """Push beta deviation snapshot to KV."""
    if not deviation:
        return True
    try:
        payload = json.dumps({
            'key':       'beta_deviation',
            'data':      deviation,
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
        log.debug(f'BetaDeviation: KV push failed: {exc}')
        return False


def fetch_beta_targets(base_url: str, timeout: int = 5) -> dict:
    """Fetch custom beta targets from KV. Returns DEFAULT_TARGETS on miss."""
    try:
        url = f'{base_url.rstrip("/")}/api/kv/get?key=beta_targets'
        with urllib.request.urlopen(url, timeout=timeout) as r:
            j = json.loads(r.read())
        if j.get('miss') or not j.get('data'):
            return DEFAULT_TARGETS
        return j['data']
    except Exception:
        return DEFAULT_TARGETS
