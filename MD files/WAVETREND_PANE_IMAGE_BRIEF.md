# Briefing an AI to build a "VuManChu pane → image" feature

**What this document is.** A handover brief. Give it to an AI coding agent (Claude
Code, Cursor, etc.) together with a short instruction, and it should be able to
build the feature without rediscovering — at your expense — the things that
actually make it hard.

**The feature.** A VuManChu Cipher B–style WaveTrend pane, rendered
**server-side as an image**, per instrument and per timeframe, on demand from an
API call — so it can be posted into a chat (Telegram/Discord/Slack) next to a
text alert. The point: instead of a message that says *"WT BEARISH −49, momentum
rolling over, bearish divergence"*, the reader sees the pane and reads it
themselves in one glance.

**Who this is for.** Anyone with (a) a source of OHLC candles, (b) somewhere they
already post automated text alerts, and (c) a habit of describing indicator
structure in words in those alerts.

This document is deliberately **implementation-agnostic** and contains no code
from the project it came out of. It is about the feature and its traps.

---

## 1. Start by pasting this

> I want a VuManChu Cipher B–style WaveTrend pane rendered **server-side as a PNG**,
> per symbol and timeframe, served from an API endpoint, so I can attach it to my
> automated chat alerts as a picture instead of describing the indicator in text.
>
> Read `WAVETREND_PANE_IMAGE_BRIEF.md` before you plan anything — it records the
> decisions you need from me and the failure modes that have already been hit
> building this once.
>
> Before writing code, ask me the questions in §2 of that doc. Do not guess my
> indicator settings and do not guess which series the yellow line is.

That last sentence matters more than it looks. Both are things an AI will happily
assume, and both silently produce a chart that is *not the one you look at*.

---

## 2. The five decisions the AI must get from you

An agent that starts coding before settling these will build the wrong chart
competently. Make it ask, or state them up front.

### 2.1 Which layers do you actually want?

A full Cipher B pane has a lot going on. Name only what you want drawn:

| Layer | What it is | Notes |
|---|---|---|
| WT1 + WT2 + the fill between them | The blue "wave" and its shaded body | The core. Almost certainly yes. |
| The yellow line | See §2.3 — **ambiguous, decide explicitly** | |
| Divergence lines | Straight lines joining two oscillator pivots, showing price/oscillator disagreement | The most useful non-obvious layer |
| Buy/sell dots | Small circles at WT crosses | Cheap to add, clutters fast |
| Money-flow area | The green/red band hugging zero (RSI+MFI) | **See the warning in §5.10** |
| Lower ribbon / stochastic strip | The coloured strip along the bottom | Often not worth it in a small image |

Deciding *not* to draw something is a real decision — say it out loud so the AI
doesn't add it back as a helpful extra.

### 2.2 Your indicator parameters — read them off your own chart

**Do not accept the stock preset.** The commonly published Cipher B defaults are
channel length 10, average length 21, signal length 4, with overbought/oversold
bands at ±53. Real users routinely run something else, and if the AI uses the
stock numbers the picture will not match the one on your screen — same indicator,
different wave.

Open your own chart, open the indicator settings, and read out:

- **Channel length** (`n1`) — the ESA/deviation smoothing period
- **Average length** (`n2`) — the WT1 smoothing period
- **Signal length** (`sp`) — the WT2 (signal line) period
- **Overbought / oversold levels** — the horizontal bands *drawn* on the pane
- **The divergence-zone levels** — see the next paragraph

> **The trap worth spelling out.** In many VuManChu configurations the levels used
> to *gate divergences* are a **separate, asymmetric pair**, different from the
> OB/OS bands drawn on the chart. Collapsing them into one setting is an easy and
> completely invisible mistake: the chart still renders, the bands still look
> right, and the set of divergences it reports quietly changes. Tell the AI these
> are **two independent settings** and give it both. Then ask it to write a test
> that pins them.

### 2.3 Which series is the yellow line?

There are two different things people call the VWAP oscillator, they are *not*
the same quantity, and this is the single most likely thing for an AI to get
wrong because both are defensible:

- **`wt1 − wt2`** — the difference between the wave and its signal line. This is
  what the Pine source calls `wtVwap`. It oscillates tightly about zero.
