---
name: learn-intake
description: Takes learning material the owner pastes (video URLs, images or screenshots, pasted text or transcripts, or "backfill everything from <creator>"), turns it into stored lesson notes, method lessons and screened research ideas, and files each item in one of three lanes. The lanes are cog (C.OG / Colez / the paid Discord, highest-quality pass), informational (Nicholas Crown, Jessinskip and other market-commentary creators, podcasts) and technical (Quant Guild and other quant-method teachers). Fetches video transcripts through the ReelScribe connector. Use this whenever the owner pastes a YouTube/Instagram/TikTok/Facebook/X link to learn from, drops a screenshot or a block of text with "learn from this", "process this", "add this to cog / crown / quant", names a lane, asks to backfill a creator's videos, or says "process the research inbox" (the drop box on the research hub). Use it even for a single clip with no instructions.
---

# Learn intake

The owner pastes material and says go. This skill does the rest: fetch, read, extract, file and cross-feed, so
that **future research is shaped by what was learned**, not just archived. One pass per item, the same shape
every time, with the depth set by the lane.

## The three lanes

| Lane | Who | What we want from it | Depth | Lane file |
|---|---|---|---|---|
| `cog` | C.OG / Colez Trades, Jordan, other members of the paid Discord, his YouTube `@QuantitativeAndMacroInsights` | His method and his claims, exactly. Core education. | **Highest.** Full read, verbatim quotes, term repair, a second independent read, cross-check against everything we've tested | `references/lane-cog.md` |
| `informational` | Nicholas Crown, Jessinskip, Marilee Cordova, Aleks Rosme, podcasts (Donnelly/Peccarelli) | Market-mechanics understanding: how X moves Y, setups worth watching, display/alert nuggets | Standard | `references/lane-informational.md` |
| `technical` | Quant Guild and other quant educators | **How they approach a question**: framing, validation, statistics, what kills an idea. Their market views are secondary | Standard, method-focused | `references/lane-technical.md` |

Picking the lane: the owner usually names it ("cog", "crown", "quant"). Otherwise use the creator (ReelScribe's
`owner` field or the channel) via the table in `references/sources.md`. If the creator is new, ask once which lane,
then add them to `sources.md`.

## Inputs

- **Video URL(s)**: fetch through ReelScribe (`references/reelscribe.md`): always look for an existing transcript first (free), count the new ones, then transcribe.
- **"Backfill <creator>"**: `list_transcriptions` with `owner`, skip anything already in `education/intake/INDEX.md`.
- **Image / screenshot**: read it directly. Transcribe every number and label; describe charts precisely.
  Save the file under `education/intake/<lane>/<source>/media/` (cog: per `lane-cog.md`).
- **Pasted text** (a Discord message, a transcript, the owner's own notes): take as-is. The owner's own words are
  tagged `OWNER`, never attributed to the creator.
- **The research inbox** (owner 2026-11-12): the drop box on the research hub (research.html, "Drop in") holds links,
  videos, pictures and text the owner dropped from the site or a phone, each with a lane (or `auto`) and an optional note.
  `node .claude/skills/research-director/scripts/shelf.mjs queue` lists them; `shelf.mjs image <id> <scratchpad file>`
  fetches a picture. Process each one like any other item, then mark it with
  `shelf.mjs done <id> --path <note path> --note "<the lesson in a line>"` (or `--status failed` / `dropped` with the
  reason), so the hub shows it as learned. Needs env `RESEARCH_READ_TOKEN` (or `ROE_PUSH_TOKEN`). PDFs never come
  through here: the hub sends them straight to the library's reading backlog.

## The pass (every item, every lane)

1. **Check the ledger.** Look up the URL / id in `education/intake/INDEX.md`. Already processed means you say so and stop,
   unless the owner asks for a re-read.
2. **Get the full text.** Never work from a 500-char preview. Save the raw transcript to
   `education/intake/raw/<lane>/<source>/<date>-<slug>.txt` (gitignored, never committed: the repo is public and
   the material is the creator's).
3. **Read it in full and write the note** using `references/note-template.md`. The same headings in every lane:
   lesson · approach · claims · what we could learn · research ideas · quotes. The lane file says how deep each one goes.
4. **Screen every claim and idea against what we already know** before writing "untested". Use
   `node .claude/skills/research-director/scripts/evidence_map.mjs "<keywords>"`, then grep `js/deskEvidence.js`,
   `plans/RESEARCH_REGISTER.md`, `forge/`, `MD files/` and, for cog, `cog-knowledge/references/verdicts.md`.
   Each claim gets **ON FILE** (cite the id and verdict), **PARTLY ON FILE** (say what differs) or **UNTESTED**.
5. **File it** (see "Where things go").
6. **Cross-feed** (this is the point of the whole skill):
   - Ideas that survive screening go out as question cards in the `research-director` agenda that fits (or a new
     agenda), in C.OG's register: variable, condition, horizons, noise threshold, benchmark. Cards are candidates
     only. Never start a study from intake; that goes through `research-protocol` when the owner picks it.
   - Method lessons (how to run research, not what markets do) go into `education/RESEARCH_METHOD_LESSONS.md`
     with a tag for each: **ALREADY DO** / **DO WORSE** / **DON'T DO**. When a DO WORSE / DON'T DO lesson has
     come up in 2+ items, propose the exact edit to `research-protocol`, `data-rules` or `research-director` to the
     owner. Never edit those skills silently.
7. **Add a row to `education/intake/INDEX.md`** and commit: the note, the index and the running-log changes,
   staging only your own files. Raw transcripts stay out.
8. **Report back briefly**: one line per item (lesson in a sentence, ideas carded, method lessons added), plus
   anything that needs the owner (an uncertain term, a new creator, a claim that contradicts a banked verdict).

## Where things go

```
education/intake/
  INDEX.md                         ledger, one row per item (all lanes)
  raw/                             gitignored: full transcripts, by lane/source
  informational/<source>/          one note per item, plus media/
  technical/<source>/              one note per item, plus media/
  technical/<source>/PLAYBOOK.md   how this teacher approaches problems, grown item by item
education/RESEARCH_METHOD_LESSONS.md   cross-source method lessons; research-protocol reads this
```

Existing running logs stay where they are and get the entry as well (don't fork them):
- Nicholas Crown: `MD files/CROWN_WATCH.md` (its 4-step pass is the informational lane's core; see the lane file).
- Podcasts: `education/podcast_transcripts/PODCAST_INSIGHTS.md` and `HOW_THEY_THINK.md`.
- C.OG and Discord: `education/cog-snippets.md`, `cog-knowledge` references, `research-director` agendas. Details in `lane-cog.md`.

## Rules

- **Quote, don't paraphrase, when attributing a claim.** Tag every claim with the speaker. A member's words are not C.OG's; the owner's are tagged OWNER.
- **Method over opinion in the technical lane; mechanism over call in the informational lane.** Dated market calls go to the log's "calls to score", never into the Evidence Book as findings.
- **Don't reflex-cite prior nulls.** If a claim resembles a null, say exactly what differs. A new variant is still a candidate.
- **Credits are money.** Follow the spend rule in `references/reelscribe.md`. Never retry a failed job without asking.
- **Many items:** fetch all of them, then give each informational or technical item to a subagent with the lane file and template (they have the ReelScribe tools). Merge INDEX and the running logs yourself, in one commit. Cog items are not delegated except for the independent second read.
