# Vol Forecast V3: Stage A audit (inventory, dependencies, archive validity, faults, redundancy)

Written 2026-10-10 for owner review.

**Read-only throughout.** No production code, KV entry, job, parameter, endpoint or live behaviour was changed. The production archive was read only through its existing GET endpoints. **No forecast was scored, and no outcome was examined.** Stage B (baselines) waits on the decisions in §9.

**Sources read:**
- the page: `vol-forecast-v3.html` (5,868 lines);
- the scheduler `js/volForecastScheduler.js`;
- the engines: `js/volForecast.js`, `js/forecastLadder.js`, `js/forecastLadderParams.js`, `js/forecastSigma.js`, `js/forecastLadderIvAdj.js`, `js/forecastLadderPersist.js`, `js/forecastLadderReverting.js`, `js/hitRateBackfill.js`;
- the server routes for `/api/vol-forecast*` and `/api/volatility-bot/plan`;
- `kv.js` and `_worker.js` (retention gates);
- the downstream readers (bots, pages).

---

## 1. The system in one picture

```
RAW INPUTS (all strictly before the session unless marked LIVE)
 OANDA D1 mid, 800 bars (FX, gold, commodities) ─┐            Yahoo D1 (NQ=F; ^GSPC ^DJI ^RUT ^GDAXI ^FTSE: incumbent only)
 OANDA D1 NY-close for SPX/US30/US2000/DE30/UK100 (ladder family only, since 2026-10-07)
 ForexFactory week feed (via econCalendar) ───────┤            FRED (carry legs; GVZ for the harIv shadow)
 CBOE VIX/VXN/VIX3M/VIX9D/GVZ, QuikStrike 30d ATM (IV exports) ┤   OANDA H1 since London midnight (LIVE, session tracking)
                                                  ▼
 runVolForecast()  22:00 UTC Mon–Fri (+ restarts / manual refresh) → KV vol_forecast_latest, vol_forecast_<date>, vol_forecast_index
   ├─ A. INCUMBENT "COG-band" forecast  (volForecast.computeForecast → _buildOutput)
   │     σ_inc = YZ-30 (fx, commodity) | GARCH(α.06, β.87 interim) (index)  × newsMult (US-only, ≥1.0)
   │     hl_median/hl_75 = COG BM constants × σ_inc;  oc/oh/ol_median/75 = COG half-normal × σ_inc (oh = ol = oc)
   │     hl_5d/20d, oc_5d/20d = ×√5, √20;  vol_pct, cone 5/21/63d, vol-of-vol, vol_accel, term_structure, range_efficiency, realised_skew
   │     drift_d, drift_read; oh_v2/ol_v2 (drifted-BM, legacy); shadow σs: yz/hv20/ewma.90/legacy
   ├─ B. FITTED LADDER ("Forecast", the export)  (forecastLadder.buildLadder)
   │     σ_lad = forecastSigma(bars, estimator per instrument: yz_10 ×16, ewma_094 ×14, yz_20 ×2, ewma_090 ×2)
   │     × event_mult(tag per instrument: FOMC/NFP/CPI/high/holiday/none, two-sided, fitted)
   │     rungs = fitted width[q][p50,p75,p90] × σ   for q ∈ {hl, oc, oh, ol};  weekly/monthly own fitted widths × √h
   │     ladder_weekly_rev / monthly_rev: reverting σ_h (half-life φ, 250-bar mean), own widths
   ├─ C. Shadows on the record: har (level HAR, GK-RV), harLog (HAR-log, NY-close), harIv (GVZ, gold)
   └─ carry drift (broker financing + FRED legs), FX only
 On demand (server, not archived):
   D. IV-adjusted ladder  σ_adj = σ_lad · exp(k(ln(IV/σ_lad) − μ))           /ivadj-ladder
   E. Persistence(+IV) "chosen" ladder  σ_new = σ_used·exp(β·(x − mean)), x = regime, res1, res5, weekday (+ iv_sig)   /persist-ladder
   F. IV ladder (pure IV swap, archived export)   G. frozen weekly/monthly ladder (bars before period start, event ×1.0)
   H. Session status (LIVE, H1 since London midnight): hl, oc, oh, ol, reach times, bias, shape, outlook, touch_prob, path efficiency, Amihud
   I. Volatility-bot plan: COG bands × platform σ_inc (NQ: COG close-to-close HV-30)
   J. Analysis panels: hit rates, path stats, intraday profile, event impact, vol intelligence, weekly tracker, zones, compare/reference
 Client-side (page only):
   K. card ladder (p50/p75 from the ladder via session targets; p90 = p75 × 1.43), _rangePctl, _reachPct, _breakoutProb, _dayVerdict,
      _setupScore, calibrated exports (HL × research recal factors), COG exports (_cogBands, cc-HV for NQ/EURUSD), position sizes
```

