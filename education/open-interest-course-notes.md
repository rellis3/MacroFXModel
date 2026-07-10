# Open Interest Course — Study Notes

> **Source:** Colez Trades, "Open Interest" course, Lessons 01–06.
> **Purpose of this file:** my own study notebook — learn the material, keep the
> formulas and mental models at hand, list the questions I'd be examined on,
> and record research/implementation ideas for this codebase. Written for
> future-me: re-read before building anything OI-related.
>
> **House rule applies (CLAUDE.md):** notes on a *method* are not evidence of
> *edge*. §9 below is the honest-prior assessment; read it before getting
> excited about any of this.

---

## 0. One-paragraph summary of the whole course

Open interest (OI) is the count of outstanding derivative contracts — a
measure of *commitment*, not activity (that's volume). The CME publishes
per-strike, per-expiry options OI for free (the QuikStrike heatmap). Strikes
are in **futures** terms, so to use them on a spot/CFD chart you subtract the
**basis** (futures − spot). Concentrated call OI ("call wall") tends to act as
resistance, concentrated put OI ("put wall") as support, and near expiry price
tends to drift toward **max pain**. The claimed mechanism is **dealer delta
hedging**: market makers short options must trade the underlying to stay
delta-neutral, and the sign of their **gamma** exposure determines whether
that hedging dampens moves (dealers long gamma) or amplifies them (dealers
short gamma → squeezes when walls break). The course ends with four trading
frameworks: range trade wall-to-wall, fade toward max pain near expiry, ride
wall-break momentum, and use OI as a confirmation filter on technical setups.

---

## 1. Lesson 01 — Foundations of Open Interest

### Core definitions

- **Open Interest** = total outstanding contracts not yet closed, exercised,
  or expired. Cumulative; does not reset daily.
- **Volume** = contracts traded today. Resets daily.
- Volume measures **activity**; OI measures **commitment/positioning**.

### The four trade scenarios (mechanics)

| Buyer | Seller | OI change |
|---|---|---|
| Opens new long | Opens new short | **+1** (contract created) |
| Closes long | Closes short | **−1** (contract destroyed) |
| Opens new long | Existing long selling out | 0 (transfer) |
| Existing short buying back | Opens new short | 0 (transfer) |

Key inference: **rising OI = new money entering; falling OI = liquidation.**
Volume alone can't distinguish these.

### OI + price interpretation grid (memorise)

| Price | OI | Reading |
|---|---|---|
| ↑ | ↑ | New longs — healthy trend |
| ↑ | ↓ | Short covering — weak rally, may exhaust |
| ↓ | ↑ | New shorts — healthy downtrend |
| ↓ | ↓ | Long liquidation — may be near washout |

(The course gives the first two; the bottom two are the symmetric completions
— check my inference against a second source.)

### Context

- Derivatives ≈ **$700T notional** vs ~$100T global equities, ~$130T bonds.
  Institutional hedging/leverage/market-making lives here.
- Retail blind spot: education gap, complexity barrier, platforms only show
  price, CFD/spot traders don't realise futures/options data applies to them.
- Claimed uses of OI: S/R levels (put OI → support, call OI → resistance),
  price magnets near expiry, trend confirmation, gamma acceleration zones.

---

## 2. Lesson 02 — Reading the CME

### Access

- Tool: **CME Options Open Interest Heatmap** (QuikStrike) —
  `cmegroup.com/tools-information/quikstrike/options-open-interest-heatmap.html`
- Free, no account. Navigation: **Asset Class → Product Family → Product**
  (e.g. Foreign Exchange → FX Majors → EUR/USD (6E)).

### Reading the grid

- Strikes vertical (left column); expirations horizontal; each expiry has
  **C** (call OI) and **P** (put OI) sub-columns.
- Cell value = OI at that strike/expiry. Colour intensity = concentration.
- **DTE** in column headers = days to expiration — gamma effects intensify as
  DTE → 0.
- Data updates **once daily**, reflecting the **previous day's close**. Not
  real-time; fine for structural levels, blind to intraday repositioning.

### Contract codes (memorise the format)

`Product + Month + Year` — e.g. **6EU5** = EUR/USD (6E), September (U), 2025 (5).

Month codes: F Jan, G Feb, H Mar, J Apr, K May, M Jun, N Jul, Q Aug,
**U Sep, V Oct, X Nov, Z Dec**. (Mnemonic: the awkward letters — no A/B
because they clash with other codes.)

Weeklies look like `WE1Q5` (week 1, Aug 2025). Monthlies usually have more
liquidity/OI — start there.

### Products I care about

| Market | Code | Note |
|---|---|---|
| EUR/USD | 6E | most liquid FX contract |
| GBP/USD | 6B | |
| USD/JPY | 6J | **CME quotes JPY/USD — inverted!** |
| S&P 500 | ES | strikes are futures points, not SPX cash |
| Nasdaq | NQ | |
| Gold | GC | $/oz |
| WTI | CL | $/bbl |

---

## 3. Lesson 03 — Futures → Spot/CFD Conversion

### The problem

CME strikes are **futures prices**. Spot differs by the **basis** (cost of
carry, mainly the interest-rate differential; shrinks toward 0 at expiry —
convergence). Plotting a raw strike on a spot chart puts the line in the
wrong place.

### The formula (the whole lesson in three lines)

```
Basis      = Futures price − Spot price        (sampled at the same moment)
Spot level = Futures strike − Basis
```

Worked example: 6E futures 1.1520, spot 1.1500 → basis +0.0020.
Strike 1.1600 → spot level **1.1580**.

### JPY special case

CME 6J is **JPY/USD** (e.g. 0.006700). Invert first: `1 / 0.006700 = 149.25`
USD/JPY-equivalent. Then compute basis vs broker USD/JPY and subtract as
usual. Invert every strike of interest, then apply the one basis.

### Other markets

- ES basis typically 5–20 pts vs SPX cash; NQ 10–40; GC $2–10; CL can be
  contango **or** backwardation.
- Retail **index CFDs usually track the futures**, so basis ≈ tiny — verify
  per broker.

### Discipline points

- Sample futures & spot **simultaneously** — basis drifts intraday.
- **Recalculate at least once per session**; stale basis = levels 10–20 pips off.
- Don't convert everything: only the 3–5 strikes that matter (biggest call
  wall, biggest put wall, max pain).

