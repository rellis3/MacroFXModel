# C.OG lane: the high-quality pass

C.OG is the core education and comes from a paid, private group. So this lane is slower and more careful than the
others, and keeps more of his exact words. Read the `cog-knowledge` skill first, every time.

## Privacy

- Full transcripts and Discord exports stay in `education/intake/raw/cog/` (gitignored). **The repo is public.**
- Notes quote him in short excerpts (a sentence or two per claim), enough to keep the exact wording of a rule, not
  whole passages. Screenshots of the Discord: keep them local under `education/intake/raw/cog/media/` unless the owner
  says one can be committed.
- (Note for the owner: `education/cog-snippets.md` already holds longer verbatim passages in git. Flagged 2026-11-12,
  not changed. The owner decides whether to move them.)

## Inputs

- His public YouTube (`@QuantitativeAndMacroInsights`), via ReelScribe.
- Discord messages, threads, VIP posts: pasted text or screenshots. These also go through the existing inbox:
  save to `education/cog_inbox/` with its naming, then process them here **and** run the inbox steps
  (`research-director/references/cog-inbox.md`). This pass replaces "file as snippet" with the fuller note below.
- Discord video attachments: ReelScribe can't fetch them. Ask the owner for a YouTube/unlisted link, the text, or
  agreement to a local transcription.

## The pass (steps on top of the template)

1. **Term repair before reading.** Auto-transcripts mishear his jargon (GEX, vanna, charm, CVOL, IV, sigma, the blue
   line, the tide, POI, OI walls, DTE, ES/NQ, "the box"). Fix them against `cog-knowledge/references/concepts.md`, and list every
   correction in the note under "Transcript fixes" so the owner can check them. If a term is genuinely unclear, mark it
   `[?]` and ask. Never guess silently.
2. **Segment.** Split the transcript into topics with timestamps (or message order). Each segment: what he's doing
   (teaching, showing a live chart, answering a member, giving a call).
3. **Every claim, verbatim, speaker-tagged.** C.OG, Jordan, Husky, other member, OWNER. A member's words are not his.
4. **Map to his framework.** Which part of his system each segment touches: the vol/range forecast lines, the
   4-stage Nasdaq gates (G1 tide, G2 GEX, G3 magnet, …), OI, rates, positioning, risk/stop rules, process. Use
   `cog-knowledge/references/concepts.md` and `code-map.md`.
5. **Cross-check against everything we've done.** `verdicts.md` (what's been tested and how it came out),
   `open-questions.md` (does this answer one? If so, move it per that skill), `project_cog_build_target` in memory
   (his 4-stage gates, his stop after 08:30 ET data), the Evidence Book. Where he contradicts one of our verdicts,
   say exactly what differs (setting, instrument, horizon, definition). That difference is usually the next question.
6. **His questions and phrasing.** New questions he poses, tasks he sets, terms he uses go into
   `research-director/references/cog-question-style.md` (verbatim under "His questions").
7. **Independent second read.** Give the raw transcript, **not your note**, to a fresh subagent with this
   instruction: "List every claim, rule, number, condition and question in this transcript, speaker-tagged, with
   timestamps." Diff its list against your note. Anything you missed goes in; anything it got that you think is
   wrong, check in the transcript. Record "second read: N added, M disputed" in the note.
8. **Card the questions** into `research-director/agendas/` in his register, citing the note.
9. **Lesson notes.** If the item teaches a coherent topic (not just a market call), add a section to the
   matching raw course-notes file in `education/` (see `cog-knowledge/references/lessons-and-snippets.md`), or
   start a new notes file, which can later become a cog/ lesson via `theory-lab-lessons`. Don't build the HTML lesson
   unless asked.

## Files

- Note: `education/intake/cog/<date>-<slug>.md`, template plus: Transcript fixes · Segments · Framework map ·
  Contradictions with our verdicts · Second read.
- Running log: `education/cog-snippets.md` gets a short entry pointing to the note (the context, the key quote,
  "How it maps to this repo").
- Update `cog-knowledge` references wherever the item changes what we know (verdicts, open questions, concepts).
