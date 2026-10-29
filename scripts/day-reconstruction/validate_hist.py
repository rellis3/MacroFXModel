"""Day reconstruction, milestone 1 (Python half): can the historical rebuild be trusted, and what does each known
discrepancy do to the levels? Uses forge's own loader and estimators (forge/vol.py) for the fit side and the NY-close
bars / v4Days dump (scripts/day-reconstruction/validate_prod.mjs) for the live side. No new estimator, no new band
calculation: every rung is width x sigma x event multiplier with widths and multipliers taken from the existing
production params (js/forecastLadderParams.js) or the existing walk-forward folds (forge/out_vol_lon/vol_report.json).

  V0  cross-language parity: Python sigma on NY-close bars == the JS v4Days sigma
  V4  sigma basis: fit (London 00:00-22:00 session bars) vs live (NY 17:00 bars), ratio and effect on calibration
  V5  parameter versions: production params (fitted through 2025-08-19) vs the fold in force at the time
  V6  event-tag coverage (repaired ForexFactory history, the source the multipliers were fitted on)
  V7  touch definitions: first M1 high/low touch vs first H1 close beyond the level (the live tracker's rule), and
      same-minute two-sided ambiguity
  V8  NQ: production sigma from Yahoo NQ=F futures vs the OANDA NAS100 history

Calibration ("exceedance") is the forecast's own promise: p50/p75/p90 should be exceeded on 50/25/10% of days.

    python scripts/day-reconstruction/validate_hist.py
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import forge.vol as V  # noqa: E402

OUT = ROOT / "analysis/output/day-reconstruction"
NYD = ROOT / "analysis/output/ladder_candidates/d1"
FX, IDX = "VolRangeForecaster/data/m1", "portfolioBacktest/cache"
INST = [("GOLD", "gold", FX), ("NQ", "nq", IDX), ("EURUSD", "eurusd", FX)]
LAST = pd.Timestamp("2026-08-20")
Q = ["hl", "oc", "oh", "ol"]
TARGET = np.array([0.50, 0.25, 0.10])
SQ252 = np.sqrt(252)
LOG = []


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


prod_all = json.loads(subprocess.run(
    ["node", "-e", "import('./js/forecastLadderParams.js').then(m=>process.stdout.write(JSON.stringify(m.LADDER_PARAMS.pairs)))"],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout)
report = json.load(open(ROOT / "forge/out_vol_lon/vol_report.json"))
ff = json.load(open(OUT / "ff_tags.json"))
FF_LO, FF_HI = (pd.Timestamp(x) for x in ff["coverage"])


def prod_params(name):
    p = prod_all[name]
    return {"estimator": p["estimator"], "width": {q: np.array(p["width"][q]) for q in Q}, "event": p["event"]}


def fold_params(spec):
    w = spec["width_mult"]
    return {"estimator": spec["estimator"],
            "width": {"hl": np.array([w["BM_P50"], w["BM_P75"], w["BM_P90"]]),
                      "oc": np.array([w["HN_P50"], w["HN_P75"], w["HN_P90"]]),
                      "oh": np.array([w["OH_P50"], w["OH_P75"], w["OH_P90"]]),
                      "ol": np.array([w["OL_P50"], w["OL_P75"], w["OL_P90"]])},
            "event": spec["event_mult"]}


def london_date(idx):
    return pd.DatetimeIndex(idx).tz_localize("UTC").tz_convert("Europe/London").tz_localize(None).normalize()


def asof(series_by_date, dates):
    """Value of a per-date series at the last date strictly before each target date."""
    s = series_by_date.dropna().sort_index()
    pos = s.index.searchsorted(dates, side="left") - 1
    out = np.full(len(dates), np.nan)
    ok = pos >= 0
    out[ok] = s.to_numpy()[pos[ok]]
    return out


def exceed(real, rung):
    ok = np.isfinite(real) & np.isfinite(rung)
    return float((real[ok] > rung[ok]).mean()), int(ok.sum())


def wilson(p, n, z=1.96):
    if n == 0:
        return [np.nan, np.nan]
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [c - h, c + h]


res = {"instruments": {}}
for NAME, key, root in INST:
    R = {}
    prod = prod_params(NAME)
    folds = report[key]["folds"]
    specs = [fold_params(s) for s in report[key]["specs"]]
    bounds = [(pd.Timestamp(s["trained_through"]).normalize(), pd.Timestamp(f["test_end"]).normalize())
              for s, f in zip(report[key]["specs"], folds)]

    # realised (the fit's own definition) on London 00:00-22:00 sessions, keyed by London date
    L22 = V.load_daily(key, root, session="london22", end="2026-08-22")
    L22.index = london_date(L22.index)
    L22 = L22[(L22.index <= LAST) & (L22.index.dayofweek < 5)]
    real = pd.DataFrame(V.realized_quantities(L22), index=L22.index)
    dates = real.index

    ny = pd.DataFrame(json.load(open(NYD / f"{NAME}.json"))).rename(columns=dict(o="open", h="high", l="low", c="close"))
    ny.index = pd.DatetimeIndex(ny.pop("d"))
    ests = sorted({prod["estimator"]} | {s["estimator"] for s in specs})
    sig = {}
    for est in ests:
        sny = pd.Series(V.ESTIMATORS[est](ny), index=ny.index) / SQ252          # daily %, as of each NY close
        sl = pd.Series(V.ESTIMATORS[est](L22), index=L22.index) / SQ252         # daily %, as of each London session
        sig[est] = {"ny": asof(sny, dates), "l22": asof(sl, dates)}

    # V0 parity with the JS v4Days dump (rounded to 2 dp there)
    v4 = pd.DataFrame(json.load(open(OUT / f"v4days_{NAME}.json")))
    v4.index = pd.DatetimeIndex(v4.date)
    m = pd.Series(sig[prod["estimator"]]["ny"], index=dates).reindex(v4.index)
    d0 = (m.round(2) - v4.sigma_daily_pct).abs()
    R["V0_parity"] = {"days": int(d0.notna().sum()), "max_abs_diff_pct": float(d0.max()), "share_exact_2dp": float((d0 < 0.0051).mean())}
    log(f"{NAME} V0 parity python vs JS v4Days sigma: {R['V0_parity']}")

    # event tags (FF, covered window) and multipliers
    tags = ff["tags"][NAME]
    tag = np.array([None if (d < FF_LO or d > FF_HI) else tags.get(d.strftime("%Y-%m-%d"), "none") for d in dates], dtype=object)

    def mult(params):
        return np.array([1.0 if t is None else params["event"].get(t, 1.0) for t in tag])

    def rungs(params, basis, which_est=None):
        s = sig[which_est or params["estimator"]][basis] * mult(params)
        return {q: s[:, None] * params["width"][q][None, :] for q in Q}

    # point-in-time params: the fold whose test window holds the date (trained strictly before it)
    fold_of = np.full(len(dates), -1)
    for k, (lo, hi) in enumerate(bounds):
        fold_of[(dates > lo) & (dates <= hi)] = k

    def pit_rungs(basis):
        out = {q: np.full((len(dates), 3), np.nan) for q in Q}
        for k, sp in enumerate(specs):
            sel = fold_of == k
            r = rungs(sp, basis)
            for q in Q:
                out[q][sel] = r[q][sel]
        return out

    real_arr = {q: real[f"{q}_pct"].to_numpy() for q in Q}

    def calib(rg, sel):
        tab, dev = {}, []
        for q in Q:
            for j, rn in enumerate(("p50", "p75", "p90")):
                p, n = exceed(real_arr[q][sel], rg[q][sel, j])
                tab[f"{q}_{rn}"] = {"exceed": round(p, 4), "n": n, "ci": [round(x, 4) for x in wilson(p, n)]}
                dev.append(abs(p - TARGET[j]))
        return {"mean_abs_dev_pp": round(100 * float(np.mean(dev)), 2), "rungs": tab}

    oos_ff = (fold_of >= 0) & (dates <= FF_HI)          # fold test years with the fit's own event tags
    fold5 = fold_of == len(specs) - 1                   # production params' own OOS year (no FF tags)
    pre = dates <= bounds[0][0]                         # before any fold: production params only (in-sample)

    R["windows"] = {"oos_ff": [str(dates[oos_ff].min().date()), str(dates[oos_ff].max().date()), int(oos_ff.sum())],
                    "prod_oos_year": [str(dates[fold5].min().date()), str(dates[fold5].max().date()), int(fold5.sum())],
                    "pre_fold": [str(dates[pre].min().date()), str(dates[pre].max().date()), int(pre.sum())]}

    # V4 sigma basis
    ratio = sig[prod["estimator"]]["ny"] / sig[prod["estimator"]]["l22"]
    rr = ratio[np.isfinite(ratio)]
    R["V4_sigma_ratio_ny_over_l22"] = {"median": float(np.median(rr)), "p5": float(np.percentile(rr, 5)),
                                       "p25": float(np.percentile(rr, 25)), "p75": float(np.percentile(rr, 75)),
                                       "p95": float(np.percentile(rr, 95)), "n": int(len(rr))}
    pit_l22, pit_ny = pit_rungs("l22"), pit_rungs("ny")
    R["V4_calibration_oos_ff"] = {"fit_basis_l22_pit": calib(pit_l22, oos_ff), "live_basis_ny_pit": calib(pit_ny, oos_ff)}
    # reproduction of forge's own reported OOS exceedance (fit basis, PIT params) per fold
    rep_chk = []
    for k, f in enumerate(folds):
        sel = (fold_of == k) & (dates <= FF_HI)
        if sel.sum() < 100:
            continue
        p_mine, _ = exceed(real_arr["hl"][sel], pit_l22["hl"][sel, 1])
        rep_chk.append({"fold": k, "n": int(sel.sum()), "hl_p75_mine": round(p_mine, 3), "hl_p75_forge": round(f["oos"]["exceed_hl_p75"], 3)})
    R["V4_forge_reproduction"] = rep_chk
    log(f"{NAME} V4 sigma NY/L22 ratio {R['V4_sigma_ratio_ny_over_l22']}")
    log(f"{NAME} V4 forge reproduction (HL p75 OOS exceed, mine vs forge): {rep_chk}")
    log(f"{NAME} V4 calibration OOS (FF window): fit basis dev {R['V4_calibration_oos_ff']['fit_basis_l22_pit']['mean_abs_dev_pp']}pp, "
        f"live basis dev {R['V4_calibration_oos_ff']['live_basis_ny_pit']['mean_abs_dev_pp']}pp")

    # V5 parameter versions (live basis): production params vs PIT folds on the same days
    prod_ny = rungs(prod, "ny")
    R["V5"] = {"oos_ff_prod_params": calib(prod_ny, oos_ff), "oos_ff_pit_params": R["V4_calibration_oos_ff"]["live_basis_ny_pit"],
               "prod_oos_year_prod_params": calib(prod_ny, fold5), "pre_fold_prod_params": calib(prod_ny, pre)}
    rel = np.abs(prod_ny["oh"][oos_ff, 1] / pit_ny["oh"][oos_ff, 1] - 1)
    est_diff = np.mean([specs[k]["estimator"] != prod["estimator"] for k in fold_of[oos_ff]])
    R["V5"]["oh_p75_level_rel_diff"] = {"median": float(np.nanmedian(rel)), "p95": float(np.nanpercentile(rel, 95))}
    R["V5"]["share_days_estimator_differs"] = float(est_diff)
    R["V5"]["fold_estimators"] = [s["estimator"] for s in specs]
    log(f"{NAME} V5 OOS(FF) dev: prod params {R['V5']['oos_ff_prod_params']['mean_abs_dev_pp']}pp vs PIT {R['V5']['oos_ff_pit_params']['mean_abs_dev_pp']}pp; "
        f"OH p75 level |rel diff| median {R['V5']['oh_p75_level_rel_diff']['median']:.3f}; estimator differs on {est_diff:.0%} of days; "
        f"prod-params own OOS year dev {R['V5']['prod_oos_year_prod_params']['mean_abs_dev_pp']}pp; pre-fold (in-sample) dev {R['V5']['pre_fold_prod_params']['mean_abs_dev_pp']}pp")

    # V6 event tags
    cov = np.array([t is not None for t in tag])
    R["V6_tags"] = {"covered_days": int(cov.sum()), "uncovered_days": int((~cov).sum()),
                    "uncovered_from": str(dates[~cov].min().date()) if (~cov).any() else None,
                    "tag_counts_covered": pd.Series(tag[cov]).value_counts().to_dict(),
                    "prod_event_mults": prod["event"],
                    "mean_abs_log_mult_covered": float(np.mean(np.abs(np.log(mult(prod)[cov]))))}
    log(f"{NAME} V6 tags: {R['V6_tags']['covered_days']} covered, {R['V6_tags']['uncovered_days']} uncovered from {R['V6_tags']['uncovered_from']}")

    # V7 touch definitions on the reconstruction (live basis, PIT params; production params before fold 0)
    lv = {q: np.where((fold_of >= 0)[:, None], pit_ny[q], prod_ny[q]) for q in ("oh", "ol")}
    m1 = V.load_m1(key, root)
    m1 = m1[m1.index < pd.Timestamp("2026-08-21", tz="UTC")]
    loc = m1.tz_convert("Europe/London")
    loc = loc[loc.index.hour < 22]
    g = loc.groupby(loc.index.tz_localize(None).normalize())
    pos = {d: i for i, d in enumerate(dates)}
    rows = []
    for d, day in g:
        i = pos.get(d)
        if i is None or day.empty:
            continue
        o = day["open"].iloc[0]
        hi, lo, cl = day["high"].to_numpy(), day["low"].to_numpy(), day["close"].to_numpy()
        tmin = ((day.index.hour * 60 + day.index.minute)).to_numpy()
        hour = day.index.hour.to_numpy()
        h1_last = np.r_[hour[1:] != hour[:-1], True]           # last M1 of each clock hour = that H1 close
        first_up, first_dn = {}, {}
        for j, rn in enumerate(("p50", "p75", "p90")):
            up = o * (1 + lv["oh"][i, j] / 100)
            dn = o * (1 - lv["ol"][i, j] / 100)
            if not (np.isfinite(up) and np.isfinite(dn)):
                continue
            ku = np.flatnonzero(hi >= up)
            kd = np.flatnonzero(lo <= dn)
            hu = np.flatnonzero(h1_last & (cl >= up))
            hd = np.flatnonzero(h1_last & (cl <= dn))
            for side, k1, kh in (("up", ku, hu), ("dn", kd, hd)):
                rows.append({"date": d, "rung": rn, "side": side,
                             "m1": int(tmin[k1[0]]) if len(k1) else None,
                             "h1": int(tmin[kh[0]]) if len(kh) else None})
            first_up[rn] = ku[0] if len(ku) else None
            first_dn[rn] = kd[0] if len(kd) else None
        rows.append({"date": d, "rung": "any", "side": "both_same_minute",
                     "m1": int(any(a is not None and a == b for a in first_up.values() for b in first_dn.values())), "h1": None})
    t = pd.DataFrame(rows)
    v7 = {}
    for (rn, side), g2 in t[t.rung != "any"].groupby(["rung", "side"]):
        m1t, h1t = g2.m1.notna(), g2.h1.notna()
        lag = (g2.h1 - g2.m1)[m1t & h1t]
        v7[f"{side}_{rn}"] = {"days": int(len(g2)), "m1_touch": float(m1t.mean()), "h1_close_beyond": float(h1t.mean()),
                             "touched_never_closed_beyond": float((m1t & ~h1t).sum() / max(m1t.sum(), 1)),
                             "median_lag_min": float(lag.median()) if len(lag) else None}
    amb = t[t.rung == "any"]
    v7["two_sided_same_minute_days"] = int(amb.m1.sum())
    R["V7_touch"] = v7
    log(f"{NAME} V7 touches: " + "; ".join(f"{k} m1 {v['m1_touch']:.3f} h1 {v['h1_close_beyond']:.3f} never-closed {v['touched_never_closed_beyond']:.2f} lag {v['median_lag_min']}"
                                             for k, v in v7.items() if isinstance(v, dict)) + f"; two-sided same-minute days {v7['two_sided_same_minute_days']}")
    res["instruments"][NAME] = R

# V8 NQ: Yahoo NQ=F (what production uses) vs OANDA NAS100 NY-close history, same estimator
try:
    raw = json.loads(urllib.request.urlopen(urllib.request.Request(
        "https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?range=10y&interval=1d",
        headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read())
    rr_ = raw["chart"]["result"][0]
    q_ = rr_["indicators"]["quote"][0]
    y = pd.DataFrame({"open": q_["open"], "high": q_["high"], "low": q_["low"], "close": q_["close"]},
                     index=pd.to_datetime(rr_["timestamp"], unit="s").normalize()).dropna()
    y = y[(y > 0).all(axis=1)]
    est = prod_params("NQ")["estimator"]
    sy = pd.Series(V.ESTIMATORS[est](y), index=y.index)
    ny = pd.DataFrame(json.load(open(NYD / "NQ.json"))).rename(columns=dict(o="open", h="high", l="low", c="close"))
    ny.index = pd.DatetimeIndex(ny.pop("d"))
    so = pd.Series(V.ESTIMATORS[est](ny), index=ny.index)
    j = pd.concat([sy.rename("yahoo"), so.rename("oanda")], axis=1).dropna()
    j = j[j.index <= LAST]
    r8 = (j.oanda / j.yahoo)
    res["V8_nq_oanda_over_yahoo"] = {"n": int(len(r8)), "from": str(j.index.min().date()), "median": float(r8.median()),
                                    "p5": float(r8.quantile(0.05)), "p95": float(r8.quantile(0.95)),
                                    "by_year_median": {int(k): round(float(v), 3) for k, v in r8.groupby(r8.index.year).median().items()}}
    log("V8 NQ sigma OANDA/Yahoo:", json.dumps(res["V8_nq_oanda_over_yahoo"]))
except Exception as e:  # noqa: BLE001
    res["V8_nq_oanda_over_yahoo"] = {"error": str(e)}
    log("V8 failed:", e)

(OUT / "validate_hist.json").write_text(json.dumps(res, indent=1, default=str))
(OUT / "validate_hist.log").write_text("\n".join(LOG) + "\n")
