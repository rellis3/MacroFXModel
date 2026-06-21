# Diversification Explorer — Complete Build Brief
## Live Systems + Interactive Dashboard on Railway/Cloudflare Pages

**Back to index:** [STRATEGY_INDEX.md](STRATEGY_INDEX.md)

---

## THE PROBLEM WITH THE PREVIOUS BRIEF

The previous brief described a demo-data shell that required manual CSV paste.
This brief specifies the COMPLETE build: the actual trading systems that generate
real equity curves, the Railway backend that runs and serves them, and the
Cloudflare Pages HTML dashboard that consumes and visualises them.

When fully built, the diversification explorer auto-populates with real backtested
equity curves from the five core strategies the moment the page loads.
No CSV paste. No demo data. Live system output feeding live visualisation.

---

## ARCHITECTURE OVERVIEW

```
Railway (Node.js + Python)
    server.js
        |-- GET /api/systems/run        <- triggers Python backtest run
        |-- GET /api/systems/results    <- returns all system equity curves as JSON
        |-- GET /api/systems/status     <- returns last run time, status per system
        |
    backtest_runner.py
        |-- runs all 5 Python strategy scripts
        |-- stores results as JSON in /data/system_results.json
        |
    strategies/
        |-- p1_macro_equity.py          <- already being built by Claude Code
        |-- p2_credit_equity.py
        |-- p4_fx_carry.py
        |-- p5_fx_momentum.py
        |-- p6_gold_divergence.py

Cloudflare Pages (_worker.js + diversification.html)
    _worker.js
        |-- NEW: /api/diversification   <- proxies GET to Railway /api/systems/results
        |
    diversification.html
        |-- on load: fetch /api/diversification
        |-- receives all equity curves as JSON
        |-- renders all charts, correlation matrix, sizing explorer
        |-- no demo data, no manual input required
```

---

## PART 1 — RAILWAY BACKEND ADDITIONS

### 1A — New strategy files to add to Railway

Create a `/strategies` folder on Railway. Each file is a self-contained Python
backtest that outputs a standardised JSON result. These are the same scripts
from the Claude Code backtesting briefs (P1-P6), but modified to:
- Accept a `--output json` flag
- Write results to stdout as a single JSON object
- NOT generate matplotlib charts when run in this mode

The five strategies to implement (in build priority order):

**Strategy 1: p1_macro_equity.py** (already being built -- adapt for JSON output)
**Strategy 2: p2_credit_equity.py**
**Strategy 3: p4_fx_carry.py**
**Strategy 4: p5_fx_momentum.py**
**Strategy 5: p6_gold_divergence.py**

Each strategy script must output this exact JSON shape when run with `--output json`:

```json
{
  "system_id": "p1_macro_equity",
  "system_name": "Macro Regime Equity",
  "alpha_source": "Liquidity Premium",
  "instrument": "QQQ",
  "color": "#14b8a6",
  "start_date": "2010-01-04",
  "end_date": "2025-06-13",
  "equity_curve": [
    {"date": "2010-01-04", "value": 100000},
    {"date": "2010-01-05", "value": 100450},
    ...
  ],
  "daily_returns": [
    {"date": "2010-01-05", "return": 0.0045},
    ...
  ],
  "metrics": {
    "cagr": 0.162,
    "sharpe": 1.34,
    "sortino": 1.89,
    "max_drawdown": -0.148,
    "max_dd_duration_days": 112,
    "calmar": 1.09,
    "volatility": 0.121,
    "total_return": 2.84,
    "win_rate": 0.587,
    "profit_factor": 1.72,
    "total_trades": 94
  },
  "regime_breakdown": {
    "high_liquidity": {"return": 0.21, "sharpe": 1.8},
    "low_liquidity": {"return": -0.04, "sharpe": -0.3},
    "low_vol": {"return": 0.19, "sharpe": 1.6},
    "high_vol": {"return": 0.02, "sharpe": 0.1}
  },
  "generated_at": "2025-06-13T14:22:00Z"
}
```

### 1B — backtest_runner.py

