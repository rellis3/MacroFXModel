# Reference Engine Playbook

> Extracted from building Level Atlas + Session Path (2026-08). This is the
> template for the NEXT analysis, whatever it turns out to be — not a
> description of those two engines specifically. Deliberately stops short of
> anything trade-shaped: no after-cost gate, no position sizing, no entry/exit
> rules. This is the discipline for building a trustworthy REFERENCE BOOK —
> "here's what history says happens" — not a signal.

---

## 1. The one-sentence version

**Walk history once, one record per well-defined event, with everything true
at that moment plus what happened next — then let out-of-sample data decide
which context factors are real, never a p-value or a story.**

Everything below is how to do that without fooling yourself.

---

## 2. Before writing any code: define the unit

The single most consequential decision is **what one row of your walk
represents**. Get this wrong and no amount of careful engineering saves it.

Ask: *what is the irreducible, well-defined EVENT whose outcome I'm
measuring?* Two worked examples from this project:

| Engine | The unit (one row =) | The outcome |
|---|---|---|
| Level Atlas | one touch of one forecast line | does price go on to the NEXT line out, or back to the previous one? |
| Session Path | one day, evaluated at one checkpoint hour | does the FULL SESSION go on to reach a target band? |

Notice these are genuinely different questions about related data — Session
Path was NOT "Level Atlas but with more dimensions". Don't force a new idea
into an existing unit just because the plumbing is there; a session-level
question needs a session-level walk (see §7).

**Write the unit down as one sentence before touching a keyboard.** If you
can't state it in one sentence without an "and" or an "or", it's two engines.

---

## 3. The non-negotiables (every engine, no exceptions)

