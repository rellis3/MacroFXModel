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
4b. **Dates are not claims** (owner, 2026-10-02). Clips arrive undated and may be months
   old. Check the "happening right now" facts only far enough to confirm the described
   setup is a real, occurring configuration — never as a scorecard on the presenter, and
   never as evidence for or against the mechanism. The claim is what is being tested; the
   day it was filmed is not. (This supersedes the earlier habit of tallying live-fact
   accuracy, which was measuring an assumption about when the clip was made.)

5. **Verdict and action** — built now (cheap, unambiguous), pre-registered
   for later (needs a real test), noted as already covered / already nulled
   with a pointer to where, and/or proposed as a display or desk-watch item
   per #4 (state it, don't build a new live feature unasked — confirm scope
   first if it's a real addition, not a one-line chain edit).

Nothing here is a trading signal. The chain is stamped `~ context` on the
page for a reason: it explains, it does not predict — see `macroChain.js`'s
own header and the "How we talk about results" section of `CLAUDE.md`.

**Forward monitoring (owner, 2026-10-18).** A tested claim does not end at its verdict:
its setup goes on the **watch register** (`js/claimWatch.js`, shown on `evidence.html?filter=watched`,
`MD files/CLAIM_WATCH.md`) with the rule exactly as pre-registered, so the desk-watch tick
says once when the setup is approaching or live — verdict and "what to look for" attached —
and scores each fire forward on the outcome the study used. Step 5 therefore has a sixth
option: *put on the watch*. Only tested claims with a frozen rule qualify; a prognosis with
no rule cannot be watched and is not.

---

## Open candidates — noted, not run (check here first)

Every entry below ends with its own "noted candidate, not run" line, but until
now that was the only place it lived — easy to lose track of across a growing
log. This section is the running index; add a line here whenever an entry logs
one, and strike it when it gets picked up (built, pre-registered, or
explicitly declined).

- **S17 (real-spx forward test)** — does `real-spx` forward-predict anything,
  the same test `real-nq` already ran. Cheap follow-on to an existing harness
  pattern. Source: 2026-09-18 entry, step 5.
- **"Who's driving" leadership ranking across `CHAIN_NODES`** — rank nodes by
  how much of the others' concurrent moves they explain, refreshed with the
  page. Not started. Source: 2026-09-18 entry, step 5 ("not claimed").
- **A silver node on the chain** — gold + copper already cover the
  precious/industrial ends of the metals basket; a third node is reasonable
  but bigger than a one-line edit. Source: 2026-09-18 (3) entry, step 5.
