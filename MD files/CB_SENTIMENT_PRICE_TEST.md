# CB Sentiment → Price — pre-registration

> **Status: PRE-REGISTERED 2026-08-15. Stage 1 run same day (results appended,
> design frozen first). Stages 2–3 NOT YET RUN.** Same discipline as
> `REAL_YIELD_SURPRISE_TEST.md` and `PREREGISTERED_EVALUATIONS.md`: the design
> and pass/fail bars below were frozen before any data was touched. Data-availability
> amendments are allowed and recorded; moving a pass bar after seeing a result is not.

## The question

The platform has automated central-bank sentiment engines (FOMC/ECB/BoE/BoJ in
`server.js`) producing a structured `hawkishScore` per meeting from point-in-time
document captures. They currently feed dashboards and the macro scorecard —
**nobody has tested whether the score leads price or merely narrates it.** This
test asks, in escalating stages:

1. **Stage 1 (price only, zero parameters):** Around FOMC statement releases, does
   the market's *initial* reaction direction persist (post-announcement drift) or
   revert by the daily horizon? This is the ceiling check: the initial 30-minute
   move *is* the market's own hawkishness read. If nothing persists beyond 30
   minutes, a text score computed after the release has nothing left to harvest
   at daily horizons, and Stage 3's design must shift to pre-positioning or die.
2. **Stage 2 (score backfill):** Build a historical hawkishness series per meeting,
   two scorers in parallel: (a) a deterministic lexicon scorer (hindsight-free by
   construction), (b) the existing LLM engine (richer, but an LLM knows history —
   contamination risk is real and is why (a) is the confirmatory scorer).
3. **Stage 3 (the claim itself):** Does hawkish *surprise* (score change vs the
   previous meeting) predict the post-release dollar move beyond what the initial
   reaction already prices?

## Honest prior (stated before running)

- Stage 1 join will work (M1 data is dense at 14:00 ET) — high confidence.
- Post-FOMC drift is a published effect but published ≥10 years ago; the five-stage
  public-decay pipeline (`companion-insights-01-03-notes.md`) applies. **Blunt odds
  the drift cell passes: ~30–40%.**
- Stage 3 surviving on the lexicon scorer: **~20–30%.** Expected outcome is null —
  the market reads the statement in seconds; a daily-frequency text score most
  plausibly *confirms* rather than *leads*. A null here is bankable: it would
  demote the sentiment engines to context-only (same "logged-but-inert" class as
  yield coupling) and stop future me from re-proposing sentiment alpha.

## Stage 1 design (frozen)

**Events:** all *scheduled* FOMC decision-day statement releases 2016-01 →
end of M1 data (2026-05), 14:00 ET (exact UTC via `zoneinfo America/New_York`,
not the month-approximation in `js/fomcCalendar.js` — November meetings straddle
DST). Intermeeting emergency actions (2020-03-03, 2020-03-15) are **excluded** —
different release times, no statement-vs-previous comparability. The historical
date list is written from reference knowledge and **self-validated against the
data**: every event must show a 14:00–14:05 ET 5-minute true range ≥ 2× the same
clock-time median of the prior 20 non-event days ("join proof"). Events failing
the spike check are listed, investigated for a date error, and excluded from the
return cells (recorded, not silent).

**Instrument:** the dollar basket — equal-weight average of USD log returns
across eurusd, gbpusd, audusd, nzdusd (sign-flipped) and usdjpy, usdchf, usdcad.
One series, one test; per-pair tables are reported descriptively but carry no
pass/fail weight (7 correlated pairs are not 7 tests).

**Measures (all zero-parameter, frozen):**
- `R0` = basket USD log return 13:59 → 14:30 ET (the initial reaction).
- `R1` = 14:30 ET → next trading day 14:00 ET (the daily drift window).
- `R5` = 14:30 ET → 5 trading days later 14:00 ET.
- Drift test: sign-agreement rate of `R1` with `R0`, and OLS t-stat of
  `R1 ~ R0` (HAC not needed — events are ≥5 weeks apart, non-overlapping for R1;
  R5 windows never overlap either at ≥5-week spacing).

**Stage 1 pass/fail (frozen):**
- **Join proof passes** if ≥90% of events clear the spike check.
- **Drift cell passes** if sign-agreement > 50% with binomial p < 0.05 **and**
  the `R1 ~ R0` slope is positive with |t| ≥ 2. **Fails** otherwise.
  Fade (slope negative, |t| ≥ 2) is recorded as its own finding (a fade edge is
  still information, but it was not the registered hypothesis and would need its
  own fresh pre-registration to be traded).
- No costs in Stage 1 — it measures market behavior, not a strategy. Any tradable
  claim that emerges must go through the harness with costs separately.

