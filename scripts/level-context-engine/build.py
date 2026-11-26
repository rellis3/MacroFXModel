"""level-context-engine: build one row per level touch (forge/LEVEL_CONTEXT_ENGINE_PREREG.md).

    python scripts/level-context-engine/build.py [SYM:TRACK ...]   -> analysis/output/level-context-engine/events/

Levels (walk-forward per-line QLIKE, 2020 -> 2026-08-21): High/Low = OH/OL, Close+/Close-, HL moving projections;
tiers Median / P75 / P90. Placebo = the same line scaled 0.75-0.90 / 1.10-1.25 (one draw per session per line).
Every touch, inside approach (from the open side) and outside approach (retest from beyond), re-armed at 0.1 line-sigma.
Context uses bars < t (and the level itself). Outcome race u = 0.25 line-sigma: through side counted from the touch
bar, back side from t+1 (A1), 120-minute cap.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


JLM = _load("jlm", "scripts/jordan-lines-mae/run.py")
CLR = JLM.CLR
RF, RC = JLM.RF, JLM.RC

SEED = 20261125
OUT = ROOT / "analysis/output/level-context-engine"
TAUS = (50, 75, 90)
REARM, U, CAP = 0.10, 0.25, 120
WINS = (15, 30, 60, 120)
NO = 10 ** 6
# (family, line key, above open?, sigma key)
LINES = [("HighLow", "oh", True, "oh"), ("HighLow", "ol", False, "ol"),
         ("Close", "cup", True, "cup"), ("Close", "cdn", False, "cdn"),
         ("HLproj", "hlH", True, "hl"), ("HLproj", "hlL", False, "hl")]


def touches_inside(h, l, P, r, above):
    n = len(h)
    at = h >= P if above else l <= P
    if not at.any():
        return np.empty(0, int)
    away = (h < P - r) if above else (l > P + r)
    idx = np.arange(n)
    pa = np.r_[-1, np.maximum.accumulate(np.where(at, idx, -1))[:-1]]
    pw = np.r_[-1, np.maximum.accumulate(np.where(away, idx, -1))[:-1]]
    return np.flatnonzero(at & ((pa < 0) | (pw > pa)))


def touches_outside(h, l, P, r, above):
    """Retest from beyond: for an upper line, low reaches P after a bar fully above P + r (and mirror)."""
    n = len(h)
    at = l <= P if above else h >= P
    away = (l > P + r) if above else (h < P - r)
    if not away.any():
        return np.empty(0, int)
    idx = np.arange(n)
    pa = np.r_[-1, np.maximum.accumulate(np.where(at, idx, -1))[:-1]]
    pw = np.r_[-1, np.maximum.accumulate(np.where(away, idx, -1))[:-1]]
    return np.flatnonzero(at & (pw >= 0) & (pw > pa))


def first(mask):
    k = np.flatnonzero(mask)
    return int(k[0]) if len(k) else NO


def race(h, l, c, t, P, d, u, n):
    """Through (d direction) counted from bar t, back from t+1; cap CAP bars. Returns outcome, res bar, cont R (gross)."""
    e = min(n, t + 1 + CAP)
    hh, ll = h[t:e], l[t:e]
    if d > 0:
        th = first(hh >= P + u)
        bk = first(ll[1:] <= P - u)
    else:
        th = first(ll <= P - u)
        bk = first(hh[1:] >= P + u)
    bk = bk + 1 if bk < NO else NO
    if th < bk:
        return "cont", t + th, 1.0, -1.0
    if bk < th:
        return "rej", t + bk, -1.0, 1.0
    if th == bk and th < NO:
        return "both", t + th, -1.0, -1.0
    mark = d * (c[e - 1] - P) / u
    return "cons", e - 1, float(np.clip(mark, -1, 1)), float(np.clip(-mark, -1, 1))


def excursions(h, l, t, P, d, n):
    out = []
    for w in WINS:
        e = min(n, t + 1 + w)
        mfe = (h[t:e].max() - P) if d > 0 else (P - l[t:e].min())
        mae = (P - l[t + 1:e].min()) if (d > 0 and t + 1 < e) else ((h[t + 1:e].max() - P) if t + 1 < e else 0.0)
        out += [max(mfe, 0.0), max(mae, 0.0)]
    return out


def levels(sym, track):
    d1, lv1, sg1, _ = JLM.levels(sym, track)                       # hl, cup, cdn
    d2, lv2, sg2, _, _ = CLR.levels(sym, track)                    # cup, cdn, oh, ol
    assert (d1.to_numpy() == d2.to_numpy()).all()
    lv = {"hl": lv1["hl"], "cup": lv2["cup"], "cdn": lv2["cdn"], "oh": lv2["oh"], "ol": lv2["ol"]}
    sg = {"hl": sg1["hl"], "cup": sg2["cup"], "cdn": sg2["cdn"], "oh": sg2["oh"], "ol": sg2["ol"]}
    vr = {q: (pd.Series(s) / pd.Series(s).shift(1).rolling(250, min_periods=60).median()).to_numpy() for q, s in sg.items()}
    return d1, lv, sg, vr


def run(job):
    sym, track = job
    dates, lv, sg, vr = levels(sym, track)
    m = L.load_m1(sym, track, "unadj") if track == "F" else L.load_m1(sym, track)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    H, Lo, O, C = (m[c].to_numpy() for c in ("high", "low", "open", "close"))
    tick = JLM.tick_of(C[-200000:]) if track == "F" else np.nan
    st = np.flatnonzero(np.r_[True, di[1:] != di[:-1]]); en = np.r_[st[1:], len(di)]
    pos = {di[s]: (s, e) for s, e in zip(st, en)}
    closes = {di[s]: C[e - 1] for s, e in zip(st, en)}
    sess = sorted(closes)
    prev_ret = {sess[k]: closes[sess[k - 1]] - closes[sess[k - 2]] for k in range(2, len(sess))}
    rng = np.random.default_rng([SEED, zlib.crc32(f"{sym}:{track}:lce".encode())])
    rows = []
    for i, dt in enumerate(dates):
        if dt.year < 2020 or dt not in pos:
            continue
        s, e = pos[dt]
        if e - s < 600 or not all(np.isfinite(lv[q][i, 0]) for q in lv):
            continue
        h, l, c, o, n = H[s:e], Lo[s:e], C[s:e], O[s], e - s
        mn = mins[s:e]
        rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])
        rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
        rng_used = np.r_[0.0, (np.maximum.accumulate(h) - np.minimum.accumulate(l))[:-1]]
        hl_med_px = lv["hl"][i, 0] * o / 100
        pr = prev_ret.get(dt, np.nan)
        mults = {(ln, j): (rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25))
                 for _, ln, _, _ in LINES for j in range(3)}
        for kind in ("line", "placebo"):
            first_touch = {}            # (line, tier) -> (bar, outcome, res_bar)
            evs = []
            for fam, ln, ab, sq in LINES:
                sig = sg[sq][i] * o / 100
                u = U * sig
                for j, tau in enumerate(TAUS):
                    mk = 1.0 if kind == "line" else mults[(ln, j)]
                    if ln in ("oh", "cup"):
                        P = np.full(n, o * (1 + lv[ln][i, j] * mk / 100))
                    elif ln in ("ol", "cdn"):
                        P = np.full(n, o * (1 - lv[ln][i, j] * mk / 100))
                    elif ln == "hlH":
                        P = rl + lv["hl"][i, j] * mk * o / 100
                    else:
                        P = rh - lv["hl"][i, j] * mk * o / 100
                    ti = touches_inside(h, l, P, REARM * sig, ab)
                    to = np.setdiff1d(touches_outside(h, l, P, REARM * sig, ab), ti)
                    allt = sorted([(t, "in") for t in ti] + [(t, "out") for t in to])
                    prev = None
                    for k, (t, ap) in enumerate(allt, 1):
                        Pt = float(P[t])
                        d = (1 if ab else -1) * (1 if ap == "in" else -1)
                        outc, rb, rc, rf = race(h, l, c, t, Pt, d, u, n)
                        pm = d * (Pt - c[max(t - 31, 0)]) / sig if t >= 1 else 0.0
                        prev_state = "none" if prev is None else (prev[1] if (prev[2] < t and prev[1] != "cons") else "unres")
                        if (ln, j) not in first_touch:
                            first_touch[(ln, j)] = (t, outc, rb)
                        prev = (t, outc, rb)
                        evs.append([fam, ln, ab, tau, ap, k, t, int(mn[t]), d, Pt, sig, u, outc, rb, rc, rf,
                                    pm, rng_used[t] / hl_med_px, vr[sq][i],
                                    (np.sign(pr) == d) if np.isfinite(pr) else np.nan, prev_state]
                                   + [x / sig for x in excursions(h, l, t, Pt, d, n)])
            # sequence context: inner tier's first touch (same line) and the ladder race at the first P75 touch
            for ev in evs:
                fam, ln, ab, tau, ap, k, t = ev[:7]
                j = TAUS.index(tau)
                if j == 0:
                    ev += [np.nan, "na", np.nan]
                    continue
                inner = first_touch.get((ln, j - 1))
                gap = (t - inner[0]) if inner and inner[0] <= t else np.nan
                inner_out = (inner[1] if (inner[2] < t and inner[1] != "cons") else "unres") if inner and inner[0] <= t else "untouched"
                up = np.nan
                if j == 1 and k == 1 and ap == "in":
                    p90 = first_touch.get((ln, 2))
                    t90 = p90[0] if p90 and p90[0] >= t else NO
                    # median back-touch after t (from t+1): price returns to the median line
                    mk = 1.0 if kind == "line" else mults[(ln, 0)]
                    if ln in ("oh", "cup"):
                        Pm = o * (1 + lv[ln][i, 0] * mk / 100); back = first(l[t + 1:] <= Pm)
                    elif ln in ("ol", "cdn"):
                        Pm = o * (1 - lv[ln][i, 0] * mk / 100); back = first(h[t + 1:] >= Pm)
                    elif ln == "hlH":
                        Pm = rl + lv["hl"][i, 0] * mk * o / 100; back = first(l[t + 1:] <= Pm[t + 1:])
                    else:
                        Pm = rh - lv["hl"][i, 0] * mk * o / 100; back = first(h[t + 1:] >= Pm[t + 1:])
                    back = t + 1 + back if back < NO else NO
                    up = float(t90 < back) if min(t90, back) < NO else np.nan
                ev += [gap, inner_out, up]
            for ev in evs:
                rows.append([dt, kind] + ev)
    cols = (["date", "kind", "family", "line", "above", "tier", "approach", "touch_n", "bar", "minute", "d", "P",
             "sig_px", "u_px", "outcome", "exit_bar", "R_cont", "R_fade", "prior30", "consumed", "vol_reg", "trend_agree",
             "prev_same"]
            + [f"{a}{w}" for w in WINS for a in ("mfe", "mae")] + ["inner_gap", "inner_out", "ladder_up"])
    D = pd.DataFrame(rows, columns=cols)
    D.insert(0, "track", track); D.insert(0, "sym", sym)
    D["tick"] = tick
    D["cost_R"] = (2.5 * tick / D["u_px"]) if track == "F" else 0.0
    for c_ in ("P", "sig_px", "u_px", "R_cont", "R_fade", "prior30", "consumed", "vol_reg", "inner_gap", "ladder_up",
               "cost_R") + tuple(f"{a}{w}" for w in WINS for a in ("mfe", "mae")):
        D[c_] = D[c_].astype("float32")
    D.to_parquet(OUT / "events" / f"{track}_{sym}.parquet")
    nl = D[D.kind == "line"]
    return f"{track} {sym}: {len(nl)} line touches, cont {np.mean(nl.outcome == 'cont'):.3f} rej {np.mean(nl.outcome == 'rej'):.3f}"


def main():
    (OUT / "events").mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    J = [tuple(a.split(":")) for a in args] or ([(s, "F") for s in RF.syms()] + [(s, "C") for s in RC.syms()])
    J = [j for j in J if not (OUT / "events" / f"{j[1]}_{j[0]}.parquet").exists()] if not args else J
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=5) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)


if __name__ == "__main__":
    main()
