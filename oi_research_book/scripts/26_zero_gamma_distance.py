"""DOES DISTANCE TO THE TEXTBOOK ZERO GAMMA CHANGE NQ'S NEXT-DAY RANGE, BEYOND THE GAMMA SIGN?
Pre-registration: oi_research_book/ZERO_GAMMA_DISTANCE_PREREG.md (committed before this ran).

Z re-prices the whole book at hypothetical prices (Black-Scholes gamma, dealers long calls / short puts) and takes
the sign change nearest the front future. Outcome and sign groups are G2's (18_gex_range_brownian.py build()).

    python oi_research_book/scripts/26_zero_gamma_distance.py
"""
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("g2", HERE / "18_gex_range_brownian.py")
G2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(G2)
DATA, OUT = G2.DATA, G2.OUT
LOCKBOX = pd.Timestamp("2026-08-21")
GRID = np.linspace(0.90, 1.10, 401)


def zero_gamma(strikes, net_oi, F, T, sig):
    """Sign change of total dealer gamma nearest F, re-pricing every strike at each grid price."""
    P = F * GRID[:, None]
    s = sig * np.sqrt(T)
    d1 = (np.log(P / strikes[None, :]) + 0.5 * s * s) / s
    g = (norm.pdf(d1) / (P * s) * net_oi[None, :]).sum(axis=1) * P[:, 0]
    sgn = np.sign(g)
    idx = np.where(sgn[:-1] * sgn[1:] < 0)[0]
    if not len(idx):
        return np.nan, float(np.sign(g[200]))
    roots = P[idx, 0] + (P[idx + 1, 0] - P[idx, 0]) * g[idx] / (g[idx] - g[idx + 1])
    return float(roots[np.argmin(np.abs(roots - F))]), float(np.sign(g[200]))


def build_z(surface, use30=False):
    surf = pd.read_parquet(DATA / f"surface_{surface}_nas100_usd.parquet")
    iv = pd.read_parquet(DATA / "iv_daily_nas100_usd.parquet").set_index("date")
    rows = []
    for date, g in surf.groupby("date"):
        if date not in iv.index:
            continue
        r = iv.loc[date]
        F = r["F_front"]
        T = 30 / 365 if use30 else max(r["dte_front"], 0.5) / 365
        sig = r["iv30"] if use30 else r["iv_front"]
        if not (F > 0 and sig > 0):
            continue
        k = g["strike"].to_numpy(float)
        net = (g["call_oi"] - g["put_oi"]).to_numpy(float)
        ok = (k > F * 0.7) & (k < F * 1.3) & (net != 0)
        if ok.sum() < 3:
            continue
        z, sgn_at_f = zero_gamma(k[ok], net[ok], F, T, sig)
        rows.append({"date": date, "F": F, "Z": z, "sgn_F": sgn_at_f})
    return pd.DataFrame(rows)


def frame(surface="near", use30=False):
    df, counts = G2.build(surface, "rv20_ann", "net_gex_sum")
    z = build_z(surface, use30)
    x = df.merge(z, on="date", how="inner")
    x = x[x["date"] <= LOCKBOX].reset_index(drop=True)
    sig_d = x["rv20_ann"] / np.sqrt(252)
    x["dist"] = np.where(x["Z"].notna(), (x["F"] - x["Z"]).abs() / (x["F"] * sig_d), np.inf)
    # demean DR within G2's sign groups so near/far cannot be the sign effect re-labelled
    x["dr_dm"] = x["dr"] - x.groupby("is_short")["dr"].transform("mean")
    return x, counts


def delta(x, k, col="dr_dm", n_boot=G2.N_BOOT):
    near = (x["dist"] <= k).to_numpy()
    obs, p, se = G2.boot_diff_p(x[col].to_numpy(), near, n_boot=n_boot)
    return {"k": k, "n": int(len(x)), "n_near": int(near.sum()), "deltaDR": round(obs, 4), "p": round(p, 4), "se": round(se, 4)}


def main():
    x, counts = frame("near")
    prim = delta(x, 1.0)
    h = len(x) // 2
    halves = [delta(x.iloc[:h].reset_index(drop=True), 1.0, n_boot=4000), delta(x.iloc[h:].reset_index(drop=True), 1.0, n_boot=4000)]
    x30, _ = frame("near", use30=True)
    xall, _ = frame("all")
    rob = {"k0.5": delta(x, 0.5), "k2.0": delta(x, 2.0), "T30_iv30": delta(x30, 1.0), "all_expiry": delta(xall, 1.0)}

    # harness
    near = (x["dist"] <= 1.0).to_numpy()
    obs_pl, p_pl, _ = G2.boot_diff_p(x["dr_dm"].to_numpy(), np.roll(near, 125), n_boot=2000)
    prox = x["ret"].abs().shift(1)
    hi = (prox > prox.median()).fillna(False).to_numpy()
    obs_pc, p_pc, _ = G2.boot_diff_p(x["dr"].to_numpy(), hi, n_boot=2000)
    sgn_agree = float((x.loc[x["Z"].notna(), "sgn_F"] == np.where(x.loc[x["Z"].notna(), "is_short"], -1, 1)).mean())
    harness = {"placebo": {"deltaDR": round(obs_pl, 4), "p": round(p_pl, 4), "pass": bool(abs(obs_pl) < 0.03)},
               "positive_control": {"deltaDR": round(obs_pc, 4), "p": round(p_pc, 4), "pass": bool(obs_pc > 0.05 and p_pc < 0.05)},
               "z_found_share": round(float(x["Z"].notna().mean()), 3),
               "repriced_sign_vs_G2_sign_agreement": round(sgn_agree, 3)}

    gates = harness["placebo"]["pass"] and harness["positive_control"]["pass"]
    signs = {np.sign(prim["deltaDR"])} | {np.sign(r["deltaDR"]) for r in rob.values()}
    if (prim["deltaDR"] >= 0.05 and prim["p"] < 0.05 and all(hh["deltaDR"] > 0 for hh in halves)
            and len(signs) == 1 and gates):
        verdict = "SUPPORTED"
    elif abs(prim["deltaDR"]) < 0.03 or len(signs) > 1:
        verdict = "NULL"
    elif prim["deltaDR"] <= -0.05 and prim["p"] < 0.05:
        verdict = "WRONG WAY"
    else:
        verdict = "INCONCLUSIVE"

    # descriptive: raw DR by distance bucket and sign (not part of the verdict)
    b = pd.cut(x["dist"], [0, 0.5, 1, 2, 4, np.inf], right=True, include_lowest=True)
    desc = (x.groupby([b, "is_short"], observed=True)["dr"].agg(["mean", "count"]).round(3).reset_index()
            .assign(dist=lambda d: d["dist"].astype(str)).to_dict("records"))
    res = {"prereg": "oi_research_book/ZERO_GAMMA_DISTANCE_PREREG.md", "window": [str(x["date"].min().date()), str(x["date"].max().date())],
           "g2_build_counts": counts, "primary": prim, "halves": halves, "robustness": rob, "harness": harness,
           "verdict": verdict, "descriptive_DR_by_distance_and_sign": desc}
    (OUT / "zero_gamma_distance.json").write_text(json.dumps(res, indent=1, default=str))
    print(json.dumps({k: res[k] for k in ("window", "primary", "halves", "robustness", "harness", "verdict")}, indent=1, default=str))
    print(pd.DataFrame(desc).to_string())


if __name__ == "__main__":
    main()
