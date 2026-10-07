"""LIVE-RANGE-FEATURES analysis (forge/LIVE_RANGE_FEATURES_PREREG.md).

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_features
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.run_live_range_history_build import cls_of, meta  # noqa: E402

O = Path("analysis/output/live_range_features")
TAUS = (0.5, 0.75, 0.9)
MIN_CELL = 30
LOG, RES = [], {}


def say(s=""):
    print(s, flush=True); LOG.append(s)


names = json.loads((O / "names.json").read_text()); names = [names[str(i)] for i in range(len(names))]
X = pd.read_parquet(O / "features.parquet")
X["cls"] = np.array([cls_of(n) for n in names])[X.inst.to_numpy()]
X["R"] = X.U + X.Dn
X["wd"] = (X.date + 6) % 7
FEAT = {"vwap |dist|": X.vwapd.abs(), "roc 1h |.|": X.roc1.abs(), "roc 3h |.|": X.roc3.abs(), "accel |.|": X.accel.abs(),
        "WaveTrend |WT1|": X.wt1.abs(), "WaveTrend |WT1-WT2|": X.wtd.abs(), "RSI |.-50|": (X.rsi - 50).abs(),
        "age of extreme": X.age, "range position extremity": (X.pos - 0.5).abs(), "weekday": X.wd.astype(float), "relative volume": X.relvol}
for k, v in FEAT.items():
    X[k] = v
# implied vol / sigma for the 7 CVOL instruments
cv = json.load(open("js/data/cmeCvolEod.json"))["series"]
MAPC = {"AUDUSD": "AUDUSD", "EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "USDCAD": "USDCAD", "USDCHF": "USDCHF", "USDJPY": "USDJPY", "GOLD": "XAUUSD"}
ivrows = []
for i, n in enumerate(names):
    if n not in MAPC:
        continue
    c = pd.DataFrame(cv[MAPC[n]])[["date", "cvol"]]; c["d"] = pd.to_datetime(c.date).map(pd.Timestamp.toordinal)
    m = meta(n); m["d"] = pd.to_datetime(m.date).map(pd.Timestamp.toordinal)
    m = m.sort_values("d"); c = c.sort_values("d")
    j = pd.merge_asof(m[["d", "pit_sig_daily"]], c[["d", "cvol"]].rename(columns={"d": "dc"}), left_on="d", right_on="dc", allow_exact_matches=False)
    ivrows.append(pd.DataFrame({"inst": i, "date": j.d.astype(int), "ivs": j.cvol / np.sqrt(252) / j.pit_sig_daily}))
IV = pd.concat(ivrows)
X = X.merge(IV, on=["inst", "date"], how="left")
FEATN = list(FEAT)


def pin(y, p, t):
    d = y - p
    return np.where(d >= 0, t * d, (t - 1) * d)


def qpred(trR, trc, tec, ncell, fallback=None):
    out = np.zeros((len(tec), 3))
    allq = np.quantile(trR, TAUS)
    for c in range(ncell):
        v = trR[trc == c]
        q = np.quantile(v, TAUS) if len(v) >= MIN_CELL else (allq if fallback is None else None)
        if q is None:
            out[tec == c] = fallback[tec == c]
        else:
            out[tec == c] = q
    return out


say("# LIVE-RANGE-FEATURES — results\n\nPre-registration: `forge/LIVE_RANGE_FEATURES_PREREG.md`. Test = last 40% of dates per class, "
    f"{X.inst.nunique()} instruments, 1.8M instrument-hour rows. Checkpoints 02:00-21:00 (20): 01:00 has too few 5-minute bars for RSI(14); the "
    "registered ≥ 14 bar is kept unchanged.\n")

T1 = {}; GB = {}; BS = {}
for cls in ("fx_gold", "indices"):
    C = X[X.cls == cls].copy()
    split = C.date.quantile(0.6)
    C["test"] = (C.date >= split).astype(int)
    # B / C arms per row (checkpoint-wise), kept for later comparisons
    Bq = np.zeros((len(C), 3)); Cq = np.zeros((len(C), 3))
    t1rows = {f: [] for f in FEATN + ["IV÷σ"]}
    for h in range(2, 22):
        mh = (C.h == h).to_numpy()
        Ch = C[mh]; tr = Ch.test.to_numpy() == 0; te = ~tr
        if tr.sum() < 500 or te.sum() < 200:
            continue
        eu = np.quantile(Ch.used[tr], [1 / 3, 2 / 3]); es = np.quantile(Ch.speed[tr], [1 / 3, 2 / 3])
        cB = np.digitize(Ch.used, eu) * 3 + np.digitize(Ch.speed, es)
        R = Ch.R.to_numpy(); y = R[te]
        PB = np.zeros((len(Ch), 3)); PC = np.zeros((len(Ch), 3))
        PB[te] = qpred(R[tr], cB[tr], cB[te], 9); PC[te] = qpred(R[tr], np.zeros(tr.sum(), int), np.zeros(te.sum(), int), 1)
        idx = np.flatnonzero(mh); Bq[idx] = PB; Cq[idx] = PC
        LB = sum(pin(y, PB[te][:, i], t) for i, t in enumerate(TAUS))
        inst_te = Ch.inst.to_numpy()[te]
        for f in FEATN + ["IV÷σ"]:
            col = "ivs" if f == "IV÷σ" else f
            v = Ch[col].to_numpy()
            ok = np.isfinite(v)
            if f == "weekday":
                lv = v.astype(int); L = 5
            else:
                if ok[tr].sum() < 300:
                    continue
                e = np.quantile(v[tr & ok], [1 / 3, 2 / 3]); lv = np.digitize(np.where(ok, v, np.nan), e); L = 3
            cc = cB * L + np.where(ok, lv, 0)
            Pf = np.zeros((len(Ch), 3)); Pf[te] = qpred(R[tr], cc[tr], cc[te], 9 * L, fallback=PB[te].repeat(1, 0) if False else None)
            # nested fallback: cells with < MIN_CELL use the B cell's quantiles
            for c_ in range(9 * L):
                if (cc[tr] == c_).sum() < MIN_CELL:
                    sel = te.copy(); sel[te] = cc[te] == c_
                    Pf[sel] = PB[sel]
            m_te = ok[te]
            if f == "IV÷σ":
                m_te = m_te & np.isin(inst_te, [i for i, n in enumerate(names) if n in MAPC])
            LF = sum(pin(y, Pf[te][:, i], t) for i, t in enumerate(TAUS))
            df = pd.DataFrame({"inst": inst_te[m_te], "LB": LB[m_te], "LF": LF[m_te]})
            g = df.groupby("inst").mean()
            if len(g) >= 3:
                t1rows[f].append(dict(h=h, ratio=float(np.median(g.LF / g.LB)), better=float((g.LF < g.LB).mean()), ninst=len(g)))
    T1[cls] = {f: pd.DataFrame(r) for f, r in t1rows.items() if r}
    C["Bq50"], C["Bq75"], C["Bq90"] = Bq.T; C["Cq50"], C["Cq75"], C["Cq90"] = Cq.T
    GB[cls] = (C, split)

say("## T1 — one feature added to the page's model (B + feature ÷ B; < 1 = the feature helps)\n")
say("| class | feature | checkpoints that beat B (need 14) | median ratio 02-07 / 08-14 / 15-21 | verdict |"); say("|---|---|---|---|---|")
t1sum = []
for cls in ("fx_gold", "indices"):
    for f, d in T1[cls].items():
        d["win"] = (d.ratio < 0.99) & (d.better >= 0.60)
        n = int(d.win.sum()); med = [d[(d.h >= a) & (d.h <= b)].ratio.median() for a, b in ((2, 7), (8, 14), (15, 21))]
        v = "ADDS" if n >= 14 else "no"
        t1sum.append(dict(cls=cls, feature=f, wins=n, of=len(d), med=med, verdict=v))
        say(f"| {cls} | {f} | {n}/{len(d)} | {med[0]:.3f} / {med[1]:.3f} / {med[2]:.3f} | {v} |")
RES["T1"] = t1sum
say(f"\nFeature × class tests examined: {len(t1sum)}; adding information: **{sum(r['verdict'] == 'ADDS' for r in t1sum)}**.\n")

# ---------------- T2 combined model
say("## T2 — combined gradient-boosted quantile model on R (all features) vs B and vs the clock\n")
say("| class | checkpoints that beat B (need 14) | median ÷B 02-07 / 08-14 / 15-21 | median ÷C 02-07 / 08-14 / 15-21 | verdict |"); say("|---|---|---|---|---|")
GFE = ["h", "used", "speed"] + FEATN
t2 = {}
for cls in ("fx_gold", "indices"):
    C, split = GB[cls]
    tr = C.test == 0; te = ~tr
    P = np.zeros((len(C), 3))
    for i, t in enumerate(TAUS):
        m = HistGradientBoostingRegressor(loss="quantile", quantile=t, max_iter=150, learning_rate=0.1, max_leaf_nodes=31,
                                          min_samples_leaf=300, random_state=0)
        m.fit(C.loc[tr, GFE].to_numpy(), C.loc[tr, "R"].to_numpy())
        P[:, i] = m.predict(C[GFE].to_numpy())
    y = C.R.to_numpy()
    L = {"G": sum(pin(y, P[:, i], t) for i, t in enumerate(TAUS)), "B": sum(pin(y, C[f"Bq{int(t*100)}"].to_numpy(), t) for t in TAUS),
         "C": sum(pin(y, C[f"Cq{int(t*100)}"].to_numpy(), t) for t in TAUS)}
    D = C.loc[te, ["inst", "h"]].assign(**{k: v[te.to_numpy()] for k, v in L.items()})
    g = D.groupby(["h", "inst"]).mean().reset_index()
    rows = []
    for h, gg in g.groupby("h"):
        rows.append(dict(h=h, GB=float(np.median(gg.G / gg.B)), GC=float(np.median(gg.G / gg.C)), better=float((gg.G < gg.B).mean())))
    d = pd.DataFrame(rows); d["win"] = (d.GB < 0.99) & (d.better >= .60)
    n = int(d.win.sum()); v = "ADDS" if n >= 14 else "no"
    mb = [d[(d.h >= a) & (d.h <= b)].GB.median() for a, b in ((2, 7), (8, 14), (15, 21))]
    mc = [d[(d.h >= a) & (d.h <= b)].GC.median() for a, b in ((2, 7), (8, 14), (15, 21))]
    say(f"| {cls} | {n}/{len(d)} | {mb[0]:.3f} / {mb[1]:.3f} / {mb[2]:.3f} | {mc[0]:.3f} / {mc[1]:.3f} / {mc[2]:.3f} | {v} |")
    t2[cls] = dict(wins=n, of=len(d), vsB=mb, vsC=mc, verdict=v, table=d.to_dict("records"))
RES["T2"] = t2

# ---------------- T3 extreme-in
say("\n## T3 — is the running high / low already in? (exhaustion outcome). Brier skill of the model over the hour × used × pace base rate\n")
say("| class | base Brier | model Brier | skill [95% date-block] | base rate of 'in' | verdict |"); say("|---|---|---|---|---|---|")
t3 = {}
for cls in ("fx_gold", "indices"):
    C, split = GB[cls]
    rows = []
    for side in (1, -1):
        sg = float(side)
        T = pd.DataFrame({"inst": C.inst, "date": C.date, "test": C.test, "h": C.h, "used": C.used, "speed": C.speed, "wd": C.wd,
                          "cell": np.nan, "side": side,
                          "y": ((C.U if side == 1 else C.Dn) <= 0.05).astype(float),
                          "pos": C.pos if side == 1 else 1 - C.pos, "vw": C.vwapd * sg, "r1": C.roc1 * sg, "r3": C.roc3 * sg, "ac": C.accel * sg,
                          "w1": C.wt1 * sg, "wd2": C.wtd * sg, "rs": (C.rsi - 50) * sg, "age": C.age, "rv": C.relvol})
        rows.append(T)
    T = pd.concat(rows, ignore_index=True)
    # base: train frequency by (h, used tercile, speed tercile, side)
    base = np.zeros(len(T)); trm = T.test == 0
    for h in range(2, 22):
        mh = T.h == h
        eu = np.quantile(T.used[mh & trm], [1 / 3, 2 / 3]); es = np.quantile(T.speed[mh & trm], [1 / 3, 2 / 3])
        cell = (np.digitize(T.used, eu) * 3 + np.digitize(T.speed, es)) * 2 + (T.side > 0)
        allm = T.y[mh & trm].mean()
        for c in range(18):
            sel = mh & (cell == c); tm = sel & trm
            base[sel.to_numpy()] = T.y[tm].mean() if tm.sum() >= MIN_CELL else allm
    FE3 = ["h", "used", "speed", "wd", "side", "pos", "vw", "r1", "r3", "ac", "w1", "wd2", "rs", "age", "rv"]
    m = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.1, max_leaf_nodes=31, min_samples_leaf=300, random_state=0)
    m.fit(T.loc[trm, FE3].to_numpy(), T.loc[trm, "y"].to_numpy())
    pm = m.predict_proba(T.loc[~trm, FE3].to_numpy())[:, 1]
    yt = T.loc[~trm, "y"].to_numpy(); pb = base[(~trm).to_numpy()]
    lb = (yt - pb) ** 2; lm = (yt - pm) ** 2
    dts = np.sort(T.loc[~trm, "date"].unique()); Wb = boot_weights(len(dts)); di = np.searchsorted(dts, T.loc[~trm, "date"].to_numpy())
    nb = np.bincount(di, weights=lb, minlength=len(dts)); nm = np.bincount(di, weights=lm, minlength=len(dts))
    sk = 1 - nm.sum() / nb.sum(); skb = 1 - (Wb @ nm) / (Wb @ nb)
    lo, hi = np.percentile(skb, [2.5, 97.5])
    v = "ADDS" if lo > 0 and sk >= 0.01 else "no"
    say(f"| {cls} | {lb.mean():.4f} | {lm.mean():.4f} | {sk*100:+.2f}% [{lo*100:+.2f}%, {hi*100:+.2f}%] | {yt.mean():.1%} | {v} |")
    # skill by hour group
    hh = T.loc[~trm, "h"].to_numpy(); parts = []
    for a, b in ((2, 7), (8, 14), (15, 21)):
        mm = (hh >= a) & (hh <= b); parts.append(f"{a:02d}-{b:02d}: {(1 - lm[mm].sum() / lb[mm].sum())*100:+.2f}%")
    say(f"\n{cls} skill by hour group: " + ", ".join(parts) + "\n")
    t3[cls] = dict(skill=float(sk), lo=float(lo), hi=float(hi), verdict=v)
RES["T3"] = t3
(O / "results.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote")
