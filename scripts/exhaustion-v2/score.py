"""exhaustion-v2 scoring (forge/EXHAUSTION_V2_NQ_PREREG.md incl. A1).

    python scripts/exhaustion-v2/score.py NQ     -> analysis/output/exhaustion-v2-nq/{results.json, report.txt}

Order: positive control (synthetic random-walk sessions) must pass before real touches are scored. Candidates X0-X8
are fitted per test year on touches from earlier years only. Scoring: 20-cell calibration miss (4 London time
buckets x 5 sigma quintiles) per target, averaged over the two targets; GUARD over family x rung; log loss vs X0;
session block bootstrap (63) with the winner re-selected in every draw.
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import norm

warnings.simplefilter("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).parent))
import touches as TT  # noqa: E402
from forge.data_screens import input_hashes  # noqa: E402

SEED, B, BLOCK = 20261119, 2000, 63
SUBSTEPS = 60   # positive-control path monitoring per minute (gold exhaustion A1: 8 biased X2 by +0.9..1.5pp)
TEST_YEARS = range(2019, 2027)
TARGETS = ("next", "sig")
FAMS, RUNGS = TT.FAMS, TT.RUNGS
FR = [(f, r) for f in FAMS for r in RUNGS]
EPISODES = {"covid": ("2020-02-19", "2020-06-30"), "bear2022": ("2022-01-01", "2022-12-31"),
            "tariff2025": ("2025-03-01", "2025-05-31")}
FAULT = {"gap", "frozen", "partial", "missing", "ts_dup", "ts_order", "ts_weekend", "round_trip", "roll_gap", "cvf_open"}
EPS = 1e-4
LOG: list[str] = []


def say(s=""):
    print(s, flush=True)
    LOG.append(s)


def clip(p):
    return np.clip(p, EPS, 1 - EPS)


def logit(p):
    p = clip(p)
    return np.log(p / (1 - p))


def p_rw(delta, s_price):
    """P(max of a driftless Brownian motion over the remaining time >= delta), reflection principle."""
    with np.errstate(divide="ignore", invalid="ignore"):
        return clip(2 * (1 - norm.cdf(delta / np.maximum(s_price, 1e-12))))


def bucket4(minute):
    return np.searchsorted([420, 720, 960], minute, side="right")


# ---------------------------------------------------------------- features
def shares(clock: pd.Series, minute):
    """Vol-clock share of the whole-day variance remaining in [minute, 22:00) and elapsed in [00:00, minute)."""
    c = clock.to_numpy()
    cum = np.r_[0, np.cumsum(c)]
    b = np.minimum(np.asarray(minute) // 5, 264)
    return cum[264] - cum[b], cum[b]


def prep(X: pd.DataFrame, target: str) -> pd.DataFrame:
    d = X.copy()
    d["delta"] = d["d_next"] if target == "next" else d["d_sig"]
    d = d[np.isfinite(d["delta"]) & (d["delta"] > 0)].copy()
    d["y"] = (d["further"] >= d["delta"]).astype(float)
    d["fr"] = d["fam"] + d["rung"].astype(str)
    d["b4"] = bucket4(d["min"].to_numpy())
    d["b2h"] = d["min"] // 120
    return d


def base_probs(d, clock):
    rem, el = shares(clock, d["min"].to_numpy())
    sp = d["sp"].to_numpy()
    out = {"X1": p_rw(d["delta"].to_numpy(), sp * np.sqrt(np.maximum(d["tau"].to_numpy(), 1) / 1440)),
           "X2": p_rw(d["delta"].to_numpy(), sp * np.sqrt(np.maximum(rem, 1e-6)))}
    sig = d["sig"].to_numpy() / 100
    with np.errstate(divide="ignore", invalid="ignore"):
        rho = d["rv_before"].to_numpy() / (sig ** 2 * el)
    rho = np.where(np.isfinite(rho) & (el > 0.002), np.clip(rho, 0.05, 20), 1.0)
    u = np.clip(d["range_before"].to_numpy() / sp, 0.05, 10)
    return out, rem, rho, u


def fit_logistic(F, y, ridge=1.0):
    F1 = np.column_stack([np.ones(len(F)), F])

    def f(w):
        z = F1 @ w
        ll = np.sum(np.logaddexp(0, z) - y * z)
        g = F1.T @ (1 / (1 + np.exp(-z)) - y)
        return ll + 0.5 * ridge * np.sum(w[1:] ** 2), g + ridge * np.r_[0, w[1:]]
    w = minimize(f, np.zeros(F1.shape[1]), jac=True, method="L-BFGS-B").x
    return lambda G: clip(1 / (1 + np.exp(-(np.column_stack([np.ones(len(G)), G]) @ w))))


def ll(y, p):
    p = clip(p)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def predict_year(tr, te, clock, track, cands):
    """All candidates for one test year: fitted on tr (earlier years), evaluated on te. Returns dict cand -> probs."""
    out = {}
    btr, rem_tr, rho_tr, u_tr = base_probs(tr, clock)
    bte, rem_te, rho_te, u_te = base_probs(te, clock)
    ytr = tr["y"].to_numpy()
    rate = tr.groupby("fr")["y"].mean()
    out["X0"] = clip(te["fr"].map(rate).fillna(tr["y"].mean()).to_numpy())
    out["X1"], out["X2"] = bte["X1"], bte["X2"]
    g = tr.groupby(["fr", "b2h"])["y"].agg(["sum", "count"])
    key = pd.MultiIndex.from_arrays([te["fr"], te["b2h"]])
    s = g["sum"].reindex(key).fillna(0).to_numpy(); n = g["count"].reindex(key).fillna(0).to_numpy()
    out["X3"] = clip((s + 20 * out["X0"]) / (n + 20))
    sp_tr, sp_te = tr["sp"].to_numpy(), te["sp"].to_numpy()
    dl_tr, dl_te = tr["delta"].to_numpy(), te["delta"].to_numpy()
    s_tr, s_te = sp_tr * np.sqrt(np.maximum(rem_tr, 1e-6)), sp_te * np.sqrt(np.maximum(rem_te, 1e-6))

    def grid(fn_tr, fn_te, vals):
        best = min(vals, key=lambda v: ll(ytr, p_rw(dl_tr, fn_tr(v))).mean())
        return p_rw(dl_te, fn_te(best)), float(best)
    out["X4"], b4 = grid(lambda b: s_tr * rho_tr ** b, lambda b: s_te * rho_te ** b, np.round(np.arange(0, 1.01, 0.1), 2))
    ev_tr, ev_te = tr["event_to_come"].to_numpy(), te["event_to_come"].to_numpy()
    out["X5"], k5 = grid(lambda k: s_tr * np.sqrt(np.where(ev_tr, k, 1.0)), lambda k: s_te * np.sqrt(np.where(ev_te, k, 1.0)),
                         np.arange(1, 3.01, 0.25))
    out["X6"], b6 = grid(lambda b: s_tr * u_tr ** b, lambda b: s_te * u_te ** b, np.round(np.arange(-1, 1.01, 0.1), 2))
    frs = [f"{f}{r}" for f, r in FR][1:]

    def feats7(d, b, rho, u):
        return np.column_stack([logit(b["X2"]), np.log(rho), d["event_to_come"].to_numpy(float), np.log(u)] +
                               [(d["fr"] == k).to_numpy(float) for k in frs])
    out["X7"] = fit_logistic(feats7(tr, btr, rho_tr, u_tr), ytr)(feats7(te, bte, rho_te, u_te))
    if track == "F" and "X8" in cands:
        def feats8(d, b):
            return np.column_stack([logit(b["X2"]), np.nan_to_num(d["vwap_dist"].to_numpy(), nan=0.0),
                                    np.nan_to_num(np.log(np.clip(d["vol_ratio"].to_numpy(), 0.05, 50)), nan=0.0)])
        out["X8"] = fit_logistic(feats8(tr, btr), ytr)(feats8(te, bte))
    return out, {"X4_beta": b4, "X5_k": k5, "X6_beta": b6}


def walk(X, clocks, track, cands):
    """Per target: test rows (2019+) with every candidate's probability."""
    res, fits = {}, {}
    for tg in TARGETS:
        d = prep(X, tg)
        parts = []
        for Y in TEST_YEARS:
            tr, te = d[d["year"] < Y], d[d["year"] == Y].copy()
            if not len(te) or not len(tr):        # rollout A1: a test year needs at least one earlier year to fit on
                continue
            pr, fp = predict_year(tr, te, clocks[Y], track, cands)
            for c in cands:
                te[c] = pr[c]
            fits[f"{tg}_{Y}"] = fp
            parts.append(te)
        res[tg] = pd.concat(parts, ignore_index=True)
    return res, fits


