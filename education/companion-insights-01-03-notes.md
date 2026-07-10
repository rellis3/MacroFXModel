# Companion Insights 01–03 — Study Notes

> **Course:** Colez Trades — Quantitative & Macro Finance Insights (Companion lessons)
> **Lessons covered:** Insight 01 (Why Retail Traders Lose & Why Institutions Win),
> Insight 02 (The Flaws of Technical Analysis),
> Insight 03 (Why Public Strategies Don't Deliver Excess Return).
> **Purpose of this file:** my own learning notes — summaries, key points to memorise,
> exam-style self-test questions, research ideas, areas of interest, and how each
> concept maps onto this repo (MacroFXModel) for real-time implementation.
> **Note-taking discipline:** as in the other note files, claims are tagged
> **[replicated]** (documented in academic/practitioner literature),
> **[plausible mechanism]** (sound logic, needs my own validation), or
> **[folklore/anecdote]** (heuristic or marketing claim — treat as hypothesis only).
> A lesson slide is not evidence (`CLAUDE.md` §"How we talk about results").

> **Where these sit in the course.** These three "companion" insights are the
> *philosophy layer* — they argue for the framework shift, they don't yet teach a
> testable technique. The main lesson notes (`QUANT_MACRO_LESSONS_1-6.md`,
> `macro-deep-dives-notes.md`) carry the actual machinery. So the study goal here
> is: internalise the *reasoning*, extract the few falsifiable claims, and notice
> where the lessons are selling rather than teaching — that noticing is itself the
> skill being trained.

---

## 0. One-paragraph synthesis of all three insights

Retail loses not because of talent but because of **framework**: it trades the
surface layer (price patterns) of a system whose real inputs are policy, data
surprises, capital flows, liquidity and positioning. Technical analysis is
backward-looking, has no causal mechanism, and any public signal decays as it is
adopted — so public strategies are *structurally* incapable of durable excess
return, independent of how good the backtest looks. Institutional alpha comes
from proprietary, capacity-constrained sources (risk-transfer premia, liquidity
provision, execution asymmetry, information differentials, regulatory/flow
mechanics), all quantitatively validated before capital is at risk. The
prescribed shift: macro & data drive the thesis → quantitative validation gates
it → technicals only time the execution.

**My compression for the exam:** *"Layers, not patterns; mechanisms, not shapes;
private and capacity-aware, not public; validate, then execute."*

---

## Insight 01 — Why Retail Traders Lose & Why Institutions Win

### 1.1 The five true drivers (memorise the list)

| # | Driver | What it does | My tag |
|---|---|---|---|
| 1 | **Monetary policy & central banks** | Rates, guidance, balance sheets set global liquidity; policy shifts reprice whole asset classes | **[replicated]** — the most documented driver of sustained direction |
| 2 | **Economic data releases** | Data shapes CB policy and institutional flows; the calendar is known in advance | **[replicated]** — announcement effects (NFP/CPI/FOMC) are heavily documented |
| 3 | **Capital flows & positioning** | Rebalancing/hedging/rotation by funds moves billions; positioning data shows where weight of capital sits | **[plausible mechanism]** — flow effects real; *retail-accessible* positioning data (CoT) is lagged and mixed as a signal |
| 4 | **Geopolitics & risk sentiment** | Repricing of risk before/around events | **[plausible mechanism]** — real but hard to systematise; mostly a regime/filter input |
| 5 | **Liquidity & microstructure** | Price moves where liquidity is thin; large orders create dislocations | **[replicated]** as a fact of microstructure; **[folklore]** when sold as a retail-tradeable edge without order-book data |

**Mnemonic:** *Policy, Prints, Positioning, Politics, Plumbing* — "the 5 Ps".

### 1.2 Prepared vs reactive (the process claim)

- Institutions pre-map scenarios: data print → known response per outcome
  (miss/beat → rates → USD → cross-asset). Retail reacts after the move.
- The lesson's three examples: employment data (scenario trees), CB meetings
  (pre-built response per outcome), **options expiry / gamma pinning**.
- **[replicated]** on gamma: dealer gamma positioning mechanically dampens or
  amplifies moves (long gamma pins, short gamma accelerates) — this is
  documented in the options-market-maker literature and in the
  `open-interest-course-notes.md` material. It's the most *concrete, testable*
  claim in this lesson.
- **Key sentence to keep:** "Retail guesses what is coming; institutions prepare
  for what they know is coming. The difference is process, not talent."

### 1.3 The framework gap, in one contrast

- Retail: "RSI oversold → maybe bounce" — a guess from a lagging number, no
  causal model.
- Institutional: "CPI above expectations → yields ↑ → USD ↑ → reallocate X→Y" —
  a causal chain with a mechanism at each link.
- **Nuance the lesson gets right:** the fix is *not* abandoning technicals; it's
  demoting them to execution tools inside a macro/data thesis.

### 1.4 Honest critique (my [ANALYSIS] layer)

- The layer model is right, but **knowing the drivers is not the same as having
  edge in them**. CPI→yields→USD is a causal chain, yet it's also the most
  crowded, fastest-arbitraged chain in finance — priced in milliseconds. The
  realistic retail version is *not* trading the print, but positioning at
  slower horizons where speed doesn't decide the outcome (this repo's
  lessons 1–6 notes reach the same conclusion: weeks-to-months, systematic).