## 2. Calculation inventory

**Columns:**
- **PIT:** inputs available at the forecast timestamp.
- **Changes forecast?** D = changes a published band directly; S = shadow or alternative published separately; I = information only.
- **Use:** whether production or a downstream consumer reads it.

| # | Calculation | Formula / implementation | Inputs, source | PIT | Target, horizon | Changes forecast? | Overlaps with | Evidence / limits | Use |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Incumbent σ | YZ-30 (fx, commodity), GARCH α .06 β .87 ω floor (index); `volForecast.js` | OANDA D1 800 bars; Yahoo for NQ and cash indices | Yes (completed bars only) | next-day σ | D (COG family) | B1, C1–C3, E | Calibrated by hand against a "reference" in June 2026 (VOL_CALIBRATION_TRACKER); **index GARCH β "interim, pending grid search"**; Yahoo cash σ 14–28% low for 5 indices (DATA_SPEC fault 2, **still in A1**) | Cards, Levels table, Hit Rates, alerts, **Volatility Bot (I)**, ConfluenceBot, GoldV2 |
| A2 | Incumbent news multiplier | Max of hand-set ×1.05–1.21 over US high-impact titles; floors at 1.0 | ForexFactory feed | Yes (scheduled) | that day | D (scales σ_inc) | **B2 (two systems)** | Hand-set from 1–2 reference days; one-sided; US-only | Cards' news chip (shows this ×), bot |
| A3 | COG band constants | HL p50/p75 = BM constants × σ; OC = OH = OL = half-normal × σ (symmetric) | A1 | Yes | daily | D | B3 | Uniform since 2026-08-17. OH = OL = OC by construction; the fitted ladder found that wrong (OH/OL ≠ OC) | Cards, Levels table, bot, hit rates |
| A4 | Multi-day incumbent | hl_5d = hl × √5, hl_20d = × √20 (also oc/oh/ol) | A3 | Yes | 5d / 20d | D | B4, B5, G | √time is ~12–15% too tight for index monthly (STYLIZED_FACTS); reverting validated better (`horizon-reversion`) | Weekly tracker, weekly exports (archived) |
| A5 | Vol state | vol_pct (252d), cone 5/21/63, vol-of-vol, vol_accel, term_structure, range_efficiency, realised_skew | A1 series, D1 | Yes | — | I | E (regime) | Descriptive; no validation | Card cap, details sheet, `_setupScore` |
| A6 | Drift | d = 14-day μ / σ_inc; percentile on own history; anatomy (carry, t-stat) | D1, carry | Yes | — | I (the drift line is frozen into the export text) | — | Tested: no direction at touches (`directional-rescore`); descriptive | Export "Drift" line (TradingView parses it), cards |
| A7 | v2 drifted-BM OH/OL | `_bmMaxQuantile(±d)` × class corr × σ_inc | A1, A6 | Yes | daily | S (archived export v2) | B3 | Rejected: over-corrects 3–4× (forge/drift.py) | Fallback only (session targets when no ladder) |
| A8 | Shadow σs | yz, hv20, ewma .90, legacy RS-EWMA / GARCH .91 | D1 | Yes | — | I | — | Compare-table only | Archive compare |
| B1 | Ladder σ | `forecastSigma(bars, est)`; estimator per instrument from the walk-forward fit | OANDA D1 NY-close (indices since 2026-10-07; FX and gold always) | Yes | daily | **D (the export)** | A1, C, D, E | `forecast-record-pit`: calibrated on average (HL p75 24.7%), skill 4.9% vs climatology; **busy days too wide, quiet too narrow** | Export, charts, Daily Read, Vote Atlas v4, IEP targets |
| B2 | Ladder event multiplier | params.event[tag], fitted, two-sided (e.g. EURUSD FOMC 1.244, none 0.946, holiday 0.909) | FF feed per instrument currencies; null feed → ×1.0 | Yes | daily | D | **A2** | Fitted walk-forward; `event-layer` ledger; FF impact labels are the feed's | Export |
| B3 | Ladder widths | Quantiles of realised ÷ σ per q × rung, last walk-forward fold (trained to 2025-08-19), generated 2026-09-29 | fitted params | Yes (frozen) | daily | D | A3 | OOS exceedance in params; the weekday skew stays (Mon 19.3% / Thu 29.4% HL p75, IEP-TIME) | Export |
| B4 | Ladder weekly/monthly | Fitted horizon widths × σ√h | B1 | Yes | 5d / 20d | D | A4, B5, G | Monthly n_effective 117 (overlapping); √-h σ | Weekly/monthly exports, charts |
| B5 | Reverting weekly/monthly | σ_h² = Σ[V̄ + φ^k(σ_t² − V̄)], own widths | B1 series | Yes | 5d / 20d | S | A4, B4 | **Validated** (`horizon-reversion`: weekly pinball 0.968, 33/33) | "Reverting" export and chart mode |
| C1–C3 | har / harLog / harIv | HAR on GK-RV (level); HAR-log NY-close; HAR + GVZ (gold) | D1; FRED GVZ | Yes | daily | S | B1, D, E | harLog = layer-3 HAR-800 (frozen in the **lockbox**); not distinguishable from IV-adjusted (SEARCH_BREADTH) | Archive, har-shadow page |
| D | IV-adjusted ladder | σ_adj = σ·exp(k(ln(IV/σ) − μ)), fitted k, μ; NY-close params since 2026-10-06 | QuikStrike 30d ATM (FX majors), VIX/VXN, GVZ, crosses from legs | Yes, but **QuikStrike capture can fail silently** (OI capture guards) | daily | S | E, F, C3 | **Validated** (`combined-range`, `cross-iv`, CALIBRATION 28/28) | Export (archived), chart mode |
| E | Persistence(+IV) "chosen" | σ_new = σ_used·exp(β·(x − x̄)), x = regime, res1, res5, weekday 1–4 (+ iv_sig) | D1, IV | Yes | daily | S | B1 (corrects it), D | **Validated** (`forecast-persistence-fix`, `forecast-pick`: 0.964 of plain with IV) | **First item in the Export menu**; Daily Plan |
| F | IV ladder | σ := IV (pure swap) | IV | Yes | daily | S | D | `iv-ladder`, `iv-ladder-gold` | Archived export |
| G | Frozen period ladder | B with bars strictly before the week/month start, event ×1.0 | D1 | Yes | week / month | D (weekly charts) | B4, B5 | Causal by construction | Weekly/monthly chart modes |
| H1 | Session metrics | hl, oc, oh, ol from H1 since London midnight; reach times by **H1 close** (directional) or rolling H−L | OANDA H1 (LIVE, incl. the in-progress bar) | Live | intraday | I | IEP / forecast_history use **bar high/low** | Definition differs from research and from p90 "hit" (uses high) | Cards, Levels table, Daily Brief |
| H2 | touch_prob, path efficiency, Amihud | Brownian touch with time left = (24 − H1 count)/24 | H1 | Live | rest of day | I | K3, Live Range | **"Not a backtested claim"** (code comment); calendar time, not vol-time | Session payload |
| H3 | Bias / shape / outlook words | Thresholds on oh/ol ratios, \|oc\|/hl, hl ÷ hl_median | H1, A3 | Live | — | I | — | Heuristic, unvalidated | Cards, Levels table |
| I | Volatility-bot plan | COG bands × A1 σ (NQ: cc-HV-30); HAR path disabled | A1, cc-HV | Yes | daily | **D for trading** | A3 | — | **volatility_bot (live)** |
| J1 | Hit rates | Rolling incumbent forecast per day (H1 since London midnight), touch % and time for **incumbent** OH/OL/HL med/75 | OANDA D1 + H1 | Rolling | daily | I | Daily Read / forecast_history score the **ladder** | Scores the COG levels, not the export; `OANDA_ENV` defaults to "practice" in this module ("live" in the scheduler; env is set, so latent) | Hit Rates panel |
| J2 | Path stats | P(next rung \| this rung) = OOS exceed(next) ÷ exceed(this), static | ladder params | Yes | daily | I | T7 band read, IEP, `line-touch-reach` | **Ignores time of day**; research shows time left dominates (`live-range-clock`, IEP-TIME) | Path panel, details |
| J3 | Intraday profile | Hourly share of range (UTC) from session-stats | H1 | Rolling | — | I | Live Range vol-time profile | Descriptive | Panel |
| J4 | Event impact | Ratio of session audits on event days by type | `vol_session_*` | Rolling | — | I | B2 | Descriptive | Panel |
| J5 | Vol intelligence strip | Cross-asset ranking of the forecast state | A, B, spreads | Live | — | I | Surface Lab | Descriptive | Market strip |
| J6 | Weekly tracker | WTD vs hl_5d (incumbent √5) | A4, H1 | Live | week | I | B4, B5 | Uses the √5 incumbent, not the validated reverting form | Panel, weekly export |
| J7 | Confluence zones | Fib / pivots / round numbers / forecast levels clustered | D1 | Yes | — | I | — | `zone-engine`, ConfluenceBot verdict: **no edge** | C+Z export |
| J8 | COG reference / compare | Pasted COG lines vs ours | user paste | n/a | — | I | — | Calibration aid | Ref panel |
| K1 | Card ladder | up50/up75 = ladder O-H/O-L (via session targets); **up90 = up75 × 1.43** (half-normal ratio) | B, H1 | Live | daily | I (display) | B3 has a **fitted p90** | p90 shown ≠ export p90 | Cards |
| K2 | `_rangePctl`, `_reachPct`, `_dayVerdict` | Piecewise / half-normal percentiles on **incumbent** hl_median/hl_75 and ladder O-H | A3, B, H1 | Live | — | I | — | Mixed definitions in one widget | Cards |
| K3 | `_breakoutProb` / `_rangeExhaust` | 2·(1 − Φ(remaining / √timeLeft)), timeLeft from the **UTC** clock fraction | A3, H1 | Live | rest of day | I | H2, Live Range (validated) | Unvalidated; UTC, not London, not vol-time | Cards ("x% to median"), Levels |
| K4 | `_setupScore` | Points for cone, VoV, weekly bias, consumed | A5, H1, J6 | Live | — | I | — | Heuristic, unvalidated | Levels table sort |
| K5 | Calibrated exports | HL fields × class factors from `/api/vol-forecast-research` (fx, commodity) | research run | Yes | daily | S (archived) | E | Research-derived; index held | Archived exports |
| K6 | COG exports | `_cogBands(vol × mult)`; NQ and EURUSD σ = cc-HV-30 | A1, cc-HV | Yes | d / w / m | S | I | Matches the bot's band set | COG exports |

