# Project Status — where we are, what's next

> A short, durable checkpoint so the work survives between sessions and you don't
> have to hold the whole tree in your head. Update the **Decision point** when a
> run answers it. Last updated: 2026-06-29.

---

## TL;DR

Two efforts. Both are essentially **done and merged**:

1. **Lego refactor** — reusable bricks extracted, registered, live bots untouched. ✅
2. **Range-Line Strategy** — the clean per-line confidence engine on Asia/Monday
   range levels, modules stripped, now scored with **honest** risk math. ✅ built.

Everything else (confluence gates, vol-stretch, approachVel, day-type) were
**experiments that already gave their answer** — see *Findings*. They are not
open threads.

There is **one open question**, below. Resolve it and the project collapses to a
single branch.

---

## The decision point (the only thing that matters next)

> **Does the Range-Line Strategy have real edge once scored honestly?**

The first 26-pair run showed Sharpe 56 — proven to be an **artifact** of scoring
~111k correlated, simultaneous touches as independent bets. That's now fixed
(daily portfolio aggregation, merged in #531/#532).

**Next action:** re-run the 26-pair book at `range-line-strategy.html` and read
**only two things**:

- **Portfolio Sharpe (daily ×√252)** — the honest headline.
- **Survivors card** — pairs whose OOS edge clears their *own* spread; the book
  you'd actually trade.

Ignore total return (it's 1-unit-per-signal scale, not an account curve) and the
per-trade Sharpe (still inflated by design — kept only for distribution context).

### Fork on the result
- **Survivor Sharpe ≈ 1+ on a real cluster of pairs** → there's something.
  Next: walk-forward + per-year stability (`runRigor`), then live wiring (below).
- **Collapses to ≈ 0 after honest scoring** → the range-fade doesn't carry costs.
  That is a **real, valuable finding**, not a failure. Park the strategy.

---

## If (and only if) edge survives — the live path (prepared, not built)

The analyser already **exports its ladder** (`LADDER_LEVELS`, `buildRangeLadder`
in `js/rangeLineAnalyser.js`) so a live producer can build the *identical* grid
the offline policy learned on — same labels → same cell keys → no backtest/live
drift (the failure mode `TRADABILITY_REVIEW.md` warns about).

- **Not yet built:** `js/levelsV2Engine.js` (the live producer). Referenced in
  comments as the intended consumer; the file does not exist.
- Do **not** build it until the decision point says the edge is real.

---

## Findings already banked (don't re-litigate these)

- **No spatial gate rescues the Asia fade.** grade / vol-stretch / day-type /
  approachVel were compared on the OOS card; none reliably lifts it.
  vol-stretch (HL75) ≥0.75 was OOS-positive on one window but regime-sensitive.
- **approachVel does not transfer to range fibs** (spike bucket was the *worst*).
  It was the OOS-proven feature for the σ-forecast lines, not range levels.
- **The problem was construction/independence, not selection.** High-win-rate
  but losing levels proved R:R/exit is the lever, and the headline blow-up was
  the per-touch independence assumption — both now addressed honestly.
- **Live ≠ backtest engines.** The live alert path and the backtest run different
  code; documented in `CONFLUENCE_LIVE_VS_BACKTEST.md`. The v2 ladder export is
  the start of closing that gap for the range-line strategy.

---

## Map (where to look)

| Want to… | Go to |
|---|---|
| Run the range-line book | `range-line-strategy.html` → `/api/range-line/run` (server.js) |
| Read the engine | `js/rangeLineAnalyser.js` (→ `js/perLineStrategy.js`) |
| See every reusable brick | `LEGO_MODULES.md` |
| Understand the design basis | `ENTRY_ZONE_CONFIDENCE.md`, `REVERSION_CONTINUATION_CONCEPT.md` |
| Honest critique / what's real | `SYSTEM_ASSESSMENT.md`, `TRADABILITY_REVIEW.md` |
| The rules for building here | `CLAUDE.md` |
