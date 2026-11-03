# Processing new C.OG messages (`education/cog_inbox/`)

The owner drops messages they choose to keep into `education/cog_inbox/`: one file per message or thread, named
`YYYY-MM-DD-<channel>-<slug>.md` (pasted text) or `.png` (screenshot). Nothing is scraped. Discord's terms forbid
automating a personal account, and the material is his community's.

For each new file:

1. **File it as a snippet** in `education/cog-snippets.md`, following the layout in the `cog-knowledge` skill
   (`references/lessons-and-snippets.md`): context, speaker tagged, message **verbatim**, then our reading kept
   separate, then "How it maps to this repo". Screenshots go to `education/cog_snippets/` and are transcribed.
2. **Update the style reference.** If he poses a question, sets a task or uses a phrase not yet in
   `cog-question-style.md`, add the verbatim line under "His questions" and any new structural element or term.
3. **Card it.** If the message contains a question or a testable claim, add a card to the matching agenda in
   `agendas/` (or start one), citing the snippet number. If it answers an open question in `cog-knowledge`, move it
   there per that skill.
4. **Move the file** to `education/cog_inbox/processed/` in the same commit, so the inbox shows only what's new.

Tag every claim with who said it. Jordan's or another member's words are not C.OG's.
