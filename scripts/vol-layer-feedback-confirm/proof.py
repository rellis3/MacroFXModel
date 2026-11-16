"""Proof pack for vol-layer-feedback-confirm: reproduction, planted effects, shuffles and power for the five scored cells.

    DATA_ROOT=<main checkout> python -X utf8 scripts/vol-layer-feedback-confirm/proof.py

What it does:
  1. Rebuilds the confirm frame with run.py's own functions (load, errors, har, the M1 hourly RV parquets that run.py wrote,
     bucket misses, the frozen feedback forecasts from discovery/frozen.json) and re-scores each cell's estimate and 95% interval.
     If any differs from confirm/numbers.json by more than 1e-4, the cell's diagnostics fail.
  2. For each cell builds what forge/verdict_gate.py needs, oriented so better is positive:
       persist   slope of today's miss on yesterday's (min 0.10). The question uses the chosen σ, the weaker forecast of the
                 conjunctive cell; the plain σ's estimate and its own proofs are carried in diagnostics, which fail if either fails.
       morning   slope of the 13-22 miss on the 00-13 miss (min 0.10).
       qlike-*   1 − QLIKE ratio (min 0.05, the registered 5% cut).
       cov75     margin inside the 22.5-27.5 band = 2.5 − |coverage − 25| (pp); interval = 2.5 − the farther / nearer CI end's distance
                 from 25 (the TOST reading). min 0.5 pp: the proof's translation of "the interval lies inside the band" into a size.
     Planted: slopes add δ × yesterday's (or the morning) miss to the outcome (large 0.30, min 0.10); QLIKE moves the feedback forecast
     toward realised variance, h^(1−w)·RV^w, with w sized by bisection so the point loss cut rises by the stated amount (large 0.15,
     min 0.05); coverage flips random misses to hits so coverage rises by the stated pp toward 25 (large 0.9, min 0.5).
     Shuffles (20 each): slopes shuffle the regressor's rows within instrument (two-sided: the interval must include 0); QLIKE shuffles
     the feedback input's rows within instrument inside 2023-26 with the frozen b₁ and a past-only scale (one-sided: only a false GAIN
     fails, since noise fed back makes the forecast worse); coverage pairs each day with the chosen p75 lines of another month
     (month-block permutation within instrument) and scores the worst σ tercile's margin (one-sided: a shuffled line set must not look
     calibrated in every tercile).
  3. verdict_gate.decide picks each word. checks.json is written only if every word equals the verdict in results.json; otherwise
     checks_MISMATCH_do_not_commit.json is written and the script exits 2.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT)]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from forge import verdict_gate as G  # noqa: E402

_spec = importlib.util.spec_from_file_location("fbc_run", ROOT / "scripts/vol-layer-feedback-confirm/run.py")
RUN = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(RUN)          # run.py is import-safe (main is guarded)
LR = RUN.LR

SLUG = "vol-layer-feedback-confirm"
OUT = RUN.OUT
N_SHUF = 20
TOL = 1e-4
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.0f}s]", *a, flush=True)


def frame():
    FZ = json.load(open(RUN.DISC / "frozen.json"))["frozen"]
    X = RUN.errors(RUN.load(RUN.END_C))
    X = RUN.har(X)
    H = pd.concat([pd.read_parquet(RUN.DISC / "m1_hours_discovery.parquet"), pd.read_parquet(RUN.CONF / "m1_hours_confirm.parquet")], ignore_index=True)
    X = RUN.add_hours(X, H)
    for nm in ("p", "c"):
        X[f"e1_{nm}"] = X.groupby("inst")[f"e_{nm}"].shift(1)
    X["m_0_13"] = RUN.bucket_miss(X, "RV_0_13", "pit_sig_used")
    X["m_13_22"] = RUN.bucket_miss(X, "RV_13_22", "pit_sig_used")
    EW = {}
    for nm in ("p", "c"):
        for tag, lag, hl in (("hl1", 1, 1), ("hl2", 1, 2), ("hl3", 1, 3), ("hl1_lag2", 2, 1)):
            X[f"h_{nm}_{tag}"], F = RUN.fb_frozen(X, nm, FZ[f"{nm}_{tag}"]["b"], lag, hl)
            if tag == "hl1":
                EW[nm] = F.ew
    return X, FZ, EW


def same(a, b):
    return all(abs(x - y) <= TOL for x, y in zip(a, b))


# ── slope cells ───────────────────────────────────────────────────────────────────────────────────────────────────────
def slope_q(D, y, x, bs, banked, rng):
    st, reps, n = RUN.slope(D, y, x, bs)
    est, lo, hi = st
    rep_ok = same([est, lo, hi], [banked["value"], banked["lo"], banked["hi"]])
    xd = D[x] - D.groupby("inst")[x].transform("mean")

    def plant(delta):
        st2 = RUN.slope(D.assign(_y=D[y] + delta * xd), "_y", x, bs)[0]
        return {"injected": delta, "shift": st2[0] - est, "lo_after": st2[1], "how": f"added {delta} × the demeaned regressor to the outcome; shift = how far the measured slope moved"}
    pl, pm = plant(0.30), plant(0.10)
    e_, l_, h_ = [], [], []
    xv, ii = D[x].to_numpy(), D.inst.to_numpy()
    for _ in range(N_SHUF):
        st3 = RUN.slope(D.assign(_x=RUN.row_shuffle(xv, ii, rng)), y, "_x", bs)[0]
        e_.append(st3[0]); l_.append(st3[1]); h_.append(st3[2])
    shuf = {"effect": float(np.mean(e_)), "lo": float(np.mean(l_)), "hi": float(np.mean(h_)), "each": [round(v, 4) for v in e_],
            "how": f"shuffled the regressor's rows within instrument, {N_SHUF} times; mean interval"}
    return dict(effect=est, lo=lo, hi=hi, min_effect=0.10, planted_large=pl, planted_min=pm, shuffle=shuf), rep_ok, n


# ── QLIKE cells ───────────────────────────────────────────────────────────────────────────────────────────────────────
def qlike_q(X, D, nm, FZ, EW, bs, banked, rng):
    base, fb = f"h_{nm}", f"h_{nm}_hl1"
    st, reps, n = RUN.qratio(D, fb, base, bs)
    est, lo, hi = 1 - st[0], 1 - st[2], 1 - st[1]
    rep_ok = same(st, [banked["value"], banked["lo"], banked["hi"]])
    L0 = RUN.qlike(D.rv5, D[base]).sum()

    def pt(w):
        h = D[fb] ** (1 - w) * D.rv5 ** w
        return 1 - RUN.qlike(D.rv5, h).sum() / L0

    def plant(target):
        lo_, hi_ = 0.0, 1.0
        if pt(hi_) - est < target:
            return {"injected": target, "shift": 0.0, "how": "could not plant a gain this large"}
        for _ in range(50):
            mid = (lo_ + hi_) / 2
            lo_, hi_ = (lo_, mid) if pt(mid) - est >= target else (mid, hi_)
        w = hi_
        st2 = RUN.qratio(D.assign(_h=D[fb] ** (1 - w) * D.rv5 ** w), "_h", base, bs)[0]
        return {"injected": target, "shift": (1 - st2[0]) - est, "w": w, "lo_after": 1 - st2[2],
                "how": f"moved the feedback forecast toward realised variance, h^(1-w)·RV^w with w = {w:.4f}, sized so the point loss cut rises by {target}"}
    pl, pm = plant(0.15), plant(0.05)
    # shuffle: the feedback input's rows shuffled within instrument inside 2023-26, frozen b1, past-only scale recomputed
    mp = 120 if nm == "p" else 40
    b1 = FZ[f"{nm}_hl1"]["b"][1]
    sig2 = ((X.pit_sig_used if nm == "p" else X.c_sig) ** 2).to_numpy()
    rv, ew, inst = X.rv5.to_numpy(), EW[nm].to_numpy(), X.inst.to_numpy()
    conf = (X.date >= RUN.C0).to_numpy()
    e_, l_, h_ = [], [], []
    for _ in range(N_SHUF):
        ewp = ew.copy()
        for i in np.unique(inst):
            pos = np.flatnonzero((inst == i) & conf)
            ewp[pos] = ew[pos][rng.permutation(len(pos))]
        raw = sig2 * np.exp(b1 * ewp)
        hs = np.full(len(X), np.nan)
        for i in np.unique(inst):
            pos = np.flatnonzero(inst == i)
            ratio = rv[pos] / raw[pos]
            v = np.where(np.isfinite(ratio), ratio, 0.0)
            c = np.isfinite(ratio).astype(float)
            cs, cc = np.concatenate([[0], np.cumsum(v)[:-1]]), np.concatenate([[0], np.cumsum(c)[:-1]])
            hs[pos] = np.where(cc >= mp, cs / np.maximum(cc, 1), np.nan) * raw[pos]
        st3 = RUN.qratio(D.assign(_h=pd.Series(hs, index=X.index).loc[D.index]), "_h", base, bs)[0]
        e_.append(1 - st3[0]); l_.append(1 - st3[2]); h_.append(1 - st3[1])
    shuf = {"effect": float(np.mean(e_)), "lo": float(np.mean(l_)), "hi": float(np.mean(h_)), "one_sided": True, "each": [round(v, 4) for v in e_],
            "how": f"shuffled the EWMA feedback input's rows within instrument inside 2023-26 (frozen b1, past-only scale), {N_SHUF} times; only a false gain fails"}
    return dict(effect=est, lo=lo, hi=hi, min_effect=0.05, planted_large=pl, planted_min=pm, shuffle=shuf), rep_ok, n


# ── coverage cell ─────────────────────────────────────────────────────────────────────────────────────────────────────
def margin_of(st):
    v, lo, hi = st
    far = max(abs(lo - 25), abs(hi - 25))
    near = 0.0 if lo <= 25 <= hi else min(abs(lo - 25), abs(hi - 25))
    return 2.5 - abs(v - 25), 2.5 - far, 2.5 - near


def cov_q(S, bs, banked, rng):
    rows = []
    for side in ("oh", "ol"):
        ok = S[f"c_{side}_p75"].notna()
        rows.append(pd.DataFrame({"inst": S.inst, "date": S.date, "ym": S.ym, "regime": S.regime, "r": S[f"r_{side}"], "line": S[f"c_{side}_p75"]})[ok])
    C = pd.concat(rows, ignore_index=True)
    hit = (C.r > C.line).to_numpy() * 100.0
    st = bs.mean(C.date, hit)[0]
    rep_ok = same(st, [banked["value"], banked["lo"], banked["hi"]])
    est, lo, hi = margin_of(st)

    def plant(delta):
        h = hit.copy()
        miss = np.flatnonzero(h == 0)
        k = int(round(delta / 100 * len(h)))
        h[rng.choice(miss, size=k, replace=False)] = 100.0
        m2 = margin_of(bs.mean(C.date, h)[0])
        return {"injected": delta, "shift": m2[0] - est, "lo_after": m2[1], "how": f"flipped {k} random misses to hits (coverage +{delta} pp toward 25%)"}
    pl, pm = plant(0.9), plant(0.5)
    e_, l_, h_ = [], [], []
    for _ in range(N_SHUF):
        line = np.empty(len(C))
        for side_rows in (C.index[: len(rows[0])], C.index[len(rows[0]):]):
            sub = C.loc[side_rows]
            line[side_rows] = RUN.month_perm(sub.line.to_numpy(), sub.inst.to_numpy(), sub.ym.to_numpy(), rng)
        hs = (C.r.to_numpy() > line) * 100.0
        worst = None
        for t in ("quiet", "normal", "busy"):
            m = (C.regime == t).to_numpy()
            mt = margin_of(bs.mean(C.date[m], hs[m])[0])
            if worst is None or mt[0] < worst[0]:
                worst = mt
        e_.append(worst[0]); l_.append(worst[1]); h_.append(worst[2])
    shuf = {"effect": float(np.mean(e_)), "lo": float(np.mean(l_)), "hi": float(np.mean(h_)), "one_sided": True, "each": [round(v, 3) for v in e_],
            "how": f"paired each day with the chosen p75 lines of another month (month blocks permuted within instrument and side), {N_SHUF} times; "
                   "statistic = the worst σ tercile's margin inside the band; a shuffled line set must not look calibrated in every tercile"}
    return dict(effect=est, lo=lo, hi=hi, min_effect=0.5, planted_large=pl, planted_min=pm, shuffle=shuf), rep_ok, len(C), st


def main():
    N = json.load(open(RUN.CONF / "numbers.json"))
    R = N["res"]
    banked = {c["name"].replace("vol-layer-feedback-confirm-", ""): c["verdict"].upper() for c in json.load(open(OUT / "results.json"))["cells"]}
    X, FZ, EW = frame()
    S = X[X.date >= RUN.C0].copy()
    assert S.date.max() <= RUN.END_C
    bs = LR.Boot(S.date)
    rng = np.random.default_rng(RUN.SEED + 7)
    log("frame", len(S), "rows", S.date.nunique(), "dates")
    q = {}

    def finish(key, core, rep_ok, n, n_window, note, extra_ok=True, extra=None):
        ok = bool(rep_ok and extra_ok and n > 0)
        why = "; ".join(w for w in [None if rep_ok else "re-score does not reproduce confirm/numbers.json", None if extra_ok else (extra or {}).get("why")] if w)
        core["diagnostics"] = {"ok": ok, "why": why or None, "note": note, "reproduced": bool(rep_ok),
                               "mde_80pct_realised": round(2.8016 * (core["hi"] - core["lo"]) / 3.92, 4), **(extra or {})}
        core["rows"] = {"used": int(n), "dropped": int(n_window - n), "note": "scored-window rows without the inputs this cell needs are dropped; 943 London dates"}
        q[key] = core
        log(key, {k: core[k] for k in ("effect", "lo", "hi")}, "planted", round(core["planted_large"]["shift"], 4), round(core["planted_min"]["shift"], 4),
            "shuffle", round(core["shuffle"]["lo"], 4), round(core["shuffle"]["hi"], 4), "repro", rep_ok)

    # persist: chosen sigma is the question; plain sigma's proofs ride in diagnostics
    Dp = S.dropna(subset=["e_p", "e1_p"])
    core_p, rep_p, n_p = slope_q(Dp, "e_p", "e1_p", bs, R["A_p"]["main"], rng)
    Dc = S.dropna(subset=["e_c", "e1_c"])
    core_c, rep_c, n_c = slope_q(Dc, "e_c", "e1_c", bs, R["A_c"]["main"], rng)
    plain_dec = G.decide({**core_p, "diagnostics": {"ok": rep_p}, "rows": {"used": n_p, "dropped": 0}})
    finish("persist", core_c, rep_c, n_c, len(S), "Conjunctive cell: the chosen σ (the weaker slope) is the question; the plain σ must pass the same proofs.",
           extra_ok=plain_dec["verdict"] == "VALIDATED",
           extra={"why": f"plain σ proof gives {plain_dec['verdict']}", "plain": {k: core_p[k] for k in ("effect", "lo", "hi")}, "plain_verdict": plain_dec["verdict"],
                  "plain_planted_large": core_p["planted_large"], "plain_planted_min": core_p["planted_min"], "plain_shuffle": core_p["shuffle"]})
    Db = S.dropna(subset=["m_0_13", "m_13_22"])
    core, rep, n = slope_q(Db, "m_13_22", "m_0_13", bs, R["B"]["main"], rng)
    finish("morning", core, rep, n, len(S), "Slope of the 13-22 London RV miss on the 00-13 miss, plain σ, within instrument.")
    for nm, key, rk in (("p", "qlike-plain", "C_p"), ("c", "qlike-chosen", "C_c")):
        D = S.dropna(subset=[f"h_{nm}", f"h_{nm}_hl1", f"h_{nm}_hl2", f"h_{nm}_hl3", f"h_{nm}_hl1_lag2", "rv5"])
        core, rep, n = qlike_q(X, D, nm, FZ, EW, bs, R[rk]["main"], rng)
        finish(key, core, rep, n, len(S), f"Effect = 1 − QLIKE ratio of {'plain' if nm == 'p' else 'chosen'} σ + frozen hl-1 feedback against the same σ. "
                                          f"Month-placebo minimum ratio in the run: {R[rk]['month']['min']:.3f}.")
    core, rep, n, st = cov_q(S, bs, R["D"]["main"], rng)
    finish("cov75", core, rep, n, 2 * len(S), f"Coverage {st[0]}% [{st[1]}, {st[2]}] mapped to its margin inside 22.5-27.5. Per σ tercile (run): "
                                               + ", ".join(f"{t} {R['D']['tercile'][t]['value']}%" for t in ("quiet", "normal", "busy")) + ".")

    res = {k: {**c, **G.decide(c)} for k, c in q.items()}
    bad = []
    for k, r_ in res.items():
        flag = "" if r_["verdict"] == banked[k] else f"   <-- results.json says {banked[k]}"
        log(f"  {k}: {r_['verdict']:13s} power {None if r_['power'] is None else round(r_['power'], 3)}  {r_['reasons'][0]}{flag}")
        if r_["verdict"] in ("INVALID", "INCOMPLETE") or r_["verdict"] != banked[k]:
            bad.append(k)
    dump = lambda p: p.write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    if bad:
        p = OUT / "checks_MISMATCH_do_not_commit.json"
        dump(p)
        log(f"STOP: {bad} disagree with results.json or are INVALID/INCOMPLETE. Wrote {p}; checks.json NOT written.")
        sys.exit(2)
    p = OUT / "checks.json"
    dump(p)
    log(f"PASS: wrote {p}")


if __name__ == "__main__":
    main()
