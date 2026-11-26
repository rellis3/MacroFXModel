"""gold-calc-upgrades follow-up, EXPLORATORY (not pre-registered): MAE at Jordan's lines, export calc (HARCJ) vs shadow
calc (N7_ALL), gold futures (GC), 2020 -> 2026-08-21.

    python scripts/gold-calc-upgrades/mae_compare.py  -> analysis/output/gold-calc-upgrades/mae_compare.{csv,txt}

Lines per session (London 00:00-22:00), from each calc's sigma x walk-forward width (fitted on earlier years only):
  Close+ = open x (1 + w), Close- = open x (1 - w); HL projections: running low + HL w (upper), running high - HL w (lower).
First touch of each line, faded (Jordan's way: short the upper lines, long the lower ones), entry at the line.
  mae60   : worst adverse move in the 60 minutes after the touch, uncapped ($ and ticks of 0.10)
  jordan  : his trade: stop 75 ticks, target 75 ticks (1R); MAE while the trade is open; win = target first
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sp = importlib.util.spec_from_file_location("g", ROOT / "scripts/gold-calc-upgrades/score.py")
G = importlib.util.module_from_spec(sp)
sp.loader.exec_module(G)
OUT = ROOT / "analysis/output/gold-calc-upgrades"
TICK, STOP = 0.10, 7.50
CALCS = {"export (HARCJ)": "HARCJ", "shadow (N7)": "N7_ALL"}


def minute_sessions():
    m = pd.read_parquet(ROOT / "analysis/output/nt8/continuous/GC_1m_unadj.parquet")
    m["t"] = pd.to_datetime(m.timestamp, utc=True) - pd.Timedelta(minutes=1)
    lt = m["t"].dt.tz_convert("Europe/London")
    m = m[(lt.dt.hour < 22) & (lt.dt.dayofweek < 5)].assign(d=lt.dt.tz_localize(None).dt.normalize())
    return {d: (g.open.to_numpy(), g.high.to_numpy(), g.low.to_numpy()) for d, g in m.groupby("d")}


def fade(h, l, k, P, side):
    """side +1 = short at an upper line, -1 = long at a lower line. Returns mae60 ($), jordan mae ($), win (bool or None)."""
    e60 = min(len(h), k + 61)
    adv = (h[k:e60].max() - P) if side > 0 else (P - l[k:e60].min())
    jm, win = 0.0, None
    for j in range(k, len(h)):
        a = (h[j] - P) if side > 0 else (P - l[j])
        f = (P - l[j]) if side > 0 else (h[j] - P)
        jm = max(jm, min(a, STOP))
        if a >= STOP:
            win = False; break
        if f >= STOP and j > k:
            win = True; break
    return max(adv, 0.0), jm, win


def main():
    T, Q, masks, test, _ = G.run("F")
    D = minute_sessions()
    rows = []
    for name, col in CALCS.items():
        W = {}
        for q in ("hl", "cup", "cdn"):
            _, lvl = G.hits_and_gap(T, col, test, masks[q], q)
            W[q] = lvl
        for i in np.flatnonzero(test):
            d = pd.Timestamp(T["date"].iat[i])
            if d not in D:
                continue
            o, h, l = D[d]
            op = o[0]
            yr = d.year
            for t in (50, 75, 90):
                specs = []
                if np.isfinite(W["cup"][t][i]):
                    specs.append(("Close+", +1, np.full(len(h), op * (1 + W["cup"][t][i] / 100))))
                if np.isfinite(W["cdn"][t][i]):
                    specs.append(("Close-", -1, np.full(len(h), op * (1 - W["cdn"][t][i] / 100))))
                if np.isfinite(W["hl"][t][i]):
                    w = op * W["hl"][t][i] / 100
                    rl = np.minimum.accumulate(l); rh = np.maximum.accumulate(h)
                    specs.append(("HL upper", +1, np.r_[np.inf, rl[:-1] + w]))   # projection known from the previous bar
                    specs.append(("HL lower", -1, np.r_[-np.inf, rh[:-1] - w]))
                for line, side, lvl in specs:
                    hit = np.flatnonzero(h >= lvl) if side > 0 else np.flatnonzero(l <= lvl)
                    if not len(hit):
                        rows.append(dict(calc=name, line=line, tier=t, year=yr, touched=False))
                        continue
                    k = hit[0]
                    P = lvl[k]
                    m60, jm, win = fade(h, l, k, P, side)
                    rows.append(dict(calc=name, line=line, tier=t, year=yr, touched=True, mae60=m60, jmae=jm, win=win))
    R = pd.DataFrame(rows)
    R.to_parquet(OUT / "mae_compare_rows.parquet")

    def summ(g):
        t = g[g.touched]
        dec = t[t.win.notna()]
        return pd.Series({"days": len(g), "touch %": 100 * g.touched.mean(), "mae60 $ median": t.mae60.median(),
                          "mae60 ticks": t.mae60.median() / TICK, "mae60 p75 ticks": t.mae60.quantile(.75) / TICK,
                          "Jordan MAE ticks": t.jmae.median() / TICK, "win 1R %": 100 * dec.win.astype(bool).mean()})
    out = []
    for lab, sel in (("2020-2026.08", R.year >= 2020), ("2025-2026.08", R.year >= 2025)):
        S = R[sel].groupby(["line", "tier", "calc"]).apply(summ).round(1)
        out += [f"=== {lab} ===", S.to_string(), ""]
        allj = R[sel].groupby("calc").apply(summ).round(1)
        out += ["all Jordan lines together:", allj.to_string(), ""]
    txt = "\n".join(out)
    print(txt)
    (OUT / "mae_compare.txt").write_text(txt, encoding="utf-8")


if __name__ == "__main__":
    main()
