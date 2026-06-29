"""instruments — the Python reader for the canonical instrument table.

ONE source of truth for pip size / price digits / asset class / venue symbols,
shared with the dashboard. The data lives in `instruments.json`, which is
GENERATED from `js/instrumentRegistry.js` by `scripts/gen_instruments_json.mjs`
— never hand-edit the JSON, and never re-inline a pip table in a bot. A single
wrong pip (0.0001 vs 0.001) silently scales PnL by 10×, so this is the
highest-leverage brick in the tree.

This module mirrors the JS accessor API (`pip_size`, `price_digits`,
`asset_class`, `mt5_symbol`, `resolve_key`, `instrument`) and, like the JS side,
FAILS LOUD on an unknown symbol rather than defaulting a pip.

    from pylego.instruments import pip_size, resolve_key, instrument
    pip_size("EUR/USD")   # 0.0001   (any known alias resolves: EUR_USD, EURUSD, eurusd)
    pip_size("USD/JPY")   # 0.01
    instrument("XAUUSD")  # {'key': 'gold', 'display': 'XAU/USD', 'pip': 1.0, ...}

Note on broker symbols: the `mt5` field here is the registry's *reference*
symbol. Some brokers use different names (DAX vs GER40); a bot keeps its own
small broker-override map and only falls back to `mt5_symbol()` — instrument
identity is shared, broker routing is local config (see PYTHON_LEGO.md §3).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_JSON_PATH = Path(__file__).with_name("instruments.json")


@lru_cache(maxsize=1)
def _data() -> dict[str, Any]:
    with _JSON_PATH.open("r", encoding="utf-8") as fh:
        d = json.load(fh)
    if "instruments" not in d or "aliases" not in d:
        raise ValueError(f"instruments.json malformed at {_JSON_PATH}")
    return d


def instrument_keys() -> list[str]:
    """All canonical keys (lowercase codes), e.g. ['eurusd', 'usdjpy', 'gold', ...]."""
    return list(_data()["instruments"].keys())


def resolve_key(symbol: str | None) -> str | None:
    """Resolve any known alias (case-insensitive) to its canonical key, or None.

    Bit-identical to the JS registry's resolveKey().
    """
    if not symbol:
        return None
    return _data()["aliases"].get(str(symbol).lower())


def instrument(symbol: str) -> dict[str, Any]:
    """Full canonical record for any alias. Raises on unknown — fail loud, never
    silently default a pip size (matches the JS instrument())."""
    key = resolve_key(symbol)
    if key is None:
        raise KeyError(f"instruments: unknown instrument {symbol!r}")
    return {"key": key, **_data()["instruments"][key]}


def pip_size(symbol: str) -> float:
    return instrument(symbol)["pip"]


def price_digits(symbol: str) -> int:
    return instrument(symbol)["digits"]


def asset_class(symbol: str) -> str:
    return instrument(symbol)["assetClass"]


def oanda_symbol(symbol: str) -> str:
    return instrument(symbol)["oanda"]


def yahoo_symbol(symbol: str) -> str:
    return instrument(symbol)["yahoo"]


def mt5_symbol(symbol: str) -> str:
    """Reference/default MT5 symbol. A bot may override per-broker (see module docstring)."""
    return instrument(symbol)["mt5"]


def pip_sizes_for(symbols) -> dict[str, float]:
    """Convenience: {symbol: pip} for a list of symbols, KEYED BY THE SYMBOL AS
    PASSED IN (e.g. display form 'EUR/USD'). Lets a bot replace an inline
    `_PIP_SIZES` literal with one call while keeping its existing keys."""
    return {s: pip_size(s) for s in symbols}
