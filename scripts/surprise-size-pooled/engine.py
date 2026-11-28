"""surprise-size-pooled engine. See forge/SURPRISE_SIZE_POOLED_PREREG.md.

    python engine.py power   # control sample only (week-before windows): residual SDs for the power table
    python engine.py run     # the registered test (only after the prereg is pushed)

Reads M1 READ-ONLY from the main checkout. One seed: 20261128.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

MAIN = Path(r"C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE))
from forge import vol as V  # noqa: E402

OUT = HERE / "analysis" / "output" / "surprise-size-pooled"
M1_ROOT = MAIN / "VolRangeForecaster" / "data" / "m1"
SEED = 20261128
START = pd.Timestamp("2016-01-05", tz="UTC")       # M1 starts 2016-01-04; 1 day for pre-window
END = pd.Timestamp("2025-04-08", tz="UTC")         # FF archive ends 2025-04-07
SPLIT = pd.Timestamp("2021-01-01", tz="UTC")
ZCAP = 5.0
WINDOWS = {"w30": 30, "w120": 120, "ros": None}
HOME = {"US": "eurusd", "EU": "eurusd", "GB": "gbpusd", "JP": "usdjpy", "AU": "audusd",
        "NZ": "nzdusd", "CA": "usdcad", "CH": "usdchf"}
US_RISK = ["nq", "spx500", "gold"]
PARAM_NAME = {"eurusd": "EURUSD", "gbpusd": "GBPUSD", "usdjpy": "USDJPY", "audusd": "AUDUSD",
              "nzdusd": "NZDUSD", "usdcad": "USDCAD", "usdchf": "USDCHF", "nq": "NQ",
              "spx500": "SPX", "gold": "GOLD"}
PAIR_CCY = {"eurusd": {"EUR", "USD"}, "gbpusd": {"GBP", "USD"}, "usdjpy": {"JPY", "USD"},
            "audusd": {"AUD", "USD"}, "nzdusd": {"NZD", "USD"}, "usdcad": {"CAD", "USD"},
            "usdchf": {"CHF", "USD"}, "nq": {"USD"}, "spx500": {"USD"}, "gold": {"USD"}}
ECON_CCY = {"US": "USD", "EU": "EUR", "GB": "GBP", "JP": "JPY", "AU": "AUD", "NZ": "NZD",
            "CA": "CAD", "CH": "CHF"}


# ── production forecast (shipped estimator x hl p50 width x event multiplier) ──────────
def ladder_params() -> dict:
    js = ("import('file:///" + str(HERE / "js" / "forecastLadderParams.js").replace("\\", "/") +
          "').then(m=>console.log(JSON.stringify(m.LADDER_PARAMS.pairs)))")
    return json.loads(subprocess.check_output(["node", "-e", js], text=True))


_FOMC = r"fomc statement|federal funds rate|fomc press conference|fomc economic projections"
_NFP = r"non-farm employment change|^non-farm payrolls"
_CPI = r"^cpi (?:m/m|y/y)|^core cpi (?:m/m|y/y)"
RANK = {"FOMC": 6, "NFP": 5, "CPI": 4, "high": 3, "holiday": 2, "none": 1}


def ff_tags_corrected() -> pd.DataFrame:
    """forge/ff_calendar.event_tags logic on CORRECTED dates (placeholder rows: FF raw date;
    real-clock rows: London date of the UTC instant, +60 min fix for +04:30 stamps 2023+).
    Returns rows (date, Currency, bucket)."""
    raw = pd.read_csv(MAIN / "data" / "calendar" / "ff_calendar_2007_2025.csv",
                      usecols=["DateTime", "Currency", "Impact", "Event"], low_memory=False)
    raw = raw.drop_duplicates(["DateTime", "Currency", "Event"])
    t = pd.to_datetime(raw["DateTime"], utc=True)
    ph = t.dt.strftime("%H:%M").isin({"19:30", "20:30", "23:30", "23:59"})
    fix = (~ph) & raw["DateTime"].str[-6:].eq("+04:30") & (t.dt.year >= 2023)
    t = t + pd.to_timedelta(np.where(fix, 60, 0), unit="m")
    ldate = t.dt.tz_convert("Europe/London").dt.tz_localize(None).dt.normalize()
    date = np.where(ph, pd.to_datetime(raw["DateTime"].str[:10]), ldate)
    ev = raw["Event"].astype(str).str.strip().str.lower()
    imp = raw["Impact"].astype(str).str.split().str[0].str.lower()
    usd = raw["Currency"].eq("USD")
    hol = ev.str.contains("bank holiday", na=False)
    b = np.where(usd & ev.str.contains(_FOMC, regex=True, na=False), "FOMC",
        np.where(usd & ev.str.contains(_NFP, regex=True, na=False), "NFP",
        np.where(usd & ev.str.contains(_CPI, regex=True, na=False), "CPI",
        np.where(imp.eq("high"), "high", np.where(hol, "holiday", "none")))))
    return pd.DataFrame({"date": pd.to_datetime(date), "Currency": raw["Currency"].values, "bucket": b})


def tag_map(tags: pd.DataFrame, ccys: set) -> dict:
    sub = tags[tags["Currency"].isin(ccys | {"USD"})].copy()
    sub["r"] = sub["bucket"].map(RANK)
    best = sub.sort_values("r").groupby("date")["bucket"].last()
    return {d.strftime("%Y-%m-%d"): b for d, b in best.items()}


def prod_forecast(asset: str, params: dict, tags: pd.DataFrame) -> pd.DataFrame:
    """London date -> log production daily HL forecast parts (sigma*width, event mult)."""
    p = params[PARAM_NAME[asset]]
    daily = V.load_daily(asset, data_root=str(M1_ROOT), session="london22", end="2025-04-09")
    sig = V.as_of_yesterday(V.ESTIMATORS[p["estimator"]](daily))
    ld = V.london_date(daily.index)
    tm = tag_map(tags, PAIR_CCY[asset])
    tag = [tm.get(d.strftime("%Y-%m-%d"), "none") for d in ld]
    em = np.array([p["event"].get(t, 1.0) for t in tag])
    base = sig / V.SQRT252 * p["width"]["hl"][0]
    return pd.DataFrame({"ldate": ld, "log_base": np.log(base), "log_evmult": np.log(em), "tag": tag}).set_index("ldate")


# ── M1 windows ─────────────────────────────────────────────────────────────────
class M1:
    def __init__(self, asset: str):
        df = pd.read_parquet(M1_ROOT / f"{asset}_m1.parquet")
        if not isinstance(df.index, pd.DatetimeIndex):
            df = df.set_index(pd.to_datetime(df["time"], utc=True))
        df = df[~df.index.duplicated()].sort_index()
        df = df[(df.index >= START - pd.Timedelta(days=40)) & (df.index < END + pd.Timedelta(days=2))]
        self.t = df.index.asi8 // 60_000_000_000          # minutes since epoch
        self.h = df["high"].to_numpy(float)
        self.l = df["low"].to_numpy(float)
        self.c = df["close"].to_numpy(float)

    def rng(self, a: int, b: int, min_frac: float = 0.6):
        """(H-L)/ref*100 over minutes [a, b); ref = last close before a (within 10 min)."""
        i = np.searchsorted(self.t, a)
        j = np.searchsorted(self.t, b)
        if j - i < max(1, min_frac * (b - a)) or i == 0 or a - self.t[i - 1] > 10:
            return np.nan
        ref = self.c[i - 1]
        return (self.h[i:j].max() - self.l[i:j].min()) / ref * 100.0


def london22_end_min(t0: pd.Timestamp) -> int:
    lt = t0.tz_convert("Europe/London")
    end = lt.normalize() + pd.Timedelta(hours=22)
    return int(end.tz_convert("UTC").value // 60_000_000_000)


def window_bounds(t0m: int, t0: pd.Timestamp, w: str):
    if w == "ros":
        e = london22_end_min(t0)
        if e - t0m < 60:
            return None
        return t0m, e
    return t0m, t0m + WINDOWS[w]


def measure(m: M1, t0: pd.Timestamp, w: str):
    """outcome, pre60, tod20 for one window starting at t0."""
    t0m = int(t0.value // 60_000_000_000)
    wb = window_bounds(t0m, t0, w)
    if wb is None:
        return np.nan, np.nan, np.nan
    a, b = wb
    y = m.rng(a, b)
    pre = m.rng(t0m - 60, t0m)
    hist = []
    tl = t0.tz_convert("Europe/London")
    for k in range(1, 41):
        if len(hist) >= 20:
            break
        dl = tl - pd.DateOffset(days=k)          # same London wall clock, k days earlier
        if dl.dayofweek >= 5:
            continue
        dd = dl.tz_convert("UTC")
        wb2 = window_bounds(int(dd.value // 60_000_000_000), dd, w)
        if wb2 is None:
            continue
        v = m.rng(*wb2)
        if np.isfinite(v) and v > 0:
            hist.append(v)
    tod = float(np.median(hist)) if len(hist) >= 10 else np.nan
    return y, pre, tod


# ── events ─────────────────────────────────────────────────────────────────────
def load_events() -> tuple[pd.DataFrame, pd.DataFrame]:
    r = pd.read_parquet(OUT / "releases.parquet")
    r = r[(r["t0"] >= START) & (r["t0"] < END)].copy()
    r["t0"] = r["t0"].dt.floor("min")
    cont = r[r["z"].notna()].copy()
    cont["zc"] = cont["z"].clip(upper=ZCAP)
    imp_rank = {"medium": 1, "high": 2}
    cont["ir"] = cont["impact"].map(imp_rank)
    cont = cont.sort_values(["econ", "t0", "zc"])
    g = cont.groupby(["econ", "t0"])
    ev = g.agg(zc=("zc", "max"), zmean=("zc", "mean"), n_series=("zc", "size"), ir=("ir", "max"),
               any_imputed=("time_imputed", "max")).reset_index()
    lead = g.tail(1)[["econ", "t0", "Event", "family", "Currency"]].rename(columns={"Event": "lead"})
    ev = ev.merge(lead, on=["econ", "t0"])
    ev["impact"] = np.where(ev["ir"] == 2, "high", "medium")
    disc = r[r["discrete"]].groupby(["econ", "t0"]).agg(any_surprise=("any_surprise", "max"),
                                                       lead=("Event", "first"),
                                                       Currency=("Currency", "first")).reset_index()
    return ev, disc, r


def concurrent_flag(ev: pd.DataFrame, allrel: pd.DataFrame, asset: str) -> np.ndarray:
    """1 if a release of ANOTHER economy whose currency is in the asset fires within
    [t0-15m, t0+30m]."""
    ccys = PAIR_CCY[asset]
    other = allrel[["econ", "t0", "Currency"]].drop_duplicates(["econ", "t0"])
    out = np.zeros(len(ev), int)
    for k, (e, t0) in enumerate(zip(ev["econ"], ev["t0"])):
        o = other[(other["econ"] != e) & other["Currency"].isin(ccys)]
        dt = (o["t0"] - t0).dt.total_seconds() / 60
        out[k] = int(((dt >= -15) & (dt <= 30)).any())
    return out


def build_panel(mode: str) -> pd.DataFrame:
    ev, disc, allrel = load_events()
    params = ladder_params()
    tags = ff_tags_corrected()
    rows = []
    assets = {}
    for e, a in HOME.items():
        assets.setdefault(a, []).append(("fx", e))
    for a in US_RISK:
        assets.setdefault(a, []).append(("risk", "US"))
    other_by_ccy = allrel[["econ", "t0", "Currency"]].drop_duplicates(["econ", "t0"])
    for asset, uses in assets.items():
        m = M1(asset)
        pf = prod_forecast(asset, params, tags)
        econs = [e for _, e in uses]
        grp = uses[0][0]
        for kind, src in (("cont", ev), ("disc", disc)):
            sub = src[src["econ"].isin(econs)].copy()
            if mode == "power":
                if kind == "disc":
                    continue
                # control sample: the same London clock exactly one week earlier, kept only
                # when no release of the same economy sits within +/-3 h of it
                sub["t_obs"] = sub["t0"].dt.tz_convert("Europe/London").map(lambda x: x - pd.DateOffset(days=7)).dt.tz_convert("UTC")
                same = allrel.groupby("econ")["t0"].apply(lambda s: np.sort(s.values.astype("datetime64[m]").astype(np.int64)))
                keep = []
                for e, to in zip(sub["econ"], sub["t_obs"]):
                    arr = same[e]
                    x = int(to.value // 60_000_000_000)
                    j = np.searchsorted(arr, x)
                    near = any(abs(arr[q] - x) <= 180 for q in (j - 1, j) if 0 <= q < len(arr))
                    keep.append(not near)
                sub = sub[np.array(keep)]
            else:
                sub["t_obs"] = sub["t0"]
            ccys = PAIR_CCY[asset]
            for _, rw in sub.iterrows():
                t0 = rw["t_obs"]
                o = other_by_ccy[(other_by_ccy["econ"] != rw["econ"]) & other_by_ccy["Currency"].isin(ccys)]
                dt = (o["t0"] - t0).dt.total_seconds() / 60
                conc = int(((dt >= -15) & (dt <= 30)).any())
                ld = t0.tz_convert("Europe/London").tz_localize(None).normalize()
                if ld not in pf.index:
                    continue
                pr = pf.loc[ld]
                for w in WINDOWS:
                    y, pre, tod = measure(m, t0, w)
                    rows.append({"asset": asset, "grp": grp, "kind": kind, "econ": rw["econ"],
                                 "t0": rw["t0"], "t_obs": t0, "window": w, "lead": rw["lead"],
                                 "family": rw.get("family"), "impact": rw.get("impact"),
                                 "zc": rw.get("zc"), "zmean": rw.get("zmean"),
                                 "any_surprise": rw.get("any_surprise"),
                                 "imputed": rw.get("any_imputed"), "conc": conc,
                                 "y": y, "pre60": pre, "tod20": tod,
                                 "log_base": pr["log_base"], "log_evmult": pr["log_evmult"],
                                 "tag": pr["tag"], "ldate": ld})
        print(asset, "done", len(rows), flush=True)
    p = pd.DataFrame(rows)
    ok = (p["y"] > 0) & (p["pre60"] > 0) & (p["tod20"] > 0) & np.isfinite(p["log_base"])
    p["valid"] = ok
    return p


# ── regression ────────────────────────────────────────────────────────────────
CTRL = ["lpre", "ltod", "log_base", "log_evmult", "conc"]


def design(d: pd.DataFrame, xvar: str | list | None = "zc", fe: str = "lead_fe"):
    d = d.copy()
    d["ly"] = np.log(d["y"])
    d["lpre"] = np.log(d["pre60"])
    d["ltod"] = np.log(d["tod20"])
    d["lead_fe"] = d["econ"] + "|" + d["lead"].astype(str)
    xs = ([] if xvar is None else ([xvar] if isinstance(xvar, str) else list(xvar))) + CTRL
    X = d[xs].to_numpy(float)
    y = d["ly"].to_numpy(float)
    # within-transform on the fixed effect (Frisch-Waugh)
    gid = pd.factorize(d[fe])[0]
    def demean(v):
        s = np.zeros((gid.max() + 1,) + v.shape[1:])
        np.add.at(s, gid, v)
        cnt = np.bincount(gid).astype(float)
        return v - (s / (cnt.reshape((-1,) + (1,) * (v.ndim - 1))))[gid]
    Xd = demean(X)
    yd = demean(y)
    cl = pd.factorize(d["ldate"])[0]
    return Xd, yd, cl, xs, int(gid.max() + 1)


def ols_cr(Xd, yd, cl, n_fe):
    b, *_ = np.linalg.lstsq(Xd, yd, rcond=None)
    e = yd - Xd @ b
    XtX_inv = np.linalg.pinv(Xd.T @ Xd)
    G = cl.max() + 1
    S = np.zeros((G, Xd.shape[1]))
    np.add.at(S, cl, Xd * e[:, None])
    n, k = Xd.shape
    adj = G / (G - 1) * (n - 1) / max(n - k - n_fe, 1)
    V_ = adj * XtX_inv @ (S.T @ S) @ XtX_inv
    return b, np.sqrt(np.diag(V_)), e


def cluster_boot(Xd, yd, cl, B, rng, col=0):
    G = cl.max() + 1
    idx_by = [np.where(cl == g)[0] for g in range(G)]
    out = np.empty(B)
    for bi in range(B):
        pick = rng.integers(0, G, G)
        ii = np.concatenate([idx_by[g] for g in pick])
        bb, *_ = np.linalg.lstsq(Xd[ii], yd[ii], rcond=None)
        out[bi] = bb[col]
    return out


def main(mode: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cache = OUT / f"panel_{mode}.parquet"
    if cache.exists():
        p = pd.read_parquet(cache)
    else:
        p = build_panel(mode)
        p.to_parquet(cache, index=False)
    if mode == "power":
        power(p)
    else:
        import score
        score.score(p)


def power(p: pd.DataFrame) -> None:
    """Residual SD of log window range given the controls, on the CONTROL sample (week-
    before windows). No release-window outcome is read. MDE for gamma on z."""
    from math import sqrt
    ev, _, _ = load_events()
    sdz = float(ev["zc"].std())
    res = {"sd_zc_events": round(sdz, 4), "n_events_cont": int(len(ev)), "cells": {}}
    zc = 2.807 + 0.8416      # two-sided 0.05/12 ~ 0.00417 -> z 2.87; use Holm worst case
    zc = 2.865 + 0.8416
    for grp, assets in (("fx", None), ("nq", ["nq"]), ("spx500", ["spx500"]), ("gold", ["gold"])):
        for w in WINDOWS:
            d = p[(p["kind"] == "cont") & p["valid"] & (p["window"] == w)]
            d = d[d["grp"] == "fx"] if grp == "fx" else d[d["asset"] == assets[0]]
            if len(d) < 50:
                continue
            Xd, yd, cl, xs, nfe = design(d, xvar=None)
            b, se, e = ols_cr(Xd, yd, cl, nfe)
            sd = float(e.std())
            # design effect from date clustering of the residual
            G = cl.max() + 1
            m_bar = len(e) / G
            s = np.zeros(G); np.add.at(s, cl, e)
            icc_num = (s ** 2).sum() - (e ** 2).sum()
            pairs = (np.bincount(cl) ** 2 - np.bincount(cl)).sum()
            icc = icc_num / pairs / e.var() if pairs > 0 else 0.0
            deff = 1 + (m_bar - 1) * max(icc, 0)
            n = len(d)
            se_g = sd / (sdz * sqrt(n)) * sqrt(deff)
            mde = zc * se_g
            res["cells"][f"{grp}_{w}"] = {"n_control": n, "resid_sd": round(sd, 4), "deff": round(deff, 3),
                                          "se_gamma": round(se_g, 5), "mde_gamma": round(mde, 4),
                                          "mde_uplift_0.5_to_2": round(float(np.exp(1.5 * mde) - 1), 4)}
    (OUT / "power.json").write_text(json.dumps(res, indent=2))
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "power")
