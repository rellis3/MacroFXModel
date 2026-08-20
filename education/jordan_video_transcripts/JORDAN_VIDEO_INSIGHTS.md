# Jordan Video Transcript Insights — Running Log

## Purpose

Jordan (CT) posts live-trading recordings, and other members of the same
group (Mr C's / C.org quant-and-macro section — "Husky", "Max", etc.) post
their own. Watching every video end-to-end (~8h each) to extract a system
isn't practical, so this file is a standing target: paste a transcript into
the chat, and each pass gets logged here as a new entry under **Video
Log**, with anything new rolled up into **Theme Index** and, once there's
enough to test, into **Research Backlog**. Repeated ideas across videos are
*not* re-listed — they get a citation added to the existing Theme Index
entry instead, which is itself a signal (repetition = core to how the group
actually trades, not a one-off aside). **Who said it matters** — always
tag each Theme Index / Video Log entry with the speaker, since "Jordan's
system" is the specific target but other members' methods are useful
context/comparison, not the same thing.

Per the user: ignore which pair/instrument a video happens to use as its
example — capture the idea and the way it's traded, not the specific
symbol.

This complements the existing image-based reconstruction of Jordan's
system already in this repo:
- `vumanchuLab/jordan_rule.py`, `vumanchuLab/FINDINGS.md` — VuManChu Cipher B
  ("yellow line" = wt1-wt2) multi-timeframe alignment work
- `education/jordan_impulse_range_backtest/` — impulse range, VWAP entry
  band, liquidity sweep filter, MAE dynamic stop
- `education/jordan_trade_geometry/` — trade geometry + VuManChu gate

Nothing below is confirmed or backtested by default — this is a capture
layer for hypotheses. "Confidence" is about how clearly/repeatedly Jordan
stated it, not whether it works.

---

## ⭐ Priority Watch: Bollinger-style band

Flagged before any transcript was reviewed: a screenshot Jordan left in a
message by mistake (`New test`, MGC1! gold chart, 02:53) shows a shaded
green/red band overlay around price with a horizontal level break at
~4,464.9, distinct from the VuManChu panes already mapped. This looks like
a volatility/mean-reversion band (Bollinger-style envelope, possibly a
custom multiple of stdev, or a keltner/donchian variant) that hasn't shown
up in prior image-based reconstruction. When transcripts mention *any* of:
"bands", "envelope", "standard deviation", "squeeze", "upper/lower band",
"mean reversion to the band", "band walk" — log it here first, verbatim
where possible (his exact wording on period/multiplier/timeframe matters
more than paraphrase).

**Status: earlier hypothesis ruled out by the user — reopened.** Transcript
1 had no literal "Bollinger"/"band"/"standard deviation" mention, so the
range/volatility forecasting tool (see Theme Index) was floated as a
possible match, since it's a pasted-indicator envelope drawn from
high-to-low median / close median stats. **The user has since corrected
this**: the group's range/volatility tool sets **fixed levels for the
whole day** — effectively marking exhaustion points of that day's expected
volatility, recomputed once per session. **Jordan's own posted band is
different: dynamic and intraday, scalping-style** — i.e. it updates/moves
*within* the session as price develops, not a static once-a-day envelope.
That rules the forecasting tool out as the source of the screenshot band.

So the target is now more specific: look for a chart tool that **recomputes
continuously on a lower timeframe** (band walls move candle-to-candle or
close-to-close, not fixed at session open) and is used for **scalping
entries/exits intraday** — much closer to a textbook rolling Bollinger Band
(N-period SMA ± k·stdev, recalculated every bar) than the daily
expected-range tool. Neither transcript so far has covered this — both
have been the daily/weekly markup format, not Jordan's own live scalping
footage. **Next transcripts should specifically be searched for**: a
recording of Jordan trading (not the group's daily markup call), any
mention of a band/channel that "walks" with price, mean reversion to a
moving band edge, or band width/squeeze commentary on a fast (1-5m) chart.

---

## Theme Index

_Deduplicated ideas, updated as transcripts come in. Each entry: **what was
said**, who said it, confidence (low/med/high — based on repetition +
specificity, not correctness), and which videos support it._

### Dynamic structure-trailing stop (no fixed R/TP)
**Speaker: Husky** (his own personal method, explicitly not "the system").
Confidence: med.
Don't set a fixed take-profit or fixed risk:reward. After entry, leave the
stop where it is until price prints a swing point in your favor (e.g. on a
buy: a higher-low), then move the stop to just under that new swing low.
Repeat as new higher-highs/higher-lows form — the stop only ever ratchets
in your favor, upside is never capped. Rationale given: "the market doesn't
know where you got in, doesn't know where your stop is, doesn't care" —
fixed-R exits are arbitrary relative to actual market structure. Worked
timeframe example given: 15m chart.
**Videos:** 1.

### Range/volatility forecasting tool — expected-move framing, not direction
**Speaker: Husky**, describing a group-wide tool (posted nightly for the
next day). Confidence: high (core, repeatedly emphasized).
Levels are generated from a fixed set of statistics — "high-to-low median"
and "close median" are the two named so far — pasted into an indicator that
marks them on the chart per-asset (gold, EURUSD, NQ named). The point isn't
"magic support/resistance," it's reframing a trading day in terms of
*expected movement/volatility* rather than a directional guess. Levels are
fixed once drawn for the day — not redrawn when a new high/low forms
(explicitly called out as removing emotion/discretion). A walkthrough video
of this tool exists in the group's "additional materials" but wasn't
itself transcribed here.
**Videos:** 1.

### Range extension methodology (weekly + daily variants)
**Speaker: Husky**, describes his own live-stream markup process.
Confidence: high.
Two variants: (1) **weekly range extensions** on the **15m** chart,
recomputed/reviewed Tuesdays; (2) **daily range extensions** built from the
**Asia session range**, plotted on the **5m** chart, reviewed Thursdays.
Same underlying approach at two different scales. Once drawn, levels are
fixed for the period (again: no redrawing on new highs/lows — this is
stated as a deliberate discretion-removal mechanism, appears twice).
Common target use: **50% (midpoint) of the day's range so far** as a
partial-TP / final-TP area, not just the range edges.
**Videos:** 1.

### Mean reversion across multiple timeframes, sparse levels, wait-to-invalidate entry style
**Speaker: Husky**, personal execution style. Confidence: med.
"I'm trading mainly mean reversion on different time frames... I look for
reasons *not* to trade them rather than reasons to trade them... very
selective with my levels, there's never that many of them." Execution:
limit orders left resting at pre-marked levels from the morning markup, no
confirmation indicator required at entry; orders are pulled (not held) in
two situations — (a) ahead of high-impact news (e.g. NFP), (b) when a large
momentum candle is driving hard into the resting limit.
**Videos:** 1.

### VWAP used as context/frame, not as a level source
**Speaker: Husky**. Confidence: low-med (explicitly says this isn't his
main tool, but describes it in some detail when asked).
Doesn't use VWAP as confluence for marking levels. Uses it to "frame" the
session: e.g. a sharp news/geopolitical spike tends to see price settle
back toward VWAP afterward. Also explains price/VWAP divergence generically
(price falling while VWAP — a proxy for volume-weighted interest — is
rising implies more resting interest above current price, i.e. reversion
pressure), but flags this kind of discretionary divergence read as
unreliable/mood-dependent — "your interpretation of it can be very subject
to how you're feeling in the moment." Distinct from VuManChu Cipher B's
"VWAP" line already modeled in `vumanchuLab/` (wt1-wt2) — this is closer to
literal price-vs-VWAP.
**Videos:** 1.

### ENQ system — staged validation gates before entry
**Speaker: Husky**, describing a live-deployed group system (not Jordan's
personal system — a shared, non-signal "watch how a real quant system
behaves" feed). Confidence: high on the mechanics as described, though the
underlying logic is explicitly a black box to the group ("impossible" to
reverse-engineer, per Husky).
Entries progress through **data threshold 1 → 2 → 3** gates before an order
fires; threshold 1 can validate/invalidate each morning, threshold 2 is
"the final threshold before entry" and yields two possible entry profiles:
- **Standard**: stop distance = 0.44% of entry price, max account risk = 2.2%.
- **Conservative**: same logic, tighter stop / lower risk (exact numbers
  not given). Consensus in the room: standard is the better-performing
  variant; conservative exists mainly for account types with fixed
  per-trade risk caps.
Trade frequency: ~1.1 positions/week on average. A second system is
reportedly being built on top of the range/volatility forecasting tool
(not detailed yet).
**Videos:** 1.

### Macro/flow framework — yields, spreads, "money flows where it's treated best"
**Speaker: Husky**, foundational framework content (attributed to the
group's macro teaching generally, not personal). Confidence: high
(explicitly core curriculum, stated as the reason technical-only trading is
limited).
Bond price and yield move inversely. What matters for flow isn't the
absolute yield level but (a) the **spread** between two assets' yields and
(b) the **rate of change of that spread** — a symmetric move in both
legs' yields still shifts relative attractiveness if the *gap* narrows or
widens. General framing: analyze **spreads and rates of change**, not
absolute values; look across correlated assets (treasuries/credit/
commodities/equities) each morning to build a directional bias rather than
reading one chart in isolation. Liquidity is reframed as "the free
movement of cash inside big banks/institutions" (capacity/need to
sell-one-thing-to-buy-another), not just a stop-hunt zone above/below a
candle.
**Videos:** 1.

### Session structure / volatility persistence
**Speaker: Husky**, general framework point. Confidence: med.
Volatility tends to persist within a trading day: a large move in the Asia
session tends to be followed by continued large moves through the rest of
the day (not guaranteed). Implies session range/timing could be used as a
same-day forward-looking feature, separate from the fixed daily/weekly
range-extension levels above.
**Videos:** 1, 2 (repeated — used explicitly in v2 to justify picking a
*further-away* level: "given yesterday's volatility... we see volatility
clustering, so if we have high volatility we're likely to see further high
volatility... it feels better to predict we'll see more of that and go for
a level that's a little further away." First time the persistence idea is
tied to a concrete level-selection rule, not just a general observation.)

### Level-flip-and-retest after an impulse move
**Speaker: host of transcript 2** (live weekly/daily markup call — format
matches what transcript 1 described as Husky's Tuesday/Thursday routine;
not confirmed by name in this transcript, and Jordan is again a chat
participant being addressed, not the presenter). Confidence: med.
"A big impulse move through a level often can flip the level, and you can
look for continuation on the retest of that level." Classic broken-level
role-reversal, but stated as a specific rule-of-thumb applied to their own
range-extension levels (a level that gets blown through decisively becomes
support/resistance in the new direction; wait for price to come back and
retest it as an entry, not enter on the initial break).
**Videos:** 2.

### Range-extension multiples off the Asia session range
**Speaker: host of transcript 2.** Confidence: high (stated with specific
numbers, repeated as a personal preference).
The daily range-extension levels aren't just Fib-style ratios — they're
literal **multiples of the Asia session's own range, projected beyond it**:
"two is a 100% extension away from the Asia range — if you copied and
pasted this Asia range and then put it below, that's going to be the
level." Named multiples in use: **1.5, 2, 2.75** (host says 1.5 and 2 are
personal favorites). Golden pocket (Fib 0.618–0.65) is used as separate
confluence, pulled from a 1H-context Fibonacci retracement, cross-checked
against these extension levels to narrow down which one(s) to keep — the
process explicitly discards levels that cluster too close together ("we
don't want three levels, especially not that close together"), aiming for
1-2 final levels per side.
**Videos:** 2. Relevant to the Asia-range work already noted for
`education/jordan_impulse_range_backtest/` — check for overlap/consistency
with the extension ratios already tested there before adding these.

### Close median as a magnet / "predicted close" level
**Speaker: host of transcript 2.** Confidence: med.
The close-median level from the volatility/range tool is explicitly framed
as "where we predict price to close at the end of the day" — so an entry
level positioned *beyond* the close median (i.e., price would have to
revert back through the close median to reach a typical/expected close) is
called out as attractive, since reversion to a session's expected close is
a plausible, testable pull independent of the specific S/R level chosen.
**Videos:** 2.

### Volatility overlay used as a filter, not a crutch
**Speaker: host of transcript 2.** Confidence: med.
Deliberate workflow discipline: turn the volatility/range overlay ON only
long enough to find/confirm candidate levels, then turn it OFF and use it
"as confluence when needed" for the rest of the session rather than leaving
it visible — stated reason is to avoid over-relying on it as the sole
source of levels. Relevant less as a signal and more as a note on how
discretion is deliberately bounded in their process.
**Videos:** 2.

### VWAP session-transition reversion (London → New York)
**Speaker: host of transcript 2**, describing their own preference (calls
VWAP "one of the few technical indicators I am actually a fan of").
Confidence: med — stated as a personal pattern, not the group system, but
specific and repeatable.
After a decent directional move during the **London session**, look for
price to move back toward VWAP as the market transitions into the
**first 3-4 hours of New York**. Also demonstrated live on a 3-minute
chart: price crossing above/below VWAP and repeatedly "tapping" it —
implying VWAP acts as a magnet/pivot on lower timeframes intraday, distinct
from the VuManChu Cipher B "VWAP" (wt1-wt2) already modeled in
`vumanchuLab/`. This is a literal price-vs-session-VWAP read.
**Videos:** 2 (new — session-transition-specific version of the general
"VWAP as context" theme from video 1).

### Prop-firm account pacing discipline (avoid tilt after passing a phase)
**Speaker: host of transcript 2.** Confidence: med — stated as personal
practice/advice, not a hard rule.
After passing a prop-firm evaluation phase (or the funded phase), wait a
couple of days before trading the next phase / the live funded account.
Rationale: excitement/urgency right after passing raises the odds of
revenge-trading a loss ("I've lost my first trade, let me win one now...
before you know it you might eat yourself"). A psychological/risk
discipline point rather than a chart rule, but relevant to any
paper-trading-to-live deployment protocol this repo might formalize.
**Videos:** 2.

### Cross-asset macro dashboard — yields, yield spread, VIX
**Speaker: host of transcript 2**, extends the "money flows where it's
treated best" framework from video 1 with concrete instruments. Confidence:
high (specific, demonstrated live on TradingView).
- **US10Y − EU10Y yield spread**, watched as a single chart/series (not two
  separate yield lines) — rising spread = more flow toward USD/US bonds,
  falling spread = flow rotating toward EUR/EU bonds; explicitly the *rate
  of change* of the spread is the tradeable signal, not its level.
- **Gold vs. yields**: reinforced as generally inverse (gold pays no yield,
  so rising "safe" yields competes with it for allocation).
- **VIX** as a directly tradable volatility instrument (not available on
  most prop firms, but on most live accounts) — can be used as a pure
  volatility-magnitude bet uncorrelated to direction (e.g. long VIX into a
  scheduled event like FOMC). Also floated as a **potential leading
  indicator**: shown spiking ~20 minutes before FOMC in the live example,
  i.e. positioning/hedging ahead of an event may show up in VIX before the
  event itself. ATR namechecked as the already-used stop-sizing analog to
  VIX's broader-market volatility read.
- **"Fund bias"** — a named process/tool used by "Max" that aggregates this
  cross-asset macro reading into a single bias, mentioned but not detailed.
  Flag for a future transcript: worth understanding its actual inputs if it
  comes up again.
**Videos:** 2.

---

## Research Backlog

_Ideas judged worth a real backtest, promoted from the Theme Index once
they're concrete enough to test (specific indicator, parameters, entry/exit
logic). Links to a script/dir once work starts._

- **Dynamic structure-trailing stop vs. fixed-R exit.** Concrete and
  testable: on any existing entry model in this repo, A/B a "trail stop to
  last swing point once structure prints" exit against the current fixed-R
  or fixed-% exit and compare expectancy/drawdown. Cheapest of the ideas
  above to test since it only touches exit logic, not signal generation.
- **Range-extension midpoint (50%) as a TP target**, tested against using
  the full range edge — may already be partially covered by
  `education/jordan_impulse_range_backtest/`; check for overlap before
  building new.
- **ENQ threshold-gate mechanics (0.44% stop / 2.2% risk, standard vs.
  conservative)** are numbers, not a discoverable entry signal (the gates
  themselves are black-box) — not backtestable as a strategy, but worth
  keeping as a reference risk-sizing convention if useful elsewhere.
- **VWAP reversion, London → New York transition.** Concrete and testable:
  after a directional London-session move, measure how often/how far price
  reverts toward session VWAP in the first 3-4 hours of New York. Cheap to
  test against existing OHLC data, no new indicator needed.
- **Asia-range extension multiples (1.5, 2, 2.75) as level generator.**
  Check first against whatever `education/jordan_impulse_range_backtest/`
  already tests — if the ratios there differ from 1.5/2/2.75, that's worth
  reconciling before building a second version of the same idea.
- **Level-flip-and-retest after impulse break.** Testable as a standalone
  rule: does a decisively broken range-extension/weekly level perform
  better as a retest entry than as a breakout entry?

---

## Video Log

_One entry per transcript pasted. Keep it short — this is an index, not a
transcript archive. New info only; if a video just repeats an existing
Theme Index item, note it as a repeat with a one-line pointer, don't
re-explain it._

<!--
Template for each entry:

### [YYYY-MM-DD or video title/ID] — <short label>

**New:**
- idea — one line, plus why it's interesting / what it implies for the model

**Repeats (already in Theme Index):**
- theme name — nothing new added

**Bollinger/band mentions:** none | <quote/paraphrase>

**Worth researching:** yes/no — why
-->

### Transcript 1 — Husky's Q&M induction call

**Speaker: Husky** (not Jordan — this is the group's induction/onboarding
call for the quant-and-macro section; Jordan is mentioned only in passing
as a fellow member, no direct Jordan trading footage here).

**New:**
- Dynamic structure-trailing stop (no fixed R/TP) — Husky's personal exit method
- Range/volatility forecasting tool — expected-move framing (high-to-low
  median, close median levels, posted nightly)
- Weekly (15m) vs daily (5m, Asia-range-based) range extension methodology,
  midpoint-of-range as a common target
- Mean reversion across multiple timeframes, sparse/selective levels,
  resting-limit entries with no confirmation indicator
- VWAP used only as session context, not a level source
- ENQ system: staged threshold-1/2/3 entry gates, standard vs conservative
  risk profiles (0.44% stop / 2.2% risk for standard), ~1.1 trades/week
- Macro/flow framework: yield spreads + rate-of-change-of-spread over
  absolute yield levels; liquidity reframed as bank/institutional cash
  flow, not just stop-hunt zones
- Session volatility persistence (big Asia move → likely continued big
  moves through the day)

**Repeats:** n/a (first transcript)

**Bollinger/band mentions:** none. No mention of bands, envelopes, stdev,
squeeze, or anything matching the priority-watch screenshot.

**Worth researching:** yes — the structure-trailing stop is the most
concrete, cheapest-to-test idea here (pure exit-logic change, plug into an
existing entry model). The macro spread/flow framework is more of a
feature-engineering direction (yield spread deltas as a regime/bias input)
than a standalone testable rule yet.

### Transcript 2 — live weekly/daily markup call (host not confirmed by
name; format matches transcript 1's described Tuesday/Thursday routine)

**Speaker note:** Jordan appears only as a chat participant this time too
(asked about his prop-firm account, a risk interview, etc.) — still not
Jordan's own trading footage. **User correction incorporated:** the daily
volatility/range tool covered here is confirmed NOT the source of Jordan's
band screenshot — see revised Priority Watch section above.

**New:**
- Level-flip-and-retest after an impulse move through a level
- Asia-range extension multiples (1.5, 2, 2.75) as the actual level
  generator, with golden-pocket Fib confluence used to narrow candidates
- Close median framed as "predicted close" — a magnet/reversion target
- Deliberate workflow discipline: volatility overlay ON only to find
  levels, then OFF for the rest of the session
- VWAP reversion specifically at the London→New York session transition,
  plus live example of price "tapping" VWAP repeatedly on a 3-minute chart
- Prop-firm pacing discipline: wait a couple of days after passing a phase
  before trading the next one, to avoid post-pass tilt
- Cross-asset macro dashboard made concrete: US10Y-EU10Y spread as a single
  series (rate-of-change is the signal), VIX as both a tradable volatility
  instrument and a possible leading indicator (spiked ~20min pre-FOMC in
  the live example), "fund bias" named as Max's aggregating tool (undetailed)

**Repeats (already in Theme Index, new detail added):**
- Session volatility persistence — now tied to a concrete rule (pick a
  further-away level after a high-volatility day)
- VWAP as context — this video adds the specific London→NY reversion
  pattern on top of the general "VWAP frames the session" point from video 1

**Bollinger/band mentions:** none directly, but this transcript is what
prompted the user to correct the Priority Watch hypothesis — the daily
range/volatility tool discussed here is now understood to be a *different*
tool from whatever Jordan's own band screenshot shows.

**Worth researching:** yes — the VWAP London→NY reversion pattern and the
Asia-range extension multiples are both concrete and cheap to backtest
against existing data. The level-flip-and-retest rule is a good candidate
to test against the existing range-extension backtests already in the repo.