- **VWAP persistence-confirmation framing** ("three consecutive 5-min closes
  below VWAP + a holding retest") — never literally replicated; every VWAP
  test used a single touch/impulse/σ-band trigger, not a multi-bar acceptance
  count. Low prior (§14's closest analog is null everywhere). Source:
  2026-09-19 entry, step 5.
- **VWAP work on NAS100/SPX500** — none of the VWAP-touch/pullback work has
  been run on the index CFDs closest to Crown's actual equity-flow rationale,
  only FX majors + gold. Cheap (engines/harness exist), low prior (every prior
  VWAP construction nulled). Source: 2026-09-19 entry, step 5.
- **Round-number pinning on NAS100_USD/SPX500_USD** — extends the existing
  FX+gold round-number-pinning null (nulled on gold + EUR/USD, GBP/USD,
  USD/JPY) to the two index CFDs it's never been run on. Cheap (harness +
  OANDA data already exist), low prior (four prior nulls). Source: 2026-09-20
  (2) entry, step 5.
- **US2000 sensitivity to the existing `vix-hy`/HY-spread credit-stress read**
  — does US2000 react differently than NAS100/SPX500 around days the existing
  HY-spread ≥4% trigger fires or the chain's `vix-hy` link breaks, vs. its own
  unconditional relative-return behaviour (already nulled by S8). Cheap
  (reuses the existing FRED HY series + US2000 OANDA data), prior unclear —
  this is a different cut than S8, not a repeat of it. Source: 2026-09-21
  entry, step 5.

- ~~**AI-crack → metals rotation**~~ — **RUN 2026-10-19, NULL** (`ai-crack-metals`, `ai-crack-metals-silver`;
  `forge/AI_CRACK_METALS_PREREG.md`). 61 semis cracks 2006–2026: gold +0.45 [−0.83, +1.89] over its ordinary
  20-session drift, silver −1.93 [−4.05, +0.16]; both intervals exclude the pass bars. Struck.
- **Energy equities against the barrel** — Crown (2026-10-16, clip 1): XLE rich against
  WTI and distillate is "toxic waste". A 20-session XLE−WTI divergence as a predictor of
  crude or XLE forward return/range. Data in hand (XLE six years in the drill bundle, WTI
  via the same Yahoo path). Nearest finding is `mv-dislocation-forward` (NULL: a
  dislocation says which markets disagree today and nothing about tomorrow). Source:
  2026-10-16 entry, step 5.
- **Leadership persistence** — Crown (2026-10-16, clip 3): hyperscalers over semis
  "continues to the point no one can believe it". Does a 60-session relative-return
  extreme between two equity sleeves run on? `rotation-extreme` (Nasdaq vs Russell) is the
  nearest: the extreme extended in 45% of 140 cases, i.e. a coin. Single-name history here
  is three years; SOX/SMH vs QQQ is the long-history proxy. Low prior. Source: 2026-10-16
  (3) entry, step 5.

- **Implied correlation on the Dispersion tile** — Crown (2026-10-18 re-send of the D2
  clip): Cboe `COR1M`/`COR3M` (2006→) and `VIXEQ` (2014→) are free on the same path as
  DSPX and are not in the catalogue. A display line, not a test: COR1M sits at the 4th
  percentile of twenty years as this is written. Source: 2026-10-18 entry, step 5.

None of these are pre-registered — each still needs the `MARKET_SENSE_TESTS.md`
pre-registration step (state the pass/null bar first) before it's run, per the
standing discipline. Listed here so "cheap, low-prior, not run" doesn't have to
be re-discovered by re-reading five entries.

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

---

## 2026-09-20 (2) — "0DTE options are controlling the entire stock market"

> *"Zero DTE options reached 62.4% of total SPX options volume in 2025...
> when traders buy same-day calls, a market maker is selling the calls...
> they hedge the position with SPX futures... that sensitivity is called
> gamma... zero DTE options do two things really well: pin the market near
> a level, creating sticky price action on round handles like 7400, and
> accelerate the market away from a level."*

**1. The claim, stated plainly.** Two linked pieces: (a) a market-structure
fact — 0DTE (same-day expiry) options are now 62.4% of SPX options volume
(CBOE's own 2025 research), a large enough share to matter; (b) a mechanism
— dealers who sell 0DTE options delta-hedge with futures, and because 0DTE
gamma is extreme near expiry, that hedging flow can pin price near round
strikes (dealers long gamma, buying dips/selling rips) or accelerate it away
from a level once a "gamma flip" is crossed (dealers short gamma, chasing
the move) — the standard dealer-gamma/GEX narrative.

**2. What's already on this desk.** Far more than any clip audited here so
far — a large, mature, interconnected options-gamma-exposure subsystem
already exists, built well before this log started. Delegated a thorough
read (file-by-file, not name-guessing) rather than skim it:

- **Instrument coverage.** Not SPX-only, but SPX *is* in scope: `oi_bot.py`
  states its universe plainly — "gold + indices; FX only when the plan
  includes it" — and `js/oi.js`'s `OI_CME_PAIRS` list includes `SPX500_USD`,
  `NAS100_USD`, `DE30_USD`, `US30_USD`, `US2000_USD` alongside gold and a few
  FX majors (crosses excluded: "no CME chain — OI analysis is meaningless").
- **The exact mechanism, already named.** `js/gammaFlow.js`'s `gammaFlip`
  (zero-GEX crossing = regime boundary) and `js/levelExpectation.js`'s
  five-word taxonomy — **Reject · Break · Magnet · Pin · Edge** — is Crown's
  pin/accelerate story, already built as a labeled framework, not something
  missing from this desk.
- **0DTE handling exists, specifically.** `js/oi.js`'s `pickNearExpiry`
  splits a "day" expiry (comment: "0-3 DTE typically") from the structural
  one, and gamma is deliberately "floored at 1 day (avoids the 0-DTE gamma
  singularity)" — this desk already reasons about near-zero-DTE gamma as a
  distinct regime.
- **But the data is a manual daily paste, not live flow.** `js/oi.js`'s OI
  modal reads pasted CME QuikStrike text into textareas; `oi_max_age_hours:
  30` implies roughly once-a-day freshness. Crown's claim is about
  *intraday* same-day hedging flow pushing price *today* — this system
  reads a static snapshot, at most once a day. Structurally, it cannot
  follow the live flow Crown is describing, regardless of how good the
  mechanism model is.
- **Mostly unvalidated, and this desk's own docs already say so.**
  `LEGO_MODULES.md` status tags: `levelExpectation.js` "🔬 built ·
  unvalidated (mechanism only, no outcome scoring yet)"; `levelHeat.js`
  unvalidated; `oiConfluence.js` "forward-testing / opt-in live" (its own
  note: "no historical options-OI exists for spot FX" — a true backtest is
  impossible there by construction); `oiZones.js` (the live "OI bot"
  planner) "forward-testing / paper (executor built, no proven edge)".
- **The one real backtest that exists came back null — and on the wrong
  instrument.** `oi_research_book/RESEARCH_BOOK.md` Part 12 ran the bot's
  actual, unmodified production code (`buildOIZones`/`buildOIEntry`) on six
  years of EUR/USD M1: OOS mean −0.031R, "does not show a robust edge." The
  book itself flags that EUR/USD isn't in the bot's live universe (gold +
  indices) — so this doesn't speak to whether the SPX/NQ/gold version works;
  that backtest is a stated, undone roadmap item.
- **Round-number pinning — a piece of Crown's specific claim — has already
  been tested, independent of the gamma story, and nulled.** `LEGO_MODULES.md`
  §1m's S/R falsification and `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §8a/§8b
  found no coherent pinning/reversion effect at round levels — but only on
  gold + EURUSD/GBPUSD/USDJPY. NAS100/SPX500 specifically were never checked.
- **The bot is live (paper), not retired.** A commit earlier this session
  (`32e04da`) deleted 34 lines from `oi_bot.py`, but that was one opt-in
  gate inside the file, not the file itself — `oi_bot.py` is 1,199 lines and
  still being edited in later commits. `js/serviceFlags.js`'s `oiBot`
  service is on; `js/botRegistry.js` carries an `oi_bot_status` ("OI Gamma")
  card. Whether the Python executor itself runs as a supervised live process
  is unconfirmed from the code alone (absent from `start.sh`'s list) —
  flagged, not resolved, here.

**3. Trading claim or macro-understanding claim.** Macro-understanding at
its core (how dealer hedging mechanically transmits from options flow to
futures price) with a specific, checkable market-structure fact (the 62.4%
share) attached. Not chain material — `js/macroChain.js` models cross-market
transmission on daily deltas; intraday options-hedging mechanics are a
different object this desk already houses elsewhere (the OI/gamma stack).

**4. Is there a display/alert nugget, independent of any entry.** Already
built and already live — `oi_bot_status`, `js/oiLevelExport.js`'s OI-walls
export, and `levelExpectation`'s Reject/Break/Magnet/Pin/Edge tags already
surface this on the desk in paper mode. Nothing new to add here; the honest
gap is validation, not visibility.

**5. Verdict and action: already covered, not rebuilt.** This desk didn't
need to discover the gamma-hedging mechanism — it already modeled it, named
it, and partially wired it live, before this log existed. What it hasn't
done is validate it (only one real backtest exists, null, on an off-universe
pair) or check the one piece of Crown's claim that's cheap to check
independently of any options data at all (round-number pinning on
NAS100/SPX500 CFDs, reusing the exact harness that already nulled it on four
other instruments).
- **Not built, not pre-registered as new work.** The core mechanism claim
  (0DTE flow → live intraday hedging pressure) isn't testable here in
  principle with a once-daily manual paste, no matter how much code gets
  written — that's a data-access gap this desk cannot close, not a build gap.
- **One genuine, cheap, low-prior candidate, noted but not run:**
  round-number pinning on NAS100_USD/SPX500_USD specifically, extending the
  existing FX+gold null. Cheap because the harness pattern and the OANDA
  data are already there; low-prior because the same test has already come
  back null four times running. Not pre-registered here without being
  asked, given how the last four attempts went.
- **Not claimed:** whether the CBOE's 62.4% figure is accurate (not this
  desk's data to check), or whether the live `oi_bot`/gamma stack is
  currently working as intended in production — that's a status question
  for the owner, not something this log can settle by reading code.

---

## 2026-09-20 (3) — "How to hedge your stock portfolio like the pros" (rolling protective puts)

> *"Buy one SPX/XSP put ~5% below spot, one month out, sized to your
> portfolio's notional; roll it forward each month before expiry so it
> doesn't expire worthless. If the market drops, the puts offset the
> portfolio loss; if it doesn't, you've paid the premium as the cost of
> insurance. Fun fact: you've just also learned how an annuity contract
> works."*

**1. The claim, stated plainly.** Two linked pieces: (a) a mechanical
recipe — size and roll monthly ~5%-OTM index puts (SPX above ~$500k notional,
XSP below) to hedge a diversified equity/index-fund portfolio; (b) an
equivalence claim — this rolling-put construction is structurally the same
economics as an annuity's embedded downside protection.

**2. What's already on this desk.** Not much that's on-point, and that's the
right answer here rather than a gap to close. This desk's options-adjacent
code (`js/oi.js`, `js/gammaFlow.js`, `js/ivMetrics.js`, `oi_bot.py`) reads
*dealer positioning* to infer short-term price pressure on instruments this
desk trades (gold, indices, FX). It has no module for constructing or sizing
an *investor's own* protective-put overlay on equity holdings, and no reason
to — that's a different job (portfolio insurance for a long equity book) than
what any page here does (reading market state for CFD entries). `js/ivMetrics.js`'s
`riskReversal` is the nearest cousin — it reads put/call skew as a fear
gauge — but that is a different question (is skew elevated right now) from
this clip's content (how to build your own hedge), and nothing here computes
it for SPX/XSP specifically.

**3. Is it a trading claim or a macro-understanding claim — actually, neither.**
This doesn't fit the usual fork. It isn't "how does one market explain
another" (chain material), and it isn't a falsifiable market-behavior claim to
audit or backtest either: "a put gains when the underlying falls and costs
premium otherwise" isn't an empirical proposition to test, it's the definition
of a put's payoff. The one genuinely empirical thread buried in it — *how much
does a systematic 5%-OTM/1-month rolling put program actually cost over time,
on average, across regimes* (the real "cost of insurance" number, sometimes
published as protective-put-index drag) — is a real question, but it needs an
SPX/XSP options history (strikes, IV surface) this desk doesn't have and isn't
built to fetch; it's also a question about hedging *equity* exposure, not
about this desk's FX/gold/index-CFD trading.

**4. Is there a display/alert nugget here, independent of #3.** No. There's no
descriptive market-state fact in this clip to surface — it's a personal
construction recipe (how big a put, which strike, when to roll), not a
reading of current conditions. It doesn't extend or sharpen anything already
on a page.

**5. Verdict and action: not built, not pre-registered, nothing added to the
candidates list above.** Agreeing with the read that prompted asking — this
one is a genuinely correct, standard institutional technique (a rolling
protective put, economically the same insurance mechanic an annuity bundles
with income features) worth understanding personally, but it isn't a claim
about how this desk's markets move, so it doesn't produce a testable entry or
a display/alert nugget the way the other clips have. Nothing built, nothing
tested, nothing queued.

---

## 2026-09-21 — "Small caps are a bucket of zombie companies" (Russell 2000 credit composition)

> *"Forty-one percent [of the Russell 2000] are zombie companies... six basis
> points of margin... all of this debt is floating rate... biotech, leveraged
> consumer names, regional banks, and 2020-2022 leveraged buyouts... a $1.35
> trillion debt wall coming up."*

**1. The claim, stated plainly.** Five linked pieces: (a) ~41% of Russell 2000
constituents are "zombie companies" (can't cover interest expense with
operating profit); (b) the index's aggregate operating margin is ~6bp vs. the
Russell 1000's ~7%; (c) that debt is mostly floating-rate, so a stalled rate-cut
path raises small-cap interest expense directly; (d) the risk concentrates in
biotech, leveraged consumer names, regional banks, and 2020–2022-vintage LBOs
facing a refinancing cliff; (e) a $1.35T debt wall is coming due. Net: buying
IWM/Russell 2000 is a bet on this credit-risk mix, not "scrappy growth."

**2. What's already on this desk.** A genuinely mixed picture — some real
infrastructure, one clean null, and one hard data wall.
- `US2000_USD` is already a first-class instrument here — it's in
  `market_sense_studies.mjs`'s `INSTR` list and `macroChain.js`'s index list,
  not something that needs adding.
- The one prior test closest to "small caps behave differently" already ran
  and came back **null**: S8 ("Rotation underneath a quiet index" —
  `MARKET_SENSE_TESTS.md`) tested 20-day NAS100-vs-US2000 relative-return
  extremes for persistence/reversion and found nothing. Not the same claim —
  S8 is about relative price momentum, not credit-driven differential
  vulnerability — but it's the nearest existing empirical read, and it's a
  null, not a blank slate.
- This desk already has a live, market-wide credit-stress read, just not a
  small-cap-specific one: `js/deskWatch.js`'s `hy-400` trigger (FRED
  high-yield spread ≥4% = "the page's credit gate treats as stress") and the
  chain's `vix-hy` node ("fear → credit": VIX vs. HY-spread divergence, with
  "credit is usually the more reliable of the two" as the stated read when
  they disagree). A faster HYG/LQD ratio also feeds the COG system's gating
  (`cogConfig.js`, `cogDirectionGate.js`, `cogLiquidityGate1B.js`,
  `cogThreshold1Gate.js`, `cogExitEngine.js`) as a "credit risk appetite" input
  to trade throttling. None of this is Russell-2000-specific or
  floating-rate-specific — it's aggregate/IG-vs-HY spread, not a zombie-company
  screen or a refinancing calendar — but it's the closest existing brick.
- The specific numbers in the claim (41% zombie-company count, 6bp margin,
  $1.35T debt wall) need cross-sectional equity fundamentals — per-company
  debt, interest expense, operating income — and this desk has **no fundamentals
  feed at all**: confirmed by search, nothing here ingests balance-sheet line
  items (OANDA gives prices, FRED gives macro series, Yahoo/Finnhub give
  quotes — none carry corporate financials). This is a genuine, structural data
  wall, not a code gap.

