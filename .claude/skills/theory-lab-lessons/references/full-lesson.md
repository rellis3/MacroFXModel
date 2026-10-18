# Full lesson: `theory-lab/lessons/<slug>.html`

Reference: `theory-lab/lessons/kelly-criterion.html`. Component catalogue: `education/LESSON_STYLE_GUIDE.md` §5.

## Body order

TL;DR → summary picture (`.tl-picture`) → spoken version (`.tl-listen`) → Why this matters → plain-English
intuition → (How it reached trading, for maths/ML lessons) → the maths (opening with `.tl-eqbuild`) → symbols →
interactive chart → worked example (the "Try it yourself" box opens with `.tl-predict`) → real-world scenario → It
actually happened (story, chain, desk verdict) → How practitioners use it → pitfalls → scenario drill (`.tl-drill`) →
Key Takeaways → Self-test → Further reading → Where this fits (`.tl-fits`) → footer nav.

The VARK blocks and their exact markup and writing rules: style guide §5.20, worked in full in `kelly-criterion.html`.
Load `../assets/vark.js?v=2` (defer) right after `../assets/tts.js?v=6`, in the lesson and its deck, and put the
one-line theme script (`theoryLabTheme`) right after the stylesheet link, as every page does. Every lesson also gets a
whiteboard, a faded worked example (§5.23), sources on a dated drill, and how-to-test notes on untested verdicts
(§5.24). The deck carries the picture, listen block and drill as `sl-vark` slides (copy them from the lesson).
Static readout numbers must be what the calculator computes (§5.25, `node js/lessonReadouts.e2e.mjs <slug>`).

Number the sections with `tl-section-mark` ("Section 01", "Section 02", …).

## Skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lesson Title — Theory Lab — MacroFX</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<!-- whiteboard.css goes here only if a board exists (build_whiteboards.py adds it) -->
<link rel="stylesheet" href="../assets/theory.css">
<script>window.MathJax = { tex: { inlineMath: [['\\(','\\)']], displayMath: [['\\[','\\]']] } };</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" id="MathJax-script" async></script>
</head>
<body>
<div id="page">
  <div class="tl-crumb"><a href="../hub.html">Theory Lab</a> / Category Name / Short Title</div>
  <div class="tl-glosslink">🔎 <a href="../glossary.html">Notation Glossary</a> — what σ, Δ, θ and the rest actually mean</div>
  <div class="tl-kicker">Category · Lesson N of M</div>
  <h1 class="tl-title">Exact Title</h1>   <!-- must equal paths-data.js "t" if on a path -->
  <p class="tl-dek">One-sentence hook.</p>
  <div class="tl-meta">
    <span class="tl-status concept">CONCEPT — what this is and isn't</span>  <!-- concept | candidate | course -->
    <span>~16 min read</span>                                            <!-- progress.js parses this -->
    <span>Prereqs: <a href="primer-probability.html">Probability</a></span>
  </div>

  <button type="button" id="eli5-toggle" class="tl-eli5-toggle">🧒 Explain Like I'm 5</button>
  <button type="button" id="tts-toggle" class="tl-tts-toggle">🔊 Listen to this lesson</button>

  <div class="tl-callout">
    <strong>Prefer pictures to prose?</strong> Try the <a href="SLUG-micro.html">Visual Guide</a> — the same ground covered here, broken into short interactive slides.
  </div>   <!-- exact markup: server.js finds it by regex -->

  <div class="tl-tldr"><div class="tl-tldr-label">TL;DR</div><ul>
    <li>4–6 bullets; the last is often "<strong>Real-world episode:</strong> …"</li></ul></div>

  <div class="tl-section-mark"><span>Section 01</span></div>
  <h2>Why this matters</h2>
  <div class="tl-box intuition"><div class="tl-icon-badge blue">💡</div><div class="tl-box-label">Plain-English intuition</div><h3>…</h3><p>…</p></div>

  <div class="tl-origin">  <!-- maths/ML lessons -->
    <div class="tl-origin-label">How it reached trading</div><h3>…</h3>
    <div class="tl-origin-who">Idea · into markets via X, year</div><p>…</p>
    <div class="tl-role"><div class="tl-role-stages">
      <span class="tl-role-stage">Data</span><span class="tl-role-stage on">Model</span><span class="tl-role-stage">Signal</span>
      <span class="tl-role-stage">Test</span><span class="tl-role-stage">Size &amp; risk</span><span class="tl-role-stage">Execute</span></div>
      <dl><dt>Its job</dt><dd>…</dd><dt>Takes in</dt><dd>…</dd><dt>Hands on to</dt><dd>…</dd></dl></div>
  </div>

  <div class="tl-section-mark"><span>Section 02</span></div>
  <h2>The math, step by step</h2>
  <div class="tl-math">\[ f^* = \frac{\mu}{\sigma^2} \]</div>
  <div class="tl-eq-break"><div class="tl-eq-chip c1"><code>f*</code><span>meaning</span></div>…</div>  <!-- under EVERY display formula -->
  <div class="tl-formula-parts"><div class="tl-fp blue"><div class="tl-fp-term">…</div><div class="tl-fp-name">…</div><div class="tl-fp-desc">…</div></div></div>  <!-- the one central formula -->
  <div class="tl-symbols"><table><tr><td>\(\sigma\)</td><td>…</td></tr></table></div>
  <div class="tl-eli5"><div class="tl-eli5-label">🧒 Explain like I'm 5</div><p>…</p></div>  <!-- several, after hard bits -->
  <div class="tl-solid red"><strong>The trap:</strong> …</div>   <!-- at most 1–2 per lesson -->
  <div class="tl-box example"><div class="tl-icon-badge purple">🧮</div><div class="tl-box-label">Worked example</div><h3>…</h3>…</div>
  <div class="tl-box scenario"><div class="tl-icon-badge amber">🎯</div><div class="tl-box-label">Real-world trading scenario</div>…</div>

  <div class="tl-chart interactive">
    <div class="tl-chart-label">…</div>
    <svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="…"><!-- var(--blue) etc --></svg>
    <div class="tl-controls"><div class="tl-control"><div class="tl-control-head"><span>Label</span><span class="tl-live" id="xx-val">…</span></div>
      <input type="range" id="xx-slider" min="0" max="1" step="0.01" value="0.5"></div></div>
    <div class="tl-readout">… <b id="xx-out">…</b></div><div class="tl-hint">…</div>
    <div class="tl-chart-caption">…</div>
  </div>
  <script>(function(){ var el = document.getElementById('xx-slider'); if (!el) return; /* real maths; ids prefixed per lesson */ })();</script>

  <div class="tl-section-mark"><span>Section 03</span></div>
  <h2>It actually happened: Episode, Year</h2>
  <div class="tl-story" id="story-1"><div class="tl-story-label">It actually happened</div><h3>…</h3><p>…</p></div>
  <div class="tl-chain"><div class="tl-chain-link shock"><b>Shock</b>…</div><div class="tl-chain-arrow">→</div>
    <div class="tl-chain-link concept"><b>★ This lesson · X</b>…</div><div class="tl-chain-arrow">→</div>
    <div class="tl-chain-link end"><b>Outcome</b>…</div></div>
  <div class="tl-box pitfall"><div class="tl-icon-badge red">⚠️</div><div class="tl-box-label">Where the textbook version breaks</div>…</div>
  <!-- DESK:START -->
  <div class="tl-verdict null" data-evidence="ledger-id" data-evidence-date="YYYY-MM-DD"><span class="tl-verdict-tag">Desk test: nothing found</span><span>…</span></div>
  <!-- DESK:END -->
  <!-- untested variant: class "tl-verdict untested", tag "Not tested here", and NO data-evidence -->

  <div class="tl-section-mark"><span>Section 04</span></div>
  <h2>How practitioners actually use this</h2>
  <div class="tl-box pitfall"><div class="tl-icon-badge red">⚠️</div><div class="tl-box-label">Common pitfalls</div>…</div>

  <div class="tl-section-mark"><span>Section 05</span></div>
  <h2>Key Takeaways</h2>
  <div class="tl-takeaways">
    <div class="tl-takeaway green"><span class="tl-takeaway-icon">✓</span><span><strong>…</strong> …</span></div>
    <div class="tl-takeaway amber"><span class="tl-takeaway-icon">⚠</span><span>…</span></div>
    <div class="tl-takeaway red"><span class="tl-takeaway-icon">✗</span><span>…</span></div>
  </div>

  <div class="tl-section-mark"><span>Section 06</span></div>
  <h2>Self-test</h2>
  <details class="tl-quiz"><summary>Q1. …?</summary><div class="tl-answer">Full reasoning…</div></details>  <!-- 4–6 questions -->

  <details class="tl-section-collapse"><summary><h2>Further reading</h2></summary>
  <ul class="tl-refs"><li>Author, <em>Title</em>, venue, year — why it matters.</li></ul></details>

  <div class="tl-footer-nav">
    <a href="prev.html">← Prev Title</a><a href="../hub.html">Theory Lab hub</a><a href="next.html">Next Title →</a>
  </div>
</div>
<script>/* ELI5 toggle: copy the whole block verbatim from kelly-criterion.html (search 'theoryLabELI5') */</script>
<script src="../assets/progress.js?v=1" defer></script>
<script src="../assets/tts.js?v=5" defer></script>
<script src="../assets/verdicts.js" defer></script>            <!-- only if data-evidence is used -->
<script src="../assets/paths-data.js" defer></script>          <!-- these three only if the lesson is on a path -->
<!-- DESK:START --><script src="../assets/paths-admin.js" defer></script><!-- DESK:END -->
<script src="../assets/paths.js" defer></script>
<!-- whiteboard.js defer goes here only if a board exists -->
</body>
</html>
```

## Notes

- `id="page"` is required (TTS and progress hang off it).
- Keep the `?v=1` / `?v=5` cache-busting suffixes as existing lessons have them.
- The repo-specific note box (`.tl-box.repo`) is rare now; if used, DESK-wrap it.
- Status badge tails that mention the desk get DESK-wrapped inside the span.
- For a cog course-notes lesson the paths are `../../theory-lab/assets/theory.css` etc. Copy a sibling in
  `cog/lessons/`.
