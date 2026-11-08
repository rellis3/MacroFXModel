"""Synthetic fixtures: a complete InputSet with PLANTED events, deterministic (seeded). Used by `python -m roe --fixtures`
and by the tests. Nothing here is market data."""
from __future__ import annotations

import datetime as dt

import numpy as np

from .inputs import InputSet
from .series import Series
from .util import sha256_obj


DAY = np.timedelta64(1, "D")


def weekdays_ending(last: str, n: int) -> list:
    out, d = [], np.datetime64(last)
    while len(out) < n:
        if d.astype(dt.date).weekday() < 5:
            out.append(str(d))
        d = d - DAY
    return out[::-1]


def tuesdays_ending(last: str, n: int) -> list:
    d = np.datetime64(last)
    while d.astype(dt.date).weekday() != 1:
        d = d - DAY
    return [str(d - 7 * i * DAY) for i in range(n)][::-1]


def rw(rng, n, start, vol, positive=True):
    r = rng.normal(0, vol, n)
    x = start * np.exp(np.cumsum(r)) if positive else start + np.cumsum(r)
    return x


def make_series(sid, dates, values, cfg=None, **kw) -> Series:
    s = Series(sid, list(dates), [float(v) for v in values], **kw)
    s.meta["droppedAfterTo"] = 0
    if cfg and sid in cfg.get("seriesMeta", {}):
        s.change_kind = cfg["seriesMeta"][sid].get("changeKind", "diff")
    return s


