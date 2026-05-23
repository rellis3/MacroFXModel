# RegimeBot v2 — 1-Minute HMM Regime Trading Bot

A standalone Python trading bot that runs a **4-state Hidden Markov Model** on 1-minute MT5 bars and places trades when it detects a high-conviction trending regime. Position exits are driven by a **trailing decay score** that measures regime aging in real time — the bot doesn't wait for a hard stop, it exits when the statistical edge is fading.

Context from your MacroFX dashboard (FRED macro, CFTC COT, options OI walls, and Baum-Welch trained HMM parameters) is loaded every hour and used to size positions and filter bad entries.

---

## Quick Start

```bash
# 1. Navigate to the bot folder
cd MacroFXModel/regime_bot

# 2. Install dependencies
pip install MetaTrader5 pyTelegramBotAPI requests

# 3. Configure
cp .env.example .env
# Edit .env — fill in MT5 credentials, Telegram token, and pair

# 4. Paper trade first (default)
python main.py

# 5. Go live when ready
python main.py --live
```

> **Test a single tick without running the loop:**
> ```bash
> python main.py --once
> ```

---

## File Structure

```
regime_bot/
├── main.py             Entry point — main loop, Telegram wiring
├── config.py           All settings (read from .env at startup)
├── regime_engine.py    4-state HMM — BULL / BEAR / RANGE / CHOP
├── decay_detector.py   Rolling decay score — drives exits
├── state_machine.py    Entry / exit logic, BotState dataclass
├── risk_manager.py     SL/TP, lot sizing, drawdown limits
├── dashboard_client.py Dashboard API — macro, COT, OI, trained params
├── mt5_client.py       MT5 connection and order execution
├── telegram_bot.py     Two-way Telegram interface
├── .env.example        Template — copy to .env and fill in
└── risk_state.json     Auto-created — persists DD baseline across restarts
```

---

## How It Works

### The Loop (every 60 seconds)

1. **Refresh dashboard context** — trained HMM params, FRED macro context, CFTC COT positioning, and options OI walls are fetched from the dashboard API (rate-limited to once per hour by default).

2. **Fetch 1m bars** — the last 300 bars are pulled from MT5.

3. **Run the HMM** — the 4-state forward algorithm produces a regime label (`BULL` / `BEAR` / `RANGE` / `CHOP`) and a confidence probability, then applies the FRED macro multiplier.

4. **Compute decay score** — a rolling 10-bar window checks if the current regime is getting weaker (confidence falling, vol rising, run-length stalling). Score: 0 = strong, 1 = collapsing.

5. **Update risk manager** — balance is checked against daily and session drawdown limits. If a breach occurred, trading is locked for `DD_LOCKOUT_HOURS`.

6. **Exit check (if holding)** — the position is closed if:
   - Decay score ≥ `DECAY_EXIT` (default 0.70)
   - Regime flips against the position (`REGIME_FLIP_EXIT=true`)

7. **Entry check (if flat)** — a new position is considered when:
   - Regime is `BULL` or `BEAR` (never `RANGE` or `CHOP`)
   - Macro-adjusted conf ≥ `ENTRY_CONF_MIN` (+ `THIN_CONF_BOOST` during THIN/ASIA sessions)
   - `vol_z` ≤ `ENTRY_VOL_Z_MAX` (no entry during volatility spikes)
   - Decay score ≤ `ENTRY_DECAY_MAX` (regime must be fresh)
   - Risk gates pass (DD not breached, cooldown elapsed, daily cap not hit)
   - OI wall block does not trigger

8. **Place order** — ATR-based SL and TP are computed, lots are sized by the three-multiplier formula, and the order is sent to MT5.

---

## The 4-State HMM (v2)

The model classifies every 1-minute bar into one of four regimes using three features:

| Feature | How it's built |
|---------|---------------|
| `trend_z` | Linear regression slope over 50 bars, z-scored against 200-bar rolling window |
| `vol_z` | ATR(20) value, z-scored against 200-bar rolling window |
| `adx_z` | ADX(50) value, z-scored against 200-bar rolling window |

### Regime Definitions

| Regime | trend_z | vol_z | adx_z | Meaning | Tradeable? |
|--------|---------|-------|-------|---------|-----------|
| **BULL** | +high | low | +high | Strong uptrend, directional, low friction | ✅ BUY |
| **BEAR** | -high | low | +high | Strong downtrend, directional, low friction | ✅ SELL |
| **RANGE** | flat | low | -low | Orderly sideways, low vol, mean-reverting | ❌ Skip |
| **CHOP** | flat | **high** | low | Directionless noise, high vol, no edge | ❌ Skip |

