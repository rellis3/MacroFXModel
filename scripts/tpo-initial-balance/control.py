"""Positive control (prereg §3.9, lesson #1): the whole pipeline on synthetic sessions with a known answer.
  zero:    driftless Gaussian random walk, 1-minute steps (10 sub-steps a minute for highs/lows). Every scored cell must cover 0.
  planted: the same walk, plus a drift of +0.20 sigma1*sqrt(h) to the close after an accepted break, in the break's direction
           (a closed-form effect from outside the pipeline). Q1 d must come back 0.20 +/- 0.05.
python scripts/tpo-initial-balance/control.py
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import tpo_ib as T  # noqa: E402
import events  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "analysis/output/tpo-initial-balance"


def synth(n_sessions, plant, seed):
    rng = np.random.default_rng(seed)
    days = pd.bdate_range("2015-12-01", periods=n_sessions).strftime("%Y-%m-%d")
    frames, planted = [], 0
    px = 10000.0
    for day in days:
        steps = rng.normal(0, 1 / math.sqrt(10), size=(T.N_MIN, 10))
        path = px + np.cumsum(steps.ravel()).reshape(T.N_MIN, 10)
        o = np.r_[px, path[:-1, -1]]
        c = path[:, -1]
        h = np.maximum(path.max(axis=1), o)
        l = np.minimum(path.min(axis=1), o)
        if plant:
            s1 = T.Sessions("NQ", [day], o[None], h[None], l[None], c[None], np.full((1, T.N_MIN), 100.0))
            s1.sigma1 = np.array([1.0])
            ev = T.find_event(s1, 0)
            if ev and ev["kind"] == "acc":
                e = ev["pc"] + 1; hh = T.N_MIN - e
                total = plant * 1.0 * math.sqrt(hh) * ev["dir"]
                shift = np.zeros(T.N_MIN)
                shift[e:] = total * (np.arange(1, hh + 1) / hh)
                shift_o = np.zeros(T.N_MIN); shift_o[e:] = total * (np.arange(0, hh) / hh)
                o, h, l, c = o + shift_o, np.maximum(h + shift, o + shift_o), np.minimum(l + shift, o + shift_o), c + shift
                planted += 1
        px = c[-1]
        frames.append(pd.DataFrame(dict(day=day, m=np.arange(T.N_MIN), open=o, high=h, low=l, close=c, volume=100.0)))
    return T.sessions_from_frame(pd.concat(frames), "NQ"), planted


def ci(rng, df, col, kind, n):
    x = df[df.kind == kind].set_index("i")[col]
    full = np.full(n, np.nan); full[x.index.to_numpy()] = x.to_numpy()
    est = np.nanmean(full)
    bs = T.boot(rng, n, lambda idx: np.nanmean(full[idx]), B=1000)
    return dict(n=int(np.isfinite(full).sum()), est=round(float(est), 4), lo=round(float(np.nanpercentile(bs, 2.5)), 4), hi=round(float(np.nanpercentile(bs, 97.5)), 4))


def slope_ci(rng, df, kind, xcol, n):
    sub = df[df.kind == kind]
    xs = np.full(n, np.nan); ys = np.full(n, np.nan)
    xs[sub.i.to_numpy()] = (sub[xcol] - sub[xcol].mean()) / sub[xcol].std(); ys[sub.i.to_numpy()] = sub.d.to_numpy()
    est = T.ols_slope(xs, ys)
    bs = T.boot(rng, n, lambda idx: T.ols_slope(xs[idx], ys[idx]), B=1000)
    return dict(est=round(float(est), 4), lo=round(float(np.nanpercentile(bs, 2.5)), 4), hi=round(float(np.nanpercentile(bs, 97.5)), 4))


def run():
    res = {}
    for name, plant in (("zero", None), ("planted", 0.20)):
        s, planted = synth(2540, plant, T.SEED + (1 if plant else 0))
        df = events.build(s, outcomes=True, start="2016-01-04", end="2099-01-01")
        n = len(s.days)
        rng = np.random.default_rng(T.SEED)
        r = dict(sessions=n, planted=planted, counts=df.kind.value_counts().to_dict())
        for kind, lab in (("acc", "follow"), ("poke", "fade")):
            r[f"d_{lab}"] = ci(rng, df, "d", kind, n)
            r[f"dR_{lab}"] = ci(rng, df, "dR", kind, n)
            r[f"slope_flow_{lab}"] = slope_ci(rng, df, kind, "x_flow", n)
            r[f"slope_candle_{lab}"] = slope_ci(rng, df, kind, "x_candle", n)
        res[name] = r
        print(name, json.dumps(r, default=str), flush=True)
    z, p = res["zero"], res["planted"]
    checks = {}
    for k, v in z.items():
        if isinstance(v, dict) and "lo" in v:
            checks[f"zero {k} covers 0"] = bool(v["lo"] <= 0 <= v["hi"])
    checks["planted d_follow within 0.20 +/- 0.05"] = bool(abs(p["d_follow"]["est"] - 0.20) <= 0.05)
    checks["planted d_follow interval excludes 0"] = bool(p["d_follow"]["lo"] > 0)
    res["checks"] = checks
    res["passed"] = all(checks.values())
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "positive_control.json").write_text(json.dumps(res, indent=1, default=str))
    print(json.dumps(checks, indent=1), "\nPASSED" if res["passed"] else "\nFAILED")


if __name__ == "__main__":
    run()
