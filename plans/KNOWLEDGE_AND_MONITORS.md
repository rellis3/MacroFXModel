# Knowledge layer, monitors and historical profiles (architecture proposal, v1, 2026-11-09)

*Status: proposal for the owner to check. Nothing here is built. It reshapes the Research Opportunity Engine (`plans/RESEARCH_OPPORTUNITY_ENGINE.md`, section 24 lenses) around what the owner described on 2026-11-09. Built so far: the laptop scanner and question writer (P1-P3), the server record and board (`roe.html`).*

## 1. What the owner asked for, in one paragraph
A passive component that sits over all our data and understands the past: what happens after new highs and lows, in jump and diffusion regimes, across yields, spreads, vol, risk, positioning and news. It should draw on a vast base of principles (the whole paper library, the C.OG education, the Theory Lab) and use that to notice what matters and to play the past forward as conditional expectations. That knowledge may be a repository that several specialist monitors sit on top of.

## 2. What exists today, and what does not
| Piece | State |
|---|---|
| Scanner (is a series unusual today) and question writer | built, laptop, no model, no historical analysis |
| Paper library: 650 papers read, digests, equations, figures, index, librarian | built (server, R2) |
| C.OG education (`cog/`, `education/cog_inbox/`) and Theory Lab lessons | exist as files, not yet in a shared structured form |
| Concept cards (principle, mechanism, what to measure, what to look for, caveats) | **not built** |
| Specialist monitors (yields, spreads, vol and jumps, regimes, risk, positioning, news) | **not built** (the desk has analysts and the news wire for today's view, which is a different job) |
| Historical profiler (what followed each state in the past, with uncertainty) | **not built** |
| Play-forward (this state resembles these episodes; here is what followed) | **not built** |

## 3. How the "agents" actually work here (so the new parts follow the same pattern)
An agent in this repo is not an autonomous program with tools. It is **a named role plus ordinary code plus (usually) one model call**:
1. Code gathers the inputs (data, evidence, papers).
2. A role file (`desk/roles/*.md`: a prompt with frontmatter for tier, what it reads, and the output schema) tells the model what to do.
3. One call (sometimes a few rounds) goes through `js/modelRouter.js` to the provider set on the AI models tab.
4. Code checks the answer against a schema and stores it.
Of the 53 entries on the Agents tab, 36 make a model call and 32 have a role file; 17 make no model call at all (plain code or storage). The `.claude/skills` in the repo are separate: they instruct Claude Code sessions that work on the repo, not the running system.
So the monitors follow the same split: **deterministic code measures; a model, where used, reads and explains with the relevant concept cards in front of it.** Measurement never depends on a model.

## 4. The three layers
1. **Knowledge layer (read-only repository).** Built once, then topped up. Each concept becomes a card: principle, mechanism, the variable to construct, what to look for, known caveats, source (paper id, C.OG lesson or Theory Lab lesson). Built from the library digests and the education files, tagged by domain (yields, spreads, vol, jumps, regimes, risk, positioning, news, trend). Stored in R2 as JSON; a small index in KV. Private: card text is never committed to git.
2. **Monitors (specialists).** One per domain. Each has a deterministic measurement job (what the scanner does today, widened by the lenses in ROE section 24) and its own pack of concept cards. Each writes a state record: where the domain is, what is unusual, and the historical context from the profiler.
3. **Historical profiler.** For each monitor's measures: over the whole history, how often each state occurred, what followed over fixed horizons (distribution, not a single number), with sample size, uncertainty and the baseline. It is computed once per history refresh, not per question. It respects the lockbox (ROE section 8): practice window to 2025-09-04, one confirmation 2025-09-05 to 2026-08-20, forward after the freeze date; the frozen layers (HAR-800 ladder, R3, M2) and the shadow screens are never inputs.
Output: a **situation read**: "this resembles these past episodes; here is what followed; here is how sure we are; here are the open questions". Questions go to the one question list and the one trial pool (ROE section 22); testing goes through the existing quick-test machinery, validation desk and Head of Research (no parallel approvals system).

## 5. Where each part runs, and what it can cost
| Part | Runs on | Why | Money |
|---|---|---|---|
| Concept cards | laptop (one-off), capped model calls | reading is model work, done once | DeepSeek only; cap set by the owner (proposed 400 calls for the first full build) |
| Historical profiles | laptop now; GitHub scheduled run later for data committed to the repo | heavy statistics must stay off the web server | nothing extra on the laptop; GitHub free minutes within plan |
| Monitors' measurement | laptop (local files) and GitHub run (repo data) | same | nothing extra |
| Storing, serving pages, recording pushes | Railway (existing) | small JSON only | negligible; no heavy job is ever added to the web service |
| Model explanations of a situation read | server, capped, off by default | optional | DeepSeek; cap and a switch on the Agents tab |
Rules: no always-on heavy process on Railway; every model call path has a hard cap in KV (pattern: `library_librarian_v1`) and a switch; the owner sets a spending limit in the Railway billing settings (not something the code can check). Every place money can be spent is listed in this table and on the Agents tab.

## 6. Build order
1. This document agreed; the Agents tab relabels plain scripts as **jobs**, not agents.
2. Concept cards from the library digests plus C.OG and Theory Lab (capped), with a review page so the owner can read and correct cards.
3. One monitor end to end: **vol and jumps** (the after-event and behaviour lenses live here), with its historical profile and a situation read on the board.
4. Remaining monitors one at a time (yields and spreads, regimes, risk and positioning, news), each reusing steps 2-3.
5. The paper-idea lens (cap set by the owner) and the relationship lens.
6. The minimal historical test that reuses quick-test, so a question can be answered, not only asked.

## 7. Decisions needed from the owner
1. Is the first monitor vol and jumps? (proposed)
2. The model-call cap for the first concept-card build (proposed 400) and for the paper-idea lens (proposed 100).
3. Confirm: fold the separate ROE P5-P7 into the existing validation desk and Head of Research.
4. Should the first monitors run on a schedule from the laptop, or do you want them moved to the GitHub runner as soon as their data is in the repo?
