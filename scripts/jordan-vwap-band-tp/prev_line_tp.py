"""jordan-vwap-band-tp part F (POST-HOC, exploratory): fade a Jordan line, take profit at the PREVIOUS line.

Owner 2026-11-25: "can we do it with TP based off the previous line". Every touch of Close+/Close- and the HL moving
projections (median / 75th / 90th), faded at the line, Jordan's stops (GC 75 ticks, NQ 150 ticks, EURUSD / USDJPY
12 pips), hard close 22:00 London. Two definitions of the previous line:
  A same family:   90th -> 75th, 75th -> median, median -> the session open
  B nearest line:  the nearest of ALL his lines on that side (Close+-, HL projection; any tier) lying inside the entry by
                   more than 0.05 line-sigma, else the open
Stop checked from the touch bar, target from the next bar, tie = stop. MAE only while the trade is open (Jordan's
method). Placebo: the whole ladder scaled by one draw of 0.75-0.90 / 1.10-1.25 per session (entry and target lines).
Futures net of 2.5 ticks.

    python scripts/jordan-vwap-band-tp/prev_line_tp.py -> analysis/output/jordan-vwap-band-tp/F_prev_line_*.csv
"""
from __future__ import annotations

import importlib.util
import zlib
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("jl", HERE / "jordan_like.py")
JL = importlib.util.module_from_spec(spec); spec.loader.exec_module(JL)
VB, JLM, L, LTE, ft, NOHIT = JL.VB, JL.JLM, JL.L, JL.LTE, JL.ft, JL.NOHIT
CRC = VB.CRC
OUT = VB.OUT
JORDAN = {"GOLD": (43.8, 33.8, 76.3, 86.8), "NQ": (107.7, 114.0, 161.4, 185.1),
          "EURUSD": (10.9, 12.2, 14.5, 18.2), "USDJPY": (10.1, 12.0, 13.8, 16.8)}
MIN_GAP = 0.05


def trade(h, l, c, t, entry, S, tp, short):
    hh, ll = h[t:], l[t:]
    stop = entry + S if short else entry - S
    js = ft(hh >= stop) if short else ft(ll <= stop)
    tm = ((ll <= tp) if short else (hh >= tp)).copy(); tm[0] = False
    jt = ft(tm)
    if js <= jt and js < NOHIT:
        j, ex, how = js, stop, "sl"
    elif jt < NOHIT:
        j, ex, how = jt, tp, "tp"
    else:
        j, ex, how = len(hh) - 1, c[-1], "time"
    mae = (hh[:j + 1].max() - entry) if short else (entry - ll[:j + 1].min())
    return ((entry - ex) if short else (ex - entry)), max(mae, 0.0), how