Also present, information only: carry drift (FX), jump-diffusion chips, implied-vol chips, vote chips (Level Atlas `voteDecision`), M5 charts with hit chips, position sizer, Daily Brief panel.

**Non-forecast panels and their downstream consumers** (none has a predictive target, so none is scored):
- level alerts (Telegram, off by default);
- vote panel (reads the bot's vote, consumed by volatility_bot_v2);
- archive, compare and reference tools;
- Live Range and Daily Plan links (separate pages, with their own records).

## 3. What each displayed forecast is made of

| Displayed | Built from | Note |
|---|---|---|
| Card cap ("x% vol, nth pct, ↑exp") | A1, A5 | Incumbent σ (Yahoo for cash indices) |
| Card ladder ticks Low/High, busy, big | K1 → B (p50/p75) + A3-style ×1.43 (p90) | Two families in one widget |
| Card "range … nth · x% to median" | K2, K3 on A3 | Incumbent HL, Brownian, UTC clock |
| Card "net … nth" | K2 on the ladder O-H/O-L median | — |
| News chip "CPI ×1.11" | A2 | **Not** the multiplier the export uses (B2, e.g. EURUSD CPI ×1.024) |
| Chart lines, "Forecast" mode | B (incl. fitted p90) | Matches the export |
| Chart lines, other modes | D, E, B4/B5/G, A3/K6 (COG), I (bot) | Each labelled |
| Levels table | A3 levels (oc_median/oc_75) + H1 hit flags against ladder targets | Mixed |
| Hit Rates panel | J1 on A3 | Scores the COG levels, not the export |
| Path panel | J2 | Static, no clock |
| "⬇ Forecast" export (target levels) | B (+ A6 drift line) | The export calculation the research targets |
| First Export-menu item | E | "The ONE daily forecast picked" |

## 4. Production archive (`vol_forecast_<date>`): validity

| Check | Result |
|---|---|
| Coverage | 88 sessions, 2026-06-11 → 2026-10-12; index capped at 120 entries; **88/88 records retrievable**, so the 48-hour TTL concern (§5) did not occur |
| Schema drift | 15 → 66 fields per instrument; instruments 21 → 30 (08-24) → 41 (09-28). **Fitted ladder (`ladder_flat`, event tag) only from 2026-08-21**; harLog from 09-15; reverting from 10-05; index OANDA ladder σ from 10-07 |
| Point in time? | **47/88 records were last written after their session opened** (restarts and manual refreshes rewrite `vol_forecast_<date>`). Only records with `computed_at` before the London open are certified as the forecast available at the open (41/88) |
| Reproduction, incumbent σ (EURUSD, GBPUSD, USDJPY, AUDUSD, GOLD) | Recomputed from local NY-close bars with today's code: **185/185 instrument-days from 2026-07-01 match within 0.04%**, including records rewritten after the open (so the within-session inputs are stable). June: 30/70 differ by up to 67%, all on the documented estimator switches (FX 06-15, gold 06-30). The archive records what production computed, with the code of that day |
| Overlap with the causal builder (`forecast_history`, to 2026-08-20) | **None for the ladder** (archive ladder starts 08-21). The overlap 06-11 → 08-20 covers only incumbent fields, which the builder does not compute |
| Ladder params history | `forecastLadderParams.js` regenerated 2026-09-29. Archived ladders before and after that date come from different parameter files; the version is not recorded in the archive record |

**Archive vs the causal builder: the one overlapping session (2026-08-21), added 2026-10-10.** The builder's functions (`forecastSigma` on NY-close bars from local M1, `buildLadder`) can rebuild 2026-08-21 without any forward data, because that session's forecast uses bars through 2026-08-20.

| Rebuilt with | Result vs the archived production ladder (21 instruments) |
|---|---|
| **Today's** params (what the builder's `live_*` columns use) | σ differs by −29% to +12%. Event multipliers and widths differ too |
| **The params live that morning** (git `d3a2454f`, generated 2026-08-20) | **17/21 identical** (σ, event multiplier, every rung within 0.01pp). NQ +1.3% (production NQ=F futures vs builder OANDA CFD). DE30 / UK100 / US30 / US2000 archive σ 5–23% **below** the rebuild, because production built the ladder on Yahoo cash bars until 2026-10-07 (fault 2) |

