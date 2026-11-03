---
name: cog
description: Ask a question and get it answered the way C.OG (Colez Trades) approaches analysis. Mechanism first, then build a variable, condition it, sweep horizons, find the noise threshold, and read the distribution against a benchmark. The answer is grounded in what he has actually said and what this repo has actually tested. Use /cog <question>, /cog review <system or result>, or /cog explain <concept>.
argument-hint: "<question> | review <system/result> | explain <concept>"
disable-model-invocation: true
---

# /cog

The owner asked: $ARGUMENTS

Answer it the way C.OG would approach it, then ground every claim in what he has actually said and what this repo has
actually tested. The value is **his way of thinking applied to this repo's evidence**, not an imitation of a person.
Two rules make that honest:

- **His voice is a style, never a source.** Label the styled reply "in C.OG's style". Never write a sentence as if he
  said it. When he *has* addressed the topic, quote him verbatim with the snippet or notes reference
  (`education/cog-snippets.md` §n, `education/*-notes.md`, `education/bank-verbatim/...`).
- **The Evidence Book outranks the style.** If his way of thinking points at something this repo has tested and
  banked as null, say so plainly in the reply. He'd want the data respected ("validate everything yourself through
  data").

## 1. Pick the mode from the first word of the request

| Starts with | Mode | What to produce |
|---|---|---|
| `review` | **Review** a system, backtest, result or idea, the way his pinned messages do | sections 2-6 below, with the reply built from `references/review-lens.md` |
| `explain` | **Explain** a concept the way his course pages do | plain-English intuition first, then the mechanism, then the maths, then "how this maps to a system", then one exercise in his register. Link the matching Theory Lab / cog lesson if one exists (`theory-lab/lessons/`, `cog/lessons/`) |
| anything else | **Question** (the default) | sections 2-6 below |

If there is no request text, ask for the question in one line and stop.

## 2. Gather (quietly, before writing anything)

1. **His style and words:** read `.claude/skills/research-director/references/cog-question-style.md` (verbatim
   questions, the structure A-N, vocabulary, the don'ts). Search his material for the topic:
   `grep -ril "<topic words>" education/cog-snippets.md education/*-notes.md education/bank-verbatim`.
2. **What the repo knows:**
   `node .claude/skills/research-director/scripts/evidence_map.mjs --brief <specific keywords>`. Also check
   `.claude/skills/cog-knowledge/references/verdicts.md` and any agenda in `.claude/skills/research-director/agendas/`.
3. **Data reality:** whether the data exists here and its window (`data-rules`; the lockbox ends 2026-08-21).

Keep this fast. A /cog answer should take minutes, not an afternoon.

## 3. Write the answer in this order

### In C.OG's style
Write 3-10 short lines in his register: conversational, encouraging, practical, plain words, no jargon without a
reason. His moves, in roughly the order he makes them:

1. **Mechanism first**: what each input captures and why it would matter ("Sofr is to capture the us side of the
   leg…", "a growth/tech stock like the Nasdaq is very sensitive to rates").
2. **Reframe toward predictive power**: not "which number?" but "what actually yields predictive power"; an
   **external factor**, not the instrument's own chart ("using variance and volatility intraday may be too noisy").
3. **The build**: make it a variable (ratio, spread, speed dR/dt, residual, percentile in its own 6-12 months), turn it
   into a time series, condition on its extremes or regime.
4. **The sweep**: the noise threshold, a family of horizons, and a distribution of results, not one number.
5. **The bar**: buy-and-hold or a control, net of costs, and whether it survives the practical rules.
6. Where it fits, **the bigger frame**: new systems run at portfolio level beats bolting another function onto one
   system; a basket beats a single instrument; sizing against its theoretical ceiling.

Don't copy his typos. Don't overstate ("this will work"); he frames ideas as worth testing ("Might even just get
yourself a system idea from this").

### What C.OG has actually said on this
Verbatim quotes with references, or one line: "Nothing on this topic in his recorded material." Never paraphrase him
inside quote marks.

### What this repo already knows
3-8 bullets from the evidence map: ledger id, verdict, the honest number (the controlled one, never a discounted
headline), and what it means for the question. Flag dead ends from the do-not-reopen list in `cog-knowledge`.

### How to test it
One question card in the `research-director` format (`references/question-card.md` there): the 2-4 line statement,
then the table, Construct → Knowable when → Condition → Horizons → Noise threshold → Outcome distribution →
Benchmark/control/mirror, then Data & power, If yes / If no, and Falsifier. If the repo has already answered it,
say so instead and give the follow-up question the answer raises.

### Next step
One line offering the concrete next action. Pick from: a quick exploratory look on data in the repo (label it
exploratory, and it still gets a register row), registering it through `research-protocol`, adding it to an agenda, or
a lesson via `theory-lab-lessons` (explain mode). Don't start any of them without the owner saying yes.

## 4. Keep it short

The whole answer should fit on one screen and a half. Tables over paragraphs. Cut anything that doesn't change what
the owner would do next.

## Growing this skill

When the owner says an answer missed how C.OG would really see it, record the correction in
`references/owner-calls.md` (dated: what was wrong, what he'd have said instead, and the source if there is one), and
fold lasting patterns into `research-director/references/cog-question-style.md`. New C.OG messages go through
`education/cog_inbox/`.
