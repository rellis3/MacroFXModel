# Theory Lab / COG Hub — Lesson Style Guide

This documents the visual system used across `theory-lab/lessons/*.html` and
`cog/lessons/*.html` — every component, when to use it, and copy-pasteable
markup — so a future lesson (or a future redesign pass) can be built the same
way without re-deriving it from scratch.

**Canonical reference file:** `theory-lab/lessons/primer-stats-normal.html`.
When in doubt, open that file and copy the pattern directly — this guide is a
map of it, not a replacement for reading it.

**Shared stylesheet:** `theory-lab/assets/theory.css`. Every class below is
already defined there. `cog/lessons/*.html` reuse the same file via
`../../theory-lab/assets/theory.css` — never copy the CSS, only the markup.

---

## 1. Where things live

```
theory-lab/
  hub.html            — curriculum map / card grid, links to every lesson
  glossary.html        — searchable notation glossary (symbols → meaning)
  assets/theory.css    — the ONE shared stylesheet for both folders
  lessons/*.html        — from-scratch theory lessons

cog/
  hub.html             — curriculum map for the two "applied practice" categories
  lessons/*.html        — practitioner-workflow lessons + the COG case study
```

A new lesson is always one self-contained `.html` file in one of the two
`lessons/` folders, plus one new card added to the matching `hub.html`.
**Never** create a new CSS file or duplicate `theory.css` — both folders
import the same one.

---

## 2. Page skeleton

