# RegimeBot

A standalone Python trading bot that enters and exits positions based on
Hidden Markov Model (HMM) regime detection on 1-minute MT5 bars.

Positions are held while the regime is strong. A trailing **decay score**
continuously monitors whether the regime is aging and closes the position
before it fully reverses.

---

## How it works

### 1. Regime detection — `regime_engine.py`

Every 60 seconds the bot fetches the last 300 1-minute candles from MT5
and runs a 3-state Forward HMM. This is a direct Python port of the MacroFX
dashboard's `hmm5m.js`.

**Three features, all z-scored against a 200-bar rolling window:**

| Feature | Measures |
|---------|----------|
| `trendZ` | linreg slope over 50 bars — is price trending? |
| `volZ`   | ATR(20) — is volatility suppressed (good) or spiking? |
| `adxZ`   | ADX(50) — is the trend directional and strong? |

Z-scoring against the rolling window means the same thresholds work across
all volatility environments without recalibration.

**HMM states:**

| State | Profile |
|-------|---------|
| `BULL`  | positive trendZ, above-avg ADX, suppressed vol → long bias |
| `BEAR`  | negative trendZ, above-avg ADX, suppressed vol → short bias |
| `RANGE` | near-zero trendZ, low ADX → flat, no new entries |

Output per bar: `regime`, `confidence` (0–1), raw probabilities `pBull/pBear/pRange`,
plus `run_length` — how many consecutive 1m bars the current regime has held.

---

### 2. Trailing decay score — `decay_detector.py`

The decay score answers: *is this regime starting to fail?*

It scores three signals over a rolling 10-bar window (configurable) and
combines them with configurable weights:

| Component | What it detects | Default weight |
|-----------|-----------------|----------------|
| `conf_decay`  | Confidence trending downward (HMM becoming less certain) | 40% |
| `volz_decay`  | `volZ` trending upward toward 0 (friction returning to the trend) | 35% |
| `rl_stall`    | Run length not extending (regime losing momentum) | 25% |

**Decay thresholds (all configurable in `.env`):**

```
0.00  ← regime strong, conf building, vol suppressed, rl growing  (entry allowed)
0.50  ← WARNING: Telegram alert sent, keep watching
0.70  ← EXIT: position closed, reason logged and sent to Telegram
0.90  ← mixed-regime detected inside window (regime already flipping mid-bar)
```

A regime flip mid-window (e.g. BULL→RANGE inside the 10-bar window) returns
0.90 immediately and bypasses the slope math.

**Decay also drives lot sizing** — a stronger regime gets a larger position:

```
decay=0.00  →  100% of computed lots  (full conviction)
decay=0.50  →   75% of computed lots  (scaling down)
decay=1.00  →   50% of computed lots  (minimum conviction)
```

---

### 3. State machine — `state_machine.py`

Three phases, pure transition logic (no side effects):

```
            [BULL conf≥90%, volZ≤0.5, decay≤0.25]
FLAT ───────────────────────────────────────────────► BULL_HOLDING
  │                                                        │
  │         [BEAR conf≥90%, volZ≤0.5, decay≤0.25]        │ [decay≥0.70
  └───────────────────────────────────────────────► BEAR_HOLDING  OR regime flips]
                                                           │
                                                           └──────────────► FLAT
```

**Entry gates — all must pass:**

| Gate | Default | Purpose |
|------|---------|---------|
| Not paused | — | `/pause` Telegram command |
| `conf ≥ ENTRY_CONF_MIN` | 90% | Only enter high-conviction regimes |
| `volZ ≤ ENTRY_VOL_Z_MAX` | 0.5 | Avoid entering into vol spikes |
| `decay ≤ ENTRY_DECAY_MAX` | 0.25 | Don't enter a fading regime |
| RANGE regime | — | Always skipped; BULL/BEAR only |

**Exit triggers — any one fires the close:**

