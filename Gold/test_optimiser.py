"""
Gold V1 optimiser — push-gate unit checks (no network, no KV).

Run from the Gold directory:  python test_optimiser.py
Verifies the Batch 6 safety layer: dry-run default, the ≥30-trade floor, the
chronological 60/40 IS/OOS split, refusal when the IS-chosen combo goes
negative OOS, and the looser-than-default guard (needs ≥30 OOS trades of its
own before the intake may be widened).
"""

from __future__ import annotations
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from optimiser import (split_is_oos, validate_push, _loosens_defaults,   # noqa: E402
                       PUSH_MIN_TRADES, OOS_LOOSEN_MIN_N, BOT_DEFAULTS)

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


_T0 = datetime(2026, 5, 1, tzinfo=timezone.utc)


def trade(i: int, score: float, vu: int, pnl_r: float) -> dict:
    return {'timestamp': (_T0 + timedelta(hours=6 * i)).isoformat(),
            'score': score, 'vu_components': vu,
            'result': 'WIN' if pnl_r > 0 else 'LOSS', 'pnl_r': pnl_r, 'tf': 'M30'}


def series(n: int, score: float, vu: int, pattern: list[float], start: int = 0) -> list[dict]:
    return [trade(start + i, score, vu, pattern[i % len(pattern)]) for i in range(n)]


print('\n── chronological split ──────────────────────────────────────')
ts = series(50, 4.0, 2, [1.0, -1.0])
is_t, oos_t = split_is_oos(ts)
check('60/40 split by count', len(is_t) == 30 and len(oos_t) == 20)
check('split is chronological (every IS ts ≤ every OOS ts)',
      max(t['timestamp'] for t in is_t) <= min(t['timestamp'] for t in oos_t))


print('\n── push floor ───────────────────────────────────────────────')
combo, msgs = validate_push(series(PUSH_MIN_TRADES - 1, 4.0, 2, [2.0]))
check(f'refuses with fewer than {PUSH_MIN_TRADES} trades',
      combo is None and any('need ≥30' in m for m in msgs), str(msgs))


print('\n── OOS survival ─────────────────────────────────────────────')
# Consistent winner IS and OOS at the default-or-tighter combo → push allowed.
good = series(60, 4.0, 2, [2.0, 2.0, -1.0])
combo, msgs = validate_push(good)
check('consistent combo passes the gate', combo is not None, str(msgs))
check('pushed combo never loosens defaults without evidence',
      combo is None or not _loosens_defaults(combo)
      or any('clears the specific-OOS bar' in m for m in msgs))

# Wins early, losses late: IS picks it, OOS mean is negative → refuse.
flip = (series(36, 4.0, 2, [2.0]) + series(24, 4.0, 2, [-1.0], start=36))
combo, msgs = validate_push(flip)
check('refuses when the IS pick is negative OOS',
      combo is None and any('NEGATIVE on the out-of-sample' in m for m in msgs),
      str(msgs))


print('\n── looser-than-default guard ────────────────────────────────')
check('detects loosening (score below default)',
      _loosens_defaults({'min_zone_score': 2.5, 'vu_min_components': 2}))
check('detects loosening (fewer VU components)',
      _loosens_defaults({'min_zone_score': 3.0, 'vu_min_components': 1}))
check('tighter-than-default is not loosening',
      not _loosens_defaults({'min_zone_score': 4.0, 'vu_min_components': 3}))

# Only low-score trades exist and they win → IS-best is a LOOSE combo
# (min_zone_score 2.5). With a small OOS block it must be refused.
loose_small = series(40, 2.6, 1, [1.5, 1.5, -1.0])
combo, msgs = validate_push(loose_small)
check('loose combo with OOS n < 30 refused',
      combo is None and any('LOOSENS' in m for m in msgs), str(msgs))

# Same shape but enough history that the loose combo has ≥30 OOS trades.
loose_big = series(90, 2.6, 1, [1.5, 1.5, -1.0])
combo, msgs = validate_push(loose_big)
check(f'loose combo WITH ≥{OOS_LOOSEN_MIN_N} OOS trades allowed',
      combo is not None and _loosens_defaults(combo), str(msgs))


print('\n── CLI safety ───────────────────────────────────────────────')
# Dry-run must be the default: --apply exists, and no KV write happens
# without it. Parse the entry-point source rather than executing main.
_SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         'optimiser.py'), encoding='utf-8').read()
check("--apply flag exists", "'--apply'" in _SRC)
check('KV writes only inside the --apply branch',
      'if not args.apply' in _SRC and _SRC.index('if not args.apply') <
      _SRC.index("_kv_put('gold_optimiser_last'"))
check('defaults documented against Gold/main.py',
      BOT_DEFAULTS == {'min_zone_score': 3.0, 'vu_min_components': 2})

print(f'\n{"=" * 60}\n{PASS} passed, {FAIL} failed\n')
sys.exit(1 if FAIL else 0)
