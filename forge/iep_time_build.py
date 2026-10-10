"""iep_time_build — data for forge/IEP_TIME_PREREG.md.

    python -m forge.iep_time_build

1. rows: IEP event-table state (inst, date, h) joined to the point-in-time v3 export lines (analysis/output/forecast_history, pit_*),
   with the registered outcomes U/L 50/75/90 (first touch after h by 22:00), CL75, FT, EXP, and the IEP CONS / CONT|res.
   Dates < 2025-01-01 only. -> data/iep/time_rows.parquet
2. session-carry races (H2) on M1: Asia (00-07) and London (07-12) range extremes, first touched after the window, race +-0.25 export-sigma
   from the touch-bar close to 22:00; placebo levels at +-0.15 sigma. Dates < 2025-01-01. -> data/iep/carry_races.parquet
Checks written to analysis/output/intraday_extreme_paths/TIME_BUILD_CHECKS.md (alignment of the two tables, first-touch consistency).
"""
from __future__ import annotations

import json
from multiprocessing import Pool

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, M1, OUT, SUM, cls_of

REPO = OUT.parents[1]
FH = REPO / "analysis" / "output" / "forecast_history"
END = "2025-01-01"
FH_NAME = {"US30": "DOW"}
RUNG = ("p50", "p75", "p90")


def load_fh(sym):
    f = pd.read_csv(FH / f"{FH_NAME.get(sym, sym)}.csv")
    f = f[f.date < END].copy()
    f["inst"] = sym
    return f


def rows_for(sym):
    e = pd.read_parquet(OUT / f"{sym}.parquet")
    e = e[e.date < END]
    keep = ["inst", "date", "h", "D", "sig", "sigRel", "stale", "used", "hi_pb", "lo_pb", "hi_age", "lo_age", "m1", "res2_1.0", "res1_1.0", "hi_D", "lo_D"]
    e = e[keep]
    f = load_fh(sym)
    cols = ["inst", "date", "oos", "event", "open", "pit_sig_daily", "pit_hl_p50", "pit_oc_p75", "r_hl", "r_ocs"] + \
           [f"pit_{s}_{r}" for s in ("oh", "ol") for r in RUNG] + [f"ft_{s}_{r}" for s in ("OH", "OL") for r in RUNG] + \
           [f"oh_h{k}" for k in range(1, 23)] + [f"ol_h{k}" for k in range(1, 23)]
    x = e.merge(f[cols], on=["inst", "date"], how="inner")
    hh = x.h.to_numpy()
    oh = np.take_along_axis(x[[f"oh_h{k}" for k in range(1, 23)]].to_numpy(), (hh - 1)[:, None], 1)[:, 0]
    ol = np.take_along_axis(x[[f"ol_h{k}" for k in range(1, 23)]].to_numpy(), (hh - 1)[:, None], 1)[:, 0]
    x = x.drop(columns=[f"oh_h{k}" for k in range(1, 23)] + [f"ol_h{k}" for k in range(1, 23)])
    x["run_oh"], x["run_ol"] = oh, ol
    sd_har = x.sig / np.sqrt(252)                     # HAR daily sigma, % of open
    x["pos"] = x.D * sd_har                           # price vs open, % of open
    x["iep_oh"] = x.hi_D * sd_har                     # running OH from the IEP table, for the alignment check
    t = hh * 60
    for s, S in (("oh", "OH"), ("ol", "OL")):
        for r in RUNG:
            ft = x[f"ft_{S}_{r}"].to_numpy()
            touched = np.isfinite(ft) & (ft < t)
            x[f"{s}{r}_done"] = touched
            x[f"{'U' if s == 'oh' else 'L'}{r[1:]}"] = np.where(touched, np.nan, (np.isfinite(ft) & (ft >= t)).astype(float))
    x["CL75u"] = (x.r_ocs >= x.pit_oc_p75).astype(float)
    x["CL75d"] = (x.r_ocs <= -x.pit_oc_p75).astype(float)
    fu, fd = x.ft_OH_p75.fillna(1e9).to_numpy(), x.ft_OL_p75.fillna(1e9).to_numpy()
    both_open = ~(x.ohp75_done | x.olp75_done)
    x["FT"] = np.where(~both_open, None, np.where((fu == 1e9) & (fd == 1e9), "none", np.where(fu == fd, "both", np.where(fu < fd, "up", "down"))))
    x["EXP"] = ((x.r_hl - (x.run_oh + x.run_ol)) >= 0.5 * x.pit_hl_p50).astype(float)
    x["cls"] = cls_of(sym)
    return x


