# Pitfalls: how lessons fail CI or break in the browser

Add a line whenever a new one bites.

1. **Paths title mismatch.** `paths-data.js` `t` must equal the `<h1 class="tl-title">` text after stripping tags and
   decoding `&amp;`, or `lessonPaths.test` fails. A lesson on a path that doesn't load `assets/paths.js` also fails.
2. **Gated slugs on shared paths.** Any `institutional-` or `action-` slug in shared `paths-data.js` fails the test.
3. **Evidence.** `data-evidence` needs a real id in `js/deskEvidence.js`, a `data-evidence-date`, and `verdicts.js`
   loaded. `untested` boxes have no `data-evidence`.
4. **DESK leaks.** Desk wording outside markers, unpaired or nested markers, or tags that stop balancing once the strip
   runs all fail `deskStrip.test`. Watch headings, recap rows and status-badge tails.
5. **Server regexes.** Don't alter the "Prefer pictures to prose?" callout markup or the hub `tl-mode-toggle` /
   `tl-card-micro-badge` markup.
6. **Deck wiring.** `deck.js` must be a non-defer script after the markup; required ids `sl-count`, `sl-total`,
   `sl-prev`, `sl-next`, `sl-progress`, `sl-viewport`; tabs only work inside `.sl-card` with `data-panel` matching a
   panel id; quiz options are `<button class="sl-quiz-opt">` with `data-correct="true"` on the right one.
7. **Global ids.** Widget ids are page-global. Prefix them per lesson (`kc-`, `kelly-`) and start each widget IIFE with
   `if (!el) return`.
8. **Whiteboards.** Don't hand-write `<!-- WB:… -->` blocks or hard-code slide numbers elsewhere; the generator
   renumbers slides.
9. **Swipe.** Swipe ignores touches that start on inputs, buttons or links. Keep draggable widgets inside those.
10. **`id="page"`** must wrap the full lesson. Keep the `?v=` suffixes.
11. **CSS.** Never add a CSS file or copy `theory.css`/`deck.css`. Use a local `<style>` only for bespoke widgets.
12. **cog lessons** live two levels deep: asset paths are `../../theory-lab/assets/…`. Copy a sibling to get them right.
13. **Counts drift.** Count the lesson files (`ls theory-lab/lessons`) rather than trusting a number in a README or this skill.
14. **The checker's class check only sees `tl-*`/`sl-*` names.** Modifier classes such as `context` or `untested` on
    `.sl-stamp` aren't validated, so compare them against `deck.css` by eye.
15. **Existing decks aren't perfect references.** `kelly-criterion-micro.html`'s `#sl-total` is off by one (deck.js
    corrects it at runtime). `merton-jump-diffusion-micro.html` and `time-value-of-money-micro.html` use `sl-legend`,
    which isn't in `deck.css` (2026-10-12). Don't copy those.

- **Building several whiteboards at once.** `build_whiteboards.py` rewrites `watch.html` and the hub badges on every run,
  so parallel runs race on those shared pages. Build boards with `--no-index <name>`, then run it once with no
  arguments at the end to regenerate the index and badges.
- **`vark.js` without `tts.js?v=6`.** The spoken blocks borrow the LaTeX-to-speech helpers from `tts.js` v6
  (`window.TLSpeech`); load `tts.js` first. An old `?v=5` cache-buster can serve the pre-export script.
