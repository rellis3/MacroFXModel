# Repository review, 2026-10-31: what this repo is for, what is true, and how to rebuild it

*Owner's brief: "do actual deep-level analysis, not a high-level assumption"; review the code behind every verdict
instead of trusting the write-up; work out how to bring the repo back to what it was meant to be.*

*Method: nine parallel code-level audits (history, pages, data layer, four batches of null/underpowered verdicts, the
validated verdicts, and direction research from first principles). The lead reviewer then re-checked the 15 most
consequential claims in the code or by re-running them (`analysis/output/repo-review-2026-10-31/VERIFIED_BY_LEAD.md`).
Nothing was written to R2. Nothing was scored after 2026-08-21 (lockbox). No repo code was changed by this review.
Every number marked "exploratory" below is post-hoc and is a reason to pre-register, not a result.*

Evidence for everything here: `analysis/output/repo-review-2026-10-31/`
- `VERDICT_AUDIT.csv`: all 249 tested claims, with audit class, file:line evidence, and the justified re-test
- `AUDIT_{macro,price,volatility,other,validated}.md`: the five verdict audits
- `DATA.md`, `PAGES.md`, `HISTORY_SYSTEMS.md`, `DIRECTION.md`: the four structural audits
- `pages.csv`, `api.csv`, `systems.csv`: inventories of every page, API route and folder
- `scripts/`: the re-check scripts (they reference the session scratchpad and are kept as a record)

> **Data assets (added later on 2026-10-31):** what the repo holds, how deep each source is, what is being lost and how to get the best from it as an engine: `plans/DATA_ASSET_MAP.md` (inventories in `analysis/output/repo-review-2026-10-31/data/`).

---

## 1. The short version

1. **The repo was built to be a macro market-state engine, and it never got one.** The founding docs describe a
   cross-asset macro scorecard that decides the market state, with layers and backtests on top. That engine was
   started about eight times (7-tier score, HMMs, Regime V2/V4/V7, DecisionEngine, GlobalLiquidity, macro-scorecard,
   macro-conditioner, Global Read). None became the single source of truth. Meanwhile 244 pages, 859 API routes and
   about 26 bots were added beside each other.
2. **The research record is not safe to trust as written.** Of the 200 banked nulls and underpowered results:
   - **53 are reopened**: 19 have code bugs, and 34 had a test that could not answer the question or carry the
     wrong verdict word.
   - **28 could not be fully verified.**
   - **119 hold up.**

   Of the 49 validated results:
   - **13 are reopened**: 3 bugs and 10 fragile.
   - **11 are unverified.**
   - **8 are robust.**

   The repo's own earlier pilot audit found problems in 3 of the 3 nulls it checked. Its follow-up, the full audit,
   was never run until now.
3. **The bugs are mostly in shared code, which is why they kept recurring.** Six shared defects reach many studies,
   and three of them are in live code (§4).
4. **Direction was not "tested null".** The nulls are mostly correct for the question they asked: can one market's
   direction be read from 20 years of data? Nobody can do that. The designs where macro direction normally shows up
   were never run here:
   - cross-sectional
   - pooled across countries
   - 50-year FRED panels
   - relative event drift

   The current direction bar cannot even detect carry, the one directional factor the repo has shown is real (§5).
5. **The rebuild is a Market State Engine plus one dashboard.** The engine is one point-in-time state document. On top
   of it go the audited edges, each attached to the state that activates it, and on top of that one page. Pages,
   bots and studies that don't feed it get archived (§7).

---

## 2. What the repo was meant to be, and how it drifted

**Intent, in its own words:**
- `MD files/Fxmacro dashboard handover.md`, April 2026: "A team FX morning scorecard built on the C.OG cross-asset
  framework. It scores 9 currency pairs (+ gold) across 8 macro and technical tiers."
- `MD files/CLAUDE_HANDOVER.md`, 2026-05-04: "multi-timeframe macro analysis and entry signals for FX and Gold."

**Drift**, as a share of 5,091 non-merge commits by theme (`HISTORY_SYSTEMS.md`):

| Month | Commits | What dominated |
|---|---|---|
| May | 465 | Porting the macro scorecard; from week 2, range zones, HMMs and live MT5 bots (bots in 23% of commits) |
| June | 787 | Forecast and vol-range work (23–28%), regime bots V2→V7, 46 new pages |
| July | 807 | Page sprawl peaks (81 new pages); C.OG 9%, OI/gamma 13%, education starts |
| August | 750 | Audit month; fib/levels 22%; verdict: "macro is decoration, not a judge" |
| September | 890 | Dashboard/today 26%, Evidence Book; HMM jobs switched off |
| October | 1,392 | Pre-registered research 31%, vol-range 29%, education 20%, macro 18% |

