"""risk_guard — daily/monthly drawdown lockout + per-pair cooldown.

The shared RiskGuard, lifted verbatim from bot/regime_bot.py (which itself says
"mirrors the RiskGuard in main.py"). One copy lived in regime_bot, RegimeV2, V7
and DynAnchorBot plus an unwired safety/risk_gate.py — this is the single source.

Pure state machine: feed it the balance each cycle (`update_balance`) and ask
`block_reason(balance, pair)` before trading; it returns a human string when
trading should be blocked (locked out, in cooldown, or DD breached) or None when
clear. Config is re-read each cycle via `sync_cfg` so live changes take effect.

Time/clock are the only side inputs (time.time / datetime.now), so it is fully
testable by driving balances through it. Logging is injected (defaults to a
module logger) so the brick has no dependency on any bot's global `log`.

    from pylego.risk_guard import RiskGuard
    guard = RiskGuard()
    guard.sync_cfg(cfg); guard.update_balance(bal)
    if (why := guard.block_reason(bal, pair)): skip(why)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone, date as date_type


class RiskGuard:
    """Daily/monthly DD lockout + per-pair cooldown. Fields are re-read from
    config each cycle (`sync_cfg`) so live changes take effect."""

    def __init__(self, log: logging.Logger | None = None):
        self.log = log or logging.getLogger("pylego.risk_guard")

        self.dd_limit_pct:   float = 3.0
        self.monthly_dd_pct: float = 5.0
        self.lockout_secs:   float = 3 * 3600
        self.cooldown_secs:  float = 240

        self._day_start:   float | None = None
        self._month_start: float | None = None
        self._locked_until: float       = 0.0
        self._last_trade:  dict[str, float] = {}
        self._reset_date:  date_type | None = None

    def sync_cfg(self, cfg: dict) -> None:
        self.dd_limit_pct   = float(cfg.get('ddlimit',    3.0))
        self.monthly_dd_pct = float(cfg.get('monthlydd',  5.0))
        self.lockout_secs   = float(cfg.get('lockout',    3)) * 3600
        self.cooldown_secs  = float(cfg.get('cooldown',   240))

    def update_balance(self, bal: float) -> None:
        today = datetime.now(timezone.utc).date()
        if self._day_start is None:
            self._day_start  = bal
            self._reset_date = today
        if self._month_start is None:
            self._month_start = bal
        if self._reset_date and today > self._reset_date:
            self.log.info(f'Daily reset — day_start {self._day_start:.2f} → {bal:.2f}')
            self._day_start  = bal
            self._reset_date = today

    def record_trade(self, pair: str) -> None:
        self._last_trade[pair] = time.time()

    def force_unlock(self) -> None:
        """Clear the lockout flag but PRESERVE the day-start baseline: resetting
        it to the drawn-down balance would let the daily-DD limit ratchet down
        (each unlock granting a fresh −ddlimit% from the new, lower start). If
        the DD is still breached, block_reason re-locks — that's intended."""
        self._locked_until = 0.0

    def block_reason(self, bal: float, pair: str = '') -> str | None:
        now = time.time()

        if now < self._locked_until:
            return f'Locked out — {(self._locked_until - now) / 60:.0f}m remaining'

        if pair and pair in self._last_trade:
            elapsed = now - self._last_trade[pair]
            if elapsed < self.cooldown_secs:
                return f'[{pair}] Cooldown — {(self.cooldown_secs - elapsed) / 60:.1f}m remaining'

        if self._day_start:
            dd = (self._day_start - bal) / self._day_start * 100
            if dd >= self.dd_limit_pct:
                self._locked_until = now + self.lockout_secs
                return f'Daily DD {dd:.1f}% ≥ {self.dd_limit_pct}% — locked {self.lockout_secs / 3600:.0f}h'

        if self._month_start:
            mdd = (self._month_start - bal) / self._month_start * 100
            if mdd >= self.monthly_dd_pct:
                self._locked_until = now + self.lockout_secs
                return f'Monthly DD {mdd:.1f}% ≥ {self.monthly_dd_pct}% — locked'

        return None


def log_block_transition(log: logging.Logger, state: dict, key: str,
                         reason: str | None) -> None:
    """Log a guard block/unblock once per STATE CHANGE, never per tick.

    `state` is a caller-owned dict ({key: last reason}); call this every tick
    with the current block_reason() result — it logs only when the reason
    appears, changes, or clears."""
    prev = state.get(key)
    if reason == prev:
        return
    state[key] = reason
    if reason:
        log.warning(f'RiskGuard [{key}]: NEW entries blocked — {reason}')
    elif prev:
        log.info(f'RiskGuard [{key}]: clear — entries resumed')
