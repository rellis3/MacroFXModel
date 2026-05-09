# Signal Quality Fixes — Claude Code Instructions

> **Context:** This is a Cloudflare Pages app (vanilla JS ES modules, no framework, no build step).
> All changes are in the `js/` directory. After edits, tell the user which files changed.
> Do NOT touch `_worker.js` for any of these fixes — all changes are client-side only.
> Do NOT add any Unicode, emoji, or smart quotes to `_worker.js` if you happen to open it.

---

## Summary of 9 fixes to make

1. Fix surprise index direction (adds points even when conflicting)
2. Wire `volBias` into signal modifier (expanding vol = reversion warning)
3. Add 21-period EMA alignment check on 5m bars
4. Add 5m candle confirmation gate on entry cards
5. Add session hard gate / visual warning on entry cards
6. Fix TP target to 2.2R for session-sourced entries
7. Surface cross-pair conflict as a prominent red warning in signal card
8. Cap confluence stars at 7 and split structural vs confirmation display
9. Add ECB SDW API route for daily EUR rates (requires `_worker.js` change)

> Fix 9 (ECB SDW) is the only one touching `_worker.js`. Do it last and flag the file to the user.

---

## Fix 1 — Surprise Index Direction Bug

**File:** `js/signal.js`

**Find this block** (around line 205–220, inside `runSignalEngine()`):

```js
const ps = getPairSurpriseScore();
if (ps != null && Math.abs(ps.net) > 0.8 && bias !== 'NEUTRAL') {
  const surpriseBull  = ps.net > 0;
  const signalBull    = bias === 'LONG';
  const confirms      = surpriseBull === signalBull;
  const pts           = Math.abs(ps.net) > 1.5 ? 2 : 1;
  score              += pts;  // confirms adds pts; conflicting surprises could be modelled later
  surpriseMod         = { net: ps.net, confirms, pts };
  reasons.push({
    icon:  confirms ? '🟢' : '🔴',
    label: 'Macro Surprise',
    val:   `${ps.net >= 0 ? '+' : ''}${ps.net.toFixed(2)} net ${confirms ? '✓ confirms' : '✗ conflicts'}`,
    pts:   confirms ? pts : 0,
  });
}
```

**Replace with:**

```js
const ps = getPairSurpriseScore();
if (ps != null && Math.abs(ps.net) > 0.8 && bias !== 'NEUTRAL') {
  const surpriseBull = ps.net > 0;
  const signalBull   = bias === 'LONG';
  const confirms     = surpriseBull === signalBull;
  const magnitude    = Math.abs(ps.net) > 1.5 ? 2 : 1;
  // Confirming surprise adds points; conflicting surprise DEDUCTS points
  const pts          = confirms ? magnitude : -magnitude;
  score             += pts;
  surpriseMod        = { net: ps.net, confirms, pts };
  reasons.push({
    icon:  confirms ? '\u{1F7E2}' : '\u{1F534}',
    label: 'Macro Surprise',
    val:   `${ps.net >= 0 ? '+' : ''}${ps.net.toFixed(2)} net ${confirms ? '\u2713 confirms' : '\u2717 conflicts'}`,
    pts,
  });
}
```

---

## Fix 2 — Wire volBias into Signal Engine

**File:** `js/signal.js`

**Where to add:** Still inside `runSignalEngine()`, after the `crossConflict` block and before the `return` statement.

Find the return line that looks like:
```js
return { bias, type, score, maxScore: 12, reasons, fvPips, fvGap, fvBull,
         mom10Bull, mom2Bull, sp10Bull, lagDetected, surpriseMod, crossConflict, armaMod, realYieldMod };
```

**Insert this block immediately before that return:**

```js
// Vol impulse modifier — penalise reversion signals in expanding vol
let volBiasMod = null;
try {
  const vb = volRegime?.volBias;
  if (vb === 'expanding' && (type === 'reversion' || type === 'catchup')) {
    score = Math.max(0, score - 1);
    volBiasMod = { bias: 'expanding', pts: -1 };
    reasons.push({
      icon:  '\u{1F7E1}',
      label: 'Vol Expanding',
      val:   `+${volRegime.volImpulsePct?.toFixed(0) ?? '?'}% impulse — reversion risk elevated, reducing score`,
      pts:   -1,
    });
  } else if (vb === 'contracting' && (type === 'reversion' || type === 'catchup')) {
    score = Math.min(12, score + 1);
    volBiasMod = { bias: 'contracting', pts: 1 };
    reasons.push({
      icon:  '\u{1F7E2}',
      label: 'Vol Contracting',
      val:   `${volRegime.volImpulsePct?.toFixed(0) ?? '?'}% impulse — mean-reversion conditions improving`,
      pts:   1,
    });
  }
} catch(e) {}
```

**Also update the return line** to include `volBiasMod`:

```js
return { bias, type, score, maxScore: 12, reasons, fvPips, fvGap, fvBull,
         mom10Bull, mom2Bull, sp10Bull, lagDetected, surpriseMod, crossConflict, armaMod, realYieldMod, volBiasMod };
```

> Note: `runSignalEngine` receives `volRegime` as its second argument — it is already passed in from `renderSignalAndEntries`. No call-site changes needed.

---

## Fix 3 — 21-period EMA Alignment on 5m Bars

**File:** `js/signal.js`

**Add a helper function** near the top of the file, after the imports:

```js
// ── 5m EMA helper ─────────────────────────────────────────────────────────────
// Returns { ema, aligned } where aligned = price is on the correct side of EMA
// for the given direction ('long' = price > EMA, 'short' = price < EMA).
// Returns null if insufficient bars.
function get5mEMAAlignment(symbol, direction, period = 21) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < period + 2) return null;
  // bars are newest-first; reverse for chronological EMA calculation
  const closes = [...bars].reverse().map(b => parseFloat(b.close));
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  const latestClose = closes[closes.length - 1];
  const aligned = direction === 'long' ? latestClose > ema : latestClose < ema;
  return { ema, latestClose, aligned };
}
```

**Wire it into `runEntryScanner()`** — inside the `candidates.map(c => { ... })` block, after the existing cross-pair USD conflict tag section and before the final `return { ...c, ... }`.

Find:
```js
    return {
      ...c,
      size: adjSize,
      totalStars: Math.min(7, Math.round(layerScore)),
```

**Insert before that return:**

```js
    // 5m EMA alignment check
    const emaCheck = get5mEMAAlignment(sym, c.direction);
    const emaAligned = emaCheck?.aligned ?? null;
    if (emaCheck !== null) {
      if (emaAligned) {
        layerScore += 0.5;
        tags.push({ cls: 'signal', label: `EMA21 \u2713`, key: 'ema' });
        layers.push('5m EMA aligned');
      } else {
        layerScore -= 0.5;
        tags.push({ cls: 'warn', label: `EMA21 \u2717`, key: 'ema' });
        layers.push('5m EMA conflict');
      }
    }
```

**Also add `emaAligned` and `emaCheck` to the return object:**

```js
    return {
      ...c,
      size: adjSize,
      totalStars: Math.min(7, Math.round(layerScore)),
      layers,
      tags,
      tp,
      tpNote,
      tpPips,
      slPips,
      rrRatio,
      signalAligned,
      emaAligned,
      emaEma: emaCheck?.ema ?? null,
    };
```

---

## Fix 4 — 5m Candle Confirmation Gate

**File:** `js/signal.js`

**Add a second helper function** near the top (after the EMA helper from Fix 3):

```js
// ── 5m candle confirmation ────────────────────────────────────────────────────
// Checks the last 2 CLOSED 5m candles for directional confirmation.
// For 'long': bullish body OR lower wick >= 30% of bar range (pin bar rejection).
// For 'short': bearish body OR upper wick >= 30% of bar range.
// Returns { confirmed, reason } or null if insufficient data.
function get5mCandleConfirmation(symbol, direction) {
  const bars = S.ohlc5m?.[symbol]?.values;
  // bars[0] is the current (possibly incomplete) bar; bars[1] and bars[2] are closed
  if (!bars || bars.length < 3) return null;
  const b1 = bars[1]; // most recent closed
  const b2 = bars[2]; // second most recent closed
  if (!b1 || !b2) return null;

  function score(bar, dir) {
    const o = parseFloat(bar.open), c = parseFloat(bar.close);
    const h = parseFloat(bar.high), l = parseFloat(bar.low);
    const range = h - l;
    if (range === 0) return 0;
    if (dir === 'long') {
      const bullBody = c > o;
      const lowerWick = Math.min(o, c) - l;
      return (bullBody || lowerWick / range >= 0.30) ? 1 : 0;
    } else {
      const bearBody = c < o;
      const upperWick = h - Math.max(o, c);
      return (bearBody || upperWick / range >= 0.30) ? 1 : 0;
    }
  }

  const s1 = score(b1, direction);
  const s2 = score(b2, direction);
  const confirmed = s1 === 1; // most recent closed bar is the gate
  const supporting = s2 === 1;
  const reason = confirmed
    ? (supporting ? 'Both recent 5m bars confirm' : 'Most recent 5m bar confirms')
    : (supporting ? '5m: prior bar confirms but latest does not — wait' : 'No 5m confirmation — wait for close');
  return { confirmed, supporting, reason };
}
```

**Wire it into `runEntryScanner()`** — in the same section where you added the EMA check (Fix 3), add this right after the EMA block:

