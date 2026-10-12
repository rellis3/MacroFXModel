# Micro lesson (Visual Guide deck): `theory-lab/lessons/<slug>-micro.html`

Reference: `theory-lab/lessons/kelly-criterion-micro.html` (15 slides). The tone follows `education/micro learning
bank.md`. Its recurring headings ("Where this needs qualifying", "What to carry forward" 01–06, "What this now lets
you do", "Next in this series", "Why you were taught it this way") are the blocks decks use.

A deck covers the same ground as the full lesson in short visual slides. Use one idea per slide, interaction over prose,
and Unicode maths (f* = μ/σ², Xₜ₋₁). Only about 10 decks load MathJax.

## Skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lesson Title — Visual Guide — Theory Lab — MacroFX</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&display=swap" rel="stylesheet">
<!-- whiteboard.css only if a board exists -->
<link rel="stylesheet" href="../assets/deck.css">
</head>
<body>
<div id="deck">
  <div class="sl-topbar">
    <a class="sl-back" href="../hub.html">← Theory Lab</a>
    <div class="sl-toptitle">Lesson Title — Visual Guide</div>
    <div class="sl-topcount"><span id="sl-count">1</span> / <span id="sl-total">15</span></div>
  </div>
  <div class="sl-fullnote">Prefer the full derivation, a live calculator, and a 6-question self-test?<a href="SLUG.html">Read the complete lesson →</a></div>
  <div class="sl-progress" id="sl-progress"></div>
  <div class="sl-viewport" id="sl-viewport">

    <section class="sl-slide active" data-slide="1">
      <div class="sl-kicker">Lesson N · Category</div>
      <h1 class="sl-h1">Main title, or <em>The Italic Hook</em></h1>
      <p class="sl-lede">…</p>
    </section>

    <section class="sl-slide" data-slide="2">
      <div class="sl-kicker">Section 1</div>
      <h2 class="sl-h2">…</h2>
      <p class="sl-sub">…</p>
      <div class="sl-icard-grid"><div class="sl-icard"><div class="sl-icard-badge">💥</div><div><h4>…</h4><p>…</p></div></div></div>
    </section>

    <!-- … more slides … -->

    <section class="sl-slide" data-slide="14">
      <div class="sl-kicker">Section 12</div>
      <h2 class="sl-h2">Quick check</h2>
      <p class="sl-sub">Nothing is scored beyond this device. The explanation is the useful part.</p>
      <div class="sl-quiz-q" data-q="1">
        <div class="sl-quiz-num">Question 1</div>
        <h4>Question?</h4>
        <button class="sl-quiz-opt" data-correct="true">Right answer</button>
        <button class="sl-quiz-opt">Distractor</button>
        <button class="sl-quiz-opt">Distractor</button>
        <div class="sl-quiz-explain">Why.</div>
      </div>   <!-- ~5 questions, 3 options each -->
    </section>

    <section class="sl-slide" data-slide="15">
      <div class="sl-kicker">Section 13</div>
      <h2 class="sl-h2">What to carry forward</h2>
      <div class="sl-recap"><div class="sl-recap-row"><div class="sl-recap-num">01</div><p>…</p></div></div>
      <div class="sl-callout green"><div class="sl-callout-label">What this now lets you do</div><p>…</p></div>
      <div class="sl-teaser"><div class="sl-teaser-label">Next in this series</div><h3>Next Title</h3><p>…</p>
        <div class="sl-teaser-btns">
          <a class="sl-btn" href="NEXT-micro.html">Next lesson →</a>
          <a class="sl-btn ghost" href="SLUG.html">Read the full lesson →</a>
          <a class="sl-btn ghost" href="../hub.html">Back to Theory Lab hub</a>
        </div></div>
    </section>
  </div>
  <div class="sl-navbar">
    <button class="sl-navbtn" id="sl-prev">← Back</button>
    <div class="sl-navhint">Use arrow keys to move through the lesson</div>
    <button class="sl-navbtn primary" id="sl-next">Next →</button>
  </div>
</div>
<script src="../assets/deck.js"></script>   <!-- plain script, NOT defer, right after #deck -->
<script>(function(){ var el = document.getElementById('xx-calc'); if (!el) return; /* widget */ })();</script>
<script src="../assets/verdicts.js" defer></script>      <!-- only if data-evidence -->
<script src="../assets/paths-data.js" defer></script>    <!-- these three only if on a path -->
<!-- DESK:START --><script src="../assets/paths-admin.js" defer></script><!-- DESK:END -->
<script src="../assets/paths.js" defer></script>
</body></html>
```

## Slide components

| Component | Markup |
|---|---|
| Tabs ("Try it") | `.sl-card` > `.sl-card-label` "<i></i>Try it" + `.sl-tabs` > `.sl-tab[data-panel="id"]` + `.sl-panel#id`. Auto-wired, but only inside `.sl-card` |
| Flow | `.sl-row` > `.sl-box[.amber/.green/.red/.purple/.blue]` + `.sl-arrow` |
| Text | `.sl-p`, `.sl-note`, `.sl-quote`, `.sl-verdict` |
| Slider chart | `.sl-svgwrap` > svg + `.sl-sliderhead` (`.sl-live`) + `input.sl-slider`; wire it in the inline script |
| Calculator | `.sl-calc-row` > `.sl-calc-field` (label + `input.sl-input`) + `.sl-calc-op` + `.sl-calc-result` (`-label`/`-val`), `.sl-calc-steps`, `button.sl-reset-btn` |
| Compare | `.sl-compare` > `.sl-ccard.neutral/green/red` > `span.sl-ctag.blue/green/red` + ul |
| Callouts | `.sl-callout.amber` "Where this needs qualifying" / "It actually happened"; `.sl-callout.purple` "Where the textbook version breaks" |
| Origin | `.sl-origin` > `.sl-origin-label` + p + `.sl-role-stages` (`.sl-role-stage.on`) + `<p><strong>Its job:</strong>…` |
| Chain | `.sl-chain` > `.sl-chain-link(.shock/.concept/.end)` + `.sl-chain-arrow` |
| Desk stamp | DESK-wrapped `.sl-stamp.untested/null/underpowered/validated/context` [`data-evidence` `data-evidence-date`] > `.sl-stamp-tag` |

## Sizing

The reference deck is about 15 slides with a 5-question quiz. For a short deck (8–10 slides), keep the title, the
core idea, one interactive slide, "where this needs qualifying", the quiz (3 questions), and recap + teaser on the
last slide. Cut extra story and origin slides first.

## Formulas in decks

There's no `tl-eq-break` equivalent. Write the formula in Unicode inside a `.sl-quote` or `.sl-box`, then explain
each term with an `.sl-row` of `.sl-box` items. Avoid inline styles.

## Conventions

- The title-slide kicker "Lesson N · Category" uses the same N as the lesson's hub card (`tl-card-num`).
- Write the `sl-fullnote` to match what the full lesson actually contains. Don't copy "a live calculator, and a
  6-question self-test" unless it does.

- After the title slide, kickers run "Section 1…N". The episode slide is "Section N · It actually happened";
  whiteboard slides are "▶ Watch it".
- `data-slide` runs 1..N in order; only slide 1 has `active`. Keep `#sl-total` correct even though JS overwrites it.
- Required ids: `sl-count`, `sl-total`, `sl-prev`, `sl-next`, `sl-progress`, `sl-viewport`.
- Progress is stored under the slug with `-micro` removed, so a deck and its full lesson share one entry.
