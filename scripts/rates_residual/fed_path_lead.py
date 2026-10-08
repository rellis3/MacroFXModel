"""FED-PATH-LEAD (forge/FED_PATH_LEAD_PREREG.md): one confirmation test of the wide-scan cluster on Oct 2025 - Apr 2026.

    python scripts/rates_residual/fed_path_lead.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

M = Path("analysis/output/rates_residual/m15")
STIR = Path("analysis/output/stir")
OUT = Path("analysis/output/fed_path_lead")
OUT.mkdir(parents=True, exist_ok=True)
CONF = ("2025-10-13", "2026-04-11")          # confirmation (untouched)
DISC = ("2026-04-13", "2026-10-08")          # discovery months, comparison only
TARGETS = ["EUR_USD", "AUD_USD", "XAG_USD", "DE30_EUR"]


def fut(name):
    d = pd.read_csv(STIR / f"CME_{name}.csv")
    return pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None))


m7, z6 = fut("SR3M7"), fut("SR3Z6")
tg = {t: pd.read_parquet(M / f"{t}.parquet")["close"] for t in TARGETS}
grid = pd.date_range("2025-09-01", min(min(s.index[-1] for s in tg.values()), m7.index[-1]), freq="15min")
grid = grid[grid.dayofweek < 5]
slope = m7.reindex(grid).ffill(limit=4) - z6.reindex(grid).ffill(limit=4)       # wide scan SLOPE_M7Z6 (price terms)
dS = slope.diff()
sdS = dS.rolling(1600, min_periods=400).std().shift(1)


def signal(k):
    return (slope - slope.shift(k)) / (sdS * np.sqrt(k))


lp = pd.DataFrame({t: np.log(tg[t].reindex(grid)) for t in TARGETS})
r1 = lp.diff()
sdT = r1.rolling(1600, min_periods=400).std().shift(1)


def outcome(h, cols=TARGETS):
    f = (lp.shift(-h) - lp)[cols] / (sdT[cols] * np.sqrt(h))
    return f.mean(axis=1, skipna=False)


lon = grid.tz_localize("UTC").tz_convert("Europe/London")
hm = lon.hour * 60 + lon.minute
SESS = {"asia+london_am": hm < 750, "asia": hm < 420, "london_am": (hm >= 420) & (hm < 750)}
day = grid.normalize()


def tstat(x, y, mask, period):
    m = mask & (grid >= period[0]) & (grid < period[1]) & np.isfinite(x.to_numpy()) & np.isfinite(y.to_numpy())
    xs, ys = x[m], y[m]
    if len(xs) < 100:
        return {"n": int(len(xs)), "t": None}
    xz, yz = (xs - xs.mean()) / xs.std(), (ys - ys.mean()) / ys.std()
    s = (xz * yz).groupby(day[m]).sum()
    return {"n": int(len(xs)), "days": int(len(s)), "corr": round(float((xz * yz).mean()), 4),
            "t": round(float(s.mean() / s.std(ddof=1) * np.sqrt(len(s))), 2)}


res = {"primary": tstat(signal(2), outcome(2), SESS["asia+london_am"], CONF)}
res["pass"] = bool(res["primary"]["t"] is not None and res["primary"]["t"] >= 2.0)
res["discovery_months_same_test"] = tstat(signal(2), outcome(2), SESS["asia+london_am"], DISC)
res["by_target"] = {t: tstat(signal(2), outcome(2, [t]), SESS["asia+london_am"], CONF) for t in TARGETS}
res["by_horizon"] = {f"h{h}": tstat(signal(2), outcome(h), SESS["asia+london_am"], CONF) for h in (1, 4, 8)}
res["by_signal_lookback"] = {f"mom{k}": tstat(signal(k), outcome(2), SESS["asia+london_am"], CONF) for k in (1, 8)}
res["by_session"] = {s: tstat(signal(2), outcome(2), SESS[s], CONF) for s in ("asia", "london_am")}
# gross trading read: basket long/short by the signal's sign when |signal| > 1, held 30 min, raw basket % return
raw = ((lp.shift(-2) - lp).mean(axis=1, skipna=False)) * 100
sg = signal(2)
tr = SESS["asia+london_am"] & (grid >= CONF[0]) & (grid < CONF[1]) & (sg.abs() > 1).to_numpy() & np.isfinite(raw.to_numpy())
pnl = np.sign(sg[tr]) * raw[tr]
res["gross_trade_read"] = {"trades": int(tr.sum()), "mean_pct": round(float(pnl.mean()), 4), "hit": round(float((pnl > 0).mean()), 3)}
res["coverage"] = {"slope_first": str(slope.dropna().index[0]), "slope_last": str(slope.dropna().index[-1])}
(OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))

p = res["primary"]
md = ["# FED-PATH-LEAD — results", "", "Pre-registration: `forge/FED_PATH_LEAD_PREREG.md`. Confirmation period 2025-10-13 → 2026-04-10 "
      "(untouched). Signal: Fed-path slope (SR3M7 − SR3Z6) change over 30 min; outcome: EURUSD / AUDUSD / silver / DAX "
      "basket over the next 30 min; Asia + London morning.", "",
      f"## Primary: **{'PASS' if res['pass'] else 'FAIL'}** — t {p['t']:+.2f} (needs ≥ +2.0), corr {p['corr']:+.4f}, "
      f"{p['n']:,} bars over {p['days']} days", "",
      f"- Same test on the discovery months (Apr–Oct 2026, comparison only): t {res['discovery_months_same_test']['t']:+.2f}, "
      f"corr {res['discovery_months_same_test']['corr']:+.4f}",
      "- By target: " + ", ".join(f"{k} t {v['t']:+.2f}" for k, v in res["by_target"].items()),
      "- By horizon (bars): " + ", ".join(f"{k} t {v['t']:+.2f}" for k, v in res["by_horizon"].items()),
      "- Signal look-back: " + ", ".join(f"{k} t {v['t']:+.2f}" for k, v in res["by_signal_lookback"].items()),
      "- By session: " + ", ".join(f"{k} t {v['t']:+.2f}" for k, v in res["by_session"].items()),
      f"- Gross trading read (|signal| > 1, 30 min, before costs): {res['gross_trade_read']['trades']} trades, "
      f"mean {res['gross_trade_read']['mean_pct']:+.4f}% per trade, hit {res['gross_trade_read']['hit'] * 100:.1f}%",
      f"- Slope data: {res['coverage']['slope_first']} → {res['coverage']['slope_last']}"]
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
