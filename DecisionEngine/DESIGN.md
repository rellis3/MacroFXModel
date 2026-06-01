# MacroFXModel — Decision Engine Design Document

## Objective

Transform MacroFXModel from a data dashboard into a probabilistic permission engine.

The system does not say "price will go up."  
It says "you are allowed to take long continuation trades under these conditions."

That distinction is where consistency comes from.

---

## What This Is Not

- Not a predictive system
- Not a signal generator
- Not a replacement for discretion at the entry level

## What This Is

A state machine that classifies current market conditions and outputs:

- A single strategy **mode** (no overlap allowed)
- **Trade permissions** (what types of trade are allowed right now)
- A **participation level** (how much capital to deploy)
- An **execution bias** (how to behave within permissions)
- A **risk multiplier** (feeds directly into position sizing)

---

## Architecture Overview

```
Existing Modules                    Decision Engine
────────────────────────────────    ──────────────────────────────────────
regime-v2.js         ──────────►  Step 1: Regime  → Base Mode + Permissions
volForecast.js       ──────────►  Step 2: Vol State → Participation modifier
vol.js / volForecast ──────────►  Step 3: Range Util → Permission gates
session timing       ──────────►  Step 4: Session Phase → Bias + timing
regime-confidence.js ──────────►  Step 5: Confidence → Final scaler
events.js            ──────────►  Step 0: Event gate → Hard override
cot.js               ──────────►  Step 5: COT extremes → Confidence modifier
                                           │
                                           ▼
                                    DecisionState output
                                           │
                        ┌──────────────────┼──────────────────┐
                        ▼                  ▼                  ▼
                   UI Banner        signal.js wire      backtest tagging
```

---

## File Structure

```
DecisionEngine/
├── DESIGN.md                  ← this file
├── decisionEngine.js          ← pure function, core modifier chain (no DOM, no side effects)
├── decisionInputs.js          ← collects + normalises inputs from existing modules
├── decisionUI.js              ← renders the permission banner in index.html
└── decisionBacktest.js        ← extends backtest-worker.js with decision tagging
```

---

## Inputs

All inputs are already computed by existing modules. Nothing new to fetch.

| Input | Type | Source | Notes |
|---|---|---|---|
| `regime` | `'BULL' \| 'BEAR' \| 'RANGE' \| 'TRANSITION'` | `regime-v2.js` pBull/pBear/pRange/pChop — highest probability wins. TRANSITION when max prob < 45% | Primary filter, highest priority |
| `volState` | `'COMPRESSION' \| 'NORMAL' \| 'EXPANSION' \| 'EXTREME'` | `vol.js` GARCH cluster + vol percentile vs trailing 60d | Never a directional signal — only affects participation |
| `rangeUtil` | `number` 0–2+ | `(sessionHigh - sessionLow) / volForecast.hl_median` | 1.0 = median complete, 1.25+ = exhaustion |
| `sessionPhase` | `'EARLY' \| 'MID' \| 'LATE'` | `tsToLondon()` elapsed fraction: <33% / 33–66% / >66% | Affects bias and add-on permission |
| `confidence` | `number` 0–1 | `regime-confidence.js` sizingMult (0.25 flux → 1.0 stable) | Final scaler — handles all grey-area cases |
| `eventRisk` | `{ level: 'high' \| 'medium' \| 'low' \| 'none', label: string }` | `events.js` eventRisk — already computed | Hard gate — HIGH forces NO_TRADE |
| `cotPercentile` | `number` 0–1 or `null` | `cot.js` net speculative position vs trailing 52-week range | Extreme positioning (>0.9 or <0.1) modifies confidence |

---

## The Modifier Chain

The chain always produces an output. NO_TRADE is an explicit result, not a fallback.

### Step 0 — Event gate (hard override, runs first)

```javascript
if (eventRisk.level === 'high') → NO_TRADE (reason: "High-impact event within 4h")
if (eventRisk.level === 'medium') → cap confidence at 0.5
```

