---
name: cog-knowledge
description: Institutional knowledge about C.OG / Colez Trades (the trader-educator behind the Quantitative & Macro Insights Discord), his daily vol/range forecast lines, his 4-stage Nasdaq alert system, the repo's attempts to replicate it, and the cog/ education hub. Use this whenever a task mentions COG, C.OG, Colez, Mr C, Jordan, Husky, the Discord, "his lines", the blue line, COG bands, the cog shadow/gates (G1 tide, G2 GEX, G3 magnet), cog-replication, cog lessons/snippets/course notes, or when testing any idea that came from his material — even if the user just says "the course" or "what he said". Read it before running a new cog test, so dead hypotheses aren't re-opened and the evidence rules are kept.
---

# COG knowledge

C.OG is a real trader and educator (Colez Trades, "Mr C", YouTube `@QuantitativeAndMacroInsights`). This repo
learns from his material, reverse-engineers his published forecast lines, and has tested whether his Nasdaq alert
system can be replicated. This skill holds what has been learned so far, so a session doesn't rediscover it or redo
dead work.

## Who said what (tag every claim)

| Who | What they are | Material |
|---|---|---|
| **C.OG** | the educator; runs the Discord, courses, "The Bank" micro-education site; publishes daily HL/OC p50/p75 lines for EURUSD, NQ, GOLD and a gated NQ alert system | `MD files/COG_OBSERVED_SYSTEM.md`, `education/*-notes.md`, `education/cog-snippets.md` |
| **Jordan (CT)** | a Discord member who posts live-trading recordings, tags `@C.OG` | `education/jordan_*` — reconstructions of *Jordan's* method, not C.OG's |
| **Husky, Max** | other Discord members | occasional snippets |
| **Us** | this repo's inferences and tests | `cog-replication/`, `forge/COG_*`, `analysis/output/cog_*` |

Jordan's system is not the group's system. If a source doesn't say who said it, say so; don't guess.

## Evidence tiers: never blur them

`MD files/COG_OBSERVED_SYSTEM.md` is the primary record. It is **append-only**: corrections are dated additions,
and nothing gets overwritten. Its four tiers stay separate wherever you write about COG:

1. **Observed**: what his messages actually showed (times in UK local).
2. **Stated by COG**: what he said about his method ("nothing to do with NAS price", looks at repo/RRP and
   central-bank balance sheets, not an ORB).
3. **Published**: his tearsheet numbers.
4. **Inference (ours)**: everything we deduced. Label it as ours.

When writing explanations of his material, keep his words verbatim (quote block) and ours separate, and mark our
additions explicitly ("this last step is ours").

## Where things stand (read before testing anything)

**As of 2026-10-11, the shadow has no validated directional layer and must not be called a replication**
(`cog-replication/DECISIONS.md`, 2026-09-25). Treat `DECISIONS.md` as authoritative over `cog-replication/README.md`,
which is stale. The summary below is a snapshot; check `DECISIONS.md` for entries newer than its date.

- Reproduced: his forecast lines are constant × σ_daily (HL p50 1.56, HL p75 1.93, OC p50 0.74, OC p75 1.24).
- Real: **G2**, where GEX predicts next-day **range** on NQ only (no direction).
- Null: G1 net-liquidity tide, G3 OI-wall magnet, QMR price gates, fading his line, setups A/B at his lines, FRED
  spread direction filters, rates→Nasdaq leads, reconstructing his "blue line".

The full ledger with numbers and source files is in `references/verdicts.md`. Read it before proposing a test.

**Do-not-reopen list:** QMR, and any of the three gates *as a direction signal* (G1 tide, G3 magnet, G2 GEX). G2's
**range** effect on NQ is real and stays in use. Reopen one only with a genuinely new mechanism and its own
pre-registration. If the user asks for one of these, tell them the prior verdict and source first, then ask what's new.

## Reference files (read the one you need)

| File | Read when |
|---|---|
| `references/verdicts.md` | proposing, running or summarising any cog test; answering "did X work?" |
| `references/concepts.md` | you need the terminology: COG constants, σ gap, COG bands, gates, setups A/B/C, the blue line |
| `references/research-protocol.md` | running a new cog test: COG-specific prereg additions, hard-won backtest rules, forward-log scoring, decisions (the general protocol is the `research-protocol` skill) |
| `references/lessons-and-snippets.md` | adding a cog lesson, a course-notes conversion, a snippet, or a forward-log row |
| `references/code-map.md` | finding the pages, APIs, JS bricks, Python scripts and the cog-standalone service |
| `references/open-questions.md` | asked "what's next?" or "what don't we know?"; also the known inconsistencies in the cog files |

## Growing this skill

This skill is meant to accumulate knowledge. When a session learns something durable about COG, write it back here
in the same change:

- **New test result** → add a row to `references/verdicts.md` (verdict, key numbers, date, source file). If it
  changes the overall picture, update "Where things stand" above.
- **New C.OG message or video** → record it in the repo first (`education/cog-snippets.md` or a new
  `education/<topic>-notes.md`), then add any new term to `references/concepts.md`.
- **Question answered** → move it from `references/open-questions.md` into the right file, citing the answer.
- **New decision** → it goes in `cog-replication/DECISIONS.md` (newest first, Decided / Why / Reverses if). Mirror
  only the one-line outcome here.

Keep the repo files as the source of truth and this skill as the index plus the rules. Date every addition
(YYYY-MM-DD). Don't copy whole documents in; link them.
