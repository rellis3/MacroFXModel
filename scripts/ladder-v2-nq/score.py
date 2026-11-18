"""ladder-v2-nq scoring (forge/LADDER_V2_NQ_PREREG.md incl. Amendment A1).

    python scripts/ladder-v2-nq/score.py            -> analysis/output/ladder-v2-nq/{results.json, report.txt}

Order: positive control 2 (synthetic) must pass before the real tracks are scored.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from forge import vol as V  # noqa: E402

OUT = ROOT / "analysis/output/ladder-v2-nq"
SEED, B, BLOCK = 20261118, 2000, 20
ARMS = ["A0", "E1", "E2", "E3", "E4", "E5", "E6", "H8", "R5", "R15", "V3", "V4"]
NAMES = {"A0": "yz_10 (live)", "E1": "ewma_094", "E2": "ewma_090", "E3": "yz_20", "E4": "yz_30", "E5": "naive",
         "E6": "har_rv_log (forge)", "H8": "HAR-800 (production)", "R5": "HAR-RV 5-min", "R15": "HAR-RV 15-min",
         "V3": "IV-adjusted (VXN)", "V4": "pure VXN"}
QS, TAUS = ("hl", "oc", "oh", "ol"), (50, 75, 90)
TGT = {50: 0.50, 75: 0.25, 90: 0.10}
CELLS = [(q, t) for q in ("hl", "oh", "ol") for t in (75, 90)]           # x 5 quintiles = 30
YEARS = range(2018, 2027)
LOG = []


def say(s=""):
    print(s, flush=True)
    LOG.append(s)


# ---------------------------------------------------------------- walk-forward lines
def fit_k(tr):
    x = tr["x"]; mu = x.mean()
    y = np.log(tr["hl"] / tr["A0"]); y = y - y.mean()
    z = x - mu; sd = float(z.std()); zs = z / sd
    return float((zs @ y) / (zs @ zs + 1.0)) / sd, mu


def rv_sigma(S, k, coef, s2):
    X = np.column_stack([np.ones(len(S)), S[f"R{k}_d1"], S[f"R{k}_d5"], S[f"R{k}_d22"]])
    return np.sqrt(np.exp(X @ coef + s2 / 2)) * 100


def walk_forward(S: pd.DataFrame, track: str, arms=ARMS) -> pd.DataFrame:
    S = S.copy()
    S["x"] = np.log(S["iv"] / V.SQRT252 / S["A0"])
    out = []
    for Y in YEARS:
        start, end = pd.Timestamp(f"{Y}-01-01"), pd.Timestamp(f"{Y + 1}-01-01")
        W = S.copy()
        if "R5" in arms:
            for k in (5, 15):
                f = pd.read_parquet(OUT / f"rvfeat_{track}_{k}.parquet").dropna()
                f = f[f["next_date"] < start]
                X = np.column_stack([np.ones(len(f)), f["d1"], f["d5"], f["d22"]])
                coef, *_ = np.linalg.lstsq(X, f["y_next"].to_numpy(), rcond=None)
                s2 = float(np.var(f["y_next"].to_numpy() - X @ coef))
                W[f"R{k}"] = rv_sigma(W, k, coef, s2)
        if "V3" in arms:
            ok = (W["date"] < start) & np.isfinite(W["x"]) & np.isfinite(W["A0"])
            kk, mu = fit_k(W[ok])
            W["V3"] = W["A0"] * np.exp(kk * (W["x"] - mu))
        tr = W[W["date"] < start]
        te = W[(W["date"] >= start) & (W["date"] < end)].copy()
        te["year"] = Y
        for a in arms:
            for q in QS:
                for t in TAUS:
                    good = np.isfinite(tr[a]) & (tr[a] > 0)
                    m = V.fit_width_multiplier(tr.loc[good, a].to_numpy(), tr.loc[good, q].to_numpy(), t / 100)
                    te[f"{a}_{q}_{t}"] = m * te[a]
        out.append(te)
    T = pd.concat(out, ignore_index=True)
    line_cols = [f"{a}_{q}_{t}" for a in arms for q in QS for t in TAUS]
    n0 = len(T)
    T = T.dropna(subset=line_cols + ["rel"])
    say(f"  {track}: test rows {len(T)} (dropped {n0 - len(T)} with a missing arm or regime); "
        f"{T['date'].min().date()} -> {T['date'].max().date()}")
    return T


# ---------------------------------------------------------------- scoring
def quintiles(T):
    edges = np.quantile(T["rel"], [0.2, 0.4, 0.6, 0.8])
    return np.searchsorted(edges, T["rel"].to_numpy())


def exceed_tensor(T, arms):
    """rows x arms x 30 regime-cell flags (6 rung cols) and 12 unconditional cols."""
    R = np.stack([np.column_stack([(T[q] > T[f"{a}_{q}_{t}"]).to_numpy(float) for q, t in CELLS]) for a in arms], 1)
    U = np.stack([np.column_stack([(T[q] > T[f"{a}_{q}_{t}"]).to_numpy(float) for q in QS for t in TAUS]) for a in arms], 1)
    return R, U


TG6 = np.array([TGT[t] for _, t in CELLS])
TG12 = np.array([TGT[t] for _ in QS for t in TAUS])


def primary_from(R, Wq, idx):
    """R rows x arms x 6, Wq rows x 5 one-hot; returns arms-vector of 30-cell mean |miss| (pp)."""
    w = Wq[idx]; cnt = w.sum(0)                                        # 5
    sums = np.einsum("nk,nac->akc", w, R[idx])                         # arms x 5 x 6
    rate = sums / np.maximum(cnt, 1)[None, :, None]
    return np.abs(rate - TG6[None, None, :]).mean((1, 2)) * 100


def guard_from(U, idx):
    return np.abs(U[idx].mean(0) - TG12[None, :]).mean(1) * 100


def blocks(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :n]


def floor_dist(Wq, rng):
    cnt = Wq.sum(0).astype(np.int64)
    draws = rng.binomial(cnt[None, :, None].repeat(B, 0).repeat(6, 2), TG6[None, None, :]) / cnt[None, :, None]
    return np.abs(draws - TG6[None, None, :]).mean((1, 2)) * 100


def pinball(T, a):
    return sum(V.pinball_loss(T[q].to_numpy(), T[f"{a}_{q}_{t}"].to_numpy(), t / 100).mean()
               for q in ("hl", "oh", "ol") for t in TAUS)


def score_track(T, track, arms=ARMS, rng=None, verbose=True):
    q = quintiles(T)
    Wq = np.eye(5)[q]
    R, U = exceed_tensor(T, arms)
    n = len(T)
    full = np.arange(n)
    prim, guard = primary_from(R, Wq, full), guard_from(U, full)
    i0 = arms.index("A0")
    elig = guard <= guard[i0] + 1.0
    pin = np.array([pinball(T, a) for a in arms]); pin = pin / pin[i0]
    order = [i for i in np.argsort(prim) if elig[i]]
    win, run = order[0], order[1]
    BI = blocks(n, rng)
    PB = np.array([primary_from(R, Wq, b) for b in BI])                 # B x arms
    diff_wr = PB[:, win] - PB[:, run]
    tie = np.quantile(diff_wr, 0.05) <= 0 <= np.quantile(diff_wr, 0.95)
    chosen = win
    if tie and pin[run] < pin[win]:
        chosen = run
    eligm = np.where(elig, 0, np.inf)
    sel = np.argmin(PB + eligm[None, :], 1)                             # re-selected inside each draw
    dsel = PB[np.arange(B), sel] - PB[:, i0]
    fl = floor_dist(Wq, rng)
    halves = {}
    for h, (y0, y1) in {"2018-22": (2018, 2022), "2023-26": (2023, 2026)}.items():
        m = ((T["year"] >= y0) & (T["year"] <= y1)).to_numpy()
        Th = T[m].reset_index(drop=True)
        qh = np.eye(5)[q[m]]
        Rh = R[m]
        BH = blocks(len(Th), rng)
        PH = np.array([primary_from(Rh, qh, b) for b in BH])
        sh = np.argmin(PH + eligm[None, :], 1)
        dh = PH[np.arange(B), sh] - PH[:, i0]
        ph = primary_from(Rh, qh, np.arange(len(Th)))
        halves[h] = {"n": int(m.sum()), "chosen_primary": float(ph[chosen]), "A0_primary": float(ph[i0]),
                     "diff_ci90": [float(np.quantile(dh, 0.05)), float(np.quantile(dh, 0.95))]}
    ci = [float(np.quantile(dsel, 0.05)), float(np.quantile(dsel, 0.95))]
    validated = ci[1] < 0 and all(v["diff_ci90"][1] < 0 for v in halves.values())
    null = (not validated) and ci[0] > -0.3
    verdict = "VALIDATED" if validated else "NULL" if null else "UNDERPOWERED"
    res = {"n": n, "dates": [str(T["date"].min().date()), str(T["date"].max().date())],
           "arms": {a: {"primary": float(prim[i]), "guard": float(guard[i]), "eligible": bool(elig[i]),
                        "pinball_vs_A0": float(pin[i]),
                        "primary_ci90": [float(np.quantile(PB[:, i], 0.05)), float(np.quantile(PB[:, i], 0.95))]}
                    for i, a in enumerate(arms)},
           "winner": arms[win], "runner_up": arms[run], "tie": bool(tie), "chosen": arms[chosen],
           "chosen_minus_A0_ci90_reselected": ci, "halves": halves,
           "floor_median": float(np.median(fl)), "floor_p90": float(np.quantile(fl, 0.9)),
           "chosen_calibrated_to_noise": bool(prim[chosen] <= np.quantile(fl, 0.9)), "verdict": verdict}
    # reported, no rule
    by_q = {}
    for a in sorted({arms[i0], arms[chosen], arms[win], "H8"} & set(arms)):
        k = arms.index(a)
        rows = []
        for j in range(5):
            m = q == j
            rows.append([float(R[m, k, 0].mean() * 100), float(R[m, k, 1].mean() * 100)])
        by_q[a] = rows
    res["hl75_hl90_by_quintile"] = by_q
    yr = {}
    for a in by_q:
        yr[a] = {int(y): [float((g["hl"] > g[f"{a}_hl_75"]).mean() * 100), float((g["hl"] > g[f"{a}_hl_90"]).mean() * 100)]
                 for y, g in T.groupby("year")}
    res["hl75_hl90_by_year"] = yr
    sl = {}
    for a in arms:
        x = np.log(T[a]) - np.log(T[a]).mean(); y = np.log(T["hl"]) - np.log(T["hl"]).mean()
        sl[a] = {"slope": float((x * y).sum() / (x * x).sum()),
                 "median_abs_daily_change_pct": float(np.median(np.abs(np.diff(np.log(T[a].to_numpy())))) * 100)}
    res["slope_and_jitter"] = sl
    if verbose:
        say(f"\n== {track}: {n} test sessions {res['dates'][0]} -> {res['dates'][1]}   noise floor median "
            f"{res['floor_median']:.2f}pp, p90 {res['floor_p90']:.2f}pp")
        say(f"  {'arm':4} {'name':22} {'PRIMARY':>8} {'90% CI':>15} {'GUARD':>6} {'pinball':>8} {'slope':>6}")
        for i in np.argsort(prim):
            a = arms[i]; r = res["arms"][a]
            say(f"  {a:4} {NAMES[a]:22} {r['primary']:7.2f}  [{r['primary_ci90'][0]:5.2f},{r['primary_ci90'][1]:5.2f}]"
                f" {r['guard']:6.2f}{'' if r['eligible'] else '*'} {r['pinball_vs_A0']:8.4f} {sl[a]['slope']:6.2f}")
        say(f"  (* = fails GUARD)  winner {res['winner']}, runner-up {res['runner_up']}, tie={res['tie']}, "
            f"chosen {res['chosen']}")
        say(f"  chosen - A0 (re-selected in bootstrap) 90% CI [{ci[0]:+.2f}, {ci[1]:+.2f}]pp; halves: " +
            "; ".join(f"{h} {v['chosen_primary']:.2f} vs A0 {v['A0_primary']:.2f} CI [{v['diff_ci90'][0]:+.2f},{v['diff_ci90'][1]:+.2f}]"
                      for h, v in halves.items()))
        say(f"  calibrated to noise: {res['chosen_calibrated_to_noise']}   VERDICT {verdict}")
        for a, rows in by_q.items():
            say(f"  HL>p75/p90 by quintile {a:4}: " + "  ".join(f"Q{j+1} {r[0]:4.1f}/{r[1]:4.1f}" for j, r in enumerate(rows)))
    return res


# ---------------------------------------------------------------- mirror + positive control
def mirror(S, track, rng):
    """Realised drawn as sigma_A0 x a random train day's (hl,oc,oh,ol)/sigma_A0 vector: regime-free by construction."""
    P = S.copy()
    for Y in YEARS:
        start, end = pd.Timestamp(f"{Y}-01-01"), pd.Timestamp(f"{Y + 1}-01-01")
        tr = S[(S["date"] < start) & np.isfinite(S["A0"])]
        ratio = tr[list(QS)].to_numpy() / tr["A0"].to_numpy()[:, None]
        m = ((P["date"] >= start) & (P["date"] < end)).to_numpy()
        pick = ratio[rng.integers(0, len(ratio), m.sum())]
        P.loc[m, list(QS)] = pick * P.loc[m, "A0"].to_numpy()[:, None]
    T = walk_forward(P, track, arms=["A0", "E4"])
    r = score_track(T, f"{track} MIRROR", arms=["A0", "E4"], rng=rng, verbose=False)
    say(f"  MIRROR {track}: A0 primary {r['arms']['A0']['primary']:.2f}pp vs floor p90 {r['floor_p90']:.2f}pp; "
        f"HL>p75 Q1..Q5 " + " ".join(f"{x[0]:.1f}" for x in r["hl75_hl90_by_quintile"]["A0"]))
    return {"A0_primary": r["arms"]["A0"]["primary"], "floor_p90": r["floor_p90"],
            "hl75_by_quintile": [x[0] for x in r["hl75_hl90_by_quintile"]["A0"]]}