## Stage 2 design (frozen; runs server-side — sandbox cannot reach fed.gov or the LLM API)

- Backfill scheduled-meeting **statements** 2016→present via the existing
  `js/fomcFetch.js` path; store as `fomc_raw_statement_<date>` alongside the
  live captures (additive; never overwrite an existing live capture).
- **Scorer A (confirmatory): lexicon.** Deterministic hawk/dove term counting
  (Apel–Blix Grimaldi-style word lists, frozen in code before scoring), score =
  (hawk − dove) / (hawk + dove) per document, plus the change vs the previous
  statement. No model, no hindsight. This scorer's verdict is the one that counts.
- **Scorer B (exploratory): the live LLM engine** run over the same documents.
  Reported alongside with the explicit caveat that an LLM scoring 2019 text knows
  2020; agreement between A and B strengthens B's live use, but B alone cannot
  pass Stage 3.
- Historical FOMC meeting dates must be verified against
  federalreserve.gov/monetarypolicy/fomccalendars.htm before scoring (the
  Stage-1 spike check provides independent confirmation).

## Stage 3 design (frozen)

- **Signal:** ΔhawkishScore (Scorer A, this statement vs previous) at each meeting.
- **Cells (exactly two, both named now):**
  1. corr(Δscore, `R1`) — does the score add daily-horizon information *after*
     the initial reaction window? Pass: positive slope, |t| ≥ 2, N ≥ 60 meetings,
     and sign-stable across the 2016–2020 / 2021–2026 halves.
  2. corr(Δscore, `R0`) — concurrent-validity check only (does the score even
     agree with the market's instant read?). Not a pass/fail cell; if this is
     ~0 the scorer is measuring nothing and cell 1 is void.
- **Multiple-testing accounting:** this document registers **one confirmatory
  test** (Stage 3 cell 1 on Scorer A). Stage 1's drift cell is a separate
  registered test. Everything else reported is descriptive.
- ECB/BoE/BoJ replication happens only if FOMC cell 1 passes, as an OOS-style
  confirmation on the same frozen spec — not as three more chances to find a
  significant cell.

## What we do with each outcome

- **Stage 1 drift passes:** a follow-the-reaction spec (enter 14:30, exit next
  14:00) goes to the honest harness with costs — as its own pre-registered
  strategy test, referencing this document.
- **Stage 1 drift fails / fades:** banked. Stage 3 still runs (the score could
  correlate with R1 even if R0 doesn't), but the "sentiment momentum" framing dies.
- **Stage 3 cell 1 passes:** hawkishScore graduates from dashboard-context to a
  candidate sizing/bias input for USD pairs — via a fresh harness test, never
  directly to live.
- **Stage 3 cell 1 fails:** the sentiment engines are formally classed
  context-only (the yield-coupling precedent), recorded in `BACKTEST_INDEX.md`,
  and sentiment-alpha proposals are closed absent new data (e.g. intra-minute
  reaction trading, which this platform cannot execute anyway).

---

## Stage 1 results (run 2026-08-15, design frozen above before running)

Code and per-event CSV: `analysis/fomc_event_study/`.

**Join proof: PASS — 82/82 events (100%, bar ≥90%).** Every scheduled FOMC
date 2016-01→2026-04 shows a 14:00 ET 5-min true range ≥2× its same-clock
baseline (median ratio 11.9×, minimum 2.5×). The date list, the DST handling,
and the M1 join are all confirmed by the data itself. One event (2024-12-18)
lacks an R5 window (lands on Christmas) and is absent from the R5 cell only.

**Registered drift cell: FAIL — clean null.** N=82.
Sign agreement of R1 with R0: 38/82 = **46.3%** (binomial p = 0.78).
Slope of R1~R0: 0.074, **t = 0.32**. Not a pass, and not a significant fade
either — the initial 30-minute reaction carries **zero** information about the
next-day dollar move. The "follow the FOMC reaction" spec is dead on arrival
and will not be taken to the harness. This null is banked.

Descriptives (no pass/fail weight): R0 mean −1.5bp (sd 33.5bp), R1 mean
−1.7bp (sd 69.2bp). R5 mean **+26.3bp, 65% positive** (N=81, naïve t≈2.5 on
the unconditional mean) — an *unconditional* USD updrift in the week after
FOMC meetings, unrelated to reaction direction. **This was not a registered
cell.** It is recorded as hypothesis-generating only; if it is ever tested it
needs its own pre-registration (obvious confounds to address there: the
2021–2026 USD bull period, and overlap with the dollar-carry timing family).

**Consequence per the frozen decision table:** the sentiment-momentum framing
dies; Stage 2 (score backfill, server-side) and Stage 3 cell 1 (Δscore vs R1)
still run as registered — a text score could yet correlate with the daily
drift even though the initial reaction does not.
