"""Better-level stacks + stop/target race, on the futures line touches (register row line-touch-mae-futures).

EXPLORATORY, descriptive. Owner question 2026-11-17 (Jordan's suggestion):
  1. When several lines sit within a few ticks, take the BETTER level = the one furthest from price (furthest from the
     open, in the touch direction). A touch is kept only if no other line sits within CLUSTER ticks beyond it at the
     touch bar ("outermost of its stack"); if price never reaches that outer line there is no entry.
  2. How often is the median MFE reached before the median MAE is broken? Stop = median MAE, target = median MFE of
     the same set (instrument x line group x set x horizon), then a first-passage race bar by bar from the touch:
       fade:     stop = through >= S (bars k..), target = back >= T (bars k+1..)
       continue: stop = back    >= S (bars k+1..), target = through >= T (bars k..)
     A bar that reaches both is 'same bar' (order unknown; count it as a stop to be safe). Within the horizon neither
     may be reached. Also the order-free conditional: P(MFE >= T | MAE < S) over the horizon.
Touches, lines, re-arm rule and data are exactly build.py's (forecast lines only, no placebo).

    python -I scripts/line-touch-mae-futures/race.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as B  # noqa: E402

CLUSTER = 5  # ticks
HS = {"60m": 60, "240m": 240, "eod": None}
NEVER = 10**9


def first_hit(mask):
    i = np.flatnonzero(mask)
    return int(i[0]) if len(i) else NEVER


def replay(name):
    root, mult, tick, unit = B.MAP[name]
    days = pd.read_parquet(B.ARC / f"{name}_days.parquet")
    fut = B.load_futures(root)
    groups = {d: g for d, g in fut.groupby("lon_date", sort=False)}
    rows, bars = [], {}
    for _, d in days.iterrows():
        g = groups.get(d["date"])
        if g is None or len(g) < B.MIN_BAR_SHARE * 22 * 60 or g["lon_min"].iloc[0] > 5:
            continue
        hi, lo = g["high"].to_numpy(float), g["low"].to_numpy(float)
        bars[d["date"]] = (hi, lo)
        o = float(g["open"].iloc[0])
        sig = o * d["sigma_used_pct"] / 100.0
        lv = B.day_levels(o, hi, lo, d, 1.0)
        names = list(lv)
        mat = np.vstack([lv[x] for x in names])
        for li, lname in enumerate(names):
            fam, rung = lname.split("_")
            up = B.FAMILIES[fam][0]
            for tn, k in enumerate(B.touches_for_line(hi, lo, lv[lname], up, B.REARM_SIG * sig), start=1):
                L = float(lv[lname][k])
                oth = np.delete(mat[:, k], li)
                beyond = (oth - L) * (1 if up else -1) * mult / tick  # ticks beyond this line, touch direction
                near = np.abs(oth - L) * mult / tick
                rows.append({"instrument": name, "date": d["date"], "group": B.FAMILY_GROUP[fam], "line": lname,
                             "rung": rung, "touch_n": tn, "k": k, "up": up, "level": L, "sigma_pts": sig * mult,
                             "n_within_5t": int((near <= CLUSTER).sum()),
                             "n_beyond_5t": int(((beyond > 0) & (beyond <= CLUSTER)).sum())})
    return pd.DataFrame(rows), bars, mult, tick


def excursions(t, bars, mult):
    n = len(t)
    for tag, H in HS.items():
        th, bk = np.zeros(n), np.zeros(n)
        for i, (dt, k, up, L) in enumerate(zip(t.date, t.k, t.up, t.level)):
            hi, lo = bars[dt]
            e = len(hi) if H is None else min(len(hi), k + H + 1)
            if up:
                th[i] = hi[k:e].max() - L
                bk[i] = L - lo[k + 1:e].min() if e > k + 1 else 0
            else:
                th[i] = L - lo[k:e].min()
                bk[i] = hi[k + 1:e].max() - L if e > k + 1 else 0
        t[f"through_{tag}"] = np.maximum(th, 0) * mult
        t[f"back_{tag}"] = np.maximum(bk, 0) * mult
    return t


def race(sub, bars, mult, H, S, T, mode):
    """Counts of target-first / stop-first / same-bar / neither for one set at fixed S, T (display units)."""
    c = {"target": 0, "stop": 0, "same": 0, "neither": 0}
    s, tg = S / mult, T / mult
    for dt, k, up, L in zip(sub.date, sub.k, sub.up, sub.level):
        hi, lo = bars[dt]
        e = len(hi) if H is None else min(len(hi), k + H + 1)
        h, l = hi[k:e], lo[k:e]
        # through: bar k counts (its extreme is after the touch); back: from bar k+1
        if mode == "fade":
            st = first_hit(h >= L + s) if up else first_hit(l <= L - s)
            m = (l <= L - tg) if up else (h >= L + tg)
            m[0] = False
            tt = first_hit(m)
        else:
            m = (l <= L - s) if up else (h >= L + s)
            m[0] = False
            st = first_hit(m)
            tt = first_hit(h >= L + tg) if up else first_hit(l <= L - tg)
        if st == tt == NEVER:
            c["neither"] += 1
        elif st == tt:
            c["same"] += 1
        elif tt < st:
            c["target"] += 1
        else:
            c["stop"] += 1
    return c


def main():
    out = B.OUT
    allrows, summ = [], []
    for name in B.MAP:
        t, bars, mult, tick = replay(name)
        t = excursions(t, bars, mult)
        t["better"] = t.n_beyond_5t == 0
        print(name, len(t), "touches;", int(t.better.sum()), "outermost-of-stack", flush=True)
        for grp in ["ALL", "OH/OL", "OC", "HL"]:
            g0 = t if grp == "ALL" else t[t.group == grp]
            for setname, sub in (("all", g0), ("better", g0[g0.better]), ("first", g0[g0.touch_n == 1]),
                                 ("better_first", g0[g0.better & (g0.touch_n == 1)])):
                n = len(sub)
                if n == 0:
                    continue
                for tag, H in HS.items():
                    mae, mfe = sub[f"through_{tag}"], sub[f"back_{tag}"]
                    for mode in ("fade", "continue"):
                        a, b = (mae, mfe) if mode == "fade" else (mfe, mae)  # a = adverse, b = favourable
                        S, T = float(a.median()), float(b.median())
                        held = a < S
                        cond = float((b[held] >= T).mean() * 100) if held.any() else np.nan
                        c = race(sub, bars, mult, H, S, T, mode)
                        summ.append({"instrument": name, "group": grp, "set": setname, "horizon": tag, "mode": mode,
                                     "n": n, "stop": round(S, 2), "target": round(T, 2),
                                     "stop_ticks": round(S / tick, 1), "target_ticks": round(T / tick, 1),
                                     "target_first": round(c["target"] / n * 100, 1),
                                     "stop_first": round(c["stop"] / n * 100, 1),
                                     "same_bar": round(c["same"] / n * 100, 1),
                                     "neither": round(c["neither"] / n * 100, 1),
                                     "cond_mfe_given_mae_held": round(cond, 1)})
        allrows.append(t.drop(columns=["k", "up"]))
        print(name, "done", flush=True)
    pd.concat(allrows, ignore_index=True).to_parquet(out / "touches_better.parquet", index=False)
    s = pd.DataFrame(summ)
    (out / "tables").mkdir(exist_ok=True)
    s.to_csv(out / "tables/race.csv", index=False)
    (out / "race.json").write_text(json.dumps(summ, separators=(",", ":")))
    pd.set_option("display.width", 250)
    print(s[(s.group == "ALL") & (s.horizon == "60m")].to_string())


if __name__ == "__main__":
    main()
