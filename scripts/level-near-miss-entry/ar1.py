"""level-near-miss-entry part 4: AR(1) / Dickey-Fuller on session price (vs the open) and on the VWAP deviation.

    python scripts/level-near-miss-entry/ar1.py -> analysis/output/level-near-miss-entry/ar1_ou.csv

Pooled within-session regression dx_t = a + b x_{t-1} (x in % of the open), 1-minute and 5-minute sampling,
train years (2020-22) and test years (2024-26) separately. kappa = -ln(1+b) per bar, half-life = ln2 / kappa.
DF t = b / se(b); 5% critical value about -2.86 (with constant). Pooled over many sessions the t is very large in size
for any real reversion, so the half-life is the readable number.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("vb", ROOT / "scripts/jordan-vwap-band-tp/run.py")
VB = importlib.util.module_from_spec(spec); spec.loader.exec_module(VB)
OUT = ROOT / "analysis/output/level-near-miss-entry"


def main():
    rows = []
    for sym in VB.JLM.RF.syms():
        m = VB.load_m1v(sym)
        lt = m.index.tz_convert("Europe/London")
        keep = (lt.hour < 22) & (lt.dayofweek < 5) & (lt.year >= 2020) & (m.index <= pd.Timestamp("2026-08-22", tz="UTC"))
        m, lt = m[keep], lt[keep]
        di = pd.Index(lt.tz_localize(None).normalize())
        st = np.flatnonzero(np.r_[True, di[1:] != di[:-1]]); en = np.r_[st[1:], len(di)]
        H, Lo, C, V = (m[c].to_numpy() for c in ("high", "low", "close", "volume"))
        acc = {}
        for s, e in zip(st, en):
            if e - s < 600:
                continue
            y = di[s].year
            per = "train" if y <= 2022 else ("test" if y >= 2024 else None)
            if per is None:
                continue
            o = C[s]
            hlc3 = (H[s:e] + Lo[s:e] + C[s:e]) / 3
            cv = np.cumsum(V[s:e])
            vw = np.where(cv > 0, np.cumsum(hlc3 * V[s:e]) / np.maximum(cv, 1e-12), hlc3)
            for ser, x in (("price-open", (C[s:e] - o) / o * 100), ("close-VWAP", (C[s:e] - vw) / o * 100)):
                for step in (1, 5):
                    xs = x[::step]
                    xl, dy = xs[:-1], np.diff(xs)
                    a = acc.setdefault((per, ser, step), np.zeros(6))
                    a += [len(xl), xl.sum(), dy.sum(), (xl * xl).sum(), (xl * dy).sum(), (dy * dy).sum()]
        for (per, ser, step), (n, sx, sy, sxx, sxy, syy) in acc.items():
            vx = sxx - sx * sx / n
            b = (sxy - sx * sy / n) / vx
            a0 = sy / n - b * sx / n
            rss = syy - 2 * a0 * sy - 2 * b * sxy + n * a0 ** 2 + 2 * a0 * b * sx + b * b * sxx
            se = np.sqrt(rss / (n - 2) / vx)
            kappa = -np.log1p(b) if b > -1 else np.nan
            rows.append({"sym": sym, "period": per, "series": ser, "step_min": step, "n": int(n), "b": b, "t_DF": b / se,
                         "half_life_min": (np.log(2) / kappa * step) if kappa and kappa > 0 else np.inf})
        print(sym, flush=True)
    R = pd.DataFrame(rows)
    R.to_csv(OUT / "ar1_ou.csv", index=False)
    print(R.groupby(["series", "period", "step_min"])[["b", "t_DF", "half_life_min"]].median().round(5))


if __name__ == "__main__":
    main()