**Why it drifted.** Only volatility and range results ever validated: 27 validated volatility results against 0
validated macro results (and 50 macro nulls). So every new effort followed the range work and treated macro as
decoration. Section 3 shows that a material share of those macro nulls came from defects in the tests, not from
macro itself. The drift was partly driven by bad evidence.

**Why unification kept failing** (`PAGES.md`, with file references):
- **Additive by policy.** 82 commit subjects say "additive / untouched / beside", and nothing is ever redirected or
  deleted.
- **Six or more parallel "market state" producers:**
  - server: `js/globalReadCore.js`
  - browser: `js/macro.js`, `pairCompositeEngine.js`, `outlookEngine.js`, `marketState.js`, `gaugeRead.js`
  - endpoints: `/api/regime`, macro-scorecard, risk-flags

  Each new dashboard was built around whichever was newest.
- **Evidence and display contradict each other.** The one evidence-weighted model, Global Read, gives the macro score,
  COT, CB tone and trend zero weight. Yet the tier score, the 20-day outlook and the scorecard still headline the
  pages.
- **Ten competing navigation surfaces.** The main nav (`js/commandHub.js`) is mounted on only 5 pages.
- **Project guidance is not auto-loaded.** `CLAUDE.md` was moved to `MD files/` on 2026-08-01, so assistant
  sessions, which wrote about 40% of commits, don't load it. It also contradicts itself on which page is the front
  door: `index.html` or `today.html`.

**Scale today:** 244 top-level pages (136 untouched since 1 Sep, 88 with no inbound link, 52 dead or duplicate);
`server.js` at 41,758 lines; 859 routes (65 with no consumer); about 26 bots, several running strategies whose edge
was later deflated; 1.95 GB tracked, 65% of it `analysis/` parquet.

---

## 3. Can the research record be trusted? The verdict audit

Every null, underpowered and validated entry in `js/deskEvidence.js` was audited against its code:
- **Checks:** lookahead, session/date alignment, units and signs, row accounting, whether the test could detect the
  effect at all, and whether the conclusion overreaches.
- **Classes:** STANDS (code read, sound), REOPENED (BUG, DESIGN or FRAGILE), UNVERIFIED (only shallow-checked, or
  not reproducible from the repo).

| Banked as | n | STANDS | REOPENED | UNVERIFIED |
|---|---|---|---|---|
| null / underpowered | 200 | 119 | **53** (19 bug, 34 design) | 28 |
| validated | 49 | 25 (8 robust, 17 plausible) | **13** (3 bug, 10 fragile) | 11 |

The full list is in `VERDICT_AUDIT.csv`.

**Patterns behind the reopened verdicts:**
- **Summer-time date shifts (the most common bug).** In BST a London-aligned bar is labelled with the previous UTC
  date. "Next session" then silently becomes "two sessions later" for about 58% of rows, and summer Fridays drop out.
  Affected: yield-move-fx-range, nonus-yield-gap-range and -direction, fear-gold, dispersion-crowded-week,
  squeeze-fuel.
- **NULL where the protocol says UNDERPOWERED.** About 20 entries have intervals that still contain the
  pre-registered effect, or designs that could not reach their own bar. Examples: stir-residual-catchup,
  one-range-forecast, rates-vol-gap-move, tag-x-persistence, curve-inversion, ys-long-breadth, cot-positioning-factor,
  nowcast-gap-cpi and vol-crush-drift. The rule exists (`research-protocol`); it was never applied to older entries.
- **Tests that could not see the effect.** Examples:
  - the ridge shrinkage in the yield ladders forced forecasts to the intercept;
  - the stir-residual placebo can't be passed by construction;
  - the spread-divergence mirror measures the market's own volatility clustering;
  - opening-range-break used hit rates only;
  - zone-engine used a stop a sixth of the zone size.
- **Conclusions broader than the test.** Examples:
  - credit-leads-equities used investment-grade spreads only, though the high-yield leg gave IC +0.26, p 0.002;
  - rotation-extreme never applied its "quiet index" condition;
  - funding-stress scored $1–2M SRF test operations, not the real $11–31bn draws.