# ---------------------------------------------------------------- scoring
class Scorer:
    """Per-session sums so the block bootstrap is cheap. Cells: target x bucket4 x quintile (40); guard cells:
    target x family x rung (36)."""

    def __init__(self, R, cands, sessions, qedges):
        self.cands, self.sessions = cands, sessions
        si = {d: i for i, d in enumerate(sessions)}
        ns, nc = len(sessions), len(cands)
        self.P = np.zeros((ns, nc, 40)); self.Y = np.zeros((ns, 40)); self.N = np.zeros((ns, 40))
        self.GP = np.zeros((ns, nc, 36)); self.GY = np.zeros((ns, 36)); self.GN = np.zeros((ns, 36))
        self.LL = np.zeros((ns, nc)); self.LN = np.zeros(ns)
        for t, tg in enumerate(TARGETS):
            d = R[tg]
            s = d["date"].map(si).to_numpy()
            q = np.searchsorted(qedges, d["rel"].to_numpy())
            cell = t * 20 + d["b4"].to_numpy() * 5 + q
            gcell = t * 18 + np.array([FR.index((f, r)) for f, r in zip(d["fam"], d["rung"])])
            y = d["y"].to_numpy()
            np.add.at(self.Y, (s, cell), y); np.add.at(self.N, (s, cell), 1)
            np.add.at(self.GY, (s, gcell), y); np.add.at(self.GN, (s, gcell), 1)
            np.add.at(self.LN, s, 1)
            for k, c in enumerate(cands):
                p = d[c].to_numpy()
                np.add.at(self.P, (s, k, cell), p); np.add.at(self.GP, (s, k, gcell), p)
                np.add.at(self.LL, (s, k), ll(y, p))

    @staticmethod
    def _miss(P, Y, N, ncell):
        # P: cands x cells; per target mean over populated cells, then mean over targets
        out = []
        for t in range(2):
            sl = slice(t * ncell, (t + 1) * ncell)
            m = N[sl] > 0
            out.append(np.abs(P[:, sl][:, m] - Y[sl][m]).sum(1) / max(m.sum(), 1) if m.any() else np.zeros(P.shape[0]))
        return np.mean(out, 0) * 100

    def stats(self, idx):
        P, Y, N = self.P[idx].sum(0), self.Y[idx].sum(0), self.N[idx].sum(0)
        GP, GY, GN = self.GP[idx].sum(0), self.GY[idx].sum(0), self.GN[idx].sum(0)
        with np.errstate(invalid="ignore", divide="ignore"):
            prim = self._miss(P / np.maximum(N, 1), Y / np.maximum(N, 1), N, 20)
            guard = self._miss(GP / np.maximum(GN, 1), GY / np.maximum(GN, 1), GN, 18)
        lls = self.LL[idx].sum(0) / max(self.LN[idx].sum(), 1)
        return prim, guard, lls


