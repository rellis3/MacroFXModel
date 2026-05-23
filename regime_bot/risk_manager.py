"""
Risk management for RegimeBot — v2.

Handles four concerns in one place:
  1. ATR-based SL/TP   — volatility-adaptive, hard-capped
  2. Account %-risk sizing  — lots = risk_$ / (sl_pips × pip_value)
  3. Drawdown limits   — daily + session, lockout, persistence
  4. Trade hygiene     — per-day cap, inter-trade cooldown

size_lots() now accepts three optional multipliers that compound:
  macro_mult  0.45–1.15  from FRED (VIX / HY / yield curve)
  cot_mult    0.65–1.00  from CFTC COT directional alignment
  decay_disc  0.50–1.00  from HMM decay score (regime aging)

Combined: lots = base_lots × macro_mult × cot_mult × decay_disc
"""

import json
import logging
import time
from datetime import datetime, date as date_type, timezone
from pathlib import Path
from typing import Optional

import config

log = logging.getLogger(__name__)

# ── Pip tables ────────────────────────────────────────────────────────────────

_PIP_SIZE: dict[str, float] = {
    'EURUSD': 0.0001, 'GBPUSD': 0.0001, 'AUDUSD': 0.0001, 'NZDUSD': 0.0001,
    'USDCAD': 0.0001, 'USDCHF': 0.0001, 'EURGBP': 0.0001, 'EURCAD': 0.0001,
    'USDJPY': 0.01,   'GBPJPY': 0.01,   'EURJPY': 0.01,   'CADJPY': 0.01,
    'XAUUSD': 0.01,   'NAS100USD': 1.0, 'US30USD': 1.0,   'GER40USD': 1.0,
}
_PIP_VALUE: dict[str, float] = {
    'EURUSD': 10.0, 'GBPUSD': 10.0,  'AUDUSD': 10.0,  'NZDUSD': 10.0,
    'USDCAD': 7.5,  'USDCHF': 10.5,  'EURGBP': 13.0,  'EURCAD': 7.5,
    'USDJPY': 9.0,  'GBPJPY': 9.0,   'EURJPY': 9.0,   'CADJPY': 7.5,
    'XAUUSD': 1.0,  'NAS100USD': 1.0, 'US30USD': 1.0,  'GER40USD': 1.0,
}

_STATE_FILE = Path(__file__).parent / 'risk_state.json'


