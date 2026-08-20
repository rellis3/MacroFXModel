# Options Open-Interest Pipeline — Architecture & Build Recipe

> **Audience:** another desk (and their AI coding agents) building the same thing from
> scratch. This is not a description of what we shipped — it is the order to build it
> in, the shape each piece has to be, and the specific failures that cost us days, so
> you can skip them.
>
> **Provenance:** written 2026-08-20 against a working system — 11 CME instruments,
> captured nightly, converted to spot levels, drawn on TradingView, consumed by a paper
> trading bot. Every failure described below actually happened here.

---

## 0. The one-paragraph version

CME publishes free options open interest per strike per expiry. Those strikes are in
**futures** terms; you trade **spot**. Convert them (`spot = strike − basis`) and you
have a map of where dealers are positioned: walls price stalls at, a max-pain magnet,
and a gamma-flip boundary deciding whether levels *hold* or *break*. The build is four
stages — **capture → derive → publish → consume**. Each stage's job is to refuse bad
data rather than pass it on, because every failure mode in this domain produces output
that is complete, well-formed, and wrong.

---

## 1. The governing principle: nothing here fails loudly

Read this before writing any code.

**This pipeline does not crash. It returns plausible wrong numbers.** Every serious bug
we hit passed every check we had at the time:

| What happened | What it looked like | What it actually was |
|---|---|---|
| Table read mid-render | 52 strikes, valid ladder, non-zero OI | 90% of the book missing |
| Wrong column layout | Smile parsed, 31 strikes, IV correct | OI read as zero → charm/vanna exactly 0.00 |
| Expiry left selected in the tool | Valid strike ladder | ONE expiry's strikes written as the whole book |
| Stale basis | Every level a plausible price | All levels 4–13 pips off, drifting all day |
| Max pain on a filtered chain | A number one strike from the right one | Two code paths disagreeing by 10 points |

**The design rule that follows:** every guard needs a *recovery path*, and every check
needs a *yardstick from outside the current run*. A value can only be judged against
something the run did not produce — yesterday's capture, another code path's answer,
the exchange's own published figure.

---

## 2. Architecture

```
CAPTURE    browser automation -> exchange tool -> TSV files on disk
           phase 1: matrix views x N products   (no expiry selected)
           phase 2: per-strike IV chain x N     (one expiry selected)
              |
              v  <SYM>_rawOI / rawChg / rawVol / rawIVTerm / rawIV .tsv
DERIVE     ONE pure function: raw text -> fully-derived instrument entry
           walls . max pain . GEX profile . gamma+GEX flips . charm/vanna
           . expected move . per-expiry table . basis conversion
              |
              v
PUBLISH    live store        -> what bots and pages read now
           oi_raw_<date>     -> immutable per-day raw capture (replay)
           expectation log   -> what each level CLAIMED, for later scoring
              |
              v
CONSUME    chart export . dashboard . bot zones . AI narrative . audit
```

**The load-bearing decision: *one* function derives everything.** Ours is
`buildOIEntry()` — one entry point in a ~2,800-line module. The manual paste path, the
automated scraper and the headless re-analyse endpoint all call it. There is no second
implementation of max pain anywhere.

When we broke that rule, the two copies disagreed by 10 points on the one expiry that
matters. **If your AI agent offers to "just compute max pain here quickly", stop it.**

---

## 3. Stage 1 — Capture

### 3.1 Getting the data at all

The exchange tool is an ASP.NET WebForms app in a cross-origin iframe. Plan for:

- **True headless is blocked.** Launch a real rendering browser parked off-screen. A
  headless flag that works in testing fails at 02:00 in a way you cannot reproduce
  interactively.
- **Clicks must be trusted.** Playwright's native `.click()` dispatches a real OS
  event; `evaluate(el => el.click())` dispatches an *untrusted* one, which menu widgets
  ignore silently — no error, no effect.
- **Find controls by content, not ID.** ASP.NET IDs shift with the last selection.
  Locate dropdowns by their *options* ("(All)", "Standard"); IDs are hints only.
- **Pick tables by structure.** The page carries decoy tables (menus, toolbars). The
  data table is the one with the deepest ladder of numeric first cells.
