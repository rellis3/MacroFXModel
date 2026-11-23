"""QLIKE per-line SHADOW ladder for the site (ladder-qlike-per-line, banked 2026-11-22). Futures track only.

    python scripts/ladder-qlike-per-line/build_params.py  -> js/ladderV2QlikeParams.json, js/ladderV2Qlike.fixture.json

Per instrument and line (hl / oh / ol) the sigma model is the one with the lowest out-of-sample QLIKE on the futures
(2020 -> 2026-08, analysis/output/ladder-qlike-per-line/leaderboard.csv) among the models the site can compute from
OANDA (no IV feed on the site yet: V3 / V4 / B_har_iv are skipped, and H8). OC has its own calc: the site-computable
winner of the OC QLIKE race (oc_race.py, exploratory) - since 2026-11-23; before that OC borrowed the OH model. The sigma is computed on OANDA data as the rollout does for futures; the
widths of each line are fitted on the FUTURES' realised ranges with that sigma, every session <= 2026-08-21.
Zones and next-line odds are the instrument's existing v2 ones (js/ladderV2Params.json).
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
import ladder as L  # noqa: E402
from forge import vol as V  # noqa: E402

SYMS = {"NQ": "NAS100_USD", "GOLD": "XAU_USD", "EURUSD": "EUR_USD", "USDJPY": "USD_JPY"}
NO_SITE = {"V3", "V4", "B_har_iv", "H8"}
LINES, TAUS = ("hl", "oh", "ol"), (50, 75, 90)
REGCOLS = {"R5": ["d1", "d5", "d22"], "R15": ["d1", "d5", "d22"], "SHAR": ["pos", "neg", "d5", "d22"],
           "HARCJ": ["c1", "c5", "c22", "j1"]}
END = pd.Timestamp("2026-08-21")


def base(sym):
    return ROOT / (f"analysis/output/ladder-per-line/build/{sym.lower()}" if sym != "USDJPY"
                   else "analysis/output/ladder-v2-usdjpy")


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
        f = f[np.isfinite(f[cols + ["y_next"]]).all(axis=1)]
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
    LB = pd.read_csv(ROOT / "analysis/output/ladder-qlike-per-line/leaderboard.csv")
    global OCR
    OCR = pd.read_csv(ROOT / "analysis/output/ladder-qlike-per-line/oc_race.csv")
    V2 = json.loads((ROOT / "js/ladderV2Params.json").read_text())["instruments"]
    out = {"banked": "ladder-qlike-per-line", "track": "fut", "research_window_end": "2026-08-21",
           "note": "QLIKE-best site-computable sigma per line (futures, OOS 2020-2026.08); OC has its own calc from the OC QLIKE race",
           "instruments": {}}
    fx = {"instruments": {}}
    for sym, oanda in SYMS.items():
        rows = pd.read_parquet(base(sym) / "rows_C.parquet").set_index("date")
        rf = pd.read_parquet(base(sym) / "rows_F.parquet").set_index("date")
        rf = rf[rf.index <= END]
        d1 = json.loads((base(sym) / f"d1/{sym}_C.json").read_text())
        picks, specs, sigs, widths, needs = {}, {}, {}, {}, {"d1"}
        for q in LINES:
            g = LB[(LB.sym == sym) & (LB.line == q) & ~LB.arm.isin(NO_SITE)].sort_values("qlike")
            best = LB[(LB.sym == sym) & (LB.line == q)].sort_values("qlike").iloc[0]
            a0 = LB[(LB.sym == sym) & (LB.line == q) & (LB.arm == "A0")].iloc[0]
            r = g.iloc[0]
            picks[q] = {"arm": r.arm, "qlike": round(float(r.qlike), 4), "rank": int(r["rank"]), "of": int(r.n_arms),
                        "best_overall": best.arm, "best_qlike": round(float(best.qlike), 4), "live_qlike": round(float(a0.qlike), 4)}
        # OC gets its own calc (2026-11-23, owner: Jordan's "different KPI for close levels" = a different calc):
        # the site-computable winner of the OC QLIKE race (oc_race.csv, futures 2020 -> 2026-08), not the OH model
        oc = OCR[OCR.sym == sym].sort_values("oc_qlike")
        g = oc[~oc.arm.isin(NO_SITE)]
        r, best, a0 = g.iloc[0], oc.iloc[0], oc[oc.arm == "A0"].iloc[0]
        picks["oc"] = {"arm": r.arm, "qlike": round(float(r.oc_qlike), 4), "rank": int(r["rank"]), "of": int(r.n),
                       "best_overall": best.arm, "best_qlike": round(float(best.oc_qlike), 4),
                       "live_qlike": round(float(a0.oc_qlike), 4), "oh_model": picks["oh"]["arm"]}
        for q in ("hl", "oh", "ol", "oc"):
            arm = picks[q]["arm"]
            if arm not in specs:
                specs[arm], sigs[arm] = spec_sigma(sym, arm, rows)
                if arm in ("R5", "SHAR", "HARCJ"):
                    needs.add("m5")
                if arm == "R15":
                    needs.add("m15")
            j = rf[[q]].join(sigs[arm].rename("s"), how="inner")
            ok = np.isfinite(j["s"]) & (j["s"] > 0) & np.isfinite(j[q])
            widths[q] = {str(t): float(V.fit_width_multiplier(j.loc[ok, "s"].to_numpy(), j.loc[ok, q].to_numpy(), t / 100))
                         for t in TAUS}
            # in-sample hit check of the line on futures, 2020+
            k = ok & (j.index >= "2020-01-01")
            picks[q]["hits_2020_26"] = [round(float((j.loc[k, q] > widths[q][str(t)] * j.loc[k, "s"]).mean() * 100), 1) for t in TAUS]
        z = V2.get(sym, {})
        out["instruments"][sym] = {
            "oanda": oanda, "d1_start": d1[0]["d"], "needs": sorted(needs), "lines": picks,
            "sigmas": specs, "widths": widths,
            "zone_sigma": z.get("zone_sigma", [0.175, 0.355]), "odds": z.get("odds"),
            "v2_arm": z.get("arm"),
        }
        print(sym, {q: (p["arm"], p["qlike"], p["live_qlike"], p["hits_2020_26"]) for q, p in picks.items()})
        # parity fixture: inputs before the last research session and each arm's Python sigma
        sess = max(s.dropna().index.max() for s in sigs.values())
        item = {"session": str(sess.date()), "sigma": {a: float(s.loc[sess]) for a, s in sigs.items()},
                "d1": [[b["d"], b["o"], b["h"], b["l"], b["c"]] for b in d1 if b["d"] < str(sess.date())]}
        if needs & {"m5", "m15"}:
            m = L.load_m1(sym, "C")
            m = m[(m.index >= pd.Timestamp(sess).tz_localize("UTC") - pd.Timedelta(days=45))
                  & (m.index < pd.Timestamp(sess).tz_localize("UTC") + pd.Timedelta(hours=12))]
            for k in (5, 15):
                if f"m{k}" in needs:
                    c = m["close"].resample(f"{k}min", label="left", closed="left").last().dropna()
                    item[f"m{k}"] = [[int(t.timestamp()), float(v)] for t, v in c.items()]
        fx["instruments"][sym] = item
    (ROOT / "js/ladderV2QlikeParams.json").write_text(json.dumps(out, indent=1))
    (ROOT / "js/ladderV2Qlike.fixture.json").write_text(json.dumps(fx))


if __name__ == "__main__":
    main()
