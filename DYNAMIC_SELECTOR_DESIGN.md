# Dynamic Selector Layer — design note

**Status:** proposal, for review before any code. Nothing here is built yet.

**The question, stated honestly:** *should the volatility system tweak its
fade/follow (and band-sizing) logic per pair type and volatility level, instead
of using one static rule per asset class?* This layer is how we **answer** that
question — it is not a bot that assumes the answer is yes. There is a real,
pre-registered chance the answer is **"no, the differences are noise; keep the
static per-class logic."** That null is a valid, shippable result.

---

## 1. What this is (and is not)

- **Is:** a *selector-mining* layer. It reads the per-pair intraday-research
  output, groups behaviour into an *(asset class × vol bucket × horizon)* grid,
  finds the cells where price genuinely behaves differently at forecast levels,
  and turns the **survivors** into a `score → choice` selector — the codebase's
  existing brain pattern (`dayTypeScore → selectStrategy`), not new knobs.
- **Is not:** a new engine, a new set of tunable parameters to optimise, or a
  claim of edge. Per CLAUDE.md: *a method is not a strategy* — a per-regime
  selector sizes/filters an edge that must already exist and persist OOS. We
  prove that first, or we don't ship it.

The "dynamic bot" is the *aspiration*. Step 1 is only: **does behaviour differ
enough, and stably enough, to justify per-type logic at all?**

---

## 2. Inputs — what we already have per pair

The intraday run persists `{ perPair: { PAIR: { src, daily, weekly, d20 } }, cross, pairs, log }`.
Each horizon block already emits everything the grid needs:

| Field (per horizon) | What it tells the selector |
|---|---|
| `touches.medianExtension.touchRatePct` | do the forecast lines even get *reached*? (low ⇒ band too wide ⇒ a **recalibration** cell, not a fade/follow cell) |
| `medianExtension.continuePct` vs `reversePct` | **the fade-vs-follow signal** at the median line |
| `p75Extension.continuePct` vs `medianExtension.continuePct` | exhaustion: is the 75th line the *fade* line while the median is the *follow* line? (already surfaced as a "good" finding) |
| `medianExtension.reverse20SingleTouchPct` vs `…ManyRetestPct` | entry timing: clean first tap vs wait-for-retest |
| `medianExtension.byRegime{BULL,BEAR,RANGE}` | trend-regime conditioning, already computed per cell |
| `touches.direction.firstUpperPct` | directional asymmetry (systematic drift to one side) |
| `expansion.reached100Pct`, `bigDayMedianTo50` vs `smallDayMedianTo50` | how/when range builds — coarse vol proxy today |

**Gap to fill (small engine change, Phase 2):** the byRegime axis is *trend*
(BULL/BEAR/RANGE), not **volatility level**. A true vol-level axis needs each
walk-forward window tagged with a vol-percentile bucket (e.g. HV20 percentile at
window start: low / mid / high). That tag is cheap to add in `_walkHorizon` and
is what makes "tweak per volatility level" measurable rather than proxied.

The existing `_intraCross` (flat all-pairs daily average + a continue-sorted
rank) stays; this layer is the grouped, IS/OOS-split superset it doesn't do.

---

## 3. The scenario grid

**Primary axis (asset class):** `fx` · `commodity (gold)` · `index`
— the three classes the forecaster's σ math already distinguishes.
**Diagnostic sub-slice within fx** (surfaced, not acted on unless a cell
survives): `majors` · `JPY-crosses` · `other-crosses`.

**Vol axis:** `low` / `mid` / `high` vol-percentile bucket (needs the Phase-2
window tag above). Until then, the big/small-expansion split is a stand-in and
labelled as a proxy.

**Horizon axis:** `daily` · `weekly` · `d20` (already produced).

Each cell reports, with an **n (window count)**: touch rate, continue%, reverse%
(10/20/50), median-vs-p75 continue gap, single-vs-retest reverse, direction
skew, and calibration bias for that cell.