- The lesson quietly conflates "institutions win" with "the framework wins".
  Institutions also win via costs, funding, and infrastructure (Insight 03
  admits this). Framework is necessary, not sufficient.
- Missing from the lesson (deliberately, I suspect): **the replicated retail
  edge is risk management, not anticipation** — diversification, vol-sizing,
  cutting losers (`CLAUDE.md` §"Working with the owner", point 4). Anticipating
  CPI is the glamorous path; sizing correctly is the paid one.

---

## Insight 02 — The Flaws of Technical Analysis

### 2.1 The four-layer market model (the most useful diagram in the course)

| Layer | Name | Contents | Observable by retail? |
|---|---|---|---|
| 1 (top) | **Surface** | price, candles, S/R, RSI/MACD — the *output* | fully |
| 2 | **Mechanism** | order flow, liquidity gaps, MM positioning, gamma | partially (options OI, futures depth) |
| 3 | **Driver** | policy, data surprises, inflation expectations, cross-asset correlation | largely yes (public data, with lag) |
| 4 (deep) | **System** | collateral chains, rehypothecation, synthetic leverage, CB balance sheets | only coarsely (H.4.1, RRP, TGA, BIS) |

**Memorise:** *Surface ← Mechanism ← Driver ← System.* Price is the last domino.
Treating layer 1 as the complete picture is "the fundamental error".

- **[plausible mechanism]** as a taxonomy — it's a good mental model, consistent
  with the cascade model in `QUANT_MACRO_LESSONS_1-6.md` §0.
- **Caution:** the lesson implies each deeper layer is more tradeable. In
  practice each deeper layer is more *explanatory* but harder to get timely
  data on. Layer-4 "plumbing" signals (net liquidity etc.) are slow, disputed,
  and heavily narrated on FinTwit — deep ≠ clean.

### 2.2 The four flaws of public TA (memorise — likely exam list)

1. **Backward-looking by design** — indicators are transforms of past price;
   no predictive alpha in the transform itself. **[replicated]** — decades of
   academic tests of TA rules show at best marginal, cost-fragile effects;
   the big exception is *time-series momentum*, which survives (and is exactly
   the "replicated" list in `CLAUDE.md`).
2. **No causal basis** — a pattern has no mechanism, so no reason to persist.
   **[plausible mechanism]** as an argument; note the counter: momentum *does*
   have proposed mechanisms (underreaction, flows), which is *why* it
   replicates. Mechanism-backed "technicals" graduate out of folklore.
3. **Signal decay** — public signal → mass adoption → arbitraged away.
   **[replicated]** — McLean & Pontiff (2016) style post-publication decay is
   real and measured (returns roughly halve after publication).
4. **Curve-fitted results** — optimised in-sample, no OOS validation.
   **[replicated]** as a failure mode — this is the entire reason this repo's
   harness exists (`SYSTEM_ASSESSMENT.md`, `TRADABILITY_REVIEW.md`).

