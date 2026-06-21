# AI Analysis Card — Integration Guide
## Regime + Confluence Dashboard (macrorange.pages.dev)

---

## What you're adding

A **🧠 Analyse** button in the topbar that sends all current dashboard data to Claude and returns a structured trading intelligence brief covering:

- Overall bias (LONG/SHORT/NEUTRAL) with conviction score 0–10
- Regime classification (Trending / Ranging / Breakout Risk / Mean-Reversion / Choppy)
- Macro read (rate diffs, VIX, credit spreads, carry)
- Yield curve interpretation for this specific pair
- OI / GEX / dealer positioning analysis (uses your pasted CME data)
- Key levels table (call wall, put wall, max pain, gamma flip, top Fibs, pivots)
- Trading framework — what type of trade fits the current structure
- What's good to do / what to avoid — specific and actionable
- Breakout trigger vs reversion trigger — specific prices
- Clean break potential (HIGH/MEDIUM/LOW) with rationale
- Sentiment & positioning (P/C ratio, OI flows, carry proxy)
- Reflexivity check — is price reinforcing or diverging from the macro narrative
- Risk warnings

Results are **cached in localStorage for 1 hour per pair** — no token cost on page refresh.

---

## Files to edit

You need to modify two files and redeploy:

```
macrorange-cf/
├── _worker.js     ← add /api/analysis route + hasAnt to /api/config
└── index.html     ← add CSS, HTML card, and JS engine
```

---

## Step 1: Edit `_worker.js`

### 1a. Add `ANT_KEY` to `/api/config`

Find your existing `/api/config` handler. It probably returns something like:
```javascript
return json({ hasFred: !!env.FRED_KEY, hasTwelve: !!env.TWELVE_KEY });
```

Add `hasAnt`:
```javascript
return json({ hasFred: !!env.FRED_KEY, hasTwelve: !!env.TWELVE_KEY, hasAnt: !!env.ANT_KEY });
```

### 1b. Add `/api/analysis` route

Copy the entire content of `ai-analysis-worker-patch.js` and paste it **BEFORE** the final `return new Response('Not found', {status:404})` line in your `_worker.js` fetch handler.

The block starts with:
```javascript
if (url.pathname === '/api/analysis' && req.method === 'POST') {
```

---

## Step 2: Edit `index.html`

### 2a. Add CSS

Open `ai-analysis-card-patch.html`, find the block between:
```
<!-- CSS — paste inside existing <style> tag -->
```
Copy everything inside the `<style id="ai-analysis-css-patch">` tags and paste it at the bottom of your existing `<style>` block.

### 2b. Add topbar button

Find your topbar HTML with the Refresh and OI buttons:
```html
<button ...>🔄Refresh</button>
<button ...>📊OI</button>
```

Add after them:
```html
<button onclick="triggerAIAnalysis()" id="aiAnalysisBtn" title="AI market analysis">🧠 Analyse</button>
```

### 2c. Add the card container HTML

Find the right sidebar section where the OI card renders. It'll be something like:
```html
${(()=>{ try { return renderOISidebar(); } catch(e) { ... } })()}
```

**After** that block, add:
```html
<div id="aiAnalysisSection"></div>
```

Or if your sidebar is built via JS template literals, add:
```javascript
${(()=>{ try { return renderAISidebar(); } catch(e) { return ''; } })()}
```
(where `renderAISidebar()` calls `renderAIAnalysisCard()` and returns `document.getElementById('aiAnalysisSection')?.outerHTML || '<div id="aiAnalysisSection"></div>'`)

The simplest approach: just add `<div id="aiAnalysisSection"></div>` as a static element in the sidebar HTML, then the JS populates it.

### 2d. Add JavaScript

Copy everything between the `<script id="ai-analysis-js-patch">` tags in `ai-analysis-card-patch.html` and paste into your main `<script>` block, **after** the OI engine functions and **before** the `// CONFIG` section.

### 2e. Wire up renderAIAnalysisCard() calls

