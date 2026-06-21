# CLAUDE CODE — REGIME + CONFLUENCE TRADING SYSTEM
# Complete Implementation Brief
# Target: GitHub repo — apply all changes described below
# =============================================================

## WHAT YOU ARE BUILDING

A two-part trading intelligence system:

1. **The Dashboard (brain)** — a Cloudflare Pages web app at `macrorange.pages.dev`
   that scores macro regimes, detects Fib confluences, analyses OI structure,
   and pushes its processed output to Cloudflare KV.

2. **The Python Bot (execution layer)** — a modular, pluggable execution engine
   that polls the dashboard's KV state, evaluates enabled modules against each
   pair, and executes trades via MetaTrader5 when composite score clears threshold.

The dashboard IS the brain. The Python bot IS the executor. They communicate
exclusively via Cloudflare KV, accessed through the worker API. No direct
database. No message queue. KV is the shared state layer.

---

## REPOSITORY STRUCTURE

```
repo/
  dashboard/
    index.html          # Full single-page dashboard (~5,300 lines)
    _worker.js          # Cloudflare Worker API proxy + KV gateway
    bot_config.html     # Bot configuration UI page (new)
    journal.html        # Trade journal
  bot/
    main.py             # Orchestrator loop
    requirements.txt
    modules/
      __init__.py
      base.py           # BaseModule + ModuleResult interface
      macro_regime.py   # 7-tier FRED score reader
      vol_gate.py       # GARCH vol regime gate
      confluence.py     # Fib entry scanner reader
      oi_walls.py       # CME call/put wall proximity check
      cot_filter.py     # CFTC positioning filter
      news_risk.py      # News/tweet risk stub (future)
    utils/
      __init__.py
      state_reader.py   # Polls /api/state from Cloudflare
      sl_tp_engine.py   # Adaptive SL/TP calculation
  docs/
    ARCHITECTURE.md     # This file (auto-generate from this brief)
    DEPLOYMENT.md       # Step-by-step deploy instructions
```

---

## PART 1 — THE DASHBOARD (Cloudflare Pages)

### Deployment Architecture

- **Platform:** Cloudflare Pages — Advanced Mode
- **Deploy method:** Drag-and-drop folder only. No Git pipeline. No build step.
- **Files:** `index.html` + `_worker.js` + `bot_config.html` at repo root
- **Worker mode:** `_worker.js` at root = Advanced Mode (intercepts all requests)
- **CRITICAL:** `_worker.js` must be pure ASCII. No Unicode, emoji, smart quotes,
  em dashes, or box-drawing characters. Cloudflare's V8 compiler fails silently
  with "Invalid or unexpected token" at column position. Always run
  `node --check _worker.js` before every deploy.

### Environment Variables (set in BOTH Production AND Preview scopes)

| Variable    | Purpose                          |
|-------------|----------------------------------|
| FRED_KEY    | St. Louis FRED macroeconomic API |
| TWELVE_KEY  | Twelve Data OHLC + live quotes   |
| ANT_KEY     | Anthropic Claude Sonnet API      |
| FX_SCORES   | Cloudflare KV namespace binding  |

### Worker Routes (_worker.js)

All routes return JSON. CORS headers on every response including OPTIONS preflight.

#### Existing routes (do not modify):

| Route                    | Method   | Description                                           |
|--------------------------|----------|-------------------------------------------------------|
| /api/config              | GET      | {hasFred, hasTwelve, hasAnt, hasKV}                  |
| /api/quote               | GET      | {price: number} via Twelve Data                       |
| /api/ohlc                | GET      | 100 daily bars from Twelve Data (.values array)       |
| /api/ohlc5m              | GET      | 800 x 5min bars                                       |
| /api/ohlc30m             | GET      | 700 x 30min bars                                      |
| /api/fred                | GET      | {seriesKey: {value, prev}} — 18 FRED series           |
| /api/fredhistory         | GET      | 90-day yield spread history per pair                  |
| /api/config/caps         | GET/PUT  | Proximity cap config in KV                            |
| /api/kv/get              | GET      | Universal KV cache reader (whitelisted keys only)     |
| /api/kv/set              | POST     | Universal KV cache writer                             |
| /api/analysis            | POST     | Claude Sonnet structured analysis                     |

