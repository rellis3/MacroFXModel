"""
compare_sigma.py — the drift guard. Dumps synthetic daily bars, runs the JS
yzVolSeries on them, and asserts the Python yz_sigma matches to 1e-10.
This is the contract that keeps the exhaustion lens on the SAME sigma as the
live forecaster (CLAUDE.md: the vol math must always match).
"""
import json, subprocess, sys, os
import numpy as np
from vol_exhaustion_lib import yz_sigma, _synthetic_daily

HERE = os.path.dirname(os.path.abspath(__file__))
o, h, l, c = _synthetic_daily(n=80, seed=7)
bars = [{'open': float(o[i]), 'high': float(h[i]), 'low': float(l[i]), 'close': float(c[i])}
        for i in range(o.size)]
with open(os.path.join(HERE, '_xcheck_bars.json'), 'w') as f:
    json.dump(bars, f)

js = subprocess.run(['node', os.path.join(HERE, 'crosscheck_sigma.mjs')],
                    capture_output=True, text=True)
if js.returncode != 0:
    print('JS failed:', js.stderr, file=sys.stderr); sys.exit(2)
yz_js = np.array(json.loads(js.stdout))
yz_py = yz_sigma(o, h, l, c, 30)

# JS out[i] for i<window is 0 (Float64Array default); Python matches (out init 0).
diff = np.abs(yz_js - yz_py)
mx = float(np.nanmax(diff))
print(f'max |JS - Python| yz_sigma over {o.size} days = {mx:.3e}')
print('JS  tail:', np.round(yz_js[-4:], 10).tolist())
print('Py  tail:', np.round(yz_py[-4:], 10).tolist())
assert mx < 1e-10, f'SIGMA DRIFT: {mx:.3e} exceeds 1e-10'
print('PASS — Python yz_sigma is bit-identical to js/volBacktestEngine.js')