def make_fixture_inputs(asof: str, cfg: dict, seed: int = 7, n: int = 1300, plant: bool = True) -> InputSet:
    rng = np.random.default_rng(seed)
    d = np.datetime64(asof)
    while d.astype(dt.date).weekday() >= 5:
        d = d - DAY
    dates = weekdays_ending(str(d), n)
    inp = InputSet()
    common = np.zeros(n)
    for i in range(1, n):
        common[i] = 0.985 * common[i - 1] + rng.normal(0, 0.04)    # stationary AR(1): no drift into the planted end
    base = {}
    for name, level, k in (("VIX", 17, 1.0), ("VIX3M", 19, 0.6), ("VVIX", 95, 0.7), ("VXN", 22, 1.0), ("RVX", 21, 0.9), ("OVX", 35, 0.8),
                           ("GVZ", 16, 0.8), ("VXEEM", 20, 0.7), ("VXTLT", 15, 0.6), ("VXFXI", 28, 0.7), ("VXEWZ", 30, 0.6), ("MOVE", 95, 0.7)):
        base[name] = level * np.exp(k * common + rng.normal(0, 0.02, n))
    if plant:
        base["VIX"][-3:] *= 1.8                                    # sudden jump: extreme + speed on VIX
        for nm in ("OVX", "GVZ", "VXTLT", "MOVE", "VXFXI"):
            base[nm][-2:] *= 1.7                                     # breadth: six components hot with VIX
    stale_cut = -15
    for name, v in base.items():
        vals, ds = list(v), list(dates)
        if name == "VXN" and plant:                                  # a stale feed
            vals, ds = vals[:stale_cut], ds[:stale_cut]
        inp.series[name] = make_series(name, ds, vals, cfg, cadence="daily", kind="market", source="fixture")
    vt = 0.85 + 0.04 * np.sin(np.arange(n) / 40) + rng.normal(0, 0.02, n)
    if plant:
        vt[-3:] = 1.06                                               # flip to inverted, held 3 sessions
    inp.series["VIX_TERM"] = make_series("VIX_TERM", dates, vt, cfg, cadence="daily", kind="market", source="fixture")
    v9 = base["VIX"] * (0.84 + rng.normal(0, 0.02, n))
    if plant:
        v9[-3:] = base["VIX"][-3:] * 0.99                            # 9d/30d crosses the fixed 'dear' cut-off
    inp.series["VIX9D"] = make_series("VIX9D", dates, v9, cfg, cadence="daily", kind="market", source="fixture")
    for name, start, vol in (("SPX", 5200, 0.009), ("NQ", 18000, 0.011), ("GOLD", 2400, 0.008)):
        inp.series[name] = make_series(name, dates, rw(rng, n, start, vol), cfg, cadence="daily", kind="market", source="fixture")
    inp.series["CREDIT_RATIO"] = make_series("CREDIT_RATIO", dates, rw(rng, n, 0.85, 0.002), cfg, cadence="daily", kind="market", source="fixture")
    y2 = 3 + np.cumsum(rng.normal(0, 0.03, n)) * 0.5
    y10 = y2 + 0.4 + 0.5 * np.sin(np.arange(n) / 120)
    spr = y10 - y2 - 0.0
    if plant:
        spr[-3:] = -0.12
        spr[-4] = 0.2
    inp.series["DGS2"] = make_series("DGS2", dates, y2, cfg, cadence="daily", kind="macro", source="fixture")
    inp.series["DGS10"] = make_series("DGS10", dates, y10, cfg, cadence="daily", kind="macro", source="fixture")
    inp.series["T10Y2Y"] = make_series("T10Y2Y", dates, spr, cfg, cadence="daily", kind="macro", source="fixture")
    inp.series["T10Y3M"] = make_series("T10Y3M", dates, spr + 0.3, cfg, cadence="daily", kind="macro", source="fixture")
    # COT (weekly, known = report + 3 days)
    wn = 420
    tues = tuesdays_ending(str(d), wn)
    for sym in ("EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "MXN", "USD", "NQ", "ES", "YM", "RTY", "GOLD", "SILVER", "PLAT", "PALL", "COPPER", "WTI", "NATGAS", "RBOB"):
        v = 10 * np.sin(np.arange(wn) / 30) + rng.normal(0, 4, wn)
        if plant and sym in ("EUR", "NQ"):
            v[-1] = 45 if sym == "EUR" else -48
        known = [str(np.datetime64(t) + 3 * DAY) for t in tues]
        keep = [i for i, k in enumerate(known) if k <= str(d)]
        inp.series[f"COT:{sym}"] = make_series(f"COT:{sym}", [tues[i] for i in keep], [v[i] for i in keep], cadence="weekly", kind="positioning",
                                              source="fixture", known=[known[i] for i in keep])
    # realised range vs shipped line
    for inst, hot in (("NQ", True), ("GOLD", False), ("EURUSD", False)):
        r = np.abs(rng.normal(0.9, 0.35, 70))
        if plant and hot:
            r[-5:] = 1.3
        inp.series[f"HL75:{inst}"] = make_series(f"HL75:{inst}", dates[-70:], r, cadence="daily", kind="session", source="fixture")
        inp.series[f"HL50:{inst}"] = make_series(f"HL50:{inst}", dates[-70:], r * 1.45, cadence="daily", kind="session", source="fixture")
    nxt = str(np.datetime64(str(d)) + DAY)
    inp.calendar = [{"date": nxt, "ccy": "EUR", "impact": "Major", "event": "Fixture CPI"}, {"date": str(np.datetime64(str(d)) + 6 * DAY), "ccy": "USD", "impact": "Major", "event": "Fixture NFP"}]
    inp.calendar_loaded = True
    gam = [{"sym": s, "spot": 100.0, "netGex": -1e9, "regime": "BREAKOUT", "gexFlip": 101.0, "flipDistPct": -1.0 - i * 0.2, "asOf": "fixture"} for i, s in enumerate(("SPX", "NDX", "SPY", "QQQ", "IWM", "HYG", "GLD", "TLT"))]
    if plant:
        gam[0]["flipDistPct"] = 0.3
    inp.points["gamma"] = {"stamp": str(d), "rows": gam}
    inp.points["health"] = {"stamp": str(d), "rows": [{"key": "dxy", "label": "Dollar", "asOf": str(d - (9 if plant else 1) * DAY), "ageDays": 9 if plant else 1, "stale": bool(plant)},{"key": "us2y", "asOf": str(d - DAY), "ageDays": 1, "stale": False}]}
    inp.points["desk_quality"] = {"stamp": str(d), "usableShare": 0.82 if plant else 0.97, "decision": "run", "reasons": [], "builtAt": None, "feedHealth": None}
    inp.blobs.append({"name": "fixture", "source": f"synthetic seed={seed} n={n} plant={plant}", "sha256": sha256_obj([seed, n, plant, asof]), "bytes": 0})
    return inp
