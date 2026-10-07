"""Meta-labelling on the long history with the era gate (forge/META_LABEL_LONG_PREREG.md).

    PYTHONPATH=. python scripts/ys_long/meta_model.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm, skew, kurtosis
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, "scripts/meta_proper")
from model import bet_size, sharpe  # noqa: E402  (AFML 10.1 sizing, per-bet Sharpe — the proper build's own)

D = Path("analysis/output/ys_long")
ROLE = {"USDJPY": 1, "GBPUSD": -1, "AUDUSD": -1, "USDCAD": 1, "USDCHF": 1, "EURUSD": -1}
F_PRIMARY = ["z", "absz", "dz5", "since_cross", "spread", "cusum_with"]
F_VOL = ["regime", "res5", "today", "dsig5"]
F_OTHER = ["usd_trend"]
TEST_YEARS = range(2006, 2027)
EMBARGO_DAYS, B, SEED, N_TRIALS = 14, 2000, 20261007, 7


def build() -> pd.DataFrame:
    E = pd.read_csv(D / "events.csv")
    E["y"] = (E.ret > 0).astype(int)
    E["absz"] = E.z.abs()
    C = pd.read_csv(D / "closes.csv").pivot(index="date", columns="pair", values="close").sort_index()
    legs = pd.DataFrame({p: ROLE[p] * np.log(C[p] / C[p].shift(10)) for p in ROLE})
    ut = {p: legs[[q for q in ROLE if q != p]].mean(axis=1, skipna=True) for p in ROLE}
    E["usd_trend"] = [ut[p].get(d, np.nan) * s * ROLE[p] for p, d, s in zip(E.pair, E.date, E.side)]
    E["d"], E["xd"] = pd.to_datetime(E.date), pd.to_datetime(E.exit)
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


def run(E, feats, start):
    rows = []
    for Y in TEST_YEARS:
        y0 = pd.Timestamp(f"{Y}-01-01")
        tr = E[(E.xd < y0 - pd.Timedelta(days=EMBARGO_DAYS)) & (E.d >= pd.Timestamp(start))].copy()
        te = E[E.d.dt.year == Y].copy()
        if len(tr) < 300 or not len(te):
            continue
        w = tr.uniq * (0.5 + 0.5 * tr.d.rank(pct=True))
        A, Bm = design(tr, te, feats)
        m_, s_ = A.mean(), A.std().replace(0, 1)
        lr = LogisticRegression(C=1.0, max_iter=5000).fit((A - m_) / s_, tr.y, sample_weight=w)
        te["p"] = lr.predict_proba((Bm - m_) / s_)[:, 1]
        te["size"] = bet_size(te.p.to_numpy())
        te["coef"] = json.dumps(dict(zip(A.columns, np.round(lr.coef_[0], 4))))
        rows.append(te)
    return pd.concat(rows, ignore_index=True)


def evaluate(P, Abl, rng):
    y, ret = P.y.to_numpy(), P.ret.to_numpy()
    months = P.d.dt.to_period("M").astype(str).to_numpy()
    um = np.unique(months)
    idx = {m: np.where(months == m)[0] for m in um}

    def met(Q, ii):
        p, s = Q.p.to_numpy()[ii], Q["size"].to_numpy()[ii]
        yy, rr = y[ii], ret[ii]
        keep = p > 0.5
        return {"prec_primary": yy.mean(), "prec_meta": yy[keep].mean() if keep.any() else np.nan,
                "rec_meta": yy[keep].sum() / max(yy.sum(), 1), "sh_flat": sharpe(rr), "sh_meta": sharpe(rr * s), "share_bet": keep.mean()}
    allI = np.arange(len(P))
    base, abl = met(P, allI), met(Abl, allI)
    bt = {"prec": [], "sh": [], "sh_vs_abl": []}
    for _ in range(B):
        ii = np.concatenate([idx[m] for m in rng.choice(um, len(um))])
        a, b = met(P, ii), met(Abl, ii)
        bt["prec"].append(a["prec_meta"] - a["prec_primary"]); bt["sh"].append(a["sh_meta"] - a["sh_flat"])
        bt["sh_vs_abl"].append(a["sh_meta"] - b["sh_meta"])
    ci = {k: [round(float(np.nanpercentile(v, 2.5)), 4), round(float(np.nanpercentile(v, 97.5)), 4)] for k, v in bt.items()}
    P = P.assign(terc=pd.qcut(P.p.rank(method="first"), 3, labels=["low", "mid", "high"]))
    terc = P.groupby("terc", observed=True).agg(n=("y", "size"), win=("y", "mean"), ret=("ret", "mean"), absz=("absz", "mean"))
    sane = bool(terc.loc["high", "absz"] > terc.loc["low", "absz"] and terc.loc["high", "win"] > terc.loc["low", "win"])
    sized = ret * P["size"].to_numpy()
    T = max(int(len(P) * P.uniq.mean()), 10)
    g = 0.5772156649
    sr, sr0 = sharpe(sized), math.sqrt(1 / T) * ((1 - g) * norm.ppf(1 - 1 / N_TRIALS) + g * norm.ppf(1 - 1 / (N_TRIALS * math.e)))
    dsr = float(norm.cdf((sr - sr0) * math.sqrt(T - 1) / math.sqrt(max(1 - skew(sized) * sr + (kurtosis(sized, fisher=False) - 1) / 4 * sr ** 2, 1e-9))))
    passed = ci["prec"][0] > 0 and ci["sh"][0] > 0
    coef = pd.DataFrame([json.loads(s) for s in P.drop_duplicates("coef").coef]).mean()
    return {"n": len(P), "eff": T, "base": {k: round(float(v), 4) for k, v in base.items()}, "ablation": {k: round(float(v), 4) for k, v in abl.items()},
            "ci": ci, "sanity": sane, "dsr": round(dsr, 3),
            "verdict": ("PASS" if passed else "FAIL") if sane else "UNINFORMATIVE (sanity failed)",
            "vol_earns": bool(sane and passed and ci["sh_vs_abl"][0] > 0),
            "terciles": terc.round(4).reset_index().astype({"terc": str}).to_dict("records"),
            "coef": coef.reindex(coef.abs().sort_values(ascending=False).index).round(3).head(10).to_dict()}


def main():
    E = build()
    rng = np.random.default_rng(SEED)
    full, abl_f = F_PRIMARY + F_VOL + F_OTHER, F_PRIMARY + F_OTHER
    L, M = run(E, full, "1900-01-01"), run(E, full, "1996-01-01")
    assert (L.d.to_numpy() == M.d.to_numpy()).all()
    gate_L, gate_M = sharpe(L.ret * L["size"]), sharpe(M.ret * M["size"])
    keep_old = gate_L >= gate_M
    main_name, start = ("L (1976+)", "1900-01-01") if keep_old else ("M (1996+)", "1996-01-01")
    P = L if keep_old else M
    Abl = run(E, abl_f, start)
    res = {"gate": {"sharpe_L": round(gate_L, 4), "sharpe_M": round(gate_M, 4), "old_data_kept": bool(keep_old), "main": main_name},
           "main": evaluate(P, Abl, rng)}
    other = M if keep_old else L
    res["other_arm"] = {"name": "M (1996+)" if keep_old else "L (1976+)", "sh_meta": round(sharpe(other.ret * other["size"]), 4),
                        "prec_meta": round(float(other.y[other.p > 0.5].mean()), 4)}
    (D / "meta_results.json").write_text(json.dumps(res, indent=1, default=str))
    r, c = res["main"], res["main"]["ci"]
    b, a = r["base"], r["ablation"]
    md = ["# Meta-labelling the yield-spread book on the long history (results)", "",
          f"Pre-registration: `forge/META_LABEL_LONG_PREREG.md`. Test = modern era 2006–2026 only: **{r['n']:,} primary bets** "
          f"(~{r['eff']} effective). Logistic, close-based features, AFML sizing, month-block bootstrap.", "",
          f"## Era gate: old data {'KEPT' if keep_old else 'DROPPED'}",
          f"Per-bet sized Sharpe on 2006–2026: trained from 1976 = {gate_L:.4f}, trained from 1996 only = {gate_M:.4f}. Main result uses **{main_name}**.", "",
          f"## Verdict: **{r['verdict']}**" + (" — and the volatility features earn their place" if r["vol_earns"] else ""), "",
          "| | primary alone | meta | meta without volatility features |", "|---|---|---|---|",
          f"| precision | {b['prec_primary'] * 100:.1f}% | **{b['prec_meta'] * 100:.1f}%** | {a['prec_meta'] * 100:.1f}% |",
          f"| share of bets taken | 100% | {b['share_bet'] * 100:.0f}% | {a['share_bet'] * 100:.0f}% |",
          f"| per-bet Sharpe | {b['sh_flat']:.3f} | **{b['sh_meta']:.3f}** | {a['sh_meta']:.3f} |", "",
          f"- Precision gain: {(b['prec_meta'] - b['prec_primary']) * 100:+.1f} pp [{c['prec'][0] * 100:+.1f}, {c['prec'][1] * 100:+.1f}]",
          f"- Sharpe gain vs flat: {b['sh_meta'] - b['sh_flat']:+.3f} [{c['sh'][0]:+.3f}, {c['sh'][1]:+.3f}]",
          f"- Volatility features' contribution (vs ablation): {b['sh_meta'] - a['sh_meta']:+.3f} [{c['sh_vs_abl'][0]:+.3f}, {c['sh_vs_abl'][1]:+.3f}]",
          f"- Deflated Sharpe (N = {N_TRIALS}): {r['dsr']}", "",
          f"Sanity check (top tercile higher |z| and win rate than bottom): **{'passed' if r['sanity'] else 'FAILED'}**", "",
          "| tercile | bets | win | mean net | mean \\|z\\| |", "|---|---|---|---|---|"]
    md += [f"| {t['terc']} | {t['n']} | {t['win'] * 100:.1f}% | {t['ret'] * 100:.3f}% | {t['absz']:.2f} |" for t in r["terciles"]]
    md += ["", "Coefficients (standardised, mean over years): " + ", ".join(f"{k} {v:+}" for k, v in r["coef"].items()),
           f"Other arm ({res['other_arm']['name']}): sized Sharpe {res['other_arm']['sh_meta']}, meta precision {res['other_arm']['prec_meta'] * 100:.1f}%."]
    (D / "META_RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
