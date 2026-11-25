"""jordan-vwap-band-tp part G (POST-HOC, exploratory): Jordan's line-to-line MAE (his diagram, 2026-11-25).

Jordan's sketch: MAE for L1 is measured from the touch of L1 and STOPS being measured when price reaches L2 (the next
line out); from there the excursion belongs to L2. So the next line out acts as the stop, and the MAE of L1 is capped
at the L1->L2 gap. The owner's old model took profit at the next line in. Fade every touch of Close+/- and the HL
moving projections. Outer line (stop) two ways:
  A same family:  median -> 75th, 75th -> 90th (90th has no outer line: excluded)
  B nearest line: nearest of ALL his lines on that side lying beyond the entry by > 0.05 line-sigma (none: excluded)
End if the outer line is not reached: "eod" = 22:00 London, or "tp prev" = the previous line in (same rule as part F:
A = same family inner tier / open; B = nearest of all lines inside). MAE from the touch bar to the exit bar, capped at
the gap where the outer line was hit. R = pnl / gap at entry (gaps <= 0.05 line-sigma skipped); futures net of 2.5 ticks. Placebo: whole ladder scaled per session (0.75-0.90 / 1.10-1.25).

    python scripts/jordan-vwap-band-tp/next_line_mae.py -> analysis/output/jordan-vwap-band-tp/G_next_line_*.csv
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


def trade(h, l, c, t, entry, stopP, tp, short):
    """stopP: outer-line price path (from bar t). tp: float or None. Returns pnl, mae (capped at gap), how."""
    hh, ll, sp = h[t:], l[t:], stopP[t:]
    js = ft(hh >= sp) if short else ft(ll <= sp)
    jt = NOHIT
    if tp is not None:
        tm = ((ll <= tp) if short else (hh >= tp)).copy(); tm[0] = False
        jt = ft(tm)
    if js <= jt and js < NOHIT:
        j, ex, how = js, float(sp[js]), "outer"
    elif jt < NOHIT:
        j, ex, how = jt, tp, "tp"
    else:
        j, ex, how = len(hh) - 1, c[-1], "time"
    gap = abs(float(sp[min(j, len(sp) - 1)]) - entry)      # cap for MAE: the gap where the outer line was hit
    gap0 = abs(float(sp[0]) - entry)                        # risk for R: the gap at entry
    mae = (hh[:j + 1].max() - entry) if short else (entry - ll[:j + 1].min())
    return ((entry - ex) if short else (ex - entry)), min(max(mae, 0.0), gap), how, gap0


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
        rng = np.random.default_rng([VB.SEED, zlib.crc32(f"{sym}:nextline".encode())])
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
                            # outer line (stop)
                            outA = lines[tl][j + 1] if j < 2 else None
                            beyond = [p for p in same_side if ((float(p[t]) - Pt) if ab else (Pt - float(p[t]))) > MIN_GAP * sig]
                            outB = (min(beyond, key=lambda p: float(p[t])) if ab else max(beyond, key=lambda p: float(p[t]))) if beyond else None
                            # inner line (tp)
                            tpA = o if j == 0 else float(lines[tl][j - 1][t])
                            inside = [float(p[t]) for p in same_side if ((Pt - float(p[t])) if ab else (float(p[t]) - Pt)) > MIN_GAP * sig]
                            tpB = (max(inside) if ab else min(inside)) if inside else o
                            for var, outP, tpp in (("A same family", outA, tpA), ("B nearest line", outB, tpB)):
                                if outP is None or abs(float(outP[t]) - Pt) <= MIN_GAP * sig:
                                    continue
                                if not ((tpp < Pt) if ab else (tpp > Pt)):
                                    tpp = None
                                for end, tp in (("eod", None), ("tp prev", tpp)):
                                    if end == "tp prev" and tp is None:
                                        continue
                                    pnl, mae, how, gap = trade(h, l, c, t, Pt, outP, tp, ab)
                                    rows.append((sym, unit, dt, dt.year, kind, grp, int(tau * 100), var, end,
                                                 pnl / gap, (pnl - 2.5 * tick) / gap, mae / unit_px, gap / unit_px,
                                                 gap / S, how))
        print(sym, "done", flush=True)
    D = pd.DataFrame(rows, columns=["sym", "unit", "date", "year", "kind", "lines", "tier", "variant", "end",
                                    "R", "R_net", "mae", "gap", "gap_vs_jstop", "how"])
    D.to_parquet(OUT / "touches" / "G_next_line.parquet")
    ln = D[D.kind == "line"]

    def tab(g):
        v = g["mae"]
        return pd.Series({"n": len(g), "mean": v.mean(), "median": v.median(), "p75": v.quantile(.75),
                          "p90": v.quantile(.9), "gap_median": g["gap"].median(),
                          "gap_vs_jstop": g["gap_vs_jstop"].median(), "outer_hit": (g["how"] == "outer").mean(),
                          "tp_hit": (g["how"] == "tp").mean(), "R_gross": g["R"].mean(), "R_net": g["R_net"].mean()})
    T = ln.groupby(["variant", "end", "sym", "unit"]).apply(tab).reset_index()
    T["jordan"] = T["sym"].map(lambda s: " / ".join(f"{x:g}" for x in JORDAN[s]))
    T["fit_err"] = [np.mean([abs(a - b) / b for a, b in zip((r["mean"], r["median"], r["p75"], r["p90"]), JORDAN[r["sym"]])])
                    for _, r in T.iterrows()]
    T.to_csv(OUT / "G_next_line_mae.csv", index=False)
    ln.groupby(["variant", "end", "sym", "lines", "tier"]).apply(tab).reset_index().to_csv(OUT / "G_next_line_by_tier.csv", index=False)
    E = []
    for (var, end), g in D[D["end"] == "tp prev"].groupby(["variant", "end"]):
        for col in ("R", "R_net"):
            vs = CRC.dboot(g, col, against="placebo")
            own = CRC.dboot(g[g.kind == "line"], col)
            E.append({"variant": var, "end": end, "stat": col, "line": own[0], "line_ci": own[1],
                      "line_minus_placebo": vs[0], "ci": vs[1],
                      "halves_vs_placebo": {hh: CRC.dboot(g[(g.year >= a) & (g.year <= b)], col, against="placebo")[0]
                                            for hh, (a, b) in VB.HALVES.items()}})
        for sym, gg in g.groupby("sym"):
            vs = CRC.dboot(gg, "R", B=300, against="placebo")
            E.append({"variant": var, "end": end, "stat": f"R {sym}", "line": float(gg[gg.kind == 'line']['R'].mean()),
                      "line_minus_placebo": vs[0], "ci": vs[1]})
    pd.DataFrame(E).to_csv(OUT / "G_next_line_edge.csv", index=False)
    pd.set_option("display.width", 260)
    print(T.round(2).to_string(index=False))
    print(pd.DataFrame(E).round(4).to_string(index=False))


if __name__ == "__main__":
    main()
