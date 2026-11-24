"""Scheduled-event tags per London session and instrument (forge/LADDER_EXHAUSTION_EVENTS_PREREG.md).

Sources, merged by currency so each currency-date comes from ONE source:
  calendar_events.csv           USD, EUR, GBP   2014-01-02 -> 2026-07-02   (UTC times)
  data/calendar/ff_calendar...  JPY AUD CAD CHF NZD   2007 -> 2025-04-07   (forge.ff_calendar.load_repaired)
  calendar_events_nasdaq.csv    every currency  2026-07-03 ->             (UTC times)
JPY/AUD/CAD/CHF/NZD between 2025-04-08 and 2026-07-02 have no source: sessions of instruments that hear those
currencies are 'unknown' there and are excluded, never imputed (data-rules item 4).

Buckets are named release families, not the vendor's impact grade (calendar_events.csv's 'Major' count doubles in
2022 through relabelling). Priority FOMC > NFP > USCPI > CB > TIER1 > POST > none.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

CORE_CCY = {"USD", "EUR", "GBP"}
OTHER_CCY = {"JPY", "AUD", "CAD", "CHF", "NZD"}
FF_END = pd.Timestamp("2025-04-07")
NAS_START = pd.Timestamp("2026-07-03")
BUCKETS = ("FOMC", "NFP", "USCPI", "CB", "TIER1", "POST", "none")
RANK = {b: i for i, b in enumerate(BUCKETS)}

I = re.IGNORECASE
FOMC = re.compile(r"fed(eral)? (funds|interest rate decision)|fomc statement|fed interest rate decision", I)
NFP = re.compile(r"^(us )?(non.?farm (employment change|payrolls)|payroll jobs growth)$", I)
CPI = re.compile(r"\bcpi\b|inflation rate|consumer price", I)
CPI_X = re.compile(r"expectation|index number|boj core|hearing|report|trimmed|median|weighted|n\.s\.a|seasonal|ppi", I)
CB = re.compile(r"interest rate decision|cash rate|official bank rate|policy rate|overnight rate|overnight call rate|"
                r"refinancing rate|deposit facility rate|rate statement|monetary policy assessment|^libor rate$|"
                r"^monetary policy statement$|boj monetary policy statement", I)
CB_X = re.compile(r"vote|minutes|speak|expectation|survey|outlook|press|account", I)
TIER1 = re.compile(r"employment change|unemployment rate|claimant count|\bgdp\b|retail sales|pce price|"
                   r"^ism (manufacturing|services|non-manufacturing) pmi$|ism (manufacturing|services) pmi$", I)
TIER1_X = re.compile(r"adp|claims|gdpnow|deflator|capital|chain|final consumption|implicit|price index (q|y)|"
                     r"part time|full employment|n\.s\.a|control group|ex autos|nowcast|price$", I)


def family(ccy: str, ev: str) -> str | None:
    ev = str(ev).strip()
    if ccy == "USD" and FOMC.search(ev) and not CB_X.search(ev):
        return "FOMC"
    if ccy == "USD" and NFP.search(ev):
        return "NFP"
    if CPI.search(ev) and not CPI_X.search(ev):
        return "USCPI" if ccy == "USD" else "TIER1"
    if ccy != "USD" and CB.search(ev) and not CB_X.search(ev):
        return "CB"
    if TIER1.search(ev) and not TIER1_X.search(ev):
        return "TIER1"
    return None


def _session(ts: pd.Series) -> pd.Series:
    """UTC instant -> London session date; London hour >= 22 belongs to the next session; weekend -> Monday."""
    lt = ts.dt.tz_convert("Europe/London")
    d = lt.dt.tz_localize(None).dt.normalize() + pd.to_timedelta((lt.dt.hour >= 22).astype(int), unit="D")
    wd = d.dt.dayofweek
    return d + pd.to_timedelta(np.where(wd == 5, 2, np.where(wd == 6, 1, 0)), unit="D")


def _from_csv(path, ccys, lo=None, hi=None):
    c = pd.read_csv(ROOT / path, encoding="latin-1", low_memory=False)
    c = c[c["ccy"].isin(ccys)].copy()
    raw = c["datetime_raw"].astype(str)
    has_t = raw.str.len() > 10
    t = pd.to_datetime(raw.where(has_t, raw + " 12:00:00"), errors="coerce", utc=True)
    c["session"] = _session(t)
    c = c[c["session"].notna()]
    if lo is not None:
        c = c[pd.to_datetime(c["date"]) >= lo]
    if hi is not None:
        c = c[pd.to_datetime(c["date"]) <= hi]
    return pd.DataFrame({"ccy": c["ccy"], "event": c["event"], "session": c["session"]})


def _from_ff(ccys):
    from forge import ff_calendar as F
    d = F.load_repaired()
    d = d[d["Currency"].isin(ccys)].copy()
    t = pd.to_datetime(d["t_utc"], utc=True)
    sess = _session(t)
    ph = d["placeholder"].astype(bool)
    dd = pd.to_datetime(d["date"])
    dd = dd + pd.to_timedelta(np.where(dd.dt.dayofweek == 5, 2, np.where(dd.dt.dayofweek == 6, 1, 0)), unit="D")
    sess = sess.where(~ph, dd)
    return pd.DataFrame({"ccy": d["Currency"], "event": d["Event"], "session": sess})


def load_events() -> pd.DataFrame:
    parts = [_from_csv("calendar_events.csv", CORE_CCY, hi=NAS_START - pd.Timedelta(days=1)),
             _from_ff(OTHER_CCY),
             _from_csv("calendar_events_nasdaq.csv", CORE_CCY | OTHER_CCY, lo=NAS_START)]
    e = pd.concat(parts, ignore_index=True)
    e["fam"] = [family(c, v) for c, v in zip(e["ccy"], e["event"])]
    return e[e["fam"].notna()].drop_duplicates(["ccy", "session", "fam"]).reset_index(drop=True)


def instrument_ccys(sym: str) -> set[str]:
    s = sym.upper()
    fixed = {"DE30": {"EUR", "USD"}, "UK100": {"GBP", "USD"}}
    if s in fixed:
        return fixed[s]
    if len(s) == 6 and s[:3] in CORE_CCY | OTHER_CCY and s[3:] in CORE_CCY | OTHER_CCY:
        return {s[:3], s[3:], "USD"}
    return {"USD"}


def known(sym: str, dates: pd.Series) -> np.ndarray:
    """False where a relevant currency has no calendar source for that session."""
    d = pd.to_datetime(dates)
    if instrument_ccys(sym) & OTHER_CCY:
        return ~((d > FF_END) & (d < NAS_START)).to_numpy()
    return np.ones(len(d), bool)


def tags(sym: str, dates: pd.Series, E: pd.DataFrame | None = None) -> np.ndarray:
    """Bucket per session (aligned with `dates`); 'unknown' where coverage is missing."""
    E = load_events() if E is None else E
    ccys = instrument_ccys(sym)
    e = E[E["ccy"].isin(ccys)]
    best = {}
    for s, f in zip(e["session"], e["fam"]):
        if s not in best or RANK[f] < RANK[best[s]]:
            best[s] = f
    d = pd.to_datetime(dates).reset_index(drop=True)
    out = np.array([best.get(x, "none") for x in d], dtype=object)
    big = {"FOMC", "NFP", "USCPI", "CB"}
    prev = np.array([best.get(x) in big for x in d.shift(1)], bool)  # previous scored session had a big release
    out[(out == "none") & prev] = "POST"
    out[~known(sym, d)] = "unknown"
    return out


if __name__ == "__main__":
    E = load_events()
    E["y"] = pd.to_datetime(E["session"]).dt.year
    print(pd.crosstab([E["ccy"], E["fam"]], E["y"]).loc[:, 2016:].to_string())
    for f in ("FOMC", "NFP", "USCPI", "CB"):
        x = E[E["fam"] == f]
        print(f, x.groupby("ccy")["event"].value_counts().head(25).to_dict())
    print("FOMC weekday", pd.to_datetime(E[E.fam == "FOMC"]["session"]).dt.day_name().value_counts().to_dict())
    print("NFP weekday", pd.to_datetime(E[E.fam == "NFP"]["session"]).dt.day_name().value_counts().to_dict())
