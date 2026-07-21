"""
Trade Manager V2 — multi-position portfolio state for the Gold V2 bot.

Replaces V1's single armed-zone / single-trade state machine with:

  * several zones ARMED simultaneously (capped, best-score first)
  * several trades OPEN concurrently, guarded by AGGREGATE limits — gold
    positions are ~perfectly correlated, so the caps are risk-based, not
    count-only:
      - max_concurrent_trades      hard count cap
      - max_open_risk_pct          sum of open-trade risk (% of balance)
      - max_per_direction          count cap per side
      - min_entry_separation_pips  no stacking entries on the same shelf
  * per-zone cooldowns (a stop-out on one level doesn't freeze the whole bot)
    plus a short global cooldown between consecutive entries
  * trades_today that RESETS on UTC day rollover (V1 never reset it — after
    2 trades the bot silently stopped until the process restarted)
  * JSON persistence + MT5 position adoption so a restart mid-trade neither
    loses paper trades nor orphans live positions
  * MFE / MAE tracking per trade for later exit tuning
"""

from __future__ import annotations
import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, timedelta
from typing import Optional

log = logging.getLogger(__name__)


def paper_close_exec(direction: str, mid: float, spread: float) -> float:
    """Exit-side executable price for a PAPER position marked at mid.

    A LONG closes by selling at the bid = mid − spread/2; a SHORT closes by
    buying at the ask = mid + spread/2. Together with entries filled at the
    opposite side (BUY at ask, SELL at bid) a paper round trip pays exactly
    one full spread — matching what live MT5 fills already pay for free-fill
    honesty (CLAUDE.md: "costs on by default; free fills are not honest").
    """
    half = max(0.0, spread) / 2.0
    return mid - half if direction == 'LONG' else mid + half


@dataclass
class ManagedTrade:
    trade_id: str
    zone_id: str
    direction: str        # LONG | SHORT
    entry_price: float
    sl: float
    tp1: float
    tp2: float
    lot_size: float
    risk_pct: float       # balance % risked at entry (for the aggregate cap)
    entry_time: str       # ISO
    mode: str = 'PAPER'   # PAPER | LIVE
    ticket: Optional[int] = None
    tp1_hit: bool = False
    be_moved: bool = False
    htf_aligned: bool = False
    mfe_pips: float = 0.0   # max favourable excursion
    mae_pips: float = 0.0   # max adverse excursion (positive number)
    sl_basis: str = ''
    tp_basis: str = ''
    zone_score: float = 0.0   # confluence score at entry (for the zones-page history)
    symbol: str = ''          # MT5 symbol — set by the multi-instrument orchestrator

    # ── outcome helpers ────────────────────────────────────────────────────

    def entry_dt(self) -> datetime:
        return datetime.fromisoformat(self.entry_time)

    def update_excursion(self, price: float, pip: float = 1.0) -> None:
        """Track peak favourable / adverse excursion, in PIPS. The run MUST be
        divided by the instrument's pip size: without it `run` is a raw price
        distance (~0.0014 for an FX pair) that round(_,1) collapses to 0.0, so
        every FX trade logged MFE/MAE = 0 while gold/indices (large price units)
        looked fine — the bug that made the give-back diagnostic unreadable.
        pnl_pips (journal._pips) is already pip-normalised; this now matches it."""
        sign = 1 if self.direction == 'LONG' else -1
        run  = sign * (price - self.entry_price) / (pip or 1.0)
        if run > self.mfe_pips:
            self.mfe_pips = round(run, 1)
        if -run > self.mae_pips:
            self.mae_pips = round(-run, 1)

    def check_outcome(self, price: float, be_after_tp1: bool = True,
                      spread: float = 0.0) -> Optional[str]:
        """
        Paper-mode outcome check. Simulates the live management: after TP1 the
        stop moves to breakeven (so paper labels match live behaviour — V1
        didn't, which skewed the journal).

        `spread` (full bid/ask width, price units) costs the touch checks: all
        comparisons use the EXIT-side executable price, so a LONG's TP/SL is
        touched by the bid = mid − spread/2 and a SHORT's stop is hit by the
        ask = mid + spread/2. spread=0 keeps the legacy mid-cross behaviour
        (the live-mode fallback path passes no spread).
        """
        price = paper_close_exec(self.direction, price, spread)
        if self.direction == 'LONG':
            if not self.tp1_hit and price >= self.tp1:
                self.tp1_hit = True
                if be_after_tp1 and not self.be_moved:
                    self.sl = self.entry_price
                    self.be_moved = True
                return 'TP1_HIT'
            if price >= self.tp2:
                return 'TP2_HIT'
            if price <= self.sl:
                return 'BE_STOP' if self.be_moved and abs(self.sl - self.entry_price) < 1e-9 \
                    else 'SL_HIT'
        else:
            if not self.tp1_hit and price <= self.tp1:
                self.tp1_hit = True
                if be_after_tp1 and not self.be_moved:
                    self.sl = self.entry_price
                    self.be_moved = True
                return 'TP1_HIT'
            if price <= self.tp2:
                return 'TP2_HIT'
            if price >= self.sl:
                return 'BE_STOP' if self.be_moved and abs(self.sl - self.entry_price) < 1e-9 \
                    else 'SL_HIT'
        return None