A coordinator script that runs all five strategies sequentially (or in parallel
with subprocess) and aggregates results into a single file.

```python
# backtest_runner.py
# Runs all strategy scripts and saves combined results to /data/system_results.json

import subprocess
import json
import os
from datetime import datetime

STRATEGIES = [
    'strategies/p1_macro_equity.py',
    'strategies/p2_credit_equity.py',
    'strategies/p4_fx_carry.py',
    'strategies/p5_fx_momentum.py',
    'strategies/p6_gold_divergence.py',
]

def run_all():
    results = []
    status = {}

    for script in STRATEGIES:
        name = os.path.basename(script).replace('.py', '')
        print(f'Running {name}...')
        try:
            result = subprocess.run(
                ['python', script, '--output', 'json'],
                capture_output=True,
                text=True,
                timeout=300  # 5 minutes max per strategy
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                results.append(data)
                status[name] = {'ok': True, 'ran_at': datetime.utcnow().isoformat()}
            else:
                status[name] = {'ok': False, 'error': result.stderr[:500]}
                print(f'FAILED: {name} -- {result.stderr[:200]}')
        except subprocess.TimeoutExpired:
            status[name] = {'ok': False, 'error': 'Timeout after 300s'}
        except Exception as e:
            status[name] = {'ok': False, 'error': str(e)}

    os.makedirs('data', exist_ok=True)
    with open('data/system_results.json', 'w') as f:
        json.dump({
            'systems': results,
            'status': status,
            'generated_at': datetime.utcnow().isoformat(),
            'count': len(results)
        }, f)

    print(f'Done. {len(results)}/{len(STRATEGIES)} systems completed.')

if __name__ == '__main__':
    run_all()
```

### 1C — New routes in server.js

Add three new routes to the existing Railway server.js (do NOT remove or modify
any existing routes -- append only):

```javascript
// ============================================================
// DIVERSIFICATION EXPLORER ROUTES
// ============================================================

const { execSync } = require('child_process');
const path = require('path');
const dataPath = path.join(__dirname, 'data', 'system_results.json');

// GET /api/systems/results
// Returns all strategy equity curves and metrics as JSON.
// If data file exists and is < 24 hours old, returns cached data.
// If file is missing or stale, returns 503 with a message to run /api/systems/run first.
app.get('/api/systems/results', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        if (!fs.existsSync(dataPath)) {
            return res.status(503).json({
                error: 'No results available. POST to /api/systems/run to generate.',
                stale: true
            });
        }
        const stat = fs.statSync(dataPath);
        const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        data.cache_age_hours = Math.round(ageHours * 10) / 10;
        data.stale = ageHours > 24;
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/systems/run
// Triggers a fresh backtest run. Long-running -- returns 202 immediately,
// runs in background. Poll /api/systems/status to check progress.
// Protect with a simple bearer token (RUNNER_TOKEN env var) to prevent abuse.
app.post('/api/systems/run', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const token = req.headers['x-runner-token'];
    if (process.env.RUNNER_TOKEN && token !== process.env.RUNNER_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.status(202).json({ message: 'Backtest run started. Poll /api/systems/status.' });
    // Run in background -- do not await
    const { exec } = require('child_process');
    exec('python backtest_runner.py', { cwd: __dirname }, (err, stdout, stderr) => {
        if (err) console.error('Runner error:', stderr);
        else console.log('Runner complete:', stdout);
    });
});

// GET /api/systems/status
// Returns run status per system from the data file.
app.get('/api/systems/status', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        if (!fs.existsSync(dataPath)) {
            return res.json({ status: 'no_data', systems: {} });
        }
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        res.json({
            status: 'ok',
            generated_at: data.generated_at,
            count: data.count,
            system_status: data.status
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

### 1D — New route in _worker.js

Add ONE new route to the existing Cloudflare Pages _worker.js.
Add it inside the existing try/catch block, before the final fallback.
ASCII only. No Unicode.

```javascript
// -- /api/diversification ----------------------------------------
// Proxies to Railway backend /api/systems/results
// Returns all system equity curves and metrics for the diversification explorer.
if (path === '/api/diversification') {
    try {
        const RAILWAY_URL = env.RAILWAY_URL; // e.g. https://macrofxmodel-production.up.railway.app
        if (!RAILWAY_URL) return err('RAILWAY_URL not configured', 503);
        const upstream = await fetch(`${RAILWAY_URL}/api/systems/results`, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!upstream.ok) {
            const errBody = await upstream.text();
            return err(`Upstream error ${upstream.status}: ${errBody.slice(0, 200)}`, 502);
        }
        const data = await upstream.json();
        return json(data);
    } catch (e) {
        return err('Diversification proxy error: ' + e.message);
    }
}
```

Add `RAILWAY_URL` to Cloudflare Pages environment variables (both Production and Preview).
Value: the Railway deployment URL, e.g. `https://macrofxmodel-production.up.railway.app`

