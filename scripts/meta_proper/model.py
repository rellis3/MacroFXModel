"""Meta-labelling built properly — LAYERS 3-7 (forge/META_LABEL_PROPER_PREREG.md).

Features (primary / event / volatility system / USD trend / calendar), uniqueness x time-decay weights, bagged trees
(no tuning), yearly walk-forward with purge + 10-trading-day embargo, AFML bet sizing, scoring with month-block
bootstrap, a volatility-system ablation and a Deflated Sharpe.

    PYTHONPATH=. python scripts/meta_proper/model.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm, skew, kurtosis
from sklearn.ensemble import RandomForestClassifier

sys.path.insert(0, "scripts/forecast_history")
from forge.run_combined_range import asof_before  # noqa: E402

D = Path("analysis/output/meta_proper")
H = Path("analysis/output/forecast_history")
PAIRS = {"USDJPY": 1, "EURUSD": -1, "GBPUSD": -1, "AUDUSD": -1, "USDCAD": 1, "USDCHF": 1}     # usdRole
FOREIGN = {"USDJPY": "JPY", "EURUSD": "EUR", "GBPUSD": "GBP", "AUDUSD": "AUD", "USDCAD": "CAD", "USDCHF": "CHF"}
F_PRIMARY = ["z", "absz", "dz5", "since_cross", "spread", "cusum_with"]
F_VOL = ["regime", "res5", "today", "jumps5", "dsig5", "iv_sig"]
F_OTHER = ["usd_trend", "cal5"]
TEST_YEARS = range(2019, 2027)
EMBARGO_DAYS = 14                    # 10 trading days, in calendar days
B, SEED, N_TRIALS = 2000, 20261007, 5


def vol_features() -> pd.DataFrame:
    fl = pd.read_csv("analysis/output/jumps/flags_seasonal.csv", usecols=["inst", "date", "jump_bns"])
    cv = pd.read_parquet("data/cvol/cme_cvol_eod.parquet")
    cv["d"] = pd.to_datetime(cv["timestamp"]).dt.tz_convert("UTC").dt.tz_localize(None).dt.normalize()
    parts = []
    for p in PAIRS:
        d = pd.read_csv(H / f"{p}.csv", usecols=["inst", "date", "pit_sig_used", "pit_sig_daily", "r_hl"]).sort_values("date")
        d = d.merge(fl, on=["inst", "date"], how="left").reset_index(drop=True)
        s = d.pit_sig_used
        d["regime"] = np.log(s / s.shift(1).rolling(250, min_periods=120).median())
        res = np.log(d.r_hl.clip(lower=1e-6) / s)
        d["res5"] = res.shift(1).rolling(5, min_periods=3).mean()
        d["today"] = res
        d["jumps5"] = d.jump_bns.fillna(0).rolling(5, min_periods=1).sum()
        d["dsig5"] = np.log(s / s.shift(5))
        iv = cv[cv["product"] == p].set_index("d")["cvol"].astype(float).sort_index()
        d["iv_sig"] = np.log(asof_before(pd.to_datetime(d.date), iv) / (d.pit_sig_daily * np.sqrt(252)))
        parts.append(d.rename(columns={"inst": "pair"})[["pair", "date"] + F_VOL])
    return pd.concat(parts, ignore_index=True)


def usd_trend() -> pd.DataFrame:
    """Leave-one-out USD trend: mean 10-day log return of the OTHER pairs' USD leg."""
    legs = {}
    for p, role in PAIRS.items():
        d = pd.read_csv(D / f"daily_{p}.csv").set_index("date").close
        legs[p] = role * np.log(d / d.shift(10))
    L = pd.DataFrame(legs).sort_index()
    out = []
    for p in PAIRS:
        others = [q for q in PAIRS if q != p]
        out.append(pd.DataFrame({"pair": p, "date": L.index, "usd10": L[others].mean(axis=1).to_numpy()}))
    return pd.concat(out, ignore_index=True)


