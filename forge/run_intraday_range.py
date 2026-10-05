"""INTRADAY-RANGE — runs forge/INTRADAY_RANGE_PREREG.md exactly as registered, and (only on PASS)
writes js/intradayRangeParams.js for the live page.

    python -m forge.run_intraday_range
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.bars import load_m1
from forge.export_iv_adjusted_params import d1
from forge.run_combined_range import asof_before
from forge.run_horizon_reversion import FORGE_KEY, ladder_estimators

OUT = Path("analysis/output/intraday_range")
OUT_JS = Path("js/intradayRangeParams.js")
CHECKPOINTS = list(range(1, 22))                    # 01:00 .. 21:00 London
TAUS = (0.50, 0.75, 0.90)
GRID = [round(x, 2) for x in np.arange(0.05, 0.951, 0.05)]   # quantile grid exported for the page
INDEX = {"NQ", "SPX", "DOW", "US2000", "DE30", "UK100"}
TRAIN_FRAC = 0.60


def m1_root(key: str) -> str:
    return V.INDEX_DATA_ROOT if key in V.INDEX_PAIRS else "VolRangeForecaster/data/m1"


def hourly_paths(key: str):
    """Per London session date: open, and hourly high/low arrays for hours 0..21 (NaN where no bars)."""
    m = load_m1(key, m1_root(key)).tz_convert("Europe/London")
    m = m[m.index.hour < 22]
    day = m.index.tz_localize(None).normalize()
    hr = m.index.hour
    g = m.groupby([day, hr])
    hh = g["high"].max().unstack().reindex(columns=range(22))
    ll = g["low"].min().unstack().reindex(columns=range(22))
    op = m.groupby(day)["open"].first()
    return op, hh, ll


MIN_CELL = 30   # implementation note (not in the prereg): a cell with < 30 train days uses the whole checkpoint


def cellvals(vals, cells, c):
    v = vals[cells == c]
    return v if len(v) >= MIN_CELL else vals


def pinball(a, p, t):
    d = a - p
    return np.where(d >= 0, t * d, (t - 1) * d)


def main():
    est = ladder_estimators()
    rows = []
    for name in sorted(est):
        key = FORGE_KEY.get(name, name.lower())
        if not Path(m1_root(key), f"{key}_m1.parquet").exists():
            print("skip", name); continue
        op, hh, ll = hourly_paths(key)
        b = d1(name)
        sig = pd.Series(V.ESTIMATORS[est[name]](b.reset_index(drop=True)).astype(float), index=b.index) / V.SQRT252
        D = pd.DatetimeIndex(hh.index)
        s_d = asof_before(D, sig.dropna())                      # daily sigma, % of price
        H, L = hh.to_numpy(float), ll.to_numpy(float)
        cumH = np.fmax.accumulate(np.where(np.isnan(H), -np.inf, H), axis=1)
        cumL = np.fmin.accumulate(np.where(np.isnan(L), np.inf, L), axis=1)
        o = op.reindex(D).to_numpy(float)
        finH, finL = cumH[:, -1], cumL[:, -1]
        complete = np.isfinite(H[:, 19:22]).any(axis=1) & np.isfinite(finH) & np.isfinite(finL) & (o > 0) & (s_d > 0)
        unit = s_d * o / 100.0                                   # one sigma in price
        for h in CHECKPOINTS:
            rh, rl = cumH[:, h - 1], cumL[:, h - 1]              # bars strictly before h
            ok = complete & np.isfinite(rh) & np.isfinite(rl)
            lastH, lastL = H[:, h - 1], L[:, h - 1]
            speed = np.where(np.isfinite(lastH) & np.isfinite(lastL), (lastH - lastL), 0.0)
            df = pd.DataFrame({
                "date": D[ok], "inst": name, "cls": "indices" if name in INDEX else "fx_gold", "h": h,
                "used": ((rh - rl) / unit)[ok], "speed": (speed / unit)[ok],
                "U": ((finH - rh) / unit)[ok], "Dn": ((rl - finL) / unit)[ok],
                "final": ((finH - finL) / unit)[ok],
                # morning one-sided reach targets need open-relative excursions
                "oh_so_far": ((rh - o) / unit)[ok], "ol_so_far": ((o - rl) / unit)[ok],
                "oh_final": ((finH - o) / unit)[ok], "ol_final": ((o - finL) / unit)[ok],
            })
            rows.append(df)
        print(f"{name:7s} {int(complete.sum())} complete sessions", flush=True)
    X = pd.concat(rows, ignore_index=True)
    X["R"] = X["U"] + X["Dn"]

    report, params = {"classes": {}}, {"generated": str(date.today()), "source": "forge/run_intraday_range.py",
                                        "prereg": "forge/INTRADAY_RANGE_PREREG.md", "grid": GRID,
                                        "units": "sigma_daily * open (sigma from the ladder's own estimator)",
                                        "checkpoints_london": CHECKPOINTS, "classes": {}}
    for cls in ("fx_gold", "indices"):
        C = X[X["cls"] == cls]
        split = C["date"].quantile(TRAIN_FRAC)
        tr_all = C[C["date"] < split]
        # arm A widths: per instrument, from train FINAL H-L in sigma units (time-invariant)
        wA = {(i, t): float(np.quantile(g.drop_duplicates("date")["final"], t)) for i, g in tr_all.groupby("inst") for t in TAUS}
        wOH = {i: float(np.quantile(g.drop_duplicates("date")["oh_final"], 0.75)) for i, g in tr_all.groupby("inst")}
        wOL = {i: float(np.quantile(g.drop_duplicates("date")["ol_final"], 0.75)) for i, g in tr_all.groupby("inst")}
        cp_rows, cls_params, cal_rows, exc = [], {}, [], {}
        for h in CHECKPOINTS:
            Ch = C[C["h"] == h]
            tr, te = Ch[Ch["date"] < split], Ch[Ch["date"] >= split]
            if len(tr) < 500 or len(te) < 200:
                continue
            eu = np.quantile(tr["used"], [1 / 3, 2 / 3]); es = np.quantile(tr["speed"], [1 / 3, 2 / 3])
            cell_tr = np.digitize(tr["used"], eu) * 3 + np.digitize(tr["speed"], es)
            cell_te = np.digitize(te["used"], eu) * 3 + np.digitize(te["speed"], es)
            qR = {c: {t: float(np.quantile(cellvals(tr["R"].to_numpy(), cell_tr, c), t)) for t in TAUS} for c in range(9)}
            per = []
            for inst, g in te.groupby("inst"):
                cc = cell_te[(te["inst"] == inst).to_numpy()]
                LA = LB = 0.0
                for t in TAUS:
                    pA = np.maximum(g["used"].to_numpy(), wA[(inst, t)])
                    pB = g["used"].to_numpy() + np.array([qR[c][t] for c in cc])
                    LA += float(pinball(g["final"].to_numpy(), pA, t).mean())
                    LB += float(pinball(g["final"].to_numpy(), pB, t).mean())
                per.append(LB / LA)
            per = np.array(per)
            passed = bool(np.median(per) < 0.98 and (per < 1).mean() >= 0.60)
            cp_rows.append({"h": h, "median_ratio": round(float(np.median(per)), 4),
                            "share_better": round(float((per < 1).mean()), 3), "pass": passed})
            # exported grids (fit on ALL data for the live page) + secondary checks on test
            allc = np.digitize(Ch["used"], np.quantile(Ch["used"], [1 / 3, 2 / 3])) * 3 + np.digitize(Ch["speed"], np.quantile(Ch["speed"], [1 / 3, 2 / 3]))
            cls_params[str(h)] = {
                "used_edges": [round(float(x), 4) for x in np.quantile(Ch["used"], [1 / 3, 2 / 3])],
                "speed_edges": [round(float(x), 4) for x in np.quantile(Ch["speed"], [1 / 3, 2 / 3])],
                "cells": [{v: [round(float(x), 4) for x in np.quantile(cellvals(Ch[v].to_numpy(), allc, c), GRID)]
                           for v in ("U", "Dn", "R")} | {"n": int((allc == c).sum())} for c in range(9)]}
            grp = "01-07" if h <= 7 else "08-14" if h <= 14 else "15-21"
            for v in ("U", "Dn"):
                for t in TAUS:
                    qv = {c: float(np.quantile(cellvals(tr[v].to_numpy(), cell_tr, c), t)) for c in range(9)}
                    pred = np.array([qv[c] for c in cell_te])
                    acc = exc.setdefault(grp, {}).setdefault(f"{v}_p{int(t * 100)}", [0, 0])
                    acc[0] += int((te[v].to_numpy() > pred).sum()); acc[1] += len(te)
            # reach-probability calibration: morning OH/OL p75 (train widths), not yet reached at h
            for side, so_far, wmap, ext in (("up", "oh_so_far", wOH, "U"), ("dn", "ol_so_far", wOL, "Dn")):
                lvl = te["inst"].map(wmap).to_numpy()
                need = lvl - te[so_far].to_numpy()
                m = need > 0
                grids = {c: np.quantile(cellvals(tr[ext].to_numpy(), cell_tr, c), GRID) for c in range(9)}
                prob = np.array([1 - np.interp(x, grids[c], GRID, left=0.0, right=1.0) for x, c in zip(need[m], cell_te[m])])
                hit = te[ext].to_numpy()[m] >= need[m]
                cal_rows.append(pd.DataFrame({"p": prob, "hit": hit}))
        cal = pd.concat(cal_rows)
        cal["dec"] = pd.qcut(cal["p"], 10, labels=False, duplicates="drop")
        caltab = cal.groupby("dec").agg(pred=("p", "mean"), real=("hit", "mean"), n=("hit", "size")).round(3)
        npass = sum(r["pass"] for r in cp_rows)
        verdict = "PASS" if npass >= 14 else "FAIL"
        report["classes"][cls] = {"split": str(split.date()), "checkpoints_passed": f"{npass}/{len(cp_rows)}",
                                  "verdict": verdict, "per_checkpoint": cp_rows,
                                  "U_D_exceedance": {g: {k: round(v[0] / v[1], 3) for k, v in d_.items()} for g, d_ in exc.items()},
                                  "reach_calibration": caltab.reset_index().to_dict("records")}
        params["classes"][cls] = cls_params
        print(f"\n{cls}: {npass}/{len(cp_rows)} checkpoints pass -> {verdict}")
        for r in cp_rows: print("  ", r)
        print("  U/D exceedance:", report["classes"][cls]["U_D_exceedance"])
        print("  reach calibration:\n", caltab.to_string())

    params["instrument_class"] = {n: ("indices" if n in INDEX else "fx_gold") for n in est}
    params["alias"] = {"SPX500": "SPX", "US30": "DOW"}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(report, indent=1, default=str))
    md = ["# INTRADAY-RANGE — results", "", "Pre-registration: `forge/INTRADAY_RANGE_PREREG.md`.", ""]
    for cls, r in report["classes"].items():
        md += [f"## {cls} — **{r['verdict']}** ({r['checkpoints_passed']} checkpoints)", "", f"Train before {r['split']}.", "",
               "| London | B÷A median | B better | pass |", "|---|---|---|---|"]
        md += [f"| {c['h']:02d}:00 | {c['median_ratio']} | {c['share_better']:.0%} | {'✓' if c['pass'] else '✗'} |" for c in r["per_checkpoint"]]
        md += ["", "Exceedance of the drawn U / D lines on test (targets p50 50%, p75 25%, p90 10%):", "",
               "| hours | " + " | ".join(sorted(next(iter(r['U_D_exceedance'].values())))) + " |",
               "|---|" + "---|" * len(next(iter(r['U_D_exceedance'].values())))]
        for g, d_ in r["U_D_exceedance"].items():
            md.append(f"| {g} | " + " | ".join(f"{d_[k]:.1%}" for k in sorted(d_)) + " |")
        md += ["", "Reach probability (morning p75 still reached today), test, by decile:", "",
               "| predicted | realised | n |", "|---|---|---|"] + [f"| {x['pred']:.0%} | {x['real']:.0%} | {x['n']} |" for x in r["reach_calibration"]]
        md.append("")
    (OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    if all(r["verdict"] == "PASS" for r in report["classes"].values()):
        OUT_JS.write_text("/**\n * Intraday range re-forecast params. GENERATED — do not hand-edit.\n"
                          " * Regenerate: python -m forge.run_intraday_range   (evidence: forge/INTRADAY_RANGE_PREREG.md)\n */\n"
                          f"export const INTRADAY_PARAMS = {json.dumps(params)};\n", encoding="utf-8")
        print("wrote", OUT_JS)
    else:
        print("not every class passed — params NOT written")


if __name__ == "__main__":
    main()
