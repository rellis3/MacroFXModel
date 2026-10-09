"""T1 + T2 of the diagnostic review (plans/RATE_DIFF_NQ_LEADLAG_PLAN.md): timestamp / DST / candle alignment, and whether
the rate measures (STIR futures, 2y bond-futures yields, fed funds futures) carry different information.

    python scripts/rate_diff_nq/diag_alignment.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

D1, S15, M15 = Path("analysis/output/stir_1m"), Path("analysis/output/stir"), Path("analysis/output/rates_residual/m15")
OUT = Path("analysis/output/rate_diff_nq/diagnostics")
OUT.mkdir(parents=True, exist_ok=True)


def p1(n):
    d = pd.read_parquet(D1 / f"{n}.parquet")
    return pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None)).sort_index()


def stitch(parts):
    out = []
    for n, a, b in parts:
        s = p1(n)
        if a:
            s = s[s.index >= a]
        if b:
            s = s[s.index < b]
        out.append(np.log(s).diff().iloc[1:] * 100)
    return pd.concat(out).sort_index()


res = {}
nq1 = stitch([("CME_NQM6", None, "2026-06-11"), ("CME_NQU6", "2026-06-11", "2026-09-10"), ("CME_NQZ6", "2026-09-10", None)])
zt1 = stitch([("CBOT_ZTU6", None, "2026-08-28"), ("CBOT_ZTZ6", "2026-08-28", None)]) * -1e2 / 1.9   # yield bp
sr1 = -p1("CME_SR3Z6").diff() * 100

# (a) OANDA NAS100 15m (bar start, mid) vs IBKR NQ 15m built from 1-min: peak must be at lag 0
oa = pd.read_parquet(M15 / "NAS100_USD.parquet")["close"]
oa = np.log(oa).diff() * 100
ib15 = nq1.resample("15min", label="left", closed="left").sum(min_count=10)
j = pd.concat([oa.rename("oanda"), ib15.rename("ibkr")], axis=1).dropna()
j = j[(j.index >= "2026-04-13") & (j.index < "2026-10-08")]
res["T1a_oanda_vs_ibkr_nq_15m"] = {str(k): round(float(j.oanda.corr(j.ibkr.shift(k))), 4) for k in (-2, -1, 0, 1, 2)}

# (b) the 50 largest 1-min Nasdaq moves: at which offset does the rate's largest move in [-3, +3] min sit?
for name, r in (("US 2y (ZT)", zt1), ("SOFR Dec26", sr1)):
    big = nq1.abs().nlargest(50).index
    offs = []
    for t in big:
        w = r.reindex(pd.date_range(t - pd.Timedelta(minutes=3), t + pd.Timedelta(minutes=3), freq="1min"))
        if w.notna().sum() >= 5 and w.abs().max() > 0:
            offs.append(int((w.abs().idxmax() - t).total_seconds() // 60))
    res[f"T1b_largest_nq_moves_rate_peak_offset::{name}"] = pd.Series(offs).value_counts().sort_index().to_dict()

# (c) release minutes, in UTC, across US/UK daylight-saving changes (15m OANDA + SOFR Dec26 15m TRADES, Oct 2025 - Jul 2026)
cal = pd.read_csv("calendar_events.csv", encoding="latin-1")
ev = cal[(cal.ccy == "USD") & cal.event.str.match(r"^(Inflation Rate Month-over-Month|Headline Unemployment Rate|Non Farm Payrolls)$", na=False)].copy()
ev["t"] = pd.to_datetime(ev.datetime_raw)
ev = ev[(ev.t >= "2025-10-13") & (ev.t < "2026-07-03")].drop_duplicates("t")
sz15 = pd.read_csv(S15 / "CME_SR3Z6.csv")
sz15 = pd.Series(-sz15.close.diff().to_numpy() * 100, index=pd.to_datetime(sz15.time).dt.tz_localize(None))
rows = []
for t in ev.t:
    b0 = t.floor("15min")
    for k in (-2, -1, 0, 1, 2):
        b = b0 + pd.Timedelta(minutes=15 * k)
        rows.append({"t": t, "k": k, "dst_us": "summer" if t.month in range(4, 11) and not (t.month == 11 and t.day > 1) else "winter",
                     "nq_abs": abs(oa.get(b, np.nan)), "sofr_abs": abs(sz15.get(b, np.nan))})
E = pd.DataFrame(rows)
res["T1c_release_bar_abs_moves"] = E.groupby(["dst_us", "k"])[["nq_abs", "sofr_abs"]].mean().round(4).reset_index().to_dict("records")
res["T1c_n_releases"] = int(ev.shape[0])

# (d) same-bar correlation by month (US 2y vs NQ, 15m from 1-min; and SOFR Dec26 vs OANDA 15m across Oct 2025 - Oct 2026)
zt15 = zt1.resample("15min", label="left", closed="left").sum(min_count=10)
k15 = pd.concat([zt15.rename("r"), ib15.rename("q")], axis=1).dropna()
res["T1d_same_bar_by_month_US2y"] = {str(m): round(float(g.r.corr(g.q)), 3) for m, g in k15.groupby(k15.index.to_period("M"))}
j2 = pd.concat([sz15.rename("r"), oa.rename("q")], axis=1).dropna()
j2 = j2[j2.index >= "2025-10-13"]
res["T1d_same_bar_by_month_SOFR_vs_OANDA"] = {str(m): round(float(g.r.corr(g.q)), 3) for m, g in j2.groupby(j2.index.to_period("M"))}

# T2: do the rate measures carry the same information? 15-min change correlations, Apr-Oct 2026
zq_file = next((p for p in sorted(S15.glob("CBOT_ZQ*.csv")) if "Z6" in p.stem), None)
meas = {"SOFR Dec26": sr1.resample("15min", label="left", closed="left").sum(min_count=5),
        "SOFR Mar27": (-p1("CME_SR3H7").diff() * 100).resample("15min", label="left", closed="left").sum(min_count=5),
        "US 2y (ZT)": zt15}
if zq_file is not None:
    z = pd.read_csv(zq_file)
    meas[f"Fed funds {zq_file.stem[-3:]}"] = pd.Series(-z.close.diff().to_numpy() * 100, index=pd.to_datetime(z.time).dt.tz_localize(None))
M = pd.DataFrame(meas)
M = M[(M.index >= "2026-04-13") & (M.index < "2026-10-08")]
res["T2_change_corr_15m"] = M.corr().round(3).to_dict()
res["T2_share_bars_moved_15m"] = {k: round(float((v.dropna() != 0).mean()), 3) for k, v in M.items()}
(OUT / "alignment.json").write_text(json.dumps(res, indent=1, default=str))
print(json.dumps(res, indent=1, default=str)[:6000])
