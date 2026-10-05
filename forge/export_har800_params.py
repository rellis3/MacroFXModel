"""HAR-800 shadow ladder params (forge/LADDER_CALIBRATION_PREREG.md, variant 2 — the preferred candidate).

Widths are the quantiles of realised ÷ sigma for ONE sigma series, so they are fitted on exactly the sigma the live
`f.harLog` shadow computes: forecastSigma(last 800 NY-close daily bars, 'har_rv_log') (JS, scripts/rangebook/
har800_sigma.mjs, on bars from scripts/rangebook/ny_close_d1.mjs). Realised = London 00-22 session H-L / |O-C| / O-H /
O-L. No event multipliers (as tested). Fitted on ALL available sessions — the forward test on the shadow screen is the
out-of-sample check from here on; the pre-registered split result is in the prereg.

Writes js/forecastLadderParamsHar800.js — a NEW, separate file. The live ladder params are not touched.
    python -m forge.export_har800_params
"""
from __future__ import annotations

import json
import subprocess
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.export_iv_adjusted_params import realised
from forge.run_combined_range import asof_before

D1J = Path("analysis/output/ladder_candidates/d1")
OUT_JS = Path("js/forecastLadderParamsHar800.js")
FX = ["AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "CADCHF", "CADJPY", "CHFJPY", "EURAUD", "EURCAD", "EURCHF",
      "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD", "NZDCAD",
      "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]
# live forecaster name -> M1 file key. Indices: live sigma comes from Yahoo bars (preferYahoo), not OANDA, so their
# widths are flagged provisional.
KEYS = {**{n: n.lower() for n in FX}, "GOLD": "gold", "NQ": "nq", "SPX500": "spx500", "US30": "us30",
        "US2000": "us2000", "DE30": "de30", "UK100": "uk100"}
INDICES = {"NQ", "SPX500", "US30", "US2000", "DE30", "UK100"}
QUANT, TAUS = ("hl", "oc", "oh", "ol"), (0.50, 0.75, 0.90)


def main():
    subprocess.run(["node", "scripts/rangebook/ny_close_d1.mjs", *(f"{n}:{k}" for n, k in KEYS.items())], check=True)
    subprocess.run(["node", "scripts/rangebook/har800_sigma.mjs"], check=True)
    pairs = {}
    for name, key in KEYS.items():
        h = pd.read_csv(D1J / f"{name}_har800.csv", parse_dates=["date"]).set_index("date")["sig"]
        r = realised(name)
        D = pd.DatetimeIndex(r["date"])
        s = asof_before(D, h.dropna()) / V.SQRT252            # daily sigma, %
        ok = np.isfinite(s) & (s > 0) & (r["hl"].to_numpy() > 0)
        r, s = r[ok], s[ok]
        width = {q: [round(V.fit_width_multiplier(s, r[q].to_numpy(), t), 4) for t in TAUS] for q in QUANT}
        exc = {f"{q}_p{int(t*100)}": round(float((r[q].to_numpy() > m * s).mean()), 4)
               for q in QUANT for t, m in zip(TAUS, width[q])}
        pairs[name] = {"estimator": "har_rv_log", "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
                       "width": width, "in_sample_exceed": exc, "n": int(len(r)),
                       "fit_from": str(r["date"].min().date()), "fit_to": str(r["date"].max().date()),
                       **({"provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"}
                          if name in INDICES else {})}
        print(f"{name:7} n={len(r)} hl={width['hl']}", flush=True)
    for a, b in (("SPX", "SPX500"), ("DOW", "US30")):           # the fitted-key names other modules use
        pairs[a] = pairs[b]
    params = {"generated": str(date.today()), "source": "forge/export_har800_params.py",
              "evidence": "forge/LADDER_CALIBRATION_PREREG.md (variant 2, Amendment 2 rerun)",
              "rungs": ["p50", "p75", "p90"], "pairs": pairs}
    OUT_JS.write_text(
        "/**\n * HAR-800 SHADOW ladder params — GENERATED, do not hand-edit.  python -m forge.export_har800_params\n"
        " * Side-by-side candidate only: read by js/harShadowCore.js for har-shadow.html. The live ladder\n"
        " * (js/forecastLadderParams.js) is untouched. Widths are quantiles of realised ÷ σ for the σ the live\n"
        " * `f.harLog` shadow computes (HAR-log on the last 800 NY-close daily bars); no event multipliers.\n */\n"
        f"export const HAR800_PARAMS = {json.dumps(params, indent=1)};\n", encoding="utf-8")
    print(f"wrote {OUT_JS} ({len(KEYS)} instruments)")


if __name__ == "__main__":
    main()
