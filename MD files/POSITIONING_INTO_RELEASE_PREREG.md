# Crowded FX positioning into a scheduled release — pre-registration

> **Status: REGISTERED 2026-10-14. NOT YET RUN.** Design frozen before any of the
> conditional data was assembled. Nothing in `js/positioningIntoEvent.js` or the
> today.html panel depends on the outcome — they state who is exposed and explicitly
> refuse a direction, which is the correct behaviour whether this passes or fails.

## Why this is not already answered

Two registered tests sit next to this question and neither reaches it.

| Entry | What it tested | Verdict |
|---|---|---|
| `cot-positioning-factor` | Does spec positioning, share-of-OI and ranked, predict forward returns? Two-sided. | **FAIL** — pooled OOS rank-IC −0.0317, p=0.0936. AUD leg +0.004. |
| `crowded-bond-short-fomc` | Crowded leveraged-fund short in long bonds into an FOMC meeting | **NULL, and backwards** — shorts were *paid*, +4bp over 5 sessions, +9.1bp [+1.3, +16.5] on consensus decisions |
| `squeeze-fuel` | Crowded, underwater **retail** position as squeeze fuel | **NULL** — not wider than matched days on 4 instruments over 9 years |

The first is unconditional: it asks whether positioning predicts returns on an *average*
week, and most weeks have no scheduled catalyst. The second is conditional but on **one
market and one event type** — US long bonds into the Fed. The third is retail sentiment,
a different dataset measuring different people.

**The gap:** nobody has asked whether crowded *institutional* FX positioning behaves
differently **on the days a scheduled high-impact release actually lands**. That is the
claim the desk keeps meeting in the wild, and it is currently unanswered rather than
answered-null. Saying "we tested positioning and it failed" would be citing the wrong
test — the honest statement is that this specific conditional version is untested.

## The hypothesis, stated so it can fail

> On a day carrying a high-impact scheduled release for currency C, a **crowded**
> leveraged-fund position in C (net share of open interest at the extreme of its own
> three-year range, **with the sign and the percentile agreeing**) is followed by a
> wider realised range and a larger adverse excursion against the crowded side than a
> matched non-crowded day carrying the same kind of release.

Two separate questions, reported separately and never blended:

- **R (range).** Is the day wider? This desk has validated that releases widen range
  (`surprise-size`), so the real question is whether crowding widens it *further*.
- **D (direction).** Does price move against the crowded side? The prior from
  `cot-positioning-factor` and `crowded-bond-short-fomc` is **no**, and the second found
  the opposite sign. Registered anyway, two-sided, because leaving it out would let a
  positive range result be quietly read as a direction result later.

**Expected outcome, stated in advance so a null is not a disappointment:** R has a
plausible mechanism and may pass. D is expected to fail; if it passes, the 84-meeting
bond result is evidence against it and one FX pass would not overturn that.

## Data

- **Positioning.** CFTC TFF `gpe5-46if`, futures-only, direct from Socrata — **not**
  `/api/cot-extremes`, which is display-grade (156-week cap, 7-day cache). Seven majors:
  EUR, GBP, JPY, AUD, CAD, CHF, NZD. 2006→. Leveraged-fund net as a share of open
  interest, ranked on a trailing 156-week window, **sign and percentile must agree** (see
  `extremeOf` — net long at the 10th percentile is a trimmed book, not a crowded short,
  and conflating them was a live bug on 2026-10-14).
- **Releases.** The desk's own calendar, `impact = high`, filed to the currency by
  country. US releases are assigned to **every** pair, since they land on all of them.
- **Prices.** OANDA M1 for the pair, London calendar day via `bucketM1IntoSessions`.
- **Lag.** COT is as of Tuesday, published Friday ~15:30 ET. A report is usable **only
  from the following Monday open** — using Tuesday's book on Wednesday is lookahead and
  is the single easiest way to fake this result.

## Method

1. **Event days.** Every (pair, date) where that pair's base or quote currency has a
   high-impact release. Exclude days with a central-bank rate decision for either leg —
   a policy day is a different animal and would dominate.
2. **Arms.** CROWDED = the most recent usable report has the leveraged-fund leg crowded
   (pct ≥ 80 with net > 0, or pct ≤ 20 with net < 0). CONTROL = the same pair, same
   release *kind* (`newsKind`), not crowded.
3. **Matching.** Control days are matched on pair, release kind, and trailing 20-day
   realised vol decile. An unmatched comparison would recover "crowding happens in
   volatile regimes", which is not the claim.
4. **Measures.** R: London-day true range ÷ trailing 20-day ATR. D: signed close-to-close
   return in the direction *against* the crowded side, in ATR units.
5. **Clustering.** Block bootstrap by **week**, not by row. Seven FX legs are largely one
   dollar trade, so same-week rows across pairs are one bet, not seven — this is the
   error that flattered `cot-positioning-factor` and it is being handled up front here.

## Bars, frozen

| Check | Bar |
|---|---|
| **MIN_EVENTS** | ≥ 150 crowded event-days, and ≥ 25 on each of ≥ 4 pairs |
| **R passes** | effect ≥ +0.15 ATR, 95% block-bootstrap CI excludes 0, same sign in both halves of the sample, and ≥ 4 of 7 pairs individually positive |
| **D passes** | 95% CI excludes 0 **and** the same sign in both halves **and** ≥ 5 of 7 pairs — a higher bar than R, because two registered tests already point the other way |
| **Placebo** | the identical test on random non-release days with the same crowding filter must **not** pass. If it does, the result is about crowding regimes, not releases, and the whole thing is void |
| **Mirror** | the trimmed arm (smallest position in three years) must be run too. If *it* shows the same effect, the effect is not about crowding |

Below MIN_EVENTS the result is **UNDERPOWERED**, which is not NULL — the question was not
answered and must be recorded that way.

## What each outcome changes

- **R passes, D fails** (the expected case): the today.html panel gains a *range* line on
  crowded rows — "this kind of day has run N% wider" — and nothing else. No direction, no
  lean, no bot.
- **Both fail:** the panel stays exactly as it is. It already claims nothing, which is why
  it did not need to wait for this. The result is banked and the question is closed.
- **D passes:** it does **not** become a signal. It becomes a second pre-registration on
  held-out years, because it would contradict an 84-meeting result and one pass against
  that prior is a hypothesis, not a finding.
- **Placebo or mirror fires:** void, banked as void, and the reason written down.

## Stopping rule

If this fails, **no further conditional variants of "crowded positioning predicts
something" are to be tried on FX.** That would be three registered tests — unconditional,
bond-event, FX-event — all null or backwards, and continuing to slice it would be
searching for the one cut that passes by chance. Positioning stays what the panel already
calls it: a read on who has to act if they are wrong.

## Harness

To be written as `analysis/positioning_into_release_study.mjs`, reporting into
`js/deskEvidence.js` as `positioning-into-release` with its power recorded in `POWER`.
