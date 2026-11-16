# Spreads and ratios: the educators' X-versus-Y pairs, what we hold, what we have tested

Dated 2026-11-16. Written with the Insight tab's "Spreads & ratios" board (preview, `panel.insight.spreads`). Hand-kept: the pair list lives in
`js/terminal/spreadsLibrary.js` and its test keeps this table honest (every leg exists in the bundle, every Evidence Book id exists).

## What the owner asked

Educators (Nicholas Crown, Jessinskip, the C.OG course text, the Colez notes, the podcasts, the quant teachers) keep reading markets as X versus Y or
X minus Y: equal-weight against cap-weight, small against large caps, credit against Treasuries, copper against gold, the curve, VIX against its
3-month. The owner wanted every one of those drawn in one place, in the terminal's own visual style, with the educator's claim next to what our own
tests found.

## Rule for the whole board

A spread or a ratio DESCRIBES STATE: where it sits against its own history, how stretched it is, how it moved with another market the same day.
It is never presented as a signal. Forward claims are only as strong as the Evidence Book's verdict on them, and for this family most of those are
NULL or UNDERPOWERED. Two general tests speak for the whole idea of a relationship at an extreme and are shown above the ladder:

- `mv-extreme-forward` NULL: when a market makes a rare move against its own history, nothing measurable follows.
- `mv-dislocation-forward` NULL: when two markets that normally move together come apart, nothing measurable follows.

Graded language throughout (effect, interval, power; `feedback_null_is_not_dead`): a NULL here means "tested, nothing found going forward", an
UNDERPOWERED means "could only have found a large effect", VALIDATED findings in this family are about RANGE and SIZE, never direction.

## How the pairs were found (and the limit of it)

Mined from the stored educator material in the repo: the Crown watch log (`MD files/CROWN_WATCH.md`, 19 dated entries) and the Crown clip notes
(`education/intake/informational/crown`), Jessinskip, the Colez notes, the podcast notes, the Jordan video notes, the C.OG course text
(`education/bank-verbatim`, `cog_snippets`), the Quant Guild notes and the friend's VIX-ratio note: 111 files, about 19,500 lines. For each pair a
token family was counted by line (for example RSP or "equal-weight" for RSP / SPY). The counts are a rough popularity ranking, not a vote:

- They count lines in the stored NOTES and course text. The raw transcripts (ReelScribe, R2) were not mined, so a pair an educator says once in a long
  video is under-counted here.
- Pairs that share a token family (NVDA against SMH and against SPY; HY minus IG and CCC minus HY; VIX/VIX3M and VIX9D/VIX) carry the same count and are
  not ranked twice on the wall. "Gold / silver" is mostly silver mentions, not the ratio, and is flagged and kept off the wall for the same reason.
- The Crown count is the largest single educator for the equity ratios; the C.OG course text carries the rates, credit and vol ratios.

## The ranked pairs, what we hold, what we have tested

Held = the pair is built from the daily market bundle (`/api/drill-series`, about six years of completed closes, 75 series) on the dates where both
legs exist; nothing is filled in. Verdict words are read live from `js/deskEvidence.js` by the board; this table is a dated copy.

