# OI System — Senior Quant Trader Review (Aug 2026)

Scope: the OI analysis page ([`oi-dashboard.html`](oi-dashboard.html)), the OI bot
([`oi_bot/oi_bot.py`](oi_bot/oi_bot.py:1), [`oi_bot/engine.py`](oi_bot/engine.py:1),
plan producer [`js/oiZones.js`](js/oiZones.js:141)), and the COT data stack
([`_worker.js`](_worker.js:1704) → [`cot-extremes.html`](cot-extremes.html) →
[`bot/modules/cot_filter.py`](bot/modules/cot_filter.py:35)).

This is a desk-level review, not a line-by-line audit. I read the actual code, not
the marketing copy in the comments. Where a comment claims something, I checked
whether the code delivers it.

---

## 0. Headline findings (read this first)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Severity             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| H1  | **The COT signal is already a banked null.** The pre-registered factor test (Q17, 2026-08-22) found OI-normalised spec positioning has **no predictive power** for 4-week forward returns (pooled OOS rank-IC −0.0317, block-bootstrap p=0.094 vs the p<0.05 bar) across 8/8 instruments and 3,576 OOS rows. The COT page is honest ("display only"), but **any directional use of COT — including the bot's contrarian bump — is unsupported by your own registered test.**                                | **Critical context** |
| H2  | **The OI bot has never been backtested and is being tuned with a machine-gun of theory multipliers.** No historical OI exists (manual paste), so the strategy is forward-test-only, which is honest — but the planner stacks ~15 multiplicative size/conviction heuristics (tier, concentration, durability, hold-score, GEX conviction, secondary trim, sub-tier, vanna, charm, block trim, reach trim, local regime, approach trim). That many free knobs with no IS/OOS discipline is how you fit noise. | **High**             |
| H3  | **The core GEX/regime the bot trades is computed at a fixed 14-DTE, flat-vol assumption** ([`js/oi.js:1190`](js/oi.js:1190)) — yet the bot's most active trade (max-pain reversion) only fires at ≤2 DTE, and the "day expiry" is the near-dated chain. The regime sign and the gamma-flip are least reliable exactly where the strategy concentrates.                                                                                                                                                      | **High**             |
| H4  | **A shipped feature (`localRegime`) is dead code on the common path.** Its own forward-test plan documents a blocking bug: the day-expiry path nulls `gexFlips`, so the local-regime gate can never fire on the expiry the bot actually trades ([`MD files/OI_LOCAL_REGIME_FORWARD_TEST_PLAN.md:8`](MD files/OI_LOCAL_REGIME_FORWARD_TEST_PLAN.md:8)).                                                                                                                                                      | **Medium**           |
| H5  | **The reachability "calibrated" probabilities are calibrated on EUR/USD M5 and applied to gold and index futures** ([`server.js:5595`](server.js:5595)). Index overnight gaps and fat tails make a EUR/USD-derived reliability curve questionable cross-asset. The page states it, but still surfaces numbers to 0 decimal places.                                                                                                                                                                          | **Medium**           |
| H6  | **The single point of failure is the human paste.** The page and bot hang off hand-pasted CME tables. `oi_recon` built a sanctioned fetch path but it writes only a shadow key and is deliberately not wired in. Until the auto-pull is productionised, the whole desk is one forgotten paste away from trading a dead chain.                                                                                                                                                                               | **High (ops)**       |

