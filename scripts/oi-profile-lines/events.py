#!/usr/bin/env python3
"""oi-profile-lines: touch events at the replayed OI Profile lines and at shifted placebo lines.

Prereg: forge/OI_PROFILE_LINES_PREREG.md (definitions there are the authority; this file implements them).
  python scripts/oi-profile-lines/events.py <dataDir> [--outcomes]
Without --outcomes only the touch events and their pre-touch attributes are written (counts for the power table).
With --outcomes each touch also gets its race result and 60-minute excursions.

dataDir holds profiles.jsonl (replay.mjs), m1/<FK>.parquet (fetch_m1.py) and ../oi_raw_cache/vol_forecast_<date>.json.
Unit U = the day's forecast sigma in price units (dayMove). A = 0.25 U arm / race distance.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

D = Path(sys.argv[1])
OUTCOMES = "--outcomes" in sys.argv
# positive control (prereg §3): --synthetic P replaces each session's bars by a Gaussian random walk from the real start price,
# same bar count, per-bar sd = U / sqrt(1320); at REAL sites only, a crossing step is reflected with probability P.
SYNTH = float(sys.argv[sys.argv.index("--synthetic") + 1]) if "--synthetic" in sys.argv else None
RNG = np.random.default_rng(20261123)
A = 0.25          # arm distance and race barrier, in U
SITE_MERGE = 0.05  # lines closer than this (U) are one site
CONF_R = 0.10     # confluence radius (U)
PLACEBO_SHIFTS = (-0.5, -0.25, 0.25, 0.5)
PLACEBO_CLEAR = 0.10  # a placebo within this of any real line is dropped
H60 = 60
LDN = "Europe/London"


def sessions():
    for line in open(D / "profiles.jsonl"):
        r = json.loads(line)
        if not r.get("dayMove") or not r.get("savedAtMs"):
            continue
        t0 = pd.Timestamp(r["savedAtMs"], unit="ms", tz="UTC")
        dl = t0.tz_convert(LDN)
        if dl.strftime("%Y-%m-%d") != r["date"] or dl.weekday() >= 5 or dl.hour >= 12:
            continue  # stale copy, weekend key, or a capture too late to matter
        yield r, t0


def sites_of(r):
    U = r["dayMove"]
    lv = sorted([l for l in r["levels"] if np.isfinite(l["price"])], key=lambda l: l["price"])
    sites = []
    for l in lv:
        if sites and (l["price"] - sites[-1]["members"][-1]["price"]) <= SITE_MERGE * U:
            sites[-1]["members"].append(l)
        else:
            sites.append({"members": [l]})
    for s in sites:
        m = s["members"]
        s["price"] = float(np.mean([x["price"] for x in m]))
        s["types"] = sorted({x["type"] for x in m})
        s["gAt"] = max((x.get("gAt") or 0) for x in m)
        s["vAt"] = max((x.get("vAt") or 0) for x in m)
        s["strength"] = max((x.get("strength") or 0) for x in m)
        s["ranks"] = {x["type"]: x.get("rank") for x in m}
    real_px = np.array([l["price"] for l in lv])
    for s in sites:
        others = [o for o in sites if o is not s and abs(o["price"] - s["price"]) <= CONF_R * U]
        s["conf_types"] = len(set(s["types"]) | {t for o in others for t in o["types"]})
    out = [dict(s, kind="real", shift=0.0) for s in sites]
    for s in sites:
        for k in PLACEBO_SHIFTS:
            p = s["price"] + k * U
            if np.min(np.abs(real_px - p)) <= PLACEBO_CLEAR * U:
                continue
            out.append({"price": p, "types": s["types"], "gAt": s["gAt"], "vAt": s["vAt"], "strength": s["strength"], "ranks": s["ranks"],
                        "conf_types": s["conf_types"], "kind": "placebo", "shift": k, "parent": round(s["price"], 8)})
    return out


def scan(site, hi, lo, cl, times, U, outcomes):
    """Touch state machine on M1 bars. Returns list of touch dicts."""
    L = site["price"]
    arm = 0          # +1: armed below (approach from below), -1: armed above, 0: not armed
    n = 0
    prev = None      # previous touch: (approach side, result)
    ev = []
    N = len(cl)
    for i in range(N):
        if arm == 0:
            d = (cl[i] - L) / U
            if d <= -A:
                arm = 1
            elif d >= A:
                arm = -1
            continue
        hit = hi[i] >= L if arm == 1 else lo[i] <= L
        if not hit:
            d = (cl[i] - L) / U  # re-arm to the side price is on, if it moved far enough the other way without touching (cannot happen on M1 without touching) -> keep
            continue
        n += 1
        side = arm  # +1 = came from below (line is resistance), -1 = from above (support)
        e = {"i": i, "t": times[i], "n": n, "side": side,
             "retest": bool(prev is not None and prev[0] == -side and prev[1] == "through")}
        # approach speed: U travelled in the 15 bars before the touch, toward the line
        j = max(0, i - 15)
        e["speed15"] = float((L - cl[j]) * side / U) if i > 0 else np.nan
        if outcomes:
            back_px, thru_px = L - side * A * U, L + side * A * U
            res, k_res = "unresolved", None
            # the touch bar itself can only resolve 'through' (it came from the back side)
            if (side == 1 and hi[i] >= thru_px) or (side == -1 and lo[i] <= thru_px):
                res, k_res = "through", i
            else:
                for k in range(i + 1, N):
                    b = (lo[k] <= back_px) if side == 1 else (hi[k] >= back_px)
                    t = (hi[k] >= thru_px) if side == 1 else (lo[k] <= thru_px)
                    if b and t:
                        res, k_res = "both", k
                        break
                    if b:
                        res, k_res = "back", k
                        break
                    if t:
                        res, k_res = "through", k
                        break
            e["res"] = res
            e["bars_to_res"] = (k_res - i) if k_res is not None else None
            w = slice(i + 1, min(N, i + 1 + H60))
            if w.start < w.stop:
                e["mfe_back60"] = float(np.max((L - lo[w]) if side == 1 else (hi[w] - L)) / U)
                e["mfe_thru60"] = float(np.max((hi[w] - L) if side == 1 else (L - lo[w])) / U)
                e["close60_beyond"] = bool((cl[w][-1] - L) * side > 0) if (i + H60) < N else None
            prev = (side, res)
        else:
            prev = (side, None)
        ev.append(e)
        arm = 0  # needs a fresh A-away close to count the next touch
    return ev


def main():
    fc_meta = {}
    m1 = {}
    rows = []
    for r, t0 in sessions():
        fk = r["fk"]
        if fk not in m1:
            m1[fk] = pd.read_parquet(D / "m1" / f"{fk}.parquet", columns=["open", "high", "low", "close"])
        if r["date"] not in fc_meta:
            f = D.parent / "oi_raw_cache" / f"vol_forecast_{r['date']}.json"
            fc_meta[r["date"]] = json.loads(f.read_text()) if f.exists() else {}
        fcj = fc_meta[r["date"]]
        U = r["dayMove"]
        end = pd.Timestamp(r["date"] + " 22:00", tz=LDN).tz_convert("UTC")
        bars = m1[fk].loc[t0.ceil("min"):end - pd.Timedelta(minutes=1)]
        if len(bars) < 120:
            continue
        hi, lo, cl = bars["high"].to_numpy(), bars["low"].to_numpy(), bars["close"].to_numpy()
        times = bars.index
        site_list = sites_of(r)
        if SYNTH is not None:
            # A1 (PRE-RESULTS): 10 sub-steps per bar (OHLC from the sub-path), and the plant is "touch, then 30 bars of forced drift back"
            real_px = np.array([x["price"] for x in site_list if x["kind"] == "real"])
            NB, SUB, FORCE = len(cl), 10, 6
            sd = U / np.sqrt(1320 * SUB)
            hi, lo, cl = np.empty(NB), np.empty(NB), np.empty(NB)
            px, forced, fdir = float(bars["close"].iloc[0]), 0, 0.0
            for k in range(NB):
                e = RNG.normal(0, sd, SUB)
                if forced > 0:
                    e = fdir * np.abs(e); forced -= 1
                path = px + np.cumsum(e)
                if SYNTH > 0 and forced == 0:
                    prev = np.concatenate([[px], path[:-1]])
                    cross = (prev[:, None] - real_px[None, :]) * (path[:, None] - real_px[None, :]) <= 0
                    if cross.any():
                        j, s_ = np.argwhere(cross)[0]
                        if RNG.random() < SYNTH:
                            L = real_px[s_]
                            fdir = -1.0 if prev[j] < L else 1.0   # came from below -> back is down
                            path[j] = L
                            tail = path[j] + np.cumsum(fdir * np.abs(RNG.normal(0, sd, SUB - 1 - j))) if j < SUB - 1 else np.array([])
                            path = np.concatenate([path[: j + 1], tail])
                            forced = FORCE
                hi[k], lo[k], cl[k] = max(px, path.max()), min(px, path.min()), path[-1]
                px = path[-1]
        ldn_open = m1[fk].loc[pd.Timestamp(r["date"] + " 00:00", tz=LDN).tz_convert("UTC"):].iloc[0]["open"]
        inst_fc = (fcj.get("instruments") or {}).get(fk, {})
        day = {"date": r["date"], "fk": fk, "U": U, "spot": r["spot"], "regime": r["regime"], "hedgeRegime": r.get("hedgeRegime"),
               "book": r["book"]["label"], "vol_pct": inst_fc.get("vol_pct"), "news": (fcj.get("meta") or {}).get("news_flag"),
               "event_tag": (inst_fc.get("ladder") or {}).get("event_tag"), "atm_iv": (r.get("iv") or {}).get("atm"),
               "start_ldn": t0.tz_convert(LDN).strftime("%H:%M")}
        for s in site_list:
            dist0 = (s["price"] - cl[0]) / U
            for e in scan(s, hi, lo, cl, times, U, OUTCOMES):
                i = e.pop("i")
                t = e.pop("t")
                sofar_hi, sofar_lo = hi[: i + 1].max(), lo[: i + 1].min()
                rows.append({**day, "kind": s["kind"], "shift": s["shift"], "price": s["price"], "types": "|".join(s["types"]), "n_types": len(s["types"]),
                             "conf_types": s["conf_types"], "gAt": s["gAt"], "vAt": s["vAt"], "strength": s["strength"], "dist0": dist0, "parent": s.get("parent", round(s["price"], 8)),
                             "t": t, "ldn_hour": t.tz_convert(LDN).hour, "range_sofar": (sofar_hi - sofar_lo) / U,
                             "from_open": (s["price"] - ldn_open) / U, **e})
    df = pd.DataFrame(rows)
    out = D / (("synthetic_%g.parquet" % SYNTH) if SYNTH is not None else ("touches_outcomes.parquet" if OUTCOMES else "touches.parquet"))
    df.to_parquet(out)
    real = df[df.kind == "real"]
    print(f"sessions {df.groupby(['date','fk']).ngroups}, days {df.date.nunique()}, real touches {len(real)}, placebo {len(df)-len(real)} -> {out.name}")


if __name__ == "__main__":
    main()