> **Why CHOP matters:** v1 couldn't tell the difference between a calm sideways range and chaotic high-vol chop. v2 treats them correctly — RANGE is fine to hold through, CHOP triggers an immediate exit if you're already in a position.

### Session-Aware Transitions

During off-peak hours (outside 07:00–17:00 UTC), the model boosts self-transition probabilities by ~30% of the gap toward 0.98. This prevents thin-market noise from registering as a genuine regime flip during ASIA or THIN sessions. Entry confidence is also raised by `THIN_CONF_BOOST` (default +5%) during these sessions.

### Macro Confidence Overlay

The raw HMM confidence is multiplied by a FRED-derived factor loaded from the dashboard KV key `hmm5m_macro_context`:

| Macro Label | Multiplier | Condition |
|-------------|-----------|-----------|
| CALM | 1.10–1.15 | VIX low, HY spreads tight, curve positive |
| CAUTION | 0.85–1.00 | Mild stress |
| STRESS | 0.45–0.70 | VIX elevated, HY spreads wide, curve inverted |

This macro-adjusted confidence is what flows into lot sizing and the entry gate. In a stress environment, the bar to entry rises automatically.

### Baum-Welch Learned Parameters

When you click "Train HMM" in the dashboard, Baum-Welch EM runs on recent bar data and writes optimised emission means, variances, and transition matrices per pair to the KV key `hmm5m_trained_params`. The bot loads these each refresh cycle. When learned params are available, `is_learned=True` appears in logs and Telegram messages.

---

## Decay Score

The decay detector watches the last 10 bars for signs the current regime is losing conviction. Score 0 = healthy, 1 = fully decayed.

Three weighted components:

| Component | Weight | What it measures |
|-----------|--------|----------------|
| `conf_decay` | 40% | Is confidence trending down? (OLS slope of conf over window) |
| `volz_decay` | 35% | Is vol_z trending up? (friction returning) |
| `rl_stall` | 25% | Is run_length stalling? (regime not extending) |

**Mixed-regime shortcut:** if the 10-bar window contains more than one regime label, the score is immediately set to 0.90 — a transition is already happening and the bot should be out.

Thresholds:
- `DECAY_WARNING` (default 0.50) — Telegram alert, no action yet
- `DECAY_EXIT` (default 0.70) — position is closed

---

## Position Sizing

```
lots = base_lots × macro_mult × cot_mult × decay_discount

base_lots      = (balance × RISK_PCT / 100) / (sl_pips × pip_value_per_lot)
macro_mult     = 0.45–1.15  from FRED (loaded from dashboard)
cot_mult       = 0.65–1.00  from CFTC leveraged-fund net positioning
decay_discount = 1.0 – decay_score × 0.5   (1.00 fresh → 0.50 fully decayed)
```

All three multipliers compound. A stressed market, with opposing COT, and a fading regime gets very small size automatically — even if the signal passes the entry gate.

### COT Multiplier

| COT Alignment | Multiplier | Condition |
|--------------|-----------|-----------|
| Aligned | 1.00 | Leveraged funds net long for a BUY (or net short for a SELL), and positioning is growing |
| Neutral | 0.85 | Aligned but positioning is shrinking, COT flat, or no data |
| Opposed | 0.65 | Leveraged funds positioned against the trade direction |

### OI Wall Hard Block

If a large call wall is within `OI_WALL_PIPS` (default 15) above the BUY entry price, the entry is skipped — the wall acts as near-term overhead resistance and the trade is structurally weak. The same applies to put walls below a SELL entry.

This is a hard block (no lot reduction), unlike COT which is a soft multiplier.

---

## Risk Controls

| Control | Default | Description |
|---------|---------|-------------|
| `RISK_PCT_PER_TRADE` | 1.0% | % of current balance risked per trade at the SL |
| `MAX_DAILY_DD_PCT` | 3.0% | Lock trading if balance falls 3% from day-open |
| `MAX_SESSION_DD_PCT` | 5.0% | Lock trading if balance falls 5% from session-open |
| `DD_LOCKOUT_HOURS` | 3 | Hours locked after a DD breach |
| `MAX_DAILY_TRADES` | 5 | Maximum trades per calendar day (UTC midnight reset) |
| `TRADE_COOLDOWN_MIN` | 60 | Minimum minutes between trades |
| `LOT_SIZE_MIN/MAX` | 0.01 / 0.50 | Absolute lot size guardrails (applied after all multipliers) |

