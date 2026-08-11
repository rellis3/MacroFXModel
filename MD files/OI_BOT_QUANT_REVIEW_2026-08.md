# OI Gamma Bot — Senior Quant Review (2026-08)

Scope: the full OI pipeline — level planning (`js/oiZones.js` + the producer in
`server.js` `_refreshOIBotZones`), execution (`oi_bot/oi_bot.py` +
`oi_bot/engine.py`), and the config surface (bot-config OI Gamma tab), with
specific attention to the GEX/volume node options and the question of trading
smaller levels.

This is a **review + proposals** document — nothing here changes behaviour.
Proposals are ranked P1 (do first) → P3 (nice to have).

---

## 1. What is already right (keep it)

- **Single-planner architecture.** One implementation (`buildOIZones`) feeds
  the zones page, Telegram, and the Python executor. The executor never
  re-derives a level. This kills JS/Python drift and is the correct pattern.
- **Priming.** Marking zones price has already passed on plan load (with an
  audit record of when/how far) prevents retro-entering overnight crossings and
  makes "why didn't it trade" legible.
- **One-shot zones + stable `zone_id`** across intraday re-publishes; broker
  `dedupe_tag` as a second line of defence.
- **Stack guard** (clustered same-direction zones = one bet, defer don't burn).
- **Event blackout with fail-open + loud logging**, stale-paste guard (spot vs
  strike range), liquidating-wall veto, path-blocker trim, reachability trim
  against the implied move, and the fail-loud pip registry.
- Honest framing: FX opt-in as the weak asset, "forward-test, not proven edge".

The findings below are refinements on a sound skeleton, not a redesign.

---

## 2. Level planning (`js/oiZones.js` + producer)

### P1 — Pip-denominated distances don't scale across the universe

All structural distances are global pip counts: `slBufferPips` (15),
`breakPips` (20), `extendedPips` (30), plus executor-side `touch_tol_pips` (2)
and `stack_guard_pips` (10). But `pip = 1.0` for gold **and every index**
(`pylego/instruments.py`), so the same 15-pip stop buffer is:

| Instrument | ~Spot | 15 pips as % of spot |
|---|---|---|
| Dow | ~44,000 | 0.03% |
| NQ | ~23,000 | 0.07% |
| SPX | ~6,300 | 0.24% |
| Gold | ~3,300 | 0.45% |
| Russell | ~2,400 | 0.63% |

A ~20× spread in effective buffer. On Dow/NQ the stop sits inside noise (walls
get "broken" by spread + one rotation); on Russell/gold the break trigger is so
wide it lags the squeeze it is meant to catch. The `reachMult` gate already
uses the right currency (the implied move); the entry/stop geometry should too.

**Proposal.** Express structural distances as a fraction of the instrument's
reference move, with pips kept as a floor/override:

- Planner config: `slBufferRefFrac` (e.g. 0.10), `breakRefFrac` (e.g. 0.15),
  `extendedRefFrac` (e.g. 0.25). Effective distance =
  `max(pips × pip, refFrac × refMove)`. The producer already computes
  `refMove` (implied when trustworthy, flat-vol fallback) — thread it in.
- Executor config: same treatment for `touch_tol_pips` and
  `stack_guard_pips` (ship the resolved price-unit values **on the plan** per
  instrument so the executor stays dumb — e.g. `zone.touchTol`,
  `slice.stackDist` — rather than teaching Python about refMove).
- Keep per-instrument overrides (`{gold: {...}}`) for hand-tuning.

This is the highest-leverage change in the review: it makes every other knob
mean the same thing on every instrument.

### P1 — GEX regime is sign-only; add a neutral band and conviction sizing

`regime = gex > 0 ? PIN : BREAKOUT` — a book that is +0.1% net GEX today and
−0.1% tomorrow flips the entire strategy (fade ↔ follow) on noise around zero.
The `nearFlip` ×0.85 trim helps only when *spot* is near the flip strike, not
when *net GEX* is near zero — related but distinct conditions.

**Proposal.**
- `gexNeutralBand` (config): |netGEX| below this fraction of the trailing
  ~20-day median |netGEX| (from `oi_history`, already stored) → regime
  `NEUTRAL`: no fade/break zones (max-pain reversion may still run — it is
  regime-agnostic by design). Suggested default 0.25.
- Above the band, scale zone `sizeFactor` continuously with GEX conviction,
  e.g. `min(1, |netGEX| / median|netGEX|)` clamped to [0.5, 1.2], so a barely
  positive book fades at half size instead of full.
- Surface the conviction number in the rationale ("PIN · GEX 1.8× 20d median")
  — it makes the paper-test reviewable per conviction bucket later.

### P1 — No minimum R:R gate on planned zones

TP1 defaults to max pain for PIN fades; with `levelLadderTP` on, TP1 is the
*nearest* node ahead. Either can sit a handful of pips from the entry while the
SL sits `slBuffer` behind the wall — a 0.2R trade is currently planned, alerted
(the Telegram text even computes the R), and traded at full size.

**Proposal.** Planner `minRR` (default ~0.8):
- If `(|tp1 − entry| / |entry − sl|) < minRR`: with the ladder on, promote TP2
  to TP1 (skip the too-near node); otherwise drop the zone and record it in the
  `diag`/skipped output so the blank is legible ("zone dropped: 0.3R < minRR").
- This matters double once smaller levels / react nodes are enabled (below):
  node density rises and near-node targets become common.

### P2 — Max-pain reversion re-checks nothing at fire time

Mode C zones carry `entry: price` (plan-build spot) and `should_fire` returns
`true` on the first live tick, ever. `extendedPips` is checked only at build
time. Between the 10-minute plan builds (or across a bot restart, which wipes
session state and re-fires maxpain — it is exempt from priming by design),
price may already have reverted to the pin — the bot then enters a reversion
trade whose edge is spent, or worse, on the wrong side of the pin.

**Proposal.** Put the gate on the zone and have the engine re-validate at fire
time: add `minDist` (the extended threshold in price units) and the planned
side to the maxpain zone; `should_fire` for maxpain becomes
"live px is still ≥ minDist from `level` **on the planned side**", else prime
it away. Pure engine change, unit-testable in `engine_test.py`.

### P2 — Break entries are distance-only; add a dwell confirmation

Mode B fires when price pokes `strike + breakPips` — with a 3-second poll and a
market order, a single wick through the trigger takes a full-size continuation
position (and paper fills at `expected_fill(entry)` will systematically flatter
this: live fills chase past the trigger). The OI-flow trim
(`oiPriceConfirmation` — break on falling OI = dissolving wall, ×0.85) is good
mechanism-awareness; it deserves a price-side sibling.

**Proposal.** Executor-side `break_hold_ticks` (default 2): a `break`-mode zone
must satisfy `should_fire` on N consecutive polls before entry (state on
`OISession`). Cheap, no new data, kills the worst wick-chasing. Optionally
`break_hold_secs` for clock-based dwell instead.

### P2 — "Smaller trade levels": grade them in, don't gate them out

Today `minTier` is a hard binary gate (default `strong`), while `sizeFactor`
already knows how to grade tiers (strong 1.5 / moderate 1.0 / weak 0.6). So
the machinery for trading smaller levels at smaller size exists — it is just
unreachable below the gate. Flipping `minTier` to `moderate`/`weak` works
today but treats a weak wall as a first-class fade.

**Proposal.** Decouple *tradeable* from *size*:
- `subTierTrade` (off by default) + `subTierSize` (e.g. 0.4): walls below
  `minTier` become zones at `sizeFactor × subTierSize` instead of being
  invisible. `minTier` keeps meaning "full-conviction level".
- **Confluence requirement for small levels**: a sub-tier wall only qualifies
  if a second, independent node agrees within tolerance — a volume magnet, the
  gamma/GEX flip, or multi-expiry persistence (`persistence ≥ 2`). A weak wall
  alone is noise; a weak wall sitting on the day's volume shelf is a level.
- `minZoneSpacing` (in refMove fraction, e.g. 0.05): planner-side dedupe so a
  dense ladder of small levels can't emit near-duplicate zones. The executor's
  stack guard currently handles this *after* the fact by deferring — spacing
  belongs in the plan, and the guard stays as the backstop.
- Note the interaction: enabling smaller levels **requires** the `minRR` gate
  and refMove-scaled distances above, otherwise level density turns into a
  stream of sub-0.5R clustered trades.

### P2 — GEX/volume node options: unbundle `reactAtLevels`

Mode D currently treats every node type identically — walls ≥ `reactMinTier`,
gamma flip, GEX flip, vanna flip, volume magnets — all enter at full size in
PIN. Two problems:

1. **Node types are not equally trustworthy.** A wall is dealer inventory that
   *defends* a strike; a volume magnet is one day's flow (noisy, no
   defence mechanism); a flip is a *transition zone* where the regime changes —
   fading price *at* the flip is qualitatively different from fading a wall
   (there is nothing there to defend; behaviour flips as price crosses it).
