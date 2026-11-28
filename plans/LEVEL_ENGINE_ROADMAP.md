# Level-analysis and level-interaction prediction engine: roadmap

Written 2026-10-10 for owner review.

**The deliverable:** a **validated** system that identifies and ranks important price levels and gives, for each level, probability-weighted, prospectively checked answers to five separate questions:

| # | Question | Outcome type |
|---|---|---|
| Q1 | Will price reach the level within horizon H? | reach probability |
| Q2 | Will it touch this level before another level? | barrier race |
| Q3 | After a touch: rejection, continuation, or consolidation? | reaction |
| Q4 | How far and how long to the next level? | movement and time distribution |
| Q5 | Is there a trade with positive expectancy after costs? | net R |

The volatility forecast, the time-aware probabilities (S1 shadow) and the consolidation model are **inputs** to Q1, Q2 and Q4, not the product.

**Rules carried throughout:**
- every claim tested against a baseline and a placebo;
- chronological validation and multiple-testing control;
- correlated instruments are not treated as independent;
- registration before outcomes;
- the forward block (`data/m1_forward/`) is preserved for one final confirmation;
- production unchanged unless a separately approved evaluation supports a change.

---

## 1. Audit: what exists, what is validated

### 1a. Level sources: implemented vs validated

**Status key:**
- **Implemented:** code emits the level.
- **Validated:** a registered, out-of-sample test found information beyond geometry or placebo.
- **Null:** tested and found nothing.
- **Untested:** implemented, never tested as a level.

