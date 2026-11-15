"""Evidence pack for exit-on-fixed-entries (register row evidence-pack-retrofit; EXPLORATORY diagnostics only, the
banked verdict in RESULTS.md does not change).

Rebuilds the entries with the runner's OWN code (imports scripts/exit-on-fixed-entries/run.py: load_instrument, Inst,
build; same bid/ask M1, same lockbox cut), one instrument at a time to keep memory down, and scores the headline exit
E1 (hold while the slope agrees) exactly as score() defines it:

    D_L, D_S = (E1 - E0) on the long / short quote (R, spread on)
    Dr       = p * D_L + (1 - p) * D_S, p = the instrument's long share of slope entries   (the random-entry book)
    Delta    = mean over entries of (D_side - Dr), side = the 07:00 slope                   pass bar +0.05 R

Rows: one per entry; side = slope; outcome = D_L - D_S (what going long rather than short added under E1);
signal = slope (a two-state signal). Positive control: +bar added to the chosen side's D (Dr held fixed).
Canary: side = sign(D_L - D_S), i.e. the side the exit happened to favour. Cluster = entry date (the runner used
21-date blocks).

    python -X utf8 -I scripts/exit-on-fixed-entries/evidence.py
"""
from __future__ import annotations

import gc
import importlib.util
import os
import shutil
import sys
from datetime import date
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
for k in [k for k in os.environ if k.startswith("R2_")]:
    del os.environ[k]

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "evidence_pack"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pack import build_pack  # noqa: E402

spec = importlib.util.spec_from_file_location("efe_run", HERE / "run.py")
R = importlib.util.module_from_spec(spec)
sys.modules["efe_run"] = R
spec.loader.exec_module(R)

OUT = ROOT / "analysis" / "output" / "exit-on-fixed-entries"
EV = OUT / "evidence"
X = "E1"


def build_entries() -> pd.DataFrame:
    cache = EV / "entries_E1.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    fin = R.load_financing(R.INSTS)
    opts = {"roll": R.rollover_table(date(2005, 1, 1), R.LOCKBOX), "last_session": R.LOCKBOX, "financing": fin}
    parts = []
    for k in R.INSTS:
        print(f"building {k} ...", flush=True)
        inst = {k: R.Inst(k, R.load_instrument(ROOT / "data" / "m1_bidask" / f"{R.M1KEY[k]}_m1.parquet"))}
        df, _ = R.build(inst, opts)
        keep = ["inst", "date", "slope"] + [f"{e}_{s}q" for e in ("E0", X) for s in ("L", "S")]
        parts.append(df[keep])
        del inst, df
        gc.collect()
    df = pd.concat(parts, ignore_index=True).sort_values(["inst", "date"]).reset_index(drop=True)
    assert df["date"].max() <= R.LOCKBOX, "lockbox breach"
    EV.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache, index=False)
    return df


def delta_est(r) -> float:
    v = np.where(r["side"].to_numpy() > 0, r["D_L"].to_numpy(), r["D_S"].to_numpy()) - r["Dr"].to_numpy()
    return float(np.nanmean(v)) if len(v) else float("nan")


def plant(r, eff, rng):
    pos = r["side"].to_numpy() > 0
    return r.assign(D_L=r["D_L"] + np.where(pos, eff, 0.0), D_S=r["D_S"] + np.where(~pos, eff, 0.0))


def leak(r, rng):
    return r.assign(side=np.where(r["D_L"] >= r["D_S"], 1, -1), signal=np.where(r["D_L"] >= r["D_S"], 1, -1))


def main():
    df = build_entries()
    p = df.groupby("inst")["slope"].transform(lambda x: (x > 0).mean()).to_numpy()
    D_L = (df[f"{X}_Lq"] - df["E0_Lq"]).to_numpy()
    D_S = (df[f"{X}_Sq"] - df["E0_Sq"]).to_numpy()
    rows = pd.DataFrame({"date": pd.to_datetime(df["date"]), "inst": df["inst"], "signal": df["slope"].astype(int),
                         "side": df["slope"].astype(int), "D_L": D_L, "D_S": D_S, "Dr": p * D_L + (1 - p) * D_S,
                         "outcome": D_L - D_S})
    rows = rows[np.isfinite(rows["D_L"]) & np.isfinite(rows["D_S"])].reset_index(drop=True)
    tmp = EV / "_build_E1"
    pk = build_pack(rows, slug="exit-on-fixed-entries:E1", out=str(tmp), estimate_fn=delta_est, bar=R.BAR,
                    unit="R per entry (E1 - E0, slope minus random entries, spread on)", plant_fn=plant, leak_fn=leak,
                    verdict_word="NULL", signal_is_state=True, n_plants=30,
                    notes=("Entries rebuilt with the runner's own build() (one instrument at a time). Registered "
                           "E1 Delta +0.012 [-0.004, +0.029]. The pack bootstraps dates iid (runner: 21-date blocks "
                           "plus a 500-shift placebo whose SD floors the SE). Placebo here = slope sides shuffled "
                           "across dates within instrument. Buckets: outcome = D_L - D_S by slope state; a working "
                           "signal would show long-slope rows above zero and short-slope rows below."))
    dest = EV / "E1"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.move(str(tmp / "evidence"), str(dest))
    shutil.rmtree(tmp, ignore_errors=True)
    pc = {x["multiple_of_bar"]: x["detected_share"] for x in pk["positive_control"]}
    line = (f"E1: est {pk['estimate']:+.4f} CI [{pk['ci'][0]:+.4f}, {pk['ci'][1]:+.4f}] placebo pct "
            f"{pk['placebo']['real_percentile']:.0f} plant1x {pc[1.0]:.2f} halves "
            f"{[round(h['estimate'], 4) for h in pk['by_half']]} canary {pk['lookahead_canary']['estimate_with_leak']:+.3f}"
            f" -> {pk['diagnosis']['label']}")
    print(line, flush=True)
    (EV / "summary.txt").write_text(line + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
