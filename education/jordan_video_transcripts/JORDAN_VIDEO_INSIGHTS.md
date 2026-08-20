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

**Status: substantially resolved — direct screenshot evidence obtained.**
No transcript ever surfaced this (6 transcripts, all Husky, zero Jordan
trading footage), but the user then supplied ~16 screenshots Jordan
himself posted of his own tool under live iterative testing (`New test`,
`one more test`, `test complete, full tp @C.OG`, `updated`, `another
update`, `Full tp`, etc., spanning gold/MGC and NQ/MNQ, mostly on fast
intraday charts — `MNQ1! · 1` and `MNQ1! · 15` labels visible — timestamped
across a single day and again days later, consistent with rapid live
iteration, not a one-off). These are call-outs to `@C.OG` (the group
founder), i.e. Jordan reporting build/test progress on this tool directly
to leadership.

**What the tool visibly is, read off the screenshots themselves:**
- A **colored zone overlay** — green = price within the expected/normal
  range, red/maroon = price beyond it (an exhaustion zone) — split by a
  **horizontal boundary line**. Unlike a symmetric Bollinger Band, **the
  red zone flips sides**: red sits *above* the green zone when the setup
  is testing upside exhaustion, but *below* it when testing downside
  exhaustion (see the flipped-layout screenshot vs. the earlier ones) —
  i.e. it's directional/context-aware, not a fixed two-sided envelope.
- A **live statistics panel** (visible in two screenshots, both on NQ):
  a table headed `Session: <DAY>, August <D>` with rows **Live / Median /
  75th Pct**, all expressed as **H-L range as a % of price** — e.g. "Live
  0.87%, Median 1.7%, 75th Pct 2.1%" and later "Live 0.8%, Median 1.45%,
  75th Pct 1.75%". This is **the same underlying statistic as Husky's
  range/volatility forecasting tool** (median / 75th-percentile expected
  range) — just re-rendered as a **continuously-updating live comparison**
  instead of a fixed once-a-day line. This resolves the earlier confusion:
  it's not a *different* concept from the forecasting tool, it's the
  *same* statistical framework, personally rebuilt by Jordan to run live
  on a scalping timeframe instead of being fixed at session open.
- A **hover tooltip** on one screenshot reveals more precise fields: `H
  +0.08%`, `H-L: 0.12%`, `Δmed -1.57%`, `Δ75p -1.97%` — confirming the
  tool tracks the current bar's move, the running session H-L range, and
  **explicit deltas from the median and 75th-percentile benchmarks** (how
  far the current range is running below/above "normal"). This is a
  genuinely reproducible spec if this repo wanted to rebuild it.
- On-chart labels also include **"Close Med -0.7%"** and **"L -0.36%"** —
  confirms a close-median concept (matching Husky's tool) plus a live
  low-of-session % label, both rendered directly on the price chart, not
  just in the side panel.
- One later screenshot (`Ignoring the SL / the idea was right`) adds **two
  blue curved lines** that hug price like a moving-average pair or a
  basis+band-edge combination — the closest visual to a classic Bollinger
  look seen so far, but **not yet identified**: could be a fast/slow MA
  pair, could be one band edge plus its basis line. No period or type is
  readable from the screenshot. **Flag this specifically for the next
  round of material** — a transcript or clearer screenshot that names
  what these two lines are would close this out completely.
- A manually-drawn **diagonal dashed trend line** appears in several
  shots, connecting a swing low to recent price — this looks like Jordan's
  own manual annotation (trend context), not part of the indicator itself.

**Likely identity of this tool**: Husky mentions in transcript 1 ("there
is a system based on the uh forecasting port uh forecasting tool coming
out as well") and transcript 4 ("the forecasting tool system that the big
man is releasing soon") that a *new, second group system* is being built
on top of the range/volatility forecasting tool, distinct from the
existing ENQ system. **Working hypothesis: this is that system**, and
Jordan is one of the people building/testing it — which would also explain
why it's dynamic/live and scalping-oriented (a deployable system needs
live-updating levels, not levels fixed once at session open) and why nine
`@C.OG`-tagged test posts show up in a short window (active development,
reporting to the founder). Not confirmed, but consistent with everything
seen so far.

**What's still open**: the exact rule for which side gets colored red vs.
green (is it based on current position within the session range, a
directional bias input, or something else); the identity/parameters of
the two blue lines; and whether "Live/Median/75th Pct" uses the same
midnight-anchored session definition as Husky's tool or a different
(possibly rolling, not session-anchored) window — worth checking given
these examples are clearly intraday/live rather than fixed-at-open.

**Confirmed separately: the presenter across transcripts 2-6 is Husky**,
not Jordan — transcript 6 has a chat message read aloud referring to the
host as "Husky" in the third person, and the host responds in kind
("Husky did not say it's financial advice"). All 6 transcripts were
Husky's induction/markup/AMA content; this screenshot evidence is the
first direct look at Jordan's own work.

---

## Theme Index

_Deduplicated ideas, updated as transcripts come in. Each entry: **what was
said**, who said it, confidence (low/med/high — based on repetition +
specificity, not correctness), and which videos support it._

### Jordan's own live volatility-zone tool (in-development, tested on NQ/gold)
**Speaker/source: Jordan directly** — the first entry in this file sourced
from Jordan's own material rather than Husky's. Confidence: high on what's
visibly true from the screenshots, open on mechanics not visible in them.
See the Priority Watch section above for the full description — summarized
here for the index: a **live-updating** colored zone (green = within
expected range, red = beyond it, sides flip depending on which direction
is being tested) driven by a **Live / Median / 75th-percentile H-L range
%** statistics panel plus on-chart labels (`Close Med`, `L <pct>`) and
tooltip deltas (`Δmed`, `Δ75p`). Same underlying statistical concept as
Husky's range/volatility forecasting tool (median/75th-percentile expected
range), but implemented to **recompute continuously on a fast intraday
chart** (NQ/MNQ 1m and 15m charts seen; also tested on gold) rather than
being fixed once at session open — this is very likely why it looked
different enough from Husky's tool for the user to correct the earlier
hypothesis. Tested iteratively across ~16 screenshots tagged to `@C.OG`
(the group founder), consistent with active in-development status, and
plausibly the "system based on the forecasting tool" Husky mentioned (in
videos 1 and 4) as coming soon.
**Source:** direct screenshots from Jordan, not a transcript.

