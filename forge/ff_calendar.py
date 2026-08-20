"""ff_calendar — the ForexFactory historical calendar, date-repaired and validated.

Source: https://huggingface.co/datasets/Ehsanrs2/Forex_Factory_Calendar
(83,427 rows, 2007-01-01 → 2025-04-07, MIT). This is the only calendar source that
gives ForexFactory's OWN event vocabulary AND impact ratings across all nine
currencies — which matters because the live path (`js/econCalendar.js`) reads the
ForexFactory feed. Fitting event multipliers on a different provider's "Major" flag
and applying them to ForexFactory's "High" flag is how the two silently disagree:
ForexFactory rates Building Permits and Housing Starts LOW where the previously-used
`calendar_events.csv` rates both Major.

## The date problem, and why it is repairable

The `Actual` values are correct — spot-checked against real prints (NFP 216K / 353K /
275K / 303K in order). The TIMESTAMPS are not: as delivered, NFP lands on a Friday
only 26% of the time.

The cause is visible in the time-of-day histogram: 31% of high-impact rows (45% in
recent years) sit at 19:30 or 20:30 UTC, which is midnight in Asia/Tehran — the
scrape timezone. Those are rows where the scraper could not read a clock time and
substituted midnight on the correct ForexFactory calendar day; converting that to UTC
rolls it back a day. Rows that DO carry a real clock time are already correct in UTC.

So there are two candidate date rules and neither is right for every row:

    utc      — correct for rows with a real time; a day early for placeholder rows
    tehran   — correct for placeholder rows; can be a day LATE for Asia-Pacific rows
               (NZD Official Cash Rate goes from 97.7% correct to 62.5% under it)

## The repair rule

Apply it PER ROW, from the mechanism itself rather than from a per-series vote:

    placeholder time  -> the stamp is Tehran midnight on the ForexFactory day, so the
                         Tehran calendar date is the event date
    real clock time   -> the stamp is a true instant, so the UTC date is correct

An earlier version chose per series by whichever rule made the weekday schedule more
CONCENTRATED. That is a reasonable-sounding proxy and it is wrong: when every row in a
series carries a placeholder, BOTH rules are near-perfectly concentrated (just on
different days), so concentration cannot discriminate and the tie goes to whichever
edges ahead by noise. It picked `utc` for USD and AUD Unemployment Rate — putting NFP
day on a Thursday — and the independent audit below caught it at 0.000. Concentration
is still computed and reported as a diagnostic; it no longer decides anything.

`KNOWN_WEEKDAY` is an INDEPENDENT check on the result — an audit, not the selection
criterion, so the harness cannot mark its own homework. That separation is the only
reason the bad rule was visible instead of shipping.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_PATH = "data/calendar/ff_calendar_2007_2025.csv"
TEHRAN = "Asia/Tehran"

# Independent audit set: recurring releases whose weekday is fixed by the issuing
# agency. NOT used to pick the date rule — only to score it afterwards.
KNOWN_WEEKDAY = {
    ("USD", "Non-Farm Employment Change"): "Friday",
    ("USD", "Unemployment Claims"): "Thursday",
    ("USD", "Unemployment Rate"): "Friday",
    ("USD", "Average Hourly Earnings m/m"): "Friday",
    ("AUD", "Employment Change"): "Thursday",
    ("AUD", "Unemployment Rate"): "Thursday",
    ("AUD", "Cash Rate"): "Tuesday",
    ("CAD", "Employment Change"): "Friday",
    ("NZD", "Official Cash Rate"): "Wednesday",
    ("USD", "FOMC Statement"): "Wednesday",
    ("USD", "Federal Funds Rate"): "Wednesday",
}

PLACEHOLDER_HHMM = frozenset({"19:30", "20:30", "23:30", "23:59"})


def load_raw(path: str | Path = DEFAULT_PATH) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False,
                     usecols=["DateTime", "Currency", "Impact", "Event"])
    t = pd.to_datetime(df["DateTime"], errors="coerce", utc=True)
    df = df.loc[t.notna()].copy()
    df["t_utc"] = t[t.notna()]
    df["date_utc"] = df["t_utc"].dt.date
    df["date_tehran"] = df["t_utc"].dt.tz_convert(TEHRAN).dt.date
    df["hhmm"] = df["t_utc"].dt.strftime("%H:%M")
    df["placeholder"] = df["hhmm"].isin(PLACEHOLDER_HHMM)
    # "High Impact Expected" -> "high"
    df["impact"] = (df["Impact"].astype(str).str.split().str[0].str.lower()
                    .where(lambda s: s.isin(["high", "medium", "low"]), "other"))
    df["Event"] = df["Event"].astype(str).str.strip()
    return df.reset_index(drop=True)


def _concentration(dates: pd.Series) -> float:
    """Share of the series falling on its own modal weekday. 1.0 = perfectly
    regular; ~0.2 = no weekday structure at all (5 trading days)."""
    if not len(dates):
        return 0.0
    wd = pd.to_datetime(pd.Series(list(dates))).dt.day_name()
    return float(wd.value_counts().iloc[0] / len(wd))


def choose_date_rule(df: pd.DataFrame, min_n: int = 20) -> pd.DataFrame:
    """Per (Currency, Event): which date rule yields the more regular schedule.

    Series below `min_n` inherit the majority rule of their currency, because a
    handful of observations cannot distinguish the two rules and defaulting them
    individually would be noise dressed as a decision.
    """
    rows = []
    for (ccy, ev), g in df.groupby(["Currency", "Event"], sort=False):
        c_utc = _concentration(g["date_utc"])
        c_teh = _concentration(g["date_tehran"])
        rows.append({"Currency": ccy, "Event": ev, "n": len(g),
                     "conc_utc": round(c_utc, 4), "conc_tehran": round(c_teh, 4),
                     "rule": ("tehran" if c_teh > c_utc else "utc") if len(g) >= min_n else None,
                     "placeholder_share": round(float(g["placeholder"].mean()), 4)})
    out = pd.DataFrame(rows)
    # Fill thin series from their currency's majority rule
    decided = out[out["rule"].notna()]
    by_ccy = (decided.groupby("Currency")["rule"]
              .agg(lambda s: s.value_counts().idxmax()).to_dict())
    out["rule"] = [r if r is not None else by_ccy.get(c, "utc")
                   for r, c in zip(out["rule"], out["Currency"])]
    return out


def apply_rule(df: pd.DataFrame, rules: pd.DataFrame | None = None) -> pd.DataFrame:
    """Attach the repaired `date` column, per row, from the placeholder flag.

    `rules` is accepted and ignored except for reporting — kept so callers that want
    the per-series concentration diagnostic can still pass it.
    """
    df = df.copy()
    df["rule"] = np.where(df["placeholder"].values, "tehran", "utc")
    df["date"] = np.where(df["placeholder"].values,
                          df["date_tehran"].values, df["date_utc"].values)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return df


def validate(df: pd.DataFrame) -> pd.DataFrame:
    """Score the repaired dates against `KNOWN_WEEKDAY` — the independent audit."""
    rows = []
    for (ccy, ev), expect in KNOWN_WEEKDAY.items():
        g = df[(df["Currency"] == ccy) & (df["Event"] == ev)]
        if not len(g):
            rows.append({"Currency": ccy, "Event": ev, "n": 0, "expect": expect,
                         "before": None, "after": None, "rule": None})
            continue
        before = float((pd.to_datetime(g["date_utc"]).dt.day_name() == expect).mean())
        after = float((pd.to_datetime(g["date"]).dt.day_name() == expect).mean())
        rows.append({"Currency": ccy, "Event": ev, "n": len(g), "expect": expect,
                     "before": round(before, 3), "after": round(after, 3),
                     "rule": g["rule"].mode().iat[0]})
    return pd.DataFrame(rows)


# ── event taxonomy ───────────────────────────────────────────────────────────
#
# Buckets are ordered by how much they move price, not by provider label alone. The
# three named US releases get their own buckets because they move EVERY instrument,
# not just dollar pairs; everything else falls back to ForexFactory's own impact
# rating within the instrument's OWN currencies — which is the fix for the AUD case,
# where two high-impact AU releases were being tagged "quiet" and DISCOUNTED because
# the old tagger only ever looked at USD.
# Buckets: FOMC > NFP > CPI > high > none.
#
# There is deliberately NO `medium` bucket, and that is a finding rather than a
# simplification. Fitting one produced two results that together condemn it:
#   * `medium` itself came out at 0.98-1.07 across instruments — no measurable effect.
#   * It starved `none`. With medium days pulled out, "no scheduled release at all"
#     stopped meaning "an ordinary quiet weekday" and started meaning "a holiday":
#     the residual bucket ran 40% Mondays, 15% Sundays, and its most common dates
#     were Jan 1, Dec 25, Dec 26, Dec 24, Jul 4. Its multiplier fitted at 0.43-0.63,
#     which is a real effect measured on the wrong variable — thin holiday sessions,
#     not quiet weekdays.
#
# Shipping that would have been actively dangerous: the live feed covers one week and
# is fetched intraday, so any sparse or half-populated response would tag an ordinary
# day `none` and halve every band. Thin-session behaviour is worth modelling — it is a
# big effect — but off a liquidity signal, not off calendar emptiness.
BUCKET_RANK = {"FOMC": 6, "NFP": 5, "CPI": 4, "high": 3, "holiday": 2, "none": 1}

# `holiday` exists because the first fit found it the hard way. Without it, "no
# scheduled release" quietly meant "public holiday" a large share of the time — the
# bucket ran 40% Mondays with Jan 1 / Dec 25 / Dec 26 / Jul 4 as its most common
# dates, and fitted at 0.43. That is a real effect (thin sessions ARE half-size) but
# it was being applied to ordinary quiet weekdays.
#
# ForexFactory marks these itself (1,654 "Bank Holiday" rows plus country-specific
# variants), and the LIVE feed carries the same `holiday` impact value — so this is
# one bucket, identifiable from the same field, in both the fit and production.

_FOMC = r"fomc statement|federal funds rate|fomc press conference|fomc economic projections"
_NFP = r"non-farm employment change|^non-farm payrolls"
_CPI = r"^cpi (?:m/m|y/y)|^core cpi (?:m/m|y/y)"

# Instrument -> the currencies whose calendar moves it. USD is included everywhere:
# a US macro shock moves AUDJPY too, and letting the per-instrument fit decide HOW
# MUCH is better than assuming it doesn't.
INSTRUMENT_CCY = {
    "GOLD": {"USD"}, "NQ": {"USD"}, "SPX500": {"USD"}, "US30": {"USD"}, "US2000": {"USD"},
    "DE30": {"EUR", "USD"}, "UK100": {"GBP", "USD"},
}


def instrument_currencies(name: str) -> set[str]:
    n = str(name).upper()
    if n in INSTRUMENT_CCY:
        return INSTRUMENT_CCY[n]
    if len(n) == 6:                      # an FX pair: both legs, plus USD
        return {n[:3], n[3:], "USD"}
    return {"USD"}


def event_tags(df: pd.DataFrame, currencies: set[str]) -> dict[str, str]:
    """date -> highest-ranked bucket, considering only `currencies`."""
    sub = df[df["Currency"].isin(currencies)]
    if not len(sub):
        return {}
    ev = sub["Event"].str.lower()
    usd = sub["Currency"].eq("USD")
    is_hol = sub["Event"].str.contains("bank holiday", case=False, na=False)
    bucket = np.where(usd & ev.str.contains(_FOMC, regex=True, na=False), "FOMC",
              np.where(usd & ev.str.contains(_NFP, regex=True, na=False), "NFP",
               np.where(usd & ev.str.contains(_CPI, regex=True, na=False), "CPI",
                np.where(sub["impact"].eq("high"), "high",
                 np.where(is_hol, "holiday", "none")))))
    tmp = pd.DataFrame({"date": sub["date"].values, "bucket": bucket})
    tmp["rank"] = tmp["bucket"].map(BUCKET_RANK).fillna(1)
    best = tmp.sort_values("rank").groupby("date")["bucket"].last()
    return best.to_dict()


def load_tags(path: str | Path = DEFAULT_PATH, instrument: str = "EURUSD",
              _cache: dict = {}) -> dict[str, str]:
    """Repaired, validated tags for one instrument. The heavy parse is cached across
    instruments — the per-instrument step is only the currency filter."""
    key = str(path)
    if key not in _cache:
        raw = load_raw(path)
        rules = choose_date_rule(raw)
        _cache[key] = apply_rule(raw, rules)
    return event_tags(_cache[key], instrument_currencies(instrument))


def load_repaired(path: str | Path = DEFAULT_PATH) -> pd.DataFrame:
    raw = load_raw(path)
    return apply_rule(raw, choose_date_rule(raw))
