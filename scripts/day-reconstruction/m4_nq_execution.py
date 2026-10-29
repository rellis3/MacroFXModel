"""Day reconstruction, milestone 4: NQ continuation execution test (forge/NQ_CONTINUATION_EXECUTION_PREREG.md).

Frozen rule: buy stop at each of OH_p50/p75/p90, sell stop at each of OL_p50/p75/p90 (archive levels), one trade per
level per day, 1:1 at R = 0.25 x the day's sigma scale, exits on real NAS100 bid/ask, flat at the session close
(London 22:00). Same-bar ambiguity always resolved against the trade (the optimistic alternative is recorded).
Controls: phantom levels (x0.70/0.85/1.15/1.30; B2 quadratic read at x1.0, B1 mean of x0.85/x1.15) and random
continuation entries (K = 5 per real trade within +-120 min of its fill). Exploratory: these data chose the rule.

    python scripts/day-reconstruction/m4_nq_execution.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

ROOT = Path(__file__).resolve().parents[2]
ARC = ROOT / "analysis/output/day-reconstruction/archive"
OUT = ROOT / "analysis/output/day-reconstruction/m4"
OUT.mkdir(parents=True, exist_ok=True)
SEED, B, K = 20261029, 2000, 5
FACT = (0.70, 0.85, 1.15, 1.30)
W_B2 = np.linalg.pinv(np.array([[1, f - 1, (f - 1) ** 2] for f in FACT]))[0]
W_B1 = np.array([0.0, 0.5, 0.5, 0.0])
SLIPS = (0.0, 1.0, 2.0, 4.0)
BASE_SLIP = 1.0
RUNGS = ("p50", "p75", "p90")
SPLIT = "2020-08-21"
rng = np.random.default_rng(SEED)


def load_ba():
    raw = open(ROOT / "data/m1_bidask_bin/nq.bin", "rb").read()
    n = int(np.frombuffer(raw, np.int32, 1)[0])
    tt = np.frombuffer(raw, np.int32, n, 4).astype(np.int64)
    c = np.frombuffer(raw, np.float64, 12 * n, 4 + 4 * n).reshape(12, n)
    return tt, {k: np.ascontiguousarray(c[i]) for i, k in enumerate(
        ["o", "h", "l", "c", "bo", "bh", "bl", "bc", "ao", "ah", "al", "ac"])}


@njit(cache=True)
def exits(bo, bh, bl, bc, ao, ah, al, ac, j0, i1, d, fill, R, slip):
    """Manage an open 1:1 position from bar j0 (first bar AFTER the fill bar) to i1. Returns (R pessimistic,
    R optimistic, exit bar, ambiguous-same-bar flag)."""
    stop = fill - d * R
    tgt = fill + d * R
    for k in range(j0, i1 + 1):
        if d > 0:
            s_hit = bl[k] <= stop
            t_hit = bh[k] > tgt
        else:
            s_hit = ah[k] >= stop
            t_hit = al[k] < tgt
        if s_hit and t_hit:
            px = (min(stop, bo[k]) - slip) if d > 0 else (max(stop, ao[k]) + slip)
            return (px - fill) * d / R, 1.0, k, 1
        if s_hit:
            px = (min(stop, bo[k]) - slip) if d > 0 else (max(stop, ao[k]) + slip)
            r = (px - fill) * d / R
            return r, r, k, 0
        if t_hit:
            return 1.0, 1.0, k, 0
    px = (bc[i1] - slip) if d > 0 else (ac[i1] + slip)
    r = (px - fill) * d / R
    return r, r, i1, 0


@njit(cache=True)
def stop_entry(bo, bh, bl, bc, ao, ah, al, ac, i0, i1, d, L, R, slip):
    """Resting stop order at L from bar i0. Returns (filled, fill bar, fill px, R pess, R opt, exit bar, amb code).
    amb code: 0 none, 1 stop+target in one later bar, 2 stop reachable on the fill bar (taken), 3 target on fill bar
    not credited."""
    for j in range(i0, i1 + 1):
        trig = (ah[j] >= L) if d > 0 else (bl[j] <= L)
        if not trig:
            continue
        fill = (max(L, ao[j]) + slip) if d > 0 else (min(L, bo[j]) - slip)
        stop = fill - d * R
        tgt = fill + d * R
        adv = (bl[j] <= stop) if d > 0 else (ah[j] >= stop)
        fav = (bh[j] > tgt) if d > 0 else (al[j] < tgt)
        if adv:                                   # the adverse extreme may come after the fill: take the stop
            px = (stop - slip) if d > 0 else (stop + slip)
            rp = (px - fill) * d / R
            if j == i1:
                return 1, j, fill, rp, rp, j, 2
            ro, _, _, _ = exits(bo, bh, bl, bc, ao, ah, al, ac, j + 1, i1, d, fill, R, slip)
            return 1, j, fill, rp, (1.0 if fav else ro), j, 2
        if j == i1:
            px = (bc[i1] - slip) if d > 0 else (ac[i1] + slip)
            r = (px - fill) * d / R
            return 1, j, fill, r, (1.0 if fav else r), j, 3 if fav else 0
        rp, ro, ke, amb = exits(bo, bh, bl, bc, ao, ah, al, ac, j + 1, i1, d, fill, R, slip)
        if fav:                                   # target already reached inside the fill bar: not credited
            return 1, j, fill, rp, 1.0, ke, 3
        return 1, j, fill, rp, ro, ke, amb
    return 0, -1, 0.0, 0.0, 0.0, -1, 0


def run_levels(days, ba, idx, factor, slip, mid=False):
    """Every level trade for every day at one ladder scale factor."""
    q = ba
    arr = (q["o"], q["h"], q["l"], q["c"], q["o"], q["h"], q["l"], q["c"]) if mid else \
          (q["bo"], q["bh"], q["bl"], q["bc"], q["ao"], q["ah"], q["al"], q["ac"])
    rows = []
    for r in days.itertuples():
        i0, i1 = idx[r.date]
        R = 0.25 * r.scale
        for rung in RUNGS:
            for d, pct in ((1, getattr(r, f"oh_{rung}_pct")), (-1, getattr(r, f"ol_{rung}_pct"))):
                L = r.open * (1 + d * pct * factor / 100) if factor != 1.0 else getattr(r, f"lvl_{'OH' if d > 0 else 'OL'}_{rung}")
                f, j, fill, rp, ro, ke, amb = stop_entry(*arr, i0, i1, d, L, R, 0.0 if mid else slip)
                if f:
                    rows.append((r.date, r.era, rung, d, j, ke, fill, R, rp, ro, amb))
    return pd.DataFrame(rows, columns=["date", "era", "rung", "dir", "fill_bar", "exit_bar", "fill", "R", "r", "r_opt", "amb"])


def run_random_window(trades, ba, idx, days, slip):
    """PRE-REGISTERED control, found INVALID after the run (amendment A1): K random continuation entries within +-120 min
    of each real fill on the SAME day. Times before the fill are conditioned on the future (price is known to reach the
    level later), which inflates the control. Reported for the record only."""
    tt = TT
    o = days.set_index("date").open
    rows = []
    mid = (ba["bc"] + ba["ac"]) / 2
    for t in trades.itertuples():
        i0, i1 = idx[t.date]
        lo = np.searchsorted(tt, tt[t.fill_bar] - 7200)
        hi = np.searchsorted(tt, tt[t.fill_bar] + 7200, side="right") - 1
        lo, hi = max(lo, i0), min(hi, i1 - 1)
        if hi < lo:
            continue
        for m in rng.integers(lo, hi + 1, K):
            d = 1 if mid[m] > o[t.date] else (-1 if mid[m] < o[t.date] else 0)
            if d == 0:
                continue
            fill = ba["ac"][m] + slip if d > 0 else ba["bc"][m] - slip
            rp, ro, ke, amb = exits(ba["bo"], ba["bh"], ba["bl"], ba["bc"], ba["ao"], ba["ah"], ba["al"], ba["ac"],
                                    m + 1, i1, d, fill, t.R, slip)
            rows.append((t.date, t.era, d, rp, amb))
    return pd.DataFrame(rows, columns=["date", "era", "dir", "r", "amb"])


def run_random_matched(trades, ba, idx, days, slip):
    """AMENDED control (A1): for each real trade, K entries at the SAME London clock time (offset from the session open)
    on randomly chosen OTHER days of the same era. Direction = continuation of that day's move so far (sign of the mid
    close minus that day's open); market entry at the bar close; same R (the real trade's), exits and costs. Uses no
    information from after the entry bar."""
    tt = TT
    mid = (ba["bc"] + ba["ac"]) / 2
    dd = days.set_index("date")
    eras = {e: g.date.to_numpy() for e, g in days.groupby(days.date >= SPLIT)}
    rows = []
    for t in trades.itertuples():
        off = tt[t.fill_bar] - dd.at[t.date, "t_open"]
        pool = eras[t.date >= SPLIT]
        for other in rng.choice(pool, K):
            if other == t.date:
                continue
            i0, i1 = idx[other]
            m = np.searchsorted(tt, dd.at[other, "t_open"] + off, side="right") - 1
            if m < i0 or m >= i1:
                continue
            o = dd.at[other, "open"]
            d = 1 if mid[m] > o else (-1 if mid[m] < o else 0)
            if d == 0:
                continue
            R = 0.25 * dd.at[other, "scale"]                 # that day's own 0.25 sigma
            fill = ba["ac"][m] + slip if d > 0 else ba["bc"][m] - slip
            rp, ro, ke, amb = exits(ba["bo"], ba["bh"], ba["bl"], ba["bc"], ba["ao"], ba["ah"], ba["al"], ba["ac"],
                                    m + 1, i1, d, fill, R, slip)
            rows.append((other, other, d, rp, amb))
    out = pd.DataFrame(rows, columns=["date", "era", "dir", "r", "amb"])
    return out


def summary(tr, col="r"):
    if not len(tr):
        return {"n": 0}
    x = tr.sort_values("fill_bar") if "fill_bar" in tr else tr
    r = x[col].to_numpy()
    cum = np.cumsum(r)
    dd = float(np.max(np.maximum.accumulate(np.r_[0, cum]) - np.r_[0, cum]))
    wins, losses = r[r > 0].sum(), -r[r < 0].sum()
    span = (pd.to_datetime(x.date.max()) - pd.to_datetime(x.date.min())).days / 7
    return {"n": int(len(r)), "per_week": float(len(r) / max(span, 1)), "mean_R": float(r.mean()), "win_rate": float((r > 0).mean()),
            "profit_factor": float(wins / losses) if losses > 0 else None, "max_drawdown_R": dd, "total_R": float(cum[-1])}


def boot_mean(frame, col, w, di):
    pos = frame.date.map(di).to_numpy()
    s = np.bincount(pos, weights=frame[col].to_numpy(float), minlength=len(di))
    n = np.bincount(pos, minlength=len(di)).astype(float)
    return float(s.sum() / max(n.sum(), 1)), (w @ s) / np.maximum(w @ n, 1e-9)


def ci(d):
    return [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]


tt, ba = load_ba()
TT = tt
days = pd.read_parquet(ARC / "NQ_days.parquet")
days = days[days.date <= "2026-08-20"].reset_index(drop=True)
idx, excluded = {}, 0
for r in days.itertuples():
    i0 = np.searchsorted(tt, r.t_open)
    i1 = np.searchsorted(tt, r.t_last, side="right") - 1
    if i1 >= i0 and i0 < len(tt):
        idx[r.date] = (int(i0), int(i1))
    else:
        excluded += 1
days = days[days.date.isin(idx)].reset_index(drop=True)
res = {"days_with_bidask": int(len(days)), "days_without_bidask": excluded, "first_day": days.date.min(), "last_day": days.date.max()}

real = {s: run_levels(days, ba, idx, 1.0, s) for s in SLIPS}
real_gross = run_levels(days, ba, idx, 1.0, 0.0, mid=True)
ph = {f: run_levels(days, ba, idx, f, BASE_SLIP) for f in FACT}
base = real[BASE_SLIP]
rand = run_random_matched(base, ba, idx, days, BASE_SLIP)
rand_window = run_random_window(base, ba, idx, days, BASE_SLIP)
base.to_csv(OUT / "trades_real_base.csv", index=False)

# concurrency
ev = np.r_[np.c_[base.fill_bar, np.ones(len(base))], np.c_[base.exit_bar + 0.5, -np.ones(len(base))]]
ev = ev[np.argsort(ev[:, 0], kind="stable")]
res["max_concurrent_positions"] = int(np.max(np.cumsum(ev[:, 1])))
res["ambiguity_base"] = {"stop_and_target_same_later_bar": int((base.amb == 1).sum()), "stop_reachable_on_fill_bar": int((base.amb == 2).sum()),
                         "target_on_fill_bar_not_credited": int((base.amb == 3).sum()), "trades": int(len(base)),
                         "mean_R_pessimistic": float(base.r.mean()), "mean_R_optimistic": float(base.r_opt.mean())}
for era_name, sel in (("pit_2020_2026", lambda f: f.date >= SPLIT), ("early_2016_2020", lambda f: f.date < SPLIT), ("all", lambda f: f.date >= "")):
    E = {}
    b, g = base[sel(base)], real_gross[sel(real_gross)]
    E["net_base"] = summary(b)
    E["gross_mid"] = summary(g)
    E["by_direction"] = {("long" if d > 0 else "short"): summary(b[b.dir == d]) for d in (1, -1)}
    E["by_rung"] = {rg: summary(b[b.rung == rg]) for rg in RUNGS}
    E["by_year"] = {int(y): summary(x) for y, x in b.groupby(pd.to_datetime(b.date).dt.year)}
    E["cost_sensitivity"] = {f"slip_{s}": summary(real[s][sel(real[s])])["mean_R"] for s in SLIPS}
    E["cost_sensitivity"]["base_plus_2pt_round_trip"] = float((b.r - 2.0 / b.R).mean())
    # day-cluster bootstrap: net mean, gross mean, real - phantom (B2, B1), real - random
    di = {d: i for i, d in enumerate(sorted(days.date[sel(days)]))}          # every session day in the era
    w = rng.poisson(1.0, (B, len(di))).astype(float)
    pn, dn = boot_mean(b, "r", w, di)
    pg, dg = boot_mean(g, "r", w, di)
    pf_ = [boot_mean(ph[f][sel(ph[f])], "r", w, di) for f in FACT]
    pts, drs = np.array([p for p, _ in pf_]), np.array([d for _, d in pf_])
    pr_, drr = boot_mean(rand[sel(rand)], "r", w, di)
    E["bootstrap"] = {
        "net_mean": pn, "net_ci": ci(dn), "gross_mean": pg, "gross_ci": ci(dg),
        "phantom_by_factor": dict(zip(map(str, FACT), pts.tolist())),
        "phantom_B2": float(W_B2 @ pts), "real_minus_B2": float(pn - W_B2 @ pts), "real_minus_B2_ci": ci(dn - np.tensordot(W_B2, drs, 1)),
        "phantom_B1": float(W_B1 @ pts), "real_minus_B1": float(pn - W_B1 @ pts), "real_minus_B1_ci": ci(dn - np.tensordot(W_B1, drs, 1)),
        "random_mean": pr_, "random_n": int(sel(rand).sum()), "real_minus_random": float(pn - pr_), "real_minus_random_ci": ci(dn - drr),
        "INVALID_prereg_window_random_mean": float(rand_window[sel(rand_window)].r.mean())}
    E["random_control_summary"] = summary(rand[sel(rand)])
    res[era_name] = E

# decision rule (prereg §5), primary window = point-in-time era
P, Q = res["pit_2020_2026"], res["early_2016_2020"]
bt = P["bootstrap"]
c1 = {"net_ci_lower_gt_0": bt["net_ci"][0] > 0, "minus_B2_ci_lower_gt_0": bt["real_minus_B2_ci"][0] > 0,
      "minus_random_ci_lower_gt_0": bt["real_minus_random_ci"][0] > 0, "net_gt_0_at_2pt_slip": P["cost_sensitivity"]["slip_2.0"] > 0,
      "net_gt_0_early_era": Q["net_base"]["mean_R"] > 0}
c2 = bt["gross_ci"][0] > 0 or bt["net_mean"] > 0
res["decision_checks"] = {"outcome1_conditions": c1, "outcome2_condition_gross_ci_or_net_point": bool(c2)}
res["decision"] = 1 if all(c1.values()) else (2 if c2 else 3)


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else round(float(o), 5)
    if isinstance(o, (np.integer, np.bool_)):
        return o.item()
    return o


(OUT / "results.json").write_text(json.dumps(clean(res), indent=1))
print(json.dumps(clean({k: res[k] for k in ("days_with_bidask", "days_without_bidask", "max_concurrent_positions", "ambiguity_base", "decision_checks", "decision")}), indent=1))
for e in ("pit_2020_2026", "early_2016_2020"):
    E = res[e]
    print(e, "net", json.dumps(clean(E["net_base"])), "\n  gross", json.dumps(clean(E["gross_mid"])), "\n  boot", json.dumps(clean(E["bootstrap"])),
          "\n  costs", json.dumps(clean(E["cost_sensitivity"])), "\n  dir", json.dumps(clean({k: (v["n"], round(v["mean_R"], 4)) for k, v in E["by_direction"].items()})),
          "\n  rung", json.dumps(clean({k: (v["n"], round(v["mean_R"], 4)) for k, v in E["by_rung"].items()})),
          "\n  year", json.dumps(clean({k: (v["n"], round(v["mean_R"], 3)) for k, v in E["by_year"].items()})))
