"""Futures Line Lab: one runner for the vol-line touch analyses on NQ / 6E / GC futures, driven by a JSON config.

EXPLORATORY tool (register row futures-line-lab). Each run is a descriptive look; nothing here is a pre-registered test.
A run that looks interesting goes to a prereg on its own slug before anything is claimed.

It stores the steps done so far as presets (scripts/futures-line-lab/presets/) so any calculation can be swapped:
  01  MAE / MFE at every touch, all line families          (line-touch-mae-futures v2)
  02  stacks: lines close together, lone vs stacked         (v2 / v3, plus the sigma-unit check)
  03  better level + median-MAE stop / median-MFE target race (v3)
  04  fade to a frozen session VWAP, 0.25 sigma stop        (futures-exhaustion-vwap baseline cells)
  05  fade to VWAP with the median-MAE stop                 (2026-11-18 check)

Touches, lines, re-arm rule, session and data are exactly scripts/line-touch-mae-futures/build.py's:
  NT8 continuous unadjusted 1-minute bars (end-stamped -> moved back 1 minute), London 00:00-22:00 session,
  days with < 90% of bars skipped, re-arm after 0.1 sigma back on the open side.
Every bar is walked minute by minute. A bar that reaches both stop and target is counted as a stop.
Lockbox: dates >= 2026-08-21 are always excluded.

    python -I scripts/futures-line-lab/lab.py scripts/futures-line-lab/presets/03-better-level-race.json
    python -I scripts/futures-line-lab/lab.py <preset> --name my-run --set trade.stop.mult=0.3 --set select.set=better
    python -I scripts/futures-line-lab/lab.py --list          # show saved runs

Config keys (all optional except steps; see presets and README.md):
  instruments  ["NQ","EURUSD","GOLD"]
  select       kinds ["line"] (+ "placebo_085","placebo_115"), groups ["OH/OL","OC","HL"], rungs, sides ["up","dn"],
               set all|better|first|better_first, stack {unit: ticks|sigma, width}, query "<pandas query>",
               dedupe_bar false (one touch per bar+side, the outermost line, as futures-exhaustion-vwap)
  by           grouping for the tables, e.g. ["instrument","group","rung"]
  steps        any of "excursions", "stacks", "trade"
  trade        mode fade|continue|both, horizon "60m"|"240m"|"eod"|minutes,
               stop   {type: sigma, mult} | {type: ticks, n} | {type: median_mae, horizon, units: price|sigma,
                       fit: all|discovery, fit_on: selected|all_lines, fit_by: [cols]}
               target {type: vwap, anchor: london|globex|rth} | {type: median_mfe, ...same as median_mae}
                      | {type: sigma, mult} | {type: ticks, n} | {type: rr, mult}  (rr = mult x stop)
               cost   {ticks, commission_usd} (0 = gross only), min_k 30 (VWAP needs some bars)
  splits       discovery_end "2023-01-01"
  boot         {B: 1000, seed}
VWAP anchors (typical price x exchange volume, reset when the contract changes):
  london  from 00:00 London (the session the lines are fitted on; default)
  globex  CME session from 18:00 New York
  rth     cash session from 09:30 New York (touches before the cash open have no target and are skipped)
The target is the VWAP at the bar BEFORE the touch, frozen for the trade (a moving VWAP is a known artefact).
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import pickle
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts/line-touch-mae-futures"))
import build as B  # noqa: E402

OUT = ROOT / "analysis/output/futures-line-lab"
CACHE = OUT / "cache"
LOCKBOX = "2026-08-21"
NEVER = 10**9
HS = {"60m": 60, "240m": 240, "eod": None}
USD_PER_TICK = {"NQ": 5.0, "EURUSD": 6.25, "GOLD": 10.0}
CACHE_VERSION = 1

DEFAULTS = {
    "instruments": ["NQ", "EURUSD", "GOLD"],
    "lines": "v3",
    "select": {"kinds": ["line"], "groups": None, "rungs": None, "sides": None, "set": "all",
               "stack": {"unit": "ticks", "width": 5}, "query": None, "dedupe_bar": False},
    "by": ["instrument"],
    "steps": [],
    "trade": {"mode": "fade", "horizon": "60m", "stop": {"type": "sigma", "mult": 0.25},
              "target": {"type": "rr", "mult": 1.0}, "cost": {"ticks": 0, "commission_usd": 0}, "min_k": 30},
    "splits": {"discovery_end": "2023-01-01"},
    "boot": {"B": 1000, "seed": 20261118},
}


# ---------------------------------------------------------------- data -----------------------------------------------
def _vwaps(f):
    """Cumulative VWAP under the three anchors, on the full series (before the 22:00 cut)."""
    tp = (f["high"] + f["low"] + f["close"]) / 3
    pv = tp * f["volume"]
    et = f["t"].dt.tz_convert("America/New_York")
    keys = {
        "london": f["lon_date"],
        "globex": (et + pd.Timedelta(hours=6)).dt.strftime("%Y-%m-%d"),
        "rth": et.dt.strftime("%Y-%m-%d"),
    }
    et_min = et.dt.hour * 60 + et.dt.minute
    out = {}
    for name, key in keys.items():
        k = key.astype(str) + "|" + f["contract"].astype(str)
        v, p = f["volume"].astype(float), pv.astype(float)
        if name == "rth":
            ok = (et_min >= 570) & (et_min < 960)
            v, p = v.where(ok, 0.0), p.where(ok, 0.0)
        cv, cp = v.groupby(k).cumsum(), p.groupby(k).cumsum()
        w = (cp / cv).where(cv > 0)
        if name == "rth":
            w = w.where((et_min >= 570) & (et_min < 960))
        out[name] = w.to_numpy(float)
    return out


# ladder-v2 futures sigma per instrument (as scripts/ladder-v2/export_shadow.py FUT pastes; ledger ladder-v2-nq/-gold/
# -eurusd): walk-forward widths from analysis/output/ladder-v2-<sym>/test_F.parquet, sessions 2018-01-02 -> 2026-08-21.
V2_ARMS = {"NQ": ("nq", "E6"), "GOLD": ("gold", "R5"), "EURUSD": ("eurusd", "HARCJ")}


def line_days(name, lines):
    """Per London day: widths (% of the open) and sigma. v3 = day-reconstruction archive (production calc, what the
    earlier runs used); v2 = the ladder-v2 futures sigma (re-synced volatility), same date key, 2018+ only."""
    days = pd.read_parquet(B.ARC / f"{name}_days.parquet")
    if lines == "v3":
        return days
    sub, arm = V2_ARMS[name]
    t = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sub}/test_F.parquet")
    t["date"] = pd.to_datetime(t["date"]).dt.strftime("%Y-%m-%d")
    cols = {"sigma_used_pct": arm}
    for r in ("50", "75", "90"):
        cols.update({f"oh_p{r}_pct": f"{arm}_oh_{r}", f"ol_p{r}_pct": f"{arm}_ol_{r}", f"oc_p{r}": f"{arm}_oc_{r}",
                     f"hl_p{r}": f"{arm}_hl_{r}"})
    v = t[["date"] + list(cols.values())].rename(columns={b: a for a, b in cols.items()})
    days = days.drop(columns=list(cols)).merge(v, on="date", how="inner")
    return days[np.isfinite(days[list(cols)]).all(axis=1)]


def load_instrument(name, lines="v3"):
    """Touch table (every line, every kind) + per-day bar arrays, cached."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cp = CACHE / (f"{name}_v{CACHE_VERSION}.pkl" if lines == "v3" else f"{name}_{lines}_v{CACHE_VERSION}.pkl")
    if cp.exists():
        with open(cp, "rb") as fh:
            return pickle.load(fh)
    root, mult, tick, unit = B.MAP[name]
    days = line_days(name, lines)
    f = pd.read_parquet(B.FUT / f"{root}_1m_unadj.parquet")
    f["t"] = pd.to_datetime(f["timestamp"], utc=True) - pd.Timedelta(minutes=1)
    lon = f["t"].dt.tz_convert("Europe/London")
    codes, uniq = pd.factorize(lon.dt.normalize())
    f["lon_date"] = np.asarray(pd.DatetimeIndex(uniq).strftime("%Y-%m-%d"))[codes]
    f["lon_min"] = lon.dt.hour * 60 + lon.dt.minute
    for a, w in _vwaps(f).items():
        f["vwap_" + a] = w
    f = f[f["lon_min"] < 22 * 60]
    groups = {d: g for d, g in f.groupby("lon_date", sort=False)}
    rows, bars = [], {}
    for _, d in days.iterrows():
        if d["date"] >= LOCKBOX:
            continue
        g = groups.get(d["date"])
        if g is None or len(g) < B.MIN_BAR_SHARE * 22 * 60 or g["lon_min"].iloc[0] > 5:
            continue
        hi, lo, cl = (g[c].to_numpy(float) for c in ("high", "low", "close"))
        v = g["volume"].to_numpy(float)
        vw = {a: g["vwap_" + a].to_numpy(float) for a in ("london", "globex", "rth")}
        tp = (hi + lo + cl) / 3
        cv = np.cumsum(v)
        with np.errstate(invalid="ignore", divide="ignore"):
            sd = np.sqrt(np.maximum(np.cumsum(v * tp * tp) / cv - vw["london"] ** 2, 0))
        bars[d["date"]] = {"hi": hi, "lo": lo, "cl": cl, **{"vwap_" + a: x for a, x in vw.items()}}
        o = float(g["open"].iloc[0])
        sig = o * d["sigma_used_pct"] / 100.0
        run_hi, run_lo = np.maximum.accumulate(hi), np.minimum.accumulate(lo)
        mins = g["lon_min"].to_numpy()
        for kind, sc in B.SCALES.items():
            lv = B.day_levels(o, hi, lo, d, sc)
            names = list(lv)
            mat = np.vstack([lv[x] for x in names])
            for li, lname in enumerate(names):
                fam, rung = lname.split("_")
                up = B.FAMILIES[fam][0]
                s = 1 if up else -1
                for tn, k in enumerate(B.touches_for_line(hi, lo, lv[lname], up, B.REARM_SIG * sig), start=1):
                    L = float(lv[lname][k])
                    oth = np.delete(mat[:, k], li)
                    beyond = (oth - L) * s  # price units beyond this line, in the touch direction
                    near = np.abs(oth - L)
                    pv_ = v[max(k - 75, 0):max(k - 15, 0)].mean() if k > 15 else np.nan
                    rows.append({
                        "instrument": name, "date": d["date"], "kind": kind, "family": fam,
                        "group": B.FAMILY_GROUP[fam], "line": lname, "rung": rung, "side": "up" if up else "dn",
                        "up": up, "touch_n": tn, "k": int(k), "lon_hour": int(mins[k] // 60), "open": o,
                        "level": L, "sigma": sig, "weekday": int(d["weekday"]),
                        "near_ticks": float(near.min() * mult / tick) if len(near) else np.inf,
                        "near_sig": float(near.min() / sig) if len(near) else np.inf,
                        "beyond_ticks": [float(x) for x in np.sort(beyond[beyond > 0]) * mult / tick][:6],
                        "beyond_sig": [float(x) for x in np.sort(beyond[beyond > 0]) / sig][:6],
                        "within_ticks": [float(x) for x in np.sort(near) * mult / tick][:6],
                        "within_sig": [float(x) for x in np.sort(near) / sig][:6],
                        "stretch": s * (L - vw["london"][k - 1]) / sd[k - 1] if k > 0 and sd[k - 1] > 0 else np.nan,
                        "range_used": (run_hi[k - 1] - run_lo[k - 1]) / sig if k > 0 else np.nan,
                        "speed": abs(cl[k - 1] - cl[max(k - 31, 0)]) / sig if k > 0 else np.nan,
                        "vol_ratio": v[max(k - 15, 0):k].mean() / pv_ if pv_ and pv_ > 0 else np.nan,
                    })
    t = pd.DataFrame(rows)
    data = {"touches": t, "bars": bars, "mult": mult, "tick": tick, "unit": unit}
    with open(cp, "wb") as fh:
        pickle.dump(data, fh, protocol=pickle.HIGHEST_PROTOCOL)
    return data


# ---------------------------------------------------------------- selection ------------------------------------------
def stack_counts(t, st):
    unit, w = st.get("unit", "ticks"), st.get("width", 5)
    col_b, col_w = ("beyond_ticks", "within_ticks") if unit == "ticks" else ("beyond_sig", "within_sig")
    t["n_within"] = t[col_w].map(lambda xs: sum(1 for x in xs if x <= w))
    t["n_beyond"] = t[col_b].map(lambda xs: sum(1 for x in xs if x <= w))
    t["stacked"] = t["n_within"] > 0
    t["better"] = t["n_beyond"] == 0
    return t


def select(t, sel, discovery_end):
    t = t[t["kind"].isin(sel["kinds"])].copy()
    if sel.get("date_from"):
        t = t[t["date"] >= sel["date_from"]]
    if sel.get("dedupe_bar"):
        # one touch per (day, kind, bar, side): the outermost line, before any other filter (as futures-exhaustion-vwap)
        t = t.assign(_o=np.where(t["up"], t["level"], -t["level"]))
        t = t.sort_values(["date", "k", "_o"], kind="stable").groupby(["date", "kind", "k", "up"]).tail(1)
        t = t.drop(columns="_o")
    t = stack_counts(t, sel.get("stack") or {})
    for col, key in (("group", "groups"), ("rung", "rungs"), ("side", "sides")):
        if sel.get(key):
            t = t[t[col].isin(sel[key])]
    s = sel.get("set", "all")
    if s in ("better", "better_first"):
        t = t[t["better"]]
    if s in ("first", "better_first"):
        t = t[t["touch_n"] == 1]
    if sel.get("query"):
        t = t.query(sel["query"])
    t["split"] = np.where(t["date"] < discovery_end, "disc", "hold")
    return t.sort_values(["date", "k"]).reset_index(drop=True)


# ---------------------------------------------------------------- excursions -----------------------------------------
def excursions(t, bars, mult):
    """through / back from the line, in price units and sigma, over 60m / 240m / to 22:00."""
    n = len(t)
    for tag, H in HS.items():
        th, bk = np.zeros(n), np.zeros(n)
        for i, (dt, k, up, L) in enumerate(zip(t["date"], t["k"], t["up"], t["level"])):
            b = bars[dt]
            hi, lo = b["hi"], b["lo"]
            e = len(hi) if H is None else min(len(hi), k + H + 1)
            if up:
                th[i] = hi[k:e].max() - L
                bk[i] = L - lo[k + 1:e].min() if e > k + 1 else 0
            else:
                th[i] = L - lo[k:e].min()
                bk[i] = hi[k + 1:e].max() - L if e > k + 1 else 0
        t[f"through_{tag}"] = np.maximum(th, 0)
        t[f"back_{tag}"] = np.maximum(bk, 0)
        t[f"through_{tag}_sig"] = t[f"through_{tag}"] / t["sigma"]
        t[f"back_{tag}_sig"] = t[f"back_{tag}"] / t["sigma"]
    return t


def step_excursions(t, by, mult, tick):
    rows = []
    for key, g in t.groupby(by):
        r = dict(zip(by, key if isinstance(key, tuple) else (key,)))
        r["n"] = len(g)
        for tag in HS:
            for side in ("back", "through"):
                x = g[f"{side}_{tag}"] * mult / tick
                r[f"{side}_{tag}_p25_t"], r[f"{side}_{tag}_p50_t"], r[f"{side}_{tag}_p75_t"], r[f"{side}_{tag}_p90_t"] \
                    = x.quantile([.25, .5, .75, .9]).round(1)
                r[f"{side}_{tag}_p50_sig"] = round(float(g[f"{side}_{tag}_sig"].median()), 3)
            r[f"back_wins_{tag}"] = round(float((g[f"back_{tag}"] > g[f"through_{tag}"]).mean() * 100), 1)
        rows.append(r)
    return rows


def step_stacks(t, by):
    rows = []
    for key, g in t.groupby(by):
        r = dict(zip(by, key if isinstance(key, tuple) else (key,)))
        r["n"], r["stacked_pct"] = len(g), round(float(g["stacked"].mean() * 100), 1)
        r["better_pct"] = round(float(g["better"].mean() * 100), 1)
        r["sigma_med_lone"] = float(g.loc[~g["stacked"], "sigma"].median()) if (~g["stacked"]).any() else np.nan
        r["sigma_med_stacked"] = float(g.loc[g["stacked"], "sigma"].median()) if g["stacked"].any() else np.nan
        for lab, m in (("lone", ~g["stacked"]), ("stacked", g["stacked"])):
            s = g[m]
            r[f"{lab}_n"] = int(len(s))
            for tag in ("60m", "eod"):
                r[f"{lab}_back_{tag}_sig"] = round(float(s[f"back_{tag}_sig"].median()), 3) if len(s) else np.nan
                r[f"{lab}_through_{tag}_sig"] = round(float(s[f"through_{tag}_sig"].median()), 3) if len(s) else np.nan
                r[f"{lab}_back_wins_{tag}"] = round(float((s[f"back_{tag}"] > s[f"through_{tag}"]).mean() * 100), 1) \
                    if len(s) else np.nan
        rows.append(r)
    return rows


# ---------------------------------------------------------------- trade / race ---------------------------------------
def _median_fit(t, all_lines, spec, which, discovery_end):
    """Per-touch distance (price) from a median MAE/MFE fitted on the chosen population."""
    hz = spec.get("horizon", "60m")
    pop = t if spec.get("fit_on", "selected") == "selected" else all_lines
    if spec.get("fit", "all") == "discovery":
        pop = pop[pop["date"] < discovery_end]
    units = spec.get("units", "price")
    col = f"{which}_{hz}" + ("_sig" if units == "sigma" else "")
    fb = spec.get("fit_by") or []
    if fb:
        med = pop.groupby(fb)[col].median()
        vals = t[fb].apply(tuple, axis=1).map(lambda k: med.get(k if len(fb) > 1 else k[0], np.nan))
    else:
        vals = pd.Series(float(pop[col].median()), index=t.index)
    vals = vals.astype(float)
    return vals * t["sigma"] if units == "sigma" else vals


def distances(t, all_lines, tr, mult, tick, discovery_end, mode):
    """Stop distance and target PRICE per touch."""
    ss, ts = tr["stop"], tr["target"]
    if ss["type"] == "sigma":
        stop = ss["mult"] * t["sigma"]
    elif ss["type"] == "ticks":
        stop = pd.Series(ss["n"] * tick / mult, index=t.index)
    elif ss["type"] == "median_mae":
        stop = _median_fit(t, all_lines, ss, "through" if mode == "fade" else "back", discovery_end)
    else:
        raise ValueError(ss)
    s = np.where(t["up"], 1.0, -1.0)
    fav = -s if mode == "fade" else s  # favourable direction from the line
    if ts["type"] == "vwap":
        w = t["vwap_prev"]
        dist = (w - t["level"]) * fav  # >0 when VWAP is on the fade side
        if mode == "continue":
            dist = (t["level"] - w) * s  # mirror: same distance, beyond the line
        tdist = dist
    elif ts["type"] == "median_mfe":
        tdist = _median_fit(t, all_lines, ts, "back" if mode == "fade" else "through", discovery_end)
    elif ts["type"] == "sigma":
        tdist = ts["mult"] * t["sigma"]
    elif ts["type"] == "ticks":
        tdist = pd.Series(ts["n"] * tick / mult, index=t.index)
    elif ts["type"] == "rr":
        tdist = ts["mult"] * stop
    else:
        raise ValueError(ts)
    return stop.astype(float), tdist.astype(float), fav


def run_trades(t, bars, all_lines, tr, mult, tick, discovery_end, mode, inst):
    t = t.copy()
    anchor = tr["target"].get("anchor", "london") if tr["target"]["type"] == "vwap" else "london"
    t["vwap_prev"] = [bars[dt]["vwap_" + anchor][k - 1] if k > 0 else np.nan for dt, k in zip(t["date"], t["k"])]
    stop, tdist, fav = distances(t, all_lines, tr, mult, tick, discovery_end, mode)
    t["stop_dist"], t["tgt_dist"] = stop.to_numpy(), tdist.to_numpy()
    skip = np.full(len(t), "", dtype=object)
    skip[~np.isfinite(t["tgt_dist"]) | ~np.isfinite(t["stop_dist"])] = "no_target"
    skip[(np.isfinite(t["tgt_dist"])) & (t["tgt_dist"] * mult / tick < 2)] = "target_wrong_side"
    if tr["target"]["type"] == "vwap":
        skip[(t["k"] < tr.get("min_k", 30)).to_numpy() & (skip == "")] = "too_early"
    t["skip"] = skip
    H = tr.get("horizon", "60m")
    H = HS.get(H, H) if isinstance(H, str) else H
    cost_px = (tr["cost"].get("ticks", 0) + tr["cost"].get("commission_usd", 0) / USD_PER_TICK[inst]) * tick / mult
    out = np.full(len(t), "", dtype=object)
    pnl = np.full(len(t), np.nan)
    mins = np.full(len(t), np.nan)
    for i, (dt, k, up, L, S, T, sk) in enumerate(zip(t["date"], t["k"], t["up"], t["level"], t["stop_dist"],
                                                     t["tgt_dist"], skip)):
        if sk:
            continue
        b = bars[dt]
        hi, lo, cl = b["hi"], b["lo"], b["cl"]
        e = len(hi) if H is None else min(len(hi), k + H + 1)
        h, l = hi[k:e], lo[k:e]
        if mode == "fade":
            st_m = (h >= L + S) if up else (l <= L - S)
            tg_m = (l <= L - T) if up else (h >= L + T)
            tg_m[0] = False
            d = -1 if up else 1
        else:
            st_m = (l <= L - S) if up else (h >= L + S)
            st_m[0] = False
            tg_m = (h >= L + T) if up else (l <= L - T)
            d = 1 if up else -1
        si = np.flatnonzero(st_m)
        ti = np.flatnonzero(tg_m)
        si = si[0] if len(si) else NEVER
        ti = ti[0] if len(ti) else NEVER
        if si == ti == NEVER:
            out[i], pnl[i], mins[i] = "neither", d * (cl[e - 1] - L), e - 1 - k
        elif si == ti:
            out[i], pnl[i], mins[i] = "same_bar", -S, si
        elif si < ti:
            out[i], pnl[i], mins[i] = "stop", -S, si
        else:
            out[i], pnl[i], mins[i] = "target", T, ti
    t["outcome"], t["minutes"] = out, mins
    t["R_gross"] = pnl / t["stop_dist"]
    t["R_net"] = (pnl - cost_px) / t["stop_dist"]
    t["geo"] = t["stop_dist"] / (t["stop_dist"] + t["tgt_dist"]) * 100  # random walk: P(target before stop)
    t["mode"] = mode
    return t


def boot(df, col, rng, B_):
    if len(df) == 0:
        return np.nan, np.nan
    g = df.groupby("date")[col].agg(["sum", "count"])
    w = rng.multinomial(len(g), np.full(len(g), 1 / len(g)), size=B_)
    m = (w @ g["sum"].to_numpy()) / np.maximum(w @ g["count"].to_numpy(), 1)
    return float(np.quantile(m, .025)), float(np.quantile(m, .975))


def step_trade(tt, by, mult, tick, rng, B_):
    rows = []
    for key, g0 in tt.groupby(by + ["mode", "split"]):
        r = dict(zip(by + ["mode", "split"], key))
        g = g0[g0["skip"] == ""]
        r["n"], r["skipped"] = len(g), int((g0["skip"] != "").sum())
        if not len(g):
            rows.append(r)
            continue
        oc = g["outcome"].value_counts(normalize=True) * 100
        for o in ("target", "stop", "same_bar", "neither"):
            r[f"{o}_pct"] = round(float(oc.get(o, 0)), 1)
        res = oc.get("target", 0) + oc.get("stop", 0) + oc.get("same_bar", 0)
        r["target_share_resolved"] = round(float(oc.get("target", 0) / res * 100), 1) if res else np.nan
        r["random_walk_pct"] = round(float(g["geo"].mean()), 1)
        r["stop_ticks_med"] = round(float((g["stop_dist"] * mult / tick).median()), 1)
        r["target_ticks_med"] = round(float((g["tgt_dist"] * mult / tick).median()), 1)
        r["target_over_stop_med"] = round(float((g["tgt_dist"] / g["stop_dist"]).median()), 2)
        r["minutes_to_target_med"] = float(g.loc[g["outcome"] == "target", "minutes"].median()) \
            if (g["outcome"] == "target").any() else np.nan
        r["minutes_to_stop_med"] = float(g.loc[g["outcome"] == "stop", "minutes"].median()) \
            if (g["outcome"] == "stop").any() else np.nan
        r["R_gross"] = round(float(g["R_gross"].mean()), 3)
        r["R_net"] = round(float(g["R_net"].mean()), 3)
        lo, hi = boot(g, "R_net", rng, B_)
        r["R_net_lo"], r["R_net_hi"] = round(lo, 3), round(hi, 3)
        rows.append(r)
    return rows


# ---------------------------------------------------------------- runner ---------------------------------------------
def merge(a, b):
    out = copy.deepcopy(a)
    for k, v in b.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def set_path(cfg, path, value):
    keys = path.split(".")
    d = cfg
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    try:
        d[keys[-1]] = json.loads(value)
    except json.JSONDecodeError:
        d[keys[-1]] = value


def md_table(rows, cols=None):
    if not rows:
        return "_no rows_\n"
    df = pd.DataFrame(rows)
    if cols:
        df = df[[c for c in cols if c in df.columns]]
    return df.to_markdown(index=False) + "\n"


TRADE_COLS = ["instrument", "group", "rung", "set", "side", "touch_n", "mode", "split", "n", "stop_ticks_med",
              "target_ticks_med", "target_over_stop_med", "target_pct", "stop_pct", "same_bar_pct", "neither_pct",
              "target_share_resolved", "random_walk_pct", "minutes_to_target_med", "R_gross", "R_net", "R_net_lo",
              "R_net_hi"]


def run(cfg, name):
    cfg = merge(DEFAULTS, cfg)
    disc_end = cfg["splits"]["discovery_end"]
    by = cfg["by"]
    rng = np.random.default_rng(cfg["boot"]["seed"])
    res = {"excursions": [], "stacks": [], "trade": []}
    keep = []
    for inst in cfg["instruments"]:
        data = load_instrument(inst, cfg.get("lines", "v3"))
        mult, tick, bars = data["mult"], data["tick"], data["bars"]
        need = any(s in cfg["steps"] for s in ("excursions", "stacks")) or any(
            cfg["trade"][x]["type"] in ("median_mae", "median_mfe") for x in ("stop", "target"))
        t = select(data["touches"], cfg["select"], disc_end)
        all_lines = None
        if need:
            t = excursions(t, bars, mult)
            if "trade" in cfg["steps"] and any(cfg["trade"][x].get("fit_on") == "all_lines"
                                               for x in ("stop", "target")):
                al = data["touches"][data["touches"]["kind"] == "line"].copy()
                all_lines = excursions(al.reset_index(drop=True), bars, mult)
        print(f"{inst}: {len(t):,} touches selected", flush=True)
        if "excursions" in cfg["steps"]:
            res["excursions"] += step_excursions(t, by, mult, tick)
        if "stacks" in cfg["steps"]:
            res["stacks"] += step_stacks(t, by)
        if "trade" in cfg["steps"]:
            modes = ["fade", "continue"] if cfg["trade"]["mode"] == "both" else [cfg["trade"]["mode"]]
            for m in modes:
                tt = run_trades(t, bars, all_lines, cfg["trade"], mult, tick, disc_end, m, inst)
                res["trade"] += step_trade(tt, by, mult, tick, rng, cfg["boot"]["B"])
                keep.append(tt)
    stamp = datetime.now(timezone.utc)
    rd = OUT / "runs" / name
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "config.json").write_text(json.dumps(cfg, indent=2))
    meta = {"name": name, "ranAt": stamp.isoformat(timespec="seconds"), "status": "EXPLORATORY (not pre-registered)",
            "description": cfg.get("description", ""), "lockbox_excluded_from": LOCKBOX,
            "config_hash": hashlib.sha1(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:10]}
    (rd / "results.json").write_text(json.dumps({**meta, "results": res}, indent=1, default=float))
    if keep:
        pd.concat(keep, ignore_index=True).drop(columns=["beyond_ticks", "beyond_sig", "within_ticks", "within_sig"],
                                                errors="ignore").to_parquet(rd / "trades.parquet", index=False)
    md = [f"# {name}\n", f"{meta['status']}. Ran {meta['ranAt']}. Config hash {meta['config_hash']}.\n",
          f"{meta['description']}\n", "Config: `config.json`. Lockbox (>= 2026-08-21) excluded.\n"]
    if res["excursions"]:
        md += ["## Excursions (ticks; sigma medians; back-wins %)\n",
               md_table(res["excursions"], by + ["n"] + [f"{s}_{h}_p50_t" for h in HS for s in ("back", "through")]
                        + [f"back_{h}_p50_sig" for h in HS] + [f"back_wins_{h}" for h in HS])]
    if res["stacks"]:
        md += ["## Stacks (sigma medians)\n", md_table(res["stacks"])]
    if res["trade"]:
        md += ["## Trade / race\n", "random_walk_pct = stop / (stop + target), the target-first odds of a coin-flip "
               "path. target_share_resolved = target / (target + stop + same bar).\n",
               md_table(res["trade"], TRADE_COLS)]
    (rd / "SUMMARY.md").write_text("\n".join(md), encoding="utf-8")
    idx_p = OUT / "runs" / "index.json"
    idx = json.loads(idx_p.read_text()) if idx_p.exists() else []
    idx = [x for x in idx if x["name"] != name] + [meta]
    idx_p.write_text(json.dumps(sorted(idx, key=lambda x: x["name"]), indent=1))
    print((rd / "SUMMARY.md").read_text(encoding="utf-8"))
    print(f"saved -> {rd}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("config", nargs="?")
    ap.add_argument("--name")
    ap.add_argument("--set", action="append", default=[], help="dotted.key=json_value override")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        p = OUT / "runs" / "index.json"
        for x in (json.loads(p.read_text()) if p.exists() else []):
            print(f"{x['name']:40s} {x['ranAt']}  {x['description'][:80]}")
        return
    cfg = json.loads(Path(a.config).read_text())
    for s in a.set:
        k, v = s.split("=", 1)
        set_path(cfg, k, v)
    name = a.name or cfg.get("name") or Path(a.config).stem
    run(cfg, name)


if __name__ == "__main__":
    main()