def blocks(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :n]


def boot(sc, idx_all, elig, i0, rng):
    """CI of (re-selected winner - X0) PRIMARY and of (winner / X0) log loss, over block draws of idx_all."""
    BI = blocks(len(idx_all), rng)
    dp, dl = np.empty(B), np.empty(B)
    big = np.where(elig, 0, np.inf)
    for b in range(B):
        prim, _, lls = sc.stats(idx_all[BI[b]])
        w = int(np.argmin(prim + big))
        dp[b], dl[b] = prim[w] - prim[i0], lls[w] / lls[i0]
    return [float(np.quantile(dp, .05)), float(np.quantile(dp, .95))], [float(np.quantile(dl, .05)), float(np.quantile(dl, .95))]


def floor_dist(R, chosen, qedges, rng, draws=500):
    out = []
    for _ in range(draws):
        miss = []
        for tg in TARGETS:
            d = R[tg]; p = d[chosen].to_numpy()
            y = (rng.random(len(p)) < p).astype(float)
            q = np.searchsorted(qedges, d["rel"].to_numpy()); cell = d["b4"].to_numpy() * 5 + q
            df = pd.DataFrame({"c": cell, "p": p, "y": y}).groupby("c").mean()
            miss.append(np.abs(df["p"] - df["y"]).mean())
        out.append(np.mean(miss) * 100)
    return np.array(out)


