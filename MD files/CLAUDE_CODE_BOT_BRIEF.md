# Build: Regime Dashboard Python Execution Bot

## What We're Building

A Python trading bot that connects to MetaTrader5 and takes trades automatically.
The bot does not do its own analysis. It reads processed trading intelligence from
a live web dashboard (already built and deployed) which acts as the brain.
The dashboard pushes its scored output to Cloudflare KV. The bot polls that KV
state via a simple REST API and makes execution decisions based on it.

Everything the bot needs to know about macro regime, volatility, entry levels,
and market structure has already been computed by the dashboard. The bot's job
is to read that output, run it through configurable module gates, and execute
if the composite score clears the threshold.

---

## The Brain (Dashboard — already exists, do not build)

A web app hosted at https://macrofxmodel-production.up.railway.app/index.html. It runs a 7-tier macro
scoring system, detects Fibonacci confluence levels, analyses CME open interest
structure, runs a GARCH volatility engine, and produces a ranked list of entry
setups per trading pair. After each scoring cycle it pushes a snapshot of its
output to Cloudflare KV via a PUT to its own worker API.

The bot reads this snapshot. It does not call FRED, Twelve Data, or any market
data API directly. The dashboard has already done that work.

### What the Bot Reads

The dashboard exposes a single endpoint the bot polls:

```
GET https://macrofxmodel-production.up.railway.app/api/state
```

This returns a JSON object containing:

- **bot_config** — the execution configuration (module toggles, risk params,
  SL/TP rules, trade window, kill switch). This config is set by the user via
  a configuration UI page on the dashboard. The bot re-reads it every loop so
  changes take effect without restarting.

- **regime_snapshot** — the dashboard's scored output per trading pair,
  including: macro score (-16 to +16), directional regime (BULL/BEAR/NEUTRAL),
  volatility regime (LOW/NORMAL/HIGH), GARCH confidence interval bounds,
  top entry setups with star ratings, and daily pivot levels.

- **oi** — CME open interest data per pair: call wall, put wall, max pain,
  gamma flip level. Entered manually by the user into the dashboard.

- **cot** — CFTC commitment of traders positioning per pair: net speculator
  contracts and week-on-week change. Entered weekly by the user.

### Staleness Rule

The regime_snapshot has a pushed_at timestamp. If it is more than 15 minutes
old the bot must skip evaluation and log a warning. The user needs to have the
dashboard open for the snapshot to stay fresh. This is by design — the bot
should not trade on stale data.

---

## Bot Architecture

### Principle: Pluggable Module System

Every analytical layer is a self-contained module. Each module receives the
full state object and returns a standardised result: did it pass or block,
what direction it sees, a normalised confidence score, and a one-line reason.

The main orchestrator does not contain analysis logic. It loads whichever
modules are enabled in the config, runs them in order, counts the votes,
and executes if the composite score clears the threshold and all signals agree
on direction.

Adding a new analytical layer means writing one new module class and adding
it to the registry. Nothing else changes.

### Module Result Shape

Every module returns the same structure:
- passed (bool) — green light or block
- signal — LONG, SHORT, NEUTRAL, or BLOCK
- score (float 0-1) — this module's confidence contribution
- confidence — HIGH, MEDIUM, or LOW
- reason (string) — one line for the log
- metadata (dict) — module-specific extras for the SL/TP engine
- action (optional string) — e.g. move_sl_to_breakeven, close_all

### Module Execution Order

Order matters. Hard-blocking modules run first so we don't waste time on
downstream analysis when a fundamental gate has already failed.

1. Volatility gate — hard block on HIGH vol, no new entries
2. Macro regime — score and direction gate, sets signal direction for downstream
3. Confluence — entry scanner results gate, requires min star rating
4. OI walls — blocks entries running directly into a call or put wall
5. COT filter — CFTC positioning confirmation or contrarian signal
6. News risk — stub for future implementation

### Composite Score and Decision

After all modules run, collect scores from passing modules whose signal is
LONG or SHORT. Average them. If the average is below 0.60, no trade.
If signals are mixed (some LONG, some SHORT), no trade.
If any module hard-blocked, no trade regardless of composite score.
Only when all gates pass and signals agree does the bot execute.

### Configuration

All execution parameters live in the dashboard's KV store and are read by
the bot on every loop iteration. This includes:

- Which modules are enabled
- Minimum macro score threshold (of 16)
- Minimum star rating for entry setups
- Minimum number of tiers that must agree (of 7)
- Risk per trade as a percentage of account balance
- Position size multipliers per volatility regime
- Trading window start and end times
- Which pairs are enabled for bot execution
- Kill switch (immediately halts all execution)
- Maximum daily loss and drawdown limits
- SL method: structure-based, ATR multiple, or GARCH 95% bound
- TP method: next confluence level, partial close plus runner, or fixed R:R
- Hard pip caps on SL and TP (critical — see SL/TP section)