```js
    // 5m candle confirmation
    const candleCheck = get5mCandleConfirmation(sym, c.direction);
    const candleConfirmed = candleCheck?.confirmed ?? null;
    if (candleCheck !== null) {
      if (candleConfirmed) {
        layerScore += 1;
        tags.push({ cls: 'signal', label: candleCheck.supporting ? 'Candle \u2713\u2713' : 'Candle \u2713', key: 'candle' });
        layers.push('5m candle confirmed');
      } else {
        tags.push({ cls: 'warn', label: 'Awaiting close', key: 'candle' });
        layers.push('Awaiting 5m candle close');
      }
    }
```

**Add to the return object:**

```js
      candleConfirmed,
      candleReason: candleCheck?.reason ?? null,
```

**Update the entry card render** in `renderEntryScanner()` to show the confirmation state prominently. Find the `tradeHtml` block:

```js
    const tradeHtml = e.sl != null ? `
      <span><strong>Entry</strong> ${e.price.toFixed(digits)}</span>
```

**Prepend a confirmation banner before `tradeHtml` is built:**

```js
    const confirmBanner = e.candleConfirmed === false
      ? `<div style="font-size:10px;color:var(--amber);background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:5px;padding:4px 8px;margin-bottom:6px">\u23F3 ${e.candleReason ?? 'Awaiting 5m candle confirmation before entry'}</div>`
      : e.candleConfirmed === true
      ? `<div style="font-size:10px;color:var(--green);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:5px;padding:4px 8px;margin-bottom:6px">\u2705 ${e.candleReason ?? '5m candle confirmed'}</div>`
      : '';
```

Then in the card HTML, insert `${confirmBanner}` above `${tradeHtml}` inside the `<div class="ec-trade">`:

```js
      <div class="ec-trade">${confirmBanner}${tradeHtml}</div>