#### New routes added for bot integration:

| Route            | Method  | Description                                            |
|------------------|---------|--------------------------------------------------------|
| /api/config/bot  | GET     | Bot config from KV (or hardcoded defaults)             |
| /api/config/bot  | PUT     | Save bot config to KV                                  |
| /api/state       | GET     | Master state: bot_config + oi + cot + regime_snapshot  |
| /api/state       | PUT     | Dashboard pushes scored regime snapshot (30min TTL)    |
| /api/cot         | GET     | COT data from KV                                       |
| /api/cot         | PUT     | Save COT data to KV                                    |

#### FRED data shape — NEVER change this (kills all tier scoring if broken):

```javascript
// CORRECT shape from /api/fred:
{ "vix": { "value": 18.5, "prev": 17.2 }, "us10y": { "value": 4.31, "prev": 4.28 }, ... }

// WRONG — do not return raw arrays:
{ "vix": [18.5, 17.2, 16.8, ...] }
```

#### KV namespace key whitelist (isAllowedKVKey function):

Exact keys: `fred, oi_store, journal_store, cot_store, bot_config, regime_snapshot`
Prefix keys: `ohlc_, ohlc5m_, ohlc30m_, quote_, ai_, compass_, fredhistory_`

#### Bot config defaults (GET /api/config/bot falls back to these):

```javascript
{
  modules: {
    macro_regime:  { enabled: true,  min_score: 5 },
    confluence:    { enabled: true,  min_stars: 3 },
    vol_gate:      { enabled: true,  block_on: 'HIGH' },
    oi_walls:      { enabled: true },
    cot_filter:    { enabled: false },
    news_risk:     { enabled: false },
    sentiment:     { enabled: false }
  },
  execution: {
    min_agree: 5, max_trades: 2, risk_pct: 1.0,
    vol_high_mult: 0.5, vol_low_mult: 1.2,
    trade_window_start: '07:00', trade_window_end: '20:00',
    pairs_enabled: ['EUR/USD', 'GBP/USD', 'XAU/USD']
  },
  sl_tp: {
    sl_method: 'structure', tp_method: 'confluence',
    sl_atr_mult: 1.5, tp1_rr: 1.0, tp1_close_pct: 50,
    tp2_method: 'garch_68', max_sl_pips: 30, max_tp_pips: 60
  },
  safety: {
    kill_switch: false, max_daily_loss_pct: 3.0,
    max_drawdown_pct: 5.0, pause_on_news: true
  }
}
```

#### /api/state GET response shape:

```javascript
{
  fetched_at: "ISO timestamp",
  bot_config: { /* full bot config */ },
  oi: { "EUR/USD": { callWall, putWall, maxPain, gammaFlip, topLevels, ... } },
  cot: { "EUR/USD": { net: 45200, chg: -3100, updated: "ISO" } },
  regime_snapshot: {
    pushed_at: "ISO timestamp",  // null if dashboard never pushed
    pairs: {
      "EUR/USD": {
        totalScore: -8,         // -16 to +16
        regime: "BEAR",         // BULL | BEAR | NEUTRAL
        tier: "BALANCED",       // STRONG | BALANCED | WEAK
        agreeCount: 5,          // /7 tiers
        volRegime: "NORMAL",    // LOW | NORMAL | HIGH
        atrPct: 45,             // ATR percentile
        atr: 0.00065,           // EMA-ATR value
        price: 1.12450,         // live price at time of push
        garchCi68Low: 1.11800,  // GARCH 68% CI lower
        garchCi68High: 1.13100, // GARCH 68% CI upper
        garchCi95Low: 1.11200,  // GARCH 95% CI lower
        garchCi95High: 1.13700, // GARCH 95% CI upper
        topEntries: [           // top 3 from entry scanner
          {
            stars: 4,
            price: 1.12380,
            direction: "SHORT",
            tags: "FIB+OI+PIVOT",
            sl: 1.12520,
            tp: 1.12100,
            slPips: 14,
            tpPips: 28,
            rr: 2.0
          }
        ],
        pivots: { pp, r1, r2, r3, s1, s2, s3 }
      }
    }
  }
}
```

