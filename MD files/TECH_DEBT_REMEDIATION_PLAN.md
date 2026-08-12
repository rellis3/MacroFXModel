# Technical Debt Remediation Plan

**Created:** 2026-08-02
**Companion to:** [`INFRASTRUCTURE_COST_ANALYSIS.md`](INFRASTRUCTURE_COST_ANALYSIS.md) (the verified audit)
**Governing constraint:** *no change to what any system does.*

---

## 0. What "impact nothing" actually means here

The owner's constraint is that no behaviour changes. Being honest about that
means splitting the work by whether zero-impact can be **proven** or only
**hoped for** — because those are different things, and conflating them is how
a "safe refactor" breaks a live bot.

| Class | Definition | Items |
|---|---|---|
| **A — provably zero-impact** | The change cannot alter any output. Argument from construction, not from testing. | §1 |
| **B — zero-impact if sized correctly** | Behaviour is preserved only if a bound is chosen above the real working set. Wrong bound = real defect. | §2 |
| **C — cannot be guaranteed zero-impact** | Requires proving two code paths are numerically identical before merging them. If they have drifted, *any* merge changes behaviour. | §3 |
| **D — touches no running system** | Offline scripts and log files. | §4 |

**Recommendation: do A and D. Do B with the stated sizing discipline. Gate C
behind an equivalence harness and treat any non-identical copy as a decision to
bring back to you, not a refactor to complete.**

Nothing in Class C ships without your explicit sign-off on the diff.

---

## Phase 1 — Class A: cache eviction (provably zero-impact)

### The change

Add one shared helper, then one line after each affected `.set()`:

```js
// Bound a TTL cache. Evicting an entry only forces a recompute of the same
// value — it can never change a response. Insertion-ordered Map ⇒ FIFO.
function capMap(map, max) {
  while (map.size > max) map.delete(map.keys().next().value);
}
```