1. Decay score ≥ `DECAY_EXIT` (0.70)
2. Regime flips against position direction (if `REGIME_FLIP_EXIT=true`)
3. `/exit` Telegram command (force close)

---

### 4. Risk management — `risk_manager.py`

#### ATR-based SL/TP

Rather than a fixed pip count, the SL adapts to current market volatility:

```
SL_distance = ATR(20 bars) × SL_ATR_MULT         ← volatile day = wider SL
sl_pips     = min(SL_distance / pip_size, SL_MAX_PIPS)
TP_distance = SL_distance × TP_RR                 ← fixed R:R ratio
```

Both SL and TP are hard-capped in pips regardless of the ATR reading.

You can switch to a fixed-pip SL by setting `RB_SL_METHOD=fixed_pips`.

#### Account %-risk position sizing

Lot size is computed from how much of your account you want to risk per trade,
not from a fixed lot number:

```
risk_amount = account_balance × RISK_PCT_PER_TRADE / 100
lots        = risk_amount / (sl_pips × pip_value_per_lot)
```

**Example:** $10,000 account, 1% risk, 20-pip ATR SL on EURUSD:
```
risk_amount = $10,000 × 0.01  = $100
pip_value   = $10 / lot
lots        = $100 / (20 × $10)  = 0.50 lots
```

Lots are further scaled by decay score (0–50% discount) and hard-clamped
between `LOT_SIZE_MIN` and `LOT_SIZE_MAX`.

#### Drawdown limits

| Limit | Default | Behaviour on breach |
|-------|---------|---------------------|
| `MAX_DAILY_DD_PCT` | 3% | Lock entries for `DD_LOCKOUT_HOURS` |
| `MAX_SESSION_DD_PCT` | 5% | Same — counts from bot startup |
| `MAX_DAILY_TRADES` | 5 | Hard cap; resets at midnight UTC |
| `TRADE_COOLDOWN_MIN` | 60 min | Prevents churning after a loss |

Drawdown state (day-start balance, lock timestamp, daily trade count) is
persisted to `risk_state.json` so restarts don't reset the limits.

---

### 5. Telegram bot — `telegram_bot.py`

Runs in a background daemon thread; never blocks the main loop.

**Commands:**

| Command | Effect |
|---------|--------|
| `/status` | Regime, decay score, open P&L, DD stats |
| `/pause` | Stop new entries (hold open positions) |
| `/resume` | Resume entering |
| `/exit` | Force-close all positions immediately |
| `/config` | All current settings |

**Proactive alerts sent automatically:**

- Bot started / stopped
- Entry filled (regime, decay, lots, SL/TP, risk %)
- Decay warning (score ≥ 0.50)
- Exit triggered (reason + P&L)
- DD limit breached + lockout duration

---

### 6. Main loop — `main.py`

```
every 60 seconds:
  1.  fetch 300 × 1m bars from MT5
  2.  run HMM → regime snapshot (regime, conf, volZ, adxZ, run_length)
  3.  push snapshot to decay detector → compute decay score
  4.  update risk manager with current account balance
  5.  log status line:
        ● BULL  conf=96.3%  rl=14b  vol_z=-1.12  adx_z=+0.74  decay=0.041
  6.  if HOLDING:
        should_exit()? → close position + Telegram alert
  7.  if FLAT:
        should_enter()? → check risk gates → ATR SL/TP → size lots → place order
```

---

## Quick start

```bash
cd regime_bot
cp .env.example .env        # fill in MT5 account + Telegram token

pip install -r requirements.txt
# On Windows with MT5 installed: uncomment MetaTrader5 in requirements.txt

# Paper mode — no real orders, safe to test
python main.py

# Live mode (real orders)
python main.py --live

# Single tick for debugging
python main.py --once
```

---

## File map

