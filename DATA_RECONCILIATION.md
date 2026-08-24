# Data reconciliation — the gate before the per-pair view is built

**Date** 2026-08-24 · Companion to [PER_PAIR_VIEW_PROPOSAL.md](PER_PAIR_VIEW_PROPOSAL.md) and
[INDEX_DECOM_QUESTIONS.md](INDEX_DECOM_QUESTIONS.md).

> ## ✅ Item A (gold pip) — DONE, 2026-08-24
>
> `js/utils.js` and `levels.js` now delegate to `js/instrumentRegistry.js`; gold's pip reads
> **1.0** everywhere. Every paired constant moved with it so **no distance changed**:
>
> | | before | after | effective |
> |---|---|---|---|
> | gold confluence | 200 × 0.1 | 20 × 1.0 | **\$20** (unchanged) |
> | gold prox (`main.js`) | 5 × 0.1 | 0.5 × 1.0 | **\$0.50** (unchanged) |
> | gold prox (`alerts.js`) | 8 × 0.1 | 0.8 × 1.0 | **\$0.80** (unchanged) |
>
> Stored KV/localStorage values written under the old basis are rescaled once on read by
> `js/goldPipMigration.js` (idempotent, stamps `pipBasis: 'canonical'`). `js/reconcile.test.mjs`
> is **6/6 green** and pins the effective distances so a future units edit cannot move them
> silently. Verified in-browser: the module graph loads with zero errors and
> `getPipSize('XAU/USD') === 1`.
>
> **Left deliberately undone — one for you.** Gold's proximity triggers are now visibly
> **0.5 / 0.8 pips**, i.e. 0.011% / 0.017% of price, where NAS100's are 0.069% / 0.103%.
> That is 6× tighter, which strongly suggests the original `5` and `8` were written expecting
> pip 1.0 and gold proximity alerts have been firing far too tight to be useful. Restoring
> them to `5` and `8` would widen live Telegram alerts, so it is **not** bundled into a units
> fix — see §9.2 A. Decide it on its own.

---

## 0. Short answer: yes, and it goes first

Today the conflicts are invisible because the numbers live on different pages. Nobody compares
`index.html`'s "1168p expected range" with `today.html`'s "117pt expected range" because you never
see them in the same second.

**A consolidated view removes that protection.** Its entire value proposition is that numbers sit
next to each other — which means every disagreement that is currently latent becomes a visible
contradiction, in front of you, at the moment you are deciding. A single visible contradiction
costs more trust than the whole consolidation gains.

**The mock already proved this.** Building it, I copied gold's figures off the `index.html`
screenshots — "GARCH 1168p", "232p remaining", "981p travelled". Under the *canonical* pip table
those same distances are **117pt, 23pt and 98pt**. The mock has been carrying a 10× error since
the first draft, and nothing on either page would have flagged it.

---

## 1. Conflict 1 — gold pip size disagrees by 10×, in live code

`js/instrumentRegistry.js` exists precisely to solve this, and its own header says so:

> *"A single wrong pip (0.0001 vs 0.001) silently scales PnL by 10×, so this is the
> highest-leverage registry in the tree."*
> *"⚠ KNOWN DRIFTS this registry is meant to retire (documented, NOT yet rewired)… GOLD pip:
> 1.0 in server.js & asiaRangeEngine.js, but 0.1 in rangeFibEngine.js."*

What is actually in the tree today:

| Source | XAU/USD pip | Feeds |
|---|---|---|
| `pylego/instruments.json` / `.py` | **1.0** | every Python bot |
| `js/instrumentRegistry.js:54` | **1.0** | ~20 research pages |
| `server.js:521` `PIP_SIZE` | **1.0** | `/api/daily-brief` → `today.html` |
| `today.html:4335` `_pipSz` | **1.0** | the card face |
| **`js/utils.js` `getPipSize`** | **0.1** ❌ | **the entire `index.html` stack** |
| **`levels.js:64`** | **0.1** ❌ | **the server writer of `ai_entries_{SYM}`** |

> **Correction (2026-08-24, after tracing the consumers).** An earlier draft of this section
> claimed the 10× "crosses the JS→Python boundary in production". **That was overstated.**
> `bot/modules/macro_regime.py` reads only `signalScore`, `signalAligned` and `direction` off
> `ai_entries` — **no pip-denominated field**. The wrong pip does not reach the bots through
> that path. See §1.1: this is a units-labelling bug, not a live-P&L bug.

