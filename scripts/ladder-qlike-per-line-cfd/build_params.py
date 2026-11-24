"""QLIKE per-line SHADOW ladder for the CFDs (ladder-qlike-per-line-cfd). Each line (HL, OH, OL, OC, Close+, Close-)
keeps its own calc: the site-computable arm with the lowest out-of-sample QLIKE for that line on that CFD
(race.py leaderboard, 2020 -> 2026-08). Widths fitted on that CFD's own realised lines (Close+ on up-close sessions,
Close- on down-close sessions), every session <= 2026-08-21.

    python scripts/ladder-qlike-per-line-cfd/build_params.py -> js/ladderV2QlikeCfdParams.json, js/ladderV2QlikeCfd.fixture.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
sys.path.insert(0, str(ROOT / "scripts/ladder-qlike-per-line-cfd"))
import ladder as L  # noqa: E402
import race as RC  # noqa: E402
from forge import vol as V  # noqa: E402

OUT = ROOT / "analysis/output/ladder-qlike-per-line-cfd"
LINES, TAUS = ("hl", "oh", "ol", "oc", "cup", "cdn"), (50, 75, 90)
REGCOLS = {"R5": ["d1", "d5", "d22"], "R15": ["d1", "d5", "d22"], "SHAR": ["pos", "neg", "d5", "d22"],
           "HARCJ": ["c1", "c5", "c22", "j1"]}
OANDA_EXTRA = {"USDJPY": "USD_JPY", "CHFJPY": "CHF_JPY", "GBPJPY": "GBP_JPY", "UK100": "UK100_GBP"}
END = pd.Timestamp("2026-08-21")


def base(sym):
    return ROOT / RC.bdir(sym)


def spec_sigma(sym, arm, rows):
    b = base(sym)
    gp = json.loads((b / "garch_params_C.json").read_text())
    live = L.SYMS[sym]["live"]
    harc = "A0" if live == "har_rv_log" else "E_har_rv_log"
    if arm == "A0" or arm.startswith("E_"):
        return {"type": "est", "est": live if arm == "A0" else arm[2:]}, rows[arm]
    if arm in REGCOLS:
        f = pd.read_parquet(b / f"rvfeat_C_{arm}.parquet")
        cols = REGCOLS[arm]
        f = f[np.isfinite(f[cols + ["y_next"]]).all(axis=1) & (pd.to_datetime(f["next_date"]) <= END)]
        Xm = np.column_stack([np.ones(len(f))] + [f[c] for c in cols])
        coef, *_ = np.linalg.lstsq(Xm, f["y_next"].to_numpy(), rcond=None)
        s2 = float(np.var(f["y_next"].to_numpy() - Xm @ coef))
        Xr = np.column_stack([np.ones(len(rows))] + [rows[f"{arm}_{c}"] for c in cols])
        return ({"type": "reg", "arm": arm, "coef": [float(c) for c in coef], "s2": s2},
                pd.Series(np.sqrt(np.exp(Xr @ coef + s2 / 2)) * 100, index=rows.index))
    if arm.startswith("G_"):
        return {"type": "garch", "model": arm, "params": gp[arm + "@2026"]}, rows[arm + "@2026"]
    if arm == "B_har_garcht":
        return ({"type": "blend", "parts": [{"type": "est", "est": "har_rv_log"},
                                            {"type": "garch", "model": "G_garch_t", "params": gp["G_garch_t@2026"]}]},
                0.5 * (rows[harc] + rows["G_garch_t@2026"]))
    raise SystemExit(f"{sym}: {arm} has no site port")


def main():
    LB = pd.read_csv(OUT / "leaderboard.csv")
    res = json.loads((OUT / "results.json").read_text())
    V2 = json.loads((ROOT / "js/ladderV2Params.json").read_text())["instruments"]
    out = {"banked": "ladder-qlike-per-line-cfd", "track": "cfd", "research_window_end": "2026-08-21",
           "verdict": res["verdict"],
           "note": "QLIKE-best site-computable sigma per line on each OANDA CFD (OOS 2020-2026.08); each line its own calc",
           "instruments": {}}
    fx = {"instruments": {}}
    for sym in sorted(LB.sym.unique()):
        if sym in res.get("dropped", []):
            continue
        rows = pd.read_parquet(base(sym) / "rows_C.parquet").set_index("date")
        rows = rows[rows.index <= END]
        R = RC.realised(sym).reindex(rows.index)
        so = R["soc"]
        lines_x = {"hl": rows["hl"], "oh": rows["oh"], "ol": rows["ol"], "oc": rows["oc"],
                   "cup": so.where(so > 0), "cdn": (-so).where(so < 0)}
        d1 = json.loads((base(sym) / f"d1/{sym}_C.json").read_text())
        oanda = (V2.get(sym) or {}).get("oanda") or OANDA_EXTRA[sym]
        picks, specs, sigs, widths, needs = {}, {}, {}, {}, {"d1"}
        for q in LINES:
            g = LB[(LB.sym == sym) & (LB.line == q)].sort_values("qlike")
            r = g[g.site].iloc[0]
            a0 = g[g.arm == "A0"]
            picks[q] = {"arm": r.arm, "qlike": round(float(r.qlike), 4), "rank": int(r["rank"]), "of": int(r.n),
                        "best_overall": g.iloc[0].arm, "best_qlike": round(float(g.iloc[0].qlike), 4),
                        "live_qlike": round(float(a0.qlike.iloc[0]), 4) if len(a0) else None}
            arm = r.arm
            if arm not in specs:
                specs[arm], sigs[arm] = spec_sigma(sym, arm, rows)
                if arm in ("R5", "SHAR", "HARCJ"):
                    needs.add("m5")
                if arm == "R15":
                    needs.add("m15")
            x = lines_x[q]
            j = pd.DataFrame({"x": x, "s": sigs[arm]})
            ok = np.isfinite(j["s"]) & (j["s"] > 0) & np.isfinite(j["x"]) & (j["x"] > 0)
            widths[q] = {str(t): float(V.fit_width_multiplier(j.loc[ok, "s"].to_numpy(), j.loc[ok, "x"].to_numpy(), t / 100))
                         for t in TAUS}
            k = ok & (j.index >= "2020-01-01")
            picks[q]["hits_2020_26"] = [round(float((j.loc[k, "x"] > widths[q][str(t)] * j.loc[k, "s"]).mean() * 100), 1) for t in TAUS]
        z = V2.get(sym, {})
        out["instruments"][sym] = {
            "oanda": oanda, "d1_start": d1[0]["d"], "needs": sorted(needs), "lines": picks, "sigmas": specs, "widths": widths,
            "zone_sigma": z.get("zone_sigma", [0.175, 0.355]), "odds": z.get("odds"), "v2_on_site": sym in V2,
            "vs_live_pct": round(res["per_sym"].get(sym, float("nan")), 2),
        }
        print(sym, {q: (p["arm"], p["hits_2020_26"]) for q, p in picks.items()}, flush=True)
        sess = max(s.dropna().index.max() for s in sigs.values())
        item = {"session": str(sess.date()), "sigma": {a: float(s.loc[sess]) for a, s in sigs.items()},
                "d1": [[b["d"], b["o"], b["h"], b["l"], b["c"]] for b in d1 if b["d"] < str(sess.date())]}
        if needs & {"m5", "m15"}:
            m = L.load_m1(sym, "C")
            m = m[(m.index >= pd.Timestamp(sess).tz_localize("UTC") - pd.Timedelta(days=45))
                  & (m.index < pd.Timestamp(sess).tz_localize("UTC") + pd.Timedelta(hours=12))]
            for kk in (5, 15):
                if f"m{kk}" in needs:
                    c = m["close"].resample(f"{kk}min", label="left", closed="left").last().dropna()
                    item[f"m{kk}"] = [[int(t.timestamp()), float(v)] for t, v in c.items()]
        fx["instruments"][sym] = item
    (ROOT / "js/ladderV2QlikeCfdParams.json").write_text(json.dumps(out, indent=1))
    (ROOT / "js/ladderV2QlikeCfd.fixture.json").write_text(json.dumps(fx))


if __name__ == "__main__":
    main()