**The one-line core:** *"The edge is never in the pattern — it is in the
mechanism that produced it."* That's the sentence to retain from all of
Insight 02.

### 2.3 The retail cycle (behavioural trap)

Adopt strategy → early luck → drawdown when regime shifts → replace & repeat.
Years can pass. The bug is not the strategy; it's the **absence of a framework
that explains why it worked and when it should stop working**. A strategy
without a regime model can't be diagnosed, only abandoned.

- Direct repo connection: this is *why* `dayTypeCore.js` exists — a regime
  classifier (fade vs follow) is precisely the "framework that explains when it
  should stop working" bolted onto a single entry primitive.

### 2.4 Where technicals DO belong (the correct split)

> **Fundamentals and data drive the thesis. Technicals confirm the execution.**

Pipeline: **Macro & data first → quantitative validation → technical execution
(timing/entry only).** Balance the three; never let any single input stand alone.

- This is the practitioner consensus and matches how this repo is being built:
  the vol/regime/day-type layer decides *whether and which way*, level sources
  and entry grading decide *where and when*.

### 2.5 Honest critique

- The pattern-vs-systems comparison table is rhetorically loaded (all ✗ vs all
  ✓). Real desks are messier; plenty of systematic CTAs run on price-only
  inputs (trend) profitably. The honest statement: *price-only works when the
  signal is a replicated risk premium, not a chart shape.*
- "Quantitatively validated before execution" is asserted throughout but never
  operationalised in the lesson. This repo's operationalisation — costs on,
  true IS/OOS split, ≥30 OOS trades, beat the incumbent OOS — is stricter than
  anything the lesson specifies. Keep ours.

---

## Insight 03 — Why Public Strategies Don't Deliver

### 3.1 The decay pipeline (5 stages — memorise)

**Edge exists → published → adoption spreads → market adapts (signal priced
earlier and earlier) → edge eliminated (negative EV after costs).**

- **[replicated]** — post-publication alpha decay is empirically measured;
  "alpha is capacity-dependent" is standard allocator doctrine.
- Sharp formulation worth keeping: *"Exclusivity preserves performance; public
  diffusion destroys it."* And the allocator corollary: due diligence asks
  whether a process is **proprietary, capacity-aware, forward-looking** — not
  just what its past returns were.

### 3.2 Why most public strategies never had edge (4 mechanisms)

1. **Curve fitting** — optimised to history; meaningless without OOS/walk-forward.
2. **Selective presentation** — winners shown, losers omitted; plus
   survivorship bias in which strategies get marketed at all.
3. **No economic basis** — no macro/flow/structural rationale ⇒ pattern-matched
   noise with no reason to persist.
4. **Hindsight construction** — built retrospectively to *look* accurate, then
   packaged. Accuracy evaporates live because it was never there.

**The Hindsight Trap, one line:** *attractive equity curves are marketing
material, not evidence.*

- All four are **[replicated]** failure modes (standard quant-research hygiene
  literature: Bailey/López de Prado on backtest overfitting, deflated Sharpe).

### 3.3 The five institutional alpha sources (memorise the list + why retail can't copy)

| Source | Mechanism | Why not copyable |
|---|---|---|
| **Risk-transfer premia** | paid to absorb risk others shed (insurance-like) | *actually the most retail-accessible of the five* — vol premium, carry, trend are the replicated premia; but capacity/costs still bind |
| **Liquidity provision** | earn the urgency-vs-patience spread | needs microstructure infra + real-time flow data |
| **Execution asymmetry** | lower costs, latency, prime brokerage | negative-EV-for-retail can be positive-EV-for-institutions — cost structure IS the edge |
| **Information differentials** | proprietary/alternative data | data retail cannot buy |
| **Regulatory arbitrage** | forced selling, index rebalancing, holding constraints | requires knowing the regulatory landscape; flows are structural and repeatable |

Common thread: **proprietary, capacity-constrained, quantitatively validated.**

- **My note:** the lesson under-sells that risk-transfer premia (carry, trend,
  vol premium) are *publicly documented yet persist* — because they are
  compensation for risk, not informational secrets. That is precisely why
  `CLAUDE.md` lists them as the only "chase edge here" category for us. Public
  ≠ dead when the return is a risk premium rather than an inefficiency.
  **This is the single most important correction to the lesson.**

