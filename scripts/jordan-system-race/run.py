"""jordan-system-race (forge/JORDAN_SYSTEM_RACE_PREREG.md).

    python scripts/jordan-system-race/run.py [SYM:TRACK ...]   -> analysis/output/jordan-system-race/
    python scripts/jordan-system-race/run.py summarise

Jordan's clue: "the best forecaster will not result in the best system". For every site calc of the HL line, build the
HL moving projections (running low + W, running high - W; W = k_tau x sigma_calc, k walk-forward per calc) and run two
fixed systems:
  S1 FOLLOW-HL90: first reach of the p90 projection per side, enter with the break, stop = p75 projection, exit 22:00.
  S2 FADE-HL75 -> Close+- median: first reach of the p75 projection per side, fade, stop = p90 projection,
     target = Close+ / Close- median line (QLIKE pick), tie = stop, else exit 22:00.
Then pick the calc per instrument x year by trailing net R (SYS) vs the QLIKE pick (QL), score the next year.
Sessions 2020 -> 2026-08-21. Seed 20261125.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import warnings
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
CLR, RC, RF, tick_of = JLM.CLR, JLM.RC, JLM.RF, JLM.tick_of

SEED = 20261125
OUT = ROOT / "analysis/output/jordan-system-race"
TAUS = (0.50, 0.75, 0.90)
COST_TICKS = 2.5
TEST = range(2021, 2027)
HALVES = {"2021-23": (2021, 2023), "2024-26": (2024, 2026)}
MIN_TRADES = 30


def hl_by_arm(sym, track):
    """Per site arm: HL widths (% of open) per tau, walk-forward k per arm; the QLIKE pick per row; Close+- p50."""
    bd = RF.bdir(sym) if track == "F" else RC.bdir(sym)
    os.environ["LADDER_OUT"] = bd
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / bd / f"rows_{track}.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    T = L.walk_forward(S, sym, track, arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    ok = np.ones(len(T), bool)
    for q in ("hl", "oh", "ol"):
        ok &= T[q].to_numpy() > 0
    yrs = T["year"].to_numpy()
    site = [a for a in arms if a not in RC.NO_SITE]
    Q = {(a, "hl"): RC.qlike(T, RC.h_series(T, T[a].to_numpy(float), "hl", ok), "hl", ok) for a in site}
    sel, _ = RF.wf_pick(T, Q, site, ok, "hl")
    x = T["hl"].to_numpy()
    W = {}
    for a in site:
        sig = T[a].to_numpy(float)
        w = np.full((len(T), 3), np.nan)
        r = x / sig
        for Y in range(2020, 2027):
            te = yrs == Y
            if not te.any():
                continue
            tr = (yrs >= 2018) & (yrs < Y) & ok & np.isfinite(r) & (r > 0)
            if tr.sum() <= 50:
                continue
            w[te] = np.outer(sig[te], np.quantile(r[tr], TAUS))
        W[a] = w
    ql = np.array([s if s is not None else "" for s in sel], dtype=object)
    _, lv, _, _ = JLM.levels(sym, track)                     # Close+- at their own QLIKE picks
    return pd.to_datetime(T["date"]).dt.normalize(), yrs, W, ql, lv["cup"][:, 0], lv["cdn"][:, 0]


def first_true(mask):
    if not len(mask):
        return -1
    i = int(np.argmax(mask))
    return i if mask[i] else -1


def run(job):
    sym, track = job
    dates, yrs, W, ql, cup50, cdn50 = hl_by_arm(sym, track)
    m = L.load_m1(sym, track, "unadj") if track == "F" else L.load_m1(sym, track)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    H, Lo, O, C = (m[c].to_numpy() for c in ("high", "low", "open", "close"))
    tick = tick_of(C[-200000:]) if track == "F" else np.nan
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    pos = {di[s]: (s, e) for s, e in zip(starts, ends)}
    rows = []
    for i, dt in enumerate(dates):
        if dt.year < 2020 or dt not in pos:
            continue
        s, e = pos[dt]
        if e - s < 600:
            continue
        h, l, c, op, o = H[s:e], Lo[s:e], C[s:e], O[s:e], O[s]
        rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])
        rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
        up_reach, dn_reach = h - rl, rh - l
        ds = dt.strftime("%Y-%m-%d")
        tgt = {True: o * (1 + cup50[i] / 100) if np.isfinite(cup50[i]) else np.nan,
               False: o * (1 - cdn50[i] / 100) if np.isfinite(cdn50[i]) else np.nan}
        for a, w in W.items():
            if not np.all(np.isfinite(w[i])):
                continue
            w50, w75, w90 = w[i] * o / 100
            for up in (True, False):
                reach = up_reach if up else dn_reach
                base = rl if up else rh
                sg = 1.0 if up else -1.0
                # ---- S1 follow the p90 projection
                t = first_true(reach >= w90)
                if t >= 0:
                    P, stop = base[t] + sg * w90, base[t] + sg * w75
                    R = abs(P - stop)
                    hh, ll, oo = h[t + 1:], l[t + 1:], op[t + 1:]
                    j = first_true(ll <= stop) if up else first_true(hh >= stop)
                    if len(hh) and j >= 0:
                        ex = min(stop, oo[j]) if up else max(stop, oo[j]); how = "sl"
                    else:
                        ex = c[-1]; how = "time"
                    g = sg * (ex - P) / R
                    rows.append((ds, int(dt.year), a, "S1", up, t, g, R, how))
                # ---- S2 fade the p75 projection to the Close+- median
                t = first_true(reach >= w75)
                tg = tgt[up]
                if t >= 0 and np.isfinite(tg):
                    P, stop = base[t] + sg * w75, base[t] + sg * w90
                    if (tg < P) if up else (tg > P):
                        R = abs(stop - P)
                        hh, ll, oo = h[t + 1:], l[t + 1:], op[t + 1:]
                        js = first_true(hh >= stop) if up else first_true(ll <= stop)
                        jt = first_true(ll <= tg) if up else first_true(hh >= tg)
                        js = js if js >= 0 else 10**9
                        jt = jt if jt >= 0 else 10**9
                        if js <= jt and js < 10**9:
                            ex = max(stop, oo[js]) if up else min(stop, oo[js]); how = "sl"
                        elif jt < 10**9:
                            ex = min(tg, oo[jt]) if up else max(tg, oo[jt]); how = "tp"
                        else:
                            ex = c[-1]; how = "time"
                        g = -sg * (ex - P) / R
                        rows.append((ds, int(dt.year), a, "S2", up, t, g, R, how))
    df = pd.DataFrame(rows, columns=["date", "year", "arm", "sys", "up", "bar", "gross", "R_px", "how"])
    df["net"] = df["gross"] - (COST_TICKS * tick / df["R_px"] if track == "F" else 0.0)
    df["gross"] = df["gross"].astype("float32"); df["net"] = df["net"].astype("float32")
    df.insert(0, "track", track)
    df.insert(0, "sym", sym)
    df.to_parquet(OUT / "trades" / f"{track}_{sym}.parquet")
    qy = {}
    for Y in range(2020, 2027):
        v = ql[yrs == Y]
        if len(v) and v[0]:
            qy[str(Y)] = str(v[0])
    (OUT / "trades" / f"{track}_{sym}_ql.json").write_text(json.dumps(qy))
    return f"{track} {sym}: {len(W)} calcs, tick {tick:g}, trades S1 {int((df.sys=='S1').sum())} S2 {int((df.sys=='S2').sum())}"


# ------------------------------------------------------------------------------------------------------------ summary
def boot_ratio(groups, rng, B=1000, years=None):
    """groups: list of DataFrames with date, a_sum, a_n, b_sum, b_n (per date). Mean(a) - mean(b), dates resampled."""
    X = pd.concat(groups).groupby("date")[["a_sum", "a_n", "b_sum", "b_n"]].sum()
    if years is not None:
        yy = pd.to_datetime(X.index).year
        X = X[(yy >= years[0]) & (yy <= years[1])]
    v = X.to_numpy()
    est = v[:, 0].sum() / max(v[:, 1].sum(), 1) - (v[:, 2].sum() / max(v[:, 3].sum(), 1) if v[:, 3].sum() else 0)
    idx = rng.integers(0, len(v), (B, len(v)))
    S = v[idx].sum(1)
    d = S[:, 0] / np.maximum(S[:, 1], 1) - np.where(S[:, 3] > 0, S[:, 2] / np.maximum(S[:, 3], 1), 0)
    p = float(min(1.0, 2 * min((d <= 0).mean(), (d >= 0).mean())))
    return float(est), [float(np.quantile(d, .05)), float(np.quantile(d, .95))], p, int(v[:, 1].sum())


def bh(ps, q=0.10):
    ps = np.asarray(ps); n = len(ps); o = np.argsort(ps)
    thr = q * (np.arange(1, n + 1)) / n
    passed = ps[o] <= thr
    k = np.max(np.flatnonzero(passed)) + 1 if passed.any() else 0
    out = np.zeros(n, bool); out[o[:k]] = True
    return out


def summarise():
    rng = np.random.default_rng(SEED)
    res = {"seed": SEED, "cost_ticks_futures": COST_TICKS, "tests": {}}
    lines = []
    say = lambda s="": (lines.append(s), print(s))
    tests = []
    for track, fam in (("F", "futures (net)"), ("C", "CFDs (gross)")):
        files = sorted((OUT / "trades").glob(f"{track}_*.parquet"))
        if not files:
            continue
        for sysn in ("S1", "S2"):
            gS, gQ, picks, ceil_rows, spread_rows, stab = [], [], [], [], [], []
            for f in files:
                D = pd.read_parquet(f)
                D = D[D.sys == sysn]
                sym = D["sym"].iloc[0] if len(D) else f.stem[2:]
                qy = json.loads((OUT / "trades" / f"{f.stem}_ql.json").read_text())
                agg = D.groupby(["arm", "year"])["net"].agg(["sum", "count"])
                prev = None
                for Y in TEST:
                    tr = agg[agg.index.get_level_values("year") < Y].groupby("arm").sum()
                    tr = tr[tr["count"] >= MIN_TRADES]
                    qa = qy.get(str(Y))
                    if not qa:
                        continue
                    sa = (tr["sum"] / tr["count"]).idxmax() if len(tr) else qa
                    picks.append({"sym": sym, "year": Y, "ql": qa, "sys": sa})
                    if prev is not None:
                        stab.append(sa == prev)
                    prev = sa
                    te = D[D.year == Y]
                    a = te[te.arm == sa].groupby("date")["net"].agg(["sum", "count"])
                    b = te[te.arm == qa].groupby("date")["net"].agg(["sum", "count"])
                    X = pd.DataFrame({"a_sum": a["sum"], "a_n": a["count"], "b_sum": b["sum"], "b_n": b["count"]}).fillna(0)
                    gS.append(X.reset_index())
                    Xq = pd.DataFrame({"a_sum": b["sum"], "a_n": b["count"], "b_sum": 0.0, "b_n": 0}).fillna(0)
                    gQ.append(Xq.reset_index())
                # hindsight ceiling and spread over calcs, test years
                te = D[D.year >= TEST[0]]
                by_arm = te.groupby("arm")["net"].agg(["mean", "count"])
                by_arm = by_arm[by_arm["count"] >= MIN_TRADES]
                qte = te[te.apply(lambda r: qy.get(str(r.year)) == r.arm, axis=1)] if len(te) else te
                if len(by_arm) and len(qte):
                    ceil_rows.append({"sym": sym, "best_arm": by_arm["mean"].idxmax(), "best": by_arm["mean"].max(),
                                      "ql": qte["net"].mean(), "mean_over_calcs": by_arm["mean"].mean(),
                                      "sd_over_calcs": by_arm["mean"].std(), "n_calcs": len(by_arm)})
            if not gS:
                continue
            key = f"{track}_{sysn}"
            est, ci, p, n = boot_ratio(gS, rng)
            halves = {h: boot_ratio(gS, rng, years=yr)[:2] for h, yr in HALVES.items()}
            qest = boot_ratio(gQ, rng)
            qh = {h: boot_ratio(gQ, rng, years=yr)[:2] for h, yr in HALVES.items()}
            CE = pd.DataFrame(ceil_rows)
            CE.to_csv(OUT / f"calcs_{key}.csv", index=False)
            pd.DataFrame(picks).to_csv(OUT / f"picks_{key}.csv", index=False)
            r = {"family": fam, "system": sysn, "sys_minus_ql": [est, ci], "p": p, "trades_sys": n,
                 "halves": halves, "ql_net": [qest[0], qest[1]], "ql_halves": qh,
                 "ceiling_best_minus_ql_mean": float((CE["best"] - CE["ql"]).mean()) if len(CE) else None,
                 "sd_over_calcs_median": float(CE["sd_over_calcs"].median()) if len(CE) else None,
                 "sys_pick_same_as_last_year": float(np.mean(stab)) if stab else None,
                 "sys_pick_equals_ql": float(np.mean([x["ql"] == x["sys"] for x in picks]))}
            res["tests"][key] = r
            tests.append(key)
            say(f"{fam} {sysn}: SYS - QL {est:+.4f}R [{ci[0]:+.4f}, {ci[1]:+.4f}] p {p:.3f} (n {n}); halves "
                + ", ".join(f"{h} {v[0]:+.4f} [{v[1][0]:+.4f},{v[1][1]:+.4f}]" for h, v in halves.items()))
            say(f"   QL pick net R {qest[0]:+.4f} [{qest[1][0]:+.4f}, {qest[1][1]:+.4f}]; halves "
                + ", ".join(f"{h} {v[0]:+.4f}" for h, v in qh.items()))
            say(f"   hindsight best calc - QL mean {r['ceiling_best_minus_ql_mean']:+.4f}R; SD across calcs (median sym) "
                f"{r['sd_over_calcs_median']:.4f}R; SYS = QL {r['sys_pick_equals_ql']:.0%}; SYS same as last year "
                f"{(r['sys_pick_same_as_last_year'] or 0):.0%}")
    ps = [res["tests"][k]["p"] for k in tests]
    keep = bh(ps) if ps else []
    for k, b in zip(tests, keep):
        r = res["tests"][k]
        lo, hi = r["sys_minus_ql"][1]
        halves_ok = all(v[0] > 0 for v in r["halves"].values())
        v = "VALIDATED" if (lo > 0 and halves_ok and b) else ("NULL" if hi < 0.02 else "UNDERPOWERED")
        r["bh_pass"], r["verdict"] = bool(b), v
        say(f"{k}: BH {'pass' if b else 'fail'} -> {v}")
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)
    (OUT / "report.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    (OUT / "trades").mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if args == ["summarise"]:
        summarise(); return
    J = [tuple(a.split(":")) for a in args] or ([(s, "F") for s in RF.syms()] + [(s, "C") for s in RC.syms()])
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=4) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)
    if not args:
        summarise()


if __name__ == "__main__":
    main()