---

### Dashboard Changes Required (index.html)

The dashboard already computes everything listed in the regime_snapshot shape above.
It needs one new function and one trigger added.

#### Add: pushSnapshotToKV()

Add this function to the dashboard JavaScript, called at the end of
`renderSignalAndEntries()` (which runs after all scoring is complete):

```javascript
async function pushSnapshotToKV() {
  // Only push if KV is available (hasKV from /api/config)
  if (!window._hasKV) return;

  try {
    const pairs = {};
    // Iterate over all loaded pairs and collect their scored state
    for (const pair of PAIRS) {
      const snap = window._pairSnapshot?.[pair.symbol];
      if (!snap) continue;
      pairs[pair.symbol] = snap;
    }

    if (Object.keys(pairs).length === 0) return;

    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs })
    });
  } catch(e) {
    // Silent fail — never crash the dashboard
    console.warn('pushSnapshotToKV failed:', e.message);
  }
}
```

#### Add: _pairSnapshot population

In `renderAllInner()`, after all tier scores and vol regime are computed for
the current pair, populate `window._pairSnapshot[currentPair.symbol]` with the
shape shown in the /api/state response above. This captures the live scored
state at render time.

The key data points to capture are already computed by:
- `calculateTierScores()` → totalScore, agreeCount, tiers array
- `calculateVolRegime()` → volRegime, atrPct, atr, garch CI bounds
- `runEntryScanner()` → topEntries array
- `calculatePivots()` → pp, r1, r2, r3, s1, s2, s3
- `quote.price` → live price

#### Add: bot_config.html link in topbar

Add a small "BOT" link in the dashboard topbar alongside existing buttons:
```html
<a href="/bot_config.html" class="btn-sm" title="Bot Configuration">BOT</a>
```

---

### Bot Config UI Page (bot_config.html)

Standalone HTML page, same dark theme as dashboard:
- CSS variables match dashboard: `--bg:#0d0f14`, `--surface:#141720`, etc.
- Font: `DM Mono` (matches dashboard number font)
- Sticky header with kill switch status indicator and snapshot age display
- Red banner when kill switch is active: "!! KILL SWITCH ACTIVE -- BOT IS HALTED !!"

#### Sections:

1. **Safety Controls card**
   - Kill switch toggle (red styling, prominent)
   - Max daily loss % input
   - Max drawdown % input
   - Pause on news toggle

2. **Execution card**
   - Min score (of 16) / Min stars / Min tiers agree / Max trades
   - Risk per trade % / Vol high multiplier
   - Trade window start/end (time inputs)

3. **Modules card** (toggles for each module)
   - Macro Regime (T1-T7) — enabled by default
   - Fib Confluence — enabled by default
   - Volatility Gate — enabled by default
   - OI Walls — enabled by default
   - COT Filter — disabled by default
   - News Risk — disabled, greyed out (FUTURE label)
   - Sentiment — disabled, greyed out (FUTURE label)

4. **SL/TP Engine card**
   - SL method: radio (Structure / ATR / GARCH 95%)
   - TP method: radio (Next Confluence / Partial + Runner / Fixed R:R)
   - SL ATR multiplier / TP1 R:R / Partial close %
   - Max SL pips / Max TP pips (hard caps — critical for preventing 353-pip TP)
   - TP2 method: select dropdown

5. **Pairs Enabled** — checkbox chips for each instrument

6. **COT Data Entry** — per pair: net contracts + week-on-week change
   - Saved to KV separately via /api/cot PUT
   - Python reads via /api/state

7. **Save / Reset buttons** — Save POSTs to /api/config/bot and /api/cot

