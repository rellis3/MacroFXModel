#!/usr/bin/env python3
"""Run the Python test functions in forge/ and GlobalLiquidity/ (no pytest needed).

    python scripts/run_py_tests.py

Each test_* function in forge/*_test.py, forge/test_*.py and GlobalLiquidity/test_*.py runs once. A failure fails the
job unless "<module>::<test>" is in tests/KNOWN_FAILING.json with a reason (e.g. it needs M1 data that is not in the
repo). Known failures still run and are printed every time; one that starts passing is reported so it can be removed.
Added 2026-10-31: before that, CI ran none of these (REPO_REVIEW_2026-10-31).
"""
from __future__ import annotations

import glob
import importlib
import inspect
import pathlib
import tempfile
import json
import os
import sys
import time
import traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

files = sorted(glob.glob("forge/*_test.py") + glob.glob("forge/test_*.py") + glob.glob("GlobalLiquidity/test_*.py"))
known = json.load(open("tests/KNOWN_FAILING.json")) if os.path.exists("tests/KNOWN_FAILING.json") else {}

ran = passed = 0
unexpected, still_known, now_passing = [], [], []
for f in files:
    mod_name = f[:-3].replace("/", ".")
    try:
        mod = importlib.import_module(mod_name)
    except Exception as e:  # noqa: BLE001 — an import error is a failure of every test in the file
        key = f"{mod_name}::<import>"
        (still_known if key in known else unexpected).append((key, f"{type(e).__name__}: {e}"))
        continue
    for name, fn in sorted(vars(mod).items()):
        if not (name.startswith("test_") and callable(fn)):
            continue
        key = f"{mod_name}::{name}"
        ran += 1
        t0 = time.time()
        try:
            # pytest-style fixtures this repo's tests use: tmp_path only
            params = inspect.signature(fn).parameters
            if "tmp_path" in params:
                with tempfile.TemporaryDirectory() as d:
                    fn(tmp_path=pathlib.Path(d))
            else:
                fn()
            passed += 1
            if key in known:
                now_passing.append(key)
        except Exception as e:  # noqa: BLE001
            msg = f"{type(e).__name__}: {str(e)[:300]}\n{traceback.format_exc(limit=3)}"
            (still_known if key in known else unexpected).append((key, msg))
        dt = time.time() - t0
        if dt > 30:
            print(f"  slow: {key} {dt:.0f}s")

for key, msg in unexpected:
    print(f"\n✗ {key}\n{msg}")
print(f"\n{ran} Python tests: {passed} passed, {ran - passed} failed")
if still_known:
    print(f"\nKnown failing on main ({len(still_known)}), not counted — fix and remove from tests/KNOWN_FAILING.json:")
    for key, _ in still_known:
        print(f"  - {key}: {known[key]}")
if now_passing:
    print("\nNow passing — remove from tests/KNOWN_FAILING.json:")
    for key in now_passing:
        print(f"  + {key}")
if unexpected:
    print(f"\nFAILED: {len(unexpected)} test(s) not in the known-failing list.")
    sys.exit(1)
print("\nOK")