Rationale: FOMC/NFP/CPI within 4h invalidates all regime signals. This is the single most
valuable addition — it stops trading into known binary risk events.

---

### Step 1 — Regime sets base mode and base permissions

Regime is the highest-priority input. Nothing overrides it except the event gate.

| Regime | Mode | Long | Short | Breakout | Fade |
|---|---|---|---|---|---|
| BULL | TREND_CONTINUATION | ✓ | ✗ | ✓ | ✗ |
| BEAR | TREND_CONTINUATION | ✗ | ✓ | ✓ | ✗ |
| RANGE | MEAN_REVERSION | ✓ | ✓ | ✗ | ✓ |
| TRANSITION | BREAKOUT | ✗ | ✗ | ✓ | ✗ |

Default: newEntry=true, addOn=false, participation=FULL, riskMult=1.0

---

### Step 2 — Vol state modifies participation level

Vol is never a directional signal. It only adjusts how much to participate.

| Vol State | Condition | Effect |
|---|---|---|
| EXTREME | Any | No new entries, participation=MINIMUM, riskMult×0.5 |
| EXPANSION | Mode=MEAN_REVERSION | Fades dangerous — switch to BREAKOUT mode, riskMult×0.75 |
| COMPRESSION | Mode=TREND_CONTINUATION | Coiling before continuation — enable breakout entry style |
| NORMAL | Any | No modification |

---

### Step 3 — Range utilisation gates specific trade types

This layer prevents chasing extended moves.

| Range Util | Condition | Effect |
|---|---|---|
| >1.5 | Any | EXHAUSTION — no new entries, exit priority, participation=MINIMUM |
| >1.25 | Mode=TREND_CONTINUATION | POSITION_MANAGEMENT — hold only, no new entries, participation=REDUCED |
| >1.0 | fade=true | Fade allowed only on confirmed rejection, not anticipation |
| <0.5 | fade=true | Too early to fade — disable fades, session hasn't shown direction |

Critical resolution (the Case 1/3 conflict from ChatGPT spec):  
Trend + rangeUtil >1.25 → POSITION_MANAGEMENT, not MEAN_REVERSION.  
Regime wins; range util only gates entries, not strategy direction.

---

### Step 4 — Session phase adjusts bias and add-on permission

| Session Phase | Mode | Effect |
|---|---|---|
| EARLY | TREND_CONTINUATION | addOn=true, bias="Join movement on pullbacks — do not predict exhaustion" |
| MID | TREND_CONTINUATION | addOn=false, bias="Do not chase — manage existing exposure" |
| LATE | Any | breakout=false, addOn=false, cap participation to REDUCED |
| LATE | MEAN_REVERSION | bias="Fade confirmed extremes only" |

---

### Step 5 — Confidence scales participation (handles all grey-area states)

This is why the case matrix doesn't need to cover every combination —
confidence handles ambiguous states without naming them.

| Confidence | Effect |
|---|---|
| <0.3 | NO_TRADE — regime unreadable |
| 0.3–0.5 | REDUCED, addOn=false, riskMult×0.5 |
| 0.5–0.7 | participation capped to REDUCED if currently FULL, riskMult×0.75 |
| >0.7 | FULL, riskMult scales linearly 0.75→1.25 |

COT modifier applied here: if cotPercentile >0.9 or <0.1 (extreme positioning),
confidence receives a +0.1 bonus when COT aligns with regime direction, or
-0.15 penalty when COT conflicts with regime direction.

---

## Output — DecisionState

