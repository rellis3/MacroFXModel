# Open-to-Close Forecast Module — Implementation Spec
**Target file:** `index.html` (the single-file dashboard at macrorange.pages.dev)  
**Deploy method:** Drag-and-drop to Cloudflare Pages. No build step. No Git.  
**Constraint:** Everything must live inside `index.html`. No new files, no new API routes, no worker changes.

---

## What This Feature Is

A new forecasting module that estimates **open-to-close % (O-to-C)** for each pair each day — the expected directional magnitude from session open to close.

This is distinct from the existing GARCH H-L confidence intervals (which estimate total intraday range) because:
- H-L = how much the market *moves* (always positive, regime-driven)
- O-to-C = how much price *travels directionally* from open to close (can be small even on a wide-range day)

The ratio O-to-C / H-L is itself a signal: low ratio = choppy/mean-reverting session, high ratio = trending/directional session.

---

## Data Source

**Already available — no new API calls needed.**

The dashboard already fetches 100 daily OHLC bars per pair from Twelve Data via `/api/ohlc`. These bars are stored in `ohlcData[symbol].values` and are newest-first. Each bar has: `{ datetime, open, high, low, close }`.

Do not add any new fetch calls or worker routes.

---

## Where It Lives in the Codebase

### Existing vol engine for reference
The function `calculateVolRegime()` already processes `ohlcData[currentPair.symbol]?.values`. The new O-to-C function should follow the same pattern — read from the same `ohlcData` object, reverse bars to chronological order, compute, return a result object.

### Existing display for reference
The vol engine output is rendered inside the volatility card in `renderDashboard()`. The O-to-C forecast card should be rendered immediately below the existing GARCH confidence interval section within the same volatility card.

---

## The Calculation — Step by Step

### Step 1: Compute historical O-to-C % for each completed bar

```javascript
// bars are newest-first — reverse for chronological order
const barsChron = [...bars].reverse();

// Skip the most recent bar (today, still building)
// Use bars[1] through bars[N] as completed history
const completedBars = barsChron.slice(0, barsChron.length - 1);

const otcHistory = completedBars.map(bar => {
  const o = parseFloat(bar.open);
  const c = parseFloat(bar.close);
  const h = parseFloat(bar.high);
  const l = parseFloat(bar.low);
  const range = h - l;
  const otcPct = (c - o) / o * 100;           // signed % move open→close
  const rangePct = range / o * 100;            // H-L as % of open
  const otcToRange = range > 0 ? Math.abs(c - o) / range : 0; // directionality 0–1
  return { otcPct, rangePct, otcToRange };
});
```

### Step 2: Segment by current vol regime

Use the already-computed `volRegime.regime` ('LOW', 'NORMAL', 'HIGH') to filter history into regime-matched days. This is the conditional distribution — the forecast for today conditions on today's expected regime.

```javascript
// volRegime is the result of calculateVolRegime() — already computed before this runs
const currentRegime = volRegime.regime; // 'LOW' | 'NORMAL' | 'HIGH'

// Classify each historical bar's regime using its own TR vs the rolling 100-bar history
// Simple proxy: use rangePct thresholds derived from the same percentile logic
const sorted = [...otcHistory.map(b => b.rangePct)].sort((a, b) => a - b);
const p25 = sorted[Math.floor(sorted.length * 0.25)];
const p75 = sorted[Math.floor(sorted.length * 0.75)];

const regimeMatched = otcHistory.filter(b => {
  if (currentRegime === 'LOW')    return b.rangePct <= p25;
  if (currentRegime === 'HIGH')   return b.rangePct >= p75;
  return b.rangePct > p25 && b.rangePct < p75; // NORMAL
});

// Fall back to full history if regime-matched sample is too small
const sample = regimeMatched.length >= 15 ? regimeMatched : otcHistory;
```

### Step 3: Compute the distribution

```javascript
const otcValues = sample.map(b => b.otcPct).sort((a, b) => a - b);
const n = otcValues.length;

// Percentile helper
function pct(arr, p) {
  const idx = Math.floor(arr.length * p / 100);
  return arr[Math.max(0, Math.min(arr.length - 1, idx))];
}

const median    = pct(otcValues, 50);   // central tendency
const p25val    = pct(otcValues, 25);   // lower quartile
const p75val    = pct(otcValues, 75);   // upper quartile
const p10val    = pct(otcValues, 10);   // tail (bear)
const p90val    = pct(otcValues, 90);   // tail (bull)

// Mean absolute O-to-C (magnitude, ignoring direction)
const meanAbsOtc = sample.reduce((s, b) => s + Math.abs(b.otcPct), 0) / sample.length;

// Directionality score: what fraction of regime-matched days closed > open
const bullDays  = sample.filter(b => b.otcPct > 0).length;
const bearDays  = sample.filter(b => b.otcPct < 0).length;
const bullFrac  = bullDays / sample.length;  // 0–1 (>0.5 = historically bullish sessions in this regime)

// O-to-C vs H-L ratio (session character: trending vs choppy)
const meanDirectionality = sample.reduce((s, b) => s + b.otcToRange, 0) / sample.length;
// 0.0–0.3 = very choppy; 0.3–0.6 = mixed; 0.6–1.0 = strongly trending
```

