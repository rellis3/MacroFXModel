"""
Risk management for RegimeBot.

Handles four concerns in one place:
  1. ATR-based SL/TP computation (volatility-adaptive, hard-capped)
  2. Account %-risk position sizing  (lots = risk_$ / sl_pips / pip_value)
  3. Drawdown limits  (daily + session, with lockout and persistence)
  4. Trade hygiene    (per-day trade cap, inter-trade cooldown)

Usage:
    risk = RiskManager()
    risk.update_balance(balance)          # every tick

    # Before entry:
    allowed, reason = risk.check_entry(balance)
    sl, tp, sl_pips, method = risk.compute_sl_tp(bars, 'BUY', price)
    lots = risk.size_lots(balance, sl_pips, decay_score)

    # After fill:
    risk.record_trade()
"""

import json
import logging
import time
from datetime import datetime, date as date_type, timezone
from pathlib import Path
from typing import Optional

import config

log = logging.getLogger(__name__)

# ── Pip-value tables ──────────────────────────────────────────────────────────
# pip_size:  price movement per pip
# pip_value: USD P&L per pip per 1 standard lot (approximate; good enough for sizing)

_PIP_SIZE: dict[str, float] = {
    'EURUSD': 0.0001, 'GBPUSD': 0.0001, 'AUDUSD': 0.0001, 'NZDUSD': 0.0001,
    'USDCAD': 0.0001, 'USDCHF': 0.0001, 'EURGBP': 0.0001, 'EURCAD': 0.0001,
    'USDJPY': 0.01,   'GBPJPY': 0.01,   'EURJPY': 0.01,   'CADJPY': 0.01,
    'XAUUSD': 0.01,   'NAS100USD': 1.0, 'US30USD': 1.0,   'GER40USD': 1.0,
}

_PIP_VALUE: dict[str, float] = {
    'EURUSD': 10.0,  'GBPUSD': 10.0,  'AUDUSD': 10.0,  'NZDUSD': 10.0,
    'USDCAD': 7.5,   'USDCHF': 10.5,  'EURGBP': 13.0,  'EURCAD': 7.5,
    'USDJPY': 9.0,   'GBPJPY': 9.0,   'EURJPY': 9.0,   'CADJPY': 7.5,
    'XAUUSD': 1.0,   'NAS100USD': 1.0, 'US30USD': 1.0,  'GER40USD': 1.0,
}

_STATE_FILE = Path(__file__).parent / 'risk_state.json'


# ── ATR helper (mirrors _build_atr in regime_engine.py) ──────────────────────