def score_track(R, track, cands, rng, flags, sess_hl):
    sessions = sorted(set(R["next"]["date"]) | set(R["sig"]["date"]))
    sess_rel = pd.concat([R[t][["date", "rel"]] for t in TARGETS]).drop_duplicates("date").set_index("date")["rel"]
    qedges = np.quantile(sess_rel.reindex(sessions).to_numpy(), [.2, .4, .6, .8])
    sc = Scorer(R, cands, sessions, qedges)
    alli = np.arange(len(sessions))
    prim, guard, lls = sc.stats(alli)
    i0 = cands.index("X0")
    elig = guard <= guard[i0] + 1.0
    order = [i for i in np.argsort(prim) if elig[i]]
    win, run = order[0], order[1]
    BI = blocks(len(alli), rng)
    dwr = np.array([(lambda p: p[win] - p[run])(sc.stats(BI[b])[0]) for b in range(B)])
    tie = np.quantile(dwr, .05) <= 0 <= np.quantile(dwr, .95)
    chosen = run if (tie and lls[run] < lls[win]) else win
    ci_p, ci_l = boot(sc, alli, elig, i0, rng)
    checks = {}
    sd = pd.DatetimeIndex(sessions)
    for h, (a, b) in {"half 2019-22": ("2019", "2022-12-31"), "half 2023-26": ("2023", "2026-12-31")}.items():
        m = np.flatnonzero((sd >= a) & (sd <= b))
        cp, cl = boot(sc, m, elig, i0, rng)
        p_h = sc.stats(m)[0]
        checks[h] = {"n_sessions": int(len(m)), "ci90": cp, "ll_ratio_ci90": cl, "chosen": float(p_h[chosen]), "X0": float(p_h[i0])}
    # stress windows: three market episodes + the track's two highest-range 63-session windows
    hl = sess_hl.reindex(sessions)
    roll = hl.rolling(63).mean().to_numpy(); taken = np.zeros(len(sessions), bool); eps = dict(EPISODES)
    for i in np.argsort(-np.nan_to_num(roll, nan=-1)):
        if np.isnan(roll[i]) or taken[max(0, i - 62):i + 1].any():
            continue
        taken[max(0, i - 62):i + 1] = True
        eps[f"hi{len([k for k in eps if k.startswith('hi')]) + 1}_{sd[i - 62]:%Y%m}"] = (str(sd[i - 62].date()), str(sd[i].date()))
        if len([k for k in eps if k.startswith("hi")]) == 2:
            break
    for e, (a, b) in eps.items():
        keep = [d for d in sessions if not (pd.Timestamp(a) <= d <= pd.Timestamp(b))]
        checks[f"without {e}"] = sub_check(R, cands, keep, elig, i0, chosen, rng)
    if flags is not None:
        f = flags[flags["track"].isin([track, "CF"]) & flags["screen"].isin(FAULT)]
        keep = [d for d in sessions if d not in set(f["date"])]
        checks["fault flags out"] = sub_check(R, cands, keep, elig, i0, chosen, rng)
    validated = ci_p[1] < 0 and ci_l[1] < 1 and all(v["ci90"][1] < 0 for v in checks.values())
    null = ci_p[0] > -1.0 and ci_l[0] > 0.99
    verdict = "VALIDATED" if validated else ("NULL" if null else "UNDERPOWERED")
    fl = floor_dist(R, cands[chosen], qedges, rng)
    res = {"n_sessions": len(sessions), "n_touches": {t: int(len(R[t])) for t in TARGETS},
           "cands": {c: {"primary": float(prim[i]), "guard": float(guard[i]), "eligible": bool(elig[i]),
                         "logloss": float(lls[i]), "logloss_vs_X0": float(lls[i] / lls[i0])} for i, c in enumerate(cands)},
           "winner": cands[win], "runner_up": cands[run], "tie": bool(tie), "chosen": cands[chosen],
           "chosen_minus_X0_ci90": ci_p, "logloss_ratio_ci90": ci_l, "checks": checks,
           "floor_median": float(np.median(fl)), "floor_p90": float(np.quantile(fl, .9)),
           "chosen_calibrated_to_noise": bool(prim[chosen] <= np.quantile(fl, .9)), "verdict": verdict}
    # reported: observed vs forecast by time bucket for X0, X2 and the chosen one
    tab = {}
    for tg in TARGETS:
        d = R[tg]
        tab[tg] = {c: [[float(g["y"].mean() * 100), float(g[c].mean() * 100), int(len(g))] for _, g in d.groupby("b4")]
                   for c in dict.fromkeys(["X0", "X2", cands[chosen]])}
    res["by_time_bucket_obs_pred_n"] = tab
    say(f"\n== {track}: {len(sessions)} sessions, touches next {len(R['next'])} / sig {len(R['sig'])}; floor median "
        f"{res['floor_median']:.2f}pp, p90 {res['floor_p90']:.2f}pp")
    say(f"  {'cand':4} {'PRIMARY':>8} {'GUARD':>7} {'logloss':>8} {'vs X0':>7}")
    for i in np.argsort(prim):
        r = res["cands"][cands[i]]
        say(f"  {cands[i]:4} {r['primary']:8.2f} {r['guard']:6.2f}{'' if r['eligible'] else '*'} {r['logloss']:8.4f} {r['logloss_vs_X0']:7.4f}")
    say(f"  winner {res['winner']}, runner-up {res['runner_up']}, tie={tie}, chosen {res['chosen']}; chosen-X0 PRIMARY CI "
        f"[{ci_p[0]:+.2f},{ci_p[1]:+.2f}]pp; log loss ratio CI [{ci_l[0]:.4f},{ci_l[1]:.4f}]; calibrated to noise "
        f"{res['chosen_calibrated_to_noise']}")
    for k, v in checks.items():
        say(f"    {k:28} chosen {v['chosen']:.2f} vs X0 {v['X0']:.2f}  CI [{v['ci90'][0]:+.2f},{v['ci90'][1]:+.2f}]"
            f"{'' if v['ci90'][1] < 0 else '  <-- FAILS'}")
    names = ["00-07", "07-12", "12-16", "16-22"]
    for tg in TARGETS:
        for c, rows in tab[tg].items():
            say(f"  {tg:4} {c:3} obs/pred by time: " + "  ".join(f"{names[j]} {r[0]:4.1f}/{r[1]:4.1f} (n{r[2]})" for j, r in enumerate(rows)))
    say(f"  VERDICT {track}: {verdict}")
    return res


