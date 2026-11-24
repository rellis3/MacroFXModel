"""ladder-event-layer-cb-fomc (forge/LADDER_EVENT_LAYER_CB_FOMC_PREREG.md, pushed 770a99a1): fit layer 2.

    python scripts/ladder-event-layer-cb-fomc/fit_layer.py
      -> js/ladderV2EventLayerCfdParams.json  (its own file; the base params are not touched)
      -> analysis/output/ladder-event-layer-cb-fomc/insample.json  (walk-forward, IN-SAMPLE: design chosen after seeing it)

m_tau = k_tau,b / k_tau, k_tau,b = (n_b q_tau(x/sigma | b) + 10 k_tau) / (n_b + 10), 2018 -> 2026-08-21, on each line's
site calc (the arm in js/ladderV2QlikeCfdParams.json). Buckets CB (own-currency central bank) and FOMC only.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
sys.path.insert(0, str(ROOT / "scripts/ladder-exhaustion-events"))
import ladder as L  # noqa: E402
import events as EV  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


RC = _load("cfd_race", "scripts/ladder-qlike-per-line-cfd/race.py")
XR = _load("exh_race", "scripts/ladder-exhaustion-events/race.py")
XR.BUCKETS, XR.SHRINK = ["CB", "FOMC"], 10          # layer 2 = these two buckets only, shrink 10 (prereg)
SHRINK, LAYER = 10, ("CB", "FOMC")
TAUS = (0.50, 0.75, 0.90)
LINES = ("hl", "oh", "ol", "cup", "cdn")
OUT = ROOT / "analysis/output/ladder-event-layer-cb-fomc"
SITE = json.loads((ROOT / "js/ladderV2QlikeCfdParams.json").read_text())["instruments"]
_E = None


def layer_tags(sym, dates):
    t = EV.tags(sym, dates, _E)
    return np.where(np.isin(t, LAYER), t, np.where(t == "unknown", "unknown", "none")).astype(object)


def run(sym):
    global _E
    if _E is None:
        _E = EV.load_events()
    os.environ["LADDER_OUT"] = RC.bdir(sym)
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / os.environ["LADDER_OUT"] / "rows_C.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    T = L.walk_forward(S, sym, "C", arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    R = RC.realised(sym).reindex(pd.to_datetime(T["date"]))
    so = R["soc"].to_numpy()
    T["cup"] = np.where(so > 0, so, np.nan)
    T["cdn"] = np.where(so < 0, -so, np.nan)
    ok = np.ones(len(T), bool)
    for q in ("hl", "oh", "ol"):
        ok &= T[q].to_numpy() > 0
    masks = {"hl": ok, "oh": ok, "ol": ok, "cup": ok & (so > 0), "cdn": ok & (so < 0)}
    yrs = T["year"].to_numpy()
    tag = layer_tags(sym, T["date"])
    known = tag != "unknown"
    site = [a for a in arms if a not in RC.NO_SITE]
    P = {"lines": {}}
    ins = {"date": T["date"].dt.strftime("%Y-%m-%d").to_numpy(), "tag": tag}
    for q in LINES:
        m = masks[q]
        arm = SITE[sym]["lines"][q]["arm"]
        x, sig = T[q].to_numpy(), T[arm].to_numpy(float)
        r = x / sig
        okr = m & known & np.isfinite(r) & (r > 0) & (yrs >= 2018)
        k = np.quantile(r[okr], TAUS)
        mult, nn = {}, {}
        for b in LAYER:
            mm = okr & (tag == b)
            n = int(mm.sum())
            kb = k if n == 0 else (n * np.quantile(r[mm], TAUS) + SHRINK * k) / (n + SHRINK)
            mult[b] = {str(int(t * 100)): round(float(kb[j] / k[j]), 4) for j, t in enumerate(TAUS)}
            nn[b] = n
        P["lines"][q] = {"arm": arm, "mult": mult, "n": nn}
        # in-sample walk-forward (descriptive): QLIKE walk-forward pick, layer vs base
        Q = {(a, q): RC.qlike(T, RC.h_series(T, T[a].to_numpy(float), q, m), q, m) for a in site}
        sel, _ = RC.wf_pick(T, Q, site, m, q)
        base, lay, lv = XR.layered(T, sel, q, m, tag, known)
        test = m & (yrs >= 2020)
        ins[f"base_{q}"] = np.where(test, base, np.nan)
        ins[f"ev_{q}"] = np.where(test, lay, np.nan)
    pd.DataFrame(ins).to_parquet(OUT / f"insample_{sym}.parquet")
    P["ccys"] = sorted(EV.instrument_ccys(sym))
    return sym, P


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    syms = sorted(SITE)
    res = {}
    with ProcessPoolExecutor(max_workers=4) as ex:
        for sym, P in ex.map(run, syms):
            res[sym] = P
            print(sym, {q: (v["arm"], v["mult"]["CB"]["50"], v["mult"]["FOMC"]["50"]) for q, v in P["lines"].items()}, flush=True)
    doc = {"study": "ladder-event-layer-cb-fomc", "prereg": "forge/LADDER_EVENT_LAYER_CB_FOMC_PREREG.md",
           "layer": 2, "base": "js/ladderV2QlikeCfdParams.json", "buckets": list(LAYER), "shrink": SHRINK,
           "fit": "2018 -> 2026-08-21, each line's site calc", "rule": "level = base level x mult on an FOMC day or a "
           "decision day of one of the instrument's own central banks (CB wins if both); x1 every other day",
           "verdict": "pending", "instruments": res}
    (ROOT / "js/ladderV2EventLayerCfdParams.json").write_text(json.dumps(doc, indent=1))
    # in-sample summary (descriptive)
    cells, by = [], {b: [] for b in LAYER}
    for s in syms:
        f = pd.read_parquet(OUT / f"insample_{s}.parquet")
        for q in LINES:
            mk = f[f"ev_{q}"].notna() & f[f"base_{q}"].notna()
            cells.append(f.loc[mk, f"ev_{q}"].sum() / f.loc[mk, f"base_{q}"].sum() - 1)
            for b in LAYER:
                mb = mk & (f["tag"] == b)
                if mb.any():
                    by[b].append(f.loc[mb, f"ev_{q}"].sum() / f.loc[mb, f"base_{q}"].sum() - 1)
    summ = {"all_sessions": float(np.mean(cells) * 100), **{f"{b}_days": float(np.mean(v) * 100) for b, v in by.items()}}
    (OUT / "insample.json").write_text(json.dumps(summ, indent=1))
    print("IN-SAMPLE walk-forward (descriptive):", summ)


if __name__ == "__main__":
    main()