**Causes, in order of size:**
1. **Parameter version.** `forecastLadderParams.js` changed on 2026-08-21 (`cf266651`, refit on the London 00–22 session) and 2026-09-29 (`77f6ef2b`, SPX/DOW keys). Estimators changed (for example EURUSD yz_30 → yz_10, GBPJPY yz_30 → ewma_094), widths changed, and the "none" multipliers rose from ~0.90 to ~0.95. **The builder's `live_*` columns apply today's params backwards and are therefore not "as shipped"**; its `pit_*` columns use the walk-forward fold specs, which are the honest research record but are also not what was shipped.
2. **Index bar source** before 2026-10-07 (Yahoo cash, too low).
3. **NQ** futures vs CFD (small).
4. **Event tags.** The builder's calendar proxy ends 2026-07-02, so the builder tags later sessions "unknown" (×1.0) while production used the live ForexFactory tag (for example "none", ×0.86–0.95). For scoring after 2026-07-02, the builder has no event conditioning unless the tags are supplied.

**Consequence for source choice:**
- **Research baseline:** the builder's `pit_*`.
- **"Production as shipped":** the archive, restricted to records written before the open, or a rebuild using the **param version committed at each date** plus the production bar source and event tag. These two agree exactly where both are possible.

**Proposed use (for decision, §9):**
- The archive is the record of *what production showed*. It is **not** a substitute for the causal builder when scoring.
- Use archive records only where `computed_at` precedes the open, and only for (a) checking that the builder reproduces production, and (b) a "production as shipped" track.
- For the export ladder after 2026-08-20, extend the builder to the forward M1 and compare against the PIT-certified archive records before choosing a source.