---

## SL/TP Engine

This is one of the most important parts of the bot. A fixed R:R approach on
adaptive volatility produces unrealistic targets — on a high volatility day
the ATR-derived stop can be so wide that the resulting TP target is completely
outside the day's expected range.

### SL Calculation (in priority order)

First preference is structure. The stop should sit behind a real market level:
1. OI put wall below entry for longs, call wall above entry for shorts
2. Daily pivot S1 for longs, R1 for shorts (from dashboard snapshot)
3. ATR multiple as fallback when no structural level is close enough

### TP Calculation

The target should be the next real level in the direction of the trade:
1. Next entry scanner setup in the trade direction (from dashboard top entries)
2. OI wall in the direction: call wall for longs, put wall for shorts
3. GARCH 68% confidence interval bound as a volatility-anchored fallback

### Hard Caps (non-negotiable)

After calculating SL and TP by any method, apply absolute pip caps from config.
If the calculated SL is wider than max_sl_pips, clamp it and flag the result
as capped. If the calculated TP is further than max_tp_pips, clamp it.
Log a warning when capping occurs — it indicates a poor quality entry.

For FX pairs, caps are in pips (0.0001 units for standard pairs, 0.01 for JPY).
For Gold, caps are in price points (dollars).

The GARCH 68% CI bound is the absolute ceiling on TP — never target beyond
what the volatility engine says is the likely daily range.

### Partial Close Option

When TP method is set to partial, close 50% (configurable) at the first target
(typically 1:1 R:R) and let the remainder run to the GARCH bound or next
confluence. This removes pressure and locks in profit while keeping a runner.

---

## MT5 Execution

Use the MetaTrader5 Python library. Import it inside a try/except so the bot
runs in paper mode on machines without MT5 installed.

Position sizing: account balance times risk percentage, divided by stop distance
in price units, gives the position size. Apply the volatility regime multiplier
from the vol gate module's metadata before sending.

When a partial close is configured, after TP1 is hit, modify the remaining
position's stop to breakeven.

The execute_trade function should log the full order details including which
modules contributed to the decision and what the composite score was.

---

## News Risk and Event Handling (future module, stub now)

When high-impact news events are detected (economic calendar, social media
signals from key accounts), the news risk module should:

- On HIGH risk: return an action of move_sl_to_breakeven on any open positions
- On EXTREME risk: return an action of close_all

The main loop checks for actions returned by modules and calls handle_action()
which applies these to open MT5 positions. Wire this up now as a stub that
always returns LOW risk, so the action handling infrastructure exists and the
news module can be filled in later without changing the orchestrator.

---

## File Structure

```
bot/
  main.py             # orchestrator loop
  requirements.txt    # requests only as hard dep, MT5 commented out
  modules/
    __init__.py
    base.py           # BaseModule class and ModuleResult dataclass
    macro_regime.py
    vol_gate.py
    confluence.py
    oi_walls.py
    cot_filter.py
    news_risk.py      # stub
  utils/
    __init__.py
    state_reader.py   # fetch_state(), fetch_bot_config(), StaleDataError
    sl_tp_engine.py   # SLTPEngine class, SLTPResult dataclass
```

---

## Running the Bot

```bash
python main.py           # live mode, sends orders to MT5
python main.py --paper   # logs signals only, no execution
python main.py --once    # single evaluation loop then exit (for testing)
```

Default poll interval is 120 seconds. Re-reads config from dashboard every loop.

---

## Key Principles for the Build

- The bot is lightweight. No pandas, numpy, or heavy dependencies. Analytics
  live in the dashboard. The bot reads results, it does not recompute them.

- Every module must be independently testable. Call module.evaluate(mock_state)
  and inspect the ModuleResult without running the full loop.

- Logging is structured and goes to both stdout and bot.log. Every loop
  iteration logs: which modules ran, pass/block for each pair, composite score,
  and what action was taken. This log is the audit trail.

- The kill switch must take effect within one loop cycle. This means config
  is fetched first, before any evaluation runs.

- Paper mode is the safe default. The --paper flag only needs to be absent to
  go live. Consider making live mode require an explicit --live flag instead
  so the default is always safe.

- Never trade on stale data. The 15-minute staleness gate on the regime
  snapshot is a hard rule, not a warning.

- Module BLOCK means no trade, period. The composite score threshold is a
  second gate on top of individual module gates, not a substitute for them.
