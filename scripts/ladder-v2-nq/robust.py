"""ladder-v2-nq amendment A2 (POST-HOC, demote-only): 3-month blocks, leave-one-episode-out, flagged days out.

    python scripts/ladder-v2-nq/robust.py     -> analysis/output/ladder-v2-nq/{robust.json, robust.txt}

Reuses score.py's scorer on the saved walk-forward rows (test_{C,F}.parquet). Flags: analysis/output/data_screens/NQ.
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
spec = importlib.util.spec_from_file_location("score", Path(__file__).with_name("score.py"))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)
from forge.data_screens import input_hashes  # noqa: E402

OUT = S.OUT
S.BLOCK = 63
EPISODES = {"2018Q4": ("2018-10-01", "2018-12-31"), "covid": ("2020-02-19", "2020-06-30"),
            "bear2022": ("2022-01-01", "2022-12-31"), "tariff2025": ("2025-03-01", "2025-05-31")}
FAULT = {"gap", "frozen", "partial", "missing", "ts_dup", "ts_order", "ts_weekend", "round_trip", "roll_gap",
         "cvf_range", "cvf_open"}                                         # descriptive R3b: data-fault screens only


def run(T, label, rng):
    r = S.score_track(T.reset_index(drop=True), label, rng=rng, verbose=False)
    ci = r["chosen_minus_A0_ci90_reselected"]
    S.say(f"  {label:28} n={r['n']:5}  chosen {r['chosen']:3} {r['arms'][r['chosen']]['primary']:.2f} vs A0 "
          f"{r['arms']['A0']['primary']:.2f}  CI [{ci[0]:+.2f},{ci[1]:+.2f}]  halves " +
          " ".join(f"[{v['diff_ci90'][0]:+.2f},{v['diff_ci90'][1]:+.2f}]" for v in r["halves"].values()) +
          f"  E6 {r['arms']['E6']['primary']:.2f}")
    return {"n": r["n"], "chosen": r["chosen"], "chosen_primary": r["arms"][r["chosen"]]["primary"],
            "A0_primary": r["arms"]["A0"]["primary"], "E6_primary": r["arms"]["E6"]["primary"], "ci90": ci,
            "halves": {h: v["diff_ci90"] for h, v in r["halves"].items()}}


def main():
    rng = np.random.default_rng(S.SEED)
    flags = pd.read_csv(ROOT / "analysis/output/data_screens/NQ/flags.csv", parse_dates=["date"])
    out = {"seed": S.SEED, "block": S.BLOCK, "inputs": input_hashes(
        ["analysis/output/ladder-v2-nq/test_C.parquet", "analysis/output/ladder-v2-nq/test_F.parquet",
         "analysis/output/data_screens/NQ/flags.csv"])}
    for track in ("C", "F"):
        T = pd.read_parquet(OUT / f"test_{track}.parquet")
        S.say(f"\n== {track} (block {S.BLOCK})")
        res = {"R1": run(T, f"{track} R1 3-month blocks", rng)}
        r1 = res["R1"]
        ok = r1["ci90"][1] < 0 and all(v[1] < 0 for v in r1["halves"].values())
        res["R2"] = {}
        for e, (a, b) in EPISODES.items():
            m = (T["date"] >= a) & (T["date"] <= b)
            res["R2"][e] = run(T[~m], f"{track} R2 without {e}", rng)
            ok &= res["R2"][e]["ci90"][1] < 0
        fl = flags[flags["track"].isin([track, "CF"])]
        m = T["date"].isin(fl["date"])
        res["R3"] = run(T[~m], f"{track} R3 any flag out", rng)
        res["R3"]["dropped"] = int(m.sum())
        ok &= res["R3"]["ci90"][1] < 0
        m2 = T["date"].isin(fl.loc[fl["screen"].isin(FAULT), "date"])
        res["R3b_descriptive"] = run(T[~m2], f"{track} R3b fault flags out", rng)
        res["R3b_descriptive"]["dropped"] = int(m2.sum())
        res["verdict_after_A2"] = "VALIDATED" if ok else "UNDERPOWERED"
        S.say(f"  dropped: R3 {res['R3']['dropped']} sessions, R3b {res['R3b_descriptive']['dropped']}  "
              f"-> {track} verdict after A2: {res['verdict_after_A2']}")
        out[track] = res
    (OUT / "robust.json").write_text(json.dumps(out, indent=1))
    (OUT / "robust.txt").write_text("\n".join(S.LOG) + "\n")


if __name__ == "__main__":
    main()
