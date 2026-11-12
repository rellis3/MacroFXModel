# Technical lane (Quant Guild and other quant teachers)

**Purpose:** learn how a professional quant approaches a question, and fold that into how this desk runs research.
Their market opinions matter less than their method. The owner's words: "more to do with the research, the analysis,
the investigation, how we approach things rather than theories about what they're proposing".

## Extra extraction, on top of the template

In **Approach**, always try to fill these. They are what the playbook is built from:
1. **Problem framing**: prediction vs description; the target variable; the horizon; the null they test against.
2. **Model choice and why**: e.g. "linear regression is S tier" and *why* they think so (interpretability, stability, low R² is fine at scale).
3. **Validation**: in-sample vs out-of-sample, walk-forward, cross-validation, holdout discipline, multiple testing.
4. **Statistics they insist on**: effect size vs significance, R², t-stats, deflated Sharpe, distribution not mean, stationarity.
5. **Costs and capacity**: whether and how they account for them.
6. **Failure modes they warn about**: overfitting, lookahead, survivorship, regime change, data snooping.
7. **Career / industry context**: how a desk actually runs things, but only where it changes how we should work.

## Compare against our rules

For each approach point, read the matching part of `research-protocol`, `data-rules` (the overfitting and
multiple-testing sections) and `research-director` (question style), then tag it:
- **ALREADY DO**: cite where we do it. Still worth logging: independent confirmation of a rule.
- **DO WORSE**: say what's weaker here and what the change would be.
- **DON'T DO**: say what adopting it would take.
- **DISAGREE**: we have evidence their rule doesn't fit our setting (say what evidence).

## Files

- Note: `education/intake/technical/<source>/<date>-<slug>.md`.
- `education/intake/technical/<source>/PLAYBOOK.md`: one file per teacher that grows over time. Sections: Framing ·
  Models · Validation · Statistics · Costs · Failure modes · Sayings. Each entry is one line with the source note
  linked. Repeats get an extra citation, not a new line; repetition is the signal of what they actually believe.
- Method lessons go into `education/RESEARCH_METHOD_LESSONS.md` (the cross-source file).

Shorts (under ~60s) are often one opinion line. Write a 10-line note, add to the playbook's "Sayings" if it's
quotable, and move on.