---

## PART 2 — STRATEGY IMPLEMENTATIONS

### The five strategies in detail

Each strategy below is a complete spec for Claude Code to implement as a Python file
inside `/strategies/` on Railway. They must all honour the `--output json` flag and
produce the standardised JSON shape from section 1A.

All strategies share these implementation rules:
- FRED API key: read from `FRED_KEY` environment variable
- Data cache: store fetched FRED/yfinance data in `/data/cache/` as pickle files,
  max age 24 hours (prevents hammering APIs on every run)
- Publication lag: apply 5-day shift to all FRED monthly series,
  1-day shift to weekly FRED series
- All z-scores: rolling window only (no lookahead)
- Returns: calculated weekly (Friday close to Friday close)
- Transaction costs: 0.15% round trip for equities, 0.03% for FX

---

#### Strategy P1: p1_macro_equity.py

**Instruments:** QQQ (primary), SPY (secondary)
**Signal:** Composite macro score from net liquidity, yield curve, HY spreads, real yields, ISM
**Rebalance:** Weekly (Friday signal, Monday execution)

FRED series needed:
- WALCL, WTREGEN, RRPONTSYD (net liquidity)
- T10Y2Y (yield curve)
- BAMLH0A0HYM2 (HY credit spreads)
- NAPM (ISM Manufacturing)
- DFII10 (TIPS real yield)

Signal formula:
```
net_liq_z    = rolling_zscore(WALCL - WTREGEN - RRPONTSYD, 252)
curve_z      = rolling_zscore(T10Y2Y, 252)
credit_z     = rolling_zscore(HY_spread.diff(21), 252)
real_yield_z = rolling_zscore(DFII10, 252)
ism_z        = rolling_zscore(NAPM, 252)

macro_score  = (net_liq_z * 0.30) + (curve_z * 0.20) + (-credit_z * 0.20)
             + (-real_yield_z * 0.15) + (ism_z * 0.15)
```

VIX filter:
```
vix_z = rolling_zscore(VIX, 60)
vol_scalar = 1.0 if vix_z < -0.5 else 0.75 if vix_z < 1.0 else 0.25
```

Trade rules:
```
macro_score > 0.5  AND vix_z < 1.5  -> LONG QQQ, size = base * vol_scalar
macro_score < -0.5                  -> FLAT
otherwise                           -> FLAT
```

Metadata for JSON output:
```
system_id:    "p1_macro_equity"
system_name:  "Macro Regime Equity"
alpha_source: "Liquidity Premium"
instrument:   "QQQ"
color:        "#14b8a6"
```

---

#### Strategy P2: p2_credit_equity.py

**Instruments:** SPY (equity side), BAMLH0A0HYM2 (credit signal)
**Signal:** Divergence between credit z-score and equity return z-score
**Rebalance:** Weekly

FRED series needed: BAMLH0A0HYM2
yfinance: SPY, ^VIX

Signal formula:
```
credit_z = rolling_zscore(HY_OAS, 252)
equity_z = rolling_zscore(SPY.pct_change(21), 252)
divergence = credit_z - equity_z
```

Trade rules:
```
divergence < -1.5  -> LONG SPY (credit bullish, equity lagging)
divergence > +1.5  -> FLAT (credit bearish, reduce exposure)
vix_z > 1.5        -> halve position size
exit when |divergence| < 0.5
```

