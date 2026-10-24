"""Phase 1 — what do the COT measurements capture? (descriptive; NO forward outcomes are read)

1. Redundancy: within-market Spearman correlations between the measures, averaged across markets;
   PCA on within-market standardised measures (how many independent dimensions).
2. Extreme-flag agreement: does "extreme" by percentile, z-score, raw percentile and gross
   long/short ratio pick the same weeks? (Jaccard overlap.)
3. Historically extreme vs genuinely one-sided: at the 90th+ percentile, how lopsided is the
   gross book (long/short ratio), and how often is a lopsided book NOT historically extreme?
4. Accumulation vs covering: when net share moves toward the crowd side over 4 reports, how much
   came from new positions on the crowd side vs exits on the other side?
5. Context already known: positioning vs trailing price (past only); spec vs commercial mirror.
"""
import json, os, sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from panel import build, DATA  # noqa: E402

OUT = DATA
MEAS = ["pct_share", "z_share", "pct_raw", "share", "lgr", "long_sh", "short_sh", "d_share4", "dlong4", "dshort4",
        "oi_chg4", "oi_pct", "dur90", "frac80_26", "ltr", "comm_pct", "mom13"]


def main():
    p = build()
    p = p[p.ok & p.history_ok].copy()
    res = {"n_rows": int(len(p)), "markets": sorted(p.sym.unique()), "window": [str(p.report_date.min().date()), str(p.report_date.max().date())]}

    # 1. redundancy
    cors = []
    for sym, g in p.groupby("sym"):
        cors.append(g[MEAS].rank().corr().values)
    C = np.nanmean(np.array(cors), axis=0)
    res["spearman_mean"] = {a: {b: round(float(C[i, j]), 2) for j, b in enumerate(MEAS)} for i, a in enumerate(MEAS)}
    core = ["pct_share", "z_share", "pct_raw", "share", "lgr", "ltr", "d_share4", "oi_chg4", "oi_pct", "frac80_26", "comm_pct"]
    Z = p.groupby("sym")[core].transform(lambda s: (s - s.mean()) / s.std()).dropna()
    ev = np.linalg.eigvalsh(np.corrcoef(Z.values.T))[::-1]
    res["pca"] = {"vars": core, "explained": [round(float(x / ev.sum()), 3) for x in ev],
                  "effective_dims": round(float(ev.sum() ** 2 / (ev ** 2).sum()), 2)}

    # 2. extreme-flag agreement (long side and short side pooled by stretch)
    p["s_raw"] = np.where(p.pct_raw >= 50, p.pct_raw, 100 - p.pct_raw)
    flags = {
        "pct_share>=90": p.s >= 90,
        "|z_share|>=2": p.z_share.abs() >= 2,
        "pct_raw>=90": p.s_raw >= 90,
        "gross ratio >=3.5x (page CROWDED pill)": (p.lgr.abs() >= np.log(3.5)),
        "trader-count ratio top/bottom decile": p.groupby("sym").ltr.transform(lambda s: (s.rank(pct=True) >= .9) | (s.rank(pct=True) <= .1)),
    }
    names = list(flags)
    res["flag_rate"] = {k: round(float(v.mean()), 3) for k, v in flags.items()}
    res["jaccard"] = {a: {b: round(float((flags[a] & flags[b]).sum() / max(1, (flags[a] | flags[b]).sum())), 2) for b in names} for a in names}

    # 3. historically extreme vs one-sided
    ext = p[p.s >= 90]
    same_side_ratio = np.exp(ext.lgr * ext.crowd)            # crowd-side gross / other-side gross
    res["extreme_vs_onesided"] = {
        "n_extreme_weeks": int(len(ext)),
        "crowd_side_gross_ratio_quantiles": {q: round(float(same_side_ratio.quantile(q)), 2) for q in (.1, .25, .5, .75, .9)},
        "share_of_extremes_with_ratio>=3": round(float((same_side_ratio >= 3).mean()), 3),
        "share_of_extremes_where_crowd_side_is_net_minority": round(float((same_side_ratio < 1).mean()), 3),
        "onesided_weeks_(ratio>=3)_that_are_NOT_extreme": round(float(((np.exp(p.lgr.abs()) >= 3) & (p.s < 90)).sum() / max(1, (np.exp(p.lgr.abs()) >= 3).sum())), 3),
        "by_market_median_ratio_at_extreme": {k: round(float(v), 2) for k, v in same_side_ratio.groupby(ext.sym).median().items()},
    }

    # 4. accumulation vs covering, for 4-report moves toward the crowd side
    q = p.dropna(subset=["dlong4", "dshort4", "d_share4"]).copy()
    q["toward"] = q.d_share4 * q.crowd > 0
    # crowd-side gross change and other-side gross change, both as share of OI
    q["crowd_add"] = np.where(q.crowd > 0, q.dlong4, q.dshort4)
    q["other_cut"] = np.where(q.crowd > 0, -q.dshort4, -q.dlong4)
    def comp(g):
        t = g[g.toward]
        tot = t.crowd_add.clip(lower=0) + t.other_cut.clip(lower=0)
        new = (t.crowd_add.clip(lower=0) / tot.replace(0, np.nan))
        u = g[~g.toward]
        uc = (-u.crowd_add).clip(lower=0) + (-u.other_cut).clip(lower=0)
        liq = ((-u.crowd_add).clip(lower=0) / uc.replace(0, np.nan))
        return {"n_toward": int(len(t)), "toward_share_from_new_crowd_side_positions_median": round(float(new.median()), 2),
                "toward_mostly_new_positions": round(float((new > .5).mean()), 2),
                "n_away": int(len(u)), "away_share_from_crowd_side_liquidation_median": round(float(liq.median()), 2)}
    res["accumulation_vs_covering"] = {"all_weeks": comp(q), "at_extremes(s>=90)": comp(q[q.s >= 90]),
                                       "by_side_at_extremes": {("long" if k > 0 else "short"): comp(g) for k, g in q[q.s >= 90].groupby("crowd")}}

    # 5. context (past only)
    res["pct_vs_trailing_13w_price_by_market"] = {k: round(float(g[["pct_share", "mom13"]].corr(method="spearman").iloc[0, 1]), 2) for k, g in p.groupby("sym")}
    res["spec_vs_commercial_pct_by_market"] = {k: round(float(g[["pct_share", "comm_pct"]].corr(method="spearman").iloc[0, 1]), 2) for k, g in p.groupby("sym")}
    res["extreme_duration"] = {"median_run_weeks_at_s>=90": float(p[p.dur90 > 0].groupby(["sym", (p.dur90 == 1).cumsum()]).dur90.max().median()),
                               "share_of_extreme_weeks_in_runs_of_12+": round(float((p[p.s >= 90].groupby(["sym", (p.dur90 == 1).cumsum()]).dur90.transform("max") >= 12).mean()), 3)}

    json.dump(res, open(os.path.join(OUT, "phase1_measures.json"), "w"), indent=1)
    print(json.dumps({k: res[k] for k in ("n_rows", "pca", "flag_rate", "extreme_vs_onesided", "accumulation_vs_covering", "extreme_duration")}, indent=1))
    S = pd.DataFrame(res["spearman_mean"]).loc[MEAS, MEAS]
    print(S.round(2).to_string())
    print(pd.DataFrame(res["jaccard"]).to_string())


if __name__ == "__main__":
    main()
