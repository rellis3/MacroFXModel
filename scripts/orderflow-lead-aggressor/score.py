#!/usr/bin/env python3
"""Score forge/ORDERFLOW_LEAD_AGGRESSOR_PREREG.md. Seed 20261107.

    python scripts/orderflow-lead-aggressor/score.py bars     # raw Databento trades -> 5-minute flow bars (local, no outcome read, no spend)
    python scripts/orderflow-lead-aggressor/score.py count    # sessions and bars per instrument, nothing about outcomes
    python scripts/orderflow-lead-aggressor/score.py score    # the scored run

Reads files already on disk and never calls Databento's paid API.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 20261107
B = 2000
BLOCK = 5
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/orderflow-lead-aggressor"
BASE = Path(os.environ.get("ORDERFLOW_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "orderflow"))
RAW = BASE / "raw" / "GLBX" / "trades"
CACHE = Path(os.environ.get("ORDERFLOW_5M_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "orderflow_5m"))
WINDOW = {"6E": ("2023-04-03", "2026-08-21"), "6J": ("2023-08-01", "2026-08-21")}
NB = 156              # 03:00 to 16:00 New York
OPEN_MIN = 180
SIGW = 60
SCORED = (5, 15)
DESC = (30, 60)
LONDON_BARS = 60      # 03:00 to 08:00 New York


def session_bars(t):
    """One New York day's trades (ts_event tz-aware UTC, price, size, side, instrument_id) -> arrays per bar, or None if the session is dropped."""
    loc = t.ts_event.dt.tz_convert("America/New_York")
    m = loc.dt.hour * 60 + loc.dt.minute - OPEN_MIN
    keep = (m >= 0) & (m < NB * 5)
    t, m = t[keep], m[keep]
    if t.empty:
        return None, "empty"
    if t.instrument_id.nunique() > 1:
        return None, "roll"
    b = (m // 5).to_numpy()
    px = t.price.to_numpy(float)
    sz = t["size"].to_numpy(float)
    sd = t.side.to_numpy()
    tick = np.sign(np.diff(px, prepend=px[0]))
    tick = pd.Series(np.where(tick == 0, np.nan, tick)).ffill().fillna(0).to_numpy()
    buy = np.bincount(b, sz * (sd == "B"), NB)
    sell = np.bincount(b, sz * (sd == "A"), NB)
    tbuy = np.bincount(b, sz * (tick > 0), NB)
    tsell = np.bincount(b, sz * (tick < 0), NB)
    none = sz[sd == "N"].sum()
    close = np.full(NB, np.nan)
    last = pd.Series(px).groupby(b).last()
    close[last.index.to_numpy()] = last.to_numpy()
    traded = np.isfinite(close).sum()
    if traded < .95 * NB:
        return None, "thin"
    first = px[0]
    close = pd.Series(close).ffill().fillna(first).to_numpy()
    return dict(buy=buy, sell=sell, tbuy=tbuy, tsell=tsell, close=close, first=first, none=none, vol=sz.sum()), "ok"


def bars():
    import databento as db
    CACHE.mkdir(parents=True, exist_ok=True)
    report = {}
    for root, (a, z) in WINDOW.items():
        days = {}
        counts = dict(ok=0, empty=0, roll=0, thin=0)
        files = sorted(p for p in (RAW / root).glob("*.dbn.zst"))
        # A raw file is one UTC day and a New York session 03:00-16:00 sits inside one UTC day, so a session is read from its own file.
        for f in files:
            d = f.name[:10]
            if d < a or d > z or pd.Timestamp(d).dayofweek >= 5:
                continue
            t = db.DBNStore.from_file(str(f)).to_df(pretty_ts=True, price_type="float", map_symbols=False)
            if "ts_event" not in t.columns:
                t = t.reset_index()
            t = t.sort_values("ts_event", kind="stable")
            s, why = session_bars(t[["ts_event", "instrument_id", "price", "size", "side"]])
            counts[why] += 1
            if s:
                days[d] = s
        rows = []
        for d, s in sorted(days.items()):
            for i in range(NB):
                rows.append((d, i, s["buy"][i], s["sell"][i], s["tbuy"][i], s["tsell"][i], s["close"][i], s["first"], s["none"], s["vol"]))
        pd.DataFrame(rows, columns="day i buy sell tbuy tsell close first none vol".split()).to_parquet(CACHE / f"{root}.parquet")
        report[root] = dict(window=[a, z], files=len(files), sessions=counts)
        print(root, report[root], flush=True)
    return report


def design(df):
    """One row per bar with what is known at its close."""
    days = sorted(df.day.unique())
    n = len(days)
    get = lambda c: df.pivot(index="day", columns="i", values=c).loc[days].to_numpy(float)
    close, buy, sell, tb, ts = get("close"), get("buy"), get("sell"), get("tbuy"), get("tsell")
    first = df.groupby("day")["first"].first().loc[days].to_numpy(float)
    prev = np.c_[first, close[:, :-1]]
    r = np.log(close / prev)
    flat = r.ravel()
    roll = pd.Series(flat).rolling(SIGW).std(ddof=0).shift(0).to_numpy().reshape(r.shape)   # includes the bar itself: known at its close
    with np.errstate(divide="ignore", invalid="ignore"):
        D = (buy - sell) / (buy + sell)
        T = (tb - ts) / (tb + ts)
    D30_b = np.apply_along_axis(lambda x: np.convolve(x, np.ones(6))[:NB], 1, buy)
    D30_s = np.apply_along_axis(lambda x: np.convolve(x, np.ones(6))[:NB], 1, sell)
    with np.errstate(divide="ignore", invalid="ignore"):
        D30 = (D30_b - D30_s) / (D30_b + D30_s)
    out = dict(days=days, n=n, D=D, T=T, raw=buy - sell, D30=D30, r0=r / roll, r1=np.c_[np.full(n, np.nan), r[:, :-1]] / roll, sig=roll)
    for h in SCORED + DESC:
        k = h // 5
        R = np.full(close.shape, np.nan)
        R[:, :NB - k] = np.log(close[:, k:] / close[:, :NB - k])
        out[f"R{h}"] = R / (roll * np.sqrt(k))
    return out


def zs(x):
    m = np.isfinite(x)
    return (x - x[m].mean()) / x[m].std()


def fit(ds, sig, h, sessions=None, mask=None):
    """Standardised OLS slope on the signal. Per-session cross-products make the bootstrap fast."""
    y = zs(ds[f"R{h}"])
    X = np.stack([zs(sig), zs(ds["r0"]), zs(ds["r1"])], axis=-1)
    ok = np.isfinite(y) & np.isfinite(X).all(-1)
    if mask is not None:
        ok &= mask
    return y, X, ok


def cross(y, X, ok):
    n = y.shape[0]
    XtX, Xty, N = np.zeros((n, 4, 4)), np.zeros((n, 4)), np.zeros(n)
    for k in range(n):
        m = ok[k]
        if not m.any():
            continue
        A = np.c_[np.ones(m.sum()), X[k][m]]
        XtX[k], Xty[k], N[k] = A.T @ A, A.T @ y[k][m], m.sum()
    return XtX, Xty, N


def solve(XtX, Xty):
    return float(np.linalg.solve(XtX.sum(0), Xty.sum(0))[1])


def cell(ds, h, rng, sig=None, boot=True):
    sig = ds["D"] if sig is None else sig
    y, X, ok = fit(ds, sig, h)
    XtX, Xty, N = cross(y, X, ok)
    est = solve(XtX, Xty)
    res = dict(slope=est, bars=int(N.sum()), sessions=int((N > 0).sum()))
    half = ds["n"] // 2
    res["first_half"] = solve(XtX[:half], Xty[:half])
    res["second_half"] = solve(XtX[half:], Xty[half:])
    if not boot:
        return res
    n = ds["n"]
    nb = int(np.ceil(n / BLOCK))
    st = np.empty(B)
    for b in range(B):
        pick = rng.integers(0, n - BLOCK + 1, nb)
        idx = (pick[:, None] + np.arange(BLOCK)).ravel()
        st[b] = solve(XtX[idx], Xty[idx])
    lo, hi = np.percentile(st, [2.5, 97.5])
    se = (hi - lo) / 3.92
    from math import erf, sqrt
    z = abs(est) / se if se > 0 else 0
    res.update(lo=float(lo), hi=float(hi), se=float(se), halfwidth=float((hi - lo) / 2), p=float(2 * (1 - .5 * (1 + erf(z / sqrt(2))))), t=float(est / se) if se else None)
    pl = []
    for k in range(1, 21):
        shifted = np.roll(sig, -k, axis=0)
        shifted[-k:, :] = np.nan
        yp, Xp, okp = fit(ds, shifted, h)
        a, c, _ = cross(yp, Xp, okp)
        pl.append(solve(a, c))
    res["placebo"] = pl
    res["placebo_mean"] = float(np.mean(pl))
    res["placebo_range"] = [float(np.percentile(pl, 2.5)), float(np.percentile(pl, 97.5))]
    return res


def load(root):
    return design(pd.read_parquet(CACHE / f"{root}.parquet"))


def count():
    res = {}
    for root in WINDOW:
        d = load(root)
        y, X, ok = fit(d, d["D"], 5)
        res[root] = dict(sessions=d["n"], first=d["days"][0], last=d["days"][-1], usable_bars_h5=int(ok.sum()))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "count_first.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, top = [0] * len(ps), 0
    for r, i in enumerate(order):
        top = max(top, min(1, ps[i] * (len(ps) - r)))
        adj[i] = top
    return adj


def score():
    rng = np.random.default_rng(SEED)
    cells, desc = {}, {}
    data = {r: load(r) for r in WINDOW}
    for root, d in data.items():
        for h in SCORED:
            cells[f"{root}_h{h}"] = cell(d, h, rng)
            print(root, h, {k: v for k, v in cells[f"{root}_h{h}"].items() if k != "placebo"}, flush=True)
        desc[root] = {}
        for h in DESC:
            desc[root][f"h{h}"] = cell(d, h, rng)
        for h in SCORED:
            desc[root][f"tick_rule_h{h}"] = cell(d, h, rng, sig=d["T"])
            desc[root][f"raw_delta_h{h}"] = cell(d, h, rng, sig=d["raw"], boot=False)
            desc[root][f"running_30m_h{h}"] = cell(d, h, rng, sig=d["D30"], boot=False)
            for name, a, b in (("london", 0, LONDON_BARS), ("us", LONDON_BARS, NB)):
                mask = np.zeros(d["D"].shape, bool)
                mask[:, a:b] = True
                y, X, ok = fit(d, d["D"], h, mask=mask)
                XtX, Xty, N = cross(y, X, ok)
                desc[root][f"{name}_h{h}"] = dict(slope=solve(XtX, Xty), bars=int(N.sum()))
        # hour-of-day slices at h = 5, for BH
        hours = {}
        for hb in range(13):
            mask = np.zeros(d["D"].shape, bool)
            mask[:, hb * 12:(hb + 1) * 12] = True
            y, X, ok = fit(d, d["D"], 5, mask=mask)
            XtX, Xty, N = cross(y, X, ok)
            est = solve(XtX, Xty)
            n, nb = d["n"], int(np.ceil(d["n"] / BLOCK))
            st = np.array([solve(XtX[i], Xty[i]) for i in ((rng.integers(0, n - BLOCK + 1, nb)[:, None] + np.arange(BLOCK)).ravel() for _ in range(500))])
            hours[f"{3 + hb:02d}"] = dict(slope=est, se=float(st.std()))
        desc[root]["hour_h5"] = hours
    names = list(cells)
    adj = holm([cells[k]["p"] for k in names])
    passed = {}
    for k, a in zip(names, adj):
        c = cells[k]
        c["holm_p"] = a
        c["same_sign"] = (c["first_half"] > 0) == (c["second_half"] > 0) == (c["slope"] > 0)
        c["outside_placebo"] = c["slope"] > c["placebo_range"][1] or c["slope"] < c["placebo_range"][0]
        c["above_bar"] = abs(c["slope"]) >= .05
        c["underpowered"] = c["halfwidth"] >= .05
        c["placebo_biased"] = abs(c["placebo_mean"]) > .01
        passed[k] = bool(a < .05 and c["above_bar"] and c["same_sign"] and c["outside_placebo"] and not c["placebo_biased"])
    both = any(passed[f"6E_h{h}"] and passed[f"6J_h{h}"] and (cells[f"6E_h{h}"]["slope"] > 0) == (cells[f"6J_h{h}"]["slope"] > 0) for h in SCORED)
    one = any(passed.values())
    under = any(c["underpowered"] for c in cells.values())
    voided = any(c["placebo_biased"] for c in cells.values())
    verdict = "underpowered" if voided or (under and not one) else "validated" if both else "context" if one else "null"
    out = dict(id="orderflow-lead-aggressor", verdict=verdict, voided_by_placebo=voided, ranAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), seed=SEED, B=B,
               prereg="forge/ORDERFLOW_LEAD_AGGRESSOR_PREREG.md", branch="main", cells=cells, passed=passed, descriptive=desc)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(out, indent=1, default=float))
    print("VERDICT", verdict, passed)
    for root in WINDOW:
        print(root, {k: (round(v["slope"], 4) if isinstance(v, dict) and "slope" in v else None) for k, v in desc[root].items() if k != "hour_h5"})


if __name__ == "__main__":
    {"bars": bars, "count": count, "score": score}[sys.argv[1]]()
