"""gold-rolling-mae-window (copied from gold-line-target-stop/widths.py, all six line families + sigma): build and cache the walk-forward shadow (N7_ALL) OH/OL widths at P50/75/90 for every NT8
future of the QLIKE export. Same build as calc-upgrades-wide (IV regressor only where an IV index exists).

    python scripts/gold-line-target-stop/widths.py [SYM ...]   -> analysis/output/gold-rolling-mae-window/widths/F_<SYM>.parquet
"""
from __future__ import annotations

import importlib.util
import json
import sys
import traceback
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/gold-rolling-mae-window/widths"
PARAMS = ROOT / "js/ladderV2QlikeParams.json"
LINES = ("hl", "oh", "ol", "oc", "cup", "cdn")
NEW = ["N1_HARQ", "N2_QL_HARCJ", "N3_SESS", "N4_FRESH", "N5_RR", "N6_HARCJ_IV", "N7_ALL"]
IV = {"NQ": "VXN", "SPX500": "VIX", "US30": "VXD", "US2000": "RVX", "SILVER": "VXSLV", "WTI": "OVX", "GOLD": "GVZ"}


def load_gold():
    sp = importlib.util.spec_from_file_location("gold_up", ROOT / "scripts/gold-calc-upgrades/score.py")
    G = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(G)
    return G


def build(sym):
    try:
        G = load_gold()
        if sym != "GOLD":                                   # the calc-upgrades-wide setup, verbatim in effect
            P = json.loads(PARAMS.read_text())["instruments"][sym]
            G.SYM = sym
            G.BUILD = G.RF.bdir(sym)
            G.BASE = {"F": {q: P["lines"][q]["arm"] for q in LINES}}
            ivc = IV.get(sym)
            G.TESTED = [a for a in NEW if ivc or a != "N6_HARCJ_IV"]
            real_iv, orig_design = G.L.iv_series, G.design

            def iv_series(code):
                return real_iv(ivc) if ivc else pd.Series(20.0, index=pd.date_range("2005-01-01", "2026-12-31", freq="D"))

            def design(F, iv):
                X, nxt = orig_design(F, iv)
                if not ivc:
                    X.pop("N6_HARCJ_IV")
                    f, y, how = X["N7_ALL"]
                    X["N7_ALL"] = (f.drop(columns="iv"), y, how)
                return X, nxt

            G.L.iv_series, G.design = iv_series, design
        T, Q, masks, test, _ = G.run("F")
        rec = {"date": pd.to_datetime(T["date"]).to_numpy()[test], "year": T["year"].to_numpy()[test]}
        rec["sig"] = T["N7_ALL"].to_numpy(float)[test]
        for q in ("oh", "ol", "hl", "cup", "cdn"):
            _, lvl = G.hits_and_gap(T, "N7_ALL", test, masks[q], q)
            for t in (50, 75, 90):
                rec[f"{q}{t}"] = lvl[t][test]
        OUT.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(rec).to_parquet(OUT / f"F_{sym}.parquet")
        return sym, True, " | ".join(x.strip() for x in G.LOG)
    except BaseException as e:  # noqa: BLE001
        return sym, False, f"{type(e).__name__}: {e}\n{traceback.format_exc()[-1200:]}"


if __name__ == "__main__":
    syms = sys.argv[1:] or list(json.loads(PARAMS.read_text())["instruments"])
    syms = [s for s in syms if not (OUT / f"F_{s}.parquet").exists()]
    print(f"{len(syms)} to build: {syms}", flush=True)
    with ProcessPoolExecutor(max_workers=4) as ex:
        for sym, ok, msg in ex.map(build, syms):
            print(f"{sym}: {'OK' if ok else 'FAILED'} {msg}", flush=True)