```javascript
{
  // Core outputs
  mode:          string,   // 'TREND_CONTINUATION' | 'MEAN_REVERSION' | 'BREAKOUT'
                           // 'POSITION_MANAGEMENT' | 'EXHAUSTION' | 'NO_TRADE'

  participation: string,   // 'FULL' | 'REDUCED' | 'MINIMUM' | 'NO_TRADE'

  permissions: {
    long:     boolean,     // long entries permitted
    short:    boolean,     // short entries permitted
    breakout: boolean,     // breakout entries permitted
    fade:     boolean,     // fade/reversal entries permitted
    newEntry: boolean,     // any new position permitted
    addOn:    boolean,     // adding to existing position permitted
  },

  // Execution guidance
  riskMult:  number,       // 0 | 0.5 | 0.75 | 1.0 | 1.25 — plugs into position sizing
  bias:      string,       // human-readable execution instruction
  reasons:   string[],     // why any permissions were restricted

  // Metadata
  inputs: { regime, volState, rangeUtil, sessionPhase, confidence },  // echo for display
}
```

---

## Participation Spectrum

NO_TRADE is not the default fallback. The chain always resolves to one of:

| Level | Meaning | Trigger |
|---|---|---|
| FULL | All permitted types open, normal sizing | confidence >0.7, no flags |
| REDUCED | Permitted types open, 50–75% size | confidence 0.3–0.7 OR mid/late session OR rangeUtil warning |
| MINIMUM | Exit management only, no new entries | EXTREME vol OR rangeUtil >1.5 |
| NO_TRADE | Explicit off state | confidence <0.3 OR high-impact event in window |

---

## UI — Permission Banner

New top-level component on `index.html`, rendered before the existing signal card.

```
┌─────────────────────────────────────────────────────────────────┐
│  MODE: TREND CONTINUATION          PARTICIPATION: FULL          │
│  EUR/USD · Bull · Normal Vol · Range 67% · London Mid Session   │
├─────────────────────────────────────────────────────────────────┤
│  LONG ✓   SHORT ✗   BREAKOUT ✓   FADE ✗   ADD-ON ✓            │
├─────────────────────────────────────────────────────────────────┤
│  BIAS: Join movement on pullbacks — do not predict exhaustion   │
│  RISK: 1.0×  ████████████░░░░  Range 67% of median             │
└─────────────────────────────────────────────────────────────────┘
```

The range utilisation meter sits inside the banner:
- 0–50%: green (early, under-expanded)
- 50–100%: blue (normal)
- 100–125%: amber (mature, caution)
- 125–150%: orange (exhaustion zone)
- 150%+: red (extreme)

---

## Backtesting Integration

### What gets tagged on each trade

```javascript
trade.decisionMode          = state.mode
trade.decisionParticipation = state.participation
trade.decisionRiskMult      = state.riskMult
trade.rangeUtilAtEntry      = inputs.rangeUtil
trade.sessionPhaseAtEntry   = inputs.sessionPhase
trade.volStateAtEntry       = inputs.volState
```

### Extension to computeRegimeBreakdown()

Two new groupStats dimensions added to the existing breakdown:

```javascript
decisionMode:          groupStats(t => t.decisionMode),
decisionParticipation: groupStats(t => t.decisionParticipation),
```

### What this proves

The backtest validates the filter, not the signal. The proof is:

> FULL participation → higher expectancy than REDUCED → higher than MINIMUM

If TREND_CONTINUATION and BREAKOUT modes show positive avgR and NO_TRADE states
would have been negative, the filter is validated.

### Backtestable inputs (price-derivable)

| Input | Backtestable | Method |
|---|---|---|
| Regime | Yes | HMM from price history |
| Vol state | Yes | GARCH cluster from price bars |
| Range utilisation | Yes | Session H/L vs volForecast.hl_median |
| Session phase | Yes | tsToLondon() elapsed fraction |
| Confidence (~80%) | Yes | HMM certainty + GARCH + Hurst (all price-derived) |
| FRED macro data | No (first pass) | Historical yields/VIX not stored — skip |
| COT historical | No (first pass) | Not stored — skip |

First backtest pass uses price-derivable inputs only. That covers the core filter logic.

---

## Build Order

