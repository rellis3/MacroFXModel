#!/usr/bin/env python3
"""Economic calendar continuation: Nasdaq's free economic-events API -> calendar_events_nasdaq.csv.

Why a second file: calendar_events.csv (root) stops at 2026-07-02 and nobody can extend it
from its original source. Nasdaq's feed is free, keyless and goes back years with actual /
consensus / previous, but its event names and impact tiers are NOT the same taxonomy (e.g.
"Nonfarm Payrolls" vs "Payroll Jobs Growth"; Nasdaq gives no impact at all). Appending it into
the old file would silently mix two taxonomies inside tests that key on event names, so it
lives beside it with a `source` column. Read both with `load_calendar()` below.

API quirks (checked 2026-10-18):
  * `?date=D` returns the events of US-Eastern calendar day D-1 (a Monday query holds Sunday,
    the FOMC on Wed 07-29 sits in the 07-30 response). So we query D+1 to get day D.
  * The `gmt` field is US-Eastern wall time, not GMT. Converted here to UTC (DST-aware).
  * Values carry units: "57K", "0.3%", "1.410M", "-226.8B", "&nbsp;" for none.

Impact tiers are assigned by keyword (IMPACT_RULES) and flagged impact_src=keyword: they are
a rough Major/Moderate/Standard map onto the old file's labels, not the old file's own tiers.

Usage:
  python3 scripts/calendar/fetch_nasdaq_calendar.py                    # extend to today (resumes from the file's last date)
  python3 scripts/calendar/fetch_nasdaq_calendar.py --start 2026-07-03 --end 2026-10-18
  python3 scripts/calendar/fetch_nasdaq_calendar.py --ahead 7          # also write the next 7 days (no actuals yet) — refreshed weekly
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import re
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "calendar_events_nasdaq.csv"
OLD = REPO / "calendar_events.csv"
OLD_END = "2026-07-02"            # last day of calendar_events.csv; this file starts the day after
URL = "https://api.nasdaq.com/api/calendar/economicevents?date={d}"
ET, UTC = ZoneInfo("America/New_York"), dt.timezone.utc
FIELDS = ["date", "datetime_raw", "country", "ccy", "impact", "event", "actual", "previous", "consensus",
          "source", "impact_src", "status"]

CCY = {"United States": "USD", "Euro Zone": "EUR", "Euro Area": "EUR", "Germany": "EUR", "France": "EUR",
       "Italy": "EUR", "Spain": "EUR", "Netherlands": "EUR", "Belgium": "EUR", "Austria": "EUR", "Ireland": "EUR",
       "Portugal": "EUR", "Greece": "EUR", "Finland": "EUR", "United Kingdom": "GBP", "Japan": "JPY",
       "Switzerland": "CHF", "Canada": "CAD", "Australia": "AUD", "New Zealand": "NZD", "China": "CNY",
       "Sweden": "SEK", "Norway": "NOK", "Mexico": "MXN", "South Africa": "ZAR", "Brazil": "BRL",
       "India": "INR", "Russia": "RUB", "South Korea": "KRW", "Singapore": "SGD", "Hong Kong": "HKD",
       "Turkey": "TRY", "Poland": "PLN"}

# First match wins. Patterns are case-insensitive regexes over the event name.
IMPACT_RULES = [
    ("Major", r"nonfarm payrolls|^cpi\b|core cpi|cpi \(|consumer price index|interest rate decision|"
              r"rate decision|fed interest rate|fomc statement|fomc press|monetary policy statement|"
              r"^gdp|gdp \(|gross domestic product|core pce|pce price|retail sales|unemployment rate|"
              r"employment change|ism manufacturing pmi|ism non-manufacturing pmi|ism services pmi|"
              r"average hourly earnings|ppi\b|producer price|hicp|boj policy|ecb press|boe .*vote"),
    ("Moderate", r"pmi|jobless claims|jolts|consumer confidence|consumer sentiment|michigan|ifo|zew|"
                 r"durable goods|industrial production|trade balance|housing starts|building permits|"
                 r"new home sales|existing home sales|pending home|adp|chicago|philadelphia|empire|"
                 r"crude oil inventories|fomc minutes|meeting minutes|speaks|testifies|beige book|"
                 r"current account|wage|labor cost|claimant|business confidence|tankan"),
]
_IMPACT_RX = [(lvl, re.compile(rx, re.I)) for lvl, rx in IMPACT_RULES]


def impact_of(name: str) -> str:
    for lvl, rx in _IMPACT_RX:
        if rx.search(name):
            return lvl
    return "Standard"


_MULT = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}


def num(v: str | None) -> str:
    """'57K' -> '57000', '0.3%' -> '0.3', '-226.8B' -> '-226800000000', '&nbsp;' -> ''. Unparseable text is kept."""
    s = html.unescape(v or "").replace("\xa0", " ").strip().replace(",", "")
    if not s:
        return ""
    m = re.fullmatch(r"([-+]?\d*\.?\d+)\s*([KMBT%]?)", s, re.I)
    if not m:
        return s
    x, u = float(m.group(1)), m.group(2).upper()
    x = x * _MULT.get(u, 1)
    return f"{x:.6g}" if u in _MULT else m.group(1)


def fetch_day(day: dt.date, session: requests.Session, tries: int = 4) -> list[dict]:
    q = day + dt.timedelta(days=1)                       # the API's date=D holds day D-1
    for k in range(tries):
        try:
            r = session.get(URL.format(d=q.isoformat()), timeout=30)
            r.raise_for_status()
            return (r.json().get("data") or {}).get("rows") or []
        except Exception as e:                           # noqa: BLE001 — network: retry with backoff
            if k == tries - 1:
                raise RuntimeError(f"{day}: {e}") from e
            time.sleep(2 ** (k + 1))
    return []


def rows_for(day: dt.date, raw: list[dict], today: dt.date) -> list[dict]:
    out = []
    for r in raw:
        t = (r.get("gmt") or "").strip()
        m = re.fullmatch(r"(\d{1,2}):(\d{2})", t)
        if m:
            local = dt.datetime(day.year, day.month, day.day, int(m.group(1)), int(m.group(2)), tzinfo=ET)
        else:                                            # "All Day" / "Tentative": keep the day, no time
            local = dt.datetime(day.year, day.month, day.day, 0, 0, tzinfo=ET)
        u = local.astimezone(UTC)
        name = html.unescape(r.get("eventName") or "").strip()
        country = (r.get("country") or "").strip()
        actual = num(r.get("actual"))
        out.append({
            "date": u.date().isoformat(), "datetime_raw": u.strftime("%Y-%m-%d %H:%M:%S") if m else u.date().isoformat(),
            "country": country, "ccy": CCY.get(country, ""), "impact": impact_of(name), "event": name,
            "actual": actual, "previous": num(r.get("previous")), "consensus": num(r.get("consensus")),
            "source": "nasdaq", "impact_src": "keyword",
            "status": "released" if (actual or day < today) else "scheduled",
        })
    return out


def read_existing() -> list[dict]:
    if not OUT.exists():
        return []
    with OUT.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", help="first ET day to fetch (default: resume after the file's last released day)")
    ap.add_argument("--end", help="last ET day (default: today)")
    ap.add_argument("--ahead", type=int, default=7, help="also fetch this many days ahead as 'scheduled' rows")
    ap.add_argument("--sleep", type=float, default=0.4, help="seconds between requests")
    a = ap.parse_args()

    today = dt.datetime.now(ET).date()
    existing = read_existing()
    released = [r for r in existing if r["status"] == "released"]
    if a.start:
        start = dt.date.fromisoformat(a.start)
    elif released:                                       # re-fetch the last 3 days: late actuals and revisions
        start = dt.date.fromisoformat(max(r["date"] for r in released)) - dt.timedelta(days=3)
    else:
        start = dt.date.fromisoformat(OLD_END) + dt.timedelta(days=1)
    end = dt.date.fromisoformat(a.end) if a.end else today + dt.timedelta(days=max(0, a.ahead))

    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    fetched: dict[str, list[dict]] = {}
    d = start
    while d <= end:
        fetched[d.isoformat()] = rows_for(d, fetch_day(d, s), today)
        print(f"{d}  {len(fetched[d.isoformat()]):4d} events", file=sys.stderr)
        d += dt.timedelta(days=1)
        time.sleep(a.sleep)

    # Replace whole ET days that were re-fetched; rows are keyed by their ET fetch day, so
    # derive it back from the UTC stamp the same way rows_for wrote it.
    def et_day(r: dict) -> str:
        raw = r["datetime_raw"]
        if len(raw) == 10:
            return raw
        return dt.datetime.fromisoformat(raw).replace(tzinfo=UTC).astimezone(ET).date().isoformat()

    kept = [r for r in existing if et_day(r) not in fetched]
    rows = kept + [r for day in fetched.values() for r in day]
    seen, uniq = set(), []
    for r in sorted(rows, key=lambda r: (r["datetime_raw"], r["country"], r["event"])):
        k = (r["datetime_raw"], r["country"], r["event"], r["actual"], r["previous"])
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(uniq)
    rel = sum(r["status"] == "released" for r in uniq)
    print(f"wrote {OUT.name}: {len(uniq)} rows ({rel} released, {len(uniq) - rel} scheduled), "
          f"{uniq[0]['date'] if uniq else '-'} -> {uniq[-1]['date'] if uniq else '-'}", file=sys.stderr)
    return 0


def load_calendar(countries: tuple[str, ...] | None = ("United States", "Euro Area", "United Kingdom"),
                  released_only: bool = True):
    """Both calendars as one DataFrame (pandas), old file de-duplicated, with a `source` column.

    calendar_events.csv holds ~46k exact-duplicate rows (found 2026-10-18); they are dropped here.
    Event NAMES differ between the two sources: match on impact or on your own name map, never on
    a literal name across the 2026-07-02 seam. The default `countries` mirrors the old file's
    coverage so a test does not suddenly gain countries at the seam.
    """
    import pandas as pd
    old = pd.read_csv(OLD, encoding="latin-1", low_memory=False).drop_duplicates()
    old["source"], old["impact_src"], old["status"] = "legacy", "legacy", "released"
    new = pd.read_csv(OUT, dtype=str) if OUT.exists() else pd.DataFrame(columns=FIELDS)
    new = new.replace({"Euro Zone": "Euro Area"})
    if released_only:
        new = new[new["status"] == "released"]
    df = pd.concat([old, new[new["date"] > OLD_END]], ignore_index=True)
    if countries:
        df = df[df["country"].isin(countries)]
    return df.sort_values("datetime_raw").reset_index(drop=True)


if __name__ == "__main__":
    sys.exit(main())
