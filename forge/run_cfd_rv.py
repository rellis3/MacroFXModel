"""Step 2b — does the intraday gain need futures at all? See forge/FUTURES_VOL_PREREG.md (Step 2b).

    python -m forge.run_cfd_rv
Arms on the CFD session ranges: B0 live HAR (control), B2 futures 5-min-RV HAR, B4 = the SAME 5-min-RV HAR computed
from the CFD M1 bars. Also reports B2 vs B4 (does futures add anything beyond CFD intraday data).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from forge import vol as V
from forge import bars as B
from forge import run_futures_vol as F
from forge import run_futures_vs_cfd as S

ARMS = ["B0", "B2", "B4"]


def build(root: str) -> pd.DataFrame:
    fr = S.build_pair_frame(root)[["date", "hl_pct", "oc_pct", "oh_pct", "ol_pct", "sigma_B0", "sigma_B2"]]
    pair, data_root = S.PAIRS[root]
    m1 = B.load_m1(pair, data_root)
    d = m1.reset_index().rename(columns={m1.index.name or "index": "timestamp"})
    if "timestamp" not in d.columns:
        d = m1.copy(); d["timestamp"] = d.index; d = d.reset_index(drop=True)
    d["timestamp"] = pd.to_datetime(d["timestamp"], utc=True)
    daily = F.daily_from_bars(d[["timestamp", "open", "high", "low", "close", "volume"]]).replace([np.inf, -np.inf], np.nan)
    sig = pd.DataFrame({"date": daily.index, "sigma_B4": F.har_forecast(daily, {"har": ["rv5"]})})
    return fr.merge(sig, on="date", how="inner")


def main():
    scored = {}
    for root in F.PRIMARY:
        df = F.score_root(build(root), arms=ARMS, ctrl="B0")
        if not df.empty:
            scored[root] = df
            print(f"{root}: {len(df)} OOS sessions", flush=True)
    out = {"B4_vs_B0": F.summarize(scored, "B4 (CFD 5-min RV) vs B0 (live), CFD ranges", ARMS, "B0", "B4")}
    F.show(out["B4_vs_B0"])
    # B2 vs B4: swap control to B4
    out["B2_vs_B4"] = F.summarize(scored if False else {r: d.rename(columns={"loss_B4": "loss_B4", "loss_B0": "loss_B0"}) for r, d in scored.items()},
                                   "B2 (futures) vs B4 (CFD) — control=B4", ["B4", "B2"], "B4", "B2")
    F.show(out["B2_vs_B4"])
    (F.NT8 / "cfd_rv_results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
