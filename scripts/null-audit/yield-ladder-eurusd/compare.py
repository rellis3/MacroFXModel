"""null-audit yield-ladder-eurusd: compare a re-run against the banked copies.
python compare.py <banked_dir>   (compares panel_eurusd.parquet, results_eurusd.json, planted.json if present)"""
import os, sys, json
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'yield-predictive-ladder')
B = sys.argv[1]

a = pd.read_parquet(os.path.join(B, 'panel_eurusd.parquet')); b = pd.read_parquet(os.path.join(OUT, 'panel_eurusd.parquet'))
print('panel shapes', a.shape, b.shape, 'same cols', list(a.columns) == list(b.columns), 'same index', a.index.equals(b.index))
d = (a - b).abs().max(); print('panel max abs diff > 1e-12:', dict(d[d > 1e-12])); print('NaN-pattern mismatches', int((a.isna() != b.isna()).sum().sum()))


def walk(x, y, path=''):
    out = []
    if isinstance(x, dict):
        for k in x:
            if k == 'runtime_s': continue
            out += walk(x[k], y.get(k) if isinstance(y, dict) else None, path + '/' + k)
    elif isinstance(x, list):
        if not isinstance(y, list) or len(x) != len(y): return [(path, 'len', None)]
        for i, (u, v) in enumerate(zip(x, y)): out += walk(u, v, f'{path}[{i}]')
    elif isinstance(x, float) or isinstance(y, float):
        if x is None or y is None:
            if x != y: out.append((path, x, y))
        elif abs(x - y) > 1e-9 * max(1, abs(x)): out.append((path, x, y))
    elif x != y: out.append((path, x, y))
    return out


for f in ('results_eurusd.json', 'planted.json'):
    p0, p1 = os.path.join(B, f), os.path.join(OUT, f)
    if not (os.path.exists(p0) and os.path.exists(p1)): continue
    D = walk(json.load(open(p0)), json.load(open(p1)))
    print(f, 'differences:', len(D))
    for r in D[:40]: print('  ', r)
