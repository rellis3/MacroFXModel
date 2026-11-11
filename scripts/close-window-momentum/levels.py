"""close-window-momentum: level-arm touch table (ladder lines and NQ OI walls, real + placebo).

Pre-registered in forge/CLOSE_WINDOW_MOMENTUM_PREREG.md (section 3, level arm). Seed 20261111 (no randomness here).

Ladder lines (NQ, GOLD, EURUSD): the day-reconstruction archive's static OH/OL p50/p75/p90 levels
(open x (1 +/- rung%)), London 00:00-22:00 session, path = archive M1 path. Placebo lines: the same rung scaled by
0.85 and 1.15. First touch = first bar whose high (up) / low (down) reaches the level.
NQ OI walls: call_wall_a and put_wall_a of CME OI date D (near surface), used on the cash day of NY-close session
D+2 (gex-range-es timing), on NT8 unadjusted NQ futures (end-stamped labels moved back one minute). Level side is
set by the 09:30 ET price; first touch after 09:30 ET. Placebo: prior close + f x (wall - prior close), f 0.85/1.15.

Race (outcome, written but not read by this script): from the level, +0.25 sigma further in the touch direction
(follow) vs -0.25 sigma back (fail), bars k+1 .. k+30. Both in one bar = 'both'; neither = 'open'.
sigma unit: archive `scale` (open x sigma_used) for ladder lines; NQ_FUT 20-session NY-close sigma x prior close for walls.

Usage: python -I scripts/close-window-momentum/levels.py   (env CWM_DATA = checkout holding the gitignored data)
"""
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve()
ROOT = HERE.parents[2]
DATA = Path(os.environ.get("CWM_DATA", ROOT))
ARC = DATA / "analysis/output/day-reconstruction/archive"
OUT = ROOT / "analysis/output/close-window-momentum"
LOCKBOX_END = "2026-08-21"
FACTORS = (1.0, 0.85, 1.15)
RACE_BARS, RACE_SIG = 30, 0.25
COUNT_ONLY = "--count" in sys.argv  # count setups only; no outcome is computed
NY, LDN = "America/New_York", "Europe/London"

# local-time windows on the touch bar's START minute, [start, end)
WIN = {
    "NQ": {"tz": NY, "ref": "NQ_CFD", "late30": ("15:30", "16:00"), "late60": ("15:00", "16:00"),
           "early": ("10:00", "15:00")},
    "GOLD": {"tz": NY, "ref": "GOLD", "late30": ("13:00", "13:30"), "late60": ("12:30", "13:30"),
             "early": ("08:50", "12:30")},
    "EURUSD": {"tz": LDN, "ref": "EURUSD", "late30": ("15:30", "16:00"), "late60": ("15:00", "16:00"),
               "early": ("08:30", "15:00")},
}


def hm(s):
    h, m = map(int, s.split(":"))
    return h * 60 + m


def classify(minute_of_day, w):
    out = np.full(minute_of_day.shape, "", dtype=object)
    e0, e1 = hm(w["early"][0]), hm(w["early"][1])
    out[(minute_of_day >= e0) & (minute_of_day < e1)] = "early"
    l0, l1 = hm(w["late60"][0]), hm(w["late60"][1])
    out[(minute_of_day >= l0) & (minute_of_day < l1)] = "late60only"
    s0, s1 = hm(w["late30"][0]), hm(w["late30"][1])
    out[(minute_of_day >= s0) & (minute_of_day < s1)] = "late30"
    return out


def race(hi, lo, k, n, L, d, unit):
    """d = +1 up touch, -1 down touch. Returns 'follow' | 'fail' | 'both' | 'open'."""
    if COUNT_ONLY:
        return ""
    j0, j1 = k + 1, min(k + 1 + RACE_BARS, n)
    if j0 >= j1:
        return "open"
    up, dn = L + RACE_SIG * unit, L - RACE_SIG * unit
    h, l = hi[j0:j1], lo[j0:j1]
    if d > 0:
        f, x = h >= up, l <= dn
    else:
        f, x = l <= dn, h >= up
    fi = np.argmax(f) if f.any() else 10 ** 9
    xi = np.argmax(x) if x.any() else 10 ** 9
    if fi == xi == 10 ** 9:
        return "open"
    if fi == xi:
        return "both"
    return "follow" if fi < xi else "fail"


def ladder(name):
    w = WIN[name]
    days = pd.read_parquet(ARC / f"{name}_days.parquet")
    days = days[days["date"] <= LOCKBOX_END]
    path = pd.read_parquet(ARC / f"{name}_path.parquet")
    path = path[path["date"] <= LOCKBOX_END]
    ref = pd.read_parquet(OUT / f"days_{w['ref']}.parquet")[["day", "p_prev"]]
    ref["key"] = ref["day"].dt.strftime("%Y-%m-%d")
    pprev = dict(zip(ref["key"], ref["p_prev"]))
    rows = []
    g = {d: x for d, x in path.groupby("date", sort=False)}
    for r in days.itertuples(index=False):
        p = g.get(r.date)
        if p is None:
            continue
        hi, lo, t = p["high"].to_numpy(), p["low"].to_numpy(), p["t"].to_numpy()
        n = len(p)
        for fam, d in (("OH", 1), ("OL", -1)):
            for rung in ("p50", "p75", "p90"):
                pct = getattr(r, f"{'oh' if fam == 'OH' else 'ol'}_{rung}_pct")
                for f in FACTORS:
                    L = r.open * (1 + d * f * pct / 100.0)
                    hit = hi >= L if d > 0 else lo <= L
                    if not hit.any():
                        continue
                    k = int(np.argmax(hit))
                    loc = pd.Timestamp(int(t[k]), unit="s", tz="UTC").tz_convert(w["tz"])
                    rows.append({"instrument": name, "date": r.date, "level": f"{fam}_{rung}", "factor": f,
                                 "side": d, "L": L, "k": k, "t": int(t[k]), "local_day": loc.strftime("%Y-%m-%d"),
                                 "minute": loc.hour * 60 + loc.minute, "unit": r.scale,
                                 "outcome": race(hi, lo, k, n, L, d, r.scale)})
    tb = pd.DataFrame(rows)
    tb["window"] = classify(tb["minute"].to_numpy(), w)
    tb["p_prev"] = tb["local_day"].map(pprev)
    tb["with_day"] = np.sign(tb["L"] - tb["p_prev"]) == tb["side"]
    return tb


