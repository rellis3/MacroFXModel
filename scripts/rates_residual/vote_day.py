"""S7 (forge/VOTE_DIRECTION_DAY_PREREG.md): the no-gap direction vote vs the London session direction (a), and a
median-line entry in the vote's direction with a 22:00 time exit (b). EURUSD + GOLD, M1, 2016-10 -> 2026-08.

    python scripts/rates_residual/vote_day.py
"""
import sys, json, datetime as dt
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0, 'volatilityExhaustion')
from vol_exhaustion_lib import load_m1, build_london_daily, hv_sigma

OUT = Path("analysis/output/rates_residual")
B, SEED, HALF = 2000, 20261010, "2021-09"
rng = np.random.default_rng(SEED)
INS = {'EURUSD': ('VolRangeForecaster/data/m1/eurusd_m1.parquet', 1.250, 0.008),
       'GOLD': ('VolRangeForecaster/data/m1/gold_m1.parquet', 1.146, 0.02)}

YS = [t for t in json.load(open("analysis/output/meta_label_ys/ys_run.json"))["combined"]["trades"] if t["pair"] == "EURUSD"]
def ys_bias(d):
    for t in YS:
        if t["date"] < d <= t["exitDate"]: return 1 if t["dir"] == "LONG" else -1
    return 0
us = pd.read_csv("analysis/output/cog_yield_dir/fred/DGS2.csv"); us.columns = ["date", "v"]; us["v"] = pd.to_numeric(us.v, errors="coerce")
de = pd.read_csv("analysis/output/policy_direction/DE2Y.csv")
sp = us.dropna().merge(de.dropna(), on="date").assign(s=lambda x: x.v - x.value).set_index("date").s.sort_index()
chg, sidx = sp.diff(63), sp.index.to_numpy()
def mom(d):
    j = np.searchsorted(sidx, (pd.Timestamp(d) - pd.offsets.BDay(2)).strftime("%Y-%m-%d"), side="right") - 1
    v = chg.iloc[j] if j >= 0 else np.nan
    return 0 if not np.isfinite(v) or v == 0 else -int(np.sign(v))
ev = sorted(pd.read_csv("analysis/fomc_event_study/stage1_events.csv").date.tolist() + ["2026-06-17", "2026-07-29"])
bd = pd.bdate_range("2015-12-01", "2026-12-31").strftime("%Y-%m-%d").tolist()
fomc = {d for e in ev if e in bd for d in bd[bd.index(e) + 1:bd.index(e) + 6]}

rows = []
for ins, (path, scale, cpct) in INS.items():
    m1 = load_m1(path); d = build_london_daily(m1); mo = d['min_of_day_all']; sg = hv_sigma(d, 30) * scale; C = d['close']
    cost = cpct / 100
    for i in range(22, len(d['open'])):
        date = str(dt.date(1970, 1, 1) + dt.timedelta(days=int(d['day_idx'][i])))
        if date < '2016-10-04': continue
        s, e = d['start'][i], d['end'][i]; mod = mo[s:e]; k_ = mod < 1320
        if k_.sum() < 600 or mod[0] > 5 or not sg[i] > 0: continue
        o, h, l, c = (m1[x][s:e][k_] for x in ('open', 'high', 'low', 'close')); mod = mod[k_]
        op, sig = o[0], sg[i]
        comps = [int(np.sign(C[i - 1] / C[i - 21] - 1))]
        if ins == 'EURUSD': comps += [ys_bias(date), mom(date)]
        comps.append(-1 if date in fomc else 0)
        v = sum(comps)
        if v == 0: continue
        dirn = int(np.sign(v))
        day_ret = dirn * np.log(c[-1] / op) / sig - cost / sig
        # S7b: first touch of either median line, enter in the vote's direction, stop 0.6 sigma, out 22:00
        up, dn = op * (1 + 0.74 * sig), op * (1 - 0.74 * sig)
        hit = np.flatnonzero((mod < 1260) & ((h >= up) | (l <= dn)))
        Rb = np.nan
        if hit.size and not (h[hit[0]] >= up and l[hit[0]] <= dn):
            k = hit[0]; E = up if h[k] >= up else dn
            stop = E - dirn * 0.6 * sig * op
            if (l[k] <= stop) if dirn > 0 else (h[k] >= stop): ex = stop
            else:
                ex = c[-1]
                for j in range(k + 1, len(o)):
                    if (l[j] <= stop) if dirn > 0 else (h[j] >= stop): ex = stop; break
            Rb = (dirn * (ex - E) - cost * E) / (0.6 * sig * op)
        rows.append(dict(ins=ins, date=date, v=v, day=day_ret, Rb=Rb))
    print(ins, 'done', flush=True)
