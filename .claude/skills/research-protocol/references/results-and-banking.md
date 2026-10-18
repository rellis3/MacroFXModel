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
| FAIL, NOTHING PASSES, NULL, DEAD, falsified | `null`, **if** the power table says the cell could have found the effect; otherwise `underpowered` |
| UNJUDGEABLE, UNTESTABLE, INCONCLUSIVE, insufficient data/evidence, "NULL but underpowered" | `underpowered` |
| MIXED | split it: bank each scored question separately |
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

- **`doc` is the prereg path** and **`also` holds the results file**, so `build_trial_ledger.mjs` matches the prereg as
  banked. Pointing `doc` at the results file alone is the main reason banked studies show as unbanked.
- **`date` is the run date**, not the day you banked it.
- **One entry per scored question.** If one prereg yields two ids, give both the same `doc`. If you bank a family under
  one id, list every family prereg in `also`.
- **Instruments** (required for `validated`, recommended always) use these spellings: FX as `EURUSD`; `GOLD` (not
  XAUUSD); `NQ`; `SPX500` (not SPX/ES); `US30` (not DOW); `US2000`; `DE30`; `UK100`. Leaving it out means "applies
  to everything", which is rarely true.
- `use` must not say an effect predicts direction unless that's what was tested (`deskEvidence.test.mjs` rejects
  "predicts direction" / "goes up/down next").
- Add a `POWER` row (`id → { n, note }`) so `citable()` doesn't tag it "power not recorded".

Then run:

```bash
node js/deskEvidence.test.mjs          # shape checks (CI runs this too)
node scripts/build_trial_ledger.mjs    # regenerates MD files/TRIAL_LEDGER.md; never hand-edit it
node js/lessonEvidence.test.mjs        # if you changed an existing id or date that lessons cite
```

Finally, add one line to any domain register that covers the topic (e.g. `cog-knowledge`'s `references/verdicts.md`),
citing the ledger id. The domain register is an index; the Evidence Book is the record.

## Re-runs

When a banked result is re-run (a data fault or bug fix), **update its existing entry** (new `result`, new `date`) and
say in `result` what changed and why ("re-run 2026-10-19 after the net-liquidity unit fix: …"). Don't add a second id
for the same claim.
