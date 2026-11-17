# Desk Bias Process: a systematic-discretionary daily bias, scored head to head (spec v1)

Owner, 2026-11-17: after the data, backtest and hypothesis results came back NULL, build "an approach to bias which is
repeatable across all assets with different data, but gives a consistent output to compete against Max, FundaBias and
any other institutional bias models", "a more system discretionary build which we can be confident and comfortable
with".

**Who decides:** "System and AI, don't need my override, if the input is always the same structure into the AI". The
rules produce the call; an AI analyst may accept it or override it with a written reason. It always receives the same
structured input pack in the same format. There is no human step.

## Why this and not another predictor

Every direction test came back near the base rate:
- bias-learner, the multi-timeframe learners and the h4 rule;
- the macro blend;
- `bias-engine-backtest`: no skill at 1, 5 or 20 days.

Max (5 weeks of signals) and FundaBias (no published record) have no proof either. Confidence therefore comes from:
1. the **same process** every day for every market;
2. **known reasons** for every call;
3. a **fixed trade rule**;
4. an **honest forward record against the competitors on the same days**.

The process improves only from that record (versioned rule changes), never from hindsight.

## The process (identical for every market; layers a market lacks are marked n/a, never guessed)

| # | Layer | Reads | Source |
|---|---|---|---|
| 1 | **Event state** | tier-1 release today for this market's currencies before 16:00 London → PRE-EVENT; the day after a tier-1 release → POST-EVENT | calendar (`calendar_events`, FF week) |
| 2 | **Regime** | risk score R (on/off), vol regime (σ vs its own year: calm / normal / high), dollar-smile side for USD markets | bias engine risk block, the vol lines, VIX |
| 3 | **Macro** | the bias engine's market score and its drivers (policy, rates, data, real yield, positioning, risk role, commodity) **excluding its trend driver** | `/api/bias-engine` |
| 4 | **Structure** | W1, D1 and H4 trend (EMA20 slope sign), plus the last *confirmed* D1 swing high/low (fractal confirmed 2 bars later, never forward-looking) and whether price is above or below it (break of structure) | OANDA D/W/H4 |
| 5 | **Positioning** | COT crowding (contrarian), already a driver in layer 3; shown separately as a warning flag when crowded | `/api/cot-state` |
| 6 | **Day range** | today's p50 and p75 range lines | the shipped vol lines (validated) |

### Call rules (the "system call", deterministic)

- **PRE-EVENT** → NEUTRAL (reason "tier-1 release pending").
- **Macro side** = sign of the engine score when |score| ≥ 0.3, else none.
- **Structure side** = the D1 trend sign, if D1 and H4 agree, or if D1 agrees with the break-of-structure side; else none.
- **Directional call** only when macro side and structure side **agree**. Disagreement → NEUTRAL ("macro and structure
  conflict"). Either missing → NEUTRAL.
- **Conviction 1–5:**
  - 2 for agreement;
  - +1 if W1 agrees;
  - +1 if |engine score| ≥ 0.8;
  - +1 if regime supports it (risk-on with a pro-risk side, risk-off with a haven side);
  - −1 if COT is crowded on the same side;
  - clamp 1–5.
- **Invalidation:** the last confirmed D1 swing low (Bullish) or high (Bearish). If none is within 3σ_day, entry ± 1.5σ_day.
- **Expression (FX):** the pairs where both legs' currency scores point the same way are marked "cleanest".

### The AI step (fixed contract)

- **Input:** one JSON pack per market with exactly the layers above, the system call, the conviction, the invalidation,
  and the last 5 days of this process's calls for the market with their outcomes. The same keys every day; missing data
  is `null` with its reason.
- **Model:** the desk's existing `callModel` (`js/deskRun.js`), lowest temperature, one fixed system prompt (versioned
  `process-ai-v1`).
- **Output** (validated; a retry on an invalid reply, then fall back to the system call):

  ```json
  { "decision": "ACCEPT" | "OVERRIDE", "dir": "BULLISH" | "BEARISH" | "NEUTRAL", "conviction": 1-5,
    "reason": "≤ 2 sentences citing pack fields only", "invalidation": number | null }
  ```