## 5. Known-fault review

| Issue | Status | Evidence |
|---|---|---|
| Incumbent σ for SPX500/US30/US2000/DE30/UK100 from Yahoo cash bars (14–28% low) | **Confirmed, still present in A1** (cards, Levels, Hit Rates, bot COG bands). Fixed for the ladder family only (2026-10-07) | `preferYahoo` in INSTRUMENTS; `ladder_sigma_source` from 10-07 in the archive |
| Two event-conditioning systems (A2 vs B2) with different numbers; the page chip shows A2 while the export uses B2 | **Confirmed** (definition inconsistency) | volForecast.js NEWS_PATTERNS vs params.event |
| Card p90 = p75 × 1.43 instead of the fitted ladder p90 | **Confirmed** | `_ladderTiers` |
| Session reach times use the H1 **close** (directional) while p90 "hit" and all research use the high/low | **Confirmed** (definition inconsistency) | `computeSessionMetrics`, `_ladderTiers` |
| Remaining-range / extend probabilities on the card are Brownian on a UTC clock and unvalidated, while validated tables exist (Live Range, extreme-in) | **Confirmed** (duplication with an unvalidated version) | K3, H2 code comments |
| Path stats ignore time of day | **Confirmed** (static by design; conflicts with time-left evidence) | J2 header |
| Hit Rates score the COG levels, not the export | **Confirmed** (scope mismatch) | hitRateBackfill header |
| Archive rewritten after the session opens | **Confirmed** (47/88) | §4 |
| Ladder param version not stored with each archived forecast | **Confirmed** | Archive schema |
| Weekday skew in the export (Mon low, Thu high) | **Confirmed out of sample** (IEP-TIME); corrected only in shadow E | TIME.md |
| Busy days too wide / quiet too narrow in the export | Historical result (`forecast-record-pit`), not re-measured here; corrected in E | Stage B will re-measure |
| Index GARCH β 0.87 "interim, pending grid search" since 2026-06-19 | **Confirmed open** (no grid search recorded) | volForecast.js header |
| `vol_forecast_*` / `vol_session_*` missing from `_worker.js` PERMANENT gate (48h TTL risk) | **Code gap confirmed, effect not reproduced**: 88/88 archive records back to June are retrievable. Backend behaviour needs explaining before relying on it | kv.js vs _worker.js |
| `hitRateBackfill` OANDA_ENV default "practice" vs "live" | **Latent** (env var set on Railway) | module header |
| QuikStrike IV capture can fail silently (feeds D, E) | Historical (OI capture guards); not re-checked | memory: OI capture guards |
| Phantom reversions on dynamic HL lines (forecast-reversion page) | Historical, **not reproduced here** (linked page, out of scope) | — |
| Gold pip-size drift (levels.js / utils.js) | Historical, **not reproduced here** (Entry Lens page) | — |
| Calendar proxy ends 2026-07-02 | Research only; live uses the FF feed | DATA_SPEC fault 5 |

