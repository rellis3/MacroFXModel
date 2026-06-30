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
   **Now runs on equity indices too — and the US-index basket is the strongest,
   most cost-robust book** (see *Findings* + `RANGE_EXTENSION_GUIDE.md §15`).

Everything else (confluence gates, vol-stretch, approachVel, day-type) were
**experiments that already gave their answer** — see *Findings*. They are not
open threads.

There is **one open question**, below. Resolve it and the project collapses to a
single branch.

---

## The decision point — RESOLVED ✅ (real edge confirmed)

> **Does the Range-Line Strategy have real edge once scored honestly?** → **Yes.**

The full investigation, result, and the four inflation artifacts removed are
documented in **`RANGE_EXTENSION_GUIDE.md`** (§1 the four lies, §10 the locked
spec). Summary:

- The headline fantasy (Sharpe ~24) was **four stacked artifacts**: independence/√N
  → lookahead → per-touch over-count → cross-pair pooling, plus fill optimism. Each
  was found, fixed and committed.
- **What's real:** a single pair, held-position, chandelier trail, at realistic
  (2–3× cost) fills lands at **Sharpe ≈ 3–5** — positive every year, every
  walk-forward fold, DSR 100%. Modest and thin, but real.
- **The working spec** (`RANGE_EXTENSION_GUIDE.md §13`): 14 strong pairs, **full
  ladder**, **fade + follow** (25 fade Asia-extension reversions + 23 follow
  breakouts), one held position per side/day, **chandelier trail on both**. Honest
  single-pair ≈ Sharpe **4.7–6** at realistic cost. (§10 is the simpler
  continuation-only fallback; the **zone-walk** was tested and lost to the
  chandelier — kept for reference.)

**The only remaining step is live wiring** (`RANGE_EXTENSION_GUIDE.md §11`) — a
plumbing job; the ladder is already exported so live builds the identical grid the
policy learned on (no drift). Build it when you choose to go live.

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

## Reminders / TODO

- **DST on the range-line "London" window — the LIVE BOT now auto-handles it.**
  The Asia range must be **London midnight–6am**, but the data is UTC so the
  boundary in UTC depends on DST (London 00:00 = **23:00 UTC** in BST / **00:00
  UTC** in GMT). The **bot producer** (`server.js _rlBoundaryHour`) now computes
  the boundary from the UK clock-change rule (forward 01:00 UTC last Sun March,
  back 01:00 UTC last Sun October) **at each daily freeze** and stores it in the
  plan; the bot reads it. So it is always true London midnight, year-round, with
  nothing to set. `RANGE_BOT_BOUNDARY_HOUR` overrides only for testing.
  - One residual edge: on the changeover Sunday the plan flips at the 06:15 UTC
    freeze, so the range window for that single ambiguous night may be ±1h until
    the next freeze. Inherent to the clock-change night; self-heals next day.
  - The **dashboard backtest** (`range-line-strategy.html`) keeps its manual
    "Range window" dropdown (BST/GMT) — that's the research UI, not the bot.

---

## Findings already banked (don't re-litigate these)

- **No spatial gate rescues the Asia fade.** grade / vol-stretch / day-type /
  approachVel were compared on the OOS card; none reliably lifts it.
  vol-stretch (HL75) ≥0.75 was OOS-positive on one window but regime-sensitive.
- **approachVel does not transfer to range fibs** (spike bucket was the *worst*).
  It was the OOS-proven feature for the σ-forecast lines, not range levels.
- **No live approach-read beats §13 as a cell key** (full six-feature sweep, see
  `RANGE_EXTENSION_GUIDE.md §14`). High-variance features (approachVel/approachER/
  volClimax) *fragment* the cells until the edge dies at cost; low-variance ones
  (wtState/candleReject/roundNum) sit ≈ on the baseline — wtState *ties* (+0.1
  Sharpe on fewer trades, noise), candleReject *degrades* it. Uniform per-zone
  treatment (§13) is confirmed the robust architecture. Open, untested angle: a
  live read as a non-fragmenting FILTER/sizer on top of the fixed decision.
- **The strategy transfers to indices — and is STRONGER there** (`§15`). On the
  honest single-instrument unit, **5 of 6 equity indices beat eurusd at 3× cost**:
  @3× NASDAQ +7.34, Russell +6.58, Dow +6.28, S&P +5.84, DAX +5.33 (eurusd +4.76,
  FTSE +2.62 the laggard). Indices are far more **cost-robust** (decay ~1.3–1.8 vs
  FX's 2.8 across 3×) because the point-range dwarfs the spread. Rigor is a clean
  sweep on all three US majors tested (NASDAQ/Russell/Dow): OOS÷IS ≥1.0, DSR 100%,
  every year + every fold green. The **US-index basket is a co-headline with /
  better than the FX book** and the prime live-wiring target. (Pooling stays
  banned — the all-6 pooled +9.75 was the §1.4 cross-instrument inflation.)
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