def carry_for(sym):
    df = pd.read_parquet(M1 / f"{JOBS[sym]}_m1.parquet")
    df = df[~df.index.duplicated(keep="first")].sort_index()
    loc = df.index.tz_convert("Europe/London").tz_localize(None).values
    day = loc.astype("datetime64[D]")
    minute = ((loc - day) // np.timedelta64(1, "m")).astype(np.int64)
    keep = day < np.datetime64(END)
    h, l, c = (df[k].to_numpy(float)[keep] for k in ("high", "low", "close"))
    day, minute = day[keep], minute[keep]
    f = load_fh(sym).set_index("date")
    sig = f.pit_sig_daily.to_dict()
    oos = f.oos.to_dict()
    out = []
    bounds = np.flatnonzero(np.r_[True, day[1:] != day[:-1], True])
    for a, b in zip(bounds[:-1], bounds[1:]):
        d = str(day[a])
        if d not in sig or b - a < 600:
            continue
        m, hh, ll, cc = minute[a:b], h[a:b], l[a:b], c[a:b]
        O = cc[0]
        dist = sig[d] / 100 * O
        end = np.searchsorted(m, 22 * 60)
        for win, (w0, w1) in (("asia", (0, 420)), ("london", (420, 720))):
            i0, i1 = np.searchsorted(m, w0), np.searchsorted(m, w1)
            if i1 - i0 < 60 or i1 >= end:
                continue
            ref = cc[i1 - 1]                                   # last close before the next session
            lv = {"hi": hh[i0:i1].max(), "lo": ll[i0:i1].min()}
            for side, L0 in lv.items():
                for kind, L in (("real", L0), ("plc+", L0 + 0.15 * dist), ("plc-", L0 - 0.15 * dist)):
                    up = side == "hi"
                    if (up and ref >= L) or ((not up) and ref <= L):
                        continue                               # level must be beyond the price at the window end
                    seg_h, seg_l = hh[i1:end], ll[i1:end]
                    hit = np.flatnonzero(seg_h >= L) if up else np.flatnonzero(seg_l <= L)
                    if not len(hit):
                        out.append((sym, d, win, side, kind, np.nan, "untouched"))
                        continue
                    k = i1 + hit[0]
                    c0 = cc[k]
                    rh, rl = hh[k + 1:end], ll[k + 1:end]
                    beyond = np.flatnonzero(rh >= c0 + 0.25 * dist) if up else np.flatnonzero(rl <= c0 - 0.25 * dist)
                    back = np.flatnonzero(rl <= c0 - 0.25 * dist) if up else np.flatnonzero(rh >= c0 + 0.25 * dist)
                    ib, ik = (beyond[0] if len(beyond) else 1e9), (back[0] if len(back) else 1e9)
                    res = "none" if ib == ik == 1e9 else "amb" if ib == ik else "cont" if ib < ik else "rev"
                    out.append((sym, d, win, side, kind, int(m[k]), res))
    r = pd.DataFrame(out, columns=["inst", "date", "win", "side", "kind", "touch_min", "res"])
    r["oos"] = r.date.map(oos)
    r["cls"] = cls_of(sym)
    return r


def main():
    syms = list(JOBS)
    with Pool(8) as p:
        rows = pd.concat(p.map(rows_for, syms), ignore_index=True)
        carry = pd.concat(p.map(carry_for, syms), ignore_index=True)
    rows.to_parquet(OUT / "time_rows.parquet")
    carry.to_parquet(OUT / "carry_races.parquet")
    # checks
    al = (rows.iep_oh - rows.run_oh).abs()
    chk = ["# IEP-TIME build checks", "",
           f"rows {len(rows):,} ({rows.inst.nunique()} instruments), oos rows {int(rows.oos.sum()):,}; carry races {len(carry):,}", "",
           "## 1. Running OH at checkpoint: IEP table vs export table (both % of open; export rounds to 4dp)",
           f"median |diff| {al.median():.5f}, p99 {al.quantile(0.99):.5f}, share > 0.01pp {(al > 0.01).mean():.4f}", "",
           "## 2. First-touch consistency: line untouched at h <=> running extreme below the line",
           *[f"{s}{r}: mismatch share {((rows[f'{s}{r}_done']) != (rows[f'run_{s}'] >= rows[f'pit_{s}_{r}'] - 1e-9)).mean():.5f}" for s in ('oh', 'ol') for r in RUNG], "",
           "## 3. FT: share of rows where both p75 lines were touched in the same minute (ambiguous), all blocks",
           f"{(rows.FT == 'both').mean():.5f} of all rows; {rows.FT.isna().mean():.3f} not eligible (a p75 line already touched)", "",
           "## 4. Carry levels: touched after the window vs never touched (all blocks; outcome counts deliberately not shown)",
           carry.assign(touched=carry.res != "untouched").groupby(["win", "kind"]).touched.agg(["size", "mean"]).round(3).to_string()]
    (SUM / "TIME_BUILD_CHECKS.md").write_text("\n".join(chk), encoding="utf-8")
    print("\n".join(chk))


if __name__ == "__main__":
    main()