Drawdown state (baseline balances, lockout expiry, trade count) is persisted to `risk_state.json` and survives bot restarts.

---

## SL / TP

**ATR-based (default, recommended):**
```
SL_distance = ATR(SL_ATR_BARS) × SL_ATR_MULT
            = ATR(20) × 1.5   (by default)
```
Caps at `SL_MAX_PIPS` (default 50p). This adapts to daily volatility — wider SL on busy sessions, tighter on quiet ones.

**Fixed pip mode:**
```
RB_SL_METHOD=fixed_pips
RB_SL_FIXED_PIPS=20
```
Simple and predictable, but ignores volatility context. Use for testing or if you prefer consistency over adaptation.

TP is always: `SL_distance × TP_RR`, capped at `TP_MAX_PIPS`.

---

## Dashboard Integration

The bot connects to the MacroFX dashboard for slow-moving context. All fetches are silent failures — if the dashboard is unreachable, the bot runs on safe defaults.

| Data | KV Key / Endpoint | What it provides |
|------|------------------|-----------------|
| Baum-Welch HMM params | `hmm5m_trained_params` | Emission means, variances, transition matrix per pair |
| FRED macro context | `hmm5m_macro_context` | VIX, HY spread, yield curve → confidence multiplier |
| COT + OI per pair | `/api/state` | Leveraged-fund net positions, call wall, put wall, max pain |

The dashboard updates macro context and runs training at approximately 07:00–08:00 UTC daily after FRED data is loaded. Set `CONTEXT_REFRESH_MIN=60` (default) to always have morning data by the London open.

---

## Telegram Commands

| Command | Action |
|---------|--------|
| `/start` or `/status` | Full status — regime, decay, P&L, DD, COT, macro |
| `/config` | Current config values |
| `/pause` | Stops new entries (holds existing position) |
| `/resume` | Re-enables entries |
| `/exit` | Force-closes the open position immediately |

---

## Configuration Reference

All settings live in `.env`. The bot reads this file at startup — restart after changes.

### Pair & Broker

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_PAIR` | `EURUSD` | MT5 symbol format, no slash |
| `RB_PIP_SIZE` | `0.0001` | Fallback if pair not in internal table |
| `RB_MT5_ACCOUNT` | — | Your MT5 login number |
| `RB_MT5_PASSWORD` | — | MT5 password |
| `RB_MT5_SERVER` | — | Broker server name (e.g. `ICMarkets-Demo01`) |
| `RB_MT5_PATH` | — | Optional path to `terminal64.exe` (Windows) |

### Dashboard

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_DASHBOARD_URL` | `https://macrofxmodel-production.up.railway.app` | Your deployed dashboard |
| `RB_CONTEXT_REFRESH_MIN` | `60` | Minutes between dashboard fetches |

### HMM Engine

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_HMM_BARS` | `300` | 1m bars fed to HMM (needs ≥ linreg_n + 50 to warm up) |
| `RB_HMM_SELF_PROB` | `0.92` | Regime stickiness when using default params |
| `RB_HMM_LINREG_N` | `50` | Trend slope window (bars) |
| `RB_HMM_ADX_N` | `50` | ADX smoothing period |

### Entry

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_ENTRY_CONF_MIN` | `0.90` | Minimum macro-adjusted confidence |
| `RB_ENTRY_VOL_Z_MAX` | `0.5` | Maximum vol_z at entry |
| `RB_ENTRY_DECAY_MAX` | `0.25` | Maximum decay score at entry |
| `RB_THIN_CONF_BOOST` | `0.05` | Extra confidence required during THIN/ASIA sessions |

### Exit

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_DECAY_WARNING` | `0.50` | Telegram alert threshold |
| `RB_DECAY_EXIT` | `0.70` | Close position threshold |
| `RB_REGIME_FLIP_EXIT` | `true` | Exit on regime flip against position |

### SL / TP

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_SL_METHOD` | `atr` | `atr` or `fixed_pips` |
| `RB_SL_ATR_MULT` | `1.5` | ATR multiplier |
| `RB_SL_ATR_BARS` | `20` | ATR period |
| `RB_SL_FIXED_PIPS` | `20` | Used when `SL_METHOD=fixed_pips` |
| `RB_SL_MAX_PIPS` | `50` | Hard cap regardless of ATR |
| `RB_TP_RR` | `1.5` | Risk:reward ratio |
| `RB_TP_MAX_PIPS` | `100` | Hard cap on TP |

