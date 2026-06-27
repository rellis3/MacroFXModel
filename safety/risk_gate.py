"""
RiskGate — the single, account-aware checkpoint every order passes through.

This is the heart of Layer A. Today each live bot has its own, inconsistent
safety logic (Level bot has RiskGuard + a kill switch; RegimeV2 has a separate
RiskGuardV2 and no kill switch; Gold has neither — see TRADING_SAFETY_LAYER.md).
None of them measures risk at the ACCOUNT level, so three bots can each sit
inside their own 3% drawdown limit while the account bleeds ~9%.

The RiskGate is the account-level backstop those per-bot guards never had. It
answers exactly one question: "given the whole account right now, is this order
allowed?" — and it is FAIL-CLOSED (any error or unreadable input → deny).

It is NOT wired into any bot yet. It is a pure decision function plus a little
persisted state; a bot opts in later by calling `gate.check(...)` immediately
before `mt5.order_send(...)` and skipping the send if `not decision.allowed`.

Check order (first failing check wins, all fail-closed):
    1. KILL       global kill switch active
    2. STALE      input data older than max_data_age_s (when age is supplied)
    3. DAILY_LOSS account down more than daily_loss_pct since UTC day start
    4. MAX_DD     account down more than max_dd_pct from its peak equity
    5. DUPLICATE  same client-order-id already allowed within idempotency TTL
    6. EXPOSURE   total open notional + this order would exceed max_total_notional
    7. BUCKET     a risk-bucket notional would exceed its per-bucket cap
    -> ALLOW
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from .kill_switch import KillSwitch


# ── Value types ────────────────────────────────────────────────────────────────

@dataclass
class OrderIntent:
    """A proposed order, handed to the gate before it is sent to the broker."""
    magic: int
    symbol: str
    side: str                       # 'BUY' | 'SELL'
    volume: float
    notional: float = 0.0           # account-currency exposure of THIS order
    bar_time: Optional[str] = None  # used to build a stable idempotency key
    risk_bucket: Optional[str] = None
    client_order_id: Optional[str] = None

    def cid(self) -> str:
        """Stable per-decision id. Two identical intents on the same bar dedupe."""
        if self.client_order_id:
            return self.client_order_id
        return f"{self.magic}:{self.symbol}:{self.bar_time}:{self.side}"


@dataclass
class Position:
    """An open position as reported by the broker."""
    magic: int
    symbol: str
    side: str
    volume: float
    notional: float = 0.0
    risk_bucket: Optional[str] = None


@dataclass
class AccountSnapshot:
    """The whole account, right now — across every bot/magic."""
    equity: float
    balance: float
    positions: list[Position] = field(default_factory=list)


@dataclass
class RiskLimits:
    """Account-level limits. Generous defaults; tighten per your appetite."""
    daily_loss_pct: float = 4.0            # halt for the day past this loss
    max_dd_pct: float = 8.0                # lock past this peak-to-trough draw
    max_total_notional: Optional[float] = None     # None = no total-exposure cap
    max_bucket_notional: dict[str, float] = field(default_factory=dict)
    idempotency_ttl_s: float = 300.0       # dedupe identical orders within window
    max_data_age_s: float = 120.0          # stale-input ceiling (when age given)


@dataclass
class Decision:
    """The gate's verdict. `allowed` is the only thing a caller must check."""
    allowed: bool
    code: str                       # 'OK' | 'KILL' | 'STALE' | 'DAILY_LOSS' | ...
    reason: str = ""

    def __bool__(self) -> bool:
        return self.allowed


# ── Persisted state ─────────────────────────────────────────────────────────────

_DEFAULT_STATE_PATH = os.path.join(os.path.dirname(__file__), "state", "risk_gate.json")


@dataclass
class _GateState:
    day: str = ""                   # UTC date 'YYYY-MM-DD' the baseline belongs to
    day_start_equity: float = 0.0   # account equity at the start of `day`
    peak_equity: float = 0.0        # high-water mark of account equity
    seen: dict[str, float] = field(default_factory=dict)  # cid -> ts last allowed


