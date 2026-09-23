"""run_iv_sizing_filter — Parts A and B of forge/IV_SIZING_FILTER_PREREG.md.

    python -m forge.run_iv_sizing_filter

Writes forge/out_vol_iv/sizing_filter.json and forge/out_vol_iv/iv_session_panel.parquet
(the per-session panel — date, instrument, sigma_iv30, sigma_har, ts_ratio, stress — that
Part C joins trades against).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

from forge import vol as V
from forge.run_vol_iv import OI_PAIR, IV_DIR, OUT

BURN_IN, REFIT = 500, 21
SQ252 = np.sqrt(252)


def panel(pair: str, root: str) -> pd.DataFrame:
    daily = V.load_daily(pair, root, years=10, session="london22")
    d = daily.rename_axis("date").reset_index()
    d["date"] = pd.to_datetime(d["date"]).astype("datetime64[ns]")
    d["sigma_har"] = V.as_of_yesterday(V.har_rv_log_sigma(daily))       # annualized %
    pk = np.log(d["high"] / d["low"]) ** 2 / (4 * np.log(2))
    d["har_d"] = np.log(pk.shift(1) + 1e-12)
    d["har_w"] = np.log(pk.shift(1).rolling(5).mean() + 1e-12)
    d["har_m"] = np.log(pk.shift(1).rolling(22).mean() + 1e-12)
    d["y_range"] = np.log(((d["high"] - d["low"]) / d["open"]).where(lambda s: s > 0))
    d["ret_pct"] = (d["close"] - d["open"]) / d["open"] * 100

    iv = pd.read_parquet(IV_DIR / f"iv_daily_{OI_PAIR[pair].lower()}.parquet")
    iv = iv[["date", "iv30", "iv90", "iv_front"]].dropna(subset=["iv30"]).copy()
    iv["date"] = pd.to_datetime(iv["date"]).astype("datetime64[ns]")
    iv["ts_ratio"] = iv["iv30"] / iv["iv90"] - 1
    # trailing-252 90th percentile over settlements STRICTLY before each one
    iv["ts_p90"] = iv["ts_ratio"].shift(1).rolling(252, min_periods=252).quantile(0.90)
    iv["stress"] = np.where(iv["ts_p90"].notna(), (iv["ts_ratio"] > iv["ts_p90"]).astype(float), np.nan)
    iv["inverted"] = (iv["ts_ratio"] > 0).astype(float)
    m = pd.merge_asof(d.sort_values("date"), iv.rename(columns={"date": "settle_date"}).sort_values("settle_date"),
                      left_on="date", right_on="settle_date", direction="backward",
                      allow_exact_matches=False, tolerance=pd.Timedelta(days=5))
    m["sigma_iv30"] = m["iv30"] * 100
    m["instrument"] = pair
    return m[m["sigma_iv30"].notna()].reset_index(drop=True)


def sizing_metrics(p: pd.DataFrame, col: str) -> dict:
    z = p["ret_pct"] / (p[col] / SQ252)
    ok = z.notna() & np.isfinite(z)
    zz = z[ok]
    monthly = zz.groupby(p.loc[ok, "date"].dt.to_period("M")).std()
    return {"A1_month_std_of_std": float(monthly.std()), "A2_tail_share": float((zz.abs() > 3).mean()),
            "z_std": float(zz.std()), "n": int(ok.sum())}


def oos_range(p: pd.DataFrame, base: list, extra: list) -> tuple[np.ndarray, np.ndarray]:
    df = p.dropna(subset=["y_range"] + base + extra).reset_index(drop=True)
    ea, ec = [], []
    for start in range(BURN_IN, len(df), REFIT):
        tr, te = df.iloc[:start], df.iloc[start:start + REFIT]
        for feats, sink in ((base, ea), (base + extra, ec)):
            X = np.column_stack([np.ones(len(tr))] + [tr[f] for f in feats])
            b, *_ = np.linalg.lstsq(X, tr["y_range"].values, rcond=None)
            Xt = np.column_stack([np.ones(len(te))] + [te[f] for f in feats])
            sink.extend((te["y_range"].values - Xt @ b) ** 2)
    return np.array(ea), np.array(ec)


def dm_t(d: np.ndarray, lag: int = 1) -> float:
    d = d[np.isfinite(d)]
    e = d - d.mean()
    s = e @ e / len(d)
    for L in range(1, lag + 1):
        s += 2 * (1 - L / (lag + 1)) * (e[L:] @ e[:-L]) / len(d)
    return float(d.mean() / np.sqrt(s / len(d)))


def main():
    universe = V.discover_full_universe()
    res, panels = {}, []
    for pair in OI_PAIR:
        p = panel(pair, universe[pair])
        panels.append(p[["date", "instrument", "sigma_iv30", "sigma_har", "iv30", "iv90", "ts_ratio",
                         "ts_p90", "stress", "inverted"]])
        a_iv, a_rv = sizing_metrics(p, "sigma_iv30"), sizing_metrics(p.dropna(subset=["sigma_har"]), "sigma_har")
        p["log_iv"], p["log_ivf"] = np.log(p["iv30"]), np.log(p["iv_front"])
        base = ["har_d", "har_w", "har_m", "log_iv", "log_ivf"]
        ea, ec = oos_range(p.dropna(subset=["stress"]), base, ["stress"])
        t = dm_t(ea - ec)
        z = p["ret_pct"] / (p["sigma_iv30"] / SQ252)
        st = p["stress"] == 1
        res[pair] = {
            "A_iv": a_iv, "A_har": a_rv,
            "B1": {"improve_pct": float(100 * (1 - ec.mean() / ea.mean())), "dm_t": t,
                   "dm_p_one_sided": float(1 - norm.cdf(t)), "n_oos": int(len(ea))},
            "B2": {"mean_absz_stress": float(z[st].abs().mean()), "mean_absz_calm": float(z[p["stress"] == 0].abs().mean()),
                   "stress_share": float(st.mean()), "n_stress": int(st.sum())},
        }
        r = res[pair]
        print(f"[{pair:6s}] A1 iv {a_iv['A1_month_std_of_std']:.3f} har {a_rv['A1_month_std_of_std']:.3f} | "
              f"A2 iv {100*a_iv['A2_tail_share']:.2f}% har {100*a_rv['A2_tail_share']:.2f}% | "
              f"B1 {r['B1']['improve_pct']:+.2f}% p={r['B1']['dm_p_one_sided']:.3f} | "
              f"B2 |z| stress {r['B2']['mean_absz_stress']:.3f} calm {r['B2']['mean_absz_calm']:.3f} "
              f"(n={r['B2']['n_stress']})", flush=True)
    ks = list(OI_PAIR)
    a1 = sum(res[k]["A_iv"]["A1_month_std_of_std"] < res[k]["A_har"]["A1_month_std_of_std"] for k in ks)
    a2 = sum(res[k]["A_iv"]["A2_tail_share"] < res[k]["A_har"]["A2_tail_share"] for k in ks)
    b_w = sum(res[k]["B1"]["improve_pct"] > 0 for k in ks)
    b_s = sum(res[k]["B1"]["dm_p_one_sided"] < 0.05 for k in ks)
    res["_verdict"] = {"A": {"A1_iv_wins": a1, "A2_iv_wins": a2, "PASS": a1 >= 5 and a2 >= 4},
                       "B1": {"wins": b_w, "dm_sig": b_s, "PASS": b_w >= 5 and b_s >= 4}}
    print("VERDICT", res["_verdict"])
    (OUT / "sizing_filter.json").write_text(json.dumps(res, indent=2))
    pd.concat(panels).to_parquet(OUT / "iv_session_panel.parquet")


if __name__ == "__main__":
    main()