### Dynamic structure-trailing stop (no fixed R/TP)
**Speaker: Husky** — confirmed repeated as his standing personal method
across multiple videos, not a one-off. Confidence: med-high.
Don't set a fixed take-profit or fixed risk:reward. After entry, leave the
stop where it is until price prints a swing point in your favor (e.g. on a
buy: a higher-low), then move the stop to just under that new swing low.
Repeat as new higher-highs/higher-lows form — the stop only ever ratchets
in your favor, upside is never capped. Rationale given: "the market doesn't
know where you got in, doesn't know where your stop is, doesn't care" —
fixed-R exits are arbitrary relative to actual market structure. Worked
timeframe example given: 15m chart.

**Video 6, reconfirmed with more detail:** explicitly paired with the
ATR-based initial stop (see that entry) — "limiting the downside... via
the trailing stop, but I'm not limiting the upside." Also comes with a
cautionary anecdote: a position was once left running unattended through
an NFP release (an alert was set but news timing was forgotten), and it
worked out — but explicitly flagged as risky, not a recommendation, since
slippage through news could just as easily blow through the stop.
**Videos:** 1, 6.

### Range/volatility forecasting tool — expected-move framing, not direction
**Speaker: Husky**, describing a group-wide tool (posted nightly for the
next day, ~11pm, in the "forecasting tool case study" thread). Confidence:
high (core, repeatedly emphasized).
Levels are generated from statistics pasted into an indicator (access-code
gated, rotates periodically) that marks them on the chart per-asset (gold,
EURUSD, NQ named). The point isn't "magic support/resistance," it's
reframing a trading day in terms of *expected movement/volatility* rather
than a directional guess.

**Full breakdown of the five levels (video 4, new — this fills in what was
previously just "high-to-low median" / "close median"):**
- **Close median** and **close 75th (percentile)** — the **open-to-close**
  forecast: where price is expected to *close* by end of day, on a median
  day vs. a more-volatile (75th percentile) day. **Fixed all day**,
  anchored to the **midnight open** (same midnight anchor as the Asia
  range, and for the same reason — negate the opening gap). Mental model
  given: "think of that as the candle body" of a daily candle.
