"""Freeze the ladder-v2 shadow calc's fixed parts for the site (js/ladderV2Shadow.js), plus a parity fixture.

    python scripts/ladder-v2/build_params.py   -> js/ladderV2Params.json, js/ladderV2Shadow.fixture.json

Fixed parts (fitted on the research window, sessions <= 2026-08-21):
  - HAR-CJ regression coefficients + residual variance (GOLD, EURUSD; fitted on OANDA 5-min RV, as banked)
  - width multipliers (quantile of realised / sigma) per quantity x rung, per track
      NQ      har_rv_log, CFD widths; futures reuse them (ladder-v2-nq-cvf: same distribution)
      EURUSD  HAR-CJ, CFD widths; 6E reuses them (ladder-v2-eurusd-cvf: same)
      GOLD    CFD: HAR-CJ widths.  FUT: the SAME spot HAR-CJ sigma with widths re-fitted on CME GC realised ranges
              (the banked GC winner, HAR-RV 5-min on GC, needs NT8 data the site doesn't have; spot features with GC
              coefficients run ~1% low, median |diff| 1.1%, p90 3.8%, so the widths absorb the difference instead)
  - exhaustion zones (median / 75th run-past before a 0.25 sigma pullback, sigma units) and next-line odds by London
    time bucket (as scripts/ladder-v2/export_exhaustion.py)
The daily parts (today's sigma from OANDA bars) are computed on the server.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import export_shadow as E  # noqa: E402
import export_exhaustion as X  # noqa: E402
from forge import vol as V  # noqa: E402

QS, TAUS = ("hl", "oc", "oh", "ol"), (50, 75, 90)
OANDA = {"NQ": "NAS100_USD", "GOLD": "XAU_USD", "EURUSD": "EUR_USD"}


def wdict(m):
    return {q: {str(t): float(m[(q, t)]) for t in TAUS} for q in QS}


def main():
    odds, zs = X.odds_tables(), X.zone_sigma()
    P = {"version": "ladder-v2-shadow-2026-11-19", "research_window_end": "2026-08-21",
         "buckets_london": ["00-07", "07-12", "12-16", "16-22"], "instruments": {}}
    # NQ
    rows = pd.read_parquet(ROOT / "analysis/output/ladder-v2-nq/rows_C.parquet").set_index("date")
    w = wdict(E.widths(rows, rows["E6"]))
    P["instruments"]["NQ"] = {"oanda": OANDA["NQ"], "arm": "har_rv_log", "har_start": "2016-01-04",
                              "cfd": {"widths": w}, "fut": {"widths": w, "note": "futures = CFD distribution"}}
    # GOLD, EURUSD (HAR-CJ)
    for sym in ("GOLD", "EURUSD"):
        coef, s2 = E.fit_coef(sym, "C", "HARCJ")
        rc = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/rows_C.parquet").set_index("date")
        sig_c = E.reg_sigma(rc, "HARCJ", coef, s2)
        cfd = {"widths": wdict(E.widths(rc, sig_c))}
        if sym == "GOLD":
            rf = pd.read_parquet(ROOT / "analysis/output/ladder-v2-gold/rows_F.parquet").set_index("date")
            j = rf[list(QS)].join(sig_c.rename("sig"), how="inner")
            fut = {"widths": wdict(E.widths(j, j["sig"])), "note": "spot HAR-CJ sigma, widths fitted on CME GC realised ranges"}
        else:
            fut = {"widths": cfd["widths"], "note": "futures = CFD distribution"}
        P["instruments"][sym] = {"oanda": OANDA[sym], "arm": "HARCJ", "coef": [float(c) for c in coef], "s2": float(s2),
                                 "cfd": cfd, "fut": fut}
    for sym in P["instruments"]:
        P["instruments"][sym]["zone_sigma"] = list(zs[sym])
        P["instruments"][sym]["odds"] = {str(t): [round(float(odds[(sym, t, b)]), 2) for b in range(4)] for t in TAUS}
    (ROOT / "js/ladderV2Params.json").write_text(json.dumps(P, indent=1))

    # parity fixture: inputs as the server will see them + the Python results for the latest session
    sess = pd.Timestamp.now(tz="Europe/London").normalize().tz_localize(None)
    while sess.dayofweek >= 5:
        sess += pd.Timedelta(days=1)
    fx = {"session": str(sess.date()), "instruments": {}}
    d = pd.read_parquet(E.DATA / "NQ_d1_recent.parquet")
    d = d[(d.index >= "2016-01-04") & (d.index.dayofweek < 5) & (d.index < sess)]
    nq = E.nq_block(sess)
    fx["instruments"]["NQ"] = {"d1": [[str(i.date()), r.open, r.high, r.low, r.close] for i, r in d.iterrows()],
                               "sigma": nq[0]}
    for sym in ("GOLD", "EURUSD"):
        m5 = pd.read_parquet(E.DATA / f"{sym}_m5_recent.parquet")
        m5 = m5[m5.index >= sess.tz_localize("UTC") - pd.Timedelta(days=45)]
        res = E.oanda_regression_block(sym, "HARCJ", sess)
        fx["instruments"][sym] = {"m5": [[int(t.timestamp()), float(c)] for t, c in m5["close"].items()], "sigma": res[0]}
    (ROOT / "js/ladderV2Shadow.fixture.json").write_text(json.dumps(fx))
    print("params + fixture written;", {k: round(v["sigma"], 6) for k, v in fx["instruments"].items()})


if __name__ == "__main__":
    main()
