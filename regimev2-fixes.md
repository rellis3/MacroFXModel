# RegimeV2 Bot — Backtester Findings & Pending Bot Fixes

Generated: 2026-06-06
Source: Discoveries made during `regime-backtest.html` build & testing session.

---

## Fix 1 — Composite Score Formula Was Incomplete

### Problem
The composite `score` (0–100) used to gate entries was only computing three of the
six intended components:

```
score = hmmC * 0.55 + volC * 0.25 + sessionMult * 100 * 0.20
```

`bocpd`, `slope`, and `adxZ` were all being **computed but never included** in the
score. This meant `entry_score_min = 62` was not a meaningful multi-signal filter —
it was almost entirely determined by HMM confidence and session quality, which are
already separate gates. The score gate was redundant rather than additive.

**Effect:** Too many trades passed through (10,734 over the test window). Raising
`entry_score_min` had diminishing returns because the score ceiling for a good-
confidence London-session bar was already ~70 regardless of BOCPD instability or
slope direction.

### Fix Applied in Backtester (`regime-backtest.html` line ~1654)

```javascript
// Regime structural stability: penalise high BOCPD (regime in flux)
const bocpdStab = Math.max(0, 100 - bocpd);

// Slope direction match: does momentum agree with regime direction?
const slopeMatch = (regime === 'BULL' && slope > 0) || (regime === 'BEAR' && slope < 0);
const slopeC = slopeMatch ? Math.min(100, Math.abs(slope) * 8) : 0;

// ADX strength: raw ADX confirms a real trend (not just HMM-labelled)
const adxC = Math.min(100, adx[i] * 4);

// Composite: HMM conf 40%, vol 15%, session 15%, BOCPD stability 15%, slope match 10%, ADX 5%
const score = Math.min(100,
  hmmC      * 0.40 +   // HMM confidence (directional certainty)
  volC      * 0.15 +   // Volatility stability
  sessionMult * 100 * 0.15 +  // Session quality (London/NY > Asia/Thin)
  bocpdStab * 0.15 +   // Regime structural stability (penalise high BOCPD)
  slopeC    * 0.10 +   // Slope direction agreement with regime
  adxC      * 0.05     // ADX trend strength confirmation
);
```

### Action Required in Railway Bot
- Locate the `score` calculation in the Python bot codebase (look for `score=` in
  the RGV2 log output path — it's computed before the `[RGV2] [INFO] [...] reg=...
  score=XX` log line).
- Apply the same six-component weighting above.
- BOCPD stability, slope direction match, and ADX contribution are all values
  already available at the point the score is computed.

---

## Fix 2 — BOCPD Not Used as an Entry Gate (Only as Exit Gate)

### Problem
BOCPD (Bayesian Online Change Point Detection) measures the probability that the
price structure has just experienced a regime break. In the bot and backtester,
BOCPD was wired as an **exit** gate only — if BOCPD stays above `bocpd_thresh`
for `bocpd_exit_bars` consecutive bars, the position closes.

It was never checked at **entry**. This means the bot can open a trade at the
exact moment a structural break is in progress — the worst possible time to enter,
since the regime that justified the trade may be ending.

### Fix Applied in Backtester (`simulateV2` entry block)

```javascript
// Block entry if regime is structurally unstable (high change-point probability)
const okBocpd = sig.bocpd < 55;
```

Threshold of 55 means: if BOCPD is above 55% the regime is in active transition —
skip the entry. The exit gate still fires at `bocpd_thresh` (default 78%) for
open positions, which is a higher bar because we want to ride small breaks.

### Action Required in Railway Bot
- Add a BOCPD check to the entry condition block (wherever `entry_conf`,
  `vol_z_max`, `entry_decay_max` are evaluated).
- Suggested threshold: `bocpd < 55` (configurable, expose as `entry_bocpd_max`).
- This is separate from and in addition to the existing `bocpd_thresh` exit gate.

---

## Fix 3 — No Slope Direction Agreement Gate at Entry

### Problem
The HMM can label a regime as BULL while the 3-bar momentum slope is negative
(price decelerating or reversing). In a live trend-following context this is a
contradictory signal — the model believes BULL but short-term momentum disagrees.
There was no gate to prevent entering on these contradicted setups.

### Fix Applied in Backtester (`simulateV2` entry block)

```javascript
// Require slope momentum to agree with regime direction
const okSlope = (sig.regime === 'BULL' && sig.slope > 0)
             || (sig.regime === 'BEAR' && sig.slope < 0);
```

`sig.slope` is the 3-bar change in the linear-regression trend value (scaled ×1000).
A positive slope for BULL means trend acceleration is in the right direction.

### Action Required in Railway Bot
- At the entry decision point, add a slope direction agreement check.
- The slope value is already computed and logged (`slope=XX` in the RGV2 state log).
- Suggested: require `slope > 0` for LONG, `slope < 0` for SHORT. Can be toggled
  with a boolean flag `require_slope_agree` (default true).

---

## Context: Where the Score Is Computed

The JavaScript files in this repo (`hmm5m-v2.js`, `js/regime-v2.js`) are the
**dashboard frontend only**. They display regime data from the Railway bot but do
not execute trades.

The actual score computation and entry logic lives in the **Railway Python bot**.
The server.js regex confirms what the bot logs:

```
reg=BULL  conf=73%  slope=+2.1  vz=0.8  rl=12  bocpd=31.4%  exh=0.6  decay=0.18  score=68
```

All the raw values (slope, bocpd, exh, adxZ) are computed in the bot and available
at the point the score is assembled — the fix is a formula change, not a new
data-pipeline change.

---

## Summary Checklist

| # | Fix | Backtester | Railway Bot |
|---|-----|-----------|-------------|
| 1 | Score formula includes BOCPD stability + slope match + ADX (6 components) | ✅ Done | ⬜ Pending |
| 2 | BOCPD entry gate (`bocpd < 55` blocks entry mid-transition) | ✅ Done | ⬜ Pending |
| 3 | Slope direction agreement gate at entry | ✅ Done | ⬜ Pending |

---

## Suggested Config After Fixes

With the richer score formula, `entry_score_min = 62` now does real filtering.
Recommended starting config:

| Parameter | Value | Notes |
|---|---|---|
| entry_conf | 73 | |
| entry_score_min | 62 | Meaningful now — previously needed 70+ to compensate |
| entry_decay_max | 0.20 | Only fresh regimes |
| entry_bocpd_max | 55 | New gate (Fix 2) |
| require_slope_agree | true | New gate (Fix 3) |
| sl_atr_mult | 2.0 | ATR(70 M1) × 2.0 |
| conf_floor | 52 | Exit if model loses conviction |
| drop_thresh | 10 | Exit on 10pt confidence drop |
| bocpd_thresh | 78 | Exit gate (existing, unchanged) |
| decay_exit | 0.80 | Last-resort staleness exit |
| hold_score_min | 45 | |
| score_drop_exit | 22 | |
| mfe_min_r | 1.5 | Don't protect until 1.5R in profit |
| mfe_retrace_pct | 0.45 | Allow 45% retrace before locking in |
| post_exit_cooldown | 30 | 30-minute pause (quality buffer, not blunt throttle) |
