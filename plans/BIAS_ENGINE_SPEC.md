# Bias engine: an explainable, rule-based macro bias for every market (spec v1)

Owner, 2026-11-15: "I just want to build one which is based on knowledge and macro drivers and fundamentals and understand
how we reached that and it be a good indication of what happens", "it needs to work for all" (FX crosses such as NZDCHF,
assets, equities), and "yes" to fitting it into the Desk Terminal.

Background:
- **Research:** `plans/BIAS_RESEARCH_SYNTHESIS.md` and `analysis/output/bias-research/`.
- **The look to match:** FundaBias ("XAUUSD · Bearish 7/10 · quote · Key drivers").

## What it is (and is not)

- **A transparent driver checklist.** Every market each morning gets:
  - a direction (Bullish / Bearish / Neutral);
  - a strength from 1 to 10;
  - the drivers with each one's reading, sign, weight and contribution;
  - a one-line "why";
  - what would flip it.

  The same inputs always give the same output. No language model is in the scoring path.
- **It is not a validated trade signal.** Every daily read is written to the `bias-scoreboard` forward record (a new
  forecaster `bias-engine`), so its record at 24h and 1–4 weeks is measured. The cards say so. The weights are v1 theory
  weights (`weights.version = 'theory-v1'`), to be revised only from that record.

## Architecture

1. **Currency engine (8 currencies: USD EUR GBP JPY AUD NZD CAD CHF).**
   - Each currency gets s_ccy ∈ [−2, +2] = Σ wᵢ·dᵢ over the drivers it has. Each dᵢ ∈ {−2, −1, 0, +1, +2} is set by
     fixed thresholds.
   - Missing drivers are dropped and the remaining weights renormalised. The `coverage` field (the share of weight
     present) is shown on the card.
2. **Pairs (all 28 crosses, plus NOK/SEK later).** s_pair = (s_base − s_quote) / 2, so a pair is also in [−2, +2].
   - Its explanation lists both legs' drivers. CHFNZD and NZDCHF are the same number with the sign flipped.
   - Use `legsOf()` (`js/terminal/pairView.js`) for leg parsing.
3. **Global risk score R ∈ [−2, +2]** (risk-on > 0). Inputs: VIX level vs its own 1-year percentile, VIX/VIX3M
   (inversion = risk-off), HY credit stress where available, and the S&P 20-day trend. Currencies and assets use it
   through a fixed **risk role**: USD −0.5, JPY −1, CHF −1, EUR 0, GBP +0.25, CAD +0.5, AUD +1, NZD +1; gold −0.5;
   indices +1.
4. **Asset models.** Gold and silver, oil and copper, US indices (NQ, SPX500, US30, US2000), DE30 and UK100. Each has its
   own driver list, weights and the same output shape. Equities: later; no data held.

## Drivers and weights (theory-v1)

The weights follow the banks' layering (synthesis §1): macro dominant, trend a smaller weight (owner 2026-11-14:
"the macro analysis should be the stronger factor").

**Currency (weights sum to 1):**

| Driver | w | Reading → d | Source |
|---|---|---|---|
| Policy path | 0.25 | Change in priced policy over the last 5 sessions (hawkish +) and the bank's stance | `/api/cb-expectations`, `/api/macro-scorecard` cbSentiment. GBP and NZD have no expectations yet: missing |
| Rate differential trend | 0.20 | The currency's 3m / 2y rate vs the 8-currency average, 20-day change | `/api/rate-diff`, rate store |
| Data momentum | 0.20 | Macro scorecard composite (growth, inflation, labour, demand) | `/api/macro-scorecard` ranked[].composite |
| Real yield | 0.10 | 10y real yield level vs peers and its 20-day change | `/api/real-yield` (USD, EUR, CHF only) |
| Risk role × R | 0.10 | role × R | above |
| Commodity link | 0.05 | AUD: copper; CAD: oil; NZD: dairy (missing) — 20-day trend | price feeds |
| Positioning | 0.05 | COT crowding, contrarian (crowded long → −) | `/api/cot-state` |
| Trend | 0.05 | The currency's D1/H4 trend against the basket (EMA20 slope) | OANDA via existing candle helpers |

**Gold:**
- real yield (USD 10y real, falling → +) 0.25
- USD (s_USD, inverted) 0.25
- Fed path (dovish → +) 0.15
- risk/fear (−R) 0.10
- positioning 0.10
- trend 0.15

**US indices:**
- rates and real yields (falling → +) 0.20
- Fed path 0.15
- risk and credit (R) 0.25
- US data momentum 0.15
- positioning 0.10
- trend 0.15

