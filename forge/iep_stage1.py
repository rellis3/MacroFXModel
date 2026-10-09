"""iep_stage1 — Stage 1 descriptive baselines for forge/INTRADAY_EXTREME_PATHS_PREREG.md. DISCOVERY BLOCK ONLY.

    python -m forge.iep_stage1

Descriptive: shares, date-clustered 95% intervals and the sign-flip null band. No hypothesis is tested here; nothing in
Validation/Confirmation/forward is loaded (rows with date >= 2022-01-01 are dropped at load).

Orientation o = sign(D) where |D| >= 0.25 (D = price vs London open in sigma). Primary outcome H = 2 h, barrier 1.0u:
CONT = barrier in the direction of o first, REV = opposite first, CONS = neither, AMB = same bar (excluded from shares
of resolved). "Large" = |D| >= 0.5 and >= the discovery class x hour 2/3 quantile of |D|. Late band (h 19-21) is shown
separately, never pooled. Cost: LINE_TOUCH_COST_PREREG table at its 2x baseline (estimates flagged), as cost / u.
Output: analysis/output/intraday_extreme_paths/STAGE1.md, stage1_tables.csv.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, OUT, SUM, cls_of, DISC_END

RNG = np.random.default_rng(20261010)
NPERM = 300
# round-trip spread, price units (LINE_TOUCH_COST_PREREG / vmcResearch/ext/feasibility.py) ...
SPREAD_PX = {"EURUSD": 0.00006, "GBPUSD": 0.00009, "USDJPY": 0.007, "AUDUSD": 0.00007, "USDCAD": 0.00008, "USDCHF": 0.00008,
             "EURJPY": 0.010, "GBPJPY": 0.014, "AUDJPY": 0.010, "EURGBP": 0.00008, "GOLD": 0.25, "NQ": 1.0, "SPX500": 0.5,
             "US30": 2.0, "DE30": 1.0, "UK100": 1.0, "CADJPY": 0.012, "CHFJPY": 0.014, "EURAUD": 0.00014, "EURCHF": 0.00010,
             "US2000": 0.4}
ESTIMATED = {"CADJPY", "CHFJPY", "EURAUD", "EURCHF", "US2000"}
CROSS_BP_EST = 1.5  # ... unlisted crosses: an estimate in basis points of price (listed crosses run 0.7-1.1bp), flagged
COST_MULT = 2.0


def band(h):
    return np.select([h < 7, h < 12, h < 16, h < 19], ["asia", "london", "overlap", "ny"], "late")


def load():
    parts = []
    for s in JOBS:
        x = pd.read_parquet(OUT / f"{s}.parquet")
        parts.append(x[x.date < DISC_END])  # discovery only
    d = pd.concat(parts, ignore_index=True)
    d["cls"] = d.inst.map(cls_of)
    d["band"] = band(d.h.to_numpy())
    d["o"] = np.where(d.D >= 0.25, 1, np.where(d.D <= -0.25, -1, 0))
    q = pd.read_csv(SUM / "large_move_tercile_edges_disc.csv")
    d = d.merge(q, on=["cls", "h"], how="left")
    d["large"] = (d.o != 0) & (d.D.abs() >= 0.5) & (d.D.abs() >= d.q67)
    d["pb"] = np.where(d.o == 1, d.hi_pb, d.lo_pb)
    d["age"] = np.where(d.o == 1, d.hi_age, d.lo_age)
    d["pb_bin"] = pd.cut(d.pb, [-1e-9, 0.15, 0.5, 1.0, 1e9], labels=["F<=0.15", "S0.15-0.5", "M0.5-1", "D>1"])
    d["age_bin"] = pd.cut(d.age, [-1, 59, 180, 1e9], labels=["<60m", "60-180m", ">180m"])
    d["regime"] = pd.cut(d.sigRel, [0, 0.85, 1.15, 99], labels=["quiet", "normal", "busy"])
    d["mom"] = d.o * d.m1
    # terciles WITHIN large-move rows, by class x hour (A4/A5 are about large moves; computed over all rows nearly every
    # large move lands in "high"). Edges saved for Validation, which must reuse them, not refit.
    L = d[d.large]
    edges = L.groupby(["cls", "h"]).agg(used_q1=("used50", lambda s: s.quantile(1 / 3)), used_q2=("used50", lambda s: s.quantile(2 / 3)),
                                        mom_q1=("mom", lambda s: s.quantile(1 / 3)), mom_q2=("mom", lambda s: s.quantile(2 / 3))).reset_index()
    edges.to_csv(SUM / "large_move_used_mom_tercile_edges_disc.csv", index=False)
    d = d.merge(edges, on=["cls", "h"], how="left")
    for col, src in (("used_t", "used"), ("mom_t", "mom")):
        x, q1, q2 = d[src if src == "mom" else "used50"], d[f"{src}_q1"], d[f"{src}_q2"]
        d[col] = pd.Categorical(np.select([x <= q1, x <= q2], ["low", "mid"], "high"), ["low", "mid", "high"])
    return d


def outcome(d, H=2, k=1.0):
    r = d[f"res{H}_{k}"]
    lab = np.select([r == 2, r == 0, r * d.o == 1, r * d.o == -1], ["AMB", "CONS", "CONT", "REV"], "NA")
    return pd.Series(lab, index=d.index)


def summarize(g, lab):
    lab = lab.loc[g.index]
    v = g[lab != "NA"]
    lv = lab[lab != "NA"]
    n = len(v)
    if n < 30:
        return None
    cont, rev, cons, amb = [(lv == x).to_numpy() for x in ("CONT", "REV", "CONS", "AMB")]
    res = cont | rev
    dates = v.date.to_numpy()
    out = {"n": n, "dates": int(pd.unique(dates).size), "CONT%": 100 * cont.mean(), "REV%": 100 * rev.mean(),
           "CONS%": 100 * cons.mean(), "AMB%": 100 * amb.mean()}
    nr = res.sum()
    if nr >= 30:
        y = cont[res].astype(float)
        p = y.mean()
        e = pd.Series(y - p).groupby(dates[res]).sum().to_numpy()
        se = np.sqrt((e ** 2).sum()) / nr
        # sign-flip null: flip orientation per (instrument, session) cluster -> CONT and REV swap inside the cluster
        cl = pd.Series(np.where(cont, 1.0, np.where(rev, -1.0, 0.0))).groupby((v.inst + v.date).to_numpy()).sum().to_numpy()
        flips = RNG.choice([-1.0, 1.0], size=(NPERM, cl.size))
        null = 0.5 + (flips @ cl) / (2 * nr)
        out |= {"CONT|res%": 100 * p, "ci_lo": 100 * (p - 1.96 * se), "ci_hi": 100 * (p + 1.96 * se),
                "null_lo": 100 * np.quantile(null, 0.025), "null_hi": 100 * np.quantile(null, 0.975)}
    return out


def table(d, lab, by, title, rows):
    for key, g in d.groupby(by, observed=True):
        s = summarize(g, lab)
        if s:
            rows.append({"table": title, "cell": key if isinstance(key, str) else " | ".join(map(str, key)), **s})


def secondary(d, H=2):
    """S1 sign, S2 extension, S3 failed continuation, S4 MFE/MAE quantiles (oriented, u units)."""
    v = d[d[f"res{H}_1.0"] != -9]
    end = v[f"end{H}"] * v.o
    mfe = np.where(v.o == 1, v[f"mfu{H}"], v[f"mfd{H}"])
    mae = np.where(v.o == 1, v[f"mfd{H}"], v[f"mfu{H}"])
    ext = np.where(v.o == 1, v[f"xhi{H}"], v[f"xlo{H}"])
    lab = outcome(v, H)
    cont = lab == "CONT"
    return {"n": len(v), "S1 P(end>0)%": 100 * (end > 0).mean(), "S1 mean end (u)": end.mean(),
            "S2 P(extend >=0.25u beyond E)%": 100 * (ext >= 0.25).mean(),
            "S3 P(close<entry | CONT first)%": 100 * (end[cont] < 0).mean(),
            "S4 MFE p25/p50/p75 (u)": np.round(np.quantile(mfe, [0.25, 0.5, 0.75]), 2).tolist(),
            "S4 MAE p25/p50/p75 (u)": np.round(np.quantile(mae, [0.25, 0.5, 0.75]), 2).tolist()}


def costs(d):
    import json
    prof = json.loads((SUM / "discovery_profile.json").read_text())
    out = []
    for inst, g in d[d.large & (d.h <= 20)].groupby("inst"):
        cl = cls_of(inst)
        share = g.h.map(lambda h: prof["share"][cl][f"{h}|2"]).to_numpy()
        u_frac = g.sig.to_numpy() / np.sqrt(252) / 100 * np.sqrt(share)  # u as a fraction of the open (open ~ price)
        if inst in SPREAD_PX:
            c_frac = SPREAD_PX[inst] / PRICE_MED[inst]  # price-unit spread as a fraction of the discovery median price
        else:
            c_frac = CROSS_BP_EST / 1e4
        ratio = COST_MULT * c_frac / u_frac
        out.append({"inst": inst, "cls": cl, "estimated": inst not in SPREAD_PX or inst in ESTIMATED,
                    "cost/u median": float(np.median(ratio)), "share cost/u>0.15 %": float(100 * (ratio > 0.15).mean())})
    return pd.DataFrame(out)


PRICE_MED: dict = {}


def main():
    d = load()
    for inst in JOBS:
        x = pd.read_parquet(OUT.parent.parent / "VolRangeForecaster" / "data" / "m1" / f"{JOBS[inst]}_m1.parquet", columns=["close"])
        PRICE_MED[inst] = float(x.close.loc[:"2021-12-31"].median())
    core = d[d.band != "late"]
    rows = []
    lab = outcome(d)
    table(core[core.o != 0], lab, "cls", "A. all oriented rows (|D|>=0.25), by class", rows)
    table(core[core.large], lab, "cls", "B. large moves, by class", rows)
    table(core[core.large], lab, ["pb_bin", "age_bin"], "C. large: pullback x age of extreme", rows)
    table(core[core.large], lab, "used_t", "D. large: range used (terciles of used / disc HL p50 within large moves, class x hour)", rows)
    table(core[core.large], lab, "mom_t", "E. large: momentum o*1h return (terciles within large moves, class x hour)", rows)
    table(core[core.large], lab, "regime", "F. large: sigma regime", rows)
    table(core[core.large], lab, "band", "G. large: hour band", rows)
    table(core[core.large & (core.pb <= 0.15) & (core.age < 60)], lab, "cls", "H. large AND fresh extreme (F, <60m), by class", rows)
    table(core[core.o == 0].assign(o=1), outcome(core[core.o == 0].assign(o=1)), "cls",
          "I. flat rows (|D|<0.25): CONS baseline (CONT/REV here = up/down)", rows)
    late = d[(d.band == "late") & d.large]
    table(late, outcome(late, H=1), "cls", "J. LATE stratum (h 19-21), large, H=1h", rows)
    for H in (1, 4):
        sub = core[core.large & (core.h + H <= 22)]
        table(sub, outcome(sub, H), "cls", f"K. large, H={H}h, 1.0u", rows)
    sub = core[core.large]
    table(sub, outcome(sub, 2, 0.5), "cls", "L. large, H=2h, 0.5u", rows)
    T = pd.DataFrame(rows)
    num = T.select_dtypes("number").columns
    T[num] = T[num].round(2)
    T.to_csv(SUM / "stage1_tables.csv", index=False)
    sec = pd.DataFrame({cl: secondary(g) for cl, g in core[core.large & (core.h <= 20)].groupby("cls")}).T
    C = costs(d)
    Cc = C.groupby("cls").agg(**{"instruments": ("inst", "size"), "cost/u median": ("cost/u median", "median"),
                                "share cost/u>0.15 %": ("share cost/u>0.15 %", "median"), "any estimated": ("estimated", "sum")}).round(3)
    md = ["# INTRADAY-EXTREME-PATHS - Stage 1 descriptive baselines (DISCOVERY 2016-2021 only)", "",
          "Descriptive only: no hypothesis test (prereg section 10). Shares are of rows with an outcome; CONT|res = CONT among",
          "CONT+REV with a date-clustered 95% interval; null_lo/null_hi = 95% band of the same share under the sign-flip null",
          "(orientation randomised per instrument-session). Primary H=2h, 1.0u unless stated; late band never pooled.", ""]
    for t, g in T.groupby("table", sort=False):
        md += [f"## {t}", "```", g.drop(columns="table").to_string(index=False), "```", ""]
    md += ["## M. Secondary outcomes, large moves, H=2h (oriented; u units)", "```", sec.to_string(), "```", "",
           "## N. Cost feasibility (2x the registered spread table, as cost / u at H=2h, large-move rows)", "```", Cc.to_string(), "```",
           "Per instrument: stage1_costs.csv. For a symmetric ±1u race with exits at the barriers, the break-even is",
           "CONT% - REV% (of all rows) > cost/u, before any CONS-exit P&L.", ""]
    C.round(3).to_csv(SUM / "stage1_costs.csv", index=False)
    (SUM / "STAGE1.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
