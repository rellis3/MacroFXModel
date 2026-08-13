#!/usr/bin/env python3
"""pattern_lab_validate.py — honest cost + calendar IS/OOS validation for
js/patternEngine.js's already-built shape detections (flags, pennants, head
& shoulders, double/triple tops/bottoms, triangles/channels/wedges).

That JS engine (see `pattern-lab.html`, `server.js`'s `/api/pattern-lab/*`
routes) already does real detection + per-instance MFE/MAE tracking + a
confidence score + per-type aggregate stats -- confirmed by direct audit,
2026-08-12. What it does NOT do, also confirmed by direct search: apply any
trading cost (zero spread/commission anywhere), or split by a real calendar
in-sample/out-of-sample boundary (`aggregateStats` pools the ENTIRE
available history in one go). This script is the missing honest-harness
layer, applied to instances the JS engine already detected -- NOT a
redetection. Same discipline every other AnalogML check uses: real costs
(`pylego.costs.default_spread`), a real calendar split, reported plainly
whether the result is green or red.

Data flow: `AnalogML/scripts/export_pattern_lab.mjs <pair>` calls
js/patternEngine.js's `runPatternScan` directly (no server needed) and dumps
every detected instance (type, direction, confirm time, entry/target/stop,
realized outcome/MFE/MAE/forwardReturnPct) to
`AnalogML/data/pattern_lab_export/<pair>.json`. This script reads that,
converts each instance's pct return into an R-multiple (risk = |entry-stop|,
matching pylego.barrier_race's cost convention: cost is subtracted as
cost_price/risk_price, not a flat pct), and reports hit-rate/PF/avg-R per
shape type, split IS (pre-2023) vs OOS (2023+), cost-on vs cost-off.

Usage:
  node AnalogML/scripts/export_pattern_lab.mjs gbpjpy   # run this first
  python AnalogML/pattern_lab_validate.py --pair gbpjpy
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

EXPORT_DIR = Path(__file__).resolve().parent / "data" / "pattern_lab_export"
IS_OOS_CUTOFF_EPOCH = 1672531200  # 2023-01-01T00:00:00Z, same convention as backtest_export.py


def load_instances(pair: str) -> list[dict]:
    path = EXPORT_DIR / f"{pair}.json"
    if not path.exists():
        raise SystemExit(f"no export for {pair!r} -- run: node AnalogML/scripts/export_pattern_lab.mjs {pair}")
    return json.loads(path.read_text())["instances"]


def instance_r(inst: dict, cost_price: float, cost_on: bool) -> float | None:
    """Converts one instance's forwardReturnPct into an R-multiple, matching
    pylego.barrier_race's cost convention (cost subtracted as cost_price /
    risk_price_distance, not a flat percentage) so this is directly
    comparable to every other AnalogML PF/avg-R number. None if the instance
    never confirmed (no outcome) or the entry/stop are degenerate."""
    o = inst.get("outcome")
    if not o or o.get("entry") is None or o.get("stop") is None:
        return None
    entry, stop = o["entry"], o["stop"]
    risk_price = abs(entry - stop)
    if risk_price <= 0:
        return None
    pnl_price = (o["forwardReturnPct"] / 100.0) * entry
    r = pnl_price / risk_price
    if cost_on:
        r -= cost_price / risk_price
    return r


def run(pair: str) -> None:
    instances = load_instances(pair)
    cost_price = default_spread(pair)
    print(f"[data] {pair}: {len(instances)} total instances (all shape types pooled)")
    print(f"[cost] default_spread({pair}) = {cost_price} (price units)")

    by_type: dict[str, list[dict]] = {}
    for inst in instances:
        by_type.setdefault(inst["type"], []).append(inst)

    rows = []
    for shape_type, insts in sorted(by_type.items()):
        is_insts = [i for i in insts if i["confirmTime"] < IS_OOS_CUTOFF_EPOCH]
        oos_insts = [i for i in insts if i["confirmTime"] >= IS_OOS_CUTOFF_EPOCH]

        def _stats(subset, cost_on):
            rs = [r for i in subset if (r := instance_r(i, cost_price, cost_on)) is not None]
            if not rs:
                return None
            return summarize_r(rs)

        rows.append({
            "type": shape_type, "n_total": len(insts),
            "n_is": len(is_insts), "n_oos": len(oos_insts),
            "is_cost_on": _stats(is_insts, True), "oos_cost_on": _stats(oos_insts, True),
            "oos_cost_off": _stats(oos_insts, False),
        })

    print(f"\n{'type':<24} {'n_is':>6} {'IS PF':>7} {'IS avgR':>8}   "
          f"{'n_oos':>6} {'OOS PF':>7} {'OOS avgR':>9}  {'OOS PF(no cost)':>16}")
    for r in rows:
        is_s, oos_s, oos_nc = r["is_cost_on"], r["oos_cost_on"], r["oos_cost_off"]
        is_pf = f"{is_s['profit_factor']:.2f}" if is_s else "—"
        is_ar = f"{is_s['avg_r']:.3f}" if is_s else "—"
        oos_pf = f"{oos_s['profit_factor']:.2f}" if oos_s else "—"
        oos_ar = f"{oos_s['avg_r']:.3f}" if oos_s else "—"
        oos_pf_nc = f"{oos_nc['profit_factor']:.2f}" if oos_nc else "—"
        print(f"{r['type']:<24} {r['n_is']:>6} {is_pf:>7} {is_ar:>8}   "
              f"{r['n_oos']:>6} {oos_pf:>7} {oos_ar:>9}  {oos_pf_nc:>16}")

    # Overall pooled (all types together) -- the headline honest number.
    all_r_is = [r for i in instances if i["confirmTime"] < IS_OOS_CUTOFF_EPOCH
               and (r := instance_r(i, cost_price, True)) is not None]
    all_r_oos = [r for i in instances if i["confirmTime"] >= IS_OOS_CUTOFF_EPOCH
                and (r := instance_r(i, cost_price, True)) is not None]
    all_r_oos_nc = [r for i in instances if i["confirmTime"] >= IS_OOS_CUTOFF_EPOCH
                    and (r := instance_r(i, cost_price, False)) is not None]
    s_is, s_oos, s_oos_nc = summarize_r(all_r_is), summarize_r(all_r_oos), summarize_r(all_r_oos_nc)
    print(f"\n[overall, all shape types pooled] "
          f"IS n={s_is['n']} PF={s_is['profit_factor']:.2f} avgR={s_is['avg_r']:.3f}  |  "
          f"OOS n={s_oos['n']} PF={s_oos['profit_factor']:.2f} avgR={s_oos['avg_r']:.3f}  |  "
          f"OOS(no cost) PF={s_oos_nc['profit_factor']:.2f}")
    print("\n[caveat] fixed 0.5R stop/measured-move target for every shape type (patternEngine.js's own "
          "convention, not adaptive per-cluster) -- Phase 1 of this idea is deferred the same way it was "
          "for the touches motif, until a type here proves it has real signal to size risk around. "
          "One pair, one timeframe (1h) -- not yet a broad universe check.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pair", required=True)
    run(p.parse_args().pair)


if __name__ == "__main__":
    main()
