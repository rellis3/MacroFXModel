# Coverage and the funnel — two claims, an audit of what `today.html` watches, and what to build

Source: two Nicholas Crown clips, 2026-09-17. Same discipline as every other
outside claim on this desk: state it, measure what we already have, pre-register
what is testable, and build only behind a verdict. Nothing here earns a ✓ chip
until it has an entry in `js/deskEvidence.js`.

---

## 1. The two claims

**Claim A — coverage.** Working memory holds three or four things, not seven
(Cowan 2001, revising Miller 1956 — the clip says 1952/seven), so a screen-based
process caps you at a handful of watched objects: "the number of things you watch
is the number of real opportunities you get." Four indicators on a couple of
tickers ≈ two or three trades a year, and the gap gets filled with forced trades.
His answer: build infrastructure, watch the whole surface (~1,700 signals across
technicals, pairs and statistical relationships), get told instantly when
something breaks a multi-year regime.

**Claim B — the funnel.** Every trade starts as *something weird* that nobody
else is noticing — "crude didn't break down on the biggest supply build the other
day". Then four gates, in order:

1. **Weird.** An anomaly: the reaction the tape should have had, and didn't.
2. **Technicals.** Weird means nothing if the technicals look like crap; a recent
   breakout makes him *more* interested.
3. **Where am I in the move.** Early or late, risk/reward, position against
   historical prices, and rich/cheap *versus other assets* — crude vs gold, crude
   vs stocks.
4. **Structure.** Not naked long, because a Middle East resolution leaves an air
   pocket. Go to the options market, get a price; if the price isn't nuts —
   i.e. not everyone has this on yet — consider it.

B is the more useful clip for this desk. A says "watch more", which is a build
budget; B says what turns a wide surface into a decision, and B's kernel is
**measurable here with data already in the repo**.

---

## 2. What `today.html` actually watches (audit, 2026-09-17)

| layer | what it covers now |
|---|---|
| **Desk watch** (`js/deskWatch.js`) | 11 condition families → **25 live conditions** (9 named + 2 curve + 14 chain links), on **8 instruments** (SPX500, NQ, GOLD, USDJPY, EURUSD, GBPUSD, AUDUSD, USDCAD). Macro/cross-asset only. 15-min tick, **transitions only**, Telegram on change. |
| **Evidence book** (`js/deskEvidence.js`) | **21 registered relationships: 6 validated, 11 null, 4 context.** Studies S1–S12 in `MARKET_SENSE_TESTS.md`. |
| **Event Response Book** (`js/eventImpactMap.js`) | 30-min spike and next-day size per family × instrument, 9 country\|category blocks built from `backfill/event_response_book.json`. Size, never direction (`upPct` is a coin flip everywhere). |
| **Per-pair machinery that already runs** | Level atlas all-lines (both ladders, every rung, 16-pair default universe), `levels-v2` entries, motif state + the Pairs Board, `macro-regime-fx`, `corr-history` (5y H4), the vol forecaster per pair × 3 horizons, the new spread profile (per pair per UTC hour). Registry: **26 FX + gold + NQ/SPX/DAX** (`js/instrumentRegistry.js`). |

The honest reading: **this desk is not signal-poor, it is join-poor.** `today.html`
sees the 8-instrument macro slice; the wide layer exists, runs, and reports into
per-page silos nobody reads at 07:00. Crown's 1,700 is a join problem here, not a
research problem.

---

## 3. The arithmetic that comes before any breadth build

1,700 signals at a 1-in-20 threshold is **~85 fires a day of pure noise**. At
1-in-100 it is still ~17 a day. S12 already said this in miniature: 27 margin
cells, one expected to clear by chance. So the rules for any breadth layer here,
fixed in advance:

- **Every signal carries its own measured unconditional fire-rate.** "How often
  does this fire in a normal year" is part of the signal, not a footnote.
- **Rank by rarity, not by trigger.** The panel sorts by how unusual the reading
  is against its own 3-year history, not by which module produced it.
- **A fixed daily alert budget.** Top N, and N is a number on the page.
- **Keep the ✓tested / ~described tag.** Breadth is exactly how folklore gets
  smuggled in as signal; the tag is the only thing stopping it.
- **A breadth panel is judged by what it lets you ignore**, not by what it shows.

---

## 4. Ideas for `today.html`

**A. The weird-o-meter — gate 1, and the desk has no object for it.**
Define weird as a **reaction residual**: realized move ÷ the Event Response
Book's expected multiple for that family × instrument, per release, ranked over
the last N days. A big surprise with no reaction scores as high as a small
surprise with a violent one. Everything needed is in place — the surprise store
behind S7 (7,932 pair-releases, 2017→), `eventImpactMap` for the expectation,
`barUtils`/`statsCore` for the rest.

The oil case is live and embarrassing: **`calendar_events.csv` carries 1,306 EIA
Weekly Crude Oil Inventory prints (2014-01 → 2026-07) with actual / previous /
consensus**, plus API stocks, Cushing, gasoline, distillate and rig count (8,214
oil-related rows) — and WTI closes are already fetched as `WTICO_USD`
(`server.js:3284`). Meanwhile the morning-brief prompt tells the model *"you have
no supply/demand-side oil data here, so lean on this one more cautiously"*
(`server.js:4234`) — accurate about what the prompt is handed, and `server.js`
never reads an inventory row anywhere, so the data has been sitting in the repo
unread. Crown's exact kernel is computable on this desk today; either wire the
prints in or keep the caveat, but the caveat should stop being the reason.