---

## 4. Lesson 04 — The Open Interest Matrix

### The four concepts

- **Call wall** — strike with outlier call OI → resistance.
- **Put wall** — strike with outlier put OI → support.
- **Max pain** — strike where option holders collectively lose the most →
  price magnet **near expiry**.
- **Magnetism** — the pull toward high-OI strikes as expiration approaches.

### The 3× rule of thumb (wall significance)

| Ratio vs surrounding strikes | Strength |
|---|---|
| 1.5× | weak — minor level |
| 2× | moderate — worth watching |
| **3×+** | strong — high-probability level |

Relative outliers matter, not absolute size.

### Max pain calculation

```
For each candidate strike S:
  Call pain = Σ over strikes K: CallOI(K) × max(0, S − K)
  Put pain  = Σ over strikes K: PutOI(K)  × max(0, K − S)
Max pain = S minimising total pain   (i.e. holders' payout is minimised)
```

(The course's inline version is loose — it computes per-strike pain against
"current price". The standard definition is the one above: total option
holder payout as a function of the *settlement* price; max pain = argmin.
Worth verifying against an online calculator when I implement it.)

Quick visual estimate: the strike where call OI ≈ put OI on either side.

Limits: relevant mostly in the **final 2–3 days** (strongest last 48h); it
shifts as OI changes; it's one input, not a target.

### The structure map

Put wall (floor) … max pain (gravity) … call wall (ceiling). Price between
walls → range behaviour likely; below max pain near expiry → upward bias, etc.

### Sentiment overlays

- **P/C OI ratio**: <0.7 very bullish positioning (complacency — contrarian
  top risk); 0.7–1.0 moderately bullish; 1.0–1.3 neutral/hedging; >1.3
  bearish/heavy downside hedging (fear — contrarian bottom risk). Extremes
  can persist in trends — context required.
- **OI skew**: where put OI sits vs call OI across strikes → asymmetry of
  hedging demand.

### Dynamics (changes > levels)