def main():
    rows = []
    for sym, (S, unit_px, unit) in JL.STOPS.items():
        dates, lv, sg, _ = JLM.levels(sym, "F")
        m = L.load_m1(sym, "F", "unadj")
        lt = m.index.tz_convert("Europe/London")
        keep = (lt.hour < 22) & (lt.dayofweek < 5)
        m, lt = m[keep], lt[keep]
        di = pd.Index(lt.tz_localize(None).normalize())
        H, Lo, O, C = (m[c].to_numpy() for c in ("high", "low", "open", "close"))
        tick = JLM.tick_of(C[-200000:])
        st = np.flatnonzero(np.r_[True, di[1:] != di[:-1]]); en = np.r_[st[1:], len(di)]
        pos = {di[s]: (s, e) for s, e in zip(st, en)}
        rng = np.random.default_rng([VB.SEED, zlib.crc32(f"{sym}:prevline".encode())])
        for i, dt in enumerate(dates):
            if dt.year < 2020 or dt not in pos:
                continue
            s, e = pos[dt]
            if e - s < 600 or not all(np.isfinite(lv[q][i, 0]) for q in ("hl", "cup", "cdn")):
                continue
            h, l, c, o, n = H[s:e], Lo[s:e], C[s:e], O[s], e - s
            rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])
            rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
            hlpx = lv["hl"][i] * o / 100
            mult = rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25)
            for kind in ("line", "placebo"):
                mk = 1.0 if kind == "line" else mult
                # every line as a price path, per side
                lines = {
                    "cup": [np.full(n, o * (1 + lv["cup"][i, j] * mk / 100)) for j in range(3)],
                    "cdn": [np.full(n, o * (1 - lv["cdn"][i, j] * mk / 100)) for j in range(3)],
                    "hlH": [rl + hlpx[j] * mk for j in range(3)],
                    "hlL": [rh - hlpx[j] * mk for j in range(3)],
                }
                side_of = {"cup": True, "hlH": True, "cdn": False, "hlL": False}
                for tl, (ab, sq, grp) in JLM.TL.items():
                    sig = sg[sq][i] * o / 100
                    same_side = [p for q, ps in lines.items() if side_of[q] == ab for p in ps]
                    for j, tau in enumerate(VB.TAUS):
                        P = lines[tl][j]
                        for t in LTE.touches(h, l, P, VB.REARM * sig, ab):
                            Pt = float(P[t])
                            tpA = o if j == 0 else float(lines[tl][j - 1][t])
                            cand = [float(p[t]) for p in same_side]
                            inside = [x for x in cand if ((Pt - x) if ab else (x - Pt)) > MIN_GAP * sig]
                            tpB = (max(inside) if ab else min(inside)) if inside else o
                            for var, tp in (("A same family", tpA), ("B nearest line", tpB)):
                                if not ((tp < Pt) if ab else (tp > Pt)):
                                    continue
                                pnl, mae, how = trade(h, l, c, t, Pt, S, tp, ab)
                                rows.append((sym, unit, dt, dt.year, kind, grp, int(tau * 100), var,
                                             pnl / S, (pnl - 2.5 * tick) / S, mae / unit_px, abs(Pt - tp) / S, how))
        print(sym, "done", flush=True)
    D = pd.DataFrame(rows, columns=["sym", "unit", "date", "year", "kind", "lines", "tier", "variant",
                                    "R", "R_net", "mae", "tp_R", "how"])
    D.to_parquet(OUT / "touches" / "F_prev_line.parquet")
    ln = D[D.kind == "line"]

    def mae_tab(g):
        v = g["mae"]
        return pd.Series({"n": len(g), "mean": v.mean(), "median": v.median(), "p75": v.quantile(.75),
                          "p90": v.quantile(.9), "tp_R_median": g["tp_R"].median(), "win": (g["how"] == "tp").mean(),
                          "R_gross": g["R"].mean(), "R_net": g["R_net"].mean()})
    T = ln.groupby(["variant", "sym", "unit"]).apply(mae_tab).reset_index()
    T["jordan"] = T["sym"].map(lambda s: " / ".join(f"{x:g}" for x in JORDAN[s]))
    T["fit_err"] = [np.mean([abs(a - b) / b for a, b in zip((r["mean"], r["median"], r["p75"], r["p90"]), JORDAN[r["sym"]])])
                    for _, r in T.iterrows()]
    T.to_csv(OUT / "F_prev_line_mae.csv", index=False)
    ln.groupby(["variant", "sym", "lines", "tier"]).apply(mae_tab).reset_index().to_csv(OUT / "F_prev_line_by_tier.csv", index=False)
    # edge check: line vs scaled ladder, date-clustered
    E = []
    for var, g in D.groupby("variant"):
        for col in ("R", "R_net"):
            vs = CRC.dboot(g, col, against="placebo")
            own = CRC.dboot(g[g.kind == "line"], col)
            E.append({"variant": var, "stat": col, "line": own[0], "line_ci": own[1], "line_minus_placebo": vs[0], "ci": vs[1],
                      "halves_vs_placebo": {h: CRC.dboot(g[(g.year >= a) & (g.year <= b)], col, against="placebo")[0]
                                            for h, (a, b) in VB.HALVES.items()}})
        for (sym, tier), gg in g.groupby(["sym", "tier"]):
            vs = CRC.dboot(gg, "R", B=300, against="placebo")
            E.append({"variant": var, "stat": f"R {sym} tier {tier}", "line": float(gg[gg.kind == 'line']['R'].mean()),
                      "line_minus_placebo": vs[0], "ci": vs[1]})
    pd.DataFrame(E).to_csv(OUT / "F_prev_line_edge.csv", index=False)
    pd.set_option("display.width", 250)
    print(T.round(2).to_string(index=False))
    print(pd.DataFrame(E).round(4).to_string(index=False))


if __name__ == "__main__":
    main()