#### Snapshot staleness warning:
Poll /api/state on load and every 60s. If regime_snapshot is null or
pushed_at > 15 minutes ago, show amber banner:
"Regime snapshot is stale (>15 min) — Python bot will pause until dashboard refreshes."

---

## PART 2 — THE PYTHON BOT (Execution Engine)

### Design Philosophy

**Pluggable module architecture.** Every analytical layer is a self-contained
module with a standardised interface. Main orchestrator does not contain
analysis logic — it only reads ModuleResult outputs and makes the go/no-go
decision. Adding or removing a module requires only a config change (toggle in
bot_config.html) and a line in MODULE_ORDER. No changes to main.py.

**Dashboard as brain.** The bot does NOT reimplement FRED scoring, GARCH,
or Fib detection. It reads the dashboard's already-computed output from KV.
The dashboard is authoritative. Python is the executor.

**Config from KV, not YAML.** Bot config lives in Cloudflare KV, editable
via bot_config.html. Python re-fetches config every loop iteration so UI
changes take effect without restarting the bot. Kill switch takes effect
within one loop cycle (max 2 minutes).

### Module Interface (base.py)

```python
@dataclass
class ModuleResult:
    passed:     bool      # green light from this module
    score:      float     # normalised 0.0–1.0 contribution
    signal:     str       # 'LONG' | 'SHORT' | 'NEUTRAL' | 'BLOCK'
    confidence: str       # 'HIGH' | 'MEDIUM' | 'LOW'
    reason:     str       # one-line log string
    metadata:   dict      # module-specific extras
    action:     str|None  # 'move_sl_to_breakeven' | 'close_all' | None

class BaseModule:
    def __init__(self, config: dict): ...
    def evaluate(self, state: dict) -> ModuleResult: ...
```

### Module Execution Order

Order matters — vol_gate can hard-block before spending time on other modules:

1. `vol_gate` — hard block on HIGH vol (no new entries)
2. `macro_regime` — score + direction gate (sets _macro_signal for downstream)
3. `confluence` — entry scanner results gate
4. `oi_walls` — blocks entries running into walls
5. `cot_filter` — CFTC positioning confirmation
6. `news_risk` — news risk action layer (future)

### Composite Score Logic

```python
# After all modules run:
scores    = [r.score for r in results if r.passed and r.signal in ('LONG','SHORT')]
composite = sum(scores) / len(scores) if scores else 0.0

# Direction unanimity check — no mixed signals allowed
unique_sigs = set(r.signal for r in results if r.passed and r.signal in ('LONG','SHORT'))
direction   = unique_sigs.pop() if len(unique_sigs) == 1 else None

can_trade = (
    not any_blocked
    and direction is not None
    and composite >= 0.60  # min composite threshold
)
```

### Module Logic Details

#### MacroRegimeModule
- Reads `state['regime_snapshot']['pairs'][symbol]['totalScore']`
- Gates on `min_score` from config (default 5 of 16)
- Gates on `agreeCount >= min_agree` (default 5 of 7)
- Normalises score to 0-1: >=13→1.0, >=9→0.85, >=5→0.65
- Sets `state['_macro_signal']` = 'LONG' | 'SHORT' for downstream modules

#### VolGateModule
- Reads `state['regime_snapshot']['pairs'][symbol]['volRegime']`
- If HIGH and block_on='HIGH': hard BLOCK (passed=False)
- If LOW: PASS with size_mult=1.2 in metadata
- If NORMAL: PASS with size_mult=1.0

#### ConfluenceModule
- Reads `state['regime_snapshot']['pairs'][symbol]['topEntries']`
- Filters by min_stars AND direction alignment with _macro_signal
- Best entry's stars determines score: 5*→1.0, 4*→0.85, 3*→0.65

#### OIWallsModule
- Reads `state['oi'][symbol]` (OI data saved by dashboard via localStorage→KV)
- If LONG and price within 0.3% of call wall: BLOCK
- If SHORT and price within 0.3% of put wall: BLOCK
- Otherwise: PASS with wall levels in metadata for SL/TP engine