- **Plain HTTP is refused.** Our probe: 25/25 anti-scraping 403s from scripted clients.
  Requests must originate inside a real browser page.

> **Terms of use — read this.** Most exchanges' data terms prohibit automated
> retrieval. A real browser on your own machine with your own session, once a day, is a
> different proposition from a datacenter IP plus headless-detection evasion. **Do not
> move this to the cloud.** The durable answer is a licensed feed (the exchange's own
> data service, or a vendor). Treat the scraper as a stopgap and know why.

### 3.2 Two phases — and why they must not interleave

You need two different things from the tool:

| Phase | View | Expiry selected? | Yields |
|---|---|---|---|
| 1 | OI / OI-change / Volume matrices + settlements | **No** | strike x expiry grids, per-expiry ATM IV |
| 2 | Settlements with ONE expiry chosen | **Yes** | per-strike IV smile → charm, vanna, skew |

**Run these as two sweeps over all products, not interleaved per product.**

Selecting an expiry scopes the *entire tool*, and that survives page navigation because
it lives in the session. Interleaved, we had to mint a fresh session after every
product to clear it — the exchange served about five and then began refusing, taking
the matrices down with it (20 of 44 tables). Run all of phase 1, then all of phase 2,
then drop the session **once** so tomorrow starts clean.

Ordering also matters for correctness: **phase 1 must never see a scoped view**,
because a single-expiry ladder still looks like a valid strike ladder and will be
written as the whole book.

### 3.3 The five capture guards

```
1. VIEW CONFIRMED BY ITS HEADING, not by a control's presence.
   All three matrix views expose the same controls, so waiting on those
   confirms "a matrix view" and happily returns the previous one. The tool
   prints its own view name — read that.

2. SHAPE CHECKED AGAINST THE VIEW.
   'expiry table' vs 'strike ladder'. Refuse to write one view's table under
   another's name. This caught a nav click silently no-opping.

3. STABILITY — two consecutive equal reads.
   A half-rendered table grows between reads. Costs one extra read.

4. FULL-SIZE POLLING — stability is NOT completion.
   A table that PAUSES mid-render matches itself. Take a target size from the
   previous day and keep polling until it is reached. Without this, SPX
   returned 74 strikes (range 1-7805) against 498 (0-10800) the day before:
   the top half never arrived and two reads 1.5s apart agreed on the truncation.

5. DAY-OVER-DAY SIZE GUARD — refuse, do not write.
   Option books do not shrink sixfold overnight. Under 50% of the previous
   capture (with a floor for genuinely small books) -> refuse. A missing file
   makes the ingest skip that product loudly; a truncated one silently moves
   the walls and max pain your bot trades.
```

**Guard placement matters.** We first put the size guard *after* the atomic write, so
it printed "REFUSING to write" about a file already on disk and the run still counted
it as captured. **Refusals go before writes.**

**Every guard needs a retry.** Three separate outages were guards firing correctly with
nothing behind them:

- **View-switch no-ops** → reload the product and retry once. Clicking again never
  recovered it; reloading worked 6 times out of 6 (a fresh load lands on the default
  view).
- **Product-header mismatch** → retry once *regardless of session state*. Ours only
  retried when the session was cached, so a freshly-minted session that had not yet
  rendered the header was refused outright and lost all four views.
- **A marker control that has not populated** → prefer the heading; do not veto on the
  marker. Requiring both cost us 11 tables a night for most of a month while the page
  was loaded and correct.

### 3.4 Column layouts — the silent killer

The tool renders **three** volatility groups where a manual copy-paste has one. The
chain arrives 20 columns wide when the parser expects 14, and open interest lands past
where positional parsing looks.

Nothing errors. Strike, IV and prices read correctly from the left of the row; OI reads
as **zero**; charm and vanna sum to exactly 0.00 on every instrument while the smile
reports 31 strikes and looks entirely healthy.

```
manual paste : Call | Put | Volatility | Open Interest                    -> 14 cols
tool capture : CALL | PUT | VOLATILITY | Basis Point | Black-Scholes | OI -> 20 cols
```

