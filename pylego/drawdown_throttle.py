"""DrawdownThrottle — the gradual size-multiplier drawdown throttle, shared.

Extracted 2026-08-31 as a `pylego/` brick when `fib_atlas_bot` became a
SECOND consumer of the exact logic `volatility_bot_v2/drawdown_throttle.py`
already carries (CLAUDE.md's own Lego Principle threshold: "if two copies
already exist, that alone qualifies"). This is a byte-identical copy of that
module's logic — `volatility_bot_v2` itself is left importing its own local
copy for now (a live production bot's import path is not something to touch
as a side effect of adding a new bot); see `MD files/LEGO_MODULES.md` for the
consolidation note. Any FUTURE third consumer should import from here, and a
future cleanup pass should point `volatility_bot_v2` at this copy too and
delete its local one.

Tracks a bot's own realized-balance drawdown from its running PEAK (never
resets, unlike `pylego.risk_guard.RiskGuard`'s daily/monthly reset), and once
that drawdown breaches `trigger_dd`, scales `risk_pct` by `mult` (a gradual
de-risk, not a hard lockout) until the balance recovers to `restore_dd`.
Distinct from RiskGuard: that class is a binary "stop all new entries"
lockout off a DAILY/MONTHLY reset baseline; this is a continuous size
multiplier off the bot's WHOLE-LIFE peak balance. They compose (both can be
active at once) rather than replacing each other.

Live counterpart to `applyDrawdownThrottle` (js/levelAtlasVoteReview.js) —
same trigger/restore/mult semantics, just driven off a live balance stream
instead of a backtest's daily-return series.

Pure state machine, no network/clock dependency beyond the balance value
itself, so it's fully testable by feeding a sequence of balances (see
drawdown_throttle_test.py).

    from pylego.drawdown_throttle import DrawdownThrottle
    throttle = DrawdownThrottle()
    throttle.sync_cfg(cfg)
    mult = throttle.update(balance)   # 1.0 normally, cfg's throttle_mult once triggered
"""
from __future__ import annotations


class DrawdownThrottle:
    def __init__(self, trigger_dd: float = -8.0, restore_dd: float = -2.0, mult: float = 0.25):
        self.trigger_dd = float(trigger_dd)
        self.restore_dd = float(restore_dd)
        self.mult = float(mult)
        self._peak: float | None = None
        self._throttled: bool = False

    def sync_cfg(self, cfg: dict) -> None:
        self.trigger_dd = float(cfg.get("throttle_trigger_dd", self.trigger_dd))
        self.restore_dd = float(cfg.get("throttle_restore_dd", self.restore_dd))
        self.mult = float(cfg.get("throttle_mult", self.mult))

    def update(self, balance: float | None) -> float:
        """Feed the current account balance, get back the size multiplier to
        apply to risk_pct THIS cycle (1.0 = full size, self.mult once
        throttled). Updates the running peak and trigger/restore state as a
        side effect -- call this once per cycle with a real balance, not
        speculatively."""
        if balance is None or balance <= 0:
            return self.mult if self._throttled else 1.0
        if self._peak is None or balance > self._peak:
            self._peak = balance
        dd = (balance - self._peak) / self._peak * 100.0
        if not self._throttled and dd <= self.trigger_dd:
            self._throttled = True
        elif self._throttled and dd >= self.restore_dd:
            self._throttled = False
        return self.mult if self._throttled else 1.0

    def snapshot(self) -> dict:
        """For persisting across restarts (the running peak must survive a
        restart or a bad stretch could silently lose its throttle) and for
        the status push."""
        return {"peak": self._peak, "throttled": self._throttled}

    def restore(self, snap: dict | None) -> None:
        if not snap:
            return
        self._peak = snap.get("peak")
        self._throttled = bool(snap.get("throttled"))
