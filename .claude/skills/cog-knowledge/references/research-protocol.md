# Research protocol for cog tests

The house approach is "built ≠ works ≠ has edge". Every claim of edge goes through pre-registration, a true IS/OOS
split, real costs, and comparison with the incumbent.

## The general protocol lives in the `research-protocol` skill

Claiming a register row, the prereg template (`MD files/PREREG_TEMPLATE.md` plus a header block), file layout,
commit order, seeds and bootstrap defaults, the four verdict words, results files and banking are all in
`.claude/skills/research-protocol/`. Follow that for every cog test. This file keeps only what is specific to COG
work.

### COG-specific additions to a prereg

- **Publication lags** for liquidity/credit inputs: WALCL 8d, TGA 2d, RRP 1d, HY OAS 1d. Use `js/netLiquidity.js`
  for net liquidity. WALCL and WTREGEN are in $ millions; RRPONTSYD is in $ billions.
- **Precedent verdict bands** (G1): SUPPORTED ≥ 55% with p < 0.05 and ≥ 20 independent episodes; NULL 48–52%;
  otherwise INCONCLUSIVE. Bank these as `validated` / `null` / `underpowered` (see the research-protocol verdict
  table).
- **Count independent episodes**, not days. A daily gate that holds for weeks is one episode.
- **Older cog preregs** (`cog-replication/G1_PREREG.md`, `forge/COG_SETUPS_PREREG.md`,
  `forge/COG_SPREAD_DIRECTION_PREREG.md`, `forge/COG_*` from October) used a 13-section layout and a month-block
  bootstrap (60-day mean block, B = 2000, seed 20261007). Leave them as they are. New tests use the
  research-protocol defaults.

## Hard-won backtest rules (`cog-replication/README.md`)

1. Stops must be live from the fill minute. `filter(b => b.t > entryBar.t)` is right for choosing a fill and wrong for
   walking an exit.
2. A validator that inherits the assumption it is testing is not a validator.
3. Trust paired within-engine comparisons over absolute Sharpes.
4. Check concentration before believing any full-sample edge.
5. Measure costs, never assume them (measured: NAS100 0.937bp, XAU 1.521bp).
6. Never fill on a bar before the signal time; signal-log resolution fills at the next M5 bar open.
7. Lego Principle #5: true IS/OOS, real costs, OOS ≥ 30 trades, beat the incumbent on OOS.

## Forward-log scoring (`cog-replication/FORWARD_LOG.md`)

- Track "Agree with COG?" and "Who was RIGHT?" separately; agreement is not the goal.
- Pre-registered bar: agreement real if ≥ 70% at n ≥ 30, null if ≤ 60%.
- Runs test against the expected runs `2·nL·nS/n + 1`.
- Log COG's rows as they land. Never reconstruct them afterwards.

## Decisions

Decisions go in `cog-replication/DECISIONS.md`, newest first, in the form `## YYYY-MM-DD — <headline>` then
**Decided / Why / Reverses if**.

## Method lessons

The lessons from the rates / Nasdaq / FX work (placebo design, reading gates against verdict code, news
baselines, selection-aware placebos, bar stamping, same-day vs forward) moved on 2026-10-18 to
`.claude/skills/research-protocol/references/stats-defaults.md` → Lessons, where every study sees them.
