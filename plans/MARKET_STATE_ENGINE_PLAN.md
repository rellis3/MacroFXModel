# Market State Engine: plan

*2026-10-31. Follows `plans/REPO_REVIEW_2026-10-31.md` §7. Owner's brief: one central dashboard of key macro data that
determines the global market state, with analysis layers on top (vol, OI, COT, gamma, credit, banking, money flows)
and backtests of edges underneath. "I want to learn how one thing impacts another." v1 is built and live on
`state.html` / `GET /api/state`.*

## 0. Status, 2026-11-01 (v3 built)

`state.html` and `/api/state` now carry the following sections:
- the global state banner
- the institutional playbook: seven frameworks, each with expectations checked against markets and an evidence
  label
- edges active today (audited range edges)
- economies, with the 2007–2025 surprise history
- long-history context (VIX since 1990, the 10Y since 1970, MOVE since 2002, credit and duration ratios)
- the five market tiers and the chain
- who moved first
- vol, COT and options layers
- G10/EM currencies vs USD
- all 36 COT markets at full depth
- data health

Inputs are in-memory server state, KV, and the R2 archive merged over committed seeds (`js/stateHistorySources.js`).
Pure modules: `js/stateEngine.js`, `js/stateLayers.js`, `js/stateHistory.js`, `js/statePlaybook.js`, all tested.
Next: phase 2's non-US macro (CPI/PMI vintages) and the forward ledger for the composite.

## 1. What it is, and what it is not

The engine answers one question: **what state is the market in, layer by layer, and how is information moving between
the layers?** It does this with one document, built in one place, read by every page.

It describes. It does not forecast. A layer moving first, or a textbook link holding, is shown as a fact about the last
20 days, never as a signal. A relationship only becomes a signal when it has a test whose code has been audited and
stands (`js/evidenceAudit.js`), and the page labels every link with that status.

## 2. Structure: the capital-flow hierarchy

The tiers follow C.OG's information-flow hierarchy. It is the structure of the document and the page, not a claimed
lead.

| # | Tier | Nodes today (js/macroChain.js) | Role |
|---|---|---|---|
| 1 | Rates & sovereign bonds | US 2Y/10Y/30Y, 10Y real, 10Y breakeven, Bund/Gilt/JGB − UST gaps | First to price macro shifts |
| 2 | Credit & funding | HY OAS, CCC, EM OAS, SOFR − floor | Corporate health, risk appetite |
| 3 | Currencies | Broad dollar, EUR, JPY, GBP, AUD, CAD, EM FX | Policy divergence, global flows |
| 4 | Equities | S&P 500, Nasdaq, semis, energy, real estate | Broadest participation, most noise |
| 5 | Volatility | VIX, MOVE | Insurance pricing, tail risk |
| — | Drivers | Oil, copper, gold, crack spread, bitcoin | What the chain starts from |

Each tier gets:
- **readings**: last value, 20-day and 5-day moves in the node's unit, a noise floor, the date it first crossed that
  floor, and a percentile with the span it really covers.
- **state**: a rule-based headline in plain words ("Yields rising, real-yield led; curve flattening") and a tone.

Across tiers:
- **flow**: the order in which tiers first moved this window, against the textbook order.
- **chain**: 33 cause→effect links, each holding / broken / quiet / unmeasured, and each with its evidence status:
  - stands: tested here and the test stands
  - reopened or unverified: tested, but the result is in doubt
  - untested: never tested as a lead

## 3. Architecture (v1, built)

```
KV fredhistory_series_*  ─┐
OANDA NY-close daily ─────┤  js/stateSources.js   assembleChainSeries()   one set of dating rules
/api/intl-yields, crack,  ─┤       ↓
/api/chain-extra (caches) ─┘  js/stateEngine.js    buildState()            pure; tiers, flow, chain, health
                                   ↓
                              js/stateRoutes.js    GET /api/state           10-min cache, single build, errors listed
                                   ↓
                              state.html           tiers + sparklines, chain graph, first-move timeline, health
```

