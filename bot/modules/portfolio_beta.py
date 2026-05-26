"""
Portfolio Beta Aggregator — Part 4 of the beta-focused stochastic control system.

Sums factor beta across all open MacroFX positions weighted by direction and lot
size, producing total book exposure to each macro risk factor.

Runs every price tick (fast path). KV push is throttled to every 30s in main.py.
"""

import json
import logging
import time
import urllib.request

log = logging.getLogger(__name__)

MAGIC = 20260001

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False


def compute_portfolio_beta(beta_estimates: dict, paper_mode: bool = False) -> dict:
    """
    Aggregate factor beta across all open MacroFX positions.

    Args:
        beta_estimates: output from BetaEstimator.estimate() — keyed by MT5 symbol
        paper_mode:     if True, returns empty (no MT5 access)

    Returns:
        {'beta_dxy': float, 'beta_rates': float, 'beta_vix': float,
         'position_count': int, 'timestamp': int}
    """
    if paper_mode or not HAS_MT5:
        return {}

    try:
        positions = mt5.positions_get() or []
    except Exception as exc:
        log.warning(f'PortfolioBeta: positions_get() failed: {exc}')
        return {}

    b_dxy = b_rates = b_vix = 0.0
    count = 0

    for pos in positions:
        if pos.magic != MAGIC:
            continue

        betas = beta_estimates.get(pos.symbol)
        if not betas:
            continue

        direction = 1.0 if pos.type == mt5.ORDER_TYPE_BUY else -1.0
        lots = float(pos.volume)

        b_dxy   += direction * lots * betas.get('beta_dxy',   {}).get('mean', 0.0)
        b_rates += direction * lots * betas.get('beta_rates', {}).get('mean', 0.0)
        b_vix   += direction * lots * betas.get('beta_vix',   {}).get('mean', 0.0)
        count   += 1

    return {
        'beta_dxy':       round(b_dxy,   4),
        'beta_rates':     round(b_rates, 4),
        'beta_vix':       round(b_vix,   4),
        'position_count': count,
        'timestamp':      int(time.time() * 1000),
    }


def push_portfolio_beta(portfolio_beta: dict, base_url: str, timeout: int = 5) -> bool:
    """Push portfolio beta snapshot to KV."""
    if not portfolio_beta:
        return True
    try:
        payload = json.dumps({
            'key':       'portfolio_beta',
            'data':      portfolio_beta,
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
        log.debug(f'PortfolioBeta: KV push failed: {exc}')
        return False