### Step 4: Convert to pips for display

```javascript
// Use the live quote price (already available as currentPrice or from the quote fetch)
// pipSize is already computed by getPipSize(sym)
const latestClose = parseFloat(barsChron[barsChron.length - 1].close);
const pipSz = getPipSize(sym);

function pctToPips(pct) {
  return Math.abs(pct / 100 * latestClose) / pipSz;
}

const medianPips  = pctToPips(median);
const p25Pips     = pctToPips(p25val);
const p75Pips     = pctToPips(p75val);
const meanAbsPips = pctToPips(meanAbsOtc);
```

### Step 5: Session character classification

```javascript
let sessionChar, sessionCharDetail;
if (meanDirectionality < 0.30) {
  sessionChar       = 'CHOPPY';
  sessionCharDetail = 'Sessions in this regime historically close near open — mean-reverting character. Wide stops rarely filled at TP.';
} else if (meanDirectionality < 0.55) {
  sessionChar       = 'MIXED';
  sessionCharDetail = 'Sessions show moderate directionality — some trend but frequent intraday reversals.';
} else {
  sessionChar       = 'TRENDING';
  sessionCharDetail = 'Sessions in this regime historically make clean directional moves — trend-following has edge.';
}
```

### Step 6: Coherence check vs macro bias

```javascript
// macroScore is the 7-tier total score — already computed
// Positive score = macro says long bias, negative = short bias
const macroBull = macroScore > 2;
const macroBear = macroScore < -2;

// Does the historical bull/bear fraction align with macro?
// If macro is bullish, we want bullFrac > 0.5 in matched days to confirm
let coherence;
if (macroBull && bullFrac > 0.55)        coherence = 'CONFIRMING';
else if (macroBear && bullFrac < 0.45)   coherence = 'CONFIRMING';
else if (!macroBull && !macroBear)       coherence = 'NEUTRAL';
else                                      coherence = 'DIVERGING';
// DIVERGING = macro says one thing, historical session distribution says another
// This is the actionable tension signal
```

### Step 7: Return the result object

```javascript
return {
  // Core distribution (signed %)
  median,
  p25: p25val,
  p75: p75val,
  p10: p10val,
  p90: p90val,
  meanAbsOtc,
  bullFrac,

  // In pips
  medianPips,
  p25Pips,
  p75Pips,
  meanAbsPips,

  // Character
  sessionChar,       // 'CHOPPY' | 'MIXED' | 'TRENDING'
  sessionCharDetail,
  meanDirectionality,  // 0–1

  // Coherence with macro
  coherence,         // 'CONFIRMING' | 'NEUTRAL' | 'DIVERGING'

  // Metadata
  sampleSize: sample.length,
  regimeMatched: regimeMatched.length >= 15,
  currentRegime,
};
```

---

## Function Signature

Name the function `calculateOTCForecast(bars, volRegime, macroScore, sym)`.

Place it immediately after the `calculateVolRegime()` function in the JS section of `index.html`.

Call it in `renderDashboard()` after `calculateVolRegime()` is called, passing the same `bars` array, the vol regime result, the macro score total, and the pair symbol.

```javascript
// In renderDashboard() — after vol regime is computed:
const volRegime = calculateVolRegime();
const otcForecast = calculateOTCForecast(
  ohlcData[currentPair.symbol]?.values,
  volRegime,
  tierResult?.totalScore ?? 0,
  currentPair.symbol
);
```

---

## UI — Where to Render

### Location
Inside the existing volatility card, immediately after the GARCH confidence interval bar section. Look for the comment or block that renders `vol.garch` CI display — add the O-to-C section directly below it.

### Card title
`O-TO-C FORECAST` with a small `REGIME-CONDITIONAL` badge in the same style as the existing `GARCH(1,1)` badge (purple/blue).

### Layout spec

**Row 1 — Session character badge + coherence badge**
- Session char: CHOPPY (amber) | MIXED (blue) | TRENDING (green)
- Coherence: CONFIRMING (green) | NEUTRAL (text3) | DIVERGING (red)
- Both in the same pill/badge style as existing regime badges

**Row 2 — Distribution bar**
A horizontal bar showing the IQR of O-to-C outcomes:
- Background bar = full width (representing p10 → p90 range)
- Inner highlighted band = IQR (p25 → p75)
- Centre tick = median
- Labels: p10 value on far left, p90 on far right, median in centre
- Use amber colour (consistent with range/sizing displays)
- Show values in pips, with +/- sign indicating direction
- Example: `−32p ←── [−18p | +2p | +21p] ──→ +38p`

**Row 3 — Three stat tiles** (same style as existing EMA-ATR / GARCH grid)
| Tile | Label | Value | Sub-label |
|---|---|---|---|
| 1 | Median O-C | `+12p` | directional |
| 2 | Mean Abs | `18p` | magnitude |
| 3 | Bull sessions | `58%` | of matched days |