def sub_check(R, cands, keep, elig, i0, chosen, rng):
    """Left-out check: recut quintile edges on the kept sessions (ladder A2 convention)."""
    ks = set(keep)
    R2 = {t: R[t][R[t]["date"].isin(ks)] for t in TARGETS}
    sess_rel = pd.concat([R2[t][["date", "rel"]] for t in TARGETS]).drop_duplicates("date").set_index("date")["rel"]
    sessions = sorted(ks & set(sess_rel.index))
    qe = np.quantile(sess_rel.reindex(sessions).to_numpy(), [.2, .4, .6, .8])
    sc = Scorer(R2, cands, sessions, qe)
    idx = np.arange(len(sessions))
    cp, cl = boot(sc, idx, elig, i0, rng)
    p = sc.stats(idx)[0]
    return {"n_sessions": len(sessions), "ci90": cp, "ll_ratio_ci90": cl, "chosen": float(p[chosen]), "X0": float(p[i0])}


# ---------------------------------------------------------------- controls
PC_REPS = 20   # gold exhaustion A2: the floor must include within-session clustering of touch outcomes


def synth_rep(args):
    """One synthetic history (2018 -> 2026-08 Brownian sessions on the real vol clock, lines = known sigma x the real
    line multipliers). Returns X0/X2 PRIMARY, the pooled X2 bias per target, X0's worst time-bucket miss and the
    independent-Bernoulli floor p90 of this history."""
    clock, mult, seed, arm = args
    TT.LINE_ARM = arm
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2018-01-02", "2026-08-20")
    lsig = np.empty(len(dates)); lsig[0] = 0.0
    for i in range(1, len(dates)):
        lsig[i] = 0.97 * lsig[i - 1] + 0.25 * np.sqrt(1 - 0.97 ** 2) * rng.standard_normal()
    sig = 1.2 * np.exp(lsig)                                           # daily %
    rel = pd.Series(sig).div(pd.Series(sig).rolling(250, min_periods=60).median().shift(1)).to_numpy()
    per_min = np.repeat(clock.to_numpy()[:264] / 5, 5)                 # 1320 London minutes
    rows = []
    for i, D in enumerate(dates):
        if not np.isfinite(rel[i]):
            continue
        sub = rng.standard_normal((1320, SUBSTEPS)) * np.sqrt(per_min[:, None] / SUBSTEPS) * sig[i] / 100
        path = np.cumsum(sub.ravel()).reshape(1320, SUBSTEPS)
        start = np.r_[0.0, path[:-1, -1]]
        idx = pd.date_range(pd.Timestamp(D).tz_localize("Europe/London"), periods=1320, freq="1min").tz_convert("UTC")
        g = pd.DataFrame({"open": 100 * np.exp(start), "high": 100 * np.exp(np.maximum(start, path.max(1))),
                          "low": 100 * np.exp(np.minimum(start, path.min(1))), "close": 100 * np.exp(path[:, -1])}, index=idx)
        row = {"date": pd.Timestamp(D), "year": D.year, arm: sig[i], "rel": rel[i]}
        row.update({k: v * sig[i] for k, v in mult.items()})
        rows += TT.touches_for_session(g, pd.Series(row), "C", pd.DatetimeIndex([], tz="UTC"))
    X = pd.DataFrame(rows)
    R, _ = walk(X, {Y: clock for Y in TEST_YEARS}, "C", ["X0", "X2"])
    sessions = sorted(set(R["next"]["date"]) | set(R["sig"]["date"]))
    srel = pd.concat([R[t][["date", "rel"]] for t in TARGETS]).drop_duplicates("date").set_index("date")["rel"]
    qe = np.quantile(srel.reindex(sessions).to_numpy(), [.2, .4, .6, .8])
    prim, _, _ = Scorer(R, ["X0", "X2"], sessions, qe).stats(np.arange(len(sessions)))
    bias = {tg: float((R[tg]["X2"].mean() - R[tg]["y"].mean()) * 100) for tg in TARGETS}
    tb = max(float(R[tg].groupby("b4").apply(lambda x: abs(x["y"].mean() - x["X0"].mean())).max() * 100) for tg in TARGETS)
    fl = floor_dist(R, "X2", qe, rng, draws=200)
    return {"X0": float(prim[0]), "X2": float(prim[1]), "bias": bias, "x0_bucket": tb,
            "bern_p90": float(np.quantile(fl, .9)), "n_touches": int(len(X))}


