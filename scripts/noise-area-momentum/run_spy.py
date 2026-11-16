"""noise-area-momentum-spy: SPY as the paper ran it. Prereg forge/NOISE_AREA_MOMENTUM_SPY_PREREG.md, seed 20261115.

S1 = 2007-05-01 .. 2024-04-30 (paper window, V2 1x net of the paper's cost); S2 = 2024-05-01 .. 2026-08-21 (V3).
Run AFTER run.py (it merges SPY into site.json). Usage: python -I scripts/noise-area-momentum/run_spy.py [--draws 200]
Outputs: analysis/output/noise-area-momentum/spy/{results.json, RESULTS-numbers.json}, trades_SPY.json, days_SPY.json,
and instruments.SPY in site.json.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E  # noqa: E402
import run as R  # noqa: E402

SEED = 20261115
S1 = ("2007-05-01", "2024-04-30")
S2 = ("2024-05-01", "2026-08-21")
PAPER_S1 = dict(V1=0.61, V2=1.24, V3=1.33, trades=7668, v2_total=3.80, v3_cagr=0.196, v3_mdd=0.25)
SPREAD_RT = 0.019  # described: + half a cent spread per side


def window_cell(net, nulld, dates, lo, hi, rng, null_bar):
    m = (dates >= lo) & (dates <= hi)
    r = net[m]
    d = pd.to_datetime(dates[m]).values.astype("datetime64[D]").astype("int64")
    wk = R.week_ids(d)
    half = np.arange(len(r)) < len(r) // 2
    sh = R.sharpe(r)
    nulls = np.array([R.sharpe(x[m]) for x in nulld])
    cell = dict(window=[lo, hi], n_days=int(m.sum()), sharpe=sh, sharpe_ci=R.boot(r, wk, rng, R.sharpe),
                mean_bp=float(r.mean() * 1e4), mean_ci_bp=[x * 1e4 for x in R.boot(r, wk, rng, np.mean)],
                h1=R.sharpe(r[half]), h2=R.sharpe(r[~half]),
                null_mean=float(nulls.mean()) if len(nulls) else None,
                null_p975=float(np.percentile(nulls, 97.5)) if len(nulls) else None,
                null_pct=float((nulls < sh).mean() * 100) if len(nulls) else None,
                stats=R.summary(r, d))
    passes = cell["null_pct"] is not None and cell["null_pct"] > 97.5 and cell["mean_ci_bp"][0] > 0 \
        and cell["h1"] > 0 and cell["h2"] > 0
    cell["verdict"] = "VALIDATED" if passes else ("NULL" if cell["sharpe_ci"][1] < null_bar else "UNDERPOWERED")
    return cell


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=200)
    a = ap.parse_args()
    E.SEED = SEED  # bootstrap + sample-day seed for this study
    out, trades_out, sample, v3d, res, i0 = R.run_instrument("SPY", a.draws, None, seed_base=SEED, start=S1[0])
    v2d = out.pop("_v2_null_daily")
    dates = np.array(out["dates"])
    rng = np.random.default_rng(SEED + 5)
    v2 = res["V2"]["net"][i0:]
    v3 = res["V3"]["net"][i0:]
    s1 = window_cell(v2, v2d, dates, *S1, rng, 0.62)
    s2 = window_cell(v3, v3d, dates, *S2, rng, 0.66)
    # described
    desc = {}
    for v in R.VARIANTS:
        for nm, (lo, hi) in (("S1", S1), ("S2", S2), ("all", (S1[0], S2[1]))):
            m = (dates >= lo) & (dates <= hi)
            net = res[v]["net"][i0:][m]
            g = res[v]["gross"][i0:][m]
            lev = np.nan_to_num(res[v]["lev"][i0:][m]) if R.VARIANTS[v]["sized"] else np.ones(m.sum())
            u = res[v]["units"][i0:][m]
            spread = g - lev * u * (SPREAD_RT / 2) / E.build_days("SPY")["uopen"][i0:][m]
            d = pd.to_datetime(dates[m]).values.astype("datetime64[D]").astype("int64")
            st = R.summary(net, d, units=u)
            desc.setdefault(v, {})[nm] = dict(sharpe=st["sharpe"], total=st["total"], cagr=st["cagr"], mdd=st["mdd"],
                                              trades=st.get("trades"), gross_sharpe=R.sharpe(g),
                                              spread_sharpe=R.sharpe(spread), mean_bp=st["mean_bp"])
    # mechanics vs the paper
    ours, paper, labels = [], [], []
    for y, row in R.PAPER.items():
        for mi, pv in enumerate(row):
            o = out["monthly"]["V3"].get(y, {}).get(mi + 1)
            if o is not None:
                ours.append(o)
                paper.append(pv)
                labels.append(f"{y}-{mi + 1:02d}")
    mech = dict(paper=PAPER_S1, ours_S1={v: desc[v]["S1"] for v in ("V1", "V2", "V3")},
                monthly_corr=float(np.corrcoef(ours, paper)[0, 1]), months=len(labels),
                monthly=dict(labels=labels, ours=ours, paper=paper))
    mech["reproduces"] = bool(abs(desc["V2"]["S1"]["sharpe"] - 1.24) <= 0.25 and abs(desc["V3"]["S1"]["sharpe"] - 1.33)
                              <= 0.25 and mech["monthly_corr"] >= 0.8)
    results = dict(study="noise-area-momentum-spy", seed=SEED, lockbox_end=str(E.LOCKBOX_END.date()),
                   prereg="forge/NOISE_AREA_MOMENTUM_SPY_PREREG.md", draws=a.draws,
                   verdicts=dict(S1=s1, S2=s2), mechanics=mech, described=desc,
                   instrument={k: out[k] for k in ("start", "end", "n_days", "variants", "bh", "null_pct",
                                                   "decomposition", "by_year", "vol_regime", "time_of_day")})
    od = E.OUT / "spy"
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(json.dumps(results, indent=1, default=float))
    (E.OUT / "trades_SPY.json").write_text(json.dumps(trades_out, separators=(",", ":")))
    (E.OUT / "days_SPY.json").write_text(json.dumps(sample, separators=(",", ":")))
    sp = E.OUT / "site.json"
    site = json.loads(sp.read_text())
    site["instruments"]["SPY"] = {k: out[k] for k in out if k not in ("equity", "monthly")}
    site["meta"]["costs"]["SPY"] = E.COST_RT_PTS["SPY"]
    site["spy"] = dict(verdicts=dict(S1=s1, S2=s2), mechanics=mech)
    sp.write_text(json.dumps(site, separators=(",", ":"), default=float))
    print(json.dumps(dict(S1={k: s1[k] for k in s1 if k != "stats"}, S2={k: s2[k] for k in s2 if k != "stats"},
                          mech={k: mech[k] for k in ("ours_S1", "monthly_corr", "reproduces")}), indent=1, default=float))


if __name__ == "__main__":
    main()
