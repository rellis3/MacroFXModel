"""scripts/footprint/footprint_capture.py: roll dates against the measured volume leaders, incremental reader against the batch builder."""
import importlib.util
import json
import pathlib
import tempfile
from datetime import date, timedelta

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "footprint"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


fc = _load("footprint_capture")
HDR = "﻿time,exch_time,type,price,volume,bid,ask\r\n"
NONE = "-1.7976931348623157E+308"


def _row(t, kind, px, vol, bid, ask):
    return f"2026-11-09T{t}.000Z,2026-11-09T{t}.000Z,{kind},{px},{vol},{bid},{ask}\r\n"


def _write(path, text, mode="w"):
    with open(path, mode, encoding="utf-8", newline="") as w:
        w.write(text)


# Switch dates from analysis/output/nt8/continuous/<ROOT>_rolls.csv, 2025-26: the date that file changes to this contract.
MEASURED = {
    "NQ": [("2025-06-16", "NQ 09-25"), ("2025-09-16", "NQ 12-25"), ("2025-12-15", "NQ 03-26"), ("2026-03-16", "NQ 06-26"), ("2026-06-15", "NQ 09-26"), ("2026-09-14", "NQ 12-26")],
    "ES": [("2025-06-16", "ES 09-25"), ("2025-09-15", "ES 12-25"), ("2025-12-15", "ES 03-26"), ("2026-03-16", "ES 06-26"), ("2026-06-15", "ES 09-26"), ("2026-09-14", "ES 12-26")],
    "6E": [("2025-06-15", "6E 09-25"), ("2025-09-14", "6E 12-25"), ("2025-12-14", "6E 03-26"), ("2026-03-15", "6E 06-26"), ("2026-06-15", "6E 09-26"), ("2026-09-14", "6E 12-26")],
    "GC": [("2025-11-25", "GC 02-26"), ("2026-01-28", "GC 04-26"), ("2026-03-29", "GC 06-26"), ("2026-05-27", "GC 08-26")],
    "CL": [("2026-03-17", "CL 05-26"), ("2026-04-16", "CL 06-26"), ("2026-05-17", "CL 07-26"), ("2026-06-17", "CL 08-26"), ("2026-07-19", "CL 09-26"), ("2026-08-18", "CL 10-26"), ("2026-09-20", "CL 11-26")],
}


def test_front_contract_is_within_three_days_of_every_measured_roll():
    for root, rolls in MEASURED.items():
        for day, want in rolls:
            d = date.fromisoformat(day)
            got = fc.front_contract(root, d + timedelta(days=3))
            assert got == want, (root, day, want, got)
            assert fc.front_contract(root, d - timedelta(days=4)) != want, (root, day, "rolled too early")


def test_front_contract_on_known_dates_and_year_end():
    d = date(2026, 11, 7)
    assert [fc.front_contract(r, d) for r in fc.DEFAULT_ROOTS] == ["NQ 12-26", "ES 12-26", "GC 12-26", "CL 12-26", "6E 12-26", "6J 12-26"]
    assert fc.front_contract("NQ", date(2026, 12, 14)) == "NQ 03-27"
    assert fc.front_contract("CL", date(2026, 11, 20)) == "CL 01-27"
    assert fc.front_contract("CL", date(2026, 12, 20)) == "CL 02-27"
    assert fc.front_contract("GC", date(2026, 12, 1)) == "GC 02-27"
    # Every calendar day of two years resolves, and a root only ever moves forward.
    for r in fc.DEFAULT_ROOTS:
        last = None
        for i in range(730):
            c = fc.front_contract(r, date(2026, 1, 1) + timedelta(days=i))
            key = (int(c[-2:]), int(c[-5:-3]))
            assert last is None or key >= last, (r, c)
            last = key


def test_quote_rule_tick_fallback_and_partial_lines():
    with tempfile.TemporaryDirectory() as td:
        f = pathlib.Path(td) / "2026-11-09_ticks_v2.csv"
        _write(f, HDR + _row("13:30:00", "Bid", 100, 5, NONE, NONE) + _row("13:30:01", "Last", 100.25, 3, 100, 100.25) + _row("13:30:02", "Last", 100, 2, 100, 100.25))
        t = fc.Tape("NQ 12-26", 0.25)
        assert t.poll(f) == 2
        assert t.poll(f) == 0                                                     # nothing new, nothing counted twice
        _write(f, _row("13:31:00", "Last", 100.5, 4, NONE, NONE) + "2026-11-09T13:31:01.000Z,2026-11-09T13:31:01.000Z,La", "a")   # no quote, then a half-written line
        assert t.poll(f) == 1                                                     # the half line waits
        _write(f, "st,100.25,6,100,100.5\r\n", "a")
        assert t.poll(f) == 1
        d = t.doc("2026-11-09")
        assert d["counts"] == dict(quote=2, tick_fallback=2)
        assert d["bars"][0][:5] == [810, 100.25, 100.25, 100, 100]
        assert d["bars"][0][5] == [[0, 2, 0], [1, 0, 3]]                          # 100 sold at the bid, 100.25 bought at the ask
        assert d["bars"][1][5] == [[0, 6, 0], [1, 0, 4]]                          # 100.5: no quote, price rose, tick rule says buy. 100.25: inside the spread, price fell, sell


def test_incremental_matches_the_batch_builder_on_random_ticks():
    bf = _load("build_footprint")
    rng = np.random.default_rng(20261107)
    n = 4000
    px = 100 + np.cumsum(rng.integers(-1, 2, n)) * 0.25
    sec = np.sort(rng.integers(0, 3600, n))
    vol = rng.integers(1, 9, n)
    with tempfile.TemporaryDirectory() as td:
        f = pathlib.Path(td) / "2026-11-09_ticks_v2.csv"
        _write(f, HDR + "".join(_row(f"13:{s // 60:02d}:{s % 60:02d}", "Last", p, v, NONE, NONE) for s, p, v in zip(sec, px, vol)))
        t = fc.Tape("NQ 12-26", 0.25)
        t.poll(f)
        raw = pd.DataFrame(dict(t=pd.to_datetime([f"2026-11-09T13:{s // 60:02d}:{s % 60:02d}Z" for s in sec]), price=px, volume=vol))
        raw["side"] = bf.tick_rule(px)
        assert t.doc("2026-11-09")["bars"] == bf.build(raw, 0.25, 1)


def test_rebin_keeps_every_contract():
    t = fc.Tape("6E 12-26", 0.00005)
    with tempfile.TemporaryDirectory() as td:
        f = pathlib.Path(td) / "2026-11-09_ticks_v2.csv"
        _write(f, HDR + "".join(_row(f"13:{m:02d}:00", "Last", 1.16 + m * 0.00005, m + 1, 1.0, 1.16) for m in range(9)))
        t.poll(f)
    d = t.doc("2026-11-09")
    r = fc.rebin(d)
    tot = lambda x: sum(s + b for bar in x["bars"] for _, s, b in bar[5])
    assert tot(r) == tot(d) == sum(range(1, 10)) and [b[0] for b in r["bars"]] == [780, 785] and r["base"] == 5
    assert json.dumps(r)