#### COTFilterModule
- Reads `state['cot'][symbol]` (manual entry via bot_config.html)
- Thresholds per pair: EUR/USD=150k, GBP/USD=60k, XAU/USD=250k, etc.
- Extreme + same direction as signal = PASS score 0.55 (crowded — warn)
- Extreme + opposite direction = PASS score 0.85 (contrarian — boost)
- Not extreme = PASS score 0.70

#### NewsRiskModule (stub)
- Currently always returns NEUTRAL
- Future: economic calendar API + Twitter/X stream monitoring
- When HIGH risk: action='move_sl_to_breakeven'
- When EXTREME risk: action='close_all'

### SL/TP Engine (sl_tp_engine.py)

This solves the core problem: fixed R:R on adaptive vol produces unrealistic
targets (e.g. 353-pip TP when 40 pips of daily range remain).

#### SL methods (in priority order):

**Structure (default):**
1. OI put wall below price (LONG) or call wall above (SHORT) — most structural
2. Pivot S1/R1 from dashboard snapshot — fallback
3. ATR × multiplier — final fallback

**ATR:** `entry ± (atr × sl_atr_mult)`

**GARCH 95%:** Uses GARCH 95% CI bounds from snapshot

#### Hard pip caps (ALWAYS applied after method calculation):
- `max_sl_pips` from config (default 30 for FX)
- If calculated SL > cap: clamp to cap, mark result.capped=True
- Log warning when capped — means entry quality is poor

#### TP methods:

**Next Confluence (default):**
1. Next star entry in direction from topEntries
2. OI call wall (LONG) / put wall (SHORT)
3. GARCH 68% CI bound — capped fallback

**Partial + Runner:**
- TP1 = 1:1 R:R (50% close default)
- TP2 = GARCH 68% CI or next confluence

**Fixed R:R:** `entry ± (sl_distance × tp1_rr)`

#### Hard TP cap: `max_tp_pips` from config (default 60 for FX)

### Main Loop (main.py)

```
Loop every 120 seconds:
  1. fetch bot_config from /api/config/bot
  2. Check kill switch → sleep if active
  3. Check trade window → sleep if outside
  4. fetch_state() from /api/state
  5. Validate snapshot freshness (< 15 min)
  6. Load modules per config toggles
  7. For each pair in execution.pairs_enabled:
     a. run evaluate_pair(symbol, state, modules, bot_config)
     b. if can_trade: calculate SL/TP, execute via MT5 (or log if --paper)
     c. handle module actions (breakeven, close etc.)
  8. Sleep remainder of 120s interval
```

#### CLI args:
- `python main.py` — live mode, MT5 execution
- `python main.py --paper` — log signals only, no MT5
- `python main.py --once` — single evaluation then exit (for testing)

### State Reader (state_reader.py)

```python
DASHBOARD_URL   = 'https://macrorange.pages.dev'
MAX_STALENESS_S = 900  # 15 minutes

def fetch_state() -> dict:
    # GET /api/state
    # Validates pushed_at timestamp
    # Raises StaleDataError if snapshot too old
    # Raises StateReadError on network failure

def fetch_bot_config() -> dict:
    # GET /api/config/bot (lighter call, no snapshot needed)
```

---

## PART 3 — WHY THESE DASHBOARD CHANGES

### Why add pushSnapshotToKV()

The dashboard already computes every analytical output Python needs:
- 7-tier score and direction (calculateTierScores)
- Vol regime and GARCH bounds (calculateVolRegime)
- Top entry scanner setups (runEntryScanner)
- Daily pivots (calculatePivots)
- Live price

Without pushSnapshotToKV(), Python would have to re-implement all of this in
Python using the same FRED + Twelve Data APIs. That would be:
- Duplicated logic that could diverge from the dashboard
- Additional API quota consumption
- Slower (Python reimplementing JS GARCH from scratch)

By pushing the scored output to KV, the dashboard remains the single source
of truth. Python trusts and acts on what the dashboard computed.

### Why KV not a database