def _compute_atr(bars: list[dict], period: int) -> float:
    """Wilder EMA ATR over the last `period` 1m bars."""
    if len(bars) < 2:
        return 0.0
    k      = 1.0 / period
    tr_ema = abs(bars[0]['high'] - bars[0]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr     = max(h - l, abs(h - pc), abs(l - pc))
        tr_ema = k * tr + (1 - k) * tr_ema
    return tr_ema


# ── RiskManager ───────────────────────────────────────────────────────────────

class RiskManager:

    def __init__(self):
        self._day_start_bal:     Optional[float]     = None
        self._session_start_bal: Optional[float]     = None
        self._last_reset_date:   Optional[date_type] = None
        self._locked_until:      float               = 0.0
        self._last_trade_ts:     float               = 0.0
        self._daily_trades:      int                 = 0
        self._load_state()

    # ── Balance tracking ──────────────────────────────────────────────────────

    def update_balance(self, balance: float) -> None:
        """Call once per tick.  Handles midnight daily reset automatically."""
        today = datetime.now(timezone.utc).date()

        if self._session_start_bal is None:
            self._session_start_bal = balance
            log.info(f'Session baseline set: {balance:.2f}')

        if self._day_start_bal is None:
            self._day_start_bal   = balance
            self._last_reset_date = today

        if self._last_reset_date and today > self._last_reset_date:
            log.info(f'Daily reset: day_start {self._day_start_bal:.2f} → {balance:.2f}  trades={self._daily_trades}')
            self._day_start_bal   = balance
            self._daily_trades    = 0
            self._last_reset_date = today
            self._save_state()

    # ── Entry gate ─────────────────────────────────────────────────────────────

    def check_entry(self, balance: float) -> tuple[bool, str]:
        """
        Returns (allowed, reason_string).
        Call this before every entry attempt.
        """
        now = time.time()

        if now < self._locked_until:
            rem_m = int((self._locked_until - now) / 60)
            return False, f'DD lockout — {rem_m}m remaining'

        if self._day_start_bal and self._day_start_bal > 0:
            dd = (self._day_start_bal - balance) / self._day_start_bal * 100
            if dd >= config.MAX_DAILY_DD_PCT:
                self._locked_until = now + config.DD_LOCKOUT_HOURS * 3600
                self._save_state()
                return False, f'Daily DD {dd:.2f}% ≥ limit {config.MAX_DAILY_DD_PCT}%'

        if self._session_start_bal and self._session_start_bal > 0:
            sdd = (self._session_start_bal - balance) / self._session_start_bal * 100
            if sdd >= config.MAX_SESSION_DD_PCT:
                self._locked_until = now + config.DD_LOCKOUT_HOURS * 3600
                self._save_state()
                return False, f'Session DD {sdd:.2f}% ≥ limit {config.MAX_SESSION_DD_PCT}%'

        if self._last_trade_ts > 0:
            elapsed_m = (now - self._last_trade_ts) / 60
            if elapsed_m < config.TRADE_COOLDOWN_MIN:
                remaining = config.TRADE_COOLDOWN_MIN - elapsed_m
                return False, f'Cooldown — {remaining:.1f}m remaining'

        if self._daily_trades >= config.MAX_DAILY_TRADES:
            return False, f'Daily trade limit {self._daily_trades}/{config.MAX_DAILY_TRADES} reached'

        return True, ''

    # ── SL / TP computation ────────────────────────────────────────────────────

    def compute_sl_tp(
        self,
        bars: list[dict],
        direction: str,
        price: float,
    ) -> tuple[float, float, float, str]:
        """
        Computes SL and TP prices and returns (sl, tp, sl_pips, method_label).

        ATR mode:  SL = price ± ATR(SL_ATR_BARS) × SL_ATR_MULT
        Fixed mode: SL = price ± SL_FIXED_PIPS × pip_size
        Both are hard-capped at SL_MAX_PIPS.

        TP = price ± sl_dist × TP_RR, capped at TP_MAX_PIPS.
        """
        pip    = _PIP_SIZE.get(config.PAIR, config.PIP_SIZE)
        is_buy = direction == 'BUY'

        # ── SL distance ───────────────────────────────────────────────────────
        if config.SL_METHOD == 'atr' and bars:
            atr_val = _compute_atr(bars, config.SL_ATR_BARS)
            sl_pips = atr_val / pip * config.SL_ATR_MULT
            method  = f'ATR({config.SL_ATR_BARS})×{config.SL_ATR_MULT}'
        else:
            sl_pips = config.SL_FIXED_PIPS
            method  = 'fixed_pips'

        # Hard cap
        if sl_pips > config.SL_MAX_PIPS:
            sl_pips = config.SL_MAX_PIPS
            method += f'  [capped@{config.SL_MAX_PIPS}p]'

        sl_dist = sl_pips * pip
        sl      = round(price - sl_dist if is_buy else price + sl_dist, 6)

        # ── TP distance ───────────────────────────────────────────────────────
        tp_pips = min(sl_pips * config.TP_RR, config.TP_MAX_PIPS)
        tp_dist = tp_pips * pip
        tp      = round(price + tp_dist if is_buy else price - tp_dist, 6)

        return sl, tp, sl_pips, method

    # ── Position sizing ───────────────────────────────────────────────────────

    def size_lots(self, balance: float, sl_pips: float, decay_score: float = 0.0) -> float:
        """
        Returns lot size so a SL hit costs exactly RISK_PCT_PER_TRADE % of balance.

        Formula:  lots = risk_amount / (sl_pips × pip_value_per_lot)

        An optional decay discount is applied:
          decay=0.0 → full size,  decay=0.5 → 75% size,  decay≈1.0 → minimum size.
        This means the bot naturally sizes down as a regime ages.
        """
        pip_value   = _PIP_VALUE.get(config.PAIR, 10.0)
        risk_amount = balance * (config.RISK_PCT_PER_TRADE / 100)

        if sl_pips <= 0 or pip_value <= 0:
            return config.LOT_SIZE_MIN

        raw_lots = risk_amount / (sl_pips * pip_value)

        # Decay discount: linearly scale from 100% → 50% as decay goes 0→1
        decay_scale = 1.0 - decay_score * 0.5
        lots        = raw_lots * decay_scale

        return round(max(config.LOT_SIZE_MIN, min(config.LOT_SIZE_MAX, lots)), 2)

    # ── Trade recording ───────────────────────────────────────────────────────

    def record_trade(self) -> None:
        """Call immediately after a successful fill."""
        self._last_trade_ts  = time.time()
        self._daily_trades  += 1
        self._save_state()
        log.info(f'Trade recorded: daily_trades={self._daily_trades}')

    # ── Status ────────────────────────────────────────────────────────────────

    def dd_status(self, balance: float) -> dict:
        """Returns current DD stats for status display."""
        day_dd = session_dd = 0.0
        if self._day_start_bal and self._day_start_bal > 0:
            day_dd = (self._day_start_bal - balance) / self._day_start_bal * 100
        if self._session_start_bal and self._session_start_bal > 0:
            session_dd = (self._session_start_bal - balance) / self._session_start_bal * 100
        locked = time.time() < self._locked_until
        return {
            'day_dd_pct':     round(day_dd, 2),
            'session_dd_pct': round(session_dd, 2),
            'daily_trades':   self._daily_trades,
            'max_daily':      config.MAX_DAILY_TRADES,
            'locked':         locked,
        }

    # ── Persistence ───────────────────────────────────────────────────────────

    def _save_state(self) -> None:
        try:
            data = {
                'day_start_bal':     self._day_start_bal,
                'session_start_bal': self._session_start_bal,
                'last_reset_date':   self._last_reset_date.isoformat() if self._last_reset_date else None,
                'locked_until':      self._locked_until,
                'last_trade_ts':     self._last_trade_ts,
                'daily_trades':      self._daily_trades,
            }
            _STATE_FILE.write_text(json.dumps(data, indent=2))
        except Exception as exc:
            log.warning(f'risk_state save failed: {exc}')

    def _load_state(self) -> None:
        try:
            if not _STATE_FILE.exists():
                return
            data = json.loads(_STATE_FILE.read_text())
            self._day_start_bal     = data.get('day_start_bal')
            self._session_start_bal = data.get('session_start_bal')
            self._locked_until      = data.get('locked_until') or 0.0
            self._last_trade_ts     = data.get('last_trade_ts') or 0.0
            self._daily_trades      = data.get('daily_trades') or 0
            raw = data.get('last_reset_date')
            if raw:
                self._last_reset_date = date_type.fromisoformat(raw)
            locked = time.time() < self._locked_until
            log.info(
                f'Risk state loaded: trades={self._daily_trades}  '
                f'locked={locked}  day_start={self._day_start_bal}'
            )
        except Exception as exc:
            log.warning(f'risk_state load failed (starting fresh): {exc}')
