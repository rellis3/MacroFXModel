"""residual-pca-family: power table from the CONTROL only (allowed before registering).
Control = the fx8 universe with no conditioning (the banked q1 question, already seen).
Uses: sd of s and its date-cluster design effect; daily IC sd (fx8 real, and synthetic nulls
of the same width for wide10 / idx6); tag counts (inputs). No conditioned outcome is computed."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import engine as E, tags as T

SEED = 20261031
Z = 2.326 + 0.842            # one-sided alpha 0.01 (Holm's first step with 5 tests), 80% power
OUT = os.path.join(T.ROOT, "analysis/output/residual-pca-family")
rng = np.random.default_rng(SEED)

r = T.universe("fx8"); x = E.basket(r)
disp, e, _ = E.walk(x, r, 2, T.COST)
S = (-disp * e)
s = S.values
N = s.size
sd_s = float(s.std(ddof=1))
day_mean = s.mean(1)
se_boot, _ = E.boot_se(lambda ix: day_mean[ix].mean(), len(day_mean), 21, 1000, rng)
deff = (se_boot ** 2) / (sd_s ** 2 / N)
ic = E.daily_ic(disp, e); sd_ic_fx8 = float(ic.std(ddof=1))

def mde_diff(nA, nB):
    return Z * sd_s * np.sqrt(deff) * np.sqrt(1 / nA + 1 / nB)

idx = S.index
news = T.news_tags(idx); vn = news.dropna()
nA1 = int((vn == 0).sum().sum()); nB1 = int((vn == 1).sum().sum())
me = T.monthend_tags(idx); nA2 = int(me.sum()) * 8; nB2 = int((~me).sum()) * 8
cr = T.crowd_tags(idx)
# aligned obs need disp sign; count only the crowd tags (the aligned share is ~half of extremes)
n_ext = int(((cr != 0) & cr.notna()).sum().sum()); nA3 = n_ext // 2; nB3 = int((cr == 0).sum().sum())

def synth_ic_sd(m, n=2600):
    rr = rng.standard_normal((n, m)) * 0.005
    rr = pd.DataFrame(rr, index=pd.bdate_range("2016-01-04", periods=n))
    xx = E.basket(rr)
    d_, e_, _ = E.walk(xx, rr, 2, {c: 0.0 for c in rr.columns})
    return float(E.daily_ic(d_, e_).std(ddof=1))

sd8, sd10, sd6 = synth_ic_sd(8), synth_ic_sd(10), synth_ic_sd(6)
infl = sd_ic_fx8 / sd8
rows = {
 "T1 news (untagged minus tagged, within currency)": {"nA": nA1, "nB": nB1, "sd": sd_s, "deff": deff, "mde": mde_diff(nA1, nB1), "bar": 0.05},
 "T2 month-end (month-end days minus other days)": {"nA": nA2, "nB": nB2, "sd": sd_s, "deff": deff, "mde": mde_diff(nA2, nB2), "bar": 0.05},
 "T3 COT crowd (aligned minus neutral, ~half of extremes aligned)": {"nA": nA3, "nB": nB3, "sd": sd_s, "deff": deff, "mde": mde_diff(nA3, nB3), "bar": 0.05},
 "T4 wide10 daily IC": {"n_days": 2228 - 121, "sd": sd10 * infl, "mde": Z * sd10 * infl / np.sqrt(2228 - 121), "bar": 0.03},
 "T5 idx6 daily IC (lag 2)": {"n_days": 2661 - 122, "sd": sd6 * infl, "mde": Z * sd6 * infl / np.sqrt(2661 - 122), "bar": 0.03},
}
out = {"seed": SEED, "control": {"obs": N, "days": len(day_mean), "sd_s": sd_s, "mean_s_full": float(s.mean()),
       "deff_date_cluster": deff, "sd_daily_ic_fx8": sd_ic_fx8, "sd_ic_synth": {"8": sd8, "10": sd10, "6": sd6},
       "ic_sd_inflation_real_vs_synth": infl},
       "cells": {k: {kk: (round(float(vv), 4) if isinstance(vv, float) else vv) for kk, vv in v.items()} for k, v in rows.items()}}
for k, v in out["cells"].items():
    v["verdict"] = "POWERED" if v["mde"] <= v["bar"] else "UNDERPOWERED"
json.dump(out, open(os.path.join(OUT, "power.json"), "w"), indent=1)
print(json.dumps(out, indent=1))
