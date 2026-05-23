"""
RegimeBot state machine.

States:
  FLAT          — no open position, monitoring for entry
  BULL_HOLDING  — long position open, tracking decay
  BEAR_HOLDING  — short position open, tracking decay

Transitions are pure functions — no side effects.
The caller (main.py) executes MT5 orders and updates state via on_entry/on_exit.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import config
from regime_engine import RegimeSnapshot

log = logging.getLogger(__name__)


@dataclass
class BotState:
    phase:        str              = 'FLAT'   # FLAT | BULL_HOLDING | BEAR_HOLDING
    ticket:       int              = 0
    entry_price:  float            = 0.0
    entry_lots:   float            = 0.0
    entry_conf:   float            = 0.0
    entry_decay:  float            = 0.0
    entry_time:   Optional[datetime] = None
    paused:       bool             = False
    last_decay:   float            = 0.0
    last_snap:    Optional[RegimeSnapshot] = None


def should_enter(snap: RegimeSnapshot, decay: float, state: BotState) -> Optional[str]:
    """
    Returns 'BUY', 'SELL', or None.

    Entry gates (all must pass):
      - Not paused
      - Currently flat (no position)
      - HMM confidence >= ENTRY_CONF_MIN
      - vol_z <= ENTRY_VOL_Z_MAX  (avoid entering into vol spikes)
      - decay score <= ENTRY_DECAY_MAX  (avoid entering a decaying regime)
      - regime is BULL or BEAR  (RANGE skipped for now)
    """
    if state.paused:
        return None
    if state.phase != 'FLAT':
        return None
    if snap.conf < config.ENTRY_CONF_MIN:
        log.debug(f'Entry blocked: conf={snap.conf:.3f} < {config.ENTRY_CONF_MIN}')
        return None
    if snap.vol_z > config.ENTRY_VOL_Z_MAX:
        log.debug(f'Entry blocked: vol_z={snap.vol_z:.2f} > {config.ENTRY_VOL_Z_MAX}')
        return None
    if decay > config.ENTRY_DECAY_MAX:
        log.debug(f'Entry blocked: decay={decay:.2f} > {config.ENTRY_DECAY_MAX}')
        return None
    if snap.regime == 'BULL':
        return 'BUY'
    if snap.regime == 'BEAR':
        return 'SELL'
    return None


def should_exit(snap: RegimeSnapshot, decay: float, state: BotState) -> Optional[str]:
    """
    Returns an exit reason string if position should be closed, else None.

    Exit triggers (any one is sufficient):
      1. Decay score >= DECAY_EXIT threshold
      2. Regime flipped against position direction (if REGIME_FLIP_EXIT enabled)
    """
    if state.phase == 'FLAT':
        return None

    # Trailing decay exit
    if decay >= config.DECAY_EXIT:
        return f'decay_exit (score={decay:.3f} >= {config.DECAY_EXIT})'

    # Regime flip exit
    if config.REGIME_FLIP_EXIT:
        if state.phase == 'BULL_HOLDING' and snap.regime in ('BEAR', 'RANGE'):
            return f'regime_flip BULL→{snap.regime}'
        if state.phase == 'BEAR_HOLDING' and snap.regime in ('BULL', 'RANGE'):
            return f'regime_flip BEAR→{snap.regime}'

    return None


def on_entry(state: BotState, direction: str, snap: RegimeSnapshot,
             decay: float, fill: dict) -> None:
    """Mutates state after a successful order fill."""
    state.phase       = 'BULL_HOLDING' if direction == 'BUY' else 'BEAR_HOLDING'
    state.ticket      = fill.get('ticket', 0)
    state.entry_price = fill.get('price',  0.0)
    state.entry_lots  = fill.get('lots',   0.0)
    state.entry_conf  = snap.conf
    state.entry_decay = decay
    state.entry_time  = datetime.now(timezone.utc)


def on_exit(state: BotState) -> None:
    """Resets state to FLAT after a position is closed."""
    state.phase       = 'FLAT'
    state.ticket      = 0
    state.entry_price = 0.0
    state.entry_lots  = 0.0
    state.entry_conf  = 0.0
    state.entry_decay = 0.0
    state.entry_time  = None
