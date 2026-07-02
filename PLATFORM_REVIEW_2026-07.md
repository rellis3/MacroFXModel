# Platform Review — July 2026

> A full-codebase review against the project's ideals: **macro judges the idea,
> range levels + volatility forecasting drive the entry, everything else grades
> whether the trade is good.** Scope: core calculation bricks, every backtest
> engine, all live bots, the macro layer, and the dashboard. Companion to
> `BUG_LIST.md` (whose CRITICAL/HIGH items were re-verified as part of this
> review), `SYSTEM_ASSESSMENT.md` and `TRADABILITY_REVIEW.md`.
>
> **Verdict in one line:** the volatility/range core and its lego discipline are
> genuinely sound and mostly honest — but three new lookahead defects contaminate
> the current v2/weekly evidence, the live bots have real execution-safety gaps,
> and the macro layer is almost entirely disconnected from the entry decision
> (and sign-inverted in the one place it is connected).

Everything below was verified against current code (commit `316c692`).
"KNOWN" = already documented in BUG_LIST/SYSTEM_ASSESSMENT/TRADABILITY_REVIEW
and confirmed still present.

---

## 0. Status of the previous bug list

Good news first: of the 13 CRITICAL items in `BUG_LIST.md`, **12 are genuinely
fixed** (verified in code, not just claimed): the hedge-signal null deref,
the Gold `TRADE_CLOSED` event mismatch, the GLI CNY double-conversion, the
cointegration in-sample screen, the same-bar TP-before-SL wins in the gold and
Asia engines, the candle-confirm future peek, the dynamic-anchor full-day
extreme in `vol_backtest.py`, and more. Item #4 (unauthenticated KV writes) is
**partially fixed** — the `X-Auth-Token` gate exists (`_worker.js:904-911`) but
only fires when `KV_WRITE_SECRET` is actually set, and only for keys matching
`credentials|config|override|force_unlock`.

