"""round-break-follow (forge/ROUND_BREAK_FOLLOW_PREREG.md): stop orders through round numbers on real bid/ask M1.

    python scripts/round-break-follow/run.py --stage events      # replay discovery and confirmation windows
    python scripts/round-break-follow/run.py --stage discover    # all 24 variants on discovery; writes selected.json
    python scripts/round-break-follow/run.py --stage confirm     # the selected variant on confirmation; needs selected.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402
from forge.stop_fill import first_trigger, stop_trade  # noqa: E402
from round_numbers import grid_levels, race, step_of  # noqa: E402

OUT = ROOT / "analysis/output/round-break-follow"
BA = ROOT / "data/m1_bidask"
HIST = ROOT / "analysis/output/forecast_history"
MAJORS = ("EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF")
CROSSES = ("EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "EURAUD", "GBPAUD", "EURCHF", "CADJPY")
SECONDARY = ("GOLD",) + CROSSES
DISC = ("2020-08-21", "2026-08-20")
CONF = ("2016-10-21", "2020-08-20")
STOPS = (0.25, 0.5, 0.75, 1.0)
RATIOS = (1.0, 2.0)
EXITS = (120, 240, "end")
VARIANTS = [(s, t, e) for s in STOPS for t in RATIOS for e in EXITS]
T_MIN, T_MAX, SESSION_END = 60, 20 * 60, 22 * 60
DIST_MIN, DIST_MAX = 0.1, 3.0
DIST_EDGES = [0.1, 0.3, 0.5, 0.75, 1.0, 1.5, 3.0001]


def vname(v):
    return f"S{v[0]}_T{v[1]}_X{v[2]}"


def load_ba(sym):
    df = pd.read_parquet(BA / f"{sym.lower()}_m1.parquet" if sym != "GOLD" else BA / "gold_m1.parquet")
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London")
    df = df.assign(date=idx.strftime("%Y-%m-%d"), min=idx.hour * 60 + idx.minute, _t=idx)
    df = df[(df["min"] < SESSION_END) & (df.date >= CONF[0]) & (df.date <= DISC[1])].sort_values("_t", kind="stable")
    cols = ["min", "high", "low", "close", "bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c"]
    A = {c: df[c].to_numpy(float) for c in cols}
    d = df.date.to_numpy()
    starts = np.flatnonzero(np.r_[True, d[1:] != d[:-1]])
    ends = np.r_[starts[1:], len(d)]
    return A, {d[a]: (a, b) for a, b in zip(starts, ends)}


def replay(sym):
    T = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used", "nbars"])
    T = T[(T.date >= CONF[0]) & (T.date <= DISC[1]) & (T.live_sig_used > 0)]
    A, days = load_ba(sym)
    S_ = step_of(sym)
    rows = []
    for r in T.itertuples():
        if r.date not in days:
            continue
        a, b = days[r.date]
        if b - a < 60:
            continue
        x = {k: v[a:b] for k, v in A.items()}
        mins = x["min"]
        sigp = r.open * r.live_sig_used / 100
        fills = {k: x[k] for k in ("bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c")}
        spread = float(np.nanmedian(x["ask_c"] - x["bid_c"]))
        chi, clo = np.maximum.accumulate(x["ask_h"]), np.minimum.accumulate(x["bid_l"])
        for label, levels in grid_levels(r.open - DIST_MAX * sigp, r.open + DIST_MAX * sigp, S_).items():
            for lv in levels:
                dist = abs(lv - r.open) / sigp
                if dist < DIST_MIN:
                    continue
                side = 1 if lv > r.open else -1
                k = int(np.searchsorted(chi, lv, "left")) if side > 0 else int(np.searchsorted(-clo, -lv, "left"))
                if k >= len(mins) or k == 0:
                    continue
                m = int(mins[k])
                if m < T_MIN or m > T_MAX:
                    continue
                rec = {"inst": sym, "date": r.date, "grid": "round" if label != "arb" else "arb", "dist": dist, "minute": m, "side": side,
                       "spread_R25": spread / (0.25 * sigp),
                       "mid_outcome": race(x["high"], x["low"], x["close"], mins, k, lv, side, sigp, 0.25, 120)[0]}
                for v in VARIANTS:
                    st = v[0] * sigp
                    end = len(mins) if v[2] == "end" else int(np.searchsorted(mins, m + v[2], "right"))
                    rec[vname(v)] = stop_trade(side, lv, k, st, st * v[1], end, **fills)["r"]
                rows.append(rec)
    print(sym, len(rows), flush=True)
    return pd.DataFrame(rows)


def stage_events():
    OUT.mkdir(parents=True, exist_ok=True)
    pd.concat([replay(s) for s in MAJORS + SECONDARY], ignore_index=True).to_parquet(OUT / "events.parquet", index=False)


def strata(d):
    b = np.digitize(d.dist.to_numpy(), DIST_EDGES)
    sess = np.select([d.minute < 7 * 60, d.minute < 12 * 60], [0, 1], 2)
    return pd.Series(b * 100 + sess * 10).astype(str).to_numpy() + d.inst.to_numpy()


def weights(a, r):
    sa, sr = pd.Series(strata(a)), pd.Series(strata(r))
    return (sr.value_counts() / sa.value_counts()).reindex(sa).fillna(0.0).to_numpy()


def window(D, w):
    return D[(D.date >= w[0]) & (D.date <= w[1])]


def diff(bs, r, ry, a, ay, w):
    r_n, r_d = bs.sums(r.date, ry), bs.sums(r.date, np.ones(len(r)))
    a_n, a_d = bs.sums(a.date, ay * w), bs.sums(a.date, w)
    reps = (bs.W @ r_n) / (bs.W @ r_d) - (bs.W @ a_n) / (bs.W @ a_d)
    return {"round": round(float(r_n.sum() / r_d.sum()), 4), "arb": round(float(a_n.sum() / a_d.sum()), 4), "diff": round(float(r_n.sum() / r_d.sum() - a_n.sum() / a_d.sum()), 4),
            "lo": round(float(np.percentile(reps, 2.5)), 4), "hi": round(float(np.percentile(reps, 97.5)), 4)}, reps


def stage_discover():
    D = window(pd.read_parquet(OUT / "events.parquet"), DISC)
    M = D[D.inst.isin(MAJORS)]
    bs = LR.Boot(M.date)
    R, A = M[M.grid == "round"], M[M.grid == "arb"]
    w = weights(A, R)
    rows = []
    for v in VARIANTS:
        n = vname(v)
        ci = bs.mean(R.date, R[n].to_numpy())[0]
        d, _ = diff(bs, R, R[n].to_numpy(), A, A[n].to_numpy(), w)
        rows.append({"variant": n, "stop": v[0], "ratio": v[1], "exit": v[2], "n": int(len(R)), "net": ci[0], "lo": ci[1], "hi": ci[2], "arb": d["arb"], "vs_arb": d["diff"], "vs_lo": d["lo"], "vs_hi": d["hi"]})
    T = pd.DataFrame(rows).sort_values("net", ascending=False)
    T.to_csv(OUT / "discovery.csv", index=False)
    sel = T.iloc[0].to_dict()
    (OUT / "selected.json").write_text(json.dumps(sel, indent=1, default=str))
    print(T.to_string(index=False))
    print("SELECTED", sel["variant"])


def stage_confirm():
    sel = json.loads((OUT / "selected.json").read_text())
    n = sel["variant"]
    All = pd.read_parquet(OUT / "events.parquet")
    D = window(All, CONF)
    M = D[D.inst.isin(MAJORS)].copy()
    bs = LR.Boot(M.date)
    R, A = M[M.grid == "round"], M[M.grid == "arb"]
    w = weights(A, R)
    res = {"id": "round-break-follow", "seed": 20261107, "B": 2000, "selected": sel, "n_round": int(len(R)), "n_arb": int(len(A)), "cells": {}}
    Rr, Ar = R[R.mid_outcome.isin(["reject", "break"])], A[A.mid_outcome.isin(["reject", "break"])]
    wr = weights(Ar, Rr)
    c1, r1 = diff(bs, Rr, (Rr.mid_outcome == "reject").to_numpy(float), Ar, (Ar.mid_outcome == "reject").to_numpy(float), wr)
    c1["p"] = float((r1 >= 0).mean())
    c2, r2 = diff(bs, R, R[n].to_numpy(), A, A[n].to_numpy(), w)
    c2["p"] = float((r2 <= 0).mean())
    ci, rp = bs.mean(R.date, R[n].to_numpy())
    c3 = {"net": ci[0], "lo": ci[1], "hi": ci[2], "p": float((rp <= 0).mean())}
    by_year = {y: round(float(g[n].mean()), 4) for y, g in R.groupby(R.date.str[:4])}
    c3["by_year"] = by_year
    c3["positive_2017_2020"] = int(sum(by_year.get(y, -1) > 0 for y in ("2017", "2018", "2019", "2020")))
    res["cells"] = {"C1_reject_round_minus_arb": c1, "C2_net_round_minus_arb": c2, "C3_net_round": c3}
    order = sorted(res["cells"], key=lambda k: res["cells"][k]["p"])
    prev = 0.0
    for i, k in enumerate(order):
        prev = max(prev, min(1.0, res["cells"][k]["p"] * (len(order) - i)))
        res["cells"][k]["p_holm"] = round(prev, 4)
    S = {k: v["p_holm"] < 0.05 for k, v in res["cells"].items()}
    c3ok = S["C3_net_round"] and c3["lo"] > 0 and c3["positive_2017_2020"] >= 3
    loc = S["C1_reject_round_minus_arb"] or S["C2_net_round_minus_arb"]
    if S["C1_reject_round_minus_arb"] and S["C2_net_round_minus_arb"] and c3ok:
        res["verdict"] = "VALIDATED"
    elif loc:
        res["verdict"] = "UNDERPOWERED" if (c3["net"] > 0 and c3["lo"] <= 0) else "CONTEXT"
    else:
        res["verdict"] = "NULL"
    extra = (R.spread_R25.to_numpy() * 0.25 / sel["stop"]) * 0.5
    res["sensitivity_extra_half_spread"] = bs.mean(R.date, R[n].to_numpy() - extra)[0]
    res["by_instrument"] = {i: {"n": int(len(g)), "net": round(float(g[n].mean()), 4)} for i, g in R.groupby("inst")}
    res["fade_mirror_note"] = "the follow's negative, before a second spread: not a real fill"
    rows = {}
    for inst in sorted(D.inst.unique()):
        g = D[D.inst == inst]
        rows[inst] = {"round": round(float(g[g.grid == "round"][n].mean()), 4), "arb": round(float(g[g.grid == "arb"][n].mean()), 4), "n": int((g.grid == "round").sum())}
    res["all_instruments_selected_variant"] = rows
    # discovery view of the same variant, in-sample after selection
    Dd = window(All, DISC)
    res["discovery_all_instruments"] = {i: {"round": round(float(g[g.grid == "round"][n].mean()), 4), "arb": round(float(g[g.grid == "arb"][n].mean()), 4), "n": int((g.grid == "round").sum())} for i, g in Dd.groupby("inst")}
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["events", "discover", "confirm"], required=True)
    a = ap.parse_args()
    {"events": stage_events, "discover": stage_discover, "confirm": stage_confirm}[a.stage]()