Find your `renderAll()` function (or equivalent — the function that redraws the dashboard). Add this call at the end:
```javascript
// Load cached AI analysis for current pair (or show empty state)
renderAIAnalysisCard();
```

Find where you handle **pair switching** (the tab click handler). After the pair switches and renders, add:
```javascript
renderAIAnalysisCard(); // load this pair's cached analysis
```

---

## Step 3: Cloudflare Environment Variables

Go to: **Cloudflare Pages → macrorange → Settings → Environment Variables**

Add:
| Variable | Value |
|---|---|
| `ANT_KEY` | Your Anthropic API key (starts with `sk-ant-...`) |

⚠️ **Set in BOTH Production AND Preview** scopes — this is the same lesson from FRED_KEY and TWELVE_KEY.

---

## Step 4: Deploy

Drag and drop the updated folder onto the Cloudflare Pages deploy zone as usual.

---

## How it works

1. You click **🧠 Analyse** in the topbar
2. JS collects all current state: macro score + tiers, Asia/Monday ranges, pivot levels, Fib confluences, OI data (from `oi_store` in localStorage), FRED data (VIX, HY, DXY, yield curve, AUD/JPY), vol regime
3. Sends it to `/api/analysis` (POST)
4. Worker formats a detailed prompt and calls `claude-sonnet-4-5` via Anthropic API
5. Claude returns structured JSON
6. Card renders with full analysis
7. Result cached in localStorage for 1 hour — subsequent page loads show cached version instantly

---

## Data the prompt includes

| Data | Source |
|---|---|
| Macro score + all 7 tier scores | `currentPair.score`, `currentPair.tiers` |
| Directional bias | `currentPair.bias` |
| Vol regime + GARCH + ATR percentile | `currentPair.volRegime` etc |
| Asia range H/L + price position | `currentPair.asiaHigh/asiaLow` |
| Monday range H/L + price position | `currentPair.mondayHigh/mondayLow` |
| All detected Fib confluences (stars, sources, distance) | `currentPair.confluences` |
| Daily pivot PP/R1–R3/S1–S3 | `currentPair.pivotPP` etc |
| Max pain, call wall, put wall | `oi_store` localStorage |
| P/C ratio + OI flows | `oi_store` localStorage |
| Aggregate GEX, DEX, gamma flip level | `oi_store` localStorage |
| Top 8 OI strike levels | `oi_store` localStorage |
| VIX level + direction | `fredData.vix` |
| HY credit spread + direction | `fredData.hy` |
| DXY level + direction | `fredData.dxy` |
| US 2Y + 10Y → 2s10s spread + curve shape | `fredData.us2y/us10y` |
| AUD/JPY carry proxy | `fredData.aud_usd × usd_jpy` |
| NFCI financial conditions | `fredData.nfci` |
| Cross-asset risk sentiment | `riskSentiment` global |

---

## Variable name mapping

The JS snapshot collector uses the variable names from the design docs. If your actual globals have different names, edit `aiCollectSnapshot()` in the JS patch — it's well-commented with the expected names.

Common aliases to check:
- `currentPair` — the active pair object
- `fredData` — the FRED data object (keyed by series: `vix`, `hy`, `dxy`, etc.)
- `riskSentiment` — the cross-asset sentiment string

---

## API cost

Each analysis call: approximately **$0.01–0.02** at claude-sonnet-4-5 pricing.
The 1-hour localStorage cache means you pay once per pair per hour maximum.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Button click → "ANT_KEY not configured" | Set ANT_KEY in CF Pages env vars (both scopes) |
| Analysis runs but fields show "N/A" | Edit `aiCollectSnapshot()` — match your variable names |
| OI section says "No OI data loaded" | Paste OI data via the 📊OI button first |
| Card doesn't appear | Check that `<div id="aiAnalysisSection"></div>` is in the sidebar HTML |
| "Claude returned non-JSON" error | Rare — retry. Claude occasionally prefixes text before JSON |

---

*End of integration guide.*