## 6. Redundancy audit: is the proposed information already in the system?

| Question | Already addressed by | Residual (what is not known) | Experiment justified? |
|---|---|---|---|
| Forecast-error correction, systematic over/under | E (res1, res5, regime), K5, B5 (horizon) | Whether E beats B **on the export's own scoring, by target** (HL vs OC vs OH/OL), and for which classes | **No new feature.** A Stage B comparison (B vs D vs E vs harLog), then a promotion decision |
| Volatility acceleration, sudden shocks | Estimator reactivity (yz_10, ewma_094), E's res1, A5's vol_accel (descriptive), jump-structure context | Error on days after a shock **after** E's res1 correction | Only if Stage B shows a residual on post-shock days |
| Persistence, decay, remaining session | GARCH/HAR, E regime, B5 (validated), Live Range remaining travel (validated, near-pass) | V3 shows its own unvalidated remaining-range numbers (K3, H2) | **No new model.** Replace or compare K3 with the validated tables (a consistency fix) |
| Implied vs forecast dislocation | D (validated), E+IV (validated, chosen), F, C3, Daily Read tag | Live IV feed reliability | No |
| Range expansion vs contraction | A5 (descriptive), IEP (range used, hour), Live Range, `fast-start` (validated), `narrow-day` (null) | — | No |
| News surprise magnitude, post-event recovery | B2 (scheduled, ex-ante), A2 (duplicate), J4 (descriptive), `surprise-size` validated for range at day / week level | **No intraday post-release re-forecast exists** anywhere in V3 | **Candidate** (needs release-time actuals PIT; US only reliable) |
| Cross-market volatility transmission | Surface Lab (descriptive), `vix-inversion`, `vol-curve-front` (validated, range), IEP L3 (small, indices) | Whether yesterday's realised vol elsewhere improves today's σ beyond D/E | Low priority candidate |
| Volatility-regime transitions | E regime term, HMM (variance states), `forecast-record-pit` regime miscalibration | Whether misses cluster at regime changes after E | Only after Stage B residuals |