def positive_control(clock, mult, arm):
    """Gold exhaustion A2. PC_REPS independent synthetic histories the size of the real one. Pass: (1) X2's pooled bias
    averaged over the histories within +/-1pp on both targets (the formula and scorer are right); (2) X0's worst
    time-bucket miss >= 5pp in the median history (the clock effect is recoverable). The spread of X2's PRIMARY across
    histories is the noise floor of a perfect forecaster with the real clustering of touches; it replaces the
    independent-Bernoulli floor for 'calibrated to noise'."""
    from concurrent.futures import ProcessPoolExecutor
    seeds = np.random.SeedSequence(SEED).spawn(PC_REPS)
    jobs = [(clock, mult, int(sq.generate_state(1)[0]), arm) for sq in seeds]
    with ProcessPoolExecutor(max_workers=6) as ex:
        reps = list(ex.map(synth_rep, jobs))
    x2 = np.array([r["X2"] for r in reps])
    bias = {tg: float(np.mean([r["bias"][tg] for r in reps])) for tg in TARGETS}
    tb = float(np.median([r["x0_bucket"] for r in reps]))
    bern = float(np.median([r["bern_p90"] for r in reps]))
    ok = all(abs(v) <= 1.0 for v in bias.values()) and tb >= 5
    say(f"positive control ({PC_REPS} synthetic histories, ~{int(np.mean([r['n_touches'] for r in reps]))} touches each): "
        f"X2 pooled bias next {bias['next']:+.2f}pp / sig {bias['sig']:+.2f}pp; X0 worst time-bucket miss (median) {tb:.1f}pp "
        f"-> {'ok' if ok else 'FAIL'}")
    say(f"  noise floor of a perfect forecaster WITH touch clustering: X2 PRIMARY median {np.median(x2):.2f}pp, p90 "
        f"{np.quantile(x2, .9):.2f}pp (independent-Bernoulli floor p90 {bern:.2f}pp)")
    return {"reps": PC_REPS, "X2_bias": bias, "X0_worst_bucket_median": tb, "X2_primary_reps": x2.tolist(),
            "clustered_floor_median": float(np.median(x2)), "clustered_floor_p90": float(np.quantile(x2, .9)),
            "bernoulli_floor_p90_median": bern, "pass": bool(ok)}


