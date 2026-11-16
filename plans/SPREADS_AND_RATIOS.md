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
command `SPREADS [pair]`):

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

## What is unverified

- The raw transcripts (ReelScribe/R2) were not mined; the counts are from the stored notes and course text.
- The board was checked in a headless browser as a stand-in owner against the live bundle; not on a real login, a phone, or the Amber, Green console,
  Colour-blind and High-contrast themes.
- The percentile windows are the bundle's own (about six years, shorter for the credit pairs and for single names); a longer record would move them.
