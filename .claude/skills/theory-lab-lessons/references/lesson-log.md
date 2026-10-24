# Lesson log

A running record of lessons added or reworked, and source material waiting to be converted. Newest at the bottom.
Format: `YYYY-MM-DD — slug (full + micro) — category — source notes / why`.

## State at 2026-10-12

- `theory-lab/lessons/`: 176 full lessons + 176 `-micro` decks (every lesson has both). Reference pair:
  `kelly-criterion`.
- `cog/lessons/`: 12 files (10 Course Notes + 2 COG case study). See the `cog-knowledge` skill.
- Git history in cloud clones is shallow, so it can't show how past lessons were added. This log is the record from
  here on.

## Source material not yet turned into lessons

- `education/micro learning bank.md` (C.OG course outline)
- `education/progression-path-breakdown-notes.md`
- `education/macro-variable-context-relevance-notes.md`
- `education/mean-reversion-of-residuals-notes.md`
- `education/buy-and-hold-notes.md`
- `education/forecaster-portfolio-case-study/LESSON_0*.md`

## Added

- 2026-10-17: VARK layer added to all 175 full lessons (summary picture, two-voice spoken version, equation
  build-up, predict-first, scenario drill, Where this fits; style guide §5.20) plus a whiteboard for every lesson
  (133 new scene files). Three new paths (foundations, stochastic, quantml) put every non-institutional lesson
  on a path. New public capstones: capstone-systems.html, capstone-risk.html. Spaced review card (review.js).
  Corrected during the rollout: pca-factors eigenvalues/loadings, systemic-risk-networks round-2 h_B,
  correlation-networks-mst longest edge, numerical-integration 15^7 count, newton-raphson f(y1)/P'(y0),
  sde-numerical-schemes strong-error chart, hamiltonian-monte-carlo-nuts leapfrog (interior kicks were ε/2),
  institutional-kyle-obizhaeva-invariance scaling exponents, institutional-avellaneda-stoikov inventory sign.
- 2026-10-17 (second pass): four new lessons, fx-fixings-wm-reuters, fx-options-quoting-rr-bf, trade-management-exits
  and event-trading-playbook, each with a deck, whiteboard, drill and story. Every deck gained the picture, listen block
  and drill as slides. Every lesson gained a faded worked example (§5.23), drill sources, desk tool links and
  how-to-test notes (§5.24), and its static readouts were reconciled with its calculators (§5.25). New pages:
  practice.html, errors.html, checklist.html, journal.html, cheatsheet.html, replay.html (desk only); the hub's Today
  card (desk only). Recorded dialogues in theory-lab/audio (Kokoro, built locally by build_audio.py).
- 2026-10-24: cog Course Notes 2 (Quant & Macro) split from one 73-min page into an index (quant-macro-lessons.html), six full lessons qm-1..qm-6 each with a -micro deck, and qm-reference.html. Built in full house style except the two-voice spoken block and whiteboards (owner: skip). Glossary cards and stories.html entries NOT added yet. Read-time labels come from scripts/tl_read_times.mjs.
- 2026-10-24 (later): qm-2 and qm-6 (42 and 45 min) each split in two (qm-2 + qm-2b, qm-6 + qm-6b); course keeps the six-lesson numbering, so display is "Lesson 2, part 1 of 2". Index shows eight parts.
