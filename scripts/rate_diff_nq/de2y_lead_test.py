"""DE2Y-NQ-15M-LEAD (forge/DE2Y_NQ_15M_LEAD_PREREG.md): one confirmation test, run once.

    python scripts/rate_diff_nq/de2y_lead_test.py
"""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

H = Path("analysis/output/stir_1m_hist")
OUT = Path("analysis/output/rate_diff_nq/de2y_lead")
OUT.mkdir(parents=True, exist_ok=True)
END = pd.Timestamp("2026-04-01")

# German 2y yield change per minute, each Schatz contract over its front window
files = sorted(H.glob("EUREX_FGBS*.parquet"), key=lambda p: re.search(r"(\d{8})", p.stem).group(1))
exps = [pd.Timestamp(re.search(r"(\d{8})", p.stem).group(1)) for p in files]
parts = []
for i, (p, e) in enumerate(zip(files, exps)):
    d = pd.read_parquet(p)
    s = pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None)).sort_index()
    start = (exps[i - 1] - pd.Timedelta(days=7)) if i else e - pd.Timedelta(days=100)
    stop = e - pd.Timedelta(days=7)
    lp = np.log(s)
    ok = (s.index.to_series().diff() == pd.Timedelta(minutes=1)).to_numpy()
    ch = (-lp.diff() / 1.9 * 1e4).where(ok)
    parts.append(ch[(ch.index >= start) & (ch.index < stop)])
de = pd.concat(parts).sort_index()
de = de[~de.index.duplicated()]
start = de.index[0]

nq = pd.read_parquet("VolRangeForecaster/data/m1/nq_m1.parquet", columns=["close"])["close"]
nq.index = pd.to_datetime(nq.index, utc=True).tz_localize(None)
nq = nq[(nq.index >= start - pd.Timedelta(days=1)) & (nq.index < END)].sort_index()
okn = (nq.index.to_series().diff() == pd.Timedelta(minutes=1)).to_numpy()
r = (np.log(nq).diff() * 100).where(okn)

f15 = lambda s: s.resample("15min", label="left", closed="left").agg(["sum", "count"])
X, Y = f15(de[de.index < END]), f15(r[r.index >= start])
J = X.join(Y, lsuffix="_x", rsuffix="_y", how="outer")
J = J.reindex(pd.date_range(J.index.min(), J.index.max(), freq="15min"))
x = J.sum_x.where(J.count_x >= 12)
y = J.sum_y.where(J.count_y >= 12)
x1 = x.shift(1)                                       # German 2y move in bar t-1 (regular 15-min grid)
day = J.index.normalize()

# regime: rolling 60-day same-bar correlation of x and y, from days BEFORE each day
daily = pd.DataFrame({"x": x, "y": y, "xy": x * y, "xx": x * x, "yy": y * y}).where(x.notna() & y.notna())
dsum = daily.groupby(day).sum(min_count=1)
dcnt = (x.notna() & y.notna()).groupby(day).sum()
roll = dsum.rolling(60, min_periods=30).sum().shift(1)
n = dcnt.rolling(60, min_periods=30).sum().shift(1)
rc = (roll.xy / n - roll.x / n * roll.y / n) / np.sqrt((roll.xx / n - (roll.x / n) ** 2) * (roll.yy / n - (roll.y / n) ** 2))
reg = pd.Series(rc.reindex(day).to_numpy(), index=J.index)


def stat(xa, ya, mask):
    ok = mask & xa.notna() & ya.notna()
    a, b, dd = xa[ok].to_numpy(), ya[ok].to_numpy(), day[ok.to_numpy()]
    az, bz = (a - a.mean()) / a.std(), (b - b.mean()) / b.std()
    s = pd.Series(az * bz).groupby(dd).sum()
    t = s.mean() / s.std(ddof=1) * np.sqrt(len(s))
    c = float((az * bz).mean())
    slope = float(np.polyfit(a, b, 1)[0])            # % Nasdaq per bp of German 2y
    return {"corr": round(c, 4), "t": round(float(t), 2), "ci95": [round(c - 1.96 * abs(c / t), 4), round(c + 1.96 * abs(c / t), 4)] if t else None,
            "bars": int(ok.sum()), "days": int(len(s)), "nasdaq_pct_per_bp": round(slope, 5)}


opp, tog = (reg < 0).to_numpy(), (reg >= 0).to_numpy()
allm = np.ones(len(J), bool)
level = float(nq.mean())
res = {"window": [str(start), str(END)], "schatz_contracts": [p.stem for p in files],
       "primary (stocks & yields move opposite)": stat(x1, y, pd.Series(opp, index=J.index)),
       "full window": stat(x1, y, pd.Series(allm, index=J.index)),
       "opposite regime (move together)": stat(x1, y, pd.Series(tog, index=J.index)),
       "same-bar check, primary regime": stat(x, y, pd.Series(opp, index=J.index)),
       "same-bar check, move-together regime": stat(x, y, pd.Series(tog, index=J.index)),
       "share of bars in primary regime": round(float(opp[x1.notna().to_numpy() & y.notna().to_numpy()].mean()), 3)}
p = res["primary (stocks & yields move opposite)"]
res["PASS"] = bool(p["corr"] < 0 and p["t"] <= -1.96)
res["nasdaq_points_per_bp_primary"] = round(p["nasdaq_pct_per_bp"] / 100 * level, 2)
(OUT / "results.json").write_text(json.dumps(res, indent=1))
md = ["# DE2Y-NQ-15M-LEAD — result", "", f"Pre-registration: `forge/DE2Y_NQ_15M_LEAD_PREREG.md`. Window {res['window'][0][:10]} → 2026-03-31, Schatz contracts {', '.join(res['schatz_contracts'])}.", "",
      f"## {'PASS' if res['PASS'] else 'FAIL'}", "",
      "| sample | corr (German 2y move bar t−1, Nasdaq bar t) | t | 95% | bars | days |", "|---|---|---|---|---|---|"]
for k in ("primary (stocks & yields move opposite)", "full window", "opposite regime (move together)", "same-bar check, primary regime", "same-bar check, move-together regime"):
    v = res[k]
    md.append(f"| {k} | {v['corr']:+.4f} | {v['t']:+.2f} | {v['ci95']} | {v['bars']:,} | {v['days']} |")
md += ["", f"Share of bars in the primary regime: {res['share of bars in primary regime']:.0%}. Effect in the primary regime: "
       f"{res['nasdaq_points_per_bp_primary']:+.2f} Nasdaq points per 1 bp German 2y move in the previous 15 minutes."]
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md))
