"""LOCKBOX AND DATA-BOUNDARY HYGIENE (ROE section 8, 8.4, 8.6).

The scanner may OBSERVE up to today. It must not use outputs of the frozen layers 3/5/6 (HAR-800 sigma, R3 remaining
travel, M2 confidence) or the shadow screens as inputs (8.4), and must not compute any outcome / forward return /
performance statistic. This module is the enforcement: run_scan() refuses to run if a watch item or an input series
refers to a forbidden token, and the tests fail if one is added.
"""
from __future__ import annotations

import json
import re

OUTCOME_TOKENS = ("fwd_", "forward_return", "forward_ret", "sharpe", "pnl", "win_rate", "hit_rate_oos", "performance_stat")


class LockboxViolation(Exception):
    pass


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9_\-]", "", str(s).lower())


def _hits(text: str, tokens) -> list:
    t = text.lower()
    out = []
    for tok in tokens:
        if re.search(r"(?<![a-z0-9])" + re.escape(tok) + r"(?![a-z0-9])", t):
            out.append(tok)
    return out


def item_text(entry: dict) -> str:
    """Only the fields that name inputs or sources (not prose such as `definition`)."""
    keep = {k: v for k, v in entry.items() if k not in ("definition", "labels", "note", "rule")}
    return json.dumps(keep, sort_keys=True)


def check_config(cfg: dict) -> list:
    toks = cfg["lockbox"]["forbiddenInputTokens"]
    bad = []
    for e in cfg["items"]:
        h = _hits(item_text(e), toks)
        if h:
            bad.append((e["id"], h))
    return bad


def check_inputs(series_ids_and_sources, cfg: dict) -> list:
    toks = cfg["lockbox"]["forbiddenInputTokens"]
    return [(sid, _hits(f"{sid} {src}", toks)) for sid, src in series_ids_and_sources if _hits(f"{sid} {src}", toks)]


def enforce(cfg: dict, inputs) -> None:
    bad = check_config(cfg) + check_inputs([(k, s.source) for k, s in inputs.series.items()] + [(s.id, "") for s in inputs.series.values()], cfg)
    if bad:
        raise LockboxViolation(f"watch items / inputs reference frozen-layer or shadow-screen outputs: {bad}")