This is not a new invention — it is the pattern already used at
[`server.js:4815`](../server.js#L4815) (`_vmChartCache`, cap 120) and by
`m1CandleCache` via `M1_CACHE_MAX`. Phase 1 extends the existing house pattern
to the caches that were missed.

### Why this cannot change behaviour

Every one of these caches is read through the same shape:

```js
const hit = cache.get(k);
if (hit && Date.now() - hit.ts < TTL) return hit.data;   // hit
… recompute …                                            // miss
cache.set(k, { data, ts: Date.now() });
```

An evicted key takes the **miss** branch, which recomputes the value the cache
would have returned. The two branches are already required to be equivalent —
that is what makes it a cache rather than state. So eviction is unobservable in
the response. The only effect is recompute frequency.

**The one thing that would break this argument** is a cache whose miss branch
has a side effect, or which is used as a store-of-record rather than a cache.
Verification step V1 below checks exactly that, per site, before any edit.

### Sites (all confirmed single `.set()` unless noted)

| Cache | `.set()` at | Key space | Proposed cap |
|---|---|---|---|
| `_trendCache` | [5775](../server.js#L5775) | float params | 200 |
| `_econTrendCache` | [5823](../server.js#L5823) | float params | 200 |
| `_carryCache` | [6004](../server.js#L6004) | float params | 200 |
| `_yieldCoupCache` | [5560](../server.js#L5560) | 6-part param key | 200 |
| `_m5SrvCache` | [4726](../server.js#L4726), [5174](../server.js#L5174) | date ranges | 300 |
| `_trendBtCache` | [8288](../server.js#L8288) | float params | 200 |
| `_trendV2Cache` | [8514](../server.js#L8514) | float params | 200 |
| `_csiCache` | [5892](../server.js#L5892) | int, ≤445 | 200 |
| `liqGateBarCache` | [7931](../server.js#L7931) | `instrument:date`, grows daily | 200 |

Caps are set well above any plausible single-session working set, so in normal
use the cache never evicts at all and the change is a literal no-op.

**Explicitly not touched:** the ~13 instrument-keyed caches listed in §2d of the
audit. They are already bounded; adding a cap there is churn with no benefit.

### Also in Phase 1

`tdeBackfillJobs` at [`server.js:19859`](../server.js#L19859) — the only 1 of 65
job Maps with no purge. Copy the adjacent `_purgeStale*Jobs` function verbatim
with the same TTL. Same zero-impact argument: a purged completed job is one
whose result was already collected.

### Verification

- **V1 (per site, before editing):** read the surrounding handler and confirm
  (a) the miss branch is a pure recompute with no side effect, and (b) nothing
  else reads the Map as a store-of-record. Any site failing this drops out of
  Phase 1 and gets raised with you.
- **V2:** `node --check server.js`.
- **V3:** boot the server locally and hit each touched endpoint twice —
  identical JSON both times.
- **V4:** a small unit test on `capMap` proving FIFO order and that `size` never
  exceeds `max`.

### Rollback
Each site is one added line. Revert is line-level, per cache, with no coupling
between sites.

---

## Phase 2 — Class B: the dedupe `Set`s (sized, not blindly capped)

`_tdeShadowSeen` ([19586](../server.js#L19586)) and `_tdePosShadowSeen`
([19518](../server.js#L19518)) are **not caches**. They are guards that prevent
a position being booked to the shadow ledger twice. Evicting a live key causes a
**double-book** — a real data defect.

So Phase 1's argument does not apply, and this is deliberately a separate phase.

**Approach:**
1. First, measure. Add a debug counter for peak `Set` size over a full week
   before changing anything. Establish the true working set.
2. Only then cap, at a large multiple of observed peak (target: ≥50×), using
   FIFO so the oldest — and therefore the most certainly closed — entries go
   first.
3. If the peak turns out to be small and stable, the honest answer may be
   **leave it alone**. A few thousand string entries is a trivial footprint
   against the risk of a double-book. This item is on the list for completeness,
   not because it is obviously worth doing.

I would not ship a cap here without step 1.

---

## Phase 3 — Class C: indicator consolidation (gated, sign-off required)

The 14 duplicated `ema` implementations (§3 of the audit) are the highest-value
item on correctness grounds and the **only** one that cannot be made
zero-impact by construction.

**The trap:** if `Gold/modules/vumanchu.py::_ema` has drifted from the canonical
implementation, then consolidating it *necessarily* changes `Gold/main.py`'s
live output. That is true no matter how carefully the refactor is done. The
duplication is exactly what allows silent drift, and the drift is exactly what
makes fixing it risky.

**Therefore the plan is verification-first, and consolidation is conditional:**

### Step 3a — equivalence harness (changes no production code)
Write a standalone test that feeds identical synthetic series into every copy
and asserts bit-identical output against the canonical implementation
(`js/indicatorCore.js`, `pylego/indicators/vumanchu.py`). Include edge cases:
series shorter than the period, leading `NaN`s, and the seeding convention
(SMA-seeded vs first-value-seeded EMA — the most likely source of divergence).

**This step is pure diagnostic and safe to run immediately.**

### Step 3a RESULTS (run 2026-08-02)

Harnesses: [`js/indicatorEquivalence.test.mjs`](../js/indicatorEquivalence.test.mjs),
[`scripts/indicator_equivalence.py`](../scripts/indicator_equivalence.py). Both
use the same deterministic LCG so they test byte-identical input. Neither
touches production code.

**Clean-input equivalence — 14 of 15 copies are bit-identical (max|Δ| = 0):**

| | Result |
|---|---|
| JS: `utils.js`, `backtest-engine.js`, `nasdaqTransforms.js`, `vumanchuCore.js` | **IDENTICAL** to `indicatorCore.js` |
| JS: `rangeBiasCore.js` | **DIFFERENT CONTRACT** — see below |
| Python: all 10 copies (incl. the 3 LIVE ones) | **IDENTICAL** to the canonical contract |

**Finding 1 — `js/rangeBiasCore.js:82` is not a copy, it is a different
function.** It is **SMA-seeded** (mean of the first `period` values, not
`out[0]=v[0]`), returns a **scalar** rather than a series, and returns `null`
when `len < period`. Divergence from the canonical final value reaches **0.25**
on the test series — material on price data. **It must not be merged.** It
should be renamed to say what it is (e.g. `emaLastSmaSeeded`) so the next reader
doesn't mistake it for the same primitive.

**Finding 2 — the copies agree on clean input and disagree on NaN, and so do
the two canonicals.** Given `[10, 11, NaN, 13, 14, NaN, 16]`, period 3:

| Implementation | Output |
|---|---|
| `js/indicatorCore.js` (JS canonical) | `[10, 10.5, 10.5, 11.75, 12.875, 12.875, 14.4375]` — **holds** previous |
| `pylego.ema` (Python merge target, pandas `ewm`) | `[10, 10.5, 10.5, 12.375, 13.1875, 13.1875, 15.2969]` — **skips and re-weights** |
| all 10 Python copies, and JS `utils`/`backtest-engine`/`vumanchuCore` | `[10, 10.5, NaN, NaN, NaN, NaN, NaN]` — **poisons** the rest of the series |
| `js/nasdaqTransforms.js` | matches `indicatorCore.js` |

Three different answers, including **between the two canonical bricks
themselves**. So "bit-identical on clean input" does **not** make the merge
free — it is free only where the caller's series cannot contain a NaN, and that
has to be established per call site rather than assumed.

This is the finding that justified doing 3a before 3b. A merge done on the
strength of the clean-input table alone would have silently changed live
gap-handling in `Gold/main.py` and `bot/main.py`.

### Step 3b — the fork in the road
- **Bit-identical copies** → consolidating is provably zero-impact. Import the
  canonical brick, delete the copy. Safe.
- **Non-identical copies** → **stop, and bring the numeric difference to you.**
  Do not merge. The choice between "the live bot is currently wrong" and "the
  live bot's behaviour is load-bearing and must be preserved" is a trading
  decision, not a refactoring one.

### Step 3c — ordering, safest first
1. **JS non-live modules first** — `indicatorCore.js` already exists with tests
   in `legoBricks.test.mjs`, so this has the strongest safety net.
2. **Python offline forks** — `scripts/build_corr_history.py`,
   `volatilityExhaustion/`, `RegimeV2/beta_regime_table.py`.
3. **`ConfluenceBot/` and `GoldV2/`** — not started by `start.sh`, so no live
   exposure.
4. **`Gold/` and `bot/utils/` LAST** — these are in `start.sh`. Live. Only after
   everything above is green, and only with your sign-off on the diff.

Per Lego Principle 6, `LEGO_MODULES.md` and `PYTHON_LEGO.md` get updated as part
of "done" for each consolidation, including a known-drift row for anything
Step 3b sends back to you.

---

## Phase 4 — Class D: touches nothing that runs

- **`beta_history.jsonl` rotation** ([`bot/main.py:426`](../bot/main.py#L426)) —
  add size-based rotation. Append-only diagnostic log; nothing reads it in the
  trading path. Keep the newest N records so `beta_regime_table.py` still works.
- **`.iterrows()` — 16 instances** in offline analysis scripts. Vectorise
  opportunistically **only where a script is actually slow enough to annoy you**,
  one file at a time, each validated by asserting identical output against the
  current version on real input. Not worth doing as a sweep — none of these run
  in production, so there is no cost argument, and a bulk rewrite of analysis
  code is a good way to silently change a number you rely on.

---

## Sequencing

| | Phase | Class | Risk | Gate |
|---|---|---|---|---|
| 1 | Cache eviction + `tdeBackfillJobs` | A | none | V1-V4 | ✅ **done 2026-08-02** |
| 2 | Dedupe `Set`s | B | double-book if mis-sized | one week of measurement first | not started |
| 3a | Indicator equivalence harness | — | none (diagnostic) | — | ✅ **done 2026-08-02** |
| 3b | Consolidate bit-identical only | C | **NaN semantics differ** — see 3a results | per-call-site NaN audit + your sign-off | blocked on that audit |
| 4 | Log rotation, `.iterrows()` | D | none | per-file output diff | not started |

*(columns: phase, class, risk, gate, status)*

**3b is no longer a straight cleanup.** Step 3a found that the merge target's
NaN semantics differ from every copy's, so consolidation needs a per-call-site
check that the input series cannot contain gaps. That check is the next unit of
work on this item, not the merge itself.

**Suggested immediate action:** Phase 1 and Phase 3a. Phase 1 fixes the only
confirmed leak with a construction-level safety argument; Phase 3a is pure
diagnostic and tells us whether Phase 3 is a cleanup or a live-behaviour
question. Neither can change what any system does.

---

## Out of scope

- **All polling and scheduler interval changes** — owner decision. §1 and §6.1
  of the original document, and the FRED 6h→12h suggestion, are excluded.
- **Any spend or savings estimate** — no measurement exists. The audit's §6
  lists what would have to be measured first. These fixes are justified on
  correctness and hygiene, not on a dollar figure.
- **Deduplicating the `Gold`/`GoldV2`/`ConfluenceBot` forks themselves.** That
  is a much larger architectural question than indicator math and is not
  proposed here.