Metadata:
```
system_id:    "p2_credit_equity"
system_name:  "Credit-Equity Divergence"
alpha_source: "Information Asymmetry"
instrument:   "SPY"
color:        "#ef4444"
```

---

#### Strategy P4: p4_fx_carry.py

**Instruments:** AUD/JPY, NZD/JPY, GBP/JPY as primary carry pairs
**Signal:** Approximate carry score via 12-1 month return ranking
**Rebalance:** Weekly

yfinance tickers: AUDJPY=X, NZDJPY=X, GBPJPY=X, USDJPY=X, ^VIX

Signal formula:
```
For each pair:
  carry_score = (price / price.shift(252)) - (price / price.shift(21))
  
Rank pairs weekly. Long top 2 pairs.
Weight by inverse 30-day volatility within allocation.

EXIT TRIGGER (critical):
  vix_z = rolling_zscore(VIX, 60)
  if vix_z > 1.0: exit ALL positions immediately
  re-enter when vix_z < 0.5 for 5 consecutive days
```

Position sizing: each pair max 20% of capital. Max 3 positions simultaneously.

Metadata:
```
system_id:    "p4_fx_carry"
system_name:  "FX Carry (Regime-Filtered)"
alpha_source: "Rate Differential"
instrument:   "AUD/JPY, NZD/JPY, GBP/JPY"
color:        "#f97316"
```

---

#### Strategy P5: p5_fx_momentum.py

**Instruments:** EUR/USD, GBP/USD, USD/JPY, USD/CAD, USD/CHF, AUD/USD, NZD/USD, GBP/JPY, EUR/GBP
**Signal:** 12-1 month cross-sectional momentum
**Rebalance:** Monthly (first trading day of month)

yfinance tickers: EURUSD=X, GBPUSD=X, USDJPY=X, USDCAD=X, USDCHF=X,
                  AUDUSD=X, NZDUSD=X, GBPJPY=X, EURGBP=X

Signal formula:
```
For each pair:
  mom_score = (price / price.shift(252)) - (price / price.shift(21))

Note: for USD-quote pairs (USDJPY, USDCAD, USDCHF), negate mom_score
so signal represents non-USD currency momentum consistently.

Monthly: long top 3 pairs by momentum, short bottom 3.
Weight by inverse 30-day vol within each side.
```

Macro filter (requires net_liq_z from P1 calculation):
```
net_liq_z > 0: allow long signals only
net_liq_z < 0: allow short signals only
near zero (-0.3 to 0.3): skip month
```

Metadata:
```
system_id:    "p5_fx_momentum"
system_name:  "FX Cross-Sectional Momentum"
alpha_source: "Trend / Momentum"
instrument:   "FX Basket (9 pairs)"
color:        "#3b82f6"
```

---

#### Strategy P6: p6_gold_divergence.py

**Instruments:** GLD (Gold ETF as XAU/USD proxy)
**Signal:** Residual from rolling OLS regression of Gold vs TIPS real yield and DXY
**Rebalance:** Weekly

FRED series needed: DFII10, DTWEXBGS
yfinance: GLD

Signal formula:
```
# Rolling 252-day OLS regression
import numpy as np
from sklearn.linear_model import LinearRegression

# Regressors: DFII10 (real yield) and DTWEXBGS (DXY)
# Target: log(GLD price)

For each day t with sufficient history (>252 days):
  X = [DFII10[t-252:t], DTWEXBGS[t-252:t]]
  y = log(GLD[t-252:t])
  model.fit(X, y) -- rolling fit
  predicted = model.predict([[DFII10[t], DTWEXBGS[t]]])
  residual[t] = log(GLD[t]) - predicted[0]

# Z-score the residual over 60-day window
resid_z = rolling_zscore(residual, 60)
```

Trade rules:
```
resid_z < -1.5  -> LONG GLD (Gold cheap vs fundamentals)
resid_z > +1.5  -> SHORT GLD (Gold expensive) -- or flat if long-only version
|resid_z| < 0.5 -> EXIT
```

