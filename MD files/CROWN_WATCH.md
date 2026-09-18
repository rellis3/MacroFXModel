# Crown watch — a running log

Nicholas Crown clips get dropped into this thread as they come, before the
owner reads or hears the same idea somewhere else. Each one gets the same
four-question pass, in order, every time:

1. **What's the actual claim** — stated as something that could be true or
   false, not as a vibe.
2. **What's already on this desk** — audited, not assumed. Often a claim is
   already built, already tested (pass, null, or partial), or contradicted by
   an existing result (S10 already nulled a Crown crowding claim outright).
3. **Is it a trading claim or a macro-understanding claim.** Trading claims
   go through the pre-registration discipline in `MARKET_SENSE_TESTS.md`
   (state the reading rule before running). Macro-understanding claims — "how
   does one market explain another" — are what `js/macroChain.js` (the
   chain on `today.html`) exists for, and mostly don't need a statistical
   test to act on, just an honest audit of whether the chain already covers
   the mechanism described.
4. **Verdict and action** — built now (cheap, unambiguous), pre-registered
   for later (needs a real test), or noted as already covered / already
   nulled, with a pointer to where.

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