| Step | File | What it does | Depends on |
|---|---|---|---|
| 1 | `decisionEngine.js` | Pure modifier chain function — no DOM | Nothing |
| 2 | `decisionInputs.js` | Reads from S.* and normalises to engine input shape | Step 1 |
| 3 | `decisionUI.js` | Renders the permission banner | Steps 1–2 |
| 4 | Wire into `signal.js` | Call engine on each signal refresh, pass to UI | Steps 1–3 |
| 5 | `decisionBacktest.js` | Tag trades, extend computeRegimeBreakdown() | Step 1 |
| 6 | Add breakdown table to `backtest.html` | Display per-mode expectancy | Step 5 |

---

## What Stays as Display Only (Not Wired Into Engine)

These are informational context — useful for the trader, but they inform execution
timing (discretion layer), not the permission state.

- T1–T8 individual tier scores (already rolled up into Bayesian score → feeds regime)
- VuManChu divergence (entry timing within permitted trade types)
- OI / gravity levels (entry price, not trade permission)
- Compass fair value / Kalman deviation (execution context)
- ARMA/ARIMA (already inside regime-confidence.js)

---

## Key Design Principles

1. **Regime is king** — nothing overrides regime except a live event gate
2. **Vol modifies participation, never direction** — vol is a timing/sizing input only
3. **NO_TRADE is explicit, not a fallback** — the chain always resolves to something
4. **Confidence handles grey areas** — no need to enumerate all 64 state combinations
5. **Discretion lives in execution, not permission** — human judgment on entry timing, not strategy mode
6. **The filter is the edge** — you are not predicting better, you are eliminating invalid trades before they happen

---

## Implementation Status

### What was built

All core phases are implemented and wired.

| File | Status | Notes |
|---|---|---|
| `DecisionEngine/decisionEngine.js` | ✅ Complete | Pure modifier chain, no DOM, no side effects |
| `DecisionEngine/decisionInputs.js` | ✅ Complete | Reads S.* state, normalises to engine input shape |
| `DecisionEngine/decisionUI.js` | ✅ Complete | Full permission banner with range util meter, risk bar, reason chips |
| `DecisionEngine/decisionBacktest.js` | ✅ Complete | Price-only derivation (DM ratio, ATR percentile, session H/L) |
| `js/render.js` | ✅ Wired | Decision banner rendered in main view; compact bar above Level Map |
| `js/signal.js` | ✅ Wired | Decision bar above entry scanner; per-entry ✓/✗ PERMITTED chip |
| `js/backtest-worker.js` | ✅ Wired | Trades tagged with decisionMode, participation, riskMult, volState, sessionPhase |
| `js/backtest.js` | ✅ Wired | Breakdown table shows Decision Engine section (mode / participation / session) |
| `js/alerts.js` | ✅ Wired | Telegram message includes gate line: ✅ PERMITTED / ❌ NOT PERMITTED + mode + risk |

### Key decisions made during build

**Modifier chain over lookup table.** ChatGPT's spec used a case matrix that caused most conditions
to default to NO_TRADE. Replaced with a 5-step modifier chain where NO_TRADE only fires explicitly
(confidence <0.3 or high-impact event). All other states resolve to a meaningful participation level.
This was the single most important architectural change.

**Regime wins the Case 1/3 conflict.** When regime=TREND and rangeUtil>1.25, the result is
POSITION_MANAGEMENT (hold only, no new entries) — not MEAN_REVERSION. Regime sets direction;
range utilisation only gates whether new entries are permitted, not which direction is correct.

**Confidence scaler eliminates the 64-case enumeration.** With 4 regimes × 4 vol states × 4
range util buckets × 4 session phases, a lookup table would need 256 rows. The confidence scaler
collapses all ambiguous states into a continuous 0–1 value that drives participation level linearly.
No hard-coded case for every combination.