- **Verdicts banked from assistant "memory" notes, with nothing in the repo.** Five entries could not be traced at
  all: yields-to-fx-direction, trend-following-fx, conviction-vote, execution-gate and reversal-hour.

**Five reopened verdicts where the fix changes the picture** (each re-checked by the lead reviewer):

| Entry | Defect | What happens when fixed (exploratory) |
|---|---|---|
| residual-pca-cot | COT for JPY/CAD/CHF read with the wrong sign: `fetch_cot.py:79-80` stores pair terms, and `tags.py:98-108` reads currency terms | Effect +0.003 (z 0.14) → **+0.044 (z 2.07)**; in-sample +0.030, out-of-sample +0.057; the mirror turns negative |
| yields-to-fx-direction | One-day lag on top of the change, so the next-day lead was never scored; Yahoo FX dated a day late in winter | Fixing the dates raises same-day coupling (USDJPY 0.255 → 0.336). 2y change → next-day **SPX t −3.0, NDX t −2.7** (~1,300-cell family) |
| macro-confluence (3 entries) | Liquidity leg is a 1-day change against 24 days on a forward-filled weekly series; the prereg says weekly against 24 weeks | Coded direction agrees with the registered one only 57% of the time; the "confluence" was curve + credit + a coin flip |
| gamma-real-iv | OI(D) → session D+1, before CME publishes; UTC daily bars with Sunday stubs; flip-only test | NY-close sessions with OI(D) → D+2, net GEX < 0: **+0.24 range, t ≈ 2.9** on NQ |
| stir-residual-catchup | Placebo can't be passed by construction | b +0.186 [+0.037, +0.342], positive on all 5 targets and in both halves |

**Validated results to downgrade or firm up:**
- **mv-dispersion-range (n = 9) and mv-vixterm-range (n = 14).** They rest on a bootstrap that collapses at small n:
  at n = 9 every resample is the original sample, so SE = 0 (lead re-check). Re-run with a firing-level bootstrap,
  all four cells cross zero. mv-dispersion-range is live in `js/rangePressure.js:42`.
- **dispersion-reset.** Its standard error is understated by about 30% at n = 26.
- **surprise-size never tests size.** It compares release days with non-release days.
- **Promoted on post-hoc choices:**
  - nq-down-week: banked on a post-hoc cut;
  - ladder-calibration: data changed after a failed run;
  - post-fomc-usd-drift: registered after the effect was seen; out-of-sample t 1.11.
- **The C.OG VIX family passes Holm only by a hair**, and its forward record has 0 scored events.

