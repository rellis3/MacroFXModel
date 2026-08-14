"""json_safe — sanitizes NaN/Infinity out of a dict/list tree before
`json.dump`.

Python's `json` module writes `NaN`/`Infinity`/`-Infinity` as bare (non-
standard, non-JSON-spec) tokens by default — it never raises, so a dict
containing them serializes "successfully" and only fails downstream, in the
browser's spec-strict `JSON.parse`. Caught 2026-08-13 when
`motif_backtest_export.py`'s output silently broke `touches-backtest.html`:
one pair (audchf, local data ends 2020-07, before the 2023 IS/OOS cutoff)
had zero OOS trades, and `pylego.trade_stats.summarize_r`'s n=0 case
correctly returns NaN for win_rate/profit_factor/avg_r (nothing to divide) —
correct Python, invalid JSON. The same latent bug exists in
`backtest_export.py` (profit_factor is also +inf whenever a subset has wins
and zero losses); it just hadn't hit a subset small enough to trigger it.

`json_safe` maps NaN and +-Infinity to `None` (JSON `null`) recursively,
matching the existing frontend convention (`v==null` already renders as the
'—' placeholder in every AnalogML/vol/regime backtest page) — a strictly
data-preserving change everywhere else in the tree."""
from __future__ import annotations

import math
from typing import Any


def json_safe(obj: Any) -> Any:
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    return obj