- OI ↑ at a strike → wall strengthening. OI ↓ → weakening.
- Bounce off a wall followed by big OI drop at that strike → positions
  banked; **next test more likely to break**.
- Wall break accompanied by OI collapse → don't expect it to hold on retest.
- Remember the **one-day lag**: I'm always reading yesterday's positioning.

### The daily checklist (Lesson 4 §9 — this is the operational core)

1. Heatmap, front-month (or weekly if ≤5 DTE).
2. Call wall (biggest call OI). 3. Put wall (biggest put OI).
4. Max pain estimate. 5. Compute basis, convert strikes.
6. Plot CW / PW / MP on chart. 7. Note P/C ratio + skew.
8. Diff vs yesterday — strengthening or weakening?

---

## 5. Lesson 05 — Gamma & Dealer Dynamics (the mechanism)

### Greeks needed

- **Delta (Δ)** — option value change per $1 underlying move; ≈ P(expire ITM).
- **Gamma (Γ)** — rate of change of delta. Highest **ATM, near expiry**.
  Gamma tells dealers how much re-hedging a move will force → market impact.

### Dealer hedging logic

Market makers run delta-neutral books. Sold a call → hedge by buying
underlying as price rises (delta grows). Sold a put → hedge by selling as
price falls. The *continuous adjustment* is the market impact.

### Long vs short gamma (the key table)

| Dealer book | Price ↑ | Price ↓ | Effect on market |
|---|---|---|---|
| **Short gamma** (sold options) | must buy | must sell | **amplifies** moves |
| **Long gamma** (bought options) | must sell | must buy | **dampens** moves — mean reversion |

Usually dealers are **net short gamma** (public net-buys options). The
**gamma flip** is the price where aggregate dealer gamma changes sign —
stability regime below/above changes character.

### Why walls work (the counterintuitive bit — exam favourite)

A call wall is *not* dealers actively selling at the level. Approaching the
wall, dealer hedge-buying **fuels** the rally; at/through the strike delta → 1,
hedging completes, **the buying stops** — the move runs out of fuel and
stalls. Resistance = fuel exhaustion, not a barrier. Mirror image for put
walls (selling exhausts → support). Hence moves *into* walls are often sharp,
then die suddenly.

### Wall breaks → gamma squeeze

Decisive break: options flip ITM, deltas jump, dealers are suddenly
under-hedged and must chase in the direction of the move → acceleration.
Same positioning that capped price becomes its fuel. **Bigger wall → bigger
squeeze.**

### Time decay of the effect

Gamma for ATM options explodes as DTE → 0:
- 2+ weeks out: muted effects.
- ~1 week: walls start exerting force.
- **Final 48h: peak gamma, max-pain magnetism strongest.**

### The feedback loop (mental model to retain)

`price move → delta change → dealer hedging → price move …`
**OI tells you *where* the loop engages; gamma (via DTE/moneyness) tells you
*how hard*.**

---

## 6. Lesson 06 — Trading Frameworks

### Framework 1 — Wall-to-wall range trading

- **When:** clear 3×+ walls, price mid-range, no catalyst, **5+ DTE**.
- Long near put wall / short near call wall on momentum exhaustion; stop
  10–20 pips *beyond* the wall; targets = max pain, then opposite wall.
- Invalidate on a decisive close beyond a wall → switch to Framework 3.
- Example given: risk 30 pips vs reward 90–170 (PW 1.1350 / MP 1.1450 / CW 1.1550).

### Framework 2 — Max pain reversion

- **When:** ≤48h to expiry, price extended ≥50 pips (FX) from max pain, no
  scheduled catalyst.
- Fade back toward max pain; stop beyond nearest wall; **same-day/overnight
  hold only** — the effect is time-specific; cut fast if wrong.

### Framework 3 — Wall-break momentum

- **When:** convincing break of a major wall — 20+ pips beyond, active
  session, no instant reversal, ideally a fundamental catalyst.
- Enter in break direction; stop back inside the broken wall; target next
  major OI level. Bigger wall broken → bigger squeeze.

### Framework 4 — OI confirmation (filter, not signal)

- Technical support + put wall → high conviction. Breakout into a call wall
  directly above → skip. Trend toward max pain → aligned; away → caution.