```

---

## Fix 5 — Session Hard Gate / Visual Warning

**File:** `js/signal.js`

**In `renderEntryScanner()`**, find where the `volCtx` block ends and entries are rendered. Before the entry cards loop, add a session warning banner:

Find:
```js
  if (!entries || entries.length === 0) {
    return `<div class="ec-no-entries">
```

**Insert a session banner variable before this:**

```js
  const sessionKey = S.sessionData?.key ?? '';
  const sessionName = S.sessionData?.name ?? '';
  const sessionConf = S.sessionData?.confidence ?? 1.0;
  const offPeak = sessionConf < 0.80; // Asia (0.75), Pre-London (0.65), Off-Hours (0.60)
  const sessionWarning = offPeak
    ? `<div style="font-size:11px;color:var(--amber);background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.3);border-radius:7px;padding:8px 12px;margin-bottom:10px;line-height:1.5">
        \u23F0 <strong>${sessionName} session</strong> (${Math.round(sessionConf*100)}% confidence) —
        levels shown but reliability is reduced. Wait for London open (08:00) or NY Overlap (13:00) for best fills.
       </div>`
    : '';
```

Then include `sessionWarning` in the returned string — add it after `volCtx`:

```js
  return volCtx + sessionWarning + `<div class="entry-scanner">...
```

---

## Fix 6 — Fix TP Target to 2.2R for Session Entries

**File:** `js/confluences.js`

**Find the fallback TP calculation** (around line 170):

```js
    if (tp == null && direction != null) {
      const tpRaw = stopDist * (volRegime.tpMult || 1.5);
      tpDist  = Math.min(tpRaw, tpCap);
      tpCapped = tpDist < tpRaw;
      tpSource = tpCapped ? 'Vol cap' : 'ATR';
      tp = direction === 'long' ? c.price + tpDist : c.price - tpDist;
    }
```

**Replace with:**

```js
    if (tp == null && direction != null) {
      // Use 2.2R for session-sourced confluence levels (Asia/Monday) — validated in backtest.
      // Fall back to volRegime.tpMult (1.5) for non-session confluences.
      const isSessionLevel = (c.source === 'asia' || c.source === 'monday');
      const targetMult = isSessionLevel ? 2.2 : (volRegime.tpMult || 1.5);
      const tpRaw = stopDist * targetMult;
      tpDist  = Math.min(tpRaw, tpCap);
      tpCapped = tpDist < tpRaw;
      tpSource = tpCapped ? 'Vol cap' : (isSessionLevel ? '2.2R' : 'ATR');
      tp = direction === 'long' ? c.price + tpDist : c.price - tpDist;
    }
```

> Note: `c.source` is already set to `'asia'` or `'monday'` in `main.js` / `render.js` when confluences are merged into the `all` array. Verify the spread `[...asiaConfs.map(c => ({...c, source:'asia'})), ...mondayConfs.map(c => ({...c, source:'monday'}))]` pattern is in place — it should already be there. If `c.source` is undefined, `isSessionLevel` will be false and it will gracefully fall back to the existing 1.5× logic.

---

## Fix 7 — Surface Cross-Pair Conflict as Red Warning in Signal Card

**File:** `js/signal.js`

**In `renderSignalCard()`**, find the opening of the returned template string:

```js
  return `
    <div class="signal-card ${cls}">
      <div class="sig-hd">
```

**Insert a cross-conflict banner variable before the return:**

```js
  const crossWarn = (signal.crossConflict?.type === 'conflict' && signal.crossConflict?.sizeMult <= 0.75)
    ? `<div style="font-size:11px;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:7px 10px;margin-bottom:8px;line-height:1.5">
        \u26A0\uFE0F <strong>Cross-pair USD conflict</strong> — USD composite strength contradicts this signal direction.
        Position size reduced to ${Math.round((signal.crossConflict.sizeMult ?? 1) * 100)}%. Treat with caution or stand aside.
       </div>`
    : (signal.crossConflict?.type === 'confirmed' && signal.crossConflict?.severity === 'strong')
    ? `<div style="font-size:11px;color:var(--green);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:6px;padding:7px 10px;margin-bottom:8px;line-height:1.5">
        \u2714\uFE0F <strong>Cross-pair USD confirmed</strong> — USD composite strength aligns with signal direction.
       </div>`
    : '';
```

**Then insert `${crossWarn}` at the very top inside the signal card div:**

```js
  return `
    <div class="signal-card ${cls}">
      ${crossWarn}
      <div class="sig-hd">
```

---

## Fix 8 — Star Cap at 7 with Structural vs Confirmation Split

**File:** `js/confluences.js`

The star cap at 7 is already enforced in `runEntryScanner()` via `Math.min(7, Math.round(layerScore))`. What's missing is the display split. Do the following:

**In `enhanceConfluences()`**, split the stars count into two buckets on the returned object. Find the end of the `return` in the `.map(c => { ... })`:

```js
    return {
      ...c,
      direction,
      distance,
      aligned,
      pivotMatch,
      oiMatch,
```

**Add two new fields** to this return object:

```js
      structuralStars: [
        c.isTight ? 1 : 0,
        pivotMatch ? 1 : 0,
        oiMatch ? 1 : 0,
        nearDailyOpen ? 1 : 0,
        (c.density || 1) >= 2 ? 1 : 0,
        dailyFib ? 1 : 0,
        structuralFib ? 1 : 0,
      ].reduce((a, b) => a + b, 0),
      confirmationStars: [
        aligned ? 1 : 0,
        (matchingOpens.length >= 3) ? 1 : 0,
        (structuralFib?.count ?? 0) >= 3 ? 1 : 0,
      ].reduce((a, b) => a + b, 0),
```

**In `renderEntryScanner()`** in `signal.js`, update the star display inside the entry card. Find:

```js
    const starStr = '\u2B50'.repeat(e.totalStars) + '\u2606'.repeat(Math.max(0, 7 - e.totalStars));
```

**Replace with:**

```js
    const capStars = Math.min(7, e.totalStars);
    const starStr  = '\u2B50'.repeat(capStars) + '\u2606'.repeat(Math.max(0, 7 - capStars));
    const starBreakdown = (e.structuralStars != null && e.confirmationStars != null)
      ? `<span style="font-size:9px;color:var(--text3);margin-left:4px">${e.structuralStars}S+${e.confirmationStars}C</span>`
      : '';
```

Then in the card's `ec-top` div, insert `${starBreakdown}` after `${starStr}`:

```js
        <span class="ec-stars">${starStr}${starBreakdown}</span>
```

> The tooltip convention is: `S` = structural (how strong the price level is), `C` = confirmation (how well timing/bias/session confirm right now). A `5S+0C` level is a strong level with bad timing. A `3S+2C` is a medium level perfectly timed.

---

## Fix 9 — ECB SDW API for Daily EUR Rates

> **This is the only fix requiring `_worker.js` changes.** Do this last.
> Run `node --check _worker.js` after editing to verify no syntax errors before telling the user to deploy.

### Part A — `_worker.js`: Add ECB SDW route

**Find** the block of existing `/api/fred` routing (look for `if (path === '/api/fred')`).

**After the existing fred route handler, add a new route:**

```js
// ECB SDW — daily EUR area rates (no API key required)
// Returns { estr: {value, prev}, de10y_ecb: {value, prev} }
if (path === '/api/ecbsdw') {
  const cacheKey = 'ecbsdw_daily';
  const cached = await env.FX_SCORES?.get(cacheKey);
  if (cached) return json(JSON.parse(cached));

  async function fetchECBSeries(seriesKey) {
    const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?lastNObservations=5&format=jsondata`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    const obs = d?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0']?.observations
             ?? d?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0:0:0']?.observations
             ?? null;
    if (!obs) return null;
    const keys = Object.keys(obs).map(Number).sort((a, b) => a - b);
    if (keys.length < 2) return null;
    const value = obs[keys[keys.length - 1]][0];
    const prev  = obs[keys[keys.length - 2]][0];
    return { value, prev };
  }

  try {
    // ESTR (Euro short-term rate) — daily
    const estr = await fetchECBSeries('EST/B.EU000A2X2A25.WT');
    // German 10Y Bund from ECB — daily
    const de10y_ecb = await fetchECBSeries('YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y');

    const result = { estr: estr ?? null, de10y_ecb: de10y_ecb ?? null };
    await env.FX_SCORES?.put(cacheKey, JSON.stringify(result), { expirationTtl: 43200 }); // 12h
    return json(result);
  } catch(e) {
    return json({ estr: null, de10y_ecb: null, error: e.message });
  }
}
```

### Part B — `js/macro.js`: Consume ECB data in T1

**Find** the `calculateTierScores()` function. Near the top where `fredData` values are destructured, add:

```js
  const ecbData    = S.ecbData ?? null;   // loaded by main.js if available
  const estr       = ecbData?.estr?.value ?? null;
  const de10y_ecb  = ecbData?.de10y_ecb?.value ?? null;
```

**Find the T1 rate differential block for EUR/USD** (look for where `de10y` or `EURUSD` T1 is computed). The existing code uses the FRED monthly German series. When `de10y_ecb` is available (not null), prefer it:

```js
  // For EUR/USD T1: prefer ECB daily de10y over FRED monthly proxy
  const de10yEffective = (sym === 'EUR/USD' || sym === 'EUR/GBP')
    ? (de10y_ecb ?? fredData?.de10y?.value ?? null)
    : (fredData?.de10y?.value ?? null);
```

Then replace any usage of `fredData.de10y?.value` in EUR-specific T1 logic with `de10yEffective`.

### Part C — `js/main.js`: Fetch ECB data on load

**Find** the section in `main.js` where FRED data is fetched (look for `fetch('/api/fred')`).

**After the FRED fetch succeeds**, add a parallel ECB fetch:

```js
  // ECB SDW — daily EUR rates (enhances T1 for EUR pairs)
  try {
    const ecbRes = await fetch('/api/ecbsdw');
    if (ecbRes.ok) {
      S.ecbData = await ecbRes.json();
    }
  } catch(e) {
    S.ecbData = null;
  }
```

**Also add `ecbData: null` to the initial state** in `js/state.js`:

In `state.js`, find the `S = { ... }` object and add:

```js
  ecbData:         null,               // ECB SDW daily rates { estr, de10y_ecb }
```

---

## Files Changed Summary

After completing all fixes, the following files will have changed:

| File | Fixes applied |
|---|---|
| `js/signal.js` | 1, 2, 3, 4, 5, 7, 8 |
| `js/confluences.js` | 6, 8 |
| `js/macro.js` | 9 |
| `js/main.js` | 9 |
| `js/state.js` | 9 |
| `_worker.js` | 9 |

Tell the user to drag-and-drop the full folder to Cloudflare Pages after all changes are made. Remind them to set environment variables in **both** Production and Preview scopes if any new routes were added.

---

## Testing Checklist

After deployment, verify:

- [ ] EUR/USD signal card: positive surprise confirming a LONG adds points; a negative surprise conflicting with a LONG now shows as red and **deducts** points
- [ ] Entry cards with `volBias = 'expanding'` show an amber vol warning in the signal reasons
- [ ] Entry cards show `EMA21 ✓` (green) or `EMA21 ✗` (amber) tags
- [ ] Entry cards show `✅ 5m candle confirmed` (green) or `⏳ Awaiting close` (amber) banners
- [ ] During Asia session (00:00–06:00 London), an amber session warning appears above the entry cards
- [ ] Asia/Monday session confluences show TP as `2.2R` in the trade row, not `1.5×ATR`
- [ ] When USD strength strongly conflicts with the signal, a red `⚠ Cross-pair USD conflict` card appears at the top of the signal card
- [ ] Star ratings show `3S+2C` style breakdown next to stars
- [ ] EUR/USD T1 score sources from `de10y_ecb` (ECB daily) when available — check browser DevTools Network tab for `/api/ecbsdw` returning data

---

---

# Additional Fixes — Round 2

> These are separate issues found in a deeper code review. Apply after the Round 1 fixes above.
> Files affected: `js/arma.js`, `js/macro.js`, `js/signal.js`, `js/ranges.js`, `js/utils.js`, `js/main.js`, `js/config.js`

---

## Fix 10 — ARMA Skill Score Double-counts `mu` (Logic Bug)

**File:** `js/arma.js`

**The bug:** In `fitARMA()`, the MAE skill calculation compares `diff[i]` against `armaPred + mu`, but `armaPred` is already `mu + phi * demeaned[i-1]` — so `mu` is added twice. The naive benchmark also compares against just `mu` (not `diff[i] - mu`), making both sides wrong. This corrupts the `skillPct` value which gates whether the ARMA forecast is used in the signal engine.

**Find:**

```js
  let armaErr = 0, naiveErr = 0;
  for (let i = 1; i < diff.length; i++) {
    const armaPred  = mu + phi * demeaned[i-1];
    armaErr  += Math.abs(diff[i] - (armaPred + mu));
    naiveErr += Math.abs(diff[i] - mu);
  }
```

**Replace with:**

```js
  let armaErr = 0, naiveErr = 0;
  for (let i = 1; i < diff.length; i++) {
    // armaPred is already mu + phi*demeaned[i-1] — compare directly against diff[i]
    const armaPred = mu + phi * demeaned[i-1];
    armaErr  += Math.abs(diff[i] - armaPred);
    naiveErr += Math.abs(diff[i] - mu);  // naive: just predict the mean
  }
```

---

## Fix 11 — ARMA Conflict Not Penalised (Logic Gap)

**File:** `js/signal.js`

**The bug:** When the ARMA forecast *conflicts* with the signal bias, the current code adds `pts = 0` — no penalty. A HIGH-confidence ARMA BEARISH forecast while the signal is LONG is meaningful negative information and should deduct a point.

**Find** (inside `runSignalEngine()`, the ARMA block around line 242):

```js
      const confirms = bias !== 'NEUTRAL' && armaBull === (bias === 'LONG');
      const pts      = confirms ? 1 : 0;
      score         += pts;
      armaMod        = { direction: arma.direction, confidence: arma.confidence, skill: arma.avgSkill, confirms, pts };
      reasons.push({
        icon:  confirms ? '🟢' : bias === 'NEUTRAL' ? '⚪' : '🔴',
        label: 'ARMA spread forecast',
        val:   `${arma.direction} · ${arma.confidence} · ${arma.avgSkill >= 0 ? '+' : ''}${arma.avgSkill}% vs RW`,
        pts,
      });
```

**Replace with:**

```js
      const confirms = bias !== 'NEUTRAL' && armaBull === (bias === 'LONG');
      // Confirming: +1. Conflicting with HIGH confidence: -1. Conflicting MEDIUM: 0.
      const pts = confirms
        ? 1
        : (bias !== 'NEUTRAL' && arma.confidence === 'HIGH') ? -1 : 0;
      score += pts;
      armaMod = { direction: arma.direction, confidence: arma.confidence, skill: arma.avgSkill, confirms, pts };
      reasons.push({
        icon:  confirms ? '\u{1F7E2}' : pts < 0 ? '\u{1F534}' : '\u26AA',
        label: 'ARMA spread forecast',
        val:   `${arma.direction} \u00B7 ${arma.confidence} \u00B7 ${arma.avgSkill >= 0 ? '+' : ''}${arma.avgSkill}% vs RW ${!confirms && bias !== 'NEUTRAL' ? '\u2717 conflicts' : confirms ? '\u2713 confirms' : ''}`,
        pts,
      });
```

---

## Fix 12 — Coherence Bonus: Exclude Weak T7 Votes

**File:** `js/macro.js`

**The issue:** `calculateTierScores()` counts T7 (Momentum/RSI) in the coherence vote equally with all other tiers. T7 can score `+1` from RSI at 51 — barely above neutral — and tip a 4/7 agree count to 5/7, triggering the coherence bonus. Fix: only count a tier in the coherence vote if `|tier.score| >= 1` (i.e. it has a genuine directional view, not a marginal one).

**Find:**

```js
  const agreeCount = tiers.filter(t => Math.sign(t.score) === Math.sign(totalScore) && t.score !== 0).length;
  const coherenceBonus = agreeCount >= 5 ? Math.sign(totalScore) : 0;
```

**Replace with:**

```js
  // Only count tiers with a meaningful directional score (|score| >= 1) in the coherence vote.
  // Marginal +1 scores from RSI at 51 or similar should not tip the coherence gate.
  const agreeCount = tiers.filter(t =>
    Math.abs(t.score) >= 1 && Math.sign(t.score) === Math.sign(totalScore)
  ).length;
  const coherenceBonus = agreeCount >= 5 ? Math.sign(totalScore) : 0;
```

---

## Fix 13 — Skip USD Conflict Check for Cross Pairs (EUR/GBP, GBP/JPY)

**File:** `js/macro.js`

**The issue:** `detectCrossConflict()` checks USD composite strength against the signal for all pairs including cross pairs. GBP/JPY is driven by relative GBP vs JPY strength — USD is irrelevant. Checking USD strength against a GBP/JPY signal produces meaningless conflict/confirmation that incorrectly adjusts position size.

**Find** the start of `detectCrossConflict()`:

```js
export function detectCrossConflict(usdStrength, signalBias, pair) {
  if (!usdStrength || Math.abs(usdStrength.score) < 1.0) return null;
  if (!signalBias || signalBias === 'NEUTRAL') return null;
```

**Replace with:**

```js
export function detectCrossConflict(usdStrength, signalBias, pair) {
  // Cross pairs (EUR/GBP, GBP/JPY) are not USD-driven — skip USD conflict check entirely.
  if (pair?.isPairCross) return null;
  if (!usdStrength || Math.abs(usdStrength.score) < 1.0) return null;
  if (!signalBias || signalBias === 'NEUTRAL') return null;
```

---

## Fix 14 — Monday Range Uses Browser Local Timezone, Not London

**File:** `js/ranges.js`

**The bug:** `calculateMondayRanges()` uses `new Date().getDay()` which reflects the browser's local timezone. A user in Sydney on Tuesday 08:00 AEST has `getDay() === 2` (Tuesday) but London is still Monday. They get the wrong week's data. Fix using the same London-time approach as `session.js`.

**Find:**

```js
  const today = new Date();
  const isMonday = today.getDay() === 1;
  const effIdx  = (isMonday && sortedMondays.length >= 2) ? 1 : 0;
```

**Replace with:**

```js
  // Use London local time to determine if today is Monday — not browser local timezone.
  const _londonParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short'
  }).formatToParts(new Date());
  const _londonWeekday = _londonParts.find(p => p.type === 'weekday')?.value;
  const isMonday = _londonWeekday === 'Mon';
  const effIdx   = (isMonday && sortedMondays.length >= 2) ? 1 : 0;
```

---

## Fix 15 — BST Bug: `barLondonHour` Interprets Oanda Timestamps as UTC

**File:** `js/utils.js`

**The bug:** `barLondonHour()` calls `barToUTC(bar).getUTCHours()`. But Oanda bar datetimes have already been converted to London local by the worker. During BST (UTC+1), a London midnight bar has datetime `"2026-06-01 00:00:00"` but `new Date("2026-06-01T00:00:00Z").getUTCHours()` returns `0` — which is correct in winter (GMT=UTC) but wrong in summer when the actual UTC time of London midnight is 23:00 the day before.

Concretely: during BST, `barLondonHour` returns the correct London hour for bars because the string is already London-local and we just read hour from it directly. The real issue is that `barToUTC` appends `Z` (UTC marker) to what is actually a London-local time. During BST this introduces a 1-hour error in `barLondonDay()` for bars near midnight — a Monday 00:30 London bar appears as Sunday 23:30 UTC.

**Find:**

```js
function barToUTC(bar) {
  const dt = bar.datetime;
  return dt.length === 10
    ? new Date(dt + 'T00:00:00Z')
    : new Date(dt.replace(' ', 'T') + 'Z');
}

export function barLondonHour(bar) {
  return barToUTC(bar).getUTCHours();
}

export function barLondonDay(bar) {
  return barToUTC(bar).getUTCDay();
}
```

**Replace with:**

```js
// Oanda bar datetimes are London-local strings with no timezone marker.
// Extract hour and day directly from the string rather than round-tripping through UTC,
// which introduces BST errors near midnight.
function barToUTC(bar) {
  const dt = bar.datetime;
  return dt.length === 10
    ? new Date(dt + 'T00:00:00Z')
    : new Date(dt.replace(' ', 'T') + 'Z');
}

export function barLondonHour(bar) {
  // datetime is London-local: "YYYY-MM-DD HH:MM:SS" — extract HH directly.
  const dt = bar.datetime;
  if (dt.length >= 13) return parseInt(dt.substring(11, 13), 10);
  return barToUTC(bar).getUTCHours(); // fallback for date-only strings
}

export function barLondonDay(bar) {
  // Extract date part and parse as noon UTC to get stable day-of-week regardless of DST.
  const dt = bar.datetime;
  const datePart = dt.length >= 10 ? dt.substring(0, 10) : dt;
  return new Date(datePart + 'T12:00:00Z').getUTCDay();
}
```

---

## Fix 16 — `londonSessionDay()` Uses Locale-Dependent Date Parsing

**File:** `js/utils.js`

**The bug:** `new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }))` produces an `en-US` formatted string like `"5/8/2026, 14:32:00 PM"` and then feeds it back into `new Date()`. This is non-standard and fails on some mobile browsers and non-English locales, returning `Invalid Date` and causing `toISOString()` to throw.

**Find:**

```js
export function londonSessionDay() {
  const nowLondon = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
  if (nowLondon.getHours() < 6) {
    nowLondon.setDate(nowLondon.getDate() - 1);
  }
  return nowLondon.toISOString().split('T')[0];
}
```

**Replace with:**

```js
export function londonSessionDay() {
  // Use Intl.DateTimeFormat to extract London date parts directly — no locale-dependent parsing.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value ?? '00';
  let year = get('year'), month = get('month'), day = get('day');
  const hour = parseInt(get('hour'), 10);
  // Before 06:00 London time → belongs to the previous session day.
  if (hour < 6) {
    const d = new Date(`${year}-${month}-${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
  }
  return `${year}-${month}-${day}`;
}
```

---

## Fix 17 — `forceRefresh()` Doesn't Reset `S.compassData`

**File:** `js/main.js`

**The issue:** When `forceRefresh()` clears all caches, `S.compassData` is not reset. The Macro Compass re-renders from the stale in-memory object for several seconds until the async `loadAndRenderCompass()` completes. This means the signal engine reads stale compass data immediately after a force refresh.

**Find** the state reset block inside `window.forceRefresh`:

```js
  S.fredData      = null;
  S.ohlcData      = {};
  S.ohlc5m        = {};
  S.ohlc30m       = {};
  S.asiaRangeData = {};
  S.mondayRangeData = {};
  S.usdStrength   = null;
  S.dollarRegime  = null;
  S.eventRisk     = null;
  S.surpriseIndex = null;
```

**Replace with:**

```js
  S.fredData        = null;
  S.ohlcData        = {};
  S.ohlc5m          = {};
  S.ohlc30m         = {};
  S.asiaRangeData   = {};
  S.mondayRangeData = {};
  S.compassData     = {};   // reset so signal engine doesn't read stale compass during refresh
  S.structuralFibData = {}; // reset structural fibs alongside their source 30m data
  S.usdStrength     = null;
  S.dollarRegime    = null;
  S.eventRisk       = null;
  S.surpriseIndex   = null;
```

Also add `structuralFibData: {}` to the initial state in `js/state.js` if it isn't already there (check that file — if `S.structuralFibData` is initialised there, this is already safe; if not, add it).

---

## Fix 18 — `computeUSDStrength()` Called 4+ Times Per Load

**File:** `js/macro.js` and `js/render.js`

**The issue:** `computeUSDStrength()` iterates all OHLC bars for 4 pairs on every call. It is called in:
- `main.js` line ~216: inside each background USD pair `.then()` callback (up to 4×)
- `main.js` line ~223: once after the loop
- `macro.js` `computeT3()`: as a fallback `S.usdStrength || computeUSDStrength()`
- `macro.js` `computeDollarRegime()`: as `S.usdStrength || computeUSDStrength()`
- `render.js` line ~188: as `S.usdStrength || computeUSDStrength()`

The `|| computeUSDStrength()` pattern in the last three is the fix — they already short-circuit if `S.usdStrength` is set. The issue is only in `main.js` where the background loop fires the function even when `S.usdStrength` is already populated.

**Find** in `main.js`, inside the USD_INDEX_PAIRS background-load loop:

```js
        ).then(data => {
          if (data) {
            S.ohlcData[sym] = data;
            S.usdStrength   = computeUSDStrength();
            S.dollarRegime  = computeDollarRegime();
          }
        }).catch(() => {});
```

**Replace with:**

```js
        ).then(data => {
          if (data) {
            S.ohlcData[sym] = data;
            // Recompute only — S.usdStrength will be read by render when needed.
            // Don't trigger a full renderAll here; the main renderAll below handles it.
            S.usdStrength  = computeUSDStrength();
            S.dollarRegime = computeDollarRegime();
          }
        }).catch(() => {});
```

> This is the same code — the real fix is the note to **not** call `renderAll()` inside the `.then()` if you ever add one. The existing pattern is fine. The real reduction is adding a guard in `computeT3()` to ensure it always reads `S.usdStrength` first:

In `macro.js` → `computeT3()`, this line already exists:
```js
  const usd = S.usdStrength || computeUSDStrength();
```
That is correct. No change needed there — the `||` guard already prevents redundant computation. The net fix is to **remove the import of `computeUSDStrength` from `render.js`** since `render.js` should never need to call it directly — it should always be in `S.usdStrength` by the time render runs.

**In `render.js`**, find:

```js
import { calculateTierScores, computeDollarRegime, computeUSDStrength } from './macro.js';
```

**Replace with:**

```js
import { calculateTierScores, computeDollarRegime } from './macro.js';
```

And find:

```js
  const usdStrength   = S.usdStrength  || computeUSDStrength();
```

**Replace with:**

```js
  const usdStrength   = S.usdStrength ?? null;
```

> If `S.usdStrength` is null at render time (e.g. only 1 USD pair loaded), the USD composite block in the render will gracefully show nothing — same as before, since `null` already has that fallback path.

---

## Fix 19 — `poorRR` Entries Should Be Size-Capped, Not Just Warned

**File:** `js/signal.js`

**The issue:** Entries with R:R below 1.0 show a `⚠` symbol but are otherwise treated identically to 2.2R trades. A 0.7R trade has negative expected value even with a 60% win rate. They should be filtered out of the entry scanner output, or at minimum hard-capped to 25% size.

**Find** the final filter/sort in `runEntryScanner()`:

```js
  return candidates
    .filter(c => c.totalStars >= 2 && c.direction != null)
    .sort((a, b) => {
      if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
      return a.distance - b.distance;
    });
```

**Replace with:**

```js
  return candidates
    .filter(c => c.totalStars >= 2 && c.direction != null)
    // Suppress entries with R:R below 0.8 — negative EV regardless of win rate.
    .filter(c => !c.rrRatio || parseFloat(c.rrRatio) >= 0.8)
    .map(c => {
      // Hard-cap size to 25% for sub-1.0R trades even if they pass the 0.8 floor.
      if (c.rrRatio && parseFloat(c.rrRatio) < 1.0) {
        return { ...c, size: Math.min(c.size, 25), poorRR: true };
      }
      return c;
    })
    .sort((a, b) => {
      if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
      return a.distance - b.distance;
    });
```

---

## Fix 20 — Regime Transition Size Reduction Is Silent

**File:** `js/signal.js` and `js/vol.js`

**The issue:** When `transitionRisk.riskScore > 70` (extended low-vol compression), position size is silently reduced by 20% inside `calcPositionSize()` in `vol.js`. The user sees a smaller size number on the entry card with no explanation.

**In `vol.js`** — no code change needed here. The reduction is correct. The fix is surfacing it in the entry card.

**In `js/signal.js`** → `runEntryScanner()`, find the section where `adjSize` is computed and tags are applied. After the event risk and session tags, add:

```js
    // Regime transition size reduction warning tag
    try {
      const bars = S.ohlcData[S.currentPair.symbol]?.values;
      if (bars && bars.length >= 30) {
        // Reconstruct trueRanges to check transition risk without a full re-import
        // (computeRegimeTransition is already in arma.js — import it at the top of signal.js)
        const rt = computeRegimeTransition ? computeRegimeTransition(
          [...bars].reverse().slice(1).map((b, i, arr) => {
            if (i === 0) return 0;
            const h = parseFloat(b.high), l = parseFloat(b.low), pc = parseFloat(arr[i-1].close);
            return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
          }).filter(v => v > 0)
        ) : null;
        if (rt && rt.riskScore > 70) {
          tags.push({ cls: 'warn', label: `Regime shock risk \u221220%`, key: 'regtrans' });
        }
      }
    } catch(e) {}
```

> **Note to Claude Code:** `computeRegimeTransition` is exported from `arma.js`. Add it to the import at the top of `signal.js`:
> ```js
> import { computeARMAForecast, computeRegimeTransition } from './arma.js';
> ```

---

## Fix 21 — `renderAll()` Needs a Debounce Guard

**File:** `js/main.js`

**The issue:** `renderAll()` can be called concurrently — `loadAndRenderCompass()` resolves async and triggers its own DOM updates while `refreshQuote()` has already called `renderAll()`. Adding a simple debounce prevents double-renders and any DOM mutation race during fast refreshes.

**Find** in `main.js`, after the import block, add this near the top of the file (before any `async function` declarations):

```js
// ── Debounced renderAll ───────────────────────────────────────────────────────
// Prevents concurrent DOM mutations from async refreshes firing renderAll
// in rapid succession (quote refresh + compass resolve within the same tick).
let _renderTimer = null;
const renderAllDebounced = () => {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => { _renderTimer = null; renderAll(); }, 80);
};
window.renderAllDebounced = renderAllDebounced;
```

Then in `refreshQuote()`, find the `renderAll()` call at the end:

```js
    renderAll();
    document.getElementById('upd').textContent = new Date().toLocaleTimeString();
