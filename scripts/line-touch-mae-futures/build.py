"""MAE / MFE at every touch of the vol forecast lines, on CME futures (NQ, 6E, GC).

EXPLORATORY, descriptive (register row line-touch-mae-futures). Owner question 2026-11-17, from Jordan's ask
"how do you set your SL/TP, share your MAE analysis (futures)". No outcome hypothesis, nothing scored.

Lines: the production OH / OL p50 / p75 / p90 rungs (% of open) for each London day, point-in-time, from the
day-reconstruction archive (analysis/output/day-reconstruction/archive/<NAME>_days.parquet), applied to the FUTURES
contract's own first bar at or after 00:00 London. NQ <- NQ, EURUSD <- 6E, GOLD <- GC.
Placebo: the same rungs scaled x0.85 and x1.15 (B2-style shifted ladder), so the line can be compared with an
arbitrary price at a similar distance.

Session: London 00:00 -> 22:00, weekdays (the window the widths were fitted on).
Data: analysis/output/nt8/continuous/<ROOT>_1m_unadj.parquet (unadjusted, real prices). NT8 bars are END-stamped
(faults-log 2026-11-07): stamps are moved back one minute so a bar is keyed by its start. Days with < 90% of a full
session's bars are skipped (GC/6E continuous files still have download holes, DATA_SPEC #24) and counted.

Touch n: the first bar whose high (up lines) / low (down lines) reaches the line while ARMED. After a touch the line
re-arms only once a later bar trades REARM_SIG x sigma back on the open side (low <= line - r for an up line).
So touch 2 = price came back to the line after pulling away at least 0.1 sigma.

Excursions from the line price (entry = the line, no spread, no slippage), over 30 / 60 / 240 minutes and to 22:00
(each truncated at 22:00):
  through = furthest move beyond the line in the touch direction, bars k..k+H (bar k's extreme is after the touch)
  back    = furthest move back through the line toward the open, bars k+1..k+H (bar k's other extreme may precede it)
Fade:     MFE = back,    MAE = through.      Continue: MFE = through, MAE = back.
Units: points (NQ index points, 6E price x 10,000 = pips, GC dollars), ticks, and sigma (open x sigma_used).

    python -I scripts/line-touch-mae-futures/build.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
ARC = ROOT / "analysis/output/day-reconstruction/archive"
FUT = ROOT / "analysis/output/nt8/continuous"
OUT = ROOT / "analysis/output/line-touch-mae-futures"

MAP = {"NQ": ("NQ", 1.0, 0.25, "pts"), "EURUSD": ("6E", 10_000.0, 0.5, "pips"), "GOLD": ("GC", 1.0, 0.10, "$")}
# name -> (futures root, multiplier to display unit, tick in display units, unit label)
RUNGS = ["p50", "p75", "p90"]
HORIZONS = [30, 60, 240, None]  # None = to 22:00 London
REARM_SIG = 0.10
SCALES = {"line": 1.0, "placebo_085": 0.85, "placebo_115": 1.15}
MIN_BAR_SHARE = 0.90


def load_futures(root: str) -> pd.DataFrame:
    f = pd.read_parquet(FUT / f"{root}_1m_unadj.parquet", columns=["timestamp", "open", "high", "low", "close"])
    ts = pd.to_datetime(f["timestamp"], utc=True) - pd.Timedelta(minutes=1)  # end-stamped -> start-stamped
    lon = ts.dt.tz_convert("Europe/London")
    f["t"] = ts
    day = lon.dt.normalize()
    codes, uniq = pd.factorize(day)  # strftime on ~3M stamps is slow: format the unique days only
    f["lon_date"] = np.asarray(pd.DatetimeIndex(uniq).strftime("%Y-%m-%d"))[codes]
    f["lon_min"] = lon.dt.hour * 60 + lon.dt.minute
    f = f[f["lon_min"] < 22 * 60]
    return f


def touches_for_line(hi, lo, level, up, r):
    """Indices of touch bars for one line, with the re-arm rule."""
    if up:
        hit = hi >= level
        rearm = lo <= level - r
    else:
        hit = lo <= level
        rearm = hi >= level + r
    ev = np.nonzero(hit | rearm)[0]
    out, armed, last_touch = [], True, -1
    for i in ev:
        if armed and hit[i]:
            out.append(i)
            armed, last_touch = False, i
        elif not armed and rearm[i] and i > last_touch:
            armed = True  # a bar that re-arms AND hits is not counted as a touch: order inside the bar is unknown
    return out


def build(name: str):
    root, mult, tick, unit = MAP[name]
    days = pd.read_parquet(ARC / f"{name}_days.parquet")
    fut = load_futures(root)
    groups = {d: g for d, g in fut.groupby("lon_date", sort=False)}
    full_bars = 22 * 60
    rows, skipped, used = [], [], 0
    for _, d in days.iterrows():
        g = groups.get(d["date"])
        if g is None or len(g) < MIN_BAR_SHARE * full_bars or g["lon_min"].iloc[0] > 5:
            skipped.append(d["date"])
            continue
        used += 1
        hi, lo, cl = g["high"].to_numpy(float), g["low"].to_numpy(float), g["close"].to_numpy(float)
        mins = g["lon_min"].to_numpy()
        o = float(g["open"].iloc[0])
        sig = o * d["sigma_used_pct"] / 100.0
        n = len(g)
        for kind, sc in SCALES.items():
            for side, up in (("OH", True), ("OL", False)):
                for rung in RUNGS:
                    pct = d[f"{side.lower()}_{rung}_pct"] * sc
                    level = o * (1 + pct / 100) if up else o * (1 - pct / 100)
                    for tn, k in enumerate(touches_for_line(hi, lo, level, up, REARM_SIG * sig), start=1):
                        row = {
                            "instrument": name, "root": root, "date": d["date"], "weekday": int(d["weekday"]),
                            "era": d["era"], "kind": kind, "line": f"{side}_{rung}", "side": "up" if up else "dn",
                            "rung": rung, "touch_n": tn, "lon_hour": int(mins[k] // 60), "min_since_open": int(mins[k]),
                            "open": o, "level": level, "sigma_pts": sig * mult, "dist_from_open_sig": abs(level - o) / sig,
                        }
                        for H in HORIZONS:
                            end = n if H is None else min(n, k + H + 1)
                            tag = "eod" if H is None else f"{H}m"
                            if up:
                                through = hi[k:end].max() - level
                                back = level - lo[k + 1:end].min() if end > k + 1 else 0.0
                                fin = cl[end - 1] - level
                            else:
                                through = level - lo[k:end].min()
                                back = hi[k + 1:end].max() - level if end > k + 1 else 0.0
                                fin = level - cl[end - 1]
                            row[f"through_{tag}"] = max(through, 0.0) * mult
                            row[f"back_{tag}"] = max(back, 0.0) * mult
                            row[f"final_{tag}"] = fin * mult  # signed in the touch (continue) direction
                        rows.append(row)
    t = pd.DataFrame(rows)
    meta = {"instrument": name, "root": root, "unit": unit, "tick": tick, "days_archive": len(days),
            "days_used": used, "days_skipped": len(skipped), "first": days["date"].min(), "last": days["date"].max()}
    return t, meta


def pct_table(t, by, cols, qs=(0.25, 0.5, 0.75, 0.9)):
    g = t.groupby(by)
    out = g.size().rename("n").to_frame()
    for c in cols:
        for q in qs:
            out[f"{c}_p{int(q * 100)}"] = g[c].quantile(q)
    return out.reset_index()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    allt, metas = [], []
    for name in MAP:
        t, m = build(name)
        print(name, m, len(t))
        allt.append(t)
        metas.append(m)
    t = pd.concat(allt, ignore_index=True)
    t.to_parquet(OUT / "touches.parquet", index=False)
    (OUT / "meta.json").write_text(json.dumps(metas, indent=2))
    print("rows", len(t))


if __name__ == "__main__":
    main()