| # | Pair | How it is built | Educator lines | Held: closes since | Our tests (Evidence Book) |
|---|---|---|---|---|---|
| 1 | Real minus breakeven | tips minus bei | 79 (C.OG course 53, Jordan 14, Crown 7, Colez 3, Quant Guild 2) | 1,498 since 2020-11-16 | broken-link-resolution CONTEXT; gr-us-yields-direction NULL |
| 2 | HY minus IG | hy minus ig | 69 (C.OG course 57, Podcasts 6, Crown 4, Jordan 1, Quant Guild 1) | 783 since 2023-11-17 (short) | credit-leads-equities NULL; bounce-confirmation UNDERPOWERED; hy-spread-vol-idx CONTEXT |
| 3 | CCC minus HY | ccc minus hy | 69 (shared: credit) | 784 since 2023-11-17 (short) | credit-leads-equities NULL |
| 4 | RSP / SPY | rsp / spy | 45 (Crown 39, Quant Guild 4, Podcasts 1, C.OG course 1) | 1,507 since 2020-11-16 | breadth-narrowing NULL; breadth-tilt-semis NULL |
| 5 | AUD/JPY | audjpy (level) | 40 (C.OG course 36, Jordan 4) | 1,562 since 2020-11-16 | yen-funding-squeeze-audjpy UNDERPOWERED |
| 6 | SMH / SPY | smh / spy | 34 (Crown 34) | 1,507 since 2020-11-16 | breadth-tilt-semis NULL; ai-crack-metals NULL; bounce-confirmation UNDERPOWERED |
| 7 | Russell / S&P | r2k / spx | 32 (Crown 22, C.OG course 9, Podcasts 1) | 1,551 since 2020-11-16 | rotation-extreme NULL (Nasdaq vs Russell, the closest test) |
| 8 | MOVE / VIX | move / vix | 32 (C.OG course 24, Podcasts 4, Crown 4) | 1,495 since 2020-11-16 | rates-vol-gap-move NULL; rates-vol-gap-state UNDERPOWERED |
| 9 | 10y minus 2y | us10y minus us2y | 31 (C.OG course 30, Podcasts 1) | 1,498 since 2020-11-16 | curve-inversion NULL; rates-spread-asset-lead NULL; yield-slope-magnitude NULL |
| 10 | NVDA / SMH | nvda / smh | 30 (shared: NVDA; Crown 18, Quant Guild 12) | 752 since 2023-11-16 (short) | none on file |
| 11 | NVDA / SPY | nvda / spy | 30 (shared: NVDA) | 752 since 2023-11-16 (short) | none on file |
| 12 | Gold / silver | gold / silver | 30 (mostly silver mentions, not the ratio; Crown 18, Podcasts 8, C.OG course 4) | 1,548 since 2020-11-16 | none on file |
| 13 | Gold / DXY | gold / dxy | 20 (Crown 8, Colez 4, C.OG course 4, Jordan 2, Podcasts 2) | 1,487 since 2020-11-16 (the dollar index lags: stale flag) | relationship-map UNDERPOWERED |
| 14 | Nasdaq / S&P | nq / spx | 19 (Quant Guild 6, Podcasts 5, Crown 4, C.OG course 4) | 1,551 since 2020-11-16 | rotation-extreme NULL (closest test) |
| 15 | 30y minus 5y | us30y minus us5y | 19 (Podcasts 15, C.OG course 4) | 1,498 since 2020-11-16 | rates-spread-asset-lead NULL |
| 16 | BTC / gold | btc / gold | 18 (Podcasts 12, Crown 5, Colez 1) | 1,545 since 2020-11-16 | none on file |
| 17 | VVIX / VIX | vvix / vix | 17 (C.OG course 15, Friend 1, Quant Guild 1) | 1,506 since 2020-11-16 | vvix-ratio-range VALIDATED (range); vvix-ratio-direction UNDERPOWERED |
| 18 | VIX / VIX3M | vix / vix3m | 15 (C.OG course 11, Quant Guild 4) | 1,506 since 2020-11-16 | vix-inversion VALIDATED (range); mv-vixterm-range VALIDATED (range) |
| 19 | VIX9D / VIX | vix9d / vix | 15 (shared: VIX term) | 1,506 since 2020-11-16 | vol-curve-front VALIDATED (range) |
| 20 | Copper / gold | copper / gold | 12 (C.OG course 9, Crown 3) | 1,548 since 2020-11-16 | dr-copper NULL (the universal claim is falsified) |
| 21 | XLE / WTI | xle / oil | 7 (Crown 6, Podcasts 1) | 1,506 since 2020-11-16 | none on file |
| 22 | XLY / XLP | xly / xlp | 1 (C.OG course 1) | 1,507 since 2020-11-16 | none on file |

