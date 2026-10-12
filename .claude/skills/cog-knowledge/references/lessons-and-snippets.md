# Adding cog lessons, course notes and snippets

Lesson HTML style is shared with Theory Lab. For markup, the skeleton and checks, use the `theory-lab-lessons` skill
and `education/LESSON_STYLE_GUIDE.md` (whose title is "Theory Lab / COG Hub — Lesson Style Guide"). This file covers
only what is specific to `cog/`.

## The cog hub

`cog/hub.html` is hand-coded; there is no generator. It has two `.tl-grid` sections:

- **Course Notes — Applied Practice**: Course Notes 1–10, in this order: data-foundations, quant-macro-lessons,
  regression-analysis-course, volatility-intelligence, forecaster-walkthrough, range-extension-levels,
  open-interest-course, cross-asset-options-diagnostic, macro-deep-dives, companion-insights (marked "final").
- **COG — This Repo's Own Case Study**: COG 1 cog-reverse-engineering, COG 2 cog-gate-system (final).

Card markup:

```html
<a class="tl-card" href="lessons/<name>.html"><div class="tl-card-num">Course Notes N</div><h3>Title</h3><p>One line</p></a>
```

The dashboard reaches the hub from the Learn ▾ menu in `index.html`.

## Course-notes lessons

Each one is a styled conversion of a raw notes file in `education/`. **Leave the raw file untouched**; it is the record.

| # | Raw notes |
|---|---|
| 1 | `data-foundations-notes.md` |
| 2 | `QUANT_MACRO_LESSONS_1-6.md` |
| 3 | `regression-analysis-course-notes.md` |
| 4 | `VOLATILITY_INTELLIGENCE_NOTES.md` |
| 5 | `FORECASTER_WALKTHROUGH_NOTES.md` |
| 6 | `range-extension-levels-notes.md` |
| 7 | `open-interest-course-notes.md` |
| 8 | `cross-asset-options-diagnostic-notes.md` |
| 9 | `macro-deep-dives-notes.md` |
| 10 | `companion-insights-01-03-notes.md` |

Raw material **not yet converted**: `micro learning bank.md` (course outline), `progression-path-breakdown-notes.md`,
`macro-variable-context-relevance-notes.md`, `mean-reversion-of-residuals-notes.md`, `buy-and-hold-notes.md`,
`forecaster-portfolio-case-study/LESSON_0*.md`.

## Adding a cog lesson

1. Write or keep the raw notes in `education/<topic>-notes.md`.
2. Copy a sibling in `cog/lessons/` so the `../../theory-lab/assets/theory.css` path depth is right. Never copy the
   CSS itself.
3. Set the title, crumb, kicker ("Course Notes · Lesson N of M" or "COG · Lesson N of M", renumbering the siblings if
   M changes), dek, and the **mandatory** `.tl-status` badge. Cog lessons use `.course` with custom text, e.g.
   "COURSE NOTES — …, not a backtested strategy" or "ALREADY BUILT & TESTED".
4. Cite the source ("Colez Trades, '<course>' …") and the raw notes path.
5. If the lesson states a result, use the verdict from `references/verdicts.md`. A null goes in a red takeaway.
6. Add the card to `cog/hub.html`, move the "(final)" marker, and fix the prev/next footer links on the neighbours.
7. Update the counts in `cog/README.md` (at last count: "10 lessons" / "2 lessons" / "12 lesson files").
8. Run `python3 .claude/skills/theory-lab-lessons/scripts/check_lesson.py --ci cog/lessons/<name>.html` (style-guide §8 checks + deskStrip and the lesson tests).

## Adding a snippet (`education/cog-snippets.md`)

One numbered entry per snippet, newest at the bottom:

```markdown
## N. <Title> (#channel, YYYY-MM-DD)

**Context:** who asked, what about.

![](cog_snippets/YYYY-MM-DD-<slug>.png)

> the message or table exactly as posted

**Reading the table / Why …** — our explanation, kept separate. Mark our own steps ("this last step is ours").

**How it maps to this repo:** built / not built, with paths.
```

A longer C.OG video gets its own `education/<topic>-notes.md`, linked from the snippets file header. Long course
material goes in `micro learning bank.md`.

## Adding a forward-log row

Add it to `cog-replication/FORWARD_LOG.md` the day his messages land. Never backfill from memory. Score agreement and
correctness in separate columns. Times are UK local; note BST vs ET conversions.
