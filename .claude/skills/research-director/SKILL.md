---
name: research-director
description: Sets the research questions. Turns a theme, a hunch, a C.OG idea or a finished result into a short ranked agenda of well-posed question statements in C.OG's register (construct a variable, condition on its extremes or regime, sweep a family of horizons, find the noise threshold, read the distribution of outcomes against a benchmark, control or mirror), each screened against the Evidence Book, the data we actually have, power and what the answer would change. Use this whenever the user asks "what should we test next", "what questions does this raise", "set me the questions", "where do we go from here", wants a research agenda or study ideas on a topic (GEX, rates, vol, a C.OG video or message), or has just banked a result and needs the follow-ups. Also use it to process new C.OG messages dropped in education/cog_inbox/. Hand the chosen questions to research-protocol to claim and run.
---

# Research director

The owner wants questions set the way C.OG sets them: short, structured statements that tell you what to **build**,
what to **condition** on, over which **horizons**, and what **distribution** to read, against what **benchmark**.
They aren't over-specified: the sweep decides the parameters. This skill produces those questions, grounded in what
the repo already knows, and ranks them by what an answer would change.

It sits before `research-protocol`, which claims, registers, runs and banks. This skill decides *which* questions
deserve that.

## The workflow

1. **Map what is known (10 minutes, not an afternoon).**
   `node .claude/skills/research-director/scripts/evidence_map.mjs <keywords…>` (use specific words; short ones like
   "oi" match whole words only) prints every Evidence Book entry,
   register row and prereg matching the theme, grouped by verdict. Add `research_status.mjs` for in-flight work. Write
   the map as five to ten lines: what is validated (with the honest number, after controls), what is null or
   underpowered and why, what data exists and when more arrives. The map is the floor every question stands on.
   **Then read the shared shelf** (the same one the research rooms on research.html use; owner 2026-11-12: "attack it
   from both sides", phone skill or desk room):
   `node .claude/skills/research-director/scripts/shelf.mjs papers "<theme words>"` gives the paper library's desk
   notes (claim, mechanism, data, effect, caveats) for the closest papers. `paper <id> --full` reads one in full.
   `rooms` gives what the rooms have already discussed and what the Head decided. Cite papers by id and title in the
   map. Needs env `RESEARCH_READ_TOKEN` (or the laptop's `ROE_PUSH_TOKEN`). If it is unset, say so in the map, never
   skip silently. Paper text is private: it stays in the conversation or the scratchpad, never in the repo.
2. **Name the mechanism.** Who is forced to trade, and why would the effect persist (risk premium, structural or
   hedging flow, behaviour, information arriving slowly)? A question with no mechanism is a data-mining candidate. It's
   allowed only if labelled exploratory.
3. **Generate questions in C.OG's register** (`references/cog-question-style.md`). Write each as a two-to-five-line
   statement (two to four lines; it doesn't have to name every element, because the table carries the rest), then the
   spec under it: **Construct → Condition → Horizons → Noise threshold → Outcome
   distribution → Benchmark / control / mirror**. Generate across the angles below, then cut.
4. **Screen every candidate** (`references/question-card.md`):
   - Already answered? Name the nearest ledger ids; a banked null is re-asked only with a new mechanism.
   - Answerable with our data, and when? (`data-rules`; the theme map's data section.)
   - Rough power: the n and the effect size we could detect.
   - **Value of the answer**: what changes in a live line, bot, page or the next question if it comes back yes, and
     if no. Questions whose answer changes nothing rank last.
   - The falsifier: what result would kill it.
5. **Rank and write the agenda** to `.claude/skills/research-director/agendas/<theme>.md`: the map, then three to
   seven question cards in rank order, then "parked" questions with the reason (no data until X, underpowered until n
   = Y). The top one to three become `CLAIMED` rows through `research-protocol` when the owner picks them.

## Angles to generate from (use several, not one)

| Angle | The question it produces |
|---|---|
| **Decompose the headline** | The validated number is partly something else (leverage, vol level, events). What is left once that is removed, and is it still above the noise threshold? |
| **What is different here** | It works on NQ/ES and not FX: build the variable that differs (0DTE share, book size against volume) and condition on it |
| **Construct a ratio or speed** | Two series that price the same information: their ratio per unit time, dR/dt, at its extremes |
| **Relative to its own distribution** | Not "is X high" but "where does X sit in its own last 6 to 12 months", then condition on the percentile |
| **Horizon family** | One horizon answered; sweep 1 session → 1 week → 1 month and read where the effect lives and where it dies |
| **Conditional state** | Does the effect live only in one regime (vol percentile, stress, trend vs range day)? Name the regime before looking |
| **Incremental value** | Does it add to what already ships (the range lines, IV)? This is the question that decides deployment |
| **Mirror and control** | The opposite sign, the other side of the book, an instrument chosen because it should disagree |
| **Distribution, not point** | Map the full outcome distribution (MAE/MFE, paths) before any rule; engineer the rule to the distribution |
| **Forward record** | A result that can't be settled on history: what forward record, starting when, settles it at what n |

## House rules

- **Keep his openness.** Don't fix every parameter in the statement. "At an extreme" and "a family of horizons" are
  fine in the question. The spec line names what the sweep covers and the prereg fixes the grid.
- **Range and direction are separate questions.** The Evidence Book (312 entries, 2026-11-03): volatility/range 27 of
  86 validated, price 13 of 76, macro **0 of 82**. Direction questions need a reason to expect better.
- **Profit and practicality are separate questions** (C.OG's "would it survive the rules?").
- **Data after 2026-08-21 is the lockbox holdout.** Don't plan a question that scores it. A question that needs it
  goes to Parked as an owner decision ("after the lockbox evaluation, ~late Nov 2026").
- **Never quote a headline the record has already discounted.** Use the controlled number (e.g. GEX range "~+0.15
  after return controls", not +0.38).
- **Every question cites the ledger ids it builds on**, so the agenda stays traceable.
- **Ask for the distribution before the rule** ("map out … your actual current trade distribution" — C.OG).

## C.OG's own words: the inbox

New messages from C.OG go in `education/cog_inbox/` (one file per message or thread, pasted text or a screenshot).
Processing is in `references/cog-inbox.md`: file each one as a snippet in `education/cog-snippets.md` (verbatim,
speaker tagged), add any new phrasing or question shape to `references/cog-question-style.md`, and turn any question
he poses into a card on the relevant agenda. Don't scrape Discord or automate a personal account. The owner
chooses what goes in.

## Reference files

| File | Read when |
|---|---|
| `references/cog-question-style.md` | writing questions: his verbatim questions, the structure, vocabulary, what he says not to do |
| `references/question-card.md` | the card template and the screening/ranking rubric |
| `references/cog-inbox.md` | processing new C.OG messages from `education/cog_inbox/` |
| `agendas/*.md` | the current agenda for a theme; update it rather than starting a new one. The research hub (research.html, Home) shows every card with an "Open a room" button, so keep the `### Q<n>. title — score s/15` heading and the `>` quoted statement (js/researchHub.test.mjs fails on a card it cannot read) |
| `scripts/shelf.mjs` | the shared shelf: library papers, research rooms, the hub's drop box (see step 1) |

## Growing this skill

When the owner accepts, rejects or rewrites a question, record why in that agenda's "Owner calls" section, and
generalise it into the house rules if it applies beyond the theme. When a carded question is banked, mark the card
with the ledger id and verdict, and write the follow-up questions it raises. That is how the agenda keeps moving.