**Normalise on capture: keep the first 10 fields and the LAST 4.** That is also correct
for a genuine 14-column row, so an unaffected layout passes through untouched. Assert a
column count for every table type, and make an unexpected width loud.

Restore the **title line** too — a manual paste includes it (`EUR/USD (EUU|6E) EUUU6
(15.00 DTE) vs 1.16879 - Settles`) and parsers read the DTE and expiry code out of it.
Ours omitted it, both came back null, and the smile could not be checked against the
expiry it claimed to describe.

### 3.5 Which expiry's smile?

You want *one* chain — the expiry your walls sit on. Resolve it from phase 1's output
(the OI matrix knows where the open interest is), then capture that one.

**Assert the result.** The view heading names the selected expiry. If it does not match
what you asked for, write nothing. A smile from the wrong expiry is worse than no
smile: charm and vanna compute confidently against another date's surface and every
downstream number still looks reasonable.

> The assertion proves you *got* what you *asked for*. It cannot tell you the ask was
> right — so resolve the expiry with the same code your dashboard uses, never a second
> implementation.

---

## 4. Stage 2 — Derive

### 4.1 The basis conversion (get this wrong and everything is wrong)

```
basis      = futures price - spot price      <- BOTH captured at the same instant
spot level = futures strike - basis
```

Three rules, ordered by what they cost when broken:

**1. Capture futures and spot in the same request.** Not the on-screen value from when
the page loaded. A basis assembled from prices minutes apart silently absorbs whatever
the market did in between. One endpoint, one parallel fetch, return both plus a
timestamp.

**2. The basis ages separately from the chain.** The OI ladder is legitimately
yesterday's and stays that way — fine and expected. The futures-vs-spot reading drifts
*intraday*. Measured on EUR/USD: +0.00021 at 08:39, +0.00105 by 18:36. That is 8 pips
on every level from a book that had not changed at all; gold moved $1.32, NQ 4.2
points.

Give the basis **its own timestamp**, separate from the paste timestamp, and surface
the age everywhere levels are shown. Share one stamp and a freshly re-based entry still
reports as stale — which makes a working fix look broken.

**3. Sign discipline.** `spot = strike − basis`. If futures trade above spot (positive
carry), spot levels sit *below* the strike. We compared against another desk whose
levels sat exactly +0.00111 from ours on *two* independent level types — a constant, so
same strikes, different conversion. They were adding where the formula subtracts.
**A constant offset between two desks is always the conversion, never the data.**

**Inverted contracts.** Some currency futures are quoted foreign-per-USD (yen, CAD, CHF
against the dollar). Invert the strikes *first* (`1/rate`), then apply one basis in pair
terms. Label whether call/put have been flipped into pair terms — otherwise a "call
wall" below spot reads as a bug rather than a deliberate setting.

### 4.2 Filtering: right for walls, wrong for max pain

Subtle, and it cost us a real bug.

- **Walls** are relative outliers. Screen out strikes below a minimum OI — a wall has
  to be *significant* to be a wall. Rank by size relative to neighbours (1.5x weak, 2x
  moderate, 3x+ strong), not by absolute OI.
- **Max pain** is a sum over the *whole* chain. Every open contract contributes. Apply
  the same minimum-OI screen and you tilt the pain curve, walking the minimum onto a
  neighbouring strike.

We had two paths — one filtered, one not — both exporting `max_pain 1dte`, 10 points
apart, on the one expiry with real pinning force. Same function, different inputs.

**Rule: derive each quantity from the strike set that quantity needs, and reconcile any
two paths computing the same thing.**

### 4.3 What to derive

| Output | From | Notes |
|---|---|---|
| Call / put walls | per-expiry OI, minOI-screened | carry a strength tier and a persistence count |
| Max pain | full chain, unfiltered | pins in the final ~48h; weak at 5+ DTE |
| GEX profile | OI x per-strike gamma x spot | needs a vol — per-expiry ATM IV beats a flat number |
| Gamma flip | first per-strike sign change | cheap, approximate |
| **GEX flip** | total net GEX re-evaluated at candidate prices | the rigorous boundary — **trust this one when they disagree** |
| Charm / vanna | per-strike smile + OI | zero without the chain; see 3.4 |
| Expected move | ATM straddle price | a band, not a level |
| Per-expiry table | every expiry column | lets another desk verify your maths |

