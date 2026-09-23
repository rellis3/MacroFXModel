# O1 — does this page's own output predict anything?

*Pre-registered 2026-09-23, before any outcome was computed. Written because the
Market View describes today and never comes back. Every finding it emits makes an
implicit claim; none of them has ever been scored.*

## The idea, in plain terms

market-view.html emits a small number of findings each day — "this is a real-yield
move", "US 2-year is rare", "gold and real yields have come apart". Each one is
carefully hedged with a `notMeans` saying it is not a forecast. That hedge is
honest but it is also untested: nobody has checked whether these findings precede
anything at all.

This closes the loop. Replay the scan as of every past session, record what the
page WOULD have said that day, and score what actually happened afterwards.

Two things it delivers, and they are different:

1. **A track record.** The page can say "when it has flagged this before, here is
   what followed" — with an interval, from its own history rather than from a
   remembered episode.
2. **A verdict on the hedge.** If a finding-kind turns out to precede nothing, the
   `notMeans` was right and we now know it rather than assuming it. If one
   precedes something, that is a pre-registered result, not a discovery after the
   fact.

## Data

| series | source | note |
|---|---|---|
| the scan bundle | `/api/drill-series` | 59 series, 1,583 sessions, 2020-09-22 → present |
| the scan itself | `js/marketScan.js` `scanBoard`/`scanLinks`/`findings` | replayed unchanged, at each past index |
| sectors, breadth | `js/marketState.js` | same modules the live page uses |

The replay uses the **same functions the page calls**, at index `i` instead of the
last index. It does not re-implement them. That is deliberate: a harness that
re-implements the thing it is testing tests the re-implementation.

## Definitions, frozen

- **A firing**: a session on which `findings()` emits a finding of a given `kind`.
- **De-clustered**: the first firing of a kind, with no re-fire of that kind inside
  20 sessions. Without this, a condition that persists for a month counts twenty
  times and every interval collapses.
- **Outcome horizon**: 20 sessions after the firing.
- **Control**: all sessions at least 20 sessions away from any firing of that kind.
- **The outcome measures**, fixed now:
  - **Range**: mean daily range over the next 20 sessions as a multiple of the
    trailing 20-session median daily range, on SPX500 and NAS100.
  - **Direction**: the sign of the SPX500 return over the next 20 sessions, as a
    share with a Wilson interval.
- **Warm-up**: no firing before index 800, so every reading has three years of
  history behind it, exactly as the live page requires.

## Claims

**O1a — range.** After a finding fires, is the next month wider than control?
Reported per finding-kind as the difference in range ratio with a block bootstrap
95% interval (blocks of 10, 1000 reps). **Real only if the interval excludes zero.**

**O1b — direction.** After a finding fires, is the SPX500 higher 20 sessions later
more often than control? Wilson interval on the share, against the control share.
**Real only if the intervals do not overlap.** Expected to be null — every
direction test on this desk has died, and this is pre-registered as the expected
outcome so that a null is not spun as a surprise.

**O1c — is the page's own hedge correct?** For each kind, does EITHER O1a or O1b
survive? The `notMeans` on every finding currently asserts no forward content. Any
kind where nothing survives has its hedge confirmed; any kind where something
survives needs its wording changed and a ledger entry.

**O1d — one regime or many?** For any kind that survives, split the firings at the
midpoint of the sample and report both halves. A result living entirely in one half
is an episode, not an effect. This is the same guard that caught the dispersion
result (D1) and the same one the analogue panel applies live.

## What each verdict does to the page

- The **track record panel** ships regardless: "this page has flagged a real-yield
  move N times since 2023; the next month ran X wider [interval]". Descriptive,
  with the interval always shown.
- O1a or O1b **real** for a kind → a ledger entry with the number, that kind's
  `notMeans` rewritten to state the tested effect, and a Desk Watch trigger worded
  as range only.
- **Null** → the ledger records the null, and the `notMeans` gains the words
  "tested here, null" so the hedge is evidenced rather than assumed.
- Direction is reported because it is pre-registered, not because it is expected
  to work. It will not be turned into a trigger on this sample whatever it shows.

## What would make this wrong, stated up front

- **Overlapping windows.** A 20-session forward window on daily data autocorrelates
  heavily. The block bootstrap is there for exactly this; the intervals are wide on
  purpose and must not be narrowed by switching to an iid resample.
- **Small counts.** Some kinds will fire a handful of times in four years. Any kind
  with fewer than 8 de-clustered firings is reported as "too few to judge" and not
  scored — decided now, not after seeing which ones are thin.
- **The bundle is not point-in-time.** FRED revises. The replay uses today's
  vintage of history, so a firing in 2023 sees the revised 2023 data, not what was
  printed then. This inflates nothing directionally but it is a real limitation and
  it is why no result here becomes a live trigger without a forward test.

Harness: `analysis/outcome_loop.mjs`. Output: `analysis/output/outcome_loop.json`.

## Findings

*To be filled by the harness run. Nothing below this line has been computed.*