def calendar_counts(E: pd.DataFrame) -> np.ndarray:
    c = pd.read_csv("calendar_events.csv", encoding="latin-1", low_memory=False)
    c = c[c.impact == "Major"].copy()
    c["d"] = pd.to_datetime(c.datetime_raw, errors="coerce").dt.normalize()
    end = c.d.max()
    by = {k: g.d.sort_values().to_numpy() for k, g in c.groupby("ccy")}
    out = []
    for p, dt in zip(E.pair, pd.to_datetime(E.date)):
        if dt + pd.Timedelta(days=5) > end:
            out.append(np.nan); continue
        n = 0
        for k in ("USD", FOREIGN[p]):
            a = by.get(k)
            if a is not None:
                n += int(((a > np.datetime64(dt)) & (a <= np.datetime64(dt + pd.Timedelta(days=5)))).sum())
        out.append(n)
    return np.array(out, float)


def build() -> pd.DataFrame:
    E = pd.read_csv(D / "events.csv")
    E = E[E.side != 0].copy()
    E["ret"] = np.where(E.side > 0, E.long_ret, E.short_ret)
    E["exit"] = np.where(E.side > 0, E.long_exit, E.short_exit)
    E["y"] = (E.ret > 0).astype(int)
    E["absz"] = E.z.abs()
    E["cusum_with"] = (E.cusum_dir == E.side).astype(float)
    E = E.merge(vol_features(), on=["pair", "date"], how="left").merge(usd_trend(), on=["pair", "date"], how="left")
    E["usd_trend"] = E.usd10 * E.side * E.pair.map(PAIRS)            # + = the dollar trend agrees with this bet's USD side
    E["cal5"] = calendar_counts(E)
    E["d"] = pd.to_datetime(E.date)
    E["xd"] = pd.to_datetime(E.exit)
    E = E.sort_values("d").reset_index(drop=True)
    days = {}
    for a, b in zip(E.d, E.xd):
        for t in pd.date_range(a, b):
            days[t] = days.get(t, 0) + 1
    E["uniq"] = [np.mean([1 / days[t] for t in pd.date_range(a, b)]) for a, b in zip(E.d, E.xd)]
    return E


def design(tr, te, feats):
    med = tr[feats].median()
    def f(d):
        X = d[feats].copy()
        for c in feats:
            if X[c].isna().any() or tr[c].isna().any():
                X[c + "_na"] = X[c].isna().astype(float)
            X[c] = X[c].fillna(med[c])
        return X
    A, Bm = f(tr), f(te)
    return A, Bm.reindex(columns=A.columns, fill_value=0.0)