**Price-only backtest derivation.** Live inputs use FRED macro, COT, and event risk which don't
exist in historical bar data. Backtest uses: DM ratio from last 20 5m bars for regime, bar TR
percentile for vol state, session H/L vs ATR×1.5 for range utilisation. This gives ~80% coverage
of the live engine without requiring macro history.

**COT modifier is gracefully optional.** `deriveCotPercentile` in decisionInputs.js reads
`cot.netSpeculative` and `cot.history` from S.cotData. These field names have not been verified
against the _worker.js COT parser. The function returns null if fields are absent — engine runs
normally without it, COT modifier simply doesn't fire.

**Signal scores kept independent.** Existing HMM signal scores, Bayesian continuation probability,
regime confidence, and grade (A/B/C/CAUTION/TAKE/WATCH) were not changed. The decision engine
is a parallel gate, not a replacement for signal quality measurement.

---

## Future Work

### Phase 2 — Beta to Risk

AUD/JPY has ~1.8× beta to VIX. USD/CHF ~-0.9×. During EXPANSION vol, high-beta pairs move
disproportionately — continuation entries carry hidden gamma risk.

Implementation: rolling 20-day correlation of pair daily returns vs VIX daily returns. If
`|correlation| > 0.5` and volState = EXPANSION, cap participation to REDUCED regardless of regime.
Pairs file defines beta tier per symbol. ~50 lines added to `decisionInputs.js`.

Not built yet because: the core filter needs validation first. Adds complexity before the
base case is proven by backtest.

### Phase 3 — Combined Execution Score

Currently: signal scores (HMM, Bayesian, grade) and the decision engine run in parallel.
Neither drives the other.

Future: the decision engine's riskMult should feed into the signal score as a multiplier gate.
Concretely: `effectiveScore = signalScore × riskMult` where riskMult comes from DecisionState.
A 90% signal score at riskMult=0.5 (REDUCED) becomes effectively 45% — this maps to a different
grade band and changes the TAKE/WATCH/CAUTION verdict.

This closes the loop: decision engine conditions feed trade quality, which feeds execution policy.
Link point is `gradeEntry()` in `trade-grade.js` — accept an optional `decisionRiskMult` param.

### Phase 4 — Alert Suppression for NOT PERMITTED Directions

Currently: Telegram alerts fire for all entries that hit proximity regardless of decision state.
The message includes the ✅/❌ gate line so the trader can see it — but the alert still fires.

Future: suppress Telegram alert entirely (or downgrade to info-only) when the entry direction
is NOT PERMITTED. This prevents alert fatigue from levels that are technically valid setups but
the decision engine has blocked.

Implementation: inside `checkAlerts()` in `alerts.js`, after fetching `cached.decisionState`,
check `permitted = isLong ? ds.permissions.long : ds.permissions.short` before calling
`sendTelegramAlert`. If `!permitted && cfg.suppressBlockedAlerts`, skip the send.

Requires a new config option in the alert modal: "Suppress NOT PERMITTED alerts".

### Phase 5 — COT Historical Backtest

COT data is currently unavailable in backtest because we don't store weekly COT history in the
worker. To include COT confidence modifier in backtests:

1. Worker fetches historical CFTC COT data and stores weekly net speculative positions in KV
2. `decisionBacktest.js` looks up COT for the bar's date → percentile vs trailing 52 weeks
3. Full confidence modifier runs including COT signal

Low priority: the COT modifier is ±0.1/0.15 on confidence. Effect on P&L is likely small.
High-impact events and regime are the dominant filter factors.

### Phase 6 — Automated Execution Gate (Longer Term)

If the system were to drive automated orders rather than discretionary alerting:

The gate logic would be:
1. Decision engine produces DecisionState
2. Price hits entry level
3. `ds.permissions[direction] === true` → order eligible
4. `ds.riskMult` feeds position sizing formula
5. `ds.participation === 'NO_TRADE'` → no order, regardless of signal score

This requires a separate execution module, broker API wiring, and a fully validated
backtest P&L proving the filter adds positive expectancy before enabling it.