```
regime_bot/
  config.py          all settings — read from .env at startup
  regime_engine.py   1m HMM (Python port of hmm5m.js) + run_length tracking
  decay_detector.py  trailing decay score from rolling window of snapshots
  state_machine.py   FLAT / BULL_HOLDING / BEAR_HOLDING transitions (pure functions)
  risk_manager.py    ATR SL/TP, account %-risk sizing, DD limits, persistence
  mt5_client.py      MT5 connect, 1m bars, account balance, place/close orders
  telegram_bot.py    two-way Telegram (/status /pause /resume /exit /config)
  main.py            60s orchestrator loop
  .env.example       copy to .env and fill in credentials
  requirements.txt   pyTelegramBotAPI, requests; MetaTrader5 on Windows
  risk_state.json    auto-generated — persists DD state across restarts
```

---

## Configuration reference

All variables are prefixed `RB_` in `.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| `RB_PAIR` | `EURUSD` | MT5 symbol (no slash) |
| `RB_LIVE_MODE` | `false` | `true` → send real orders |
| `RB_ENTRY_CONF_MIN` | `0.90` | HMM confidence entry gate |
| `RB_ENTRY_VOL_Z_MAX` | `0.5` | Max vol_z at entry |
| `RB_ENTRY_DECAY_MAX` | `0.25` | Max decay score at entry |
| `RB_DECAY_WARNING` | `0.50` | Telegram warning threshold |
| `RB_DECAY_EXIT` | `0.70` | Decay score to close position |
| `RB_REGIME_FLIP_EXIT` | `true` | Exit when regime flips against position |
| `RB_SL_METHOD` | `atr` | `atr` or `fixed_pips` |
| `RB_SL_ATR_MULT` | `1.5` | ATR multiplier for SL distance |
| `RB_SL_ATR_BARS` | `20` | ATR period in 1m bars |
| `RB_SL_MAX_PIPS` | `50` | Hard pip cap on SL |
| `RB_TP_RR` | `1.5` | Take-profit as multiple of SL distance |
| `RB_TP_MAX_PIPS` | `100` | Hard pip cap on TP |
| `RB_RISK_PCT` | `1.0` | % of balance to risk per trade |
| `RB_LOT_SIZE_MIN` | `0.01` | Minimum lot size |
| `RB_LOT_SIZE_MAX` | `0.50` | Maximum lot size |
| `RB_MAX_DAILY_DD_PCT` | `3.0` | Max daily drawdown before lockout |
| `RB_MAX_SESSION_DD_PCT` | `5.0` | Max session drawdown before lockout |
| `RB_DD_LOCKOUT_HOURS` | `3.0` | Lockout duration after DD breach |
| `RB_MAX_DAILY_TRADES` | `5` | Max trades per calendar day (UTC) |
| `RB_TRADE_COOLDOWN_MIN` | `60` | Min minutes between trades |
| `RB_HMM_BARS` | `300` | 1m bars fed into HMM (≥ 150 minimum) |
| `RB_HMM_SELF_PROB` | `0.92` | Regime stickiness (higher = slower to flip) |
| `RB_SCAN_INTERVAL` | `60` | Seconds between ticks |

---

## Design notes

**Why 1-minute bars?** The decay score needs to see the regime *within* a move,
not just after it. 5m bars would give a 50-minute decay window at 10 bars — too
slow for an intraday exit signal. 1m bars give ~10 minutes, which is enough to
catch the early signs of a regime softening.

**Why ATR SL?** A fixed-pip SL is too wide on calm sessions and too tight on
volatile ones. ATR adapts: on a 10-pip-range EUR/USD day the SL tightens to
preserve R:R; on a 30-pip-range day it widens to avoid early exit on noise.

**Why decay-based lot scaling?** Entering at decay=0.00 means the regime just
began or just re-confirmed — maximum conviction. A decay of 0.20 at entry still
qualifies (below the 0.25 gate) but gets a slightly smaller lot automatically,
without any manual adjustment needed.

**Why account %-risk sizing?** Compounding works with consistent risk per trade,
not consistent lot sizes. As the account grows the position size grows; after a
loss it automatically shrinks to avoid blowing through DD limits.
