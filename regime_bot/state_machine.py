"""
RegimeBot state machine — v2.

States:
  FLAT          — no open position, monitoring for entry
  BULL_HOLDING  — long position open, tracking decay
  BEAR_HOLDING  — short position open, tracking decay

Entry gates (all must pass):
  • Not paused
  • Phase == FLAT
  • regime == BULL or BEAR  (RANGE and CHOP always skipped)
  • conf >= ENTRY_CONF_MIN  (boosted by THIN_CONF_BOOST during thin sessions)
  • vol_z <= ENTRY_VOL_Z_MAX
  • decay <= ENTRY_DECAY_MAX

Exit triggers (any one fires the close):
  • decay >= DECAY_EXIT
  • regime flips against position (BULL_HOLDING + regime in BEAR/RANGE/CHOP)
  • Manual /exit command (handled in main.py, not here)

All functions are pure — no side effects, no MT5 calls.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import config
from regime_engine import RegimeSnapshot

log = logging.getLogger(__name__)

# Sessions where the confidence requirement is boosted (thin liquidity)
_THIN_SESSIONS = {'THIN', 'ASIA'}


@dataclass
class BotState:
    phase:       str               = 'FLAT'   # FLAT | BULL_HOLDING | BEAR_HOLDING
    ticket:      int               = 0
    entry_price: float             = 0.0
    entry_lots:  float             = 0.0
    entry_conf:  float             = 0.0
    entry_decay: float             = 0.0
    entry_time:  Optional[datetime] = None
    paused:      bool              = False
    last_decay:  float             = 0.0
    last_snap:   Optional[RegimeSnapshot] = None


def should_enter(snap: RegimeSnapshot, decay: float, state: BotState) -> Optional[str]:
    """
    Returns 'BUY', 'SELL', or None.

    The effective confidence minimum is raised by THIN_CONF_BOOST during
    THIN/ASIA sessions — thin liquidity produces more spurious regime flips
    so we require a higher-conviction signal before entering.
    """
    if state.paused:
        return None
    if state.phase != 'FLAT':
        return None

    # CHOP and RANGE are explicit no-trade zones
    if snap.regime in ('RANGE', 'CHOP'):
        return None

    # Confidence gate — tightened during thin sessions
    thin = snap.session in _THIN_SESSIONS
    conf_min = config.ENTRY_CONF_MIN + (config.THIN_CONF_BOOST if thin else 0.0)
    if snap.conf < conf_min:
        log.debug(
            f'Entry blocked: conf={snap.conf:.3f} < {conf_min:.3f}'
            + (' [THIN session]' if thin else '')
        )
        return None

    if snap.vol_z > config.ENTRY_VOL_Z_MAX:
        log.debug(f'Entry blocked: vol_z={snap.vol_z:.2f} > {config.ENTRY_VOL_Z_MAX}')
        return None

    if decay > config.ENTRY_DECAY_MAX:
        log.debug(f'Entry blocked: decay={decay:.3f} > {config.ENTRY_DECAY_MAX}')
        return None

    if snap.regime == 'BULL':
        return 'BUY'
    if snap.regime == 'BEAR':
        return 'SELL'
    return None


def should_exit(snap: RegimeSnapshot, decay: float, state: BotState) -> Optional[str]:
    """
    Returns an exit reason string if position should be closed, else None.

    CHOP is treated as a regime flip — it signals high-vol directionless
    activity which invalidates any trend-following hold.
    """
    if state.phase == 'FLAT':
        return None

    if decay >= config.DECAY_EXIT:
        return f'decay_exit (score={decay:.3f} >= {config.DECAY_EXIT})'

    if config.REGIME_FLIP_EXIT:
        if state.phase == 'BULL_HOLDING' and snap.regime in ('BEAR', 'RANGE', 'CHOP'):
            return f'regime_flip BULL→{snap.regime}'
        if state.phase == 'BEAR_HOLDING' and snap.regime in ('BULL', 'RANGE', 'CHOP'):
            return f'regime_flip BEAR→{snap.regime}'

    return None


def on_entry(
    state: BotState,
    direction: str,
    snap: RegimeSnapshot,
    decay: float,
    fill: dict,
) -> None:
    """Mutates state after a successful fill."""
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