D = pd.DataFrame(rows); D["month"] = D.date.str[:7]


def boot(x, col):
    x = x[x[col].notna()]
    ms = sorted(set(x.month)); g = {m: y[col].to_numpy() for m, y in x.groupby("month")}
    reps = [np.concatenate([g[m] for m in rng.choice(ms, len(ms))]).mean() for _ in range(B)]
    return [round(float(x[col].mean()), 4), *np.round(np.percentile(reps, [2.5, 97.5]), 4).tolist()]


K = D[D.v.abs() >= 2]
res = {"S7a": {"n": int(len(K)), "mean_sigma": boot(K, "day"), "hit": round(float((K.day > 0).mean()), 4),
               "halves": [round(float(K[K.date < HALF].day.mean()), 4), round(float(K[K.date >= HALF].day.mean()), 4)],
               "by_ins": {i: round(float(x.day.mean()), 4) for i, x in K.groupby("ins")},
               "abs_v_ge1": [round(float(D.day.mean()), 4), int(len(D))]},
       "S7b": {"n": int(K.Rb.notna().sum()), "meanR": boot(K, "Rb"),
               "halves": [round(float(K[K.date < HALF].Rb.mean()), 4), round(float(K[K.date >= HALF].Rb.mean()), 4)],
               "by_ins": {i: round(float(x.Rb.mean()), 4) for i, x in K.groupby("ins")}, "abs_v_ge1": round(float(D.Rb.mean()), 4)}}
for k in ("S7a", "S7b"):
    r = res[k]; m = r["mean_sigma"] if k == "S7a" else r["meanR"]
    r["pass"] = bool(m[1] > 0 and min(r["halves"]) > 0)
(OUT / "vote_day.json").write_text(json.dumps(res, indent=1))
f = lambda c: f"{c[0]:+.4f} [{c[1]:+.4f}, {c[2]:+.4f}]"
a, b = res["S7a"], res["S7b"]
md = ["", f"## S7a — vote (|v| ≥ 2) vs the London session direction: **{'PASS' if a['pass'] else 'FAIL'}**", "",
      f"- mean signed open→22:00 return: {f(a['mean_sigma'])} σ after cost, hit {a['hit'] * 100:.1f}%, n {a['n']} days",
      f"- halves {a['halves'][0]:+.4f} / {a['halves'][1]:+.4f}; by instrument " + ", ".join(f"{i} {v:+.4f}" for i, v in a["by_ins"].items()),
      f"- |v| ≥ 1 (any lean): {a['abs_v_ge1'][0]:+.4f} σ (n {a['abs_v_ge1'][1]})", "",
      f"## S7b — median-line entry in the vote's direction, stop 0.6σ, out 22:00: **{'PASS' if b['pass'] else 'FAIL'}**", "",
      f"- mean R {f(b['meanR'])}, n {b['n']}; halves {b['halves'][0]:+.4f} / {b['halves'][1]:+.4f}; by instrument " +
      ", ".join(f"{i} {v:+.4f}" for i, v in b["by_ins"].items()) + f"; |v| ≥ 1: {b['abs_v_ge1']:+.4f}"]
with open(OUT / "RESULTS.md", "a", encoding="utf-8") as fh: fh.write("\n".join(md) + "\n")
print("\n".join(md).encode("ascii", "replace").decode())
