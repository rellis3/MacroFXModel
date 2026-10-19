# Writing a pre-registration

Use `MD files/PREREG_TEMPLATE.md`. It is the single template: its sections 1–8 (claim, why not already settled,
definitions, hypotheses with THE GATE and THE MIRROR, power, multiplicity, what it does NOT test, what each verdict
changes) are all required. The older 13-section COG layout in `cog-knowledge` is folded into this. Put the file at
`forge/<STEM>_PREREG.md` (exceptions are in SKILL.md, "Naming").

## Header block (add under the title, before §1)

```markdown
# <slug> — <the claim, as a question>

**Pre-registered <YYYY-MM-DD>, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `<slug>` (one id per scored question; list them if more than one) |
| Branch | `<branch>` |
| Register row | `plans/RESEARCH_REGISTER.md` → `<slug>` |
| Data | instruments, bar type, window `<from> → <to>`. End at 2026-08-21 unless the study is about something the lockbox doesn't cover and you say why (the lockbox formally guards layers 3/5/6; cutting every study there is the simple rule) |
| Seed | `<YYYYMMDD>` (one for every script in this study) |
| Uncertainty | <bootstrap type, block, B> (defaults in `stats-defaults.md`) |
| Scripts / outputs | `scripts/<slug>/` → `analysis/output/<slug>/` |
| Harness | `js/harness/runStudy.mjs` / `analysis/study.mjs` / own script (say which, and why) |
```

## What tends to go wrong

- **Committing the prereg with the scripts and results minutes later in one push.** Then "registered before the run"
  can't be shown. The prereg goes in its own commit, pushed, before any script reads outcome data. `analysis/study.mjs`
  checks this for its studies; for the rest, the commit history is the evidence.
- **Free-form headings instead of the template.** The power (§5) and multiplicity (§6) sections are the ones most often
  skipped, and they're what separate a real null from a test that could never have passed.
- **Variants decided after seeing a debug table.** Every variant goes in the prereg's variant table before it runs
  (blueprint rule L2). One prereg + one logged variant per direction, then a decision.
- **Re-cutting a banked null.** §2 must name the nearest Evidence Book entries and say why this is a different
  question.

## Amendments

Add a `## Amendments` section above `## RESULTS` and append to it. Never create separate addendum files.

```markdown
### A1 — 2026-10-19 — PRE-RESULTS
What changed and why. "No outcome had been computed."

### A2 — 2026-10-20 — POST-HOC (results seen)
What changed and why. Post-hoc cells can only demote or describe; they never turn a fail into a pass.
```