@dataclass
class ArmedZone:
    zone_id: str
    armed_at: float                      # unix
    gp_entry_time: Optional[float] = None   # unix — first tick inside the window


class TradeManager:
    def __init__(self, state_path: str):
        self.state_path = state_path
        self.open_trades: list[ManagedTrade] = []
        self.armed: dict[str, ArmedZone] = {}
        self.zone_cooldowns: dict[str, str] = {}   # zone cluster key → ISO until
        self.global_cooldown_until: Optional[str] = None
        self.trades_today = 0
        self.trades_date  = self._today()
        self._trade_seq   = 0

    # ── day rollover ──────────────────────────────────────────────────────────

    @staticmethod
    def _today() -> str:
        return datetime.now(timezone.utc).strftime('%Y-%m-%d')

    def roll_day_if_needed(self) -> bool:
        """Reset the daily counter on UTC date change. Returns True if rolled."""
        today = self._today()
        if today != self.trades_date:
            log.info(f'[DAY]    Rollover {self.trades_date} → {today} — '
                     f'trades_today {self.trades_today} → 0')
            self.trades_date  = today
            self.trades_today = 0
            return True
        return False

    # ── cooldowns ─────────────────────────────────────────────────────────────

    @staticmethod
    def zone_cluster_key(zone_id: str) -> str:
        # zone ids are 'v2_<dir>_<price-bucket>[_gp]' — cluster key drops the suffix
        return zone_id.replace('_gp', '')

    def in_zone_cooldown(self, zone_id: str) -> bool:
        key   = self.zone_cluster_key(zone_id)
        until = self.zone_cooldowns.get(key)
        if not until:
            return False
        if datetime.now(timezone.utc) >= datetime.fromisoformat(until):
            del self.zone_cooldowns[key]
            return False
        return True

    def in_global_cooldown(self) -> bool:
        if not self.global_cooldown_until:
            return False
        if datetime.now(timezone.utc) >= datetime.fromisoformat(self.global_cooldown_until):
            self.global_cooldown_until = None
            return False
        return True

    def start_zone_cooldown(self, zone_id: str, minutes: int) -> None:
        until = datetime.now(timezone.utc) + timedelta(minutes=minutes)
        self.zone_cooldowns[self.zone_cluster_key(zone_id)] = until.isoformat()

    def start_global_cooldown(self, minutes: int) -> None:
        until = datetime.now(timezone.utc) + timedelta(minutes=minutes)
        self.global_cooldown_until = until.isoformat()

    # ── arming ────────────────────────────────────────────────────────────────

    def arm(self, zone_id: str, now_unix: float, inside_window: bool) -> None:
        self.armed[zone_id] = ArmedZone(
            zone_id=zone_id, armed_at=now_unix,
            gp_entry_time=now_unix if inside_window else None,
        )

    def disarm(self, zone_id: str) -> None:
        self.armed.pop(zone_id, None)

    def is_armed(self, zone_id: str) -> bool:
        return zone_id in self.armed

    def zone_has_open_trade(self, zone_id: str) -> bool:
        key = self.zone_cluster_key(zone_id)
        return any(self.zone_cluster_key(t.zone_id) == key for t in self.open_trades)

    # ── portfolio gate ────────────────────────────────────────────────────────

    def can_open(self, direction: str, risk_pct: float, entry_price: float,
                 cfg: dict, pip: float = 1.0) -> tuple[bool, str]:
        self.roll_day_if_needed()

        if self.trades_today >= int(cfg.get('max_trades_per_day', 4)):
            return False, f'daily limit ({self.trades_today})'

        max_conc = int(cfg.get('max_concurrent_trades', 2))
        if len(self.open_trades) >= max_conc:
            return False, f'max concurrent trades ({max_conc})'

        open_risk = sum(t.risk_pct for t in self.open_trades if not t.be_moved)
        max_risk  = float(cfg.get('max_open_risk_pct', 1.0))
        if open_risk + risk_pct > max_risk + 1e-9:
            return False, (f'aggregate open risk {open_risk + risk_pct:.2f}% '
                           f'> cap {max_risk:.2f}%')

        same_dir = [t for t in self.open_trades if t.direction == direction]
        if len(same_dir) >= int(cfg.get('max_per_direction', 2)):
            return False, f'max {direction} positions'

        sep_pips = float(cfg.get('min_entry_separation_pips', 15))
        sep = sep_pips * pip
        for t in self.open_trades:
            if t.direction == direction and abs(t.entry_price - entry_price) < sep:
                return False, (f'entry {entry_price:.1f} within {sep_pips:.0f}p of open '
                               f'{t.direction} @ {t.entry_price:.1f} — same shelf')

        if self.in_global_cooldown():
            return False, 'global cooldown'

        return True, ''

    # ── trade lifecycle ───────────────────────────────────────────────────────

    def open_trade(self, trade: ManagedTrade) -> None:
        self.open_trades.append(trade)
        self.trades_today += 1
        self.disarm(trade.zone_id)

    def close_trade(self, trade: ManagedTrade) -> None:
        self.open_trades = [t for t in self.open_trades
                            if t.trade_id != trade.trade_id]

    def next_trade_id(self) -> str:
        self._trade_seq += 1
        return f"{self._today()}-{self._trade_seq:03d}"

    # ── persistence ───────────────────────────────────────────────────────────

    def save(self) -> None:
        data = {
            'open_trades': [asdict(t) for t in self.open_trades],
            'zone_cooldowns': self.zone_cooldowns,
            'global_cooldown_until': self.global_cooldown_until,
            'trades_today': self.trades_today,
            'trades_date': self.trades_date,
            'trade_seq': self._trade_seq,
        }
        try:
            tmp = self.state_path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, self.state_path)
        except Exception as exc:
            log.warning(f'State save failed: {exc}')

    def load(self) -> None:
        try:
            with open(self.state_path, encoding='utf-8') as f:
                data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return
        try:
            self.open_trades = [ManagedTrade(**t) for t in data.get('open_trades', [])]
            self.zone_cooldowns = data.get('zone_cooldowns', {})
            self.global_cooldown_until = data.get('global_cooldown_until')
            self.trades_today = int(data.get('trades_today', 0))
            self.trades_date  = data.get('trades_date', self._today())
            self._trade_seq   = int(data.get('trade_seq', 0))
            self.roll_day_if_needed()
            if self.open_trades:
                log.info(f'[STATE]  Restored {len(self.open_trades)} open trade(s) '
                         f'from {self.state_path}')
        except Exception as exc:
            log.warning(f'State restore failed ({exc}) — starting clean')

    # ── MT5 adoption (live restarts) ──────────────────────────────────────────

    def adopt_mt5_positions(self, positions: list, magic: int) -> int:
        """
        Adopt live MT5 positions carrying our magic number that we aren't
        tracking (e.g. after a restart where the state file was lost). SL/TP
        are taken from the broker order; TP1 is unknowable so it's set at the
        midpoint (breakeven management resumes from there).
        Returns the number adopted.
        """
        known = {t.ticket for t in self.open_trades if t.ticket}
        adopted = 0
        for p in positions:
            if getattr(p, 'magic', None) != magic or int(p.ticket) in known:
                continue
            direction = 'LONG' if p.type == 0 else 'SHORT'
            sl = float(p.sl) if p.sl else 0.0
            tp = float(p.tp) if p.tp else 0.0
            entry = float(p.price_open)
            tp1 = round((entry + tp) / 2, 2) if tp else entry
            self.open_trades.append(ManagedTrade(
                trade_id=self.next_trade_id(),
                zone_id=f'adopted_{int(p.ticket)}',
                direction=direction,
                entry_price=entry,
                sl=sl or (entry - 40 if direction == 'LONG' else entry + 40),
                tp1=tp1, tp2=tp or entry,
                lot_size=float(p.volume),
                risk_pct=0.5,
                entry_time=datetime.fromtimestamp(int(p.time), tz=timezone.utc).isoformat(),
                mode='LIVE', ticket=int(p.ticket),
                symbol=str(getattr(p, 'symbol', '') or ''),
            ))
            adopted += 1
            log.info(f'[ADOPT]  MT5 position {p.ticket} {direction} @ {entry:.2f} '
                     f'adopted into trade manager')
        return adopted