Every lesson starts with the same `<head>` boilerplate and the same top-of-page
block, in this order. Copy this verbatim for a new lesson (adjust the title,
crumb text, and relative path depth — `cog/lessons/` is one directory deeper
than `theory-lab/lessons/`, so its `href`s to `theory.css`/`glossary.html`/
`hub.html` go through `../../theory-lab/...` instead of `../...`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lesson Title — Theory Lab — MacroFX</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/theory.css">
<script>window.MathJax = { tex: { inlineMath: [['\\(','\\)']], displayMath: [['\\[','\\]']] } };</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" id="MathJax-script" async></script>
</head>
<body>
<div id="page">
  <div class="tl-crumb"><a href="../hub.html">Theory Lab</a> / Category Name / Lesson Title</div>
  <div class="tl-glosslink">🔎 <a href="../glossary.html">Notation Glossary</a> — what σ, Δ, θ and the rest actually mean</div>
  <div class="tl-kicker">Category · Lesson N of M</div>
  <h1 class="tl-title">Lesson Title</h1>
  <p class="tl-dek">One-sentence hook — what this lesson gives the reader.</p>
  <div class="tl-meta">
    <span class="tl-status concept">CONCEPT — not built or tested anywhere in this repo</span>
    <span>~15 min read</span>
    <span>Prereqs: primer-stats-normal.html</span>
  </div>
  ...body...
</div>
</body>
</html>
```

`.tl-status` variants (pick exactly one, this is the epistemic-honesty badge
required by `CLAUDE.md`'s Lego Principle #5 — never omit it):
| Class | Color | Meaning |
|---|---|---|
| `.tl-status.concept` | blue | Explained here, not built or tested in this repo. Background knowledge, not a claim. |
| `.tl-status.candidate` | amber | A candidate idea — considered but not validated. |
| `.tl-status.course` | green | Applied/course-notes material, or "already in use" — a real, running brick this lesson documents the math behind. |

---

## 3. Body content order (the house format)

Every lesson follows this order — it's what makes 65 lessons feel like one
curriculum instead of 65 one-off pages. Skip a section only if it genuinely
doesn't apply (e.g. a pure-workflow cog lesson may have no formulas).

1. **TL;DR** (`.tl-tldr`) — 4-6 bullets, the whole lesson skimmed in 30 seconds.
2. **Why this matters** (`<h2>`) — where this concept is used elsewhere in the curriculum/repo.
3. **Plain-English intuition** (`.tl-box.intuition`) — the idea with zero notation, before any math.
4. **The math, step by step** (`<h2>`) — every formula, symbol-by-symbol, building up from nothing.
5. **Symbols table** (`.tl-symbols`) — every symbol used on the page, one row each.
6. **Chart(s)** (`.tl-chart`) — at least one illustrative SVG; interactive where it adds value.
7. **Worked example** (`.tl-box.example`) — real numbers, every step shown.
8. **Real-world trading scenario** (`.tl-box.scenario`) — a named, concrete situation applying the numbers (amber).
9. **How practitioners actually use this** (`<h2>`) — the applied angle.
10. **Where this connects to MacroFXModel** (`.tl-box.repo`) — an honest note: already-built brick, or not built at all. Never imply validation that hasn't happened.
11. **Common pitfalls** (`.tl-box.pitfall`) — where people get this wrong in practice.
12. **Key Takeaways** (`<h2>` + `.tl-takeaways`) — closing bulleted recap (see §5).
13. **Self-test** (`<h2>` + `.tl-quiz`) — 4-6 questions, answers in a `<details>`.
14. **Further reading** (collapsed `<details class="tl-section-collapse">`) — real, correctly attributed sources.
15. **Footer nav** (`.tl-footer-nav`) — back to hub / next lesson.

Every lesson also carries the VARK layer (§5.20), slotted into this order: the summary
picture and the spoken version straight after the TL;DR; the equation build-up straight
after the maths `<h2>`; a predict-first task inside the main "Try it yourself" box; a
scenario drill just before Key Takeaways; and "Where this fits" just before the footer nav.

---

## 4. Section dividers — `.tl-section-mark`

Put one immediately before every visible `<h2>` in the body (steps 2, 4, 9,
12, 13 above), numbered sequentially through the whole page. **Skip** the
"Further reading" heading — it already has its own disclosure-triangle
styling and doesn't need a section mark.

```html
<div class="tl-section-mark"><span>Section 01</span></div>
<h2>Why this matters</h2>
```

---

## 5. Every component: purpose + markup

### 5.1 Callout boxes — `.tl-box`

The five semantic box types, each with a leading icon badge (add the badge as
the box's first child, before `.tl-box-label`):

| Variant | Border/badge color | Icon | Use for |
|---|---|---|---|
| `.tl-box.intuition` | blue | 💡 | Plain-English explanation before the math |
| `.tl-box.example` | purple | 🧮 | A worked numeric example |
| `.tl-box.scenario` | amber | 🎯 | A named real-world trading scenario |
| `.tl-box.repo` | green | 🧩 | Honest connection to an actual repo module |
| `.tl-box.pitfall` | red | ⚠️ | Common mistakes / where this breaks |

```html
<div class="tl-box intuition">
  <div class="tl-icon-badge blue">💡</div>
  <div class="tl-box-label">Plain-English intuition</div>
  <h3>A short, punchy question the section answers</h3>
  <p>...</p>
</div>
```

### 5.2 Math + equation breakdown

```html
<div class="tl-math">
  \[ z = \frac{x - \mu}{\sigma} \]
</div>
<div class="tl-eq-break">
  <div class="tl-eq-chip c1"><code>z</code><span>the z-score — unitless</span></div>
  <div class="tl-eq-chip c3"><code>x</code><span>the value being scored</span></div>
  <div class="tl-eq-chip c2"><code>σ</code><span>the yardstick the deviation is measured in</span></div>
</div>
```

Add one `.tl-eq-break` under **every** `.tl-math` display block (skip trivial
numeric-substitution steps inside a worked example — those don't need
re-explaining symbol by symbol). Cycle the chip color classes `c1`(blue) /
`c2`(green) / `c3`(purple) / `c4`(amber) — the color has no fixed meaning
here, it's just for visual variety across chips in the same row.

### 5.3 Formula-parts — the bigger, bolder sibling of eq-break

Reserve for the **one** formula a lesson is built around (usually the
title concept's defining equation). 2-4 cards, one per term:

```html
<div class="tl-formula-parts">
  <div class="tl-fp blue"><div class="tl-fp-term">x − μ</div><div class="tl-fp-name">The deviation</div><div class="tl-fp-desc">How far from the mean, in original units</div></div>
  <div class="tl-fp amber"><div class="tl-fp-term">σ</div><div class="tl-fp-name">The yardstick</div><div class="tl-fp-desc">Also in original units — dividing cancels them</div></div>
  <div class="tl-fp purple"><div class="tl-fp-term">z</div><div class="tl-fp-name">The result</div><div class="tl-fp-desc">A pure, unitless number</div></div>
</div>
```
Color variants: `blue` / `green` / `amber` / `purple` (no fixed semantic
meaning — pick for visual contrast between cards in the same row).

### 5.4 Symbols table

```html
<div class="tl-symbols"><table>
  <tr><td>\(\sigma\)</td><td>Standard deviation — how wide the bell is.</td></tr>
  <tr><td>\(\mu\)</td><td>(mu) The mean — where the peak sits.</td></tr>
</table></div>
```
First column is always the bare symbol (monospace, amber); second column is
the plain-English meaning. Every symbol used anywhere on the page should have
a row here — this is the "read this instead of the glossary" fallback.

### 5.5 Icon cards — `.tl-icard-grid`

For "here are 3-5 related things" instead of a bulleted list — cross-lesson
references, data sources, workflow inputs, causes, assumptions:

```html
<div class="tl-icard-grid">
  <div class="tl-icard">
    <div class="tl-icon-badge blue">📉</div>
    <h4>Ornstein-Uhlenbeck</h4>
    <p>Talks about a stationary variance — meaningless until you know what variance itself is.</p>
  </div>
  <!-- 2-4 more .tl-icard blocks -->
</div>
```
2-column grid, collapses to 1 column under 600px automatically.

### 5.6 Stat tiles — `.tl-stat-row`

A row of big colored numbers, for a fact worth a glance rather than a
sentence (e.g. the 68/95/99.7 rule):

```html
<div class="tl-stat-row">
  <div class="tl-stat blue"><div class="tl-stat-num">68%</div><div class="tl-stat-label">within ±1σ</div><div class="tl-stat-sub">a normal, unremarkable day</div></div>
  <div class="tl-stat green"><div class="tl-stat-num">95%</div><div class="tl-stat-label">within ±2σ</div><div class="tl-stat-sub">worth a second look</div></div>
  <div class="tl-stat purple"><div class="tl-stat-num">99.7%</div><div class="tl-stat-label">within ±3σ</div><div class="tl-stat-sub">a genuine tail event</div></div>
</div>
```
Color variants: `blue` / `green` / `purple` / `amber`. `.tl-stat-sub` is
optional (a small third line under the label).

### 5.7 Numbered steps — `.tl-steps`

For "do this, then this" sequences — a worked example's steps, a practitioner
workflow, a checklist — instead of bolded "Step 1 — ..." paragraphs:

```html
<div class="tl-steps">
  <div class="tl-step">
    <div class="tl-step-num">1</div>
    <div class="tl-step-body">
      <h4>The mean</h4>
      <p>Sum the values and divide by n:</p>
      <div class="tl-math">\[ \bar{x} = \frac{1}{n}\sum x_i \]</div>
    </div>
  </div>
  <!-- more .tl-step blocks, numbered 2, 3, 4... -->
</div>
```

### 5.8 Side-by-side comparison — `.tl-compare`

For "A vs. B" content — two competing fixes, population vs. sample, two
models — read far faster next to each other than as consecutive paragraphs:

```html
<div class="tl-compare">
  <div class="tl-compare-card amber">
    <h4>Fix 1 — take the absolute value first</h4>
    <p>...</p>
  </div>
  <div class="tl-compare-card purple">
    <h4>Fix 2 — square the deviations first</h4>
    <p>...</p>
  </div>
</div>
```
Color variants: `blue` / `green` / `amber` / `purple` (colors the top border
+ heading). 2-column grid, collapses to 1 column under 600px.

### 5.9 Solid callouts — `.tl-solid`

A full tinted-background box (bolder than `.tl-box`'s thin left-border) for
**one** especially sharp warning or insight per lesson. Don't overuse —
one or two per lesson, reserved for the single sharpest "gotcha":

```html
<div class="tl-solid red">
  <strong>The trap:</strong> the plain average deviation is always exactly
  zero, no matter how spread out the data really is — completely useless as
  a measure of spread.
</div>
```
Color variants: `red` (a trap/mistake) / `amber` (a caveat) / `green` (a
confirmed good practice) / `blue` (a neutral but important fact).

### 5.10 Inline pill — `.tl-pill`

A small colored badge for a value inside a sentence or table cell. Use
sparingly:

```html
<span class="tl-pill blue">σ ≈ 0.08%</span>
```
Color variants: `blue` / `green` / `red` / `amber`.

### 5.11 Key Takeaways — `.tl-takeaways`

The closing bulleted recap, placed right before Self-test. 4-7 rows, mostly
green with 1-2 amber (or red, for an honest hard warning) caveats:

```html
<div class="tl-section-mark"><span>Section 04</span></div>
<h2>Key Takeaways</h2>
<div class="tl-takeaways">
  <div class="tl-takeaway green"><span class="tl-takeaway-icon">✓</span><span><strong>Square deviations, don't average them raw.</strong> Raw deviations always sum to zero.</span></div>
  <div class="tl-takeaway amber"><span class="tl-takeaway-icon">⚠</span><span><strong>Real returns are fatter-tailed than normal.</strong> The 68/95/99.7 rule is an idealization, not a guarantee.</span></div>
</div>
```
Color variants and icon convention:
| Class | Icon | Meaning |
|---|---|---|
| `.tl-takeaway.green` | ✓ | Core lesson / remember this |
| `.tl-takeaway.amber` | ⚠ | Watch out for this / a caveat |
| `.tl-takeaway.red` | (pick a fitting glyph, e.g. ✗) | A hard warning, or an honest null/negative result — never soften this into a green row |
| `.tl-takeaway.blue` | (any neutral glyph) | A neutral fact, no judgment attached |

**House rule (non-negotiable):** if a lesson documents a tested null result
or an honest "this doesn't work" finding (see `cog/lessons/cog-reverse-engineering.html`
or `cog/lessons/cog-gate-system.html` for real examples), that finding **must**
appear as a red or amber takeaway — never rewritten to sound more positive
than it is. This matches `CLAUDE.md`'s "built ≠ works ≠ has edge" discipline.

### 5.12 Self-test

```html
<h2>Self-test</h2>
<details class="tl-quiz">
  <summary>Q1. The question, can include \(\LaTeX\)?</summary>
  <div class="tl-answer">The full answer, explaining the reasoning, not just the result.</div>
</details>
```

### 5.13 Further reading (collapsed)

```html
<details class="tl-section-collapse">
<summary><h2>Further reading</h2></summary>
<ul class="tl-refs">
  <li>Real, correctly attributed source — author, title, year, and why it matters here.</li>
</ul>
</details>
```

### 5.14 Footer nav

```html
<div class="tl-footer-nav">
  <a href="../hub.html">← Theory Lab hub</a>
  <a href="next-lesson.html">Next Lesson Title →</a>
</div>
```

### 5.15 Charts — hand-built SVG, no libraries

```html
<div class="tl-chart">
  <div class="tl-chart-label">What this chart shows</div>
  <svg viewBox="0 0 640 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Accessible description">
    <!-- hand-drawn paths/shapes using var(--blue) etc. for color -->
  </svg>
  <div class="tl-chart-caption">Caption explaining what to take away from it.</div>
</div>
```
Add `.tl-chart.interactive` plus a `.tl-controls`/`.tl-control` block (see
`primer-stats-normal.html`'s z-score slider) if the chart recomputes live via
a `<script>` — real math (e.g. the erf-based normal CDF), no fake numbers.

### 5.16 Story layer — `.tl-chain`, `.tl-verdict`, `.tl-story`

For lessons that bring theory to life: a real episode, the causal chain it ran
through, and what this desk found when it tested the claim.

```html
<div class="tl-chain">
  <div class="tl-chain-link shock"><b>Shock</b>Bond volatility jumps</div>
  <div class="tl-chain-arrow">→</div>
  <div class="tl-chain-link"><b>Dealers</b>Raise haircuts, shrink inventory</div>
  <div class="tl-chain-arrow">→</div>
  <div class="tl-chain-link end"><b>Outcome</b>Liquidity thins, vol rises further</div>
</div>

<div class="tl-verdict null">
  <span class="tl-verdict-tag">Null</span>
  <span><strong>Tested here:</strong> what the desk found, with n and the effect.</span>
</div>

<div class="tl-story">
  <div class="tl-story-label">It actually happened</div>
  <h3>September 2019: the repo spike</h3>
  <p>...</p>
</div>
```

Mark the one link that is the lesson's own concept with `.concept` (purple, 2px) and a
"★ This lesson · …" label: `<div class="tl-chain-link concept"><b>★ This lesson · VaR</b>…</div>`
(slides: `.sl-chain-link.concept`). No inline styles on chain links.

**Framing (non-negotiable).** A verdict is about *this desk's test of a trading
claim*, never about the theory the lesson teaches. Tag text says what was tested:
"Desk test: held up", "Desk test: nothing found", "Desk data: base rate",
"Desk test: too small to tell", "Not tested here". Every "nothing found" / "too small"
box carries the scope line (added by `verdicts.js`): one desk's test, on its own data,
instruments and period; not a verdict on the theory; the test itself may be what is off.
Write takeaways the same way ("the desk's test found nothing"), never "the theory is wrong".

`.tl-verdict` variants match `js/deskEvidence.js`: `validated` (green), `null`
(red), `context` (blue), `underpowered` / `untested` (amber). Quote the ledger
entry's own numbers; never round a null up. Slide decks use `.sl-chain` /
`.sl-chain-link` / `.sl-stamp` / `.sl-stamp-tag` from `deck.css`, same variants.

**Live verdicts (required whenever the ledger has an entry).** Tag the box with
the ledger id and the ledger entry's date at the time of writing, and load the
filler script before `</body>`:

```html
<div class="tl-verdict null" data-evidence="funding-stress" data-evidence-date="2026-10-02">
  <span class="tl-verdict-tag">Null</span><span>authored text</span></div>
...
<script src="../assets/verdicts.js" defer></script>
```

On the served site the script fetches `/theory-lab/desk-verdicts.json?ids=…`
(only the ids asked for, only verdict/date/claim/result) and sets the tag from
the ledger's *current* verdict, adds a collapsed "What the desk found", and
shows an amber "re-tested since this lesson was written" note when the ledger
entry is newer than `data-evidence-date` or the verdict changed. Offline it
leaves the authored box untouched. `untested` boxes carry no `data-evidence`.
`node js/lessonEvidence.test.mjs` checks every tag names a real ledger id,
carries a date, and that its page loads the script; it also lists boxes written
against an older entry so the prose can be refreshed.

### 5.17 How it reached trading — `.tl-origin` + `.tl-role`

For maths/ML lessons. Trading-first: who brought the idea into markets, when,
and what traders could not do before it; then its job in the analysis. At most
one clause on a non-finance origin, and only when it genuinely helps.

```html
<div class="tl-origin">
  <div class="tl-origin-label">How it reached trading</div>
  <h3>A hedge ratio that won't sit still</h3>
  <div class="tl-origin-who">Kalman filter · into markets from the 1980s–90s</div>
  <p>...</p>
  <div class="tl-role">
    <div class="tl-role-stages">
      <span class="tl-role-stage">Data</span><span class="tl-role-stage on">Model</span>
      <span class="tl-role-stage on">Signal</span><span class="tl-role-stage">Test</span>
      <span class="tl-role-stage">Size &amp; risk</span><span class="tl-role-stage">Execute</span>
    </div>
    <dl>
      <dt>Its job</dt><dd>The question it answers in the analysis.</dd>
      <dt>Takes in</dt><dd>What feeds it (link the lesson).</dd>
      <dt>Hands on to</dt><dd>What uses its output (link the lesson).</dd>
    </dl>
  </div>
</div>
```
Slides: `.sl-origin` + `.sl-origin-label`, with `.sl-role-stages` / `.sl-role-stage(.on)`.

### 5.18 Desk-only material — `<!-- DESK:START -->` / `<!-- DESK:END -->`

The Theory Lab is shared with other readers, so anything about the owner's
own desk or codebase (verdict boxes, "checked against this repo" callouts,
status-badge tails, house rules) is wrapped in a marker pair. One source
serves both audiences: the server strips every marked span for any reader
who is not logged in with the education **admin** password
(`HIDE_DESK_EDUCATION`, on by default; `0` turns stripping off).

```html
<!-- DESK:START -->
<div class="tl-verdict validated" data-evidence="…">…</div>
<!-- DESK:END -->

…a worked numeric example<!-- DESK:START -->, then how it maps to the build<!-- DESK:END -->.
```

Rules:
- Pairs never nest. Wrap a whole element, or a clause inside one sentence
  that still reads correctly without it.
- Don't hand-fix numbering: the strip renumbers section marks, "Section N"
  kickers, `Q#` summaries, quiz numbers and recap rows itself.
- Client-side desk extras check `window.TL_DESK`, which is set by a
  `<script>window.TL_DESK = 1;</script>` placed inside a marker pair.
- `market-reading.html` and the two capstone workbenches are admin-only
  pages (404 for everyone else).
- `node js/deskStrip.test.mjs` fails on any desk or repo mention left
  outside markers, on unpaired markers, and on a page whose tags no longer
  balance once stripped.

### 5.19 "Watch it" whiteboard animations — `.wb`

A step-through, hand-drawn animation for explanations where one thing drives
another: boxes and arrows draw themselves on, numbers count, captions (optionally
read aloud) say what just happened. Load `assets/whiteboard.css` in the head and
`assets/whiteboard.js` (defer) before `</body>`, then:

```html
<div class="wb" data-title="The yen carry unwind, drawn step by step">
  <script type="application/json">{ "w": 600, "h": 440, "intro": "…", "steps": [
    { "cap": "End of July 2024: the Bank of Japan raises rates.",
      "do": [ { "box": "boj", "x": 15, "y": 20, "w": 160, "h": 66, "text": "BoJ hikes", "sub": "31 July", "tone": "amber" } ] },
    { "cap": "…", "do": [ { "arrow": ["boj", "gap"] }, { "count": "jpy", "from": 161.9, "to": 141.7, "dp": 1 } ] }
  ] }</script>
</div>
```

The control bar has a speed button (1× → 1.5× → 2× → 3×). It is one setting for every
board, remembered across pages; every animation time runs through `T()` in the player,
so a new op that animates must pass its durations through `T()` too.

In a visual guide, give the board its own slide right after the slide it
illustrates (kicker `▶ Watch it`). Each board is one scene file in
`education/tools/whiteboards/<name>.py` (helpers in `_wb.py`) defining `BOARD`;
`python3 education/tools/build_whiteboards.py [name]` inserts it into the full lesson
and the deck and renumbers the deck's `data-slide`s. Every run also rewrites `theory-lab/watch.html`
(the index of all boards, linking to `lesson.html#wb-<name>`) and the ▶ badge on
each hub card whose lesson has a board, so a new board shows up there by itself.

Draw the *thing*, not a label for it: the `icon` op has ~30 hand-drawn doodles (bank
with ¥/$, cash stack, house, factory, ship, barrel, gold, bond scroll, piggy-bank
pension fund, person, crowd, bolt, rocket, fire, shield, ice cube, clock, …) that
can move — money flowing from a bank to a trader beats a box saying "borrow".

Ops: `box`, `chip` + `move`, `arrow` (`label`, `bend`, `dash`), `note`, `line`,
`count`, `sub`, `pulse`, `dim`, `hide`, `cross`, plus mini charts — `chart` (a
frame with data axes), `series` (draw-on line, solid or dashed), `gap` (shaded band
between two lines), `dot` (labelled point) and `bars` (grow from zero) — documented
at the top of `whiteboard.js`. Prefer drawing the actual move (a gap pinching, a
price falling, a bar dropping) to a box that names it; real numbers only, marked
"approx." where a path is interpolated. Rules: design at viewBox width 600 with text ≥ 17 (it shrinks to
~0.6× on a phone); leave ≥ 40 units between boxes an arrow joins; one idea per
step; every caption must be as accurate as the lesson text (it is the transcript
too). Best for causal chains, flows and mechanisms — not for derivations.

---

### 5.20 Teaching four ways (VARK) — `.tl-picture`, `.tl-eqbuild`, `.tl-listen`, `.tl-predict`, `.tl-drill`, `.tl-fits`

Every lesson teaches its one main idea four ways: **V**isual, **A**ural, **R**ead/write and
**K**inesthetic. The research does not support routing a learner to a "preferred style";
it does support giving everyone several routes into the same idea, so every lesson carries
all of these. The text, symbols table and self-test are the read layer and already exist.
Behaviour lives in `assets/vark.js` (load it right after `tts.js?v=6`). Without JS every
block shows in full, so nothing is ever locked away. Reference: `kelly-criterion.html`.

```html
<script src="../assets/tts.js?v=6" defer></script>
<script src="../assets/vark.js?v=1" defer></script>
```

**1. Summary picture (Visual) — straight after `.tl-tldr`.** One hand-built inline SVG that
shows the whole idea at a glance: the shape, not the detail. Use the `tlp-*` colour classes
(they follow the colour meanings in §6), real numbers from the lesson, and a full
`aria-label`. Keep it to about 600×200–260 and let text breathe; check it at phone width.

```html
<figure class="tl-picture">
  <div class="tl-picture-label">The whole idea in one picture</div>
  <svg viewBox="0 0 600 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What the picture shows, in a sentence.">
    <!-- tlp-box [blue|green|red|amber|purple], tlp-line [colour] [thick] [dash],
         text/shape fills: tlp-blue tlp-green tlp-red tlp-amber tlp-purple tlp-text tlp-text2 tlp-text3 -->
  </svg>
  <figcaption>One or two sentences: what to notice.</figcaption>
</figure>
```

**2. Spoken version (Aural) — straight after the picture.** A dialogue between a Trader and
a Quant, written for the ear: 14–22 short lines, about 3–5 minutes, no symbols or notation
(say "the square root of time", not √t), one worked number, the lesson's real episode, and
a one-line takeaway at the end. Every fact must already be in the lesson. `vark.js` gives it
Play/Pause/Stop with two voices and a transcript toggle; the main "Listen to this lesson"
reader skips it. `data-who` is exactly `Trader` or `Quant`.

```html
<section class="tl-listen" data-minutes="4">
  <div class="tl-listen-head">🎧 Listen · the four-minute version</div>
  <p class="tl-listen-intro">A trader and a quant talk the lesson through. No symbols, just the idea and one worked number, so it works on a walk or a commute.</p>
  <div class="tl-listen-script">
    <p data-who="Trader">…</p>
    <p data-who="Quant">…</p>
  </div>
</section>
```

**"Quiz me aloud" (Aural)** needs no markup: `vark.js` builds it above the first `.tl-quiz`.
It reads each question, waits (5–30 s, the reader picks), then reads the answer.

**3. Equation build-up (Visual) — straight after the maths `<h2>`.** The lesson's key formula
assembled in 3–6 steps, one term per step, the new term highlighted with
`\color{#fbbf24}{…}` and the finished result with `\color{#10b981}{…}`. Each step is the
whole equation so far plus one or two sentences on what the new term does. Lessons with no
formula build up their key relationship or rule the same way (a ratio, an identity, a
decision rule).

```html
<div class="tl-eqbuild">
  <div class="tl-eqbuild-label">Watch the formula build</div>
  <div class="tl-eqbuild-title">Where X comes from, one term at a time</div>
  <div class="tl-eqbuild-step">
    <div class="tl-math">\[ … \color{#fbbf24}{\text{new term}} \]</div>
    <p>What this term adds.</p>
  </div>
  <!-- 3–6 steps -->
</div>
```

**4. Predict first (Kinesthetic) — inside the main "Try it yourself" box**, after its intro
paragraph and before the controls. Ask for a number the reader can then check with the
controls just below (numeric), or a choice (put `data-correct` on the right `<li>`). If the
lesson has no "Try it yourself", put it at the top of the main interactive chart's box, or
failing that at the top of the worked example, and make the reveal point at where to check
it. The reveal gives the answer, the arithmetic, and what to try next.

```html
<div class="tl-predict" data-answer="20" data-tol="2" data-unit="%">
  <div class="tl-predict-q"><strong>Predict first.</strong> The question, and which control to move to check it.</div>
  <div class="tl-predict-reveal"><p><strong>20%.</strong> The arithmetic, and what to try next.</p></div>
</div>
<!-- choice form: -->
<div class="tl-predict">
  <div class="tl-predict-q"><strong>Predict first.</strong> …</div>
  <ul class="tl-predict-options"><li>…</li><li data-correct>…</li><li>…</li></ul>
  <div class="tl-predict-reveal"><p>…</p></div>
</div>
```

**5. Scenario drill (Kinesthetic) — just before the Key Takeaways section mark.** A dated,
real situation, a decision with 3–4 options, and the outcome hidden until the reader
commits. One option is `good`, the others `ok` or `bad`; each carries its reason. Use only
episodes you can state accurately (the lesson's own episode is the safest choice); dates,
numbers and what happened must be documented facts. If no real episode fits, write a
clearly labelled illustrative desk situation ("Scenario drill · an illustrative Monday")
and say in the outcome that it is illustrative. Never invent a historical fact.

```html
<div class="tl-drill" data-date="1998-08-21">
  <div class="tl-drill-label">Scenario drill · 21 August 1998</div>
  <h3>A short title for the situation</h3>
  <p>The setup: where you are, what you hold, what just happened. End with the question.</p>
  <ol class="tl-drill-options">
    <li data-verdict="bad">Option.<div class="tl-drill-why">Why it costs money.</div></li>
    <li data-verdict="good">Option.<div class="tl-drill-why">Why it is the best call.</div></li>
    <li data-verdict="ok">Option.<div class="tl-drill-why">Why it is defensible but not best.</div></li>
  </ol>
  <div class="tl-drill-outcome"><p><strong>What happened.</strong> …</p></div>
</div>
```

**6. Where this fits — just before `.tl-footer-nav`.** Two or three lessons to read first
and two or three to read next, each with a short reason, then one sentence on why a trader
would care. Link only lessons that exist, with their exact `<h1>` titles. A link to an
admin-only lesson (`institutional-*`, `action-*`) goes inside DESK markers, one `<li>` each.

```html
<nav class="tl-fits" aria-label="Where this lesson fits">
  <div class="tl-fits-label">Where this fits</div>
  <div class="tl-fits-col">
    <div class="tl-fits-k">Read first</div>
    <ul><li><a href="slug.html">Exact Title</a> <span>· why</span></li></ul>
  </div>
  <div class="tl-fits-col">
    <div class="tl-fits-k">Read next</div>
    <ul><li><a href="slug.html">Exact Title</a> <span>· why</span></li></ul>
  </div>
  <p class="tl-fits-why"><strong>Why you'd care:</strong> one sentence.</p>
</nav>
```

**7. A whiteboard (Visual)** — every lesson also gets a "▶ Watch it" board (§5.19).

All of these blocks are shared content: no desk or repo material inside them except
DESK-wrapped links in "Where this fits". Guesses and drill choices are kept in
`localStorage.theoryLabVark`, this browser only.

### 5.21 Spaced review — `#tl-review`

`assets/review.js` fills `<div id="tl-review" class="tl-review" hidden></div>` (hub and
Start page) with up to three self-test questions from lessons the reader finished 7+ days
ago, fetched from the lesson pages themselves. "I knew it" spaces the next review out
(7 → 21 → 60 → 150 days); "Shaky" brings it back in 7. State: `localStorage.theoryLabReview`.

## 6. Color system — what each color means

There's no single universal meaning across every component (a few are purely
decorative, see §5.2/§5.3/§5.8), but the **dominant convention** is:

| Color | Usual meaning |
|---|---|
| Blue | Neutral / concept / intuition / default |
| Green | Confirmed good, "do this," already-built, a positive takeaway |
| Red | Warning, mistake, pitfall, or an honest null/negative result |
| Amber | Caveat, watch-out, a scenario, or something not yet validated |
| Purple | Worked example, math-heavy content |

When a component's color is purely for visual variety (chip cycling, card
contrast), that's called out explicitly above — don't over-think a "correct"
color choice for those.