- **Projected high (median / 75th)** and **projected low** — the **full
  range** forecast (the day's expected high/low extremes), i.e. "the
  wicks" of a daily candle. **These are more dynamic**: the projected high
  is described as based on the *currently printed low* of the day (and
  vice versa) — so as a new session extreme prints, the opposite-side
  projection can shift, unlike the close levels. See the revised Priority
  Watch note above for why this still doesn't look like the screenshot
  band.

Explicitly used for **exhaustion/reversal reads** ("perfect reaction from
a close median"), and as **extra confluence** layered on top of range
extensions (a range-extension level that also lines up with a close-median
level is stronger) — but deliberately *not* used as the primary level
source, since "range extensions in themselves are a really useful tool and
can be used by themselves." A walkthrough video of this tool exists in the
group's "additional materials" but wasn't itself transcribed here.
**Videos:** 1, 4, 5 (5 shows it live: gold sat inside the close-median band
on a low-volatility Monday, ~1.09% range, used simply to characterize how
quiet the day had been rather than to enter/exit anything).

### Range extension methodology (weekly + daily variants)
**Speaker: Husky** (video 1) / **host of videos 2-3** (Tuesday weekly
markup call — same schedule Husky described, consistent presenter across
2-3, name still unconfirmed in-transcript). Confidence: high.
Two variants: (1) **weekly range extensions** on the **15m** chart,
recomputed/reviewed Tuesdays, anchored to the **Monday range**; (2) **daily
range extensions** built from the **Asia session range**, plotted on the
**5m** chart, reviewed Thursdays. Same underlying approach at two different
scales — both anchor to a fixed prior range and project multiples of its
width beyond the edges (see the range-extension-multiples entry below for
the exact formula). Once drawn, levels are fixed for the period (again: no
redrawing on new highs/lows — a deliberate discretion-removal mechanism,
repeated across videos). Common target use: **50% (midpoint) of the day's
range so far** as a partial-TP / final-TP area, not just the range edges.

**Anchor time matters (video 3, new):** the weekly/Monday range is measured
from **midnight**, not the instrument's official session/market open
(e.g. not 11:00) — explicitly to avoid contaminating the range with
**mark-to-open / rollover gaps**. If replicating this in a backtest, the
range window must use a fixed midnight-to-midnight (or midnight-to-now)
boundary, not exchange session times, or the levels won't match what's
being described.

**Volatility overlay scope (video 3, new):** the daily volatility/range
forecasting tool (the "high-to-low median" / "close median" one) is used
**only for daily levels** — explicitly *not* applied to weekly range
extensions, since "they're only valid till the end of the day." Keep that
distinction if trying to reproduce both processes.

**Full mechanical spec, from video 4's from-scratch walkthrough (new,
fills in exact reproducible detail):**
- Asia range defined as **midnight to 6:00am London time**, on the
  **5-minute chart**, using a named TradingView indicator ("Asian Range by
  Nico1948") to auto-draw it.
- Anchor point = **candle body** high/low within the range, never wicks
  ("the wick shows where price was rejected, so it's not the true range" —
  video 6).
- The Fibonacci tool is heavily reconfigured to output fixed extension
  ratios (not real Fib values) — settings are described as saved as a
  reusable chart template ("the Mr. C one").
- **Draw direction is irrelevant** for this fixed-range use (unlike a
  normal Fib retracement, which is directional low→high or high→low) —
  demonstrated explicitly in video 6: drawing the same range in either
  direction produces identical extension levels. A "magnet" tool exists to
  snap the anchor exactly to candle-body edges but isn't considered
  important on higher timeframes (video 6).
- Weekly variant: candle bodies on the **15-minute chart**, range =
  **current Monday vs. previous Monday**, each midnight-to-midnight
  (reconfirmed video 6). Can technically be done "anytime after midnight
  Monday" — done Tuesday morning by habit/cadence, not necessity.
**Videos:** 1, 3, 4, 6.

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

**Carry trade, concrete example (video 5, new):** USD/JPY specifically —
borrow cheap yen (low JPY rates), buy higher-yielding USD assets (bonds).
The **US-JPY rate spread** is described as "a clear driver of the pricing
we see in USD/JPY" (shown as a spread series correlated with the pair's
price). Unwind risk: a sharp JPY strengthening move rapidly erodes the
carry's benefit, so this is not risk-free despite looking like one on
paper.

**Regime-conditional gold bias tied to rate *direction*, not level (video
5, new, stated as a direct "if X then system does Y" example):** "if rates
are rising, it's probably a good idea to look at my system being short
gold; if rates are falling, it's probably a good idea for my system to be
long gold." Distinct from the spread-level framework above — this is
specifically about the *direction of change* in rates as a regime input
for a gold system's bias.
**Videos:** 1, 5.

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

### Range-extension multiples — formula now confirmed
**Speaker: host of transcripts 2-3.** Confidence: high (stated with
specific numbers across two videos, formula is now fully derivable).
The range-extension levels aren't Fib-style ratios of a swing — they're
literal **multiples of a reference range's own width, projected beyond its
edge**, where the reference range is the Asia session range for daily
levels or the Monday range for weekly levels (see methodology entry
above). Two independent confirmations give the same formula:
- Video 2: "two is a 100% extension away from the Asia range — if you
  copied and pasted this Asia range and put it below, that's the level."
- Video 3: "1.5, moving below Monday's range — 50% extension beyond it."

So **extension multiple N → level = range_edge ± (N−1) × range_width**.
Named multiples in use: **1.25, 1.5, 2, 2.75, 3.5, 4.5** across the two
videos (1.5 and 2 called out as personal favorites). Golden pocket (Fib
0.618–0.65) is used as separate confluence — pulled from a swing high/low
on a *higher* timeframe (1H for daily levels, 4H for weekly, see the
swing-selection entry below) — cross-checked against these extension
levels to narrow down which to keep. Levels that cluster too close together
are explicitly discarded/merged (see confluence-clustering entry below),
aiming for roughly 1-3 final levels per side, and it's stated as fine to
end up with **zero** levels on a side rather than force one.
**Videos:** 2, 3. Relevant to the Asia-range work already noted for
`education/jordan_impulse_range_backtest/` — check for overlap/consistency
with the extension ratios already tested there before adding these; the
formula above is concrete enough to implement directly.

### Confluence clustering / merge-nearby-levels threshold
**Speaker: Husky.** Confidence: high now — multiple concrete numbers given
across instruments and timeframes, plus an explicit adaptive-tightening
rule.
When multiple candidate levels (from range extensions, fibs, and the daily
volatility overlay) land close together, they're treated as **confluent
and merged into one** rather than kept as separate levels. Default
thresholds given (video 3, 4, 6):
- **Gold:** $5 (daily), $7.5 (weekly)
- **EU:** 2 pips (daily), ~3-3.5 pips (weekly — stated as both "3" and
  "3.5" across videos 4 and 6, treat as approximate)

**Adaptive tightening (video 6, new):** when a strong trending move causes
*every* candidate level to cluster within the default threshold (i.e. the
threshold stops discriminating anything), the threshold is manually
tightened on the spot — demonstrated live cutting gold's weekly threshold
from $7.5 down to $3 specifically because "every level's going to be a
level if we do that... we don't want that... you lose the power of
confluence" if it stays loose. Implies the real rule isn't a fixed
dollar/pip constant but something like *keep tightening until the
level count returns to ~1-3* — a fixed-percentage-of-price threshold might
approximate this better than a fixed-dollar one, but an explicitly
adaptive/count-targeting threshold might be the more faithful
reproduction.
**Videos:** 3, 4, 6.

### Swing high/low selection heuristic for Fibonacci anchors ("blur your eyes")
**Speaker: host of transcript 3.** Confidence: med — a discretion-control
technique, explicitly named and justified, not just an aside.
When picking the high/low to draw a Fibonacci retracement from: zoom out,
then deliberately "blur your eyes" past the small-timeframe jaggedness and
pick **one** key swing high and **one** key swing low — not whichever pair
of local peaks happens to produce a convenient level. Stated rationale:
avoids retrofitting a Fib to justify a level after the fact ("trying to
make a case for a level" — implicitly a self-aware anti-p-hacking / anti
confirmation-bias rule). Practical implication for automation: swing
detection needs to run on a meaningfully higher timeframe than the entry
timeframe (1H swings feeding 5m/15m levels, 4H swings feeding weekly
levels) rather than the lowest-timeframe pivot detector, or it will surface
too many candidate anchors.

**Video 6, reconfirmed verbatim** ("blur your eyes, what's jumping out to
you when you zoom out as a key swing low and a key swing high") — same
rule, same wording, second independent instance. Also explicit that this
Fib pull happens **only once** per markup: "the minute you [try more
highs/lows] I feel like I'm entering territory where eventually something's
going to line up" — and separately, in video 4, an aside that another
member ("J") does deliberately try multiple highs/lows to find a lining-up
golden pocket/786 combo, which Husky says "there is merit in" but doesn't
do himself — a real methodological difference between members worth
keeping distinct if more of J's approach shows up later.
**Videos:** 3, 4, 6.

### Zone-based levels, not single-price lines
**Speaker: host of transcript 3.** Confidence: med.
When a level is imprecise (e.g. sits between the top of a golden pocket and
a nearby extension level), mark it as a **price zone** rather than a single
line — explicit reasoning: "you wouldn't want to necessarily miss out on
the right idea just because you were waiting for pixel-perfect entry of
the line." Practical for backtesting: entry/exit logic built purely on
exact price-touch will systematically miss trades this system would take;
a tolerance band per level may be closer to the real rule.
**Videos:** 3.

### ADX-based regime filter (trend vs. mean-reversion switch)
**Speaker: host of transcript 3**, floated as a suggestion to a struggling
member (Mike), not stated as something currently in use personally, but
described with real numbers. Confidence: med.
Use ADX (Average Directional Index) on the **4H** chart. ADX is magnitude
of directional strength, not a bull/bear signal — "up here means we're
really strong in our direction, either bullish or bearish." Around
**~30** is treated as the regime midpoint: below ~30 → choppy/ranging
regime → favor **mean reversion**, enter at levels, target back to the
mean; above ~30 → trending regime → hold trades longer, wait for/trade the
breakout instead of fading it. **This repo already has ADX in several
places** (`regime_classifier_mtf.py`, `js/regime-v2.js`, `pine/hmm-v2-regime.pine`,
etc.) — worth checking whether any existing regime classifier already uses
something close to this exact threshold/timeframe before building a new
one.

**Concrete application, video 6 (new):** demonstrated live, not just
described. With gold's 4H ADX elevated (above ~30, trending), Husky
explicitly **skips marking a far-extension sell/fade level** ("not the
worst thing in the world to not have any sell levels today... mean
reversion works better in ranging markets, we're not in a ranging market
at the minute") and instead picks a **near/low-multiple extension (1.5)
as a pullback-buy-into-the-trend entry**, i.e. using the same range-
extension level set but switching from fading the far edge to buying a
shallow pullback, conditioned on the ADX regime read. This is the first
time the ADX filter is shown actually changing which level gets selected
and how it's traded, not just discussed as an idea.
**Videos:** 3, 6.

### Levels are bidirectional — entries AND take-profit targets
**Speaker: host of transcript 3.** Confidence: med, extends the "close
median as reversion magnet" idea from video 2 to the range-extension levels
generally, not just the close median.
Any marked level (range extension, golden pocket zone, close median) is
explicitly usable both ways — as a potential entry *and* as a take-profit
target for a position already open in that direction. Demonstrated live:
NQ closing almost exactly on the close-median level after an up move —
"if you were long on NAS yesterday... and closed out around here, you
wouldn't be disappointed."

**Midpoint as a directional-bias divider (video 6, new facet):** the 0.5
(midpoint) of the weekly/Monday range isn't just a TP target — it's also
used as a simple bias split, explicitly compared to VWAP: "it's kind of
like how people use VWAP a little bit... if we're above VWAP, we're
bullish, if below, bearish... if we're above the 0.5, we're bullish for
the week, if below it, we're bearish." A third distinct use of the same
midpoint level (target / bias-divider / observed reaction zone — also
separately noted in video 6 as coinciding with a golden pocket and holding
as support without even being traded).
**Videos:** 2 (close-median version), 3 (generalized to all level types),
6 (midpoint-as-bias-divider).

### Spacing resting levels apart to avoid correlated stop-outs
**Speaker: host of transcript 3.** Confidence: low-med, single mention but
a clear risk-management rationale.
When keeping two candidate levels on the same side (e.g. two sell zones
above price), deliberately keep them a "decent enough distance apart" so
that a single sharp move can't fill/invalidate both simultaneously —
explicit reasoning is avoiding a scenario where both resting orders get
taken out together by one spike.
**Videos:** 3.

### Explicit discretion/intuition callouts, separate from the systematic process
**Speaker: host of transcript 3.** Confidence: n/a (meta-note, not a rule).
Notable for honesty about where the process stops being systematic: when
skipping a gold buy level, the host explicitly flags the reasoning as pure
opinion — "this is just complete discretion and intuition... I've been
saying for a few weeks I feel like gold needs to revisit these areas before
we see a move up." Useful as a marker: anything phrased this way should
*not* be treated as part of the reproducible system, even though it comes
from the same person in the same markup process.
**Videos:** 3.

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

**VIX as a regime filter, with illustrative thresholds (video 5, new —
explicitly caveated as "just pulling this out of a hat," i.e. examples of
the *shape* of the rule, not validated numbers):**
- VIX **above ~15** → high-vol regime → widen stops, reduce position size;
  VIX **below ~15** → calmer regime → tighten stops, can size up slightly.
- Separately, VIX **above ~20** floated as "heavy volatility priced in" →
  used as a supporting condition for a **long-gold bias** (uncertainty →
  safe-haven demand) — note this directly conflicts with the "gold hasn't
  been acting as a safe haven lately" observation made in the same video
  (see the flight-to-safety-regime-shift point below), so treat as a
  normal-times heuristic, not a current one.
- **Hedging use**: theoretically going long VIX to hedge an existing
  directional position against a volatility spike around a scheduled event
  (FOMC, NFP, geopolitical headline risk) — caveated that most prop firms
  don't offer VIX as a tradable instrument, though "more brokers than
  you'd imagine" do.
- **GVZ** (gold-specific VIX equivalent) name-checked but explicitly
  passed over in favor of plain VIX, since VIX reflects broader
  market-wide positioning rather than gold-specific.
**Videos:** 2, 5.

### ATR-based initial stop-loss sizing
**Speaker: Husky.** Confidence: high — concrete formula, repeated across
videos, explicitly paired with the structure-trailing-stop as "initial
placement, then trail."
Stop-loss distance = **ATR × multiplier**, example multiplier given as
**1.5x**. ATR = average true range over ~14 candles on whatever chart
timeframe is being traded — "measures the average size of the last like 14
candles." Framed as the systematic alternative to a fixed-pip/fixed-dollar
stop: the *rule* (multiplier) stays constant, but the resulting stop
distance automatically widens/tightens with current volatility. Explicitly
recommended over ad hoc stop placement precisely because "predicting
volatility is a lot easier than predicting direction."
**Videos:** 4, 6.

### Level-selection tie-break rules (tightest gap, then random)
**Speaker: Husky.** Confidence: med-high — stated as explicit, repeated
process steps for the "which of these valid levels do I actually keep"
problem, distinct from the swing-selection ("blur your eyes") heuristic
above, which is about choosing Fib anchors, not about picking among
already-valid range-extension levels.
When multiple range-extension levels remain valid (i.e. none get merged by
the confluence-clustering threshold) and no further Fib/golden-pocket
confluence discriminates between them: (1) prefer the level with the
**tightest gap** between its two source points (current-range extension
vs. previous-range extension, or current-week vs. previous-week) — treated
as the "cleanest" signal; (2) if still tied or nothing stands out, the
explicit fallback is genuinely random selection — "close your eyes and
stick your finger on the screen... it's a million times better to do that
than keep five potential levels." Repeated near-verbatim in video 6. The
meta-point behind both: it is better to trade a randomly-chosen single
level than to keep multiple valid levels and effectively over-trade — the
selection method matters far less than the discipline of *reducing to one*.
**Videos:** 4, 6.

### Rolling correlation analysis (not static correlation)
**Speaker: Husky**, offered as a general research technique/exercise, not
a fixed rule. Confidence: med — a methodology recommendation rather than a
stated parameter.
Compute correlation between asset pairs (e.g. gold vs. 10Y yields, gold vs.
inflation expectations) over a **rolling window**, not a single fixed-period
number, specifically to see how the relationship's *strength* changes over
time, including "what's closely coupled right now." Suggested as something
straightforward to build with AI assistance and visualize on a dashboard
(what's gold tracking closest over the last week vs. longer term). Directly
motivated by an observed regime change: gold and yields are normally
strongly inversely correlated, but were observed **decoupling** in the
live example (gold rallying while yields also recovered) — used as the
worked example of why a single static correlation number would mislead.
**This repo already has `correlations.html`** — worth checking whether it
computes rolling (vs. point-in-time) correlation, and whether gold/yield
decoupling periods are visible in it.
**Videos:** 5.

### Cross-asset move attribution (differencing against a dollar proxy)
**Speaker: Husky**, demonstrated live, not stated as a named rule.
Confidence: med.
To determine *why* an asset moved (e.g. is a gold rally "genuine gold
strength" or just "a weak dollar"), compare its move against a proxy for
the other side of the equation at the same time — here, EURUSD as a dollar
proxy. If gold rallies while EURUSD is flat, the move is attributed to
gold-specific demand rather than broad USD weakness (since a weak-dollar
move would be expected to lift EURUSD too). A simple differencing
heuristic — could be formalized as comparing simultaneous returns across
gold / a USD proxy / yields to attribute a move to one driver vs. another,
rather than reading gold's chart in isolation.
**Videos:** 5.

### Macro transmission hierarchy — signal-to-noise cascade by asset class
**Speaker: Husky**, presenting the group's core "Lesson 2" macro education
content (not personal opinion — read through live, described as
foundational curriculum). Confidence: high (structured, named framework).
Policy shocks (rate decisions, central bank guidance) propagate through
markets in a hierarchy, over increasing timescales and with decreasing
signal-to-noise from top to bottom:
1. **Bond markets** react within hours — highest signal-to-noise, "most
   likely to be true."
2. **G10 FX** adjusts over days to weeks.
3. **Equities** reprice over weeks.
4. **Credit spreads** widen/tighten over months — most lagged, noisiest.
Individual stocks are described as the hardest tier to draw conclusions
from — "all the information we want to look at is [higher up the
hierarchy]." Explicit implication for system design: build around
bonds/G10 FX (best signal) rather than equities/individual names, and
expect a *lag* between a bond-market reaction and the equivalent FX/equity
move. Tied to the recurring explanation for why lower-frequency,
macro-aligned traders reportedly outperform high-frequency chart-only
traders — they're positioned with the slower-moving, higher-signal
picture rather than reacting to noise.
**Videos:** 5. **Testable framing**: does a same-day bond-yield move (or
yield-spread move) lead a same-pair FX move by a measurable number of
days? This is close to being a direct lead-lag backtest.

### COT positioning as a crowding/contrarian signal
**Speaker: Husky.** Confidence: med — single concrete example, but a named,
publicly available dataset (Commitment of Traders reports).
Cited as an explanation (after the fact) for a gold reversal: even while
gold price had been falling for an extended period, COT data showed large
speculative/"big money" long positioning remained **overcrowded**
(persistently heavily long) throughout the decline — used to argue the
eventual sharp reversal upward was consistent with that positioning
extreme rather than a surprise. Framed as one more cross-asset input
(alongside yields, VIX, correlations) rather than a primary signal.
**Videos:** 6.

### "Gold is one of the worst assets to build a quant system around"
**Speaker: Husky, attributing the claim to "Mr. C" (the group founder /
C.org)**, and endorsing it from his own experience. Confidence: high as a
stated group-level belief, not a numeric rule.
Reasoning given: gold's price action is dominated by episodic "flight to
safety" dynamics that are comparatively hard to model/predict (illustrated
by the video 5 observation that gold recently *didn't* rally on major
geopolitical risk headlines, breaking the usual safe-haven pattern),
whereas FX pairs are more tractable because they're driven by the
comparatively more mechanical rate/spread framework covered throughout
these transcripts. Direct quote-adjacent: "from a system-building
perspective, gold is one of the worst assets to look at... EU is arguably
a much better asset to be trading range extensions on." Stated as
something most members (including Husky himself) learn the hard way,
since gold is the asset people gravitate to first out of familiarity.
**Relevant to this repo directly**: it already covers 24+ FX pairs plus
gold — this is a signal from inside the source material itself that
systematic-methodology replication (range extensions, ADX regime, etc.)
should be validated on FX pairs first/primarily, with gold treated as the
harder, lower-priority case rather than the default.
**Videos:** 6.

### Bars pattern — explicitly deprecated, visualization only
**Speaker: Husky.** Confidence: n/a (explicitly a *rejected* idea — logged
as a negative finding, not a candidate).
An older tool: draw a normalized line tracing price action over a defined
window (e.g. the Asia session), then slide/overlay that same shape onto
later windows (London, New York, next day) to visually compare whether
similar volatility "shapes" recur (e.g. "moved down, found a bottom,
moved up" repeating across sessions). **Explicitly no longer used for
entries or exits** — the group moved away from it because pattern timing
"doesn't work like that" precisely (too easy to convince yourself of a
reversal "at this exact time" that doesn't materialize), and it's
confusing/was dropped from current education material entirely in favor
of the volatility/range forecasting tool. Logged here mainly so it isn't
independently reinvented later — the group already tried and shelved it.
**Videos:** 5.

### Psychological/discipline discipline: forget the money, follow the system through drawdown
**Speaker: Husky**, general advice reinforced with two of his own
cautionary anecdotes. Confidence: n/a (meta-note, not a chart rule, but
directly actionable as an operating discipline for any live deployment).
Core advice: treat account balance/drawdown as irrelevant to execution —
"know what your system is and execute it" — because both fear-driven
under-trading during drawdown and urgency-driven over-trading near a
target/payout lead to abandoning the system exactly when discipline
matters most. Two anecdotes: (1) revenge-traded and blew a prop-firm
challenge **$100 away from passing**, entering an oversized position "it
only needs to move 10 cents" that immediately reversed; (2) under a
prop-firm "consistency rule," deliberately tried to **lose a trade on
purpose** to avoid one day's P&L skewing the consistency ratio too far —
and found it surprisingly hard to lose intentionally, making things worse.
Notable secondary point: a **consistency rule itself can create a
perverse incentive** (deliberately losing to stay compliant) — worth
remembering if this repo's tooling ever models prop-firm constraints.
Extends the existing "prop-firm pacing discipline" entry above with two
concrete failure-mode examples rather than just the general pacing advice.
**Videos:** 6.

---

## Research Backlog

_Ideas judged worth a real backtest, promoted from the Theme Index once
they're concrete enough to test (specific indicator, parameters, entry/exit
logic). Links to a script/dir once work starts._

- **Jordan's live volatility-zone tool — top priority.** Partially
  reproducible now: session H-L range as a % of price, compared live
  against that session's historical median and 75th-percentile range
  (`Δmed`, `Δ75p`), on a fast intraday timeframe. What's missing before
  this is buildable: the exact rule for which side of price gets flagged
  "exhaustion" (red) vs. "normal" (green), the session/window definition
  the live stat uses if not midnight-anchored, and the identity of the two
  blue MA-like lines seen in one screenshot. Next transcript/screenshot
  batch should target closing these three gaps specifically.
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
- **Range-extension formula is now fully specified**: `level = range_edge ±
  (N−1) × range_width`, with the reference range being Asia-session (daily)
  or Monday-midnight-to-midnight (weekly). This is directly implementable —
  the main remaining question is which is the actual bar-anchoring in
  `jordan_impulse_range_backtest/` today (does it already use a
  midnight anchor, or exchange-session open? see the anchor-time note in
  the methodology entry — this is a correctness check, not just a new
  feature).
- **ADX regime filter (~30 threshold, 4H) gating mean-reversion vs.
  trend-following.** Directly testable and this repo already has ADX
  plumbing (`regime_classifier_mtf.py`, `js/regime-v2.js`,
  `pine/hmm-v2-regime.pine`) — check whether an existing classifier already
  captures this threshold/timeframe combo before adding a new one.
- **Confluence-clustering threshold ($5/$7.5 gold, 2/3.5 pips EU, and an
  adaptive-tightening variant).** Worth checking whether a fixed-percentage
  threshold (rather than fixed-dollar/pip) reproduces the same clustering
  behavior across gold/EU/NQ, and separately whether a count-targeting
  adaptive threshold (tighten until ~1-3 levels remain) beats a fixed
  constant — cheap to test once the range-extension formula above is
  implemented, since it's just a post-processing merge step on the
  generated level list.
- **ATR-based stop sizing (1.5x ATR-14).** Directly implementable, cheap
  to test as a stop-placement rule against whatever fixed-pip/fixed-%
  stops existing backtests use today.
- **Gold directional bias conditioned on rate *direction*** (short-bias
  when rates rising, long-bias when rates falling) — testable as a simple
  regime feature (sign of the recent change in a reference yield) gating
  an existing gold entry model's direction.
- **Bond/yield-spread → FX lead-lag hypothesis.** The macro transmission
  hierarchy claims bonds react within hours, FX over days-to-weeks — this
  is close to a direct, cheap backtest: does a yield or yield-spread move
  on day T predict a same-pair FX move over the following days?
- **COT positioning extremes as a contrarian/crowding signal.** COT data
  is public and downloadable; worth checking whether extreme positioning
  (e.g. large-spec long/short percentile) has historically preceded
  reversals in gold or the FX pairs this repo already covers.
- **Rolling correlation dashboard.** Check `correlations.html` in this
  repo for whether it already computes rolling (not just point-in-time)
  correlations, and whether it would surface something like the gold/yield
  decoupling period described in transcript 5 — if not, this is a cheap
  extension rather than new infrastructure.

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

### Transcript 3 — Tuesday weekly markup call (gold, EU, NAS; same
presenter style/schedule as transcript 2)

**Speaker note:** still not confirmed by name; Jordan again appears only
as a chat participant (asked about a drive, referenced as someone who could
answer an execution-automation question the host couldn't). No Jordan
trading footage yet across 3 transcripts.

**New:**
- Range-extension formula fully confirmed: `level = range_edge ± (N−1) ×
  range_width`, off Asia range (daily) or Monday range (weekly)
- Midnight anchor (not exchange session open) used to define the
  weekly/Monday range, specifically to avoid rollover/gap contamination
- Volatility overlay tool confirmed daily-only, not used for weekly levels
- Confluence-clustering threshold: $5 on gold, levels within that get merged
- Swing high/low selection heuristic for Fib anchors ("blur your eyes",
  pick one key pivot, avoid retrofitting a level)
- Zone-based (not single-price) levels when precision is ambiguous
- ADX regime filter suggestion: ~30 threshold on 4H, below = mean reversion
  regime, above = trend/breakout regime — floated as advice, not confirmed
  personal practice, but concrete and testable
- Levels are bidirectional: also used as take-profit targets for existing
  positions, not just entries
- Spacing multiple resting levels apart to avoid correlated stop-outs
- Explicit self-flagged discretion/intuition calls, kept separate from the
  systematic process

**Repeats (already in Theme Index, extended with new detail):**
- Range extension methodology — now includes the anchor-time and
  volatility-overlay-scope clarifications
- Range-extension multiples — formula now fully derivable from two videos'
  worth of examples

**Bollinger/band mentions:** none. Three transcripts in, still nothing
matching the screenshot — all three have been group markup/induction
calls, not Jordan's own trading footage.

**Worth researching:** yes, several concrete/cheap items — the
range-extension formula (now fully specified, should be checked against
what `jordan_impulse_range_backtest/` already implements), the ADX regime
filter (repo already has ADX code to check against), and the
confluence-clustering threshold.

### Transcript 4 — from-scratch range-extension walkthrough for brand-new
members (EU markup)

**Speaker note:** Husky (self-referenced elsewhere; consistent presenter).
Jordan mentioned once in passing (his message-cadence access-code joke) —
not present as a participant this time. Still no Jordan trading footage.

**New:**
- Full reproducible mechanics of the Asia-range extension method: midnight
  London to 6am, 5-min chart, candle-body anchors, named indicator
  ("Asian Range by Nico1948"), draw-direction irrelevant
- Full breakdown of the volatility/range tool's 5 levels: close
  median/75th (fixed, midnight-anchored, "candle body") vs. projected
  high/low median/75th (dynamic, based on currently-printed extreme,
  "wicks") — see revised Priority Watch note
- Explicit list of confluence types warned against overusing: fibs, VWAPs,
  previous closes/opens/highs/lows, fair value gaps, order blocks —
  "very limited areas on the chart that don't have one of those things"
- ATR-based stop sizing formalized: 1.5x ATR-14 example
- Tie-break rule for picking among multiple valid levels: tightest gap
  first, then literally random ("close your eyes, point at the screen")
- A named member ("J") is described as using a different, more iterative
  Fib-anchor-searching approach than Husky's single-pass method — flagged
  as a real methodological difference to watch for if J's own content
  ever gets transcribed

**Repeats (extended with new detail):** Range extension methodology
(full mechanical spec), Range/volatility forecasting tool (full 5-level
breakdown), swing-selection heuristic (J's contrasting approach noted)

**Bollinger/band mentions:** none. But this transcript is the source of
the "projected high/projected low are dynamic" nuance — see the revised
Priority Watch section; still not a match, but the closest thing found so
far to something that moves intraday.

**Worth researching:** yes — ATR stop sizing and the tie-break rules are
both cheap, mechanical, and directly implementable.

### Transcript 5 — Monday "ask me anything" (mostly macro education, some
technical)

**Speaker note:** Husky. Jordan not present. This is the least
technical-markup-heavy transcript so far — mostly a live read-through of
the group's core macro curriculum ("Lesson 2: understanding what moves the
markets") plus some ad hoc TradingView demonstrations.

**New:**
- Rolling correlation analysis as a research technique (vs. static
  correlation) — repo already has `correlations.html`, worth checking
- Cross-asset move attribution: differencing an asset's move against a
  dollar proxy (EURUSD) to determine if a gold move is gold-specific or
  dollar-driven
- Macro transmission hierarchy: bonds (hours) → G10 FX (days-weeks) →
  equities (weeks) → credit (months), with signal-to-noise decreasing down
  that list — a near-direct lead-lag backtest candidate
- Carry trade mechanics for USD/JPY, tied to the US-JPY rate spread as "a
  clear driver" of the pair's price
- Regime-conditional gold bias tied to rate *direction* (not just spread
  level): rates rising → short-gold bias, rates falling → long-gold bias
- VIX as a regime filter with illustrative (explicitly unvalidated)
  thresholds for position sizing/stop width, plus a hedging use case and a
  pass on GVZ in favor of plain VIX
- "Gold hasn't been acting as a safe haven lately" — a live example of a
  correlation/regime breaking down, used to motivate the rolling-
  correlation point above
- Bars pattern tool — explicitly deprecated, logged as a rejected idea so
  it isn't reinvented
- Look-ahead bias (a member's own system had it) vs. overfitting (more
  common in human/manual backtesting) called out as a distinct pair of
  failure modes worth keeping separate

**Repeats:** VIX as tradable/leading indicator (video 2) — extended with
regime-filter thresholds and hedging use. Macro/flow framework (video 1)
— extended with carry trade and rate-direction gold bias.

**Bollinger/band mentions:** none.

**Worth researching:** yes — the bond→FX lead-lag hypothesis from the
transmission hierarchy is the most novel/testable item here and is close
to a direct backtest with data this repo likely already has.

### Transcript 6 — Tuesday weekly markup (gold, EU), second full example
after transcript 3

**Speaker note:** Husky — **confirmed by name** this time (a chat message
referring to him in the third person is read aloud and responded to in
kind). Jordan present as a participant only (his account-risk comment
prompts general "forget about the money" advice). Still no Jordan trading
footage across 6 transcripts.

**New:**
- Adaptive confluence-threshold tightening when a trending move causes
  every level to cluster (demonstrated live, gold weekly threshold cut
  from $7.5 to $3)
- Midpoint (0.5) used as a VWAP-style bullish/bearish bias divider, a
  third distinct use alongside TP-target and observed-reaction-zone
- ADX regime filter shown actually changing level selection: skips a
  far-extension sell/fade in a trending (high-ADX) regime, picks a
  near-extension (1.5) pullback-buy instead
- COT positioning cited as an after-the-fact explanation for a gold
  reversal (persistent large-spec long crowding through the decline)
- "Gold is one of the worst assets to build a system around" (attributed
  to the group founder), FX preferred for systematic work — directly
  relevant to prioritizing this repo's existing FX-pair coverage over gold
  when replicating this methodology
- Two discipline anecdotes: revenge-traded a challenge $100 from passing;
  deliberately tried (and failed) to lose a trade to satisfy a prop-firm
  consistency rule — the latter flags consistency rules as a possible
  source of perverse incentives
- Reconfirms: draw-direction irrelevance for the Fib-extension tool, the
  "blur your eyes" swing heuristic (near-verbatim), and structure-trailing
  stop paired explicitly with ATR-based initial sizing

**Repeats (extended with new detail):** Dynamic structure-trailing stop,
range extension methodology, swing-selection heuristic, ADX regime filter,
levels-are-bidirectional, confluence-clustering threshold, prop-firm
psychological discipline.

**Bollinger/band mentions:** none.

**Worth researching:** yes — the ADX-conditioned level-selection switch
(fade far extensions in ranging regimes, buy near-extension pullbacks in
trending regimes) is now concrete enough to backtest as a single combined
rule, not just the ADX filter in isolation.

### Evidence Set A — Jordan's own screenshots (not a transcript)

**Source note:** ~16 screenshots, not a video transcript — Jordan's own
`New test` / `one more test` / `test complete` / `updated` posts, showing
iterative live testing of his own tool on gold and NQ (MNQ futures),
tagged `@C.OG` (the group founder) when reporting results. First direct
look at Jordan's own material after 6 transcripts of Husky-only content.

**New:** the full Bollinger-band-hypothesis resolution — see the rewritten
Priority Watch section above and the new "Jordan's own live volatility-
zone tool" Theme Index entry. In short: a live-updating colored
exhaustion-zone overlay (green/red, sides flip by direction) driven by a
Live/Median/75th-percentile session H-L range % panel, `Close Med` and `L
<pct>` on-chart labels, and `Δmed`/`Δ75p` tooltip deltas — same
statistical family as Husky's forecasting tool, rebuilt to run live on a
fast intraday chart. Two unidentified blue MA-like lines appear in one
later screenshot.

**Repeats:** none — this is genuinely new material, the first from Jordan
directly rather than Husky.

**Bollinger/band mentions:** this *is* the band — substantially resolved,
see Priority Watch. Not a classic SMA±stdev Bollinger; a percentile-range
exhaustion-zone overlay instead.

**Worth researching:** yes, now the top backlog item — see Research
Backlog. Still need: the red/green side-assignment rule, the session
window definition for the live stat, and identification of the two blue
lines, ideally from a future transcript where Jordan explains the tool
himself.