The "wall" shows the twelve most-mentioned pairs by this count (real minus breakeven, HY minus IG, RSP / SPY, AUD/JPY, SMH / SPY, Russell / S&P,
MOVE / VIX, 10y minus 2y, Gold / DXY, Nasdaq / S&P, 30y minus 5y, BTC / gold).

### What the table says in one paragraph

Of 22 pairs, 16 have at least one test on file. The only VALIDATED ones are VALIDATED for RANGE and SIZE (VIX / VIX3M, VIX9D / VIX and VVIX / VIX):
they say how wide the next days run, not which way. Every pair where the educator's claim is a direction or a turning point
(RSP / SPY, SMH / SPY, the curve, credit, copper / gold, the Russell and Nasdaq rotation, MOVE / VIX) came back NULL or UNDERPOWERED. Six pairs have no
test: both NVDA ratios, gold / silver, BTC / gold, XLE / WTI and XLY / XLP (stubs below). The board draws all of them and says so.

## Pairs the educators use that the daily bundle cannot draw

Listed on the board too, never filled in:

| Pair | Said by | Why not | Closest thing on the board |
|---|---|---|---|
| HYG / IEF, HYG / LQD | Crown ("Credit spreads wide.") | The bundle holds credit as spreads, not the bond ETFs (Yahoo is refused from Railway; no vendor is added) | HY minus IG, CCC minus HY |
| IWM / SPY | Crown | The bundle holds the Russell 2000 and S&P 500 indices, not the ETFs | Russell / S&P |
| CRWV / SOXX | Crown (2026-11-15 clip) | CoreWeave is not in the 75-series bundle; SMH stands in for SOXX | NVDA / SMH, SMH / SPY |
| 3m10y | C.OG course text | No 3-month yield in the bundle. FRED's daily DTB3 would fill it with no new vendor | 10y minus 2y |
| SOFR minus IORB | C.OG course text | SOFR and IORB sit on the funding board and in the plumbing tests, not the daily bundle | funding board (Macro) |

## Untested educator claims: proposed preregistration stubs (NOT run)

Per `research-protocol` these need a register row and a prereg before anything is run. Prior art checked first (Evidence Book, forge/, CROWN_WATCH):
`rotation-extreme` NULL (Nasdaq against the Russell: the extreme extended in 45% of 140 cases, a coin) is the nearest result for every
relative-return-extreme claim below, so each carries a LOW prior.

1. **Leadership persistence, single names** (Crown, 2026-10-16: hyperscalers over semis "continues to the point no one can believe it"; Crown
   2026-11-15 NVDA / SMH, NVDA / SPY). Question: does a 60-session relative-return extreme (top decile) of NVDA over SMH (or over SPY) run on or
   revert over the next 20 sessions, against a mirrored placebo? Sample: only about 3 years of NVDA in the bundle (752 closes), so UNDERPOWERED
   by design; the long-history proxy is SMH over QQQ. Output: effect, interval, power, mirror.
2. **Energy shares against the barrel** (Crown: "Energy stocks diverging from barrels and distillate."). Question: after a 20-session XLE / WTI
   divergence of at least 2 sigma, does the gap close by the barrel catching up or by the shares falling, over the next 5 and 20 sessions? Both
   series have 1,506 closes. Control: the same divergence on the mirrored ratio.
3. **Gold / silver extremes** (Crown, Podcasts). Question: does a top- or bottom-decile gold / silver ratio mark a different next-20-session
   return in either metal? 1,548 closes (about 6 years: few independent extremes, so likely UNDERPOWERED). Control: matched volatility days.
4. **Bitcoin against gold** (Podcasts, Crown). Same shape as 3 with BTC / gold; low prior; descriptive only until a sample exists.
5. **Cyclicals against defensives** (course text). XLY / XLP extremes against the next 20 sessions of the index; 1,507 closes; low prior.
6. **Small caps front-run the Fed path** (Crown, 2026-10-31): already carded in CROWN_WATCH in both directions with the SOFR December contract and the
   Atlanta Fed odds; not repeated here.