def positive_control(rng):
    n = 2600
    om, al, be = 0.02, 0.08, 0.90
    var = np.empty(n); r = np.empty(n); var[0] = om / (1 - al - be)
    for i in range(n):
        if i:
            var[i] = om + al * r[i - 1] ** 2 + be * var[i - 1]
        r[i] = np.sqrt(var[i]) * rng.standard_normal()
    sig = np.sqrt(var)                                                    # daily %, known
    steps = 1320
    hl = np.empty(n); oh = np.empty(n); ol = np.empty(n); oc = np.empty(n)
    for i in range(n):
        p = np.cumsum(rng.standard_normal(steps)) * sig[i] / np.sqrt(steps)
        p = np.concatenate([[0], p])
        hl[i], oh[i], ol[i], oc[i] = p.max() - p.min(), p.max(), -p.min(), abs(p[-1])
    dates = pd.bdate_range("2016-01-04", periods=n)
    rv10 = pd.Series(r).rolling(10).std().shift(1).to_numpy()            # the A0 role: noisy short window, as of yesterday
    S = pd.DataFrame({"date": dates, "hl": hl, "oc": oc, "oh": oh, "ol": ol, "TRUE": sig, "A0": rv10,
                      "SHR": np.exp(0.5 * np.log(sig) + 0.5 * np.log(sig).mean())})
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    S["iv"] = np.nan
    global YEARS
    keep = YEARS
    YEARS = range(2018, int(dates[-1].year) + 1)
    T = walk_forward(S, "PC2", arms=["A0", "TRUE", "SHR"])
    YEARS = keep
    res = score_track(T, "PC2", arms=["A0", "TRUE", "SHR"], rng=rng, verbose=False)
    bq = {a: [x[0] for x in res["hl75_hl90_by_quintile"].get(a, [])] for a in ("A0", "TRUE")}
    k = ["A0", "TRUE", "SHR"].index("TRUE")
    true_ok = res["arms"]["TRUE"]["primary"] <= res["floor_p90"]
    q = quintiles(T); R, _ = exceed_tensor(T, ["A0", "TRUE", "SHR"])
    a0_q = [R[q == j, 0, 0].mean() * 100 for j in range(5)]
    tilt = a0_q[0] - a0_q[4]
    say(f"positive control 2 (synthetic GARCH): TRUE primary {res['arms']['TRUE']['primary']:.2f}pp vs floor p90 "
        f"{res['floor_p90']:.2f} -> {'ok' if true_ok else 'FAIL'}; rv10 HL>p75 Q1-Q5 {tilt:+.1f}pp "
        f"({' '.join(f'{x:.1f}' for x in a0_q)}) -> {'ok' if tilt >= 5 else 'FAIL'}; "
        f"SHR primary {res['arms']['SHR']['primary']:.2f} (reported)")
    return {"true_primary": res["arms"]["TRUE"]["primary"], "floor_p90": res["floor_p90"], "rv10_q1_minus_q5": tilt,
            "pass": bool(true_ok and tilt >= 5), "shr_primary": res["arms"]["SHR"]["primary"]}