- Cloudflare KV is already bound to the worker (FX_SCORES namespace)
- Zero additional infrastructure — no Postgres, no Redis, no extra costs
- Python can read it via the public /api/state endpoint (no KV SDK needed)
- Dashboard and Python share state without any direct connection
- KV TTL (30min on regime_snapshot) automatically signals stale data

### Why bot_config.html not a YAML file

- Config changes take effect on next Python loop without restarting
- Kill switch works from mobile — open URL, flip switch, done
- No SSH, no file editing, no redeploy when tuning parameters
- Same deployment drag-and-drop as everything else

### Why pluggable modules not a monolith

The log image shared (from a WaveTrend-based bot) showed:
- score=1/2, score=2/4 — N of M confirmation scoring
- regime=BEAR, tier=BALANCED — layered classification
- Signals dropped (score=0/2) as conditions changed mid-session

This confirms the architecture: each analytical layer votes independently,
main counts votes, threshold triggers execution. A monolith cannot be tuned,
partially disabled, or extended without touching core logic. Modules can be
added (news_risk, sentiment, order_blocks) without changing main.py.

### Why adaptive SL/TP not fixed R:R

Fixed R:R on adaptive vol is the root cause of "huge SL/TP" outputs:
- High vol day: ATR wide → SL wide → TP = 3× wide SL = unrealistic
- Fix: SL anchored to market structure (OI walls, pivots), TP to next real level
- GARCH bounds cap the maximum (never target beyond expected daily range)
- Hard pip caps (max_sl_pips, max_tp_pips) as absolute backstop

---

## PART 4 — IMPLEMENTATION INSTRUCTIONS FOR CLAUDE CODE

### Step 1: Worker (_worker.js)

1. Add PUT to CORS allowed methods
2. Update isAllowedKVKey to include: cot_store, bot_config, regime_snapshot
3. Add /api/config/bot GET route with defaults object as shown above
4. Add /api/config/bot PUT route with validation (risk_pct 0-10, required sections)
5. Add /api/state GET route fetching all 4 KV keys in parallel with Promise.all
6. Add /api/state PUT route saving regime_snapshot with 1800s TTL
7. Add /api/cot GET and PUT routes
8. Run `node --check _worker.js` — must pass with zero errors
9. Verify no non-ASCII bytes: `python3 -c "data=open('_worker.js','rb').read(); bad=[i for i,b in enumerate(data) if b>127]; print('ASCII OK' if not bad else f'BAD: {bad[:3]}')`

### Step 2: Dashboard additions (index.html)

1. Add `window._pairSnapshot = {}` initialisation in the global scope
2. In `renderAllInner()`, after all scoring for current pair is complete,
   populate `window._pairSnapshot[currentPair.symbol]` with the snapshot shape
3. Add `pushSnapshotToKV()` function as described above
4. Call `pushSnapshotToKV()` at the end of `renderSignalAndEntries()`
5. Add BOT link to topbar
6. Wrap pushSnapshotToKV in try/catch — never let it crash the render

### Step 3: bot_config.html

Create as a standalone HTML file matching the dashboard dark theme.
It loads /api/config/bot on startup and saves back via PUT.
It loads /api/cot on startup and saves back via /api/cot PUT.
The snapshot age check polls /api/state every 60 seconds.

### Step 4: Python bot (bot/ directory)

Create the full directory structure and all files as described.
All files must be pure Python 3.10+ compatible, no external deps except `requests`.
MetaTrader5 is imported inside a try/except so the bot runs on non-Windows
machines in paper mode without the MT5 library.

### Step 5: Documentation

Generate:
- `docs/ARCHITECTURE.md` — system overview, data flow diagram (ASCII art), KV schema
- `docs/DEPLOYMENT.md` — step-by-step: Cloudflare setup, env vars, KV binding,
  drag-and-drop deploy, Python setup, first run with --paper

---

## PART 5 — CRITICAL INVARIANTS (never violate these)

1. **_worker.js must be ASCII-only.** Any Unicode breaks the Cloudflare deploy.
   Check with `node --check` AND byte scan before every commit.

