"""STEP C — meta-label the yield-spread book with the volatility system's state (forge/META_LABEL_YS_PREREG.md).

    PYTHONPATH=. python scripts/forecast_history/meta_label_ys.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import H  # noqa: E402

OUT = Path("analysis/output/meta_label_ys")
COST = 0.0002
FEATS = ["regime", "res5", "today", "jumps5", "absz"]
TEST_YEARS = range(2019, 2027)
SIZES = (0.5, 1.0, 1.5)
B, SEED = 2000, 20261006


def features() -> pd.DataFrame:
    fl = pd.read_csv("analysis/output/jumps/flags_seasonal.csv", usecols=["inst", "date", "jump_bns"])
    parts = []
    for sym in ("EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF"):
        d = pd.read_csv(H / f"{sym}.csv", usecols=["inst", "date", "pit_sig_used", "r_hl"]).sort_values("date")
        d = d.merge(fl, on=["inst", "date"], how="left").reset_index(drop=True)
        s = d.pit_sig_used
        d["regime"] = np.log(s / s.shift(1).rolling(250, min_periods=120).median())
        res = np.log(d.r_hl.clip(lower=1e-6) / s)
        d["res5"] = res.shift(1).rolling(5, min_periods=3).mean()
        d["today"] = res
        d["jumps5"] = d.jump_bns.fillna(0).rolling(5, min_periods=1).sum()
        parts.append(d)
    return pd.concat(parts, ignore_index=True)


def trades(F: pd.DataFrame) -> pd.DataFrame:
    T = pd.DataFrame(json.loads(Path(OUT / "ys_run.json").read_text())["combined"]["trades"])
    T["sign"] = np.where(T.dir == "LONG", 1, -1)
    T["ret"] = T.sign * (T.exitClose - T.entryClose) / T.entryClose - COST
    T["y"] = (T.ret > 0).astype(int)
    T["absz"] = T.entryZ.abs()
    T["d"] = pd.to_datetime(T.date)
    F = F.assign(d=pd.to_datetime(F.date)).rename(columns={"inst": "pair"})
    out = []
    for pair, g in T.groupby("pair"):
        f = F[F.pair == pair].sort_values("d")
        m = pd.merge_asof(g.sort_values("d"), f[["d"] + FEATS[:-1]], on="d", direction="backward")   # session on/before entry
        out.append(m)
    T = pd.concat(out).sort_values("d").reset_index(drop=True)
    # uniqueness: mean over the trade's days of 1 / (trades open that day)
    days = {}
    for e, x in zip(T.date, T.exitDate):
        for dd in pd.date_range(e, x):
            days[dd] = days.get(dd, 0) + 1
    T["w"] = [np.mean([1 / days[dd] for dd in pd.date_range(e, x)]) for e, x in zip(T.date, T.exitDate)]
    return T


def main():
    T = trades(features())
    T = T.dropna(subset=FEATS).reset_index(drop=True)
    rows = []
    for Y in TEST_YEARS:
        tr = T[pd.to_datetime(T.exitDate) < pd.Timestamp(f"{Y}-01-01")]
        te = T[T.d.dt.year == Y].copy()
        if len(tr) < 60 or not len(te):
            continue
        mu, sd = tr[FEATS].mean(), tr[FEATS].std().replace(0, 1)
        lr = LogisticRegression(C=1.0, max_iter=2000).fit((tr[FEATS] - mu) / sd, tr.y, sample_weight=tr.w)
        ptr = lr.predict_proba((tr[FEATS] - mu) / sd)[:, 1]
        lo, hi = np.quantile(ptr, [1 / 3, 2 / 3])
        te["p"] = lr.predict_proba((te[FEATS] - mu) / sd)[:, 1]
        te["terc"] = np.where(te.p >= hi, 2, np.where(te.p >= lo, 1, 0))
        te["size_raw"] = np.array(SIZES)[te.terc]
        te["size"] = te.size_raw / te.size_raw.mean()
        te["size_skip"] = np.where(te.terc == 0, 0.0, 1.0)
        te["size_skip"] = te.size_skip / max(te.size_skip.mean(), 1e-9)
        te["coef"] = json.dumps(dict(zip(FEATS, np.round(lr.coef_[0], 3))))
        te["n_train"] = len(tr)
        rows.append(te)
        print(f"{Y}: train {len(tr)}, test {len(te)}", flush=True)
    P = pd.concat(rows, ignore_index=True)

    def sharpe(r):
        return float(r.mean() / r.std()) if r.std() > 0 else 0.0

    flat, meta, skip = P.ret, P.ret * P["size"], P.ret * P.size_skip
    months = P.d.dt.to_period("M").astype(str).to_numpy()
    um = np.unique(months)
    idx = {m: np.where(months == m)[0] for m in um}
    rng = np.random.default_rng(SEED)
    diffs, dmean = [], []
    for _ in range(B):
        pick = np.concatenate([idx[m] for m in rng.choice(um, len(um))])
        f, m_ = flat.to_numpy()[pick], meta.to_numpy()[pick]
        diffs.append(sharpe(pd.Series(m_)) - sharpe(pd.Series(f)))
        dmean.append(m_.mean() - f.mean())
    d_lo, d_hi = np.percentile(diffs, [2.5, 97.5])
    m_lo, m_hi = np.percentile(dmean, [2.5, 97.5])
    terc = P.groupby("terc").agg(n=("y", "size"), win=("y", "mean"), mean_ret=("ret", "mean"))
    passed = bool(d_lo > 0 and terc.loc[2, "win"] > terc.loc[0, "win"])
    res = {"n_test": len(P), "years": sorted(P.d.dt.year.unique().tolist()),
           "sharpe_flat": round(sharpe(flat), 4), "sharpe_meta": round(sharpe(meta), 4), "sharpe_skip": round(sharpe(skip), 4),
           "sharpe_diff": [round(sharpe(meta) - sharpe(flat), 4), round(float(d_lo), 4), round(float(d_hi), 4)],
           "mean_ret_flat_pct": round(flat.mean() * 100, 4), "mean_ret_meta_pct": round(meta.mean() * 100, 4),
           "mean_diff_pct": [round((meta.mean() - flat.mean()) * 100, 4), round(m_lo * 100, 4), round(m_hi * 100, 4)],
           "terciles": terc.round(4).reset_index().to_dict("records"),
           "per_year": {int(y): {"n": int(len(g)), "flat": round(float(g.ret.sum() * 100), 2), "meta": round(float((g.ret * g["size"]).sum() * 100), 2)}
                        for y, g in P.groupby(P.d.dt.year)},
           "last_coef": json.loads(P.coef.iloc[-1]), "verdict": "PASS" if passed else "FAIL"}
    (OUT / "results.json").write_text(json.dumps(res, indent=1))
    md = ["# STEP C — meta-labelling the yield-spread book (results)", "",
          f"Pre-registration: `forge/META_LABEL_YS_PREREG.md`. Walk-forward by year {res['years'][0]}–{res['years'][-1]}: "
          f"**{res['n_test']} test trades.** Sizes 0.5 / 1.0 / 1.5 by the training terciles, rescaled to mean 1 per year "
          "(same average risk as flat). 95% intervals: block bootstrap over entry months.", "",
          f"## Verdict: **{res['verdict']}**", "",
          "| | flat | meta-sized | skip bottom tercile (reported only) |", "|---|---|---|---|",
          f"| per-trade Sharpe | {res['sharpe_flat']:.3f} | {res['sharpe_meta']:.3f} | {res['sharpe_skip']:.3f} |",
          f"| mean net return per trade | {res['mean_ret_flat_pct']:.3f}% | {res['mean_ret_meta_pct']:.3f}% | |", "",
          f"Sharpe difference (meta − flat): **{res['sharpe_diff'][0]:+.3f}** [{res['sharpe_diff'][1]:+.3f}, {res['sharpe_diff'][2]:+.3f}]. "
          f"Mean return difference {res['mean_diff_pct'][0]:+.3f}% [{res['mean_diff_pct'][1]:+.3f}, {res['mean_diff_pct'][2]:+.3f}].", "",
          "| predicted tercile | trades | win rate | mean net return |", "|---|---|---|---|"]
    md += [f"| {['bottom', 'middle', 'top'][int(r['terc'])]} | {int(r['n'])} | {r['win'] * 100:.1f}% | {r['mean_ret'] * 100:.3f}% |" for r in res["terciles"]]
    md += ["", "| year | trades | flat total % | meta total % |", "|---|---|---|---|"]
    md += [f"| {y} | {v['n']} | {v['flat']:+.2f} | {v['meta']:+.2f} |" for y, v in res["per_year"].items()]
    md += ["", "Last year's coefficients (standardised): " + ", ".join(f"{k} {v:+}" for k, v in res["last_coef"].items())]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
