"""Percentile tables from touches.parquet (build.py): MFE / MAE per touch, fade frame and continue frame.

Writes analysis/output/line-touch-mae-futures/tables/*.csv:
  by_touch.csv    instrument x kind x line x touch number (1, 2, 3, 4 = 4th or later)
  by_weekday.csv  instrument x kind x weekday (1 = Mon ... 5 = Fri)
  by_hour.csv     instrument x kind x London hour of the touch
Each row: n, and p25 / p50 / p75 / p90 of fade MFE (= back), fade MAE (= through) per horizon, plus back_wins_pct =
share of touches where the move back toward the open beat the move through the line. Continue MFE/MAE are the same
two numbers swapped. Units as in meta.json (NQ points, 6E pips, GC dollars).

    python -I scripts/line-touch-mae-futures/summarize.py
"""
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "analysis/output/line-touch-mae-futures"
HS = ["30m", "60m", "240m", "eod"]
QS = (0.25, 0.5, 0.75, 0.9)


def table(t, by):
    g = t.groupby(by)
    r = g.size().rename("n").to_frame()
    for h in HS:
        for src, lab in ((f"back_{h}", "fadeMFE"), (f"through_{h}", "fadeMAE")):
            for q in QS:
                r[f"{lab}_{h}_p{int(q * 100)}"] = g[src].quantile(q).round(2)
        r[f"back_wins_pct_{h}"] = g.apply(lambda x, h=h: (x[f"back_{h}"] > x[f"through_{h}"]).mean() * 100).round(1)
    return r.reset_index()


def main():
    t = pd.read_parquet(OUT / "touches.parquet")
    t["touch"] = t["touch_n"].clip(upper=4)
    (OUT / "tables").mkdir(exist_ok=True)
    table(t, ["instrument", "kind", "line", "touch"]).to_csv(OUT / "tables/by_touch.csv", index=False)
    table(t, ["instrument", "kind", "weekday"]).to_csv(OUT / "tables/by_weekday.csv", index=False)
    table(t, ["instrument", "kind", "lon_hour"]).to_csv(OUT / "tables/by_hour.csv", index=False)
    print("written", list((OUT / "tables").glob("*.csv")))


if __name__ == "__main__":
    main()