Metadata:
```
system_id:    "p6_gold_divergence"
system_name:  "Gold Macro Divergence"
alpha_source: "Mean Reversion"
instrument:   "GLD (XAU/USD proxy)"
color:        "#a855f7"
```

---

## PART 3 — diversification.html

Single file. Inline all JS and CSS. Load Chart.js from CDN only.
Deploy alongside index.html on Cloudflare Pages.
ASCII-only source code.

### Data loading (replaces ALL demo data from previous brief)

On page load:
```javascript
async function loadSystems() {
    showLoadingState();
    try {
        const res = await fetch('/api/diversification');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.stale) {
            showBanner('Data is more than 24 hours old. Refresh may be needed.', 'warning');
        }

        if (!data.systems || data.systems.length === 0) {
            showBanner('No system results available. Backend may still be running backtests.', 'info');
            showRetryButton();
            return;
        }

        // Systems loaded -- render everything
        window.SYSTEMS = data.systems;
        window.GENERATED_AT = data.generated_at;
        renderAll();

    } catch (e) {
        showBanner(`Could not load system data: ${e.message}`, 'error');
        showRetryButton();
    }
}
```

If the API returns stale or missing data, show a clear banner (not an empty page)
with a "Refresh Data" button that POSTs to `/api/systems/run` with the runner token
(hardcode a public-safe "REQUEST_REFRESH" token for the UI, check against
RUNNER_TOKEN on the Railway side).

### System data shape the HTML expects from the API

The HTML reads `window.SYSTEMS` as an array of system objects matching the
standardised JSON shape from section 1A. Every calculation (correlation, metrics,
equity curves) is derived client-side from `daily_returns` arrays.

Date alignment: before any correlation or combined curve calculation, align all
system return series on a shared date index. Use only dates present in ALL systems.

```javascript
function alignSystems(systems) {
    // Find common dates across all systems
    const dateSets = systems.map(s => new Set(s.daily_returns.map(r => r.date)));
    const commonDates = [...dateSets[0]].filter(d => dateSets.every(ds => ds.has(d))).sort();

    return {
        dates: commonDates,
        returns: systems.map(s => {
            const lookup = Object.fromEntries(s.daily_returns.map(r => [r.date, r.return]));
            return commonDates.map(d => lookup[d] || 0);
        }),
        metadata: systems.map(s => ({
            id: s.system_id,
            name: s.system_name,
            color: s.color,
            alpha_source: s.alpha_source,
            metrics: s.metrics
        }))
    };
}
```

### Six tabs (same as previous brief, but now auto-populated from live data)

**Tab 1: Combined Book**
Equity curves panel + drawdown panel + stats comparison table.
Populate from aligned system returns. Combined curve uses equal weights by default.
Stats table compares individual system metrics vs combined. Highlight improvement
columns in green (lower drawdown, higher Sharpe).

**Tab 2: Sizing Explorer**
Sliders auto-populate with one slider per loaded system, labelled with system name
and coloured with system colour. Sliders start at equal weight (100/N each).
All metrics and charts update on slider drag using combineReturns() calculation.
Preset buttons: Equal Weight, Risk Parity, Max Sharpe, Min Drawdown.

**Tab 3: Correlation Matrix**
N x N colour-coded heatmap built from aligned daily returns.
Populated automatically from live system data. No configuration needed.
Plain-English interpretation below matrix generated from computed values.

**Tab 4: Rolling Monitor**
Rolling 60-day correlation per system pair.
Line chart per pair. Dashed red line at 0.6 threshold.
Warning badges when any pair exceeds 0.6 for 5+ consecutive days.

**Tab 5: Alpha Source Attribution**
Read alpha_source field from each system's metadata (set in Python scripts).
No user configuration needed. Stacked bar shows exposure per alpha source
weighted by current slider allocations from Tab 2.
Warning if any source > 50%.

**Tab 6: System Detail**
One card per loaded system showing:
- System name, instrument, alpha source, colour
- Metrics table: CAGR, Sharpe, Sortino, Max DD, Calmar, Win Rate, Profit Factor
- Regime breakdown table (from regime_breakdown field in JSON)
- Link to the strategy documentation MD file (static text)
- Last generated timestamp

