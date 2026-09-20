# Crown watch — a running log

Nicholas Crown clips get dropped into this thread as they come, before the
owner reads or hears the same idea somewhere else. **The point of this log is
not to turn every clip into a trading system** (owner, 2026-09-19) — it's to
mine the clips for durable market-mechanics understanding: how one thing
moves, how X relates to Y, what's worth showing on the page or triggering an
alert on. A clip that yields no tradeable entry can still yield a real,
displayable nugget; those are different questions and both get asked. Each
clip gets the same pass, in order, every time:

1. **What's the actual claim** — stated as something that could be true or
   false, not as a vibe.
2. **What's already on this desk** — audited, not assumed. Often a claim is
   already built, already tested (pass, null, or partial), or contradicted by
   an existing result (S10 already nulled a Crown crowding claim outright).
3. **Is it a trading claim or a macro-understanding claim.** Trading claims
   go through the pre-registration discipline in `MARKET_SENSE_TESTS.md`
   (state the reading rule before running) *if and only if* someone wants the
   entry itself tested. Macro-understanding claims — "how does one market
   explain another" — are what `js/macroChain.js` (the chain on `today.html`)
   exists for, and mostly don't need a statistical test to act on, just an
   honest audit of whether the chain already covers the mechanism described.
4. **Is there a display/alert nugget, independent of #3's verdict.** Ask this
   on every clip, even a pure trading claim whose entry tests null: is there a
   real, already-established-or-establishable *descriptive* fact here — a
   base rate, a "this reads as X" context line — worth putting on a page or
   wiring into desk watch as a trigger? Same standard the chain already uses:
   `~ context`, explains rather than predicts, never dressed up as a signal.
   A null entry doesn't kill this — e.g. the VWAP entry work (2026-09-19
   entry) found no tradeable touch/pullback edge anywhere, but its own §7
   "return to VWAP" book is a real, cross-instrument-replicated base rate
   that was never asked whether it belonged on a page.
5. **Verdict and action** — built now (cheap, unambiguous), pre-registered
   for later (needs a real test), noted as already covered / already nulled
   with a pointer to where, and/or proposed as a display or desk-watch item
   per #4 (state it, don't build a new live feature unasked — confirm scope
   first if it's a real addition, not a one-line chain edit).

Nothing here is a trading signal. The chain is stamped `~ context` on the
page for a reason: it explains, it does not predict — see `macroChain.js`'s
own header and the "How we talk about results" section of `CLAUDE.md`.

---

## 2026-09-18 — "The 10-year is driving the bus, and the asphalt is crude oil"

> *"If you are a tick trader right now, you are like an ant riding the back
> of a horse in the back of a Ford F-150... Macro right now is the only way
> to approach the market... Look at SPX right now — it might as well be the
> price of milk in the grocery store... The ten year is driving the bus, and
> the ten year is driving the bus because the asphalt it's driving on is
> fucking crude oil."*

**1. The claim, stated plainly.** Two parts: (a) single-instrument reads are
unreliable right now — cross-market context is required, and SPX specifically
is quiet/uninformative; (b) there's a live transmission chain — oil moves
feed the 10-year yield, and the 10-year is currently the thing explaining
everything else, more than usual.

**2. What's already on this desk.** More than expected, and it's already
been tested, not just asserted:

- The multi-hop mechanism Crown describes — oil → inflation pricing → nominal
  yields → real yields → the dollar / gold / growth stocks — is **exactly**
  `js/macroChain.js`'s existing chain, link for link: `oil-bei`, `bei-us10y`,
  `us10y-real`, then `real-dxy`, `real-gold`, `real-nq`.
- Two of those links already carry a tested verdict, not just the textbook
  story: `oil-bei` cites S4 (oil and breakevens move in the *same* window,
  not oil-then-breakevens — a quiet breakeven after an oil move is a verdict,
  not a lag); `real-nq` cites the growth-vs-yields study (a real-yield move
  does not forward-predict the Nasdaq's next session; it's description).
