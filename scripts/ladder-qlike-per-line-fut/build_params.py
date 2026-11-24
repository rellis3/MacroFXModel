"""ladder-qlike-per-line-fut: ADD the new futures to the futures QLIKE per-line export, each line its own calc.

    python scripts/ladder-qlike-per-line-fut/build_params.py [--full-fixture]
      -> js/ladderV2QlikeParams.json   (the four existing futures NQ/GOLD/EURUSD/USDJPY are copied through UNTOUCHED)
      -> js/ladderV2Qlike.fixture.json (existing items kept; new items added for parity)

Per new contract with an OANDA twin: each line's calc = the site-computable arm with the lowest out-of-sample QLIKE on the
futures (race.py leaderboard, 2020 -> 2026-08). As the existing futures export: sigma computed on the OANDA twin
(spec from the twin's CFD build), widths fitted on the FUTURES' own realised lines (Close+ on up-close sessions,
Close- on down-close sessions), every session <= 2026-08-21.
"""
from __future__ import annotations

import importlib.util
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


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FR = _load("fut_race", "scripts/ladder-qlike-per-line-fut/race.py")
CB = _load("cfd_build", "scripts/ladder-qlike-per-line-cfd/build_params.py")   # spec_sigma on the CFD twin's build

OUT = ROOT / "analysis/output/ladder-qlike-per-line-fut"
LINES, TAUS = ("hl", "oh", "ol", "oc", "cup", "cdn"), (50, 75, 90)
END = pd.Timestamp("2026-08-21")
KEEP = {"NQ", "GOLD", "EURUSD", "USDJPY"}                  # base already on the site: never overwritten
FIXTURE_NEW = {"SPX500", "USDCAD", "WTI"}                  # committed parity items (all new ones are checked at build)


def main(full_fixture=False):
    LB = pd.read_csv(OUT / "leaderboard.csv")
    res = json.loads((OUT / "results.json").read_text())
    V2 = json.loads((ROOT / "js/ladderV2Params.json").read_text())["instruments"]
    P = json.loads((ROOT / "js/ladderV2QlikeParams.json").read_text())
    FX = json.loads((ROOT / "js/ladderV2Qlike.fixture.json").read_text())
    added, skipped = [], {}
    for sym in sorted(LB.sym.unique()):
        if sym in KEEP:
            continue
        oanda = (V2.get(sym) or {}).get("oanda")
        crow = ROOT / CB.RC.bdir(sym) / "rows_C.parquet"
        if sym in res.get("dropped", []) or not oanda or not crow.exists():
            skipped[sym] = "dropped" if sym in res.get("dropped", []) else "no OANDA twin / CFD build"
            continue
        rows = pd.read_parquet(crow).set_index("date")
        rows = rows[rows.index <= END]
        rf = pd.read_parquet(ROOT / FR.bdir(sym) / "rows_F.parquet").set_index("date")
        rf = rf[rf.index <= END]
        so = FR.realised_f(sym)["soc"].reindex(rf.index)
        rf = rf.assign(cup=so.where(so > 0), cdn=(-so).where(so < 0))
        d1 = json.loads((ROOT / CB.RC.bdir(sym) / f"d1/{sym}_C.json").read_text())
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
                specs[arm], sigs[arm] = CB.spec_sigma(sym, arm, rows)
                if arm in ("R5", "SHAR", "HARCJ"):
                    needs.add("m5")
                if arm == "R15":
                    needs.add("m15")
            j = rf[[q]].join(sigs[arm].rename("s"), how="inner")
            ok = np.isfinite(j["s"]) & (j["s"] > 0) & np.isfinite(j[q]) & (j[q] > 0)
            widths[q] = {str(t): float(V.fit_width_multiplier(j.loc[ok, "s"].to_numpy(), j.loc[ok, q].to_numpy(), t / 100))
                         for t in TAUS}
            k = ok & (j.index >= "2020-01-01")
            picks[q]["hits_2020_26"] = [round(float((j.loc[k, q] > widths[q][str(t)] * j.loc[k, "s"]).mean() * 100), 1) for t in TAUS]
        z = V2.get(sym, {})
        P["instruments"][sym] = {
            "oanda": oanda, "future": L.SYMS[sym]["f"], "d1_start": d1[0]["d"], "needs": sorted(needs), "lines": picks,
            "sigmas": specs, "widths": widths, "zone_sigma": z.get("zone_sigma", [0.175, 0.355]), "odds": z.get("odds"),
            "v2_arm": z.get("arm"), "added_by": "ladder-qlike-per-line-fut", "vs_live_pct": round(res["per_sym"].get(sym, float("nan")), 2),
        }
        added.append(sym)
        print(sym, L.SYMS[sym]["f"], {q: (p["arm"], p["hits_2020_26"]) for q, p in picks.items()}, flush=True)
        if full_fixture or sym in FIXTURE_NEW:
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
            FX["instruments"][sym] = item
    P["note"] = (P.get("note", "") + " | 2026-11-24 ladder-qlike-per-line-fut added " + ", ".join(added)
                 + f" (verdict {res['verdict']}); the original four are unchanged")
    P["added_fut_verdict"] = res["verdict"]
    (ROOT / "js/ladderV2QlikeParams.json").write_text(json.dumps(P, indent=1))
    (ROOT / "js/ladderV2Qlike.fixture.json").write_text(json.dumps(FX))
    print("added:", added, "\nskipped:", skipped)


if __name__ == "__main__":
    main("--full-fixture" in sys.argv)
