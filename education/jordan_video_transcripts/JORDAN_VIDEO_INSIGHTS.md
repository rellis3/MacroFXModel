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
  band, liquidity sweep filter, MAE dynamic stop, and (critically) the
  re-read of these same screenshots as TradingView's Long/Short Position
  drawing tool rather than a computed indicator — read this before treating
  anything about "Jordan's band" as an open indicator-identification question
- `education/jordan_trade_geometry/` — trade geometry + VuManChu gate
- `education/jordan_atr_band_backtest/` — the rolling ATR-band mean-
  reversion idea from this file's own Synthesis section, built and tested
  (null, see Research Backlog)

Nothing below is confirmed or backtested by default — this is a capture
layer for hypotheses. "Confidence" is about how clearly/repeatedly Jordan
stated it, not whether it works.

---

## ⭐ Priority Watch: Bollinger/SD-style dynamic band

**Status: superseded by an existing, more precise finding already in this
repo — read before building anything new.**
`education/jordan_impulse_range_backtest/RESULTS.md` turns out to already
be a formalisation of **these exact same screenshots** (same 13-14 Aug 2026
dates, same `@C.OG` tags, same gold/NQ instruments) — this wasn't cross-
checked against Evidence Set A until now, which was a miss. Its re-read is
better-supported than the ATR/Bollinger-band hypothesis this section spent
several rounds developing:

**The colored rectangle is almost certainly TradingView's built-in
Long/Short Position drawing tool, not an indicator at all.** That tool
draws exactly this shape when you place it manually on a chart: a
boundary line at your entry, a green zone toward your target, a red zone
toward your stop, and it auto-labels the %/points distance (this is what
the `(0.44%) 1,910` annotation on one screenshot is — the tool's own stop-
distance readout, not a coincidental match to the ENQ system's 0.44%
figure this file speculated about earlier). Read this way, everything
about the screenshots resolves cleanly:
- **Why the red side "flips"**: it's just long vs. short — red sits above
  entry when the box marks a short's stop, below when it marks a long's.
  Not a computed property of any indicator, just which side of a manual
  box you drew.
- **Why it looks like a fixed rectangle instead of a curving band**: it
  *is* fixed — it's a manual annotation for one specific planned trade,
  redrawn fresh for each `New test`/`updated`/`another update` post, not a
  continuously-repainting indicator.
- **`if only the order was placed earlier`**: reads naturally as Jordan
  narrating a manual entry marker that missed the ideal fill, not
  commentary on an indicator value.
- The **two blue curved lines** and the **Live/Median/75th Pct panel**
  remain separate, real chart elements (probably a moving-average pair and
  a volatility-reference tool respectively) — just not the source of the
  colored zone, which this file had been trying to explain them as.

**RESULTS.md's mechanised version of the visible pattern** — impulsive
swing leg (≥2.5×ATR) → EMA(9/21) cross agreeing with the impulse direction
→ a session-range-exhaustion percentile gate → pullback entry inside the
leg's 38.2-61.8% retracement, traded **in the impulse's own direction**
(continuation-on-pullback, not a fade) — was run honestly (real costs, no
lookahead, true 60/40 IS/OOS split) against **10.4 years of M1 data on
both instruments**: **null on every variant tried.** Gold Sharpe −5.99
(full), NQ-proxy −2.49; every follow-up refinement tested (a dynamic MAE
stop, multi-trade-per-day, a session/time-of-day split, a liquidity-sweep
filter, a VWAP-anchored entry band, and flipping the range-exhaustion gate
to require an *already-stretched* day) either did nothing or improved
things without ever crossing into positive Sharpe — best case NQ at
−0.10/PF 0.961, still a loser. Full detail, every number, and the
reproduce commands are in that file — don't re-derive any of this, read it.

**What this means for "how do we find entry zones with ATR bands"**: the
specific, honestly-tested mechanisation of what's visible in these
screenshots has **no edge**, repeatedly, across a decade of data. That
doesn't forbid trying a genuinely different mechanism (see the Synthesis
below, kept but reframed) — but it does mean the premise "there's a real
dynamic band tool here worth reverse-engineering" is now the *weaker* of
two readings, not the stronger one. Per this repo's own working rules
(`MD files/CLAUDE.md`): state which of "built / works / has edge" is being
claimed, name the existing null as the benchmark to beat, and don't
prejudge a *new* mechanism's chances just because an *adjacent* one failed
— but don't build the new one without saying this out loud first either.

**Confirmed separately: the presenter across transcripts 2-6 is Husky**,
not Jordan — transcript 6 has a chat message read aloud referring to the
host as "Husky" in the third person, and the host responds in kind
("Husky did not say it's financial advice"). All 6 transcripts were
Husky's induction/markup/AMA content; the screenshot evidence (Evidence
Set A) is still the only direct look at Jordan's own work, now understood
as manual trade-planning annotations rather than a novel indicator.

### Synthesis: defining entry zones from a rolling ATR/SD band (kept as a
genuinely distinct idea, not a re-run of the RESULTS.md rule)

**Read the box above first.** This section predates the RESULTS.md
cross-check and was built on the (now weaker) assumption that Jordan's
screenshots show a real dynamic indicator. It's kept here because a tiered
ATR-band entry-zone mechanism is **mechanically different** from the
already-tested impulse+EMA+range-exhaustion+pullback rule — different
enough that the existing null doesn't settle it — but it should be framed
honestly as "a different idea to test," not as "reverse-engineering
Jordan's tool," since that tool most likely doesn't exist as a computed
indicator. Combining what's already validated across these transcripts
with standard practice for this class of indicator:

