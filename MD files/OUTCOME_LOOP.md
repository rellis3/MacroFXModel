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

## Findings — run 2026-09-23

763 sessions replayed (2023-09 → 2026-08), calling the live page's own
`scanBoard`/`scanLinks`/`findings` at each index.

### The first result was about the page, not the market

The initial run could not test three of the six finding-kinds, and the reason
matters more than any interval: **they had no control group**, because they fired
on almost every session.

| kind | fired on | control days |
|---|---|---|
| extreme | **96%** of sessions | 0 |
| dislocation | 67% | 0 |
| ratekind | 28% | 0 |
| dispersion | 22% | 81 |

A finding that appears on 96% of days is not a finding. That is a
multiple-comparisons artefact: the board tests 50 tiles and 20 links every
session against a fixed `|z| >= 1.5`, and with 50 draws something always clears
it. `analysis/calibrate_thresholds.mjs` measured the board's own maximum:

|  | median | p85 | p90 |
|---|---|---|---|
| board max\|z\| | 2.10 – 2.35 | 3.46 – 3.71 | 4.00 – 4.12 |
| link max\|z\| | 1.80 – 2.03 | 3.01 – 3.17 | 3.47 – 3.68 |

**The median day already carries a tile at z 2.3.** Thresholds were re-set at
roughly the 85th percentile of that distribution (`THRESHOLDS` in
`js/marketScan.js`: extreme 3.6, link 3.1), and the `extreme` headline now fires
only at the rare tier rather than also at "unusual". Base rates fell to 8–18%.

*(The harness itself had the matching bug: it reported "null — the hedge is
correct" for kinds whose control set was empty. An empty control produces
nothing, not a null. Now refused explicitly with `MIN_CONTROL`.)*

### O1a — range, after re-calibration

| kind | firings | fires on | SPX range diff | NQ range diff | verdict |
|---|---|---|---|---|---|
| **vixterm** | 14 | 8% | **+0.522 [0.378, 0.878]** | **+0.443 [0.262, 0.775]** | **real** |
| **dispersion** | 9 | 8% | **+0.518 [0.365, 0.644]** | **+0.550 [0.367, 0.693]** | **real** |
| **creditstack** | 12 | 16% | **+0.162 [0.015, 0.333]** | +0.139 [−0.133, 0.424] | marginal |
| extreme | 15 | 17% | +0.148 [−0.041, 0.399] | +0.152 [−0.151, 0.443] | null |
| dislocation | 17 | 18% | +0.007 [−0.112, 0.335] | +0.118 [−0.107, 0.400] | null |
| quiet | 33 | 61% | — | — | untestable, and correctly so |

### O1b — direction: null everywhere, as pre-registered

Not one kind beat its control. Every setup's up-share sat at or BELOW the control
share: dislocation 71% vs 80%, extreme 73% vs 79%, vixterm 57% vs 94%, dispersion
67% vs 85%, creditstack 83% vs 77% (the only one above, and its interval
[55–95] swallows the control entirely). This was pre-registered as the expected
outcome and it is confirmed. **No finding on this page carries direction.**

### O1d — one regime, or many?

The three survivors hold in **both halves** of the sample, which is what separates
an effect from an episode:

- vixterm — early +0.697 [0.548, 0.865], late +0.347 [0.202, 0.515]
- dispersion — early +0.733 [0.591, 0.858], late +0.345 [0.202, 0.457]
- creditstack — early +0.147 [0.024, 0.285], late +0.176 [0.037, 0.316]

Both nulls behave as nulls should: dislocation's halves flip sign entirely
(+0.285 early, −0.239 late), which is noise, not a decaying effect.

### O1c — was the page's hedge correct?

**Mostly yes, and now it is evidenced rather than assumed.**

- `dislocation` and `extreme`: the `notMeans` was right. Wording becomes "tested
  here, null" rather than an assertion.
- `vixterm`: survives, and independently reproduces the already-validated VIX
  inversion claim from a completely different harness — a useful cross-check.
- `dispersion`: survives at 20 sessions, reproducing D1's *secondary* window
  (+0.23 [+0.04, +0.51]) from an independent path. D1's headline weekly claim
  stays null; this does not revive it.
- `creditstack`: marginal — real on the S&P, null on the Nasdaq, on 12 firings.
  Recorded as context, not validated.

### Limits, restated

The bundle is not point-in-time: FRED revises, so a 2024 firing sees today's
vintage. Counts are small (9–17 firings). Twenty-session windows overlap heavily,
which is why the intervals are wide and must stay that way. **Nothing here becomes
a live trigger without a forward test** — the tracker that records findings as
they fire is the next step, and it takes a year to say anything.

## What went on the page

- `THRESHOLDS` in `js/marketScan.js`, with the calibration table recorded at the
  definition and a note to re-derive it whenever tiles are added — a wider board
  raises its own maximum and silently loosens an un-rederived threshold.
- Ledger: `mv-vixterm-range` and `mv-dispersion-range` as real (range only),
  `mv-creditstack-range` as context, `mv-dislocation-forward` and
  `mv-extreme-forward` as null.
- No Desk Watch trigger. Range-only claims with 9–17 firings on revised data earn
  a re-run, not an alert.
