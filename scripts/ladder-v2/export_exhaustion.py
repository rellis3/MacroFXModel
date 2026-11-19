"""ladder-v2 EXHAUSTION export (shadow): per ladder line, the zone where the first real pullback typically starts and the
chance of reaching the next line by London time bucket. Paste into `pine/exhaustion_zones.pine`.

    python scripts/ladder-v2/export_exhaustion.py      -> analysis/output/ladder-v2-shadow/<date>_exhaustion_{cfd,fut}.txt

Sources (all banked 2026-11-19):
  lines   - today's v2 ladder (same calc as export_shadow.py)
  zone    - reversal-zones: after touching any level, the median / 75th run past it before the first 0.25 sigma
            pullback (per instrument, from analysis/output/reversal-zones/zones.csv, in sigma, times today's sigma)
  odds    - exhaustion-v2-<sym>: observed share of first touches that went on to the next rung (p50/p75) or a further
            0.25 sigma (p90), by 00-07 / 07-12 / 12-16 / 16-22 London, OH and OL pooled, 2018 -> 2026-08; each cell
            shrunk toward the same rung x bucket rate pooled over NQ/GOLD/EURUSD with a weight of 50 touches.
SHADOW ONLY.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import export_shadow as E  # noqa: E402

SYMS = ("GOLD", "EURUSD", "NQ")
SHRINK = 50
BUCKETS = "00-07 · 07-12 · 12-16 · 16-22"


def odds_tables():
    rows = []
    for sym in SYMS:
        X = pd.read_parquet(ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}/touches_C.parquet")
        X = X[X["fam"].isin(["OH", "OL"])].copy()
        X["b"] = np.searchsorted([420, 720, 960], X["min"].to_numpy(), side="right")
        X["y"] = np.where(X["rung"] < 90, X["further"] >= X["d_next"], X["further"] >= X["d_sig"]).astype(float)
        X["sym"] = sym
        rows.append(X[["sym", "rung", "b", "y"]])
    A = pd.concat(rows)
    pooled = A.groupby(["rung", "b"])["y"].mean()
    g = A.groupby(["sym", "rung", "b"])["y"].agg(["sum", "count"])
    out = {}
    for (sym, rung, b), r in g.iterrows():
        out[(sym, rung, b)] = (r["sum"] + SHRINK * pooled[(rung, b)]) / (r["count"] + SHRINK) * 100
    return out


def zone_sigma():
    Z = pd.read_csv(ROOT / "analysis/output/reversal-zones/zones.csv")
    Z = Z[Z["line"].str.startswith(("OH", "OL"))]
    out = {}
    for sym, g in Z.groupby("sym"):
        w = g["n"]
        out[sym] = tuple(float((g[c] * w).sum() / w.sum()) for c in ("overshoot_p50_sig_R0.25", "overshoot_p75_sig_R0.25"))
    return out


def block(name, sig, m, odds, zs, sym):
    pre = f"──── {name} "
    z50, z75 = zs[sym]
    L = [pre + "─" * max(0, 30 - len(pre)),
         f"Sigma daily             : {sig:.3f}%",
         f"Zone past line          : {z50 * sig:.3f}% median · {z75 * sig:.3f}% 75th  ({z50:.2f}σ · {z75:.2f}σ)",
         f"Time buckets (London)   : {BUCKETS}"]
    for side, q in (("OH", "oh"), ("OL", "ol")):
        for t in (50, 75, 90):
            lvl = m[(q, t)] * sig
            word = "next" if t < 90 else "+0.25σ"
            od = " · ".join(f"{odds[(sym, t, b)]:.0f}%" for b in range(4))
            L.append(f"{side} p{t:<2}                  : {lvl:.2f}% | {word} {od}")
    return L


def main():
    now = pd.Timestamp.now(tz="Europe/London")
    sess = now.normalize().tz_localize(None)
    if now.hour >= 22:
        sess += pd.Timedelta(days=1)
    while sess.dayofweek >= 5:
        sess += pd.Timedelta(days=1)
    res = {"NQ": E.nq_block(sess), "GOLD": E.oanda_regression_block("GOLD", "HARCJ", sess),
           "EURUSD": E.oanda_regression_block("EURUSD", "HARCJ", sess), "GOLD FUT": E.gc_block(sess)}
    odds, zs = odds_tables(), zone_sigma()
    head = ["**EXHAUSTION ZONES — SHADOW ladder-v2 (not live)**",
            f"**For session: {sess:%a %d %b %Y} (London 00:00–22:00)**",
            "Zone = how far price typically runs past a line before its first 0.25σ pullback (any level, not a line effect).",
            "Odds = chance a line touched in that time bucket goes on to the next line (p90: a further 0.25σ).", ""]
    cfd = head + sum((block(n, res[n][0], res[n][1], odds, zs, n) + [""] for n in SYMS), [])
    fut = head + block("GOLD", res["GOLD FUT"][0], res["GOLD FUT"][1], odds, zs, "GOLD") + [""] + \
        sum((block(n, res[n][0], res[n][1], odds, zs, n) + [""] for n in ("EURUSD", "NQ")), [])
    out = E.OUT
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{sess:%Y-%m-%d}_exhaustion_cfd.txt").write_text("\n".join(cfd), encoding="utf-8")
    (out / f"{sess:%Y-%m-%d}_exhaustion_fut.txt").write_text("\n".join(fut), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(cfd))


if __name__ == "__main__":
    main()