None of these is a promise that anything will be found. The board shows each as "not tested here yet" until a verdict is banked in
`js/deskEvidence.js`, and the chip then changes by itself.

## The board (what shipped)

Insight tab, pill "Spreads & ratios" (`panel.insight.spreads`, a preview surface: the owner always sees it, the desk login only when switched on;
command `RATIOS [pair]`, for example `ratios rsp-spy` or `ratios curve`; the word `SPREADS` already opens the Macro credit-spreads board, so it was left alone):

1. Heat ladder: every pair ranked by how extreme its percentile is against its own history, with a glowing marker for now and fainter ticks for one
   week and one month ago, the window and n stated, "short record" and "stale" flagged, and each pair's Evidence Book chips.
2. Hero view (click a row): the line with its percentile bands, ghosts of the last month, the month before and a quarter ago rebased to the same
   start, the educator's quote next to our verdict ("what they said / what we found"), and a rule-built caption.
3. X-versus-Y picker: any two of the 75 series; X / Y, X minus Y rebased to 100, or X minus Y (yields and spreads only), over 1 / 3 / 6 years or all;
   z-score, correlation of daily moves (all and the last 60 sessions), a scatter with a glowing trail that plays through time with the shared replay
   player. A frame only uses points up to its own date.
4. Wall: the twelve most-mentioned pairs as small multiples.

Data: no new route. The board reads the daily market bundle the other Insight boards already share (`/api/drill-series`, about 0.8 MB, cached ten
minutes), so there is no extra egress and no new vendor. A pair whose legs are missing is listed with the reason.

## Wave 2 (2026-11-17): the other stories

Owner's question: "Do you know of any more which could tell a different story: trend, risk, strength, weakness, from analysis and general knowledge, which we should include?"
Method: take the candidate list from general market knowledge, check for each (a) the data we hold (the 75-series daily bundle, the FRED series, the derived
series), (b) the Evidence Book, and (c) which story it tells. Anything we can draw from held data went onto the board; anything we cannot is listed below with the
reason and the free source that would fill it.

### What changed on the board

1. **Seven stories, a Story filter and a "Stories now" strip.** Every pair carries a story (Risk appetite, Rates and policy, Currencies, Inflation and
   commodities, Liquidity and funding, Breadth and leadership, Macro and cross-asset). The ladder has a Story filter beside the group filter. A strip above the ladder
   shows the six most stretched readings across the stories (at most two from one story, never a stale pair), each with its Evidence Book chip or "not tested here", and says
   how many pairs sit in the outer tenth against how many chance alone would put there.
2. **A divergence hero.** Seven pairs are two related lines each measured as a z-score against its own trailing two years (never using a later close), and the line is the gap:
   the dollar against real yields, USD/JPY against the 10-year, gold against real yields (flipped, because they usually move opposite ways), the dollar against the VIX
   (the "dollar smile"), AUD against copper, CAD against oil, oil against breakevens, the S&P 500 against the VIX. The hero draws both lines with the gap shaded,
   then the gap line, then the ghosts, and says "the gap between X and Y is at the Nth percentile; right now X is N sigma higher or lower than Y would suggest".
3. **33 new pairs** (55 in all), all from data we hold. Three small additions make that possible:
   - `/api/spread-extras` (js/spreadExtrasRoutes.js): eight FRED series the bundle does not carry (DTB3, DFF, THREEFYTP10, SOFR, IORB, RRPONTSYD, WALCL, WDTGAL), read through
     the same keyless FRED CSV helper as the bundle, about 6.5 years each, held six hours in memory. If it fails the board still draws every pair that does not need it and says which it dropped.
   - `js/terminal/spreadsDerived.js`: series computed from the bundle (NZD/JPY, CHF/JPY, CAD in dollars, the S&P 500's 21-session realised vol and the VIX's premium over it,
     the 60-session stock-bond correlation) and net liquidity (balance sheet minus Treasury cash minus reverse repo). A weekly series counts from the day after its date and is never carried past its own cadence.
   - The picker now offers these series too (the 3-month bill, fed funds, term premium, SOFR and so on), so any two can be put against each other.

