# OI bot — local-regime gate forward-test plan

Pre-registered per `CLAUDE.md`'s "pre-register both outcomes before running a
test" rule, before `localRegime` (`js/oiZones.js`, PR #1296) is ever turned on
in the live/paper producer. This is a **mechanism**, not yet a proven edge —
see `LEGO_MODULES.md §1` (`js/oiZones.js` entry) for what it does and why.

## 0. Blocking precondition — fix before this plan can even start

The flag is a **no-op whenever the day-expiry path is active**. `server.js`
(~line 11626) builds `tradeInst` from `inst.dayExpiry` and explicitly sets
`gexFlip: undefined, gexFlips: undefined` — the day-expiry's own crossings are
discarded, so `buildOIZones` always falls back to the degrade-when-absent path
regardless of the flag. Since the bot trades the near-dated day expiry
whenever one is present (that's the whole point of the day-expiry feature —
see the `js/oiZones.js` LEGO_MODULES entry), this means **the gate currently
can't fire on the instrument/expiry combination the bot actually trades most
of the time.**

Before step 1 below: wire the day-expiry's own `gexFlips` through (compute
them off `dayEx`'s strikes/calls/puts via the same `gexFlipCrossings` call
`js/oi.js:2164` already uses for the base book, attach to `dayEx`, and stop
nulling `gexFlips` on `tradeInst`). Add a `js/oiZones.test.mjs` or
`server`-level test asserting the day-expiry's own flips reach the planner,
not the base book's. Until that lands, do not proceed past step 0 — a forward
test run against the base-book flips would be testing the wrong gamma
geometry for the trades actually being placed.

## 1. Mechanism, restated plainly

`localRegime` doesn't change WHICH zones the bot proposes (walls, sides,
entries are all computed exactly as before). It only re-grades a fade/break
zone's **size** and **rationale annotation** by checking whether the wall's
own price sits in the same net-GEX band as spot (via `oiRegimeBands`). A
mismatch trims `sizeFactor` ×0.5 and appends a warning; a match is unchanged.
So the entire effect of turning it on is: **some trades get smaller, none
get added or removed, none change side.**

## 2. What "it worked" and "it didn't" look like — pre-registered

This is a risk/timing correctness claim (dealers dampen or accelerate a move
depending on which gamma band a wall sits in), not a new alpha source, so the
test is: **do the trims correlate with the trades that would have gone worse
anyway?**

- **Worked:** among fade zones the gate flags as regime-mismatched
  (short-gamma band), the realized outcome (hit SL / failed to hold vs hit
  TP1) is measurably worse than regime-matched fades of comparable wall
  tier/strength, in the SAME direction the mechanism predicts (mismatched
  fades break through more often). A trim that isn't correlated with worse
  outcomes is a size reduction with no informational content — that's a null,
  not a partial win.
- **Didn't work / null:** no measurable difference in hit-rate or MAE between
  flagged and unflagged fades of comparable tier, OR the difference exists but
  is the WRONG sign (flagged fades actually hold better) — report that
  plainly rather than re-narrating it as "the trim just needed tuning."
- **Floor / naive benchmark:** the bot's existing hit-rate on unflagged fades
  of the same wall tier, over the same window. The gate has to beat that
  subgroup's own baseline, not an unconditional average (Simpson's-paradox
  risk if short-gamma-band walls also happen to differ in tier/strength from
  long-gamma-band ones).

## 3. How to run it — shadow-only, never live-sized, until step 2 has an answer

Do **not** flip `localRegime` on in `oi_bot_config` for step 2. Instead:

1. Compute `buildOIZones(tradeInst, spot, { ...cfg, localRegime: true })` in
   parallel with the real (flag-off) call on every producer refresh cycle
   (10-min cadence, same as `_refreshOIBotZones`), for every in-universe
   instrument/day. This produces the SAME entries/sides as live, plus the
   would-be trim + mismatch annotation, without touching what the executor
   actually risks.
2. Log the shadow zone set alongside the real one — e.g. a new
   `oi_bot_shadow_regime` KV entry or an appended field on the existing
   per-refresh record: `{zone_id, wallPrice, mismatched: bool, actualOutcome}`
   filled in once `oi_bot_trades` records how that zone actually resolved
   (hit TP1/TP2, hit SL, expired unfilled).
3. Only after step 0's plumbing fix, this correlation has enough sample size,
   and the answer in §2 comes back "worked" — flip `localRegime: true` in the
   live config, and even then per-instrument (start with the highest-liquidity
   book, e.g. gold or one index) rather than universe-wide, per the project's
   general "prove one thing OOS and forward before adding surface" discipline.

## 4. Minimum sample size before drawing a conclusion

Per `CLAUDE.md`'s OOS discipline (≥30 non-trivial trades to call a result):
**≥30 regime-mismatched fade zones that actually reached a resolved outcome**
(TP/SL hit, not still-open or expired-unfilled) before comparing hit-rates.
Given the OI bot's trade cadence (per the executor: one-shot per zone, priming
away overnight, gold+indices default universe), expect this to take multiple
weeks of the shadow log running, not days — do not shortcut this by pooling
across instruments with materially different gamma-band tightness (FX vs
gold vs indices) to hit 30 faster; disaggregate first, then check whether the
survivors beat chance (small-cell multiple-testing risk, per CLAUDE.md).

## 5. Explicitly NOT this plan's job

- Proving the day-expiry-vs-base-book gamma split itself (already shipped,
  separate feature).
- Tuning `localRegimeTrim` away from 0.5 — that's a second free parameter on
  top of an unproven mechanism; only consider it after §2 says "worked" on
  the untuned default.
- Extending the gate to Mode D (react-at-levels) or the max-pain-reversion
  mode — this plan and the shipped code both scope it to fade/break zones
  only.
