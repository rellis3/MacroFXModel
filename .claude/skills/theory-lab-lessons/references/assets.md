# `theory-lab/assets/*`: what each does, and who loads it

| Asset | Role | Load in |
|---|---|---|
| `theory.css` | The one stylesheet for full lessons, hub, glossary, paths and start (`tl-*`). Never copy it; add new classes here and document them in the style guide | full lessons (head) |
| `deck.css` | Deck skin (`sl-*`, its own `:root` colours) | micro decks (head) |
| `deck.js` | Deck runtime: prev/next, arrows, swipe, progress bar, auto-wires `.sl-tabs`/`.sl-panel` and `.sl-quiz-q`. Saves `localStorage.theoryLabProgress[slug-without-micro]`. Folds `.sl-fullnote` after 3 s on phones. "Finish ✓" → `../hub.html` | decks: plain `<script>` (not defer) right after `#deck` |
| `progress.js?v=1` | Scroll/time reading progress; parses "~N min read" in `.tl-meta`; adds `#tl-progress-bar` | full lessons, defer |
| `tts.js?v=5` | "Listen to this lesson" (speech synthesis). Needs `#tts-toggle` and `#page` | full lessons, defer |
| ELI5 inline script | localStorage `theoryLabELI5`, toggles `body.eli5-on`. Needs `#eli5-toggle`. Copy verbatim from `kelly-criterion.html` | full lessons |
| `paths-data.js` | `window.TL_PATHS = {core, paths[], lessons{slug:{t,min,micro:true}}}`. Hand-edited | only lessons on a path |
| `paths-admin.js` | Adds the `action-*` stages; server 404s it for non-admins | DESK-wrapped, after paths-data |
| `paths.js` | "On your path" bar before `.tl-footer-nav` (or in the last deck slide); renders `paths.html` | only lessons on a path, after the two above |
| `verdicts.js` | Finds `[data-evidence]` on `.tl-verdict`/`.sl-stamp`, fetches `/theory-lab/desk-verdicts.json?ids=…`, updates tags and adds "re-tested since" notes. Does nothing offline | any page with `data-evidence`, defer |
| `whiteboard.css` / `whiteboard.js` | "▶ Watch it" animations (`<div class="wb">` with JSON). Inserted by `education/tools/build_whiteboards.py` | CSS in head, JS defer at the end, only with a board |
| `capstone.js` | `capstone-vol.html` / `capstone-macro.html` only | never in lessons |
| `sync.js` | Cross-device progress sync, loaded by progress.js/deck.js | never include directly |