- **OI is a probability enhancer layered on an existing setup.**

### Framework 5 — the daily prep ritual (10–15 min)

Heatmap → identify CW/PW/MP → compute basis → convert → plot & label
(CW/PW/MP) → note DTE, P/C ratio, OI changes → locate price in the structure.

### Position management with OI

- Targets: partial at max pain, rest toward opposite wall (3-tier scale-out:
  ⅓ MP, ⅓ halfway, ⅓ wall/trail).
- Stops *beyond walls* = structural protection vs arbitrary lines.
- Size by alignment: OI + technicals agree → full size; conflict → small/skip.
- If OI structure shifts mid-trade (wall appears/shrinks), reassess.

### Pitfalls list (all six, verbatim-ish)

1. Treating OI as certainty (it's probability — always stop).
2. Ignoring DTE (a wall at 2 DTE ≠ 20 DTE).
3. Stale data / stale basis.
4. Over-complicating — track 2–3 levels, not every strike.
5. Fighting fundamentals — walls don't stop central banks.
6. Confirmation bias — read the whole structure, not the levels that agree
   with my position.

### The hierarchy

Fundamentals → direction. Technicals → timing. **OI → the structural map of
where price stalls, accelerates, reverses.**

---

## 7. Exam prep — self-test questions

Answer from memory, check against the lessons above.

1. Two parties trade 1 contract; volume prints 1. Give the three possible OI
   outcomes and what each implies about positioning.
2. Price rallies 100 pips while OI falls 15k. Healthy? Why not?
3. Decode `6BZ5`. What about `WE3U5`?
4. Futures 1.0842, spot 1.0825. Convert strike 1.0900. Now do USD/JPY: 6J at
   0.006250, broker USD/JPY 159.60, strike 0.006211.
5. Why can't I set a static basis and forget it? Two reasons.
6. Define max pain precisely and state when it is/isn't predictive.
7. State the 3× rule and why *relative* OI beats absolute OI.
8. Explain why a call wall is resistance **without** saying "dealers sell
   there". (Fuel-exhaustion argument.)
9. Dealers short gamma vs long gamma: what does each do to realised
   volatility, and which state is typical?
10. What is the gamma flip and why does market character change across it?
11. Describe the gamma squeeze mechanics after a put-wall break.
12. Why do OI effects intensify into expiry? Which options carry the gamma?
13. For each framework (1–4): the precondition that must hold, stop logic,
    and the invalidation that flips you to a different framework.
14. What does a P/C OI ratio of 1.5 suggest, and when is it contrarian?
15. Yesterday the put wall bounced price; today its OI is −27%. What's my
    expectation on the next test, and why?

---

## 8. Ideas & areas of interest (future research queue)

Ranked roughly by how testable they are with data I can actually get.

1. **Do converted CME FX walls predict anything OOS?** The falsifiable core
   claim. Test: daily snapshot of top call/put wall (front month, converted),
   measure (a) P(touch) vs distance, (b) reversal vs continuation after
   touch, vs matched random strikes / round numbers as the null. This is the
   *first* thing to test — everything else assumes it.
2. **Max-pain drift:** within 48h of monthly expiry, is (settlement −
   max_pain) tighter than (settlement − prior_close)? Simple, clean,
   pre-registerable.
3. **OI-change signal:** wall weakening (large OI drop after a defence) →
   higher break probability on retest? Needs daily OI history archive —
   start capturing snapshots NOW (CME shows only current; history must be
   self-collected).
4. **Gamma flip estimation for FX:** SPX GEX is well-trodden; FX gamma
   profiles much less so. Can a crude GEX proxy (OI × BS gamma per strike,
   dealer-short assumption) be built from the heatmap + DTE? Does realised
   vol differ across the flip level?
5. **P/C ratio extremes as a regime input** — feed as a feature into the
   existing `dayTypeScore` fade/follow selector rather than a standalone signal.
6. **Basis behaviour itself** — how stable is the 6E basis intraday? Sets
   the error bar on every converted level (if basis wobbles ±5 pips, levels
   are ±5 pips fuzzy — walls are zones, not lines).
7. **Interaction with existing level sources:** does a wall that *coincides*
   with a `levelSources.js` level (pivot, VAH/VAL, round number) outperform
   either alone? Natural confluence-scorer experiment.
8. **Reading list:** SqueezeMetrics GEX white paper; SpotGamma methodology
   notes; academic literature on option-expiration pinning (Ni, Pearson &
   Poteshman 2005, "Stock price clustering on option expiration dates" —
   the real empirical anchor for max pain) and on delta-hedging impact
   (Barbon & Buraschi on gamma imbalance). Check what exists for *FX*
   specifically — most evidence is equities.

**Open questions I couldn't answer from the course:**
- How much of CME FX options OI is dealer-short (the whole gamma story
  assumes "public long / dealers short" — replicated for equities, asserted
  here for FX)?
- FX options liquidity is mostly **OTC**, not CME — is CME OI the tail or
  the dog? (BIS OTC FX options notional dwarfs listed.) This could badly
  weaken the walls story for FX vs indices.
- Does the once-daily snapshot make the signal too stale for anything but
  weekly structure?

---

## 9. Honest-prior assessment (per the working agreement — read before building)

- **Classification: mostly folklore, with one replicated cousin.**
  Option-expiration *pinning* on single stocks is documented in the academic
  literature (Ni–Pearson–Poteshman), and equity-index dealer-gamma effects
  (GEX) have credible practitioner + some academic support. But **the FX
  version of the walls/max-pain story is an extrapolation** — most FX options
  volume is OTC (not visible in CME OI), and I found no replicated evidence
  cited in the course. The mechanism is plausible; the edge is unproven.
- **Blunt odds** that converted CME OI levels become a *standalone*
  after-cost FX edge: **~5–10%**. Odds they add *incremental* value as a
  confluence/filter feature on an existing engine: somewhat better, maybe
  15–20%, because a filter only has to shade probabilities.
- **Default expected outcome: null.** If daily-snapshot, publicly-free data
  reliably marked S/R in the most liquid market on earth, it would be
  arbitraged. The cheap win is finding out honestly (research idea #1/#2 are
  low-effort tests).
- What the course *is* good for regardless: the **mechanics are real and
  worth knowing** (OI vs volume, contract codes, basis conversion, dealer
  hedging logic). That's infrastructure knowledge, not edge. "Built" ≠
  "works" ≠ "has edge" — this file documents *understanding*, nothing more
  yet.

---

## 10. Real-time implementation sketch (this codebase)

If/when a test from §8 justifies building — **the natural fit is a Tier-2
level-source brick**, not a new engine:

- **`cme_oi` level source** in `js/levelSources.js` — emits
  `Level[]` (`{ price, kind: 'call_wall'|'put_wall'|'max_pain', weight }`)
  via the existing `levels(ctx) → Level[]` contract. Then the confluence
  scorer, `levelChart.js` viewer, and any strategy get OI levels for free —
  exactly the Lego principle (one list feeds scorer + viewer + strategy).
- **Basis conversion** = tiny pure helper (futures px + spot px + strike →
  spot level, with the JPY inversion case). Unit-testable on synthetic
  numbers; belongs next to `instrumentRegistry` conventions. Candidate row
  for `LEGO_MODULES.md §2` if built.
- **Data capture first, strategy later:** a small daily job snapshotting the
  heatmap per product (strike, expiry, callOI, putOI) into R2 — because
  research ideas #1–#3 all need *history* that CME doesn't serve. No history,
  no OOS test, no build. (KV/R2 persistence note: this is derived public
  data, cheap to re-fetch — R2, not CF KV.)
- **Validation path when the time comes:** same harness discipline as
  everything else — realistic fills, costs on, true IS/OOS split via
  `summarizeSplit`, ≥30 OOS trades, A/B vs incumbent (e.g. does adding
  `cme_oi` to the confluence set beat the confluence set without it, OOS?).
- **Not before the data test.** Per §5 of the owner contract, the honest
  next move is the cheap falsification (§8 items 1–2), not wiring a new
  level source on faith.

---

*Notes end. Next revision: after actually pulling the 6E heatmap and doing
one full manual conversion cycle (Lesson 6 ritual) — annotate what was
unclear in practice.*
