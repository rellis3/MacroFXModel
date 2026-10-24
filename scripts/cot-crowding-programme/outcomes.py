"""Forward outcomes for cot-crowding-programme. Kept apart from panel.py so the state/feature
side can be built and frozen without reading anything that happens after a release.

All outcomes are signed by a direction `dir` (+1 = up is 'with'), measured from P (the close on or
after the release Friday) along the daily OHLC path after the entry date:
  r1, r4, r12      log(P[k+h] / P[k]) * dir / (sigma_w * sqrt(h))
  mae4, mae12      max adverse excursion (intraday lows/highs) / (sigma_w * sqrt(h))   (>= 0)
  mfe4, mfe12      max favourable excursion, same units
  big_adverse4     1 if the adverse excursion within 4 weeks reaches 2 * sigma_w
  shock20          1 if any of the next 20 daily returns is <= -2.5 * trailing 60-day daily sd (against dir)
  rv_ratio         sd of the next 20 daily log returns / sd of the prior 60
  t_rev            weeks until a weekly close is >= 2 * sigma_w against dir (censored at 26 -> NaN, rev26=0)
"""
import numpy as np
import pandas as pd


def compute(panel, px, dir_col):
    """`panel` must be the complete weekly panel per market (one row per consecutive report): horizons
    are counted in rows. Filter AFTER computing, never before."""
    out = []
    panel = panel.sort_values(["sym", "report_date"])
    # a gap of more than two weeks between reports (a contract that stopped and restarted, e.g. RTY
    # 2008-2017) starts a new segment: horizons never reach across it
    seg = panel.groupby("sym").report_date.transform(lambda s: (s.diff().dt.days > 14).cumsum())
    for (sym, _), g in panel.groupby([panel.sym, seg]):
        d = px[px.sym == sym].set_index("date").sort_index()
        dates, lo, hi, cl = d.index.values, d.low.values, d.high.values, d.close.values
        lr = np.r_[np.nan, np.diff(np.log(cl))]
        P, E, S, D = g.P.values, g.entry_date.values, g.sigma_w.values, g[dir_col].values
        n = len(g)
        rec = {k: np.full(n, np.nan) for k in ("r1", "r4", "r12", "mae4", "mae12", "mfe4", "mfe12", "big_adverse4", "shock20", "rv_ratio", "t_rev", "rev12", "rev26")}
        for i in range(n):
            if not (np.isfinite(P[i]) and np.isfinite(S[i]) and D[i] in (1, -1)) or pd.isna(E[i]):
                continue
            dr, s = D[i], S[i]
            for h in (1, 4, 12):
                if i + h < n and np.isfinite(P[i + h]):
                    rec[f"r{h}"][i] = dr * np.log(P[i + h] / P[i]) / (s * np.sqrt(h))
            j0 = np.searchsorted(dates, E[i], side="right")          # first bar after the entry close
            for h in (4, 12):
                if i + h < n and not pd.isna(E[i + h]):
                    j1 = np.searchsorted(dates, E[i + h], side="right")
                    if j1 > j0:
                        adv = (np.log(P[i] / lo[j0:j1].min()) if dr > 0 else np.log(hi[j0:j1].max() / P[i]))
                        fav = (np.log(hi[j0:j1].max() / P[i]) if dr > 0 else np.log(P[i] / lo[j0:j1].min()))
                        rec[f"mae{h}"][i] = max(adv, 0) / (s * np.sqrt(h))
                        rec[f"mfe{h}"][i] = max(fav, 0) / (s * np.sqrt(h))
                        if h == 4:
                            rec["big_adverse4"][i] = float(max(adv, 0) >= 2 * s)
            if j0 + 20 <= len(cl) and j0 >= 61:
                fut, past = lr[j0:j0 + 20], lr[j0 - 60:j0]
                sd = np.nanstd(past, ddof=1)
                rec["rv_ratio"][i] = np.nanstd(fut, ddof=1) / sd
                rec["shock20"][i] = float(np.nanmin(fut * dr) <= -2.5 * sd)
            # time to reversal on weekly closes
            t = np.nan
            for j in range(1, 27):
                if i + j >= n or not np.isfinite(P[i + j]):
                    t = -1; break
                if dr * np.log(P[i + j] / P[i]) <= -2 * s:
                    t = j; break
            if t == -1:
                continue
            rec["t_rev"][i] = t if np.isfinite(t) else np.nan
            rec["rev12"][i] = float(np.isfinite(t) and t <= 12)
            rec["rev26"][i] = float(np.isfinite(t))
        o = pd.DataFrame(rec, index=g.index)
        out.append(o)
    return pd.concat(out).reindex(panel.index)
