"""VOL-TARGET (forge/VOL_TARGET_PREREG.md): constant risk vs sizing by a forecast sigma, direction held fixed.

Reuses the four causal sigma arms in analysis/output/ladder_candidates/rows.parquet (forge.run_ladder_candidates) and
joins each London 00-22 session's signed return. Offline only.
    python -m forge.run_vol_target
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge.run_combined_range import london_date
from forge.run_horizon_reversion import FORGE_KEY, daily_for

ROWS = Path("analysis/output/ladder_candidates/rows.parquet")
OUT = Path("analysis/output/vol_target")
SPLIT = pd.Timestamp("2025-09-05")
ARMS = ("A0", "A2", "A3", "A4")
NAMES = {"FLAT": "constant risk", "A0": "live estimator", "A2": "HAR-800", "A3": "IV-adjusted", "A4": "pure IV"}
LONG_SET = {"NQ", "SPX", "DOW", "US2000", "DE30", "UK100", "GOLD"}
CAP, TREND_N, BLOCK, REPS = 2.0, 60, 21, 2000
RNG = np.random.default_rng(20261005)


def session_returns(name: str) -> pd.DataFrame:
    d = daily_for(FORGE_KEY.get(name, name.lower()))
    o, c = d["open"].to_numpy(float), d["close"].to_numpy(float)
    return pd.DataFrame({"date": london_date(d.index), "r": (c - o) / o})


def build() -> pd.DataFrame:
    X = pd.read_parquet(ROWS)
    parts = []
    for inst, g in X.groupby("inst"):
        g = g.merge(session_returns(inst), on="date", how="inner").sort_values("date").reset_index(drop=True)
        tr = g["date"] < SPLIT
        g["u"] = g["r"] * 100 / g.loc[tr, "s0"].median()                    # return in units of train-median sigma (%)
        g["trend"] = np.sign(g["r"].shift(1).rolling(TREND_N, min_periods=TREND_N).sum())
        g["w_FLAT"] = 1.0
        for a in ARMS:
            s = g[f"s{a[1]}"]
            w = np.clip(s[tr].median() / s, 0, CAP)
            g[f"w_{a}"] = w / w[tr].mean()                                    # same average exposure as FLAT
        parts.append(g)
    return pd.concat(parts, ignore_index=True)


def portfolio(X: pd.DataFrame, direction: str) -> pd.DataFrame:
    """Daily portfolio P&L per arm (equal-weight sum across instruments in the direction's universe)."""
    if direction == "LONG":
        S = X[X["inst"].isin(LONG_SET)].assign(d=1.0)
    else:
        S = X.dropna(subset=["trend"]).assign(d=lambda t: t["trend"])
    S = S[S["d"] != 0]
    cols = {}
    for arm in ("FLAT", *ARMS):
        cols[arm] = (S["d"] * S[f"w_{arm}"] * S["u"]).groupby(S["date"]).sum()
    P = pd.DataFrame(cols).sort_index()
    P.index = pd.DatetimeIndex(P.index)
    return P, S


def stats(s: pd.Series) -> dict:
    s = s.dropna()
    cum = s.cumsum()
    m = s.groupby(s.index.to_period("M"))
    monthly_vol = m.std().dropna()
    return {"sharpe": float(s.mean() / s.std() * np.sqrt(252)),
            "vol_of_vol": float(monthly_vol.std() / monthly_vol.mean()),       # relative, so arms are comparable
            "worst_month": float(m.sum().min()), "max_dd": float((cum - cum.cummax()).min()),
            "tail3": float((s.abs() > 3 * s.std()).mean()), "n": int(len(s))}


def block_boot_sharpe_diff(a: pd.Series, b: pd.Series) -> tuple:
    x = pd.concat([a, b], axis=1).dropna().to_numpy()
    n = len(x); nb = int(np.ceil(n / BLOCK)); out = []
    for _ in range(REPS):
        idx = np.concatenate([np.arange(s, s + BLOCK) % n for s in RNG.integers(0, n, nb)])[:n]
        y = x[idx]
        sa, sb = (y[:, i].mean() / y[:, i].std() * np.sqrt(252) for i in (0, 1))
        out.append(sa - sb)
    d = a.mean() / a.std() * np.sqrt(252) - b.mean() / b.std() * np.sqrt(252)
    return float(d), float(np.percentile(out, 5)), float(np.percentile(out, 95))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    X = build()
    res = {}
    for direction in ("LONG", "TREND"):
        P, S = portfolio(X, direction)
        print(f"\n===== {direction}: {S['inst'].nunique()} instruments, {len(P)} sessions "
              f"{P.index.min().date()} -> {P.index.max().date()}")
        res[direction] = {}
        for window, Q in (("full", P), ("test", P[P.index >= SPLIT])):
            r = {arm: stats(Q[arm]) for arm in Q.columns}
            for arm in ARMS:
                r[arm]["sharpe_vs_flat"] = block_boot_sharpe_diff(Q[arm], Q["FLAT"])
            r["A2"]["sharpe_vs_A0"] = block_boot_sharpe_diff(Q["A2"], Q["A0"])
            res[direction][window] = r
            print(f"  -- {window} ({len(Q)} sessions)")
            print(f"     {'arm':16} {'Sharpe':>7} {'vol-of-vol':>10} {'worst mo':>9} {'max DD':>8} {'tail3':>6}   Sharpe vs FLAT (90% CI)")
            for arm in Q.columns:
                x = r[arm]; ci = x.get("sharpe_vs_flat")
                cis = f"{ci[0]:+.2f} [{ci[1]:+.2f}, {ci[2]:+.2f}]" if ci else ""
                print(f"     {NAMES[arm]:16} {x['sharpe']:7.2f} {x['vol_of_vol']:10.3f} {x['worst_month']:9.1f} {x['max_dd']:8.1f} {x['tail3']:6.3f}   {cis}")
            d = r["A2"]["sharpe_vs_A0"]
            print(f"     HAR-800 vs live estimator Sharpe {d[0]:+.2f} [{d[1]:+.2f}, {d[2]:+.2f}]")
        # per class, full window
        print("  -- per class, full window: Sharpe FLAT / A0 / A2 | vol-of-vol FLAT / A0 / A2")
        cls = X.drop_duplicates("inst").set_index("inst")["cls"]
        for c in sorted(S["cls"].unique()):
            Sc = S[S["inst"].isin(cls[cls == c].index)]
            Pc = pd.DataFrame({a: (Sc["d"] * Sc[f"w_{a}"] * Sc["u"]).groupby(Sc["date"]).sum() for a in ("FLAT", "A0", "A2")})
            Pc.index = pd.DatetimeIndex(Pc.index)
            st = {a: stats(Pc[a]) for a in Pc.columns}
            print(f"     {c:9} {st['FLAT']['sharpe']:5.2f} / {st['A0']['sharpe']:5.2f} / {st['A2']['sharpe']:5.2f}   |   "
                  f"{st['FLAT']['vol_of_vol']:.3f} / {st['A0']['vol_of_vol']:.3f} / {st['A2']['vol_of_vol']:.3f}")
    print("\n===== VERDICT (pre-registered, full window)")
    f = {d: res[d]["full"] for d in res}
    works = all(f[d]["A2"]["vol_of_vol"] < f[d]["FLAT"]["vol_of_vol"] for d in f)
    matters = all(f[d]["A2"]["vol_of_vol"] < f[d]["A0"]["vol_of_vol"] for d in f)
    print(f"  PRIMARY vol targeting steadies risk (A2 < FLAT, LONG and TREND): {'PASS' if works else 'FAIL'}")
    print(f"  PRIMARY the sigma matters (A2 < A0, LONG and TREND): {'PASS' if matters else 'FAIL'}")
    for d in f:
        for arm in ARMS:
            v = f[d][arm]["sharpe_vs_flat"]
            print(f"  SECONDARY {d} {NAMES[arm]:15} Sharpe vs FLAT {v[0]:+.2f} [{v[1]:+.2f}, {v[2]:+.2f}] -> "
                  f"{'real' if v[1] > 0 or v[2] < 0 else 'within noise'}")
    (OUT / "summary.json").write_text(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
