"""
backtestSystem — pip_size resolution (no network, no MT5).

Regression guard for the USTECH100M bug: `pip_size()` used to substring-scan a
small local table, so any broker symbol that didn't literally contain a known
key fell through to the 0.0001 FX default. 'USTECH100M' contains neither
'NAS100' nor 'US100', so the NASDAQ index sized as if one point were a pip —
a 10,000x error straight into `position_size()`, on a pair that is in the
DEFAULT enabledPairs list.

The rule this file enforces: pip size comes from the shared instrument registry
(pylego/instruments.json), never from pattern-matching the symbol string.

Run from the backtestSystem directory:  python test_pip_size.py
"""

from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mt5_utils import pip_size  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = '') -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ok   {name}')
    else:
        FAIL += 1
        print(f'  FAIL {name}  {detail}')


print('\npip_size — canonical registry resolution\n' + '=' * 60)

# The bug, pinned: the live broker symbol for the NASDAQ index.
check('USTECH100M is an index point, not an FX pip',
      pip_size('USTECH100M') == 1.0, f'got {pip_size("USTECH100M")}')

# Every symbol in the DEFAULT enabledPairs list must resolve correctly — that
# list is what a fresh config trades before any KV override lands.
EXPECTED = {
    'EURUSD': 0.0001, 'GBPUSD': 0.0001, 'USDJPY': 0.01,
    'AUDUSD': 0.0001, 'XAUUSD': 1.0,    'USTECH100M': 1.0,
    # Other symbols the module knows about
    'EURGBP': 0.0001, 'USDCAD': 0.0001, 'USDCHF': 0.0001,
    'GBPJPY': 0.01,   'NAS100': 1.0,    'US100': 1.0,
}
for sym, want in EXPECTED.items():
    got = pip_size(sym)
    check(f'pip_size({sym}) == {want}', got == want, f'got {got}')

# Slash form must resolve identically — the config and the dashboard disagree on
# which one they use, and a pip that depends on formatting is the same class of
# bug as the one above.
for slashed, plain in [('EUR/USD', 'EURUSD'), ('XAU/USD', 'XAUUSD'),
                       ('USD/JPY', 'USDJPY'), ('GBP/JPY', 'GBPJPY')]:
    check(f'{slashed} resolves same as {plain}',
          pip_size(slashed) == pip_size(plain),
          f'{pip_size(slashed)} != {pip_size(plain)}')

# Gold and indices must never collapse onto the FX default — that is the shape
# of every pip bug in this repo.
for sym in ('XAUUSD', 'USTECH100M', 'NAS100'):
    check(f'{sym} is not the FX default', pip_size(sym) != 0.0001)

print(f'\n{"=" * 60}\n{PASS} passed, {FAIL} failed\n')
sys.exit(1 if FAIL else 0)