**1. Band construction — pick a basis + a width, both already justified
in this material:**
- **Basis (centerline)**: an EMA/SMA, or **VWAP** — Husky already treats
  VWAP as a directional divider the same way price-vs-basis is normally
  read ("above VWAP we're bullish, below we're bearish," see "VWAP used as
  context/frame" and the midpoint-as-bias-divider facet of "Levels are
  bidirectional"). Worth testing both and comparing.
- **Width**: **ATR × multiplier** is the cleanest fit — the group already
  uses ATR-14 × 1.5 for stop sizing (see "ATR-based initial stop-loss
  sizing"), so reusing ATR as the band's volatility unit keeps one
  consistent volatility measure across the whole system instead of
  introducing a second one (classic stdev) with no transcript support.

**2. Tiered zones, not one line — this repo already has the exact design
pattern to copy:** the range-extension methodology already uses **multiple
fixed multiples of a reference width** (1.25, 1.5, 2, 2.75, 3.5, 4.5 ×
Asia/Monday range — see "Range-extension multiples") to create a ladder of
levels rather than one line. The same pattern applies directly to an ATR
band: e.g. **1.5×ATR = watch zone, 2.5×ATR = entry zone, 3.5×ATR =
extreme/size-up zone**, all off the same basis line. This also satisfies
the recurring "mark a zone, not a pixel-perfect price" rule (see
"Zone-based levels, not single-price lines") — the **entry zone is the
band between two multiples**, not the outer line itself.

**3. Trigger inside the zone, don't just fade the touch:** nothing in
these transcripts describes blind-fading a level — Husky's whole
methodology is level-then-confirmation/confluence, and the "look for
reasons *not* to trade" framing (see "Mean reversion... sparse levels")
argues against treating every band touch as tradeable. A rejection candle
back inside the zone, or confluence with an existing tool (golden pocket,
range-extension level, VWAP) is more consistent with how every other level
in this material gets used.

**4. Regime-gate which way you trade the touch — this is the single
strongest transferable rule in the whole file:** transcript 6 shows this
exact switch live, just applied to range-extension levels instead of a
band — with 4H ADX elevated (~30+, trending), the far level was *not*
faded; instead a near level was bought as a pullback-continuation entry
(see "ADX-based regime filter," the "concrete application" note). Applied
to an ATR band: **ADX low → fade the outer band back toward basis; ADX
high → treat a pullback to an inner band multiple as a continuation entry
in the trend direction, not a reversal.** This turns "touched the band" +
"regime" into a genuine entry-direction decision, not just a level.

**5. Don't fade blind after a high-vol session:** volatility clustering
(see "Session structure / volatility persistence") means a wide-ATR
session is more likely to keep producing wide moves — either require a
further multiple (e.g. demand 3.5×ATR instead of 2.5×ATR) or skip fading
entirely after an unusually high-ATR prior session, mirroring how Husky
explicitly picks a *further-away* range-extension level after a
high-volatility day rather than the near one.

**6. Stops and exits, already fully specified elsewhere in this file:**
initial stop = ATR-based (extend the existing 1.5×ATR-14 convention,
placed just beyond the touched band multiple); once price reverts and
prints a swing point in your favor, switch to the **structure-trailing
stop** (see "Dynamic structure-trailing stop") instead of a fixed target —
consistent with "limit the downside, don't limit the upside" appearing
independently in three transcripts.

**What's still missing to fully match Jordan's specific tool**: whether he
uses one band or a tiered set like the ladder above; the actual ATR/stdev
period and multiplier; what the two blue lines are; and the exact
regime/trigger logic he uses for the touch itself. Everything above is a
buildable, testable starting point using only what's already validated in
this material — it doesn't require identifying Jordan's exact tool to be
worth backtesting on its own.

---

## Theme Index

_Deduplicated ideas, updated as transcripts come in. Each entry: **what was
said**, who said it, confidence (low/med/high — based on repetition +
specificity, not correctness), and which videos support it._

### Jordan's screenshot test posts — most likely manual trade markup, not a live indicator
**Speaker/source: Jordan directly** — the first entry in this file sourced
from Jordan's own material rather than Husky's. Confidence: med — visibly
real from the screenshots, but **now most likely explained without a
custom band tool at all** — see the rewritten Priority Watch section above
for the full reasoning (`education/jordan_impulse_range_backtest/
RESULTS.md` already formalised and null-tested the visible pattern from
these same screenshots; the colored rectangle is almost certainly
TradingView's Long/Short Position drawing tool, a manual per-trade
annotation, not a computed indicator). This entry is kept short and points
there rather than duplicating it.
### Cross-check: VWAP ± SD / Bollinger Z-score hypothesis (external ChatGPT
analysis of the same transcripts, checked against this repo's own history)

**Source: not a transcript** — the user separately ran a ChatGPT pass over
(a version of) the same video material, aimed specifically at surfacing
"potential ideas and bands which maybe Jordan's strategy." Confidence:
**mixed — treat per-claim, not as a package.** ChatGPT proposed, as its
top candidate, that Jordan's system likely uses **VWAP ± statistical
deviation** (σ-bands around VWAP, or VWAP-distance normalised by ATR)
rather than a classic Bollinger Band, and separately floated a compound
"BB Z-score + range-consumed% + ATR percentile + VWAP distance + macro
regime → mean reversion" hypothesis, explicitly *not* claiming the
transcripts state Bollinger Bands outright.

**What's actually checkable against this repo, done before taking this
further:**
- **The core claim — VWAP ± 2σ bands as a standalone fade/bounce signal —
  is not a fresh hypothesis here. It was already built and tested**:
  `js/vwapReversionEngine.js` / `MD files/VWAP_REVERSION_FINDINGS.md`.
  Result: **definitive null**, 26 FX pairs, real OANDA M1 2016-2026, costed,
  true IS/OOS split. Both `band_fade` (fade the ±2σ VWAP band back to VWAP)
  and `vwap_bounce` (trade the pullback to VWAP after a stretch, betting it
  holds) scored **0/26 pairs OOS-positive**, pooled OOS t-stats of −46.6 and
  −21.7 respectively, and — importantly — **there is no gross edge either**:
  backing out costs, `band_fade`'s gross mean is ≈ −0.0015%/trade,
  indistinguishable from zero. This isn't "a real edge killed by costs," it's
  "no signal, ever." So ChatGPT's framing of VWAP±SD as *the* strong,
  under-explored candidate doesn't hold up against what this repo has
  already run — it's a closed question, not an open one, for the standalone
  version.
- **Bollinger Bands as a *filter/confluence component*** genuinely does
  appear in this repo (`MD files/Backtest handover.md`, `MASTER_STRATEGY_
  DOCUMENTATION.md`, `Fib_STRATEGY_DOCUMENTATION.md`) — a 20-period/2.0σ BB
  "statistical extreme" toggle inside a range-extension backtest *tool*.
  But those are **feature descriptions of a configurable tool, not a
  reported result** — nothing found shows this filter (alone or combined
  with "range consumed / ATR percentile / macro regime") was ever actually
  run and scored. So the compound hypothesis is a real, present concept in
  this repo, but **genuinely untested**, not validated and not refuted.
- **"Range consumed / daily budget"** is real and already used
  (`WEEKLY_VOL_RANGE_FORECAST_GUIDE.md`, `DAILY_VOL_RANGE_FORECAST_GUIDE.md`,
  `REGIME_CONFLUENCE_DASHBOARD_HANDOVER.md`) — the same concept already
  logged in this file from the transcripts (Husky's daily forecasting tool).
  Not new, but confirms that part of ChatGPT's read is grounded.
- **`VWAP_REVERSION_FINDINGS.md` explicitly flags what it did *not* test**:
  "VWAP as a *conditioning filter* on an edge that already exists... this is
  meta-labeling — it needs a primary edge to size, which this repo does not
  yet have validated intraday." That's exactly the shape of ChatGPT's
  compound hypothesis (VWAP-distance as one input among several, not the
  sole trigger) — so the existing null does not settle it, per this repo's
  own stated epistemic-humility rule ("everything is null but needs
  reviewing with a different context," `MD files/CLAUDE.md`).

**Bottom line**: don't chase VWAP±SD bands as a standalone signal — that's
answered. The open, worth-a-decision question is whether the *compound*
version (BB Z-score / VWAP-distance-normalised-by-ATR as one gated input
among range-consumed%, ATR percentile, and regime, not the sole trigger) is
worth its own honest build — genuinely untested, meaningfully different in
kind from both the standalone VWAP null and the already-built ATR-band
engine above (that one gates on ADX regime; this one would be a multi-
factor confluence score).
**Videos:** n/a — this entry is a cross-check against existing repo files,
not new transcript material.

A **dynamically/continuously recalculated band** — the user is explicit
this is *not* the group's existing daily median/75th-percentile forecast
tool (fixed once at session open), which this repo already has built.
Tested iteratively on fast intraday charts (NQ/MNQ 1m and 15m seen; also
gold) across ~16 screenshots tagged to `@C.OG` (the group founder),
consistent with active in-development status. Visible chart elements: a
green/red colored zone (likely a per-test manual projection rectangle, not
necessarily the indicator itself — see Priority Watch), two unidentified
blue curved lines (the more likely candidate for the actual live band),
and a `Live/Median/75th Pct` H-L-range-% panel that may be a separate
reference tool rather than the band's source. Plausibly the "system based
on the forecasting tool" Husky mentioned (videos 1 and 4) as coming soon,
though that's now less certain given the corrected read.
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

**Video 11, hybrid variant (new) — partial at the original target, then
keep trailing the remainder:** the fullest worked example yet, live on a
weekly-level trade. On reaching the original weekly target (where a
scalping approach would just exit), take a **partial** there instead of
closing fully, then **keep trailing the stop under new 15m higher-lows
for the remaining size**, past the original target — "instead of taking a
short position [at target], what I would do is leave this running and
just keep doing the same thing, but take an extra partial at that level."
Demonstrated over a multi-day hold (level hit Wednesday morning, ridden to
Friday), with the explicit psychological note that this is "far longer
than most people currently would be staying in a trade" and stressful in
the moment when price pulls back through the original level before
continuing.

**Explicit style-dependency (video 11, new):** partials-at-1:1 vs.
full-structure-trailing isn't framed as one being better — it's tied to
*what kind of signal you're managing*: "there's definitely merit in
[partials at 1:1]... but it's also more applicable to scalping style
trading, where very quickly a winning trade happens very quickly or you
lose very quickly. With these [weekly range-extension levels], they take
a long time to develop properly." I.e. fast/scalp signals → take partials
early; slow/swing signals (the weekly levels specifically) → prefer full
trailing. Directly answered "no" to "is trailing better than partials" —
"nothing's better than anything else until you've fully tested it for the
way that you trade."
**Videos:** 1, 6, 11.

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

**Edge case explicitly considered, then rejected for simplicity (video 7,
new):** when price runs hard immediately *after* the Asia window closes
(a strong breakout in the first hour or so post-Asia), there's a live case
for anchoring the range to that post-Asia extreme instead of the high/low
that actually fell *inside* the 00:00-06:00 window — "if you see a run up
or a run down straight outside of Asia, have a look at potentially using
that high." Demonstrated live, then explicitly declined: "for the sake of
this and simply following the simplest version of this and trying to
remove as much discretion as possible, I'm just going to use the high
inside the range... over time it's not going to make a whole load of
difference." Worth recording as a **deliberately rejected variant** — a
"use the post-window breakout extreme if it's more extreme than the
in-window one" rule is a concrete, testable alternative anchor, explicitly
flagged by the source as probably not worth the added discretion.
**Videos:** 1, 3, 4, 6, 7.

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

**Exclusion rule, video 8 (new): don't use the 1.25 multiple on daily
(Asia) ranges — fine on weekly (Monday) ranges.** Explicit and specific:
"I did say the other day don't use 1.25 on Asia ranges... it's
temperamental definitely. You can use it on the weekly levels fine, but
on the daily range is probably [best to] stay away. It's not a big enough
extension outside the range really." A concrete, timeframe-conditional
exclusion of one specific multiple, not a general rule — worth encoding
exactly if reproducing the level ladder (drop 1.25 from the daily/Asia
grid, keep it for weekly/Monday).

**Inside-range levels are also valid, conditionally (video 8, new):**
the framework's examples emphasize *outside*-range extensions ("the ones
outside the range... are the nicer to look at"), but Husky explicitly
notes exceptions: "not everything has to be outside the range either...
when we've had a big move up like this, if we see a revisit of the range,
we could well go off one of these levels that are inside the range" —
i.e. the inside-range quarter-levels (0.25/0.5/0.75, already in the
official grid) become live candidates specifically as a pullback/
retracement zone *after* a large move has already carried price outside
and away from the range, not as a default source of levels.
**Videos:** 2, 3, 8. Relevant to the Asia-range work already noted for
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
thresholds given (video 3, 4, 6, 11):
- **Gold:** $5 (daily), $7.5 (weekly)
- **EU:** 2 pips (daily), ~3-3.5 pips (weekly — stated as both "3" and
  "3.5" across videos 4 and 6, treat as approximate)
- **NAS/Nasdaq (video 11, new — first number given for this instrument):**
  20-30 points, for weekly levels (asked directly: "what's the max gap on
  the levels for Nasdaq?" — "look between 20 and 30 points"). No separate
  daily-NAS number given yet.

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
**Videos:** 3, 4, 6, 11.

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
**Speaker: host of transcript 3/7 (Husky).** Confidence: med, now with a
concrete construction recipe rather than just the general principle.
When a level is imprecise (e.g. sits between the top of a golden pocket and
a nearby extension level), mark it as a **price zone** rather than a single
line — explicit reasoning: "you wouldn't want to necessarily miss out on
the right idea just because you were waiting for pixel-perfect entry of
the line." Practical for backtesting: entry/exit logic built purely on
exact price-touch will systematically miss trades this system would take;
a tolerance band per level may be closer to the real rule.

**Concrete zone recipe, video 7 (new): entry at close median, stop beyond
the nearest range-extension level.** Rather than a zone built from two
range-extension levels, this example builds one from **two different
tools**: "you've got potential entry at close median and a potential stop
loss above this daily range level... this here is going to be quite a nice
zone." I.e. the volatility/forecasting tool's close-median line marks the
entry edge of the zone, and a separately-derived range-extension level
just beyond it marks the stop edge — the zone's *width* is the gap between
one tool's output and another's, not a tolerance band around a single
level. A second, reusable construction pattern alongside "zone between two
extension multiples" already logged elsewhere.

**Three-way version, video 8 (new):** the same recipe extended with a
third input — close median (entry edge) + range-extension level (far
edge) + a golden pocket pulled from a Fib retracement, all overlapping in
one area: "you've got the closed median, you've got this confluent level
with the Asia range extensions, you've got this golden pocket... and yeah
that looks really nice to me." Confirms the zone-construction pattern
generalizes to however many of the group's tools happen to agree, not
capped at two.
**Videos:** 3, 7, 8.

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

**Explicit standalone-strength claim, video 8 (new):** "the midpoint of
Asia is always going to be quite strong... even potentially on its own.
But when we've got it lined up with a level from the previous Asia range,
extra strong." States a graded-strength model directly: midpoint alone >
nothing, midpoint + cross-session confluence > midpoint alone — worth
testing as a graded (not binary) confluence effect rather than treating
all confluence as equally weighted.

**Contrast: a plain Fib 0.5 retracement is normally deprioritized, unless
the underlying swing is large (video 8, new) — do not confuse with the
range/Monday-range midpoint above, a different level.** "I know we're not
too keen on 0.5s [meaning: the 0.5 Fibonacci retracement level, pulled
from a swing high/low, distinct from the Asia/Monday-range midpoint].
However, when it's a big move down like this on the hourly timeframe,
it's going to have some significance" — i.e. the *generic* Fib 0.5 is
usually skipped as weak confluence, but is upgraded when the swing it's
drawn from is itself a large, higher-timeframe move (in the observed
case, a multi-week high). Keep these two "0.5"s distinct when
implementing: the range-midpoint 0.5 is reliably strong; the swing-Fib
0.5 is normally weak and only conditionally promoted.
**Videos:** 2 (close-median version), 3 (generalized to all level types),
6 (midpoint-as-bias-divider), 8 (standalone strength + swing-Fib 0.5
contrast).

### Spacing resting levels apart to avoid correlated stop-outs
**Speaker: host of transcript 3/7 (Husky).** Confidence: low-med, but now
with a concrete numeric example backing it up.
When keeping two candidate levels on the same side (e.g. two sell zones
above price), deliberately keep them a "decent enough distance apart" so
that a single sharp move can't fill/invalidate both simultaneously —
explicit reasoning is avoiding a scenario where both resting orders get
taken out together by one spike.

**If you don't/can't space them — proportional risk split (video 7,
new):** explicitly framed as an edge case, not the recommended approach.
When 3 valid levels cluster close together (gold's 1.5/2/2.5 extensions on
a strong trend day, all within the $5 threshold's near-miss zone) and none
get merged out, the stated alternative to picking just one is to size each
individually so the **combined** risk across all three still equals the
normal single-trade risk budget — e.g. 1% max daily risk ÷ 3 levels =
0.33% each. Explicitly called "not the best way of doing things," and the
failure mode is spelled out: on a genuinely strong trending day price can
blow through all three in sequence, which "is not going to be much fun for
anybody" even with the reduced per-level size. Logged as a real but
disfavored fallback, not a recommendation — the default answer to "too
many close levels" is still to merge/reduce to one (see "Level-selection
tie-break rules" and "Confluence clustering" above), this is only what to
do if that reduction genuinely can't get below ~3 valid levels.
**Videos:** 3, 7.

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

**VIX spike → gold spike, explicitly flagged as unverified by the source
himself (video 10, new):** a different VIX claim from the regime-filter
thresholds above — a co-movement/leading-indicator hypothesis, given as
a teaching example with an unusually direct disclaimer attached: "when we
see a spike in VIX, typically we see a spike in gold. That's not tested,
I don't know if it's true, just to provide an example." Log as an
explicitly-unvalidated hypothesis, not a stated finding — but concrete
and cheap to check (VIX vs. gold same-day/next-day co-movement) given
this repo already has VIX and gold data.
**Videos:** 2, 5, 10.

### Yield spread indicator — deprecated, 24h-lag volatility (not direction) tool
**Speaker: Husky.** Confidence: med — described once, explicitly as a
retired tool, no parameters beyond what's stated here.
A now-retired group tool that **forward-projects yesterday's US-EU 10Y
bond yield spread onto today** (i.e. a straight 24-hour lag/carry-forward
of the spread value) — used specifically for **volatility predictability**,
in the same family as the deprecated "bars pattern"/Asia-extension tool
(see that entry), not for direction. Explicitly superseded: "we did have
like a yield spread indicator... they're much better at like, yeah, that
volatility predictability" — referring to the current volatility/range
forecasting tool as the replacement. Concrete and cheap to test on its
own terms: does yesterday's US10Y-EU10Y spread (or its day-over-day
change) have any relationship to today's realized range, independent of
whether the group's specific implementation ever worked?
**Videos:** 10.

### EUR/USD regression filter recipe (yesterday's US yield → today's price)
**Speaker: Husky**, given as a concrete worked example of how to take a
macro idea from "hunch" to "testable," not a stated personal system.
Confidence: med — a specific, reproducible recipe, but explicitly
illustrative rather than a claimed result.
Two columns: US bond yield (lagged one day) and EUR/USD price (same day,
shifted so yesterday's yield lines up with today's price) — run a simple
linear regression (explicitly "can be done in Excel"). If the fit says
"yesterday's US yields rising typically means a fall in EUR/USD today,"
use that as a **directional filter layered on top of existing technical
entries** — e.g. only take EUR/USD longs, or size up longs specifically,
on days the regression's implied bias agrees — not as a standalone entry
trigger. Framed explicitly as a first, approachable step into the
data-modeling material, and as one instance of a general pattern: pick a
lagged macro series, regress it against the pair you trade, and use a
statistically real relationship as a bias filter rather than a signal.
**Videos:** 10.

### Sizing up/down by confluence count, not just volatility regime
**Speaker: Husky.** Confidence: med — stated as a real, if informal,
practice, not swept under a fixed formula.
Extends the (curriculum-taught) vol-adjusted position sizing with a
second, independent sizing lever: "on occasions it can be sensible to
size up when you've got that extra confidence [i.e. a level with more
confluence sources]... or size down even if there's any particular
reason why we might be less confident in a level." Distinct from ATR/vol-
regime-based sizing (official curriculum, `VOLATILITY_INTELLIGENCE_
NOTES.md` Lesson 5) — this is conviction/confluence-count as a second,
separate sizing input, paired with an honest self-aware caveat about
recency bias/overfitting risk from doing this ad hoc ("is my system
performing well, or did I just get lucky on one trade where I sized up").
**Videos:** 10.

### Range-extension levels as expectation-context for other signals, not just standalone entries
**Speaker: Husky.** Confidence: med, a meta-framing point rather than a
new level or number.
Explicitly separate use case for the range-extension markup: even if you
don't trade off it directly, it's useful as **context that adjusts
confidence in a different signal**. Worked example: rather than expecting
an exact-to-the-pip reversal at the volatility tool's close median, "there's
also a chance that we push past close median before reversing because
we've got this really nice [range-extension] level above" — the nearby
extension level *widens the expected reaction zone* around the close
median rather than being a separate trade itself. Relevant to
"if you're trying to build a system... around the volatility forecast,
it's still useful to find these [range-extension] levels" — i.e. the two
tools are meant to inform each other's confidence, not just be composed
into a single zone (see the "two-tool zone" facet of "Zone-based levels"
above, which is the entry-construction version of this same idea).
**Videos:** 8.

### Anti-hindsight-bias discipline: don't retroactively mark a level that only reacted after the fact
**Speaker: Husky.** Confidence: n/a (meta-discipline, not a rule to
backtest) — pairs with the existing "explicit discretion/intuition
callouts" entry as a second honesty-preserving habit.
After watching price react almost perfectly at an unmarked level (close
median + a 2x extension aligning, "about as good as it gets for a
level"), explicitly declines to add it to the chart after the fact:
"I won't mark that as a level on the chart because hindsight and all
that." A concrete instance of refusing to let outcome knowledge retroactively
inflate the track record of "levels called in advance" — worth preserving
as a marker of what NOT to do when reconstructing/evaluating this
methodology from screenshots or logs (don't credit a level unless it was
marked up before the reaction, not after).
**Videos:** 8.

### Open interest — CME heatmap workflow and futures-to-spot conversion
**Speaker: Husky**, walking through the group's basic OI workflow live
(distinct from, and more introductory than, whatever
`education/open-interest-course-notes.md` covers in depth — check that
file for overlap before treating this as the full picture).
Confidence: med-high on the mechanics as demonstrated, low on whether any
of it is validated as edge (explicitly framed as "additional confluence,"
never as a signal).
- Free CME Group account → open interest heat map → select product →
  pick the **contract closest to expiry** (always the leftmost column).
- Two views: **OI change** (build-up/decline over a recent window) vs.
  **full OI** (absolute accumulated open interest) — the full-OI view is
  called out as often clearer for spotting genuinely large concentration
  zones ("4300, clear bulk of open interest there").
- **Conversion step, easy to miss:** heatmap strike levels are **futures
  prices, not spot** — find the matching futures contract on TradingView,
  diff it against spot (e.g. gold's OANDA XAUUSD), and apply that
  difference to the strike level before using it on a spot/CFD chart.
- **Usage pattern**: mark zones of heavy OI concentration as confluence;
  once price breaks through such a zone "with considerable volume and
  momentum," the *next* concentration zone becomes a plausible target —
  i.e. OI concentration doubles as both an obstacle (S/R) and, once
  cleared, a magnet (target), the same bidirectional framing already
  logged for range-extension levels.
- Also names the paid/automated route (CME data → CSV → upload into the
  group's OI dashboard for computed put/call walls) as the faster
  alternative to this manual walkthrough.
**Videos:** 10.

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

**Full worked numeric example, video 11 (new):** on EU, 15m ATR read live
at 0.00043; ×1.5 = 0.000645 ⇒ a ~6.4 pip stop distance for that specific
level. Demonstrates the formula isn't just described but actually
practiced bar-by-bar with a calculator.

**Session-timing caveat on the ATR read itself (video 11, new):** "there
is a slight caveat to doing this at this time in the morning because
coming out of Asia, [ranges] are typically smaller than they are during
London and New York" — i.e. an ATR sampled right after the Asia session
can understate the volatility the trade will actually be held through,
though judged a small effect once a 1.5x multiplier is applied. Relevant
to reproduction: an ATR-stop backtest should consider whether/how much
this session-timing bias in the realized-vol estimate matters.

**Trade-off: tighter ATR stop vs. widening to cover a nearby close-median
level (video 11, new):** when the ATR-based stop doesn't reach far enough
to enclose a nearby close-median level, framed as an explicit two-option
choice — keep the tighter ATR stop as-is ("if that's your system... you
need to be doing the same thing every time"), or deliberately widen the
stop to cover the close-median level, "giving the trade a little bit more
room to breathe" at the cost of a wider risk. Not resolved either way;
logged as a concrete, testable stop-placement variant (ATR-only vs.
ATR-widened-to-enclose-close-median).
**Videos:** 4, 6, 11.

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

**Second, independent description, video 10 (new) — likely the same tool,
extra detail:** described again without the "bars pattern" name, as a
tool that would "extend the way that price moved during Asia onto the
rest of the trading day" to "give us quite an accurate prediction for
when price might move up or when price might move down with more
volatility" — a member/handle called **"NMA"** is credited as being
associated with it ("I know NMA was around for this"). Explicitly
confirmed retired for the same reason given elsewhere: "no longer part of
the education because the volatility forecast tool is much, much better."
Treat as the same deprecated concept as the video-5 description, now with
a name to search for if more material surfaces, and a second, independent
tool named alongside it as *also* retired for the same reason — a **yield
spread indicator** (see its own new entry below) — both superseded
specifically by the current volatility/range forecasting tool.
**Videos:** 5, 10.

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

- **Rolling ATR/SD band entry-zone framework — BUILT AND TESTED, null.**
  See `education/jordan_atr_band_backtest/RESULTS.md` and
  `js/atrBandEntryV1Engine.js`. EMA(20) basis ± ATR(14) band, ADX(4H)
  regime-gated fade with confirmation, tested on 10.4 years of gold + NQ-
  proxy M1 data: null at baseline (gold Sharpe −4.84, NQ −2.67, both
  OOS-consistent). The ADX gate does real, monotonic work (unlike the
  sibling engine's range-exhaustion gate) — tightening it and widening the
  zone improves both instruments consistently, best *sample-valid* setting
  (zone=3.5×ATR, ADX<15, n=128/132 OOS) reaches gold −1.55/NQ −0.37 Sharpe,
  still losers, neither crossing into positive Sharpe. A real bug (ADX
  warmup starved by a too-short per-day context window, silently zero
  trades) was caught and fixed before trusting this result — see that
  file's Known Limitations. Follow-ups not yet tried: VWAP as basis instead
  of EMA, a fixed-RR target instead of basis-reversion, and the
  continuation-in-trend variant (buy a near-band pullback when ADX is high,
  instead of skipping the day) that transcript 6 describes the group
  actually using. Separately, still open on Jordan's *specific* screenshot
  tool (now understood as likely manual trade markup, not a live indicator
  — see the rewritten Priority Watch section): what the two blue lines are
  and the actual period/multiplier, if it exists as a real indicator at all.
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
- **Yield spread (US10Y-EU10Y) as a next-day volatility predictor.** The
  deprecated "yield spread indicator" claimed a 24h-lagged relationship
  between the spread and realized range, not direction — cheap to test
  independent of whether the group's own implementation ever worked, using
  data this repo already has.
- **EUR/USD lag-1 regression filter** (yesterday's US 10Y yield vs. today's
  EUR/USD return) as a directional bias gate on an existing entry model —
  the exact recipe given is a single lag-1 OLS regression, about as cheap
  as a backtest gets.
- **VIX-gold same/next-day co-movement**, explicitly flagged unverified by
  the source — cheap to check given this repo already has both series.
- **1.25 range-extension multiple: daily vs. weekly performance split.**
  If the range-extension formula gets implemented, this is a specific,
  falsifiable claim to check first: does the 1.25 level perform worse on
  daily (Asia) ranges than on weekly (Monday) ranges, as claimed?
- **ATR-widened-to-cover-close-median vs. ATR-only stop placement.** A
  direct A/B on an existing ATR-stop entry model — does deliberately
  widening the stop to enclose the close-median level improve outcomes
  enough to justify the larger risk?

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

### Transcript 7 — Thursday daily markup (gold, EU, NAS), reviewing
Tuesday's weekly levels first

**Speaker note:** Husky. Explicitly ties this session to the weekly one
("today will be a little bit different but also very similar to what we
did on Tuesday... this is the stuff that's actually taught in the
education inside the Discord") — direct confirmation this is straight
official curriculum (cross-checked separately against
`education/range-extension-levels-notes.md`, which matches almost
word-for-word: midnight-6am Asia window, candle-body-only, "Asian Range by
Nico[948]" indicator, 5-minute chart, 2-pip alignment tolerance). No Jordan
trading footage; Jordan referenced once (re-requesting his indicator access
code for the group).

**New:**
- Edge case explicitly considered and rejected: anchoring to a strong
  post-Asia breakout extreme instead of the in-window high/low, declined
  for simplicity/discretion-removal
- Proportional risk-split fallback for 3+ clustered levels that can't be
  reduced to one (e.g. 0.33% risk each across 3 gold levels within a 1%
  daily cap) — explicitly framed as a disfavored edge case, not the default
- Concrete "two-tool" zone recipe: entry at the volatility tool's close
  median, stop beyond the nearest range-extension level — building a zone
  from two different tools' outputs, not just a tolerance band around one
  level
- A soft validity signal for levels: a sharp reaction *near but not
  exactly at* a level (price reverses just before touching it) is flagged
  as "reconsider this level," though in the observed case a later retest
  did react as expected
- EUR/USD stop-distance data point: even for a 5-pip-stop setup, Husky
  says he'd "probably go 7.5 or 10" — a concrete pip range distinct from
  the ATR-based sizing already logged
- A tidy self-summary worth quoting directly: "these are the only three
  things I do... mark up the levels, get a bit of volatility context using
  the forecasting tool... [and check] a fib retracement" for confluence —
  matches the full stack already logged elsewhere in this file, useful as
  a single citable confirmation of the complete process

**Repeats (extended with new detail):** Range extension methodology
(post-Asia-breakout edge case), Zone-based levels (two-tool zone recipe),
Spacing resting levels (proportional risk-split fallback), Close median as
a magnet (used as the entry edge of a two-tool zone).

**Bollinger/band mentions:** none.

**Worth researching:** the two-tool zone recipe (close median entry / range-
extension-level stop) is the most concrete new item — directly testable as
an entry/stop pairing rule using data this repo already has for both the
range-extension and volatility-forecast pieces.

### Transcript 8 — Thursday daily markup continued (gold, EU, NAS), after
a stream restart

**Speaker note:** Husky, continuing the same Thursday session as
transcript 7 after technical difficulties (restarted stream). No Jordan
trading footage.

**New:**
- Exclusion rule: don't use the 1.25 extension multiple on daily/Asia
  ranges (fine on weekly/Monday ranges) — "temperamental," not a big
  enough extension on the daily scale
- Inside-range levels (0.25/0.5/0.75) become valid candidates specifically
  as a pullback zone after a large move has already carried price outside
  the range — not a default source of levels
- Range-extension levels used as expectation-context for a *different*
  signal (the volatility tool's close median), widening the expected
  reaction zone rather than being traded standalone
- Explicit standalone-strength claim for the Asia/Monday-range midpoint,
  graded weaker/stronger with vs. without cross-session confluence
- Contrast surfaced: the range-midpoint 0.5 is reliably strong; a generic
  swing-Fib 0.5 retracement is normally deprioritized unless drawn from an
  unusually large/significant underlying move — two different "0.5"s
- Anti-hindsight-bias discipline: explicitly declines to mark a level on
  the chart after watching it react perfectly, specifically because it
  wasn't called in advance
- Three-way zone construction (close median + range-extension level +
  golden pocket all overlapping), generalizing the two-tool zone recipe
  from transcript 7

**Repeats (extended with new detail):** Range-extension multiples,
Zone-based levels, Levels are bidirectional/midpoint.

**Bollinger/band mentions:** none.

**Worth researching:** yes — the 1.25-multiple daily/weekly split is a
small, sharply falsifiable claim, cheap to check first if implementing
the range-extension formula.

### Transcript 10 — Monday evening induction/AMA (education overview +
open interest walkthrough)

**Speaker note:** Husky, a broader induction-style session (not a markup
call) — walks through the group's education structure, the "Welcome to
the Turning Point" material (matches transcript 1's content closely, same
core philosophy), and a live CME open-interest heatmap demo. Jordan not
present as a participant this time.

**New:**
- Yield spread indicator (deprecated): 24h-lagged US-EU 10Y spread used
  for volatility predictability, superseded by the current forecasting
  tool — same retirement reason given for the Asia-extension "bars
  pattern" tool, which gets a second description here crediting a member
  "NMA"
- EUR/USD lag-1 regression recipe: yesterday's US yield vs. today's price,
  simple OLS (Excel-doable), used as a directional filter on existing
  technical entries, not a standalone trigger
- VIX spike → gold spike, given as a teaching example and explicitly
  flagged by Husky himself as untested ("I don't know if it's true")
- Sizing up/down by confluence count specifically, as a second lever
  alongside (curriculum) vol-regime-based sizing
- CME open-interest heatmap workflow: contract-closest-to-expiry
  selection, OI-change vs. full-OI views, and the easy-to-miss
  futures-to-spot price conversion step; OI concentration zones framed as
  bidirectional (obstacle before the break, target after)
- Confirms a "full system" release is planned around the forecasting tool
  to support an upcoming "prop firm toolkit" (Monte Carlo-based rule
  modeling for prop-firm constraints) — corroborates, doesn't newly
  establish, the "system coming soon" hypothesis already logged

**Repeats:** the bulk of the philosophy/structure content matches
transcript 1's induction almost exactly (same "Welcome to the Turning
Point" framing, same phase 1-4 structure) — not re-logged.

**Bollinger/band mentions:** none.

**Worth researching:** the yield-spread and EUR/USD regression items are
both cheap, concrete backtests; the VIX-gold claim is cheap to check and
explicitly invited by the source's own disclaimer.

### Transcript 11 — Tuesday weekly markup (gold, EU, NAS) with Jordan
present, most detailed execution walkthrough yet

**Speaker note:** Husky presenting; Jordan participates in chat
throughout (jokes about "full porting" weekly levels, requests a live
buy-position example). Still no Jordan trading footage, but the most
extensive look yet at Husky's actual trade-management mechanics on a
single worked example.

**New:**
- Full numeric ATR-stop worked example (EU, 15m ATR × 1.5 live-calculated
  to a ~6.4 pip stop), plus a session-timing caveat that ATR read just
  after Asia close may understate true range
- Explicit stop-placement trade-off: keep the tighter ATR-only stop, or
  widen it to enclose a nearby close-median level for "more room to
  breathe" — logged as an open, testable choice
- Fullest structure-trailing-stop example yet: partial at the original
  target, then continue trailing the remainder under new 15m higher-lows
  past it — a hybrid not previously logged this precisely
- Explicit style-dependency: partials suit fast/scalp signals, full
  trailing suits slow/swing signals like the weekly range-extension
  levels specifically
- NAS weekly confluence threshold given for the first time: 20-30 points
- Discretion note: when tied between two valid levels, a stated pull
  toward the larger/more-stretched extension ("bigger pullback... feels
  better") — explicitly discretionary, not a rule

**Repeats (extended with new detail):** Dynamic structure-trailing stop
(major new detail), ATR-based initial stop-loss sizing (major new
detail), confluence-clustering threshold (NAS number), swing-selection
heuristic (reconfirmed), explicit discretion callouts (new instance).

**Bollinger/band mentions:** none.

**Worth researching:** yes — the partial-then-trail hybrid exit and the
ATR-stop-vs-close-median-coverage trade-off are both concrete, testable
refinements to exit logic already partially built in this repo's range-
extension backtests.

### Evidence Set A — Jordan's own screenshots (not a transcript)

**Source note:** ~16 screenshots, not a video transcript — Jordan's own
`New test` / `one more test` / `test complete` / `updated` posts, showing
iterative live testing of his own tool on gold and NQ (MNQ futures),
tagged `@C.OG` (the group founder) when reporting results. First direct
look at Jordan's own material after 6 transcripts of Husky-only content.

**New:** first direct visual of Jordan's own dynamic band tool — see the
Priority Watch section above (revised after user correction) and the
"Jordan's own dynamic band tool" Theme Index entry. Visible elements: a
green/red colored zone (may be a manually-drawn per-test projection rather
than the live indicator), two unidentified blue curved lines (more likely
candidate for the actual band), and a `Live/Median/75th Pct` H-L-range-%
panel (may be a separate reference tool). **Initially misread as the same
median/75th-percentile statistic as Husky's existing daily forecasting
tool — the user corrected this**: it's a genuinely dynamic/continuously
recalculated band (ATR/Keltner/Bollinger-style), not that tool re-rendered
live. See the "Synthesis: defining entry zones from a rolling ATR/SD band"
section for the resulting buildable framework.

**Repeats:** none — this is genuinely new material, the first from Jordan
directly rather than Husky.

**Bollinger/band mentions:** this *is* the band, but the mechanism is
still not fully identified — see Priority Watch for the current (corrected)
reasoning.

**Worth researching:** yes — the ATR/SD-band entry-zone synthesis is now
the top backlog item and is buildable/testable independent of pinning down
Jordan's exact tool. Still want, ideally from future material: what the
two blue lines are, the actual period/multiplier, and whether the colored
zone is the live band or a manual per-test annotation.