### Position Sizing

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_RISK_PCT` | `1.0` | % of balance risked per trade |
| `RB_LOT_SIZE_MIN` | `0.01` | Absolute floor |
| `RB_LOT_SIZE_MAX` | `0.50` | Absolute ceiling |
| `RB_COT_ALIGNED_MULT` | `1.00` | COT agrees with trade direction |
| `RB_COT_NEUTRAL_MULT` | `0.85` | COT flat or no data |
| `RB_COT_OPPOSED_MULT` | `0.65` | COT opposes trade direction |
| `RB_OI_WALL_PIPS` | `15` | OI wall hard-block proximity threshold |

### Risk Limits

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_MAX_DAILY_DD_PCT` | `3.0` | Daily drawdown limit (% of day-start balance) |
| `RB_MAX_SESSION_DD_PCT` | `5.0` | Session drawdown limit (% of session-start balance) |
| `RB_DD_LOCKOUT_HOURS` | `3.0` | Hours locked after breach |
| `RB_MAX_DAILY_TRADES` | `5` | Daily trade cap |
| `RB_TRADE_COOLDOWN_MIN` | `60` | Minimum minutes between trades |

### Execution

| Variable | Default | Notes |
|----------|---------|-------|
| `RB_LIVE_MODE` | `false` | Set `true` for real orders |
| `RB_SCAN_INTERVAL` | `60` | Seconds between ticks |

---

## Installation (Full Steps)

### Requirements

- Python 3.10+
- MetaTrader 5 desktop app installed and logged in (Windows only for live orders; paper mode works on any OS)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram chat ID (message your bot then visit `https://api.telegram.org/bot<TOKEN>/getUpdates`)

### 1. Dependencies

```bash
pip install MetaTrader5 pyTelegramBotAPI requests
```

For paper mode without MT5 (e.g. Linux/Mac):
```bash
pip install pyTelegramBotAPI requests
```
`MetaTrader5` is optional — the bot detects its absence and runs in paper mode automatically.

### 2. Environment File

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:
```
RB_PAIR=EURUSD
RB_MT5_ACCOUNT=123456789
RB_MT5_PASSWORD=your_password
RB_MT5_SERVER=ICMarkets-Demo01
RB_TELEGRAM_TOKEN=7123456789:AAF_your_token
RB_TELEGRAM_CHAT_ID=123456789
```

### 3. First Run (Paper Mode)

```bash
python main.py
```

You'll see logs like:
```
2026-01-01 08:01:00  INFO   RegimeBot v2 starting  pair=EURUSD  mode=PAPER
2026-01-01 08:01:01  INFO   Dashboard context refreshed  macro=CALM(1.10)  learned=yes
2026-01-01 08:02:00  INFO   ● BULL   conf=94.2%  raw=85.6%  macro=CALM(1.10)  rl=12b ...
```

Telegram will receive a startup message. Send `/status` to your bot to verify everything is working.

### 4. Going Live

When you're confident in the paper behaviour:
```bash
python main.py --live
```

Or set `RB_LIVE_MODE=true` in `.env` and run `python main.py`.

### 5. Running as a Service (Linux)

Create `/etc/systemd/system/regime_bot.service`:

```ini
[Unit]
Description=RegimeBot v2
After=network.target

[Service]
WorkingDirectory=/path/to/MacroFXModel/regime_bot
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable regime_bot
sudo systemctl start regime_bot
sudo journalctl -u regime_bot -f
```

---

## Things to Know

**Dashboard data updates at ~07:00–08:00 UTC daily.** The bot fetches context every `CONTEXT_REFRESH_MIN` minutes. The default of 60 minutes means it will have fresh FRED macro context by the London open each morning.

**Risk state persists across restarts.** `risk_state.json` records day-start balance, session-start balance, DD lockout expiry, and daily trade count. A lockout survives a crash or restart correctly.

**Magic number is 20260002**, distinct from the main bot (20260001). Both can run simultaneously on the same MT5 terminal without interfering.

**Paper mode is fully functional without MT5.** Fills are simulated at the current mid-price (or 0.0 if no tick data). All risk, decay, and state-machine logic runs identically to live mode.

**The bot is one position at a time.** A second entry signal while holding is silently ignored by the state machine. It will re-evaluate after the position is closed.

**Regime CHOP is an active exit trigger.** If you're in a BULL position and the regime classifies as CHOP (high vol, directionless), the bot exits immediately. This is intentional — CHOP is dangerous to hold through and the v2 CHOP state exists precisely to catch these conditions.