```

**Replace with:**

```js
    renderAllDebounced();
    document.getElementById('upd').textContent = new Date().toLocaleTimeString();
```

> Leave the `renderAll()` call inside `loadAll()` (the initial full load) as-is — it should render immediately, not debounced. Only `refreshQuote()` gets the debounced version.

---

## Fix 22 — `OHLC5M` Cache TTL Is Too Long (18 Hours)

**File:** `js/config.js`

**The issue:** The 5m bar cache TTL is 18 hours. A user loading the page at 14:00 on a cached set from 09:00 gets 5-hour-stale 5m bars for Asia range calculation. The `refreshQuote()` stale-bar check (re-fetches if latest bar is >10 min old) only fires after the first 5-minute interval — so on a fresh page load mid-session, the initial render uses old bars. Reduce to 30 minutes so the initial load always fetches reasonably fresh data.

**Find:**

```js
  OHLC5M:   18 * 60 * 60 * 1000,
```

**Replace with:**

```js
  OHLC5M:   30 * 60 * 1000,  // 30 min — refreshQuote() handles within-session bar updates
```

---

## Round 2 Files Changed Summary

| File | Fixes applied |
|---|---|
| `js/arma.js` | 10 |
| `js/signal.js` | 11, 19, 20 |
| `js/macro.js` | 12, 13 |
| `js/ranges.js` | 14 |
| `js/utils.js` | 15, 16 |
| `js/main.js` | 17, 18, 21 |
| `js/render.js` | 18 |
| `js/config.js` | 22 |

---

## Round 2 Testing Checklist

- [ ] ARMA `skillPct` values are now plausible (0–30% range typical for yield spreads — not negative or >50%)
- [ ] ARMA BEARISH at HIGH confidence while signal is LONG shows as red `✗ conflicts` and deducts 1 pt
- [ ] Coherence bonus no longer fires when T7 is the marginal agreeing tier with score `+1`
- [ ] EUR/GBP and GBP/JPY: no `USD conflict` or `USD confirmed` tag in entry cards
- [ ] Monday range shows correct data when tested from a Sydney / Tokyo timezone browser
- [ ] Asia session bars include the first hour correctly during BST (May–October)
- [ ] Force Refresh clears the Macro Compass chart and it re-draws fresh on next load
- [ ] Sub-0.8R entries no longer appear in the entry scanner at all
- [ ] Sub-1.0R entries show size capped at 25% with a `poorRR` indicator
- [ ] When regime transition risk is HIGH (20+ days low vol), entry cards show `Regime shock risk −20%` tag
- [ ] Fast quote refreshes no longer cause visible DOM flicker (debounce working)
- [ ] On a fresh page load mid-afternoon, 5m bars are no more than 30 minutes stale

---

---

# Round 3 Fixes — Live Price, Candle Patterns, Proximity Alert

> These three fixes work together. Implement in order: Fix 23 (SSE stream) first, then Fix 24 (candle patterns), then Fix 25 (header + alert bar) which depends on both.
> Fix 23 touches `_worker.js` — run `node --check _worker.js` after editing.
> Fixes 24 and 25 are client-side only.

---

## Fix 23 — Oanda SSE Live Price Stream (replaces 5-min polling)

### What this does
Instead of polling every 5 minutes for a single price snapshot, the browser opens a persistent Server-Sent Events connection to the worker. The worker forwards Oanda's pricing stream tick-by-tick. The live quote updates in near real-time (sub-second) without hammering the API.

### New env var required
Add `OANDA_ACCOUNT_ID` to Cloudflare Pages → Settings → Environment Variables (both Production and Preview). Get the account ID from the Oanda fxTrade Account Management Portal — it looks like `101-004-1234567-001`.

---

### Part A — `_worker.js`: Add SSE stream route

Find the block of existing Oanda routes (around `/api/oanda_ohlc5m`). **After** that block, add:

```js
// ── /api/oanda_stream — SSE live price feed from Oanda pricing stream ─────────
// Browser opens EventSource('/api/oanda_stream?symbol=EUR_USD')
// Worker proxies Oanda's chunked stream as text/event-stream.
// Requires: OANDA_KEY, OANDA_ACCOUNT_ID, OANDA_ENV
if (path === '/api/oanda_stream') {
  if (!env.OANDA_KEY)        return err('OANDA_KEY not configured', 503);
  if (!env.OANDA_ACCOUNT_ID) return err('OANDA_ACCOUNT_ID not configured', 503);

  const symbol = url.searchParams.get('symbol');
  if (!symbol) return err('symbol param required', 400);

  // Convert dashboard symbol format to Oanda instrument format
  // EUR/USD -> EUR_USD, XAU/USD -> XAU_USD, NAS100_USD -> NAS100_USD
  const instrument = symbol.replace('/', '_');

  const oandaBase = env.OANDA_ENV === 'practice'
    ? 'https://stream-fxpractice.oanda.com'   // NOTE: different base URL for streaming
    : 'https://stream-fxtrade.oanda.com';

  const streamUrl = `${oandaBase}/v3/accounts/${env.OANDA_ACCOUNT_ID}/pricing/stream?instruments=${encodeURIComponent(instrument)}`;

  let oandaRes;
  try {
    oandaRes = await fetch(streamUrl, {
      headers: {
        'Authorization': `Bearer ${env.OANDA_KEY}`,
        'Accept-Datetime-Format': 'RFC3339',
      },
    });
  } catch(e) {
    return err(`Oanda stream connect failed: ${e.message}`, 502);
  }

  if (!oandaRes.ok || !oandaRes.body) {
    return err(`Oanda stream error (${oandaRes.status})`, 502);
  }

  // Pipe Oanda's NDJSON stream → SSE to browser
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Process each line from Oanda's chunked response
  const pump = async () => {
    const reader = oandaRes.body.getReader();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete last line in buffer
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const tick = JSON.parse(trimmed);
            // Oanda sends PRICE ticks and HEARTBEAT ticks
            if (tick.type === 'PRICE' && tick.bids?.[0] && tick.asks?.[0]) {
              const bid = parseFloat(tick.bids[0].price);
              const ask = parseFloat(tick.asks[0].price);
              const mid = (bid + ask) / 2;
              const payload = JSON.stringify({ price: mid, bid, ask, time: tick.time });
              await writer.write(encoder.encode(`data: ${payload}\n\n`));
            } else if (tick.type === 'HEARTBEAT') {
              // Send SSE comment to keep connection alive through proxies
              await writer.write(encoder.encode(`: heartbeat\n\n`));
            }
          } catch(e) { /* skip malformed lines */ }
        }
      }
    } catch(e) {
      // Stream closed by client or network error — clean exit
    } finally {
      writer.close().catch(() => {});
    }
  };

  pump(); // non-blocking — runs in background while response streams

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