### The candidates, what we hold, what we have tested

Educators did not name these pairs in the stored notes (mentions 0): they come from general market knowledge. A verdict is shown only where one of our tests touched the
idea, and "nearest test only" means the test was of a related relationship, named on the chip, not of this pair.

| Story | Pair | Built from | Record | Tested here? | Evidence Book |
|---|---|---|---|---|---|
| Risk | XLI / XLU (xli / xlu) | bundle | 1,507 closes since 2020-11-16 | no | not tested |
| Risk | XLK / XLU (xlk / xlu) | bundle | 1,507 closes since 2020-11-16 | no | not tested |
| Risk | XLF / SPY (xlf / spy) | bundle | 1,507 closes since 2020-11-16 | nearest test only | credit-leads-equities: NULL |
| Breadth | XLK / SPY (xlk / spy) | bundle | 1,507 closes since 2020-11-16 | nearest test only | breadth-narrowing: NULL |
| Risk | BTC / NQ (btc / nq) | bundle | 1,548 closes since 2020-11-16 | no | not tested |
| Risk | SKEW (skew) | bundle | 1,505 closes since 2020-11-16 | no | not tested |
| Risk | VIX minus realised (vrp) | bundle (derived) | 1,519 closes since 2020-12-15 | nearest test only | vix-inversion: VALIDATED |
| Risk | VXN / VIX (vxn / vix) | bundle | 1,506 closes since 2020-11-16 | no | not tested |
| Risk | RVX / VIX (rvx / vix) | bundle | 1,506 closes since 2020-11-16 | no | not tested |
| Risk | Implied correlation (cor3m) | bundle | 1,505 closes since 2020-11-16 | no | not tested |
| Risk | NZD/JPY (nzdjpy) | bundle (derived) | 1,556 closes since 2020-11-16 | no | not tested |
| Risk | CHF/JPY (chfjpy) | bundle (derived) | 1,556 closes since 2020-11-16 | no | not tested |
| Rates | 10y minus 3m (us10y - dtb3) | bundle + FRED extras | 1,498 closes since 2020-11-16 | nearest test only | curve-inversion: NULL |
| Rates | 10y minus Fed funds (us10y - dff) | bundle + FRED extras | 1,498 closes since 2020-11-16 | no | not tested |
| Rates | 2y minus Fed funds (us2y - dff) | bundle + FRED extras | 1,498 closes since 2020-11-16 | no | not tested |
| Rates | 10y minus 5y (us10y - us5y) | bundle | 1,498 closes since 2020-11-16 | nearest test only | rates-spread-asset-lead: NULL |
| Rates | 30y minus 10y (us30y - us10y) | bundle | 1,498 closes since 2020-11-16 | nearest test only | rates-spread-asset-lead: NULL |
| Rates | Term premium (tp10) | bundle + FRED extras | 1,581 closes since 2020-11-16 | no | not tested |
| Liquidity | SOFR minus IORB (sofr - iorb) | bundle + FRED extras | 1,400 closes since 2021-07-29 | nearest test only | funding-stress: NULL; repo-stress-range: CONTEXT |
| Liquidity | Reverse repo (rrp) | bundle + FRED extras | 1,582 closes since 2020-11-16 | nearest test only | funding-stress: NULL |
| Liquidity | Net liquidity (netliq) | bundle + FRED extras | 1,582 closes since 2020-11-16 | no | not tested |
| Inflation | Brent minus WTI (brent - oil) | bundle | 1,548 closes since 2020-11-16 | no | not tested |
| Inflation | Gold / WTI (gold / oil) | bundle | 1,548 closes since 2020-11-16 | no | not tested |
| Inflation | Platinum / gold (platinum / gold) | bundle | 1,530 closes since 2020-11-16 | no | not tested |
| Macro | Stock-bond correlation (sbcorr) | bundle (derived) | 1,438 closes since 2021-02-12 | nearest test only | stock-bond-flip: CONTEXT |
| FX | Dollar vs real yields (dxy vs tips) | bundle | 987 closes since 2022-11-25, short | no | not tested |
| FX | USD/JPY vs the 10-year (usdjpy vs us10y) | bundle | 995 closes since 2022-11-18, short | no | not tested |
| Inflation | Gold vs real yields (gold vs tips) | bundle | 992 closes since 2022-11-21, short | nearest test only | relationship-map: UNDERPOWERED |
| FX | Dollar vs the VIX (dxy vs vix) | bundle | 984 closes since 2022-11-28, short | no | not tested |
| FX | AUD vs copper (audusd vs copper) | bundle | 1,045 closes since 2022-10-27 | nearest test only | relationship-map: UNDERPOWERED |
| FX | CAD vs oil (cadusd vs oil) | bundle (derived) | 1,045 closes since 2022-10-27 | nearest test only | relationship-map: UNDERPOWERED |
| Inflation | Oil vs breakevens (oil vs bei) | bundle | 993 closes since 2022-11-21, short | no | not tested |
| Risk | S&P 500 vs the VIX (spx vs vix) | bundle | 1,036 closes since 2022-11-09 | nearest test only | relationship-map: UNDERPOWERED |


