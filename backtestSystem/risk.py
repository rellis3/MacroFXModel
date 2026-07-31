"""
Kill switches — daily / weekly / monthly R-loss limits.
Tracks closed trade R values and blocks new entries when limits are breached.
Also owns position_size(), which now uses the SHARED live pip-value helper
(bot/utils/pip_values.py: MT5 tick value → quote-computed → static fallback)
instead of the old "JPY ≈ 1000×pip, rough" approximations.
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone

# The shared pip-value helper lives in bot/utils (ONE copy, no drift) — put the
# repo root on the path so we can import it from this sibling package.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
from bot.utils.pip_values import pip_value_per_lot  # noqa: E402

log = logging.getLogger(__name__)


class KillSwitch:
    """Daily / weekly / monthly loss limits + intraday circuit-breakers.

    PERSISTED (state_path): the R counters and the day-start balance survive a
    process restart. This was the live bug — the switch was in-memory only and
    the bot restarted ~45×/run, so the daily counter zeroed before it could ever
    reach the limit (worst day −18.5R with a 2R limit that never fired). See
    analysis/backtest_entry_quality.py: a working −3R day-stop halves the total
    loss AND the drawdown on the live book.

    Two independent daily guards, so a missed close can't defeat the switch:
      • kill_daily (R)   — needs record() to see each close (can undercount if a
                           close happens while the bot is down / restarting).
      • kill_daily_pct   — daily drawdown from the persisted day-start account
                           balance, read live. Independent of close-detection, so
                           it catches SL/TP hits the bot never journalled.
    Plus two opt-in intraday breakers (default off): a max-trades/day cap and a
    consecutive-loss pause (backtested to cut drawdown hard; in-sample, tune OOS).
    """
    def __init__(self, cfg: dict, state_path: str | None = None):
        ec = cfg.get('execution', cfg)
        self.kill_daily     = ec.get('killDaily',   0.0)   # max daily R loss (0 = off)
        self.kill_weekly    = ec.get('killWeekly',  0.0)
        self.kill_monthly   = ec.get('killMonthly', 0.0)
        self.kill_daily_pct = ec.get('killDailyPct', 0.0)  # max daily % balance drawdown (0 = off)
        self.kill_day_trades = int(ec.get('killDayTrades', 0))     # max trades/day (0 = off)
        self.kill_consec     = int(ec.get('killConsecLosses', 0))  # pause rest of day after N consec losses (0 = off)
        self.state_path = state_path
        self._daily_r:   float = 0.0
        self._weekly_r:  float = 0.0
        self._monthly_r: float = 0.0
        self._day_trades:    int = 0
        self._consec_losses: int = 0
        self._day_start_balance: float | None = None
        self._last_day   = self._today()
        self._last_week  = self._week()
        self._last_month = self._month()
        self._load()

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

    # ── persistence (the fix: survive restarts) ─────────────────────────────
    def _load(self) -> None:
        if not self.state_path:
            return
        try:
            with open(self.state_path, encoding='utf-8') as f:
                s = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return
        except Exception as exc:
            log.warning(f'[KILL] state load failed ({exc}) — starting clean')
            return
        # Only restore a counter if its period key still matches NOW (a stale
        # day/week/month resets naturally). This is what makes a mid-day restart
        # keep today's accumulated loss instead of zeroing it.
        if s.get('last_day') == self._last_day:
            self._daily_r = float(s.get('daily_r', 0.0))
            self._day_trades = int(s.get('day_trades', 0))
            self._consec_losses = int(s.get('consec_losses', 0))
            self._day_start_balance = s.get('day_start_balance')
        if s.get('last_week') == self._last_week:
            self._weekly_r = float(s.get('weekly_r', 0.0))
        if s.get('last_month') == self._last_month:
            self._monthly_r = float(s.get('monthly_r', 0.0))
        log.info(f'[KILL] restored state — {self.summary()}  '
                 f'dayTrades={self._day_trades} consecL={self._consec_losses}')

    def _save(self) -> None:
        if not self.state_path:
            return
        try:
            tmp = self.state_path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump({
                    'daily_r': self._daily_r, 'weekly_r': self._weekly_r, 'monthly_r': self._monthly_r,
                    'day_trades': self._day_trades, 'consec_losses': self._consec_losses,
                    'day_start_balance': self._day_start_balance,
                    'last_day': self._last_day, 'last_week': self._last_week, 'last_month': self._last_month,
                }, f)
            os.replace(tmp, self.state_path)
        except Exception as exc:
            log.warning(f'[KILL] state save failed: {exc}')

    def _maybe_reset(self) -> None:
        today = self._today()
        if today != self._last_day:
            self._daily_r = 0.0
            self._day_trades = 0
            self._consec_losses = 0
            self._day_start_balance = None
            self._last_day = today
        week = self._week()
        if week != self._last_week:
            self._weekly_r  = 0.0
            self._last_week = week
        month = self._month()
        if month != self._last_month:
            self._monthly_r  = 0.0
            self._last_month = month

    def set_balance(self, balance: float | None) -> None:
        """Anchor the day-start balance the first time one is seen today (the
        baseline the % drawdown guard measures against). Persisted, so a restart
        keeps the true day open, not the post-loss balance."""
        self._maybe_reset()
        if self._day_start_balance is None and balance:
            self._day_start_balance = float(balance)
            self._save()

    def record(self, r_value: float) -> None:
        """Record a closed trade's R result (negative = loss)."""
        self._maybe_reset()
        self._daily_r   += r_value
        self._weekly_r  += r_value
        self._monthly_r += r_value
        self._consec_losses = self._consec_losses + 1 if r_value < 0 else 0
        self._save()

    def record_open(self) -> None:
        """Count a placed trade toward the daily trade cap."""
        self._maybe_reset()
        self._day_trades += 1
        self._save()

    def block_reason(self, balance: float | None = None) -> str | None:
        """Returns a reason string if new entries should be blocked, else None.
        Pass the live balance to enable the close-detection-independent % guard."""
        self._maybe_reset()
        if self.kill_daily   > 0 and self._daily_r   <= -self.kill_daily:
            return f'Daily kill: {self._daily_r:.2f}R ≤ -{self.kill_daily}R'
        if self.kill_weekly  > 0 and self._weekly_r  <= -self.kill_weekly:
            return f'Weekly kill: {self._weekly_r:.2f}R ≤ -{self.kill_weekly}R'
        if self.kill_monthly > 0 and self._monthly_r <= -self.kill_monthly:
            return f'Monthly kill: {self._monthly_r:.2f}R ≤ -{self.kill_monthly}R'
        if self.kill_day_trades > 0 and self._day_trades >= self.kill_day_trades:
            return f'Daily trade cap: {self._day_trades} ≥ {self.kill_day_trades}'
        if self.kill_consec > 0 and self._consec_losses >= self.kill_consec:
            return f'{self._consec_losses} consecutive losses — paused for the day'
        if self.kill_daily_pct > 0 and balance and self._day_start_balance:
            dd = (self._day_start_balance - float(balance)) / self._day_start_balance * 100.0
            if dd >= self.kill_daily_pct:
                return f'Daily drawdown: {dd:.1f}% ≥ {self.kill_daily_pct}% (bal {balance:.0f} vs day-start {self._day_start_balance:.0f})'
        return None

    def summary(self) -> str:
        return (f'R daily={self._daily_r:+.2f}  weekly={self._weekly_r:+.2f}'
                f'  monthly={self._monthly_r:+.2f}'
                f'  limits=D{self.kill_daily}/W{self.kill_weekly}/M{self.kill_monthly}'
                + (f'/DD{self.kill_daily_pct}%' if self.kill_daily_pct else ''))


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
                  pip: float, symbol: str, price: float | None = None) -> float:
    """
    Calculate lot size such that SL hit = risk_pct % of balance.
    Returns lot size rounded to 2 decimal places.

    $/pip/lot comes from the shared helper: MT5 tick value when the terminal
    is up → computed from `price` (the pair's current rate — pass the live
    price, needed for USD-base pairs like USD/JPY) → static table (warns).
    """
    if sl_dist <= 0 or pip <= 0:
        return 0.01

    from mt5_utils import resolve_symbol
    risk_amount = balance * risk_pct / 100.0
    pip_value = pip_value_per_lot(symbol, pip, price=price,
                                  mt5_symbol=resolve_symbol(symbol))

    sl_pips  = sl_dist / pip
    lot_size = risk_amount / (sl_pips * pip_value)
    return max(0.01, round(lot_size, 2))
