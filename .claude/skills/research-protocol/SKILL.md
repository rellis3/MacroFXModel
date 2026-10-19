---
name: research-protocol
description: The one way every study, test, backtest or data analysis is run in this repo, from claiming it to banking the verdict, so parallel sessions work the same way and can see each other's work. Covers the research register (plans/RESEARCH_REGISTER.md) and the status script that shows in-flight work on other branches, pre-registration, file layout and naming, commit order, seeds and bootstrap, the four verdict words, results files, banking in the Evidence Book (js/deskEvidence.js) and regenerating the trial ledger. Use this whenever a session is about to test an idea, run a study or backtest, write a prereg or results file, report or bank a verdict, re-run an old test, or asks "has anyone tested X?" / "what is being worked on?". Use it for quick exploratory looks too, which still get a register row. Pair it with data-rules (how to load data correctly) and, for C.OG material, cog-knowledge.
---

# Research protocol

Many sessions run studies here at the same time, each on its own branch. Without one protocol each session invents
its own folder layout, verdict words, seeds and banking habits. Work then sits unmerged where nobody can see it, and
the record of what was tried drifts away from what was actually tried. On 2026-10-18 there were 38 preregs on main
with no banked verdict, a trial ledger 11 days stale, and a branch carrying 33 preregs with results that had never
been merged. This skill is the shared way of working. It doesn't replace the repo's tools; it says which one to use,
when, and in what order.

## Step 0, every time: look before you start

```bash
node .claude/skills/research-protocol/scripts/research_status.mjs
```

This takes about 2 seconds and is read-only. It shows the register on main, register rows and new preregs/results that
exist **only on other branches** (work that's in flight but not merged), hygiene problems, and preregs with no banked
verdict. Also search the Evidence Book (`js/deskEvidence.js`) and the domain registers (e.g. `cog-knowledge`'s
`references/verdicts.md`) for the question. If someone is already on it, or it's a banked null, say so to the user
before doing anything. "Re-running a banked null in new clothes is not allowed" (`MD files/PREREG_TEMPLATE.md`).

## The lifecycle

| Step | What you do | Commit |
|---|---|---|
| 1. **Claim** | Add a row to `plans/RESEARCH_REGISTER.md`: status `CLAIMED`, your branch, today's date, the question, next step | commit + push straight away; this is how other sessions see you |
| 2. **Register** | Write `forge/<STEM>_PREREG.md` from `MD files/PREREG_TEMPLATE.md` plus the header block in `references/prereg.md`. Register row → `REGISTERED` | **the prereg and its register row, nothing else**, pushed **before** any script computes a setup outcome (control-sample SDs for the power table are allowed, as the template says) |
| 3. **Build & run** | Scripts in `scripts/<slug>/`, outputs in `analysis/output/<slug>/`. One seed for the whole study, from the prereg. Row → `RUNNING` | scripts may be committed as you go |
| 4. **Results** | `analysis/output/<slug>/RESULTS.md` + `results.json` (`references/results-and-banking.md`). Verdict is one of the four words. Row → `RESULTS` | results in their own commit, never the prereg's |
| 5. **Bank** | Ledger entry in `js/deskEvidence.js` (`doc` = the prereg path), a `POWER` row, then `node scripts/build_trial_ledger.mjs`, a one-liner in any domain register, then row → `BANKED` with the ledger id | **same PR as the results**; run `node js/deskEvidence.test.mjs` first |
| 6. **Surface** | Open the PR (draft is fine) so the work is reviewable, and say in it which register row it closes | — |

Work on the session's own branch; one study (or one family) per PR keeps review and banking clean.
Step 1 takes one minute, and it's the step that fixes visibility. A study with no register row is invisible until
somebody merges it, and that can be never.

**Exploratory looks** (a quick "is there anything here?") skip steps 2 and 5, but they still get a register row
(`status: EXPLORATORY`). The answer must be labelled "exploratory, not pre-registered". An exploratory result is never
banked as `validated`. If it looks interesting, the next step is a prereg on fresh data.

## Naming: one id, everywhere

Pick the id once at Claim. Keep it short and specific, e.g. `zero-gamma-distance`.

| Thing | Form | Example |
|---|---|---|
| register ID, ledger id, folders | lower-kebab `slug` | `zero-gamma-distance` |
| prereg file | `forge/<STEM>_PREREG.md`, STEM = UPPER_SNAKE of the slug | `forge/ZERO_GAMMA_DISTANCE_PREREG.md` |
| scripts | `scripts/<slug>/` | `scripts/zero-gamma-distance/score.py` |
| outputs | `analysis/output/<slug>/RESULTS.md`, `results.json` | — |

There are two exceptions. A study run through `analysis/study.mjs` keeps its prereg in `MD files/`, because that tool
only reads there. A study in the OI book keeps `oi_research_book/` and its numbered scripts. In both cases the slug is
still the same everywhere else. A follow-up to a study is a new slug (`<slug>-confirm`), not a reused folder. Don't
put unrelated studies in someone else's output folder.

## Rules that stop the record drifting

- **Four verdict words, no others:** `VALIDATED`, `NULL`, `UNDERPOWERED`, `CONTEXT` (the Evidence Book's
  `validated|null|underpowered|context`). "UNJUDGEABLE", "FAIL", "NOTHING PASSES", "MIXED", "DEAD", "INCONCLUSIVE" and
  "NULL but underpowered" are not verdicts. Translate them with the table in `references/results-and-banking.md`. A
  cell that couldn't reach its own pass bar is `UNDERPOWERED`, never `NULL`.
- **Amendments live inside the prereg**, under `## Amendments`, each dated and tagged `PRE-RESULTS` or
  `POST-HOC (results seen)`. A post-hoc amendment can only demote or describe, never promote. No separate
  `_ADDENDUM_*.md` files.
- **One seed per study**, written in the prereg header and recorded in `results.json`. Use the prereg date as YYYYMMDD
  unless the study runs through `js/harness/runStudy.mjs` (seed fixed there). Defaults for the bootstrap are in
  `references/stats-defaults.md`.
- **Bank everything you score**, including nulls, underpowered and abandoned-after-registration. An unbanked
  prereg is a miss the search forgets, and that makes the record look better than it is.
- **A data fault that touches a banked result** gets a register row with status `RE-RUN` for each affected ledger id,
  in the same change that records the fault (see `data-rules`).
- **Don't edit someone else's in-flight study.** If the status report shows another branch on the same question,
  coordinate through the user, or claim a clearly different question.

## Reference files

| File | Read when |
|---|---|
| `references/register.md` | writing or updating a register row; statuses and their meaning |
| `references/prereg.md` | writing a prereg: the header block, which template sections matter most, amendments |
| `references/stats-defaults.md` | choosing the bootstrap, seed, multiplicity, placebo, power; the lockbox; lessons the hard way |
| `references/results-and-banking.md` | writing RESULTS.md / results.json, translating verdict words, the ledger entry, instruments, POWER, regenerating the ledger |
| `references/existing-tools.md` | which repo tool to use (study.mjs, runStudy, preregStats, build_trial_ledger) and where older studies live |

## Growing this skill

When a session learns something about *how* to run studies (a check that caught a bug, a placebo design that
misled, a convention the owner set), add it in the same change: method lessons go in `references/stats-defaults.md`
under "Lessons", conventions in this file's rules. Date every addition. If you change a convention, say what happens to
studies already in flight under the old one (normally: they finish under the old one).