---

### Part B — `js/main.js`: Open SSE connection and wire to quote state

**Add this function** after the `refreshQuote()` function:

```js
// ── Oanda SSE live stream ─────────────────────────────────────────────────────
// Opens a persistent EventSource connection. On each tick, updates the live
// quote in state and calls renderAllDebounced() so the header and entry
// scanner update without a full data reload.
let _sseSource = null;

function startLiveStream() {
  if (_sseSource) { _sseSource.close(); _sseSource = null; }

  const sym = S.currentPair.symbol;
  const symKey = sym.replace('/', '');
  const digits = getDigits(sym);

  _sseSource = new EventSource(`/api/oanda_stream?symbol=${encodeURIComponent(sym)}`);

  _sseSource.onmessage = (evt) => {
    try {
      const tick = JSON.parse(evt.data);
      if (!tick.price) return;

      // Update shared quote state
      window._latestQuote = { price: tick.price, bid: tick.bid, ask: tick.ask };
      localStorage.setItem(`quote_${symKey}`, JSON.stringify({
        data: { price: tick.price },
        timestamp: Date.now(),
      }));

      // Update header price display immediately (no full re-render needed)
      const el = document.getElementById('headerLivePrice');
      if (el) {
        el.textContent = tick.price.toFixed(digits);
        el.style.color = ''; // reset flash colour after update
      }

      // Check proximity alerts on every tick
      checkProximityAlerts(tick.price);

      // Debounced full render — updates entry scanner distances etc.
      if (typeof renderAllDebounced === 'function') renderAllDebounced();

    } catch(e) {}
  };

  _sseSource.onerror = () => {
    // On error, fall back to 5-min polling — SSE will auto-reconnect
    console.warn('SSE stream error — browser will auto-reconnect');
  };
}

// Call startLiveStream() when pair changes — close old stream, open new one
// Also expose to window so selectPair() can call it
window.startLiveStream = startLiveStream;
```

