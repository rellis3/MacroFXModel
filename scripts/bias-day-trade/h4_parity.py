"""Parity: the Python h4_slope port against js/biasForecasters.js h4Slope on 30 synthetic H1 series with gaps.
    python -X utf8 scripts/bias-day-trade/h4_parity.py   (needs node on PATH; run from the repo root)"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score import h4_slope  # noqa: E402

rng = np.random.default_rng(20261124)
cases = []
for i in range(30):
    n = int(rng.integers(60, 600))
    t = 1_700_000_000 // 3600 * 3600 + np.cumsum(rng.choice([3600, 3600, 3600, 7200, 3 * 86400], size=n, p=[.85, .05, .05, .04, .01]))
    c = 100 * np.exp(np.cumsum(rng.normal(0, 0.003, n)))
    T = int(t[int(rng.integers(n // 2, n))] + int(rng.integers(0, 7200)))
    py = h4_slope(t.astype(np.int64), c, T)
    cases.append({'h1': [{'t': int(a), 'c': float(b)} for a, b in zip(t, c)], 'T': T, 'py': None if np.isnan(py) else int(py)})
js = """import { h4Slope } from './js/biasForecasters.js'; import { readFileSync } from 'node:fs';
const cs = JSON.parse(readFileSync(0, 'utf8')); console.log(JSON.stringify(cs.map(c => h4Slope(c.h1, c.T))));"""
out = subprocess.run(['node', '--input-type=module', '-e', js], input=json.dumps(cases), capture_output=True, text=True, check=True)
jv = json.loads(out.stdout)
ok = sum((c['py'] == j) for c, j in zip(cases, jv))
print(f'h4 parity {ok}/{len(cases)}', 'sides', [c['py'] for c in cases])
sys.exit(0 if ok == len(cases) else 1)