- **Distance from a cumulative VWAP**, usually normalised to ±100.

If your yellow line hugs zero with small amplitude, it is almost certainly the
first. If unsure, have the AI implement it as a **switchable option** and render
both so you can eyeball them against your chart. There is a hard measurable
difference — see §5.4, which is the reason this is a decision and not a detail.

### 2.4 Where does the image go?

- **API only** — an endpoint you call; you wire up posting later. Lowest risk.
- **Auto-attached** to existing alerts — the bot posts text, then the image.
- **Both.**

If you already have working text alerts, prefer *adding* a photo alongside them
over *converting* them. §5.7 explains why converting can truncate live alerts.

### 2.5 How is the image rasterised?

Two honest options, and the right answer depends on your deployment:

| | Headless browser (Playwright/Puppeteer) | Direct pixel encoder |
|---|---|---|
| How | Draw to a `<canvas>` in a real browser, screenshot it | Write pixels into a buffer, encode a PNG with the platform's built-in zlib/deflate |
| Pros | Real fonts and text layout, familiar canvas API, easy | No browser, no image library, fast (tens of ms), trivially testable offline |
| Cons | Large install (hundreds of MB), extra memory per render, slow container builds, another moving part in production | You hand-roll the drawing primitives and text; usually means a small bitmap font and ALL-CAPS labels |

**Ask the deciding question:** *does my deployment already have a working headless
browser?* Having the library listed as a dependency is **not** the same as having
the browser binary installed — that is a separate install step, and it is easy to
believe you have one when you don't. If you don't, and the pane is simple lines
and filled bands, the direct encoder is very often the better trade: no build
change, no extra memory, and it runs in a sandbox with no network so the AI can
actually test it.

If you go the direct-encoder route, tell the AI it needs: coverage-based
anti-aliasing (otherwise lines look stair-stepped), a fill-between-two-series
primitive, dashed lines, filled circles, and text. That is genuinely all.

---

## 3. What to hand the AI

1. **Your Pine script**, if you have it. This removes essentially all guesswork
   about which plot is which colour and what the yellow line is. If you can't
   share it, a **screenshot of the pane you want to reproduce** plus §2.2's
   settings gets most of the way.
2. **How to fetch candles** — the data source, and crucially the **shape** of what
   it returns (see §5.1 and §5.2, which are both about that shape).
3. **Whether your instruments have real volume.** For spot FX the answer is
   usually no — only tick counts. This decides whether any volume-based layer is
   meaningful (§5.10).
4. **Where the alerts post**, and the credentials or how to reach them.
5. **A reference screenshot.** Cheap and worth a lot: it is the only thing that
   catches "the maths is right but it doesn't look like my chart."

---

## 4. The maths, so nothing gets invented

Give the AI this explicitly; it stops a plausible-but-wrong reimplementation.

**WaveTrend** (the classic formulation Cipher B is built on):

```
hlc3 = (high + low + close) / 3
esa  = EMA(hlc3, n1)
d    = EMA(abs(hlc3 - esa), n1)
ci   = (hlc3 - esa) / (0.015 * d)
WT1  = EMA(ci, n2)
WT2  = SMA(WT1, sp)
```

Guard `d` against zero before dividing — use a small epsilon, and use **one**
epsilon everywhere. Two copies of this formula with different guards is a classic
silent-divergence bug.

**Divergences.** A divergence compares two consecutive oscillator pivots against
what price did between them:

| Type | Price | Oscillator | Reads as |
|---|---|---|---|
| Regular bear | higher high | lower high | exhaustion → reversal down |
| Regular bull | lower low | higher low | exhaustion → reversal up |
| Hidden bear | lower high | higher high | continuation down |
| Hidden bull | higher low | lower low | continuation up |