def main(sym):
    out = ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}"
    rng = np.random.default_rng(SEED)
    tracks = TT.L.tracks_for(sym)
    t0 = tracks[0]                                    # positive control on C, or on F for futures-only instruments
    T = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/test_{t0}.parquet")
    TT.LINE_ARM = TT.line_arm(sym, t0)
    mult = {c: float((T[c] / T[TT.LINE_ARM]).median()) for c in T.columns if c.startswith(f"{TT.LINE_ARM}_")}
    clockC = pd.read_parquet(out / f"clock_{t0}.parquet")
    pc = positive_control(clockC[2019] if 2019 in clockC.columns else clockC["2019"] if "2019" in clockC.columns
                          else clockC.iloc[:, 0], mult, TT.LINE_ARM)
    if not pc["pass"]:
        (out / "report.txt").write_text("\n".join(LOG) + "\n")
        raise SystemExit("positive control FAILED: nothing scored")
    flags_p = ROOT / f"analysis/output/data_screens/{sym}/flags.csv"
    flags = pd.read_csv(flags_p, parse_dates=["date"]) if flags_p.exists() else None
    files = [f"analysis/output/exhaustion-v2-{sym.lower()}/touches_{t}{s}.parquet" for t in tracks for s in ("", "_placebo")]
    files += [f"analysis/output/ladder-v2-{sym.lower()}/test_{t}.parquet" for t in tracks]
    res = {"symbol": sym, "tracks": tracks, "positive_control_track": t0, "seed": SEED, "B": B, "block": BLOCK, "positive_control": pc,
           "input_sha256": input_hashes(files + ([str(flags_p.relative_to(ROOT)).replace("\\", "/")] if flags is not None else []))}
    for track in tracks:
        cands = ["X0", "X1", "X2", "X3", "X4", "X5", "X6", "X7"] + (["X8"] if track == "F" else [])
        X = pd.read_parquet(out / f"touches_{track}.parquet")
        clk = pd.read_parquet(out / f"clock_{track}.parquet")
        clocks = {Y: clk[Y] if Y in clk.columns else clk[str(Y)] for Y in TEST_YEARS}
        R, fits = walk(X, clocks, track, cands)
        for tg in TARGETS:
            R[tg].to_parquet(out / f"pred_{track}_{tg}.parquet")
        sess_hl = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/test_{track}.parquet").set_index("date")["hl"]
        res[track] = score_track(R, track, cands, rng, flags, sess_hl)
        c = res[track]["chosen"]
        res[track]["clustered_floor_p90"] = pc["clustered_floor_p90"]
        res[track]["chosen_calibrated_to_clustered_floor"] = bool(res[track]["cands"][c]["primary"] <= pc["clustered_floor_p90"])
        say(f"  {track}: chosen {c} {res[track]['cands'][c]['primary']:.2f}pp vs clustered floor p90 {pc['clustered_floor_p90']:.2f}"
            f" -> calibrated to noise (clustered): {res[track]['chosen_calibrated_to_clustered_floor']}")
        res[track]["fitted"] = fits
        # placebo levels: same fitted models applied to touches of borrowed lines (reported)
        Xp = pd.read_parquet(out / f"touches_{track}_placebo.parquet")
        Rp, _ = walk(Xp, clocks, track, ["X0", "X2"])
        pl = {tg: {"obs": float(Rp[tg]["y"].mean() * 100), "X2": float(Rp[tg]["X2"].mean() * 100),
                   "real_obs": float(R[tg]["y"].mean() * 100), "real_X2": float(R[tg]["X2"].mean() * 100)} for tg in TARGETS}
        res[track]["placebo"] = pl
        say("  placebo levels (random same-year session's lines): " + "; ".join(
            f"{tg}: real obs {v['real_obs']:.1f}% vs X2 {v['real_X2']:.1f}% | placebo obs {v['obs']:.1f}% vs X2 {v['X2']:.1f}%"
            for tg, v in pl.items()))
        for tg in TARGETS:
            ws = R[tg]["wrong_side"].to_numpy()
            if ws.any():
                say(f"  wrong-side dynamic touches ({tg}, n={int(ws.sum())}): obs {R[tg]['y'][ws].mean() * 100:.1f}% vs "
                    f"chosen {R[tg][res[track]['chosen']][ws].mean() * 100:.1f}%")
    (out / "results.json").write_text(json.dumps(res, indent=1, default=str))
    (out / "report.txt").write_text("\n".join(LOG) + "\n")


if __name__ == "__main__":
    main(sys.argv[1].upper() if len(sys.argv) > 1 else "NQ")
