"""Drawdown throttle — bot-local, live reimplementation of
`applyDrawdownThrottle`/`applyGradedDrawdownThrottle` (js/levelAtlasVoteReview.js),
added 2026-08-30 after a live-vs-backtest parity audit found this validated
lever had never been implemented live at all.

Two modes, both tracking this bot's own realized-balance drawdown from its
running PEAK (never resets, unlike pylego.risk_guard.RiskGuard's daily/
monthly reset):
  - "cliff" (the original design): once drawdown breaches `trigger_dd`, a
    single step to `mult` until balance recovers to `restore_dd`. Validated
    in analysis/drawdown_throttle_backtest.mjs: ~40% shallower drawdown both
    IS and OOS, at a real, disclosed Sharpe/CAGR cost.
  - "graded" (added 2026-09-14, "institutional idea #2"): steps the
    multiplier down through DEFAULT_GRADED_TIERS as drawdown worsens, and
    back up through them as it recovers, instead of one on/off cliff.
    Validated against the full 17-pair live-vote-portfolio dataset (IS/OOS
    stable, insensitive to exact tier choice, handles the portfolio's own
    worst historical drawdown episode BETTER than cliff — see
    js/levelAtlasVoteReview.js's applyGradedDrawdownThrottle doc), then
    re-confirmed 2026-09-14 on the LIVE account's own actual configured
    trade set via the backtest page's swappable throttle-style option:
    same Sharpe (3.61 vs 3.62), shallower max drawdown (-13.3% vs -14.1%
    compounded), better Calmar on every cut of the numbers. Made the live
    default on that same date. `trigger_dd`/`mult` are ignored in this mode
    (the tiers are fixed at their validated values, not slider-derived) --
    same design decision as the backtest route, so switching modes with
    default settings reproduces exactly what was actually tested.

Distinct from RiskGuard: that class is a binary "stop all new entries"
lockout off a DAILY/MONTHLY reset baseline; this is a continuous size
multiplier off the bot's WHOLE-LIFE peak balance. They compose (both can be
active at once) rather than replacing each other.

Pure state machine, no network/clock dependency beyond the balance value
itself, so it's fully testable by feeding a sequence of balances (see
drawdown_throttle_test.py).

    from volatility_bot_v3.drawdown_throttle import DrawdownThrottle
    throttle = DrawdownThrottle()
    throttle.sync_cfg(cfg)
    mult = throttle.update(balance)   # 1.0 normally, the active tier's mult once throttled
"""
from __future__ import annotations

# Validated 2026-09-14 tier ramp (shallowest -> deepest). Kept as a module
# constant, mirroring js/levelAtlasVoteReview.js's DEFAULT_GRADED_THROTTLE_TIERS,
# so the two implementations can't silently drift apart.
DEFAULT_GRADED_TIERS: list[tuple[float, float]] = [(-4.0, 0.65), (-6.0, 0.40), (-8.0, 0.25)]


class DrawdownThrottle:
    def __init__(self, trigger_dd: float = -8.0, restore_dd: float = -2.0, mult: float = 0.25,
                 mode: str = "cliff", tiers: list[tuple[float, float]] | None = None):
        self.trigger_dd = float(trigger_dd)
        self.restore_dd = float(restore_dd)
        self.mult = float(mult)
        self.mode = mode if mode == "graded" else "cliff"
        self.tiers = tiers if tiers else list(DEFAULT_GRADED_TIERS)
        self._peak: float | None = None
        self._throttled: bool = False
        self._last_mult: float = 1.0

    def sync_cfg(self, cfg: dict) -> None:
        self.trigger_dd = float(cfg.get("throttle_trigger_dd", self.trigger_dd))
        self.restore_dd = float(cfg.get("throttle_restore_dd", self.restore_dd))
        self.mult = float(cfg.get("throttle_mult", self.mult))
        self.mode = cfg.get("throttle_mode", self.mode)
        if self.mode != "graded":
            self.mode = "cliff"

    def update(self, balance: float | None) -> float:
        """Feed the current account balance, get back the size multiplier to
        apply to risk_pct THIS cycle (1.0 = full size, the active tier's mult
        once throttled). Updates the running peak and trigger/restore state
        as a side effect -- call this once per cycle with a real balance,
        not speculatively."""
        if balance is None or balance <= 0:
            return self._last_mult
        if self._peak is None or balance > self._peak:
            self._peak = balance
        dd = (balance - self._peak) / self._peak * 100.0
        entry_trigger = self.tiers[0][0] if self.mode == "graded" else self.trigger_dd
        if not self._throttled and dd <= entry_trigger:
            self._throttled = True
        elif self._throttled and dd >= self.restore_dd:
            self._throttled = False
        if not self._throttled:
            mult = 1.0
        elif self.mode == "graded":
            # Deepest tier whose trigger the current drawdown clears wins;
            # falls back to the shallowest tier's mult if throttled but dd
            # hasn't cleared any tier boundary (e.g. still recovering,
            # between the entry trigger and the first tier) -- identical
            # algorithm and identical fallback to the JS reference impl.
            mult = self.tiers[0][1]
            for t_trigger, t_mult in self.tiers:
                if dd <= t_trigger:
                    mult = t_mult
        else:
            mult = self.mult
        self._last_mult = mult
        return mult

    def snapshot(self) -> dict:
        """For persisting across restarts (the running peak must survive a
        restart or a bad stretch could silently lose its throttle) and for
        the status push."""
        return {"peak": self._peak, "throttled": self._throttled, "mode": self.mode, "mult": self._last_mult}

    def restore(self, snap: dict | None) -> None:
        if not snap:
            return
        self._peak = snap.get("peak")
        self._throttled = bool(snap.get("throttled"))
        self._last_mult = float(snap.get("mult", self.mult if self._throttled else 1.0))

    def reset(self) -> None:
        """Manual operator override (bot-config page's 'Reset throttle now'
        button) — clears the running peak and throttled state immediately,
        instead of waiting for balance to recover to restore_dd. The next
        update() call re-seeds the peak from whatever balance it's given.
        Use when the current drawdown is believed stale/no-longer-relevant
        (e.g. after a manual balance adjustment), not as a routine lever —
        this discards real information the throttle was tracking."""
        self._peak = None
        self._throttled = False
        self._last_mult = 1.0
