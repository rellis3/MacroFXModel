"""vol-layer-state-confirm, step 0.1: rebuild the layer-1 session table 2016-10-24 -> 2026-08-20.

Prereg: forge/VOL_LAYER_STATE_CONFIRM_PREREG.md. Same code as scripts/vol-layer-deep/state.py (imported, only the window
end is moved), quarterly expanding refits, M1 cut at the end of 2026-08-20 London (the lockbox starts 2026-08-21).
Adds pit_sig_used beside live_sig_used. Then checks every session <= 2022-12-30 against the discovery table
analysis/output/vol-layer-deep/state/sessions.parquet (max relative difference 1e-9 on rv5, F1-F5).

Reads data from DATA_ROOT (the main checkout); writes only under this worktree.

    python -X utf8 scripts/vol-layer-state-confirm/build.py          -> analysis/output/vol-layer-state-confirm/build/sessions.parquet
    python -X utf8 scripts/vol-layer-state-confirm/build.py check    -> discovery/step0_build.json
"""
from __future__ import annotations

import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

WT = Path(__file__).resolve().parents[2]
DATA_ROOT = Path("c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
sys.path[:0] = [str(WT), str(WT / "scripts/forecast_history"), str(WT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import state as ST  # noqa: E402

END = "2026-08-20"
ST.END = END
ST.HIST = DATA_ROOT / "analysis/output/forecast_history"
ST.BA = DATA_ROOT / "data/m1_bidask"
OUT = WT / "analysis/output/vol-layer-state-confirm"
BUILD = OUT / "build"
DISC = DATA_ROOT / "analysis/output/vol-layer-deep/state/sessions.parquet"


def one(sym):
    t0 = time.time()
    S, fits = ST.build_one(sym)
    pit = pd.read_csv(ST.HIST / f"{sym}.csv", usecols=["date", "pit_sig_used", "last_min"])
    S = S.merge(pit, on="date", how="left")
    assert S.date.max() <= END
    print(sym, len(S), f"{time.time() - t0:.0f}s", flush=True)
    return S, fits


def build():
    BUILD.mkdir(parents=True, exist_ok=True)
    syms = ST.instruments()
    assert len(syms) == 34, syms
    with Pool(6) as p:
        res = p.map(one, syms)
    D = pd.concat([r[0] for r in res], ignore_index=True)
    assert D.date.max() <= END and D.date.min() >= ST.START
    D.to_parquet(BUILD / "sessions.parquet", index=False)
    (BUILD / "fits.json").write_text(json.dumps({s: r[1] for s, r in zip(syms, res)}), encoding="utf-8")
    print("rows", len(D))


def check():
    A = pd.read_parquet(BUILD / "sessions.parquet")
    B = pd.read_parquet(DISC)
    A = A[A.date <= "2022-12-30"]
    m = B.merge(A, on=["inst", "date"], how="outer", suffixes=("_d", "_n"), indicator=True)
    out = {"rows_disc": int(len(B)), "rows_new_le_2022": int(len(A)), "only_disc": int((m._merge == "left_only").sum()),
           "only_new": int((m._merge == "right_only").sum()), "fields": {}}
    m = m[m._merge == "both"]
    ok = out["only_disc"] == 0 and out["only_new"] == 0
    for c in ["rv5", "F1", "F2", "F3", "F4", "F5", "har1", "garch_vt", "rq", "hl"]:
        a, b = m[f"{c}_n"].to_numpy(float), m[f"{c}_d"].to_numpy(float)
        nan_mismatch = int((np.isnan(a) != np.isnan(b)).sum())
        k = np.isfinite(a) & np.isfinite(b)
        rel = np.abs(a[k] - b[k]) / np.maximum(np.abs(b[k]), 1e-12)
        mx = float(rel.max()) if k.any() else 0.0
        out["fields"][c] = {"max_rel_diff": mx, "nan_mismatch": nan_mismatch}
        if c in ("rv5", "F1", "F2", "F3", "F4", "F5"):
            ok &= mx <= 1e-9 and nan_mismatch == 0
    out["pass"] = bool(ok)
    (OUT / "discovery").mkdir(parents=True, exist_ok=True)
    (OUT / "discovery/step0_build.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "check":
        check()
    elif len(sys.argv) > 1 and sys.argv[1] == "one":
        S, _ = one(sys.argv[2])
        print(S.tail(3)[["date", "rv5", "F2", "F4", "F5", "pit_sig_used"]])
    else:
        build()
