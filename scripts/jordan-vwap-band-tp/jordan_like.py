"""jordan-vwap-band-tp part E (POST-HOC, descriptive): Jordan's own MAE method (Misc/mae_analysis.py) on our lines.

MAE is measured only while the trade is open (entry bar .. exit bar inclusive), as his script does. Fade at every touch
of Close+/Close- and the HL projections (median / 75th / 90th = "tiers"), stop = Jordan's stop sizes (GC 75 ticks,
NQ 150 ticks, 6E 12 pips, 6J 12 pips), exit at the stop or the 22:00 London hard close (variant "hard close"), or
also at a 1R target (variant "1R"). Reported in ticks / pips and % of risk, by tier and by winners vs losers.

    python scripts/jordan-vwap-band-tp/jordan_like.py  -> analysis/output/jordan-vwap-band-tp/E_jordan_like_*.csv
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("vb", Path(__file__).resolve().parent / "run.py")
VB = importlib.util.module_from_spec(spec); spec.loader.exec_module(VB)
JLM, L, LTE, ft, NOHIT = VB.JLM, VB.L, VB.LTE, VB.ft, VB.NOHIT
OUT = VB.OUT
# stop size in price units of our series, and the reporting unit
STOPS = {"GOLD": (75 * 0.10, 0.10, "ticks"), "NQ": (150 * 0.25, 0.25, "ticks"),
         "EURUSD": (12 * 0.0001, 0.0001, "pips"), "USDJPY": (12 * 0.01, 0.01, "pips")}


def trade(h, l, c, t, entry, S, short, tp_on):
    """Return (pnl, mae) in price; stop checked from the touch bar, target from the next bar, else 22:00 close."""
    hh, ll = h[t:], l[t:]
    stop = entry + S if short else entry - S
    js = ft(hh >= stop) if short else ft(ll <= stop)
    jt = NOHIT
    if tp_on:
        tg = entry - S if short else entry + S
        tm = (ll <= tg) if short else (hh >= tg)
        tm = tm.copy(); tm[0] = False
        jt = ft(tm)
    if js <= jt and js < NOHIT:
        j, ex = js, stop
    elif jt < NOHIT:
        j, ex = jt, (entry - S if short else entry + S)
    else:
        j, ex = len(hh) - 1, c[-1]
    mae = (hh[:j + 1].max() - entry) if short else (entry - ll[:j + 1].min())
    pnl = (entry - ex) if short else (ex - entry)
    return pnl, max(mae, 0.0)


def main():
    rows = []
    for sym, (S, unit_px, unit) in STOPS.items():
        dates, lv, sg, _ = JLM.levels(sym, "F")
        m = L.load_m1(sym, "F", "unadj")
        lt = m.index.tz_convert("Europe/London")
        keep = (lt.hour < 22) & (lt.dayofweek < 5)
        m, lt = m[keep], lt[keep]
        di = pd.Index(lt.tz_localize(None).normalize())
        H, Lo, O, C = (m[c].to_numpy() for c in ("high", "low", "open", "close"))
        st = np.flatnonzero(np.r_[True, di[1:] != di[:-1]]); en = np.r_[st[1:], len(di)]
        pos = {di[s]: (s, e) for s, e in zip(st, en)}
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
            for tl, (ab, sq, grp) in JLM.TL.items():
                sig = sg[sq][i] * o / 100
                for j, tau in enumerate(VB.TAUS):
                    if tl == "cup":
                        P = np.full(n, o * (1 + lv["cup"][i, j] / 100))
                    elif tl == "cdn":
                        P = np.full(n, o * (1 - lv["cdn"][i, j] / 100))
                    elif tl == "hlH":
                        P = rl + hlpx[j]
                    else:
                        P = rh - hlpx[j]
                    for t in LTE.touches(h, l, P, VB.REARM * sig, ab):
                        Pt = float(P[t])
                        for var, tp_on in (("hard close", False), ("1R", True)):
                            pnl, mae = trade(h, l, c, t, Pt, S, ab, tp_on)
                            rows.append((sym, unit, dt.year, grp, int(tau * 100), var, pnl / unit_px, mae / unit_px,
                                         S / unit_px, S / sig))
        print(sym, "done", flush=True)
    D = pd.DataFrame(rows, columns=["sym", "unit", "year", "lines", "tier", "variant", "pnl", "mae", "stop", "stop_sig"])
    D["win"] = D["pnl"] > 0
    D["mae_pct_risk"] = D["mae"] / D["stop"] * 100

    def agg(g):
        return pd.Series({"n": len(g), "mean": g["mae"].mean(), "median": g["mae"].median(), "p75": g["mae"].quantile(.75),
                          "p90": g["mae"].quantile(.9), "win_rate": g["win"].mean(), "pnl_mean": g["pnl"].mean(),
                          "mae_pct_risk_median": g["mae_pct_risk"].median(),
                          "share_mae_ge_80pct_risk": (g["mae_pct_risk"] >= 80).mean(),
                          "stop_sigma_median": g["stop_sig"].median()})
    T = D.groupby(["sym", "unit", "variant"]).apply(agg).reset_index()
    T.to_csv(OUT / "E_jordan_like_overall.csv", index=False)
    D.groupby(["sym", "unit", "variant", "lines", "tier"]).apply(agg).reset_index().to_csv(OUT / "E_jordan_like_by_tier.csv", index=False)
    W = D.assign(result=np.where(D["win"], "win", "loss")).groupby(["sym", "unit", "variant", "result"]).apply(agg).reset_index()
    W.to_csv(OUT / "E_jordan_like_win_loss.csv", index=False)
    pd.set_option("display.width", 250)
    print(T.round(2).to_string(index=False))
    print(W.round(2).to_string(index=False))


if __name__ == "__main__":
    main()