**Return multiple GEX crossings, not one.** A one-sided book can have three. Picking
"the nearest" produced a level that jumped between runs — it looked like instability
and was three legitimate roots with different ones winning each time.

### 4.4 Regime is a price zone, not a label

Net GEX sign gives one word (PIN or BREAKOUT) for the whole book. That word is a *book
average* and it hides short-gamma pockets.

**Compute where the sign flips along price and publish the bands.** Consumers then
resolve the regime at *current* price rather than at paste time. We shipped the word
first and the bands later, and for a while the chart tint (band-resolved) disagreed
with the table row (frozen word) on the same bar.

Publish both, and say which book each describes — the near-dated expiry (what a day
trader trades) and the primary expiry can legitimately differ.

---

## 5. Stage 3 — Publish

### 5.1 Storage layout

| Key | Contains | Lifetime |
|---|---|---|
| `oi_store` | live derived entries, all instruments | overwritten each run |
| `oi_store_py` | shadow — automation writes here while unproven | expiring |
| `oi_raw_<date>` | **raw capture, one key per day** | permanent |
| `oi_expect_log` | what each level claimed, per session | permanent |
| `oi_history` | compact per-day summary | permanent, ~1yr |

**One key per day for the raw archive.** We first accumulated every instrument x every
day into a single value with 365-day retention. Measured: 330 KB/day across 11
instruments -> ~117 MB in one value, against a 25 MB per-value ceiling. It would have
begun failing silently at ~77 days, and you would find out when a restore came back
short — by which point the days are gone.

**Archive the raw text, not just the derived output.** The exchange serves no history:
a day you did not capture is unrecoverable at any price. Archive every raw box
*including the IV ones* — an archive that restores walls but not the smile is a subset,
not a replay.

### 5.2 The shadow-key pattern

While the automation is unproven, write to a *shadow* key and compare against the
manual process. Make the switchover a **runtime setting, not a script flag**:

- the scraper runs on a machine that may be unattended for weeks
- the decision to trust it must be reversible from a phone
- an unreadable setting must default to *shadow* — "the server was down so we wrote to
  the bots' input anyway" is the exact failure the switch exists to prevent

### 5.3 Storage gates will bite you

If your store has an allowlist (ours has three separate gates), **a key can pass one
and fail another**, and each gate fails differently: missing from the TTL list is a
silent expiry; missing from the permission list is a silent rejection; routed but in
neither is a key that looks configured and never persists.

We lost an entire dated forward-test archive this way for months. The *live* half of the
same writer was allowlisted, so the log printed "snapshot 11 pairs" every cycle while
the dated half was rejected every time. **Assert the read-back after the first write of
any new key.**

---

## 6. Stage 4 — Consume

### 6.1 The chart export contract

A text block the user pastes into their charting platform:

```
OI 1.16979 : call_wall 15dte . Reject (turns away) . warm . 56%~45m . h65
   |         |         |       |                     |      |         |
   |         |         |       |                     |      |         +- hold score
   |         |         |       |                     |      +- P(touch) + median ETA
   |         |         |       |                     +- gamma heat at the strike
   |         |         |       +- what the regime says happens here
   |         |         +- which expiry
   |         +- level type
   +- price, already in spot terms
```

Design notes that saved us pain:

- **Ordered `.`-separated segments, read by index.** An older indicator ignores
  trailing segments it does not know, so the export can grow without breaking anyone.
  Use a `-` placeholder for an absent segment so indexes stay stable.
- **Annotate every line, including ones from secondary code paths.** Ours emitted
  primary levels fully annotated and other-expiry levels bare — two lines at the same
  price, one with a probability and one without, and roughly two-thirds of the export
  reading as "no data" when it meant "different code path".
