"""Params for the SHADOW "pre-open" ladder (gold-calc-upgrades / calc-upgrades-wide). Not live.

    python scripts/calc-upgrades-wide/build_params.py  -> js/ladderPreopenParams.json, js/ladderPreopen.fixture.json

Per (track, instrument) in SELECT: the chosen arm (N7_ALL or N4_FRESH) refit on every target day <= 2026-08-21, the
fixed HARQ mean the site uses in place of the expanding mean, widths per line (HL, OH, OL, OC, Close+, Close-) fitted on
that track's realised lines with this sigma (sessions <= 2026-08-21), and zones/odds copied from the live QLIKE params.
The fixture holds one recent session's 5-minute bars (+ IV closes) and the Python sigma, for js/ladderPreopen.test.mjs.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sp = importlib.util.spec_from_file_location("wide", ROOT / "scripts/calc-upgrades-wide/score.py")
W = importlib.util.module_from_spec(sp)
sp.loader.exec_module(W)
END = pd.Timestamp("2026-08-21")
LINES, TAUS = ("hl", "oh", "ol", "oc", "cup", "cdn"), (50, 75, 90)
TRACK = {"F": "fut", "C": "cfd"}
SELECT = json.loads((ROOT / "analysis/output/calc-upgrades-wide/select.json").read_text())   # [[track, sym, arm], ...]


def setup(sym, track):
    G = W.load_gold()
    P = json.loads(W.PARAMS[track].read_text())["instruments"][sym]
    G.SYM = sym
    G.BUILD = G.RF.bdir(sym) if track == "F" else G.RC.bdir(sym)
    ivc = W.IV.get(sym)
    return G, P, ivc


def main():
    out = {"study": "gold-calc-upgrades + calc-upgrades-wide", "research_window_end": "2026-08-21",
           "note": "SHADOW pre-open ladder: HAR-CJ + the hour before the London open (+ implied vol where an index exists); "
                   "built after 00:00 London. Not live.", "fut": {}, "cfd": {}}
    fx = {"fut": {}, "cfd": {}}
    for track, sym, arm in SELECT:
        G, P, ivc = setup(sym, track)
        F, b = G.features(track)
        iv = G.L.iv_series(ivc) if ivc else pd.Series(20.0, index=pd.date_range("2005-01-01", "2026-12-31", freq="D"))
        X, nxt = G.design(F, iv)
        Xf, y, how = X[arm]
        if not ivc and "iv" in Xf:
            Xf = Xf.drop(columns="iv")
        cols = list(Xf.columns)
        ok = np.isfinite(Xf).all(axis=1) & np.isfinite(y) & (nxt <= END)
        coef, s2 = G.fit(Xf[ok].to_numpy(), y[ok].to_numpy(), how)
        rv = F["rv"]
        q = np.sqrt(F["rq"]) / rv
        qmean = float(q[nxt <= END].mean())
        # the site uses a fixed HARQ mean: rebuild the cq column with it so widths and the fixture match the site exactly
        if "cq" in cols:
            Xf = Xf.copy()
            Xf["cq"] = Xf["c1"] * (q - qmean)
        A = np.column_stack([np.ones(len(Xf)), Xf.to_numpy()])
        sig = pd.Series(np.sqrt(np.exp(A @ coef + s2 / 2)) * 100, index=Xf.index).dropna()
        rows = pd.read_parquet(ROOT / G.BUILD / f"rows_{track}.parquet").set_index("date")
        rows = rows[rows.index <= END]
        R = (G.RF.realised_f(sym) if track == "F" else G.RC.realised(sym)).reindex(rows.index)
        so = R["soc"]
        xs = {"hl": R["hl"], "oh": R["oh"], "ol": R["ol"], "oc": so.abs(), "cup": so.where(so > 0), "cdn": (-so).where(so < 0)}
        s_sess = pd.Series(G.L.asof_before(pd.DatetimeIndex(rows.index), sig), index=rows.index)
        widths, hits = {}, {}
        for ln in LINES:
            j = pd.DataFrame({"x": xs[ln], "s": s_sess})
            k = np.isfinite(j.s) & (j.s > 0) & np.isfinite(j.x) & (j.x > 0)
            widths[ln] = {str(t): float(G.L.V.fit_width_multiplier(j.s[k].to_numpy(), j.x[k].to_numpy(), t / 100)) for t in TAUS}
            kk = k & (j.index >= "2020-01-01")
            hits[ln] = [round(float((j.x[kk] > widths[ln][str(t)] * j.s[kk]).mean() * 100), 1) for t in TAUS]
        out[TRACK[track]][sym] = {
            "oanda": P["oanda"], "arm": arm, "iv": ivc, "cols": cols, "coef": [float(c) for c in coef], "s2": float(s2), "fresh_floor": G.FRESH_FLOOR,
            "qmean": qmean, "widths": widths, "hits_2020_26": hits,
            "zone_sigma": P.get("zone_sigma", [0.175, 0.355]), "odds": P.get("odds"),
        }
        # fixture: the last session <= END with a sigma; 45 days of 5-minute bars up to that session's London midnight
        sess = s_sess.dropna().index.max()
        t_row = sig.index[sig.index < sess].max()
        m = G.L.load_m1(sym, track, "ratio")
        lo = pd.Timestamp(sess).tz_localize("Europe/London").tz_convert("UTC")
        m = m[(m.index >= lo - pd.Timedelta(days=45)) & (m.index < lo)]
        o5 = m.resample("5min", label="left", closed="left").agg({"high": "max", "low": "min", "close": "last"}).dropna()
        fx[TRACK[track]][sym] = {"session": str(sess.date()), "asof": str(t_row.date()), "sigma": float(sig.loc[t_row]),
                                 "m5": [[int(t.timestamp()), float(r.high), float(r.low), float(r.close)] for t, r in o5.iterrows()],
                                 "iv": ([[str(d.date()), float(v)] for d, v in iv[(iv.index < sess) & (iv.index >= sess - pd.Timedelta(days=20))].items()]
                                        if ivc else None)}
        print(track, sym, arm, "hits", {k: v for k, v in hits.items() if k in ("hl", "cup", "cdn")}, "fixture", sess.date(), flush=True)
    (ROOT / "js/ladderPreopenParams.json").write_text(json.dumps(out, indent=1))
    (ROOT / "js/ladderPreopen.fixture.json").write_text(json.dumps(fx))


if __name__ == "__main__":
    main()