def bet_size(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    z = (p - 0.5) / np.sqrt(p * (1 - p))
    s = 2 * norm.cdf(z) - 1
    return np.round(np.clip(s, 0, None), 1)


def run(E, feats, label):
    rows = []
    for Y in TEST_YEARS:
        start = pd.Timestamp(f"{Y}-01-01")
        tr = E[E.xd < start - pd.Timedelta(days=EMBARGO_DAYS)].copy()      # purge (label span ended) + embargo
        te = E[E.d.dt.year == Y].copy()
        if len(tr) < 300 or not len(te):
            continue
        rank = tr.d.rank(pct=True)
        w = tr.uniq * (0.5 + 0.5 * rank)
        A, Bm = design(tr, te, feats)
        mu = float(min(max(tr.uniq.mean(), 0.05), 1.0))
        # Amendment 1: "leaves of ~50 events" on the full sample = 50 x mean uniqueness on the uniqueness-sized bootstrap
        rf = RandomForestClassifier(n_estimators=500, max_features="sqrt", min_samples_leaf=max(5, round(50 * mu)),
                                    class_weight="balanced_subsample", max_samples=mu, random_state=0, n_jobs=-1)
        rf.fit(A, tr.y, sample_weight=w)
        te["p"] = rf.predict_proba(Bm)[:, 1]
        te["size"] = bet_size(te.p.to_numpy())
        te["imp"] = json.dumps(dict(zip(A.columns, np.round(rf.feature_importances_, 4))))
        rows.append(te)
        if label == "full":
            print(f"{Y}: train {len(tr)}, test {len(te)}", flush=True)
    return pd.concat(rows, ignore_index=True)


def sharpe(x):
    x = np.asarray(x, float)
    return float(x.mean() / x.std()) if x.std() > 0 else 0.0


def main():
    E = build()
    full = run(E, F_PRIMARY + F_VOL + F_OTHER, "full")
    abl = run(E, F_PRIMARY + F_OTHER, "ablation")
    assert (full.index == abl.index).all() and (full.date.to_numpy() == abl.date.to_numpy()).all()
    y, ret = full.y.to_numpy(), full.ret.to_numpy()
    months = full.d.dt.to_period("M").astype(str).to_numpy()
    um = np.unique(months)
    idx = {m: np.where(months == m)[0] for m in um}
    rng = np.random.default_rng(SEED)

    def stats(sel):
        take = full.p.to_numpy()[sel] > 0.5 if sel is not None else None
        return take

    def metrics(P, ii):
        p, s = P.p.to_numpy()[ii], P["size"].to_numpy()[ii]
        yy, rr = y[ii], ret[ii]
        keep = p > 0.5
        prec_m = yy[keep].mean() if keep.any() else np.nan
        rec_m = (yy[keep].sum() / yy.sum()) if yy.sum() else np.nan
        return {"prec_primary": yy.mean(), "prec_meta": prec_m, "rec_meta": rec_m,
                "sh_flat": sharpe(rr), "sh_meta": sharpe(rr * s), "share_bet": keep.mean()}

    allI = np.arange(len(full))
    base = {k: metrics(P, allI) for k, P in (("full", full), ("ablation", abl))}
    boots = {"prec": [], "sh": [], "sh_vs_abl": [], "prec_vs_abl": []}
    for _ in range(B):
        ii = np.concatenate([idx[m] for m in rng.choice(um, len(um))])
        mf, ma = metrics(full, ii), metrics(abl, ii)
        boots["prec"].append(mf["prec_meta"] - mf["prec_primary"])
        boots["sh"].append(mf["sh_meta"] - mf["sh_flat"])
        boots["sh_vs_abl"].append(mf["sh_meta"] - ma["sh_meta"])
        boots["prec_vs_abl"].append(mf["prec_meta"] - ma["prec_meta"])
    ci = {k: [round(float(np.nanpercentile(v, 2.5)), 4), round(float(np.nanpercentile(v, 97.5)), 4)] for k, v in boots.items()}
    f1 = lambda p, r: 2 * p * r / (p + r)
    m = base["full"]
    # Deflated Sharpe (Bailey & Lopez de Prado), per-bet SR, effective T = bets x mean uniqueness, N = 5 trials
    sized = ret * full["size"].to_numpy()
    sr = sharpe(sized)
    T = max(int(len(full) * full.uniq.mean()), 10)
    g = 0.5772156649
    sr0 = math.sqrt(1 / T) * ((1 - g) * norm.ppf(1 - 1 / N_TRIALS) + g * norm.ppf(1 - 1 / (N_TRIALS * math.e)))
    sk, ku = skew(sized), kurtosis(sized, fisher=False)
    dsr = float(norm.cdf((sr - sr0) * math.sqrt(T - 1) / math.sqrt(1 - sk * sr + (ku - 1) / 4 * sr ** 2)))
    passed = ci["prec"][0] > 0 and ci["sh"][0] > 0
    vol_earns = passed and ci["sh_vs_abl"][0] > 0
    full["terc"] = pd.qcut(full.p.rank(method="first"), 3, labels=["low", "mid", "high"])   # rank: p can tie at 0.5
    terc = full.groupby("terc", observed=True).agg(n=("y", "size"), win=("y", "mean"), ret=("ret", "mean"), absz=("absz", "mean"))
    imp = pd.DataFrame([json.loads(s) for s in full.drop_duplicates("imp").imp]).mean().sort_values(ascending=False)
    res = {"n_test": len(full), "years": sorted(full.d.dt.year.unique().tolist()), "eff_T": T,
           "full": {k: round(float(v), 4) for k, v in m.items()}, "ablation": {k: round(float(v), 4) for k, v in base["ablation"].items()},
           "ci": ci, "f1_primary": round(f1(m["prec_primary"], 1.0), 4), "f1_meta": round(f1(m["prec_meta"], m["rec_meta"]), 4),
           "dsr": round(dsr, 4), "sr0": round(sr0, 4), "verdict": "PASS" if passed else "FAIL", "vol_system_earns_place": bool(vol_earns),
           "terciles": terc.round(4).reset_index().astype({"terc": str}).to_dict("records"),
           "importance": imp.round(4).head(12).to_dict(),
           "per_year": {int(yr): {"n": int(len(gp)), "flat": round(float(gp.ret.sum() * 100), 2), "meta": round(float((gp.ret * gp["size"]).sum() * 100), 2),
                                  "prec_primary": round(float(gp.y.mean()), 3), "prec_meta": round(float(gp.y[gp.p > 0.5].mean()), 3) if (gp.p > 0.5).any() else None}
                        for yr, gp in full.groupby(full.d.dt.year)}}
    (D / "results.json").write_text(json.dumps(res, indent=1, default=str))
    full.drop(columns=["imp"]).to_csv(D / "predictions.csv", index=False)
    write_md(res)


def write_md(r):
    F, A, c = r["full"], r["ablation"], r["ci"]
    md = ["# Meta-labelling built properly — results (layers 3–7)", "",
          f"Pre-registration: `forge/META_LABEL_PROPER_PREREG.md`. Walk-forward by year {r['years'][0]}–{r['years'][-1]}, purged + "
          f"10-trading-day embargo: **{r['n_test']:,} primary bets** (~{r['eff_T']:,} effective after overlap). 95% intervals: month-block bootstrap.", "",
          f"## Verdict: **{r['verdict']}**" + (" — and the volatility system earns its place" if r["vol_system_earns_place"] else
                                                ("" if r["verdict"] == "FAIL" else " — but the volatility system does NOT add (ablation)")), "",
          "| | primary alone | meta (full) | meta without the volatility features |", "|---|---|---|---|",
          f"| precision | {F['prec_primary'] * 100:.1f}% | **{F['prec_meta'] * 100:.1f}%** | {A['prec_meta'] * 100:.1f}% |",
          f"| share of bets taken | 100% | {F['share_bet'] * 100:.0f}% | {A['share_bet'] * 100:.0f}% |",
          f"| per-bet Sharpe | {F['sh_flat']:.3f} | **{F['sh_meta']:.3f}** | {A['sh_meta']:.3f} |",
          f"| F1 | {r['f1_primary']:.3f} | {r['f1_meta']:.3f} | |", "",
          f"- Precision gain (meta − primary): {(F['prec_meta'] - F['prec_primary']) * 100:+.1f} pp, interval [{c['prec'][0] * 100:+.1f}, {c['prec'][1] * 100:+.1f}]",
          f"- Sharpe gain (meta − flat): {F['sh_meta'] - F['sh_flat']:+.3f}, interval [{c['sh'][0]:+.3f}, {c['sh'][1]:+.3f}]",
          f"- Volatility system's contribution (full − ablation Sharpe): {F['sh_meta'] - A['sh_meta']:+.3f}, interval [{c['sh_vs_abl'][0]:+.3f}, {c['sh_vs_abl'][1]:+.3f}]",
          f"- Deflated Sharpe (N = {N_TRIALS} trials, effective T = {r['eff_T']}): {r['dsr']:.3f} (probability the sized Sharpe beats the best-of-{N_TRIALS} null)", "",
          "## Does the model sort bets? (test bets by predicted-probability tercile)", "",
          "| tercile | bets | win rate | mean net return | mean \\|z\\| |", "|---|---|---|---|---|"]
    md += [f"| {t['terc']} | {t['n']} | {t['win'] * 100:.1f}% | {t['ret'] * 100:.3f}% | {t['absz']:.2f} |" for t in r["terciles"]]
    md += ["", "| year | bets | primary precision | meta precision | flat total % | meta total % |", "|---|---|---|---|---|---|"]
    md += [f"| {y} | {v['n']} | {v['prec_primary'] * 100:.1f}% | {(v['prec_meta'] or 0) * 100:.1f}% | {v['flat']:+.2f} | {v['meta']:+.2f} |" for y, v in r["per_year"].items()]
    md += ["", "Feature importance (impurity, mean over years; descriptive): " + ", ".join(f"{k} {v:.3f}" for k, v in r["importance"].items())]
    (D / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