- **Filter by the right dimension per level type.** Reachability filtering ("can price
  get there today") is right for walls. It is wrong for max pain, whose pull comes from
  *time to expiry* — a 20-DTE max pain inside today's range exerts nothing today. Cap
  max pain by DTE; filter walls by distance.
- **State the basis and its age in the header.** Every price in the block is
  `strike − basis`.

### 6.2 P(touch) — if you build it, calibrate it

A Monte Carlo over recent bars gives "probability price touches this level within H
hours". Two things matter:

**Raw simulated probabilities are systematically over-confident.** Ours: a raw "94%"
touched 68% of the time; realised outcomes compressed into 11–68% while predictions
spanned 5–94%. It *was* monotonic, so it ranked correctly and could be recalibrated —
fit a piecewise-linear map on the first half of the sample, verify on the untouched
second half. That took mean error from 9.4pp to 1.7pp out of sample.

**Calibrate per instrument.** Ours is fitted on one FX pair and applied to gold and the
indices — a documented limitation and still a limitation. Return a `calibrationSource`
field so callers can tell a fitted number from a borrowed one.

Say plainly what it does *not* tell you: P(touch) says whether price gets there, not
whether the level holds. Pair it with a separate hold score, and treat **high P(touch)
+ low hold** as the dangerous combination — likely to arrive, likely to go straight
through.

### 6.3 Forward-testing, from day one

There is no options-OI history to backtest against, so this is a **forward** test that
only accumulates if you start logging immediately.

Log each session: the level, its type, the reading you claimed, the spot it was judged
against, and the distance scale. Later, score what price actually did.

**Two rules, or the result is worthless:**

1. **Declare thresholds before looking at outcomes** — what counts as a touch, a break,
   a reject. Then re-score across a grid: a conclusion holding at only one setting has
   not been demonstrated.
2. **Report every tag against the base rate on the same sample.** "Call walls held 61%"
   is meaningless if all levels held 60%. Lead with the lift.

Also record the *independence* cut: big OI strikes cluster on round numbers, which your
confluence scorer probably already counts. If the OI tag only adds value where a round
number already sits, it is redundant, not edge.

---

## 7. Scheduling and unattended operation

From running this unattended and losing nine nights in one month.

**The machine, not the code, is the usual failure.** We lost eight nights to a laptop
sleeping and one to an OS update reboot, both while the scraper was in perfect health.
On Windows: `WakeToRun` **and** `StartWhenAvailable` (the second retries a run missed
because the box was busy or rebooting), disable the battery conditions, disable sleep.
**Verify the settings actually applied** — ours silently did not, twice, because the
change needs elevation.

**A run that stops firing sends no failure.** Silence is indistinguishable from success
unless you record a heartbeat. Post one on *every* run, pass or fail, and have the audit
flag a last-seen time that stopped advancing.

**Exit codes must mean something.** "Captured 3 of 44 but exited 0" is how a broken
nightly goes unnoticed for a week. Aggregate every stage into one verdict.

**Report per-view, not just a total.** "33/44" cannot distinguish "one view failed on
every product" from "a scatter of failures". We lost a diagnosis session to exactly
that ambiguity.

**Guard against concurrent runs — with an expiry.** A browser-profile lock stops two
runs colliding, but a lock outlives a hard crash and then every subsequent night
refuses without touching the browser. Clear locks older than a plausible run duration,
by *age* — never by killing processes by name, or you will close the user's own browser.

**Weekend and settlement awareness.** A Monday run returning Friday's book is *correct*
— there is no weekend settlement. Bake that into the audit or you will chase a non-bug.
Our audit also bounded its window by the last *recorded* run, which made an outage
invisible: when runs stop, the window simply ends. Bound it by *today*.

---

## 8. Build order (the actual recipe)

Each step ends with something verifiable. Do not proceed on an unverified step.

```
1.  RECON - no automation yet
    Load the tool by hand. Screenshot every view. Copy each table into a text
    file. Record column layouts, strike increments, contract codes, and which
    products are even on this exchange.
    OK WHEN: you can state each table's exact column count and meaning.

2.  PARSER + FIXTURES
    Parse the hand-copied text. Commit those files as FIXTURES.
    OK WHEN: the parser reproduces strikes/OI/IV from fixtures, offline.

3.  DERIVE - one pure function, no I/O
    Walls, max pain, GEX, flips, expected move. Flat vol is fine at first.
    OK WHEN: numbers match a hand-computed example, and max pain is
    deterministic (same chain in, same strike out).

4.  BASIS CONVERSION
    Simultaneous futures+spot fetch. Inverted-pair handling. Own timestamp.
    OK WHEN: a known strike converts to a level you can verify on a chart.

5.  STORAGE + READ-BACK ASSERTION
    Live key, dated raw key, expectation log. Write one, read it back, assert.
    OK WHEN: every key round-trips. Nothing silently rejected.

6.  MANUAL PIPELINE END-TO-END
    Paste -> derive -> store -> export -> chart. Use it daily for a week.
    OK WHEN: you trust the numbers and know what "normal" looks like per
    instrument. DO NOT SKIP - every capture guard later is calibrated against
    the "normal" you learn here.

7.  CAPTURE AUTOMATION - one product, one view
    Then one product all views; then all products, phase 1 only.
    OK WHEN: byte-identical to your manual copy-paste for the same session.

8.  COMPARE HARNESS BEFORE GOING LIVE
    Automation writes a SHADOW key. Diff shadow vs manual, daily.
    OK WHEN: several sessions agree, including an expiry roll and a month-end.
    One day of agreement proves nothing.

9.  PHASE 2 (the IV chain)
    Separate sweep. Resolve the expiry from phase 1. Assert the heading.
    OK WHEN: charm/vanna are non-zero and move when the smile moves.
    Exactly 0.00 means the OI columns are misaligned - see section 3.4.

10. SCHEDULING + HEARTBEAT + AUDIT
    Wake settings. Exit codes. Per-view reporting. Come-home report.
    OK WHEN: you can kill the machine mid-run and the next run self-recovers.

11. CONSUMERS
    Chart export -> dashboard -> bot zones -> AI narrative, in that order.
    Each is easier to sanity-check than the next.

12. FORWARD TEST
    Start logging on day one of step 6. It only accumulates forward.
```

---

## 9. Standing rules for an AI coding agent

If you are handing this to an agent, give it these as standing instructions:

1. **Never add a second implementation of a derived quantity.** If max pain, walls or
   GEX are computed in more than one place they will disagree, and the disagreement
   surfaces as a plausible number rather than an error.
2. **Every guard needs a recovery path.** A check that refuses without retrying turns
   one transient failure into a lost day.
3. **Judge a capture against the previous one, not against itself.** "Stopped changing"
   is not "finished"; "parses cleanly" is not "correct".
4. **Put refusals before writes.** A guard after the write refuses nothing.
5. **A constant offset between two sources is the conversion. A variable one is the
   data.**
6. **Exactly zero is suspicious.** A summed exposure of 0.00 means an input array was
   empty, not that the market is balanced.
7. **State what a number does NOT tell you**, in the comment beside it.
8. **Do not move to the cloud** to avoid a local dependency when that local dependency
   is what makes the access legitimate.
9. **When you fix something, write the measured before/after into the comment** — not
   "fixed a bug". Every section reference in this document came from a comment written
   that way, which is the only reason this recipe could be reconstructed.

---

## 10. What we would do differently

- **Buy the data.** A licensed feed removes the browser automation, the anti-scraping
  fragility, the terms-of-use question and roughly 60% of the guards above. The scraper
  exists because the data is free; it is not free of cost.
- **Per-day archive keys from the start.** Retrofitting the layout was avoidable
  arithmetic we simply did not do up front.
- **Calibrate per instrument before shipping the number**, not after.
- **Separate the basis timestamp from the paste timestamp on day one.** Conflating them
  hid an 8-pip intraday drift and made the eventual fix look like it had failed.
- **Write the compare harness (step 8) before the automation**, not alongside it. It is
  the only thing that tells you the automation is right.

---

*Worth asking us about: how the expectation scoring is structured, what the hold score
is fitted on, and how the bot consumes the zones. All three sit downstream of this
pipeline and none of them work unless it is right first.*
