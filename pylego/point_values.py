"""point_values — approximate cash value per pip per lot (sizing input).

Python-owned brick (NOT generated from the JS registry). Unlike pip SIZE — which
is instrument identity and lives in the shared JS-sourced `instruments` brick —
pip VALUE depends on the account currency and the broker's contract size, so it
is an *approximation* used for position sizing, and it belongs in the Python
execution baseplate rather than the canonical price registry.

This consolidates the `_PIP_VALUES` dict copied into bot/regime_bot.py,
RegimeV2, V7 and DynAnchorBot. The canonical set here is the regime_bot ==
RegimeV2 table (verified identical). ⚠ DynAnchorBot's values DIFFER for some
crosses (EUR/JPY 9.0 vs 6.5, EUR/GBP 13.0 vs 12.5) — unifying the live bots onto
this set is a *sizing* change and must go behind a risk review, so only the
non-live regime_bot adopts it for now (see PYTHON_LEGO.md §3).

    from pylego.point_values import point_value, point_values_for
    point_value("EUR/USD")               # 10.0   (any alias resolves: eurusd, EUR_USD)
    point_value("EUR/AUD", default=10.0) # 10.0   (unknown → default, matching the bots' .get(pair, 10.0))
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pylego.instruments import resolve_key

_JSON_PATH = Path(__file__).with_name("point_values.json")

DEFAULT_POINT_VALUE = 10.0


@lru_cache(maxsize=1)
def _data() -> dict[str, Any]:
    with _JSON_PATH.open("r", encoding="utf-8") as fh:
        d = json.load(fh)
    if "values" not in d:
        raise ValueError(f"point_values.json malformed at {_JSON_PATH}")
    return d


def point_value(symbol: str, default: float | None = None) -> float:
    """Cash value per pip per lot for any known alias.

    Resolves the symbol to its canonical key, then looks up the value. If the
    instrument has no listed point value, returns `default` when given, else
    raises (fail loud) — mirrors `instruments.pip_size` philosophy while still
    letting callers reproduce the bots' `.get(pair, 10.0)` fallback explicitly.
    """
    key = resolve_key(symbol)
    values = _data()["values"]
    if key is not None and key in values:
        return float(values[key])
    if default is not None:
        return float(default)
    raise KeyError(f"point_values: no point value for {symbol!r}")


def point_values_for(symbols, default: float = DEFAULT_POINT_VALUE) -> dict[str, float]:
    """{symbol: point_value} keyed by the symbol AS PASSED IN, with `default`
    for unlisted instruments. Lets a bot replace an inline `_PIP_VALUES` literal
    with one call while keeping its existing display-form keys and 10.0 default."""
    return {s: point_value(s, default=default) for s in symbols}
