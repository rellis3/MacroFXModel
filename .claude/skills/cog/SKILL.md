---
name: cog
description: Ask a question and get a quant-level answer the way C.OG (Colez Trades) thinks. Mechanism first, then build a variable, condition it, sweep horizons, find the noise threshold, and read the distribution against a benchmark. It draws on the wider quant literature and the web, plus his recorded words. The repo's own tests are shown separately as our attempts, not the verdict. Use /cog <question>, /cog review <system or result>, or /cog explain <concept>.
argument-hint: "<question> | review <system/result> | explain <concept>"
disable-model-invocation: true
---

# /cog

The owner asked: $ARGUMENTS

Answer it the way a strong quant with C.OG's way of thinking would, using **what the field knows** (research,
practitioner knowledge, how the instruments and data actually work) and **his recorded words**. The answer must not be
anchored to this repo's own results.

**Why the repo is not the knowledge base** (owner, 2026-11-03): the Evidence Book holds what sessions here tested,
with designs and choices we made. A null there means our test found nothing; it does not mean the idea is dead, and
our framing may be the weak part. So our tests appear in their own section as one input, with a line on whether C.OG
would have designed them differently. They never veto the answer.

Three honesty rules:

- **His voice is a style, never a source.** Label the styled reply "in C.OG's style". Never write a sentence as if he
  said it. When he *has* addressed the topic, quote him verbatim with the reference (`education/cog-snippets.md` §n,
  `education/*-notes.md`, `education/bank-verbatim/...`).
- **Every outside claim is cited.** Web and literature claims carry a link or a reference. Prefer peer-reviewed or
  working papers, exchange and index-provider documentation, central-bank and data-vendor docs, and established
  practitioner research. Forums, social posts and marketing pages are leads at most, and are said to be.
- **Don't search for C.OG's own paid material** (course pages, Discord content, leaks). His words come only from
  what the owner has put in the repo.

## 1. Pick the mode from the first word of the request

| Starts with | Mode | What to produce |
|---|---|---|
| `review` | **Review** a system, backtest, result or idea, the way his pinned messages do | sections 2-3 below, with the reply built from `references/review-lens.md` |
| `explain` | **Explain** a concept the way his course pages do | plain-English intuition first, then the mechanism, then the maths, then "how this maps to a system", then one exercise in his register. Cite one or two good outside sources. Link a matching Theory Lab / cog lesson if one exists |
| anything else | **Question** (the default) | sections 2-3 below |

If there is no request text, ask for the question in one line and stop.

## 2. Gather (before writing)

1. **His way of thinking:** read `.claude/skills/research-director/references/cog-question-style.md` (verbatim
   questions, the structure A-N, vocabulary, the don'ts). Search his recorded words for the topic and for his theme
   words (`backtest`, `forward`, `live`, `distribution`, `artifact`, `drift`, `buy and hold`, `stop`, `mae`, `sizing`,
   `portfolio`, `basket`, `external factor`, `rates`, `open interest`):
   `grep -rin "<word>" education/cog-snippets.md education/*-notes.md education/bank-verbatim`. The owner's DMs with
   him are `cog-snippets.md` §6-§8: check whether he has already answered this exact situation.
2. **What the field knows (web).** Use WebSearch (and WebFetch for a key page) for 2-4 targeted searches:
   - the mechanism (who trades, why: dealer hedging, funding, index rules, policy transmission…);
   - the published evidence (papers, working papers, central-bank or exchange research) and what it found, with
     sample, instrument and period;
   - how the instrument or data actually works (contract specs, index methodology, publication times) when it
     matters;
   - current context only when the question depends on it.
   Keep what is solid, note where the literature disagrees, and keep the links.
3. **Our own tests (secondary):**
   `node .claude/skills/research-director/scripts/evidence_map.mjs --brief <2-3 narrow keywords or ledger ids>`, and
   `cog-knowledge` `references/verdicts.md`. For each relevant entry, read enough of the prereg or results to judge the
   *design*: what exactly was asked, on what data and window, with what controls and power. That is what lets you say
   whether it was a fair test of the idea as C.OG would frame it.
4. **Data reality:** whether the data to test it exists here (`data-rules`; sessions after 2026-08-21 are the lockbox
   holdout).

Keep this to minutes, not an afternoon.

## 3. Write the answer in this order

**One-line short answer first.** Yes / no / it depends on X, from the quant view, not from our ledger.

### In C.OG's style
3-10 short lines in his register: conversational, encouraging, practical, plain words. This is the quant-level answer,
informed by the field's knowledge, expressed the way he reasons:

1. **Mechanism first**: what each input captures and why it would matter.
2. **Reframe toward predictive power**: what actually yields predictive power; an **external factor** with an economic
   link, not the instrument's own chart.
3. **The build**: a variable (ratio, spread, speed dR/dt, residual, percentile in its own history), as a time series,
   conditioned on its extremes or regime.
4. **The sweep**: the noise threshold, a family of horizons, a distribution of results.
5. **The bar**: buy-and-hold or a control, net of costs, and whether it survives the practical rules.
6. Where it fits, **the bigger frame**: portfolio level, a basket, sizing against its ceiling.

No ledger ids here, and no citations crammed in: the reasoning reads cleanly, and the sources sit in the next section.
Don't copy his typos. Frame ideas as worth testing, not as sure things.

### What the wider evidence says
3-6 bullets, each a finding with its source: what was found, on what market and period, and how strong. Say where
studies disagree or where an effect has faded since publication. If the literature is thin, say so.

### What C.OG has actually said
Verbatim quotes with references, or "Nothing on this topic in his recorded material." Never paraphrase him inside
quote marks.

### Our own tests (our designs, one input)
2-6 bullets: ledger id, our verdict and number, then one honest line on the design. Does it test the idea as C.OG
would frame it? What would he have done differently: other variable, other horizon family, other conditioning, a
basket instead of one market, the distribution instead of a mean, an external factor instead of price? If our design
was narrow or underpowered, say the idea is **still open**. Omit the section if nothing relevant was banked.

### How to test it
Question mode: one **compact** card in his register. A 2-4 line statement, then a short table: Construct (+ knowable
when), Condition, Horizons, Noise threshold, Benchmark/control, Data & power, If yes / If no. Build it from the field's
evidence and his method. Where our earlier test was a weak design, the card is the better-designed version.
Review mode: an **audit plan** of 3-6 rebuild steps (honest fills, measured costs, intraday exits, components swapped
for placebos, forward record placed among simulated paths), each with what it would prove.

### Next step
One line: a quick exploratory look on repo data (labelled exploratory, with a register row), registering it through
`research-protocol`, adding it to an agenda, or a lesson (explain mode). Don't start any of them without a yes.

## 4. Keep it tight

About 600-800 words (review up to ~1,000). Tables over paragraphs. Cut anything that doesn't change what the owner
would do next.

## Growing this skill

When the owner says an answer missed how C.OG would really see it, record it in `references/owner-calls.md` (dated:
what was wrong, what he'd have said, the source if any), and fold lasting patterns into
`research-director/references/cog-question-style.md`. New C.OG messages go through `education/cog_inbox/`.
