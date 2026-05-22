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

# ── Risk / sizing ─────────────────────────────────────────────────────────────
LOT_SIZE_BASE = float(os.getenv('RB_LOT_SIZE_BASE', '0.01'))
LOT_SIZE_MIN  = float(os.getenv('RB_LOT_SIZE_MIN', '0.01'))
LOT_SIZE_MAX  = float(os.getenv('RB_LOT_SIZE_MAX', '0.10'))
SL_PIPS       = float(os.getenv('RB_SL_PIPS', '20'))
TP_PIPS       = float(os.getenv('RB_TP_PIPS', '40'))

# ── Execution ─────────────────────────────────────────────────────────────────
SCAN_INTERVAL_S = int(os.getenv('RB_SCAN_INTERVAL', '60'))
LIVE_MODE       = os.getenv('RB_LIVE_MODE', 'false').lower() == 'true'
MAGIC           = 20260002   # distinct from main bot (20260001)