**Neither front door imports the canonical registry.** Verified: `index.html`, `today.html`,
   `js/utils.js`, `js/vol.js`, `js/render.js`, `js/signal.js`, `js/main.js`, `js/confluences.js`
   and `levels.js` all have **zero** references to `js/instrumentRegistry.js`. Twenty research
   pages use it. The two pages you actually trade from do not.

Knock-on: every "pips" threshold is ambiguous until this is settled —
`js/alerts.js:104` `'XAU/USD': 8`, `js/main.js:293` `'XAU/USD': 5`,
`js/alertV2Core.js` `'XAU/USD': 40`, `levels.js:573` `confPips 200`. Each means one of two
distances depending on which table its consumer happens to use.

**FX and indices agree everywhere.** The drift is gold-only — which is exactly the pair the
mock used, and one of the two you trade most.

## 1.1 The pip never travels alone — it is half of a matched pair

Traced 2026-08-24. Everywhere the wrong pip is used, it is immediately multiplied by a
*pip-denominated constant that was tuned against it*:

```
levels.js:573-574   confluencePips 200  ×  pipSize 0.1  =  normalDist $20   ← the real clustering distance
js/utils.js:177     getConfluenceThreshold('XAU/USD') → S._caps.gold.confluencePips ?? 200
```

**So today's behaviour is correct and only the label is wrong.** Gold clusters at \$20 either
way. Change `pipSize` 0.1 → 1.0 *on its own* and that becomes **\$200** — a 10× wider confluence
window on a live bot's level book. The one-line fix is the dangerous version.

Worse, `gold_confluencePips` is **user-settable** in the ⚙ Caps modal (`js/caps.js:79`) and
**stored in KV**, read by both `js/utils.js` (browser) and `levels.js` (server). Any value tuned
against the 0.1 meaning is silently reinterpreted 10× the moment the pip changes.

Same structure on every other pip-denominated constant: `js/alerts.js:104` proxPips 8,
`js/main.js:293` `_PROX_PIPS` 5, `js/alertV2Core.js` 40.

**What the drift actually costs today** — worth being precise, because it is not P&L:

1. **Cross-page comparison is impossible.** `index.html` says "1168p" where `today.html` says
   "117pt" for the identical distance. This is the one that kills a consolidated view.
2. **Any *new* consumer is a landmine.** Code that reads `pipSize` without a matching
   10×-off constant is simply wrong, and nothing warns it.
3. **The stored caps value means two different things** depending on which reader picks it up.

So the fix is a **matched-pair migration**, not a constant change — and it needs a decision
(§9.2 A) about whether to preserve the pip-denominated form or decouple to price terms.

---

## 2. Conflict 2 — two independent volatility engines, both labelled "GARCH"

- **`today.html`** reads `/api/vol-forecast` → `js/volForecast.js`: Yang-Zhang / GARCH by asset
  class, Brownian-motion range constants (P50 = 1.572σ, P75 = 2.049σ), half-normal 0.6745 for
  open-close, per-class recalibration multipliers, news multiplier.
- **`index.html`** uses `js/vol.js` — its own GARCH(1,1) + EMA-ATR (`ATR_ALPHA = 0.15`), its own
  percentile ranking, its own 68/95% CI. Verified: it imports `state.js` and `utils.js` only —
  **neither `forecastCore.js` nor `volForecast.js`**.

Both render a number captioned "expected range" and a chip captioned "GARCH". They are different
models on different inputs. They will not match, and there is currently no place where anyone
would notice.

This is the one to settle first after pips, because **σ is the denominator of almost everything
else** on the proposed Read tab: range utilisation, the cone, the stop noise-floor, position size.

---

## 3. Conflict 3 — three position-size implementations, one of them conviction-scaled

| Implementation | Signature |
|---|---|
| `js/vol.js:315` | `calcPositionSize(score, volRegime, transitionRisk, regimeConfidenceResult)` |
| `backtestSystem/risk.py:198` | `position_size(balance, risk_pct, sl_dist, …)` |
| `pylego/sizing.py:19` | `position_size(…)` |