**3. Is it a trading claim or a macro-understanding claim.** Mostly the
latter, and it doesn't fit either bucket cleanly. The core assertion — what an
index is actually made of — is "know what you're holding" understanding, not
a short-horizon entry claim, and it isn't chain material either: the chain
models transmission between observable market series (yields, spreads, FX),
not the internal balance-sheet composition of an index's constituents. The one
piece that reduces to a price-behavior question — does US2000 react
differently around credit stress than the large-cap indices — is testable with
what's already here, and it's a different cut than the one S8 already ran and
nulled (S8 conditioned on US2000's *own* relative-return extremes; the open
version here conditions on the *existing HY-spread/vix-hy* signal instead).

**4. Is there a display/alert nugget here, independent of #3.** Partially, and
it's an existing one, not a new one: the `hy-400`/`vix-hy` credit-stress reads
already do the closest thing to what this clip is gesturing at (credit stress
as a leading/confirming market read) — they're just framed market-wide, not
labeled as disproportionately a small-cap risk. Relabeling is a copy change,
not a new metric, and not done here without being asked. The claim's own
specific numbers (41% zombie / $1.35T wall) can't be surfaced at all — no feed
here can verify or refresh them.

**5. Verdict and action: not built, not pre-registered as-is.** The core
composition claim (zombie-company %, debt wall size) isn't testable here in
principle — a fundamentals-data wall, the same shape of gap as the 0DTE
entry's manual-paste limit, not a build gap. One already-run, adjacent result
worth citing: S8 (NAS100 vs. US2000 relative-return extremes) is null, so "small
caps behave detectably differently" already has one null against it in the
narrow sense tested — a different claim than credit-driven vulnerability, but
worth knowing before assuming this is unexplored ground.
- **One genuine, cheap candidate, noted but not run:** does US2000 (vs.
  NAS100/SPX500) move more on days the existing HY-spread/`vix-hy` stress
  signal fires or diverges, reusing the FRED HY series and US2000's existing
  OANDA data — a different slice than S8, not a repeat of it. Not
  pre-registered here without being asked; added to the candidates index above.
- **Not claimed:** whether the 41% zombie-company figure, the 6bp/7% margin
  split, or the $1.35T debt-wall number are accurate — none of this desk's
  data can check them.

---

## 2026-09-21 (2) — "Indicator tier list" (MACD, SMA, Stochastics, Fib, RSI, Bollinger, Donchian, Volume)

> *"MACD, F tier... Simple moving averages, A tier... Stochastics, D tier...
> Fibonacci retracement, solid B tier... RSI, C tier... Bollinger Bands, B
> tier... Donchian Channels, certified A tier... Volume, S tier. I use these
> indicators all the time in the Crown Macro to guide my research."*

**1. The claim, stated plainly.** Eight separate tier ratings, each with its
own mechanism: MACD (F, lagging-of-lagging, ~11 days late in the 2022 bear
market), SMA 50/200 (A, works because institutions watch it), Stochastics (D,
noisy MACD, pins in trends/whipsaws in chop), Fibonacci retracement (B, no
economic reason, self-fulfilling), RSI (C, momentum only, can stay
overbought/oversold for weeks — crude cited at 34 sessions in 2022, useful
mainly for divergence), Bollinger Bands (B, volatility not direction), Donchian
Channels (A, 20-session high/low, breakout systems), Volume (S, the only
indicator not derived from price, shows conviction/positioning).

**2. What's already on this desk.** Unusually rich for this log — most of
these eight aren't hypothetical here, they're already built, and five of the
eight were already tested together in one systematic run:

- **MACD, SMA 50/200, Stochastics, Bollinger, Donchian/Turtle** all exist as
  specs in `js/strategyLabEngine.js`'s "12 famous retail strategies" gauntlet
  (`SIGNALS.macd_cross`, `golden_cross`, `stochastic_trend`,
  `bollinger_reversion`, `donchian_breakout`), and all five were tested
  together in one honest run (Railway, 2026-07-18, 10-instrument universe,
  2bp cost, chronological split): **0/12 survive the gate.** Every spec's IS
  Sharpe was ≈0.0–0.4 (dead ~15 years), OOS 0.6–1.0 (a post-COVID long-bias
  artifact from the split window), none beat buy-and-hold OOS. Golden Cross
  and RSI-2 were the two "most-consistent non-survivors" (DSR 0.85–0.86,
  still below b&h) — the least-bad of the losers, not winners. Full result:
  `BACKTEST_INDEX.md`, `BACKTEST_SYSTEMS_REVIEW.md` §3.7. (Found in the
  course of this audit: `LEGO_MODULES.md`'s row for this engine still said
  "no honest run recorded yet" — stale, contradicted by the dated result
  above; corrected in this same change.) None of the five is wired into any
  live bot — the gauntlet is infrastructure for screening new spec ideas, not
  a live strategy.
- **Donchian gets a second, independent null**: `js/maxCopierEngine.js` uses a
  1H Donchian(20) breakout as its actual entry trigger, in a more elaborate
  system (impulse + consolidation + hidden-divergence). Banked null
  (`LEGO_MODULES.md`): negative pooled OOS Sharpe across all three exit modes,
  2016–2026, 26 instruments — and the autopsy traced the failure to the
  breakout-predicts-continuation premise itself being "economically empty"
  (mean forward move ~0.03–0.09 ATR at 4h–24h, ~50% hit rate, far below the
  ~1-ATR stop + costs needed), not to execution details. So this desk built
  and killed two separate Donchian-breakout systems, one simple, one
  elaborate, for the same underlying reason.
- **Fibonacci** is the most heavily built indicator here by far
  (`js/fibProjection.js`, `rangeFibEngine.js`, `asiaFibAtlasEngine.js`,
  `mondayFibAtlasEngine.js`), and every specific result diverges from "B tier,
  it just works": the range-extension fib ladder is **null**
  (`RANGE_EXTENSION_FINDINGS.md` — pooled OOS −0.115R/trade, 0/26 pairs
  positive; a prior "survivor" slice was retracted as look-ahead bias); the
  base range-fib is **never actually OOS-tested** despite having the UI
  buttons (`TRADABILITY_REVIEW.md` §3 calls it "plausibly breakeven-to-marginal"
  at best); and the one version that's actually live — the Fib Atlas
  vote-portfolio bot — has a stark backtest-vs-live gap
  (`FIB_ATLAS_BACKTEST_VS_LIVE.md`): backtest claims Sharpe 18.4 / 85.7% win
  rate (the doc itself flags this as impossible), the real paper bot is
  **losing money live** (39.6% win rate, −$13,696 over 90 days, 101 trades).
- **RSI** (`js/indicatorCore.js`'s `rsiWilder`) has one real, documented,
  *partial* finding, not a clean pass or null: `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md`
  §19 found an extended RSI at a VWAP-band touch predicts a *worse* fade
  outcome on 3 of 4 instruments (gold −12.1pp win rate, EUR/USD −7.3, USD/JPY
  −8.1, not on GBP/USD) — consistent with Crown's "momentum, don't fade it"
  framing, but graded explicitly weaker than four other context dimensions
  tested in the same scan, and culling on it does not flip the underlying
  trade profitable. No dedicated test of RSI-divergence-only or
  overbought/oversold persistence exists.
- **Bollinger Bands**: confirmed this desk's actual production volatility
  bands (`js/cogBands.js`, `computeBands`) are Feller/driftless-Brownian-range
  derived, an unrelated math family — Bollinger (SMA ± stdev) only exists as
  one of the 12 nulled gauntlet specs, nothing more.
- **Volume**: this desk's own code repeatedly and explicitly disclaims OANDA
  FX "volume" as tick count (price-update frequency), not real traded size —
  comments to that effect appear in at least seven files
  (`js/vumanchu.js`, `vwapReversionEngine.js`, `volStateEngine.js`,
  `touchFeatures.js`, `vumanchuChart.js`, `volBacktestM1Engine.js`,
  `mtfStack.js`). The one feature built on it (`volClimax`, a tick-volume
  spike) is graded **"weak"** (`ENTRY_ZONE_CONFIDENCE.md`) and "fragments and
  dies at 2–3× cost" (`RANGE_EXTENSION_GUIDE.md`). The genuinely
  non-price-derived data this desk does have — CME options open interest via
  `js/oi.js` — is a different asset (options positioning), not the
  spot/futures conviction volume Crown means.

**3. Trading claims, not macro claims — and mostly already answered.** All
eight are backtestable signal-value claims, not chain material. Five were
answered together in one run (null), Donchian was answered twice
independently (null both times), Fibonacci's specific engines diverge by
construction (null / untested / backtest-vs-live gap), RSI has one real but
weak partial confirmation, and Volume's only derived feature tested weak.
Nothing here needs new pre-registration — it needs citing what already ran.

**4. Is there a display/alert nugget here, independent of #3.** One, and it's
already live, just not framed this way: the RSI-extended-at-touch finding
(§19) is already wired into `vwapFixedSigmaEngine.js` as a context dimension
on real touches. Nothing else in this clip suggests a new display item — the
rest is either already-null infrastructure or (Fibonacci, volume) already
surfaced through their existing pages.

**5. Verdict and action: already covered, overwhelmingly null, one doc fixed.**
Zero new code from this entry. Six of eight indicators (MACD, SMA 50/200,
Stochastics, Bollinger, Donchian ×2, and the base range-fib construction) map
onto already-run, already-null or already-unvalidated results on this desk.
RSI has one real, weak, partial confirmation already live. Volume's only
built feature tested weak. The Fib Atlas live bot is the sharpest finding in
here, and it already exists and is already losing money in paper mode — a
live-monitoring fact, not something this entry adds.
- **Not built, not pre-registered.** Nothing in this clip clears the bar for
  new work — every piece maps to an existing result.
- **One doc fixed, not a market finding:** `LEGO_MODULES.md`'s Strategy Lab
  row said "no honest run recorded yet," contradicted by the dated 2026-07-18
  result in `BACKTEST_INDEX.md`/`BACKTEST_SYSTEMS_REVIEW.md`. Corrected in
  this same change — found only because auditing this clip meant actually
  reading both docs side by side.
- **Not claimed:** whether Crown's specific numbers (MACD 11 days late in
  2022, crude overbought 34 sessions) are accurate — this desk tested the
  indicators' broader signal value, not those exact statistics.

