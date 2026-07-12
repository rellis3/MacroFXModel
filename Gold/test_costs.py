"""
Gold V1 — paper-spread cost checks (no network, no MT5).

Run from the Gold directory:  python test_costs.py
V1 is the incumbent in a planned A/B against GoldV2 — if only one side paid
costs the A/B would be rigged, so this verifies V1's paper fill model is
bit-identical to V2's (same half-spread exec math, same $0.30 default).
Modules are loaded by file path because Gold/ and GoldV2/ both use the
'modules' package name.
"""

from __future__ import annotations
import importlib.util
import os
import re
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod   # dataclass machinery looks the module up here
    spec.loader.exec_module(mod)
    return mod

v1 = _load(os.path.join(_HERE, 'modules', 'trade_state.py'), 'v1_trade_state')
v2 = _load(os.path.join(_HERE, '..', 'GoldV2', 'modules', 'trade_manager.py'),
           'v2_trade_manager')

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = '') -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ✓ {name}')
    else:
        FAIL += 1
        print(f'  ✗ {name}  {detail}')


print('\n── V1 paper spread == V2 paper spread (A/B parity) ──────────')
mismatches = [
    (d, mid, s, v1.paper_close_exec(d, mid, s), v2.paper_close_exec(d, mid, s))
    for d in ('LONG', 'SHORT')
    for mid in (4040.0, 4039.85, 2000.55)
    for s in (0.30, 0.0, 0.6)
    if abs(v1.paper_close_exec(d, mid, s) - v2.paper_close_exec(d, mid, s)) > 1e-12
]
check('paper_close_exec bit-identical to GoldV2 across grid',
      not mismatches, str(mismatches[:3]))


def _default_spread(fname: str) -> str:
    with open(fname, encoding='utf-8') as f:
        m = re.search(r"'paper_spread':\s*([0-9.]+)", f.read())
    return m.group(1) if m else '?'

check('DEFAULT_CFG paper_spread identical to GoldV2 (0.30)',
      _default_spread(os.path.join(_HERE, 'main.py')) ==
      _default_spread(os.path.join(_HERE, '..', 'GoldV2', 'main.py')) == '0.30',
      f"V1={_default_spread(os.path.join(_HERE, 'main.py'))} "
      f"V2={_default_spread(os.path.join(_HERE, '..', 'GoldV2', 'main.py'))}")


print('\n── V1 check_outcome pays the spread ─────────────────────────')
SPREAD = 0.30
now = datetime.now(timezone.utc)

# A SHORT's stop is hit by the ASK, not the mid
ts = v1.ActiveTrade('z', 'SHORT', 4039.85, 4050.0, 4030.0, 4020.0, 0.1, now)
check('SHORT stop hit by ask (mid still below SL)',
      ts.check_outcome(4049.90, spread=SPREAD) == 'SL_HIT')

ts2 = v1.ActiveTrade('z', 'SHORT', 4040.0, 4050.0, 4030.0, 4020.0, 0.1, now)
check('spread=0 (live fallback) keeps the legacy mid-cross behaviour',
      ts2.check_outcome(4049.90) is None)

# A LONG's TP is only reached once the BID clears it
tl = v1.ActiveTrade('z', 'LONG', 4040.15, 4030.0, 4055.0, 4060.0, 0.1, now)
check('LONG TP1 not hit while only the mid touches it',
      tl.check_outcome(4055.10, spread=SPREAD) is None)
check('LONG TP1 hit once the bid clears it',
      tl.check_outcome(4055.20, spread=SPREAD) == 'TP1_HIT')

print(f'\n{"=" * 60}\n{PASS} passed, {FAIL} failed\n')
sys.exit(1 if FAIL else 0)