| Family | Code | Consumed by | Reach (Q1/Q2) | Reaction after touch (Q3) | Trade (Q5) |
|---|---|---|---|---|---|
| Forecast ladder lines (export O-H/O-L/HL, chosen ladder, Live Range moving lines, weekly/monthly) | `forecastLadder.js`, `forecastLadderPersist.js`, Live Range | page, exports, Daily Read, research | **Validated as geometry:** calibrated next-line and band reach (`line-touch-reach`, `band-reach-from-here`, IEP E1, Stage C P1 +7–40% Brier over the page's displays) | **Null:** path-neutral vs control lines (`level-touch`, `live-range-line-race`, path map, `directional-rescore`) | **Null net:** every fade/continue book (`live-range-book`, `-walkforward`, line-touch wide scan: gross +0.19R, net fails) |
| COG lines (the bot's) | `cogBands`, `volatilityBotProducer.js` | **volatility_bot (live)** | Too wide vs names: "median" hit 27% (Stage B P2) | Not tested separately | Bot P&L outside this programme |
| OI walls, max pain, gamma flip, GEX | `oiZones.js`, `gexLadder.js`, `fullBookGex.js`, `levelHeat.js`, `levelExpectation.js`, `oiReachability` | OI dashboard, exports, OI bot | `oiReachability` implemented; **not validated** | Walls **null** vs placebo (`wall-placebo`); max pain **null**; gamma-at-level phrases (`levelExpectation`) **untested** | OI bot live; `gex-range` validated for **range only** (NQ) |
| Volume profile (POC/VAH/VAL, naked POC) | `levelSources.volume_profile`, `nakedLevels.js`, `liquidityLevels.js` | confluence exports, Asia nPOC page | Not tested as a reach target | **Null inside the confluence book** (204 tests, `live-range-confluence-book`) | Not tested alone |
| Structural (swings, fib projections, impulse ranges) | `structural-fibs.js`, `fibProjection.js`, Fib Atlas engines, `rangeFibEngine.js` | Fib Atlas bots (live), range-fib pages | — | `swing-structure-vwap`: "is this THE high" lifted 1.3× (context, not validated) | Fib Atlas: backtest Sharpe 0.74 after the lookahead fix; live diverges from backtest (four known causes). **Not independently validated** |
| Session references (Asia/London high-low, prior day high/low, daily open) | `levelSources`, confluence modules | exports, pages | Geometry | **Null:** session extremes = placebo (IEP-TIME H2); daily open and range lines null (`level-touch`, which did NOT test prior-day high/low: audit 2026-10-24); prior-day replication null (IEP Stage 2) | Opening-range break null |
| Round numbers (Osler at/beyond) | `roundNumberLean.js` | lean labels | — | **Untested** as a registered test | — |
| VWAP / bands / OU bands | VWAP engines, `vwapStretchCore.js` | VWAP pages | — | `vwap-extension-fade` **null** net (gross positive, 3–8× under cost); `daily-band-fade` **null**; OU bands **underpowered** | Null |
| Confluence zones (multi-source) | `confluenceZoneExport.js`, `macroFxZoneEngine.js`, `levelConfidenceCore.js` | C+Z export, Telegram v2, ConfluenceBot | — | **Null** (`zone-engine`: 83k trades negative; confluence book) | Null |
| Order book (OANDA order/position book) | `positionBookHistory.js`, `bookStress.js` | pages | — | **Null** at p75 (Analysis 2.0 §3) | — |

### 1b. What the five questions already have

| Question | Validated capability | Gap |
|---|---|---|
| Q1 reach | Calibrated reach of **ladder lines** by clock, distance and range consumed (IEP E1; Stage C P1, prospective S1 running). The research shows **reach is geometry**: distance ÷ (σ·√vol-time left), plus range consumed; level identity adds nothing (session extremes = placebo; extension adds +2.4pp) | No **general reach model for any level price** from any source; no registry feeding it |
| Q2 touch-before | Random-walk race b/(a+b) holds at ladder lines (path map); real = placebo | Not packaged as an output |
| Q3 reaction | **No validated reaction information at any tested level family** | Untested families: round numbers (Osler), gamma sign at the level, expiry-day strike pinning, futures-volume nodes |
| Q4 movement and time | Remaining travel by hour (layer 5, near-pass), `extreme-in-probability` (validated), Live Range | Time-to-next-level distribution not packaged; layer-5 calibration near-pass |
| Q5 trade | **Nothing validated at levels.** Validated elsewhere: rich-IV break (forward paper record running), yield-spread sleeve (daily, not level) | Expectancy reporting framework (cost, spread/ATR gate) exists per study, not as an engine output |

**Implication.** The engine can be built and validated now for Q1, Q2 and Q4, because those are geometry plus the volatility forecast. Q3 and Q5 have **no validated signal yet**. Unless a remaining level family passes a placebo test, the honest output for Q3 is the geometric base rate and for Q5 is "no positive-expectancy trade". The engine must say so rather than manufacture conviction.

---

## 2. Roadmap

Each phase has a registration, an acceptance rule and a stopping rule. Ranked by value × readiness; risk shown.

### Phase 0: running now
- **S1 shadow** (time-aware probabilities; `forge/VF3_SHADOW_P1_PREREG.md`): prospective, 60 valid sessions (about 13 weeks).
- **Consolidation shadow:** E2-hour frozen. Its prospective logging needs the same recalibration rule as S1; register it as S2 before go-live.
- **Chosen-ladder forward scorecard** (Daily Plan): continues.
- **Dependency for later phases:** S1's acceptance decides whether time-aware reach probabilities can be trusted as engine inputs.

### Phase 1: point-in-time level registry (no outcomes; value high, risk low)
- **What:** one registry built on the existing `levelSources.js` contract that emits, for each instrument and session, every level known **at the decision time**, each with source, family, price, creation time, expiry and lineage (which inputs it derives from, for later de-duplication).
- **Families:** ladder lines (export and chosen), COG lines, OI walls/GEX/max pain (with OI publish-lag timing), volume-profile nodes and naked POCs, swings and fib projections, session references, round numbers, VWAP bands.
- **Data checks:**
  - point-in-time availability per family (OI publish lag; volume profile from tick counts only, so FX volume is a proxy);
  - coverage per instrument and year.
- **Acceptance:** reproduces the levels the live pages and exports show on sampled dates (parity check). Every family has a stated availability time.
- **Stop:** a family that cannot be reconstructed point-in-time is excluded and listed. It is not approximated.

### Phase 2: reach and race probabilities for any registry level (Q1, Q2, Q4; value high, risk low)
- **Model:** geometry first.
  - Reach: P(level reached by horizon H), H ∈ {1 h, 4 h, session end}, from z = distance ÷ (σ_chosen·√vol-time left), range consumed, extension state, hour.
  - Race: P(level A before level B), against the random-walk b/(a+b) and the calibrated reach model.
  - Time-to-reach and movement-beyond distributions.
- **Baselines:** naive geometry (Brownian reflection on σ_daily·√calendar time); the page's current displays where they exist; and the S1 tables for ladder lines.
- **Test the null of level-identity invariance explicitly:** does the family change reach or race probability beyond geometry? Expected answer: no, from the session-extreme and wall placebo results.
- **Acceptance (chronological; fit < 2022, dev 2022–24, non-independent confirmation 2025–26):**
  - Brier skill vs naive geometry, lower bound > 0;
  - decile calibration ≤ 3pp with the S1 level-maintenance rule;
  - by family and class, no interval wholly below 0.
- **Stop:** if the calibrated geometry model is not better than naive geometry, ship naive geometry with calibration monitoring. No further feature search for Q1/Q2.

### Phase 3: reaction research on the untested families (Q3; value high if positive, risk high, likely null)
- **Families (registered together; one family-wise test plan):**
  1. round numbers (Osler: at = fade, beyond = follow);
  2. gamma sign at the level (`levelExpectation`: long-gamma pin vs short-gamma break; NQ/SPX where the per-strike archive exists);
  3. expiry-day high-OI strikes (pinning in the final hours);
  4. futures-volume nodes from the NT8 history (real volume, indices only), if Phase 1 shows point-in-time coverage.
- **Protocol (fixed):**
  - every touch vs **matched placebo levels** (same distance, time, instrument, regime) with the same race and outcome window;
  - continuation / rejection / consolidation defined as in IEP;
  - **BH-FDR 10% across families × outcomes**;
  - effect ≥ 3pp, same sign in both halves and in the non-independent confirmation block, ≥ 60% of instruments;
  - then **net of cost** at the registered spread table.
- **Stopping rule:** if no family passes, **stop level-reaction research**. Q3 output = geometric base rate, labelled "no level-specific reaction found". Reopen only with a new information source (real order flow or exchange volume beyond the NT8 delay).

### Phase 4: level strength and confluence (only if Phase 3 finds at least one family)
- **What:** a strength score that counts **independent** evidence only.
  - Decorrelate families by lineage (for example, a ladder line and the COG line derived from the same σ count once).
  - Weight each by its validated incremental lift over geometry.
- **Acceptance:** the score's top-decile levels show a higher placebo-adjusted reaction effect than single-family levels, out of sample.
- **Stop:** if Phase 3 is null, **skip**. Strength = reach probability, and confluence counts are shown as descriptive only, with the existing null labelled.

### Phase 5: scenario engine (value high, risk medium; output layer)
- **What:** per instrument and session, a small set of probability-weighted paths built **only** from validated components:
  - the next levels up and down with reach probabilities (Phase 2);
  - race odds between them;
  - expected movement and time (Phase 2 plus Q4 tools);
  - consolidation probability (S2);
  - range regime (validated range effects: VIX inversion, IV ÷ σ, GEX range, release days).
- **Invalidation:** the level whose touch moves a scenario probability by a stated amount, computed from the same model rather than asserted.
- **Direction:** neutral (50/50) unless a validated directional input exists (none at the intraday level today; yield-spread sleeve is daily FX, so it may enter only as a separately tested prior).
- **Trade potential:** expected R net of the registered costs for each "go to the next level" path, using the race probabilities. **Default "no trade"** unless the net expected R interval clears zero in the prospective log.
- **Acceptance:** the scenario probabilities' own calibration (Brier, reliability) in the prospective shadow.

### Phase 6: prospective validation and the single final confirmation
- **Engine shadow:** the scenario engine logs immutable predictions like S1 (write-once, versioned, outcomes separate).
- **Evaluation:** one confirmatory look after 60 valid sessions:
  - calibration;
  - ranking (AUC / Brier skill vs baselines);
  - realised outcomes;
  - net-of-cost expectancy for any trade claim.
- **The forward block** (2026-08-21 → go-live) plus those sessions are scored **once**, under a separately registered final plan, for the decision that matters most: does the engine's level-probability output beat the current displays and naive geometry, calibrated, out of sample?
- **Promotion to production** needs that pass plus your approval. Otherwise it stays a shadow.

---

## 3. Dependencies

```
S1 (time-aware probabilities) ──► Phase 2 reach inputs ──► Phase 5 scenarios ──► Phase 6 confirmation
S2 (consolidation) ────────────────────────────────────────►┘
Phase 1 registry ─► Phase 2 (all families) ─► Phase 3 (reaction) ─► Phase 4 (only if Phase 3 positive)
Chosen ladder (Stage B) ─► σ for every phase
```

## 4. Stopping rules (global)
1. **No new level family** enters Phase 3 without point-in-time reconstruction (Phase 1).
2. **Reaction research stops** after one registered Phase 3 pass with no family surviving; it is reopened only by a genuinely new data source.
3. **No directional or "trade" output** is shown unless a registered test found net-positive expectancy and the prospective log confirms it. The engine's default is probabilities without conviction.
4. **Any prospective failure** returns the component to research with a new version and a new window. No retuning against the same window.
5. **Production stays unchanged** throughout. Each promotion is a separate, approved evaluation.

## 5. Ranked next actions
| Rank | Action | Why first | Risk |
|---|---|---|---|
| 1 | Phase 1 registry (point-in-time, parity-checked) | Every later phase needs it; no outcomes involved | Low |
| 2 | Phase 2 registration + build (geometry reach/race/time for all families) | Biggest validated capability, directly the product's Q1/Q2/Q4 | Low |
| 3 | S2 consolidation shadow registration (with the S1 recalibration rule) | Feeds scenarios; already frozen | Low |
| 4 | Phase 3 single registered reaction test of the four untested families | The only route to Q3/Q5 signal; likely null, so time-boxed | High |
| 5 | Phase 5 scenario engine shadow | Product layer, once 2 (and 3) are known | Medium |

---

## 6. Status (2026-11-28): the engine's output layer is in the Desk Terminal

**Built:** `js/terminal/levelEngineCore.js` (pure, tested in `js/terminal/levelEngine.test.mjs`) and its card `js/terminal/levelEngineView.js`, in the Insight tab's
"Level engine" pill (surface `panel.insight.reach`, now a `preview` surface: owner-only until switched on) and the command `REACH <market> <price> [<second price>] [ROS|EOD|EOW]`.
It replaced the Level reach board (`reachView.js`, retired; `reachCore.js` stays as the session/ladder reader). For any typed or clicked price it shows, each number with its
Evidence Book id and verdict chip read live from `js/deskEvidence.js`:

| Question | What the card shows | Rests on | Verdict |
|---|---|---|---|
| Q1 reach, from now | P(touch) by 22:00 London and within 30 min / 1 h / 2 h / 4 h: the frozen Phase 2 model M1 (`js/levelReach.js`, the S3 shadow's model) | `level-p2-reach` | validated (banked 2026-11-28 from the 2026-10-11 run) |
| Q1 reach, today | P(touch at some point in the session) from the forecast ladder, measured from the London open | `ladder-calibration`, `day-recon-p90-boundary` beyond p90 | validated / context |
| Q1 reach, this week | from Monday's open on the reverting weekly ladder; plus from now to Friday's close as plain geometry | `horizon-reversion`; geometry shown as context | validated / context |
| Q1 level identity | "where it is, not what it is" | `level-p2-identity` | null |
| Q2 race | up first / down first / neither by the horizon (two-barrier random walk scaled so each level's reach matches M1), and b/(a+b) with no time limit | `level-p2-race` (a model does not beat b/(a+b)) | null (geometry is the answer) |
| Q4 on the way | chance of going 0.25 / 0.5 / 1 sigma the other way before the level is touched, by the horizon and with no time limit | geometry; the validated stop-odds model (`vol-layer-stops-confirm-skill`) is named but **not wired** | context |
| Q4 drawdown layer | after a 20-day S&P fall of 2% or more, FX x1.067 / index x1.028 wider, as a separate column beside the base numbers (never replacing them); spx20 from `/api/drawdown-shadow` | `drawdown-forecast-error-fx` / `-idx` | validated (forward shadow record research-only) |
| Q3 after a touch | next-line odds (p50 to p75 ~50%, p75 to p90 ~40%); X7 next-rung odds by London window for NQ / GOLD / EURUSD | `line-touch-reach`, `exhaustion-v2-lockbox` | validated |
| Q3 reaction | fade or follow at the touch: placebo after costs | `level-context-engine`, `level-near-miss-entry`, `live-range-line-race` | null |
| Q5 trade | none shown; direction never implied | (stopping rule 3 above) | n/a |

**No lookahead:** bars later than the clock are dropped inside the core; with the time machine (`?asof=`) the clock is the as-of time and the forecast, bars and spx20 come from the saved records (a feed with no record at that time says so).

**Phases this completes:** the Phase 2 output for any level price (reach + race + time-of-reach horizons) is now on the desk, and the Phase 5 scenario card in its honest form (validated reach and race, reaction = the null, no trade). Phase 1 (registry) and Phase 3 (reaction research; its stopping rule has fired: every family tested since is null) are unchanged.

**What remains:**
1. **S3 forward read** (`forge/LEVEL_SCENARIO_SHADOW_PREREG.md`): the one look at 60 valid sessions; until then M1 is validated on history only (E-conf was non-independent).
2. **Wire the stop-odds model** (`vol-layer-stops-confirm-skill`) into "On the way" in place of the plain geometry (needs its coefficients exported to JS; research-side task).
3. **Registry levels on the card:** the card scores a typed price; listing the day's registry levels (pivots, prior high/low, VWAP, fibs) with their reach needs the structural confluence artifact in the terminal, as `level-scenarios.html` does.
4. **Beyond 3 sigma and before 03:00 London** M1 has no answer (its domain); the card says so instead of extrapolating.
5. **Weekly from-now** is geometry only; a calibrated multi-session reach model is not built.
6. **Phase 6** (engine shadow + one confirmatory look) is not started for the card itself; the S3 shadow covers M1.
