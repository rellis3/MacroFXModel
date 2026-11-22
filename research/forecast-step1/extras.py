"""Step 1 follow-ups, run after pipeline.py (same sessions, same walk-forward rules, same years).

E1  Do QLIKE and pinball agree on the model ranking, per level?
E2  Is the winner stable year by year (pinball per calendar year)?
E3  Futures vs CFD as the forecast source: does a sigma built from futures forecast the CFD's levels better than the
    CFD's own sigma (and the reverse)? Multipliers are always fitted on the target's own past sessions.
E4  Refinement round of the winning family (HAR on intraday realised variance): 1-, 5-, 15-minute RV, semivariance
    HAR, a direct-range HAR, and a recent-window (500-session) multiplier. Chosen on discovery, judged on validation.

    python research/forecast-step1/extras.py
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

import pipeline as P

LEV = P.LEVELS


def pin(s, fc, days, lev):
    return P._loss_matrix(s, fc, days, lev)


def split(days):
    d = days[(days.year >= P.DISCOVERY[0]) & (days.year <= P.DISCOVERY[1])]
    v = days[(days.year >= P.VALIDATION[0]) & (days.year <= P.VALIDATION[1])]
    return d, v


# ---------------------------------------------------------------------------------------------------------------- E1
def e1(board):
    out = {}
    names = [n for n in board if not n.startswith("bench")]
    for lev in LEV:
        pb = [board[n]["validation"][lev]["pinball"] for n in names]
        ql = [board[n]["validation"][lev]["qlike"] for n in names]
        rho = spearmanr(pb, ql).statistic
        top_pb = names[int(np.argmin(pb))]
        top_ql = names[int(np.argmin(ql))]
        out[lev] = {"spearman": float(rho), "best_pinball": top_pb, "best_qlike": top_ql}
    return out


# ---------------------------------------------------------------------------------------------------------------- E2
def e2(s, F, days):
    out = {}
    for lev in LEV:
        rows = {}
        for y in sorted(set(days.year)):
            dy = days[days.year == y]
            if len(dy) < 100:
                continue
            losses = {n: float(pin(s, F[n], dy, lev).mean()) for n in F}
            best = min(losses, key=losses.get)
            rows[int(y)] = {"best": best, "har_rv5_rank": int(sorted(losses, key=losses.get).index("har_rv5") + 1),
                            "n_models": len(losses)}
        out[lev] = rows
    return out


# ---------------------------------------------------------------------------------------------------------------- E3
def e3(sym):
    sF, sC = P.cached_sessions(sym, "F"), P.cached_sessions(sym, "C")
    sigF = P.build_models(sF)["har_rv5"]
    sigC = P.build_models(sC)["har_rv5"]
    out = {}
    for tgt, s, own, other, other_name in (("C", sC, sigC, sigF, "futures"), ("F", sF, sigF, sigC, "CFD")):
        common = s.index.intersection(other.dropna().index)
        s2 = s.loc[common]
        fo = P.sigma_forecasts(s2, own.reindex(common))
        fx = P.sigma_forecasts(s2, other.reindex(common))
        days = P.common_days(s2, {"own": fo, "x": fx})
        _, val = split(days)
        rng = np.random.default_rng(P.SEED)
        res = {}
        for lev in LEV:
            lo, lx = pin(s2, fo, val, lev), pin(s2, fx, val, lev)
            d = (lx - lo) / lo.mean()
            res[lev] = {"rel_change": float(d.mean()), "ci90": P.block_boot_ci(d, rng),
                        "hit_p75_own": float((s2.loc[val, lev] > fo[(lev, .75)].loc[val]).mean()),
                        "hit_p75_x": float((s2.loc[val, lev] > fx[(lev, .75)].loc[val]).mean())}
        out[f"{other_name}_sigma_on_{'CFD' if tgt == 'C' else 'futures'}_levels"] = {"n_val": int(len(val)), **res}
    return out


# ---------------------------------------------------------------------------------------------------------------- E4
def har_semi(s):
    """HAR on log rv5 with the previous day split into up and down semivariance (Patton-Sheppard)."""
    v = s["rv5"]
    lv = np.log(v.clip(lower=1e-12))
    X = pd.DataFrame({"p": np.log(s["rsp5"].clip(lower=1e-12)), "n": np.log(s["rsn5"].clip(lower=1e-12)),
                      "w": np.log(v.rolling(5).mean().clip(lower=1e-12)),
                      "m": np.log(v.rolling(22).mean().clip(lower=1e-12))}).shift(1)
    return _fit_har(X, lv)


def har_direct(s):
    """HAR whose target is the session range itself: log(HL^2) on log rv5 day/week/month (sessions < t)."""
    v = s["rv5"]
    y = np.log((s["hl"] ** 2).clip(lower=1e-12))
    X = pd.DataFrame({"d": np.log(v.clip(lower=1e-12)), "w": np.log(v.rolling(5).mean().clip(lower=1e-12)),
                      "m": np.log(v.rolling(22).mean().clip(lower=1e-12)),
                      "r": np.log((s["hl"] ** 2).rolling(5).mean().clip(lower=1e-12))}).shift(1)
    return _fit_har(X, y)


def _fit_har(X, y):
    sig = pd.Series(np.nan, index=y.index)
    for yr in sorted(set(y.index.year)):
        tr = (y.index.year < yr) & X.notna().all(axis=1) & y.notna()
        if tr.sum() < P.MIN_TRAIN:
            continue
        A = np.column_stack([np.ones(tr.sum()), X[tr].to_numpy()])
        beta, *_ = np.linalg.lstsq(A, y[tr].to_numpy(), rcond=None)
        te = (y.index.year == yr) & X.notna().all(axis=1)
        sig[te] = np.sqrt(np.exp(np.column_stack([np.ones(te.sum()), X[te].to_numpy()]) @ beta))
    return sig


def recent_window_forecasts(s, sig, window=500):
    """Like sigma_forecasts, but the multiplier uses only the last `window` sessions before Jan 1 (adapts to drift)."""
    out = {}
    ok = sig.notna() & (sig > 0)
    for lev in LEV:
        ratio = (s[lev] / sig)[ok]
        for tau in P.TAUS:
            q = pd.Series(np.nan, index=s.index)
            for y in sorted(set(s.index.year)):
                tr = ratio[ratio.index.year < y].iloc[-window:]
                if len(tr) < P.MIN_TRAIN:
                    continue
                te = ok & (s.index.year == y)
                q[te] = float(np.quantile(tr, tau)) * sig[te]
            out[(lev, tau)] = q
    return out


def e4(s):
    F = {
        "har_rv5": P.sigma_forecasts(s, P._har(s["rv5"])),
        "har_rv1": P.sigma_forecasts(s, P._har(s["rv1"])),
        "har_rv15": P.sigma_forecasts(s, P._har(s["rv15"])),
        "har_semi_rv5": P.sigma_forecasts(s, har_semi(s)),
        "har_direct_range": P.sigma_forecasts(s, har_direct(s)),
        "har_rv5_recent500": recent_window_forecasts(s, P._har(s["rv5"])),
        "bench_quantile_60": P.benchmark_forecasts(s, 60),
    }
    days = P.common_days(s, F)
    disc, val = split(days)
    reg = P.regime(s)
    board = {n: {"discovery": P.score_block(s, fc, disc, reg), "validation": P.score_block(s, fc, val, reg)}
             for n, fc in F.items()}
    picks = {lev: min((n for n in F if not n.startswith("bench")), key=lambda n: board[n]["discovery"][lev]["pinball"])
             for lev in LEV}
    rng = np.random.default_rng(P.SEED)
    vs = {}
    for lev in LEV:
        lp, l0 = pin(s, F[picks[lev]], val, lev), pin(s, F["har_rv5"], val, lev)
        d = (lp - l0) / l0.mean()
        vs[lev] = {"pick": picks[lev], "vs_har_rv5": float(d.mean()), "ci90": P.block_boot_ci(d, rng)}
    slim = {n: {lev: {k: b["validation"][lev][k] for k in ("pinball", "qlike", "hit_p50", "hit_p75", "hit_p90",
                                                             "regime_miss_pp")} for lev in LEV} for n, b in board.items()}
    return {"picks_vs_har_rv5_validation": vs, "validation": slim, "n_val": int(len(val))}


def main():
    res = {}
    for sym in P.INSTR:
        res[sym] = {"E3": e3(sym)}
        for track in ("F", "C"):
            s = P.cached_sessions(sym, track)
            F = P.all_forecasts(s)
            days = P.common_days(s, F)
            board = json.load(open(P.OUT / f"{sym}_{track}.json", encoding="utf-8"))["scoreboard"]
            res[sym][track] = {"E1": e1(board), "E2": e2(s, F, days), "E4": e4(s)}
            print(sym, track, "done", flush=True)
    (P.OUT / "extras.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")


if __name__ == "__main__":
    main()