## 2026-10-02 — "Bullish and bearish at the same time" (narrow breadth + IWM on its 200-day, calls into NFP)

> *"Market breadth had become so extremely narrow that the equal-weighted S&P was
> getting crushed against the cap-weighted S&P... and at the same time IWM just hit its
> 200-day moving average and it stopped going down. And both of these things happening at
> the same time really gets our attention... fundamentally we are still bearish small caps
> longer term... one of the most important skills in trading is knowing when to diverge
> from the fundamentals and focus on positioning... the next catalyst, that was today,
> non-farm payrolls, had an asymmetric payout to the upside. Because if the jobs data was
> strong, a lot of the pain was already priced in."*

**1. The claim, stated plainly.** Four separable claims, and they do not stand or fall
together:
- **(a) The setup.** Extreme breadth narrowness (RSP/SPY at an extreme) *co-occurring with*
  the Russell holding its 200-day is a signal worth acting on.
- **(b) The structure.** An asset that has "absorbed a ton of bad news" has an asymmetric
  payoff into its next scheduled catalyst, because the bad outcome is already priced.
- **(c) The execution.** Keep the long-term bearish position, add short-dated upside
  convexity (call spreads) into the event.
- **(d) The lesson.** "Fundamentals tell you where you should go in the long run,
  positioning tells you which way it's going right now."

**2. What's already on this desk.** Claim (a) is not merely adjacent to an existing
finding — it *is* one, nulled, in this clip's own words.
- **`breadth-narrowing` — NULL.** The ledger entry reads: *"Market narrowing — equal-weight
  (RSP) lagging cap-weight (SPY) hard — is a 'textbook rotation' worth acting on."* Tested
  over 23 years, 35 de-clustered NARROW events against 267 controls: direction −0.5% at 20
  days [−2.70, +1.57], no reversion of the spread, no continuation of the rotation. The
  range near-miss died on its mirror — extreme *broadening* raises forward range too. Its
  `use` line was written before this clip existed and answers it directly: **"Show the
  narrowing, never alert on it. Use it for positioning, not timing."** Crown uses it for
  timing.
- **`priced-in-direction` — NULL.** "Was it priced in" — what the market did *into* a
  release changing what the outcome does to it — was tested here and came back null. That
  is claim (b)'s stated mechanism.
- **`daily-band-fade` — NULL**, and the level-touch book is closed (`hl-signal`): a line on
  a daily chart, including a moving average, is not an entry here. The specific 200-day
  touch has not been tested on its own, but every member of its family has.
- **`squeeze-fuel` — NULL**: "crowded and underwater is squeeze fuel" failed on four
  instruments over nine years. Claim (b) is the same shape wearing different clothes.
- **`breadth-all-down` — VALIDATED, and it is the one breadth finding that works**: every
  index closing down precedes a *wider* week (+0.31 ATR on SPX500). A range fact, explicitly
  "not a bounce call."

**3. Trading claim or macro-understanding claim.** (a), (b) and (c) are trading claims and
need no new pre-registration — (a) and (b) are already tested and null. (d) is not a claim
at all in the falsifiable sense: "positioning tells you which way it's going right now" has
no stated reading rule, no horizon and no failure condition. It cannot be tested as spoken,
and should not be dressed up as though it had been.

**4. The live facts — incidental, and the clip is undated.** Owner, 2026-10-02: *"when he
talks fact I think we have to take it a little bit slack, as it's just the general idea I'm
interested in — the video may be old or new so [we] don't know when he did it."* That is the
right weighting and it changes what this section is for. A clip arrives without a date, so
"was breadth narrow on the day he filmed" is unanswerable and scoring him on it is scoring
an assumption. The facts are checked only far enough to know the mechanism is COHERENT — a
setup that has never occurred would make the mechanism moot — and not as a scorecard.
Noted, therefore, without a verdict on him: as of 2026-10-02 the described conditions do
all exist, which is as much as can honestly be said.
- *"Equal-weighted getting crushed against cap-weighted."* RSP/SPY closed 2026-10-01 at
  **0.2736 — the 2nd percentile of the past year and the 1st of the past three**, −5.2% over
  three months. True, and not a mild version of true.
- *"IWM hit its 200-day and stopped going down."* The Russell sat within **0.13%** of its
  200-day on 09-28, dipped **0.55% below** on 09-30, and closed back above it (+0.46%) on
  10-02. True.
- *"The next catalyst, that was today, non-farm payrolls."* NFP printed **2026-10-02 at
  12:30 UTC**. True.
- *"They gap higher."* The Russell closed **+0.72%**, high +1.5%. The CFD shows no *gap*
  (open 2816.03 against a 2816.08 prior close) because it trades through the release — the
  gap is real in the ETF and absorbed overnight in the CFD. A measurement artefact, not an
  error.

None of the above is evidence for or against the mechanism, and it is not a record of his
accuracy. If the clip is from an earlier narrow-breadth episode — there have been several,
and his own chart marks three — every number here would differ and the mechanism would be
exactly as true or as false as it is now. **The claim is the thing being tested; the day is
not.**

**5. Verdict and action.**
- **Nothing to build, and nothing to re-test.** Claim (a) is the exact claim `breadth-narrowing`
  nulled; re-running it because a clip restated it would be the "test it until it passes"
  failure. Claim (b) is `priced-in-direction` and `squeeze-fuel` in new words.
- **The distinction worth keeping.** The trade made money and the story told about *why* is
  the nulled one. What he actually held was short-dated convexity into a binary event on a
  beaten-down underlying — a **volatility and skew** structure whose payoff comes from the
  event's distribution, not from breadth. The breadth narrative is decoration on an options
  trade. That is the transferable lesson and it is the opposite of the one the clip states.
- **A barbell is a positioning statement, not a directional one.** Holding the long-term
  short *and* short-dated upside is not "bullish and bearish at the same time" — it is one
  position in direction and one in convexity. Said that way it stops sounding paradoxical
  and starts being checkable.
- **Display nugget (asked on every clip, per the header).** RSP/SPY at a 1st-percentile
  reading is a real descriptive fact and it already has its ruling: show it, never alert on
  it, and read it as *concentration exposure* — at this reading, long the index is long a
  handful of its largest companies rather than "the market", and an index hedge is hedging
  direction when the exposure is concentration. No new build; that is `breadth-narrowing`'s
  `use` line, now with a live example worth remembering.
- **Open question this does NOT settle**, and the only one here worth a pre-registration if
  it is ever wanted: whether option-implied *skew* into a scheduled event is informative
  about the event's realised distribution. The desk now has a live risk reversal from the
  nightly CME settles capture (`oi_store.riskReversal`), which is the input such a test
  would need, and no verdict on it.

---

## 2026-10-05 — "Diversification is dead" (RSP/SPY, and the AI-bottleneck tilt)

> *"This is the RSP spy ratio… this ratio just broke its multi-year trend line a few
> sessions ago. This is the market telling you that breadth is collapsing… even the Mag
> Seven is too broad. The real leadership is compressed into the physical bottlenecks of
> the AI buildout. This is memory, lithography and foundry… a tilt towards the AI
> bottlenecks generated 3.6% in expected alpha over SPY, an equal-weight S&P that's RSP
> generated negative alpha over the same time period."*

**This is his third clip on the same theme, and the desk has tested all three.**

**1. The claim splits cleanly in two**, and the halves have very different standing:
- **(a) Breadth is collapsing and you should act on it.** Already here, three times over.
- **(b) The leadership is semis — memory, lithography, foundry — and tilting there pays.**
  New. Never measured here.

**2. What the desk already holds on (a).**

| his claim | here |
|---|---|
| RSP/SPY narrowing is actionable | `breadth-narrowing` — **TESTED NULL, n=35 de-clustered events**, 23 years |
| crowded / fragile AI trade (earlier clip) | `dispersion-crowded-week` — **NULL**, 68 setups |
| rotation extreme | `rotation-extreme` — **NULL, n=140**. *"Rotation is description, not a warning."* |

`breadth-narrowing` died on its **mirror**: extreme BROADENING raised forward range just as
much (+0.28 vs +0.37), so the effect belonged to the volatile period both readings sit
inside rather than to breadth. Direction was −0.5% at 20d [−2.70, +1.57].

**3. But his PREMISE is right, and this desk already says so in better words.** The
`breadth-narrowing` entry's own `use` note reads:

> *"Show the narrowing, never alert on it. Use it for positioning, not timing: at an extreme
> reading, long the index is long a handful of its largest companies rather than 'the
> market', and an index hedge is hedging direction when the exposure is concentration."*