### 3.1 No-lookahead contract
Every value attached to a row must be computable from data strictly available
**at the moment that row's clock stops** — not the future, not even "the rest
of today" unless the row is explicitly about a checkpoint mid-day (see §7).
Write the contract down at the top of the engine file as a comment, the way
`levelAtlasEngine.js` and `sessionPathEngine.js` both do. Then **test it** —
see §6.1. A caught lookahead bug this project shipped: a "day volatility"
reading computed from the day's own eventual high-low range, which produced a
confident-looking finding that was actually a tautology (a day that hasn't
moved much yet obviously hasn't moved much by the time you check).

### 3.2 The OOS-holding gate
A context factor is never shown as a reason unless:
1. It clears a minimum sample size in **both** the in-sample and
   out-of-sample halves (this project used n≥30 both halves).
2. The effect has the **same sign** in both halves.
3. The effect size clears a minimum floor in **both** halves (this project
   used ≥3 percentage points) — a statistically-present but trivial effect is
   not worth surfacing.

No p-values, no significance testing — this is a blunter, more honest bar:
*did it happen again on data it wasn't built from?* Implement this as one
shared function (`annotateHolds`/`holds` in this project) that every
dimension goes through identically. Never let a UI special-case a dimension
into visibility.

### 3.3 Reference book, not signal search
No after-cost filter. No "is this tradeable" gate. A cell that shows 38%
either way is a **complete, correct answer**, not a rejected hypothesis. The
moment you start dropping findings because they're not exciting enough, you've
built a signal search wearing a reference book's clothes, and the surviving
findings are now biased toward whatever looked good, not whatever's true.
Signal-search work (does this pay after costs, is it worth trading) is a
**separate, later, harness-gated exercise** — see `ANALYTICS_ENGINE_DESIGN.md`
§1 for that harness. This playbook is only for the "what does history say"
layer underneath it.

### 3.4 Compose, never duplicate (the Lego Principle)
Before writing any formula, check `MD files/LEGO_MODULES.md` for a brick that
already computes it. This project reused, rather than re-derived: the fitted
forecast ladder, session bucketing (`bucketM1IntoSessions`), the volatility
estimator, the VuManChu/VWAP/confluence feature pack, and — across the two
engines built this session — literally exported one private helper
(`sessionVolBucket`) from the first engine so the second could read the exact
same formula rather than risk a second, subtly different copy. **Two engines
computing "today's volatility regime" two slightly different ways is worse
than one engine not having it at all** — they'll disagree on some days, and
nobody will know which one to trust.

---

## 4. The architecture: four layers, only the first is mandatory

```
   ENGINE  →  REPORT  →  ROUTES  →  UI
   (walk)     (book)     (serve)    (translate)
   ALWAYS     OPTIONAL   OPTIONAL   OPTIONAL
```

**The engine's raw `rows` output is itself the deliverable — a reusable
dataset, not just an intermediate step on the way to a book.** REPORT (§4.2)
is what you build when the specific question is "does this context factor
hold up out-of-sample" — but that's one particular consumer of the rows, not
a mandatory next stage. The rows are one-record-per-unit, richly contextual,
causally clean data: perfectly good input to a manual exploration, a
different kind of aggregation, a completely different downstream question, or
just sitting there as a trustworthy dataset until you know what you want from
it. Don't build the OOS-gated book machinery (§4.2), the async-job routes
(§4.3), or a UI (§4.4) until something actually needs them — a lot of value
can come from just running the walk and looking at what came out.

What's NOT optional regardless of how far you take it: the no-lookahead
contract (§3.1) and the causality tests (§6) — those protect the rows
themselves, which is the thing you're keeping either way.

### 4.1 Engine (pure, no I/O) — the only mandatory layer
One exported walk function. Input: packed M1 (+ instrument/assetClass config).
Output: `{ rows: [...], coverage: {from, to, sessions} }`. No network, no
clock reads, no randomness — every test depends on this being 100%
deterministic given the same input.

Each row carries:
- Identity fields (instrument, date, whatever indexes the unit — side/rung,
  checkpoint hour, etc.)
- **Context fields** — everything true at that moment (see §5 for how to pick
  which ones)
- **The outcome** — what happened next, resolved causally

### 4.2 Report (optional — build only when you need the OOS-holding question answered)
Turns raw rows into a **book**: a `cell` (the primary axis from §2) crossed
with every **dimension** (a context field), each bucket carrying an n, an
IS/OOS rate, a delta vs the cell's own base rate, and a `holds` boolean from
§3.2. Two entry points:
- `buildXBook(rows)` — the full book, persisted (see §4.3)
- `matchXContext(book, liveRow)` — looks up one live row's cell + reads its
  own dimension values, returns only the dimensions that `holds` — this is
  the ENTIRE "why" a UI ever shows. If a dimension doesn't hold, the live row
  simply doesn't mention it. Never fall back to showing an unconfirmed reason
  because the confirmed list looks thin.

### 4.3 Routes (the async-job + fast-live split)
The walk is expensive (a full-history walk over M1 costs 40s-160s+ depending
on how many context dimensions it computes). Two completely different
freshness needs, do not conflate them:

- **The book** (aggregate historical stats) barely moves with a day of new
  data. Rebuild it via the standard async-job pattern already used across
  this codebase: `POST /run` kicks off a background walk + persists the book
  to R2, `GET /status/:jobId` polls, `GET /card/:instrument` serves the
  finished book straight from R2 (near-instant — reading R2 was never the
  bottleneck).
- **"What applies right now"** needs to update every few seconds for a live
  UI, and — the key insight that made this fast — **every context input this
  project has needed is a rolling-window function that only reads its own
  trailing slice** (the widest lookback found was 60 trading days). That
  means a live query does NOT need the full multi-year M1 archive: bounding
  the input to a comfortable margin over the widest lookback (this project
  used 180 calendar days) reproduces IDENTICAL output to the full walk —
  proven by literally diffing the two outputs field-for-field in a test, not
  assumed. Cache that bounded window in memory per instrument, top it up
  incrementally on each call (a cheap gap-fill that short-circuits when
  nothing's new), and **only recompute when the underlying data actually
  changed** (a new bar closed) — most polls then cost nothing. Measured
  result on this project: ~0ms per warm call, vs 40-160s cold.

Both job-tracking and the live cache are **in-memory only** — a server
restart wipes them silently (no error, no trace). This bit this project
twice in one day. Either build in a completion-check that doesn't trust job
state blindly (cross-check the actual persisted output, e.g. via a manifest
endpoint), or accept the manual-recovery cost and know to expect it.

### 4.4 UI (plain English, not quant)
See §8 — this is big enough to deserve its own section.

---

## 5. Layering context by timeframe

This is the "different timeframes, session/HTF/LTF/time/date/volatility"
part of the ask. Think of context as concentric layers around the event, each
with its own causal boundary and its own natural refresh cadence:

| Layer | Examples (already built, reusable) | Causal boundary |
|---|---|---|
| **Instant / LTF** | approach speed into a level, round-number proximity, volume climax at the moment | up to and including the current bar only |
| **Momentum oscillator** | VuManChu/WaveTrend single-TF state, multi-TF agreement, VWAP side | same bar, but genuinely a different axis from raw price (speed/extension, not level) |
| **Intraday / session** | today's vol regime vs its own trailing history, which session (Asia/London/NY), position within the session, session-so-far shape (see §7) | only the CURRENT and COMPLETED sessions — a session in progress cannot be read as its own context (see §6.2) |
| **Daily** | day of week, overnight gap, prior day's close vs ITS OWN forecast bands | complete before today opens — zero lookahead risk by construction, the safest layer to add |
| **Higher timeframe (HTF)** | 1h/4h trend direction (EMA slope), 1h ADX (trend strength vs ranging) | last CLOSED HTF bar strictly before the event — never the bar the event falls inside (the classic `request.security` repaint bug) |
| **Cross-side / two-way** | has the OPPOSITE side also moved meaningfully (this project's single largest finding, in TWO different guises: `churn` at touch-level, `otherSideProgress` at session-level) | same causal rule as whatever it's tracking |
| **Forward-looking / market-implied** | implied vol vs realized (variance risk premium), skew direction | the ONE deliberately-forward-looking layer allowed — must be lagged to what was actually published (this project used prior-day's EOD settle, never same-day) and clearly flagged as the exception, not the norm |
| **Not yet built here, flagged as natural next layers** | options/gamma regime, upcoming calendar events, weekly/multi-day pattern, cross-asset confirmation | whatever data source backs it — check historical depth BEFORE building (see §9) |

**Rule of thumb**: the deeper the layer (session > daily > HTF), the SLOWER
it should refresh in a live UI, because the underlying fact genuinely changes
slower. Don't poll a "day of week" dimension every 5 seconds — it's the same
answer for the next 24 hours. This project split the two live UIs at 5s
(touch-level, since price ticks fast) and 15s (session-level, since a whole
day's shape moves slower) for exactly this reason.

---

## 6. Traps to design against from day one

### 6.1 Lookahead (§3.1) — test it, don't eyeball it
Pattern: build TWO versions of the input — a clean baseline and one with a
FUTURE portion perturbed (add noise to the last N bars/days only) — then
assert every row dated BEFORE the perturbed region is byte-identical between
the two runs. If a row's fields move because you edited data that happened
*after* it, you have a leak. This project's tests do this for every engine
built.

### 6.2 Reading an in-progress period as if it were complete
A session's own volatility bucket cannot be exposed to a touch that happens
*inside* that same, still-incomplete session (Asia's own range isn't knowable
until Asia closes). Gate every "this period's own stat" reading behind "has
this period actually finished by now" — as a boolean check, not an
assumption.

### 6.3 The reversal trap — track the PEAK, not just the CURRENT value
If your event's context includes "how far along is X toward some target,"
**also track the best/most-extreme value X reached so far**, as a causal
running max. A single "how far along right now" number conflates "still
making progress" with "made progress, then gave it back" — genuinely
opposite setups that this project proved behave oppositely (one showed +66pp
lift, the failed-reversal version of the SAME raw distance showed a real,
OOS-held NEGATIVE effect). The fix generalizes beyond price: any "how far has
this metric progressed toward a threshold" question probably wants a peak
tracked alongside the current value, bucketed on the RELATIVE gap between
them (`(peak - current) / peak`, not an absolute distance) so the split works
regardless of scale.

### 6.4 Definitional tautology
Before trusting a large effect, ask: *could this be true BY THE DEFINITION of
how I built the outcome, rather than because of anything real in the
market?* Caught in this project: a same-day repeat touch's "did the LAST
visit resolve" reading was near-mechanically guaranteed to read `'neither'`
if the earlier visit hadn't had time to resolve yet — reporting that as
"prior neither predicts future neither" was circular, not a finding. Fix was
to exclude the tautological case from that dimension entirely rather than
delete the whole dimension — the SAME-day, resolved-only version turned out
to be the single cleanest real finding in the book.

### 6.5 Already-resolved contamination
If the question is "does X happen LATER," explicitly exclude any case where
X has ALREADY happened by the time you're conditioning — otherwise every
later checkpoint's hit rate is inflated by cases that were never really "will
this happen," they were "this already did."

### 6.6 A surprising result is a reason to check harder, not celebrate
When a first pass produced a huge, clean-looking effect in this project
(±40-60pp), the right response was to ask *why is this so big* before
shipping it — which is what surfaced the reversal trap (§6.3) rather than
letting an artifact through. A boring, well-understood 5-10pp effect that
survives scrutiny is worth more than an exciting 50pp one that hasn't been
interrogated.

---

## 7. When the unit itself needs to change (session-level, not touch-level)

Not every new question fits the "one row per touch" shape. If the question is
about a WHOLE PERIOD's behavior (a session, a week), the walk needs a
DIFFERENT primary loop — one row per period (× however many checkpoints you
want to sample it at), not one row per sub-event. Session Path's structure is
the template:

1. Loop over PERIODS (days), not events.
2. Within each period, loop over CHECKPOINTS (fixed offsets from period
   start — this project used hours-since-session-start, not wall-clock UTC
   hours, since the period itself is anchored to a specific local start).
3. At each checkpoint, compute: current state, peak state so far (§6.3), and
   scan FORWARD ONLY (never before the checkpoint) for the period's eventual
   outcome.
4. Share as much of the context-computation code as possible with any
   existing touch-level engine covering the same instrument (§3.4) — but
   accept that the CELL and the OUTCOME are genuinely different, and don't
   force them into one function just because the data source is the same.

---

## 8. UI translation rules (once the data is trustworthy, don't bury it)

1. **Plain English over quant labels, always.** Every bucket value needs a
   human sentence fragment ("well stretched from today's average price," not
   `vwapSide: '1·far'`). Build one shared translation table per bucket
   VALUE (not per dimension) if two engines share the same underlying
   formula (§3.4) — the label function should be reused too, not
   re-authored.
2. **Separate "what's true right now" from "what history says."** The first
   is facts, shown even when they're not currently proven to matter (so a
   reader builds their own intuition over time); the second is a verdict,
   shown only when it cleared the holding gate (§3.2). Don't blend them.
3. **One synthesis line, detail behind a toggle.** State the clearest
   finding in one sentence at the top; put the full supports/challenges
   breakdown behind a native `<details>` disclosure. Nobody wants ten rows
   of `Δ+6.3pp / n=162` as the FIRST thing they see.
4. **Show only what's actually relevant, not everything the engine could
   theoretically say.** If the same live moment produces three candidate
   things to show (e.g., three approaching levels), don't show all three
   just because you can — show the one(s) genuinely near/relevant, and
   collapse the shared "what's true right now" panel across them rather than
   repeating it. A UI that shows more of the SAME redundant context isn't
   more informative, it's noisier.
5. **An honest "no edge"/"coin flip" is a complete answer.** Never force a
   directional call when the data doesn't support one — that's the whole
   point of §3.2's gate. A UI that always shows a confident-sounding verdict
   has quietly broken the gate somewhere.
6. **Two engines that could disagree should be shown side by side, not
   blended.** If a later build adds a second lens on the same underlying
   question (as Session Path is to Level Atlas), don't average or override —
   label each clearly by what it measures, and if you want to know whether
   agreement between them means anything, TEST that as its own dimension
   (§3.2) rather than assuming it.

---

## 9. A checklist for starting the next one

1. Write the one-sentence unit definition (§2). If it needs "and," split it.
2. Check `LEGO_MODULES.md` for every brick the question might need — ladder,
   session bucketing, vol estimator, confluence pack, whatever's closest.
   Reuse, don't re-derive (§3.4).
3. If the question depends on a data source not yet used for backtesting
   (options/gamma, calendar events, a new market), check how far back that
   source's HISTORY actually goes before designing the engine around it — a
   great idea blocked by 2 years of usable history instead of 10 needs to
   know that up front, not after building the walk.
4. Write the engine: pure walk, no-lookahead contract as a comment,
   causality tests alongside (not after) — perturb-the-future (§6.1),
   session-completeness gating (§6.2), peak-tracking if the question has any
   "how far along" shape (§6.3), tautology check (§6.4), already-resolved
   exclusion (§6.5).
5. Run the walk against REAL data and just look at the rows before deciding
   anything else — this alone is often enough to be useful (§4). Look for
   surprising magnitudes or directions and chase them down (§6.6) — several
   of this project's most important fixes only showed up here, not in
   synthetic tests.
6. Only build the report layer (cell + dimensions, IS/OOS split, the holds
   gate from §3.2 — one shared function, no per-dimension special cases) if
   the question genuinely needs "does this hold OOS" answered. If you just
   need the dataset, stop at step 5.
7. Only THEN decide if a live UI is needed. If yes, build the fast-live path
   (§4.3) — bounded window, warm cache, recompute-on-change-only — don't
   default to polling the full walk.
8. UI: plain English, dedup, proximity/relevance-filter, one-line synthesis
   + collapsible detail (§8).
9. Document the new engine in `LEGO_MODULES.md` — what it reuses, what it
   found, what's still open. The next person (or the next version of this
   conversation) starts from that entry, not from re-reading the code.
