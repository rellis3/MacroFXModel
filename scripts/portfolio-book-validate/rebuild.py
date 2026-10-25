"""T9 independent rebuild of the portfolio-book sleeve RAW streams.

Built only from the spec in the T9 brief (forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md)
and the raw feature parquets. Does not read or import the original code.

Output: analysis/output/portfolio-book-validate/rebuild/sleeves_raw.csv
"""
import bisect
import math
import os
from datetime import date as Date

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FEAT = os.path.join(ROOT, "features")
OUT = os.path.join(ROOT, "analysis", "output", "portfolio-book-validate", "rebuild", "sleeves_raw.csv")

START = "2008-01-02"
END = "2026-08-21"

FX = ["eurusd", "gbpusd", "audusd", "nzdusd", "usdcad", "usdchf", "usdjpy"]
ALL = FX + ["xauusd", "nas100", "spx500"]
SPREAD = {"eurusd": 0.000086, "gbpusd": 0.000156, "audusd": 0.000149, "nzdusd": 0.000156,
          "usdcad": 0.000211, "usdchf": 0.000178, "usdjpy": 0.0187, "xauusd": 0.62}
INDEX_FRAC = 2.68e-4
TARGET_VOL = 0.10
EWMA_A = 2.0 / 61.0

FOMC = """2016-01-27 2016-03-16 2016-04-27 2016-06-15 2016-07-27 2016-09-21 2016-11-02 2016-12-14
2017-02-01 2017-03-15 2017-05-03 2017-06-14 2017-07-26 2017-09-20 2017-11-01 2017-12-13
2018-01-31 2018-03-21 2018-05-02 2018-06-13 2018-08-01 2018-09-26 2018-11-08 2018-12-19
2019-01-30 2019-03-20 2019-05-01 2019-06-19 2019-07-31 2019-09-18 2019-10-30 2019-12-11
2020-01-29 2020-04-29 2020-06-10 2020-07-29 2020-09-16 2020-11-05 2020-12-16
2021-01-27 2021-03-17 2021-04-28 2021-06-16 2021-07-28 2021-09-22 2021-11-03 2021-12-15
2022-01-26 2022-03-16 2022-05-04 2022-06-15 2022-07-27 2022-09-21 2022-11-02 2022-12-14
2023-02-01 2023-03-22 2023-05-03 2023-06-14 2023-07-26 2023-09-20 2023-11-01 2023-12-13
2024-01-31 2024-03-20 2024-05-01 2024-06-12 2024-07-31 2024-09-18 2024-11-07 2024-12-18
2025-01-29 2025-03-19 2025-05-07 2025-06-18 2025-07-30 2025-09-17 2025-10-29 2025-12-10
2026-01-28 2026-03-18 2026-04-29 2026-06-17 2026-07-29""".split()


# ---------------------------------------------------------------- data
def load_px(name):
    d = pd.read_parquet(os.path.join(FEAT, f"px_d1_{name}.parquet"))[["date", "value"]]
    d = d.dropna(subset=["value"])
    wd = pd.to_datetime(d["date"]).dt.dayofweek
    d = d[wd < 5]  # drop Saturday/Sunday-dated rows (data fault)
    d = d.drop_duplicates("date", keep="last").sort_values("date").reset_index(drop=True)
    return list(d["date"]), np.asarray(d["value"], dtype=float)


class PIT:
    """Point-in-time lookup: newest asof <= D 22:00Z; ties -> latest date."""

    def __init__(self, name):
        d = pd.read_parquet(os.path.join(FEAT, f"{name}.parquet"))[["date", "asof", "value"]]
        d = d.dropna(subset=["value"]).copy()
        d["ts"] = pd.to_datetime(d["asof"], utc=True)
        d = d.sort_values(["ts", "date"], kind="mergesort").reset_index(drop=True)
        self.ts = list(d["ts"])
        self.val = list(d["value"].astype(float))
        self.cache = {}

    def at(self, day):
        if day in self.cache:
            return self.cache[day]
        t = pd.Timestamp(day + "T22:00:00Z")
        k = bisect.bisect_right(self.ts, t) - 1
        v = self.val[k] if k >= 0 else None
        self.cache[day] = v
        return v


PX = {n: load_px(n) for n in ALL}
VIX = PIT("vix")
VIX3M = PIT("vix3m")
RATE = {c: PIT(f"rate3m_{c}") for c in ["usd", "eur", "gbp", "aud", "nzd", "jpy", "cad", "chf"]}


def gate(day):
    v, v3 = VIX.at(day), VIX3M.at(day)
    if v is None or v3 is None:
        return False
    return v > v3


def rate_diff(pair, day):
    rb, rq = RATE[pair[:3]].at(day), RATE[pair[3:]].at(day)
    if rb is None or rq is None:
        return None
    return rb - rq


# ---------------------------------------------------------------- leg engine
def weekly_flags(dates):
    keys = [Date.fromisoformat(x).isocalendar()[:2] for x in dates]
    return [i == len(dates) - 1 or keys[i + 1] != keys[i] for i in range(len(dates))]