**That is "diversification is dead", stated more precisely than he states it.** The desk
agrees with the *condition* and rejects the *timing*. Worth saying plainly rather than
leading with the null: he is not wrong about what the ratio describes, he is wrong that it
tells you when to move. Three separate tests, all on his own framing, found the description
real and the trigger empty.

**4. The new half is testable, and the data is already here.** `SMH` is in the drill bundle
alongside `RSP` and `SPY` (`server.js:15176`), **1,581 dates from 2020-10**, plus ten XL*
sector ETFs. SMH holds exactly the names he lists — TSMC, ASML, Micron, Applied Materials,
Lam — so it is the closest listed proxy to "memory, lithography and foundry".

**Pre-registered as `breadth-tilt-semis` (`MD files/BREADTH_TILT_SEMIS_PREREG.md`, committed
before the harness).** The design point that decides it is NOT significance:

> Semis led this entire sample. Any in-sample tilt backtest over 2020-2026 shows large
> alpha whether or not breadth contributed anything. So the gate is whether the
> NARROW-conditioned SMH−SPY spread beats the **unconditional** SMH−SPY spread — and
> whether BROAD setups predict it just as well.

Same shape as `growth-vs-yields`, where the Nasdaq range effect was real and yields turned
out to be a passenger; the one-leg control is what separated them. **Written prior: this
fails on the unconditional control.** A result against that prior is worth more than a
confirmation, which is why it is written down.

**5. On the 3.6%.** Unfalsifiable as given — no period, no method, no out-of-sample split —
and the next sentence is a funnel to the paid letter. Not a reason to dismiss the idea; it
is simply not evidence, and "expected alpha" from an in-sample rebalance attribution is the
easiest number in finance to produce. The desk measures it independently or not at all.

**Verdict.** Premise CONFIRMED as description and already better stated here. Timing claim
null three ways and not worth re-testing. **The sleeve-selection half is the first Crown
claim in a while with a clean testable core and the data already on the desk** — pre-registered,
harness not yet written.

*Resolved 2026-10-16: the six-year run was UNTESTABLE (13–14 episodes against a floor of 20);
the identical design on the 2003→ history is **NULL** on 85 episodes. See the 2026-10-16 (3)
entry and `BREADTH_TILT_SEMIS_PREREG.md` RESULTS.*


---

## 2026-10-16 — "What the hell is going on" (PPI day: puts paid, a rates whipsaw, RSP/SPY hits target, metals split, energy "toxic waste")

> *"First, we get PPI. This thing opens white hot, so we got a gap down immediately in
> stocks... 132% return on premium in our put spreads. Immediately after that, we see
> Treasury vol go completely through the roof. We see yields go down, then up, then down
> again. This helps stage a late day recovery... breadth gapped up a full point, RSP/SPY
> just boom to the moon, hitting our target on that trade in just four trading sessions...
> Market breadth is here to stay, and the AI story is completely under the microscope...
> Anything you see towards the end of the session is a dead cat sympathy bounce... the
> dollar came off 50 bits, giving a little bit of love back to metals... there's monetary
> metals and there's industrial metals, and then there's silver, which lives somewhere in
> between... you need [the AI trade] to crack for metals to continue to go up. Energy is
> toxic waste right here, even as it trades north, because we see divergence between energy
> stocks and the actual underlying barrels and distillate... we covered our TIP shorts well
> before this craziness. This was a widowmaker for macro funds."*

A tape read, not a thesis — he says so himself. Most of it is description of one session,
and the honest pass separates the three things in it that are claims from the many that are
not.

**1. The claims, stated plainly.**
- **(a) "Market breadth is here to stay."** The broadening that just paid will *continue* —
  the RSP/SPY ratio keeps rising. Falsifiable: a forecast of the ratio's direction.
- **(b) "You need the AI trade to crack for metals to continue to go up."** A cross-asset
  mechanism: money leaving semis is what bids gold and silver. Falsifiable as a lead/lag.
- **(c) "Energy is toxic waste because stocks diverge from the barrels."** A divergence
  between energy equities and crude/distillate predicts the equities give it back.
  Falsifiable as a divergence-forward test.
- **Not claims:** the put-spread return, "ending the session up big", "hedge funds blowing
  up", "widowmaker", "dealer desks on the chin", "dead cat bounce", "AI under the
  microscope". Results and colour. None of it is checkable and none of it should be
  scored.

**2. What's already on this desk.**
- **(a) is `breadth-narrowing` H4 — NULL.** The one study that asked what the RSP/SPY ratio
  does after an extreme asked it in *both* directions: H3 (does an extreme narrowing revert?)
  −0.16 [−0.52, +0.14] at five sessions, H4 (does the rotation run on?) −0.37 [−1.12, +0.38].
  Thirty-five de-clustered events over twenty-three years. The ratio's next move after an
  extreme is not forecastable from the extreme, either way. "Here to stay" is a direction
  call on a series the desk has found directionless at this horizon.
- **(b) is not here in any form.** `which-gold` (context) decomposes gold's drivers into real
  yields, the dollar and a reserve residual and finds "no single gold" 45% of the time;
  `fear-gold` (NULL) killed the VIX leg. Nothing has ever asked whether *equity sector
  rotation* is a gold driver. New, and testable from data in hand (SMH, gold, silver). Added
  to the open candidates index, prior unstated — the desk has no evidence either way.
- **(c) is the shape of `mv-dislocation-forward` — NULL** ("when two markets that normally
  move together come apart, something follows": range +0.01 [−0.11, +0.34], direction below
  control, halves flip sign). That was FX and indices, not XLE against WTI, so it is a prior,
  not an answer. The energy-specific work here is the **crack spread** family
  (`crack-inflation-channel` context, `crack-disagreement-direction` NULL on 45 cases at 62%
  [48–75]) — crude against *products*, which is his "barrels and distillate" leg, but never
  against the equities. Added to the index.
- **The rates leg he is proud of avoiding.** "Covered our TIP shorts before this" — TIP
  rallied +0.25% and +0.45% on 10-14 and 10-15. The chain's `us10y-real` and `real-*` nodes
  carry real yields as context; nothing here would have told him to cover, and he does not
  claim it did.
- **"Treasury vol through the roof."** This is the read the desk cannot make: the `^MOVE`
  feed decision from the 2026-10-02 clip (CLIP_WATCH, "dealer inventory spiral") is still
  open — a 0.6-weight factor in the COG risk score abstaining for want of a feed Yahoo
  serves for free. On the daily close MOVE printed 102.5 on 10-15 against a six-month high
  of 113.6 on 10-05, so "through the roof" is an *intraday* claim, and the desk measures
  neither daily nor intraday rate vol live.

**3. Trading or macro-understanding.** (a) and (c) are trading claims; (a) is already nulled
and (c) has a nulled prior and no test. (b) is macro-understanding — "how does one market
explain another" — and the honest audit is that the chain does not carry it: there is no
equities→metals link on `today.html` at all. It is the one genuinely new mechanism in the
clip.

**4. The configuration, checked only far enough to know it is real (step 4b).** Undated as
always; the described session matches 2026-10-15 closely enough to say the setup exists, and
nothing below is a score.
- *"Gap down in stocks... late day recovery."* SPY opened −0.44%, low −0.67%, closed +0.28%
  on 10-15. True shape.
- *"Breadth gapped up a full point."* RSP/SPY **+1.08% in one session** — the **99.1st
  percentile** of every one-day change since 2003. RSP closed +1.37% against SPY +0.28%.
  Over four sessions to 10-16 the ratio is +2.29%, the 99.4th percentile of four-session
  changes. "Boom to the moon" is, for once, the measured description.
- *"Yields down, then up, then down."* The 10-year's 10-14 range was 5.18–5.33 (15bp), and it
  closed 5.09 on 10-15 from 5.19. The high of the move is **5.36 on 10-07**, with highs at or
  above 5.30 on seven sessions since 09-30 — which is clip 2's "repeated rejection near 535".
- *"Dollar came off 50 bits."* DXY −0.54% on 10-15. True.
- *"Monetary vs industrial metals, silver in between."* On 10-15 gold +1.5%, silver +2.3%,
  **copper −1.5%** — the split he describes, on the day he describes it. Over 20 sessions
  silver is −14% and gold −5%, so "metals continue to go up" is a call from inside a
  drawdown, not a trend.
- *"Energy stocks diverging from barrels and distillate."* XLE **+5.9% over 20 sessions**
  against WTI **−1.4%** and heating oil **−6.6%**. The divergence is real and the equities
  are the rich leg, as he says. Over the last five sessions WTI caught up (+7.7% vs XLE
  +4.6%), which is the barrel closing the gap, not the stocks.
- *"Credit spreads wide."* HYG/LQD −1.4% over five sessions. Wider, yes.
- PPI's release date is not in `calendar_events.csv` (its US rows end in 2026-06) and the
  BLS schedule page did not return a date from here; "PPI day" is taken as given.

**5. Verdict and action.**
- **Nothing to build from the clip as spoken.** The one direction call (a) is a nulled
  hypothesis restated; the trade-result talk is not evidence of anything.
- **Two candidates logged** (b resolved 2026-10-19: pre-registered and run NULL on 61 setups, see the
  index above and `forge/AI_CRACK_METALS_PREREG.md`): the AI-crack→metals lead (b) and the
  energy-equity-vs-barrel divergence (c). Both have data in hand. (b) is the one worth a
  prior of "unknown" rather than "null-shaped": nothing adjacent has been run.