**In the `init()` function**, replace the existing `setInterval` with:

```js
async function init() {
  renderPairTabs();
  await loadAll();

  // Start live SSE stream (replaces 5-min polling for the quote)
  // Falls back gracefully — SSE auto-reconnects on error
  try {
    startLiveStream();
  } catch(e) {
    // SSE not supported or stream error — fall back to polling
    setInterval(() => refreshQuote(), 5 * 60 * 1000);
  }

  // Keep 5-min polling as fallback for 5m bar refresh even with SSE active
  setInterval(() => {
    // Only refresh bars, not the quote — SSE handles that
    refreshQuote(/* skipQuote= */ true);
  }, 5 * 60 * 1000);

  const sentinel = document.getElementById('stickysentinel');
  const header   = document.querySelector('.sticky-header');
  if (sentinel && header) {
    new IntersectionObserver(([e]) => header.classList.toggle('pinned', !e.isIntersecting)).observe(sentinel);
  }
}
```

**Update `refreshQuote()`** to accept a `skipQuote` flag:

Find the start of `refreshQuote()`:
```js
async function refreshQuote() {
  try {
    const symKey = S.currentPair.symbol.replace('/', '');
    const quote = await fetchAPI(`/api/quote?symbol=${encodeURIComponent(S.currentPair.symbol)}`);
```

Replace with:
```js
async function refreshQuote(skipQuote = false) {
  try {
    const symKey = S.currentPair.symbol.replace('/', '');
    let quote = window._latestQuote;
    if (!skipQuote || !quote) {
      quote = await fetchAPI(`/api/quote?symbol=${encodeURIComponent(S.currentPair.symbol)}`);
      localStorage.setItem(`quote_${symKey}`, JSON.stringify({ data: quote, timestamp: Date.now() }));
      window._latestQuote = quote;
    }
```

**In `window.selectPair`**, restart the stream when pair changes:

```js
window.selectPair = async function(index) {
  S.currentPair = PAIRS[index];
  document.querySelectorAll('.ptab').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
  // Restart live stream for new pair
  if (typeof startLiveStream === 'function') startLiveStream();
  await loadAll();
};
```

---

#c

### Part A — Add `detectCandlePatterns()` to `js/signal.js`

**Add this function** near the top of `signal.js`, after the EMA and candle confirmation helpers (from Fixes 3 and 4):

```js
// ── Candle pattern recognition ────────────────────────────────────────────────
// Reads last 5 closed 5m bars. Returns { name, emoji, direction, confidence,
// forecast, wickPct } or null if no pattern detected.
// 'direction' is the pattern's implied direction — may differ from level direction.
export function detectCandlePatterns(symbol) {
  const bars = S.ohlc5m?.[symbol]?.values;
  // bars[0] = current (possibly open), bars[1..5] = closed
  if (!bars || bars.length < 6) return null;

  const closed = bars.slice(1, 6).map(b => ({
    o: parseFloat(b.open),
    h: parseFloat(b.high),
    l: parseFloat(b.low),
    c: parseFloat(b.close),
    body: Math.abs(parseFloat(b.close) - parseFloat(b.open)),
    range: parseFloat(b.high) - parseFloat(b.low),
    bull: parseFloat(b.close) >= parseFloat(b.open),
  }));

  const [b1, b2, b3] = closed; // b1 = most recent closed

  if (!b1 || b1.range === 0) return null;

  const bodyPct  = b => b.range > 0 ? b.body / b.range : 0;
  const upperWick = b => b.range > 0 ? (b.h - Math.max(b.o, b.c)) / b.range : 0;
  const lowerWick = b => b.range > 0 ? (Math.min(b.o, b.c) - b.l) / b.range : 0;

  // ── Doji ──────────────────────────────────────────────────────────────────
  if (bodyPct(b1) < 0.10) {
    return {
      name: 'Doji', emoji: '\u271A',
      direction: 'neutral', confidence: 'low',
      forecast: 'Indecision at this level — wait for the next bar to commit direction before entering',
    };
  }

  // ── Hammer (bullish pin bar) ───────────────────────────────────────────────
  if (lowerWick(b1) >= 0.55 && upperWick(b1) <= 0.15 && bodyPct(b1) <= 0.35) {
    return {
      name: 'Hammer \u2014 Bullish Pin Bar', emoji: '\uD83D\uDD28',
      direction: 'long', confidence: 'high',
      forecast: `Lower wick ${Math.round(lowerWick(b1) * 100)}% of range \u2014 strong rejection of lows. Bounce likely if next bar closes above ${b1.h.toFixed(5)}`,
      wickPct: Math.round(lowerWick(b1) * 100),
    };
  }

  // ── Shooting Star (bearish pin bar) ───────────────────────────────────────
  if (upperWick(b1) >= 0.55 && lowerWick(b1) <= 0.15 && bodyPct(b1) <= 0.35) {
    return {
      name: 'Shooting Star \u2014 Bearish Pin Bar', emoji: '\uD83C\uDF20',
      direction: 'short', confidence: 'high',
      forecast: `Upper wick ${Math.round(upperWick(b1) * 100)}% of range \u2014 strong rejection of highs. Drop likely if next bar closes below ${b1.l.toFixed(5)}`,
      wickPct: Math.round(upperWick(b1) * 100),
    };
  }

  // ── Bullish Engulfing ──────────────────────────────────────────────────────
  if (b2 && !b1.bull && b2.bull === false && b1.bull &&
      b1.c > b2.o && b1.o < b2.c && b1.body > b2.body) {
    return {
      name: 'Bullish Engulfing', emoji: '\uD83D\uDFE2',
      direction: 'long', confidence: 'high',
      forecast: 'Buyers absorbed selling pressure and closed above prior bar open \u2014 momentum shift bullish',
    };
  }

  // ── Bearish Engulfing ──────────────────────────────────────────────────────
  if (b2 && b1.bull === false && b2.bull && !b1.bull &&
      b1.c < b2.o && b1.o > b2.c && b1.body > b2.body) {
    return {
      name: 'Bearish Engulfing', emoji: '\uD83D\uDD34',
      direction: 'short', confidence: 'high',
      forecast: 'Sellers absorbed buying pressure and closed below prior bar open \u2014 momentum shift bearish',
    };
  }

  // ── Morning Star (3-bar bullish reversal) ─────────────────────────────────
  if (b3 && b2 && !b3.bull && bodyPct(b2) < 0.35 && b1.bull && b1.c > (b3.o + b3.c) / 2) {
    return {
      name: 'Morning Star', emoji: '\uD83C\uDF05',
      direction: 'long', confidence: 'medium',
      forecast: '3-bar reversal pattern \u2014 indecision bar followed by bullish close past midpoint of prior red bar. Upside likely',
    };
  }

  // ── Evening Star (3-bar bearish reversal) ─────────────────────────────────
  if (b3 && b2 && b3.bull && bodyPct(b2) < 0.35 && !b1.bull && b1.c < (b3.o + b3.c) / 2) {
    return {
      name: 'Evening Star', emoji: '\uD83C\uDF06',
      direction: 'short', confidence: 'medium',
      forecast: '3-bar reversal pattern \u2014 indecision after rally then bearish close below midpoint. Downside likely',
    };
  }

  // ── Inside Bar ────────────────────────────────────────────────────────────
  if (b2 && b1.h <= b2.h && b1.l >= b2.l) {
    return {
      name: 'Inside Bar', emoji: '\u25A1',
      direction: 'neutral', confidence: 'low',
      forecast: 'Price compressing inside prior bar range \u2014 breakout imminent. Direction determined by which side breaks first',
    };
  }

  // ── Tweezer Bottom ────────────────────────────────────────────────────────
  if (b2 && Math.abs(b1.l - b2.l) / (b1.range || 1) < 0.05 &&
      !b2.bull && b1.bull) {
    return {
      name: 'Tweezer Bottom', emoji: '\uD83E\uDD9A',
      direction: 'long', confidence: 'medium',
      forecast: 'Two consecutive bars testing the same low \u2014 precise level rejection. Strong support at this price',
    };
  }

  // ── Tweezer Top ───────────────────────────────────────────────────────────
  if (b2 && Math.abs(b1.h - b2.h) / (b1.range || 1) < 0.05 &&
      b2.bull && !b1.bull) {
    return {
      name: 'Tweezer Top', emoji: '\uD83E\uDD9A',
      direction: 'short', confidence: 'medium',
      forecast: 'Two consecutive bars testing the same high \u2014 precise level rejection. Strong resistance at this price',
    };
  }

  // ── Three White Soldiers ──────────────────────────────────────────────────
  if (b3 && b2 && b1.bull && b2.bull && b3.bull &&
      bodyPct(b1) > 0.5 && bodyPct(b2) > 0.5 && bodyPct(b3) > 0.5) {
    return {
      name: 'Three White Soldiers', emoji: '\uD83D\uDFE2\uD83D\uDFE2\uD83D\uDFE2',
      direction: 'long', confidence: 'medium',
      forecast: '3 consecutive strong bullish bars \u2014 sustained buying pressure. Trend continuation likely',
    };
  }

  // ── Three Black Crows ─────────────────────────────────────────────────────
  if (b3 && b2 && !b1.bull && !b2.bull && !b3.bull &&
      bodyPct(b1) > 0.5 && bodyPct(b2) > 0.5 && bodyPct(b3) > 0.5) {
    return {
      name: 'Three Black Crows', emoji: '\uD83D\uDD34\uD83D\uDD34\uD83D\uDD34',
      direction: 'short', confidence: 'medium',
      forecast: '3 consecutive strong bearish bars \u2014 sustained selling pressure. Trend continuation likely',
    };
  }

  return null; // no pattern identified
}
```