What the table says: none of the 33 has a validated direction finding. Where a test is on file it is a NULL or UNDERPOWERED of a neighbouring idea (the curve, credit leading equities,
narrow breadth, funding stress), and the one VALIDATED family on the board is still the vol-curve ratios (size and range, not direction). The new pairs are therefore described as state:
where each sits in its own record, how stretched it is, and how it moved over the last month.

### Untested pairs we can draw: proposed preregistration stubs (NOT run, no register row claimed)

Written in C.OG's register (construct, condition on extremes, sweep horizons, noise threshold, distribution against a benchmark, control). A register row is claimed only when someone
decides to run one.

### XLI / XLU (xli-xlu)
- **Question:** when XLI / XLU sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (xli / xlu); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 38 independent episodes per tail on 1,507 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### XLK / XLU (xlk-xlu)
- **Question:** when XLK / XLU sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (xlk / xlu); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 38 independent episodes per tail on 1,507 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### XLF / SPY (xlf-spy)
- **Question:** when XLF / SPY sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (xlf / spy); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: credit-leads-equities.
- **Power note:** about 38 independent episodes per tail on 1,507 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### XLK / SPY (xlk-spy)
- **Question:** when XLK / SPY sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (xlk / spy); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: breadth-narrowing.
- **Power note:** about 38 independent episodes per tail on 1,507 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### BTC / NQ (btc-nq)
- **Question:** when BTC / NQ sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (btc / nq); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 39 independent episodes per tail on 1,548 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### SKEW (skew)
- **Question:** when SKEW sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (skew); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 38 independent episodes per tail on 1,505 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### VIX minus realised (vrp)
- **Question:** when VIX minus realised sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (vrp); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: vix-inversion.
- **Power note:** about 38 independent episodes per tail on 1,519 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### VXN / VIX (vxn-vix)
- **Question:** when VXN / VIX sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (vxn / vix); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 38 independent episodes per tail on 1,506 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### RVX / VIX (rvx-vix)
- **Question:** when RVX / VIX sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (rvx / vix); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 38 independent episodes per tail on 1,506 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Implied correlation (cor3m)
- **Question:** when Implied correlation sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (cor3m); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 38 independent episodes per tail on 1,505 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### NZD/JPY (nzdjpy)
- **Question:** when NZD/JPY sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (nzdjpy); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 39 independent episodes per tail on 1,556 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### CHF/JPY (chfjpy)
- **Question:** when CHF/JPY sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (chfjpy); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 39 independent episodes per tail on 1,556 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### 10y minus 3m (y3m10y)
- **Question:** when 10y minus 3m sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (us10y - dtb3); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: curve-inversion.
- **Power note:** about 37 independent episodes per tail on 1,498 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### 10y minus Fed funds (y10-dff)
- **Question:** when 10y minus Fed funds sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (us10y - dff); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 37 independent episodes per tail on 1,498 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### 2y minus Fed funds (y2-dff)
- **Question:** when 2y minus Fed funds sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (us2y - dff); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 37 independent episodes per tail on 1,498 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### 10y minus 5y (curve-10s5s)
- **Question:** when 10y minus 5y sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (us10y - us5y); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: rates-spread-asset-lead.
- **Power note:** about 37 independent episodes per tail on 1,498 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### 30y minus 10y (curve-30s10s)
- **Question:** when 30y minus 10y sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (us30y - us10y); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: rates-spread-asset-lead.
- **Power note:** about 37 independent episodes per tail on 1,498 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Term premium (tp10)
- **Question:** when Term premium sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (tp10); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 40 independent episodes per tail on 1,581 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Net liquidity (netliq)
- **Question:** when Net liquidity sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (netliq); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 40 independent episodes per tail on 1,582 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Brent minus WTI (brent-wti)
- **Question:** when Brent minus WTI sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (brent - oil); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 39 independent episodes per tail on 1,548 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Gold / WTI (gold-oil)
- **Question:** when Gold / WTI sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (gold / oil); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 39 independent episodes per tail on 1,548 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Platinum / gold (plat-gold)
- **Question:** when Platinum / gold sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the line different from a matched placebo?
- **Construct:** the line exactly as the board draws it (platinum / gold); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 38 independent episodes per tail on 1,530 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Dollar vs real yields (dx-dxy-tips)
- **Question:** when the gap between the dollar and US real yields sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the dollar different from a matched placebo?
- **Construct:** the line exactly as the board draws it (dxy vs tips, each leg a z-score against its own trailing 504 closes, sign 1); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 25 independent episodes per tail on 987 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### USD/JPY vs the 10-year (dx-usdjpy-10y)
- **Question:** when the gap between USD/JPY and the US 10-year yield sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in USD/JPY different from a matched placebo?
- **Construct:** the line exactly as the board draws it (usdjpy vs us10y, each leg a z-score against its own trailing 504 closes, sign 1); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 25 independent episodes per tail on 995 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Dollar vs the VIX (dx-dxy-vix)
- **Question:** when the gap between the dollar and the VIX sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in the dollar different from a matched placebo?
- **Construct:** the line exactly as the board draws it (dxy vs vix, each leg a z-score against its own trailing 504 closes, sign 1); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 25 independent episodes per tail on 984 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### Oil vs breakevens (dx-oil-bei)
- **Question:** when the gap between oil and 10-year breakeven inflation sits in the outer tenth of its own trailing record, is the next-session range wider or narrower than on an ordinary day, and is the next 5 to 20 sessions' move in oil different from a matched placebo?
- **Construct:** the line exactly as the board draws it (oil vs bei, each leg a z-score against its own trailing 504 closes, sign 1); percentile against its own trailing 504 sessions, so nothing after a date is used on that date.
- **Condition and horizons:** top and bottom decile, episodes de-clustered at 20 sessions; horizons 1, 5, 10, 20 sessions. Primary outcome is RANGE (validated findings on this desk are about size, not direction); direction is secondary and carries the direction bar's minimum detectable effect.
- **Noise threshold and benchmark:** the unconditional distribution on the same dates, a shuffled-date null (200 draws) and a mirror placebo (the same distance below the median). Control: the general tests mv-extreme-forward and mv-dislocation-forward.
- **Power note:** about 25 independent episodes per tail on 993 closes, so a pre-registered minimum effect near 0.6 to 0.8 sigma; expect UNDERPOWERED by design unless the record is longer. Not claimed, not run.