def _compute_atr(bars: list[dict], period: int) -> float:
    if len(bars) < 2:
        return 0.0
    k, ema = 1.0 / period, abs(bars[0]['high'] - bars[0]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        ema = k * max(h - l, abs(h - pc), abs(l - pc)) + (1 - k) * ema
    return ema


class RiskManager:

    def __init__(self):
        self._day_start_bal:     Optional[float]     = None
        self._session_start_bal: Optional[float]     = None
        self._last_reset_date:   Optional[date_type] = None
        self._locked_until:      float               = 0.0
        self._last_trade_ts:     float               = 0.0
        self._daily_trades:      int                 = 0
        self._load_state()

    # ── Balance ───────────────────────────────────────────────────────────────

    def update_balance(self, balance: float) -> None:
        today = datetime.now(timezone.utc).date()

        if self._session_start_bal is None:
            self._session_start_bal = balance
            log.info(f'Session baseline: {balance:.2f}')

        if self._day_start_bal is None:
            self._day_start_bal   = balance
            self._last_reset_date = today

        if self._last_reset_date and today > self._last_reset_date:
            log.info(f'Daily reset: {self._day_start_bal:.2f}→{balance:.2f}  trades={self._daily_trades}')
            self._day_start_bal   = balance
            self._daily_trades    = 0
            self._last_reset_date = today
            self._save_state()

    # ── Entry gate ────────────────────────────────────────────────────────────

    def check_entry(self, balance: float) -> tuple[bool, str]:
        now = time.time()

        if now < self._locked_until:
            rem = int((self._locked_until - now) / 60)
            return False, f'DD lockout — {rem}m remaining'

        if self._day_start_bal and self._day_start_bal > 0:
            dd = (self._day_start_bal - balance) / self._day_start_bal * 100
            if dd >= config.MAX_DAILY_DD_PCT:
                self._locked_until = now + config.DD_LOCKOUT_HOURS * 3600
                self._save_state()
                return False, f'Daily DD {dd:.2f}% ≥ {config.MAX_DAILY_DD_PCT}%'

        if self._session_start_bal and self._session_start_bal > 0:
            sdd = (self._session_start_bal - balance) / self._session_start_bal * 100
            if sdd >= config.MAX_SESSION_DD_PCT:
                self._locked_until = now + config.DD_LOCKOUT_HOURS * 3600
                self._save_state()
                return False, f'Session DD {sdd:.2f}% ≥ {config.MAX_SESSION_DD_PCT}%'

        if self._last_trade_ts > 0:
            elapsed_m = (now - self._last_trade_ts) / 60
            if elapsed_m < config.TRADE_COOLDOWN_MIN:
                return False, f'Cooldown — {config.TRADE_COOLDOWN_MIN - elapsed_m:.1f}m remaining'

        if self._daily_trades >= config.MAX_DAILY_TRADES:
            return False, f'Daily cap {self._daily_trades}/{config.MAX_DAILY_TRADES}'

        return True, ''

    # ── SL / TP ───────────────────────────────────────────────────────────────

    def compute_sl_tp(
        self,
        bars: list[dict],
        direction: str,
        price: float,
    ) -> tuple[float, float, float, str]:
        """Returns (sl, tp, sl_pips, method_label)."""
        pip    = _PIP_SIZE.get(config.PAIR, config.PIP_SIZE)
        is_buy = direction == 'BUY'

        if config.SL_METHOD == 'atr' and bars:
            sl_pips = _compute_atr(bars, config.SL_ATR_BARS) / pip * config.SL_ATR_MULT
            method  = f'ATR({config.SL_ATR_BARS})×{config.SL_ATR_MULT}'
        else:
            sl_pips = config.SL_FIXED_PIPS
            method  = 'fixed_pips'

        if sl_pips > config.SL_MAX_PIPS:
            sl_pips = config.SL_MAX_PIPS
            method  += f' [cap@{config.SL_MAX_PIPS}p]'

        sl_dist = sl_pips * pip
        sl      = round(price - sl_dist if is_buy else price + sl_dist, 6)
        tp_dist = min(sl_pips * config.TP_RR, config.TP_MAX_PIPS) * pip
        tp      = round(price + tp_dist if is_buy else price - tp_dist, 6)

        return sl, tp, sl_pips, method

    # ── Sizing ────────────────────────────────────────────────────────────────

    def size_lots(
        self,
        balance:    float,
        sl_pips:    float,
        decay_score: float = 0.0,
        macro_mult:  float = 1.0,
        cot_mult:    float = 1.0,
    ) -> float:
        """
        lots = (balance × RISK_PCT / 100) / (sl_pips × pip_value)
               × decay_discount × macro_mult × cot_mult

        decay_discount: 1.0 (fresh regime) → 0.5 (fully decayed)
        macro_mult:     from FRED (0.45 stress → 1.15 calm)
        cot_mult:       from COT alignment (0.65 opposed → 1.00 aligned)

        All three multiply together — a stressed, opposed, fading trade
        gets very small size automatically.
        """
        pip_value   = _PIP_VALUE.get(config.PAIR, 10.0)
        risk_amount = balance * (config.RISK_PCT_PER_TRADE / 100)

        if sl_pips <= 0 or pip_value <= 0:
            return config.LOT_SIZE_MIN

        base_lots    = risk_amount / (sl_pips * pip_value)
        decay_disc   = 1.0 - decay_score * 0.5     # 1.0 → 0.5 as decay 0→1
        lots         = base_lots * decay_disc * macro_mult * cot_mult

        return round(max(config.LOT_SIZE_MIN, min(config.LOT_SIZE_MAX, lots)), 2)

    # ── Trade recording ───────────────────────────────────────────────────────

    def record_trade(self) -> None:
        self._last_trade_ts = time.time()
        self._daily_trades += 1
        self._save_state()
        log.info(f'Trade recorded: daily_trades={self._daily_trades}')

    # ── Status ────────────────────────────────────────────────────────────────

    def dd_status(self, balance: float) -> dict:
        day_dd = session_dd = 0.0
        if self._day_start_bal and self._day_start_bal > 0:
            day_dd = (self._day_start_bal - balance) / self._day_start_bal * 100
        if self._session_start_bal and self._session_start_bal > 0:
            session_dd = (self._session_start_bal - balance) / self._session_start_bal * 100
        return {
            'day_dd_pct':     round(day_dd, 2),
            'session_dd_pct': round(session_dd, 2),
            'daily_trades':   self._daily_trades,
            'max_daily':      config.MAX_DAILY_TRADES,
            'locked':         time.time() < self._locked_until,
        }

    # ── Persistence ───────────────────────────────────────────────────────────

    def _save_state(self) -> None:
        try:
            _STATE_FILE.write_text(json.dumps({
                'day_start_bal':     self._day_start_bal,
                'session_start_bal': self._session_start_bal,
                'last_reset_date':   self._last_reset_date.isoformat() if self._last_reset_date else None,
                'locked_until':      self._locked_until,
                'last_trade_ts':     self._last_trade_ts,
                'daily_trades':      self._daily_trades,
            }, indent=2))
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
            log.info(
                f'Risk state loaded: trades={self._daily_trades}  '
                f'locked={time.time() < self._locked_until}'
            )
        except Exception as exc:
            log.warning(f'risk_state load failed (fresh start): {exc}')