2. **Volume magnets have no quality floor.** `js/oi.js` keeps the top 8 by
   volume inside the strike range — magnet #8 may carry 3% of magnet #1's
   volume and still becomes a full react node.

**Proposal.**
- Replace the single toggle with per-type weights (0 = off), applied as a
  size multiplier and surfaced in the rationale:
  ```json
  "reactNodes": { "walls": 1.0, "gammaFlip": 0.8, "gexFlip": 0.8,
                  "vannaFlip": 0.6, "volMagnets": 0.6 }
  ```
  (`reactAtLevels` stays as the master switch; defaults reproduce today's
  behaviour with modestly trimmed flip/magnet entries.)
- Flips as **targets by default, entries by opt-in**: keep flips in the TP
  ladder (they are excellent "price stalls here" nodes) but require
  `reactNodes.gammaFlip > 0` to *enter* at one.
- Volume magnet quality: `volMagnetMinShare` (default ~0.25 — magnet volume ≥
  25% of the strongest magnet to count as a node) and make the hardcoded
  top-8 (`_volOK.slice(0, 8)`) a config `volMagnetTopN`. Optionally scale the
  node's size weight by `volume / maxVolume` so magnet strength behaves like
  wall tier.

### P3 — TP2 is dead weight; implement the scale-out the plan already ships