- **Rules for the AI:**
  - It may only use the pack, never outside knowledge or news.
  - It may override only with a reason tied to pack fields (e.g. a crowded COT against the call, event risk later
    today, a range already used).
  - It may not invent levels.
- **The published call** is the AI's. The system call is kept beside it, so both are scored.

## Output (one card per market, every weekday, write-once at 07:30 London after the bias engine issue)

```json
{ "version": "desk-bias-process-v1", "date": "...", "market": "XAUUSD",
  "call": { "dir": "BEARISH", "conviction": 3, "by": "ai-accept", "invalidation": 4135.2 },
  "system": { "dir": "BEARISH", "conviction": 3, "rule": "macro and structure agree; W1 agrees" },
  "ai": { "decision": "ACCEPT", "reason": "..." },
  "layers": { "event": {...}, "regime": {...}, "macro": {...}, "structure": {...}, "positioning": {...}, "range": {...} } }
```

KV `desk_bias_process_<date>` plus an index. `GET /api/desk-bias-process` (`?date=`, `?market=`). Register the keys,
a service flag, and the deskSnapshot / infoMap entries.

## Head to head (forward only; nothing back-issued)

**Competitors**, each on the same markets and days, at the time it was knowable:

| Competitor | How it is recorded |
|---|---|
| **process-ai** (the published call) | issue job |
| **process-system** (the rules alone) | issue job |
| **Max** | Signal Copier first signal per market per day; side only |
| **FundaBias** | the owner (or anyone) logs its score per market (direction + n/10) on a small form; `POST /api/fundabias-log`, owner-only, write-once per market per day, time-stamped |
| **AI desk ratings** | desk run |
| **Bias engine alone** | engine issue |
| **h4-trend** | rule |

**Scoring**, by `scripts/bias-scoreboard/score.mjs` plus a new head-to-head view:
1. Hit rate against the point-in-time base rate (same day to 21:00, and to the next 07:00).
2. **R under one fixed trade rule for everyone:**
   - enter at the call time;
   - stop at the competitor's invalidation if it gave one, else 1 σ_day;
   - exit when the side flips or goes Neutral, at the stop, or Friday 21:00;
   - real spread.
3. Calibration: hit rate by conviction.
4. Neutral share.
5. For process-ai only: the **override record** (did overriding beat the system call on those days?).

**Judgement:** a running table, with intervals, from day 1. A formal verdict at 60 and 120 shared days (as the
bias-scoreboard prereg). The record decides which competitor the desk trusts on which market.

## Weekly review (the "learn from misses" loop, forward data only)

A page lists the week's wrong calls. For each: which layer pointed the wrong way, whether an AI override helped or hurt,
and whether an event landed after the call. The owner (or the next session) may change a rule only by a dated, versioned
amendment (`desk-bias-process-v2`, …). The old version keeps being scored for 20 days beside the new one.

## Desk Terminal

- **New tab "Bias process":** one card per market, in the FundaBias layout: direction and conviction, the reason line,
  the six layers as rows, invalidation, the day range. Plus the head-to-head table and the FundaBias log form.
- **Surfaces:** directional output follows the owner rule of 2026-11-16 (a direction read without a forward record is
  `preview`: owner sees it, desk login opt-in). The head-to-head table is `pnl` (hidden by default).

## Build order

1. Structure layer, call rules and conviction (pure, tested) in `js/deskBiasProcess.js`.
2. The AI step (pack builder, fixed prompt, validator, fallback) using `callModel`; tests with a fake model.
3. Issue job at 07:30, KV, route, registries, flag.
4. Scoreboard forecasters `process-ai` and `process-system`; a `bias-scoreboard` prereg amendment; FundaBias log route,
   form and forecaster `fundabias`.
5. The head-to-head scoring with the fixed trade rule; the Desk Terminal tab; the weekly review page.
