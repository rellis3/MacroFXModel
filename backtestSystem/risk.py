"""
Kill switches — daily / weekly / monthly R-loss limits.
Tracks closed trade R values and blocks new entries when limits are breached.
"""
import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)


class KillSwitch:
    def __init__(self, cfg: dict):
        ec = cfg.get('execution', cfg)
        self.kill_daily   = ec.get('killDaily',   0.0)   # max daily R loss (0 = off)
        self.kill_weekly  = ec.get('killWeekly',  0.0)
        self.kill_monthly = ec.get('killMonthly', 0.0)
        self._daily_r:   float = 0.0
        self._weekly_r:  float = 0.0
        self._monthly_r: float = 0.0
        self._last_day   = self._today()
        self._last_week  = self._week()
        self._last_month = self._month()

    @staticmethod
    def _today() -> str:
        return datetime.now(timezone.utc).strftime('%Y-%m-%d')

    @staticmethod
    def _week() -> str:
        d = datetime.now(timezone.utc)
        return f'{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}'

    @staticmethod
    def _month() -> str:
        return datetime.now(timezone.utc).strftime('%Y-%m')

    def _maybe_reset(self) -> None:
        today = self._today()
        if today != self._last_day:
            self._daily_r   = 0.0
            self._last_day  = today
        week = self._week()
        if week != self._last_week:
            self._weekly_r  = 0.0
            self._last_week = week
        month = self._month()
        if month != self._last_month:
            self._monthly_r  = 0.0
            self._last_month = month

    def record(self, r_value: float) -> None:
        """Record a closed trade's R result (negative = loss)."""
        self._maybe_reset()
        self._daily_r   += r_value
        self._weekly_r  += r_value
        self._monthly_r += r_value

    def block_reason(self) -> str | None:
        """Returns a reason string if trading should be blocked, else None."""
        self._maybe_reset()
        if self.kill_daily   > 0 and self._daily_r   <= -self.kill_daily:
            return f'Daily kill: {self._daily_r:.2f}R ≤ -{self.kill_daily}R'
        if self.kill_weekly  > 0 and self._weekly_r  <= -self.kill_weekly:
            return f'Weekly kill: {self._weekly_r:.2f}R ≤ -{self.kill_weekly}R'
        if self.kill_monthly > 0 and self._monthly_r <= -self.kill_monthly:
            return f'Monthly kill: {self._monthly_r:.2f}R ≤ -{self.kill_monthly}R'
        return None

    def summary(self) -> str:
        return (f'R daily={self._daily_r:+.2f}  weekly={self._weekly_r:+.2f}'
                f'  monthly={self._monthly_r:+.2f}'
                f'  limits=D{self.kill_daily}/W{self.kill_weekly}/M{self.kill_monthly}')


def within_trade_window(cfg: dict) -> bool:
    """Check current London time is within the configured entry window."""
    from mt5_utils import london_now
    now   = london_now()
    h, m  = now['lHour'], now['lMin']
    hhmm  = h * 100 + m
    start = cfg.get('entryWindow', 800)      # open after this HHMM London
    end   = cfg.get('eodExit',     2100)     # close / no new entries from this time
    return start <= hhmm < end


def position_size(balance: float, risk_pct: float, sl_dist: float,
                  pip: float, symbol: str) -> float:
    """
    Calculate lot size such that SL hit = risk_pct % of balance.
    Returns lot size rounded to 2 decimal places.
    """
    if sl_dist <= 0 or pip <= 0:
        return 0.01

    # Pip value in account currency (approximate for USD-quoted pairs)
    # For simplicity: 1 lot = 100,000 units; pip_value = pip × lot_size × quote_factor
    # Here we assume USD-denominated account and treat pip_value ≈ $10/pip/lot for FX,
    # $1/pt/lot for gold/indices (adjusted by pip size).
    risk_amount = balance * risk_pct / 100.0

    if 'JPY' in symbol.upper():
        pip_value_per_lot = 1000.0 * pip  # ~$9.something; rough
    elif 'XAU' in symbol.upper() or 'GOLD' in symbol.upper():
        pip_value_per_lot = 100.0         # $1/pt × 100 oz
    elif 'NAS' in symbol.upper() or 'US100' in symbol.upper():
        pip_value_per_lot = 1.0           # $1/pt; broker-specific
    else:
        pip_value_per_lot = 10.0          # standard FX: $10/pip/lot

    sl_pips  = sl_dist / pip
    lot_size = risk_amount / (sl_pips * pip_value_per_lot)
    return max(0.01, round(lot_size, 2))
