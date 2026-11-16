# Evening edition: from scoreboard to look-back (2026-11-17)

Owner critique (2026-11-16, reading the 16 Nov evening PDF): "very matter of fact instead of a look back over the day, news, what happened".

## What was wrong
1. No story of the day in time order; the best sentence was buried.
2. The biggest scheduled event (Chair Warsh, 17:00) "did not print on the feed": a hole in the story.
3. "No cause in the data" twice (oil burst 08:31-09:02; yields down while the dollar rose and indices sold).
4. No picture of how the day unfolded, only a grid of numbers.
5. "Morning said, day did" was the book score only.
6. "Into tomorrow" was a to-do for the evening review.

## Root cause of 2 and 3 (found while building this)
The news wire (KV `desk_news_wire`) is a local-file key: **every deploy empties it**. 16 Nov had a day of deploys, so at 21:10 the evening
writer found no headlines. Fix: today's tier 1-2 headlines, with their reads and reactions, are also kept (throttled to 15 minutes) under the
permanent dated key `desk_news_day_<London date>` (kv.js `isCfKey`), and `_nwLoad` seeds an empty wire from it. A restart no longer loses the day,
and the news analyst does not pay to read the same headlines again.

## What the issue now has (all rule-built, no model call)
| New | Module | Source |
|---|---|---|
| The day in order: Asia / London / New York, prints with their first 30 minutes, wire headlines with the read and whether the market moved with it, scheduled speakers, each big mover's busiest half hour | `js/eveningTimeline.js` | wire, calendar, release scorecards, M1 bars |
| A scheduled event with no headline is one plain line ("no headline captured in the wire"), not a hole | same | calendar vs wire |
| "The nearest headlines" beside each burst within 30 minutes, or "no news found in the wire" | same | wire |
| How the day unfolded: the six biggest movers and the book in u, bursts shaded, prints ticked (the book line ends on the day score) | `js/eveningDay.js` | M1 bars, morning book |
| When the moves came: markets x hour, London and New York bands | same | M1 bars |
| This morning against the day: the ruling, the currency calls right or wrong, the book | same | thesis-vs-reality record (`desk_run_reality_<date>`) |
| Into tomorrow: the next trading day's high-impact releases, the usual effect, one sentence where today's move makes a currency stretched | same | calendar, `RANGE_EFFECT` |

Page order: headline and first two sections, the day in order, the rest of the narrative, looking back and ahead, every market, the book against the day.
An issue stored before this change (no `ev.day`) renders exactly as before.

## The model brief (OFF by default)
`js/eveningPromptV2.js`: the writer is given THE DAY IN ORDER and an addendum: open with the day's story in that order, state a cause
only if a headline or print in the timeline supports it, say "not captured" for a missing event, keep "Into tomorrow" to one line. **Not turned on:** it changes the
model call's input. Estimated extra input per issue: about 1,100 tokens (addendum about 300 + timeline about 800); one writer call per evening, so on the order of
1,100 extra input tokens a day. No live run was made. Always on (no Railway variable, owner 2026-11-17). After the next deploy, run one evening by hand and read it.

## Dry run
`node scripts/evening-dryrun.mjs 2026-11-16 <outDir>` builds the new issue for a past day from live routes with the stored (old-brief) narrative, no model call, and prints a PDF
through headless Chrome. Headlines come from the live wire; rows the wire has already dropped are filled from the news record as cut-off titles (marked with an ellipsis).

## Tests
`js/eveningTimeline.test.mjs`, `js/eveningDay.test.mjs`, `js/newsletterEvening.test.mjs` (render, no trade wording in the new pages, no repeated 8-word passage, under 1,100 words),
`js/eveningFacts.test.mjs`.

## Not done / unverified
- No live evening run (the first real one is 21:10 London on the next trading day after deploy); the server wiring (`_dsEvening`) is untested against real KV.
- Calendar actuals: the calendar feed rarely carries them; the timeline falls back to the wire's own line ("Canada October CPI 3.1% vs 3.2% expected").
- The M1 bars are the production input; the dry run uses 15-minute bars.
