"""level-touch-excursions (EXPLORATORY, not pre-registered; register row 6557db2e).

    python scripts/level-touch-excursions/run.py [SYM:TRACK ...]  -> analysis/output/level-touch-excursions/

Jordan step 3: set stop / target from MAE / MFE at the levels. EVERY touch of each per-line QLIKE level (Close+, Close-,
OH, OL; median / 75th / 90th; each instrument x line its own walk-forward calc, same levels as close-level-reversal),
not just the first. A touch re-arms once price has moved 0.1 line-sigma back off the level. For each touch:
  MAE = furthest price goes THROUGH the line (against a fade), MFE = furthest it comes BACK toward the open,
  both in that line's own daily sigma, over 30 min, 60 min and to 22:00 London; touch number in the session; London
  minute of the touch. Placebo levels (0.75-0.90 / 1.10-1.25 x distance) measured the same way beside each line.
The touch bar's own through-side extreme counts toward MAE (order inside the bar unknown: conservative for a fade); MFE
starts on the next bar. Futures (track F, 25) + CFDs (track C, 40), sessions 2020 -> 2026-08-21. Seed 20261124.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

_spec = importlib.util.spec_from_file_location("clr", ROOT / "scripts/close-level-reversal/race.py")
CLR = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(CLR)

SEED = 20261124
OUT = ROOT / "analysis/output/level-touch-excursions"
LINES, ABOVE, TAUS = CLR.LINES, CLR.ABOVE, CLR.TAUS
REARM = 0.10
WINS = (30, 60)
HOURS = [(0, 7), (7, 10), (10, 13), (13, 16), (16, 22)]


def touches(h, l, P, r, above):
    """Bar indices of every touch of P; a new touch needs a bar fully back off the level by r since the last touch."""
    n = len(h)
    at = h >= P if above else l <= P
    if not at.any():
        return np.empty(0, int)
    away = (h < P - r) if above else (l > P + r)
    idx = np.arange(n)
    last_away = np.maximum.accumulate(np.where(away, idx, -1))
    last_at = np.maximum.accumulate(np.where(at, idx, -1))
    prev_at = np.r_[-1, last_at[:-1]]
    prev_away = np.r_[-1, last_away[:-1]]
    ev = at & ((prev_at < 0) | (prev_away > prev_at))
    return np.flatnonzero(ev)


def excursions(h, l, P, t, sig_px, above, n):
    out = []
    for w in WINS + (None,):
        e = n if w is None else min(n, t + 1 + w)
        thr = (h[t:e].max() - P) if above else (P - l[t:e].min())
        if t + 1 < e:
            back = (P - l[t + 1:e].min()) if above else (h[t + 1:e].max() - P)
        else:
            back = np.nan
        out += [max(thr, 0.0) / sig_px, back / sig_px]
    return out


def run(job):
    sym, track = job
    dates, lv, sg, c1, hits = CLR.levels(sym, track)
    m = L.load_m1(sym, track, "unadj") if track == "F" else L.load_m1(sym, track)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    H, Lo, O = m["high"].to_numpy(), m["low"].to_numpy(), m["open"].to_numpy()
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    pos = {di[s]: (s, e) for s, e in zip(starts, ends)}
    rng = np.random.default_rng([SEED, zlib.crc32(f"{sym}:{track}".encode())])
    rows = []
    for i, dt in enumerate(dates):
        if dt.year < 2020 or dt not in pos:
            continue
        s, e = pos[dt]
        if e - s < 600:
            continue
        h, l, o, n = H[s:e], Lo[s:e], O[s], e - s
        ds = dt.strftime("%Y-%m-%d")
        for q in LINES:
            if not np.isfinite(lv[q][i, 0]):
                continue
            sig_px = sg[q][i] * o / 100
            ab = ABOVE[q]
            for j, tau in enumerate(TAUS):
                D = lv[q][i, j]
                mult = rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25)
                for kind, dd in (("line", D), ("placebo", D * mult)):
                    P = o * (1 + dd / 100) if ab else o * (1 - dd / 100)
                    for k, t in enumerate(touches(h, l, P, REARM * sig_px, ab), 1):
                        rows.append((ds, q, int(tau * 100), kind, k, int(mins[s + t]),
                                     *excursions(h, l, P, t, sig_px, ab, n)))
    cols = ["date", "line", "tau", "kind", "touch_n", "minute", "mae30", "mfe30", "mae60", "mfe60", "mae_eod", "mfe_eod"]
    df = pd.DataFrame(rows, columns=cols)
    for c in cols[6:]:
        df[c] = df[c].astype("float32")
    df.insert(0, "track", track)
    df.insert(0, "sym", sym)
    df.to_parquet(OUT / "touches" / f"{track}_{sym}.parquet")
    nl = df[df.kind == "line"]
    return f"{track} {sym}: {nl['date'].nunique()} sessions, {len(nl)} line touches (" + ", ".join(
        f"#{k} {int((nl.touch_n == k).sum())}" for k in (1, 2, 3)) + f", 4+ {int((nl.touch_n >= 4).sum())})"


def hb(mn):
    h = mn // 60
    for a, b in HOURS:
        if a <= h < b:
            return f"{a:02d}-{b:02d}"
    return "na"


def summarise():
    A = pd.concat([pd.read_parquet(p) for p in sorted((OUT / "touches").glob("*.parquet"))], ignore_index=True)
    A["tn"] = np.where(A["touch_n"] >= 4, "4+", A["touch_n"].astype(str))
    A["hours"] = A["minute"].map(hb)
    A["side"] = np.where(A["line"].isin(["cup", "cdn"]), "Close±", "OH/OL")
    stats = ["mae30", "mfe30", "mae60", "mfe60", "mae_eod", "mfe_eod"]

    def agg(g):
        d = {"n": len(g), "sessions": g["date"].nunique()}
        for c in stats:
            v = g[c].dropna().to_numpy()
            d[f"{c}_p50"], d[f"{c}_p75"], d[f"{c}_p90"] = (np.quantile(v, [.5, .75, .9]) if len(v) else (np.nan,) * 3)
        d["mfe60_gt_mae60"] = float(np.mean(g["mfe60"] > g["mae60"]))
        return pd.Series(d)

    out = {}
    for name, keys in {"by_touch": ["track", "side", "kind", "tn"], "by_hour": ["track", "side", "kind", "hours"],
                       "by_touch_hour": ["track", "side", "kind", "tn", "hours"],
                       "by_line_tau": ["track", "line", "tau", "kind", "tn"]}.items():
        t = A.groupby(keys).apply(agg).reset_index()
        t.to_csv(OUT / f"{name}.csv", index=False)
        out[name] = t
    inst = A[A["kind"] == "line"].groupby(["track", "sym", "line", "tau", "tn", "hours"]).apply(agg).reset_index()
    inst.to_csv(OUT / "per_instrument.csv", index=False)
    share = A[A["kind"] == "line"].groupby(["track", "tn"]).size().unstack("tn")
    json.dump({"seed": SEED, "label": "exploratory, not pre-registered", "rearm_sigma": REARM, "windows_min": list(WINS),
               "touch_counts": share.to_dict()}, open(OUT / "results.json", "w"), indent=1, default=str)
    return out


def main():
    (OUT / "touches").mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if args == ["summarise"]:
        summarise()
        return
    J = [tuple(a.split(":")) for a in args] or ([(s, "F") for s in CLR.RF.syms()] + [(s, "C") for s in CLR.RC.syms()])
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=4) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)
    if not args:
        summarise()


if __name__ == "__main__":
    main()
