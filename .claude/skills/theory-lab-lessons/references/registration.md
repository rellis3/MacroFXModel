# Registering a lesson

Nothing is generated except whiteboards. Every step below is a hand edit.

1. **Both files exist and cross-link**: `lessons/<slug>.html` ↔ `lessons/<slug>-micro.html`.

2. **`theory-lab/hub.html`** (the all-lessons list; the start page `index.html` holds no lesson cards): add a card to the right `.tl-cat`. A new category needs a `data-level`. An institutional
   category also needs the `<!-- INSTITUTIONAL:START/END -->` markers and `data-institutional="1"`. An `action-`
   category is wrapped in DESK markers.
   ```html
   <a class="tl-card" href="lessons/SLUG.html" data-slug="SLUG" data-full="lessons/SLUG.html" data-micro="lessons/SLUG-micro.html">
     <div class="tl-card-toprow"><div class="tl-card-num">Lesson 13</div><span class="tl-pill blue tl-diff-pill">Intermediate</span><span class="tl-card-micro-badge" title="A visual guide (slide deck) is available for this lesson">⚡</span></div>
     <h3>Title</h3><p>One-line hook<!-- DESK:START -->, desk tail<!-- DESK:END -->.</p>
   </a>
   ```
   Difficulty pills: Beginner `tl-pill green`, Intermediate `tl-pill blue`, Advanced `tl-pill amber` (always with
   `tl-diff-pill`). Difficulty is set per category. Don't add the ▶ `tl-card-wb-badge` by hand.

3. **Neighbours**: update the previous lesson's footer-nav "next" link and its deck's teaser (and the "Lesson N of M"
   kickers if M changes).

4. **Paths** (`theory-lab/assets/paths-data.js`, hand-edited despite its "Generated" header), only if the lesson
   belongs on a path:
   - Add the slug to `paths[].stages[].lessons`, and an entry `"slug": {"t": "<h1 text exactly, &amp; decoded>", "min": N, "micro": true}`.
   - Load the three paths scripts in **both** pages.
   - `action-*` slugs go in `paths-admin.js` instead. `institutional-*` slugs go on no path.

5. **Whiteboard (optional)**: write `education/tools/whiteboards/<name>.py` defining
   `BOARD = dict(name, lesson, title, cfg, before, deck_after)` with the helpers in `_wb.py`, then run
   `python3 education/tools/build_whiteboards.py <name>`. It inserts the board (`id="wb-<name>"`) into both pages,
   renumbers deck slides, adds the CSS/JS includes, and regenerates `watch.html` and the hub ▶ badges. Never hand-write
   `<!-- WB:… -->` blocks.

6. **Stories**: if the lesson has `.tl-story id="story-N"`, add it to the matching `st-card` in
   `theory-lab/stories.html`: `<li><a href="lessons/SLUG.html#story-1">Title</a><span class="st-angle">…</span></li>`,
   and update the DESK-wrapped stats line.

7. **Glossary**: add a `tl-gloss-card` with `data-search="…"` to `theory-lab/glossary.html` for any new symbol.

8. **Counts**: update `theory-lab/README.md` (it was stale at "122 lesson files"; actual 176 + 176 on 2026-10-12).
   For cog lessons, update `cog/README.md`.

9. **Deep links (optional)**: `js/lessonLinks.js` may point the dashboard at an existing id (`story-N`, `wb-*`, chart
   ids). Headings have no ids.

10. **Evidence (optional)**: `data-evidence` must be a real id in `js/deskEvidence.js`, with a `data-evidence-date`,
    and `verdicts.js` must be loaded.

11. **Run the checks**: `python3 .claude/skills/theory-lab-lessons/scripts/check_lesson.py --ci <files>`.

12. **Log it** in `references/lesson-log.md`.