---

## PART 4 — ENVIRONMENT VARIABLES

### Railway (add these to existing env vars)
```
FRED_KEY          existing -- already set
RUNNER_TOKEN      new -- any secure string, e.g. "div-runner-2026"
                  used to authenticate POST /api/systems/run
```

### Cloudflare Pages (add to existing env vars, both Production and Preview)
```
RAILWAY_URL       new -- Railway deployment URL
                  e.g. https://macrofxmodel-production.up.railway.app
RUNNER_TOKEN      same value as Railway -- for UI "refresh" button auth
```

---

## PART 5 — INITIAL DATA POPULATION

On first deploy, the data file won't exist yet. Steps:

1. Deploy Railway changes (server.js additions + strategy files + backtest_runner.py)
2. POST to `https://your-railway-url/api/systems/run` with header
   `x-runner-token: your-token-value`
   This triggers the first backtest run (~5-15 minutes depending on FRED data fetch time)
3. Poll `GET /api/systems/status` until all 5 systems show `ok: true`
4. Deploy Cloudflare Pages changes (_worker.js addition + diversification.html)
5. Open diversification.html -- it should auto-load all five system curves

Subsequent refreshes: the data is cached for 24 hours.
Set up a Railway cron job (or manual POST) to refresh weekly on Sundays.

---

## WHAT SUCCESS LOOKS LIKE

When fully built and running:

- Open `diversification.html` -- it loads, shows a spinner, then auto-renders
  all five system equity curves from live backtest data
- Combined Book tab shows the exact visual from the reference images:
  individual equity curves + combined curve, drawdown panel below,
  stats table proving combined Sharpe is higher and max DD is lower than any individual
- Sizing Explorer sliders update all metrics in real time
- Correlation matrix shows the expected pattern from the theory:
  P1 and P3 at 0.6+, P6 Gold at -0.2 to -0.3 vs equity strategies,
  P2 Credit low correlation (~0.1-0.3) vs everything
- Rolling monitor shows correlation spikes visible around 2022 bear market
  (P1 and P4 both lose at the same time -- the monitor should flag this)
- Alpha attribution bar shows ~50% Liquidity Premium from P1+P2+P4 weighting,
  which triggers the "consider diversifying alpha sources" warning
- System Detail tab shows all five strategy scorecards from actual backtest metrics,
  not placeholder numbers

---

## FILE LIST TO CREATE/MODIFY

```
NEW FILES (Railway):
  strategies/p1_macro_equity.py       <- adapt existing Claude Code output
  strategies/p2_credit_equity.py      <- new
  strategies/p4_fx_carry.py           <- new
  strategies/p5_fx_momentum.py        <- new
  strategies/p6_gold_divergence.py    <- new
  backtest_runner.py                  <- new

MODIFIED FILES (Railway):
  server.js                           <- add 3 new routes (append only, no removals)

NEW FILES (Cloudflare Pages):
  diversification.html                <- new standalone page

MODIFIED FILES (Cloudflare Pages):
  _worker.js                          <- add /api/diversification route (append only)

NEW ENVIRONMENT VARIABLES:
  Railway:          RUNNER_TOKEN
  Cloudflare:       RAILWAY_URL, RUNNER_TOKEN
```

---

## CRITICAL CONSTRAINTS (same as existing dashboard)

- `_worker.js` must remain ASCII-only -- no Unicode, no em dashes, no smart quotes
- `diversification.html` must be ASCII-only for same reason
- Do NOT modify existing _worker.js routes -- append only
- Do NOT modify existing server.js routes -- append only
- Chart.js must load from cdnjs.cloudflare.com only
- localStorage keys used: `div_sizing_weights` (saves last slider state)
- No new Cloudflare KV keys needed -- system results live on Railway, not KV
- Strategy Python files must handle missing/partial FRED data gracefully
  (wrap all FRED fetches in try/except, continue with available data)
- Each strategy must complete in under 300 seconds on Railway free tier
