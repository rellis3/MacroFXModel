#!/usr/bin/env python3
"""motif_spread_budget.py — how much spread each pair can AFFORD.

Replaces the single max_spread_pips=2.0 cut-off in pylego/motif_policy.py
(2026-09-19). That number treated a pair earning +0.30R gross per trade the
same as one earning +0.08R, when the first can pay four pips and the second
cannot pay one. The strategy's cost is linear in spread -- a fixed 20-pip
stop makes every pip of spread exactly 1/20 R -- so every pair has a
BREAKEVEN spread and a BUDGET:

    breakeven_pips = sl_pips * gross_avg_r
    budget_pips    = sl_pips * (gross_avg_r - min_net_r)

`gross_avg_r` is the pair's mean R per trade with the backtest's modelled
spread added back (pair_cost_r), over the CURRENT best-config population
(2-touch motifs only). Per-pair means on ~400 trades are noisy (SE ~0.05R,
i.e. ~1 pip of budget), so where an older export covering earlier years is
given, the two periods are pooled by trade count. Budgets are floored at 0
and capped at MAX_BUDGET_PIPS: beyond ~15% of risk in spread, fill-time
spikes dominate whatever the average says.

Writes pylego/motif_spread_budget.json -- the policy loads it; the gate
becomes `spread_used <= budget[pair]` where spread_used is the live-measured
entry-hours average (pylego.spread_stats) when trusted, else the static
RETAIL_SPREAD_PIPS estimate. Gold has no RETAIL_SPREAD_PIPS entry and stays
ungated on spread (its cost is ~1-2% of risk).

Usage:
  python AnalogML/motif_spread_budget.py                       # current export only
  python AnalogML/motif_spread_budget.py --also <old_export>   # pool an earlier-years export
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
from pylego.motif_policy import BEST_CONFIG, RETAIL_SPREAD_PIPS  # noqa: E402

DEFAULT_EXPORT = REPO_ROOT / "AnalogML" / "data" / "motif_alert_backtest.json"
OUT = REPO_ROOT / "pylego" / "motif_spread_budget.json"
MIN_NET_R = 0.05
MAX_BUDGET_PIPS = 3.0
MIN_TRADES = 50


def _population(export: dict) -> dict[str, list[float]]:
    """pair -> gross R per trade for the best-config population (touch filter
    only -- spread is what this script is about, so it is NOT applied)."""
    skip = BEST_CONFIG.get("skip_n_touches")
    cost = export.get("pair_cost_r", {})
    out: dict[str, list[float]] = {}
    for t in export["trades"]:
        if skip is not None and t.get("n_touches") == skip:
            continue
        out.setdefault(t["pair"], []).append(float(t["r"]) + float(cost.get(t["pair"], 0.0)))
    return out


def build(exports: list[dict], sl_pips: float) -> dict:
    pools: dict[str, list[float]] = {}
    spans = []
    for ex in exports:
        for p, rs in _population(ex).items():
            pools.setdefault(p, []).extend(rs)
        ds = [t["date"] for t in ex["trades"]]
        spans.append(f"{min(ds)}..{max(ds)}")
    pairs = {}
    for p, rs in sorted(pools.items()):
        if len(rs) < MIN_TRADES:
            continue
        g = statistics.mean(rs)
        se = statistics.pstdev(rs) / (len(rs) ** 0.5)
        be = sl_pips * g
        budget = max(0.0, min(MAX_BUDGET_PIPS, sl_pips * (g - MIN_NET_R)))
        pairs[p] = {"n": len(rs), "gross_avg_r": round(g, 4), "se_r": round(se, 4),
                    "breakeven_pips": round(be, 2), "budget_pips": round(budget, 2),
                    "table_pips": RETAIL_SPREAD_PIPS.get(p)}
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "sl_pips": sl_pips,
            "min_net_r": MIN_NET_R, "max_budget_pips": MAX_BUDGET_PIPS, "spans": spans,
            "population": f"best-config touch filter (skip_n_touches={BEST_CONFIG.get('skip_n_touches')}), spread NOT applied",
            "pairs": pairs}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", default=str(DEFAULT_EXPORT))
    ap.add_argument("--also", action="append", default=[], help="additional export(s) to pool, e.g. an earlier-years run")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    exports = [json.load(open(a.export, encoding="utf-8"))] + [json.load(open(f, encoding="utf-8")) for f in a.also]
    sl = float(exports[0]["params"]["sl_pips"])
    doc = build(exports, sl)
    Path(a.out).write_text(json.dumps(doc, indent=1), encoding="utf-8")
    print(f"[budget] {len(doc['pairs'])} pairs from {doc['spans']} -> {a.out}")
    print(f"{'pair':8}{'n':>6}{'grossR':>8}{'±se':>6}{'breakeven':>10}{'budget':>8}{'table':>7}  {'table<=budget'}")
    for p, r in sorted(doc["pairs"].items(), key=lambda kv: -kv[1]["gross_avg_r"]):
        tbl = r["table_pips"]
        ok = "" if tbl is None else ("yes" if tbl <= r["budget_pips"] else "NO")
        print(f"{p:8}{r['n']:6}{r['gross_avg_r']:8.3f}{r['se_r']:6.3f}{r['breakeven_pips']:10.1f}{r['budget_pips']:8.1f}{(tbl if tbl is not None else float('nan')):7.1f}  {ok}")


if __name__ == "__main__":
    main()