**Row 4 — Coherence explanation line**
Single line in text3 colour, 10px, italic:
- CONFIRMING: "Historical session distribution aligns with macro bias — signal coherent"
- DIVERGING: "Session history diverges from macro bias — treat direction signal with caution"
- NEUTRAL: "Macro bias neutral — session direction distribution guides"

**Row 5 — Sample info**
Tiny text (9px, text3): `Based on N regime-matched sessions` (or `N sessions (full history — regime sample too small)` if fell back)

### Null / insufficient data guard
If `otcForecast` is null (bars < 30) render:
```html
<div style="font-size:11px;color:var(--text3)">
  Insufficient history for O-to-C forecast — need 30+ daily bars
</div>
```

---

## CSS Variables to Use (Already Defined)

These all exist in the current `index.html` stylesheet — do not add new ones:

```
--amber, --amber-bg, --amber-bd   → session character (MIXED / CHOPPY)
--green, --green-bg, --green-bd   → TRENDING / CONFIRMING
--red, --red-bg, --red-bd         → CHOPPY (when it means risk) / DIVERGING
--blue, --blue-bg, --blue-bd      → badges
--purple, --purple-bg, --purple-bd → GARCH badge style (reuse for REGIME-CONDITIONAL)
--text, --text2, --text3          → text hierarchy
--s1, --s2, --s3                  → surface backgrounds
--border, --border2               → borders
```

Font stack already in use: `DM Sans` for UI text, `DM Mono` for numbers.

---

## Integration Into the AI Analysis Card

The existing `POST /api/analysis` route sends a structured payload to Claude Sonnet. When building the analysis payload (look for where `aiPayload` or the analysis prompt is constructed), append the O-to-C forecast data:

```javascript
// Add to the analysis context object sent to the AI card:
otcForecast: otcForecast ? {
  median: otcForecast.median.toFixed(2),
  medianPips: otcForecast.medianPips.toFixed(0),
  p25Pips: otcForecast.p25Pips.toFixed(0),
  p75Pips: otcForecast.p75Pips.toFixed(0),
  bullFrac: (otcForecast.bullFrac * 100).toFixed(0) + '%',
  sessionChar: otcForecast.sessionChar,
  coherence: otcForecast.coherence,
  sampleSize: otcForecast.sampleSize,
} : null,
```

The AI card system prompt already instructs Claude to synthesise all dashboard data — no system prompt changes needed.

---

## Integration Into Signal Scorecard

The existing signal scorecard renders pass/fail checks for each pair. Add one new row:

**Label:** `O-to-C character`  
**Pass condition:** `sessionChar === 'TRENDING'`  
**Fail condition:** `sessionChar === 'CHOPPY'`  
**Mixed condition:** `sessionChar === 'MIXED'`

Pass text: `Trending session regime — directional moves expected`  
Fail text: `Choppy session regime — mean-reversion character, tight targets`  
Mixed text: `Mixed session character — moderate directionality`

---

## Integration Into Entry Confluence Display

For each Fib confluence entry shown in the entry scanner, add a one-line O-to-C context note below the existing TP/SL line:

```javascript
// If otcForecast is available and session is TRENDING and coherence is CONFIRMING:
// Show: "O-C forecast: median +14p | IQR +7p to +24p — supports TP reach"

// If CHOPPY:
// Show: "O-C forecast: choppy session — TP beyond 12p historically rarely filled"
```

This is display-only — it does not modify the star rating or TP calculation.

---

## What NOT to Change

- Do not modify `calculateVolRegime()` — call it first, pass its result into the new function
- Do not modify `_worker.js` — no new API routes
- Do not add new `localStorage` keys — O-to-C is computed fresh each render from cached OHLC
- Do not change the FRED data shape — this feature does not touch macro scoring
- Do not add external dependencies — pure JS, same as everything else in the file
- The GARCH CI section stays exactly as-is — O-to-C renders below it, not replacing it

---

## Architecture Context

```
index.html (5,278 lines, single file)
│
├── JS: getPipSize(sym)                    ← already exists, use as-is
├── JS: calculateVolRegime()               ← already exists, call before new fn
├── JS: calculateOTCForecast()             ← NEW — add here
│
├── renderDashboard()
│   ├── calls calculateVolRegime()         ← already exists
│   ├── calls calculateOTCForecast()       ← NEW call, add after vol regime
│   └── renders volatility card
│       ├── GARCH CI bar                   ← already exists
│       └── O-to-C forecast card           ← NEW — render here
│
├── Signal scorecard render                ← add one new row
└── Entry confluence render                ← add one context line per entry
```

---

## Summary of What Claude Code Needs to Do

1. **Add** `calculateOTCForecast(bars, volRegime, macroScore, sym)` function after `calculateVolRegime()`
2. **Call** it in `renderDashboard()` after the vol regime call
3. **Render** the O-to-C card inside the volatility card, below the GARCH CI section
4. **Add** one row to the signal scorecard
5. **Add** one context line per entry in the entry confluence display
6. **Append** O-to-C data to the AI analysis payload

No worker changes. No new files. No new API calls.
