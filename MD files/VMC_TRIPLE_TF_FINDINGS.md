# VuManChu triple-timeframe "buy circle" alignment (1m/3m/5m) — Findings

**Question (owner, 2026-08-26).** A trading group's claim, from posted
TradingView screenshots: when the VuManChu Cipher B **buy circle** (WaveTrend
cross-up while oversold, the green dot) has printed on the 1-minute, 3-minute
AND 5-minute charts together, enter a buy — mirrored for sells. Does that
pattern carry anything, and does it survive costs?

**What already exists (read before building — this is a follow-up, not a
first look).** `vumanchuLab/` (2026-07-30) mapped this terrain at and above
this level: per-TF WT/MF state, multi-timeframe stack agreement (1/5/15m),
trajectory shapes across three TFs, an anchor falsifier, cross-asset
transfer. Its results ARE the priors here:
- All-three-TF **oversold zone** → real, falsifier-surviving lift: gold
  +3.76pp P(up) at 60m vs matched baseline (EURUSD +5.30pp) — roughly double
  the single-TF read. **Real but sub-cost.**
- **Direction-mode** (cross-based) MTF agreement sat BELOW its chance
  baseline — a smoothing-lag artifact. The buy circle is a cross event, so
  this cuts against the pattern.
- Money Flow added nothing incremental over WaveTrend (and FX "volume" is
  tick count) — so the screenshots' money-flow layer is deliberately NOT
  added as a condition here.
- The VMC-confirmed fade (`vumanchuFadeEngine`) tested ≈null as a trade.

**What was genuinely untested:** the specific **event** — a Cipher B circle
(cross while beyond the band) firing on all of 1m/3m/5m within a short
window. That combines zone (oversold) with event (cross), which the Lab's
two modes bracket but never intersected, and 3m was never one of its TFs.

## The unit (pinned, minimal-DOF)

- Circle (buy): on a CLOSED TF bar, WT1 crosses above WT2 with WT2 ≤ −53
  (classic Cipher B; operator WT params 9/12/3, the repo's standard). Sell
  mirrored (cross down, WT2 ≥ +53).
- A circle is "active" for **15 minutes** after its bar closes (one pinned
  number — the screenshots show the three TFs printing the setup around the
  same period, not simultaneously).
- **Episode** = the first minute all three TFs are simultaneously active
  (rising edge). Entry at the NEXT M1 bar's open. Everything is causal:
  nothing is read before its TF bar closes.
- Event study: forward return at 15/30/60/120 min, oriented, vs ≈0 and vs
  the same engine on the seeded random-walk control.
- Trade test: entry as above; SL 1.5×ATR(15m); time exit 60 min
  (mark-to-close); costs 0.020% gold / 0.012% FX; non-overlapping trades.

**Pre-registered before running:** "worked" = OOS per-trade t > 2, positive
mean, positive gross, OOS n ≥ 30, per side. Expectation from the Lab priors:
some positive event-study lift for buys-after-oversold-alignment is
plausible (the zone component), but **null after costs** (the lift measured
at zone level was a few pp; the cross-event mode tested below chance).

## Results (gold + EURUSD + GBPUSD + USDJPY, M1 2016–2026; random-walk control)

**1. The pattern is not rare.** ~15,000 aligned episodes per side per
instrument over the decade — **5–6 per day per side**, and the identical
engine fires at a comparable per-day rate on a pure random walk. The
triple-TF alignment is not selective; it is what a scale-free oscillator
does all day on three correlated timeframes of the same price.

**2. Event study — a whisper of drift on the buy side, nothing on sells.**
Oriented forward return after an aligned BUY episode, at 60 min:

| instrument | buys 60m | buys win% | sells 60m |
|---|---|---|---|
| gold | +0.45bp (t 2.3) | 53% | −0.21bp (ns) |
| EURUSD | +0.24bp (t 2.9) | 52% | +0.08bp (ns, wrong sign) |
| GBPUSD | +0.07bp (ns) | 52% | +0.08bp (ns, wrong sign) |
| USDJPY | +0.25bp (t 2.4) | 54% | +0.03bp (ns) |
| random walk | −0.13bp (ns) | 50% | −0.91bp (ns) |

Direction matches the Lab's zone finding (oversold alignment → slight
upward drift; win-rate lift +2–4pp, same order as the Lab's stack numbers).
Caveats stated: events are minutes apart so forward windows overlap and the
naive t-stats are optimistic; and gold's decade-long uptrend contributes
roughly +0.15bp/h of unconditional drift to the buy side (and explains most
of the gold sells' apparent "edge" at 120m).

**3. Trade test — decisively null, both sides, all four instruments.**
OOS n ≈ 4,700–5,300 per cell; net mean −0.010% to −0.021%/trade with t −5.6
to −8.3; gross ≈ +0.001–0.002%/trade. **The whisper is real-ish but ~10×
smaller than the round-trip cost.** Verdict against the pre-registered bar:
NULL everywhere — as the Lab priors predicted.

## Bottom line, plainly

The screenshots' "how it should look when entering a buy" fires five to six
times a day, carries at best a fifth of a basis point per hour of drift
(part of which is just the instrument's own trend), and loses after any
realistic cost as a standalone entry. This is the same verdict
`vumanchuLab/` reached at zone level, now confirmed at the exact
circle-event level of the group's chart. Where VuManChu HAS shown durable
value in this repo is as **context** — the Lab's oversold-stack lift is
real, and the fixed-sigma return book's WT-neutral-vs-extended conditioning
(gold) held OOS — i.e., the oscillator reads state usefully; it does not
time entries profitably on its own.

## Status

Engine `js/vmcTripleTfEntryV1Engine.js` (+ tests: circle causality on
crafted paths, pure alignment logic on hand-built lists, structural
invariants + determinism on the seeded random walk). Runner
`scripts/run_vmc_triple_tf.mjs`. Registered in `LEGO_MODULES.md`.
