"""Day reconstruction, milestone 2: finalise and validate the archive built by build_archive.mjs.

1. JSON lines -> parquet: <NAME>_days.parquet, <NAME>_touches.parquet (next_min flattened to next_<level>_min).
2. The minute path: <NAME>_path.parquet = every M1 bar of every archived session (London 00:00-22:00), keyed by
   (date, i) where i is the bar index the touch table's `k` points at.
3. Validation, each check re-derived independently of the JS builder where possible:
   A  path alignment       per day: bar count, first/last time, close checksum == the builder's sessions
   B  levels               production-era rungs == the milestone-1 v4Days dump; OOS rungs == fold width x sigma (forge's
                           Python estimator on NY-close bars) x fold event multiplier, recomputed here
   C  touches              every touch re-found from the path in Python: the bar k touches the level (static: price
                           level; proj: running extreme through k-1 +/- HL width) and no earlier bar did
   D  day summary          high/low/close and their times == the path
   E  ordering             p50 <= p75 <= p90 first-touch times within each family (a continuous path must pass the
                           inner rung first; equal minutes are allowed and are the ambiguous cases)
   F  calibration          exceedance by era == milestone 1 (validate_hist.json) on the same window
   G  H1-close field       share of touches never confirmed by an H1 close == milestone 1 V7
   H  coverage             era / tag status / ambiguity counts
4. MANIFEST.json: rows, date ranges, sha256 of every archive file.

    python scripts/day-reconstruction/finalize_archive.py
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import forge.vol as V  # noqa: E402

ARC = ROOT / "analysis/output/day-reconstruction/archive"
M1V = ROOT / "analysis/output/day-reconstruction"
NYD = ROOT / "analysis/output/ladder_candidates/d1"
INST = {"GOLD": ("gold", "VolRangeForecaster/data/m1", "gold"), "NQ": ("nq", "VolRangeForecaster/data/m1", "nq"),
        "EURUSD": ("eurusd", "VolRangeForecaster/data/m1", "eurusd")}
RUNGS = ["p50", "p75", "p90"]
SQ252 = np.sqrt(252)
report = json.load(open(ROOT / "forge/out_vol_lon/vol_report.json"))
m1val = json.load(open(M1V / "validate_hist.json"))["instruments"]
ff = json.load(open(M1V / "ff_tags.json"))
LOG, RES = [], {}


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


for NAME, (key, root, rkey) in INST.items():
    R = {}
    days = pd.read_json(ARC / f"{NAME}_days.jsonl", lines=True, convert_dates=False, precise_float=True, dtype={"date": str, "prev_date": str})
    tch = pd.read_json(ARC / f"{NAME}_touches.jsonl", lines=True, convert_dates=False, precise_float=True, dtype={"date": str})
    nxt = pd.json_normalize(tch.pop("next_min")).add_prefix("next_").add_suffix("_min")
    tch = pd.concat([tch, nxt], axis=1)
    fmin = pd.json_normalize(days.pop("first_touch_min")).add_prefix("first_").add_suffix("_min")
    lvls = pd.json_normalize(days.pop("levels")).add_prefix("lvl_")
    days = pd.concat([days, fmin, lvls], axis=1)
    sessions = json.load(open(ARC / f"{NAME}_sessions.json"))

    # ── path ────────────────────────────────────────────────────────────────
    m1 = V.load_m1(key, root)
    m1 = m1[m1.index < pd.Timestamp("2026-08-21", tz="UTC")]
    loc = m1.index.tz_convert("Europe/London")
    sel = loc.hour < 22
    path = pd.DataFrame({"date": loc[sel].strftime("%Y-%m-%d"), "t": (m1.index[sel].asi8 // 10**9).astype("int64"),
                         "open": m1["open"].to_numpy()[sel], "high": m1["high"].to_numpy()[sel],
                         "low": m1["low"].to_numpy()[sel], "close": m1["close"].to_numpy()[sel],
                         "volume": m1["volume"].to_numpy()[sel]})
    path = path[path.date.isin(sessions.keys())].reset_index(drop=True)
    path["i"] = path.groupby("date").cumcount().astype("int32")

    # A path alignment
    g = path.groupby("date")
    chk = pd.DataFrame({"n": g.size(), "t0": g.t.first(), "tN": g.t.last(), "cs": g.close.sum()})
    ref = pd.DataFrame(sessions).T.astype(float)
    ref.index.name = "date"
    a_n = (chk.n.reindex(ref.index) == ref["n"]).all()
    a_t = ((chk.t0.reindex(ref.index) == ref["t0"]) & (chk.tN.reindex(ref.index) == ref["tN"])).all()
    a_c = float((chk.cs.reindex(ref.index) / ref["closeSum"] - 1).abs().max())
    R["A_path_alignment"] = {"days": int(len(ref)), "bar_counts_equal": bool(a_n), "first_last_time_equal": bool(a_t),
                             "max_rel_close_checksum_diff": a_c, "path_rows": int(len(path))}
    log(f"{NAME} A path: {R['A_path_alignment']}")

    # B levels
    v4 = pd.DataFrame(json.load(open(M1V / f"v4days_{NAME}.json"))).set_index("date")
    prod = days[days.era == "insample_prod_params"].set_index("date")
    jb = prod.join(v4[["sigma_daily_pct", "oh", "ol", "hl"]], rsuffix="_v4", how="inner")
    dif = []
    for q in ("oh", "ol", "hl"):
        for r in RUNGS:
            col = f"{q}_{r}_pct" if q in ("oh", "ol") else f"{q}_{r}"
            dif.append((jb[col] - jb[q].map(lambda x, r=r: x[r])).abs().max())
    assert len(jb) == len(prod), "production-era days missing from the v4Days dump join"
    R["B_levels_prod_era_vs_v4days"] = {"days": int(len(jb)), "max_abs_rung_diff_pct": float(max(dif)),
                                        "sigma_equal": bool((jb.sigma_daily_pct == jb.sigma_daily_pct_v4).all())}
    # OOS era: recompute width x sigma x mult from forge (Python) on NY-close bars with the fold's estimator
    ny = pd.DataFrame(json.load(open(NYD / f"{NAME}.json"))).rename(columns=dict(o="open", h="high", l="low", c="close"))
    ny.index = pd.DatetimeIndex(ny.pop("d"))
    oos = days[days.era == "oos_pit"].copy()
    specs = report[rkey]["specs"]
    worst = 0.0
    for fold, gg in oos.groupby("fold"):
        sp = specs[int(fold)]
        s = pd.Series(V.ESTIMATORS[sp["estimator"]](ny), index=ny.index) / SQ252
        pos = s.index.searchsorted(pd.DatetimeIndex(gg.date), side="left") - 1
        sig = s.to_numpy()[pos]
        mult = np.array([1.0 if t is None or (isinstance(t, float) and np.isnan(t)) else sp["event_mult"].get(t, 1.0) for t in gg.event_tag])
        w = sp["width_mult"]
        for col, wk in (("oh_p75_pct", "OH_P75"), ("ol_p75_pct", "OL_P75"), ("hl_p50", "BM_P50"), ("oc_p90", "HN_P90")):
            # buildLadder rounds each rung to 2 dp from the unrounded sigma x mult x width -> expected max diff 0.005
            worst = max(worst, float(np.nanmax(np.abs(gg[col].to_numpy() - np.round(w[wk] * sig * mult, 2)))))
    R["B_levels_oos_vs_forge_recompute"] = {"days": int(len(oos)), "max_abs_rung_diff_pct": worst}
    log(f"{NAME} B levels: prod era {R['B_levels_prod_era_vs_v4days']}; OOS recompute {R['B_levels_oos_vs_forge_recompute']}")

    # C touches re-found from the path (independent re-implementation)
    pg = {d: x for d, x in path.groupby("date")}
    dd = days.set_index("date")
    bad_c, n_c, ties = 0, 0, []
    for idx, row in tch.iterrows():
        date, lvl = row.date, row.level
        x = pg[date]
        H, L = x.high.to_numpy(), x.low.to_numpy()
        o = dd.at[date, "open"]
        hiP = np.maximum.accumulate(np.r_[o, H[:-1]]); hiP = np.maximum(hiP, o)
        loP = np.minimum.accumulate(np.r_[o, L[:-1]]); loP = np.minimum(loP, o)
        fam, rung = lvl.rsplit("_", 1)
        if fam in ("ProjH", "ProjL"):
            pct = dd.at[date, f"hl_{rung}"]
            lv = loP * (1 + pct / 100) if fam == "ProjH" else hiP * (1 - pct / 100)
        else:
            lv = np.full(len(H), dd.at[date, f"lvl_{lvl}"])
        up = fam in ("OH", "CloseUp", "ProjH")
        # pct rounding: archive levels use buildLadder's 2dp rungs, so recompute against the archive's own price
        hits = np.flatnonzero(H >= lv - 1e-9) if up else np.flatnonzero(L <= lv + 1e-9)
        n_c += 1
        if not len(hits) or hits[0] != row.k:
            bad_c += 1
            ties.append(idx)
    # the builder reads prices through loadM1ForPair (Float32); the path here is the float64 source. A disagreement can
    # only be a price equal to the level within float32 precision -- flagged, never re-timed.
    tch["float32_tie"] = False
    tch.loc[ties, "float32_tie"] = True
    R["C_touch_refind"] = {"touches": n_c, "mismatches": bad_c,
                           "mismatch_rows": tch.loc[ties, ["date", "level", "k"]].to_dict("records")}
    log(f"{NAME} C touches re-found: {R['C_touch_refind']}")

    # D day summary
    dmx = path.groupby("date").agg(h=("high", "max"), l=("low", "min"), c=("close", "last"))
    jd = dd.join(dmx, how="inner")
    R["D_day_summary"] = {"days": int(len(jd)), "high_equal": bool(np.allclose(jd.high, jd.h)),
                          "low_equal": bool(np.allclose(jd.low, jd.l)), "close_equal": bool(np.allclose(jd.close, jd.c))}
    log(f"{NAME} D day summary: {R['D_day_summary']}")

    # E ordering within each family
    viol = 0
    for fam in ("OH", "OL", "CloseUp", "CloseDn", "ProjH", "ProjL"):
        a, b, c = (days[f"first_{fam}_{r}_min"] for r in RUNGS)
        viol += int(((b < a) | (c < b) | (b.notna() & a.isna()) | (c.notna() & b.isna())).sum())
    R["E_ordering_violations"] = viol
    log(f"{NAME} E ordering violations: {viol}")

    # F calibration vs milestone 1 (live basis, PIT params, FF window 2020-08-21 .. 2025-04-07)
    win = days[(days.era == "oos_pit") & (days.tag_status == "ff")]
    mine = {"hl_p75": float((win.hl_pct > win.hl_p75).mean()), "oh_p75": float((win.oh_pct > win.oh_p75_pct).mean()),
            "ol_p75": float((win.ol_pct > win.ol_p75_pct).mean()), "hl_p50": float((win.hl_pct > win.hl_p50).mean())}
    m1r = m1val[NAME]["V4_calibration_oos_ff"]["live_basis_ny_pit"]["rungs"]
    R["F_calibration_vs_m1"] = {"n": int(len(win)), "archive": mine, "milestone1": {k: m1r[k]["exceed"] for k in mine},
                                "max_abs_diff_pp": round(100 * max(abs(mine[k] - m1r[k]["exceed"]) for k in mine), 2)}
    log(f"{NAME} F calibration: {R['F_calibration_vs_m1']}")

    # G H1-close confirmation share vs milestone 1
    st = tch[tch.kind == "static"]
    never = st[st.family.isin(["OH", "OL"])].groupby(["family", "rung"]).h1_close_min.apply(lambda s: float(s.isna().mean()))
    R["G_h1_never_confirmed_OH_OL"] = {f"{a}_{b}": round(v, 3) for (a, b), v in never.items()}
    log(f"{NAME} G H1 never-confirmed: {R['G_h1_never_confirmed_OH_OL']}")

    # H coverage
    R["H_coverage"] = {"days_by_era": days.era.value_counts().to_dict(), "days_by_tag_status": days.tag_status.value_counts().to_dict(),
                       "touches": int(len(tch)), "touches_by_kind": tch.kind.value_counts().to_dict(),
                       "touches_ambiguous_order": int(tch.ambiguous_order.sum()),
                       "touch_count_by_level": tch.level.value_counts().sort_index().to_dict(),
                       "first_date": str(days.date.min()), "last_date": str(days.date.max())}
    log(f"{NAME} H coverage: eras {R['H_coverage']['days_by_era']}, tags {R['H_coverage']['days_by_tag_status']}, "
        f"touches {len(tch)}, ambiguous {R['H_coverage']['touches_ambiguous_order']}")

    days.to_parquet(ARC / f"{NAME}_days.parquet", index=False)
    tch.to_parquet(ARC / f"{NAME}_touches.parquet", index=False)
    path.to_parquet(ARC / f"{NAME}_path.parquet", index=False)
    RES[NAME] = R

man = {"generated": pd.Timestamp.now(tz="UTC").isoformat(), "files": {}}
for p in sorted(ARC.glob("*.parquet")):
    df = pd.read_parquet(p, columns=None)
    man["files"][p.name] = {"rows": int(len(df)), "bytes": p.stat().st_size, "sha256": sha(p)}
(ARC / "MANIFEST.json").write_text(json.dumps(man, indent=1))
(ARC / "validation.json").write_text(json.dumps(RES, indent=1, default=str))
(ARC / "validation.log").write_text("\n".join(LOG) + "\n")