Pivots are an *n*-bar fractal (strictly higher/lower than *n* bars either side;
VuManChu's 5-bar fractal means n=2). Key instructions to pass on:

- Detect divergences on the **signal line (WT2)**, not WT1 — that's what the
  indicator keys off.
- **Regular** divergences are gated to the overbought/oversold zone; **hidden**
  ones are conventionally ungated.
- Write the detector so it takes **any oscillator series as an argument**. Then the
  same code finds divergences on the wave *and* on the yellow line, with no
  second copy. This is the single best structural decision in the whole feature.
- A pivot at bar *i* is only confirmable at *i+n*. If you ever use this for
  signals rather than pictures, that lag is real and must not be wished away.

---

## 5. Ten traps that cost real time

This is the part worth handing over. Each of these was hit for real.

### 5.1 Bar order will silently mirror your chart
Many candle APIs and internal helpers return **newest-first**; indicator maths
needs **oldest-first**. Get it backwards and nothing errors — you get a
plausible, smooth, completely mirrored chart. Tell the AI to state the required
order in the function's contract and to be explicit at every call site. Beware
helpers that already reverse for a UI's benefit.

### 5.2 String OHLC concatenates instead of adding
JSON APIs commonly return prices as **strings** (`"1.10925"`). `(high + low +
close) / 3` on strings gives string concatenation, then a garbage number. It
won't throw. Parse to float at the boundary, once, and say so.

### 5.3 Compute on more bars than you draw
EMAs seeded at the first value need a warm-up, and an `SMA` signal line produces
leading empty values. If you compute on exactly the bars you display, the left
edge of the image is a meaningless transient. Instruct: **fetch extra history,
compute on all of it, draw only the last N bars.** Also find divergences on the
full series and draw the ones whose pivots land in the visible window.

### 5.4 WaveTrend is scale-invariant — which breaks naive test fixtures
This one is genuinely counter-intuitive and will waste an afternoon. The channel
index divides by an EMA of its *own* mean absolute deviation. So if you build a
synthetic market with a **gradually shrinking** price swing expecting the
oscillator to shrink with it, it won't: numerator and denominator shrink together
and the wave amplitude barely moves. In practice a smooth amplitude decay over a
few hundred bars produced *one* divergence — inside the warm-up.

What does bend the oscillator away from price is a **step change faster than the
channel EMA can adapt to**. A "staircase" fixture — each segment steps the trend
up and cuts the swing amplitude — reliably produces regular bear divergences
(mirror it for bull). Tell the AI this so its test fixtures work, and so it
doesn't conclude its detector is broken when the detector is fine.

### 5.5 A cumulative VWAP anchored at bar zero stops oscillating
Directly relevant to §2.3. If the yellow line is "distance from cumulative VWAP"
and that VWAP is anchored at bar 0 of an arbitrary lookback window, then once
price trends the distance drifts monotonically: measured on a trending fixture it
ran one-way to the normalisation ceiling and produced **zero** divergences, while
`wt1 − wt2` oscillated about zero and produced five. If the yellow line is
supposed to be a divergence source, the version that finds none can't be right.

Two lessons: pick the series **by measuring**, not by preference; and if any
existing code in your project consumes a bar-0-anchored VWAP oscillator on
arbitrary windows, that is worth a look on its own.

### 5.6 Text and value labels collide, and only your eyes will catch it
Two series sitting a point apart print their value labels on top of each other. A
footer note lands on top of the first time-axis label. Every automated test
passes. **Instruct the AI to render a sample image and actually look at it**, then
to de-overlap label stacks and give each annotation its own region. Pixel
assertions cannot see "this looks wrong."

### 5.7 Chat platforms cap image captions well below message length
Telegram allows **1024 characters on a photo caption** versus 4096 on a text
message; other platforms have their own limits. If your existing alert text is
long — and a good one with a plain-English explanation block usually is — folding
it into a caption **truncates live alerts**. Keep the text message as it is and
send the image as a separate post with a short caption. Have the AI write a test
that the generated caption fits the cap.

### 5.8 The picture and the caption must come from the same bars
If the text alert computes the indicator from one series and the image fetches its
own, they will eventually disagree — and a picture contradicting the sentence next
to it is worse than no picture. Instruct: **extract the bar-preparation step once
and have both the text and the image call it.** If the AI is about to copy that
prep, that is the moment to stop it.

### 5.9 "It returned an image" is not "it returned a valid image"
A PNG encoder can produce a buffer that no viewer will open. Demand that the test
suite **decodes the emitted bytes back to pixels** — walk the chunks, verify the
CRCs, inflate the data, un-filter the scanlines, then assert on actual pixel
colours (e.g. "there are blue pixels where the wave should be", "there are no red
pixels inside the plot when there are no divergences"). Without this, "returns a
Buffer" passes for working.

### 5.10 Money flow is unreliable where there is no real volume
Spot FX has no consolidated volume — feeds give tick counts, which are a proxy
for activity, not for size. Any money-flow or volume-weighted layer is on sand
there. Either drop it (it also happens to be the most visually cluttered layer)
or state plainly that it's a tick-count proxy. Don't let it quietly become part of
a decision rule.

---

## 6. Make the AI prove it

Ask for all of these, and treat anything missing as not done:

- [ ] **Look at the output.** A rendered sample image, actually inspected, and
      compared against your reference screenshot.
- [ ] **Pixel-level decode test** (§5.9), not just "returns a buffer".
- [ ] **Your parameters pinned in a test**, so a later "tidy-up" to the stock
      preset fails loudly instead of silently changing the chart.
- [ ] **A test that the divergence gate is independent of the drawn bands** (§2.2).
- [ ] **The measurement behind the yellow-line choice**, written down (§5.5) — not
      an assertion that one is correct.
- [ ] **Endpoint behaviour**: valid params render; bad symbol/timeframe/format give
      clean errors, not stack traces; out-of-range sizes clamp.
- [ ] **Caption length test** against your platform's cap (§5.7).
- [ ] **Render timing.** A pane should be tens of milliseconds. If it's seconds,
      something is wrong.
- [ ] **Determinism**: same input → same bytes.
- [ ] **Graceful degradation**: too few bars should refuse clearly, and a failed
      image must never block the text alert it accompanies.

A good agent will also tell you what it *couldn't* verify. In this build, the
auto-attach path could only be tested against a stubbed chat API — the real thing
waits for a live alert. That's the correct thing to say out loud.

---

## 7. A full brief you can paste

> Build a VuManChu Cipher B–style WaveTrend pane, rendered server-side as a PNG,
> per symbol and timeframe, served from an API endpoint, and attach it to my
> automated chat alerts as a photo.
>
> **Layers:** WT1 + WT2 with the fill between them, the OB/OS and zero gridlines,
> the yellow line, and divergence lines on both the wave and the yellow line.
> No money flow. No buy/sell dots.
>
> **My indicator settings:** channel `<n1>`, average `<n2>`, signal `<sp>`,
> OB/OS bands drawn at `<+X / −Y>`, divergence-zone gates at `<+A / −B>`. These
> gates are a SEPARATE setting from the drawn bands — keep them independent and
> pin both in a test.
>
> **Yellow line:** implement `wt1 − wt2` and "distance from cumulative VWAP" as a
> switchable option, default to whichever you can show me actually oscillates
> about zero and produces divergences on trending data. Show me the measurement.
>
> **Data:** candles come from `<source>`; note the returned order and whether
> prices are strings. Bars fed to the indicator must be oldest-first.
>
> **Delivery:** a `GET` endpoint returning `png`, plus a `json` variant with the
> current reading and divergence list to drive a caption, plus a small page for me
> to preview and push one to chat. Then attach the image to my existing alerts as
> a SEPARATE post — do not fold my alert text into the caption.
>
> **Before coding:** read `WAVETREND_PANE_IMAGE_BRIEF.md`, ask me anything in §2
> that I haven't specified above, and tell me which rasterising approach you're
> using and why — check whether a headless browser is actually installed in my
> deployment before assuming one.
>
> **Before telling me it's done:** work through the §6 checklist, and render a
> sample image and look at it.

---

## 8. One honest note on scope

This feature makes an existing read **visible**. It does not make it profitable.

Drawing WaveTrend and its divergences beautifully says nothing about whether
WaveTrend or its divergences predict anything. Mechanical divergence rules are
widely tested and widely disappointing, and experienced discretionary users of
this indicator tend to say the scripted auto-divergence is explicitly *not* where
their edge comes from.

So: build it as a **communication tool** — a picture that saves a reader from
parsing a sentence — and keep that separate from any claim about edge. If someone
wants to know whether the structure in the picture is *tradeable*, that is a
different piece of work with a different bar: real costs, and an out-of-sample
split. Don't let a good-looking chart stand in for that evidence.
