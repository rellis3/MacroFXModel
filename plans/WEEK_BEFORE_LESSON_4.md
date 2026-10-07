# While waiting for Lesson 4 (week of 2026-10-07)

*Rule: do not build what the next lessons will teach. Get the evidence ready that they will examine. Lesson 01 §05
already names what is coming: Lesson 4 = costs, capacity, multiple testing (cards 05, 11); Lesson 5 = point-in-time
data (card 01); Lesson 6 = dependence and regimes (card 09); Lessons 11–16 = validation. Everything below is either a
check Lesson 01 already describes, or data the later lessons will need.*

## Why "too little independent data", and where more comes from

The meta-labelling build had 3,144 bets but ~395 independent ones: six USD pairs share the dollar, and bets overlap in
time. To detect a +5 pp precision gain at 50% with 80% power you need about **784 independent bets** (2.8² × 0.25 ÷
0.05²). Three sources:

1. **Longer history (biggest, free, no key).** FRED daily FX (H.10) from **1971** and monthly policy / interbank rates
   (US 2Y from **1976**; Germany 1960, UK 1957, Australia 1968, Canada 1975, Japan 1985, NZ 1973, Norway 1979,
   Sweden 1982). EUR before 1999 = the Deutschmark at the fixed 1.95583. That is ~4–5× the current history.
   **Limits:** close-only (noon New York rate, no high/low), so barriers and any volatility features are
   close-based; no intraday jump measures before 2016.
2. **More breadth.** NZD, NOK, SEK pairs add rate differentials that are partly independent of the six majors.
3. **The forward record**: accrues slowly (one session a day, shared across pairs).

Option (needs the owner's OK, costs Railway egress): back-fill OANDA M1 to 2005 with the server's key. That would
extend the forecast-layer history (intraday measures) by 11 years.

## The week, in order (each item: one pre-registration + at most one variant, then a decision)

1. **Long-history dataset** (FRED, 1971/1976 → 2026, 9 USD pairs). Checks: coverage, gaps, the DEM→EUR splice, and a
   point-in-time publication-lag audit. *Lesson 5 prep (card 01).*
2. **Untouched confirmation of the yield-spread primary on 1976–2014.** Its validation used 2015+ only, so these 40
   years are a real independent test (Lesson 02 §05: a second independent pass takes ~40% to ~90%). Validated config,
   no tuning, close-based.
3. **Power analysis.** For each open question (direction at lines, meta-labelling, the yield book's edge): the
   independent sample needed vs what the long data provides. This decides which questions are answerable at all.
4. **Meta-labelling reopened only if 2 passes and 3 says it is answerable**, on the long data (new pre-registration,
   close-based features). This is the stopping rule's own reopening condition: much more independent data.
5. **Card 01 look-ahead check:** delay every input of the chosen forecast and the yield-spread primary by one more
   day and confirm the results do not depend on exact alignment (Lesson 01 §05 describes this exact check).
6. **Card 09 stress table:** the chosen forecast and the stop rules through the worst periods (2020-03, 2022 GBP,
   2015 SNB where data allows): calibration and stop-crossing in stress vs normal.
7. **Card 11 costs:** put the measured spreads (spread_profile_v1, since 2026-09-17) into the stop and size rules
   (stop ≥ a multiple of spread; size after cost).

Holdout stays sealed (opens 2027-01-04). Nothing live changes without the owner.
