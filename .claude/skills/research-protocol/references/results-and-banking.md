# Results files and banking

## `analysis/output/<slug>/RESULTS.md`

```markdown
# <slug> — results

Prereg: `forge/<STEM>_PREREG.md` (committed in `<short sha>`, <date>). Run <YYYY-MM-DD>, seed <seed>, B = <n>.
Branch `<branch>`. Ledger id(s): `<id>`.

## Verdict: VALIDATED | NULL | UNDERPOWERED | CONTEXT

One paragraph: the registered gate, whether it held, the scored numbers with intervals.

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|

## Controls (placebo, time shift, news baseline, concentration)

## Deviations from the prereg
None / the dated amendments and what they changed.

## Descriptive (not part of the verdict)

## What this changes
What the page / bot / brief does now; what would reopen it.
```

## `analysis/output/<slug>/results.json`

```json
{ "id": "<slug>", "verdict": "null", "ranAt": "2026-10-18T14:02:00Z", "seed": 20261018, "B": 2000,
  "prereg": "forge/<STEM>_PREREG.md", "preregCommit": "<sha>", "branch": "<branch>",
  "cells": [{ "name": "...", "n": 412, "est": 0.03, "lo": -0.05, "hi": 0.11, "mde": 0.12, "p": 0.41, "verdict": "underpowered" }] }
```

`analysis/study.mjs bank` reads `ranAt` to check the prereg came first.

## Verdict words: translate legacy terms

| Seen in a results file | Bank as |
|---|---|
| PASS, PASSES as registered, REAL, SUPPORTED | `validated` (only if the registered gate held) |
| FAIL, NOTHING PASSES, NULL, DEAD, falsified | `null` **if** the cell could have found the effect, otherwise `underpowered` (rule below) |
| UNJUDGEABLE, UNTESTABLE, INCONCLUSIVE, insufficient data/evidence, "NULL but underpowered" | `underpowered` |
| MIXED | split it: bank each scored question separately |

**Null or underpowered?** Use the prereg's power table (MDE ≤ pass bar → it could have found it). Older studies often
have no power table. Then use the interval: if the 95% CI **excludes the pass bar** (the effect the gate needed is
ruled out), bank `null`; if the CI still **includes** the pass bar, bank `underpowered`. A registered minimum-n gate
that wasn't reached (e.g. 308 < 400) is `underpowered` for that cell.

**Split before you bank.** Read every scored question in the prereg, not just the headline or the register's Next
column. One prereg can hold an underpowered main test and a clean null on a secondary gate (`ripple-book` did).
Each gets its own entry.
| base rate, descriptive, "explained by news timing", statistical but not economic | `context` (and say why in `use`) |

## The ledger entry (`js/deskEvidence.js`)

```js
{
  id: '<slug>', domain: 'macro|events|positioning|price|volatility|execution', verdict: 'validated|null|underpowered|context',
  date: '<run date YYYY-MM-DD>', doc: 'forge/<STEM>_PREREG.md', also: ['analysis/output/<slug>/RESULTS.md'],
  claim: 'One sentence, as the prereg states it',
  result: 'The scored numbers with n and intervals',
  use: 'What a page or bot may and may not say because of this',
  instruments: ['NQ'],
},
```

- **`doc` is the prereg path** and **`also` holds the results file.** `build_trial_ledger.mjs` matches a prereg to an
  entry by file stem (`_PREREG`/`_RESULTS` stripped). Under this skill's layout every results file is called
  `RESULTS.md`, so only the prereg path identifies the study. Banking a family under one id without listing each
  prereg in `also` is the other way studies end up showing as unbanked.
- **`date` is the run date**, not the day you banked it. RESULTS.md must state it. For an older study whose results
  file doesn't, use the earliest date you can prove it had run by (a commit, a later file that cites it), and write
  "run by <date>" in `result`.
- **`domain`**: `volatility` (ranges, σ, vol forecasts), `price` (direction, levels, reversion/continuation),
  `positioning` (OI, GEX, COT, flows), `macro` (rates, liquidity, data releases as drivers), `events` (calendar and
  event-window effects), `execution` (costs, fills, stops, sizing). When in doubt, copy the domain of the nearest
  existing entry on the same question.
- **One entry per scored question.** If one prereg yields two ids, give both the same `doc`. If you bank a family under
  one id, list every family prereg in `also`.
- **Instruments** (required for `validated`, recommended always) use these spellings: FX as `EURUSD`; `GOLD` (not
  XAUUSD); `NQ` (not NAS100; the alias table maps them anyway); `SPX500` (not SPX/ES); `US30` (not DOW, which has no
  alias); `US2000`; `DE30`; `UK100`. Leaving it out means "applies
  to everything", which is rarely true.
- `use` must not say an effect predicts direction unless that's what was tested (`deskEvidence.test.mjs` rejects
  "predicts direction" / "goes up/down next").
- Add a `POWER` row (`id → { n, note }`) so `citable()` doesn't tag it "power not recorded". `n` is the number of
  **independent units** the verdict rests on (de-clustered events, episodes, or sessions/clusters for a block
  bootstrap), not raw rows. `note` gives the MDE or the gate (e.g. "308 resolved lines vs 400 registered gate").

Then run:

```bash
node js/deskEvidence.test.mjs          # shape checks (CI runs this too)
node scripts/build_trial_ledger.mjs    # from the repo root (paths are repo-relative); regenerates MD files/TRIAL_LEDGER.md, never hand-edit it
node js/lessonEvidence.test.mjs        # if you changed an existing id or date that lessons cite
```

Finally, add one line to any domain register that covers the topic (e.g. `cog-knowledge`'s `references/verdicts.md`),
citing the ledger id. The domain register is an index; the Evidence Book is the record.

## Re-runs

When a banked result is re-run (a data fault or bug fix), **update its existing entry** (new `result`, new `date`) and
say in `result` what changed and why ("re-run 2026-10-19 after the net-liquidity unit fix: …"). Don't add a second id
for the same claim.