**B. Surface panel — one row per registry instrument.** A fixed six-cell feature
vector (session range ÷ ATR14, 3-year percentile of price, realized vs forecast
vol, distance to the nearest tracked level in ATR, 20-day trend z, spread vs its
own UTC-hour norm), each cell scored as a percentile against its *own* history,
then cut to the budget. Transitions only, same as desk watch. This is a join of
`levels-v2` / atlas / vol-forecast / spread-profile outputs, not new math.

**C. Fan desk watch past its 8 instruments** — the instrument-agnostic triggers
(down-week, event-range) run across the registry, but **every fanned cell starts
as ~described**: S7's table has 5 pairs with measured cells; the other 21 have no
base rate and the panel must say so rather than reuse EUR/USD's number.

**D. Rarity ranking + alert budget in the Telegram path.** Desk watch speaks on
every transition; with breadth that is a firehose. Rank transitions by rarity, cap
per day, keep the existing "N conditions started in the same pass — read them
together" line, which is the right instinct already.

**E. A coverage meter on `today.html`.** Print the audit above, live: conditions ×
instruments watched, registry size, relationships tested and how many are null.
Half a day's work, and it converts the rhetorical claim into a desk fact — and it
is the panel that tells you next month whether A–D were worth it.

**F. The funnel as four gates on the instrument card.** weird → technical →
position-in-move / RV → structure & crowding, each gate naming its evidence id or
saying "description". Gates 2 and 3 are largely built (levels, dayType,
approach-speed, giveback, precedent); gate 1 is A; gate 4 is H. The value is the
*ordering* — it makes "I noticed something" auditable instead of a feeling.

**G. Rich/cheap pane.** Generalise "crude vs gold, crude vs stocks": a small RV
grid across the instruments already carried, each ratio as a percentile of its own
3-year history, with `corr-history` supplying the norm. Description, not signal.

**H. Structure & crowding, stated honestly.** This desk has **no options data** —
no FX vol surface, no chains. The substitutes it does have: `expected-moves.html`
(implied distribution), `fx-vol-carry` (is vol cheap), `cot-extremes` /
`oi-dashboard` / `book-stress` (is everyone already in it), and defined risk via a
stop at a tested level rather than a premium. Also the standing warning: S10
tested a Crown crowding claim (crowded short in long bonds into the Fed) and it
was **wrong on all three counts**, so crowding stays ~described here until
something passes.

**I. Effective breadth in the sizer.** If breadth is the thesis, price it: wire
N_eff (eigenvalue-based, from the sleeve's own per-pair P&L correlation) into
`diversification.html` / `position-sizer.html`, so "watch 26 pairs" is costed
against how much *independent* risk it actually buys. See S13.

---

## 5. Pre-registered before running

Four studies go into `MARKET_SENSE_TESTS.md` with their reading rules fixed:

- **S13 — does adding pairs add breadth?** (tests Claim A's core arithmetic)
- **S14 — does a multi-year regime break precede anything?** (tests the only
  alert-worthy object in Claim A)
- **S15 — the non-reaction: a big surprise, no move.** (tests Claim B's kernel,
  oil/EIA first, then generalised)
- **S16 — weird × technical, the conjunction.** (conditional on S15 showing
  anything at all)

---

## 6. The order I would do it in

1. **E** — the coverage meter. Half a day, and it makes the gap visible instead
   of asserted.
2. **S15** — the funnel's kernel, with the oil case as the worked example. The
   data is sitting in the repo and the brief currently claims it isn't. **Run
   2026-09-18 (generalized leg only — no local WTI for the oil case): NULL on
   EUR/USD, USD/JPY, GBP/USD, all three CIs straddling 50%.** See
   `MARKET_SENSE_TESTS.md` §S15.
3. **A**, behind whatever S15 returns: a ✓ weird-o-meter if it passes, a
   ~described anomaly list if it nulls (still useful; still ranked by rarity).
   S15(b) nulled, so this is the ~described version until S15(a)'s oil case
   (still unrun, no local WTI data) says otherwise.
4. **S14**, then **B** and **D** together — breadth only behind the budget rule.
   **Run 2026-09-18 (FX + gold only, no local rates/credit): every series came
   back with 4–11 qualifying breaks over ~10.7 years, below the 40-episode
   floor everywhere — the setup is too rare for this desk's paired-bootstrap
   bar at the registered window.** A regime-break alert needs either more
   history or a pre-registered loosened definition before this is buildable
   as a ✓ trigger; see `MARKET_SENSE_TESTS.md` §S14.
5. **S13** before any bot's universe is widened. **Run 2026-09-18 (raw
   instrument N_eff, no sleeve comparison yet — needs FRED): N_eff = 5.58 of
   26 for the full FX+gold book, 2.41 of 7 for the USD majors alone.** The
   prior lands almost exactly where it was guessed to — the honest version of
   Claim A on this desk is close to "watch six things properly" already, and
   the majors-only number says most of the loss is one dollar factor. That
   changes the build, not just the panel: a breadth panel over this universe
   is showing ~5–6 independent reads dressed as 26.
6. **F**, **G**, **H** last — presentation of whatever survived.
