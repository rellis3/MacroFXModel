---
name: theory-lab-lessons
description: How to write, edit and register Theory Lab lessons (theory-lab/lessons/*.html) and their "-micro" Visual Guide slide decks, plus cog/ course-notes lessons, in the exact house style. Covers the page skeletons, tl-*/sl-* components, DESK markers, status badges and verdict boxes, hub cards, learning paths (paths-data.js), whiteboards, stories, glossary, and the checks CI runs. Use this whenever the user asks for a new lesson, a micro lesson, a visual guide or deck, turning notes or a course into a lesson, adding a quiz/chart/ELI5 to a lesson, fixing a lesson, or adding a lesson to the hub or a path. Use it even for "write me a lesson on X" or "make a micro version of Y" without the words Theory Lab.
---

# Theory Lab lessons

Theory Lab is the repo's education site: 176 full lessons, each with a `-micro` slide-deck twin, plus hub, paths,
glossary, stories and capstones. Lessons are hand-written static HTML on shared CSS. Consistency comes from copying the
house skeleton exactly and passing the checks, so follow the workflow below rather than inventing structure.

The style bible is `education/LESSON_STYLE_GUIDE.md`. Its "copy primer-stats-normal.html" advice predates ELI5, TTS,
paths and whiteboards, so **use `theory-lab/lessons/kelly-criterion.html` and `kelly-criterion-micro.html` as the
reference pair.**

## Workflow for a new lesson

1. **Choose the slug and category.** The prefix decides gating (see `references/prefixes-and-gating.md`): no prefix =
   ordinary topic, `primer-`, `foundation-`, `institutional-` (advanced, admin-only, never on shared paths), `action-`
   (admin-only desk lessons). For a `cog/` course-notes lesson, also read the `cog-knowledge` skill's
   `references/lessons-and-snippets.md`.
2. **Read the reference pair**, or the nearest lesson in the same category, end to end. Match its tone and density.
3. **Write the full lesson** from the skeleton in `references/full-lesson.md`.
4. **Write the micro deck** from `references/micro-lesson.md`. Every lesson has both. Cross-link them (the "Prefer
   pictures to prose?" callout ↔ `sl-fullnote` and the teaser button).
5. **Register it** using the checklist in `references/registration.md`: hub card, prev/next links, paths, stories,
   glossary, README counts.
6. **Run the checks** and fix everything before committing:
   ```bash
   python3 .claude/skills/theory-lab-lessons/scripts/check_lesson.py --ci theory-lab/lessons/<slug>.html theory-lab/lessons/<slug>-micro.html
   ```
   This runs the style-guide §8 checks (tag balance, `node --check` on inline scripts, links resolve, every `tl-*` class
   is in `theory.css` and every `sl-*` class in `deck.css`), then the node tests from `.github/workflows/theory-lab.yml`
   plus `deskStrip`.

## House rules that matter most

- **Honesty over polish.** "CONCEPT" means explained, not built or validated. A null or negative desk result is a red
  or amber takeaway, never softened, with the ledger's numbers unrounded. Verdicts judge the desk's test of a trading
  claim, not the theory ("Desk test: nothing found", not "the theory is wrong").
- **Mandatory status badge** in `.tl-meta`: `concept`, `candidate` or `course`.
- **The DESK layer.** Anything about the owner's desk, repo or code goes inside `<!-- DESK:START -->…<!-- DESK:END -->`,
  so the shared view can strip it. Wrap whole elements or clauses whose sentence still reads without them. Markers never
  nest. Don't hand-fix numbering; the strip renumbers. The leak detector flags phrases such as "this desk", "desk test",
  `data-evidence=`, "MacroFXModel", "this repo", "the codebase", `js/*.js` paths, `*.py` names, "CLAUDE.md" and "Lego
  Principle".
- **Plain English before notation.** Define every symbol (`tl-eq-break` chips under every display formula). Use worked
  numbers and a named real episode, and real, correctly attributed sources.
- **Charts are hand-built inline SVG** with `var(--blue)`-style colours, an `aria-label`, and real maths in the JS. No
  chart libraries and no external requests beyond Google Fonts and MathJax.
- **Colour has meaning:** blue = concept/neutral, green = good / do this, red = trap or null, amber = caveat or
  scenario, purple = maths or example.
- **Never copy or add CSS files.** A page-local `<style>` is only for bespoke tool widgets (`tp-*` prefix, the
  `action-*` pattern).

`references/pitfalls.md` lists the specific ways lessons fail CI or break in the browser. Skim it before finishing.

## Reference files

| File | Read when |
|---|---|
| `references/full-lesson.md` | writing or editing a full lesson: skeleton, body order, components |
| `references/micro-lesson.md` | writing a micro / Visual Guide deck: skeleton, slide components, quiz |
| `references/registration.md` | wiring a lesson into hub, paths, whiteboards, stories, glossary, README |
| `references/prefixes-and-gating.md` | choosing a slug/category, or anything admin-only, institutional or `-micro` gating |
| `references/assets.md` | what each `theory-lab/assets/*` file does and which pages must load it |
| `references/pitfalls.md` | before committing; when a check fails |
| `references/lesson-log.md` | to see what lessons exist and were added recently, and which notes are not yet converted |

## Growing this skill

When a session learns something about lessons (a new component, a check that bit, a style decision the owner made, a
new category), write it back in the same change:

- New component or class → document it in `education/LESSON_STYLE_GUIDE.md` §5 (the source of truth) and add the
  markup to `references/full-lesson.md` or `references/micro-lesson.md`.
- A check failed in a way that wasn't obvious → add it to `references/pitfalls.md`.
- A lesson was added → add a dated line to `references/lesson-log.md`.
- The owner corrected tone or structure → add the rule under "House rules" above, with the reason.
