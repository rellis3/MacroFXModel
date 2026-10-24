"""State definitions for cot-crowding-programme (frozen in the prereg). Features only -- no outcomes.

crowded      sign-agreeing extreme (extremeOf at 90/10): pct_share >= 90 with net long, or <= 10 with net short
trend_dir    sign of the trailing 13-week price move;  with_trend = crowded and crowd == trend_dir
control      not crowded and stretch s < 70 (well away from any extreme), any market-week with a trend_dir
T3           trend-strength tercile within market: |mom13| / (sigma_w * sqrt(13))
m4           +1 if the trailing 4-week move is in the trend direction (continuing), -1 if not (weakening)
V3           vol-regime tercile within market: 20-day / 260-day daily realised vol at the release
flow         +1 building (4-report change in share toward the crowd side), -1 unwinding
state        A (m4 +, building)  B (m4 -, building)  C (m4 +, unwinding)  D (m4 -, unwinding)  -- crowded with trend only
macro_ok     macro_dir == trend_dir (supports) / -trend_dir (deteriorating) / NaN (undefined)
oi_contract  oi_chg4 < 0
danger       m4 == -1 and oi_contract
"""
import numpy as np
import pandas as pd


def add(panel, px):
    p = panel.copy()
    p["crowded"] = ((p.pct_share >= 90) & (p.share > 0)) | ((p.pct_share <= 10) & (p.share < 0))
    p["trend_dir"] = np.sign(p.mom13).replace(0, np.nan)
    p["with_trend"] = p.crowded & (p.crowd == p.trend_dir)
    p["against_trend"] = p.crowded & (p.crowd == -p.trend_dir)
    p["control"] = ~p.crowded & (p.s < 70) & p.trend_dir.notna()
    p["tstr"] = p.mom13.abs() / (p.sigma_w * np.sqrt(13))
    p["m4"] = np.where(np.sign(p.mom4) == p.trend_dir, 1, -1)
    # 20d / 260d daily realised vol at the entry date
    vr = []
    for sym, g in p.groupby("sym"):
        d = px[px.sym == sym].set_index("date").sort_index()
        lr = np.log(d.close).diff()
        r20, r260 = lr.rolling(20).std(), lr.rolling(260, min_periods=200).std()
        ratio = (r20 / r260)
        idx = ratio.index.searchsorted(g.entry_date.values, side="right") - 1
        v = np.where(idx >= 0, ratio.values[np.maximum(idx, 0)], np.nan)
        vr.append(pd.Series(v, index=g.index))
    p["vr"] = pd.concat(vr).reindex(p.index)
    p["T3"] = p.groupby("sym").tstr.transform(lambda s: pd.qcut(s.rank(method="first"), 3, labels=False))
    p["V3"] = p.groupby("sym").vr.transform(lambda s: pd.qcut(s.rank(method="first"), 3, labels=False))
    p["flow"] = np.where(p.d_share4 * p.crowd > 0, 1, -1)
    p["state"] = np.where(~p.with_trend, None,
                 np.where((p.m4 == 1) & (p.flow == 1), "A", np.where((p.m4 == -1) & (p.flow == 1), "B",
                 np.where((p.m4 == 1) & (p.flow == -1), "C", "D"))))
    p["macro_ok"] = np.where(p.macro_dir.isna(), np.nan, np.where(p.macro_dir == p.trend_dir, 1.0, -1.0))
    p["oi_contract"] = p.oi_chg4 < 0
    p["danger"] = (p.m4 == -1) & p.oi_contract
    return p


def episodes(mask, sym, date, gap=2):
    """count runs of True per market (gaps of up to `gap` reports merged)."""
    n = 0
    for s, g in pd.DataFrame({"m": mask.values, "sym": sym.values, "d": date.values}).groupby("sym"):
        idx = np.where(g.sort_values("d").m.values)[0]
        if len(idx):
            n += 1 + int((np.diff(idx) > gap + 1).sum())
    return n
