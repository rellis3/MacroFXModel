"""Family 3 of cot-crowding-programme (amendment A1, registered d34e6952): the whole positioning spectrum.

Positioning in trend terms, pos_t = pct_share (trend up) or 100 - pct_share (trend down):
  S0 opposite extreme (<= 10, sign agreeing: specs crowded AGAINST the trend), S1 10-30, S2 30-70 (reference),
  S3 70-90, S4 crowded with the trend (>= 90, sign agreeing).
Each bin vs S2 weeks matched on market x T3 x m4 x V3; joint date-block bootstrap so bin differences
(S4 - S0, long - short) get intervals. Reads phase23_rows.csv.gz (outcomes already on the full panel).
"""
import json, os, sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import phase23 as P  # noqa: E402

OUT = P.OUT
SEED = 20261024
K = ["sym", "T3", "m4", "V3"]
COLS = ["r4", "r12", "big_adverse4", "rv_ratio"]


def load():
    q = pd.read_csv(os.path.join(OUT, "phase23_rows.csv.gz"), parse_dates=["report_date", "entry_date"])
    q = q[q.ok & q.history_ok & q.trend_dir.notna()].copy()
    q["pos_t"] = np.where(q.trend_dir > 0, q.pct_share, 100 - q.pct_share)
    trimmed = ((q.pct_share >= 90) & (q.share < 0)) | ((q.pct_share <= 10) & (q.share > 0))
    q["bin"] = np.select([q.against_trend, q.with_trend, trimmed, q.pos_t < 30, q.pos_t < 70, q.pos_t < 90],
                         ["S0", "S4", "trim", "S1", "S2", "S3"], default="trim")
    q["cpos"] = np.where(q.trend_dir > 0, q.comm_pct, 100 - q.comm_pct)
    return q


def joint(q, groups, ref, keys, col, rng, B=P.B):
    """matched effects of several test groups vs one reference, sharing every bootstrap draw."""
    sub = q[(ref | np.logical_or.reduce(list(groups.values())))].dropna(subset=[col] + keys)
    dates = np.array(sorted(sub.report_date.unique())); pos = {d: i for i, d in enumerate(dates)}
    cells = sub[keys].drop_duplicates().reset_index(drop=True); cells["cell"] = np.arange(len(cells))
    sub = sub.merge(cells, on=keys, how="left").set_index(sub.index)
    r = sub[ref.reindex(sub.index).values]
    rc, rd, rv, nc = r.cell.values, r.report_date.map(pos).values, r[col].values, len(cells)
    G = {}
    for g, m in groups.items():
        t = sub[m.reindex(sub.index).fillna(False).values]
        G[g] = (t.cell.values, t.report_date.map(pos).values, t[col].values)

    def est(w):
        cs = np.bincount(rc, weights=rv * w[rd], minlength=nc); cn = np.bincount(rc, weights=w[rd], minlength=nc)
        cm = np.where(cn > 0, cs / np.maximum(cn, 1e-12), np.nan)
        out = {}
        for g, (tc, td, tv) in G.items():
            has = cn[tc] > 0; ww = w[td] * has
            out[g] = np.nansum((tv - cm[tc]) * ww) / ww.sum() if ww.sum() > 0 else np.nan
        return out

    point = est(np.ones(len(dates)))
    draws = {g: [] for g in G}
    if rng is not None:
        for _ in range(B):
            e = est(P.block_weights(dates, rng))
            for g in G:
                draws[g].append(e[g])
    return point, {g: np.array(v) for g, v in draws.items()}, {g: int(len(G[g][0])) for g in G}


def ci(a):
    lo, hi = np.nanpercentile(a, [2.5, 97.5]); return round(float(lo), 4), round(float(hi), 4)


def summarise(point, draws, keyfn=None):
    out = {}
    for g in point:
        lo, hi = ci(draws[g]) if len(draws[g]) else (np.nan, np.nan)
        out[g] = {"est": round(float(point[g]), 4), "lo": lo, "hi": hi, "p": P.p_from_ci(point[g], lo, hi)}
    return out