## 7. Provisional ranking (not registered; final ranking after Stage B)

1. **Consolidate the daily forecast** (not a new feature): score B, D, E and harLog head-to-head per target in Stage B; then decide which is the forecast and retire or label the rest. `forecast-pick` already chose E on HL. Per-target (OC, OH/OL) and per-class evidence is the gap.
2. **Make the page consistent with its own forecast:** one event system (B2), one p90, one touch definition (high/low), remaining range from the validated tables. These are consistency fixes with a before/after Stage B comparison, not discovery.
3. **Post-release intraday re-forecast** (news surprise): the only genuinely missing information source. It needs its own preregistration and PIT release data.
4. **Post-shock residual** and **cross-market spillover:** only if Stage B residuals show error left after E.

## 8. Required corrections to the shadow specification (`plans/SESSION_AWARE_FORECAST_SPEC.md` v2)

1. **The archive exists** (the v2 spec said it did not). For W0, use archive records only where `computed_at` precedes the session open (otherwise the builder), and record the ladder params version alongside.
2. **"Target levels" needs a single definition.** The page now offers both the production ladder (B, "⬇ Forecast") and the chosen ladder (E, first in the menu). The spec uses B. Confirm, or switch to E after Stage B.
3. **The bot trades COG bands (I), not the export (B).** The shadow's band-hit targets are the export lines; the spec must say they are not the bot's lines.
4. **Touch definition:** the shadow uses bar high/low. The page's session reach flags use the H1 close. The shadow page must not reuse them.
5. **B-T7 baseline:** the band read was built on `buildLadder` with London-day σ (T7b), not the export σ. It stays the existing-forecast baseline, but this mismatch must be documented.
6. **Index σ:** the shadow must take index σ from the ladder family (OANDA, since 10-07), never A1.

## 9. Decisions needed before Stage B

1. **Targets:** score which daily forecasts head-to-head? Proposed: B (production export), D (IV-adjusted), E (chosen), harLog (layer 3), A (incumbent COG, as the bot's lines). Each is scored on its own quantities: HL, OC, OH, OL at p50/p75/p90.
2. **Sources:**
   - the causal builder (`forecast_history`, out of sample from 2020-08) for the history;
   - the PIT-certified archive records for "as shipped" from 2026-06-11;
   - an extension of the builder to the forward M1 (2026-08-21 → 10-09) **only for reproduction checks against the archive, with no scoring there**, so the forward block stays an unexamined holdout for registered tests. Needs your approval.
3. **Exclusions:**
   - 2025-26 labelled non-independent;
   - lockbox layers (HAR-800 ladder, R3, M2) not scored on H-A;
   - June 2026 archive excluded (code-change era);
   - archive records written after the open excluded from "as shipped".
4. **Remaining-range and band-hit baselines:** the Live Range validated tables and T7 as the existing forecasts; V3's K3/H2 numbers as the "as displayed" comparison.
5. **The KV retention gap:** investigate the backend (read-only) before relying on it, or leave it, since 88/88 records are retrievable.
