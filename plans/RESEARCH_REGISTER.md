# Research register

Every study, test or exploratory analysis has one row here, from the moment it's claimed until it's banked or dropped.
This file is how parallel sessions see each other's work. Protocol: `.claude/skills/research-protocol/SKILL.md`; row
format and statuses: its `references/register.md`. See what is in flight on other branches, including rows not yet
merged here, with:

```bash
node .claude/skills/research-protocol/scripts/research_status.mjs
```

Rules: claim a row before writing a prereg, and push it. Edit only your own rows. On a merge conflict, keep both
sides' rows. Move finished rows to Done; never delete them.

Seeded 2026-10-18 from the first status report. Rows below are the studies that were found registered or run but not
banked, plus one re-run that a data fault requires. The other preregs with no banked verdict are listed by the status
script (§4) until someone claims, banks or parks each one.

## Active

| ID | Question | Status | Branch | Updated | Prereg | Results | Ledger | Next |
|---|---|---|---|---|---|---|---|---|
| zero-gamma-distance | Does distance to zero gamma predict NQ next-day range? | RESULTS | claude/dynamic-hedging-market-flows-f6f5h8 | 2026-10-18 | `oi_research_book/ZERO_GAMMA_DISTANCE_PREREG.md` | `oi_research_book/ZERO_GAMMA_DISTANCE_RESULTS.md` | — | bank as UNDERPOWERED (file says "NULL by the registered rule — and underpowered") |
| one-range-forecast | Do the validated market-state flags still add on top of the shipped range lines? | RESULTS | claude/dynamic-hedging-market-flows-f6f5h8 | 2026-10-18 | `forge/ONE_RANGE_FORECAST_PREREG.md` | in the prereg | — | verdict written as MIXED: bank each scored question separately |
| range-book-family | 33 EURUSD/cross-pair range-book studies (fades, breaks, exits, IV/RV, COT, confluence…) | RESULTS | fade-continue-book | 2026-10-03 | `forge/RANGE_BOOK_EURUSD_PREREG.md` + 32 more on that branch | `analysis/output/rangebook/*_RESULTS.md` (35) | — | needs owner: the branch was never merged, so main can't see these results. Merge or close it, then bank each study |
| positioning-into-release | Does positioning into a release change the move after it? | REGISTERED | main | 2026-10-17 | `MD files/POSITIONING_INTO_RELEASE_PREREG.md` | — | — | run it, or mark PARKED with the reason |
| macro-confluence-rerun | Do the macro-confluence verdicts survive the net-liquidity unit fix? | RE-RUN | main | 2026-10-18 | (original preregs) | — | macro-confluence-direction, macro-confluence-baa-credit, macro-confluence-range | re-run with `js/netLiquidity.js` (DATA_SPEC §5 #8); update the three entries in place |
| ripple-book | Does the all-expiry OI book read NQ range better than the day book, and do its walls hold? | RESULTS | main | 2026-10-18 | `oi_research_book/RIPPLE_BOOK_PREREG.md` | `oi_research_book/RIPPLE_BOOK_RESULTS.md` | — | bank per scored question: main test UNDERPOWERED (written as UNJUDGEABLE; 94 days vs 400 gate), wall test checked separately |
| gex-ladder-confluence | Do GEX walls that coincide with ladder lines react differently? | RESULTS | main | 2026-10-18 | `oi_research_book/GEX_LADDER_CONFLUENCE_PREREG.md` | `oi_research_book/GEX_LADDER_CONFLUENCE_RESULTS.md` | — | bank as UNDERPOWERED (308 < 400 registered minimum) |
| futures-cost-rescore | Do line-touch results survive futures costs? | RESULTS | main | 2026-10-18 | `forge/FUTURES_COST_RESCORE_PREREG.md` | in the prereg (Results record 2026-10-11) | — | bank |

## Done

| ID | Question | Status | Branch | Updated | Prereg | Results | Ledger | Next |
|---|---|---|---|---|---|---|---|---|
