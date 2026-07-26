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

---

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
