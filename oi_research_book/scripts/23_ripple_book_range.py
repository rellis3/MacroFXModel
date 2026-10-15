#!/usr/bin/env python3
"""Range test frozen in RIPPLE_BOOK_PREREG.md: which GEX surface reads next-day diffusion best (vol-matched dDR), paired bootstrap.

    .venv/Scripts/python.exe oi_research_book/scripts/23_ripple_book_range.py

PRIMARY (prereg): dDR(S4) - dDR(S0) on days where ALL five surfaces exist. Gate 4: fewer than 400 common days -> UNJUDGEABLE.
Everything else printed here is DESCRIPTIVE (labelled), as the prereg allows, and is not a verdict.
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"; OUT = DATA / "results"; OUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(20261015)
N_BOOT, BLOCK, N_STRATA = 10_000, 10, 5
BM = np.sqrt(8.0 / np.pi)
SURF = ["S0", "S1", "S2", "S3", "S4"]


def stat_idx(n, b, rng):
    p = 1.0 / BLOCK
    restarts = rng.random((b, n)) < p; restarts[:, 0] = True
    anchors = rng.integers(0, n, (b, n)); k = np.arange(n)
    last = np.maximum.accumulate(np.where(restarts, k, 0), axis=1)
    return (np.take_along_axis(anchors, last, axis=1) + (k - last)) % n


def matched_gap(dr, strat, short, w):
    """pooled within-stratum (mean DR short - mean DR long), weights w[k] = stratum sizes. dr/strat/short: (n,) or (B,n)."""
    num = 0.0; den = 0.0
    for k in range(N_STRATA):
        m = strat == k
        s = m & short; l = m & ~short
        ns, nl = s.sum(-1), l.sum(-1)
        ok = (ns > 0) & (nl > 0)
        gap = np.where(ok, (dr * s).sum(-1) / np.maximum(ns, 1) - (dr * l).sum(-1) / np.maximum(nl, 1), 0.0)
        num = num + w[k] * gap * ok; den = den + w[k] * ok
    return num / np.maximum(den, 1e-12)


def run(df, label, surfaces):
    df = df.copy().reset_index(drop=True)
    sigma_d = df["rv20_ann"] / np.sqrt(252.0)
    df["dr"] = np.log(df["fwd_hi_1d"] / df["fwd_lo_1d"]) / (sigma_d * BM)
    keep = np.isfinite(df["dr"]) & (sigma_d > 0)
    for s in surfaces: keep &= df[f"gex_{s}"].notna()
    dropped = int((~keep).sum()); df = df[keep].reset_index(drop=True)
    n = len(df)
    print(f"\n=== {label}: n = {n} common days (dropped {dropped}) ===")
    if n < 400:
        print(f"    GATE 4: n < 400 -> UNJUDGEABLE as a verdict. Numbers below are descriptive only.")
    strat = pd.qcut(df["rv20_ann"], N_STRATA, labels=False, duplicates="drop").to_numpy()
    w = [int((strat == k).sum()) for k in range(N_STRATA)]
    dr = df["dr"].to_numpy(); short = {s: (df[f"gex_{s}"] < 0).to_numpy() for s in surfaces}
    est = {s: float(matched_gap(dr, strat, short[s], w)) for s in surfaces}
    # paired bootstrap: same resampled days for every surface
    boots = {s: [] for s in surfaces}
    done = 0
    while done < N_BOOT:
        b = min(1000, N_BOOT - done); I = stat_idx(n, b, RNG)
        drb, stb = dr[I], strat[I]
        for s in surfaces: boots[s].append(matched_gap(drb, stb, short[s][I], w))
        done += b
    boots = {s: np.concatenate(v) for s, v in boots.items()}
    res = {"label": label, "n": n, "dropped": dropped, "surfaces": {}, "pairs": {}}
    for s in surfaces:
        b = boots[s]; lo, hi = np.percentile(b, [2.5, 97.5]); p = float(2 * min((b <= 0).mean(), (b >= 0).mean()))
        res["surfaces"][s] = {"dDR_matched": est[s], "ci": [float(lo), float(hi)], "p_two_sided": p, "n_short": int(short[s].sum()), "n_long": int((~short[s]).sum())}
        print(f"  {s}: dDR vol-matched {est[s]:+.3f}  95% CI [{lo:+.3f}, {hi:+.3f}]  p {p:.3f}  (short {int(short[s].sum())} / long {int((~short[s]).sum())})")
    for a in surfaces:
        for c in surfaces:
            if a < c: continue
        pass
    pairs = [("S4", "S0"), ("S4", "S3"), ("S3", "S0"), ("S1", "S0"), ("S4", "S1")]
    for a, c in pairs:
        if a not in surfaces or c not in surfaces: continue
        d = boots[a] - boots[c]; lo, hi = np.percentile(d, [2.5, 97.5])
        res["pairs"][f"{a}-{c}"] = {"diff": est[a] - est[c], "ci": [float(lo), float(hi)]}
        print(f"  {a} - {c}: {est[a]-est[c]:+.3f}  CI [{lo:+.3f}, {hi:+.3f}]")
    # four-cell table S4 vs S0
    if "S0" in surfaces and "S4" in surfaces:
        cells = {"both short": short["S0"] & short["S4"], "S0 short only": short["S0"] & ~short["S4"], "S4 short only": ~short["S0"] & short["S4"], "both long": ~short["S0"] & ~short["S4"]}
        print("  four cells (mean DR, n):", {k: (round(float(dr[m].mean()), 3) if m.sum() else None, int(m.sum())) for k, m in cells.items()})
        res["cells"] = {k: {"mean_dr": float(dr[m].mean()) if m.sum() else None, "n": int(m.sum())} for k, m in cells.items()}
    # by year
    yr = df["date"].dt.year.to_numpy(); byy = {}
    for y in sorted(set(yr)):
        m = yr == y
        if m.sum() < 60: continue
        st = pd.qcut(df.loc[m, "rv20_ann"], 3, labels=False, duplicates="drop").to_numpy()
        ww = [int((st == k).sum()) for k in range(3)]
        def g(sh):
            nn = 0.0; dd = 0.0
            for k in range(3):
                mm = st == k; s_ = mm & sh[m]; l_ = mm & ~sh[m]
                if s_.sum() and l_.sum(): nn += ww[k] * (dr[m][s_].mean() - dr[m][l_].mean()); dd += ww[k]
            return nn / dd if dd else float("nan")
        byy[int(y)] = {s: round(float(g(short[s])), 3) for s in surfaces}
    print("  by year (3 vol strata):", byy); res["by_year"] = byy
    # ---- harness gates ----
    plc = {s: float(matched_gap(dr, strat, np.roll(short[s], 125), w)) for s in surfaces}
    print("  GATE 1 placebo (+125d circular shift) dDR:", {s: round(v, 3) for s, v in plc.items()}, "-> pass" if all(abs(v) < 0.05 for v in plc.values()) else "-> FAIL (|dDR| >= 0.05)")
    res["placebo"] = plc
    rng = np.random.default_rng(7); inj = dr.copy(); pick = rng.random(n) < 0.5
    ref = max(surfaces, key=lambda s: abs(est[s])); inj[pick & short[ref]] *= 1.15
    rec = float(matched_gap(inj, strat, short[ref], w)) - est[ref]
    exp_ = 0.15 * float(dr[pick & short[ref]].mean()) * float((pick & short[ref]).sum() / max(short[ref].sum(), 1))
    print(f"  GATE 2 injection (x1.15 on a random half of {ref}-short days): expected ~{exp_:+.3f}, recovered {rec:+.3f}")
    res["injection"] = {"surface": ref, "expected": exp_, "recovered": rec}
    return res


def main():
    d = pd.read_parquet(DATA / "ripple_book_nq.parquet"); d["date"] = pd.to_datetime(d["date"])
    # gate 3: fwd range columns really are the NEXT day's high/low
    nxt = d["high"].shift(-1); same = ((nxt - d["fwd_hi_1d"]).abs() < 1e-6) | nxt.isna() | d["fwd_hi_1d"].isna()
    print(f"GATE 3 no-lookahead: fwd_hi_1d equals the next row's high on {same.mean():.1%} of rows (rows are not strictly consecutive days, so gaps are expected)")
    out = {}
    out["primary_all_five"] = run(d, "PRIMARY (prereg): S0..S4 all present", SURF)
    out["exploratory_S0_S3_S4"] = run(d, "EXPLORATORY (not the prereg verdict): S0 / S3 / S4 only", ["S0", "S3", "S4"])
    with open(OUT / "ripple_book_range.json", "w") as f: json.dump(out, f, indent=2, default=float)
    p = out["primary_all_five"]
    print("\nPRIMARY VERDICT:", "UNJUDGEABLE (gate 4: < 400 common days)" if p["n"] < 400 else "see S4-S0 above")


if __name__ == "__main__":
    main()