---

### Part B — SVG mini candlestick renderer

**Add this function** immediately after `detectCandlePatterns()`:

```js
// ── SVG mini candlestick chart (last 5 closed bars) ──────────────────────────
// Returns an inline SVG string, ~80px wide × 40px tall, matching the dashboard
// dark/light theme via CSS variables.
export function renderCandleSVG(symbol, highlightPattern) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 6) return '';

  const closed = bars.slice(1, 6).reverse(); // chronological order for display
  const highs  = closed.map(b => parseFloat(b.high));
  const lows   = closed.map(b => parseFloat(b.low));
  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const range = maxH - minL || 0.0001;

  const W = 80, H = 40, PAD = 4;
  const chartH = H - PAD * 2;
  const barW = 10, barGap = 6;

  const toY = price => PAD + chartH * (1 - (price - minL) / range);

  const candles = closed.map((b, i) => {
    const o = parseFloat(b.open), c = parseFloat(b.close);
    const h = parseFloat(b.high), l = parseFloat(b.low);
    const bull = c >= o;
    const x = PAD + i * (barW + barGap) + barW / 2;
    const bodyTop    = toY(Math.max(o, c));
    const bodyBottom = toY(Math.min(o, c));
    const bodyH      = Math.max(1, bodyBottom - bodyTop);
    const colour = bull ? 'var(--green)' : 'var(--red)';
    const highlighted = highlightPattern && i === closed.length - 1 ? 'opacity:1' : 'opacity:0.85';
    return `
      <line x1="${x}" y1="${toY(h)}" x2="${x}" y2="${toY(l)}" stroke="${colour}" stroke-width="1" style="${highlighted}"/>
      <rect x="${x - barW/2}" y="${bodyTop}" width="${barW}" height="${bodyH}" fill="${colour}" rx="1" style="${highlighted}"/>
    `;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;flex-shrink:0" aria-hidden="true">
    ${candles.join('')}
  </svg>`;
}
```

---

### Part C — Wire candle pattern into entry cards in `renderEntryScanner()`

In the `entries.slice(0, 6).map(e => { ... })` loop inside `renderEntryScanner()`, **add these lines** right after `const tagsHtml = ...`:

```js
    // Candle pattern detection for this entry
    const pattern    = detectCandlePatterns(sym);
    const candleSVG  = renderCandleSVG(sym, !!pattern);
    const patternDir = pattern?.direction ?? null;
    const patDirMatch = patternDir === e.direction || patternDir === 'neutral';

    const patternHtml = pattern ? `
      <div style="display:flex;align-items:flex-start;gap:8px;background:var(--s2);border:1px solid var(--border);border-radius:6px;padding:7px 9px;margin-top:6px">
        ${candleSVG}
        <div style="min-width:0">
          <div style="font-size:11px;font-weight:600;color:${
            patternDir === 'long'    ? 'var(--green)' :
            patternDir === 'short'   ? 'var(--red)'   :
            'var(--amber)'
          };line-height:1.3">${pattern.emoji} ${pattern.name}</div>
          <div style="font-size:10px;color:var(--text2);line-height:1.4;margin-top:2px">${pattern.forecast}</div>
          ${!patDirMatch ? `<div style="font-size:9.5px;color:var(--amber);margin-top:3px">\u26A0\uFE0F Pattern direction conflicts with entry direction</div>` : ''}
        </div>
      </div>` : `
      <div style="display:flex;align-items:center;gap:8px;background:var(--s2);border:1px solid var(--border);border-radius:6px;padding:7px 9px;margin-top:6px">
        ${candleSVG}
        <div style="font-size:10px;color:var(--text3)">No pattern identified \u2014 review bars visually</div>
      </div>`;
```

Then **add `${patternHtml}`** inside the entry card div, between `ec-layers` and `ec-trade`:

```js
      <div class="ec-layers">${tagsHtml}</div>
      ${patternHtml}
      <div class="ec-trade">${confirmBanner}${tradeHtml}</div>
```

**Also update the `renderEntryScanner()` import line** at the top of `signal.js` (since `detectCandlePatterns` and `renderCandleSVG` are now in the same file, no import needed — just make sure both functions are defined before `runEntryScanner()`).

---

## Fix 25 — Sticky Header: Live Price + Current Candle + Proximity Alert Bar

This fix has three parts that all live inside the sticky header:

1. **Live price chip** — always visible in the header topbar, updates from SSE
2. **Current candle formation** — small pill showing the latest 5m pattern
3. **Proximity alert bar** — slides in above the pair tabs when price is within N pips of a top entry

---

### Part A — `index.html`: Add live price chip and candle pill to topbar

**Find** the topbar `<div class="live-pill">` block:

```html
  <div class="live-pill"><div class="live-dot"></div>Live</div>
  <span class="upd" id="upd"></span>
```

**Replace with:**

```html
  <div class="live-pill"><div class="live-dot"></div>Live</div>
  <div class="header-price-block" id="headerPriceBlock" style="display:none">
    <span class="header-pair-label" id="headerPairLabel"></span>
    <span class="header-live-price" id="headerLivePrice">—</span>
    <span class="header-candle-pill" id="headerCandlePill"></span>
  </div>
  <span class="upd" id="upd"></span>
```

**Add the proximity alert bar** — insert this **between** the `<!-- PAIR BAR -->` comment and `<div class="pair-bar">`:

```html
<!-- PROXIMITY ALERT BAR — hidden by default, shown by JS when price near a level -->
<div class="proximity-alert" id="proximityAlert" style="display:none">
  <div class="prox-inner" id="proximityAlertInner"></div>
</div>
```

---

### Part B — `css/index.css`: Add styles for all three components

**Append to the end of `index.css`:**

```css
/* ── Header live price block ─────────────────────────────────────────────── */
.header-price-block{display:flex;align-items:center;gap:7px;background:var(--s1);border:1.5px solid var(--border);border-radius:20px;padding:4px 12px;flex-shrink:0}
.header-pair-label{font-size:10px;font-weight:600;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:.06em;text-transform:uppercase}
.header-live-price{font-size:14px;font-weight:700;color:var(--text);font-family:'DM Mono',monospace;letter-spacing:.02em;min-width:70px;text-align:right}
.header-candle-pill{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600;white-space:nowrap}
.header-candle-pill.bull{background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)}
.header-candle-pill.bear{background:var(--red-bg);color:var(--red);border:1px solid var(--red-bd)}
.header-candle-pill.neutral{background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-bd)}