2. **FRED shape is sacred:** `/api/fred` returns `{seriesKey: {value, prev}}`.
   Never return arrays. This shape is consumed by 7 scoring tiers simultaneously.

3. **OI errors must never crash the dashboard.** All OI rendering is in try/catch
   IIFE with `||` fallbacks on every destructured field.

4. **Proximity cap bugs are subtle.** ATR-fraction-only caps go wide on high-vol days
   and pull in unrelated levels as false confluences. Hard pip caps are required.
   FX caps in pips (0.0001 units). Gold caps in price points ($).

5. **Pip precision matters.** EUR/USD price 1.17498 needs 5 decimal places.
   Smart decimal formatting: price<10 → 5dp, price<100 → 4dp, price<1000 → 3dp,
   price>=1000 → 2dp.

6. **Bot re-reads config every loop.** Never cache bot_config inside the Python
   process across loops. Kill switch must take effect within one 120s cycle.

7. **Snapshot staleness gate.** If regime_snapshot.pushed_at is more than 15 minutes
   old, Python logs a warning and skips evaluation. It does not trade on stale data.

8. **Paper mode first.** MT5 execute_trade() is only called when --paper flag is
   absent. Default run mode should be paper until explicitly switched.

9. **Module BLOCK = no trade, regardless of composite score.** If any module
   returns passed=False, the pair is skipped for this loop iteration.
   Composite score threshold is a SECOND gate, not a substitute.

10. **KV namespace proliferation is bad.** Everything uses the single FX_SCORES
    namespace. New features add new keys, not new namespaces.

---

## PART 6 — DASHBOARD EXISTING SYSTEMS (for context, do not break)

### The 7-Tier Scoring System

Total range: -16 to +16 (plus +/-1 coherence bonus)

| Tier | Name              | Max  | FRED series                          |
|------|-------------------|------|--------------------------------------|
| T1   | Rate Differential | +/-3 | Foreign LT rate vs us10y. Gold=TIPS. |
| T2   | VIX + Direction   | +/-3 | VIXCLS (inverted for gold/safe-haven)|
| T3   | DXY Direction     | +/-2 | DTWEXBGS (amplified for gold)        |
| T4   | HY Credit Spreads | +/-2 | BAMLH0A0HYM2 (FRED pp x100 = bp)    |
| T5   | AUD/JPY Carry     | +/-2 | DEXUSAL x DEXJPUS cross              |
| T6   | NFCI Conditions   | +/-1 | NFCI (weekly, same value all week)   |
| T7   | Momentum EMA/RSI  | +/-2 | Twelve Data OHLC — EMA20/50, RSI14  |

### GARCH(1,1) Parameters (fixed, not fitted)

```
omega=1e-7, alpha=0.10, beta=0.85 (persistence=0.95)
Seeded on first 20 log-returns, walks forward
CI: range = 2 * z * sigma * price (half-normal)
```

### Fib Confluence Detection

- Body range only (open/close extremes, not wicks)
- Asia session: 5min bars, 00:00-06:00 GMT
- Monday body range: 30min bars across Monday
- Levels: -1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0
- Confluence threshold: 2 pips FX / $20 Gold
- Tight threshold (10% of normal): 0.2 pips FX / $2 Gold

### CME OI Storage (localStorage → KV)

```javascript
oi_store[symbol] = {
  topLevels,           // [{strike, callOI, putOI, netOI}]
  gexProfile,          // all strikes price-ordered for gamma chart
  rawOI, rawChg,       // original paste text
  exposures: {gex, dex},
  maxPain, callWall, putWall, savedAt
}
```

OI data is manually pasted via the dashboard OI modal, parsed by oiParseTable(),
stored in localStorage, and synced to KV via /api/kv/set with key 'oi_store'.
Python reads it from /api/state response under the 'oi' key.

### Render Architecture

