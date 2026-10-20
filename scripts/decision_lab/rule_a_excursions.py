"""Rule A trade excursions (MFE / MAE) on 1-minute bars: what exit the trades actually support. Exploratory.

    PYTHONPATH=. python scripts/decision_lab/rule_a_excursions.py [--block disc|conf]

Trades: rule A from the locked backtest record (backtest-data/line-backtest, tag lesson-track-L05), at its 0.2 sigma stop.
R = the distance from entry to that stop. For each trade, walking 1-minute bars from entry to 21:59 London:
  mfe_before_stop  best favourable excursion (R) before the stop is hit (or to the day's end if it never is)
  stopped_min      minute the stop is hit (None if never)
  mfe_min          minute of that best point;  mae_before_mfe  worst adverse excursion before it
  close_R          R at 21:59 if never stopped
Then, for targets k = 0.5..15R: share of trades reaching k before the stop, and the net R per trade of "target k, stop
-1R, else out at time T" for T in 12:00, 14:00, 16:00, 18:00, 22:00 (costs at 2x the spread table, as everywhere here).
--block disc (default) = sessions 2020-08..2023-12 only, where the exit is chosen; conf = 2024..2026-08, read once to check.
Output: backtest-data/decision-lab/excursions_<block>.json.
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np

from forge.iep_build import sessions

BLOCK = sys.argv[sys.argv.index("--block") + 1] if "--block" in sys.argv else "disc"
SRC = Path("backtest-data/line-backtest")
OUT = Path("backtest-data/decision-lab")
KS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15]
TIMES = {"12:00": 720, "14:00": 840, "16:00": 960, "18:00": 1080, "22:00": 1320}
RULE_A = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD", "NQ", "SPX500", "US30", "US2000"]
STOP = 0.2


def in_block(d):
    return d < "2024-01-01" if BLOCK == "disc" else d >= "2024-01-01"


def main():
    rows = []
    for sym in RULE_A:
        r = json.load(gzip.open(SRC / f"{sym}.json.gz", "rt"))
        days = {d["d"]: d for d in r["days"]}
        trades = {}
        for x in r["trades"]["A"]:
            if in_block(x["d"]):
                trades.setdefault(x["d"], []).append(x)
        if not trades:
            continue
        for d, m, o, h, l, c, *_ in sessions(sym):
            if d not in trades:
                continue
            e = np.searchsorted(m, 22 * 60)
            m, h, l, c = m[:e], h[:e], l[:e], c[:e]
            day = days[d]
            unit = day["o"] * day["sig"] / 100
            for x in trades[d]:
                i0 = int(np.searchsorted(m, x["em"]))
                if i0 >= len(m):
                    continue
                side, ep = x["side"], x["ep"]
                stop = day["L"][x["line"]] - side * STOP * unit
                risk = abs(ep - stop)
                if not risk > 0:
                    continue
                fav = (h[i0:] - ep) / risk if side > 0 else (ep - l[i0:]) / risk       # best favourable in each minute
                adv = (ep - l[i0:]) / risk if side > 0 else (h[i0:] - ep) / risk       # worst adverse in each minute
                hit = np.flatnonzero(adv >= 1.0)
                js = int(hit[0]) if len(hit) else len(adv)                              # stop wins ties: stop minute excluded from MFE
                run = np.maximum.accumulate(fav[:js]) if js > 0 else np.array([0.0])
                mfe = float(run[-1]) if js > 0 else 0.0
                jm = int(np.argmax(fav[:js])) if js > 0 else 0
                rows.append({"inst": sym, "d": d, "side": side, "line": x["line"], "em": x["em"],
                             "cost": 2 * r["spread"] / risk,
                             "mfe": round(mfe, 3), "mfe_min": int(m[i0 + jm]), "mae_before_mfe": round(float(adv[:jm + 1].max()) if js > 0 else 1.0, 3),
                             "stopped_min": int(m[i0 + js]) if js < len(adv) else None,
                             "close_R": round(float(side * (c[-1] - ep) / risk), 3),
                             # for time exits: R at each cutoff if neither stopped nor targeted earlier (filled below)
                             "path_idx": None,
                             "fav_run": run.tolist()[::5][:400], "mins": m[i0:i0 + js][::5].tolist()[:400],
                             "close_at": {t: (round(float(side * (c[min(len(c) - 1, int(np.searchsorted(m, tm)) - 1)] - ep) / risk), 3)
                                              if int(np.searchsorted(m, tm)) - 1 >= i0 else None) for t, tm in TIMES.items()}})
    n = len(rows)
    mfe = np.array([r_["mfe"] for r_ in rows])
    stopped = np.array([r_["stopped_min"] is not None for r_ in rows])
    reach = {str(k): round(float((mfe >= k).mean()), 4) for k in KS}
    grid = {}
    for k in KS:
        for t, tm in TIMES.items():
            vals = []
            for r_ in rows:
                # did it reach k before both the stop and the time cut?
                mins, fr = np.array(r_["mins"]), np.array(r_["fav_run"])
                reached = np.flatnonzero((fr >= k) & (mins < tm)) if len(mins) else []
                stop_t = r_["stopped_min"]
                if len(reached):
                    vals.append(k - r_["cost"])
                elif stop_t is not None and stop_t < tm:
                    vals.append(-1.0 - r_["cost"])
                else:
                    ca = r_["close_at"][t]
                    vals.append((ca if ca is not None else 0.0) - r_["cost"])
            grid[f"{k}|{t}"] = round(float(np.mean(vals)), 4)
    best = max(grid.items(), key=lambda kv: kv[1])
    mins_to_mfe = np.array([r_["mfe_min"] - r_["em"] for r_ in rows])
    out = {"block": BLOCK, "trades": n, "stopped_share": round(float(stopped.mean()), 4),
           "mfe_median": round(float(np.median(mfe)), 3), "mfe_quantiles": {q: round(float(np.quantile(mfe, q)), 3) for q in (0.5, 0.75, 0.9, 0.95)},
           "reach_before_stop": reach, "net_R_grid": grid, "best_cell": {"cell": best[0], "net_R": best[1]},
           "current_rule": grid.get("5|22:00"), "minutes_entry_to_mfe_median": float(np.median(mins_to_mfe)),
           "mfe_hour_share": {str(hh): round(float(np.mean([(r_["mfe_min"] // 60) == hh for r_ in rows])), 4) for hh in range(0, 22)},
           "mae_before_mfe_median": round(float(np.median([r_["mae_before_mfe"] for r_ in rows])), 3)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"excursions_{BLOCK}.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: v for k, v in out.items() if k not in ("net_R_grid", "mfe_hour_share")}, indent=1))
    print("net R per trade, target (rows) x time exit (cols), 2x costs:")
    print("      " + "  ".join(f"{t:>6}" for t in TIMES))
    for k in KS:
        print(f"{k:>5}R " + "  ".join(f"{grid[f'{k}|{t}']:+6.3f}" for t in TIMES))


if __name__ == "__main__":
    main()
