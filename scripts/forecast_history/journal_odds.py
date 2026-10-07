"""Signal Journal odds tables (forge/SIGNAL_JOURNAL_PREREG.md): reach odds and exhaustion odds, from the chosen
forecast's walk-forward lines (lines_B, 2020-08 -> 2026-08) and the Step 0 hourly path. Writes js/signalJournalOdds.js.

    PYTHONPATH=. python scripts/forecast_history/journal_odds.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import H, complete, klass  # noqa: E402

BUCKETS = [("00-07", 1, 8), ("08-12", 9, 13), ("13-16", 14, 17), ("17-20", 18, 21), ("21-22", 22, 22)]   # by end-of-hour index k


def bucket(k):
    for name, a, b in BUCKETS:
        if a <= k <= b:
            return name
    return None


def main():
    X = pd.concat([pd.read_csv(f) for f in sorted(H.glob("*.csv"))], ignore_index=True)
    X = X[complete(X)]
    X = X.merge(pd.read_csv("analysis/output/forecast_fix/live_variant/lines_B.csv"), on=["inst", "date"])
    X["klass"] = X.inst.map(klass)
    reach, final = {}, {}
    for side, run, real, pre in (("up", "oh_h", "r_oh", "B_oh_"), ("dn", "ol_h", "r_ol", "B_ol_")):
        path = X[[f"{run}{k}" for k in range(1, 23)]].to_numpy()
        for frm, to in (("p50", "p75"), ("p75", "p90")):
            lv = X[pre + frm].to_numpy()[:, None]
            hit = path >= lv
            first = np.where(hit.any(axis=1), hit.argmax(axis=1) + 1, 0)            # end-of-hour index k of the first touch
            ok = first > 0
            went = (X[real] >= X[pre + to]).to_numpy()
            df = pd.DataFrame({"klass": X.klass[ok].to_numpy(), "b": [bucket(k) for k in first[ok]], "went": went[ok]})
            for (c, b), g in df.groupby(["klass", "b"]):
                d = reach.setdefault(c, {}).setdefault(f"{frm}_{to}", {}).setdefault(b, {"hits": 0, "n": 0})
                d["hits"] += int(g.went.sum()); d["n"] += int(len(g))
        # exhaustion: a new running extreme in hour k that stayed the day's final extreme
        fin = path >= (X[real].to_numpy()[:, None] - 1e-9)
        for k in range(2, 23):
            new = path[:, k - 1] > path[:, k - 2] + 1e-12
            df = pd.DataFrame({"klass": X.klass.to_numpy()[new], "final": fin[new, k - 1]})
            for c, g in df.groupby("klass"):
                d = final.setdefault(c, {}).setdefault(str(k - 1), {"hits": 0, "n": 0})            # London hour the extreme was made in
                d["hits"] += int(g.final.sum()); d["n"] += int(len(g))
    rd = lambda D: {k: (rd(v) if "hits" not in v else {"p": round(v["hits"] / v["n"], 3), "n": v["n"]}) for k, v in D.items()}
    out = {"generated": str(date.today()), "prereg": "forge/SIGNAL_JOURNAL_PREREG.md",
           "source": "chosen forecast walk-forward lines 2020-08 -> 2026-08, Step 0 hourly path; up and down pooled",
           "reach": rd(reach), "final": rd(final)}
    js = ("/**\n * Signal Journal odds (GENERATED — do not hand-edit). Regenerate: PYTHONPATH=. python scripts/forecast_history/journal_odds.py\n"
          " * reach[class][from_to][hourBucket] = share of first touches of the `from` rung that reached `to` by 22:00 London.\n"
          " * final[class][londonHour] = share of new day extremes made in that hour that stayed the day's final extreme.\n */\n"
          "export const JOURNAL_ODDS = " + json.dumps(out) + ";\n")
    Path("js/signalJournalOdds.js").write_text(js, encoding="utf-8")
    for c in sorted(out["reach"]):
        print(c, "p75->p90", {b: v["p"] for b, v in out["reach"][c]["p75_p90"].items()}, "| final", {h: out["final"][c][h]["p"] for h in ("7", "10", "14", "17", "20", "21")})


if __name__ == "__main__":
    main()