def run_leg(name, signal_fn, freq):
    """signal_fn(i, dates, closes) -> s in [-1,1] or None. Returns {date: net}."""
    dates, c = PX[name]
    n = len(dates)
    is_dec = weekly_flags(dates) if freq == "weekly" else [True] * n
    pos = np.zeros(n)
    v = None
    nret = 0
    out = {}
    for i in range(n):
        r = None
        if i > 0:
            r = c[i] / c[i - 1] - 1.0
            v = r * r if v is None else EWMA_A * r * r + (1 - EWMA_A) * v
            nret += 1
        sigma = math.sqrt(v) * math.sqrt(252) if (v is not None and nret >= 20) else None
        prev = pos[i - 1] if i > 0 else 0.0
        pos[i] = prev
        if is_dec[i] and dates[i] <= END:
            s = signal_fn(i, dates, c)
            if s is None or sigma is None or sigma <= 0:
                pos[i] = 0.0
            else:
                pos[i] = float(np.clip(s * TARGET_VOL / sigma, -3.0, 3.0))
        if i > 0 and START <= dates[i] <= END:
            carry = 0.0
            if name in FX:
                rd = rate_diff(name, dates[i - 1])
                if rd is not None:
                    gap = (Date.fromisoformat(dates[i]) - Date.fromisoformat(dates[i - 1])).days
                    carry = prev * rd / 100.0 * gap / 365.0
            gross = prev * r + carry
            frac = SPREAD[name] / c[i] if name in SPREAD else INDEX_FRAC
            cost = abs(pos[i] - prev) * 0.5 * frac
            out[dates[i]] = gross - cost
    return out


def sleeve(legs):
    streams = [legs[k] for k in legs]
    days = sorted(set().union(*[s.keys() for s in streams]))
    res = {}
    for d in days:
        vals = [s[d] for s in streams if d in s]
        res[d] = sum(vals) / len(vals)
    return res


# ---------------------------------------------------------------- sleeves
def s1g():
    f = lambda i, d, c: 0.0 if gate(d[i]) else 1.0
    return sleeve({n: run_leg(n, f, "daily") for n in ["nas100", "spx500", "xauusd"]})


def s2():
    def f(i, d, c):
        if i + 1 < 253:
            return None
        return float(np.mean([np.sign(c[i] / c[i - L] - 1.0) for L in (21, 63, 126, 252)]))
    return sleeve({n: run_leg(n, f, "weekly") for n in ALL})


def s3g():
    def mk(pair):
        def f(i, d, c):
            if gate(d[i]):
                return 0.0
            rd = rate_diff(pair, d[i])
            return None if rd is None else float(np.sign(rd))
        return f
    return sleeve({n: run_leg(n, mk(n), "daily") for n in FX})


def s4():
    legs = {}
    for n in FX:
        dates, _ = PX[n]
        hold = set()
        for fd in FOMC:
            k = bisect.bisect_left(dates, fd)  # FOMC date (or next trading date if absent)
            hold.update(dates[k:k + 5])
        side = 1.0 if n in ("usdcad", "usdchf", "usdjpy") else -1.0
        legs[n] = run_leg(n, (lambda h, sd: (lambda i, d, c: sd if d[i] in h else 0.0))(hold, side), "daily")
    return sleeve(legs)


def s5g():
    dates, c = PX["spx500"]
    on, cooldown = False, 0
    vprev = vixprev = None
    out = {}
    for i in range(1, len(dates)):
        d = dates[i]
        if d > END:
            break
        vx = VIX.at(d)
        if vx is None:
            continue
        v3 = VIX3M.at(d)
        v = (vx / 100.0) ** 2 / 252.0
        pnl = 0.0
        if vprev is not None and d >= START and on:
            r = math.log(c[i] / c[i - 1])
            pnlv = vprev - r * r + 10.0 * (vprev - v)
            nvar = 0.01 / (2.0 * vixprev)
            hair = (vixprev ** 2 - (vixprev - 0.5) ** 2) / 1e4 / 252.0
            pnl = nvar * (pnlv - hair) * (252.0 / 21.0) * 1e4
        chg = vx / vixprev - 1.0 if vixprev is not None else 0.0
        if chg > 0.20:
            cooldown = 5
        elif cooldown > 0:
            cooldown = cooldown - 1 if abs(chg) < 0.05 else 5
        want = cooldown == 0 and not (v3 is not None and vx > v3)
        if d >= START and want != on:
            pnl -= 10.0 * (0.01 / (2.0 * vx)) * ((vx ** 2 - (vx - 0.5) ** 2) / 1e4 / 252.0) * (252.0 / 21.0) * 1e4
        on = want
        vprev, vixprev = v, vx
        if d >= START:
            out[d] = pnl
    return out


def main():
    sl = {"S1g": s1g(), "S2": s2(), "S3g": s3g(), "S4": s4(), "S5g": s5g()}
    days = sorted(d for d in set().union(*[s.keys() for s in sl.values()]) if START <= d <= END)
    df = pd.DataFrame({"date": days})
    for k, s in sl.items():
        df[k] = [s.get(d, 0.0) for d in days]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False, float_format="%.17g")
    print("wrote", OUT, len(df), "rows")
    for k in sl:
        x = df[k].to_numpy()
        late = df.loc[df["date"] >= "2014-01-01", k].to_numpy()
        sr = lambda a: a.mean() / a.std() * math.sqrt(252) if a.std() > 0 else float("nan")
        print(f"{k:4s} nonzero={int((x != 0).sum()):5d}  SR_full={sr(x):.3f}  SR_2014+={sr(late):.3f}")


if __name__ == "__main__":
    main()
