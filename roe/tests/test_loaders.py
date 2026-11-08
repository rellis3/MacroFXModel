"""Explicit `to` on every loader, and a proof that each one truncates (ROE section 8: truncation test)."""
from __future__ import annotations

import json

from roe import loaders as L

TO = "2026-10-15"


def _write(p, text):
    p.write_text(text, encoding="utf-8")
    return p


def test_every_loader_requires_to_and_rejects_bad_to(tmp_path):
    f = _write(tmp_path / "VIX.csv", "DATE,OPEN,HIGH,LOW,CLOSE\n01/02/2026,1,1,1,1\n")
    for call in (lambda: L.load_cboe_csv(f, "VIX"), lambda: L.load_fred_csv(f, "X"), lambda: L.load_cot_weekly_csv(f),
                 lambda: L.load_parquet_close(f, "X"), lambda: L.load_range_csv(f), lambda: L.load_calendar_csv([f]),
                 lambda: L.load_state({}), lambda: L.load_hit_rates({}), lambda: L.load_desk_quality({}),
                 lambda: L.load_data_health({}, session_date="2026-01-01")):
        try:
            call()
            raise AssertionError("loader accepted a call without `to`")
        except TypeError:
            pass
    for bad in (None, "", "2026/10/15", 20261015):
        try:
            L.load_cboe_csv(f, "VIX", bad)
            raise AssertionError("bad `to` accepted")
        except L.LoaderError:
            pass


def test_cboe_csv_truncates_both_layouts(tmp_path):
    f5 = _write(tmp_path / "VIX.csv", "DATE,OPEN,HIGH,LOW,CLOSE\n10/13/2026,1,1,1,10\n10/14/2026,1,1,1,11\n10/15/2026,1,1,1,12\n10/16/2026,1,1,1,13\n10/19/2026,1,1,1,14\n")
    s = L.load_cboe_csv(f5, "VIX", TO)
    assert s.dates == ["2026-10-13", "2026-10-14", "2026-10-15"] and s.values == [10, 11, 12]
    assert s.meta["droppedAfterTo"] == 2
    f2 = _write(tmp_path / "VVIX.csv", "DATE,VVIX\n10/14/2026,90\n10/16/2026,99\n")
    s2 = L.load_cboe_csv(f2, "VVIX", TO)
    assert s2.dates == ["2026-10-14"] and s2.values == [90.0]


def test_fred_csv_truncates_and_skips_missing(tmp_path):
    f = _write(tmp_path / "DGS2.csv", "observation_date,DGS2\n2026-10-13,4.1\n2026-10-14,.\n2026-10-15,4.2\n2026-10-16,4.3\n")
    s = L.load_fred_csv(f, "DGS2", TO)
    assert s.dates == ["2026-10-13", "2026-10-15"] and s.kind == "macro"


def test_cot_csv_uses_release_date_not_report_date(tmp_path):
    hdr = "sym,set,report_date,spec_long,spec_short,comm_long,comm_short,oi,traders_long,traders_short\n"
    rows = ["EUR,d,2026-10-06,60,40,1,1,200,1,1", "EUR,d,2026-10-13,70,40,1,1,200,1,1", "EUR,d,2026-10-20,80,40,1,1,200,1,1",
            "JPY,d,2026-10-06,60,40,1,1,200,1,1"]
    f = _write(tmp_path / "cot.csv", hdr + "\n".join(rows) + "\n")
    # 2026-10-13 report is public Friday 2026-10-16: not known on 10-15
    out = L.load_cot_weekly_csv(f, TO)
    assert out["COT:EUR"].dates == ["2026-10-06"]
    assert out["COT:EUR"].known == ["2026-10-09"]
    out2 = L.load_cot_weekly_csv(f, "2026-10-16")
    assert out2["COT:EUR"].dates == ["2026-10-06", "2026-10-13"]
    assert abs(out2["COT:EUR"].values[0] - 10.0) < 1e-9        # 100*(60-40)/200
    # JPY is stored in pair terms and flipped to currency terms
    assert abs(out["COT:JPY"].values[0] + 10.0) < 1e-9
    assert abs(L.load_cot_weekly_csv(f, TO, currency_terms=False)["COT:JPY"].values[0] - 10.0) < 1e-9


def test_range_csv_adapter_format_and_truncation(tmp_path):
    f = _write(tmp_path / "range.csv", "date,instrument,hl_pct,hl_median_pct,hl_75_pct\n2026-10-14,NQ,2.0,1.5,2.0\n2026-10-15,NQ,3.0,1.5,2.0\n2026-10-16,NQ,9,1.5,2.0\n")
    out = L.load_range_csv(f, TO)
    assert out["HL75:NQ"].dates == ["2026-10-14", "2026-10-15"] and out["HL75:NQ"].values == [1.0, 1.5]
    assert out["HL50:NQ"].values[1] == 2.0