/* ── Proximity alert bar ─────────────────────────────────────────────────── */
.proximity-alert{
  margin-bottom:8px;
  border-radius:var(--r);
  border:1.5px solid var(--amber-bd);
  background:var(--amber-bg);
  overflow:hidden;
  animation:slideDown .25s ease;
}
.proximity-alert.urgent{border-color:var(--red-bd);background:var(--red-bg)}
.proximity-alert.confirmed{border-color:var(--green-bd);background:var(--green-bg)}
@keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.prox-inner{padding:8px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.prox-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px;white-space:nowrap;flex-shrink:0}
.prox-badge.long{background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)}
.prox-badge.short{background:var(--red-bg);color:var(--red);border:1px solid var(--red-bd)}
.prox-details{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;font-family:'DM Mono',monospace}
.prox-details span{color:var(--text2)}
.prox-details strong{color:var(--text)}
.prox-stars{font-size:11px;letter-spacing:1px}
.prox-pattern{font-size:11px;font-style:italic;color:var(--text2);flex:1;min-width:160px}
.prox-dismiss{margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;padding:2px 4px;flex-shrink:0}
.prox-dismiss:hover{color:var(--text)}
```

---

### Part C — `js/main.js`: Update header price and wire proximity alert

**Add this function** after `startLiveStream()`:

```js
// ── Update header live price + candle pill ────────────────────────────────────
function updateHeaderPrice(price) {
  const sym    = S.currentPair.symbol;
  const digits = getDigits(sym);

  const block = document.getElementById('headerPriceBlock');
  const label = document.getElementById('headerPairLabel');
  const el    = document.getElementById('headerLivePrice');
  const pill  = document.getElementById('headerCandlePill');

  if (!block || !el) return;
  block.style.display = 'flex';
  if (label) label.textContent = sym;
  if (el) el.textContent = price != null ? price.toFixed(digits) : '—';

  // Candle pattern pill — update from latest 5m bars
  if (pill && typeof detectCandlePatterns === 'function') {
    const pat = detectCandlePatterns(sym);
    if (pat) {
      const cls = pat.direction === 'long' ? 'bull' : pat.direction === 'short' ? 'bear' : 'neutral';
      pill.className = `header-candle-pill ${cls}`;
      pill.textContent = `${pat.emoji} ${pat.name.split(' \u2014')[0].split(' ')[0]} ${pat.name.split(' ').slice(1, 3).join(' ')}`;
      pill.style.display = '';
    } else {
      pill.style.display = 'none';
    }
  }
}

// ── Proximity alert ───────────────────────────────────────────────────────────
// Fires when price comes within ALERT_PIPS of a top-rated entry level.
// Threshold is configurable — default 10 pips (100 for NAS100, $10 for Gold).
const ALERT_PIPS_FX    = 10;
const ALERT_PIPS_GOLD  = 10;   // dollars
const ALERT_PIPS_NAS   = 30;   // index points
let _alertDismissed = null;    // price of last dismissed alert (don't re-show same level)

function checkProximityAlerts(price) {
  const sym    = S.currentPair.symbol;
  const pipSz  = typeof getPipSize === 'function' ? getPipSize(sym) : 0.0001;
  const digits = getDigits(sym);

  const thresh = sym === 'NAS100_USD' ? ALERT_PIPS_NAS * pipSz
               : sym.includes('XAU')  ? ALERT_PIPS_GOLD
               : ALERT_PIPS_FX * pipSz;

  const alertEl = document.getElementById('proximityAlert');
  const innerEl = document.getElementById('proximityAlertInner');
  if (!alertEl || !innerEl) return;

  // Get current top entries from last render (stored on window by renderEntryScanner)
  const entries = window._lastEntries || [];
  if (!entries.length) { alertEl.style.display = 'none'; return; }

  // Find the closest entry within threshold
  const near = entries
    .filter(e => Math.abs(e.price - price) <= thresh && e.direction != null)
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0];

  if (!near) { alertEl.style.display = 'none'; return; }

  // Don't re-show if user dismissed this level
  if (_alertDismissed != null && Math.abs(_alertDismissed - near.price) < thresh * 0.3) return;

  const pipDist  = Math.round(Math.abs(near.price - price) / pipSz);
  const unit     = sym === 'NAS100_USD' ? 'pts' : sym.includes('XAU') ? '$' : 'p';
  const starStr  = '\u2B50'.repeat(Math.min(7, near.totalStars)) + '\u2606'.repeat(Math.max(0, 7 - Math.min(7, near.totalStars)));
  const dirLabel = near.direction === 'long' ? '\u2191 BUY' : '\u2193 SELL';
  const dirCls   = near.direction === 'long' ? 'long' : 'short';

  // Candle pattern
  const pat = detectCandlePatterns(sym);
  const patHtml = pat
    ? `<span class="prox-pattern">${pat.emoji} ${pat.name.split(' \u2014')[0]} \u2014 ${pat.forecast.split('\u2014')[0].trim()}</span>`
    : '';

  // Urgency — within 3 pips = urgent
  const isUrgent    = pipDist <= 3;
  const isConfirmed = near.candleConfirmed === true;
  alertEl.className = `proximity-alert${isUrgent ? ' urgent' : isConfirmed ? ' confirmed' : ''}`;

  const slStr = near.sl    != null ? near.sl.toFixed(digits)    : '—';
  const tpStr = near.tp    != null ? near.tp.toFixed(digits)    : '—';
  const rrStr = near.rrRatio != null ? `1:${near.rrRatio}`      : '—';

  innerEl.innerHTML = `
    <span class="prox-stars">${starStr}</span>
    <span class="prox-badge ${dirCls}">\uD83D\uDCCD ${near.price.toFixed(digits)} ${dirLabel}</span>
    <div class="prox-details">
      <span>${pipDist}${unit} away</span>
      <span>SL <strong>${slStr}</strong></span>
      <span>TP <strong>${tpStr}</strong></span>
      <span>R:R <strong>${rrStr}</strong></span>
      ${near.size ? `<span>Size <strong>${near.size}%</strong></span>` : ''}
    </div>
    ${patHtml}
    <button class="prox-dismiss" onclick="window.dismissProxAlert(${near.price})" title="Dismiss">\u00D7</button>
  `;
  alertEl.style.display = '';
}

window.dismissProxAlert = function(levelPrice) {
  _alertDismissed = levelPrice;
  const alertEl = document.getElementById('proximityAlert');
  if (alertEl) alertEl.style.display = 'none';
};
```

**Wire `updateHeaderPrice` into the SSE `onmessage` handler** — in `startLiveStream()`, find:

```js
      // Update header price display immediately (no full re-render needed)
      const el = document.getElementById('headerLivePrice');
      if (el) {
        el.textContent = tick.price.toFixed(digits);
        el.style.color = '';
      }
```

Replace with:

```js
      // Update header price display immediately
      updateHeaderPrice(tick.price);
```

**Store entries for proximity checking** — in `renderSignalAndEntries()` in `signal.js`, after entries are computed:

```js
  const entries = runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime);
  window._lastEntries = entries; // expose for proximity alert checker in main.js
```

**Wire `updateHeaderPrice` on initial load** — in `loadAll()` after `renderAll()`:

```js
    renderAll();
    updateHeaderPrice(window._latestQuote?.price ?? null);
    updateStatus('ok', `...`);
```

**Wire `detectCandlePatterns` and `getPipSize` to `window`** — in `main.js` import block, add to window globals:

```js
// Add to the window globals section near the top of main.js
import { detectCandlePatterns } from './signal.js';
import { getPipSize, getDigits } from './utils.js';
window.detectCandlePatterns = detectCandlePatterns;
```

---

## New Env Var

| Variable | Purpose | Where to set |
|---|---|---|
| `OANDA_ACCOUNT_ID` | Required for SSE stream endpoint | Cloudflare Pages → Settings → Environment Variables (both Production and Preview scopes) |

---

## Round 3 Files Changed Summary

| File | Fixes applied |
|---|---|
| `_worker.js` | 23 (SSE stream route) |
| `js/main.js` | 23, 25 (stream client, header update, proximity alert) |
| `js/signal.js` | 24 (candle patterns, SVG renderer, wire into entry cards) |
| `index.html` | 25 (header price block, proximity alert bar HTML) |
| `css/index.css` | 25 (header price styles, proximity alert styles) |

---

## Round 3 Testing Checklist

- [ ] Add `OANDA_ACCOUNT_ID` to Cloudflare Pages env vars (both scopes) before deploying
- [ ] After deploy, open DevTools → Network — you should see a persistent `oanda_stream` request with `text/event-stream` content-type
- [ ] Header topbar shows pair name + live price (e.g. `EUR/USD  1.08472`) updating without page refresh
- [ ] Header shows candle pill (e.g. `🔨 Hammer`) when a pattern is detected on the active pair's 5m bars
- [ ] Each entry card shows a 5-bar SVG mini-chart + pattern name and forecast below the tags
- [ ] When no pattern: entry card shows the 5 bars unlabelled with "No pattern identified"
- [ ] Move to within 10 pips of a top entry (or temporarily lower `ALERT_PIPS_FX` to test) — amber alert bar slides in below the topbar
- [ ] Alert bar shows stars, level price, direction, SL/TP/R:R, and candle pattern
- [ ] Dismiss button (×) hides the alert and prevents it from re-appearing for the same level
- [ ] Alert turns red when within 3 pips; turns green when candle confirmation is present
- [ ] Switching pairs restarts the SSE stream and clears the proximity alert
