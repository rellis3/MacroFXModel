"""Shared test helpers (not a test module: no test_ prefix)."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import numpy as np

from roe.config import load_config
from roe.fixtures import make_fixture_inputs, make_series, weekdays_ending
from roe.scan import run_scan

ASOF = "2026-11-06"
NOW = dt.datetime(2026, 11, 6, 23, 0, 0)       # after 22:00 London: no INCOMPLETE_SESSION noise by default


def cfg():
    return load_config()


def fixture_run(out, *, plant=True, asof=ASOF, now=NOW, **kw):
    c = cfg()
    inputs = make_fixture_inputs(asof, c, plant=plant)
    return run_scan(asof=asof, out_dir=out, cfg=c, inputs=inputs, now_utc=now, commit="testcommit", **kw), inputs


def read_obs(run_dir):
    p = Path(run_dir) / "observations.jsonl"
    return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]


def jread(run_dir, name):
    return json.loads((Path(run_dir) / name).read_text(encoding="utf-8"))


def noise_series(n=1500, seed=1, sid="X", kind="market", change_kind="diff", level=100.0):
    rng = np.random.default_rng(seed)
    d = weekdays_ending("2026-11-06", n)
    return make_series(sid, d, level + rng.normal(0, 1, n), None, cadence="daily", kind=kind, change_kind=change_kind, source="test")
