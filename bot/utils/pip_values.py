"""pip_values — live per-pip-per-lot valuation (ONE copy, no second table).

The $/pip/lot used for position sizing. The old static `_PIP_VALUES` dicts in
`sl_tp_engine.py` and `hedge_bot.py` drifted from reality as rates moved (e.g.
USD/JPY pinned at $9.0/pip while the true value at 155 is ~$6.45 — JPY sizing
ran ~40% oversized). This module is the single source both import; the static
table survives only as the LAST-RESORT fallback, and using it is logged.

Resolution order (best → worst):
  1. **MT5 tick value** — `symbol_info(sym).trade_tick_value`, scaled from
     per-tick to per-pip via `pip / trade_tick_size`. The broker's own number:
     exact for the account currency and contract size.
  2. **Computed from the current quote** (USD account assumed):
       quote ccy == USD  →  pip × contract          (EUR/USD → 0.0001×100k = $10)
       base  ccy == USD  →  pip / rate × contract   (USD/JPY @155 → ~$6.45)
     Crosses (EUR/GBP, GBP/JPY, …) need a second conversion rate, so they fall
     through to the static table rather than guess.
  3. **Static table** — approximate, stale by construction; WARNS once per pair.

Standalone on purpose: no imports from the rest of `utils`, so it can be loaded
as `utils.pip_values` (bot/ scripts), `bot.utils.pip_values` (backtestSystem)
or relatively (`from .pip_values import …`) without a package cycle.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

try:
    import MetaTrader5 as _mt5
    _HAS_MT5 = True
except ImportError:
    _mt5 = None
    _HAS_MT5 = False

# Contract size (units of base per 1.0 lot) for the quote-computed path.
# FX = 100k; gold = 100 oz. Indices are broker-specific → MT5 or static only.
_FX_CONTRACT = 100_000.0
_CONTRACT_SIZES = {'XAU/USD': 100.0}

# LAST-RESORT static table (union of the former sl_tp_engine + hedge_bot
# copies — values were identical where both listed a pair). Approximate cash
# value per pip per 1 standard lot in USD; only used when neither MT5 nor a
# live quote is available, with a warning.
STATIC_PIP_VALUES: dict[str, float] = {
    'EUR/USD': 10.0,  'GBP/USD': 10.0,  'AUD/USD': 10.0,  'NZD/USD': 10.0,
    'USD/JPY': 9.0,   'USD/CAD': 7.5,   'USD/CHF': 10.5,
    'GBP/JPY': 9.0,   'EUR/JPY': 6.5,   'AUD/JPY': 6.5,
    'EUR/GBP': 12.5,  'EUR/CHF': 11.0,  'EUR/AUD': 6.5,
    'EUR/NZD': 5.8,   'EUR/CAD': 7.5,
    'GBP/CHF': 11.0,  'GBP/AUD': 6.5,   'GBP/NZD': 5.8,   'GBP/CAD': 7.5,
    'AUD/NZD': 6.5,   'AUD/CAD': 7.5,   'AUD/CHF': 11.0,
    'NZD/JPY': 6.5,   'CAD/JPY': 6.5,   'CHF/JPY': 6.5,
    'XAU/USD': 100.0, 'GOLD': 100.0,
    'NAS100_USD': 1.0, 'NAS100': 1.0, 'US100': 1.0,
}
DEFAULT_PIP_VALUE = 10.0

_warned_static: set[str] = set()     # warn once per pair, not per tick


def _normalize(pair: str) -> str:
    """'EURUSD' / 'EUR_USD' → 'EUR/USD'; leaves 'NAS100_USD' etc. alone."""
    p = (pair or '').upper()
    if '/' in p:
        return p
    q = p.replace('_', '/')
    a, _, b = q.partition('/')
    if len(a) == 3 and len(b) == 3:
        return q                              # 'EUR_USD' → 'EUR/USD'
    if '/' not in q and len(p) == 6 and p.isalpha():
        return f'{p[:3]}/{p[3:]}'             # 'EURUSD' → 'EUR/USD'
    return p                                  # 'NAS100_USD', 'US100' stay as-is


def _mt5_pip_value(mt5_symbol: str, pip: float) -> float | None:
    """Broker tick value scaled to per-pip per-lot, or None if unavailable.
    trade_tick_value is $/tick/lot; a pip is (pip / trade_tick_size) ticks."""
    if not _HAS_MT5:
        return None
    try:
        info = _mt5.symbol_info(mt5_symbol)
    except Exception:
        return None
    if not info:
        return None
    tick_value = getattr(info, 'trade_tick_value', 0.0) or 0.0
    tick_size = getattr(info, 'trade_tick_size', 0.0) or 0.0
    if tick_value <= 0 or tick_size <= 0 or pip <= 0:
        return None
    return tick_value * (pip / tick_size)


def _quote_pip_value(pair_slash: str, pip: float, price: float | None) -> float | None:
    """Compute $/pip/lot from the pair's own current rate (USD account).
    Only USD-quote and USD-base pairs — crosses would need a second rate."""
    parts = pair_slash.split('/')
    if len(parts) != 2:
        return None
    base, quote = parts
    contract = _CONTRACT_SIZES.get(pair_slash, _FX_CONTRACT)
    if quote == 'USD' and len(base) == 3:
        return pip * contract                       # rate-independent
    if base == 'USD' and len(quote) == 3 and price and price > 0:
        return pip / price * contract               # e.g. USD/JPY @155 → 6.45
    return None


def pip_value_per_lot(pair: str, pip: float, price: float | None = None,
                      mt5_symbol: str | None = None) -> float:
    """Cash value per pip per 1.0 lot for `pair` (USD account).

    pair        — any form ('EUR/USD', 'EURUSD', 'USD_JPY').
    pip         — the pair's pip SIZE in price units (caller resolves it).
    price       — current rate of the pair itself, if the caller has one
                  (needed only for USD-base pairs like USD/JPY).
    mt5_symbol  — broker symbol for the MT5 lookup (default: pair without '/').

    Order: MT5 tick value → quote-computed (USD-quote/USD-base) → static table
    (warns once per pair — static values go stale as rates move).
    """
    pair_slash = _normalize(pair)

    pv = _mt5_pip_value(mt5_symbol or pair_slash.replace('/', ''), pip)
    if pv is not None and pv > 0:
        return pv

    pv = _quote_pip_value(pair_slash, pip, price)
    if pv is not None and pv > 0:
        return pv

    static = STATIC_PIP_VALUES.get(pair_slash, DEFAULT_PIP_VALUE)
    if pair_slash not in _warned_static:
        _warned_static.add(pair_slash)
        log.warning(
            f'pip_value_per_lot({pair_slash}): no MT5 tick value and no usable quote — '
            f'falling back to STATIC ${static}/pip/lot (approximate; goes stale as rates move)'
        )
    return static