```
loadAll() → renderAll() → renderAllInner()
  ├── calculateTierScores()
  ├── calculateVolRegime()       # EMA-ATR + GARCH
  ├── calculatePivots()
  ├── Asia/Monday range Fib detection
  ├── enhanceConfluences()       # direction/stars/SL/TP
  ├── filterConfluences()
  ├── [writes HTML to #mainContent]
  ├── loadAndRenderCompass()     # async - 90d FRED history
  │    └── renderARMAAndTransition()
  └── renderSignalAndEntries()
       ├── runSignalEngine()
       ├── runEntryScanner()
       └── [pushSnapshotToKV()] ← NEW: add at end of this function
```

---

## PART 7 — ROADMAP ITEMS (build after core is working)

In rough priority order:

1. **OI → Confluence boost (Phase 3)**
   When a call/put wall or gamma flip is within N pips of an existing Fib
   confluence, add it as a confluence source and increase star rating.
   Implementation: in enhanceConfluences(), check oi_store for current pair,
   compare each OI level to each confluence price, if within pip cap → boost.

2. **pushSnapshotToKV auto-trigger**
   Currently triggered at end of renderSignalAndEntries(). Also add a 5-minute
   timer that re-pushes without full re-render (lightweight background push).

3. **News risk module wiring**
   - Economic calendar: ForexFactory JSON or TradingEconomics API
   - Impact filter: HIGH impact events within +/- 2 hours = pause entries
   - Post-NFP/FOMC lockout: 30 minutes of no new entries after release

4. **Order block detection**
   From 1H/4H OHLC: identify last bearish candle before bullish move (demand OB)
   and last bullish candle before bearish move (supply OB). Add as star source
   in entry scanner when price returns to OB.

5. **Fitted GARCH**
   When 250+ daily bars cached, run MLE optimisation on omega/alpha/beta
   instead of fixed params. Store fitted params in KV per pair.

6. **COT positioning chart**
   Plot 52-week net speculator position history in the Macro Compass card.
   Data entered weekly via bot_config.html COT section.

---

## TESTING CHECKLIST

Before deploying dashboard changes:
- [ ] `node --check _worker.js` passes with no output
- [ ] No non-ASCII bytes in _worker.js
- [ ] /api/fred response shape is still `{seriesKey: {value, prev}}`
- [ ] /api/config/bot GET returns valid JSON with all four sections
- [ ] /api/state GET returns valid JSON with bot_config, oi, cot, regime_snapshot keys
- [ ] /api/state PUT with test payload returns `{ok: true, pushed_at: "..."}`
- [ ] Dashboard still renders correctly — no JS console errors
- [ ] pushSnapshotToKV() does not throw on null/undefined pair data

Before running Python bot:
- [ ] `python main.py --once` runs without exception
- [ ] /api/state returns a non-null regime_snapshot (open dashboard first)
- [ ] All module evaluate() calls return ModuleResult (not None, not dict)
- [ ] SL/TP engine returns valid prices (not NaN, not 0)
- [ ] Paper mode logs look correct (direction, composite score, SL/TP)
- [ ] Kill switch test: enable in UI, verify bot logs "KILL SWITCH ACTIVE"
  within 2 minutes

---

## NOTES FOR CLAUDE CODE

- The repo is the source of truth. Do not invent APIs or routes not described here.
- Read existing _worker.js before modifying — do not duplicate existing routes.
- The index.html is approximately 5,300 lines. Read it fully before editing.
  Key function names: renderAllInner, calculateTierScores, calculateVolRegime,
  runEntryScanner, renderSignalAndEntries, enhanceConfluences.
- When adding pushSnapshotToKV: find the closing lines of renderSignalAndEntries()
  and add the call there. Do not add it in renderAll() or renderAllInner() directly
  as those have early-return paths that may skip scoring.
- The bot/ directory is new — create it fresh.
- All Python files: type hints, docstrings, logging via logging module (not print).
- Use logging.getLogger('bot.<module_name>') pattern throughout.
- requirements.txt: only `requests` as a hard dependency. MetaTrader5 commented out.
- Do not add pandas, numpy, or any heavy dependency — the bot is lightweight by design.
  Heavy analytics stay in the dashboard.
