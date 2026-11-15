#!/usr/bin/env python3
"""exit-on-fixed-entries positive control (prereg 3.9 item 2): the same as `run.py --selftest`.

    python -I scripts/exit-on-fixed-entries/selftest.py
"""
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('eofe_run', Path(__file__).resolve().parent / 'run.py')
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)
sys.exit(run.main(['--selftest'] + sys.argv[1:]))