Bad news: the **HIGH tier is almost untouched** — of items 14–34 only #21
(forming-candle σ leak in TradingBot) is fixed. Still open: RegimeV7's
`sl==0` instant-close for shorts (#16), V2/V4 paper-mode stops never simulated
(#17), JPY pip-value over-sizing (#19), index-CFD pip fallback 10.0 (#20),
truncated MFE/MAE in the sweep (#22), the inverted monthly-bias label (#24),
the backwards 5m EMA (#26), gold entries filled at the signal bar's own close
(#28), the DecisionEngine "high-confidence" multiplier that *shrinks* size
(#32), and the rest. `server.js` still runs **three different Sharpe
methodologies**, and the QMR optimizer scores on the per-trade-annualized one
that inflates with trade count (`server.js:2302-2305`, `:3492-3494`).

---

## 1. CRITICAL — new mis-calculations in the core

These are new findings (not in BUG_LIST) that directly contaminate the numbers
the strategy decisions rest on.

### 1.1 `walkBars` / `resolveDynOrder` book TP on the fill bar — D1 paths are dishonest
`js/forecastCore.js:83-89` (and `:225-231`) check TP against the fill bar's full
range. For a fade, TP lies *between* open and entry band, so on the fill bar the
path necessarily traversed the TP region **before** the fill — the win may have
printed hours earlier. Harmless on M1 bars; **structurally wrong on the weekly
and monthly horizons (always D1 bars) and on the daily D1-fallback**
(`js/volBacktestV2Engine.js:91-99`). This is CLAUDE.md's own anti-pattern
("never assume intrabar TP on a daily bar") inside the flagship v2 primitive.
Overstates fade results. **Fix:** on the fill bar resolve SL only (pessimistic);
TP from the next bar onward — or require M1/H1 paths at every horizon.

### 1.2 `dynamicHL` anchors on the bar it fills against — and defaults ON
`js/forecastCore.js:169-238` (`walkDynamicHL`): `runLo[k]/runHi[k]` include bar
`k` itself; the fade level derived from them is fill-tested against the same
bar's opposite extreme. On D1 window bars (weekly/monthly, and daily-without-M1)
the sell level is computed off the day's *final* low and filled at the day's
high — the same self-fulfilling dynamic-anchor defect that was fixed in
`VolRangeForecaster/vol_backtest.py` (BUG_LIST #8), re-minted in the v2 core
with `dynamicHL: true` by default. **The adaptive-vs-fixed A/B cards used to
pick the selector are contaminated on exactly these rows.** **Fix:** lag the
anchor to `runLo[k-1]/runHi[k-1]`, and/or default `dynamicHL:false` off M1.

### 1.3 `breachReclaim` in the *honest* engine guarantees wins by construction
`js/honestForecastEngine.js:102-116`: the fill is accepted only when the daily
**close** is back through the band (unknowable at the touch), entry is booked at
the extreme touch price, and unstopped PnL = entry − close — which the filter
itself guarantees is positive. The outcome set collapses to {guaranteed-win,
SL-loss}: adverse-close losers are deleted from the sample. The knob advertised
as the honest-fills correction is the most optimistic mode in the file.
**Fix:** fill at the close (or next open) when breachReclaim is on, or move it
to the M1 walker where the reclaim is observable in sequence.

### 1.4 The shared ADX brick is shifted one bar into the future
`js/indicatorCore.js:106-113` (and its golden source `hmm5m.js:88-97`):
`out[i]` incorporates directional-movement data through bar `i+1`. The final-bar
patch `out[L-1] = out[L-2]` exists *because* the series is displaced one slot
early — the live latest-bar read is coincidentally right, so this is a pure
**backtest-sees-tomorrow / live-doesn't** divergence, the exact class the lego
architecture exists to prevent. Every ADX-gated regime backtest (HMM emissions
via `rollingZ(adx,…)`) looks slightly better historically than it can be live.
**Fix:** write to `out[i+n+1]`, keep the seed at `out[2n]`, delete the patch;
fix `indicatorCore` and `hmm5m` together and re-run the regime backtests.

### 1.5 zscoreSpreadEngine trades on monthly-average yields it couldn't know
`js/zscoreSpreadEngine.js:91-123` forward-fills `GS2` and the OECD short-rate
series from their **observation date** (1st of month) — but these are
full-month *averages*, finalized only at month-end and published later still.
For most of each month the direction signal embeds future yields. Plus zero
transaction costs (KNOWN). The whole z-tier edge may be an artifact.
**Fix:** shift observations to release date (the `PUB_LAG` pattern already
exists in `globalLiquidityEngine.js`), add costs, re-run.

### 1.6 Weekly engine D1-fallback books near-guaranteed Monday wins
`js/weeklyVolBacktestEngine.js:378-414` + `:248-260`: SL/TP resolved against the
fill bar itself with TP defaulting to `mondayOpen`; if the band is touched on
Monday's own D1 bar, `low ≤ open` is true by construction → instant full win
even though the low printed before the touch. Only the `m1_sim:false` records
are poisoned, but they're pooled into the same stats. Same class as 1.1.

### 1.7 Net-liquidity mixes units: WALCL (millions) − TGA/RRP (billions)
Four sites: `js/globalLiquidityEngine.js:138-139`, `GlobalLiquidity/config.py:54`
(+`gli.py`), `js/macroEquityEngine.js:134-137`, and — live — `server.js:3972-3973`
(`computeNetLiqZ`, feeding the liquidity-gate signal at `:4250-4255`). A ~$500bn
TGA/RRP swing is ~0.01% of WALCL's ~7,000,000, so "net liquidity" degenerates to
the raw Fed balance sheet — the 2022/2023-style TGA/RRP events the metric exists
to capture change it by ~nothing. The conversion exists in one place
(`server.js:2801`, `v/1000`) and is missing everywhere else; synthetic test data
uses consistent magnitudes so tests can't catch it. **Fix:** scale once where
FRED is fetched + a unit-sanity assertion.

### 1.8 Macro sign inversion for safe-haven pairs in the ONE live macro input
`levels.js:349-371` (root): `safeHaven = isJpy || isChf` scores risk-stress
(VIX>25, HY widening) as **bullish for the pair** — but in all 8 configured
JPY/CHF pairs the safe-haven currency is the *quote*, so risk-off drives the
pair **down**. Copied from gold (where XAU is base — correct there). VIX 30 +
HY gapping → the Level Bot's entry score is *boosted* for long GBP/JPY, while
the dashboard's own `fx-macro-model.js` (`riskSens:-0.9`) says bearish.
**Fix:** score the safe-haven *currency*, negate when it's the quote leg —
drive the sign from `PAIR_DRIVERS.riskSens` as the single source.

### 1.9 Live execution safety (new criticals)
- **MT5 magic-number collisions:** `DynAnchorBot:43` = `MacroEquityBot:42` =
  `RegimeV4:95` (all `20260006`); `bot/hedge_bot.py:46` = `RegimeV7:109`
  (`20260007`). Duplicate guards, EOD closes, orphan adoption and serializers
  cross-contaminate between bots on a shared terminal — including RegimeV7's
  still-open `sl==0` insta-close acting on hedge-bot positions.
- **Hedge bots: restart double-entry.** Dedup is only against the local state
  file (no `positions_get()`-by-magic sweep); lose/corrupt the file with an
  ACTIVE signal → both legs re-opened, doubled exposure (W4/W5 from
  `TRADING_SAFETY_LAYER.md`, documented, unfixed). Also a real data anomaly in
  the committed state: one record has `ticket_a == ticket_b == 506393550`.
- **Live state files are git-tracked** (`hedge_bot_state.json`,
  `bot/.bot_state.json`): a Railway redeploy resurrects a stale position
  snapshot — the bot manages tickets that no longer exist and re-enters signals
  it already holds. State belongs in KV or a volume, not the repo.
- **48h KV TTL silently expires the new bots' config/kill-switch/credentials.**
  `_worker.js:916-931` + `kv.js:158`: `volatility_bot_*`, `range_line_bot_*`,
  `dyn_anchor_*`, `macro_equity_*`, `hedge_bot_*` are not in `PERMANENT_KEYS`,
  so 48h after the last dashboard save an engaged `kill_switch:true` or lowered
  `risk_pct` vanishes; next restart comes up on `DEFAULT_CFG`. **Fix:** add
  them to `PERMANENT_KEYS`.
- **KV write auth is opt-in** (KNOWN #4): with `KV_WRITE_SECRET` unset, an
  unauthenticated CORS-`*` write can rewrite bot config — including flipping
  **MacroEquityBot live** via `paper_mode:false` (`macro_equity_bot.py:734`).
  Treat `KV_WRITE_SECRET` as mandatory in production.

---

## 2. MAJOR — things hurting the strategy

### 2.1 The live volatility bot trades a *different* strategy than the one validated
The doctrine chain (producer → `volSigmaSeries`/`computeBands`, never
`/api/vol-forecast`) is genuinely honored — verified import-by-import. But:

1. **σ off-by-one:** `js/volatilityBotProducer.js:64` takes `sig[len-1]`, which
   by the series' own contract predicts *yesterday's* session (data ≤ n−2).
   Today's plan should use one more step (data ≤ n−1). After a vol spike (NFP),
   the next session's lines are too tight and stops too close — a regime the
   book never validated.
2. **GMT-season stale open:** the plan fires at fixed 23:05 UTC
   (`server.js:10242`) but anchors to midnight *Europe/London*. In BST that's
   00:05 London (fine — it's July now); in GMT (late Oct–Mar) it's 55 minutes
   **before** midnight, so all winter every plan anchors the whole day on the
   *previous* session's open. Fix before the clocks change.
3. **No plan-staleness gate:** if the nightly producer run fails, the bot trades
   the new session on yesterday's σ/open/`acted` set indefinitely
   (`volatility_bot.py:207-236`). Fail closed instead.
4. **First-line-only subset:** the broker brick's one-position-per-symbol block
   plus `acted`-burn-*before*-order (`engine.py:100`) means live takes a
   filtered subset of the per-touch book that was validated — realized
   expectancy need not match the OOS card. Either validate a held-position
   variant of the vol book (as was done for the range bot) or burn the line
   only on an accepted order.
5. **No drawdown lockout:** neither the volatility bot nor the range-line bot
   imports `pylego.risk_guard` — the brick exists, is tested, and is used by
   `bot/regime_bot.py`. Wire it.
6. **Range bot:** default `max_spread_pips: 1e9` (spread guard off), and MT5
   bar timestamps are assumed UTC when windowing the Asia session — an
   EET-server broker shifts the range 2–3h, i.e. a *different ladder* than the
   frozen policy learned. Verify the broker offset.

### 2.2 Macro is decoration, not a judge (the integration question)
Traced end-to-end: exactly four paths where macro touches a decision, and three
are broken —

1. `computeMacroScore` → 25% of `signalScore` → Level Bot: **sign-inverted**
   for JPY/CHF pairs (§1.8), a near-constant 0.5 for plain USD pairs (±1.4 pts
   of 0–100), exactly 0.5 for non-USD crosses — and enabling it *dilutes* the
   validated weights (`entryGradeCore.js:43-58`). The 25%-macro blend has
   **never been backtested**: the Asia harness calls `computeSignalScore`
   without `macroScore` (`js/asiaRangeEngine.js:707-710`) — live runs a formula
   validation never saw (violates Lego Principle 5).
2. Level Bot macro/vol/news modules: `macro_regime.py` gates a 0–100 score
   against a 0–12 threshold (never vetoes); `vol_gate.py` reads KV key `fred`
   which **nothing writes** (dashboard writes `fred2`) so the VIX>30 block has
   never fired; `cot_filter`/`news_risk` default **off** (`_worker.js:1953`).
3. `hmm5m-v2.js` macro-context confidence scaling — works, but falls back to
   CALM (VIX=15) on FRED outage, removing the haircut exactly during stress.
4. RegimeV2's own FF-calendar/FOMC/VIX gates — **the single healthy macro→entry
   integration**, and it bypasses the entire JS macro layer.

Everything else — T1–T8 tier score, the 26-pair FX macro model, daily tone,
COT extremes, GLI and its "target FX book", all five `system-*.html` pages —
terminates in HTML, Telegram text, or AI-briefing prose. **The volatility bot
consumes zero macro/COT/liquidity/event input** and will sit on fade limits
through NFP/CPI/FOMC.

Two divergent `signalScore` formulas (server `entryGradeCore` 25/25/20/20/10 vs
browser `js/signal.js:435-478` 20/30/25/15/10, different macro engines,
different field shapes) write the **same** `ai_entries_*` KV key — which number
the bot trades depends on who wrote last. Unregistered copy-drift.

Other macro-layer defects: COT percentiles on raw contracts (not OI-normalized)
over a "3yr" window that's actually last-200-reports; the JPY/CAD/CHF
sign-flipped pairs render an algebraically-invalid L/S split; DecisionEngine's
COT modifier is a permanent no-op (field names never emitted); rate
differentials pit a monthly-average 2y note yield against overnight/3M
interbank rates (term premium baked into every threshold, two different
"momentum" clocks); FRED observation dates are discarded server-side
(`server.js:10079`) so **no consumer can know a print is 6–10 weeks stale**,
and the `/api/refresh` staleness "fix" just re-stamps old data's timestamp.

### 2.3 Backtest honesty gaps still open
- **v1 M1 engine costs default OFF** (`volBacktestM1Engine.js:792`,
  `spreadPct=0`) and no slippage path exists for its stop entries — gross
  reported as net unless the caller passes a spread. v1 is read-only by
  doctrine, so fix at the calling/reporting layer (server default > 0).
- **v1 dynamic-anchor D1 fallback** anchors on the completed day's extremes
  (`:733-755`) — BUG_LIST #8's defect alive in the JS fallback; skip the day
  instead.
- **asiaRangeEngine: zero costs** anywhere in the file (KNOWN), and the
  WaveTrend/divergence gate still reads the touch bar's own close (KNOWN #25).
- **Weekly engine z-score/SMI filters** likewise index the fill bar's own close
  (`weeklyVolBacktestEngine.js:384-392`) — filter-selection bias compounds.
- **M1 session window ≠ D1 session:** levels anchor to the 22:00-UTC D1 open
  but the walked M1 day starts 00:00 UTC (`volBacktestM1Engine.js:148-159` vs
  `volBacktestEngine.js:69-77`) — 2h of session never walked; only the
  exhaustion leg re-anchors. Same in `volBacktestV2Engine.groupM1ByDate`.
- **hedgeSignalV2 IS/OOS split is by end-aligned bar index**, not calendar date
  (`hedgeSignalV2Engine.js:263-292`) — short-history pairs leak recent trades
  into "IS"; the pooled OOS card is not one chronological holdout.
- **Per-trade Sharpe pooled across 26 concurrent pairs** (`metricsCore.
  summarizeTrades`) inflates under clustering; `backtestStats.portfolioStats`
  is the honest daily-aggregated alternative — OOS "wins" (the CLAUDE.md
  acceptance gate!) should be judged on it, not on `summarizeTrades`.

### 2.4 Brick drift inside the baseplate
- The estimator-dispatch block (commodity→HV20[i−2], index→GARCH, fx→YZ[i−1])
  is **triplicated verbatim** in `volBacktestEngine.js:309-322`,
  `forecastCore.js:264-276`, `honestForecastEngine.js:162-175`. Identical
  today; a landmine tomorrow. Export once from `volBacktestEngine`.
- YZ warm-up fallback `yz[i-1] || 1e-6` manufactures a σ that *passes* the
  `<1e-8` guard — any future caller with lookback <31 gets bands 0.0002% wide
  and a flood of fake fills. Return NaN/0 and let the guard skip.
- **Gold pip is four-way divergent:** registry 1.0, `js/utils.js:164` 0.1 (what
  the live dashboard client actually calls), `weeklyVolBacktestEngine` 0.1,
  `rangeFibEngine` 0.1 + threshold 200 — so a gold confluence zone is $2 in one
  backtest and $20 in another, and rewiring clients to the registry would
  silently rescale gold costs 10×. Decide once; log all copies in LEGO §3.1.
- ASSET_PARAMS correction-factor fan-out (KNOWN, LEGO §3.3): backtest
  (fx hl75 0.912) vs live `volForecast.js` (0.99, 2026-06-26 recal) vs
  `server.js:8843` `_DA_DASHBOARD_PARAMS` (the old set) — three live JS band
  models today. `asiaRangeEngine.js:160-166` adds a fourth hand-inlined copy
  (2.049 × **0.894**) applied to gold too.
- Live DynAnchor bots trade EWMA(0.94)+0.921/0.894, not the canonical
  YZ30+0.965/0.912 (KNOWN P0), and the two "twin" bots seed EWMA differently.
- `metricsCore.sortinoRatio` divides downside deviation by the count of
  *losing* periods, not n — non-standard, incomparable to textbook Sortino.
- `pylego/strategy/rangeline.py` is a hand-port with Python-only tests — add
  JS golden vectors like the volatility port has (`gen_volatility_vectors`).

---

## 3. What's verified clean (keep it)

- **The Feller/half-normal core is right:** BM_P50 1.572 / BM_P75 2.049 /
  HN 0.6745 / 1.1503 = Φ⁻¹(0.875) all check out; Yang-Zhang matches the
  literature (k, ddof, RS term); GARCH recursion and seeding correct;
  HV20 `[i−2]` shift is exactly the last knowable datum. **No lookahead in the
  σ/regime/day-type decision path** — every estimator reads strictly `< idx`.
- **√5/√20 horizon scaling** is applied exactly once and is theoretically sound
  (caveats: the empirical correction factors were calibrated on daily bars and
  are unvalidated at weekly/20-day; arithmetic bands ignore lognormal asymmetry
  at 20-day scale).
- **honestForecastEngine** (breachReclaim aside) is the model citizen:
  mark-to-close on D1, costs+slippage on by default, real chronological IS/OOS.
  **rangeFibEngine** (costs on, pessimistic ties) and **hedgeSignalV2**
  (strictly-past fits, costs on) are honest. **backtestStats.js** is exemplary
  (deflated Sharpe, PSR, block bootstrap, portfolioStats).
- The gold/backtest-worker BUG_LIST fixes are real; WFO windows now disjoint.
- **The lego doctrine works where applied:** the vol-bot producer imports the
  backtest σ chain verbatim; `instruments.json` is generated with a `--check`
  gate; the velocity bucket is golden-tested against JS vectors; the range
  bot's chandelier rides the broker-native SL and burns slots only on fill;
  `bot/main.py` + `position_manager.py` show the target safety pattern
  (kill switch, persisted RiskGuard, MT5-verified dedup, orphan
  reconciliation by magic — the only bot that reconciles on startup).
- `instrumentRegistry` JPY pips/digits/aliases all correct and fail-loud.
- `js/legoBricks.test.mjs` passes, including the summarize-equivalence golden.

---

## 4. Prioritized roadmap

### P0 — before trusting any current number or the next live session
1. **Fix `walkBars` fill-bar TP + `dynamicHL` same-bar anchor**
   (`forecastCore.js`) and re-run the v2 A/B suite — the selector evidence is
   contaminated on D1 paths. (§1.1, §1.2)
2. **Fix the producer σ off-by-one and the 23:05-UTC/London-midnight anchor**,
   add the plan-staleness fail-closed gate. (§2.1)
3. **De-collide MT5 magics**; add `positions_get`-by-magic reconciliation to the
   hedge bots; move state files out of git; add the new bots' keys to
   `PERMANENT_KEYS`; set `KV_WRITE_SECRET` in Railway/CF. (§1.9)
4. **Fix the safe-haven sign inversion** in `computeMacroScore` and the two
   never-firing Level-Bot gates (0–12 vs 0–100 scale; `fred` vs `fred2` key).
   (§1.8, §2.2)
5. **WALCL/TGA/RRP unit fix** at the FRED source, all four sites. (§1.7)

### P1 — restore backtest honesty
6. breachReclaim fill-at-close; weekly D1-fallback pessimistic resolution;
   default costs on for v1 (at the route layer) and asiaRangeEngine; lag the
   WT/z-score/SMI gates to the pre-touch bar; zscoreSpreadEngine release-date
   lags + costs; hedgeV2 calendar-date split. Adopt `portfolioStats` as the
   OOS acceptance number.
7. Fix the ADX one-bar shift (indicatorCore + hmm5m together), re-run regime
   backtests. Fix RiskGuard-tier HIGH items still open (V7 sl==0, V2/V4 paper
   SL, JPY pip sizing, DecisionEngine riskMult).
8. One Sharpe methodology in server.js (daily returns × √252); stop the QMR
   optimizer scoring on per-trade-annualized Sharpe.

### P2 — make macro the judge it was designed to be
9. Extract one **`macroCore` brick**: `macroBias(pair, direction, fredSnapshot)
   → {state, score, asOf[]}`, sign driven by `PAIR_DRIVERS.riskSens`; one
   writer (server cron → KV); retire the browser/server `signalScore` fork and
   the browser-in-the-loop pushes. Register in LEGO_MODULES.
10. Layer it as a **3-state selector, not a knob**: `macroGate ∈ {ALIGNED,
    NEUTRAL, OPPOSED}` from two pre-registered factors (risk regime × riskSens;
    rate-differential direction). OPPOSED → skip/halve, ALIGNED → allow follow.
    No tunable weights. Prove via `summarizeSplit`, ≥30 OOS trades, before it
    ships — same bar as every other selector.
11. **Event gate as a brick consumed by the vol bot**: `eventGate(pair, now,
    calendar) → {blackout, widenMult}` (the logic already exists twice) —
    suppress/widen per-line fades around high-impact events. The vol bot is
    currently the most macro-blind live system.
12. Carry FRED observation dates end-to-end; render "as of" ages on index.html;
    hard-NA stale monthly series; stop `/api/refresh` re-stamping old scores.
13. Backtest the exact live blend: historical FRED (with `PUB_LAG`) through the
    Asia harness, A/B macro-on vs macro-off; keep the 25% weight only if it
    wins OOS.

### P3 — consolidation
14. Single σ-dispatch export; kill the `||1e-6` fallback; settle the gold pip;
    golden vectors for `rangeline.py`; wire `pylego.risk_guard` into both new
    bots; validate a held-position vol book (or burn lines only on accepted
    orders); fix COT OI-normalization and the dead DecisionEngine COT fields.