### What we cannot draw, and what would fill it

| Candidate | Why we cannot draw it, and what would fill it |
|---|---|
| High-yield bonds vs Treasuries (HYG / IEF, HYG / LQD) | The bundle holds credit as spreads (HY, IG, CCC), not the bond ETFs. The HY minus IG and CCC minus HY rows are the closest. |
| Small vs large caps as the ETFs (IWM / SPY) | The bundle holds the Russell 2000 and S&P 500 indices, not the ETFs. The ratio of the indices is the closest and is on the board. |
| CoreWeave vs the chip ETF (CRWV / SOXX) | CoreWeave is not in the 75-series bundle, and SOXX is stood in for by SMH. Adding one name would need a new series. |
| High beta vs low volatility shares (SPHB / SPLV) | Neither ETF is in the daily bundle. The closest held reads are industrials over utilities (XLI / XLU) and technology over utilities (XLK / XLU), both on the board. |
| Regional banks vs the market (KRE / SPY) | The regional-bank ETF is not in the bundle. Financials over the S&P 500 (XLF / SPY) is the closest and is on the board. |
| Emerging vs developed markets (EEM / SPY) | No emerging-market equity ETF is in the bundle. The live layer draws EM gauges, but only as today's readings, not a daily history. |
| Transports vs industrials (Dow theory) | No transport index or ETF is in the daily bundle, so the Dow-theory pair cannot be drawn. |
| The put / call ratio | No put / call series is held. Whether a free current daily history exists is UNVERIFIED, so none is wired. |
| US vs German, Japanese and UK 10-year yields (UST minus Bund, JGB, gilt) | The bundle holds only US yields. The global yields board shows the latest levels but not a daily history. The ECB data portal publishes euro-area government yield curves daily and free (UNVERIFIED for this repo), which could fill the Bund leg. |
| EUR/USD against the rate gap, and the priced Fed minus the priced ECB | The rate gap needs a euro rate series, which the bundle does not hold. The priced ECB and Fed paths are stored as the latest strip with one-day to four-week lookbacks, not a long history. |
| The data-surprise index against rates | The surprise index is stored as a country scorecard and an event record, not as a daily series in the bundle. |
| Credit impulse (the change in bank credit) | BIS bank credit is quarterly, so it is on the Bank credit pill and the BIS heat strip, not as a daily line on this board. |
| Share of stocks above their 200-day average, and new highs minus new lows | These need every member of the index, and the bundle holds the index and a few sector ETFs, not the members. No free daily source for them is wired. |
| NOK against Brent | USD/NOK is not in the bundle. OANDA carries it, so a series could be added without a new vendor. |
| A carry basket (high-yield against low-yield currencies) | It needs a policy-rate history for each currency, which the bundle does not hold. AUD/JPY and NZD/JPY on the board are the nearest stand-ins. |
| The cross-currency basis | The basis feed is laptop-fed and has weeks of history, too short to rank against its own past. |

Free sources named above are leads, not verified: the ECB data portal's yield curves are UNVERIFIED for this repo, and the Cboe put / call archive is UNVERIFIED.

## What is unverified

- The raw transcripts (ReelScribe/R2) were not mined; the counts are from the stored notes and course text.
- The board was checked in a headless browser as a stand-in owner against the live bundle; not on a real login, a phone, or the Amber, Green console,
  Colour-blind and High-contrast themes.
- The percentile windows are the bundle's own (about six years, shorter for the credit pairs and for single names); a longer record would move them.
- Wave 2: the 33 new pairs and the divergence heroes were checked in a headless browser as a stand-in owner against the live bundle, with `/api/spread-extras` answered locally from FRED
  (it is not deployed yet); not on a real login or a phone, and not in the Amber, Green console, Colour-blind and High-contrast themes. Whether Railway's address is accepted by FRED
  for the eight extra series is not tested (the bundle already reads FRED from Railway, so it should be).
- A weekly series (balance sheet, Treasury cash) is lagged by one extra day for point-in-time safety; the exact release time of each H.4.1 table was not checked.
- The divergence z-scores use a trailing 504-session window; a different window would move the percentiles.