Only the JS one takes `score` — i.e. **only the dashboard scales size by conviction**, the exact
input measured anti-predictive in `analysis/backtest_entry_quality.py` (and BUG_LIST #32). The two
Python ones are stop-distance driven, which is the correct form.

So the dashboard and the bots do not merely differ in value — they differ in *method*. Putting
them in one drawer without resolving this shows two sizes and no way to choose.

---

## 4. Conflict 4 — "regime" is three different words wearing one label

| What it is | Source | States | Shown on |
|---|---|---|---|
| Daily trend/range | `state.hmmRegimes` (`/api/hmm/regimes`) | TREND / RANGE + prob | both pages |
| 5-minute HMM | `state.hmm5mV2Regimes` (`/api/hmm5m-v2`) | BULL / BEAR / RANGE / CHOP | `index.html` |
| Volatility regime | `js/vol.js` | HIGH / NORMAL / LOW | `index.html` |

`index.html` prints two of these in a single meta line. In one drawer, "RANGE 63%" (daily,
2-state) sitting near "BULL" (5m, 4-state) near "NORMAL" (vol) reads as three signals
disagreeing, when in fact they are three different questions. **This one is a labelling fix, not
a maths fix** — cheap, and it should be done as part of the build rather than before it.

---

## 5. What already aligns — don't over-correct

Verified as genuinely shared, no reconciliation needed:

- **Daily regime.** `/api/hmm/regimes` returns `state.hmmRegimes`, the same object
  `/api/daily-brief` reads at `server.js:15816`. Both pages show the same classifier.
- **Open interest.** Both read `oi_store` / `/api/oi-today`.
- **COT.** Both read `/api/cot-extremes`.
- **FX and index pip sizes.** Agree across all six tables.
- **Events.** Both read `/api/events`.

So this is four specific problems, not systemic rot. Two of them (pips, σ) are real; two
(sizing, regime labels) are resolvable in the build.

---

## 6. The gate: a reconciliation harness, not a document

Auditing this by reading code does not stay true — it drifts back the moment someone edits a
table. The gate should be **an executable test that fails**, not a checklist that ages.

Proposed: `js/reconcile.test.mjs`, run in CI alongside the existing golden tests.

**Tier 1 — same-constant tests (cheap, decisive, no network).**
For every instrument, assert that every pip/digits table in the tree returns the identical value:
`pylego/instruments.json` · `js/instrumentRegistry.js` · `server.js PIP_SIZE` · `js/utils.js
getPipSize` · `levels.js` · `today.html _pipSz`. **This test fails today on gold.** That failure
is the deliverable — it converts a documented-but-ignored drift into a build break.

**Tier 2 — same-question tests (one live call each).**
For a fixed pair set, call both producers of each quantity and assert they agree within a stated
tolerance, or *fail loudly with both numbers*:

| Quantity | A | B | Bar |
|---|---|---|---|
| Expected day range | `js/vol.js` | `/api/vol-forecast` | must agree or one must be retired |
| Position size | `calcPositionSize` | `/api/position-size` | must agree on method first |
| Entry book | browser `ai_entries_*` | `levels.js` `ai_entries_*` | field-by-field diff |
| Nearest level | `levels.js` v1 | `levelsV2Engine` | same price ± 1 pip |

**Tier 3 — a staleness assertion.** Every KV key the drawer reads carries a `timestamp`; assert
none is older than its own declared max age. This catches the `ai_goldmodel` problem from
[INDEX_DECOM_QUESTIONS.md](INDEX_DECOM_QUESTIONS.md) §A2 for free, and it is the check that keeps
working after the decom.

The rule worth adopting alongside it: **where two engines disagree and neither is validated,
retire one — do not display both.** A consolidated view that shows two answers has not
consolidated anything.

---

## 7. Revised build order

| # | Step | Why here |
|---|---|---|
| **0** | **Tier-1 harness — write it, watch it fail on gold, fix `js/utils.js` + `levels.js` to the registry** | One afternoon. Everything downstream is denominated in pips |
| **1** | Decide the σ question: does `index.html`'s `js/vol.js` get retired in favour of `/api/vol-forecast`, or is there a reason for two? | σ is the denominator of the Read tab |
| **2** | Tier-2 harness for the surviving pairs of producers | Stops re-drift |
| **3** | `alerts.js` server port (decom §A1) | Independent, and the actual production risk |
| **4** | Tab shell + render what's already in memory (proposal phases 1–2) | Now safe, because the numbers agree |
| **5** | Everything else in the proposal | — |

Steps 0–1 are small. Step 0 in particular is close to free and retires a drift the repo has had
documented and unfixed for months.

---

## 8. One caveat on step 0

`js/instrumentRegistry.js`'s header warns the drift is *"documented, NOT yet rewired — changing
them shifts existing backtests, so adopt deliberately."* That is a real caution: fixing gold's pip
from 0.1 → 1.0 changes every gold number `index.html` and `levels.js` have ever produced,
including any recorded gold result derived from them.

That is an argument for **doing it deliberately and recording the change**, not for leaving it.
Any gold backtest whose numbers move by exactly 10× was already wrong; any that moves by something
else needs looking at.

---

# 9. Which one to retire — the decision list

## 9.1 First: "more advanced" is the wrong test

The instinct is understandable, but it is backwards for this repo. The more sophisticated-looking
of two engines is usually the one written *second*, in isolation, by someone solving one page's
problem — which is exactly how it got duplicated in the first place. `js/vol.js` is the fancier of
the two vol engines (bespoke GARCH variance recursion, DCC correlation, divergence scoring) and it
is the one to kill: zero tests, zero forward grading, zero calibration record.

Rank candidates on this instead, in strict order:

| # | Test | Why it outranks the next |
|---|---|---|
| **1** | **Is it graded?** A golden test, a live hit-rate, or a recorded walk-forward verdict. | An ungraded engine cannot be *known* to be right, however good the maths looks. |
| **2** | **Is live money already on it?** | Retiring what the bots run costs a migration *and* a re-validation; retiring what only a page runs costs a rewire. |
| **3** | **Is it shared?** An importable brick with many consumers beats a private copy. | Shared code gets exercised. Copies drift silently — that is the disease here. |
| **4** | **Is it arithmetically correct?** | Decisive when it applies, but it rarely does — most duplicates are both "correct", just different. |
| **5** | Only now: **is it more capable?** | Capability is worth porting *into* the survivor, never worth keeping a second engine for. |

Two rules fall out of it:

- **When a sophisticated-but-ungraded engine meets a simple-but-graded one, keep the graded one**
  and port the sophistication in only if it earns a grade of its own.
- **Never keep two because each has a good bit.** Pick the survivor, log the loser's good bits as
  follow-on tickets, delete the loser. Half the duplication in this tree exists because that second
  step never happened.

## 9.2 The list

*Blast radius = what breaks the day you flip it.*

### A · Instrument / pip table — no judgement call, arithmetic decides

| Candidate | Evidence | Verdict |
|---|---|---|
| `pylego/instruments.json` + `.py` | `instruments_test.py`; fails loud on unknown symbol | ✅ **KEEP** — Python canonical |
| `js/instrumentRegistry.js` | **verified in sync with pylego on every shared instrument** (2026-08-24); no test file | ✅ **KEEP** — JS canonical; *add the test* |
| `server.js:521 PIP_SIZE` | agrees on gold, but is a private copy | ⚠️ **REWIRE** to the registry |
| `today.html:4335 _pipSz` | agrees, but is a 4th private copy | ⚠️ **REWIRE** |
| `js/utils.js getPipSize` | gold **0.1** | ❌ **RETIRE** |
| `levels.js:64` | gold **0.1** — *and it writes `ai_entries_*` to KV* | ❌ **RETIRE** — highest priority |

**Why 1.0 wins, and why it is not a preference.** Gold's contract is 100 oz, and
`bot/utils/pip_values.py` pays **$100 per pip per lot**. 100 oz × $1.00 = $100. If the pip were
0.1, the pip value would be $10. The same arithmetic checks out on FX: 100,000 × 0.0001 = $10,
which is exactly what that table says. **`0.1` is a bug, not a convention** — and the two files
carrying it are the ones live orders and KV writes flow through.

*Effort:* an afternoon. *Blast radius:* every historical gold figure `index.html` and `levels.js`
produced shifts by exactly 10×. Anything that moves by something *other* than 10× needs looking at.

### B · Volatility / expected range — no judgement call, evidence decides

| Candidate | Evidence | Consumers | Verdict |
|---|---|---|---|
| `js/volForecast.js` + `js/forecastCore.js` | live hit-rate tracked, `VOL_CALIBRATION_TRACKER.md`, dated per-class recalibrations, Python twin validated <1% MAE, `forecastCore.test.mjs` | **22** | ✅ **KEEP** |
| `js/vol.js` `calculateVolRegime` / `calculateOTCForecast` | no test, no grading, no calibration record | **8** — all of them the `index.html` stack | ❌ **RETIRE** |

Those eight are `ai.js`, `alerts.js`, `compass.js`, `confluences.js`, `gold-app.js`, `levels.js`,
`main.js`, `render.js` — i.e. **the σ decision and the `index.html` decom are the same decision.**
Retiring `js/vol.js` is most of the decom work, and doing the decom is most of the σ work.

*Judgement call inside it:* `js/vol.js` also exports things `volForecast` has no equivalent for —
`computeDCCCorrelation`, `calculateRiskSentiment`, `calculateDivergence`, `getForeignCurves`,
`calculatePivots`. **None of those are vol maths and none should die with it.** Move them to their
own module rather than keeping `vol.js` alive as their host.

### C · Position size — no judgement call

| Candidate | Evidence | Verdict |
|---|---|---|
| `pylego/sizing.py` | `sizing_test.py`; stop-distance driven | ✅ **KEEP** — the one spec |
| `backtestSystem/risk.py:198` | no test; same formula | ⚠️ **CONVERGE** onto pylego |
| `js/vol.js:315` `calcPositionSize(score, …)` | takes **conviction** — measured anti-predictive | ❌ **RETIRE** |

The JS one differs in *method*, not just value: it is the only one that scales by conviction, which
`analysis/backtest_entry_quality.py` and BUG_LIST #32 both say *shrinks* size on the good trades.

### D · Entry-book writer (`ai_entries_{SYM}`) — no judgement call

Server `levels.js:647` (every 30 min, `source:'server'`) versus the browser copy at
`js/alerts.js:384`. **Keep the server, delete the browser writer** — but fix `levels.js`'s pip
first (A), or you canonicalise the 10× error. Order matters here.

### E · Level engines — a real choice, two defensible answers

Eight files compute levels: `levels.js` (server v1), `levelsV2Engine.js`, `js/levels.js`,
`js/rangeLineAnalyser.js` *(tested)*, `js/asiaRangeEngine.js`, `js/rangeFibEngine.js`,
`js/confluenceModules.js`, `js/macroFxZoneEngine.js` *(tested)*.

- **Option 1 — one engine.** Canonicalise on `rangeLineAnalyser → levelsV2Engine →
  range_line_bot`: the only stack with an OOS record (Sharpe 4.7–6) and one of only two tested.
  Everything else becomes a view over it. *Cleanest, biggest migration.*
- **Option 2 — two, by declared role.** `rangeLineAnalyser`/`levelsV2` is the **traded** engine;
  `confluenceModules` stays the **research** harness. Nothing else survives. ← *my recommendation*:
  honest that research and execution genuinely want different things, and a far shorter path.

Either way `rangeFibEngine.js` goes — it is the third gold-pip copy, and the registry header names
it as the drift source.

### F · Regime — a labelling choice, not an engine choice

`hmm.js` (2-state daily), `hmm5m.js` (3-state), `hmm5m-v2.js` (4-state, canonical, learned
Baum-Welch), plus `volBacktestEngine.classifyRegime` and `js/vol.js`'s HIGH/NORMAL/LOW.

Keep `hmm5m-v2` as the classifier and `state.hmmRegimes` as the daily read — **they already agree
across both pages.** The actual defect is that three different questions are all captioned
"regime". Name them on screen: *trend regime*, *intraday state*, *volatility regime*. Cheap; do it
during the build.

### G · Excursion / MAE — no judgement call, but bigger than it looks

`pylego/barrier_race.py` is tested and carries the house doctrine (measure from the real M1 path).
At least six JS implementations exist (`backtestExitStudy`, `giveback`, `forecastAnalyser`,
`crossPairResearch`, `backtest-worker`, `bandCalcAB`, …). **Keep `barrier_race`** — but this is the
one family where consolidation is a project, not an afternoon, and
`PER_PAIR_VIEW_PROPOSAL.md` §3 already describes the persisted MAE/MFE store it needs.
**Do not block the per-pair view on it.**

## 9.3 What I would do, in order

| | Do | Why now |
|---|---|---|
| 1 | **A** — pip fix + the failing same-constant test | Arithmetic, provable, an afternoon, and everything else is denominated in it |
| 2 | **D** — delete the browser entry writer (after A) | Removes a whole class of race; tiny |
| 3 | **C** — one sizing spec | Small, and it retires the conviction bug |
| 4 | **B** — σ, folded into the `index.html` decom | Same work, done once |
| 5 | **E** — level engines, Option 2 | The real project; needs your decision first |
| 6 | **F** — regime labels | During the build, not before |
| 7 | **G** — MAE store | Its own project; explicitly *not* a blocker |

Steps 1–3 are days, not weeks, and they are what make the consolidated view trustworthy.
Steps 5 and 7 are real projects and should not hold up the tab work.

## 9.4 The two questions only you can answer

1. **Level engines: Option 1 or Option 2?** One engine, or a declared traded/research split.
2. **Is there a reason `index.html` needs its own σ that I have not found?** If `js/vol.js`'s
   independence is deliberate — a faster, deliberately different read — that turns B from "retire"
   into "label them as two different forecasts". I found no evidence it is deliberate, but you
   built it.