---

## 7. Checklist for a brand-new lesson

1. Copy `theory-lab/lessons/primer-stats-normal.html` as your starting
   skeleton (or pick a shorter recent lesson if the primer feels too long).
2. Update: `<title>`, crumb, kicker, `<h1>`, dek, meta row (status badge +
   read time + prereqs).
3. Write the TL;DR last, once the lesson is otherwise done — it should
   compress the finished lesson, not predict it.
4. Follow the body order in §3. Every formula gets an eq-break (§5.2); the
   page's central formula optionally also gets formula-parts (§5.3).
5. Add section marks (§4) before every visible `<h2>`.
6. Write the Key Takeaways section (§5.11) last, right before Self-test.
7. Add at least one real chart (§5.15) — interactive if the concept benefits
   from a slider/toggle.
8. Add the new lesson as a card to the matching `hub.html` (`theory-lab/hub.html`
   or `cog/hub.html`) and update its lesson count in `theory-lab/README.md`
   or `cog/README.md`.
9. **Verify before committing** — see §8.
10. Never invent a new CSS class without adding it to `theory-lab/assets/theory.css`
    first and documenting it in this guide — the whole point of the shared
    stylesheet is that every lesson stays visually consistent for free.

---

## 8. Verification (run this before every commit)

**HTML tag balance** — catches an unclosed/mismatched `<div>` or similar:
```python
import re
def check_tags(path):
    s = open(path, encoding='utf-8').read()
    issues = []
    for tag in ['div','svg','script','a','h1','h2','h3','h4','p','ul','ol','li','details','summary','table','tr','td','span']:
        opens = len(re.findall(rf'<{tag}(?:\s[^>]*)?>', s))
        selfclose = len(re.findall(rf'<{tag}(?:\s[^>]*)?/>', s))
        opens -= selfclose
        closes = len(re.findall(rf'</{tag}>', s))
        if opens != closes:
            issues.append(f'{tag}: {opens} open vs {closes} close')
    return issues
```

**Inline script syntax** — extract every non-MathJax `<script>` block and run
`node --check` on it (catches a typo in an interactive chart's JS).

**Internal links** — confirm every relative `href` actually resolves
(`os.path.normpath(os.path.join(os.path.dirname(file), href))` should be a
real file).

**Shared view** — `node js/deskStrip.test.mjs` (see §5.18).

**Class-usage cross-check** — every `tl-*` class used in the file should
resolve to something defined in `theory-lab/assets/theory.css` (or, rarely, a
file's own local `<style>` block for something bespoke like a data table —
see `cog/lessons/volatility-intelligence.html` for that pattern).

---

## 9. What NOT to do

- Don't duplicate `theory.css` into a new file — both `theory-lab/` and
  `cog/` import the same one.
- Don't remove or soften existing prose, a derivation, a caveat, or an honest
  null-result finding when restyling a lesson — visual changes are additive.
- Don't skip the `.tl-status` badge — every lesson states up front whether
  it's a concept, a candidate, or already-in-use/course material.
- Don't overuse `.tl-solid` — it's for the one sharpest insight per lesson,
  not every paragraph.
- Don't invent a color meaning that contradicts §6 without a good reason —
  consistency across 65+ lessons is the whole point.