---

## 4. Pre-registered win / null criteria (falsification harness)

A cell's difference counts as **real** only if ALL hold:

1. **Magnitude:** its continue% (or reverse20%) differs from the pooled
   all-pairs baseline for that horizon by a pre-set margin (propose ≥ 10pp).
2. **Persistence:** the *same sign* difference holds in **both** an in-sample and
   an out-of-sample time split, each with **n ≥ 30 windows** in the cell.
3. **Multiple-testing survival:** ~3 classes × 3 vol buckets × 3 horizons × 2
   lines ≈ **54 cells** — at a naive 5% bar we'd expect ~2–3 "winners" by chance.
   Survivors must clear a **Benjamini–Hochberg-adjusted** threshold, not a raw one.
4. **Mechanical plausibility:** the tweak makes sense (gold in high-vol trending
   → *follow* is plausible; a lone JPY-cross cell flipping sign is suspect).

**Pre-registered null:** if, after BH correction, no cell beats the pooled
posture on the OOS split, the finding is *"static per-class logic is right — do
not add per-cell knobs."* We report that plainly and stop. Comfort that gets
falsified next turn is the thing that erodes trust.

---

## 5. The selector contract (how a survivor becomes logic)

Each surviving cell emits a posture — nothing more than parameters of the *one*
entry primitive (`simulateEntry`: `{ band, action(fade|follow), entryType, exit }`):

```
{ assetClass, fxSubtype?, volBucket, horizon }
  → { line: 'median' | 'p75',
      action: 'fade' | 'follow',
      entryTiming: 'firstTouch' | 'retest',
      confidence: 0..1 }          // weight, from the OOS effect size
```

This plugs into the existing `selectStrategy` brain (`dayTypeCore` /
`forecastCore`) as a new `score → choice` variant — **no new leg, no new tunable
to optimise** (Lego #2, #4). Cells that fail criterion 4.1 "touch rate too low"
route to the **recalibration** path instead (per-cell corr factor, the mechanism
we already built), not to fade/follow.

---

## 6. Validation — the only thing that ships a "bot"

The surviving postures become a `selectStrategy` variant, A/B'd vs the current
**static** per-class selector through the honest harness (`simulateEntry` +
`summarizeSplit`), costs on:

- Report **OOS Sharpe + OOS trade count (≥30)** on the standard IS/OOS card.
- Ship the **comparison** (dynamic vs static), not just the adaptive equity curve.
- A dynamic selector ships **only if** it beats static on OOS with a non-trivial
  OOS trade count. Otherwise the note in §4's null stands.

---

## 7. Phased build plan

- **Phase 1 — Scenario board (diagnostic, no bot).** A pure, unit-testable
  aggregator (`js/scenarioBoard.js`) over the persisted `perPair` result →
  the §3 grid with per-cell n and metrics + a "candidate cells" shortlist by the
  §4 magnitude test. New card on `vol-research-book.html`. *Descriptive only —
  shows where behaviour differs.* Buildable/testable now against the known shape.
- **Phase 2 — Vol-bucket tag + IS/OOS split.** Add the vol-percentile window tag
  in `_walkHorizon`; add the in-sample/out-of-sample time split so the board can
  apply the §4 persistence + BH test and mark true survivors.
- **Phase 3 — Selector + A/B.** Encode survivors as a `selectStrategy` variant;
  A/B vs static on the OOS card; ship the comparison or the documented null.

Each phase is its own draft PR, versioned, linked from the research book.

---

## 8. Open decisions for you

1. **fx sub-slicing** — diagnose majors/JPY/other separately, or treat all fx as
   one bucket? (finer = more insight but more cells / thinner n)
2. **Vol axis granularity** — 3 buckets (low/mid/high) or 2 (calm/stressed)?
3. **Where the board lives** — a new card on `vol-research-book.html` (my default)
   or its own `dynamic-selector.html` page?