def walls():
    w = WIN["NQ"]
    s = pd.read_parquet(DATA / "oi_research_book/data/gex_range_es/nas100_nyclose_d1.parquet").sort_index()
    s.index = pd.to_datetime(s.index).tz_localize(None)
    dm = pd.read_parquet(DATA / "oi_research_book/data/gex_range_es/nyc/daily_master_near_nas100_usd.parquet")
    dm["date"] = pd.to_datetime(dm["date"])
    pos = s.index.get_indexer(dm["date"])
    dm = dm[pos >= 0].copy()
    pos = pos[pos >= 0]
    ok = pos + 2 < len(s)
    dm, pos = dm[ok], pos[ok]
    dm["cash_day"] = s.index[pos + 2]
    dm = dm[dm["cash_day"] <= LOCKBOX_END]
    fut = pd.read_parquet(DATA / "analysis/output/nt8/continuous/NQ_1m_unadj.parquet",
                          columns=["timestamp", "high", "low", "close"])
    fut["start"] = fut["timestamp"].dt.tz_convert(NY) - pd.Timedelta(minutes=1)
    fut["lday"] = fut["start"].dt.tz_localize(None).dt.normalize()
    fut["minute"] = fut["start"].dt.hour * 60 + fut["start"].dt.minute
    fut = fut[(fut["minute"] >= hm("09:30")) & (fut["minute"] < hm("16:30"))]
    g = {d: x for d, x in fut.groupby("lday", sort=False)}
    nqd = pd.read_parquet(OUT / "days_NQ_FUT.parquet")
    # unadjusted prior close and sigma: price level from the unadjusted file, sigma from the ratio file's returns
    nqd_k = nqd.set_index("day")
    rows = []
    for r in dm.itertuples(index=False):
        p = g.get(r.cash_day)
        if p is None or len(p) < 300 or r.cash_day not in nqd_k.index:
            continue
        sig = nqd_k.at[r.cash_day, "sigma"]
        hi, lo, cl = p["high"].to_numpy(), p["low"].to_numpy(), p["close"].to_numpy()
        mins = p["minute"].to_numpy()
        n = len(p)
        # unadjusted prior 16:00 close: last bar starting before 16:00 on the previous valid day
        prev = nqd_k.at[r.cash_day, "prev_day"]
        pp = g.get(prev)
        if pp is None:
            continue
        pc = pp[pp["minute"] < hm("16:00")]["close"]
        if pc.empty or not np.isfinite(sig):
            continue
        pclose = float(pc.iloc[-1])
        p0930 = cl[0]
        unit = sig * pclose
        for wname in ("call_wall_a", "put_wall_a"):
            W = getattr(r, wname)
            if not np.isfinite(W):
                continue
            d = 1 if W > p0930 else -1
            for f in FACTORS:
                L = pclose + f * (W - pclose)
                if np.sign(L - p0930) != d:
                    continue  # the placebo landed on the other side of the 09:30 price
                hit = hi >= L if d > 0 else lo <= L
                hit[0] = False  # first bar sets the side
                if not hit.any():
                    continue
                k = int(np.argmax(hit))
                rows.append({"instrument": "NQ_WALL", "date": r.cash_day.strftime("%Y-%m-%d"), "level": wname,
                             "factor": f, "side": d, "L": L, "k": k, "local_day": r.cash_day.strftime("%Y-%m-%d"),
                             "minute": int(mins[k]), "unit": unit, "p_prev": pclose,
                             "outcome": race(hi, lo, k, n, L, d, unit)})
    tb = pd.DataFrame(rows)
    tb["window"] = classify(tb["minute"].to_numpy(), w)
    tb["with_day"] = np.sign(tb["L"] - tb["p_prev"]) == tb["side"]
    return tb


def main():
    parts = [ladder(n) for n in ("NQ", "GOLD", "EURUSD")] + [walls()]
    tb = pd.concat(parts, ignore_index=True)
    tb.to_parquet(OUT / ("level_touches_count.parquet" if COUNT_ONLY else "level_touches.parquet"), index=False)
    # validation: factor-1.0 ladder touches must equal the archive's first touches of OH/OL
    for n in ("NQ", "GOLD", "EURUSD"):
        a = pd.read_parquet(ARC / f"{n}_touches.parquet")
        a = a[a["family"].isin(["OH", "OL"]) & (a["date"] <= LOCKBOX_END)]
        mine = tb[(tb.instrument == n) & (tb.factor == 1.0)]
        m = a.merge(mine, on=["date", "level"], how="outer", indicator=True, suffixes=("_a", ""))
        same_k = (m["_merge"] == "both") & (m["k_a"] == m["k"])
        print(n, "archive", len(a), "mine", len(mine), "matched same bar", int(same_k.sum()),
              "only archive", int((m["_merge"] == "left_only").sum()), "only mine", int((m["_merge"] == "right_only").sum()))


if __name__ == "__main__":
    main()
