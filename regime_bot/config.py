"""
RegimeBot configuration.
All values read from environment / .env file.
Copy .env.example → .env and fill in your values.
Restart the bot after changing .env.
"""

import os
from pathlib import Path

# Load .env if present (won't override existing env vars)
_env_path = Path(__file__).parent / '.env'
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _, _v = _line.partition('=')
                os.environ.setdefault(_k.strip(), _v.strip())

# ── Pair ──────────────────────────────────────────────────────────────────────
PAIR     = os.getenv('RB_PAIR', 'EURUSD')        # MT5 symbol format
PIP_SIZE = float(os.getenv('RB_PIP_SIZE', '0.0001'))

# ── MT5 connection ─────────────────────────────────────────────────────────────
MT5_ACCOUNT  = int(os.getenv('RB_MT5_ACCOUNT', '0'))
MT5_PASSWORD = os.getenv('RB_MT5_PASSWORD', '')
MT5_SERVER   = os.getenv('RB_MT5_SERVER', '')
MT5_PATH     = os.getenv('RB_MT5_PATH', '')      # optional path to terminal64.exe

# ── Telegram ──────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN   = os.getenv('RB_TELEGRAM_TOKEN', '')
TELEGRAM_CHAT_ID = int(os.getenv('RB_TELEGRAM_CHAT_ID', '0'))

# ── HMM regime engine (mirrors hmm5m.js defaults for FX majors) ──────────────
HMM_BARS       = int(os.getenv('RB_HMM_BARS', '300'))      # 1m bars fed into HMM
HMM_SELF_PROB  = float(os.getenv('RB_HMM_SELF_PROB', '0.92'))   # regime stickiness
HMM_LINREG_N   = int(os.getenv('RB_HMM_LINREG_N', '50'))        # linreg slope window
HMM_ADX_N      = int(os.getenv('RB_HMM_ADX_N', '50'))           # ADX smoothing period
HMM_ADX_TARGET = float(os.getenv('RB_HMM_ADX_TARGET', '0.5'))   # bull/bear adxZ target

# ── Entry conditions ──────────────────────────────────────────────────────────
ENTRY_CONF_MIN  = float(os.getenv('RB_ENTRY_CONF_MIN', '0.90'))  # HMM state probability
ENTRY_VOL_Z_MAX = float(os.getenv('RB_ENTRY_VOL_Z_MAX', '0.5'))  # max vol_z (avoid spikes)
ENTRY_DECAY_MAX = float(os.getenv('RB_ENTRY_DECAY_MAX', '0.25')) # max decay at entry

# ── Decay detector ─────────────────────────────────────────────────────────────
DECAY_WINDOW      = int(os.getenv('RB_DECAY_WINDOW', '10'))       # rolling window bars
DECAY_CONF_WEIGHT = float(os.getenv('RB_DECAY_CONF_WEIGHT', '0.40'))
DECAY_VOL_WEIGHT  = float(os.getenv('RB_DECAY_VOL_WEIGHT', '0.35'))
DECAY_RL_WEIGHT   = float(os.getenv('RB_DECAY_RL_WEIGHT', '0.25'))

# ── Exit conditions ───────────────────────────────────────────────────────────
DECAY_WARNING    = float(os.getenv('RB_DECAY_WARNING', '0.50'))  # log + TG warning
DECAY_EXIT       = float(os.getenv('RB_DECAY_EXIT', '0.70'))     # close position
REGIME_FLIP_EXIT = os.getenv('RB_REGIME_FLIP_EXIT', 'true').lower() == 'true'

# ── Position sizing ───────────────────────────────────────────────────────────
# Account %-risk model: lots are computed so that a SL hit costs exactly
# RISK_PCT_PER_TRADE % of the current account balance.
# The lot range caps act as a safety net on top of the formula.
RISK_PCT_PER_TRADE = float(os.getenv('RB_RISK_PCT', '1.0'))   # % of balance per trade
LOT_SIZE_MIN       = float(os.getenv('RB_LOT_SIZE_MIN', '0.01'))
LOT_SIZE_MAX       = float(os.getenv('RB_LOT_SIZE_MAX', '0.50'))

# ── SL / TP ───────────────────────────────────────────────────────────────────
# SL_METHOD='atr'        → SL = entry ± ATR(SL_ATR_BARS) × SL_ATR_MULT
# SL_METHOD='fixed_pips' → SL = entry ± SL_FIXED_PIPS × pip_size
SL_METHOD    = os.getenv('RB_SL_METHOD', 'atr')             # 'atr' | 'fixed_pips'
SL_ATR_MULT  = float(os.getenv('RB_SL_ATR_MULT', '1.5'))   # ATR multiplier
SL_ATR_BARS  = int(os.getenv('RB_SL_ATR_BARS', '20'))       # ATR period (1m bars)
SL_FIXED_PIPS = float(os.getenv('RB_SL_FIXED_PIPS', '20')) # fallback fixed SL
SL_MAX_PIPS  = float(os.getenv('RB_SL_MAX_PIPS', '50'))     # hard cap regardless of ATR
TP_RR        = float(os.getenv('RB_TP_RR', '1.5'))          # TP = SL_dist × TP_RR
TP_MAX_PIPS  = float(os.getenv('RB_TP_MAX_PIPS', '100'))    # hard cap

# ── Drawdown / session limits ─────────────────────────────────────────────────
MAX_DAILY_DD_PCT   = float(os.getenv('RB_MAX_DAILY_DD_PCT', '3.0'))   # % of day-start balance
MAX_SESSION_DD_PCT = float(os.getenv('RB_MAX_SESSION_DD_PCT', '5.0')) # % of session-start balance
DD_LOCKOUT_HOURS   = float(os.getenv('RB_DD_LOCKOUT_HOURS', '3.0'))   # lock duration after breach
MAX_DAILY_TRADES   = int(os.getenv('RB_MAX_DAILY_TRADES', '5'))        # hard cap per calendar day
TRADE_COOLDOWN_MIN = float(os.getenv('RB_TRADE_COOLDOWN_MIN', '60'))  # min minutes between trades

# ── Execution ─────────────────────────────────────────────────────────────────
SCAN_INTERVAL_S = int(os.getenv('RB_SCAN_INTERVAL', '60'))
LIVE_MODE       = os.getenv('RB_LIVE_MODE', 'false').lower() == 'true'
MAGIC           = 20260002   # distinct from main bot (20260001)
