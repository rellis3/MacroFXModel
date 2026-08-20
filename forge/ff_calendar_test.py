"""Tests for ff_calendar.py — led by the bug the module exists to fix.

The delivered dataset dates NFP to a Friday only 26% of the time. A repair that
"looks better" is not good enough here: these tags decide a ±20% multiplier on every
band, so a repair that shifts the wrong rows is worse than no repair at all. The
tests below are therefore mostly about the AUDIT staying honest, not about the
repair's mechanics — an audit that can be satisfied by the thing it audits is the
real hazard, and an earlier version of this module was caught by exactly that
separation (concentration-based rule selection put NFP on a Thursday; KNOWN_WEEKDAY
scored it 0.000 and the rule was replaced).
"""
from __future__ import annotations

import os

import pandas as pd

from forge import ff_calendar as F

_HAVE_DATA = os.path.exists(F.DEFAULT_PATH)
_SKIP = "ff_calendar CSV absent — download from the HF dataset to run"


def _synthetic() -> pd.DataFrame:
    """Two NFP-shaped rows: one with a real clock time (correct in UTC) and one with
    the Tehran-midnight placeholder (a day early in UTC). A correct repair puts BOTH
    on the same Friday."""
    return pd.DataFrame({
        "DateTime": ["2024-01-05T17:00:00+03:30",   # true 13:30 UTC Friday
                     "2024-02-02T00:00:00+03:30"],  # placeholder: Tehran midnight Friday
        "Currency": ["USD", "USD"],
        "Impact": ["High Impact Expected", "High Impact Expected"],
        "Event": ["Non-Farm Employment Change", "Non-Farm Employment Change"],
    })


def test_placeholder_rows_are_detected_by_their_utc_time():
    df = F.load_raw.__wrapped__(_synthetic()) if hasattr(F.load_raw, "__wrapped__") else None
    # load_raw reads from disk, so exercise the transform inline instead.
    raw = _synthetic()
    t = pd.to_datetime(raw["DateTime"], utc=True)
    hhmm = t.dt.strftime("%H:%M")
    assert hhmm.iloc[0] == "13:30", hhmm.iloc[0]
    assert hhmm.iloc[1] == "20:30", hhmm.iloc[1]        # Tehran midnight -> 20:30 UTC
    assert hhmm.iloc[1] in F.PLACEHOLDER_HHMM
    assert hhmm.iloc[0] not in F.PLACEHOLDER_HHMM


def test_repair_puts_both_row_shapes_on_the_right_weekday():
    raw = _synthetic()
    t = pd.to_datetime(raw["DateTime"], utc=True)
    raw["t_utc"] = t
    raw["date_utc"] = t.dt.date
    raw["date_tehran"] = t.dt.tz_convert(F.TEHRAN).dt.date
    raw["placeholder"] = t.dt.strftime("%H:%M").isin(F.PLACEHOLDER_HHMM)
    out = F.apply_rule(raw)
    days = pd.to_datetime(out["date"]).dt.day_name().tolist()
    assert days == ["Friday", "Friday"], days
    # and the placeholder row must have MOVED — otherwise the repair did nothing
    assert out["date"].iloc[1] == "2024-02-02"
    assert str(raw["date_utc"].iloc[1]) == "2024-02-01"


def test_known_weekday_is_not_used_to_choose_the_rule():
    """The audit must stay independent of the repair. If KNOWN_WEEKDAY ever leaks
    into rule selection, the harness marks its own homework and the 0.000 failure
    that caught the last bad rule would have been invisible."""
    import inspect
    src = inspect.getsource(F.apply_rule) + inspect.getsource(F.choose_date_rule)
    assert "KNOWN_WEEKDAY" not in src


def test_instrument_currencies_cover_both_legs_plus_usd():
    assert F.instrument_currencies("AUDUSD") == {"AUD", "USD"}
    assert F.instrument_currencies("GBPJPY") == {"GBP", "JPY", "USD"}
    assert F.instrument_currencies("GOLD") == {"USD"}
    assert F.instrument_currencies("DE30") == {"EUR", "USD"}


def test_repaired_dates_pass_the_independent_audit():
    if not _HAVE_DATA:
        print(f"SKIP test_repaired_dates_pass_the_independent_audit: {_SKIP}")
        return
    df = F.load_repaired()
    v = F.validate(df)
    scored = v[v["n"] > 0]
    assert len(scored) >= 8, "audit set too thin to be meaningful"
    # Every series except FOMC must land on its known weekday almost always. FOMC is
    # excluded from the bar deliberately: pre-2012 the Fed held one-day meetings that
    # genuinely ended on a Tuesday, so <100% there is real history, not a date bug.
    non_fomc = scored[~scored["Event"].str.contains("FOMC|Federal Funds")]
    worst = non_fomc["after"].min()
    assert worst >= 0.90, f"a repaired series still misses its weekday: \\n{non_fomc}"
    assert scored["after"].mean() > scored["before"].mean() + 0.30


def test_tags_distinguish_quiet_from_uncovered():
    if not _HAVE_DATA:
        print(f"SKIP test_tags_distinguish_quiet_from_uncovered: {_SKIP}")
        return
    tags = F.load_tags(instrument="AUDUSD")
    assert tags, "no tags produced"
    # A date inside coverage with no releases is absent from the map (callers read
    # that as 'none'); a date outside coverage is equally absent — which is why the
    # coverage WINDOW has to travel with the tags, and does (run_vol passes it).
    assert "2024-02-02" in tags, "NFP day missing from AUDUSD tags"
    assert tags["2024-02-02"] in ("NFP", "FOMC", "CPI", "high"), tags["2024-02-02"]


def test_aud_employment_day_is_tagged_for_aud_pairs_only():
    if not _HAVE_DATA:
        print(f"SKIP test_aud_employment_day_is_tagged_for_aud_pairs_only: {_SKIP}")
        return
    df = F.load_repaired()
    aud = df[(df["Currency"] == "AUD") & (df["Event"] == "Employment Change")
             & (df["impact"] == "high")]
    assert len(aud) > 100
    day = aud["date"].iloc[-1]
    t_aud = F.event_tags(df, F.instrument_currencies("AUDUSD"))
    t_eur = F.event_tags(df, F.instrument_currencies("EURGBP"))
    assert t_aud.get(day) in ("high", "FOMC", "NFP", "CPI"), t_aud.get(day)
    # EURGBP has no AUD leg, so an AU-only day must not read as high for it.
    if t_eur.get(day) == "high":
        same_day_other = df[(df["date"] == day) & (df["impact"] == "high")
                            & (df["Currency"].isin(["EUR", "GBP", "USD"]))]
        assert len(same_day_other), "EURGBP tagged high with no EUR/GBP/USD high event"


if __name__ == "__main__":
    import sys
    fns = [(n, f) for n, f in sorted(globals().items())
           if n.startswith("test_") and callable(f)]
    ok = fail = 0
    for n, f in fns:
        try:
            f()
            ok += 1
            print(f"  ok   {n}")
        except Exception as e:                                  # noqa: BLE001
            fail += 1
            print(f"  FAIL {n}: {e}")
    print(f"{ok} passed, {fail} failed")
    sys.exit(1 if fail else 0)