def main():
    rng = np.random.default_rng(SEED)
    q = load()
    hold, disc = q.set.eq("holdout"), q.set.eq("discovery")
    early, late = q.report_date <= P.SPLIT, q.report_date > P.SPLIT
    bins = {b: q.bin.eq(b) for b in ("S0", "S1", "S3", "S4")}
    ref = q.bin.eq("S2")
    res = {"counts": {sc: q[m].bin.value_counts().to_dict() for sc, m in (("holdout", hold), ("discovery", disc))},
           "episodes_holdout": {b: P.eps(q[m & hold]) for b, m in bins.items()}}

    spectrum, diffs = {}, {}
    for col in COLS:
        for sc, m in (("holdout", hold), ("discovery", disc), ("holdout_h1", hold & early), ("holdout_h2", hold & late)):
            point, draws, n = joint(q[m], {b: v[m] for b, v in bins.items()}, ref[m], K, col, rng if sc in ("holdout", "discovery") else None)
            s = summarise(point, draws) if sc in ("holdout", "discovery") else {g: {"est": round(float(v), 4)} for g, v in point.items()}
            for g in s:
                s[g]["n"] = n[g]
            spectrum[f"{sc}|{col}"] = s
            if sc in ("holdout", "discovery"):
                d = draws["S4"] - draws["S0"]; lo, hi = ci(d); e = point["S4"] - point["S0"]
                rho = pd.Series([point["S0"], point["S1"], 0.0, point["S3"], point["S4"]]).rank().corr(pd.Series([0, 1, 2, 3, 4]))
                diffs[f"{sc}|{col}"] = {"S4-S0": round(float(e), 4), "lo": lo, "hi": hi, "p": P.p_from_ci(e, lo, hi), "spearman_bins": round(float(rho), 2)}
            else:
                diffs[f"{sc}|{col}"] = {"S4-S0": round(float(point["S4"] - point["S0"]), 4)}

    # asymmetry: crowded long vs crowded short within S4 (and S0 alongside)
    asym = {}
    for col in ("r12", "big_adverse4"):
        for sc, m in (("holdout", hold), ("discovery", disc), ("holdout_h1", hold & early), ("holdout_h2", hold & late)):
            groups = {"S4_long": bins["S4"] & (q.crowd > 0) & m, "S4_short": bins["S4"] & (q.crowd < 0) & m,
                      "S0_long": bins["S0"] & (q.crowd > 0) & m, "S0_short": bins["S0"] & (q.crowd < 0) & m}
            point, draws, n = joint(q[m], {g: v[m] for g, v in groups.items()}, ref[m], K, col, rng if sc in ("holdout", "discovery") else None)
            e = point["S4_long"] - point["S4_short"]
            if sc in ("holdout", "discovery"):
                lo, hi = ci(draws["S4_long"] - draws["S4_short"])
                asym[f"{sc}|{col}"] = {"long-short": round(float(e), 4), "lo": lo, "hi": hi, "p": P.p_from_ci(e, lo, hi),
                                       "groups": {g: {**v, "n": n[g]} for g, v in summarise(point, draws).items()}}
            else:
                asym[f"{sc}|{col}"] = {"long-short": round(float(e), 4)}

    # ── family 3 scored cells, Holm ──
    def gate_bin(col, bar):
        h, d = spectrum[f"holdout|{col}"]["S0"], spectrum[f"discovery|{col}"]["S0"]
        h1, h2 = spectrum[f"holdout_h1|{col}"]["S0"]["est"], spectrum[f"holdout_h2|{col}"]["S0"]["est"]
        return {"est": h["est"], "lo": h["lo"], "hi": h["hi"], "p": h["p"], "disc": d["est"], "halves": [h1, h2], "bar": bar,
                "episodes": res["episodes_holdout"]["S0"]}

    def gate_diff(src, key, col, bar):
        h, d = src[f"holdout|{col}"], src[f"discovery|{col}"]
        return {"est": h[key], "lo": h["lo"], "hi": h["hi"], "p": h["p"], "disc": d[key],
                "halves": [src[f"holdout_h1|{col}"][key], src[f"holdout_h2|{col}"][key]], "bar": bar}

    F3 = {"S0-r12": gate_bin("r12", 0.20), "S0-adv": gate_bin("big_adverse4", 0.05),
          "SLOPE-r12": gate_diff(diffs, "S4-S0", "r12", 0.20), "SLOPE-adv": gate_diff(diffs, "S4-S0", "big_adverse4", 0.05),
          "ASYM-r12": gate_diff(asym, "long-short", "r12", 0.20), "ASYM-adv": gate_diff(asym, "long-short", "big_adverse4", 0.05)}
    adj = P.holm([F3[k]["p"] for k in F3])
    for (k, c), a in zip(F3.items(), adj):
        c["holm_p"] = a
        ci_ex = c["lo"] > 0 or c["hi"] < 0
        halves = np.sign(c["halves"][0]) == np.sign(c["halves"][1]) == np.sign(c["est"])
        disc_same = np.sign(c["disc"]) == np.sign(c["est"])
        epi_ok = c.get("episodes", 999) >= 40
        stat = ci_ex and a < 0.05 and halves and disc_same
        if not epi_ok:
            v = "UNDERPOWERED"
        elif stat:
            v = "VALIDATED" if abs(c["est"]) >= c["bar"] else "CONTEXT"
        else:
            v = "NULL" if (c["lo"] > -c["bar"] and c["hi"] < c["bar"]) else "UNDERPOWERED"
        c["gate"] = {"ci_excludes_0": bool(ci_ex), "holm<0.05": bool(a < 0.05), "both_halves": bool(halves), "discovery_same_sign": bool(disc_same)}
        c["verdict"] = v

    # ── descriptive (BH q = 0.10) ──
    desc = {}
    strong = q.T3.eq(2)
    for col in COLS:
        r = P.matched(q[hold & strong & ref], q[hold & strong & (bins["S3"] | bins["S4"])], ["sym", "m4", "V3"], col, rng)
        desc[f"under-positioned strong trend (S2) vs well-positioned (S3/S4) | {col}"] = r
        for nm, m in (("commercials crowded WITH trend (cpos>=90)", q.cpos >= 90), ("commercials crowded AGAINST trend (cpos<=10)", q.cpos <= 10)):
            desc[f"{nm} vs commercials neutral | {col}"] = P.matched(q[hold & m], q[hold & q.cpos.between(30, 70)], K, col, rng)
        for b in ("S4", "S0"):
            desc[f"{b}: low OI (oi_pct<=20) vs high OI (>=80) | {col}"] = P.matched(q[hold & bins[b] & (q.oi_pct <= 20)], q[hold & bins[b] & (q.oi_pct >= 80)], ["sym", "T3", "V3"], col, rng)
    dl = [k for k in desc if np.isfinite(desc[k].get("p", np.nan))]
    for k, ok in zip(dl, P.bh([desc[k]["p"] for k in dl])):
        desc[k]["bh_q10"] = bool(ok)

    res.update({"id": "cot-crowding-programme / family 3 (spectrum)", "amendment": "A1 d34e6952", "seed": SEED,
                "spectrum": spectrum, "S4_minus_S0": diffs, "asymmetry": asym, "family3": F3, "descriptive": desc,
                "descriptive_bh_passes": int(sum(desc[k].get("bh_q10", False) for k in dl)), "descriptive_tests": len(dl)})
    json.dump(res, open(os.path.join(OUT, "phase_spectrum_results.json"), "w"), indent=1,
              default=lambda x: None if isinstance(x, float) and np.isnan(x) else str(x))
    print("counts", res["counts"]); print("episodes", res["episodes_holdout"])
    for col in COLS:
        s = spectrum[f"holdout|{col}"]; d = spectrum[f"discovery|{col}"]
        print(col.ljust(13), "  ".join(f"{b} {s[b]['est']:+.3f}[{s[b]['lo']:+.2f},{s[b]['hi']:+.2f}] (disc {d[b]['est']:+.2f})" for b in ("S0", "S1", "S3", "S4")),
              "| S4-S0", diffs[f"holdout|{col}"])
    for k, c in F3.items():
        print(k, f"{c['est']:+.4f} [{c['lo']:+.4f},{c['hi']:+.4f}] disc {c['disc']:+.3f} halves {c['halves'][0]:+.3f}/{c['halves'][1]:+.3f} holm {c['holm_p']:.3f}", c["verdict"])
    for k, v in asym.items():
        if "groups" in v:
            print(k, {g: (x["est"], x["n"]) for g, x in v["groups"].items()})
    for k, v in desc.items():
        print(("* " if v.get("bh_q10") else "  ") + k, v.get("est"), v.get("lo"), v.get("hi"), v.get("n"))


if __name__ == "__main__":
    main()
