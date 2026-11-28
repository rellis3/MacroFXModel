"""gold-line-vwap-stretch-filter (forge/GOLD_LINE_VWAP_STRETCH_FILTER_PREREG.md): base (gold-line-system-jordan
primary) vs base + "skip fills < 2 sigma_v from VWAP", with a random-skip placebo.

    python scripts/gold-line-vwap-stretch-filter/run.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/gold-line-vwap-stretch-filter"
_sp = importlib.util.spec_from_file_location("ler", ROOT / "scripts/gold-line-system-jordan/entry_rules.py")
ER = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(ER)
S, J = ER.S, ER.J
IS_END = S.IS_END
SEED, B, BLOCK, NPL = 20261128, 2000, 63, 200
lines = []


def say(s=""):
    print(s, flush=True); lines.append(s)


def daily(X, days):
    g = X.groupby("date")["R"]; s_, n_ = g.sum(), g.count()
    return s_.reindex(days, fill_value=0).to_numpy(), n_.reindex(days, fill_value=0).to_numpy()


def boot_diff(Xa, Xb, days, rng):
    sa, na = daily(Xa, days); sb, nb = daily(Xb, days)
    N = len(days); nbk = int(np.ceil(N / BLOCK)); d = np.empty(B)
    for b in range(B):
        st = rng.integers(0, max(N - BLOCK + 1, 1), nbk); ii = (st[:, None] + np.arange(BLOCK)).ravel()[:N] % N
        d[b] = sb[ii].sum() / max(nb[ii].sum(), 1) - sa[ii].sum() / max(na[ii].sum(), 1)
    return np.percentile(d, [5, 95])


def stats(X):
    out = {}
    for lab, m in (("IS", X["date"].dt.year <= IS_END), ("OOS", X["date"].dt.year > IS_END)):
        x = X[m]; r = np.sort(x.R.to_numpy())[::-1]; k = int(np.ceil(0.01 * len(r)))
        out[lab] = dict(n=len(x), mean=float(x.R.mean()), tot=float(x.R.sum()), wo_top1=float(r[k:].sum()),
                        gross=float(x.gR.mean()), win=100 * float((x.R > 0).mean()), stop=100 * float((x.oc == S.STP).mean()))
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    W, DV, Dold, tick, nsess, costs, floor, stops, sess = ER.setup()
    s_is = [s for s in sess if s[1].year <= IS_END]; s_oos = [s for s in sess if s[1].year > IS_END]
    rng = np.random.default_rng(SEED)
    res = {"seed": SEED, "rules": {}}
    for rule, (ign, cs, lab) in (("fill_any", ER.VARIANTS["fill_any"]), ("ignore_any", ER.VARIANTS["ignore_any"])):
        base, cb = ER.run_var(sess, stops, costs, floor, ign, cs)
        if rule == "fill_any":
            assert abs(base[base["date"].dt.year > IS_END].R.mean() - 0.30186) < 2e-4, "base must reproduce the primary"
        R_ = {"base": dict(stats=stats(base), counts=cb)}
        days = sorted(base.loc[base["date"].dt.year > IS_END, "date"].unique())
        alld = sorted(d for d in {s[1] for s in s_oos})
        for z in (1.5, 2.0, 2.5):
            Xl, cl = ER.run_var(sess, stops, costs, floor, ign, cs, zmin=z)
            _, c_oos = ER.run_var(s_oos, stops, costs, floor, ign, cs, zmin=z)
            share = c_oos["skipped"] / max(c_oos["skipped"] + c_oos["filled"], 1)
            st_ = stats(Xl)
            ci = boot_diff(base[base["date"].dt.year > IS_END], Xl[Xl["date"].dt.year > IS_END], alld, rng)
            R_[f"z{z}"] = dict(stats=st_, counts=cl, oos_skip_share=share, oos_diff_ci90=ci.tolist())
            if z == 2.0:
                Xkeep = Xl
                pl = []
                prng = np.random.default_rng(SEED + 1)
                for p in range(NPL):
                    Xp, _ = ER.run_var(s_oos, stops, costs, floor, ign, cs, q=share, rng=prng)
                    pl.append(float(Xp.R.mean()) - st_["OOS"]["mean"] * 0 - R_["base"]["stats"]["OOS"]["mean"])
                    if p % 50 == 49: print(f"  {rule} placebo {p + 1}/{NPL}", flush=True)
                imp = st_["OOS"]["mean"] - R_["base"]["stats"]["OOS"]["mean"]
                g1 = st_["IS"]["mean"] > R_["base"]["stats"]["IS"]["mean"] and imp > 0
                g2 = st_["OOS"]["tot"] >= 0.9 * R_["base"]["stats"]["OOS"]["tot"]
                g3 = imp > float(np.percentile(pl, 95))
                R_["z2.0"].update(placebo_improve=pl, placebo_mean=float(np.mean(pl)), placebo_p95=float(np.percentile(pl, 95)),
                                  improve=imp, gates=dict(both_periods=bool(g1), keeps_90pct_total=bool(g2), beats_placebo=bool(g3)),
                                  verdict=("UNDERPOWERED" if (g1 and g2 and g3) else "NULL") if rule == "fill_any" else "descriptive")
                X = Xkeep.copy(); X["y"] = X["date"].dt.year; b2 = base.copy(); b2["y"] = b2["date"].dt.year
                R_["by_year"] = pd.DataFrame({"base_n": b2.groupby("y").R.count(), "base_R": b2.groupby("y").R.mean().round(3),
                                              "layer_n": X.groupby("y").R.count(), "layer_R": X.groupby("y").R.mean().round(3)}).reset_index().to_dict("records")
        res["rules"][rule] = R_
        say(f"\n== {lab} ==")
        b = R_["base"]["stats"]
        say(f"  base      IS {b['IS']['mean']:+.3f} (n {b['IS']['n']}, {b['IS']['tot']:+.0f}R) | OOS {b['OOS']['mean']:+.3f} (n {b['OOS']['n']}, "
            f"{b['OOS']['tot']:+.0f}R, w/o top1% {b['OOS']['wo_top1']:+.0f}R, stop {b['OOS']['stop']:.0f}%)")
        for z in (1.5, 2.0, 2.5):
            a = R_[f"z{z}"]; t = a["stats"]
            say(f"  >= {z}σ    IS {t['IS']['mean']:+.3f} (n {t['IS']['n']}, {t['IS']['tot']:+.0f}R) | OOS {t['OOS']['mean']:+.3f} (n {t['OOS']['n']}, "
                f"{t['OOS']['tot']:+.0f}R, w/o top1% {t['OOS']['wo_top1']:+.0f}R, stop {t['OOS']['stop']:.0f}%) | OOS skipped {100 * a['oos_skip_share']:.0f}% of fills | "
                f"OOS diff 90% CI [{a['oos_diff_ci90'][0]:+.3f}, {a['oos_diff_ci90'][1]:+.3f}]")
        a = R_["z2.0"]
        say(f"  2σ layer: OOS improvement {a['improve']:+.3f} vs random-skip placebo mean {a['placebo_mean']:+.3f} p95 {a['placebo_p95']:+.3f}; "
            f"gates {a['gates']} -> {a['verdict']}")
        say("  by year:\n" + pd.DataFrame(R_["by_year"]).to_string(index=False))
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=float)
    (OUT / "report.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