### 3.4 Position in the information chain

By the time a strategy is a YouTube video, everyone with edge has positioned,
profited and left. Following it = trading at the back of the chain on recycled,
exhausted information. Front-of-chain behaviour: identify drivers before
pricing, build proprietary frameworks, validate quantitatively, **monitor edge
decay and adjust capacity** — that last item is a genuinely institutional habit
worth adopting (we don't currently monitor our own strategies for decay).

### 3.5 Honest critique

- Structural argument is sound, but note the tension: the course *itself* is
  public material. By its own logic, anything actionable in it is either (a) a
  risk premium that survives publicity, or (b) already decayed. The durable
  value is therefore the **process discipline** (validation, capacity,
  decay-monitoring), not any specific setup it might later teach. Read the rest
  of the course through that filter.
- "Institutions win" framing skips that most active funds also underperform
  after fees. The defensible claim is narrower: institutions *that win* win via
  these five sources; the average institution is also near-zero alpha.

---

## Self-test questions (exam prep)

1. Name the five true market drivers from Insight 01 and give one measurable
   series for each. *(Policy — fed funds/OIS; Data — CPI/NFP surprise vs
   consensus; Positioning — CoT/dealer gamma; Geopolitics — risk proxies like
   VIX/gold; Liquidity — depth, spreads, net-liquidity aggregates.)*
2. Reproduce the four-layer model of Insight 02 from memory and state which
   layer retail trades and which layer explains it. *(Surface/Mechanism/
   Driver/System; retail trades Surface; each deeper layer explains the one
   above.)*
3. State the four flaws of public TA and match each to its quant-hygiene
   antidote. *(Backward-looking → demand a forward mechanism; no causal basis →
   require economic rationale; signal decay → check publication/crowding;
   curve fitting → OOS + walk-forward + deflated metrics.)*
4. Recite the five-stage public-edge decay pipeline and the one-sentence
   capacity axiom. *(Exists→published→adopted→adapted→eliminated; "alpha is
   capacity-dependent — exclusivity preserves performance.")*
5. List the five institutional alpha sources and identify the ONE that is
   partially retail-accessible, and why. *(Risk-transfer premia — they are
   compensation for bearing risk, so they persist despite being public.)*
6. Why can a strategy be negative EV for retail and positive EV for an
   institution with identical signals? *(Execution asymmetry — cost structure,
   latency, financing. Costs are part of the strategy.)*
7. Trace the institutional causal chain for "CPI prints above expectations" and
   explain why trading it at T+0 is still not a retail edge. *(CPI↑→yields↑→
   USD↑→cross-asset reallocation; priced within milliseconds — the horizon, not
   the chain, is where retail can play.)*
8. What is the Hindsight Trap in one sentence? *(Models built retrospectively to
   appear accurate are marketing material; live accuracy was never present.)*
9. Per the "correct split", what role do technicals retain? *(Execution/timing
   confirmation only, after macro thesis + quantitative validation set
   direction and risk.)*
10. Which claim in these lessons does our own `CLAUDE.md` correct, and how?
    *(That public = dead: replicated risk premia — trend, carry, vol premium —
    persist despite publicity because they pay for risk, not information.)*

---

## Future research ideas (ranked by honest prior)

Blunt priors per the house contract — most of these default to null; finding
that cheaply is a win.

1. **Edge-decay monitor for our own strategies.** *(Infrastructure, not edge —
   prior it's useful: high.)* Rolling OOS Sharpe with a decay test
   (e.g. regression of trade PnL on trade date; alarm on significant negative
   slope) bolted onto `summarizeSplit`. Directly implements Insight 03's
   "monitor edge decay" — the one institutional habit we can copy for free.
2. **Data-surprise → FX response study.** *(Prior of tradeable after-cost edge
   at T+0: ~5% — speed-arbitraged; at multi-day horizon: ~15–25% as a
   filter/tilt, not standalone.)* CPI/NFP surprise (actual − consensus, needs a
   consensus-history source) vs subsequent 1–5-day USD-pair drift. Pre-register:
   "worked" = OOS-consistent sign with ≥30 events per cell; "didn't" = pooled
   null after disaggregation by regime.
3. **Event-calendar volatility overlay.** *(Prior: moderate — vol around
   scheduled events is the best-documented calendar effect.)* Feed the known
   macro calendar into the vol forecaster: do our σ bands systematically
   under/over-cover on CPI/FOMC/NFP days? If yes, an event-day σ multiplier is
   a principled selector (Lego rule 4), not a new knob.
4. **Dealer-gamma pin/accelerate test on FX or indices.** *(Prior: ~10–15% as a
   filter.)* Insight 01's most concrete claim. Needs options OI data (links to
   `open-interest-course-notes.md`). Test: range compression near large-OI
   strikes into expiry vs normal days.
5. **Positioning extremes as a fade/confirm filter.** *(Prior: ~10% — CoT is
   lagged and the literature is mixed.)* CoT percentile via `rollingPercentile`
   (`statsCore`) as a gate on existing strategies, never a standalone signal.
6. **"Back-of-chain" crowding proxy.** *(Prior: low, exploratory.)* Can we
   proxy retail crowding (e.g. broker sentiment feeds) and test whether crowded
   setups underperform? Mostly interesting as falsification practice.

**Explicitly NOT pursuing** (lesson-inspired but fails our data-honesty rule):
layer-4 plumbing signals (collateral chains, rehypothecation) — no honest
retail-grade dataset exists; a lookalike test would be fake productivity.

---

## Areas of interest (to read deeper, no build commitment)

- **Post-publication alpha decay** — McLean & Pontiff's measurement of how
  anomaly returns shrink after academic publication; the empirical anchor for
  Insight 03.
- **Backtest overfitting / deflated Sharpe** (Bailey & López de Prado) — the
  formal version of the curve-fitting flaw; possibly a future `metricsCore`
  addition (deflated Sharpe next to raw Sharpe on the OOS card).
- **Announcement-effect literature** — pre-FOMC drift, macro-announcement risk
  premia; the replicated core behind "trade the calendar".
- **Market-maker gamma mechanics** — continues the open-interest course thread;
  the mechanism layer made concrete.
- **Why risk premia survive publicity** — the theory distinction between
  *inefficiency* (decays when public) and *risk compensation* (persists);
  this distinction organises everything in Insight 03.

---

## Real-time implementation map (lesson → this repo)

| Lesson concept | Where it already lives here | Gap / next step |
|---|---|---|
| Quantitative validation before capital | honest harness: costs on, IS/OOS split, ≥30 OOS trades (`honestForecastEngine`, `metricsCore`) | none — ours is stricter than the lesson's; keep it |
| "Framework that explains when a strategy stops working" | regime/day-type layer (`dayTypeCore.js`, `classifyRegime`) | extend regime tagging to per-trade attribution so drawdowns are diagnosable by regime |
| Technicals as execution only | level sources + entry grading (`levelSources.js`, `entryGradeCore.js`) sit under vol/regime direction | keep the hierarchy explicit: no level-source signal should ever set direction alone |
| Monitor edge decay (Insight 03) | **missing** | research idea #1 — rolling-OOS decay check in the reporting layer |
| Event calendar awareness (Insight 01) | **missing** — no macro-calendar input anywhere | research idea #3 — event-day σ behaviour audit first (cheap, uses existing data) |
| Positioning data (Insight 01 driver 3) | **missing** | CoT ingest is cheap; treat as filter research only (idea #5) |
| Gamma/OI mechanics | notes only (`open-interest-course-notes.md`) | blocked on an options-OI data source; defer honestly |
| Risk > entry (the real retail edge) | vol-based sizing exists in the vol-bot layer | the durable to-do: diversification breadth + sizing discipline beats any new entry idea |

**Standing conclusion for future-me:** these three insights justify the
*architecture we already have* (validation harness, regime selector, technicals
demoted to execution) more than they suggest new strategies. The two genuinely
new, cheap, honest actions they motivate are (1) an edge-decay monitor on our
own OOS results and (2) an event-calendar audit of the σ bands. Everything else
is reading, not building — and per house rule 5, proving one existing thing
forward still outranks both.