- **The display nugget is the speed of the broadening.** The board shows the 20-session
  equal-weight spread as a z-score (`eqwt`). It does not show that a one-day +1.08% in the
  ratio is a once-in-500-sessions event, and that is a real, checkable, descriptive fact that
  changes what "the index was flat" means: on 10-15 the cap-weighted index was flat because
  its largest names fell while the other 490 rose. Same ruling as every breadth finding
  here — show it, never alert on it, read it as *where the return is coming from*, not as a
  forecast. No new build; proposed, not done.
- **The MOVE feed stays the owner's decision**, now with a second clip that wanted it. The
  2026-10-02 pre-registration candidate ("does high or rising bond vol precede wider ranges
  in FX and equities?") is still the first thing worth running when it is taken up.

---

## 2026-10-16 (2) — "How we identified the most important trade in equities this year" (the RSP/SPY long and the layers under it)

> *"We monitor cap weight versus equal weight dispersion via RSP/SPY. This is always sitting
> on our screens... from that starting point we overlay implied versus realized vol, index
> skew, options flow, dealer gamma exposure, and futures positioning alongside various
> technical indicators that CTAs follow... Then we add our rates layer: repeated rejection
> near 535 in tens, strong auction demand on tens and thirties, changes in the Fed funds
> strip... credit spreads widening even as duration caught a bid — a really dangerous sign
> for the financing behind the AI buildout. Finally, the narrative: we use a press listener
> that runs sentiment analysis and measures headline frequency... So the question wasn't
> whether the Fed was going to hike; it's how is market composition going to change. We put
> this trade on a few days ago, and RSP is now surging relative to SPY. We just hit our
> profit target in four days."*

**1. The claim, stated plainly.** One trade and one method.
- **(a) The trade.** Long RSP against SPY, entered when the ratio was at an extreme low,
  profit target reached in four sessions. The entry rule, as far as one is stated, is
  "narrow extreme → expect reversion".
- **(b) The method.** A stack of six layers — breadth, vol surface, dealer positioning,
  futures positioning, rates, narrative — read together to answer "how will market
  composition change". No weights, no thresholds, no stated failure condition. As given it
  is a *description of what was looked at*, not a rule that could be run or falsified.
- **(c) The framing.** "The question wasn't whether the Fed hikes, it's how composition
  changes." A reframing, and a good one: it moves the forecast from a binary nobody can
  call to a relative-value quantity. Not a claim.

**2. What's already on this desk.** The trade is a nulled hypothesis, and most of the layers
are built here.
- **(a) is `breadth-narrowing` H3 — NULL, in exactly these words.** "Does an extreme
  narrowing revert — does the spread broaden back?" was pre-registered 2026-09-23 as the
  one hypothesis "a trader would want", with the expectation written as *unknown*. It came
  back −0.16 [−0.52, +0.14] at five sessions and −0.06 [−0.40, +0.29] at twenty, on 35
  de-clustered NARROW events over twenty-three years. The extreme does not revert more than
  the ratio moves anyway. **This trade worked; the rule it is told through has no edge on 35
  prior instances.** Same split as the 2026-10-02 clip: the money was made, and the story is
  the part that fails. One realised win is one observation added to a well-powered null.
- **The layers, mapped.** The most useful thing in the clip is that it lists what a desk
  looks at, and almost all of it is on this one — with verdicts he does not have:

  | his layer | here | verdict |
  |---|---|---|
  | RSP/SPY on the screen | `eqwt` board finding; `breadth-narrowing` | description real, timing NULL ×4 |
  | implied vs realised vol | `iv-over-rv-wider` | **VALIDATED — for range**, not direction |
  | index skew | `skew-fade` (CME CVOL, 8,611 touches) | NULL; the descriptive skew read did not replicate across sources |
  | dealer gamma | `gex-range` (793 NQ days) | **VALIDATED — range** (+0.18 to +0.32); direction NULL |
  | futures positioning / CTA | `cot-positioning-factor`, `cot-extremes.html`, `crowded-bond-short-fomc` | positioning read exists; the bond-squeeze version NULL |
  | 10y "rejection at 535" | `level-touch`, `daily-band-fade` family | a line on a daily chart is not an entry here — NULL across the family |
  | auction demand | — | not on the desk |
  | Fed funds strip | SOFR futures M1 (`stir-composite-nq`, `rate-curve-structure` 2026-10-11, `rates-pivot-lead`) | built; every lead/lag into equities NULL — rates and equities move in the **same bar** |
  | credit wide, duration bid | `vix-hy` chain link; `mv-creditstack-range`; `stock-bond-flip` | context |
  | press listener / headline frequency | CB sentiment pages, `cb-tone-direction` (NULL), the GPR feed | tone is measured; a general headline-frequency meter is not |

  Read down the right-hand column: **every layer that has been tested here for *direction*
  is null, and the two that validated validated for *range*.** His stack, run through this
  desk's own tests, is a range stack. That is consistent with how the trade actually paid —
  a 99th-percentile four-session move in the ratio is a *range* event in RSP/SPY, and he was
  positioned for the move rather than forecasting its sign from the layers.

**3. Trading or macro-understanding.** (a) is a trading claim, already tested, null. (b) is a
method, not a claim; it cannot be pre-registered because it has no rule. (c) is the one
transferable idea and it needs no test: *composition* (which names carry the index) is a
quantity the desk already measures, and "the question is composition, not the Fed" is a
cleaner statement of why `breadth-narrowing`'s `use` line says to read the ratio as
*concentration exposure*.

**4. The configuration (step 4b, no score).** Entry "a few days ago", target in four
sessions. On 10-09 the ratio's 20-session change sat at the **4.3rd percentile** of its own
history since 2003 and its level at the 1.6th percentile of three years — a NARROW setup by
the desk's own definition. Four sessions to 10-16 the ratio is **+2.29%, the 99.4th
percentile** of all four-session changes. The move he describes happened, at the size he
describes, from the setup he describes. None of that bears on whether the setup
*predicted* it — 35 earlier setups say it does not, on average.

**5. Verdict and action.**
- **Nothing to pre-register.** The entry is H3, run and null; the method has no rule to
  test. Re-running H3 because this instance paid would be the "test it until it passes"
  failure the log exists to prevent.
- **Worth keeping, said carefully.** The layer list is a fair inventory of what a
  positioning-aware desk watches, and this desk has most of it *with verdicts attached*.
  The verdicts say the stack informs *how wide* the next move is likely to be and not *which
  way* — which is also what the trade's own payoff looked like. "Composition, not the Fed"
  is the sentence to remember.
- **Display nugget.** None new beyond clip 1's: the ratio's four-session change at the 99th
  percentile is the same fact. The layer table above is itself the nugget — a one-screen
  answer to "which of the things he looks at has this desk tested, and what did it find" —
  and belongs in this log rather than on a page.
- **"The most important trade in equities this year" is a title, not a claim**, and the
  letter funnel at the end is the reason the method is described rather than specified.
  Noted without weight either way.

---

## 2026-10-16 (3) — "My full prognosis" (hyperscalers over semis, alts over hard assets, crude higher but whack-a-mole)

> *"There's a rotation going on at the top of the market. Hyperscalers outperform SOX. I
> think that continues to the point where no one can believe it. Prognosis number two:
> alternative assets will eerily start to outperform hard assets like gold and silver. So
> don't sleep on alts... even though we don't maybe have the full picture on why that bid is
> there. And finally, crude oil is going to go up; it's going to continue to be a game of
> whack-a-mole, but it's going to be less and less predictable. Used to be able to lean on an
> afternoon headline, a VaR squash at eleven o'clock... now you don't know when the
> headline's coming. Prices are going higher, but definitely not in a straight line."*

**1. The claims, stated plainly.** Three directional calls, none with a horizon or a
failure condition.
- **(a) Hyperscalers keep beating semis** (SOX). Continuation of a relative-return trend.
- **(b) Alts beat gold and silver.** "Alts" is not defined; crypto is the measurable reading
  and the one the chain already carries (`dxy-btc`).
- **(c) Crude goes higher, less predictably, headline-driven.** Two parts: a direction
  (higher) and a *vol* claim (more, and less schedulable, big days).

**2. What's already on this desk.**
- **(a) contradicts his own clip of eleven days ago, and that is the finding.** The 2026-10-05
  entry: *"The real leadership is compressed into the physical bottlenecks of the AI
  buildout. This is memory, lithography and foundry."* Today: hyperscalers outperform semis
  and it continues "to the point no one can believe it". Both are the trailing relative
  return restated as a forecast: on 10-05 semis had led; by 10-16 the equal-weight basket of
  MSFT/AMZN/GOOGL/META is **+17.0% over 60 sessions against SOX −9.5%**, and over the last
  ten sessions −0.8% against **−14.9%**. The leadership call tracks the last two months'
  tape. The desk's nearest test is `rotation-extreme` (NULL, n=140): a relative-return
  extreme between two sleeves "extended in 45% of cases" — a coin. And **the semis half of
  the 10-05 claim is now answered**: `breadth-tilt-semis`, pre-registered 10-05 and
  UNTESTABLE on six years, was re-run today on the identical design over 2003→ and is
  **NULL on 85 de-clustered episodes** — after a breadth narrowing, semis beat SPY by +0.70
  [−0.50, +1.82] more than they ordinarily do over 20 sessions, and by −0.21 [−2.88, +2.35]
  over 60, where the *broadening* arm did better (+1.73). The prior written on 10-05 ("this
  fails on the unconditional control") is what came back. So of his two leadership calls,
  one is tested null and the other is its reversal.
- **(b) has no finding here.** BTC is on the chain against the dollar only. Over 60 sessions
  BTC +26% and ETH +26% against gold +3.4%, silver −1.0%; over 120 sessions BTC +29% against
  gold −10.8%, silver −23.7%. The "will eerily start to" is a description of the last six
  months. His own "we don't have the full picture on why" is the honest part and the reason
  there is nothing to test: a bid with no mechanism is a trend, and trend-following crypto
  against metals is not a question this desk has asked or needs to.
- **(c)'s vol half is partly measurable, and partly on the desk.** WTI closed 98.8, inside a
  120-session range of 68.6–108.7. Its 20-day realised vol is **36% annualised — the 65th
  percentile of fifteen years and the 35th of the last year**: not extreme. But **38 sessions
  of the last 120 moved more than 3%, against a fifteen-year average of 18.5** — twice the
  ordinary count of big days with ordinary overall vol, which is exactly the "whack-a-mole"
  shape: jumps, not a wider distribution. The headline mechanics he describes have been
  tested: `driver-roundtrip` (NULL, 35 crude round trips on M15 — a crude spike that
  retraces does not pull the linked markets back with it) and `event-impact-map`
  (VALIDATED: size by release, direction a coin). The "eleven o'clock VaR squash" is a
  scheduled-time claim; this desk's `exhaustion-schedule` work found intraday effects are
  clock effects, which is consistent with a regime where the clock has stopped mattering
  being harder — but nothing here measures *crude's* intraday clock.
- **(c)'s direction half** is a call. Crude is +7.7% in five sessions and he says higher
  still; `crack-disagreement-direction` (62% [48–75] on 45 cases) is the only directional
  crude base rate here and it needs a crack-vs-crude disagreement, which is not the setup
  today (products are *lagging* crude: heating oil −6.6% over 20 sessions against WTI −1.4%).

**3. Trading or macro-understanding.** All three are trading calls dressed as prognosis,
and none is falsifiable as stated — no horizon, no level, no "I am wrong if". The only
macro-understanding content is the crude vol observation, and the measurable version of it
(jump count up, total vol ordinary) is a better statement than "less predictable".

**4. Configuration (step 4b, no score).** All three described conditions are occurring:
hyperscalers over SOX by 26 points over 60 sessions, crypto over metals by 20–50 points
over 60–120 sessions, crude at 98.8 with twice the normal count of 3% days. The clip
describes the tape accurately. Describing the tape and forecasting it are different acts,
and the clip only does the first.

**5. Verdict and action.**
- **Nothing to pre-register from the prognoses.** Each is a trend restated; `rotation-extreme`
  already says relative extremes extend about half the time.
- **One real resolution banked today**: `breadth-tilt-semis` NULL on the long history — the
  10-05 clip's testable half, closed. Ledger updated (`js/deskEvidence.js`), prereg RESULTS
  written, harness gained `--long`.
- **One candidate logged** (index above): leadership persistence between equity sleeves, on
  the long SOX-vs-QQQ history rather than three years of single names. Low prior, stated.
- **Display nugget — the crude jump count.** "38 of the last 120 sessions moved more than
  3%, against an ordinary 18–19" is a one-line descriptive fact that says what "whack-a-mole"
  means without a forecast attached, and it is the kind of thing the Daily Read's crude line
  could carry as `~ context`. Proposed, not built.
- **The lesson across the three clips of this batch.** Clip 2 lists six layers and clip 3
  gives three prognoses; the one thing he was *right* about in a checkable way — the
  RSP/SPY move — is the one this desk finds to be a range event, not a direction call. The
  value in the thread is the inventory of what to watch; the verdicts on what it predicts
  live here.


---

## 2026-10-18 — "Calm is not the same thing as safe" (1999, VIXEQ − VIX, and the normalizing dispersion spread) — RE-SEND of the D2 source clip

> *"In 1999... the options market started to split: volatility on single names like Cisco
> got really expensive, but index volatility stayed really cheap... dispersion rose, so
> stocks traded on their own stories, and correlation fell... there really was no 'the
> market'. Pull up VIX EQ minus VIX... swap fibre for GPUs and Cisco for Micron. The same
> split is happening. Single-name vol has been rich, index vol cheap, correlation at the
> lows, but over the past month this signature has started to reset, and the AI leaders
> have fallen 30%. So this volatility spread is normalizing while rates stay high and capex
> keeps rising... This is what a market looks like when the main theme starts to lose
> control... calm is not the same thing as safe."*

**This transcript is the clip that `DISPERSION.md` D2 was pre-registered from on
2026-09-27** — the same sentences are quoted there verbatim ("over the past month, this
signature has started to reset... normalizing... when the main theme starts to lose
control"). It never got its own entry in this log because it went straight to the
pre-registration and the harness; this entry is that record, written at the re-send so
the duplicate is visible at the entry rather than discovered by re-running the audit.
Nothing below is new work on the claim. The claim was tested three weeks ago.

**1. The claim, stated plainly.** Three parts, one of them the operative one:
- **(a) The structure.** Single-name implied vol rich, index implied vol cheap, implied
  correlation low — a crowded market whose index looks calm. Measurable (Cboe DSPX, or
  VIXEQ − VIX, or COR1M). Not in dispute.
- **(b) THE CLAIM.** When that spread starts to *normalize* — dispersion high but now
  falling — the dominant theme is losing control and the break is beginning. A forward
  claim about range (wilder) and direction (down).
- **(c) The analogy.** 1999 → 2000, Cisco → Micron, fibre → GPUs, 6.5% Fed funds → high
  rates now, debt-funded capex both times. One episode. Not testable as a rate.

**2. What's already on this desk — the claim was pre-registered and run.**
- **`dispersion-reset` (D2, 2026-09-27) — VALIDATED, and the sign is the reverse of the
  claim.** Written prior: the falling arm would look like the rising arm. It did not. The
  gate (do the arms separate?) passed 4 of 4, so the direction of travel in dispersion
  *does* carry information — but **crowded-and-falling precedes a CALMER week**
  (−0.122 [−0.190, −0.005] SPX500, −0.083 [−0.151, −0.008] NQ) and nothing at a month,
  while **crowded-and-still-rising is the wide arm** (+0.31 [+0.09, +0.58] over the
  falling arm at 20 sessions on SPX500, +0.26 [+0.09, +0.43] on NQ). The ledger's `use`
  line already says it: *"Never write that a normalizing dispersion spread means a break is
  starting: tested here and falsified in sign."*
- **Direction — NULL in both arms** (+0.006 / −0.005 at 20 sessions, every interval across
  zero). The clip's whole point is a crash. Ninth volatility study in a row real on range,
  null on direction.
- **`dispersion-crowded-week` (D1) — NULL at a week**, the "mini flash crashes" version
  from his earlier clip; the secondary 20-session window on the rising arm is real and
  survives a below-median-VIX cut, and D2 supplied the mirror it lacked.
- **Caveats carried, not dropped**: the falling arm is n=26 against a floor of 25, and the
  rising arm's month effect lives mostly in the late half of a 2014→ sample. Neither is a
  trigger.

**3. Trading or macro-understanding.** (b) is a trading claim and it is answered. (a) is a
structural read the desk already carries as the Dispersion tile on `market-view.html`.
(c) is a story; the pre-registration said so in advance ("n=1 and untestable") and
nothing has changed.

**4. The configuration (step 4b — coherence only, no score).** Checked on Cboe's own
series, which turn out to be free: `VIXEQ_History.csv` (3,101 rows from 2014-06), and
`COR1M` / `COR3M` (from 2006-01). The clip's screen series and the desk's DSPX are the same
object in two forms.
- *"Single-name vol rich, index vol cheap."* VIXEQ 41.7 against VIX 20.0 on 10-16, spread
  **21.7 — the 94th percentile of its whole history**, 77th of three years. True.
- *"Correlation at the lows."* COR1M **10.1 — the 4th percentile of twenty years**; COR3M
  14.0, the 5th. True, and strongly.
- *"The AI leaders have fallen 30%."* Micron, his Cisco, is **−27.6% from its June high**;
  Broadcom −31.7%; SMH −19.3%; Nvidia −10.5%. True for the names he would pick.
- *"Over the past month this signature has started to reset."* **Not now.** DSPX is 36.6
  and **+3.4 over 20 sessions**; the VIXEQ − VIX spread is +0.15 over 20 sessions and was
  +5.5 on 10-09. The spread did reset once, from a 34.1 high on 07-09 to a −8.4 twenty-
  session change by 08-20 — which is probably the month the clip was filmed in, and the
  2026-09-26 check in `DISPERSION.md` found the same thing (rising, not resetting). As of
  today the live arm is the **rising** one — D1's wide arm, not D2's quiet one.
- *"When you look at the VIX it seems cool and calm."* VIX 20.0, the 82nd percentile of the
  past year, up from 14.8 twenty sessions ago. Calm was true in September; today it is not.

**5. Verdict and action.**
- **Nothing to run.** The claim was pre-registered with a stated prior, tested, and came
  back falsified in sign. Re-running because the clip was shared again is the "test it
  until it passes" failure.
- **The honest version of his warning is already on the desk, and it is the opposite
  arm.** "Calm is not the same thing as safe" has a measured form here: a crowded market
  that is **still getting more crowded** runs a wider month (D1 secondary window, mirror
  passed), independent of the VIX level. A crowded market that is **normalizing** runs a
  quieter week. His signal is the quiet one. Today's configuration — spread at the 94th
  percentile and rising — is the wide one, which is a range read, never a direction.
- **Display nugget, and a real one.** Implied correlation at the **4th percentile of
  twenty years** is a descriptive fact the desk does not show. DSPX is in the catalogue
  and on the Dispersion tile; COR1M / COR3M and VIXEQ are not pulled at all, and they are
  the same free Cboe path. A one-line "implied correlation (1m)" with its percentile beside
  the Dispersion tile would say what "no *the market*" means in a number. Proposed, not
  built — a catalogue addition, confirm scope first.
- **On the analogy.** 1999 is one episode. The desk can say what crowded-and-rising did
  across 68 setups since 2014 and what crowded-and-falling did across 31. It cannot say
  what one capex cycle does, and neither can the clip.


---

## 2026-10-27 — "Hang on, what just happened?" (Anthropic files, chips rip, the breadth trade takes a hit, a $30bn gamma pin, FOMC week, Brazil)

> *"Chip stocks rip more than three percent... the S&P was up about three quarters of a
> percent, sitting around 7680... this is where you see a big hit to the breadth trade
> today, but I can assure you that move has plenty of legs left... you can thank a lot of
> the equity strength to a gigantic thirty billion dollar gamma pin. Dealers were keeping
> the market pinned at exactly one level. However, if we get something that shakes us off
> this level, there is nothing below it... this bounce in hardware I expect to be
> short-lived. Ten years holding right around five percent, a very clean level, and you'd
> almost think this wasn't an FOMC week. Front oil is bouncing off its midday lows, but the
> back month, specifically red diesel, just keeps climbing... Brazil just got crushed
> following Lula's re-election. Bovespa and the real get dominated, and the euro still
> weak. The stress is showing up well beyond the U.S... we're going to start looking at
> cross-country relative value trades. We just put one on today... Chips can carry this
> market for a day, but Powell reaffirming the hold on Wednesday helps the average stock,
> not the AI hardware names."*

**The first clip since Setup Watch went live, and the register already has a reading on
the thing he is describing.** The session is 2026-10-26 (S&P 500 7,685 on the desk's CFD,
+0.6%; SOX +2.8%; the 10-year 4.99%; FOMC on Wednesday 2026-10-28 per `fomcCalendar.js`).

**1. The claims, stated plainly.** Four forward claims and a lot of colour.
- **(a) "The breadth move has plenty of legs left."** The equal-weight-over-cap-weight
  rotation continues after today's hit. A direction call on RSP/SPY.
- **(b) "A $30bn gamma pin... if we shake off this level there is nothing below it."** Two
  halves: dealers long gamma at spot (a range read), and a cascade once below the zero line
  (a follow-through claim).
- **(c) "Hardware bounce short-lived; a Fed hold Wednesday helps the average stock, not the
  AI names."** A direction call on semis versus the median stock across the FOMC.
- **(d) "Back-month diesel has a structural bid."** A curve/products claim; the inflation
  channel this desk tests through the crack spread.
- **Not claims:** the Anthropic filing numbers (not market claims and not checkable here),
  "the deeper you dig the sketchier it gets", Brazil "dominated", "stress well beyond the
  US", and the cross-country RV trade behind the letter funnel.

**2. What's already on this desk — including what the register says today.**
- **(a) is `breadth-narrowing` H4 — NULL — and the register has the mirror arm LIVE.**
  `claim-breadth-broad` fired 2026-10-22 (z +1.82), cleared, re-fired 2026-10-23 (z +2.20)
  and reads **z +1.92, the 97th percentile of three years, as of 10-26** — an extreme
  *broadening*, which is what his "breadth trade" has been riding. B1 tested both arms on
  35 and 33 de-clustered extremes over 23 years: the spread neither reverts nor runs on
  (H4 −0.37 [−1.12, +0.38] at five sessions). "Plenty of legs" is a continuation call on a
  series the desk finds directionless from the extreme. The register will score this fire's
  RSP/SPY change at 5 and 20 sessions with no further work — that is what it is for.
- **(b)'s first half is the desk's own gamma read, and the shape agrees.** The OI store's
  SPX500 book puts the zero-gamma line at **7,627 (full book) / 7,636 (day expiry)** with
  spot 7,685: long gamma above, short below. The *measured* consequence is a **range**
  effect: `gex-range-es` VALIDATED (long gamma quieter than a vol-matched baseline, vol-
  matched +0.38 [+0.24, +0.52], about half of it the rising markets it coincides with);
  `gex-range` on NQ re-run 2026-10-21 and now UNDERPOWERED. **(b)'s second half — "nothing
  below it" — was tested and is NULL:** `gamma-regime-trades` scored the zero-gamma break
  follow-through at −0.01 R (n=61) against placebo levels at +0.01, and `zero-gamma-
  distance` (distance to the line vs next-day range) is UNDERPOWERED. Direction null, as
  on every gamma study here. The $30bn figure is an index-options number this desk has no
  view of (its book is CME futures options, ~5% of dealer gamma); not scored.
- **(c) is three nulls and one in-flight study.** Post-FOMC direction: `fed-two-moves`
  (context — a decision-day move is half-undone within a month about as often as any big
  day); `post-fomc-usd-drift` VALIDATED but for the **dollar only** (+26bp over five
  sessions, 65%); `priced-in` NULL. Semis vs the average stock after a hold is not a cell
  anyone has run, and `rotation-extreme` (NULL, 140 extremes, extended 45%) is the nearest.
  A sibling branch (`ccr-42a42ec1`) has banked `pre-fomc-drift` as UNDERPOWERED and
  `cb-meeting-drift` (ECB/BoE own-currency drift) as NULL; not on main yet, noted per the
  research register. The register's `claim-rotation-extreme` is idle (Russell leading by
  2pp over 20 sessions, 29% of the way to the line).
- **(d) is the crack family.** `crack-inflation-channel` (context): products holding while
  crude falls is the bond market keeping its inflation view (+15bp [+4, +32] in breakevens
  vs both-fall windows). The register's `claim-crack-disagreement` is **idle**: WTI +9% and
  the crack +$11.9 over 20 sessions — both up, not the disagreement setup. The back-month
  diesel leg is not measurable here (FRED carries spot heating oil, not the curve), so
  "structural bid" is taken as described, not checked.
- **The 10-year at 5.00 "holding" is a line on a chart** — the level-touch family is null
  here (`level-touch`, `daily-band-fade`), and the FOMC window is already a described
  desk-watch trigger (`fomc-window`) that says a decision day runs about a third wider.
- **Brazil and the euro.** USD/BRL **+8.3% on 10-27** after the 10-25 runoff — the real
  was dominated, as he says; EUR/USD −0.26% on 10-26. Nothing on this desk covers Brazil;
  the cross-country findings that exist (`nonus-yield-gap-direction`, `-range`: NULL on
  gilts, Bunds, JGBs) say a foreign-led move explains the day it happens on and not the
  next one. "Cross-country RV" as a *method* is not a claim; which trade he put on is behind
  the letter.

**3. Trading or macro-understanding.** (a) and (c) are direction calls, both in families
tested null. (b) is half a structural read the desk shares and half a cascade claim tested
null. (d) is macro-understanding and the chain already carries the crack → inflation-pricing
link. Nothing here needs a new pre-registration.

**4. The configuration (step 4b — coherence, no score).** Everything he describes happened
on 10-26: SOX +2.8% / SMH +2.7%; S&P +0.6–0.7% to ~7,680; **RSP/SPY −0.36% on the day**
(the "hit" — from a 97th-percentile broadening, so a modest give-back); 10-year 4.99%;
VIX 18.4; crude −2.3% with the chain's crack reading still rising; FOMC two days out. The
one thing not checkable is the back-month diesel bid.

**5. Verdict and action — and the register's first scorecard.**
- **Nothing to run, nothing to add to the register.** Both direction calls fall into fires
  the register already holds, and the forward record will say what followed:
  `claim-breadth-broad` (10-23) scores RSP/SPY at 5 and 20 sessions; the FOMC falls inside
  that window, so "a hold helps the average stock" gets read off the same number.
- **The register's early results, for the owner's learning rather than as evidence** (two
  fires is not a study):
  - `claim-dispersion-rising` fired 2026-10-18 at DSPX 36.6 → next five sessions ran
    **1.08× (SPX500) and 1.34× (NQ)** the trailing-20 median range — the WIDE arm did run
    wide, consistent with D1's secondary window, on one fire.
  - `claim-fear-spike` fired 2026-10-19 at VIX +5.15 → gold **−2.99% over five sessions**
    against +0.35% ordinary — the "fear bids gold" claim did the opposite, as G1's lag
    finding would have it, on one fire.
  - `claim-breadth-broad`: two fires, outcomes open.
- **Transferable, said carefully.** His gamma read and this desk's book describe the same
  structure tonight (long gamma at spot, the zero line ~40–60 points below). Where they
  part is what it means: here it is an expected-range fact with a validated ES result and
  a null on the cascade; in the clip it is a floor that disappears. The owner can watch
  this one: if 7,627 goes, the desk's own test says the follow-through was a coin.
- **Index.** The AI-crack → metals candidate from the 10-16 entry has since been
  pre-registered and banked NULL by another session (`ai-crack-metals`, 61 setups, 2026-10-19)
  and is already struck above; nothing new added from this clip.