**DE30, UK100:**
- local rates path 0.20
- own currency (weaker → +) 0.15
- R 0.25
- local data momentum 0.15
- trend 0.15
- positioning 0.10 (if held)

**Oil, copper:**
- USD inverted 0.20
- global data momentum 0.25
- R 0.20
- inventories (oil, EIA if held) 0.15
- trend 0.20

**Silver:** the gold model with R +0.5 (industrial), noted.

**Output label:**
- strength = clamp(round(|s| × 5), 0, 10);
- direction = sign(s);
- **Neutral** when strength ≤ 2 **or** coverage < 0.5 **or** the two largest contributions have opposite signs and differ
  by < 0.1.

## Output schema (one record per issue)

```json
{ "version": "bias-engine-v1", "weights": "theory-v1", "asOf": "<ISO>", "risk": { "score": -0.6, "drivers": [...] },
  "currencies": { "USD": { "score": 1.1, "dir": "BULLISH", "strength": 6, "coverage": 0.9,
     "drivers": [{ "key": "policy", "label": "Policy path", "reading": "Dec hike odds 92% (+18pp/5d)", "d": 2, "w": 0.25, "contrib": 0.5, "source": "/api/cb-expectations", "asOf": "..." }],
     "why": "...", "flip": "..." } },
  "markets": { "NZDCHF": { "score": -0.9, "dir": "BEARISH", "strength": 5, "legs": ["NZD","CHF"], "drivers": [...], "why": "..." },
               "GOLD": { ... } },
  "gaps": ["GBP, NZD: no policy expectations", "real yields: USD/EUR/CHF only", "NZD dairy: no feed"] }
```

## Server

- **Logic:** `js/biasEngine.js`, pure: inputs → record. `js/biasEngine.test.mjs` covers: thresholds; renormalisation on
  missing drivers; the pair = (base − quote)/2 identity and its sign flip (NZDCHF = −CHFNZD); the Neutral rules; gold's
  sign conventions; determinism.
- **Issue time:** compute once per London weekday after Asia (07:00–07:30). Store write-once in KV `bias_engine_<date>`
  with an index `bias_engine_index`.
  - Register the key in `kv.js` _CF_EXACT, `_worker.js` and `js/storeRegistry.js`; `storeRegistry.test` fails otherwise.
  - Add a service flag in `js/serviceFlags.js` (the guard test).
- **Routes:** `GET /api/bias-engine` (latest, `?date=`); `?market=NZDCHF` returns any pair computed from the currency
  scores.
- **Scoreboard:** add forecaster `bias-engine` to `js/biasForecasters.js` (side = dir, Neutral = no view; p_up = clip(p0 ±
  0.01 × strength)). Record it as an amendment in `forge/BIAS_SCOREBOARD_PREREG.md` ("added forward from <first issue
  date>; no back-issue").
- **Lookahead:** inputs are only those published before the issue time. Each driver carries its `asOf`.

## Desk Terminal (desk-terminal.html, js/terminal/*)

Register every new panel in `js/terminal/tabRegistry.js` (guard test). Directional analysis is shown on the desk login.
The "flip" / invalidation line counts as `trade`, so it is hidden there. The track record counts as `pnl`, hidden by
default.

1. **Assets cards:** an "Engine: Bearish 7/10" chip beside the desk rating, a **Key drivers** list (top 3 contributions)
   on the card, and the full driver table in the full view. A "split" chip when the engine and the desk rating disagree.
2. **Currencies cards and modal:** the engine score beside the desk ring; the driver table in the modal.
3. **Pair tab:** the engine pair score with both legs' drivers side by side, for any pair.
4. **Overview:** the engine's currency ranking beside the desk's; "engine vs desk agree on X of Y".
5. **Macro tab:** a new "Bias engine" section (macroSubtabs): the full grid of currencies × drivers, the weights, coverage
   and gaps.
6. **Replay tab:** the engine's read for the replayed day, when one exists.
7. A footnote on each card: "Rule-based macro checklist, weights theory-v1, scored forward on the bias scoreboard; not a
   trade signal."

## Build order

1. `js/biasEngine.js` + tests; currencies → pairs → gold → US indices.
2. Issue job, KV, route, registries, service flag, scoreboard forecaster + amendment.
3. Assets, Currencies and Pair UI.
4. Macro section, Overview, Replay.
5. The remaining asset models (oil, copper, silver, DE30, UK100), and the gaps list kept current.