`engine._tp` uses TP1 else TP2 — TP2 is computed, published, rendered, and
never traded ("Stage-3 refinement" per the docstring). The plan already
carries everything needed.

**Proposal (executor-only).** `scale_out` config: split the entry into two
tickets — half at TP1, runner at TP2 — plus `be_at_tp1` to move the runner's
stop to entry when TP1 fills (paper broker needs a small barrier extension;
MT5 supports it directly). This materially changes the fade profile: banking
at the first structure while the runner rides to the pin is the actual
wall-to-wall playbook the rationale describes.

---

## 3. Execution (`oi_bot/oi_bot.py` + `engine.py`)

### P1 — Per-trade risk is `risk_pct × sizeFactor` and nothing caps the book

`size_for` computes risk-based lots at `risk_pct` (0.5%) then multiplies by
`sizeFactor` (capped 2.0) — so a single trade risks up to 1.0%, and
`max_open = 12` means a worst-case open book risking >10% against a daily
drawdown limit of 3%. The RiskGuard reacts *after* losses land; nothing
budgets risk *before* entry. Worse, the four index instruments are one macro
underlying in stress: same-regime, same-direction fades on NQ/SPX/Dow/RUT are
effectively one bet at 4× size, and the stack guard is per-instrument only.

**Proposal.**
- `max_open_risk_pct` (default ~2.0): before entry, sum each open position's
  risk-to-SL (lots × SL distance × point value / balance) plus the candidate's;
  defer (don't burn) the zone when the budget is full. All inputs already
  exist in the loop.
- `max_group_positions` (default `{indices: 2}`): cap same-direction positions
  across the correlated index block (`asset_class` from the registry already
  distinguishes indices). Defer, don't burn — consistent with the stack guard.
- Keep `sizeFactor` semantics but document that `risk_pct` is a *base*, not a
  cap; or alternatively clamp `risk_pct × sizeFactor ≤ risk_cap_pct`.

### P2 — One-shot state dies with the process

`entered`/`primed` live only in memory. On restart: priming correctly
neutralises fade/break zones price already passed, **but** (a) maxpain
re-fires immediately (exempt from priming by design), and (b) a zone whose
position was stopped out re-arms if price returns — `dedupe_tag` only blocks
while the original position is still open. An innocuous redeploy can double
today's trades.

**Proposal.** Persist per-plan one-shot state to KV: on fill, write
`{generatedAt, entered: [...]}` to `oi_bot_state`; on start, reload it when the
plan's `generatedAt` matches. Alternatively derive `entered` from the broker's
closed-trades-today by dedupe tag (no new storage, MT5 history query). Either
closes the restart hole; the KV route also covers paper mode.

### P2 — No plan-age gate (the plan fails open; the strategy is the plan)

On plan-fetch failure the bot "keeps the current plan" — indefinitely. The
event gate's fail-open is correct (it is a suppressor), but the plan is the
strategy itself: OI is a daily artifact and its levels rot. A server outage
Friday → the bot trades Friday's walls into Tuesday.

**Proposal.** `plan_max_age_hours` (default 24): when
`now − generatedAt` exceeds it, stop taking **new** entries (brackets keep
running), log the block loudly once per transition — mirror the event-gate
messaging pattern, but fail-**closed**.

### P2 — No time-based exit; positions outlive their rationale

Every exit is price-based (SL/TP). But the pinning mechanism the fades and the
max-pain reversion trade **expires**: charm/pin force is a ≤2-DTE effect, and
after the expiry rolls off, the wall the trade leans on may not exist in the
next book. A maxpain trade that neither hits the pin nor the guard wall can
sit for days as an orphan.

**Proposal.** Per-mode max hold, shipped on the zone so the plan stays the
single source: `maxHoldHours` (maxpain: until expiry; fade: e.g. 48h;
break: e.g. 24h) — executor closes at market past the deadline. At minimum,
flatten `maxpain` positions at the traded expiry's cutoff.

### P3 — Small hygiene items

- `reject_until` / `stack_skips` grow unboundedly (tiny, but prune on plan
  swap alongside sessions).
- `enabled_pairs` containing a typo'd instrument skips silently
  (`sess is None → continue`) — warn once when an enabled pair isn't in the
  plan.
- Sizing uses `expected_fill(entry)` but a 3s-poll market order fills past the
  trigger in fast tape; paper results will flatter `break` mode. Consider a
  paper slippage model (fraction of the poll-interval move) so the forward
  test is honest where it matters most.
- `max_open` counts *this bot's* positions (magic-filtered) — fine, but once
  `max_open_risk_pct` exists, `max_open` becomes the coarse backstop; document
  it as such.

---

## 4. Config surface (bot-config OI tab)

The tab exposes the strategy core well, but several planner knobs that this
review leans on are KV-only today: `secondaryTrim`, `reachMult`/`reachTrim`,
`persistenceWeight`/`persistentDTE`, `pathBlockCheck`/`blockMinTier`/`blockTrim`,
`fallbackTpR`/`fxFallbackTpR`, vanna/charm boosts. If they're worth having,
they're worth seeing.

**Proposal.** Regroup the OI tab into four blocks and add the new knobs where
they belong:

1. **Regime (GEX)** — fade/break/maxpain toggles, `minTier`,
   `gexNeutralBand` (new), conviction sizing (new).
2. **Levels & nodes** — `maxZonesPerSide`, ladder TP, `reactAtLevels` +
   per-node weights (new), `volMagnetMinShare`/`TopN` (new), `subTierTrade`/
   `subTierSize` (new), `minZoneSpacing` (new), `minRR` (new).
3. **Distances** — refMove-fraction distances with pip floors (new), shown
   with a live per-instrument preview ("15p floor / 0.10×ref → gold $23, NQ
   34pts") so the scaling problem in §2-P1 stays visible.
4. **Risk & execution** — existing execution block + `max_open_risk_pct`,
   `max_group_positions`, `plan_max_age_hours`, `break_hold_ticks`,
   `scale_out`/`be_at_tp1`, per-mode max hold (all new).

---

## 5. Suggested order of work

| # | Change | Layer | Why first |
|---|---|---|---|
| 1 | refMove-scaled distances (§2-P1) | planner + producer | every other knob inherits correct units |
| 2 | `max_open_risk_pct` + index group cap (§3-P1) | executor | caps tail risk of the current book |
| 3 | `minRR` gate (§2-P1) | planner | cheap; prerequisite for smaller levels |
| 4 | `gexNeutralBand` + conviction sizing (§2-P1) | planner | stops regime-flip whipsaw on noise |
| 5 | maxpain fire-time re-validation (§2-P2) | engine | pure, unit-testable, closes a real hole |
| 6 | persist one-shot state + plan-age gate (§3-P2) | executor | restart/outage safety |
| 7 | smaller-levels package: `subTierTrade` + confluence + spacing (§2-P2) | planner | the owner's ask, now safe to enable |
| 8 | react-node weights + volume-magnet quality (§2-P2) | planner + oi.js | the GEX/volume config ask |
| 9 | break dwell confirmation (§2-P2) | executor | kills wick-chasing |
| 10 | scale-out TP1/TP2 + BE (§2-P3) | executor + broker | completes the wall-to-wall profile |

Everything above is forward-test-first: land 1–6 before enabling 7–8 in
anger, and judge each on the paper run before sizing anything live.

---

## 6. Implementation status (2026-08-11) — BUILT

Everything in §5 is implemented, plus the wall **hold-score** follow-up
discussed after this review was written. Where each piece landed:

| Change | Where | Default |
|---|---|---|
| refMove-scaled distances (`slBufferRefFrac`/`breakRefFrac`/`extendedRefFrac`, pips = floor) | `js/oiZones.js` + producer | ON (0.10/0.15/0.25) |
| `minRR` gate (ladder-promote past a too-near TP1, else drop + record) | `js/oiZones.js` | ON (0.8) |
| GEX neutral band + conviction sizing vs trailing median \|GEX\| (`oi_history`) | `js/oiZones.js` + `server.js` `_oiGexMedianAbs` | ON (band 0.25) — inert until ≥5 days of history |
| Wall hold-score (per-strike net GEX · OI flow · persistence · multiple) — sizes fades, annotates breaks | `js/oiZones.js` `wallHoldScore` | ON |
| Hold-score **auto-calibration** from the forward test | `server.js` `_refreshOIHoldCalibration` → `oi_hold_calibration` KV → auto-injected as `holdWeights` | seamless — activates at 30 resolved wall trades |
| Calibration banner (collecting n/needed + what/why, or active + fitted weights) | `oi-dashboard.html` + `oi-zones.html`, `/api/oi-bot/hold-calibration` | always visible |
| Sub-tier walls WITH confluence (`subTierTrade`/`subTierSize`) | `js/oiZones.js` | OFF (opt-in) |
| Zone spacing dedupe (`minZoneSpacing` × refMove) + dropped-zone diagnostics | `js/oiZones.js` (`collectDrops`) → plan `droppedZones` | ON (0.05) |
| React-node type weights + volume-magnet quality floor (`reactNodes`, `volMagnetMinShare`, top-N floor) | `js/oiZones.js` | walls 1.0 · flips 0.8 · vanna 0.6 · magnets 0.6; share 0.25 |
| Portfolio risk budget (`max_open_risk_pct`) + index group cap (`max_group_positions`) | `oi_bot/oi_bot.py` | ON (2.0% / index 2) |
| Plan-age gate, fail-closed (`plan_max_age_hours`) | `oi_bot/oi_bot.py` | ON (24h) |
| Persisted one-shot state (restart double-entry protection) | `oi_bot/oi_bot.py` → `oi_bot_state` KV | ON |
| Maxpain fire-time re-validation (`minDist` on the zone) | `oi_bot/engine.py` `should_fire` | ON (plans stamp it) |
| Break dwell (`break_hold_ticks`) + touch counting + approach-velocity fade trim | `oi_bot/engine.py` + `oi_bot.py` | ON (2 ticks / trim 0.7) |
| TP1/TP2 scale-out + break-even at TP1 (`scale_out`/`be_at_tp1`) | `oi_bot/oi_bot.py` | **OFF** (opt-in behaviour change) |
| Feature stamping → trade log (`zone_features` in status, joined by the rollup) | `oi_bot.py` + `server.js` `_oiAccumulateTradeLog` | ON |
| Config UI for all of the above | bot-config OI tab | — |
| Export + indicator: `hNN` hold token on wall lines, legend, Pine parse/labels | `js/oiLevelExport.js` + `pine/Confluence Zones Indicator.pine` | additive (old indicators ignore it) |

**Follow-up (2026-08-11, second PR):** the three remaining items are now built:
- **Per-mode time-based exits** (§3-P2): `max_hold_hours` `{fade: 48, break: 24,
  maxpain: 24, react: 24}` (0 = off per mode). The mode is parsed from the
  position's own comment tag (`engine.position_mode`) so it survives plan rolls
  and restarts; positions past their cap close at market with reason `time`
  (MT5 broker-clock offset corrected via `tz_offset_sec`). Defaults ON — the
  whole point is that orphans stop existing.
- **Restart-safe break-even watch**: scale-out `runners` now persist in
  `oi_bot_state` and are restored on start, so a bot bounce mid-TP1/TP2 pair no
  longer drops the BE-at-TP1 upgrade.
- **Previously KV-only knobs surfaced** on the OI tab ("Advanced" section):
  `secondaryTrim`, `reachMult`/`reachTrim`/`maxReachPips`, `persistenceWeight`/
  `persistentDTE`, `pathBlockCheck`/`blockMinTier`/`blockTrim`, `fallbackTpR`/
  `fxFallbackTpR`, `vannaBoost`/`vannaTrim`/`charmBoost` — plus the time-exit
  hours.

**What still needs YOU:** nothing but the routine — keep pasting daily OI (the
neutral band and hold-flow components sharpen as `oi_history` accumulates) and
keep the paper bot running. The calibration banner on the OI Analytics / zones
pages tracks progress toward the 30-trade fit and explains exactly what flips
on when it activates.
