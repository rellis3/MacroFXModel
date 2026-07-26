# COG Hub

Two related but distinct things live here, both one step removed from the
from-scratch math in the sibling **[Theory Lab](../theory-lab/hub.html)**:

**Course Notes — Applied Practice** (10 lessons) — practitioner-workflow
lessons converted from this repo's own raw study notes in
[`education/*.md`](../education/) (the originals are untouched — this folder
holds a styled, illustrated conversion, not a replacement) into the same
format as everything else in this repo's education section: data
foundations, quant/macro plumbing, applied regression, volatility
forecasting, the daily forecaster workflow, range extension levels, open
interest, the cross-asset options diagnostic, macro deep dives, and why
public strategies decay. Each cross-links back to the relevant from-scratch
Theory Lab lesson instead of re-deriving it.

**COG — This Repo's Own Case Study** (2 lessons) — not textbook theory: an
honest documentation of a real, already-built subsystem of this repo. "COG"
is the trader whose published daily forecast levels this repo
reverse-engineered (`js/cogBands.js`, `js/cogReverseEngineer.js`) and the
gated Nasdaq trading system that reverse-engineering inspired. Features the
actual back-solved constants, the already-tested null result (reproducing
his line is *not* a better tradeable fade), and the real "zero trades from
over-conjoined gates" architecture lesson — a concrete example of this
repo's own "built ≠ works ≠ has edge" discipline.

**Start at [`hub.html`](./hub.html)** (also linked from the dashboard's
**Learn ▾** nav menu on `index.html`, alongside Theory Lab).

Building or restyling a lesson? See
[`../education/LESSON_STYLE_GUIDE.md`](../education/LESSON_STYLE_GUIDE.md) —
every component in `theory-lab/assets/theory.css`, when to use it,
copy-pasteable markup, the house content order, and a verification
checklist. Both `cog/` and `theory-lab/` share the exact same component set.

Nothing in this folder is a trading signal — the Course Notes are
practitioner frameworks, not validated edge, and COG's own tested result is
an honest null. Per `CLAUDE.md`'s Lego Principle #5, any idea here only
earns trust after it clears this repo's real out-of-sample bar.

## Structure

```
cog/
  hub.html      — curriculum map for both categories, linked from index.html
  lessons/*.html — 12 lesson files (10 Course Notes + 2 COG), reusing
                   theory-lab/assets/theory.css and glossary.html rather
                   than duplicating them
```
