# Pre-registration — (A) the event-day confound, (B) does G3's wall edge predict direction?

**Written 2026-09-24, before either outcome was computed.** Committed before the run.

Two independent tests, pre-registered together because they run on the same frame.
They are counted separately against the multiple-testing budget.

---

## TEST A — is the GEX range finding just event days?

`GEX_RANGE_BROWNIAN_RESULTS.md` (2026-09-24) found next-day realised range +0.315
higher on short-gamma days once matched on trailing vol. Its own stated reversal
condition:

> "Negative net GEX may proxy for **event days** (CPI, FOMC, opex), which have large
> ranges for reasons that have nothing to do with dealer hedging. This has not been
> tested and is the most likely way the finding is wrong."

### Design

Event days from `data/calendar/ff_calendar_2007_2025.csv`, USD only:

- `Federal Funds Rate` (FOMC decision)
- `CPI m/m`, `Core CPI m/m`
- `Non-Farm Employment Change`
- monthly opex — third Friday of each month, computed not scraped

**The range happens at t+1, so the exclusion is on t+1, not t.** Drop any observation
whose *next* day is an event day, then re-run the vol-matched comparison.

### Coverage limit, stated up front

The calendar ends **2025-04-07**; the GEX frame runs to 2026-09-04. Test A therefore
runs on the covered subset only (~570 of 793 days). Days after 2025-04-07 are
**excluded from Test A entirely** rather than assumed event-free — assuming them clean
would manufacture the answer. The reduced-n result is what gets reported.

### Verdict rule

- **SURVIVES** — vol-matched ΔDR on non-event days stays ≥ **0.10** with the same sign.
- **CONFOUNDED** — ΔDR falls below **0.05**, or flips sign.
- **PARTIAL** — between 0.05 and 0.10. The finding then holds only in weakened form
  and the results file must be amended to say so.

A control is also reported: ΔDR on the *excluded* event days alone. If the effect is
genuinely an event artifact, that subset should carry most of it.

---

## TEST B — does G3's wall edge predict next-day direction?

G3 supplies the **only** directional input to the COG shadow's trade/no-trade call,
and has never been tested. This is the lesson's slide-28 bucket test
(`education/mean-reversion-of-residuals-notes.md`): *"Prove the displacement predicts
the next move before writing any rule."* G3 has a rule and no bucket test.

### The displacement, reconstructed exactly as the live engine computes it

From `cog-replication/engine/cogShadow.js::computeG3`, unchanged:

```
dominant = call wall if call_oi >= put_oi * 1.2
           put  wall if put_oi  >= call_oi * 1.2
           else NEUTRAL (a range, not a magnet)
edgePct  = (dominant - spot) / spot * 100
if |edgePct| < 0.15 -> NEUTRAL (pinned)
direction = LONG if edgePct > 0 else SHORT
```

Target: `fwd_ret_1d`. Signal at t, return at t+1.

### The tests

1. **Bucket test** — mean next-day return by `edgePct` bucket
   (< −1.5, −1.5..−0.5, −0.5..0.5, 0.5..1.5, > 1.5, in edge-% units).
   Thesis predicts a **monotone increasing** staircase: wall above spot → price
   pulled up.
2. **Directional hit rate** — `sign(edgePct)` vs `sign(fwd_ret_1d)` on non-neutral
   days, against 50%.
3. **IC** — Spearman correlation of `edgePct` with `fwd_ret_1d`.
4. **Chronological IS/OOS split at 60%**, both reported.
5. **Costs** — NQ spread as a fraction of the move, applied before any hit rate is
   quoted as tradable. The repo's feasibility gate (spread/ATR > 0.15 = dead) is
   computed and reported.

### Verdict rule

- **SUPPORTED** — OOS hit rate ≥ **55%** with n ≥ 100 **and** OOS IC > 0 with the
  bucket staircase in the predicted direction.
- **NULL** — OOS hit rate within **48–52%**, or IC ≤ 0, or the staircase is flat or
  inverted.
- **INCONCLUSIVE** — anything else. Not a licence to re-cut.

### Prior that should be stated before running

On 2026-09-23 the OI wall placebo found walls reject no more than neighbouring
strikes or random prices. That tested walls as **barriers**; this tests them as
**magnets**. Different object, but close enough that **I expect Test B to come back
NULL**, and that expectation is written here so a null cannot later be presented as
a surprise, nor a positive result as confirmation of a prior I never held.

### Placebo

Shuffle `edgePct` against dates (block shuffle, preserving its autocorrelation).
Must return a hit rate within 48–52%.

---

## What each outcome changes

| | Result | Consequence |
|---|---|---|
| A | SURVIVES | GEX range finding stands; G2 may be rebuilt around "long gamma is quiet" |
| A | CONFOUNDED | `GEX_RANGE_BROWNIAN_RESULTS.md` is amended to a null; G2's mapping stays unvalidated |
| B | SUPPORTED | G3 has a real directional edge — the first in this family; test costs before any use |
| B | NULL | G3 supplies the shadow's only direction from a variable with no directional content. The live alert must say so, and the shadow's premise needs revisiting in `DECISIONS.md` |