def c_vs_f(rng):
    C = pd.read_parquet(OUT / "rows_C.parquet").set_index("date")
    F = pd.read_parquet(OUT / "rows_F.parquet").set_index("date")
    J = C[["hl", "oh", "ol"]].join(F[["hl", "oh", "ol"]], lsuffix="_c", rsuffix="_f", how="inner").dropna()
    n = len(J); BI = blocks(n, rng)
    out, same = {}, True
    for qn in ("hl", "oh", "ol"):
        for p in (50, 75):
            f = lambda idx: np.percentile(J[f"{qn}_f"].to_numpy()[idx], p) / np.percentile(J[f"{qn}_c"].to_numpy()[idx], p)
            pt = f(np.arange(n)); bs = np.array([f(b) for b in BI])
            ci = [float(np.quantile(bs, 0.05)), float(np.quantile(bs, 0.95))]
            ok = 0.97 <= pt <= 1.03 and ci[0] >= 0.95 and ci[1] <= 1.05
            same &= ok
            out[f"{qn}_p{p}"] = {"ratio": float(pt), "ci90": ci, "ok": bool(ok)}
    say(f"\n== H3 C vs F on {n} common London dates: F/C ratio (90% CI)")
    for k, v in out.items():
        say(f"  {k:7} {v['ratio']:.4f} [{v['ci90'][0]:.4f}, {v['ci90'][1]:.4f}] {'ok' if v['ok'] else 'OUTSIDE'}")
    say(f"  -> {'SAME (F reuses the C spec)' if same else 'DIFFERENT (F keeps its own winner)'}")
    return {"n": n, "ratios": out, "same": bool(same)}


def main():
    rng = np.random.default_rng(SEED)
    pc = positive_control(rng)
    if not pc["pass"]:
        (OUT / "report.txt").write_text("\n".join(LOG))
        raise SystemExit("positive control 2 FAILED: scorer not trusted, nothing scored")
    res = {"seed": SEED, "positive_control_2": pc}
    for track in ("C", "F"):
        S = pd.read_parquet(OUT / f"rows_{track}.parquet")
        S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
        T = walk_forward(S, track)
        T.to_parquet(OUT / f"test_{track}.parquet")
        res[track] = score_track(T, track, rng=rng)
        res[track]["mirror"] = mirror(S, track, rng)
    res["c_vs_f"] = c_vs_f(rng)
    res["same_winner_both_tracks"] = res["C"]["chosen"] == res["F"]["chosen"]
    (OUT / "results.json").write_text(json.dumps(res, indent=1))
    (OUT / "report.txt").write_text("\n".join(LOG))


if __name__ == "__main__":
    main()