- **Pure core.** `stateEngine.js` and `stateSources.js` do no I/O, so they are tested on synthetic series
  (`js/stateEngine.test.mjs`, 9 tests; `js/stateRoutes.test.mjs` with a fake KV and OANDA).
- **Reuses, does not copy.** The chain is `macroChain.js`, the same module `today.html` uses. The series rules are the
  ones `today.html` used inline, moved into `stateSources.js`.
- **Honest gaps.** A missing input leaves its nodes "not loaded", is listed in `errors`, and shows in data health. It
  is never filled in.
- **Evidence.** `js/evidenceAudit.js` is generated from the audit CSV (`node scripts/repo-review/build_evidence_audit.mjs`).
  `LINK_EVIDENCE` in `stateEngine.js` maps each link to the ledger ids that tested it as a lead.

## 4. Roadmap

### Phase 2: the economic engine (the founding idea)
- **G10 economy grid.** Per economy: growth (PMI or nowcast), inflation (CPI y/y and 3m annualised), policy path
  (STIR / Fed path), real rate, curve, currency.
  - Point-in-time and first-print where a vintage exists (feature store, surprise store).
  - Sources already in the repo: `/api/nowcast`, `/api/econ-surprise`, `/api/fed-path`, `/api/intl-yields`, the CB
    history routes.
  - Gaps from the data audit to fill: non-US CPI, non-US STIR automation, PMI.
- **Global state classification.** A small set of states, fixed in advance and shown with their history:
  - growth × inflation quadrant
  - liquidity impulse (net liquidity, fixed units)
  - stress (VIX term, HY)
  - USD funding
  - crowding (COT)

  These are descriptive labels first. Each becomes a candidate for the forward ledger.
- **Fold in Global Read.** Its evidence weights become the "edges" layer (§ phase 3), not a parallel state model.

### Phase 3: analysis layers and edges
- **Overlays, each attached to the state that activates it.** Vol and range (the forecast ladder, IV σ, VIX curve,
  stress and month-end), options OI and gamma, COT, credit, banking (BIS), money flows (net liquidity, funding).
- **Only `stands` evidence is shown as an edge.**
  - Re-runs from the 13 RE-RUN register rows feed in as they land.
  - New pre-registered direction studies (REPO_REVIEW §8D) feed in when banked.
- **Forward record.** The composite state and the tier tones go into `js/directionLedger.js` as research
  forecasters, scored against the baseline. A forward record is the only clean out-of-sample data left.

### Phase 4: consolidation
- **Retire overlapping pages.** Once `state.html` covers a dashboard's job, that dashboard redirects to it: `index`,
  `indexv2`, `desk`, `terminal`, `Todayv3`, `analytics-desk`, `market-sense`, `daily-read`.
- **`today.html` keeps the daily trading read** (levels, sizing, news). Its chain and macro sections read
  `/api/state` instead of assembling their own.
- **Move `index.html`'s browser KV writer (`js/alerts.js`) to the server first.** The Gold, GoldV2 and ConfluenceBot
  bots read those KV keys, so `index.html` cannot retire until they have another source.

## 5. Rules for this engine
1. One state document. A page that needs state reads `/api/state`; it does not rebuild it.
2. Describe before predict. A new reading enters as description; it becomes a signal only through a pre-registered,
   audited test.
3. Every number shows its date and its window; percentiles show their real span.
4. Untested is not null. Links and inputs say "never tested" when that is the truth.
5. Missing data stays missing.

## 6. Open decisions (owner)
- Phase 2 coverage: which economies first. Suggested: US, EZ, UK, JP, then the commodity bloc.
- Whether `today.html`'s chain moves to `/api/state` now, or after phase 2.
- Whether the range-line / levels-v2 family moves from the 22:00-UTC broker day to London sessions (needs a relearn).