# ── The gate ────────────────────────────────────────────────────────────────────

class RiskGate:
    """
    Construct once per process; call `check()` before every order send.

    Example (what a bot does later, opt-in):
        gate = RiskGate(RiskLimits(daily_loss_pct=3), KillSwitch())
        decision = gate.check(intent, provider.snapshot())
        if decision.allowed:
            mt5.order_send(...)
        else:
            log.warning("blocked by risk gate: %s (%s)", decision.reason, decision.code)
    """

    def __init__(self, limits: RiskLimits, kill_switch: KillSwitch,
                 state_path: str = _DEFAULT_STATE_PATH, clock=time.time):
        self.limits = limits
        self.kill = kill_switch
        self.state_path = state_path
        self._clock = clock
        self.state = self._load()

    # -- public API ------------------------------------------------------------

    def check(self, intent: OrderIntent, account: AccountSnapshot,
              data_age_s: Optional[float] = None) -> Decision:
        """
        Decide whether `intent` may be sent, given the whole-account `account`.
        Never raises: any internal error is turned into a fail-closed deny.
        """
        try:
            return self._check(intent, account, data_age_s)
        except Exception as exc:  # fail-closed
            return Decision(False, "ERROR", f"risk gate error (fail-closed): {exc}")

    def status(self, account: AccountSnapshot) -> dict:
        """
        Read-only risk summary for a cockpit/heartbeat. Does NOT mutate baselines
        (so it's safe to poll). Reflects the persisted day baseline / peak.
        """
        eq = account.equity
        dsb = self.state.day_start_equity or eq
        peak = max(self.state.peak_equity or eq, eq)
        day_pl_pct = (eq - dsb) / dsb * 100 if dsb else 0.0
        dd_pct = (peak - eq) / peak * 100 if peak else 0.0
        total_notional = sum(p.notional for p in account.positions)
        ks = self.kill.state()
        return {
            "kill_active": (ks.active if ks else True),
            "kill_mode": (ks.mode if ks else "unknown"),
            "equity": eq,
            "day_start_equity": dsb,
            "day_pl_pct": round(day_pl_pct, 3),
            "daily_loss_limit_pct": self.limits.daily_loss_pct,
            "peak_equity": peak,
            "drawdown_pct": round(dd_pct, 3),
            "max_dd_limit_pct": self.limits.max_dd_pct,
            "total_notional": total_notional,
            "max_total_notional": self.limits.max_total_notional,
            "open_positions": len(account.positions),
        }

    # -- internals -------------------------------------------------------------

    def _check(self, intent: OrderIntent, account: AccountSnapshot,
               data_age_s: Optional[float]) -> Decision:
        now = self._clock()
        eq = account.equity

        # Roll the day baseline forward, and update the peak high-water mark.
        today = datetime.fromtimestamp(now, tz=timezone.utc).strftime("%Y-%m-%d")
        if self.state.day != today or self.state.day_start_equity <= 0:
            self.state.day = today
            self.state.day_start_equity = eq
        if eq > self.state.peak_equity:
            self.state.peak_equity = eq
        if self.state.peak_equity <= 0:
            self.state.peak_equity = eq

        # 1. KILL ---------------------------------------------------------------
        if self.kill.is_active():
            self._save()
            return Decision(False, "KILL", "global kill switch is active")

        # 2. STALE (only when the caller supplies an age) -----------------------
        if data_age_s is not None and data_age_s > self.limits.max_data_age_s:
            self._save()
            return Decision(False, "STALE",
                            f"input data {data_age_s:.0f}s old "
                            f"> {self.limits.max_data_age_s:.0f}s limit")

        # 3. DAILY_LOSS ---------------------------------------------------------
        dsb = self.state.day_start_equity
        if dsb > 0:
            day_pl_pct = (eq - dsb) / dsb * 100
            if day_pl_pct <= -self.limits.daily_loss_pct:
                self._save()
                return Decision(False, "DAILY_LOSS",
                                f"account down {day_pl_pct:.2f}% today "
                                f"(limit {self.limits.daily_loss_pct:.2f}%)")

        # 4. MAX_DD -------------------------------------------------------------
        peak = self.state.peak_equity
        if peak > 0:
            dd_pct = (peak - eq) / peak * 100
            if dd_pct >= self.limits.max_dd_pct:
                self._save()
                return Decision(False, "MAX_DD",
                                f"account drawdown {dd_pct:.2f}% from peak "
                                f"(limit {self.limits.max_dd_pct:.2f}%)")

        # 5. DUPLICATE (idempotency) -------------------------------------------
        cid = intent.cid()
        self._prune_seen(now)
        if cid in self.state.seen:
            self._save()
            return Decision(False, "DUPLICATE",
                            f"order {cid} already allowed within "
                            f"{self.limits.idempotency_ttl_s:.0f}s")

        # 6. EXPOSURE (total notional cap) -------------------------------------
        if self.limits.max_total_notional is not None:
            if intent.notional <= 0:
                self._save()
                return Decision(False, "EXPOSURE",
                                "total-exposure cap is set but order notional is "
                                "unknown (fail-closed)")
            current = sum(p.notional for p in account.positions)
            if current + intent.notional > self.limits.max_total_notional:
                self._save()
                return Decision(False, "EXPOSURE",
                                f"total notional {current + intent.notional:.0f} "
                                f"would exceed cap "
                                f"{self.limits.max_total_notional:.0f}")

        # 7. BUCKET (per-bucket notional cap) ----------------------------------
        bucket = intent.risk_bucket
        if bucket and bucket in self.limits.max_bucket_notional:
            cap = self.limits.max_bucket_notional[bucket]
            if intent.notional <= 0:
                self._save()
                return Decision(False, "BUCKET",
                                f"bucket '{bucket}' cap set but order notional "
                                f"unknown (fail-closed)")
            current = sum(p.notional for p in account.positions
                          if p.risk_bucket == bucket)
            if current + intent.notional > cap:
                self._save()
                return Decision(False, "BUCKET",
                                f"bucket '{bucket}' notional "
                                f"{current + intent.notional:.0f} would exceed "
                                f"cap {cap:.0f}")

        # ALLOW -----------------------------------------------------------------
        self.state.seen[cid] = now
        self._save()
        return Decision(True, "OK", "")

    def _prune_seen(self, now: float) -> None:
        ttl = self.limits.idempotency_ttl_s
        self.state.seen = {c: t for c, t in self.state.seen.items()
                           if now - t <= ttl}

    # -- persistence -----------------------------------------------------------

    def _load(self) -> _GateState:
        try:
            with open(self.state_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return _GateState(**data)
        except FileNotFoundError:
            return _GateState()
        except Exception:
            # Corrupt state: start fresh rather than crash. Baselines re-seed on
            # the next check from live equity (conservative — peak resets to now).
            return _GateState()

    def _save(self) -> None:
        try:
            os.makedirs(os.path.dirname(self.state_path), exist_ok=True)
            tmp = f"{self.state_path}.tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump({
                    "day": self.state.day,
                    "day_start_equity": self.state.day_start_equity,
                    "peak_equity": self.state.peak_equity,
                    "seen": self.state.seen,
                }, fh, indent=2)
            os.replace(tmp, self.state_path)
        except Exception:
            # Persistence is best-effort; never let it block a trading decision.
            pass


# ── Account-wide reconciliation helper ──────────────────────────────────────────

def unexpected_positions(account: AccountSnapshot,
                         known_magics: set[int]) -> list[Position]:
    """
    Return open positions whose magic is NOT one of the bots we know about.
    Run this on startup to catch manual trades, fills that landed during
    downtime, or positions from a retired bot — the account-wide reconciliation
    the per-bot managers can't do (each only sees its own magic).
    """
    return [p for p in account.positions if p.magic not in known_magics]