def test_calendar_is_schedule_only_and_cut_ahead(tmp_path):
    f = _write(tmp_path / "cal.csv", "date,datetime_raw,country,ccy,impact,event,actual,previous,consensus\n"
               "2026-10-14,x,US,USD,Major,CPI,3.1,3.0,3.0\n2026-10-20,x,US,EUR,Major,HICP,,,\n2026-10-30,x,US,USD,Major,NFP,,,\n")
    ev = L.load_calendar_csv([f], TO, ahead_days=7)
    assert [e["date"] for e in ev] == ["2026-10-14", "2026-10-20"]
    assert set(ev[0]) == {"date", "ccy", "impact", "event"}        # actual / previous / consensus are never returned


def test_parquet_close_truncates(tmp_path):
    import pandas as pd
    df = pd.DataFrame({"close": [1.0, 2.0, 3.0, 4.0]}, index=pd.to_datetime(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]))
    p = tmp_path / "x.parquet"
    df.to_parquet(p)
    s = L.load_parquet_close(p, "SPX", TO)
    assert s.dates[-1] == "2026-10-15" and len(s.dates) == 3


def _state():
    return {"generatedAt": "2026-11-08T21:00:00Z", "asOf": "2026-11-06", "errors": [],
            "tiers": [{"readings": [{"key": "us2y", "spark": [["2026-11-03", 4.1], ["2026-11-04", 4.2], ["2026-11-05", 4.3]],
                                      "pctile": {"pct": 77, "n": 749, "spanDays": 1095}}]}],
            "drivers": {"readings": []},
            "history": {"long": [{"id": "VIX", "ctx": {"spark": [["2026-11-04", 20], ["2026-11-05", 25], ["2026-11-06", 28]], "pctAll": 84, "pct5y": 87, "n": 9311}}],
                        "cot": [{"sym": "EUR", "pct3y": 0, "pctAll": 36, "share": -9, "weeks": 1065, "asOf": "2026-11-03"}]},
            "assets": {"gamma": {"rows": [{"sym": "SPX", "regime": "BREAKOUT", "flipDistPct": -3.5}]}}, "health": [{"key": "dxy", "stale": True}]}


def test_state_loader_truncates_sparks_and_point_items():
    b = L.load_state(_state(), "2026-11-05")
    assert b.series["VIX"].dates == ["2026-11-04", "2026-11-05"]
    assert b.series["DGS2"].dates[-1] == "2026-11-05"
    assert b.points == {}                                   # state.asOf 11-06 > to 11-05: point-only items are dropped


def test_state_point_items_dropped_before_their_session_date():
    b = L.load_state(_state(), "2026-11-05")
    assert b.points == {} and b.dropped_points
    b2 = L.load_state(_state(), "2026-11-06")
    assert "gamma" in b2.points and b2.series["VIX"].dates[-1] == "2026-11-06"
    b3 = L.load_state(_state(), "2026-10-01")
    assert all(not s.dates for s in b3.series.values())


def test_server_percentile_is_labelled_non_causal():
    b = L.load_state(_state(), "2026-11-06")
    assert b.server_ref["VIX"]["label"] == "server, non-causal"
    assert b.server_ref["COT:EUR"]["label"] == "server, non-causal"
    assert b.server_ref["tier:us2y"]["label"] == "server, non-causal"


def test_hit_rates_loader_truncates_and_computes_ratio_to_line():
    doc = {"instruments": {"NQ": {"daily": [
        {"date": "2026-10-14", "open": 100, "day_high": 103, "day_low": 100, "fc": {"hl_median": 2.0, "hl_75": 3.0}},
        {"date": "2026-10-16", "open": 100, "day_high": 110, "day_low": 100, "fc": {"hl_median": 2.0, "hl_75": 3.0}}]}}}
    out = L.load_hit_rates(doc, TO)
    assert out["HL75:NQ"].dates == ["2026-10-14"] and abs(out["HL75:NQ"].values[0] - 1.0) < 1e-9
    assert abs(out["HL50:NQ"].values[0] - 1.5) < 1e-9


def test_desk_quality_and_data_health_truncate():
    dp = {"date": "2026-11-08", "builtAt": "x", "dataQuality": {"usableShare": 0.97, "decision": "run", "reasons": []}}
    assert L.load_desk_quality(dp, "2026-11-07") is None
    assert L.load_desk_quality(dp, "2026-11-08")["usableShare"] == 0.97
    dh = {"counts": {}, "rows": [{"id": "a", "state": "dead", "ageDays": 5}, {"id": "b", "state": "fresh"}]}
    assert L.load_data_health(dh, "2026-11-06", session_date="2026-11-08") is None
    assert [r["id"] for r in L.load_data_health(dh, "2026-11-08", session_date="2026-11-08")["bad"]] == ["a"]


def test_missing_file_raises_loader_error(tmp_path):
    try:
        L.load_fred_csv(tmp_path / "nope.csv", "X", TO)
        raise AssertionError("expected LoaderError")
    except L.LoaderError:
        pass