Strengths I'd keep (this desk gets a lot right): provenance-first UI, per-mode time
exits, plan-age fail-closed gate, event blackouts, the stack/group/risk-budget
guards, restart-safe one-shot state, and the honesty that runs through the page
copy ("not a timing signal", "not backtested", "contrarian caution, not
confirmation"). Those are institutional-quality habits.

---

## 1. The OI analysis page — design review

### 1.1 What it does well

- **Provenance as a first-class citizen.** The diagnostics strip
  ([`diagBar`](oi-dashboard.html:950)) surfaces exactly the fields that have been
  wrong at some point: anchor validity, expiry-scored-on, basis legs paired/unpaired,
  futures source, C/P flip. This is the single most valuable habit on the page and
  most trading UIs get it wrong.
- **Re-analyse vs Re-basis separation** ([`oi-dashboard.html:1117`](oi-dashboard.html:1117))
  is correct and well explained. Pinning re-analyse to the saved basis so stale data
  doesn't masquerade as fresh is the right call.
- **Inline help on every metric**, with a second paragraph that often says _when_
  the metric matters and when it doesn't (e.g. max pain "weak more than ~5 days
  out"). That is real educational design.
- **Spot/futures toggle, per-type chart level toggles, and the "all expiries"
  overlay** — sensible answers to the "unreadable chart" complaint.
- **Reachability with the reliability curve on screen** next to the numbers is a
  genuinely advanced move — showing the model's own over-confidence rather than
  hiding it.

### 1.2 Problems and oversights

**P1-1 — The "by expiry" language mismatches the actual horizon.** The page's
reachability is capped to H ∈ [4, 96] M5 bars = 20 min to 8 hours
([`server.js:5530`](server.js:5530)), and the cone is an intraday vol cone. Yet the
help text and level labels talk about "by expiry" and "expected move to expiry".
A wall that is 8h-touch-probable and a wall that is 14-DTE-reachable answer
different questions, and mixing the vocab invites a trader to over-read the number.
Either relabel ("touch probability in the next X hours") or compute a genuine
expiry-horizon reachability.

**P1-2 — Reachability calibration is cross-asset transferred.** The reliability
curve is "fitted on EUR/USD M5" and applied verbatim to XAU, NQ, ES, RTY
([`server.js:5593`](server.js:5593)). EUR/USD is a near-24h, gap-free market;
index futures gap overnight and have materially different intraday fat tails. The
calibrated 68%-for-94% correction was _measured_ on one asset. Apply it to a
gap-prone index and the corrected number can be wrong in the _opposite_ direction.
At minimum, fit per-asset-class curves (even a crude one) and label the transfer
as approximate; better, add a per-instrument sample and only show calibration for
assets with a fitted curve.

**P1-3 — The fixed 14-DTE / flat-vol Greek engine is exposed as authoritative.**
The level strip and GEX chart present `gammaFlip`, `charmFlip`, `vannaFlip` and
`Net GEX` as precise numbers, but the underlying engine uses `OI_GREEK_T = 14/365`
(fixed) and `oiFlatVol` (0.20 index / 0.18 gold / 0.12 FX) unless an IV smile was
pasted ([`js/oi.js:1187-1190`](js/oi.js:1187)). A charm flip at a fixed 14 DTE is
meaningless (charm is negligible until ~1–2 DTE — the page's own help says so), and
the bot's headline regime sign comes from this same engine. The page should print
the assumption next to the number ("γ at fixed 14 DTE · flat vol") the way it
already prints `refMove.source` — otherwise the tooltip's own caveats are buried.

**P1-4 — Max pain on the unfiltered chain.** `oiCalcMaxPain`
([`js/oi.js:1157`](js/oi.js:1157)) weights _every_ strike, including far-OTM,
illiquid paper. Textbook max pain should be computed on the traded/near-money
envelope (and is usually windowed to a few σ) or a handful of deep-OTM strikes can
shift the pin. The wall tables already apply a 2.5×refMove near-filter; max pain
should at least report both (filtered vs full-chain) so a user can see the
difference.

**P1-5 — No time-series / multi-day view on the page itself.** The page is a
snapshot of the latest paste with a "saved Xh ago" badge. The whole value of OI
is _change_ — walls firming/fading, max-pain drift, OI building vs liquidating.
`today.html` and `/api/oi-history` consume day-over-day deltas, and the bot's
planner reads `change`/`stability`, but the analysis page itself offers no
"yesterday vs today" comparison on the walls or the pin. That is the biggest
feature gap on the page.

**P1-6 — The `oi-dashboard` reads a separate KV store from what the bot trades.**
The page renders `oi_store` directly; the bot trades the _plan_ the server derives
from `oi_store` at refresh. They can disagree silently if the server re-plan lags a
paste (the modal writes localStorage first, then KV, then the 10-min producer).
The page's "saved Xh ago" is about the paste, not about _when the bot's plan was
last refreshed_ — two different clocks on one desk.

---

## 2. The OI analytics core — quantitative issues

**P2-1 — The 3× wall tier rule is a local multiple, not an absolute level.**
`wallStrengthTier` ([`js/oiConfluence.js:76`](js/oiConfluence.js:76)) divides a
strike's OI by the _average of its two neighbours only_. In a sparse or uneven
chain this is brittle: a strike with zero neighbours returns `strong` by the
"isolated wall" branch, and a strike between two enormous strikes scores weak even
if its absolute OI is huge. It also ignores whether neighbours are decaying or
growing. For a _tier_, consider the OI relative to the rolling median of the
surrounding band (e.g. ±6–10 strikes), not just immediate neighbours, and add a
minimum absolute OI floor so "isolated" can't mean "strong".

**P2-2 — GEX uses flat vol and fixed DTE for the thing the bot trades.** Already
flagged (H3, P1-3). The important consequence for the _bot_: the PIN/BREAKOUT
regime the whole strategy hinges on is a sign on a scalar computed from
`gexProfile` under a flat-vol, fixed-14-DTE assumption. When you then add the
"conviction = |GEX| / trailing median |GEX|" sizing, you are scaling size by a
ratio of two approximations. Until per-strike IV is reliably present (it needs the
QuikStrike smile paste — `oi_recon`'s README confirms per-strike IV is not in the
CME JSON), treat GEX-relative sizing as low-confidence.

**P2-3 — `minRR` and the fallback measured-move TP are the right instinct, but
the minRR=0.8 default is sub-economic.** A fade that targets 0.8R with a structural
stop behind a wall is, after spread + slippage + the reversion's low hit-rate, a
coin-flip at best. A retail-reasonable minimum is ~1.3–1.5R _after costs_. Consider
modelling expected value as win-rate × R instead of a raw R floor (the hold-score
calibration is the natural source for that win-rate).

**P2-4 — The hold-score calibration design is sound but statistically starved.**
The fitter waits for 30 resolved wall-fade trades, then separates winners/losers by
per-component median split and assigns weight ∝ win-rate separation
([`server.js:13335`](server.js:13335)). That is honest small-n methodology, but 30
rows split into high/low per component gives enormous sampling variance — the
weights will jump around trade-to-trade and can lock in noise. Recommend: (a) a
minimum per-component n ≥ 20 (already ~10) before a component earns weight;
(b) shrink fitted weights toward the priors (e.g. 50% blend) so a lucky 30-row fit
can't flip the book; (c) only auto-apply when the tercile monotonicity check is
actually monotone.

**P2-5 — Reachability "median bars to touch" is measured in M5 bars and shown in
minutes** — fine — but the _race_ explicitly disclaims calibration transfer
("treat as relative, not exact"). Good. Keep that, but don't let the headline
single-barrier numbers (which _are_ calibrated) sit visually next to race numbers
that aren't without the same weight of caveat.

---

## 3. The OI bot — how it trades, and where the edge is (and isn't)

### 3.1 What the bot actually does

One plan producer ([`js/oiZones.js buildOIZones`](js/oiZones.js:141)) computes
zones; the executor ([`oi_bot/oi_bot.py`](oi_bot/oi_bot.py:368)) only detects
touches and places broker-enforced brackets. The strategy is regime-switched:

- **PIN** (net GEX > 0): fade the nearest strong walls toward max pain.
- **BREAKOUT** (net GEX < 0): follow wall breaks into a gamma-squeeze.
- **Near expiry (≤2 DTE) + extended from pin:** max-pain reversion.
- **React (opt-in):** trade between structural nodes by regime.

Risk engineering is genuinely good: stack guard, correlated-group cap, portfolio
risk budget, plan-age fail-closed gate, break dwell, approach-velocity trim,
per-mode time exits (mechanism expiry), event blackouts, restart-safe one-shot
state, Telegram alerts with the rationale.

### 3.2 Problems and oversights

**P3-1 — Sizing is a multiplicative tower of theory priors with no evidence
anchor.** Trace one fade through [`add()`](js/oiZones.js:426): tier (1.5×) ×
concentration (1.2×) × durability (1.15×) × hold-score (0.7–1.3×) × GEX conviction
(0.5–1.2×) × vanna (1.15/0.85×) × secondary trim (0.6×) × block trim (0.9×) ×
reach trim (0.7×) × local-regime trim (0.5×) × approach trim (0.7×). A "primary
fade" can land anywhere from ~0.1× to ~3× the base. There is no way a desk can
reason about per-trade expected risk through that chain, and _each_ multiplier is a
free parameter that will be tuned the moment results disappoint. I would collapse
this to at most 2–3 inputs (wall strength + hold-score + regime confidence), each
with a documented evidence base, and let the forward-test calibrate _one_ scale,
not eleven.

**P3-2 — The regime the bot trades is the weakest link and it's computed on
approximate Greeks.** (H3.) Since max-pain reversion (the highest-frequency,
most mechanical mode) requires ≤2 DTE and the day-expiry chain, the gamma regime
is being judged at a moment when fixed-14-DTE flat-vol GEX is least representative.
At minimum: compute the regime on the _actual day-expiry DTE_ with the smile IV
when available; never let a 14-DTE GEX sign drive sizing on a 1-DTE trade.

**P3-3 — Max-pain reversion's stop is structurally wrong for a fade.** The zone's
SL is `guardWall ± buf`, i.e. beyond the _next wall_ on the far side of the entry.
For a maxpain sell that means the stop is placed beyond the call wall _above_ spot
— a huge distance when price is extended, so the position sizes down to almost
nothing (risk-based sizing with a giant SL), or the fallback `price ± buf*4`
applies. The whole point of a max-pain reversion is a tight, defined, near-expiry
bet with a bounded loss. A stop at the far structural wall turns it into a
low-probability, tiny-size position that barely matters. Use an ATR/percent-based
stop for the reversion, not the far wall.

**P3-4 — Correlated-group cap only covers indices (`index: 2`), and the default
risk budget (2%) vs single-trade risk (~0.5% × up to ~2× = ~1%) leaves thin room.**
Gold and the indices are one macro book in a risk-off unwind (long gold + long NQ
is a common carry basket). The group cap should extend to a _cross-class_ cap
(e.g. total same-direction "risk-on" exposure), not just per-class. Also `max_lot
2.0` on gold is a large cash bet if the account is small — check that max_lot and
risk_pct × max_open_risk_pct are consistent with the account size the paper broker
starts at (10k). A 1% trade on 10k is fine; a 2.0-lot gold position is not 1% of
10k on some instruments.

**P3-5 — `break_hold_ticks` + 3s tick = 6s confirmation is a very short "decisive
break".** A 6-second wick through wall+breakPips on M5-relevant levels is still a
wick. The dwell should be scaled to the timeframe the levels are meaningful on
(which the plan's `refMove` implies). Consider confirming a break by price
_closing_ beyond the level on the chart's working timeframe rather than N ticks on
a 3s poll.

**P3-6 — No systematic handling of "OI stale while plan fresh".** The plan-age
gate (24h) correctly fails closed on a stale plan, but a plan can be _fresh_ while
the underlying `oi_store` paste is a week old (the producer replans from the same
stale store). The plan should carry the `oi_store` timestamp and the bot should
refuse new entries if the _OI chain_ (not the plan) is stale — today.html already
has `OI_FRESH_H = 30`. This is the same class of failure as P1-6.

**P3-7 — No costs model beyond spread for live.** Paper has `paper_spread_pips`;
live MT5 market orders have no slippage model, and the paper broker doesn't model
slippage on a _fast approach_ into a wall — the exact moments the approach-velocity
trim is meant to protect. If forward results look good, sanity-check them against a
slippage assumption before trusting live fill quality.

**P3-8 — The forward-test tagging loop only learns from resolved wall trades.**
The hold-score calibration and the `zone_features` stamping are good, but there's no
bookkeeping for _zones that never filled_ (primed away, deferred by stack/budget,
never reached). A plan that proposes 30 zones but fills 3 is a different (probably
better for costs, worse for sample) system than one that fills 27. Track the
proposal→fill funnel per mode — it's the missing denominator for every win-rate
claim.

---

## 4. COT data — review

### 4.1 What's right

- **The rewrite from "net sign = confirmation" to "crowding at extremes =
  contrarian caution"** ([`bot/modules/cot_filter.py`](bot/modules/cot_filter.py:35))
  is the correct institutional posture. Net spec _sign_ is a trend-follower echo and
  is worthless as confirmation; extreme _percentiles_ are at least a coherent
  crowding proxy.
- **OI-normalisation is done properly** (share-of-OI ranked, not raw contracts),
  and the module prefers `specSharePct/specShareZ` over raw `specPct` with a clear
  fallback chain.
- **Staleness gating (10 days), missing-date stand-down, and "not computable →
  stand down, don't fake it"** are exactly the right failure modes.
- **The page is scrupulously honest**: "not a timing signal", "has not been
  backtested", the DERIVED USD label, the publication-lag stamp.

### 4.2 Problems and oversights

**P4-1 — The factor test already answered this and the answer was null.** Q17
([`MD files/BACKTEST_INDEX.md:114`](MD files/BACKTEST_INDEX.md:114)): OI-normalised
spec positioning does **not** predict 4-week forward returns (pooled OOS rank-IC
−0.0317, p=0.094, 8/8 instruments, 20y, 3,576 OOS rows). Your own action plan A20
([`august action plan.md:119`](august action plan.md:119)) says "cot-extremes stays
display-only forever." So: the page is correctly framed as context — but **the
bot's contrarian bump (score 0.60, `passed=True` on fading the crowd) is
claiming support the registered test did not find.** Either leave the bump in
explicitly as an untested prior (fine), or drop it. Do not let the page's
"confluence = strongest version" copy imply edge.

**P4-2 — The filter's "extreme" is a percentile of a _rolling 156-row_ window
that is not truly rolling in the cache.** The `/api/cot-extremes` handler fetches
`$limit=156` rows ordered by date desc and ranks today against the other 155
([`_worker.js:1825`](_worker.js:1825)). If a report is ever skipped, 156 rows ≠ 156
weeks and the "3-year percentile" silently drifts. The factor-test backfill uses the
proper lagged/rolling method; the display-grade endpoint does not. For a
conditioner that only fires at the 90th/10th tails, this is a second-order issue —
but it's a real inconsistency between the two COT pipelines in the same repo.

**P4-3 — Publication lag is handled in the factor test but not surfaced in the
bot filter's timing.** The bot filter gates on the report date's _age_ (stale >10
days) but not on the _as-of_ date — a Tuesday-snapshot report released Friday is
already ~4 days old the first Monday it's tradable, and the CFTC "current" reading
is always one release behind live price. That's acceptable for a conditioner, but
the module should state "this is the Tuesday snapshot, N trading days old" in its
reason so a user can't mistake it for current positioning.

**P4-4 — Disaggregated (Managed Money) vs TFF (Leveraged Funds) universes are
different populations, mixed on one board.** Gold/energy use Managed Money; FX uses
Leveraged Funds. The page's cross-market comparisons (group medians, scatter,
"specs vs commercials") blend two different trader definitions. The factor-test doc
already flags this; the display doesn't. Add a per-instrument "population" tag.

**P4-5 — `pctRank`'s strict `<` understates extremes on tied data.** `pctRank =
count(v < cur)/n` ([`_worker.js:1803`](_worker.js:1803)) gives the current value no
credit for ties. With weekly data and a 156-window, a flat positioning regime
produces many tied values and a 90th-percentile read is harder to reach than the
naive "90% of history is below" intuition. Use `(count(v<cur) + 0.5*count(v==cur))/n`
or percentile-with-midpoint to avoid a systematic bias against exactly the extremes
the filter keys on.

**P4-6 — The COT→options cross-check is exactly right to keep unblended.** The
`oiCrossCheck` panel shows COT futures positioning next to options walls without
folding them into one verdict. Keep that discipline. (The OI bot's own planner,
by contrast, _does_ blend OI walls and GEX and vanna into one size — worth
revisiting per P3-1.)

---

## 5. System outputs and integration

- **The "one plan, one executor" split (JS planner → Python executor) is the
  single best architectural decision here.** No JS/Python drift on levels or
  direction; the Python bot explicitly refuses to recompute anything. That removes
  an entire class of silent divergence bugs.
- **State persistence (one-shot entered/primed/features/risk-ledger/runners) across
  restarts is well done** — most home-built bots lose this on a bounce and double-enter.
- **The three-clock problem is real:** `oi_store.savedAtMs` (paste time),
  plan `generatedAt` (server refresh), and the bot's own tick loop. The page, the
  plan, and the fills can each be fresh while the others are stale. One "as-of"
  chain (paste time → plan time → last fill time) printed consistently across page +
  bot status + alerts would fix a whole class of "why didn't it trade / why did it
  trade that" confusion. (The plan-age gate handles the worst case, but not the
  stale-chain-with-fresh-plan case, P3-6.)
- **The C+Z / OI export → TradingView overlay is a nice bridge** between the
  analysis page and a charting workflow; the `?reach=1` opt-in keeping the default
  fast is a thoughtful touch.
- **OI auto-ingest is 80% built and parked.** `oi_recon/fetch_oi.py` + `matrix_build.py`
  produce paste-format TSVs from CME JSON, with a validator, but the KV write is a
  shadow key and the pure `buildOIEntry` extraction from `oiAnalyse` is still listed
  as not built ([`oi_recon/README.md:116`](oi_recon/README.md:116)). Productionising
  that (even as a daily scheduled fetch that _overlays_ rather than replaces manual
  paste) would remove H6 and make the forward-test sample actually accumulate.

---

## 6. Prioritised recommendations

### P0 — do these first

1. **Treat COT as display-only context end-to-end.** Remove or explicitly mark the
   bot's contrarian score bump as an _untested prior_ (it currently reads as a
   supported read). Cite the Q17 null in the page and the module docstring.
   ([`bot/modules/cot_filter.py:175`](bot/modules/cot_filter.py:175))
2. **Fix the max-pain reversion stop** — tight, defined stop (ATR/percent), not the
   far structural wall. This is the highest-frequency mode and currently the
   economically worst-defined one. ([`js/oiZones.js:650`](js/oiZones.js:650))
3. **Productionise the OI auto-pull** (or explicitly accept the paste dependency).
   At minimum add the stale-chain gate (refuse entries when `oi_store` is older than
   N hours even if the plan is fresh). ([`oi_recon/README.md:116`](oi_recon/README.md:116))

### P1 — high value, lower risk

4. **Fix the `localRegime` day-expiry plumbing** (H4) or delete the flag. A feature
   that can never fire in the traded path is worse than no feature — it implies
   protection that isn't there. ([`MD files/OI_LOCAL_REGIME_FORWARD_TEST_PLAN.md:8`](MD files/OI_LOCAL_REGIME_FORWARD_TEST_PLAN.md:8))
5. **Compute the traded regime on the actual day-expiry DTE + smile IV**, not the
   fixed 14-DTE flat-vol GEX; never size a 1-DTE trade off a 14-DTE gamma sign.
6. **Collapse the sizing multiplier tower** to ≤3 evidence-backed inputs and let
   the hold-score calibration tune _one_ scale, not eleven.
7. **Add per-asset-class reachability calibration** (or relabel the cross-asset
   numbers as approximate and drop the false precision).

### P2 — polish / analytics depth

8. **Add a day-over-day comparison to the OI page** (walls firming/fading, pin
   drift, OI building/liquidating) — the data exists in `/api/oi-history`; the page
   just doesn't show it.
9. **Window max pain** to the near-money envelope and show both reads.
10. **Track the proposal→fill funnel per mode** (zones proposed / primed / deferred /
    filled / resolved) as the denominator for every win-rate claim.
11. **Fix `pctRank` tie-handling** and add the population (Managed Money vs
    Leveraged Funds) tag to the COT page.
12. **Unify the three clocks** (paste → plan → last fill) into one as-of chain on
    the page, bot status, and alerts.

---

## 7. Bottom line

This is an unusually well-built home system — the provenance-first UI, the
one-planner-one-executor split, the restart-safe state, and the failure-closed
gates are genuinely senior habits. The two structural risks are: **(a)** the edge
itself is unproven and the bot carries a large surface of tunable theory multipliers
that will happily fit noise; and **(b)** the most important measured fact you have —
the COT null — isn't consistently reflected in what the bot does with COT. Fix the
max-pain stop, gate on OI-chain freshness, shrink the multiplier tower, and keep
running the forward test with the funnel denominator, and the desk's output will be
much closer to its (excellent) presentation.

---

# PASS 1 RE-RUN — 2026-08-24

Pass 1 shipped four commits, all in the OI-bot path. I verified each against the code
and the live-plan behaviour described in the commits. Here is what changed, what it
fixed, the meta-pattern it exposed, and what is still open.

## 1.1 What pass 1 changed

| Commit    | Change                                                                                                                                                                                                                                                                                                            | Maps to my finding                 | Verdict                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `9bd0530` | **Mode C (max-pain reversion) had never fired.** `_nearDTE` read the dead `inst.expiries` shape; now prefers `inst.dte` (the traded day expiry), falls back to `perExpiry[]`, legacy `expiries` last. Stop capped at `maxpainSlFrac ×` distance to pin (RR ≥ 1 by construction; the guard wall wins when closer). | P0-2 (stop) — and one level deeper | **Correct, and more important than I flagged.** The mode I reviewed as the "highest-frequency, most mechanical" trade had zero firings. |
| `3a7200d` | Charm boost was a **presence test** (`cex !== 0`, true 11/11) reading the **far primary expiry's** smile (7–46 DTE) while Mode C trades 0–3 DTE. Now requires smile DTE ≈ traded DTE AND near-dated; surfaced as `charmNote`.                                                                                     | New — same class as H4             | **Correct.**                                                                                                                            |
| `10dcc00` | **OI-chain age gate.** Producer ships `oiSavedAtMs` per instrument; executor gates per-instrument fail-closed at `oi_max_age_hours` (30, aligned to `today.html`'s `OI_FRESH_H`); surfaced `oiAgeH` on status lines.                                                                                              | P3-6 / P0-3                        | **Correct** — exactly the third-clock fix.                                                                                              |
| `ede2d1a` | **`localRegime` could never fire on the traded path** (day-expiry `gexFlips` were nulled) **and stamped false "local … confirmed"**. Day set now computes its own crossings; the planner only claims a local read when there is a real crossing (`>1` band).                                                      | H4 / P1-4                          | **Correct** — plus it removed a false-confirmation bug.                                                                                 |

## 1.2 Verified assessment of the fixes

- **Max-pain stop** ([`js/oiZones.js:688`](js/oiZones.js:688)): `min(guardWallDist, maxpainSlFrac × pinDist)`, floored at `buf`, rationale names the stop used. This is exactly the P0-2 fix, and arguably better than my ATR suggestion — it is anchored to the trade's own geometry (stop = f(distance to pin)) rather than a market-statistic. One caution: the default cap (1.0) gives **exactly 1R** when it binds, and this mode has never fired, so its win-rate is unknown. Fine for the paper forward test; do not take it live until the forward test shows hit-rate meaningfully above ~50% post-costs at 1R.
- **Charm conditioner** ([`server.js:13265`](server.js:13265)): correct — charm applies only when the smile belongs to the traded expiry and that expiry is near-dated. Removes an unconditional 1.2× boost that claimed "charm firing".
- **OI-chain gate** ([`oi_bot/oi_bot.py:694`](oi_bot/oi_bot.py:694)): fail-closed, per-instrument (a stale gold paste can't stop NQ), missing stamp reads fresh (same convention as `_plan_age_hours`), transition logging once per change, and `oiAgeH` makes a blocked instrument legible on the config page. This closes the stale-chain-with-fresh-plan hole exactly as flagged.
- **localRegime** ([`js/oi.js:1516`](js/oi.js:1516), [`js/oiZones.js:310`](js/oiZones.js:310)): `>1` band is precisely the right "real read" test; the "unresolved, not confirmed" branch is honest. The day set computing its own crossings (not the primary's) is the same wrong-expiry discipline the charm fix applies.

## 1.3 The meta-finding pass 1 proved: production shape drift is a systemic class bug

Three separate features were dead or fake in production while their unit tests were
green:

- Mode C's DTE gate read `inst.expiries`, which the analyser no longer writes;
- `charmActive` read `cex` from the far primary book instead of the traded expiry;
- `localRegime` received `gexFlips: undefined` on the day-expiry path — the only path
  that runs in production.

All three "survived review" for the same reason the tests did: **the test fixtures are
legacy shapes and production writes different shapes.** This is the deeper version of my
H4. The fix pattern that kills the whole class:

1. **A production-store contract test** — commit a snapshot of the live `oi_store` as a
   fixture and run `buildOIZones` (and the producer's `tradeInst` assembly) against it.
   Assert every mode _can_ fire (Mode C when a ≤2-DTE day expiry is present; charm gated;
   localRegime resolving) — a "golden plan" regression that fails if a mode silently
   dies again.
2. **Planner input-presence diagnostics** — the planner degrades gracefully on null
   inputs, which is good for robustness and _bad_ for detecting dead features (it
   silently no-ops). Extend the existing `diag`/`explainNoZones`/`charmNote`/`droppedZones`
   pattern: report every optional input the planner consumes (`change`, `stability`,
   `expMove`, `holdWeights`, `gexMedianAbs`, per-strike IV smile) as present/missing in
   the plan, so "input missing" is visible instead of silent.

## 1.4 Where the original review was right, and where it fell short

Right (and now fixed): the max-pain stop (P0-2), the localRegime dead code (H4), the
stale-OI-chain-with-fresh-plan hole (P3-6).

Fell short: I described max-pain reversion as the "highest-frequency, most mechanical
mode" — it had **never fired**. The dead-field class was the deeper truth, and while I
caught it for `localRegime`, I missed it for Mode C and charm. A desk review should have
verified **produced plan output** (what zones actually appear per instrument on the live
store), not just code + unit tests — exactly the lesson these commits encode.

## 1.5 Still open (unchanged from pass 0)

- **COT null treatment (P0-1)** — untouched. The bot's contrarian bump
  ([`bot/modules/cot_filter.py:175`](bot/modules/cot_filter.py:175)) still reads as a
  supported read against your banked Q17 null.
- **Flat-vol regime on the traded path (H3, refined).** Pass 1 fixed the _fixed-14-DTE_
  half for the traded path (the day set uses its real DTE, [`js/oi.js:1489`](js/oi.js:1489));
  the residual is **flat vol** ([`js/oi.js:1188`](js/oi.js:1188)) — the day set's
  GEX/regime is computed with `sigmaFn` null unless the per-strike IV smile reaches it.
  Because pass 1 just **revived** max-pain (which sizes off this regime sign), this moved
  from "theoretical" to "live on the most active mode". Highest-value Greek upgrade now.
- **Reachability cross-asset calibration (H5/P1-2)** — untouched
  ([`server.js:5593`](server.js:5593) still `eurusd-m5`).
- **Sizing multiplier tower (P3-1)** — untouched.
- **Page day-over-day view (P1-5), proposal→fill funnel (P3-8), COT tie-handling /
  population / lag (P4-2..5), auto-ingest productionisation (P0-3: the gate is done but
  the fetch path is still not wired)** — untouched.

## 1.6 Re-prioritised next steps

1. **P0 — production-shape contract test + input-presence diagnostics.** Kills the
   dead-pathway class that pass 1 proved is real and recurring.
2. **P0 — let the per-strike IV smile reach the day-expiry Greek compute.** Kills the
   flat-vol regime on the mode pass 1 just revived.
3. **P0 — apply the Q17 COT null end-to-end.** Remove or explicitly label the contrarian
   bump as an untested prior.
4. **P1** — sizing-tower collapse; per-asset reachability calibration; page day-over-day
   view; proposal→fill funnel; COT tie-handling/population/lag; productionise the OI
   auto-pull.

**Bottom line after pass 1:** the four fixes are correct and materially reduce real risk —
no more trading a dead book, no more phantom 1.2× charm boost, no more false "local
confirmed", and max-pain reversion is finally live with a sane stop. The bigger lesson is
the recurring shape-drift bug class; close it with a production-fixture test and
input-presence diagnostics before the next pass tunes anything else.
