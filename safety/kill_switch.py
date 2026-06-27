"""
Global kill switch — one stop button for all trading.

Design goals:
  * Fail-closed: if the switch state can't be read, callers treat trading as
    HALTED (the RiskGate does this — see risk_gate.py).
  * Durable by default: state lives in a JSON file so a process restart does NOT
    silently re-enable trading. (A kill switch that resets on crash is worse than
    no kill switch.)
  * Zero coupling: the default FileBackend has no network/MT5/dashboard
    dependency. An optional HttpKvBackend can mirror state to the dashboard KV so
    a future cockpit button can flip it — but nothing here requires that.

Two modes:
  * 'halt'    — block all new entries (open positions are left alone).
  * 'flatten' — block new entries AND signal that open positions should be
                closed. This module only records the intent; the actual closing
                is the bot's / cockpit's job (it owns the broker connection).
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, asdict
from typing import Optional, Protocol


_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "state", "kill_switch.json")


@dataclass
class KillState:
    """Current kill-switch state."""
    active: bool = False
    mode: str = "halt"            # 'halt' | 'flatten'
    reason: str = ""
    updated_ts: float = 0.0
    updated_by: str = ""

    @property
    def should_flatten(self) -> bool:
        return self.active and self.mode == "flatten"


class KillSwitchBackend(Protocol):
    """Storage backend for the kill-switch state."""
    def read(self) -> Optional[KillState]: ...
    def write(self, state: KillState) -> None: ...


class FileBackend:
    """JSON-file backend. Durable across restarts; no external dependencies."""

    def __init__(self, path: str = _DEFAULT_PATH):
        self.path = path

    def read(self) -> Optional[KillState]:
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return KillState(**data)
        except FileNotFoundError:
            # No file yet == switch has never been engaged == not active.
            return KillState()
        except Exception:
            # Corrupt/unreadable state — return None so callers fail CLOSED.
            return None

    def write(self, state: KillState) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = f"{self.path}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(asdict(state), fh, indent=2)
        os.replace(tmp, self.path)   # atomic on POSIX


class KillSwitch:
    """
    The global stop button.

    Usage (read side — what a bot does each loop):
        ks = KillSwitch()
        if ks.is_active():        # fail-closed: True if state unreadable
            ...halt...

    Usage (write side — what an operator / cockpit / CLI does):
        ks.activate(reason="manual", mode="halt", by="richard")
        ks.deactivate(by="richard")
    """

    def __init__(self, backend: Optional[KillSwitchBackend] = None,
                 clock=time.time):
        self.backend = backend or FileBackend()
        self._clock = clock

    def state(self) -> Optional[KillState]:
        """Returns current state, or None if it could not be read."""
        return self.backend.read()

    def is_active(self) -> bool:
        """
        True if trading should be halted. FAIL-CLOSED: an unreadable state
        counts as active, because we'd rather wrongly halt than wrongly trade.
        """
        st = self.backend.read()
        if st is None:
            return True
        return st.active

    def activate(self, reason: str = "", mode: str = "halt", by: str = "") -> KillState:
        if mode not in ("halt", "flatten"):
            raise ValueError(f"mode must be 'halt' or 'flatten', got {mode!r}")
        st = KillState(active=True, mode=mode, reason=reason,
                       updated_ts=self._clock(), updated_by=by)
        self.backend.write(st)
        return st

    def deactivate(self, by: str = "") -> KillState:
        st = KillState(active=False, mode="halt", reason="",
                       updated_ts=self._clock(), updated_by=by)
        self.backend.write(st)
        return st