- **The one real gap: SPX had no node in the chain at all**, despite being
  tracked everywhere else on the desk (desk watch's VIX-inversion trigger,
  S1, S9's FOMC studies) — so Crown's specific example (SPX is boring, look
  elsewhere) could not even be checked against this desk's own chain until
  today. Confirmed by reading `js/macroChain.js`'s `CHAIN_NODES` before
  changing anything, not assumed.

**3. Trading claim or macro-understanding claim.** Macro-understanding —
Crown is describing how to read the tape, not proposing a rule to trade. The
"SPX is quiet right now" and "the 10Y is driving today" pieces are live
regime observations, not backtestable historical claims, so they don't get a
pre-registration; the *mechanism* (does real-yield-driven discounting reach
the broad index, not just growth names) does, and is fair to test the same
way `real-nq` already was.

**4. Verdict and action.**
- **Built now** (cheap, unambiguous, closes the actual gap): added an
  `spx` node and a `real-spx` link to `js/macroChain.js`, parallel in
  structure to `real-nq` — same real-yield mechanism, framed around exactly
  Crown's point (a quiet SPX doesn't mean a quiet market; it means less
  duration in the index, so check `real-nq`/`dxy`/`gold` before concluding
  nothing is happening). Wired into the data plumbing that already existed
  for it (`SPX500_USD` was already fetched for desk watch, just never fed
  into the chain's node list) — `server.js`'s `_watchInputs()`, `today.html`'s
  `CHAIN_OHLC`. Test coverage added to `js/macroChain.test.mjs`, all green.
  Nothing else changed; this is additive, no existing link touched.
- **Pre-registration candidate, not yet run (S17):** does `real-spx` forward-
  predict anything, the same test `real-nq` already ran (a down-week widening
  the next session; does the yield leg add anything beyond that). Cheap
  follow-on to an existing harness pattern — register it in
  `MARKET_SENSE_TESTS.md` before running if/when picked up.
- **Not claimed:** whether the 10Y is *currently* dominating cross-asset
  moves more than its historical average is a live regime question this log
  can't settle by reading code — it needs the chain actually running today
  (or a "who's driving" leadership ranking across `CHAIN_NODES`, a real
  extension idea, not yet built: rank nodes by how much of the others'
  concurrent moves they explain, refreshed with the page). Noted here as a
  candidate for a future entry, not started.

---

## 2026-09-18 (2) — "Gold is getting cheaper, just not in dollars — CL1÷GC1"

> *"We're pricing it in barrels of crude... crude and gold are keeping score on
> two different sides of the same gigantic macro trade... crude is the
> dominant market here... gold is getting progressively cheaper relative to
> crude... you just take CL1 divided by GC1... this relationship has the
> tendency to mean revert, not because oil and gold move in some magical fixed
> ratio, but because even in a strong trending market one side eventually
> becomes overextended relative to the other."*

**1. The claim, stated plainly.** The oil/gold price ratio mean-reverts;
right now oil has run far enough ahead of gold (post-FOMC) that the ratio is
stretched, and the predicted resolution is gold catching up (outperforming
oil going forward), not oil giving back its move.

**2. What's already on this desk.** Nothing — checked before writing anything
(`grep` across `MD files/`, every `js/*.js`, every `*.html` for gold/oil
ratio language; the handful of hits were "gold" and "oil" mentioned near each
other as separate instruments in vol-forecast benchmarking and desk-watch
code, not a ratio concept). This is a genuinely new claim to the desk, not a
repeat or an extension of something already tested.

But the *shape* of the claim is not new: it is structurally identical to the
one sleeve this desk has already validated — the 2Y yield-spread z-score
mean-reversion (`YIELD_SPREAD_STRATEGY.md`): a rolling z-score of a spread/
ratio, an extreme entry threshold, a bet on reversion. That gives a discipline
to borrow rather than invent: same z-window family, same entry threshold,
reused rather than fit fresh to this data.

**3. Trading claim or macro-understanding claim.** Trading claim — this
predicts a forward relative return (gold outperforms oil), not just a
mechanism. Goes through `MARKET_SENSE_TESTS.md`'s pre-registration
discipline, not into `js/macroChain.js` as a described link (the chain has no
direct oil↔gold link either, by design — they only connect indirectly through
the real-yield chain, and that's a mechanism note, not a ratio-trading claim).

**4. Verdict and action.**
- **Pre-registered as S17** in `MARKET_SENSE_TESTS.md`, before any data was
  touched: ln(WTI÷gold), 126-session rolling z, |z|≥2.0 entry (both
  directions, scored separately, since the mechanism claims symmetry even
  though Crown's call today is one-sided), outcome = forward relative return
  (gold return − oil return) over 5/20 sessions, share bootstrapped against
  the **unconditional benchmark share** (not just "CI excludes 50%" — a
  reversion claim that doesn't beat the base rate of gold beating oil on an
  ordinary day hasn't shown anything). Pass bar: CI excludes 50% AND beats
  the benchmark by ≥10pp, on ≥40 episodes, per horizon.
- **Harness written, not run.** `analysis/market_sense_studies.mjs`'s S17
  block is committed and reviewed. **Blocked on data, same as S15(a)'s oil
  leg**: needs `WTICO_USD` daily bars via OANDA, and this session's network
  egress is still denied to OANDA/FRED (checked again before writing this
  entry). No local fallback exists either — confirmed the M1 parquet cache
  has no oil file and no oil price series exists anywhere else in this repo.
- **Not claimed:** anything about whether the ratio is *actually* stretched
  right now, or what "catching up" looks like in this specific episode. That
  needs the same run.

---

## 2026-09-18 (3) — "Dollar/yen and the intervention around it is the only chart you need"

> *"The only chart you need on your screens right now... dollar yen and the
> intervention that's around dollar yen from the U.S. and Japan is driving
> the entire market... the war trade is energy up, dollar up, and this is
> pushing back on the dollar up part, so we can have high energy, we could
> have a lower dollar that is forcibly lower not from interest rates, from
> intervention, and we can have high gold, high silver, strong industrial
> metals, and all of this should not be happening at the same time... you
> don't need to look at AI anymore... you just need to understand dollar
> manipulation."*

**1. The claim, stated plainly.** Two linked pieces: (a) USD/JPY, and
specifically US/Japan FX intervention around it, is the single dominant
driver right now — everything else (sector rotation, AI, Nvidia) is noise by
comparison; (b) intervention can force the dollar down (against the yen
specifically) *without* that being a rates/real-yield story, so it can
coexist with — not contradict — a "war trade" that's simultaneously pushing
energy and the dollar up elsewhere. The tell is an unusual co-movement: high
energy, a forced-lower dollar, and gold/silver/industrial metals all bid at
once.

**2. What's already on this desk.** Checked `js/macroChain.js`'s
`CHAIN_NODES`/`CHAIN_LINKS` before writing anything, same as the last two
entries:

- `usdjpy` was already a node, and already had exactly one link —
  `vix-usdjpy` (fear → yen), whose own BROKEN-down sentence already names
  "a BoJ story or intervention" as the alternative when the yen strengthens
  without fear rising. So the desk already had language for yen moves that
  don't fit the fear story.
- **The real gap:** `usdjpy` had no link to `dxy` (the broad dollar) at all —
  unlike AUD/USD, USD/CAD and bitcoin, which all sit downstream of `dxy` in
  the chain. So Crown's specific claim (the yen decoupling from an otherwise-
  firm broad dollar) had no mechanism to test against; it was structurally
  invisible, not just unmeasured.
- No silver node, no intervention detector, and no direct oil/gold/dollar
  three-way link — checked and confirmed absent, same audit-before-building
  discipline as the last two entries.

**3. Trading claim or macro-understanding claim.** Macro-understanding, and
a live regime read on top of it. "USD/JPY is the one chart right now" is not
a backtestable historical claim as stated — it's a today-specific call. The
*mechanism* underneath it (does the yen track the broad dollar, and what does
it mean when it doesn't) is exactly what a chain link can show, the same way
`real-spx` operationalized the first clip's "SPX is quiet" observation without
testing whether SPX is quiet *right now*.

**4. Verdict and action.**
- **Built now:** added a `dxy-usdjpy` link (sign +1) to `js/macroChain.js`,
  parallel to the existing `dxy-audusd`/`dxy-btc` links. Its broken-up
  sentence names the intervention shape directly (broad dollar firm, yen not
  following); its broken-down sentence names the BoJ-dovishness alternative
  and explicitly says a dollar sell-off elsewhere in the chain (gold up, AUD
  up) alongside a stuck-or-rising USD/JPY is the "intervention alongside the
  dollar story" shape Crown described, not a contradiction of it — so the
  page can now show that specific co-movement pattern instead of it being
  invisible. Test coverage added to `js/macroChain.test.mjs` (holding case +
  both broken directions), all green. Additive only, nothing else touched.
  Registered in `LEGO_MODULES.md`.
- **Not built:** a silver node. Gold and copper already cover the
  precious/industrial ends of Crown's "gold, silver, industrial metals"
  basket with real-yield-driven mechanism links; a third metals node is a
  reasonable next addition but a bigger one than today's — noted as a
  candidate, not built.
- **Not claimed:** whether USD/JPY genuinely is the dominant driver right
  now, whether intervention is actually happening, or whether the
  gold+silver+metals co-move is currently live. Those are today's-tape
  questions the chain has to actually run to answer, same limit noted on the
  first entry's "is the 10Y dominating today" question — not something this
  log can settle by reading code.

---

## 2026-09-19 — "Institutional traders get paid to beat this line" (VWAP)

> *"All institutional traders get paid to do one thing: beat this line...
> the single most common benchmark the algorithms target is the VWAP...
> above it, buyers are in control, below it, sellers are in control...
> enter your long on the first pullback after a qualified break — the algos
> that missed this next leg up are waiting, hungry to get the fill...
> acceptance below the VWAP means the regime has changed: three consecutive
> closes below VWAP and a retest of the line that holds, control has
> shifted from buyers to sellers."*

**1. The claim, stated plainly.** Three linked pieces: (a) rationale —
agency execution desks are compensated for beating VWAP, so a large,
systematic share of institutional flow works to trade at/near it, making it
a real benchmark, not folklore; (b) descriptive regime read — price above
VWAP means buyers control the session, below means sellers do; (c) two
trading rules — enter long on the first pullback/retest of VWAP after a
"qualified break" (unspecified three-part checklist, not available to us);
and a regime-flip confirmation — three consecutive 5-minute closes below
VWAP plus a retest that holds means control has shifted, adjust the
position.

**2. What's already on this desk.** More than any Crown clip audited here
so far — this desk has tested VWAP as a trading signal **six separate
times, in six mechanically distinct constructions, on up to four
instruments each, all null**, before today:

- `MD files/VWAP_REVERSION_FINDINGS.md` — the session VWAP ±2σ band,
  fade/bounce/follow, real OANDA M1, 26 pairs, 2016–2026, costed IS/OOS:
  **0/26 pairs OOS-positive on every mode**, gross return ≈ zero (not "a
  real edge killed by costs" — no edge existed before costs either).
- `education/jordan_vwap_session_reversion_backtest/RESULTS.md` — a
  mechanically different VWAP-reversion pattern (fade the London session's
  move back toward VWAP at the NY handoff), same 26 pairs: **1/26
  OOS-positive** (noise), pooled gross ≈ zero.
- `MD files/GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §6, `js/vwapImpulseEntryV1Engine.js`
  — **this is Crown's rule (c) almost exactly**: a closed HTF impulse bar
  (30m/1h/4h — the "qualified break") unlocks a with-impulse entry at the
  session VWAP as price pulls back to it (`pullback_continuation` mode).
  Pre-registered, run on gold M1 2016–2026: **null at every trigger
  timeframe** (best OOS t +0.37, statistically indistinguishable from
  zero); an exit-geometry pivot (§7d, time-stop instead of the impulse
  extreme as target) was tried specifically because the entry looked like
  it might just have the wrong exit — **also null** (OOS t −1.3 to −3.7).
- The same doc's §14 — the closest match to rule (c)'s companion idea
  (trade *with* a move away from VWAP once the regime has shifted, not
  fade it back): a with-trend "follow" entry, gated on `bandSlope=
  expanding` — the single best cross-instrument-replicated descriptive
  finding in the entire 1,900-line study (real on gold, EURUSD, GBPUSD,
  USDJPY). Even with the best available context filter switched on: **null
  on every instrument** (OOS t −0.40 to −3.75).
- §8b (`js/rangeFibVwapEntryV1Engine.js`) and §9/§9a
  (`js/stackedFadeV1Engine.js`) — two more VWAP-anchored entry families
  (range-fib levels near VWAP; a stacked-gate fade using the study's own
  mined "best" conditions), gold + up to three FX majors: **null in every
  variant**, including the fully-gated version that used the books' own
  favourite conditions (worst cell of the batch — what over-selection on
  mined data looks like).
- Rule (b)'s descriptive framing (which side of VWAP is "in control") is
  the closest thing to a live finding: §7 of the same doc found price
  *does* return to VWAP from deep bands meaningfully more than a random
  walk, especially outside the NY session — a real, cross-instrument
  effect. But every attempt to convert that description into an after-cost
  entry (five separate trade tests: §6, §8b, §9, §9a, §14) failed. This
  desk's own standing conclusion, verbatim: "the descriptive structure in
  these books, real as it is, does not convert into an after-cost entry by
  gating touches."
- One structural caveat that matters for rule (a)'s rationale specifically:
  `VWAP_REVERSION_FINDINGS.md` already notes **FX "volume" on this desk is
  tick count, not traded volume** — the real institutional participation
  that gives an *equity* VWAP its meaning is absent from an FX VWAP. Crown
  is talking about equity agency execution (pension funds, bank desks);
  this desk's own tradable universe is mostly FX + gold, where that
  rationale doesn't transfer as cleanly even before any backtest runs.

**3. Trading claim or macro-understanding claim.** Trading claim — a
specific, single-instrument intraday entry/exit rule, not a cross-market
mechanism. Not chain material (`js/macroChain.js` models transmission
between markets, not intraday execution mechanics within one).

**4. Verdict and action: already covered, already nulled — not rebuilt.**
Given six independent, honest, costed, OOS-split tests of VWAP-anchored
entries already sitting in this repo, and the one closest to Crown's exact
rule (impulse-qualified break → pullback-to-VWAP entry) already null
including an exit-geometry pivot built specifically to rule out "the entry
idea is right, the exit is wrong" — building a seventh near-identical
VWAP-touch backtest is not the honest next move here. Per this repo's own
"prefer validating what exists over adding surface" rule, this is reported
as covered, not re-run.
- **Not built, not pre-registered as new work.**
- **Genuine, narrow gaps, noted as low-prior candidates, not run:** (i) the
  exact "three consecutive 5-minute closes below VWAP + a retest that
  holds" persistence-confirmation framing was never literally replicated —
  every test used a single touch, a single impulse close, or a σ-band
  event as the trigger, not a multi-bar acceptance count. §14's
  `bandSlope=expanding`-gated follow entry is the closest existing analog
  (trade with a VWAP-side regime shift) and it is null on every
  instrument, so the prior for this variant is low, not zero. (ii) None of
  this VWAP work has been run on NAS100/SPX500 — the index CFDs closest to
  Crown's actual equity-flow rationale — only FX majors and gold. Both are
  cheap to test if ever picked up (the engines and harness already exist);
  neither is pre-registered here without being asked, given how uniformly
  every prior VWAP construction has come back null.
- **Not claimed:** that VWAP is "useless" in every conceivable form — only
  that the specific fade/bounce/pullback/follow mechanisms actually
  described (by Crown and by the "Jordan" transcripts this desk already
  worked through) have been tested as standalone triggers and found
  nothing. VWAP as a *conditioning filter* on an edge that already exists
  remains the one open, untested form — and it needs a validated primary
  edge to condition, which this repo does not yet have validated intraday
  (same open item `VWAP_REVERSION_FINDINGS.md` already flagged).

**Follow-up, same day — built as an alert, not an entry.** Owner: not
worried about building systems out of every clip, worried about whether a
clip's a nugget worth showing/alerting on. Applying that lens back onto
this entry's own §7 finding (real, cross-instrument, never asked whether it
belonged on a page): built `js/vwapStretchCore.js` + a live `vwapStretch`
input wired into `js/deskWatch.js`'s `evaluateTriggers` (one `~ context`
trigger per instrument — gold, EURUSD, GBPUSD, USDJPY — firing at a 2σ+
session-VWAP stretch, citing the tested return-to-VWAP base rate and the
NY-vs-Asia/London session caveat, and explicitly disclaiming that no
VWAP-anchored entry built on this desk has ever passed after costs). Full
account, including the two deliberate efficiency choices (σ cached once
per pair per UTC day; the live reading uses M15 not M1, reusing this desk's
own "VWAP is near timeframe-invariant" finding) in `LEGO_MODULES.md`'s
2026-09-19 entry. Not verifiable from this sandbox — same OANDA-egress
limit as everything else live here — validated via `node --check` and full
synthetic test suites instead.

---

## 2026-09-20 — "Who gets hit when the 30-year moves, and who stays insulated"

> *"I ran the correlation between a basket of AI names and the 30-year
> Treasury. The 30-year moves 25 bips north. Who gets hit? AMD moves 9%
> south. Marvell moves 10% south. Nvidia moves about 3.9%. Who stays
> insulated? The only company here is Microsoft... they do it because they
> are printing money with Azure. Azure throws off 100 billion a year. Their
> AI business throws off another 37. So their AI investment is being
> self-funded. They don't need to go out and take on more and more
> expensive debt."*

**1. The claim, stated plainly.** Two parts: (a) a rationale — Microsoft's
AI capex is self-funded from Azure + AI cash flow rather than debt, so it
should carry less discount-rate sensitivity than debt-dependent AI names;
(b) a descriptive claim built on that rationale — when the 30-year yield
rises, AMD/Marvell/Nvidia sell off hard while Microsoft stays insulated, a
real dispersion, not "growth stocks fall together."

**2. What's already on this desk.** The chain (`js/macroChain.js`) already
has `real-nq` (real yields → the Nasdaq) and `real-spx`, both mechanism
links with a tested forward-predictiveness note — but both are INDEX-level.
This clip's insight is a dispersion claim WITHIN that index: the same
"real-nq"/"real-spx" quiet-index sentence from the first entry in this
log ("a quiet SPX doesn't mean a quiet market — check the growth cohort")
one layer deeper — even the growth cohort itself isn't uniform. Checked
before assuming a gap: no single-stock (AMD/MRVL/NVDA/MSFT) data or
analysis exists anywhere in this repo currently — this platform's own
tracked universe is FX/gold/indices via OANDA, not individual equities.

**The gap that mattered: is this even testable here, or blocked on missing
data plumbing entirely (a bigger, structural gap, unlike S17's or the VWAP
alert's OANDA/Railway-only limits)?** Checked `js/tradeLabDataSource.js`,
`js/nasdaqDataSources.js`: this desk already has a ticker-agnostic Yahoo
Finance fetcher (`fetchYahooDaily`, already used live for NQ/gold futures)
and FRED's `DGS30` is already fetched elsewhere in this repo (S9/S10). No
new data plumbing needed — AMD/MRVL/NVDA/MSFT are just tickers to the same
existing fetcher.

**3. Trading claim or macro-understanding claim.** A hybrid, closer to
macro-understanding: Crown states it as an observation about WHY certain
names answer differently to rates (a mechanism), then uses it to justify a
book position — the mechanism claim is what's testable and interesting;
his specific one-day numbers are an anecdote this log does not attempt to
verify.

**4. Is there a display/alert nugget, independent of any entry.** Not yet
answerable — the descriptive dispersion claim itself hasn't been tested,
so there's nothing validated to display or alert on. If S18 below comes
back real, the natural next question is exactly this one.

**5. Verdict and action.**
- **Pre-registered as S18** in `MARKET_SENSE_TESTS.md`, before running:
  OLS beta of each stock's daily log return (Yahoo `adjclose` — mandatory,
  not `close`, since NVDA split 10:1 in 2024) on the same-day `DGS30`
  change, 2023-01-01 → present (the AI-capex-cycle window, a stated
  judgment call), ISO-week block bootstrap CI, reported per +10bp of 30Y
  move. Pass bar: MSFT's beta smaller in magnitude than all three of
  AMD/MRVL/NVDA's, MSFT's CI includes zero, and at least two of the other
  three exclude zero — a real dispersion, not noise. Explicitly not
  claimed: the CAUSAL story (self-funded vs. debt-financed capex) isn't
  testable from a return regression, only the descriptive pattern is.
- **Harness written, not run.** `analysis/market_sense_studies.mjs`'s S18
  block (`bootSlope`/`olsSlope` added as new shared primitives, same file,
  same discipline as every other study here) is committed and reviewed.
  Registered in `market-sense.html`'s study catalog too, so a click can run
  it once deployed. **Blocked twice over in this sandbox**: Yahoo Finance
  is typically network-blocked here (`js/tradeLabDataSource.js`'s own
  documented limitation), and separately, `market_sense_studies.mjs`
  fetches OANDA bars unconditionally at the top of the file before any
  study-specific gating — so even a Yahoo/FRED-only study needs `OANDA_KEY`
  just to start the script. Needs Railway.
- **Not claimed:** anything about whether Crown's specific cited numbers
  (the one day, -9%/-10%/-3.9%) are accurate, or whether the dispersion
  pattern is currently live. That needs the same run.
