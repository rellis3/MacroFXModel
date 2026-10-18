# The research register (`plans/RESEARCH_REGISTER.md`)

One row per study, from the moment someone claims it until it's banked or dropped. It's the only place that says
**who is doing what right now**. The Evidence Book only shows finished, banked work, and the trial ledger is derived
from it.

## Row format

```markdown
| ID | Question | Status | Branch | Updated | Prereg | Results | Ledger | Next |
|---|---|---|---|---|---|---|---|---|
| zero-gamma-distance | Does distance to zero gamma predict NQ next-day range? | RESULTS | claude/dynamic-hedging-market-flows-f6f5h8 | 2026-10-18 | `oi_research_book/ZERO_GAMMA_DISTANCE_PREREG.md` | `oi_research_book/ZERO_GAMMA_DISTANCE_RESULTS.md` | — | bank as UNDERPOWERED |
```

- **ID** is the slug (see SKILL.md, "Naming").
- **Question** is one line, phrased as a question.
- **Branch** is the branch the work lives on, so others can find it before it merges.
- **Updated** is the date of the last status change (YYYY-MM-DD). The status script flags active rows older than 14
  days.
- **Ledger** holds the Evidence Book id(s), comma-separated, once banked; otherwise `—`.
- **Next** is the next concrete step, or the blocker ("needs owner: …").

Keep the cells free of `|` characters.

## Statuses

| Status | Means | Moves to |
|---|---|---|
| `CLAIMED` | someone is designing it; no prereg yet | REGISTERED, EXPLORATORY, ABANDONED |
| `EXPLORATORY` | a quick look, not pre-registered, never banked as validated | REGISTERED (on fresh data), ABANDONED, DONE |
| `REGISTERED` | prereg committed and pushed; nothing run | RUNNING, PARKED |
| `RUNNING` | scripts touching outcome data | RESULTS |
| `RESULTS` | results file written; not yet in the Evidence Book | BANKED |
| `BANKED` | ledger entry exists and the trial ledger was regenerated | (moves to Done) |
| `PARKED` | stopped on purpose; the Next column says what would restart it | REGISTERED, ABANDONED |
| `ABANDONED` | dropped after registration; **still bank it** (usually `underpowered` or a note) so the search remembers it | (moves to Done) |
| `RE-RUN` | a banked result whose inputs were later found wrong (data fault, bug); Next names the fault | RUNNING → BANKED (update the old entry) |

## Sections

The file has `## Active` (everything not finished) and `## Done` (BANKED / ABANDONED / EXPLORATORY that went nowhere,
newest first). Move a row to Done when it's finished. Don't delete rows.

## Editing etiquette across sessions

- Edit only your own rows. Add new rows at the bottom of Active.
- When merging main into your branch causes a register conflict, keep both sides' rows. It's a list, not a document.
- Your row lives on your branch until merge. That's fine: `research_status.mjs` reads registers on every recently active
  branch, so pushing the row is enough for others to see it.