**What the evidence does support** (the audit's short list, in order):
1. forecast-pick and persistence-fix (walk-forward, embargoed, date-clustered)
2. implied vol as the σ input (iv-forecast, combined-range, cross-iv and iv-ladder agree)
3. VIX-curve width terms (us-extras-confirm and vol-curve-front, confirmed on untouched years)
4. the stress and month-end overlay (forecast-miss-shock-fx/idx, month-end-fx)
5. extreme-in-probability
6. horizon-reversion

For direction: cross-sectional carry (positive), COT state D, and post-FOMC drift (fragile).

---

## 4. Bugs found (file:line), with what they touch

> **Status, later on 2026-10-31: fixed on this branch**, each with a test that fails on the old code where one
> could be written (DATA_SPEC §5 #13–#21):
> - shared defects S1–S6
> - the QMR exit hour
> - GlobalLiquidity units and monthly lags
> - the levels-v2 live window
> - weekend stubs in runAnalyser, the zone pricer and the Level Atlas live plan
>
> **Not changed:** banked verdicts and live fitted parameters. Each affected result has a `RE-RUN` row in the
> register. The live ladder event multipliers need a refit on the M1 cache.
>
> **Two corrections to the table below:**
> - The "22-UTC callers" in the range-line / levels-v2 family are consistent with each other (all on the 22:00-UTC
>   broker day). The live levels-v2 window was the one that disagreed. Moving the family to London sessions is an
>   owner decision.
> - Python GlobalLiquidity does apply lags (in `gli.py`). They were too short for monthly series, the same as in
>   the JS engine.

**Shared defects. Fix these before any re-run, because they reach many studies.** ✓ = re-checked by the lead reviewer in the code or by a re-run; the others come from one audit agent with file:line evidence and should be confirmed when fixed.

| # | Where | Defect | Reaches |
|---|---|---|---|
| S1 ✓ | `js/volBacktestEngine.js:104-114` `fetchD1Aligned` | London-aligned bars labelled with the UTC start date, so a day early in BST; no weekend filter; no lockbox cut | crack_spread, dispersion, four_golds, nonus_yields, volume_rule_check, yield_move_fx_range studies; 2 direction nulls |
| S2 ✓ | `analysis/outcome_loop.mjs:38-42`, `dispersion_study.mjs:19-20`, `four_golds_study.mjs`, `crack_spread_study.mjs` | Block bootstrap with `block = min(10, n)`: SE = 0 at n ≤ 10, and the "95%" interval covers 45–62% at n = 17–24 | mv-* family, dispersion-reset, crack-blowout-range, fear-gold |
| S3 ✓ | `forge/vol.py:510-523` `tag_column` | Looks up event tags by the naive-UTC session start, so tags land one session late in BST (FOMC 2026-06-17 tagged on 06-18; NFP 07-03 dropped) | **Live** `js/forecastLadderParams.js` event multipliers, run_vol_iv, run_horizons |
| S4 ✓ | `scripts/cot-crowding-programme/fetch_cot.py:79-80` → `cot_weekly.csv` | JPY/CAD/CHF stored in pair terms with no marker in the file | residual-pca-cot (wrong sign); any future reader |
| S5 | `js/harness/features.mjs:137` `FeatureStore.at()` | Can return an old period's revision instead of the latest period; no staleness limit | every harness signal, carry |
| S6 ✓ | Yahoo FX dating (DATA_SPEC #16) | "Use the UTC date" is right in summer only; winter stamps carry the previous day's close | yield_asset_coupling; check `scripts/market-review/fetch.py` |

**Live-code bugs:**

| Where | Defect |
|---|---|
| ✓ `server.js:10816` `_qmrWalkTrade` | Has 5 parameters, but all 5 callers pass a 6th (`eodHour`), which is dropped. Every QMR run exits at the global 20:00, including per-instrument and walk-forward configs |
| ✓ `GlobalLiquidity/config.py:58` | Still `walcl/1000 - tga - rrp`: the 2026-10-17 net-liquidity unit fix (#8) missed this Python copy, so the USD block is about −876,617 $bn |
| `levelsV2Engine.js:100-118` vs `server.js:34732` | Live Asia window is 00–06 UTC, but the policy is learned on 22–04 UTC because `/api/levels-v2/learn` falls back to the 22 default |
| `js/forecastAnalyser.js` ~480 | `runAnalyser` scores Sunday 2-hour stubs as sessions and puts them into σ (also `local_decision_engine/lib/zonePricer.mjs:131`) |
| `js/globalLiquidityEngine.js` | Monthly series arrive about 3–4 weeks early (fixed week lags); `GlobalLiquidity/data.py` applies no lag |
| `server.js:34732, 35297, 34609`; `scripts/build_daily_open_votetrades.mjs:111` | `bucketM1IntoSessions` called with the 22-UTC default instead of `'Europe/London'` |

**Lockbox leaks** (no verdict changed, but the holdout is no longer clean for these families): v4 dirtag and stage1
run to 2026-09-28; the macro-confluence re-run scored to 2026-10-02; the fetchD1Aligned studies have no cap.

---

## 5. Direction, re-examined from first principles (`DIRECTION.md`)

**The gatekeeper (`scripts/direction-bar/bar.py`) does the right sums for the wrong scope:**
- **Its maths is correct.** The baseline has no lookahead and overlap is handled. One market's 20-day direction
  needs IC 0.16 to be seen in 20 years, which is far above any plausible macro edge. That part of the old answer is
  true.
- **Its cross-sectional gate is too weak to find carry.** It uses 8 currencies, monthly, from 2006, and has an MDE
  of IC ≈ 0.06–0.07. Carry has IC ≈ 0.05. Lead check: a monthly rank IC on 8 currencies has sd ≈ 0.38, so with
  T ≈ 240 the MDE is ≈ 0.068. A bar that can't detect the one factor already shown to work will call everything
  null.
- **Measurements start in 2006 because that's where OANDA starts.** FRED has the same currencies daily from 1971.
- **Hit rate is a poor currency.** It is 0.54–0.77 as efficient as a return test.

**Detectable effect size (IC, 80% power) by design:**

| Design | MDE (IC) |
|---|---|
| One market, 20 years | 0.11–0.16 |
| Cross-section, 8 currencies, 2006+ (current gate) | 0.060–0.068 |
| Cross-section, G10 monthly, 1976+ | 0.038–0.043 |
| Cross-section, G10 + 7 EM, 1995+ | 0.037 |
| G10 pooled, country-specific signal | 0.035 |

Plausible macro ICs are 0.04–0.10. **On the right designs, a real macro edge is detectable, and those designs have
mostly not been run.**

**The untested space.** Cross-sectional designs exist only for rate-differential changes, carry (positive), BIS
flows, USD funding and a little COT. Never tested:
- value / real exchange rate
- real-rate gap levels
- curve-slope gaps
- relative growth and inflation momentum across countries
- cross-sectional FX skew
- regime × factor
- **the composite market-state score as a forecaster.** It is the thing the dashboard was built to produce, and
  its only test (macro-confluence) is defective.

**"Untested" is currently treated as "null".** In `js/globalReadCore.js:40-80`, eight direction inputs are tier
`untested`: HMM trend, US yields, dollar tape, risk tone, today tape, real yields, VIX tone and CB tone. They get the
same zero weight as banked nulls. This is the mechanism behind "you instantly go null".

---

## 6. New rules, so this doesn't happen again

1. **Every Evidence Book entry gets an audit status**: `stands`, `reopened` or `unverified`, from
   `VERDICT_AUDIT.csv`. Only `stands` may be cited as "tested null" in prose, the brief or a design decision.
   `reopened` and `unverified` mean "we don't know yet".
2. **`untested` is not `null`.** Global Read and the brief must show the difference. Untested inputs belong in the
   forward ledger as research forecasters, not at weight zero with a "null" label.
3. **No verdict without code in the repo.** Memory-note-only entries are `unverified` until a script reproduces
   them.
4. **Apply the NULL vs UNDERPOWERED rule retroactively** (about 20 re-words, listed in `VERDICT_AUDIT.csv`
   under DESIGN).
5. **One date convention, enforced by a test.** London-session-dated bars get one helper, and a CI test runs the
   two DST weeks and the Sunday open (`DATA.md` has synthetic-data tests for this). The default-22 argument is
   removed, so callers must state their boundary.
6. **One bootstrap helper.** Delete the copied `drawBlock`. Event studies with n < 30 use a firing-level bootstrap or
   exact methods.
7. **Put a `CLAUDE.md` at the repo root** that points to the data-rules and research-protocol skills and names the
   front door. Assistant sessions then load the rules every time.
8. **Before re-using a verdict, read its code.** The review row in `VERDICT_AUDIT.csv` is the minimum. The audit
   found a problem in about one checked null in three.

---

## 7. The rebuild: a Market State Engine and one dashboard

The founding idea was right, and the data for it is largely already in the repo. What it lacked was one owner of
"state" and evidence that was trustworthy. The proposed layering:

```
L0  DATA          one point-in-time store, one session/date convention, one loader per type
                  (prices, rates/STIR, macro first-prints, credit, liquidity, funding/basis, COT/TFF, OI/IV, calendar)
L1  ECONOMIC      per economy (G10 + gold/indices): growth, inflation, policy path, real rate, curve, currency
    ENGINE        → each variable: level, change, prior-only percentile, freshness, vintage. Descriptive; no verdict needed.
L2  GLOBAL STATE  a small set of states: growth × inflation quadrant, liquidity impulse, stress (VIX term, credit),
                  USD funding, positioning crowding → one JSON document: /api/state (extends globalReadCore)
L3  EDGES         only Evidence Book entries with status `stands`, each attached to the state that activates it
                  (range/vol overlays today; direction candidates via the forward ledger)
L4  SYSTEMS       backtests and bots consume L3 only; nothing computes its own private "state"
```

**One dashboard, built on `/api/state`, answering four questions in order:**
1. **What is the world doing?** A global state banner, plus a G10 economy grid (growth, inflation, policy, real
   rate, curve, FX), each cell with freshness.
2. **What is unusual?** Variables at prior-only extremes, with what has historically followed (only `stands`
   evidence, with effect size and n).
3. **What does it mean for range and risk today?** The validated range/vol overlays: IV-based σ, VIX curve, stress
   and month-end, gamma.
4. **What does the direction research say?** The forward ledger of research forecasters scored against the
   baseline, labelled as research, plus the active pre-registered studies.

Plus a data-health strip (stale feeds, last vintage) and links to the evidence behind every number.

**What to archive** (proposal only; nothing moved; lists in `pages.csv` / `systems.csv`):
- the 52 dead or duplicate pages and 12 dead or superseded folders
- the 31 junk files at the root (`_*.log`, `_idx_*.json`, `vf.json`, `vfr.json`, `hr.json`, `rd.json`, `ff.json`,
  `oi_probe.json`, `vp2.json`, `test`, the stray worktree `wt-m6`, bot state and logs)
- the superseded versions in each duplicate family (volatility_bot v1/v2, Regime V2/V4 and RegimeOptimizer,
  fib_atlas_bot v1, oi_conf_bot/oi_vol_bot, which share one executor)
- bots whose edge has been deflated (YieldSpreadBot, the Vote/Fib Atlas family)

Old dashboards (`index.html`, `indexv2.html`, `desk.html`, `terminal.html`, `Todayv3.html`, `analytics-desk.html`,
`market-sense.html`, `daily-read.html`) redirect to the new page once it covers them. `index.html` first needs its
browser KV writer (`js/alerts.js`, which feeds the Gold, GoldV2 and ConfluenceBot bots) moved to the server.

---

## 8. Research agenda, ranked

**A. Fix shared code first (S1–S6 and the live bugs).** One PR, with tests. Without it, every re-run repeats the
fault.

**B. Re-runs justified by a specific defect** (register rows with status `RE-RUN`; same prereg, bug fixed):
1. residual-pca-cot: sign fix, with the registered placebo.
2. macro-confluence (3 entries): liquidity leg as registered (weekly vs 24 weeks); stop at the lockbox.
3. The S1 family: yield-move-fx-range (EURUSD already clears its gate), nonus-yield-gap (gilts already
   +0.12 [−0.001, +0.25]), fear-gold, dispersion-crowded-week.
4. gamma-real-iv on NY-close sessions, OI(D) → D+2, with the net-GEX arm.
5. squeeze-fuel with a London-clock 07:00 anchor.
6. funding-stress on real SRF draws (expect underpowered; say so).
7. The S2 family with a firing-level bootstrap (mv-vixterm, mv-dispersion, dispersion-reset, crack-blowout).

**C. New pre-registered studies, where a design flaw made the old answer uninformative:**
1. **yield-lead-next-day:** US 2y/10y change at the 15:30 ET print → next-day index and FX return. Confirm on
   unseen instruments and the forward record.
2. **stir-residual-catchup v2:** a scale-free placebo.
3. **credit-leads-equities, high yield:** the HY leg with a long junk series.
4. **spread-divergence-range:** a regression design controlling for the market's own vol.

**D. New direction studies** (`DIRECTION.md` §D; none is a banked null in new clothes):
1. `fx-xs-value-realrate-long`: G10 value and real-rate gap from 1976; EM7 as untouched holdout; baseline carry;
   MDE 0.043.
2. `xs-macro-momentum`: each country's growth, inflation and policy trends ranking its currency, bonds and
   equities; MDE 0.035–0.043; vintage-safe confirmation from 2013.
3. `release-relative-drift`: after a surprise in one of 8 economies, does that currency drift against the basket?
   About 10k releases; MDE ≈ 0.06σ.
4. Pooled post-decision drift across six central banks: about 1,000 events instead of 80.
5. `xs-carry-state-conditioning`: does the state engine time carry and value? Run alongside study 1; probably
   underpowered.
6. `market-state-composite-forward`: put the composite into `js/directionLedger.js` now, as a forward research
   forecaster. A forward record costs nothing and is the only clean out-of-sample data left.

---

## 9. Decisions for the owner

1. **Shared-code and live-bug fixes (§4):** approve a separate fix PR.
2. **Evidence Book status:** add the audit-status field; downgrade mv-dispersion-range (live), mv-vixterm-range and
   dispersion-reset; re-word about 20 NULL → UNDERPOWERED. The proposed changes are in `VERDICT_AUDIT.csv`; none is
   applied yet.
3. **Rebuild:** turn `today.html` into the state dashboard, or build a new `state.html` on `/api/state` and redirect
   the rest.
4. **Archive moves (§7):** approve them as a batch, or review the list first.
5. **Order of work:** suggested A → B1–B3 → D1/D2/D6 → the dashboard on `/api/state` → C → the rest.
6. **Finish the 28 unverified entries:** mostly the bank-credit, funding and some C.OG and vmc studies, which were
   located but not traced line by line.
