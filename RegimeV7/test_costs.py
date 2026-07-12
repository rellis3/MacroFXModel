"""
RegimeV7 — paper-cost + paper-equity unit checks (no network, no MT5).

Run from the repo root or RegimeV7/:  python test_costs.py
Verifies the paper-mode cost model matches the backtest's PINNED constants
(regime-backtest.html cost_bp=1.2 / slip_bp=0.4, fixed:true): every paper
close pays cost_bp round-trip, stop-type exits (SL_HIT) pay slip_bp extra —
so for a symmetric move a stop exit nets exactly the slip less than a
market-type exit. Also checks the paper equity float that get_balance()
returns in paper mode so RiskGuardV7 rehearses on a moving balance.
"""

from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import regime_bot_v7 as bot

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


print('\n── paper cost model (backtest parity) ───────────────────────')
check('defaults pinned to the backtest (cost_bp=1.2, slip_bp=0.4)',
      bot.DEFAULT_CFG['paper_cost_bp'] == 1.2 and bot.DEFAULT_CFG['paper_slip_bp'] == 0.4,
      f"{bot.DEFAULT_CFG['paper_cost_bp']}/{bot.DEFAULT_CFG['paper_slip_bp']}")

entry = 1.10000
c_stop = bot.paper_cost_price(entry, 'SL_HIT',      1.2, 0.4)
c_mkt  = bot.paper_cost_price(entry, 'MAX_HOLD',    1.2, 0.4)
c_flip = bot.paper_cost_price(entry, 'REGIME_FLIP', 1.2, 0.4)

check('every close pays cost_bp round-trip (1.2bp of entry)',
      abs(c_mkt - entry * 1.2 / 10_000) < 1e-12, str(c_mkt))
check('non-stop exits all cost the same (no slip)',
      abs(c_flip - c_mkt) < 1e-12)
check('stop exit pays exactly slip_bp more (0.4bp)',
      abs((c_stop - c_mkt) - entry * 0.4 / 10_000) < 1e-12,
      f'{c_stop - c_mkt}')

# Symmetric move: stop-exit PnL < market-exit PnL by exactly the slip
move = 0.00500
pnl_stop = move - c_stop
pnl_mkt  = move - c_mkt
check('symmetric-move PnL: stop exit trails market exit by the slip',
      abs((pnl_mkt - pnl_stop) - entry * 0.4 / 10_000) < 1e-12)

check('zero-cost config degrades to the old free-fill numbers',
      bot.paper_cost_price(entry, 'SL_HIT', 0.0, 0.0) == 0.0)


print('\n── paper equity (RiskGuard rehearsal) ───────────────────────')
check('paper balance starts at 10,000',
      bot.get_balance(paper_mode=True) == 10_000.0,
      str(bot.get_balance(paper_mode=True)))

bal = bot.apply_paper_pnl(-250.0)
check('closed paper loss moves the balance', bal == 9_750.0, str(bal))
check('get_balance(paper) returns the moving float',
      bot.get_balance(paper_mode=True) == 9_750.0)

bal = bot.apply_paper_pnl(+400.0)
check('closed paper win moves it back up', bal == 10_150.0, str(bal))

# A -3% day must now be visible to RiskGuardV7.block_reason
rg = bot.RiskGuardV7()
rg.update_balance(10_150.0)                       # day start
reason = rg.block_reason(10_150.0 * 0.96)         # -4% intraday
check('RiskGuardV7 trips on a paper drawdown', reason is not None, str(reason))

# restore module state for any later importers in this process
bot._paper_equity = bot.PAPER_START_BALANCE

print(f'\n{"=" * 60}\n{PASS} passed, {FAIL} failed\n')
sys.exit(1 if FAIL else 0)
